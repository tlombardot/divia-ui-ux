import { TransitLine, TransitStop } from '../types';

export const DIJON_CENTER = {
  latitude: 47.3220,
  longitude: 5.0415,
};

// =============================================================================
// Pôles de correspondance majeurs de Dijon
// =============================================================================
export const HUB_DARCY: TransitStop = {
  id: 'hub-darcy',
  name: 'Darcy',
  latitude: 47.3235,
  longitude: 5.0335,
  lines: ['T1', 'T2', 'L3', 'L4', 'L5', 'B10', 'B12', 'B13'],
};

export const HUB_GARE: TransitStop = {
  id: 'hub-gare',
  name: 'Dijon Gare',
  latitude: 47.3236,
  longitude: 5.0278,
  lines: ['T1', 'L3', 'B12', 'B13'],
};

export const HUB_FOCH: TransitStop = {
  id: 't1-foch',
  name: 'Foch Gare',
  latitude: 47.3235,
  longitude: 5.0298,
  lines: ['T1', 'T2'],
};

export const HUB_REPUBLIQUE: TransitStop = {
  id: 'hub-republique',
  name: 'République',
  latitude: 47.3262,
  longitude: 5.0461,
  lines: ['T1', 'T2', 'L3', 'L6'],
};

export const HUB_GODRANS: TransitStop = {
  id: 'hub-godrans',
  name: 'Godrans Les Halles',
  latitude: 47.3232,
  longitude: 5.0401,
  lines: ['T1', 'T2', 'L3'],
};

export const HUB_MONGE: TransitStop = {
  id: 'hub-monge',
  name: 'Monge Cité de la Gastronomie',
  latitude: 47.3178,
  longitude: 5.0345,
  lines: ['T2', 'L4', 'B12', 'B13'],
};

export const HUB_AUDITORIUM: TransitStop = {
  id: 'hub-auditorium',
  name: 'Auditorium',
  latitude: 47.3283,
  longitude: 5.0506,
  lines: ['T1', 'L6'],
};

export const HUB_UNIVERSITE: TransitStop = {
  id: 'hub-universite',
  name: 'Université',
  latitude: 47.3135,
  longitude: 5.0712,
  lines: ['T1', 'L5'],
};

export const STOP_THEATRE: TransitStop = {
  id: 'l5-theatre',
  name: 'Théâtre',
  latitude: 47.3218,
  longitude: 5.0425,
  lines: ['L5', 'L6'],
};

export const STOP_WILSON: TransitStop = {
  id: 'l5-wilson',
  name: 'Wilson - Carnot',
  latitude: 47.3172,
  longitude: 5.0461,
  lines: ['L5', 'L6'],
};

// Alias pour compatibilité
export const DARCY_HUB = HUB_DARCY;

// =============================================================================
// Ligne T1 : Tramway (Dijon Gare ↔ Quetigny Centre)
// =============================================================================
const stopsT1: TransitStop[] = [
  HUB_GARE,
  HUB_FOCH,
  HUB_DARCY,
  HUB_GODRANS,
  HUB_REPUBLIQUE,
  HUB_AUDITORIUM,
  { id: 't1-poincare', name: 'Poincaré', latitude: 47.3275, longitude: 5.0601, lines: ['T1'] },
  { id: 't1-gresilles', name: 'Grésilles', latitude: 47.3251, longitude: 5.0682, lines: ['T1', 'L3'] },
  { id: 't1-parcsports', name: 'Parc des Sports', latitude: 47.3228, longitude: 5.0743, lines: ['T1'] },
  { id: 't1-erasme', name: 'Erasme', latitude: 47.3142, longitude: 5.0674, lines: ['T1', 'L5'] },
  HUB_UNIVERSITE,
  { id: 't1-capvert', name: 'Cap Vert', latitude: 47.3115, longitude: 5.0920, lines: ['T1'] },
  { id: 't1-quetigny', name: 'Quetigny Centre', latitude: 47.3101, longitude: 5.1095, lines: ['T1'] },
];

