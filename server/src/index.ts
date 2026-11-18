import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import http from 'http';
import { Server, Socket } from 'socket.io';
import {
  ALL_DIJON_STOPS,
  buildCompleteStationsCatalog,
  DIJON_LINES,
  getLineById,
  getStopById,
} from './data/dijonNetwork';
import { buildStationPredictiveAlerts } from './services/controllerTrackerService';
import { autocompletePlaces, getPlaceDetails } from './services/googlePlacesService';
import { computeGoogleTransitRoutes } from './services/googleTransitService';
import { networkGeometryService } from './services/networkGeometryService';
import { reportService } from './services/reportService';
import {
  calculateRoutes,
  getLineHeadwayMinutes,
  getNextDepartureEstimate,
} from './services/routingService';
import {
  createReportSchema,
  networkShapesQuerySchema,
  placeDetailsQuerySchema,
  placesAutocompleteQuerySchema,
  routeQuerySchema,
  StationDeparture,
  stationsQuerySchema,
  voteReportSchema,
} from './types';
import { ALLOWED_CORS_HEADERS, createCorsOriginHandler } from './utils/corsConfig';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || '';

export const app = express();
export const server = http.createServer(app);

// Enable reverse-proxy support (localhost.run, localtunnel, ngrok, Render, Railway)
// Must be configured before express-rate-limit so X-Forwarded-For is trusted cleanly.
app.set('trust proxy', 1);

// -----------------------------------------------------------------------------
// Security Middleware (OWASP Top 10)
// -----------------------------------------------------------------------------

// 1. Helmet HTTP headers protection
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 2. CORS configuration (strict in production, tunnel/mobile-friendly in dev)
const corsOriginHandler = createCorsOriginHandler({
  corsOrigin: CORS_ORIGIN,
  nodeEnv: process.env.NODE_ENV,
});

app.use(
  cors({
    origin: corsOriginHandler,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ALLOWED_CORS_HEADERS,
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

const placesRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60, // Limit Places proxy queries to prevent quota abuse
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de recherche d\'adresses atteinte. Merci de patienter.' },
});

app.use('/api/', generalLimiter);
app.use('/api/reports', reportRateLimiter);
app.use('/api/places', placesRateLimiter);

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

// Complete catalog of all unique Dijon stations (T1..B13) with lines & directions
app.get('/api/stations', (req: Request, res: Response) => {
  const parseResult = stationsQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Paramètres de recherche de stations invalides',
      details: parseResult.error.format(),
    });
    return;
  }

  const cachedLines = networkGeometryService.getCachedLinesSync();
  let stations = buildCompleteStationsCatalog(cachedLines);

  const { q, lineId, category } = parseResult.data;
  if (lineId) {
    const upperLine = lineId.toUpperCase();
    stations = stations.filter(s => s.lines.includes(upperLine));
  }
  if (category) {
    stations = stations.filter(s =>
      s.lineDirections.some(ld => ld.category === category)
    );
  }
  if (q) {
    const normalizedQ = q
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    stations = stations.filter(s => {
      const normName = s.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return normName.includes(normalizedQ) || s.lines.some(l => l.toLowerCase().includes(normalizedQ));
    });
  }

  res.status(200).json({
    stations,
    totalCount: stations.length,
    linesCount: cachedLines.length,
  });
});

// High-precision geographic network shapes (Overpass + OSRM cached)
app.get('/api/network/shapes', async (req: Request, res: Response) => {
  const parseResult = networkShapesQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Paramètres de géométrie réseau invalides',
      details: parseResult.error.format(),
    });
    return;
  }

  try {
    const result = await networkGeometryService.getNetworkShapes({
      category: parseResult.data.category,
      forceRefresh: parseResult.data.refresh,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('[NetworkShapes Error]:', error);
    res.status(500).json({ error: 'Erreur lors de la génération des tracés réseau' });
  }
});

