import { describe, expect, it } from 'vitest';
import { ALL_DIJON_STOPS } from '../data/dijonNetwork';
import { DEFAULT_VISIBLE_LINE_IDS } from '../hooks/useLineFilter';
import { Report, RouteOption } from '../types';
import {
  computeEffectiveVisibleLineIds,
  filterStationsByQuery,
  getApproachingControllerAlertsForStation,
} from '../utils/controllerTrackingUtils';

describe('Mobile Predictive Controller Alerts & Auto-Visible Bus Routes', () => {
  it('auto-displays B10/B12/B13 on map when an active route uses them even if unchecked in global filter', () => {
    // Default filter enables Trams + Lianes (B10/B12/B13 unchecked)
    expect(DEFAULT_VISIBLE_LINE_IDS).not.toContain('B12');
    expect(DEFAULT_VISIBLE_LINE_IDS).not.toContain('B10');

    const busRoute: RouteOption = {
      id: 'route-b12',
      title: 'Direct B12',
      departureTime: '10:00',
      arrivalTime: '10:14',
      totalDurationMinutes: 14,
      walkingDurationMinutes: 3,
      transitDurationMinutes: 11,
      transfersCount: 0,
      summary: 'B12',
      nextDepartureMinutes: 4,
      hasControllerAlert: false,
      alerts: [],
      fullPolyline: [],
      steps: [],
      segments: [
        {
          type: 'WALK',
          instruction: 'Marcher vers Darcy',
          durationMinutes: 2,
          distanceMeters: 150,
          polyline: [],
        },
        {
          type: 'TRANSIT',
          instruction: 'Prendre Bus B12',
          durationMinutes: 11,
          distanceMeters: 2800,
          lineId: 'B12',
          lineColor: '#6D4C41',
          polyline: [],
        },
      ],
    };

    const effective = computeEffectiveVisibleLineIds(DEFAULT_VISIBLE_LINE_IDS, busRoute);
    expect(effective).toContain('B12');
    expect(effective).toContain('T1');
    expect(effective).toContain('T2');
  });

  it('computes predictive approaching controller warnings for stations and favorites', () => {
    const t0 = 1_700_000_000_000;
    const movingT1Report: Report = {
      id: 'rep-t1-moving',
      type: 'CONTROLLER',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'T1',
      lineName: 'T1 · Dijon Gare ↔ Quetigny Centre',
      latitude: 47.3235,
      longitude: 5.0335,
      direction: 'Dir. Quetigny Centre',
      directionTerminus: 'Quetigny Centre',
      reportedAt: t0,
      expiresAt: t0 + 40 * 60 * 1000,
      upvotes: 2,
      downvotes: 0,
      reliabilityScore: 85,
      status: 'active',
    };

    // Commuter waiting at République (2 stops after Darcy -> ~4 min ETA)
    const alertsAtRepublique = getApproachingControllerAlertsForStation(
      'hub-republique',
      [movingT1Report],
      t0
    );
    expect(alertsAtRepublique).toHaveLength(1);
    expect(alertsAtRepublique[0].etaMinutes).toBe(4);
    expect(alertsAtRepublique[0].message).toContain('Contrôleurs en approche sur T1');
    expect(alertsAtRepublique[0].message).toContain('Quetigny Centre');
    expect(alertsAtRepublique[0].message).toContain('~4 min');

    // Commuter at Dijon Gare (behind the controller) should NOT get an approaching alert
    const alertsBehind = getApproachingControllerAlertsForStation(
      'hub-gare',
      [movingT1Report],
      t0
    );
    expect(alertsBehind).toHaveLength(0);
  });

  it('searches across all tram, liane and bus stations (including B10/B12/B13) accent-insensitively', () => {
    expect(filterStationsByQuery(ALL_DIJON_STOPS, 'Ahuy').some(s => s.id === 'b10-ahuy')).toBe(
      true
    );
    expect(
      filterStationsByQuery(ALL_DIJON_STOPS, 'plombieres').some(s => s.id === 'b12-plombieres')
    ).toBe(true);
    expect(
      filterStationsByQuery(ALL_DIJON_STOPS, 'motte giron').some(s => s.id === 'b13-mottegiron')
    ).toBe(true);
    expect(
      filterStationsByQuery(ALL_DIJON_STOPS, 'B13').some(s => s.lines.includes('B13'))
    ).toBe(true);
  });
});