// =============================================================================
// Ligne T2 : Tramway (Valmy ↔ Chenôve Centre)
// Tronc commun réel avec T1 : République ↔ Godrans ↔ Darcy ↔ Foch Gare
// =============================================================================
const stopsT2: TransitStop[] = [
  { id: 't2-valmy', name: 'Valmy', latitude: 47.3621, longitude: 5.0538, lines: ['T2'] },
  { id: 't2-zenith', name: 'Zénith', latitude: 47.3582, longitude: 5.0526, lines: ['T2'] },
  { id: 't2-toison', name: 'Toison d\'Or', latitude: 47.3541, longitude: 5.0501, lines: ['T2', 'L6'] },
  { id: 't2-europe', name: 'Europe - Simone Veil', latitude: 47.3482, longitude: 5.0478, lines: ['T2'] },
  { id: 't2-nation', name: 'Nation', latitude: 47.3431, longitude: 5.0452, lines: ['T2', 'L4'] },
  { id: 't2-drapeau', name: 'Drapeau', latitude: 47.3341, longitude: 5.0440, lines: ['T2'] },
  HUB_REPUBLIQUE,
  HUB_GODRANS,
  HUB_DARCY,
  HUB_FOCH,
  HUB_MONGE,
  { id: 't2-bourroches', name: 'Bourroches', latitude: 47.3092, longitude: 5.0289, lines: ['T2', 'L4'] },
  { id: 't2-carraz', name: 'Carraz', latitude: 47.3015, longitude: 5.0211, lines: ['T2'] },
  { id: 't2-chenove', name: 'Chenôve Centre', latitude: 47.2928, longitude: 5.0125, lines: ['T2', 'L4'] },
];

// =============================================================================
// Ligne L3 : Liane Bus (Epirey Capnord ↔ Fontaine d'Ouche)
// =============================================================================
const stopsL3: TransitStop[] = [
  { id: 'l3-epirey', name: 'Epirey Capnord', latitude: 47.3410, longitude: 5.0810, lines: ['L3'] },
  { id: 'l3-billardon', name: 'Billardon', latitude: 47.3320, longitude: 5.0740, lines: ['L3'] },
  { id: 't1-gresilles', name: 'Grésilles', latitude: 47.3251, longitude: 5.0682, lines: ['T1', 'L3'] },
  HUB_REPUBLIQUE,
  HUB_GODRANS,
  HUB_DARCY,
  HUB_GARE,
  { id: 'l3-marronniers', name: 'Marronniers', latitude: 47.3225, longitude: 5.0195, lines: ['L3'] },
  { id: 'l3-champs-perdreaux', name: 'Champs Perdrix', latitude: 47.3210, longitude: 5.0110, lines: ['L3'] },
  { id: 'l3-fontaine-ouche', name: 'Fontaine d\'Ouche', latitude: 47.3190, longitude: 5.0020, lines: ['L3'] },
];

// =============================================================================
// Ligne L4 : Liane Bus (Nation ↔ Marsannay Portes du Sud)
// =============================================================================
const stopsL4: TransitStop[] = [
  { id: 't2-nation', name: 'Nation', latitude: 47.3431, longitude: 5.0452, lines: ['T2', 'L4'] },
  { id: 'l4-jouvet', name: 'Jouvet', latitude: 47.3355, longitude: 5.0390, lines: ['L4'] },
  { id: 'l4-albert-1er', name: 'Albert 1er', latitude: 47.3280, longitude: 5.0350, lines: ['L4'] },
  HUB_DARCY,
  HUB_MONGE,
  { id: 't2-bourroches', name: 'Bourroches', latitude: 47.3092, longitude: 5.0289, lines: ['T2', 'L4'] },
  { id: 't2-chenove', name: 'Chenôve Centre', latitude: 47.2928, longitude: 5.0125, lines: ['T2', 'L4'] },
  { id: 'l4-marsannay', name: 'Marsannay Portes du Sud', latitude: 47.2790, longitude: 5.0040, lines: ['L4'] },
];

