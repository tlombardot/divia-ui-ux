import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  DIJON_LINES,
} from '../data/dijonNetwork';
import {
  CrowdLevel,
  CrowdStatus,
  Report,
  RouteOption,
  RouteQuery,
  RouteSegment,
  RouteStep,
  TransitStop,
} from '../types';
import { reportService } from './reportService';

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

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function resolveDiviaLineColor(lineShortName: string, googleColor?: string): string {
  const normalized = lineShortName.toUpperCase().trim();
  const known = DIJON_LINES.find(l => l.id === normalized);
  if (known) return known.color;
  if (googleColor && /^#[0-9A-Fa-f]{6}$/.test(googleColor)) {
    return googleColor;
  }
  return '#821245';
}

function resolveLocalStopId(stopName: string, lat: number, lng: number): string {
  const norm = normalizeText(stopName);
  const byName = ALL_DIJON_STOPS.find(
    s => normalizeText(s.name) === norm || normalizeText(s.name).includes(norm) || norm.includes(normalizeText(s.name))
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
 * Match active Waze CONTROLLER reports against a Google Transit route's lines & stops
 */
function matchWazeControllerReports(
  linesUsed: string[],
  stopIdsUsed: string[],
  transitPoints: [number, number][]
): Report[] {
  const activeControllers = reportService.getActiveControllerReports();
  const upperLines = new Set(linesUsed.map(l => l.toUpperCase()));
  const stopIdSet = new Set(stopIdsUsed);

  return activeControllers.filter(rep => {
    if (upperLines.has(rep.lineId.toUpperCase())) return true;
    if (stopIdSet.has(rep.stopId)) return true;
    return transitPoints.some(
      ([lat, lon]) => calculateDistanceMeters(lat, lon, rep.latitude, rep.longitude) <= 180
    );
  });
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
  const stopIdsUsed: string[] = [];
  const transitAnchorPoints: [number, number][] = [];

  let walkingDurationSeconds = 0;
  let transitDurationMinutes = 0;
  let transitLegCount = 0;
  let firstTransitDepartureDate: Date | null = null;
  let firstHeadwayMinutes: number | undefined;
  let cursorTime = new Date(nowDate.getTime());

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

      const lineShort = (
        td.transitLine?.nameShort ||
        td.transitLine?.name ||
        'DIVIA'
      )
        .toUpperCase()
        .trim();
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

      linesUsed.push(lineShort);
      stopIdsUsed.push(depStopId, arrStopId);
      transitAnchorPoints.push([depLat, depLng], [arrLat, arrLng]);

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
      const stopCount = Math.max(1, td.stopCount ?? 2);

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
        passedStops: [fromStop, toStop],
        estimatedStopTimes: [formatHHMM(depDate), formatHHMM(arrDate)],
        departureTime:
          td.localizedValues?.departureTime?.time?.text || formatHHMM(depDate),
        arrivalTime:
          td.localizedValues?.arrivalTime?.time?.text || formatHHMM(arrDate),
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
  const matchingAlerts = matchWazeControllerReports(
    linesUsed,
    stopIdsUsed,
    transitAnchorPoints
  );

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
    hasControllerAlert: matchingAlerts.length > 0,
    alerts: matchingAlerts,
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

/**
 * Extract the exact official TRANSIT polyline for a single Divia line (e.g. T1, T2, L5, B10, B12, B13)
 * by issuing one Google Routes API TRANSIT request between its termini at Wednesday 10:00 Paris time.
 */
export async function fetchGoogleTransitLinePolyline(
  lineId: string,
  origin: GoogleLatLng,
  destination: GoogleLatLng,
  category: 'TRAM' | 'LIANE' | 'BUS'
): Promise<[number, number][] | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;

  const targetLine = lineId.toUpperCase().trim();
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
          'routes.legs.steps.travelMode,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.transitDetails.transitLine',
      },
      body: JSON.stringify(requestBody),
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const data = (await response.json()) as GoogleComputeRoutesResponse;
    if (!data.routes || data.routes.length === 0) return null;

    let bestPolyline: [number, number][] | null = null;

    for (const route of data.routes) {
      const steps = route.legs?.[0]?.steps || [];
      for (const step of steps) {
        if (step.travelMode !== 'TRANSIT' || !step.polyline?.encodedPolyline) continue;
        const shortName = (
          step.transitDetails?.transitLine?.nameShort ||
          step.transitDetails?.transitLine?.name ||
          ''
        )
          .toUpperCase()
          .trim();

        if (shortName === targetLine || shortName.endsWith(targetLine)) {
          const decoded = decodeGooglePolyline(step.polyline.encodedPolyline);
          if (decoded.length >= 6 && (!bestPolyline || decoded.length > bestPolyline.length)) {
            bestPolyline = decoded;
          }
        }
      }
    }

    return bestPolyline;
  } catch {
    return null;
  }
}
