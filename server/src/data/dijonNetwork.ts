import { TransitLine, TransitStop } from '../types';

export const DIJON_CENTER = {
  latitude: 47.3220,
  longitude: 5.0415,
};

export const DARCY_HUB = {
  id: 'stop-darcy',
  name: 'Darcy',
  latitude: 47.3235,
  longitude: 5.0335,
  lines: ['T1', 'T2', 'L5'],
};

// Stops for Line T1
const stopsT1: TransitStop[] = [
  { id: 't1-gare', name: 'Dijon Gare', latitude: 47.3236, longitude: 5.0278, lines: ['T1'] },
  { id: 't1-foch', name: 'Foch Gare', latitude: 47.3235, longitude: 5.0298, lines: ['T1'] },
  DARCY_HUB,
  { id: 't1-godrans', name: 'Godrans Les Halles', latitude: 47.3232, longitude: 5.0401, lines: ['T1'] },
  { id: 't1-republique', name: 'République', latitude: 47.3262, longitude: 5.0461, lines: ['T1', 'T2'] },
  { id: 't1-auditorium', name: 'Auditorium', latitude: 47.3283, longitude: 5.0506, lines: ['T1'] },
  { id: 't1-poincare', name: 'Poincaré', latitude: 47.3275, longitude: 5.0601, lines: ['T1'] },
  { id: 't1-gresilles', name: 'Grésilles', latitude: 47.3251, longitude: 5.0682, lines: ['T1'] },
  { id: 't1-parcsports', name: 'Parc des Sports', latitude: 47.3228, longitude: 5.0743, lines: ['T1'] },
  { id: 't1-erasme', name: 'Erasme', latitude: 47.3142, longitude: 5.0674, lines: ['T1', 'L5'] },
  { id: 't1-quetigny', name: 'Quetigny Centre', latitude: 47.3101, longitude: 5.1095, lines: ['T1'] },
];

// Stops for Line T2
const stopsT2: TransitStop[] = [
  { id: 't2-valmy', name: 'Valmy', latitude: 47.3621, longitude: 5.0538, lines: ['T2'] },
  { id: 't2-zenith', name: 'Zénith', latitude: 47.3582, longitude: 5.0526, lines: ['T2'] },
  { id: 't2-toison', name: 'Toison d\'Or', latitude: 47.3541, longitude: 5.0501, lines: ['T2'] },
  { id: 't2-europe', name: 'Europe - Simone Veil', latitude: 47.3482, longitude: 5.0478, lines: ['T2'] },
  { id: 't2-nation', name: 'Nation', latitude: 47.3431, longitude: 5.0452, lines: ['T2'] },
  { id: 't2-drapeau', name: 'Drapeau', latitude: 47.3341, longitude: 5.0440, lines: ['T2'] },
  { id: 't1-republique', name: 'République', latitude: 47.3262, longitude: 5.0461, lines: ['T1', 'T2'] },
  DARCY_HUB,
  { id: 't2-monge', name: 'Monge Cité de la Gastronomie', latitude: 47.3178, longitude: 5.0345, lines: ['T2'] },
  { id: 't2-bourroches', name: 'Bourroches', latitude: 47.3092, longitude: 5.0289, lines: ['T2'] },
  { id: 't2-carraz', name: 'Carraz', latitude: 47.3015, longitude: 5.0211, lines: ['T2'] },
  { id: 't2-chenove', name: 'Chenôve Centre', latitude: 47.2928, longitude: 5.0125, lines: ['T2'] },
];

// Stops for Line L5
const stopsL5: TransitStop[] = [
  { id: 'l5-talant', name: 'Talant Dullin', latitude: 47.3371, longitude: 5.0028, lines: ['L5'] },
  { id: 'l5-clomiers', name: 'Clomiers', latitude: 47.3332, longitude: 5.0135, lines: ['L5'] },
  { id: 'l5-spuller', name: 'Spuller', latitude: 47.3282, longitude: 5.0242, lines: ['L5'] },
  DARCY_HUB,
  { id: 'l5-theatre', name: 'Théâtre', latitude: 47.3218, longitude: 5.0425, lines: ['L5'] },
  { id: 'l5-wilson', name: 'Wilson - Carnot', latitude: 47.3172, longitude: 5.0461, lines: ['L5'] },
  { id: 'l5-parc', name: 'Parc Chevreul', latitude: 47.3115, longitude: 5.0521, lines: ['L5'] },
  { id: 'l5-mansart', name: 'Mansart', latitude: 47.3129, longitude: 5.0615, lines: ['L5'] },
  { id: 't1-erasme', name: 'Erasme', latitude: 47.3142, longitude: 5.0674, lines: ['T1', 'L5'] },
  { id: 'l5-universite', name: 'Université', latitude: 47.3135, longitude: 5.0712, lines: ['L5'] },
];

export const DIJON_LINES: TransitLine[] = [
  {
    id: 'T1',
    name: 'T1 · Dijon Gare ↔ Quetigny Centre',
    type: 'tram',
    color: '#E11535',
    textColor: '#FFFFFF',
    stops: stopsT1,
    polyline: stopsT1.map(s => [s.latitude, s.longitude]),
  },
  {
    id: 'T2',
    name: 'T2 · Valmy ↔ Chenôve Centre',
    type: 'tram',
    color: '#4B2982',
    textColor: '#FFFFFF',
    stops: stopsT2,
    polyline: stopsT2.map(s => [s.latitude, s.longitude]),
  },
  {
    id: 'L5',
    name: 'L5 · Talant Dullin ↔ Université',
    type: 'bus',
    color: '#00875A',
    textColor: '#FFFFFF',
    stops: stopsL5,
    polyline: stopsL5.map(s => [s.latitude, s.longitude]),
  },
];

// All unique stops
export const ALL_DIJON_STOPS: TransitStop[] = Array.from(
  new Map(
    [...stopsT1, ...stopsT2, ...stopsL5].map(stop => [stop.id, stop])
  ).values()
);

/**
 * Calculate distance in meters between two GPS coordinates using Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Find the nearest stop to a given coordinate
 */
export function findNearestStop(
  lat: number,
  lng: number,
  stops: TransitStop[] = ALL_DIJON_STOPS
): { stop: TransitStop; distanceMeters: number } | null {
  if (stops.length === 0) return null;

  let nearest = stops[0];
  let minDistance = calculateDistanceMeters(lat, lng, nearest.latitude, nearest.longitude);

  for (let i = 1; i < stops.length; i++) {
    const dist = calculateDistanceMeters(lat, lng, stops[i].latitude, stops[i].longitude);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = stops[i];
    }
  }

  return { stop: nearest, distanceMeters: minDistance };
}

export function getStopById(id: string): TransitStop | undefined {
  return ALL_DIJON_STOPS.find(s => s.id === id);
}

export function getLineById(id: string): TransitLine | undefined {
  return DIJON_LINES.find(l => l.id === id);
}