// =============================================================================
// Ligne L5 : Liane Bus (Talant Dullin ↔ Université)
// =============================================================================
const stopsL5: TransitStop[] = [
  { id: 'l5-talant', name: 'Talant Dullin', latitude: 47.3371, longitude: 5.0028, lines: ['L5', 'B10'] },
  { id: 'l5-clomiers', name: 'Clomiers', latitude: 47.3332, longitude: 5.0135, lines: ['L5'] },
  { id: 'l5-spuller', name: 'Spuller', latitude: 47.3282, longitude: 5.0242, lines: ['L5'] },
  HUB_DARCY,
  STOP_THEATRE,
  STOP_WILSON,
  { id: 'l5-parc', name: 'Parc Chevreul', latitude: 47.3115, longitude: 5.0521, lines: ['L5'] },
  { id: 'l5-mansart', name: 'Mansart', latitude: 47.3129, longitude: 5.0615, lines: ['L5'] },
  { id: 't1-erasme', name: 'Erasme', latitude: 47.3142, longitude: 5.0674, lines: ['T1', 'L5'] },
  HUB_UNIVERSITE,
];

// =============================================================================
// Ligne L6 : Liane Bus (Toison d'Or ↔ Longvic)
// =============================================================================
const stopsL6: TransitStop[] = [
  { id: 't2-toison', name: 'Toison d\'Or', latitude: 47.3541, longitude: 5.0501, lines: ['T2', 'L6'] },
  { id: 'l6-clemenceau', name: 'Clemenceau', latitude: 47.3315, longitude: 5.0510, lines: ['L6'] },
  HUB_AUDITORIUM,
  HUB_REPUBLIQUE,
  STOP_THEATRE,
  STOP_WILSON,
  { id: 'l6-doumer', name: 'Doumer', latitude: 47.3080, longitude: 5.0580, lines: ['L6'] },
  { id: 'l6-longvic', name: 'Longvic', latitude: 47.2880, longitude: 5.0640, lines: ['L6'] },
];

// =============================================================================
// Ligne B10 : Bus (Ahuy ↔ Talant Citadelle)
// =============================================================================
const stopsB10: TransitStop[] = [
  { id: 'b10-ahuy', name: 'Ahuy', latitude: 47.3680, longitude: 5.0280, lines: ['B10'] },
  { id: 'b10-hauteville', name: 'Hauteville', latitude: 47.3550, longitude: 5.0180, lines: ['B10'] },
  { id: 'b10-victorhugo', name: 'Victor Hugo', latitude: 47.3270, longitude: 5.0290, lines: ['B10'] },
  HUB_DARCY,
  { id: 'l5-talant', name: 'Talant Dullin', latitude: 47.3371, longitude: 5.0028, lines: ['L5', 'B10'] },
  { id: 'b10-talant-citadelle', name: 'Talant Citadelle', latitude: 47.3385, longitude: 4.9965, lines: ['B10'] },
];

// =============================================================================
// Ligne B12 : Bus (Plombières ↔ Chicago)
// =============================================================================
const stopsB12: TransitStop[] = [
  { id: 'b12-plombieres', name: 'Plombières', latitude: 47.3350, longitude: 4.9720, lines: ['B12'] },
  { id: 'b12-velars', name: 'Canal de Bourgogne', latitude: 47.3290, longitude: 4.9980, lines: ['B12'] },
  HUB_GARE,
  HUB_DARCY,
  HUB_MONGE,
  { id: 'b12-chicago', name: 'Chicago', latitude: 47.3120, longitude: 5.0540, lines: ['B12'] },
];

// =============================================================================
// Ligne B13 : Bus (Fontaine Village ↔ Motte Giron)
// =============================================================================
const stopsB13: TransitStop[] = [
  { id: 'b13-fontaine', name: 'Fontaine Village', latitude: 47.3440, longitude: 5.0190, lines: ['B13'] },
  { id: 'b13-montchapet', name: 'Montchapet', latitude: 47.3310, longitude: 5.0260, lines: ['B13'] },
  HUB_GARE,
  HUB_DARCY,
  HUB_MONGE,
  { id: 'b13-mottegiron', name: 'Motte Giron', latitude: 47.3060, longitude: 5.0150, lines: ['B13'] },
];

