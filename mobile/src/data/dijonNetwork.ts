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

// Arrêts Ligne T1
export const STOPS_T1: TransitStop[] = [
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

// Arrêts Ligne T2 (Tronc commun réel T1+T2 : République ↔ Godrans ↔ Darcy ↔ Foch Gare)
export const STOPS_T2: TransitStop[] = [
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

// Arrêts Ligne L3
export const STOPS_L3: TransitStop[] = [
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

// Arrêts Ligne L4
export const STOPS_L4: TransitStop[] = [
  { id: 't2-nation', name: 'Nation', latitude: 47.3431, longitude: 5.0452, lines: ['T2', 'L4'] },
  { id: 'l4-jouvet', name: 'Jouvet', latitude: 47.3355, longitude: 5.0390, lines: ['L4'] },
  { id: 'l4-albert-1er', name: 'Albert 1er', latitude: 47.3280, longitude: 5.0350, lines: ['L4'] },
  HUB_DARCY,
  HUB_MONGE,
  { id: 't2-bourroches', name: 'Bourroches', latitude: 47.3092, longitude: 5.0289, lines: ['T2', 'L4'] },
  { id: 't2-chenove', name: 'Chenôve Centre', latitude: 47.2928, longitude: 5.0125, lines: ['T2', 'L4'] },
  { id: 'l4-marsannay', name: 'Marsannay Portes du Sud', latitude: 47.2790, longitude: 5.0040, lines: ['L4'] },
];

// Arrêts Ligne L5
export const STOPS_L5: TransitStop[] = [
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

// Arrêts Ligne L6
export const STOPS_L6: TransitStop[] = [
  { id: 't2-toison', name: 'Toison d\'Or', latitude: 47.3541, longitude: 5.0501, lines: ['T2', 'L6'] },
  { id: 'l6-clemenceau', name: 'Clemenceau', latitude: 47.3315, longitude: 5.0510, lines: ['L6'] },
  HUB_AUDITORIUM,
  HUB_REPUBLIQUE,
  STOP_THEATRE,
  STOP_WILSON,
  { id: 'l6-doumer', name: 'Doumer', latitude: 47.3080, longitude: 5.0580, lines: ['L6'] },
  { id: 'l6-longvic', name: 'Longvic', latitude: 47.2880, longitude: 5.0640, lines: ['L6'] },
];

// Arrêts Ligne B10
export const STOPS_B10: TransitStop[] = [
  { id: 'b10-ahuy', name: 'Ahuy', latitude: 47.3680, longitude: 5.0280, lines: ['B10'] },
  { id: 'b10-hauteville', name: 'Hauteville', latitude: 47.3550, longitude: 5.0180, lines: ['B10'] },
  { id: 'b10-victorhugo', name: 'Victor Hugo', latitude: 47.3270, longitude: 5.0290, lines: ['B10'] },
  HUB_DARCY,
  { id: 'l5-talant', name: 'Talant Dullin', latitude: 47.3371, longitude: 5.0028, lines: ['L5', 'B10'] },
  { id: 'b10-talant-citadelle', name: 'Talant Citadelle', latitude: 47.3385, longitude: 4.9965, lines: ['B10'] },
];

// Arrêts Ligne B12
export const STOPS_B12: TransitStop[] = [
  { id: 'b12-plombieres', name: 'Plombières', latitude: 47.3350, longitude: 4.9720, lines: ['B12'] },
  { id: 'b12-velars', name: 'Canal de Bourgogne', latitude: 47.3290, longitude: 4.9980, lines: ['B12'] },
  HUB_GARE,
  HUB_DARCY,
  HUB_MONGE,
  { id: 'b12-chicago', name: 'Chicago', latitude: 47.3120, longitude: 5.0540, lines: ['B12'] },
];

// Arrêts Ligne B13
export const STOPS_B13: TransitStop[] = [
  { id: 'b13-fontaine', name: 'Fontaine Village', latitude: 47.3440, longitude: 5.0190, lines: ['B13'] },
  { id: 'b13-montchapet', name: 'Montchapet', latitude: 47.3310, longitude: 5.0260, lines: ['B13'] },
  HUB_GARE,
  HUB_DARCY,
  HUB_MONGE,
  { id: 'b13-mottegiron', name: 'Motte Giron', latitude: 47.3060, longitude: 5.0150, lines: ['B13'] },
];

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
    stops: STOPS_T1,
    polyline: STOPS_T1.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_T2,
    polyline: STOPS_T2.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_L3,
    polyline: STOPS_L3.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_L4,
    polyline: STOPS_L4.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_L5,
    polyline: STOPS_L5.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_L6,
    polyline: STOPS_L6.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_B10,
    polyline: STOPS_B10.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_B12,
    polyline: STOPS_B12.map(s => [s.latitude, s.longitude]),
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
    stops: STOPS_B13,
    polyline: STOPS_B13.map(s => [s.latitude, s.longitude]),
    shapeSource: 'fallback',
  },
];

export const ALL_DIJON_STOPS: TransitStop[] = Array.from(
  new Map(
    DIJON_LINES.flatMap(l => l.stops).map(stop => [stop.id, stop])
  ).values()
);

export const QUICK_STOPS: TransitStop[] = [
  HUB_DARCY,
  HUB_GODRANS,
  HUB_REPUBLIQUE,
  HUB_GARE,
  HUB_MONGE,
  HUB_UNIVERSITE,
  { id: 't2-toison', name: 'Toison d\'Or', latitude: 47.3541, longitude: 5.0501, lines: ['T2', 'L6'] },
  { id: 't2-chenove', name: 'Chenôve Centre', latitude: 47.2928, longitude: 5.0125, lines: ['T2', 'L4'] },
];

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

export function getLineColor(lineId: string): string {
  const found = DIJON_LINES.find(l => l.id === lineId);
  if (found) return found.color;
  switch (lineId) {
    case 'T1': return '#E11535';
    case 'T2': return '#4B2982';
    case 'L3': return '#F39200';
    case 'L4': return '#009FE3';
    case 'L5': return '#00875A';
    case 'L6': return '#D81B60';
    case 'B10': return '#00695C';
    case 'B12': return '#6D4C41';
    case 'B13': return '#3949AB';
    default: return '#821245';
  }
}

export function getLiveDeparturesForLine(lineId: string, now: Date = new Date()): [number, number] {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  const isPeak = (timeInMinutes >= 450 && timeInMinutes <= 540) || (timeInMinutes >= 1020 && timeInMinutes <= 1110);
  const isEvening = hours >= 21 || hours < 6;

  let headway = 10;
  if (lineId === 'T1' || lineId === 'T2') {
    headway = isPeak ? 4 : isEvening ? 15 : 8;
  } else if (lineId.startsWith('L')) {
    headway = isPeak ? 6 : isEvening ? 20 : 10;
  } else {
    headway = isPeak ? 10 : isEvening ? 25 : 15;
  }

  const offset = lineId.charCodeAt(lineId.length - 1) % headway;
  const rem = (minutes + offset) % headway;
  const first = Math.max(1, rem === 0 ? headway : headway - rem);
  return [first, first + headway];
}

export function getLineDirections(lineId: string): [string, string] {
  const found = DIJON_LINES.find(l => l.id === lineId);
  if (found && found.stops.length >= 2) {
    return [
      found.stops[found.stops.length - 1].name,
      found.stops[0].name,
    ];
  }
  return ['Terminus A', 'Terminus B'];
}
