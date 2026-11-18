export interface TransitStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  lines: string[];
  polylineVertexIndex?: number;
  distanceAlongLineMeters?: number;
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
  polyline: [number, number][]; // [lat, lng]
  shapeSource?: ShapeSource;
}

export type ReportType = 'CONTROLLER' | 'CROWD';
export type CrowdLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CrowdSource = 'community' | 'estimated';

export interface CrowdStatus {
  level: CrowdLevel;
  source: CrowdSource;
  label: string;
  description: string;
  updatedAt?: number;
  reportsCount: number;
}

export type RouteSegmentType = 'WALK' | 'TRANSIT' | 'TRANSFER';

export interface IntermediateStopInfo {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  estimatedTime: string;
  hasControllerAlert: boolean;
}

export interface RouteSegment {
  type: RouteSegmentType;
  instruction: string;
  durationSeconds?: number;
  durationMinutes: number;
  distanceMeters: number;
  polyline: [number, number][]; // [lat, lng]
  lineId?: string;
  lineName?: string;
  lineColor?: string;
  direction?: string;
  fromStop?: TransitStop;
  toStop?: TransitStop;
  stopsCount?: number;
  passedStops?: TransitStop[];
  intermediateStops?: IntermediateStopInfo[];
  estimatedStopTimes?: string[];
  instructions?: string[];
  turnInstructions?: string[];
  departureTime?: string;
  arrivalTime?: string;
  crowdStatus?: CrowdStatus;
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

export interface UpcomingStopPrediction {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  etaMinutes: number;
}

export interface ControllerProgression {
  mode: 'STATIONARY' | 'MOVING';
  directionTerminus: string;
  initialStopId: string;
  initialStopName: string;
  currentStopId: string;
  currentStopName: string;
  currentStopIndex: number;
  endStopIndex: number;
  currentLatitude: number;
  currentLongitude: number;
  distanceAlongLineMeters?: number;
  snappedToLine?: boolean;
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
  title: string;
  departureTime: string;
  arrivalTime: string;
  totalDurationMinutes: number;
  walkingDurationMinutes: number;
  transitDurationMinutes: number;
  transfersCount: number;
  headwayMinutes?: number;
  segments: RouteSegment[];
  steps: RouteStep[];
  summary: string;
  nextDepartureMinutes: number;
  hasControllerAlert: boolean;
  alerts: Report[];
  predictiveAlerts?: PredictiveAlert[];
  crowdStatus?: CrowdStatus;
  crowdSummary?: string;
  fullPolyline: [number, number][];
}

export interface Report {
  id: string;
  type?: ReportType;
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
  reportedAt: number;
  lastConfirmedAt?: number;
  lastConfirmedStopId?: string;
  expiresAt: number;
  upvotes: number;
  downvotes: number;
  reliabilityScore: number;
  status: 'active' | 'expired' | 'dismissed';
  snappedToLine?: boolean;
  currentStationName?: string;
  upcomingStops?: UpcomingStopPrediction[];
  progression?: ControllerProgression;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  isDemoMode: boolean;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface SavedNavigationState {
  activeRoute: RouteOption;
  currentSegmentIndex?: number;
  currentStepIndex: number;
  startedAt: number;
  navState?: string;
}

export interface PlaceSuggestion {
  placeId: string;
  label: string;
  secondaryText: string;
  type: 'address' | 'stop' | 'poi';
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
  type: 'address' | 'stop' | 'poi';
}

export interface GeocodedAddress {
  id: string;
  placeId?: string;
  label: string;
  context: string;
  latitude: number;
  longitude: number;
  type: 'address' | 'stop' | 'poi';
  needsDetails?: boolean;
}