// =============================================================================
// Catalogue Complet des Lignes Divia (Palette Officielle & Catégories)
// =============================================================================
export const DIJON_LINES: TransitLine[] = [
  {
    id: 'T1',
    name: 'T1 · Dijon Gare ↔ Quetigny Centre',
    type: 'tram',
    category: 'TRAM',
    terminusA: 'Dijon Gare',
    terminusB: 'Quetigny Centre',
    color: '#E11535',
    textColor: '#FFFFFF',
    stops: stopsT1,
    polyline: stopsT1.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'T2',
    name: 'T2 · Valmy ↔ Chenôve Centre',
    type: 'tram',
    category: 'TRAM',
    terminusA: 'Valmy',
    terminusB: 'Chenôve Centre',
    color: '#4B2982',
    textColor: '#FFFFFF',
    stops: stopsT2,
    polyline: stopsT2.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'L3',
    name: 'L3 · Epirey Capnord ↔ Fontaine d\'Ouche',
    type: 'bus',
    category: 'LIANE',
    terminusA: 'Epirey Capnord',
    terminusB: 'Fontaine d\'Ouche',
    color: '#F39200',
    textColor: '#FFFFFF',
    stops: stopsL3,
    polyline: stopsL3.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'L4',
    name: 'L4 · Nation ↔ Marsannay Portes du Sud',
    type: 'bus',
    category: 'LIANE',
    terminusA: 'Nation',
    terminusB: 'Marsannay Portes du Sud',
    color: '#009FE3',
    textColor: '#FFFFFF',
    stops: stopsL4,
    polyline: stopsL4.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'L5',
    name: 'L5 · Talant Dullin ↔ Université',
    type: 'bus',
    category: 'LIANE',
    terminusA: 'Talant Dullin',
    terminusB: 'Université',
    color: '#00875A',
    textColor: '#FFFFFF',
    stops: stopsL5,
    polyline: stopsL5.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'L6',
    name: 'L6 · Toison d\'Or ↔ Longvic',
    type: 'bus',
    category: 'LIANE',
    terminusA: 'Toison d\'Or',
    terminusB: 'Longvic',
    color: '#D81B60',
    textColor: '#FFFFFF',
    stops: stopsL6,
    polyline: stopsL6.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'B10',
    name: 'B10 · Ahuy ↔ Talant Citadelle',
    type: 'bus',
    category: 'BUS',
    terminusA: 'Ahuy',
    terminusB: 'Talant Citadelle',
    color: '#00695C',
    textColor: '#FFFFFF',
    stops: stopsB10,
    polyline: stopsB10.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'B12',
    name: 'B12 · Plombières ↔ Chicago',
    type: 'bus',
    category: 'BUS',
    terminusA: 'Plombières',
    terminusB: 'Chicago',
    color: '#6D4C41',
    textColor: '#FFFFFF',
    stops: stopsB12,
    polyline: stopsB12.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
  {
    id: 'B13',
    name: 'B13 · Fontaine Village ↔ Motte Giron',
    type: 'bus',
    category: 'BUS',
    terminusA: 'Fontaine Village',
    terminusB: 'Motte Giron',
    color: '#3949AB',
    textColor: '#FFFFFF',
    stops: stopsB13,
    polyline: stopsB13.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
];

// Tous les arrêts uniques dédupliqués
export const ALL_DIJON_STOPS: TransitStop[] = Array.from(
  new Map(
    DIJON_LINES.flatMap(l => l.stops).map(stop => [stop.id, stop])
  ).values()
);

/**
 * Calcul de distance en mètres avec la formule de Haversine
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
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
 * Trouver l'arrêt le plus proche d'une coordonnée GPS
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

/**
 * Trouver plusieurs arrêts proches (ex: dans un rayon de 1200m)
 */
export function findNearbyStops(
  lat: number,
  lng: number,
  maxDistanceMeters: number = 1200,
  limit: number = 5
): { stop: TransitStop; distanceMeters: number }[] {
  return ALL_DIJON_STOPS
    .map(stop => ({
      stop,
      distanceMeters: calculateDistanceMeters(lat, lng, stop.latitude, stop.longitude),
    }))
    .filter(item => item.distanceMeters <= maxDistanceMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

export function getStopById(id: string): TransitStop | undefined {
  return ALL_DIJON_STOPS.find(s => s.id === id);
}

export function getLineById(id: string): TransitLine | undefined {
  return DIJON_LINES.find(l => l.id === id);
}
