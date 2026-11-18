import { z } from 'zod';
import { calculateDistanceMeters, DIJON_LINES } from '../data/dijonNetwork';
import {
  ControllerProgression,
  PredictiveAlert,
  Report,
  TransitLine,
  TransitStop,
  UpcomingStopPrediction,
} from '../types';
import {
  interpolateAlongPolyline,
  LatLng,
  slicePolylineByDistances,
  snapPointToPolyline,
} from '../utils/geometryTopology';
import { networkGeometryService } from './networkGeometryService';

export const TRAM_INTERSTATION_MS = 2 * 60 * 1000; // 2 min per stop on T1/T2
export const BUS_INTERSTATION_MS = 105 * 1000; // 1 min 45 s per stop on Lianes/Bus
export const TERMINUS_BUFFER_MS = 3 * 60 * 1000; // +3 min buffer at terminus before auto-removal
export const STATIONARY_TTL_MS = 35 * 60 * 1000; // 35 min for STATIONARY (quai fixe)

export const controllerDirectionSchema = z.object({
  stationId: z.string().min(1).max(64),
  lineId: z.string().min(1).max(16),
  directionTerminus: z.string().min(1).max(128).trim(),
});

export const controllerBroadcastSchema = z.object({
  latitude: z.number().min(47.08).max(47.56),
  longitude: z.number().min(4.70).max(5.38),
  snappedToLine: z.boolean(),
  lineId: z.string().min(1).max(16),
  currentStationName: z.string().min(1).max(128),
  upcomingStops: z.array(
    z.object({
      stationId: z.string(),
      stationName: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      etaMinutes: z.number().int().min(0),
    })
  ),
});

