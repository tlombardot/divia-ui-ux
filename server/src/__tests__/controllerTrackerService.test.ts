import { describe, expect, it } from 'vitest';
import {
  buildRoutePredictiveAlerts,
  buildStationPredictiveAlerts,
  BUS_INTERSTATION_MS,
  computeControllerProgression,
  STATIONARY_TTL_MS,
  TERMINUS_BUFFER_MS,
  TRAM_INTERSTATION_MS,
} from '../services/controllerTrackerService';
import { ReportService } from '../services/reportService';
import { Report } from '../types';

function makeMovingReport(overrides: Partial<Report> = {}): Report {
  const now = 1_700_000_000_000;
  return {
    id: 'ctrl-test-1',
    type: 'CONTROLLER',
    stopId: 'hub-darcy',
    stopName: 'Darcy',
    lineId: 'T1',
    lineName: 'T1 · Dijon Gare ↔ Quetigny Centre',
    latitude: 47.3235,
    longitude: 5.0335,
    direction: 'Dir. Quetigny Centre',
    directionTerminus: 'Quetigny Centre',
    reportedAt: now,
    expiresAt: now + 40 * 60 * 1000,
    upvotes: 1,
    downvotes: 0,
    reliabilityScore: 80,
    status: 'active',
    ...overrides,
  };
}

