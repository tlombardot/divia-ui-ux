import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { ALL_DIJON_STOPS, DIJON_LINES } from './data/dijonNetwork';
import { reportService } from './services/reportService';
import { calculateRoutes } from './services/routingService';
import {
  createReportSchema,
  routeQuerySchema,
  voteReportSchema,
} from './types';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || '*';

export const app = express();
export const server = http.createServer(app);

// -----------------------------------------------------------------------------
// Security Middleware (OWASP Top 10)
// -----------------------------------------------------------------------------

// 1. Helmet HTTP headers protection
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. CORS configuration
const allowedOrigins =
  CORS_ORIGIN === '*'
    ? '*'
    : CORS_ORIGIN.split(',').map(origin => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '50kb' })); // Mitigate body overflow attacks

// 3. Rate Limiting Protection (Anti-Spam / Anti-DoS)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer ultérieurement.' },
});

const reportRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 15, // Limit report creation/votes to 15 per 5 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de signalements atteinte. Merci de patienter.' },
});

app.use('/api/', generalLimiter);
app.use('/api/reports', reportRateLimiter);

// -----------------------------------------------------------------------------
// HTTP REST Routes
// -----------------------------------------------------------------------------

// Healthcheck for Docker / Render / Railway
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Network information
app.get('/api/network/lines', (_req: Request, res: Response) => {
  res.status(200).json({ lines: DIJON_LINES });
});

app.get('/api/network/stops', (_req: Request, res: Response) => {
  res.status(200).json({ stops: ALL_DIJON_STOPS });
});

// Route calculation
app.get('/api/routes', async (req: Request, res: Response) => {
  const parseResult = routeQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Paramètres de calcul d\'itinéraire invalides',
      details: parseResult.error.format(),
    });
    return;
  }

  try {
    const routes = await calculateRoutes(parseResult.data);
    res.status(200).json({ routes });
  } catch (error) {
    console.error('[Routing Error]:', error);
    res.status(500).json({ error: 'Erreur lors du calcul d\'itinéraire' });
  }
});

// Reports list
app.get('/api/reports', (_req: Request, res: Response) => {
  const activeReports = reportService.getActiveReports();
  res.status(200).json({ reports: activeReports });
});

// Create report via HTTP
app.post('/api/reports', (req: Request, res: Response) => {
  const parseResult = createReportSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Données de signalement invalides',
      details: parseResult.error.format(),
    });
    return;
  }

  const newReport = reportService.createReport(parseResult.data);
  io.emit('report:new', newReport);

  res.status(201).json({ report: newReport });
});

// Vote report via HTTP
app.post('/api/reports/vote', (req: Request, res: Response) => {
  const parseResult = voteReportSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Données de vote invalides',
      details: parseResult.error.format(),
    });
    return;
  }

  const result = reportService.voteReport(parseResult.data);

  if (result.action === 'not_found') {
    res.status(404).json({ error: 'Signalement introuvable ou expiré' });
    return;
  }

  if (result.action === 'dismissed') {
    io.emit('report:removed', { reportId: parseResult.data.reportId });
    res.status(200).json({ message: 'Signalement supprimé suite aux votes', status: 'dismissed' });
    return;
  }

  io.emit('report:updated', result.report);
  res.status(200).json({ report: result.report, status: 'updated' });
});

// -----------------------------------------------------------------------------
// Real-time Gateway (Socket.io)
// -----------------------------------------------------------------------------

export const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
});

// Anti-Spam Socket rate limiting tracker
const socketRateMap = new Map<string, { count: number; resetAt: number }>();

function isSocketRateLimited(socketId: string, maxEventsPerMinute = 20): boolean {
  const now = Date.now();
  const entry = socketRateMap.get(socketId);

  if (!entry || now > entry.resetAt) {
    socketRateMap.set(socketId, { count: 1, resetAt: now + 60000 });
    return false;
  }

  if (entry.count >= maxEventsPerMinute) {
    return true;
  }

  entry.count += 1;
  return false;
}

io.on('connection', (socket: Socket) => {
  // Sync current active reports to newly connected client
  socket.emit('reports:sync', reportService.getActiveReports());

  socket.on('disconnect', () => {
    socketRateMap.delete(socket.id);
  });

  // Handle real-time report creation
  socket.on('report:create', (payload: unknown) => {
    if (isSocketRateLimited(socket.id)) {
      socket.emit('error', { message: 'Limite de requêtes atteinte, veuillez ralentir.' });
      return;
    }

    const parseResult = createReportSchema.safeParse(payload);
    if (!parseResult.success) {
      socket.emit('error', {
        message: 'Payload de signalement invalide',
        details: parseResult.error.format(),
      });
      return;
    }

    const report = reportService.createReport(parseResult.data);
    io.emit('report:new', report);
  });

  // Handle real-time report vote
  socket.on('report:vote', (payload: unknown) => {
    if (isSocketRateLimited(socket.id)) {
      socket.emit('error', { message: 'Limite de requêtes atteinte, veuillez ralentir.' });
      return;
    }

    const parseResult = voteReportSchema.safeParse(payload);
    if (!parseResult.success) {
      socket.emit('error', {
        message: 'Payload de vote invalide',
        details: parseResult.error.format(),
      });
      return;
    }

    const result = reportService.voteReport(parseResult.data);

    if (result.action === 'dismissed') {
      io.emit('report:removed', { reportId: parseResult.data.reportId });
    } else if (result.action === 'updated' && result.report) {
      io.emit('report:updated', result.report);
    }
  });
});

// Broadcast expired reports removal to all connected clients
reportService.onReportExpired((expiredReport) => {
  io.emit('report:removed', { reportId: expiredReport.id, reason: 'expired_ttl' });
});

// Start background worker for TTL 40 minutes cleanup
reportService.startCleanupWorker();

// Start server if executed directly
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[DiviAkhaaa Server] listening on port ${PORT}`);
    console.log(`[DiviAkhaaa Server] Health check available at http://localhost:${PORT}/health`);
  });
}
