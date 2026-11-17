import { describe, expect, it } from 'vitest';
import { DEFAULT_VISIBLE_LINE_IDS } from '../hooks/useLineFilter';
import { EXPECTED_NETWORK_SHAPES_VERSION } from '../hooks/useNetworkShapes';
import { RouteSegment } from '../types';
import { buildMergedSummaryPills } from '../utils/routeSummaryUtils';

describe('Route Summary Pills & Permanent Tram Line Configuration', () => {
  it('merges consecutive WALK segments into one clean pill and omits < 20m same-platform transfers', () => {
    const segments: RouteSegment[] = [
      {
        type: 'WALK',
        instruction: 'Prendre Avenue Foch',
        durationSeconds: 40,
        durationMinutes: 1,
        distanceMeters: 50,
        polyline: [],
      },
      {
        type: 'WALK',
        instruction: 'Tourner Rue de la Poste',
        durationSeconds: 50,
        durationMinutes: 1,
        distanceMeters: 65,
        polyline: [],
      },
      {
        type: 'WALK',
        instruction: 'Continuer vers Darcy',
        durationSeconds: 90,
        durationMinutes: 2,
        distanceMeters: 115,
        polyline: [],
      },
      {
        type: 'TRANSIT',
        instruction: 'Prendre T1',
        durationMinutes: 7,
        distanceMeters: 1500,
        lineId: 'T1',
        lineColor: '#E11535',
        polyline: [],
      },
      {
        type: 'WALK',
        instruction: 'Changer sur le même quai',
        durationSeconds: 10,
        durationMinutes: 1,
        distanceMeters: 12,
        polyline: [],
      },
      {
        type: 'TRANSIT',
        instruction: 'Prendre T2',
        durationMinutes: 9,
        distanceMeters: 2800,
        lineId: 'T2',
        lineColor: '#4B2982',
        polyline: [],
      },
      {
        type: 'WALK',
        instruction: 'Marcher jusqu\'à destination',
        durationSeconds: 120,
        durationMinutes: 2,
        distanceMeters: 150,
        polyline: [],
      },
    ];

    const pills = buildMergedSummaryPills(segments);

    expect(pills.map(p => p.kind)).toEqual(['WALK', 'TRANSIT', 'TRANSIT', 'WALK']);
    expect(pills[0].durationMinutes).toBe(3);
    expect(pills[0].distanceMeters).toBe(230);
    expect(pills[1].lineId).toBe('T1');
    expect(pills[2].lineId).toBe('T2');
    expect(pills[3].durationMinutes).toBe(2);
  });

  it('keeps T1 and T2 enabled by default on the map and syncs shapes cache v5', () => {
    expect(DEFAULT_VISIBLE_LINE_IDS).toContain('T1');
    expect(DEFAULT_VISIBLE_LINE_IDS).toContain('T2');
    expect(EXPECTED_NETWORK_SHAPES_VERSION).toBe(5);
  });
});