describe('ControllerTrackerService — Predictive Stop-by-Stop Progression & Terminus Auto-Removal', () => {
  it('(a) advances stop-by-stop over time on Tram T1 (2 min/stop) and Bus B12 (1m45/stop)', () => {
    const t0 = 1_700_000_000_000;
    const t1Report = makeMovingReport({ reportedAt: t0, expiresAt: t0 + 40 * 60 * 1000 });

    const p0 = computeControllerProgression(t1Report, t0);
    expect(p0?.mode).toBe('MOVING');
    expect(p0?.currentStopName).toBe('Darcy');
    expect(p0?.isExpired).toBe(false);

    const p2 = computeControllerProgression(t1Report, t0 + TRAM_INTERSTATION_MS);
    expect(p2?.currentStopName).toBe('Godrans Les Halles');

    const p4 = computeControllerProgression(t1Report, t0 + 2 * TRAM_INTERSTATION_MS);
    expect(p4?.currentStopName).toBe('République');
    expect(p4?.summaryText).toContain('Actuellement vers République');
    expect(p4?.summaryText).toContain('Terminus Quetigny Centre');

    const p6 = computeControllerProgression(t1Report, t0 + 3 * TRAM_INTERSTATION_MS);
    expect(p6?.currentStopName).toBe('Auditorium');

    // Bus B12 reverse direction toward Plombières from Darcy
    const b12Report = makeMovingReport({
      id: 'ctrl-b12',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'B12',
      lineName: 'B12 · Plombières ↔ Chicago',
      direction: 'Dir. Plombières',
      directionTerminus: 'Plombières',
      reportedAt: t0,
      expiresAt: t0 + 40 * 60 * 1000,
    });

    const b12At1Stop = computeControllerProgression(b12Report, t0 + BUS_INTERSTATION_MS);
    expect(b12At1Stop?.currentStopName).toBe('Dijon Gare');

    const b12At2Stops = computeControllerProgression(b12Report, t0 + 2 * BUS_INTERSTATION_MS);
    expect(b12At2Stops?.currentStopName).toBe('Lac Kir');
  });

  it('(b) predicts next 3 upcoming stops with exact ETAs and generates station & route predictive alerts', () => {
    const t0 = 1_700_000_000_000;
    const t1Report = makeMovingReport({ reportedAt: t0, expiresAt: t0 + 40 * 60 * 1000 });

    const prog = computeControllerProgression(t1Report, t0);
    expect(prog?.upcomingStops).toHaveLength(3);
    expect(prog?.upcomingStops.map(u => u.stationName)).toEqual([
      'Godrans Les Halles',
      'République',
      'Auditorium',
    ]);
    expect(prog?.upcomingStops.map(u => u.etaMinutes)).toEqual([2, 4, 6]);
    expect(prog?.alertPolyline).toHaveLength(4); // currentStop + 3 upcoming stops

    // Predictive alert for a commuter waiting at République
    const stationAlerts = buildStationPredictiveAlerts('hub-republique', [t1Report], t0);
    expect(stationAlerts).toHaveLength(1);
    expect(stationAlerts[0].etaMinutes).toBe(4);
    expect(stationAlerts[0].message).toContain('T1');
    expect(stationAlerts[0].message).toContain('Quetigny Centre');
    expect(stationAlerts[0].message).toContain('4 min');

    // Predictive alert for a route using T1 passing through Auditorium
    const routeAlerts = buildRoutePredictiveAlerts(
      ['T1'],
      ['hub-republique', 'hub-auditorium'],
      [t1Report],
      t0
    );
    expect(routeAlerts).toHaveLength(1);
    expect(routeAlerts[0].etaMinutes).toBe(4);
  });

  it('(c) automatically removes a moving controller once it reaches terminus (+ 3 min buffer) without waiting 40 min', () => {
    const service = new ReportService();
    service.clearAll();

    const created = service.createReport({
      type: 'CONTROLLER',
      stopId: 'hub-monge',
      stopName: 'Monge Cité de la Gastronomie',
      lineId: 'T2',
      lineName: 'T2 · Valmy ↔ Chenôve Centre',
      latitude: 47.3178,
      longitude: 5.0345,
      direction: 'Dir. Chenôve Centre',
      directionTerminus: 'Chenôve Centre',
    });

    // Monge -> Bourroches -> Carraz -> Chenôve Centre = 3 stops * 2 min = 6 min + 3 min buffer = 9 min
    const t0 = created.reportedAt;
    const at7Min = t0 + 3 * TRAM_INTERSTATION_MS + 60 * 1000; // 7 min (within 3 min terminus buffer)
    const activeAt7 = service.getActiveControllerReports(at7Min);
    expect(activeAt7.some(r => r.id === created.id)).toBe(true);
    expect(activeAt7.find(r => r.id === created.id)?.progression?.currentStopName).toBe(
      'Chenôve Centre'
    );

    const afterBuffer = t0 + 3 * TRAM_INTERSTATION_MS + TERMINUS_BUFFER_MS + 1000; // 9 min 1s (< 40 min!)
    const activeAfterTerminus = service.getActiveControllerReports(afterBuffer);
    expect(activeAfterTerminus.some(r => r.id === created.id)).toBe(false);
  });

  it('(d) keeps STATIONARY controls anchored for 35 min and recalibrates moving controllers on upvote', () => {
    const service = new ReportService();
    service.clearAll();

    const stationary = service.createReport({
      type: 'CONTROLLER',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3235,
      longitude: 5.0335,
      direction: 'À quai (fixe)',
      directionTerminus: 'STATIONARY',
    });

    expect(stationary.progression?.mode).toBe('STATIONARY');
    expect(stationary.expiresAt - stationary.reportedAt).toBe(STATIONARY_TTL_MS);

    const activeAt34 = service.getActiveControllerReports(
      stationary.reportedAt + 34 * 60 * 1000
    );
    expect(activeAt34.some(r => r.id === stationary.id)).toBe(true);

    const activeAt36 = service.getActiveControllerReports(
      stationary.reportedAt + 36 * 60 * 1000
    );
    expect(activeAt36.some(r => r.id === stationary.id)).toBe(false);

    // Recalibrate moving controller via "Toujours là" vote
    const moving = service.createReport({
      type: 'CONTROLLER',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3235,
      longitude: 5.0335,
      direction: 'Dir. Quetigny Centre',
      directionTerminus: 'Quetigny Centre',
    });

    const voted = service.voteReport({
      reportId: moving.id,
      voteType: 'up',
      recalibrateStopId: 'hub-republique',
    });
    expect(voted.action).toBe('updated');
    expect(voted.report?.lastConfirmedStopId).toBe('hub-republique');
    expect(voted.report?.progression?.currentStopName).toBe('République');
  });
});
