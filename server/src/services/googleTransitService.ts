import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  DIJON_LINES,
} from '../data/dijonNetwork';
import {
  CrowdLevel,
  CrowdStatus,
  IntermediateStopInfo,
  PredictiveAlert,
  Report,
  RouteOption,
  RouteQuery,
  RouteSegment,
  RouteStep,
  TransitLine,
  TransitStop,
} from '../types';
import { matchRouteControllerReports } from './controllerTrackerService';
import {
  DiviaCatalogData,
  DiviaCatalogLine,
  diviaCatalogService,
  normalizeDiviaLineCode,
} from './diviaCatalogService';
import { reportService } from './reportService';
import {
  computeCumulativeDistances,
  projectPointOntoPolyline,
} from '../utils/geometryTopology';

export interface GoogleLatLng {
  latitude: number;
  longitude: number;
}

export interface GoogleTransitStop {
  name?: string;
  location?: {
    latLng?: GoogleLatLng;
  };
}

export interface GoogleTransitDetails {
  stopDetails?: {
    arrivalStop?: GoogleTransitStop;
    departureStop?: GoogleTransitStop;
    arrivalTime?: string;
    departureTime?: string;
  };
  localizedValues?: {
    arrivalTime?: { time?: { text?: string } };
    departureTime?: { time?: { text?: string } };
  };
  headsign?: string;
  headway?: string;
  transitLine?: {
    name?: string;
    nameShort?: string;
    color?: string;
    textColor?: string;
    vehicle?: {
      type?: string;
      name?: { text?: string };
    };
  };
  stopCount?: number;
}

export interface GoogleRouteStep {
  travelMode?: 'WALK' | 'TRANSIT' | string;
  staticDuration?: string;
  distanceMeters?: number;
  polyline?: {
    encodedPolyline?: string;
  };
  navigationInstruction?: {
    instructions?: string;
    maneuver?: string;
  };
  transitDetails?: GoogleTransitDetails;
  steps?: GoogleRouteStep[];
}

export interface GoogleRouteLeg {
  duration?: string;
  distanceMeters?: number;
  steps?: GoogleRouteStep[];
}

export interface GoogleRoute {
  duration?: string;
  distanceMeters?: number;
  polyline?: {
    encodedPolyline?: string;
  };
  legs?: GoogleRouteLeg[];
}

export interface GoogleComputeRoutesResponse {
  routes?: GoogleRoute[];
}

const GOOGLE_ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GOOGLE_ROUTES_TIMEOUT_MS = 6000;

const GOOGLE_ROUTES_FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.duration',
  'routes.legs.distanceMeters',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.polyline.encodedPolyline',
  'routes.legs.steps.transitDetails',
].join(',');

/**
 * Standard Google Encoded Polyline Algorithm decoder (precision 1e5)
 * Returns [latitude, longitude][] tuples
 */
export function decodeGooglePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];

  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      if (index >= encoded.length) break;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([Number((lat / 1e5).toFixed(6)), Number((lng / 1e5).toFixed(6))]);
  }

  return coordinates;
}

/**
 * Convenience decoder returning { latitude, longitude }[] objects
 */
export function decodeGooglePolylineLatLng(encoded: string): GoogleLatLng[] {
  return decodeGooglePolyline(encoded).map(([latitude, longitude]) => ({
    latitude,
    longitude,
  }));
}

function parseGoogleDurationSeconds(durationStr?: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(parseFloat(match[1])) : 0;
}

