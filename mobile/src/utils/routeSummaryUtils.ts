import { RouteSegment } from '../types';

export interface SummaryPill {
  kind: 'WALK' | 'TRANSIT' | 'TRANSFER';
  durationSeconds: number;
  durationMinutes: number;
  distanceMeters: number;
  lineId?: string;
  lineColor?: string;
}

/**
 * Pure helper: guarantees route summary cards NEVER display two consecutive
 * WALK pills (merges adjacent WALK segments using exact seconds before rounding
 * and drops < 20m same-platform transfers).
 */
export function buildMergedSummaryPills(segments: RouteSegment[]): SummaryPill[] {
  const pills: SummaryPill[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const hasPrevTransit = pills.length > 0 && pills[pills.length - 1].kind === 'TRANSIT';
    const hasNextTransit = segments[i + 1]?.type === 'TRANSIT';

    if (seg.type === 'TRANSIT') {
      pills.push({
        kind: 'TRANSIT',
        durationSeconds: seg.durationSeconds ?? seg.durationMinutes * 60,
        durationMinutes: seg.durationMinutes,
        distanceMeters: seg.distanceMeters,
        lineId: seg.lineId,
        lineColor: seg.lineColor,
      });
      continue;
    }

    if (seg.type === 'TRANSFER') {
      if (seg.distanceMeters < 20) continue;
      const sec = seg.durationSeconds ?? seg.durationMinutes * 60;
      pills.push({
        kind: 'TRANSFER',
        durationSeconds: sec,
        durationMinutes: Math.max(1, Math.round(sec / 60)),
        distanceMeters: seg.distanceMeters,
      });
      continue;
    }

    // WALK segment
    if (hasPrevTransit && hasNextTransit && seg.distanceMeters < 20) {
      continue;
    }

    const curSec = seg.durationSeconds ?? seg.durationMinutes * 60;
    const lastPill = pills[pills.length - 1];

    if (lastPill && lastPill.kind === 'WALK') {
      lastPill.durationSeconds += curSec;
      lastPill.distanceMeters += seg.distanceMeters;
      lastPill.durationMinutes = Math.max(1, Math.round(lastPill.durationSeconds / 60));
    } else {
      pills.push({
        kind: 'WALK',
        durationSeconds: curSec,
        durationMinutes: Math.max(1, Math.round(curSec / 60)),
        distanceMeters: seg.distanceMeters,
      });
    }
  }

  return pills;
}
