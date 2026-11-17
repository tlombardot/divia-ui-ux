import { CreateReportInput, Report, VoteReportInput } from '../types';

export const DEFAULT_REPORT_TTL_MS = 40 * 60 * 1000; // 40 minutes per GEMINI.md
export const EXTENSION_TTL_PER_UPVOTE_MS = 10 * 60 * 1000; // +10 min on "Toujours là"
export const MIN_RELIABILITY_THRESHOLD = 20;

export class ReportService {
  private reports: Map<string, Report> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private onReportExpiredCallback?: (report: Report) => void;

  constructor() {
    this.seedInitialReports();
  }

  /**
   * Seed realistic initial active reports for Darcy and Monge
   */
  public seedInitialReports(): void {
    const now = Date.now();

    const darcyReport: Report = {
      id: 'rep-darcy-initial',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'T1',
      lineName: 'T1 · Quetigny Centre',
      latitude: 47.3235,
      longitude: 5.0335,
      direction: 'Vers Quetigny Centre / Valmy',
      description: '2 contrôleurs repérés sur le quai tram en direction de République',
      reportedAt: now - 5 * 60 * 1000, // 5 min ago
      expiresAt: now + (DEFAULT_REPORT_TTL_MS - 5 * 60 * 1000), // ~35 min remaining
      upvotes: 4,
      downvotes: 0,
      reliabilityScore: 92,
      status: 'active',
    };

    const mongeReport: Report = {
      id: 'rep-monge-initial',
      stopId: 't2-monge',
      stopName: 'Monge Cité de la Gastronomie',
      lineId: 'T2',
      lineName: 'T2 · Chenôve Centre',
      latitude: 47.3178,
      longitude: 5.0345,
      direction: 'Vers Chenôve Centre',
      description: 'Contrôleurs en civil aperçus à la montée',
      reportedAt: now - 12 * 60 * 1000, // 12 min ago
      expiresAt: now + (DEFAULT_REPORT_TTL_MS - 12 * 60 * 1000), // ~28 min remaining
      upvotes: 2,
      downvotes: 0,
      reliabilityScore: 85,
      status: 'active',
    };

    this.reports.set(darcyReport.id, darcyReport);
    this.reports.set(mongeReport.id, mongeReport);
  }

  /**
   * Create a new report with strict 40 minutes TTL
   */
  public createReport(input: CreateReportInput): Report {
    const now = Date.now();
    const id = `rep-${now}-${Math.random().toString(36).substring(2, 7)}`;

    const newReport: Report = {
      id,
      stopId: input.stopId,
      stopName: input.stopName,
      lineId: input.lineId,
      lineName: input.lineName,
      latitude: input.latitude,
      longitude: input.longitude,
      direction: input.direction,
      description: input.description,
      reportedAt: now,
      expiresAt: now + DEFAULT_REPORT_TTL_MS, // Strict 40 minutes
      upvotes: 1, // Author automatic upvote
      downvotes: 0,
      reliabilityScore: 80,
      status: 'active',
    };

    this.reports.set(id, newReport);
    return newReport;
  }

  /**
   * Vote on an active report:
   * - "up" ("Toujours là"): increases score and extends TTL
   * - "down" ("Partis"): decreases score and dismisses if below threshold
   */
  public voteReport(input: VoteReportInput): {
    report: Report | null;
    action: 'updated' | 'dismissed' | 'not_found';
  } {
    const report = this.reports.get(input.reportId);
    if (!report || report.status !== 'active') {
      return { report: null, action: 'not_found' };
    }

    const now = Date.now();

    if (input.voteType === 'up') {
      report.upvotes += 1;
      report.reliabilityScore = Math.min(100, report.reliabilityScore + 5);
      // Extend TTL up to max 40 minutes from now
      const extendedExpiresAt = report.expiresAt + EXTENSION_TTL_PER_UPVOTE_MS;
      report.expiresAt = Math.min(now + DEFAULT_REPORT_TTL_MS, extendedExpiresAt);

      this.reports.set(report.id, report);
      return { report, action: 'updated' };
    } else {
      report.downvotes += 1;
      report.reliabilityScore = Math.max(0, report.reliabilityScore - 25);

      // Dismissal rule: score <= 20 or (downvotes >= 3 and more than twice upvotes)
      if (
        report.reliabilityScore <= MIN_RELIABILITY_THRESHOLD ||
        (report.downvotes >= 3 && report.downvotes > report.upvotes * 2)
      ) {
        report.status = 'dismissed';
        this.reports.delete(report.id);
        return { report, action: 'dismissed' };
      }

      this.reports.set(report.id, report);
      return { report, action: 'updated' };
    }
  }

  /**
   * Get all currently active, non-expired reports
   */
  public getActiveReports(currentTime: number = Date.now()): Report[] {
    this.cleanupExpiredReports(currentTime);
    return Array.from(this.reports.values()).filter(r => r.status === 'active');
  }

  /**
   * Worker method: Purge all reports that have exceeded their 40 min TTL
   */
  public cleanupExpiredReports(currentTime: number = Date.now()): Report[] {
    const expiredList: Report[] = [];

    for (const [id, report] of this.reports.entries()) {
      if (currentTime >= report.expiresAt || report.status !== 'active') {
        report.status = 'expired';
        expiredList.push(report);
        this.reports.delete(id);

        if (this.onReportExpiredCallback) {
          this.onReportExpiredCallback(report);
        }
      }
    }

    return expiredList;
  }

  /**
   * Set callback when reports expire
   */
  public onReportExpired(callback: (report: Report) => void): void {
    this.onReportExpiredCallback = callback;
  }

  /**
   * Start background periodic cleanup worker
   */
  public startCleanupWorker(intervalMs: number = 30000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredReports();
    }, intervalMs);
  }

  /**
   * Stop background cleanup worker (clean shutdown / testing)
   */
  public stopCleanupWorker(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all reports (useful for testing)
   */
  public clearAll(): void {
    this.reports.clear();
  }
}

export const reportService = new ReportService();