// Real-time station departures + crowd + controller alerts
app.get('/api/stations/:id/departures', (req: Request, res: Response) => {
  const stationId = String(req.params.id || '').trim();
  const station = getStopById(stationId);

  if (!station) {
    res.status(404).json({ error: 'Station introuvable sur le réseau Divia' });
    return;
  }

  const now = new Date();
  const departures: StationDeparture[] = [];

  for (const lineId of station.lines) {
    const line = getLineById(lineId);
    if (!line || line.stops.length < 2) continue;

    const firstDep = getNextDepartureEstimate(lineId, now);
    const headway = getLineHeadwayMinutes(lineId, now);
    const crowdStatus = reportService.getStationCrowdStatus(station.id, lineId, now);

    const terminusA = line.stops[line.stops.length - 1].name;
    const terminusB = line.stops[0].name;

    departures.push({
      lineId: line.id,
      lineName: line.name,
      lineColor: line.color,
      direction: `Vers ${terminusA}`,
      nextMinutes: [firstDep, firstDep + headway],
      crowdStatus,
    });

    departures.push({
      lineId: line.id,
      lineName: line.name,
      lineColor: line.color,
      direction: `Vers ${terminusB}`,
      nextMinutes: [firstDep + 2, firstDep + 2 + headway],
      crowdStatus,
    });
  }

  const stationCrowdStatus = reportService.getStationCrowdStatus(
    station.id,
    station.lines[0],
    now
  );
  const activeControllers = reportService.getActiveControllerReports(now.getTime());
  const controllerAlerts = activeControllers.filter(
    rep =>
      rep.stopId === station.id ||
      rep.progression?.currentStopId === station.id ||
      station.lines.includes(rep.lineId)
  );
  const predictiveAlerts = buildStationPredictiveAlerts(
    station.id,
    activeControllers,
    now.getTime(),
    networkGeometryService.getCachedLinesSync()
  );

  res.status(200).json({
    station,
    crowdStatus: stationCrowdStatus,
    departures,
    controllerAlerts,
    predictiveAlerts,
    updatedAt: now.getTime(),
  });
});

// Crowd map for all Dijon stations
app.get('/api/crowd', (_req: Request, res: Response) => {
  res.status(200).json({
    crowdMap: reportService.getAllStationsCrowdMap(),
    reports: reportService.getActiveCrowdReports(),
    updatedAt: Date.now(),
  });
});

// Google Places API (New) Autocomplete proxy (Dijon biased 20 km)
app.get('/api/places/autocomplete', async (req: Request, res: Response) => {
  const parseResult = placesAutocompleteQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Requête d\'autocomplétion invalide',
      details: parseResult.error.format(),
    });
    return;
  }

  try {
    const suggestions = await autocompletePlaces(parseResult.data.input);
    res.status(200).json({ suggestions });
  } catch (error) {
    console.error('[Places Autocomplete Error]:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche d\'adresses' });
  }
});

// Google Places API (New) Details proxy
app.get('/api/places/details', async (req: Request, res: Response) => {
  const parseResult = placeDetailsQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Identifiant de lieu invalide',
      details: parseResult.error.format(),
    });
    return;
  }

  try {
    const place = await getPlaceDetails(parseResult.data.placeId);
    if (!place) {
      res.status(404).json({ error: 'Lieu introuvable' });
      return;
    }
    res.status(200).json({ place });
  } catch (error) {
    console.error('[Places Details Error]:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du lieu' });
  }
});

// Route calculation (Google Routes API v2 TRANSIT primary + clean local fallback)
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
    const googleRoutes = await computeGoogleTransitRoutes(parseResult.data);
    if (googleRoutes && googleRoutes.length > 0) {
      res.status(200).json({ routes: googleRoutes, source: 'google_routes' });
      return;
    }

    const fallbackRoutes = await calculateRoutes(parseResult.data);
    res.status(200).json({ routes: fallbackRoutes, source: 'local_fallback' });
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
  if (newReport.type === 'CROWD') {
    io.emit('crowd:updated', {
      stopId: newReport.stopId,
      crowdStatus: reportService.getStationCrowdStatus(newReport.stopId, newReport.lineId),
    });
  }

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
    origin: corsOriginHandler,
    methods: ['GET', 'POST'],
    allowedHeaders: ALLOWED_CORS_HEADERS,
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
    if (report.type === 'CROWD') {
      io.emit('crowd:updated', {
        stopId: report.stopId,
        crowdStatus: reportService.getStationCrowdStatus(report.stopId, report.lineId),
      });
    }
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

// Start background worker for TTL & terminus expiry cleanup + 20s Socket.io live controller progression sync
if (process.env.NODE_ENV !== 'test') {
  reportService.startCleanupWorker(20000);

  setInterval(() => {
    const activeReports = reportService.getActiveReports();
    io.emit('reports:sync', activeReports);
  }, 20000);

  networkGeometryService.warmupCache();
  server.listen(PORT, HOST, () => {
    console.log(`[DiviAkhaaa Server] listening on http://${HOST}:${PORT}`);
    console.log(`[DiviAkhaaa Server] Health check available at http://127.0.0.1:${PORT}/health`);
  });
}
