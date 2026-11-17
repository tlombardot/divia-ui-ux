import { z } from 'zod';

export interface TransitStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  lines: string[];
}

export type LineCategory = 'TRAM' | 'LIANE' | 'BUS';
export type ShapeSource =
  | 'google_routes'
  | 'overpass'
  | 'overpass_rail_graph'
  | 'osrm'
  | 'fallback';

export interface TransitLine {
  id: string;
  name: string;
  type: 'tram' | 'bus';
  category: LineCategory;
  terminusA: string;
  terminusB: string;
  directionA?: string;
  directionB?: string;
  color: string;
  textColor: string;
  stops: TransitStop[];
  polyline: [number, number][]; // Forward (Aller: terminusA -> terminusB)
  returnPolyline?: [number, number][]; // Return (Retour: terminusB -> terminusA)
  shapeSource?: ShapeSource;
}

export interface StationLineDirection {
  lineId: string;
  lineName: string;
  lineColor: string;
  category: LineCategory;
  directionA: string;
  directionB: string;
}

export interface StationCatalogItem extends TransitStop {
  lineDirections: StationLineDirection[];
}

export type ReportType = 'CONTROLLER' | 'CROWD';
export type CrowdLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CrowdSource = 'community' | 'estimated';

export interface CrowdStatus {
  level: CrowdLevel;
  source: CrowdSource;
  label: string; // "Calme" | "Chargé" | "Bondé"
  description: string; // "Places assises" | "Voyage debout" | "Difficile de monter"
  updatedAt?: number;
  reportsCount: number;
}

export type RouteSegmentType = 'WALK' | 'TRANSIT' | 'TRANSFER';

export interface RouteSegment {
  type: RouteSegmentType;
  instruction: string;
  durationSeconds?: number;
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
  instructions?: string[]; // Street-by-street detailed instructions
  turnInstructions?: string[];
  departureTime?: string;
  arrivalTime?: string;
  crowdStatus?: CrowdStatus;
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

export interface UpcomingStopPrediction {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  etaMinutes: number;
}

export interface ControllerProgression {
  mode: 'STATIONARY' | 'MOVING';
  directionTerminus: string; // Terminus name or 'STATIONARY'
  initialStopId: string;
  initialStopName: string;
  currentStopId: string;
  currentStopName: string;
  currentStopIndex: number;
  endStopIndex: number;
  currentLatitude: number;
  currentLongitude: number;
  upcomingStops: UpcomingStopPrediction[];
  alertPolyline: [number, number][];
  estimatedTerminusAt: number;
  isExpired: boolean;
  summaryText: string;
}

export interface PredictiveAlert {
  reportId: string;
  lineId: string;
  directionTerminus: string;
  currentStopName: string;
  targetStopId: string;
  targetStopName: string;
  etaMinutes: number;
  message: string;
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
  predictiveAlerts?: PredictiveAlert[];
  crowdStatus?: CrowdStatus;
  crowdSummary?: string;
  fullPolyline: [number, number][];
}

export type ReportStatus = 'active' | 'expired' | 'dismissed';

export interface Report {
  id: string;
  type: ReportType;
  stopId: string;
  stopName: string;
  lineId: string;
  lineName: string;
  latitude: number;
  longitude: number;
  direction: string;
  directionTerminus?: string;
  description?: string;
  crowdLevel?: CrowdLevel;
  reportedAt: number; // Unix timestamp ms
  lastConfirmedAt?: number;
  lastConfirmedStopId?: string;
  expiresAt: number; // Unix timestamp ms (40 min CONTROLLER / 25 min CROWD)
  upvotes: number; // "Toujours là"
  downvotes: number; // "Partis"
  reliabilityScore: number; // 0 - 100
  status: ReportStatus;
  progression?: ControllerProgression;
}

export interface StationDeparture {
  lineId: string;
  lineName: string;
  lineColor: string;
  direction: string;
  nextMinutes: [number, number];
  crowdStatus: CrowdStatus;
}

export interface StationDeparturesResponse {
  station: TransitStop;
  crowdStatus: CrowdStatus;
  departures: StationDeparture[];
  controllerAlerts: Report[];
  predictiveAlerts?: PredictiveAlert[];
  updatedAt: number;
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

export const createReportSchema = z
  .object({
    type: z.enum(['CONTROLLER', 'CROWD']).default('CONTROLLER'),
    stopId: z.string().min(1).max(64),
    stopName: z.string().min(1).max(128).trim(),
    lineId: z.string().min(1).max(16).default('ALL'),
    lineName: z.string().min(1).max(64).trim().default('Toutes lignes'),
    latitude: z.number().min(47.08).max(47.56),
    longitude: z.number().min(4.70).max(5.38),
    direction: z.string().min(1).max(128).trim().default('Station / Quai'),
    directionTerminus: z.string().min(1).max(128).trim().optional(),
    description: z.string().max(256).trim().optional(),
    crowdLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  })
  .refine(
    data => data.type !== 'CROWD' || data.crowdLevel !== undefined,
    {
      message: 'Le niveau d\'affluence (LOW, MEDIUM, HIGH) est obligatoire pour un signalement CROWD.',
      path: ['crowdLevel'],
    }
  );

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const voteReportSchema = z.object({
  reportId: z.string().min(1),
  voteType: z.enum(['up', 'down']), // 'up' = "Toujours là", 'down' = "Partis"
  recalibrateStopId: z.string().min(1).max(64).optional(),
});

export type VoteReportInput = z.infer<typeof voteReportSchema>;

export const networkShapesQuerySchema = z.object({
  category: z.enum(['TRAM', 'LIANE', 'BUS']).optional(),
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform(v => v === 'true'),
});

export type NetworkShapesQuery = z.infer<typeof networkShapesQuerySchema>;

export interface PlaceSuggestion {
  placeId: string;
  label: string;
  secondaryText: string;
  type: 'stop' | 'address' | 'poi';
  latitude?: number;
  longitude?: number;
  source: 'google_places' | 'divia_local' | 'ban_fallback';
}

export interface PlaceDetailsResult {
  placeId: string;
  label: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  type: 'stop' | 'address' | 'poi';
}

export const placesAutocompleteQuerySchema = z.object({
  input: z.string().trim().min(2, 'Requête trop courte').max(160),
});

export const placeDetailsQuerySchema = z.object({
  placeId: z.string().trim().min(1, 'placeId requis').max(256),
});

export const stationsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  lineId: z.string().trim().max(16).optional(),
  category: z.enum(['TRAM', 'LIANE', 'BUS']).optional(),
});

export type StationsQuery = z.infer<typeof stationsQuerySchema>;
