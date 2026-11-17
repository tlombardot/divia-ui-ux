import { CrowdLevel, CrowdStatus, Report } from '../types';

export interface CrowdBadgeTheme {
  level: CrowdLevel;
  label: string;
  shortDesc: string;
  longDesc: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

export function getCrowdBadgeTheme(level: CrowdLevel): CrowdBadgeTheme {
  switch (level) {
    case 'LOW':
      return {
        level: 'LOW',
        label: 'Calme',
        shortDesc: 'Places dispo',
        longDesc: 'Places assises',
        color: '#00875A',
        bgColor: '#E6F4EA',
        borderColor: '#A8DAB5',
        icon: '👤',
      };
    case 'MEDIUM':
      return {
        level: 'MEDIUM',
        label: 'Chargé',
        shortDesc: 'Debout',
        longDesc: 'Voyage debout',
        color: '#D97706',
        bgColor: '#FEF3C7',
        borderColor: '#FDE68A',
        icon: '👥',
      };
    case 'HIGH':
      return {
        level: 'HIGH',
        label: 'Bondé',
        shortDesc: 'Saturé',
        longDesc: 'Difficile de monter',
        color: '#E11535',
        bgColor: '#FEE2E2',
        borderColor: '#FCA5A5',
        icon: '👥+',
      };
  }
}

export function estimateClientCrowdLevel(
  lineId: string = 'T1',
  date: Date = new Date()
): CrowdLevel {
  const day = date.getDay();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  const isWeekday = day >= 1 && day <= 5;
  const isMajorLine = ['T1', 'T2', 'L5', 'L3', 'ALL'].includes(lineId);

  if (isWeekday) {
    const isMorningPeak = timeInMinutes >= 450 && timeInMinutes <= 525;
    const isEveningPeak = timeInMinutes >= 1020 && timeInMinutes <= 1095;
    if (isMorningPeak || isEveningPeak) {
      return isMajorLine ? 'HIGH' : 'MEDIUM';
    }
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

  if (hours >= 14 && hours <= 18 && isMajorLine) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Compute hybrid station crowd status from active CROWD reports or fallback estimation
 */
export function computeStationCrowdStatus(
  stopId: string,
  reports: Report[],
  lineId?: string,
  nowDate: Date = new Date()
): CrowdStatus {
  const nowMs = nowDate.getTime();
  const crowdReports = reports.filter(
    r =>
      r.type === 'CROWD' &&
      r.status === 'active' &&
      r.stopId === stopId &&
      r.crowdLevel !== undefined &&
      r.expiresAt > nowMs &&
      (!lineId || lineId === 'ALL' || r.lineId === 'ALL' || r.lineId === lineId)
  );

  if (crowdReports.length > 0) {
    let weightedSum = 0;
    let totalWeight = 0;
    let latestUpdatedAt = 0;

    for (const rep of crowdReports) {
      const val = rep.crowdLevel === 'LOW' ? 1 : rep.crowdLevel === 'MEDIUM' ? 2 : 3;
      const ageMin = Math.max(0, (nowMs - rep.reportedAt) / 60000);
      const recency = Math.max(0.3, 1 - ageMin / 25);
      const weight = recency * Math.max(1, rep.upvotes);

      weightedSum += val * weight;
      totalWeight += weight;
      if (rep.reportedAt > latestUpdatedAt) {
        latestUpdatedAt = rep.reportedAt;
      }
    }

    const avg = weightedSum / totalWeight;
    const level: CrowdLevel = avg < 1.65 ? 'LOW' : avg < 2.35 ? 'MEDIUM' : 'HIGH';
    const theme = getCrowdBadgeTheme(level);

    return {
      level,
      source: 'community',
      label: theme.label,
      description: theme.longDesc,
      updatedAt: latestUpdatedAt,
      reportsCount: crowdReports.length,
    };
  }

  const level = estimateClientCrowdLevel(lineId || 'T1', nowDate);
  const theme = getCrowdBadgeTheme(level);
  return {
    level,
    source: 'estimated',
    label: theme.label,
    description: theme.longDesc,
    reportsCount: 0,
  };
}

export function formatCrowdSourceLabel(status: CrowdStatus): string {
  if (status.source === 'community') {
    return status.reportsCount > 1
      ? `Vérifié (${status.reportsCount} usagers)`
      : 'Vérifié usagers';
  }
  return 'Estimé (horaire)';
}
