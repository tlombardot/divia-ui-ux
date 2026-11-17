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
  polyline: [number, number][]; // [lat, lng]
}

export type RouteSegmentType = 'WALK' | 'TRANSIT' | 'TRANSFER';

export interface RouteSegment {
  type: RouteSegmentType;
  instruction: string;
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
  estimatedStopTimes?: string[];
  turnInstructions?: string[];
  departureTime?: string;
  arrivalTime?: string;
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
  fullPolyline: [number, number][];
}

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
  reportedAt: number;
  expiresAt: number;
  upvotes: number;
  downvotes: number;
  reliabilityScore: number;
  status: 'active' | 'expired' | 'dismissed';
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

export interface GeocodedAddress {
  id: string;
  label: string;
  context: string;
  latitude: number;
  longitude: number;
  type: 'address' | 'stop' | 'poi';
}