function formatHHMM(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

const MAX_GPS_STOP_MATCH_METERS = 250;
const MAX_POLYLINE_STOP_DISTANCE_METERS = 35;
const TERMINAL_STOP_EXCLUSION_METERS = 45;
const CONTROLLER_PROXIMITY_METERS = 180;

const STOP_NAME_PARASITE_WORDS = new Set([
  'dijon',
  'place',
  'arret',
  'station',
  'avenue',
  'rue',
  'boulevard',
  'bd',
  'av',
  'pl',
  'tram',
  'tramway',
  'bus',
  'de',
  'du',
  'la',
  'le',
  'les',
  'l',
  'd',
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Soft stop name normalization for fuzzy matching between Google Transit stop names
 * and local Divia stops:
 * - Lowercases and removes accents
 * - Normalizes known Dijon synonyms ("Gare SNCF", "Gare de Dijon", "Dijon Ville" <-> "Dijon Gare")
 * - Strips parasite prefixes/words ("dijon", "place", "arrêt", "station", "avenue", "rue", articles)
 */
export function normalizeStopNameForMatching(rawName: string): string {
  const ascii = rawName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!ascii) {
    return '';
  }

  // Normalize Dijon Gare synonyms without disturbing "Foch Gare"
  let withSynonyms = ascii
    .replace(/\bgare\s+sncf\b/g, 'dijon gare')
    .replace(/\bgare\s+de\s+dijon(\s+ville)?\b/g, 'dijon gare')
    .replace(/\bgare\s+dijon(\s+ville)?\b/g, 'dijon gare')
    .replace(/\bdijon\s+gare\s+sncf\b/g, 'dijon gare')
    .replace(/\bdijon\s+ville\b/g, 'dijon gare');

  // If the entire string is literally "sncf", treat as "dijon gare"
  if (withSynonyms === 'sncf') {
    withSynonyms = 'dijon gare';
  }

  const tokens = withSynonyms
    .split(/\s+/)
    .filter(token => token.length > 0 && !STOP_NAME_PARASITE_WORDS.has(token));

  return tokens.join(' ');
}

function findClosestStopIndexByGps(
  stops: TransitStop[],
  coords: GoogleLatLng,
  maxDistanceMeters: number
): number {
  let bestIndex = -1;
  let bestDistance = maxDistanceMeters;

  for (let i = 0; i < stops.length; i++) {
    const dist = calculateDistanceMeters(
      coords.latitude,
      coords.longitude,
      stops[i].latitude,
      stops[i].longitude
    );
    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Hybrid resolver locating a boarding or alighting stop index on a local Divia line:
 * 1. Exact fuzzy-normalized name match ("Place Darcy" -> "Darcy", "Gare SNCF" -> "Dijon Gare")
 * 2. Partial token/substring match (disambiguated by GPS when multiple candidates exist)
 * 3. Mandatory GPS fallback via Haversine distance (< 250m)
 */
export function resolveStopIndexOnLine(
  line: Pick<TransitLine | DiviaCatalogLine, 'stops'>,
  stopName?: string,
  coords?: GoogleLatLng
): number {
  const stops = line.stops;
  if (!stops || stops.length === 0) {
    return -1;
  }

  const normalizedQuery = stopName ? normalizeStopNameForMatching(stopName) : '';

  if (normalizedQuery.length > 0) {
    // 1. Exact normalized match
    const exactMatches: number[] = [];
    for (let i = 0; i < stops.length; i++) {
      if (normalizeStopNameForMatching(stops[i].name) === normalizedQuery) {
        exactMatches.push(i);
      }
    }

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    if (exactMatches.length > 1 && coords) {
      let bestIdx = exactMatches[0];
      let bestDist = Infinity;
      for (const idx of exactMatches) {
        const dist = calculateDistanceMeters(
          coords.latitude,
          coords.longitude,
          stops[idx].latitude,
          stops[idx].longitude
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      }
      return bestIdx;
    }

    // 2. Substring / token match (e.g. "Godrans" <-> "Godrans Les Halles", "Monge" <-> "Monge Cité...")
    const partialMatches: number[] = [];
    for (let i = 0; i < stops.length; i++) {
      const stopNorm = normalizeStopNameForMatching(stops[i].name);
      if (
        stopNorm.length > 0 &&
        (stopNorm.includes(normalizedQuery) || normalizedQuery.includes(stopNorm))
      ) {
        partialMatches.push(i);
      }
    }

    if (partialMatches.length === 1) {
      const candidateIdx = partialMatches[0];
      // If GPS coordinates are provided and clearly point elsewhere (< 180m to another stop, > 600m from partial match), prefer GPS
      if (coords) {
        const distToCandidate = calculateDistanceMeters(
          coords.latitude,
          coords.longitude,
          stops[candidateIdx].latitude,
          stops[candidateIdx].longitude
        );
        if (distToCandidate > 600) {
          const gpsIdx = findClosestStopIndexByGps(stops, coords, MAX_GPS_STOP_MATCH_METERS);
          if (gpsIdx !== -1) {
            return gpsIdx;
          }
        }
      }
      return candidateIdx;
    }

    if (partialMatches.length > 1 && coords) {
      let bestIdx = partialMatches[0];
      let bestDist = Infinity;
      for (const idx of partialMatches) {
        const dist = calculateDistanceMeters(
          coords.latitude,
          coords.longitude,
          stops[idx].latitude,
          stops[idx].longitude
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      }
      if (bestDist < 600) {
        return bestIdx;
      }
    }
  }

  // 3. Mandatory GPS fallback (< 180 meters Haversine)
  if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
    return findClosestStopIndexByGps(stops, coords, MAX_GPS_STOP_MATCH_METERS);
  }

  return -1;
}

export function isControllerNearStop(
  stop: Pick<TransitStop, 'id' | 'latitude' | 'longitude'>,
  lineId: string,
  activeControllers: Report[]
): boolean {
  const upperLine = normalizeDiviaLineCode(lineId) || lineId.toUpperCase().trim();
  return activeControllers.some(rep => {
    if (rep.stopId === stop.id || rep.progression?.currentStopId === stop.id) {
      return true;
    }
    const dist = calculateDistanceMeters(
      stop.latitude,
      stop.longitude,
      rep.latitude,
      rep.longitude
    );
    if (dist <= 120) {
      return true;
    }
    const repLine = normalizeDiviaLineCode(rep.lineId) || rep.lineId.toUpperCase().trim();
    return repLine === upperLine && dist <= CONTROLLER_PROXIMITY_METERS;
  });
}

interface ProjectedStopCandidate {
  stop: TransitStop;
  distanceToPolyline: number;
  distanceAlongPolyline: number;
  matchesLine: boolean;
}

/**
 * Layer 2 — Spatial extraction along Google's decoded TRANSIT polyline:
 * Searches all Dijon stops within 35m of `decodedPolyline` (excluding boarding & alighting
 * stops), deduplicates opposite-side platforms, sorts strictly by progressive
 * `distanceAlongPolyline`, and retains up to `expectedCount` matching stops.
 */
export function resolveIntermediateStopsAlongPolyline(
  decodedPolyline: [number, number][],
  allStops: TransitStop[],
  options: {
    lineId?: string;
    depStopRaw?: GoogleTransitStop;
    arrStopRaw?: GoogleTransitStop;
    expectedCount?: number;
    maxDistanceMeters?: number;
  } = {}
): TransitStop[] {
  if (!decodedPolyline || decodedPolyline.length < 2 || allStops.length === 0) {
    return [];
  }

  const maxDist = options.maxDistanceMeters ?? MAX_POLYLINE_STOP_DISTANCE_METERS;
  const normalizedLine = normalizeDiviaLineCode(options.lineId);
  const depNormName = options.depStopRaw?.name
    ? normalizeStopNameForMatching(options.depStopRaw.name)
    : '';
  const arrNormName = options.arrStopRaw?.name
    ? normalizeStopNameForMatching(options.arrStopRaw.name)
    : '';

  const depCoords: GoogleLatLng = options.depStopRaw?.location?.latLng ?? {
    latitude: decodedPolyline[0][0],
    longitude: decodedPolyline[0][1],
  };
  const arrCoords: GoogleLatLng = options.arrStopRaw?.location?.latLng ?? {
    latitude: decodedPolyline[decodedPolyline.length - 1][0],
    longitude: decodedPolyline[decodedPolyline.length - 1][1],
  };

  const cumDistances = computeCumulativeDistances(decodedPolyline);
  const totalPolylineLength = cumDistances[cumDistances.length - 1] ?? 0;
  if (totalPolylineLength <= 0) {
    return [];
  }

  const rawCandidates: ProjectedStopCandidate[] = [];

  for (const stop of allStops) {
    const stopNorm = normalizeStopNameForMatching(stop.name);
    if (!stopNorm) continue;

    // Exclude boarding and alighting stops by normalized name or proximity
    if (
      (depNormName && stopNorm === depNormName) ||
      (arrNormName && stopNorm === arrNormName)
    ) {
      continue;
    }

    const distFromDep = calculateDistanceMeters(
      stop.latitude,
      stop.longitude,
      depCoords.latitude,
      depCoords.longitude
    );
    const distFromArr = calculateDistanceMeters(
      stop.latitude,
      stop.longitude,
      arrCoords.latitude,
      arrCoords.longitude
    );
    if (
      distFromDep < TERMINAL_STOP_EXCLUSION_METERS ||
      distFromArr < TERMINAL_STOP_EXCLUSION_METERS
    ) {
      continue;
    }

    const proj = projectPointOntoPolyline([stop.latitude, stop.longitude], decodedPolyline);
    if (proj.distanceMeters > maxDist) {
      continue;
    }

    const segStart = decodedPolyline[proj.segmentIndex];
    const segEnd = decodedPolyline[proj.segmentIndex + 1];
    const segLen =
      segStart && segEnd
        ? calculateDistanceMeters(segStart[0], segStart[1], segEnd[0], segEnd[1])
        : 0;
    const distanceAlongPolyline = (cumDistances[proj.segmentIndex] ?? 0) + proj.t * segLen;

    // Exclude stops sitting right on the polyline's start/end terminals
    if (
      distanceAlongPolyline < 35 ||
      totalPolylineLength - distanceAlongPolyline < 35
    ) {
      continue;
    }

    const matchesLine =
      normalizedLine.length > 0 &&
      stop.lines.some(l => normalizeDiviaLineCode(l) === normalizedLine);

    rawCandidates.push({
      stop,
      distanceToPolyline: proj.distanceMeters,
      distanceAlongPolyline,
      matchesLine,
    });
  }

  if (rawCandidates.length === 0) {
    return [];
  }

  // Deduplicate twin opposite-side platforms sharing the same normalized name (keep closest to polyline)
  const bestByName = new Map<string, ProjectedStopCandidate>();
  for (const cand of rawCandidates) {
    const key = normalizeStopNameForMatching(cand.stop.name);
    const existing = bestByName.get(key);
    if (
      !existing ||
      (cand.matchesLine && !existing.matchesLine) ||
      (cand.matchesLine === existing.matchesLine &&
        cand.distanceToPolyline < existing.distanceToPolyline)
    ) {
      bestByName.set(key, cand);
    }
  }

  // Sort strictly along polyline from departure -> arrival
  const sorted = Array.from(bestByName.values()).sort(
    (a, b) => a.distanceAlongPolyline - b.distanceAlongPolyline
  );

  // Deduplicate distinct stops clustered within 40m along the polyline
  const deduped: ProjectedStopCandidate[] = [];
  for (const cand of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(cand.distanceAlongPolyline - prev.distanceAlongPolyline) < 40) {
      const replacePrev =
        (cand.matchesLine && !prev.matchesLine) ||
        (cand.matchesLine === prev.matchesLine &&
          cand.distanceToPolyline < prev.distanceToPolyline);
      if (replacePrev) {
        deduped[deduped.length - 1] = cand;
      }
      continue;
    }
    deduped.push(cand);
  }

  const expectedCount = options.expectedCount ?? 0;
  if (expectedCount > 0 && deduped.length > expectedCount) {
    // Rank candidates by line membership + closeness to polyline, then re-sort by progression
    const ranked = [...deduped]
      .sort((a, b) => {
        if (a.matchesLine !== b.matchesLine) return a.matchesLine ? -1 : 1;
        return a.distanceToPolyline - b.distanceToPolyline;
      })
      .slice(0, expectedCount)
      .sort((a, b) => a.distanceAlongPolyline - b.distanceAlongPolyline);

    return ranked.map(c => c.stop);
  }

  return deduped.map(c => c.stop);
}

export interface ResolveIntermediateStopsParams {
  lineId: string;
  depStopRaw?: GoogleTransitStop;
  arrStopRaw?: GoogleTransitStop;
  depDate: Date;
  arrDate: Date;
  stopCount?: number;
  decodedPolyline?: [number, number][];
  activeControllers?: Report[];
  catalog?: DiviaCatalogData;
}

/**
 * Double-Layer Intermediate Stop Resolver:
 * - Layer 1 (Topological by line): resolves board/alight index on the normalized Divia line
 *   via fuzzy name + <250m GPS fallback, supporting both forward & reversed directions.
 * - Layer 2 (Spatial along Google polyline): if Layer 1 fails or stops are missing relative
 *   to Google's `stopCount - 1`, scans all Dijon stops within 35m of `decodedPolyline` sorted
 *   strictly along the route progression.
 */
export function resolveIntermediateStops(
  params: ResolveIntermediateStopsParams
): IntermediateStopInfo[] {
  const {
    lineId,
    depStopRaw,
    arrStopRaw,
    depDate,
    arrDate,
    stopCount,
    decodedPolyline = [],
    activeControllers = reportService.getActiveControllerReports(),
    catalog = diviaCatalogService.getCatalogSync(),
  } = params;

  const normalizedLineId = normalizeDiviaLineCode(lineId) || lineId.toUpperCase().trim();
  const expectedIntermediates =
    typeof stopCount === 'number' && stopCount > 1 ? stopCount - 1 : 0;

  // Layer 1: Topological lookup on the normalized Divia line
  let layer1Stops: TransitStop[] = [];
  const catalogLine = catalog.lines.find(
    l => normalizeDiviaLineCode(l.id) === normalizedLineId
  );

  if (catalogLine && catalogLine.stops.length >= 3) {
    const boardIndex = resolveStopIndexOnLine(
      catalogLine,
      depStopRaw?.name,
      depStopRaw?.location?.latLng
    );
    const alightIndex = resolveStopIndexOnLine(
      catalogLine,
      arrStopRaw?.name,
      arrStopRaw?.location?.latLng
    );

    if (boardIndex !== -1 && alightIndex !== -1 && boardIndex !== alightIndex) {
      layer1Stops =
        boardIndex < alightIndex
          ? catalogLine.stops.slice(boardIndex + 1, alightIndex)
          : catalogLine.stops.slice(alightIndex + 1, boardIndex).reverse();
    }
  }

  // Layer 2: Spatial extraction along Google polyline if Layer 1 failed or missed stops
  let finalOrderedStops: TransitStop[] = layer1Stops;
  const needsSpatialFallback =
    decodedPolyline.length >= 2 &&
    (layer1Stops.length === 0 ||
      (expectedIntermediates > 0 && layer1Stops.length < expectedIntermediates));

  if (needsSpatialFallback) {
    const spatialStops = resolveIntermediateStopsAlongPolyline(
      decodedPolyline,
      catalog.allStops,
      {
        lineId: normalizedLineId,
        depStopRaw,
        arrStopRaw,
        expectedCount: expectedIntermediates > 0 ? expectedIntermediates : undefined,
      }
    );

    if (spatialStops.length > layer1Stops.length) {
      finalOrderedStops = spatialStops;
    } else if (layer1Stops.length === 0) {
      finalOrderedStops = spatialStops;
    }
  }

  if (finalOrderedStops.length === 0) {
    return [];
  }

  const totalMs = Math.max(0, arrDate.getTime() - depDate.getTime());
  const totalIntervals = finalOrderedStops.length + 1;

  return finalOrderedStops.map((stop, idx) => {
    const estimatedDate = new Date(
      depDate.getTime() + Math.round((totalMs * (idx + 1)) / totalIntervals)
    );
    return {
      id: stop.id,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      estimatedTime: formatHHMM(estimatedDate),
      hasControllerAlert: isControllerNearStop(stop, normalizedLineId, activeControllers),
    };
  });
}

/**
 * Backward-compatible wrapper around `resolveIntermediateStops`.
 */
export function resolveIntermediateStopsForTransitLeg(
  lineId: string,
  depStopRaw: GoogleTransitStop | undefined,
  arrStopRaw: GoogleTransitStop | undefined,
  depDate: Date,
  arrDate: Date,
  activeControllers: Report[] = reportService.getActiveControllerReports(),
  linesCatalog?: TransitLine[]
): IntermediateStopInfo[] {
  const catalog: DiviaCatalogData = linesCatalog
    ? {
        version: 1,
        generatedAt: Date.now(),
        source: 'local_seed',
        lines: linesCatalog.map(l => ({
          id: normalizeDiviaLineCode(l.id),
          name: l.name,
          stops: l.stops,
        })),
        allStops: diviaCatalogService.getAllStopsSync(),
      }
    : diviaCatalogService.getCatalogSync();

  return resolveIntermediateStops({
    lineId,
    depStopRaw,
    arrStopRaw,
    depDate,
    arrDate,
    activeControllers,
    catalog,
  });
}

function resolveDiviaLineColor(lineShortName: string, googleColor?: string): string {
  const normalized = normalizeDiviaLineCode(lineShortName) || lineShortName.toUpperCase().trim();
  const known = DIJON_LINES.find(l => l.id === normalized);
  if (known) return known.color;
  if (googleColor && /^#[0-9A-Fa-f]{6}$/.test(googleColor)) {
    return googleColor;
  }
  return '#821245';
}

function resolveLocalStopId(stopName: string, lat: number, lng: number): string {
  const norm = normalizeStopNameForMatching(stopName);
  const byExact = ALL_DIJON_STOPS.find(
    s => norm.length > 0 && normalizeStopNameForMatching(s.name) === norm
  );
  if (byExact) return byExact.id;

  const fallbackNorm = normalizeText(stopName);
  const byName = ALL_DIJON_STOPS.find(
    s =>
      normalizeText(s.name) === fallbackNorm ||
      (fallbackNorm.length > 0 &&
        (normalizeText(s.name).includes(fallbackNorm) || fallbackNorm.includes(normalizeText(s.name))))
  );
  if (byName) return byName.id;

  let nearestId = `gstop-${lat.toFixed(5)}-${lng.toFixed(5)}`;
  let bestDist = 220;
  for (const s of ALL_DIJON_STOPS) {
    const d = calculateDistanceMeters(lat, lng, s.latitude, s.longitude);
    if (d < bestDist) {
      bestDist = d;
      nearestId = s.id;
    }
  }
  return nearestId;
}

function crowdRank(level: CrowdLevel): number {
  return level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1;
}

function mapSegmentsToSteps(segments: RouteSegment[]): RouteStep[] {
  return segments.map(seg => ({
    type: seg.type === 'TRANSIT' ? 'transit' : 'walk',
    instruction: seg.instruction,
    durationMinutes: seg.durationMinutes,
    distanceMeters: seg.distanceMeters,
    lineId: seg.lineId,
    lineName: seg.lineName,
    lineColor: seg.lineColor,
    fromStop: seg.fromStop,
    toStop: seg.toStop,
    stopsCount: seg.stopsCount,
    intermediateStops: seg.passedStops ? seg.passedStops.slice(1, -1) : undefined,
  }));
}

/**
 * Append decoded coordinates without duplicating consecutive identical points
 */
function appendPolylineCoords(
  target: [number, number][],
  points: [number, number][]
): void {
  for (const pt of points) {
    const prev = target[target.length - 1];
    if (
      prev &&
      Math.abs(prev[0] - pt[0]) < 1e-6 &&
      Math.abs(prev[1] - pt[1]) < 1e-6
    ) {
      continue;
    }
    target.push(pt);
  }
}

interface WalkBuffer {
  durationSeconds: number;
  distanceMeters: number;
  polyline: [number, number][];
  instructions: string[];
  startTime: Date;
  precededByTransit: boolean;
}

/**
 * Pure mapper: transforms a Google Routes API v2 route into DiviAkhaaa's RouteOption
 * merging consecutive WALK sub-steps into a single clean WALK segment while preserving
 * all street-by-street instructions, and fusing real-time Waze controller & crowd alerts.
 */
export function mapGoogleRouteToRouteOption(
  googleRoute: GoogleRoute,
  index: number,
  nowDate: Date = new Date()
): RouteOption | null {
  const leg = googleRoute.legs?.[0];
  if (!leg || !leg.steps || leg.steps.length === 0) return null;

  const totalSeconds = parseGoogleDurationSeconds(googleRoute.duration || leg.duration);
  const totalDurationMinutes = Math.max(1, Math.round(totalSeconds / 60));

  const segments: RouteSegment[] = [];
  const fullPolyline: [number, number][] = [];
  const linesUsed: string[] = [];
  const transitLegsForAlerts: Array<{
    lineId: string;
    stopIds: string[];
    polyline: [number, number][];
  }> = [];

  let walkingDurationSeconds = 0;
  let transitDurationMinutes = 0;
  let transitLegCount = 0;
  let firstTransitDepartureDate: Date | null = null;
  let firstHeadwayMinutes: number | undefined;
  let cursorTime = new Date(nowDate.getTime());

  const activeControllers = reportService.getActiveControllerReports(nowDate.getTime());

  const hasAnyTransit = leg.steps.some(
    s => s.travelMode === 'TRANSIT' && Boolean(s.transitDetails)
  );

  let walkBuffer: WalkBuffer | null = null;

  const flushWalkBuffer = (nextTransitStop?: TransitStop): void => {
    if (!walkBuffer) return;
    const buf = walkBuffer;
    walkBuffer = null;

    const endTime = new Date(buf.startTime.getTime() + buf.durationSeconds * 1000);
    cursorTime = endTime;

    const isTransferBetweenTransit = buf.precededByTransit && Boolean(nextTransitStop);

    // Same-platform transfer < 20m -> omit from summary pills (keep route clean)
    if (isTransferBetweenTransit && buf.distanceMeters < 20) {
      return;
    }

    // Ignore 0-length / trivial < 20m walk noise when transit is present
    if (hasAnyTransit && buf.distanceMeters < 20 && buf.durationSeconds < 15) {
      return;
    }

    const durationMinutes =
      buf.distanceMeters > 20 || buf.durationSeconds > 0
        ? Math.max(1, Math.round(buf.durationSeconds / 60))
        : 0;

    if (durationMinutes === 0 && hasAnyTransit) {
      return;
    }

    walkingDurationSeconds += buf.durationSeconds;

    const summaryInstruction = isTransferBetweenTransit && nextTransitStop
      ? `Correspondance à pied vers ${nextTransitStop.name}`
      : nextTransitStop
        ? `Marcher jusqu'à ${nextTransitStop.name}`
        : buf.precededByTransit
          ? `Marcher jusqu'à destination (${buf.distanceMeters} m)`
          : buf.instructions[0] || `Marcher sur ${buf.distanceMeters} m`;

    const cleanInstructions =
      buf.instructions.length > 0 ? buf.instructions : [summaryInstruction];

    segments.push({
      type: 'WALK',
      instruction: summaryInstruction,
      durationSeconds: buf.durationSeconds,
      durationMinutes: Math.max(1, durationMinutes),
      distanceMeters: buf.distanceMeters,
      polyline: buf.polyline,
      toStop: nextTransitStop,
      instructions: cleanInstructions,
      turnInstructions: cleanInstructions,
      departureTime: formatHHMM(buf.startTime),
      arrivalTime: formatHHMM(endTime),
    });
  };

  for (const step of leg.steps) {
    const stepSeconds = parseGoogleDurationSeconds(step.staticDuration);
    const stepDistance = step.distanceMeters ?? 0;
    const stepPolyline = step.polyline?.encodedPolyline
      ? decodeGooglePolyline(step.polyline.encodedPolyline)
      : [];

    if (stepPolyline.length > 0) {
      appendPolylineCoords(fullPolyline, stepPolyline);
    }

    if (step.travelMode === 'TRANSIT' && step.transitDetails) {
      const td = step.transitDetails;
      const depStopRaw = td.stopDetails?.departureStop;
      const arrStopRaw = td.stopDetails?.arrivalStop;

      const rawLineShort = (
        td.transitLine?.nameShort ||
        td.transitLine?.name ||
        'DIVIA'
      )
        .toUpperCase()
        .trim();
      const lineShort = normalizeDiviaLineCode(rawLineShort) || rawLineShort;
      const lineColor = resolveDiviaLineColor(lineShort, td.transitLine?.color);
      const vehicleType = td.transitLine?.vehicle?.type?.toUpperCase() || '';
      const vehicleLabel =
        vehicleType.includes('TRAM') || lineShort === 'T1' || lineShort === 'T2'
          ? 'Tram'
          : 'Bus';

      const depLat = depStopRaw?.location?.latLng?.latitude ?? stepPolyline[0]?.[0] ?? 47.3235;
      const depLng = depStopRaw?.location?.latLng?.longitude ?? stepPolyline[0]?.[1] ?? 5.0335;
      const arrLat =
        arrStopRaw?.location?.latLng?.latitude ??
        stepPolyline[stepPolyline.length - 1]?.[0] ??
        depLat;
      const arrLng =
        arrStopRaw?.location?.latLng?.longitude ??
        stepPolyline[stepPolyline.length - 1]?.[1] ??
        depLng;

      const depName = depStopRaw?.name || 'Arrêt de montée';
      const arrName = arrStopRaw?.name || 'Arrêt de descente';
      const depStopId = resolveLocalStopId(depName, depLat, depLng);
      const arrStopId = resolveLocalStopId(arrName, arrLat, arrLng);

      const fromStop: TransitStop = {
        id: depStopId,
        name: depName,
        latitude: depLat,
        longitude: depLng,
        lines: [lineShort],
      };

      const toStop: TransitStop = {
        id: arrStopId,
        name: arrName,
        latitude: arrLat,
        longitude: arrLng,
        lines: [lineShort],
      };

      // Flush any consecutive WALK steps preceding this TRANSIT leg
      flushWalkBuffer(fromStop);

      const stepMinutes = Math.max(1, Math.round(stepSeconds / 60));
      transitLegCount += 1;
      transitDurationMinutes += stepMinutes;

      const legPolyline: [number, number][] =
        stepPolyline.length >= 2
          ? stepPolyline
          : [
              [depLat, depLng],
              [arrLat, arrLng],
            ];
      linesUsed.push(lineShort);
      const transitLegForAlertsEntry = {
        lineId: lineShort,
        stopIds: [depStopId, arrStopId],
        polyline: legPolyline,
      };
      transitLegsForAlerts.push(transitLegForAlertsEntry);

      const depDate = td.stopDetails?.departureTime
        ? new Date(td.stopDetails.departureTime)
        : new Date(cursorTime.getTime());
      const arrDate = td.stopDetails?.arrivalTime
        ? new Date(td.stopDetails.arrivalTime)
        : new Date(depDate.getTime() + stepMinutes * 60 * 1000);

      if (!firstTransitDepartureDate) {
        firstTransitDepartureDate = depDate;
      }

      if (!firstHeadwayMinutes && td.headway) {
        const hwSec = parseGoogleDurationSeconds(td.headway);
        if (hwSec > 0) {
          firstHeadwayMinutes = Math.max(1, Math.round(hwSec / 60));
        }
      }

      const directionText = td.headsign
        ? `Direction ${td.headsign}`
        : td.transitLine?.name || `Ligne ${lineShort}`;

      // Double-layer resolution: Layer 1 (Divia line catalog) + Layer 2 (35m spatial polyline matching)
      const intermediateStops = resolveIntermediateStops({
        lineId: lineShort,
        depStopRaw,
        arrStopRaw,
        depDate,
        arrDate,
        stopCount: td.stopCount,
        decodedPolyline: stepPolyline,
        activeControllers,
      });

      const intermediateTransitStops: TransitStop[] = intermediateStops.map(st => ({
        id: st.id,
        name: st.name,
        latitude: st.latitude,
        longitude: st.longitude,
        lines: [lineShort],
      }));

      transitLegForAlertsEntry.stopIds.push(...intermediateStops.map(st => st.id));

      const passedStops: TransitStop[] = [fromStop, ...intermediateTransitStops, toStop];
      const departureTimeText =
        td.localizedValues?.departureTime?.time?.text || formatHHMM(depDate);
      const arrivalTimeText =
        td.localizedValues?.arrivalTime?.time?.text || formatHHMM(arrDate);
      const estimatedStopTimes: string[] = [
        departureTimeText,
        ...intermediateStops.map(st => st.estimatedTime),
        arrivalTimeText,
      ];
      const stopCount =
        typeof td.stopCount === 'number' && td.stopCount > 0
          ? td.stopCount
          : Math.max(1, passedStops.length - 1);

      // Fuse real-time Waze crowd status onto this Google Transit segment
      const segCrowdStatus = reportService.getStationCrowdStatus(
        depStopId,
        lineShort,
        nowDate
      );

      segments.push({
        type: 'TRANSIT',
        instruction: `Prendre le ${vehicleLabel} ${lineShort} (${directionText})`,
        durationSeconds: stepSeconds,
        durationMinutes: stepMinutes,
        distanceMeters: stepDistance,
        polyline:
          stepPolyline.length >= 2
            ? stepPolyline
            : [
                [depLat, depLng],
                [arrLat, arrLng],
              ],
        lineId: lineShort,
        lineName: td.transitLine?.name || `${lineShort} · ${directionText}`,
        lineColor,
        direction: directionText,
        fromStop,
        toStop,
        stopsCount: stopCount,
        passedStops,
        intermediateStops,
        estimatedStopTimes,
        departureTime: departureTimeText,
        arrivalTime: arrivalTimeText,
        crowdStatus: segCrowdStatus,
      });

      cursorTime = arrDate;
    } else {
      // WALK step (or nested WALK sub-steps): accumulate into contiguous WalkBuffer
      if (!walkBuffer) {
        walkBuffer = {
          durationSeconds: 0,
          distanceMeters: 0,
          polyline: [],
          instructions: [],
          startTime: new Date(cursorTime.getTime()),
          precededByTransit: transitLegCount > 0,
        };
      }

      const subSteps =
        step.steps && step.steps.length > 0 ? step.steps : [step];

      for (const sub of subSteps) {
        const subSec = parseGoogleDurationSeconds(sub.staticDuration);
        const subDist = sub.distanceMeters ?? 0;
        const subPoly = sub.polyline?.encodedPolyline
          ? decodeGooglePolyline(sub.polyline.encodedPolyline)
          : [];

        walkBuffer.durationSeconds += subSec;
        walkBuffer.distanceMeters += subDist;
        if (subPoly.length > 0) {
          appendPolylineCoords(walkBuffer.polyline, subPoly);
        }

        const rawInstr = sub.navigationInstruction?.instructions?.trim();
        if (rawInstr) {
          walkBuffer.instructions.push(rawInstr);
        } else if (subDist > 0) {
          walkBuffer.instructions.push(`Marcher sur ${subDist} m`);
        }
      }

      // If parent step had polyline/duration/distance not covered by nested sub-steps
      if (step.steps && step.steps.length > 0 && walkBuffer.polyline.length === 0 && stepPolyline.length > 0) {
        appendPolylineCoords(walkBuffer.polyline, stepPolyline);
      }
    }
  }

  // Flush any trailing WALK segment to final destination
  flushWalkBuffer(undefined);

  const walkingDurationMinutes = Math.round(walkingDurationSeconds / 60);

  // Fallback to overall encoded polyline if step polylines were empty
  const resolvedFullPolyline =
    fullPolyline.length >= 2
      ? fullPolyline
      : googleRoute.polyline?.encodedPolyline
        ? decodeGooglePolyline(googleRoute.polyline.encodedPolyline)
        : [];

  const transfersCount = Math.max(0, transitLegCount - 1);
  const seenAlertIds = new Set<string>();
  const seenPredIds = new Set<string>();
  const matchingAlerts: Report[] = [];
  const predictiveAlerts: PredictiveAlert[] = [];

  for (const transitLeg of transitLegsForAlerts) {
    const legMatch = matchRouteControllerReports({
      linesUsed: [transitLeg.lineId],
      stopIdsUsed: transitLeg.stopIds,
      activeControllers,
      currentTime: nowDate.getTime(),
      transitSegments: [{ lineId: transitLeg.lineId, polyline: transitLeg.polyline }],
    });
    for (const a of legMatch.matchingAlerts) {
      if (!seenAlertIds.has(a.id)) {
        seenAlertIds.add(a.id);
        matchingAlerts.push(a);
      }
    }
    for (const p of legMatch.predictiveAlerts) {
      if (!seenPredIds.has(p.reportId)) {
        seenPredIds.add(p.reportId);
        predictiveAlerts.push(p);
      }
    }
  }
  predictiveAlerts.sort((a, b) => a.etaMinutes - b.etaMinutes);

  // Summarize worst crowd status across all Google Transit legs
  const transitSegsWithCrowd = segments.filter(s => s.type === 'TRANSIT' && s.crowdStatus);
  let routeCrowdStatus: CrowdStatus | undefined;
  let crowdSummary: string | undefined;

  if (transitSegsWithCrowd.length > 0) {
    let worst = transitSegsWithCrowd[0];
    for (const seg of transitSegsWithCrowd) {
      if (
        seg.crowdStatus &&
        worst.crowdStatus &&
        crowdRank(seg.crowdStatus.level) > crowdRank(worst.crowdStatus.level)
      ) {
        worst = seg;
      }
    }
    routeCrowdStatus = worst.crowdStatus;
    const lineId = worst.lineId || 'Divia';
    const vehicleWord = lineId.startsWith('T') ? 'Rame' : 'Bus';
    if (routeCrowdStatus) {
      crowdSummary =
        routeCrowdStatus.level === 'HIGH'
          ? `${vehicleWord} bondé${vehicleWord === 'Rame' ? 'e' : ''} sur ${lineId}`
          : routeCrowdStatus.level === 'MEDIUM'
            ? `${vehicleWord} chargé${vehicleWord === 'Rame' ? 'e' : ''} sur ${lineId}`
            : `Trajet calme sur ${lineId}`;
    }
  }

  const nextDepartureMinutes = firstTransitDepartureDate
    ? Math.max(
        1,
        Math.round((firstTransitDepartureDate.getTime() - nowDate.getTime()) / 60000)
      )
    : 0;

  const arrivalDate = new Date(nowDate.getTime() + totalDurationMinutes * 60 * 1000);
  const summaryLines = linesUsed.length > 0 ? linesUsed.join(' ➜ ') : 'À pied';

  return {
    id: `google-route-${index}-${summaryLines}`,
    title:
      index === 0
        ? `Recommandé · ${summaryLines}`
        : transfersCount === 0 && linesUsed.length > 0
          ? `Direct · ${summaryLines}`
          : `Alternative · ${summaryLines}`,
    departureTime: formatHHMM(firstTransitDepartureDate || nowDate),
    arrivalTime: formatHHMM(arrivalDate),
    totalDurationMinutes,
    walkingDurationMinutes,
    transitDurationMinutes,
    transfersCount,
    headwayMinutes: firstHeadwayMinutes,
    segments,
    steps: mapSegmentsToSteps(segments),
    summary:
      linesUsed.length > 0
        ? `${summaryLines} (${transitDurationMinutes} min en transit)`
        : `À pied direct · ${googleRoute.distanceMeters ?? 0} m`,
    nextDepartureMinutes,
    hasControllerAlert: matchingAlerts.length > 0 || predictiveAlerts.length > 0,
    alerts: matchingAlerts,
    predictiveAlerts,
    crowdStatus: routeCrowdStatus,
    crowdSummary,
    fullPolyline: resolvedFullPolyline,
  };
}

/**
 * Query Google Maps Routes API v2 (TRANSIT) for official Dijon Divia routes
 * Returns null if GOOGLE_MAPS_API_KEY is not configured or API call fails (triggering local fallback).
 */
export async function computeGoogleTransitRoutes(
  query: RouteQuery
): Promise<RouteOption[] | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const now = query.departureTime ? new Date(query.departureTime) : new Date();

  const requestBody = {
    origin: {
      location: {
        latLng: {
          latitude: query.fromLat,
          longitude: query.fromLng,
        },
      },
    },
    destination: {
      location: {
        latLng: {
          latitude: query.toLat,
          longitude: query.toLng,
        },
      },
    },
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: true,
    languageCode: 'fr',
    regionCode: 'FR',
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GOOGLE_ROUTES_TIMEOUT_MS);

    const response = await fetch(GOOGLE_ROUTES_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `[GoogleTransitService] Routes API HTTP ${response.status} — bascule moteur local`
      );
      return null;
    }

    const data = (await response.json()) as GoogleComputeRoutesResponse;
    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const mapped = data.routes
      .map((route, idx) => mapGoogleRouteToRouteOption(route, idx, now))
      .filter((opt): opt is RouteOption => opt !== null);

    return mapped.length > 0 ? mapped : null;
  } catch (error) {
    console.warn('[GoogleTransitService] Erreur appel Google Routes API:', error);
    return null;
  }
}

/**
 * Compute next Wednesday at 10:00 Europe/Paris (09:00 UTC winter / 08:00 UTC summer)
 * so daytime bus lines (B10, B12, B13) & trams always return active Google Transit shapes
 * even when the server boots late at night or on weekends.
 */
export function getNextWednesdayTenAmParisIso(baseDate: Date = new Date()): string {
  const d = new Date(baseDate.getTime());
  // Advance to next Wednesday (day 3) strictly in the future
  const daysUntilWednesday = ((3 - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilWednesday);

  // Determine Paris UTC offset (CET = +1 in Nov..Mar, CEST = +2 in Apr..Oct)
  const month = d.getUTCMonth(); // 0-indexed
  const parisOffsetHours = month >= 3 && month <= 9 ? 2 : 1;
  d.setUTCHours(10 - parisOffsetHours, 0, 0, 0);
  return d.toISOString();
}

export interface GoogleExtractedStopCoord {
  name: string;
  latitude: number;
  longitude: number;
}

export interface GoogleExtractedLineShape {
  polyline: [number, number][];
  googleStops: GoogleExtractedStopCoord[];
}

function doesGoogleTransitLineMatch(
  targetLineId: string,
  nameShort?: string,
  name?: string
): boolean {
  const target = targetLineId.toUpperCase().trim();
  const shortNorm = (nameShort || '').toUpperCase().trim();
  if (shortNorm === target) return true;
  if (/^B\d+$/.test(target) && shortNorm === target.slice(1)) return true;

  const fullNorm = (name || '').toUpperCase().trim();
  if (!fullNorm) return false;

  // Match exact token (e.g. "Bus B12", "Ligne B10", "T1", "Ligne 10") without confusing B1 with B10
  const regex = new RegExp(`(^|[^A-Z0-9])${target}($|[^A-Z0-9])`);
  if (regex.test(fullNorm)) return true;
  if (/^B\d+$/.test(target)) {
    const numericRegex = new RegExp(`(^|[^A-Z0-9])${target.slice(1)}($|[^A-Z0-9])`);
    return numericRegex.test(fullNorm);
  }
  return false;
}

/**
 * Extract the exact official TRANSIT polyline & Google stop coordinates for one chunk
 * between `origin` and `destination`, strictly matching `lineId`.
 */
export async function fetchGoogleTransitLineChunk(
  lineId: string,
  origin: GoogleLatLng,
  destination: GoogleLatLng,
  category: 'TRAM' | 'LIANE' | 'BUS'
): Promise<GoogleExtractedLineShape | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;

  const allowedTravelModes = category === 'TRAM' ? ['LIGHT_RAIL'] : ['BUS'];

  const requestBody = {
    origin: { location: { latLng: origin } },
    destination: { location: { latLng: destination } },
    travelMode: 'TRANSIT',
    computeAlternativeRoutes: true,
    departureTime: getNextWednesdayTenAmParisIso(),
    transitPreferences: {
      allowedTravelModes,
      routingPreference: 'FEWER_TRANSFERS',
    },
    languageCode: 'fr',
    regionCode: 'FR',
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GOOGLE_ROUTES_TIMEOUT_MS);

    const response = await fetch(GOOGLE_ROUTES_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.legs.steps.travelMode,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.transitDetails',
      },
      body: JSON.stringify(requestBody),
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(
        `[GoogleTransitService] Chunk ${lineId} HTTP ${response.status}: ${errText.slice(0, 180)}`
      );
      return null;
    }

    const data = (await response.json()) as GoogleComputeRoutesResponse;
    if (!data.routes || data.routes.length === 0) return null;

    let bestPoly: [number, number][] | null = null;
    let bestStops: GoogleExtractedStopCoord[] = [];

    for (const route of data.routes) {
      const steps = route.legs?.[0]?.steps || [];
      for (const step of steps) {
        if (step.travelMode !== 'TRANSIT' || !step.polyline?.encodedPolyline) continue;

        const matches = doesGoogleTransitLineMatch(
          lineId,
          step.transitDetails?.transitLine?.nameShort,
          step.transitDetails?.transitLine?.name
        );
        if (!matches) continue;

        const decoded = decodeGooglePolyline(step.polyline.encodedPolyline);
        if (decoded.length >= 2 && (!bestPoly || decoded.length > bestPoly.length)) {
          bestPoly = decoded;
          const stopsExtracted: GoogleExtractedStopCoord[] = [];
          const dep = step.transitDetails?.stopDetails?.departureStop;
          const arr = step.transitDetails?.stopDetails?.arrivalStop;
          if (
            dep?.name &&
            dep.location?.latLng?.latitude !== undefined &&
            dep.location?.latLng?.longitude !== undefined
          ) {
            stopsExtracted.push({
              name: dep.name,
              latitude: dep.location.latLng.latitude,
              longitude: dep.location.latLng.longitude,
            });
          }
          if (
            arr?.name &&
            arr.location?.latLng?.latitude !== undefined &&
            arr.location?.latLng?.longitude !== undefined
          ) {
            stopsExtracted.push({
              name: arr.name,
              latitude: arr.location.latLng.latitude,
              longitude: arr.location.latLng.longitude,
            });
          }
          bestStops = stopsExtracted;
        }
      }
    }

    return bestPoly ? { polyline: bestPoly, googleStops: bestStops } : null;
  } catch {
    return null;
  }
}

