import { ALL_DIJON_STOPS } from '../data/dijonNetwork';
import {
  CreateReportInput,
  CrowdLevel,
  CrowdStatus,
  Report,
  VoteReportInput,
} from '../types';

export const DEFAULT_REPORT_TTL_MS = 40 * 60 * 1000; // 40 minutes for CONTROLLER per GEMINI.md
export const CROWD_REPORT_TTL_MS = 25 * 60 * 1000; // 25 minutes for CROWD reports
export const EXTENSION_TTL_PER_UPVOTE_MS = 10 * 60 * 1000; // +10 min on "Toujours là"
export const MIN_RELIABILITY_THRESHOLD = 20;

export function getCrowdMeta(level: CrowdLevel): { label: string; description: string } {
  switch (level) {
    case 'LOW':
      return { label: 'Calme', description: 'Places assises' };
    case 'MEDIUM':
      return { label: 'Chargé', description: 'Voyage debout' };
    case 'HIGH':
      return { label: 'Bondé', description: 'Difficile de monter' };
  }
}

export function estimateCrowdLevelByTime(
  lineId: string = 'T1',
  date: Date = new Date()
): CrowdLevel {
  const day = date.getDay(); // 0 = Sun, 6 = Sat
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  const isWeekday = day >= 1 && day <= 5;
  const isMajorLine = ['T1', 'T2', 'L5', 'L3', 'ALL'].includes(lineId);

  if (isWeekday) {
    // Heures de pointe strictes : 7h30-8h45 (450..525) et 17h00-18h15 (1020..1095)
    const isMorningPeak = timeInMinutes >= 450 && timeInMinutes <= 525;
    const isEveningPeak = timeInMinutes >= 1020 && timeInMinutes <= 1095;
    if (isMorningPeak || isEveningPeak) {
      return isMajorLine ? 'HIGH' : 'MEDIUM';
    }

    // Heures intermédiaires / midi
    const isShoulder =
      (timeInMinutes > 525 && timeInMinutes <= 570) ||
      (timeInMinutes >= 710 && timeInMinutes <= 825) ||
      (timeInMinutes >= 975 && timeInMinutes < 1020) ||
      (timeInMinutes > 1095 && timeInMinutes <= 1155);
    if (isShoulder) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  // Week-end (centre-ville animé l'après-midi)
  if (hours >= 14 && hours <= 18 && isMajorLine) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export class ReportService {
  private reports: Map<string, Report> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private onReportExpiredCallback?: (report: Report) => void;

  constructor() {
    this.seedInitialReports();
  }

  /**
   * Seed realistic initial active reports:
   * - 2 CONTROLLER reports (Darcy, Monge)
   * - 2 CROWD reports (Darcy HIGH, Université MEDIUM)
   */
  public seedInitialReports(): void {
    const now = Date.now();

    const darcyController: Report = {
      id: 'rep-darcy-initial',
      type: 'CONTROLLER',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'T1',
      lineName: 'T1 · Quetigny Centre',
      latitude: 47.3235,
      longitude: 5.0335,
      direction: 'Vers Quetigny Centre / Valmy',
      description: '2 contrôleurs repérés sur le quai tram en direction de République',
      reportedAt: now - 5 * 60 * 1000,
      expiresAt: now + (DEFAULT_REPORT_TTL_MS - 5 * 60 * 1000),
      upvotes: 4,
      downvotes: 0,
      reliabilityScore: 92,
      status: 'active',
    };

    const mongeController: Report = {
      id: 'rep-monge-initial',
      type: 'CONTROLLER',
      stopId: 'hub-monge',
      stopName: 'Monge Cité de la Gastronomie',
      lineId: 'T2',
      lineName: 'T2 · Chenôve Centre',
      latitude: 47.3178,
      longitude: 5.0345,
      direction: 'Vers Chenôve Centre',
      description: 'Contrôleurs en civil aperçus à la montée',
      reportedAt: now - 12 * 60 * 1000,
      expiresAt: now + (DEFAULT_REPORT_TTL_MS - 12 * 60 * 1000),
      upvotes: 2,
      downvotes: 0,
      reliabilityScore: 85,
      status: 'active',
    };

    const darcyCrowd: Report = {
      id: 'crowd-darcy-initial',
      type: 'CROWD',
      stopId: 'hub-darcy',
      stopName: 'Darcy',
      lineId: 'T1',
      lineName: 'T1 · Quetigny Centre',
      latitude: 47.3235,
      longitude: 5.0335,
      direction: 'Vers Quetigny Centre',
      crowdLevel: 'HIGH',
      description: 'Quai très chargé à l\'heure de pointe',
      reportedAt: now - 4 * 60 * 1000,
      expiresAt: now + (CROWD_REPORT_TTL_MS - 4 * 60 * 1000),
      upvotes: 3,
      downvotes: 0,
      reliabilityScore: 90,
      status: 'active',
    };

    const universiteCrowd: Report = {
      id: 'crowd-universite-initial',
      type: 'CROWD',
      stopId: 'hub-universite',
      stopName: 'Université',
      lineId: 'L5',
      lineName: 'L5 · Talant Dullin',
      latitude: 47.3135,
      longitude: 5.0712,
      direction: 'Vers Centre-ville / Darcy',
      crowdLevel: 'MEDIUM',
      description: 'Sortie de cours — voyage debout',
      reportedAt: now - 7 * 60 * 1000,
      expiresAt: now + (CROWD_REPORT_TTL_MS - 7 * 60 * 1000),
      upvotes: 2,
      downvotes: 0,
      reliabilityScore: 85,
      status: 'active',
    };

    this.reports.set(darcyController.id, darcyController);
    this.reports.set(mongeController.id, mongeController);
    this.reports.set(darcyCrowd.id, darcyCrowd);
    this.reports.set(universiteCrowd.id, universiteCrowd);
  }

  /**
   * Create a new report:
   * - CONTROLLER: strict 40 min TTL
   * - CROWD: strict 25 min TTL
   */
  public createReport(input: CreateReportInput): Report {
    const now = Date.now();
    const reportType = input.type || 'CONTROLLER';
    const ttlMs = reportType === 'CROWD' ? CROWD_REPORT_TTL_MS : DEFAULT_REPORT_TTL_MS;
    const prefix = reportType === 'CROWD' ? 'crowd' : 'rep';
    const id = `${prefix}-${now}-${Math.random().toString(36).substring(2, 7)}`;

    const newReport: Report = {
      id,
      type: reportType,
      stopId: input.stopId,
      stopName: input.stopName,
      lineId: input.lineId || 'ALL',
      lineName: input.lineName || 'Toutes lignes',
      latitude: input.latitude,
      longitude: input.longitude,
      direction: input.direction || 'Station / Quai',
      description: input.description,
      crowdLevel: reportType === 'CROWD' ? input.crowdLevel : undefined,
      reportedAt: now,
      expiresAt: now + ttlMs,
      upvotes: 1,
      downvotes: 0,
      reliabilityScore: 80,
      status: 'active',
    };

    this.reports.set(id, newReport);
    return newReport;
  }

  /**
   * Vote on an active report ("Toujours là" / "Partis")
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
    const maxTtl = report.type === 'CROWD' ? CROWD_REPORT_TTL_MS : DEFAULT_REPORT_TTL_MS;

    if (input.voteType === 'up') {
      report.upvotes += 1;
      report.reliabilityScore = Math.min(100, report.reliabilityScore + 5);
      const extendedExpiresAt = report.expiresAt + EXTENSION_TTL_PER_UPVOTE_MS;
      report.expiresAt = Math.min(now + maxTtl, extendedExpiresAt);

      this.reports.set(report.id, report);
      return { report, action: 'updated' };
    } else {
      report.downvotes += 1;
      report.reliabilityScore = Math.max(0, report.reliabilityScore - 25);

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
   * Get all active reports (both CONTROLLER & CROWD)
   */
  public getActiveReports(currentTime: number = Date.now()): Report[] {
    this.cleanupExpiredReports(currentTime);
    return Array.from(this.reports.values()).filter(r => r.status === 'active');
  }

  public getActiveControllerReports(currentTime: number = Date.now()): Report[] {
    return this.getActiveReports(currentTime).filter(r => r.type === 'CONTROLLER');
  }

  public getActiveCrowdReports(currentTime: number = Date.now()): Report[] {
    return this.getActiveReports(currentTime).filter(r => r.type === 'CROWD');
  }

  /**
   * Smart hybrid crowd status for a station (and optional line):
   * - Aggregates community CROWD reports within 25 min TTL -> source: "community"
   * - Otherwise falls back to Dijon time-of-day estimation -> source: "estimated"
   */
  public getStationCrowdStatus(
    stopId: string,
    lineId?: string,
    nowDate: Date = new Date()
  ): CrowdStatus {
    const nowMs = nowDate.getTime();
    const activeCrowd = this.getActiveCrowdReports(nowMs).filter(rep => {
      const sameStop = rep.stopId === stopId;
      const matchingLine =
        !lineId || lineId === 'ALL' || rep.lineId === 'ALL' || rep.lineId === lineId;
      return sameStop && matchingLine && rep.crowdLevel !== undefined;
    });

    if (activeCrowd.length > 0) {
      let weightedSum = 0;
      let totalWeight = 0;
      let latestUpdatedAt = 0;

      for (const rep of activeCrowd) {
        const numericVal =
          rep.crowdLevel === 'LOW' ? 1 : rep.crowdLevel === 'MEDIUM' ? 2 : 3;
        // More recent reports & higher upvotes carry more weight
        const ageMinutes = Math.max(0, (nowMs - rep.reportedAt) / 60000);
        const recencyFactor = Math.max(0.3, 1 - ageMinutes / 25);
        const weight = recencyFactor * Math.max(1, rep.upvotes);

        weightedSum += numericVal * weight;
        totalWeight += weight;
        if (rep.reportedAt > latestUpdatedAt) {
          latestUpdatedAt = rep.reportedAt;
        }
      }

      const avg = weightedSum / totalWeight;
      const aggregatedLevel: CrowdLevel =
        avg < 1.65 ? 'LOW' : avg < 2.35 ? 'MEDIUM' : 'HIGH';
      const meta = getCrowdMeta(aggregatedLevel);

      return {
        level: aggregatedLevel,
        source: 'community',
        label: meta.label,
        description: meta.description,
        updatedAt: latestUpdatedAt,
        reportsCount: activeCrowd.length,
      };
    }

    // Fallback to Dijon peak/off-peak hybrid estimation
    const estimatedLevel = estimateCrowdLevelByTime(lineId || 'T1', nowDate);
    const meta = getCrowdMeta(estimatedLevel);
    return {
      level: estimatedLevel,
      source: 'estimated',
      label: meta.label,
      description: meta.description,
      reportsCount: 0,
    };
  }

  /**
   * Returns a map of crowd statuses for all Dijon stations
   */
  public getAllStationsCrowdMap(nowDate: Date = new Date()): Record<string, CrowdStatus> {
    const result: Record<string, CrowdStatus> = {};
    for (const stop of ALL_DIJON_STOPS) {
      result[stop.id] = this.getStationCrowdStatus(stop.id, stop.lines[0], nowDate);
    }
    return result;
  }

  /**
   * Worker method: Purge expired reports (40 min CONTROLLER / 25 min CROWD)
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

  public onReportExpired(callback: (report: Report) => void): void {
    this.onReportExpiredCallback = callback;
  }

  public startCleanupWorker(intervalMs: number = 30000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredReports();
    }, intervalMs);
  }

  public stopCleanupWorker(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  public clearAll(): void {
    this.reports.clear();
  }
}

export const reportService = new ReportService();
