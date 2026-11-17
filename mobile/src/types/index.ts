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
}

export interface SavedNavigationState {
  activeRoute: RouteOption;
  currentStepIndex: number;
  startedAt: number;
}
