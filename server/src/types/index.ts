import { z } from 'zod';

export interface TransitStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  lines: string[];
}

export interface TransitLine {
  id: string;
  name: string;
  type: 'tram' | 'bus';
  color: string;
  textColor: string;
  stops: TransitStop[];
  polyline: [number, number][]; // [latitude, longitude]
}

export interface RouteStep {
  type: 'walk' | 'transit';
  instruction: string;
  durationMinutes: number;
  distanceMeters: number;
  lineId?: string;
  lineName?: string;
  lineColor?: string;
  fromStop?: TransitStop;
  toStop?: TransitStop;
  stopsCount?: number;
  intermediateStops?: TransitStop[];
}

export interface RouteOption {
  id: string;
  departureTime: string;
  arrivalTime: string;
  totalDurationMinutes: number;
  walkingDurationMinutes: number;
  transitDurationMinutes: number;
  transfersCount: number;
  steps: RouteStep[];
  summary: string;
  nextDepartureMinutes: number;
}

export type ReportStatus = 'active' | 'expired' | 'dismissed';

export interface Report {
  id: string;
  stopId: string;
  stopName: string;
  lineId: string;
  lineName: string;
  latitude: number;
  longitude: number;
  direction: string;
  description?: string;
  reportedAt: number; // Unix timestamp ms
  expiresAt: number; // Unix timestamp ms (TTL 40 min default)
  upvotes: number; // "Toujours là"
  downvotes: number; // "Partis"
  reliabilityScore: number; // 0 - 100
  status: ReportStatus;
}

// Zod validation schemas (OWASP: Strict Input Validation)
export const coordinateSchema = z.object({
  latitude: z.number().min(47.25, 'Hors métropole dijonnaise').max(47.40, 'Hors métropole dijonnaise'),
  longitude: z.number().min(4.95, 'Hors métropole dijonnaise').max(5.15, 'Hors métropole dijonnaise'),
});

export const routeQuerySchema = z.object({
  fromLat: z.coerce.number().min(47.25).max(47.40),
  fromLng: z.coerce.number().min(4.95).max(5.15),
  toLat: z.coerce.number().min(47.25).max(47.40),
  toLng: z.coerce.number().min(4.95).max(5.15),
  departureTime: z.string().optional(),
});

export type RouteQuery = z.infer<typeof routeQuerySchema>;

export const createReportSchema = z.object({
  stopId: z.string().min(1).max(64),
  stopName: z.string().min(1).max(128).trim(),
  lineId: z.string().min(1).max(16),
  lineName: z.string().min(1).max(64).trim(),
  latitude: z.number().min(47.25).max(47.40),
  longitude: z.number().min(4.95).max(5.15),
  direction: z.string().min(1).max(128).trim(),
  description: z.string().max(256).trim().optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const voteReportSchema = z.object({
  reportId: z.string().min(1),
  voteType: z.enum(['up', 'down']), // 'up' = "Toujours là", 'down' = "Partis"
});

export type VoteReportInput = z.infer<typeof voteReportSchema>;
