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

export type RouteSegmentType = 'WALK' | 'TRANSIT' | 'TRANSFER';

export interface RouteSegment {
  type: RouteSegmentType;
  instruction: string;
  durationMinutes: number;
  distanceMeters: number;
  polyline: [number, number][]; // [latitude, longitude]
  lineId?: string;
  lineName?: string;
  lineColor?: string;
  direction?: string;
  fromStop?: TransitStop;
  toStop?: TransitStop;
  stopsCount?: number;
  passedStops?: TransitStop[];
  estimatedStopTimes?: string[]; // HH:mm for each stop in passedStops
  turnInstructions?: string[];
  departureTime?: string;
  arrivalTime?: string;
}

// Legacy step interface for backwards compatibility
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
  title: string; // "Recommandé", "Direct sans correspondance", "100% à pied"
  departureTime: string;
  arrivalTime: string;
  totalDurationMinutes: number;
  walkingDurationMinutes: number;
  transitDurationMinutes: number;
  transfersCount: number;
  headwayMinutes?: number; // e.g. 5 -> "Toutes les 5 min"
  segments: RouteSegment[];
  steps: RouteStep[]; // backward compat for clients still reading steps
  summary: string;
  nextDepartureMinutes: number;
  hasControllerAlert: boolean;
  alerts: Report[];
  fullPolyline: [number, number][];
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

// Zod validation schemas (OWASP: Strict Input Validation — 25 km Grand Dijon bounds)
export const coordinateSchema = z.object({
  latitude: z.number().min(47.08, 'Hors métropole dijonnaise').max(47.56, 'Hors métropole dijonnaise'),
  longitude: z.number().min(4.70, 'Hors métropole dijonnaise').max(5.38, 'Hors métropole dijonnaise'),
});

export const routeQuerySchema = z.object({
  fromLat: z.coerce.number().min(47.08).max(47.56),
  fromLng: z.coerce.number().min(4.70).max(5.38),
  fromLabel: z.string().max(160).optional(),
  toLat: z.coerce.number().min(47.08).max(47.56),
  toLng: z.coerce.number().min(4.70).max(5.38),
  toLabel: z.string().max(160).optional(),
  departureTime: z.string().optional(),
});

export type RouteQuery = z.infer<typeof routeQuerySchema>;

export const createReportSchema = z.object({
  stopId: z.string().min(1).max(64),
  stopName: z.string().min(1).max(128).trim(),
  lineId: z.string().min(1).max(16),
  lineName: z.string().min(1).max(64).trim(),
  latitude: z.number().min(47.08).max(47.56),
  longitude: z.number().min(4.70).max(5.38),
  direction: z.string().min(1).max(128).trim(),
  description: z.string().max(256).trim().optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const voteReportSchema = z.object({
  reportId: z.string().min(1),
  voteType: z.enum(['up', 'down']), // 'up' = "Toujours là", 'down' = "Partis"
});

export type VoteReportInput = z.infer<typeof voteReportSchema>;