/**
 * Extract the full street-by-street / rail-by-rail Google Transit polyline for a line
 * by splitting its ordered stops into sub-chunks of 3 to 4 consecutive stops (so Google
 * returns direct B10/B12/B13/L3..L6/T1..T2 segments instead of suggesting downtown transfers).
 */
export async function fetchGoogleTransitLineByChunks(
  lineId: string,
  orderedStops: TransitStop[],
  category: 'TRAM' | 'LIANE' | 'BUS'
): Promise<GoogleExtractedLineShape | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey || orderedStops.length < 2) return null;

  // Build overlapping sub-chunks of 3 stops stride (covering 4 consecutive stops each)
  const chunkRanges: Array<[number, number]> = [];
  const stride = 3;
  let cursor = 0;
  while (cursor < orderedStops.length - 1) {
    const nextIdx = Math.min(cursor + stride, orderedStops.length - 1);
    chunkRanges.push([cursor, nextIdx]);
    cursor = nextIdx;
  }

  const stitchedPolyline: [number, number][] = [];
  const extractedStops: GoogleExtractedStopCoord[] = [];

  for (const [startIdx, endIdx] of chunkRanges) {
    const stopA = orderedStops[startIdx];
    const stopB = orderedStops[endIdx];
    const chunk = await fetchGoogleTransitLineChunk(
      lineId,
      { latitude: stopA.latitude, longitude: stopA.longitude },
      { latitude: stopB.latitude, longitude: stopB.longitude },
      category
    );

    if (chunk && chunk.polyline.length >= 2) {
      appendPolylineCoords(stitchedPolyline, chunk.polyline);
      extractedStops.push(...chunk.googleStops);
    } else if (endIdx - startIdx > 1) {
      // Split failed chunk into smaller pairs to preserve B10/B12/B13 coverage
      for (let k = startIdx; k < endIdx; k++) {
        const subA = orderedStops[k];
        const subB = orderedStops[k + 1];
        const subChunk = await fetchGoogleTransitLineChunk(
          lineId,
          { latitude: subA.latitude, longitude: subA.longitude },
          { latitude: subB.latitude, longitude: subB.longitude },
          category
        );
        if (subChunk && subChunk.polyline.length >= 2) {
          appendPolylineCoords(stitchedPolyline, subChunk.polyline);
          extractedStops.push(...subChunk.googleStops);
        }
      }
    }
  }

  if (stitchedPolyline.length < 6) {
    // Fallback to full terminus-to-terminus single call
    const first = orderedStops[0];
    const last = orderedStops[orderedStops.length - 1];
    return fetchGoogleTransitLineChunk(
      lineId,
      { latitude: first.latitude, longitude: first.longitude },
      { latitude: last.latitude, longitude: last.longitude },
      category
    );
  }

  return {
    polyline: stitchedPolyline,
    googleStops: extractedStops,
  };
}

/**
 * Legacy convenience wrapper returning only the polyline for a line
 */
export async function fetchGoogleTransitLinePolyline(
  lineId: string,
  origin: GoogleLatLng,
  destination: GoogleLatLng,
  category: 'TRAM' | 'LIANE' | 'BUS'
): Promise<[number, number][] | null> {
  const res = await fetchGoogleTransitLineChunk(lineId, origin, destination, category);
  return res ? res.polyline : null;
}
