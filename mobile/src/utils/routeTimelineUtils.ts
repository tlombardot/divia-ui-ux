import { calculateDistanceMeters } from '../data/dijonNetwork';
import { IntermediateStopInfo, Report, RouteSegment } from '../types';

export type TransitIntermediateDisplayMode = 'accordion' | 'fallback_info' | 'direct';

export interface TransitIntermediateDisplayModel {
  mode: TransitIntermediateDisplayMode;
  intermediateStops: IntermediateStopInfo[];
  collapsedLabel: string | null;
  expandedLabel: string | null;
  fallbackLabel: string | null;
}

function hasLiveControllerAlertNearStop(
  stop: Pick<IntermediateStopInfo, 'id' | 'latitude' | 'longitude'>,
  lineId: string | undefined,
  routeAlerts: Report[]
): boolean {
  if (routeAlerts.length === 0) {
    return false;
  }

  const upperLine = (lineId || '').toUpperCase().trim();
  return routeAlerts.some(rep => {
    if (rep.type === 'CROWD') {
      return false;
    }
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
    return upperLine.length > 0 && rep.lineId.toUpperCase().trim() === upperLine && dist <= 180;
  });
}

/**
 * Extracts normalized intermediate stops for a TRANSIT segment, supporting both
 * the structured `segment.intermediateStops` payload and legacy `passedStops` fallback.
 */
export function resolveSegmentIntermediateStops(
  segment: RouteSegment,
  routeAlerts: Report[] = []
): IntermediateStopInfo[] {
  if (segment.intermediateStops && segment.intermediateStops.length > 0) {
    return segment.intermediateStops.map(stop => ({
      ...stop,
      hasControllerAlert:
        stop.hasControllerAlert ||
        hasLiveControllerAlertNearStop(stop, segment.lineId, routeAlerts),
    }));
  }

  const passedStops = segment.passedStops || [];
  if (passedStops.length <= 2) {
    return [];
  }

  const stopTimes = segment.estimatedStopTimes || [];
  return passedStops.slice(1, -1).map((stop, idx) => ({
    id: stop.id,
    name: stop.name,
    latitude: stop.latitude,
    longitude: stop.longitude,
    estimatedTime: stopTimes[idx + 1] || '',
    hasControllerAlert: hasLiveControllerAlertNearStop(stop, segment.lineId, routeAlerts),
  }));
}

/**
 * Computes the UI presentation model for a TRANSIT segment's intermediate stops:
 * - 'accordion': intermediate stops resolved -> show expandable button + full list
 * - 'fallback_info': uncatalogued secondary line with stopCount > 1 -> show clean info row
 * - 'direct': single hop between adjacent stops (no intermediate stations)
 */
export function getTransitIntermediateDisplayModel(
  segment: RouteSegment,
  routeAlerts: Report[] = []
): TransitIntermediateDisplayModel {
  const intermediateStops = resolveSegmentIntermediateStops(segment, routeAlerts);

  if (intermediateStops.length > 0) {
    const count = intermediateStops.length;
    const collapsedLabel =
      count === 1
        ? 'Voir 1 arrêt intermédiaire ⌄'
        : `Voir les ${count} arrêts intermédiaires ⌄`;

    return {
      mode: 'accordion',
      intermediateStops,
      collapsedLabel,
      expandedLabel: 'Masquer les arrêts intermédiaires ⌃',
      fallbackLabel: null,
    };
  }

  const stopCount = segment.stopsCount ?? 0;
  if (stopCount > 1) {
    const intermediateCount = stopCount - 1;
    const fallbackLabel =
      intermediateCount === 1
        ? '1 arrêt sans correspondance'
        : `${intermediateCount} arrêts sans correspondance`;

    return {
      mode: 'fallback_info',
      intermediateStops: [],
      collapsedLabel: null,
      expandedLabel: null,
      fallbackLabel,
    };
  }

  return {
    mode: 'direct',
    intermediateStops: [],
    collapsedLabel: null,
    expandedLabel: null,
    fallbackLabel: null,
  };
}
