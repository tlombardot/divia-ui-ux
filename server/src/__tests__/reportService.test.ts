import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_REPORT_TTL_MS, ReportService } from '../services/reportService';

describe('ReportService — Lifecycle & TTL 40 min', () => {
  let service: ReportService;

  beforeEach(() => {
    service = new ReportService();
  });

  it('pre-fills 2 realistic active reports at startup (Darcy & Monge)', () => {
    const active = service.getActiveReports();
    expect(active.length).toBeGreaterThanOrEqual(2);

    const darcy = active.find(r => r.stopName === 'Darcy');
    const monge = active.find(r => r.stopName === 'Monge Cité de la Gastronomie');

    expect(darcy).toBeDefined();
    expect(darcy?.status).toBe('active');
    expect(monge).toBeDefined();
    expect(monge?.status).toBe('active');
  });

  it('creates a new report with strict 40 minutes TTL', () => {
    const now = Date.now();
    const report = service.createReport({
      stopId: 't1-godrans',
      stopName: 'Godrans Les Halles',
      lineId: 'T1',
      lineName: 'T1 · Quetigny Centre',
      latitude: 47.3232,
      longitude: 5.0401,
      direction: 'Vers Quetigny',
      description: 'Contrôleurs en civil repérés',
    });

    expect(report.id).toBeDefined();
    expect(report.status).toBe('active');
    expect(report.expiresAt).toBeGreaterThanOrEqual(now + DEFAULT_REPORT_TTL_MS - 100);
    expect(report.expiresAt).toBeLessThanOrEqual(now + DEFAULT_REPORT_TTL_MS + 100);
  });

  it('prolongs report TTL and increases score when voting "Toujours là" (up)', () => {
    const report = service.createReport({
      stopId: 't1-republique',
      stopName: 'République',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3262,
      longitude: 5.0461,
      direction: 'Vers Gare',
    });

    const initialExpiresAt = report.expiresAt;
    const initialScore = report.reliabilityScore;

    const voteResult = service.voteReport({
      reportId: report.id,
      voteType: 'up',
    });

    expect(voteResult.action).toBe('updated');
    expect(voteResult.report?.upvotes).toBe(2);
    expect(voteResult.report?.reliabilityScore).toBeGreaterThan(initialScore);
    expect(voteResult.report?.expiresAt).toBeGreaterThanOrEqual(initialExpiresAt);
  });

  it('reduces score and dismisses report when downvoted multiple times ("Partis")', () => {
    const report = service.createReport({
      stopId: 't2-drapeau',
      stopName: 'Drapeau',
      lineId: 'T2',
      lineName: 'T2',
      latitude: 47.3341,
      longitude: 5.0440,
      direction: 'Vers Chenôve',
    });

    // Cast 3 downvotes
    service.voteReport({ reportId: report.id, voteType: 'down' });
    service.voteReport({ reportId: report.id, voteType: 'down' });
    const finalVote = service.voteReport({ reportId: report.id, voteType: 'down' });

    expect(finalVote.action).toBe('dismissed');
    expect(finalVote.report?.status).toBe('dismissed');

    // Should no longer be returned in active reports
    const active = service.getActiveReports();
    expect(active.some(r => r.id === report.id)).toBe(false);
  });

  it('automatically purges and expires reports after 40 minutes TTL', () => {
    const now = Date.now();
    const report = service.createReport({
      stopId: 't1-auditorium',
      stopName: 'Auditorium',
      lineId: 'T1',
      lineName: 'T1',
      latitude: 47.3283,
      longitude: 5.0506,
      direction: 'Vers Quetigny',
    });

    // Simulate 39 minutes elapsed -> Still active
    const activeAt39Min = service.getActiveReports(now + 39 * 60 * 1000);
    expect(activeAt39Min.some(r => r.id === report.id)).toBe(true);

    // Simulate 41 minutes elapsed -> Expired & purged
    const expiredList = service.cleanupExpiredReports(now + 41 * 60 * 1000);
    expect(expiredList.some(r => r.id === report.id)).toBe(true);

    const activeAt41Min = service.getActiveReports(now + 41 * 60 * 1000);
    expect(activeAt41Min.some(r => r.id === report.id)).toBe(false);
  });
});
