import { DIJON_LINES } from '../data/dijonNetwork';
import {
  ControllerProgression,
  PredictiveAlert,
  Report,
  RouteOption,
  TransitLine,
  TransitStop,
  UpcomingStopPrediction,
} from '../types';

const TRAM_INTERSTATION_MS = 2 * 60 * 1000;
const BUS_INTERSTATION_MS = 105 * 1000;
const TERMINUS_BUFFER_MS = 3 * 60 * 1000;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Rule: Even if B10/B12/B13 are unchecked in the global line filter (default = Trams + Lianes),
 * automatically include any line used by the active/selected route so it is always visible on map!
 */
export function computeEffectiveVisibleLineIds(
  visibleLineIds: string[],
  activeRoute?: RouteOption | null
): string[] {
  if (!activeRoute || !activeRoute.segments || activeRoute.segments.length === 0) {
    return visibleLineIds;
  }

  const merged = new Set(visibleLineIds);
  for (const seg of activeRoute.segments) {
    if (seg.type === 'TRANSIT' && seg.lineId) {
      merged.add(seg.lineId.toUpperCase());
    }
  }
  return Array.from(merged);
}

/**
 * Filter all network stations by name or line code (accent-insensitive)
 */
export function filterStationsByQuery(
  stops: TransitStop[],
  query: string
): TransitStop[] {
  const trimmed = query.trim();
  if (!trimmed) return stops;

  const normQ = normalizeText(trimmed);
  return stops.filter(stop => {
    const normName = normalizeText(stop.name);
    return (
      normName.includes(normQ) ||
      stop.lines.some(lineId => normalizeText(lineId).includes(normQ))
    );
  });
}

function getOrderedStops(
  line: TransitLine,
  directionTerminus: string
): TransitStop[] | null {
  if (!directionTerminus || directionTerminus === 'STATIONARY') return null;
  const normTarget = normalizeText(directionTerminus);
  const dirA = line.directionA || line.terminusA;
  const dirB = line.directionB || line.terminusB;

  if (
    normTarget === normalizeText(dirB) ||
    normalizeText(dirB).includes(normTarget) ||
    normTarget.includes(normalizeText(dirB))
  ) {
    return [...line.stops];
  }
  if (
    normTarget === normalizeText(dirA) ||
    normalizeText(dirA).includes(normTarget) ||
    normTarget.includes(normalizeText(dirA))
  ) {
    return [...line.stops].reverse();
  }
  return null;
}

/**
 * Resolve live controller progression (prefers server-computed `report.progression`,
 * falls back cleanly to deterministic client calculation for optimistic/offline reports).
 */
export function resolveControllerProgression(
  report: Report,
  currentTime: number = Date.now(),
  lines: TransitLine[] = DIJON_LINES
): ControllerProgression | null {
  if (report.type && report.type !== 'CONTROLLER') return null;
  if (report.progression) return report.progression;

  const line = lines.find(l => l.id.toUpperCase() === report.lineId.toUpperCase());
  const rawTerminus = report.directionTerminus || '';
  const orderedStops = line ? getOrderedStops(line, rawTerminus) : null;

  if (!line || !orderedStops || rawTerminus === 'STATIONARY') {
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
      isExpired: currentTime >= report.expiresAt,
      summaryText: `Contrôle fixe à quai · ${report.stopName}`,
    };
  }

  const anchorId = report.lastConfirmedStopId || report.stopId;
  const startIndex = orderedStops.findIndex(s => s.id === anchorId);
  if (startIndex === -1) return null;

  const endIndex = orderedStops.length - 1;
  const anchorTime = report.lastConfirmedAt ?? report.reportedAt;
  const interstationMs =
    line.category === 'TRAM' ? TRAM_INTERSTATION_MS : BUS_INTERSTATION_MS;

  const elapsed = Math.max(0, currentTime - anchorTime);
  const currentStopIndex = Math.min(
    startIndex + Math.floor(elapsed / interstationMs),
    endIndex
  );
  const estimatedTerminusAt =
    anchorTime + (endIndex - startIndex) * interstationMs + TERMINUS_BUFFER_MS;
  const isExpired =
    currentTime >= estimatedTerminusAt || currentTime >= report.expiresAt;

  const currentStop = orderedStops[currentStopIndex];
  const upcomingStops: UpcomingStopPrediction[] = [];

  for (let offset = 1; offset <= 3; offset++) {
    const idx = currentStopIndex + offset;
    if (idx > endIndex) break;
    const st = orderedStops[idx];
    const arrivalMs = anchorTime + (idx - startIndex) * interstationMs;
    const etaMinutes = Math.max(1, Math.ceil((arrivalMs - currentTime) / 60000));
    upcomingStops.push({
      stationId: st.id,
      stationName: st.name,
      latitude: st.latitude,
      longitude: st.longitude,
      etaMinutes,
    });
  }

  return {
    mode: 'MOVING',
    directionTerminus: rawTerminus,
    initialStopId: report.stopId,
    initialStopName: report.stopName,
    currentStopId: currentStop.id,
    currentStopName: currentStop.name,
    currentStopIndex,
    endStopIndex: endIndex,
    currentLatitude: currentStop.latitude,
    currentLongitude: currentStop.longitude,
    upcomingStops,
    alertPolyline: [
      [currentStop.latitude, currentStop.longitude],
      ...upcomingStops.map(u => [u.latitude, u.longitude] as [number, number]),
    ],
    estimatedTerminusAt,
    isExpired,
    summaryText:
      currentStop.id === report.stopId
        ? `Signalé à ${report.stopName} · Terminus ${rawTerminus}`
        : `Signalé à ${report.stopName} · Actuellement vers ${currentStop.name} · Terminus ${rawTerminus}`,
  };
}

