import { beforeEach, describe, expect, it } from 'vitest';
import {
  CROWD_REPORT_TTL_MS,
  DEFAULT_REPORT_TTL_MS,
  estimateCrowdLevelByTime,
  ReportService,
} from '../services/reportService';
import { createReportSchema } from '../types';

describe('ReportService — Controllers (TTL 40m) & Crowd Levels (TTL 25m)', () => {
  let service: ReportService;

  beforeEach(() => {
    service = new ReportService();
  });

  it('pre-fills 2 active CONTROLLER reports (Darcy & Monge) and 2 active CROWD reports (Darcy & Université)', () => {
    const controllers = service.getActiveControllerReports();
    const crowds = service.getActiveCrowdReports();

    expect(controllers.length).toBeGreaterThanOrEqual(2);
    expect(controllers.some(r => r.stopName === 'Darcy')).toBe(true);
    expect(controllers.some(r => r.stopName === 'Monge Cité de la Gastronomie')).toBe(true);

    expect(crowds.length).toBeGreaterThanOrEqual(2);
    expect(crowds.some(r => r.stopId === 'hub-darcy' && r.crowdLevel === 'HIGH')).toBe(true);
    expect(crowds.some(r => r.stopId === 'hub-universite' && r.crowdLevel === 'MEDIUM')).toBe(true);
  });

  it('validates payloads strictly with Zod (requires crowdLevel for CROWD)', () => {
    const invalidCrowd = createReportSchema.safeParse({
      type: 'CROWD',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      latitude: 47.3235,
      longitude: 5.0335,
    });
    expect(invalidCrowd.success).toBe(false);

    const validCrowd = createReportSchema.safeParse({
      type: 'CROWD',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'T1',
      latitude: 47.3235,
      longitude: 5.0335,
      crowdLevel: 'HIGH',
    });
    expect(validCrowd.success).toBe(true);

    const validController = createReportSchema.safeParse({
      type: 'CONTROLLER',
      stopId: 'hub-republique',
      stopName: 'République',
      latitude: 47.3262,
      longitude: 5.0461,
    });
    expect(validController.success).toBe(true);
  });

  it('creates a CONTROLLER report with strict 40 minutes TTL', () => {
    const now = Date.now();
    const report = service.createReport({
      type: 'CONTROLLER',
      stopId: 'hub-godrans',
      stopName: 'Godrans Les Halles',
      lineId: 'T1',
      lineName: 'T1 · Quetigny Centre',
      latitude: 47.3232,
      longitude: 5.0401,
      direction: 'Vers Quetigny',
      description: 'Contrôleurs en civil repérés',
    });

    expect(report.id).toBeDefined();
    expect(report.type).toBe('CONTROLLER');
    expect(report.status).toBe('active');
    expect(report.expiresAt).toBeGreaterThanOrEqual(now + DEFAULT_REPORT_TTL_MS - 100);
    expect(report.expiresAt).toBeLessThanOrEqual(now + DEFAULT_REPORT_TTL_MS + 100);
  });

  it('creates a CROWD report with strict 25 minutes TTL and expires it after 25 min', () => {
    service.clearAll();
    const now = Date.now();

    const crowd = service.createReport({
      type: 'CROWD',
      stopId: 'hub-republique',
      stopName: 'République',
      lineId: 'T2',
      lineName: 'T2 · Valmy',
      latitude: 47.3262,
      longitude: 5.0461,
      direction: 'Vers Valmy',
      crowdLevel: 'HIGH',
    });

    expect(crowd.type).toBe('CROWD');
    expect(crowd.expiresAt).toBeGreaterThanOrEqual(now + CROWD_REPORT_TTL_MS - 100);
    expect(crowd.expiresAt).toBeLessThanOrEqual(now + CROWD_REPORT_TTL_MS + 100);

    // Still active at 24 minutes
    const activeAt24 = service.getActiveCrowdReports(now + 24 * 60 * 1000);
    expect(activeAt24.some(r => r.id === crowd.id)).toBe(true);

    // Expired at 26 minutes
    const activeAt26 = service.getActiveCrowdReports(now + 26 * 60 * 1000);
    expect(activeAt26.some(r => r.id === crowd.id)).toBe(false);
  });

  it('aggregates multiple community crowd reports into source="community"', () => {
    service.clearAll();
    service.createReport({
      type: 'CROWD',
      stopId: 'hub-gare',
      stopName: 'Gare SNCF',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3236,
      longitude: 5.0278,
      direction: 'Quai',
      crowdLevel: 'HIGH',
    });
    service.createReport({
      type: 'CROWD',
      stopId: 'hub-gare',
      stopName: 'Gare SNCF',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3236,
      longitude: 5.0278,
      direction: 'Quai',
      crowdLevel: 'HIGH',
    });

    const status = service.getStationCrowdStatus('hub-gare', 'T1');
    expect(status.source).toBe('community');
    expect(status.level).toBe('HIGH');
    expect(status.label).toBe('Bondé');
    expect(status.reportsCount).toBe(2);
  });

  it('falls back to realistic Dijon peak/off-peak estimation (source="estimated") when no recent votes exist', () => {
    service.clearAll();

    // Tuesday 08:00 AM (Morning rush hour in Dijon)
    const rushHour = new Date(2026, 10, 17, 8, 0, 0);
    expect(estimateCrowdLevelByTime('T1', rushHour)).toBe('HIGH');

    const statusRush = service.getStationCrowdStatus('t1-poincare', 'T1', rushHour);
    expect(statusRush.source).toBe('estimated');
    expect(statusRush.level).toBe('HIGH');

    // Tuesday 14:30 PM (Off-peak afternoon)
    const offPeak = new Date(2026, 10, 17, 14, 30, 0);
    const statusOffPeak = service.getStationCrowdStatus('t1-poincare', 'T1', offPeak);
    expect(statusOffPeak.source).toBe('estimated');
    expect(statusOffPeak.level).toBe('LOW');
    expect(statusOffPeak.label).toBe('Calme');
  });

  it('prolongs CONTROLLER TTL when voting "Toujours là" and dismisses on multiple "Partis" votes', () => {
    const report = service.createReport({
      type: 'CONTROLLER',
      stopId: 'hub-republique',
      stopName: 'République',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3262,
      longitude: 5.0461,
      direction: 'Vers Gare',
    });

    const initialScore = report.reliabilityScore;
    const up = service.voteReport({ reportId: report.id, voteType: 'up' });
    expect(up.action).toBe('updated');
    expect(up.report?.reliabilityScore).toBeGreaterThan(initialScore);

    // Dismiss via downvotes
    service.voteReport({ reportId: report.id, voteType: 'down' });
    service.voteReport({ reportId: report.id, voteType: 'down' });
    const dismissed = service.voteReport({ reportId: report.id, voteType: 'down' });
    expect(dismissed.action).toBe('dismissed');
  });

  it('automatically purges CONTROLLER reports after 40 minutes TTL', () => {
    const now = Date.now();
    const report = service.createReport({
      type: 'CONTROLLER',
      stopId: 'hub-auditorium',
      stopName: 'Auditorium',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3283,
      longitude: 5.0506,
      direction: 'Vers Quetigny',
    });

    expect(service.getActiveReports(now + 39 * 60 * 1000).some(r => r.id === report.id)).toBe(true);
    expect(service.getActiveReports(now + 41 * 60 * 1000).some(r => r.id === report.id)).toBe(false);
  });
});
