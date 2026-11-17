import { z } from 'zod';
import { DIJON_LINES } from '../data/dijonNetwork';
import {
  ControllerProgression,
  PredictiveAlert,
  Report,
  TransitLine,
  TransitStop,
  UpcomingStopPrediction,
} from '../types';

export const TRAM_INTERSTATION_MS = 2 * 60 * 1000; // 2 min per stop on T1/T2
export const BUS_INTERSTATION_MS = 105 * 1000; // 1 min 45 s per stop on Lianes/Bus
export const TERMINUS_BUFFER_MS = 3 * 60 * 1000; // +3 min buffer at terminus before auto-removal
export const STATIONARY_TTL_MS = 35 * 60 * 1000; // 35 min for STATIONARY (quai fixe)

export const controllerDirectionSchema = z.object({
  stationId: z.string().min(1).max(64),
  lineId: z.string().min(1).max(16),
  directionTerminus: z.string().min(1).max(128).trim(),
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
 * Pure predictive stop-by-stop controller progression calculator.
 * - STATIONARY: remains anchored on initial station until expiresAt (35 min + upvote extensions)
 * - MOVING: advances stop-by-stop (~2 min Tram / ~1 min 45 Bus) from initial/lastConfirmed stop
 *   to terminus, predicts next 3 upcoming stops with ETAs, and auto-expires 3 min after terminus.
 */
export function computeControllerProgression(
  report: Report,
  currentTime: number = Date.now(),
  lines: TransitLine[] = DIJON_LINES
): ControllerProgression | null {
  if (report.type !== 'CONTROLLER') return null;

  const line = lines.find(l => l.id.toUpperCase() === report.lineId.toUpperCase());
  const directionTerminus = resolveDirectionTerminus(report, line);

  // Stationary / fixed platform control or unknown line
  if (directionTerminus === 'STATIONARY' || !line) {
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
      currentLatitude: report.latitude,
      currentLongitude: report.longitude,
      upcomingStops: [],
      alertPolyline: [],
      estimatedTerminusAt: report.expiresAt,
      isExpired,
      summaryText: `Contrôle fixe à quai · ${report.stopName}`,
    };
  }

  const orderedStops = getOrderedStopsForDirection(line, directionTerminus);
  if (!orderedStops || orderedStops.length < 2) {
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
      currentLatitude: report.latitude,
      currentLongitude: report.longitude,
      upcomingStops: [],
      alertPolyline: [],
      estimatedTerminusAt: report.expiresAt,
      isExpired,
      summaryText: `Contrôle fixe à quai · ${report.stopName}`,
    };
  }

  const anchorStopId = report.lastConfirmedStopId || report.stopId;
  let startIndex = orderedStops.findIndex(s => s.id === anchorStopId);
  if (startIndex === -1) {
    startIndex = orderedStops.findIndex(
      s => normalizeStr(s.name) === normalizeStr(report.stopName)
    );
  }
  if (startIndex === -1) {
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
      currentLatitude: report.latitude,
      currentLongitude: report.longitude,
      upcomingStops: [],
      alertPolyline: [],
      estimatedTerminusAt: report.expiresAt,
      isExpired,
      summaryText: `Contrôle fixe à quai · ${report.stopName}`,
    };
  }

  const endIndex = orderedStops.length - 1;
  const anchorTime = report.lastConfirmedAt ?? report.reportedAt;
  const interstationMs =
    line.category === 'TRAM' ? TRAM_INTERSTATION_MS : BUS_INTERSTATION_MS;

  const elapsedMs = Math.max(0, currentTime - anchorTime);
  const stopsAdvanced = Math.floor(elapsedMs / interstationMs);
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

  // Next up to 3 upcoming stops with exact ETA in minutes
  const upcomingStops: UpcomingStopPrediction[] = [];
  for (let offset = 1; offset <= 3; offset++) {
    const idx = currentStopIndex + offset;
    if (idx > endIndex) break;
    const stop = orderedStops[idx];
    const targetArrivalMs = anchorTime + (idx - startIndex) * interstationMs;
    const etaMinutes = Math.max(1, Math.ceil((targetArrivalMs - currentTime) / 60000));
    upcomingStops.push({
      stationId: stop.id,
      stationName: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      etaMinutes,
    });
  }

  const alertPolyline: [number, number][] = [
    [currentStop.latitude, currentStop.longitude],
    ...upcomingStops.map(u => [u.latitude, u.longitude] as [number, number]),
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
    currentLatitude: currentStop.latitude,
    currentLongitude: currentStop.longitude,
    upcomingStops,
    alertPolyline,
    estimatedTerminusAt,
    isExpired,
    summaryText,
  };
}

/**
 * Compute predictive controller alerts approaching or present at a specific station.
 * Checks both immediate next 3 stops and any downstream stop on the same line until terminus.
 */
export function buildStationPredictiveAlerts(
  stationId: string,
  activeControllers: Report[],
  currentTime: number = Date.now(),
  lines: TransitLine[] = DIJON_LINES
): PredictiveAlert[] {
  const alerts: PredictiveAlert[] = [];

  for (const report of activeControllers) {
    if (report.type !== 'CONTROLLER') continue;
    const prog =
      report.progression || computeControllerProgression(report, currentTime, lines);
    if (!prog || prog.isExpired) continue;

    // 1. Controller currently at this exact station (stationary or passing now)
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

    // 2. Controller heading toward this station along the line
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

      // Check further downstream stops up to terminus
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
 * Compute predictive controller alerts for a planned transit route (matching its lines & stops).
 */
export function buildRoutePredictiveAlerts(
  linesUsed: string[],
  stopIdsUsed: string[],
  activeControllers: Report[],
  currentTime: number = Date.now(),
  lines: TransitLine[] = DIJON_LINES
): PredictiveAlert[] {
  const upperLines = new Set(linesUsed.map(l => l.toUpperCase()));
  const seenReportIds = new Set<string>();
  const alerts: PredictiveAlert[] = [];

  for (const stopId of stopIdsUsed) {
    const stationAlerts = buildStationPredictiveAlerts(
      stopId,
      activeControllers,
      currentTime,
      lines
    );
    for (const alert of stationAlerts) {
      if (
        (upperLines.size === 0 || upperLines.has(alert.lineId.toUpperCase())) &&
        !seenReportIds.has(alert.reportId)
      ) {
        seenReportIds.add(alert.reportId);
        alerts.push(alert);
      }
    }
  }

  return alerts.sort((a, b) => a.etaMinutes - b.etaMinutes);
}