/**
 * Find approaching or present predictive controller warnings for a station or favorite stop.
 */
export function getApproachingControllerAlertsForStation(
  stationId: string,
  reports: Report[],
  currentTime: number = Date.now(),
  lines: TransitLine[] = DIJON_LINES
): PredictiveAlert[] {
  const alerts: PredictiveAlert[] = [];

  for (const report of reports) {
    if (report.status !== 'active' || (report.type && report.type !== 'CONTROLLER')) {
      continue;
    }

    const prog = resolveControllerProgression(report, currentTime, lines);
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
            ? `⚠️ Contrôleurs à quai sur ${report.lineId} (${prog.currentStopName})`
            : `⚠️ Contrôleurs actuellement sur ${report.lineId} dir. ${prog.directionTerminus}`,
      });
      continue;
    }

    if (prog.mode === 'MOVING') {
      const match = prog.upcomingStops.find(u => u.stationId === stationId);
      if (match) {
        alerts.push({
          reportId: report.id,
          lineId: report.lineId,
          directionTerminus: prog.directionTerminus,
          currentStopName: prog.currentStopName,
          targetStopId: stationId,
          targetStopName: match.stationName,
          etaMinutes: match.etaMinutes,
          message: `⚠️ Contrôleurs en approche sur ${report.lineId} dir. ${prog.directionTerminus} · Dans ~${match.etaMinutes} min`,
        });
        continue;
      }

      // Also check downstream stations beyond the first 3 upcoming stops
      const line = lines.find(l => l.id.toUpperCase() === report.lineId.toUpperCase());
      const orderedStops = line ? getOrderedStops(line, prog.directionTerminus) : null;
      if (line && orderedStops) {
        const targetIdx = orderedStops.findIndex(s => s.id === stationId);
        if (targetIdx > prog.currentStopIndex) {
          const interMs =
            line.category === 'TRAM' ? TRAM_INTERSTATION_MS : BUS_INTERSTATION_MS;
          const etaMinutes = Math.max(
            1,
            Math.round(((targetIdx - prog.currentStopIndex) * interMs) / 60000)
          );
          alerts.push({
            reportId: report.id,
            lineId: report.lineId,
            directionTerminus: prog.directionTerminus,
            currentStopName: prog.currentStopName,
            targetStopId: stationId,
            targetStopName: orderedStops[targetIdx].name,
            etaMinutes,
            message: `⚠️ Contrôleurs en approche sur ${report.lineId} dir. ${prog.directionTerminus} · Dans ~${etaMinutes} min`,
          });
        }
      }
    }
  }

  return alerts.sort((a, b) => a.etaMinutes - b.etaMinutes);
}
