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
 * Pure mapper: transforms a Google Routes API v2 route into DiviAkhaaa's RouteOption
 * enriched with real-time Waze controller alerts and crowd status.
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

  let walkingDurationMinutes = 0;
  let transitDurationMinutes = 0;
  let transitLegCount = 0;
  let firstTransitDepartureDate: Date | null = null;
  let firstHeadwayMinutes: number | undefined;
  let cursorTime = new Date(nowDate.getTime());

  for (const step of leg.steps) {
    const stepSeconds = parseGoogleDurationSeconds(step.staticDuration);
    const stepMinutes = Math.max(1, Math.round(stepSeconds / 60));
    const stepDistance = step.distanceMeters ?? 0;
    const stepPolyline = step.polyline?.encodedPolyline
      ? decodeGooglePolyline(step.polyline.encodedPolyline)
      : [];

    if (stepPolyline.length > 0) {
      fullPolyline.push(...stepPolyline);
    }

    if (step.travelMode === 'TRANSIT' && step.transitDetails) {
      transitLegCount += 1;
      transitDurationMinutes += stepMinutes;

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
      // WALK step
      walkingDurationMinutes += stepMinutes;
      const endTime = new Date(cursorTime.getTime() + stepMinutes * 60 * 1000);
      const navText =
        step.navigationInstruction?.instructions ||
        `Marcher sur ${stepDistance} m`;

      segments.push({
        type: 'WALK',
        instruction: navText,
        durationMinutes: stepMinutes,
        distanceMeters: stepDistance,
        polyline: stepPolyline,
        turnInstructions: [navText],
        departureTime: formatHHMM(cursorTime),
        arrivalTime: formatHHMM(endTime),
      });

      cursorTime = endTime;
    }
  }

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
