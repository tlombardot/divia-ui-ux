import { calculateDistanceMeters, DIJON_LINES } from '../data/dijonNetwork';
import { CreateReportPayload } from '../hooks/useReports';
import { TransitStop } from '../types';

export interface NearestStopResult {
  stop: TransitStop;
  distanceMeters: number;
  formattedDistance: string;
}

export const AKHAAA_REPORT_LABELS = {
  fabLabel: 'AKHAAA',
  fabAccessibilityLabel: 'AKHAAA (signaler un contrôleur)',
  modalKicker: 'DIVIA EN DIRECT · SIGNALER UN CONTRÔLEUR',
  modalTitle: '🚨 AKHAAA (Signaler un contrôleur)',
  ctaTitle: 'AKHAAA (Signaler un contrôleur)',
  ctaSubtitle: '1-Tap immédiat · Diffusion réseau (40 min)',
  successTitle: 'AKHAAA envoyé !',
  stationButtonPrefix: 'AKHAAA',
} as const;

/**
 * Format a distance in meters into human-readable text ("45 m" or "1.2 km")
 */
export function formatStopDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(Math.round(meters / 100) / 10).toFixed(1)} km`;
}

/**
 * Pick the best default line for a stop (T1 > T2 > first stop line > 'ALL')
 */
export function resolveDefaultLineId(stop: TransitStop): string {
  if (!stop.lines || stop.lines.length === 0) {
    return 'ALL';
  }
  if (stop.lines.includes('T1')) {
    return 'T1';
  }
  if (stop.lines.includes('T2')) {
    return 'T2';
  }
  return stop.lines[0];
}

/**
 * Sorts all given stops by Haversine distance from user coordinates, returning the top N
 */
export function getNearestStops(
  userLat: number,
  userLng: number,
  stops: TransitStop[],
  limit: number = 5
): NearestStopResult[] {
  if (!stops || stops.length === 0) {
    return [];
  }

  const computed = stops.map(stop => {
    const dist = calculateDistanceMeters(userLat, userLng, stop.latitude, stop.longitude);
    return {
      stop,
      distanceMeters: dist,
      formattedDistance: formatStopDistance(dist),
    };
  });

  computed.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return computed.slice(0, limit);
}

/**
 * Builds a standard 1-tap controller report payload for the given stop and line
 */
export function buildQuickControllerPayload(
  stop: TransitStop,
  lineId: string,
  description?: string
): CreateReportPayload {
  const lineObj = DIJON_LINES.find(l => l.id === lineId);
  const lineName = lineId === 'ALL' ? 'Toutes lignes' : lineObj?.name || lineId;

  return {
    type: 'CONTROLLER',
    stopId: stop.id,
    stopName: stop.name,
    lineId,
    lineName,
    latitude: stop.latitude,
    longitude: stop.longitude,
    direction: `À quai (fixe) · ${stop.name}`,
    directionTerminus: 'STATIONARY',
    description: description?.trim() || undefined,
  };
}
