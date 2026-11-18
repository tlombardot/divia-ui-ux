import { calculateDistanceMeters } from '../data/dijonNetwork';
import { IntermediateStopInfo, Report, RouteOption, RouteSegment } from '../types';

export type TransitIntermediateDisplayMode = 'accordion' | 'none';

export interface TransitIntermediateDisplayModel {
  mode: TransitIntermediateDisplayMode;
  intermediateStops: IntermediateStopInfo[];
  collapsedLabel: string | null;
  expandedLabel: string | null;
}

export interface ExpandedMapStopMarker {
  segmentIndex: number;
  lineColor: string;
  stop: IntermediateStopInfo;
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
 * Extracts real named intermediate stops for a TRANSIT segment, supporting both
 * the structured `segment.intermediateStops` payload and legacy `passedStops`.
 */
export function resolveSegmentIntermediateStops(
  segment: RouteSegment,
  routeAlerts: Report[] = []
): IntermediateStopInfo[] {
  if (segment.intermediateStops && segment.intermediateStops.length > 0) {
    return segment.intermediateStops
      .filter(stop => stop.name.trim().length > 0)
      .map(stop => ({
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
  return passedStops
    .slice(1, -1)
    .filter(stop => stop.name.trim().length > 0)
    .map((stop, idx) => ({
      id: stop.id,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      estimatedTime: stopTimes[idx + 1] || '',
      hasControllerAlert: hasLiveControllerAlertNearStop(stop, segment.lineId, routeAlerts),
    }));
}

/**
 * Computes the UI presentation model for a TRANSIT segment's real intermediate stops.
 * Never produces generic placeholder labels (such as "X arrêts sans correspondance").
 */
export function getTransitIntermediateDisplayModel(
  segment: RouteSegment,
  routeAlerts: Report[] = []
): TransitIntermediateDisplayModel {
  const intermediateStops = resolveSegmentIntermediateStops(segment, routeAlerts);

  if (intermediateStops.length > 0) {
    const count = intermediateStops.length;
    const collapsedLabel =
      count === 1 ? 'Voir 1 arrêt ⌄' : `Voir les ${count} arrêts ⌄`;

    return {
      mode: 'accordion',
      intermediateStops,
      collapsedLabel,
      expandedLabel: 'Masquer les arrêts ⌃',
    };
  }

  return {
    mode: 'none',
    intermediateStops: [],
    collapsedLabel: null,
    expandedLabel: null,
  };
}

/**
 * Computes the list of real intermediate stop markers to display on the map polyline
 * for currently expanded timeline segments.
 */
export function getExpandedIntermediateMapStops(
  route: RouteOption | null | undefined,
  expandedSegmentIndices: number[],
  routeAlerts: Report[] = [],
  resolveColor: (lineId: string) => string = () => '#821245'
): ExpandedMapStopMarker[] {
  if (!route || expandedSegmentIndices.length === 0) {
    return [];
  }

  const expandedSet = new Set(expandedSegmentIndices);
  const markers: ExpandedMapStopMarker[] = [];

  route.segments.forEach((segment, idx) => {
    if (segment.type !== 'TRANSIT' || !expandedSet.has(idx)) {
      return;
    }

    const lineColor = segment.lineColor || resolveColor(segment.lineId || 'T1');
    const stops = resolveSegmentIntermediateStops(segment, routeAlerts);
    for (const stop of stops) {
      markers.push({
        segmentIndex: idx,
        lineColor,
        stop,
      });
    }
  });

  return markers;
}
