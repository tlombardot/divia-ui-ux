import { describe, expect, it } from 'vitest';
import { Report, RouteSegment } from '../types';
import {
  getTransitIntermediateDisplayModel,
  resolveSegmentIntermediateStops,
} from '../utils/routeTimelineUtils';

describe('RouteTimelineUtils — Intermediate Stops Display & Safety Nets', () => {
  it('returns accordion model with plural label, estimated times and controller badge when intermediateStops are provided', () => {
    const segment: RouteSegment = {
      type: 'TRANSIT',
      instruction: 'Prendre le Tram T1',
      durationMinutes: 12,
      distanceMeters: 2200,
      polyline: [],
      lineId: 'T1',
      stopsCount: 4,
      intermediateStops: [
        {
          id: 't1-foch',
          name: 'Foch Gare',
          latitude: 47.3235,
          longitude: 5.0298,
          estimatedTime: '14:03',
          hasControllerAlert: false,
        },
        {
          id: 'hub-darcy',
          name: 'Darcy',
          latitude: 47.3235,
          longitude: 5.0335,
          estimatedTime: '14:06',
          hasControllerAlert: true,
        },
        {
          id: 'hub-godrans',
          name: 'Godrans Les Halles',
          latitude: 47.3232,
          longitude: 5.0401,
          estimatedTime: '14:09',
          hasControllerAlert: false,
        },
      ],
    };

    const model = getTransitIntermediateDisplayModel(segment, []);
    expect(model.mode).toBe('accordion');
    expect(model.collapsedLabel).toBe('Voir les 3 arrêts intermédiaires ⌄');
    expect(model.expandedLabel).toBe('Masquer les arrêts intermédiaires ⌃');
    expect(model.intermediateStops).toHaveLength(3);
    expect(model.intermediateStops[1].estimatedTime).toBe('14:06');
    expect(model.intermediateStops[1].hasControllerAlert).toBe(true);
  });

  it('extracts intermediate stops from legacy passedStops + estimatedStopTimes and fuses live route alerts', () => {
    const legacySegment: RouteSegment = {
      type: 'TRANSIT',
      instruction: 'Prendre le Tram T1',
      durationMinutes: 8,
      distanceMeters: 1500,
      polyline: [],
      lineId: 'T1',
      stopsCount: 2,
      passedStops: [
        { id: 'hub-darcy', name: 'Darcy', latitude: 47.3235, longitude: 5.0335, lines: ['T1'] },
        { id: 'hub-godrans', name: 'Godrans Les Halles', latitude: 47.3232, longitude: 5.0401, lines: ['T1'] },
        { id: 'hub-republique', name: 'République', latitude: 47.3262, longitude: 5.0461, lines: ['T1'] },
      ],
      estimatedStopTimes: ['14:10', '14:14', '14:18'],
    };

    const liveAlert: Report = {
      id: 'ctrl-1',
      type: 'CONTROLLER',
      stopId: 'hub-godrans',
      stopName: 'Godrans Les Halles',
      lineId: 'T1',
      lineName: 'Tramway T1',
      latitude: 47.3232,
      longitude: 5.0401,
      direction: 'Dir. Quetigny Centre',
      reportedAt: Date.now(),
      expiresAt: Date.now() + 40 * 60 * 1000,
      upvotes: 1,
      downvotes: 0,
      reliabilityScore: 80,
      status: 'active',
    };

    const resolved = resolveSegmentIntermediateStops(legacySegment, [liveAlert]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      id: 'hub-godrans',
      name: 'Godrans Les Halles',
      estimatedTime: '14:14',
      hasControllerAlert: true,
    });

    const model = getTransitIntermediateDisplayModel(legacySegment, [liveAlert]);
    expect(model.mode).toBe('accordion');
    expect(model.collapsedLabel).toBe('Voir 1 arrêt intermédiaire ⌄');
  });

  it('renders safety-net info text when stopCount > 1 on an uncatalogued secondary line', () => {
    const secondarySegment: RouteSegment = {
      type: 'TRANSIT',
      instruction: 'Prendre le Bus B99',
      durationMinutes: 9,
      distanceMeters: 2100,
      polyline: [],
      lineId: 'B99',
      stopsCount: 5,
      intermediateStops: [],
    };

    const model = getTransitIntermediateDisplayModel(secondarySegment, []);
    expect(model.mode).toBe('fallback_info');
    expect(model.fallbackLabel).toBe('4 arrêts sans correspondance');
    expect(model.intermediateStops).toEqual([]);
  });

  it('returns direct mode for a single hop between adjacent stops', () => {
    const directSegment: RouteSegment = {
      type: 'TRANSIT',
      instruction: 'Prendre le Tram T1',
      durationMinutes: 2,
      distanceMeters: 450,
      polyline: [],
      lineId: 'T1',
      stopsCount: 1,
      intermediateStops: [],
    };

    const model = getTransitIntermediateDisplayModel(directSegment, []);
    expect(model.mode).toBe('direct');
    expect(model.fallbackLabel).toBeNull();
  });
});