function normalizeStr(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve normalized directionTerminus from report fields & line definition:
 * returns 'STATIONARY' for fixed platform controls, or exact terminus name for moving controls.
 */
export function resolveDirectionTerminus(
  report: Pick<Report, 'lineId' | 'direction' | 'directionTerminus'>,
  line?: TransitLine
): string {
  const explicit = report.directionTerminus?.trim();
  if (explicit) {
    if (normalizeStr(explicit) === 'stationary') return 'STATIONARY';
    return explicit;
  }

  const rawDir = (report.direction || '').trim();
  const normDir = normalizeStr(rawDir);

  if (
    !rawDir ||
    normDir.includes('stationary') ||
    normDir.includes('aquai') ||
    normDir.includes('stationquai') ||
    normDir.includes('fixe') ||
    normDir === 'quai'
  ) {
    return 'STATIONARY';
  }

  if (line) {
    const dirA = line.directionA || line.terminusA;
    const dirB = line.directionB || line.terminusB;
    const normA = normalizeStr(dirA);
    const normB = normalizeStr(dirB);

    if (normDir.includes(normB)) return dirB;
    if (normDir.includes(normA)) return dirA;
  }

  return 'STATIONARY';
}

/**
 * Get the ordered stops sequence along a line heading toward `directionTerminus`
 */
export function getOrderedStopsForDirection(
  line: TransitLine,
  directionTerminus: string
): TransitStop[] | null {
  if (directionTerminus === 'STATIONARY' || line.stops.length < 2) return null;

  const normTarget = normalizeStr(directionTerminus);
  const dirA = line.directionA || line.terminusA;
  const dirB = line.directionB || line.terminusB;

  if (
    normTarget === normalizeStr(dirB) ||
    normalizeStr(dirB).includes(normTarget) ||
    normTarget.includes(normalizeStr(dirB))
  ) {
    return [...line.stops];
  }

  if (
    normTarget === normalizeStr(dirA) ||
    normalizeStr(dirA).includes(normTarget) ||
    normTarget.includes(normalizeStr(dirA))
  ) {
    return [...line.stops].reverse();
  }

  return null;
}

/**
 * Resolve exact snapped coordinate and cumulative distance of a stop on a line's polyline
 */
function resolveStopOnLinePolyline(
  stop: Pick<TransitStop, 'latitude' | 'longitude' | 'distanceAlongLineMeters'>,
  polyline: LatLng[]
): { latitude: number; longitude: number; distanceAlongLineMeters: number; snapped: boolean } {
  if (polyline.length < 2) {
    return {
      latitude: stop.latitude,
      longitude: stop.longitude,
      distanceAlongLineMeters: stop.distanceAlongLineMeters ?? 0,
      snapped: false,
    };
  }

  const proj = snapPointToPolyline([stop.latitude, stop.longitude], polyline);
  return {
    latitude: proj.projected[0],
    longitude: proj.projected[1],
    distanceAlongLineMeters:
      stop.distanceAlongLineMeters !== undefined
        ? stop.distanceAlongLineMeters
        : proj.distanceAlongLineMeters,
    snapped: true,
  };
}

/**
 * Resolve exact geometric coordinates of a controller directly ON the line's polyline
 * (both STATIONARY at a station and MOVING interpolated smoothly along polyline vertices).
 */
export function resolveControllerCoordinates(
  line: TransitLine | undefined,
  stopCoord: LatLng,
  options?: {
    targetDistanceAlongLineMeters?: number;
  }
): {
  latitude: number;
  longitude: number;
  distanceAlongLineMeters: number;
  snappedToLine: boolean;
} {
  if (!line || line.polyline.length < 2) {
    return {
      latitude: stopCoord[0],
      longitude: stopCoord[1],
      distanceAlongLineMeters: 0,
      snappedToLine: false,
    };
  }

  if (options?.targetDistanceAlongLineMeters !== undefined) {
    const interpolated = interpolateAlongPolyline(
      line.polyline,
      options.targetDistanceAlongLineMeters
    );
    return {
      latitude: interpolated[0],
      longitude: interpolated[1],
      distanceAlongLineMeters: Math.round(options.targetDistanceAlongLineMeters),
      snappedToLine: true,
    };
  }

  const snapped = snapPointToPolyline(stopCoord, line.polyline);
  return {
    latitude: snapped.projected[0],
    longitude: snapped.projected[1],
    distanceAlongLineMeters: snapped.distanceAlongLineMeters,
    snappedToLine: true,
  };
}

/**
 * Pure predictive stop-by-stop controller progression calculator with mandatory polyline snapping:
 * - STATIONARY: orthogonally snapped onto `lineId`'s polyline at `stationId` (0m offset)
 * - MOVING: smoothly interpolated along `lineId`'s Google/official polyline vertices
 *   between `startStation.distanceAlongLineMeters` and `terminus.distanceAlongLineMeters`,
 *   with curve-hugging `alertPolyline` and auto-expiry 3 min after terminus.
 */
export function computeControllerProgression(
  report: Report,
  currentTime: number = Date.now(),
  lines: TransitLine[] = networkGeometryService.getCachedLinesSync()
): ControllerProgression | null {
  if (report.type !== 'CONTROLLER') return null;

  const activeLines = lines.length > 0 ? lines : DIJON_LINES;
  const line = activeLines.find(
    l => l.id.toUpperCase() === report.lineId.toUpperCase()
  );
  const directionTerminus = resolveDirectionTerminus(report, line);

  const buildStationaryProgression = (): ControllerProgression => {
    const lineStop = line?.stops.find(
      s =>
        s.id === report.stopId ||
        normalizeStr(s.name) === normalizeStr(report.stopName)
    );
    const anchorCoord: LatLng = lineStop
      ? [lineStop.latitude, lineStop.longitude]
      : [report.latitude, report.longitude];
    const resolved = resolveControllerCoordinates(line, anchorCoord);
    const isExpired = currentTime >= report.expiresAt || report.status !== 'active';

    return {
      mode: 'STATIONARY',
      directionTerminus: 'STATIONARY',
      initialStopId: report.stopId,
      initialStopName: report.stopName,
      currentStopId: report.stopId,
      currentStopName: report.stopName,
      currentStopIndex: 0,
      endStopIndex: 0,
      currentLatitude: resolved.latitude,
      currentLongitude: resolved.longitude,
      distanceAlongLineMeters: resolved.distanceAlongLineMeters,
      snappedToLine: resolved.snappedToLine,
      upcomingStops: [],
      alertPolyline: [],
      estimatedTerminusAt: report.expiresAt,
      isExpired,
      summaryText: `Contrôle fixe à quai · ${report.stopName}`,
    };
  };

  if (directionTerminus === 'STATIONARY' || !line) {
    return buildStationaryProgression();
  }

  const orderedStops = getOrderedStopsForDirection(line, directionTerminus);
  if (!orderedStops || orderedStops.length < 2) {
    return buildStationaryProgression();
  }

  const anchorStopId = report.lastConfirmedStopId || report.stopId;
  let startIndex = orderedStops.findIndex(s => s.id === anchorStopId);
  if (startIndex === -1) {
    startIndex = orderedStops.findIndex(
      s => normalizeStr(s.name) === normalizeStr(report.stopName)
    );
  }
  if (startIndex === -1) {
    return buildStationaryProgression();
  }

  const endIndex = orderedStops.length - 1;
  const anchorTime = report.lastConfirmedAt ?? report.reportedAt;
  const interstationMs =
    line.category === 'TRAM' ? TRAM_INTERSTATION_MS : BUS_INTERSTATION_MS;

  const elapsedMs = Math.max(0, currentTime - anchorTime);
  const exactStopsFloat = elapsedMs / interstationMs;
  const stopsAdvanced = Math.floor(exactStopsFloat);
  const currentStopIndex = Math.min(startIndex + stopsAdvanced, endIndex);
  const remainingStopsFromAnchor = Math.max(0, endIndex - startIndex);

  const estimatedTerminusAt =
    anchorTime + remainingStopsFromAnchor * interstationMs + TERMINUS_BUFFER_MS;

  // Automatic removal once terminus reached (+ 3 min buffer) OR hard TTL cap hit
  const isExpired =
    currentTime >= estimatedTerminusAt ||
    currentTime >= report.expiresAt ||
    report.status !== 'active';

  const currentStop = orderedStops[currentStopIndex];
  const currentStopOnLine = resolveStopOnLinePolyline(currentStop, line.polyline);

  // Smoothly interpolate coordinates directly along the line's polyline vertices!
  let targetDistanceAlongLine = currentStopOnLine.distanceAlongLineMeters;
  if (currentStopIndex < endIndex) {
    const nextStop = orderedStops[currentStopIndex + 1];
    const nextStopOnLine = resolveStopOnLinePolyline(nextStop, line.polyline);
    const fractionalProgress = Math.max(0, Math.min(1, exactStopsFloat - stopsAdvanced));
    targetDistanceAlongLine =
      currentStopOnLine.distanceAlongLineMeters +
      (nextStopOnLine.distanceAlongLineMeters - currentStopOnLine.distanceAlongLineMeters) *
        fractionalProgress;
  }

  const liveCoords = resolveControllerCoordinates(
    line,
    [currentStop.latitude, currentStop.longitude],
    line.polyline.length >= 2
      ? { targetDistanceAlongLineMeters: targetDistanceAlongLine }
      : undefined
  );

  // Next up to 3 upcoming stops (with snapped coordinates on the line) + exact ETA
  const upcomingStops: UpcomingStopPrediction[] = [];
  let lastUpcomingDist = liveCoords.distanceAlongLineMeters;

  for (let offset = 1; offset <= 3; offset++) {
    const idx = currentStopIndex + offset;
    if (idx > endIndex) break;
    const stop = orderedStops[idx];
    const snappedStop = resolveStopOnLinePolyline(stop, line.polyline);
    const targetArrivalMs = anchorTime + (idx - startIndex) * interstationMs;
    const etaMinutes = Math.max(1, Math.ceil((targetArrivalMs - currentTime) / 60000));
    lastUpcomingDist = snappedStop.distanceAlongLineMeters;
    upcomingStops.push({
      stationId: stop.id,
      stationName: stop.name,
      latitude: snappedStop.latitude,
      longitude: snappedStop.longitude,
      etaMinutes,
    });
  }

  // Curve-hugging alert halo sliced directly along the line's real polyline!
  const alertPolyline: LatLng[] =
    line.polyline.length >= 2 && upcomingStops.length > 0
      ? slicePolylineByDistances(
          line.polyline,
          liveCoords.distanceAlongLineMeters,
          lastUpcomingDist
        )
      : [
          [liveCoords.latitude, liveCoords.longitude],
          ...upcomingStops.map(u => [u.latitude, u.longitude] as LatLng),
        ];

  const summaryText =
    currentStop.id === report.stopId
      ? `Signalé à ${report.stopName} · Terminus ${directionTerminus}`
      : `Signalé à ${report.stopName} · Actuellement vers ${currentStop.name} · Terminus ${directionTerminus}`;

  return {
    mode: 'MOVING',
    directionTerminus,
    initialStopId: report.stopId,
    initialStopName: report.stopName,
    currentStopId: currentStop.id,
    currentStopName: currentStop.name,
    currentStopIndex,
    endStopIndex: endIndex,
    currentLatitude: liveCoords.latitude,
    currentLongitude: liveCoords.longitude,
    distanceAlongLineMeters: liveCoords.distanceAlongLineMeters,
    snappedToLine: liveCoords.snappedToLine,
    upcomingStops,
    alertPolyline,
    estimatedTerminusAt,
    isExpired,
    summaryText,
  };
}

/**
 * Compute predictive controller alerts approaching or present at a specific station.
 */
export function buildStationPredictiveAlerts(
  stationId: string,
  activeControllers: Report[],
  currentTime: number = Date.now(),
  lines: TransitLine[] = networkGeometryService.getCachedLinesSync()
): PredictiveAlert[] {
  const alerts: PredictiveAlert[] = [];

  for (const report of activeControllers) {
    if (report.type !== 'CONTROLLER') continue;
    const prog =
      report.progression || computeControllerProgression(report, currentTime, lines);
    if (!prog || prog.isExpired) continue;

    if (prog.currentStopId === stationId) {
      alerts.push({
        reportId: report.id,
        lineId: report.lineId,
        directionTerminus: prog.directionTerminus,
        currentStopName: prog.currentStopName,
        targetStopId: stationId,
        targetStopName: prog.currentStopName,
        etaMinutes: 0,
        message:
          prog.mode === 'STATIONARY'
            ? `⚠️ Contrôleurs fixes à quai (${report.lineId}) à ${prog.currentStopName}`
            : `⚠️ Contrôleurs dans ce ${report.lineId} dir. ${prog.directionTerminus} — Actuellement à ${prog.currentStopName}`,
      });
      continue;
    }

    if (prog.mode === 'MOVING') {
      const upcomingMatch = prog.upcomingStops.find(u => u.stationId === stationId);
      if (upcomingMatch) {
        alerts.push({
          reportId: report.id,
          lineId: report.lineId,
          directionTerminus: prog.directionTerminus,
          currentStopName: prog.currentStopName,
          targetStopId: stationId,
          targetStopName: upcomingMatch.stationName,
          etaMinutes: upcomingMatch.etaMinutes,
          message: `⚠️ Contrôleurs dans ce ${report.lineId} dir. ${prog.directionTerminus} — Arrivée estimée ici dans ${upcomingMatch.etaMinutes} min`,
        });
        continue;
      }

      const line = lines.find(l => l.id.toUpperCase() === report.lineId.toUpperCase());
      if (!line) continue;
      const orderedStops = getOrderedStopsForDirection(line, prog.directionTerminus);
      if (!orderedStops) continue;
      const targetIdx = orderedStops.findIndex(s => s.id === stationId);
      if (targetIdx > prog.currentStopIndex) {
        const interstationMs =
          line.category === 'TRAM' ? TRAM_INTERSTATION_MS : BUS_INTERSTATION_MS;
        const stopsAway = targetIdx - prog.currentStopIndex;
        const etaMinutes = Math.max(1, Math.round((stopsAway * interstationMs) / 60000));
        const targetStop = orderedStops[targetIdx];

        alerts.push({
          reportId: report.id,
          lineId: report.lineId,
          directionTerminus: prog.directionTerminus,
          currentStopName: prog.currentStopName,
          targetStopId: stationId,
          targetStopName: targetStop.name,
          etaMinutes,
          message: `⚠️ Contrôleurs dans ce ${report.lineId} dir. ${prog.directionTerminus} — Arrivée estimée ici dans ${etaMinutes} min`,
        });
      }
    }
  }

  return alerts.sort((a, b) => a.etaMinutes - b.etaMinutes);
}

/**
 * Check whether the ordered stops of a route travel in the opposite direction
 * of a MOVING controller along its line.
 */
function isOppositeDirectionOnLine(
  stopIdsUsed: string[],
  line: TransitLine | undefined,
  directionTerminus: string
): boolean {
  if (!line || directionTerminus === 'STATIONARY') return false;
  const orderedStops = getOrderedStopsForDirection(line, directionTerminus);
  if (!orderedStops) return false;

  const matchedIndices = stopIdsUsed
    .map(id => orderedStops.findIndex(s => s.id === id))
    .filter(idx => idx !== -1);

  if (matchedIndices.length < 2) return false;
  return matchedIndices[matchedIndices.length - 1] < matchedIndices[0];
}

/**
 * Compute predictive controller alerts for a planned transit route (matching its lines, stops & direction).
 */
export function buildRoutePredictiveAlerts(
  linesUsed: string[],
  stopIdsUsed: string[],
  activeControllers: Report[],
  currentTime: number = Date.now(),
  lines: TransitLine[] = networkGeometryService.getCachedLinesSync()
): PredictiveAlert[] {
  if (linesUsed.length === 0 || stopIdsUsed.length === 0) {
    return [];
  }

  const upperLines = new Set(linesUsed.map(l => l.toUpperCase()));
  const seenReportIds = new Set<string>();
  const alerts: PredictiveAlert[] = [];

  // Filter out moving controllers traveling in the opposite direction of this route
  const compatibleControllers = activeControllers.filter(report => {
    if (report.type !== 'CONTROLLER') return false;
    const repLine = (report.lineId || 'ALL').toUpperCase();
    if (repLine !== 'ALL' && !upperLines.has(repLine)) return false;

    const prog =
      report.progression || computeControllerProgression(report, currentTime, lines);
    if (!prog || prog.isExpired) return false;

    if (prog.mode === 'MOVING') {
      const line = lines.find(l => l.id.toUpperCase() === repLine);
      if (isOppositeDirectionOnLine(stopIdsUsed, line, prog.directionTerminus)) {
        return false;
      }
    }
    return true;
  });

  for (const stopId of stopIdsUsed) {
    const stationAlerts = buildStationPredictiveAlerts(
      stopId,
      compatibleControllers,
      currentTime,
      lines
    );
    for (const alert of stationAlerts) {
      const alertLine = (alert.lineId || 'ALL').toUpperCase();
      if (
        (alertLine === 'ALL' || upperLines.has(alertLine)) &&
        !seenReportIds.has(alert.reportId)
      ) {
        seenReportIds.add(alert.reportId);
        alerts.push(alert);
      }
    }
  }

  return alerts.sort((a, b) => a.etaMinutes - b.etaMinutes);
}

export interface RouteSegmentTrack {
  lineId: string;
  polyline: [number, number][];
}

export interface MatchRouteControllersInput {
  linesUsed: string[];
  stopIdsUsed: string[];
  activeControllers: Report[];
  currentTime?: number;
  lines?: TransitLine[];
  transitSegments?: RouteSegmentTrack[];
}

export interface MatchRouteControllersResult {
  matchingAlerts: Report[];
  predictiveAlerts: PredictiveAlert[];
}

/**
 * Strictly match active CONTROLLER reports to a specific transit route:
 * - Never matches walk-only routes (linesUsed empty)
 * - Requires line compatibility (exact line match OR report lineId === 'ALL')
 * - Requires spatial/trajectory relevance (current stop or approaching stop on this route,
 *   same direction for moving reports, or within 120m of a same-line transit segment)
 */
export function matchRouteControllerReports({
  linesUsed,
  stopIdsUsed,
  activeControllers,
  currentTime = Date.now(),
  lines = networkGeometryService.getCachedLinesSync(),
  transitSegments = [],
}: MatchRouteControllersInput): MatchRouteControllersResult {
  if (linesUsed.length === 0 || activeControllers.length === 0) {
    return { matchingAlerts: [], predictiveAlerts: [] };
  }

  const upperLines = new Set(linesUsed.map(l => l.toUpperCase()));
  const stopIdSet = new Set(stopIdsUsed);

  const predictiveAlerts = buildRoutePredictiveAlerts(
    linesUsed,
    stopIdsUsed,
    activeControllers,
    currentTime,
    lines
  );
  const predictiveReportIds = new Set(predictiveAlerts.map(a => a.reportId));

  const matchingAlerts = activeControllers.filter(rep => {
    if (rep.type !== 'CONTROLLER') return false;

    const repLine = (rep.lineId || 'ALL').toUpperCase();
    const lineMatches = repLine === 'ALL' || upperLines.has(repLine);
    if (!lineMatches) return false;

    const prog =
      rep.progression || computeControllerProgression(rep, currentTime, lines);
    if (prog?.isExpired) return false;

    if (prog?.mode === 'MOVING') {
      const line = lines.find(l => l.id.toUpperCase() === repLine);
      if (isOppositeDirectionOnLine(stopIdsUsed, line, prog.directionTerminus)) {
        return false;
      }
    }

    if (predictiveReportIds.has(rep.id)) {
      return true;
    }

    const currentStopId = prog?.currentStopId || rep.stopId;
    if (stopIdSet.has(currentStopId)) {
      return true;
    }

    if (
      prog?.mode === 'MOVING' &&
      prog.upcomingStops.some(u => stopIdSet.has(u.stationId))
    ) {
      return true;
    }

    // Fallback for Google Transit routes whose intermediate stops may not have local IDs:
    // check proximity strictly against same-line transit segment polylines
    const liveLat = prog?.currentLatitude ?? rep.latitude;
    const liveLng = prog?.currentLongitude ?? rep.longitude;

    return transitSegments.some(seg => {
      const segLine = seg.lineId.toUpperCase();
      if (repLine !== 'ALL' && segLine !== repLine) return false;
      return seg.polyline.some(
        ([lat, lon]) => calculateDistanceMeters(lat, lon, liveLat, liveLng) <= 120
      );
    });
  });

  return { matchingAlerts, predictiveAlerts };
}
