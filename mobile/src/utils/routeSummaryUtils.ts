import { RouteSegment } from '../types';

export interface SummaryPill {
  kind: 'WALK' | 'TRANSIT' | 'TRANSFER';
  durationMinutes: number;
  distanceMeters: number;
  lineId?: string;
  lineColor?: string;
}

/**
 * Pure helper: guarantees route summary cards NEVER display two consecutive
 * WALK pills (merges adjacent WALK segments defensively and drops < 20m transfers).
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
        durationMinutes: seg.durationMinutes,
        distanceMeters: seg.distanceMeters,
        lineId: seg.lineId,
        lineColor: seg.lineColor,
      });
      continue;
    }

    if (seg.type === 'TRANSFER') {
      if (seg.distanceMeters < 20) continue;
      pills.push({
        kind: 'TRANSFER',
        durationMinutes: Math.max(1, seg.durationMinutes),
        distanceMeters: seg.distanceMeters,
      });
      continue;
    }

    // WALK segment
    if (hasPrevTransit && hasNextTransit && seg.distanceMeters < 20) {
      continue;
    }

    const lastPill = pills[pills.length - 1];
    if (lastPill && lastPill.kind === 'WALK') {
      const prevSec = lastPill.durationMinutes * 60;
      const curSec = seg.durationSeconds ?? seg.durationMinutes * 60;
      lastPill.distanceMeters += seg.distanceMeters;
      lastPill.durationMinutes = Math.max(1, Math.round((prevSec + curSec) / 60));
    } else {
      const mins =
        seg.durationSeconds !== undefined
          ? Math.max(1, Math.round(seg.durationSeconds / 60))
          : Math.max(1, seg.durationMinutes);
      pills.push({
        kind: 'WALK',
        durationMinutes: mins,
        distanceMeters: seg.distanceMeters,
      });
    }
  }

  return pills;
}
