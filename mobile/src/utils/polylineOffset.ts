import { LineCategory, TransitLine } from '../types';

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

export interface OffsetLineResult {
  line: TransitLine;
  coordinates: LatLngPoint[];
  hasCorridorOverlap: boolean;
}

const METERS_PER_DEG_LAT = 111320;
const CATEGORY_ORDER: Record<LineCategory, number> = {
  TRAM: 0,
  LIANE: 1,
  BUS: 2,
};

function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Exact point-to-segment distance in meters using local tangent-plane projection
 */
export function pointToSegmentDistanceMeters(
  pt: [number, number],
  segA: [number, number],
  segB: [number, number]
): number {
  const mLon = metersPerDegLon(pt[0]);
  const px = 0;
  const py = 0;
  const ax = (segA[1] - pt[1]) * mLon;
  const ay = (segA[0] - pt[0]) * METERS_PER_DEG_LAT;
  const bx = (segB[1] - pt[1]) * mLon;
  const by = (segB[0] - pt[0]) * METERS_PER_DEG_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Minimum distance in meters from a point to an entire polyline
 */
export function pointToPolylineDistanceMeters(
  pt: [number, number],
  polyline: [number, number][]
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return pointToSegmentDistanceMeters(pt, polyline[0], polyline[0]);
  }

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = pointToSegmentDistanceMeters(pt, polyline[i], polyline[i + 1]);
    if (d < minDist) {
      minDist = d;
    }
  }
  return minDist;
}

/**
 * Shift a GPS coordinate perpendicularly to its local segment tangent by offsetMeters.
 * Uses canonical tangent orientation so bidirectional lines on the same street
 * shift consistently side-by-side instead of colliding.
 */
export function offsetCoordinatePerpendicular(
  point: [number, number],
  prev: [number, number],
  next: [number, number],
  offsetMeters: number
): [number, number] {
  if (offsetMeters === 0) return point;

  const mLon = metersPerDegLon(point[0]);
  let dx = (next[1] - prev[1]) * mLon;
  let dy = (next[0] - prev[0]) * METERS_PER_DEG_LAT;

  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return point;

  // Canonical orientation so opposite-direction routes share the same left/right frame
  if (dx < 0 || (Math.abs(dx) < 1e-6 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }

  // Unit perpendicular normal (-dy, dx)
  const nx = -dy / length;
  const ny = dx / length;

  const shiftedLat = point[0] + (ny * offsetMeters) / METERS_PER_DEG_LAT;
  const shiftedLon = point[1] + (nx * offsetMeters) / mLon;

  return [shiftedLat, shiftedLon];
}

function compareLinesPriority(a: TransitLine, b: TransitLine): number {
  const catDiff = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  if (catDiff !== 0) return catDiff;
  return a.id.localeCompare(b.id);
}

/**
 * Compute parallel corridor offsets for all visible transit lines.
 * Any vertex where 2+ visible lines pass within `proximityThresholdMeters` (default 15m)
 * receives a symmetric perpendicular shift (e.g. -5m / +5m for 2 lines, -10m / 0m / +10m for 3).
 */
export function computeCorridorOffsets(
  visibleLines: TransitLine[],
  proximityThresholdMeters: number = 15,
  spacingMeters: number = 10
): OffsetLineResult[] {
  const sortedLines = [...visibleLines].sort(compareLinesPriority);

  return sortedLines.map(line => {
    const pts = line.polyline;
    let hasCorridorOverlap = false;

    const shiftedCoords: LatLngPoint[] = pts.map((pt, idx) => {
      // Find all visible lines passing within proximity threshold of this point
      const corridorGroup = sortedLines.filter(other => {
        if (other.id === line.id) return true;
        return pointToPolylineDistanceMeters(pt, other.polyline) <= proximityThresholdMeters;
      });

      if (corridorGroup.length <= 1) {
        return { latitude: pt[0], longitude: pt[1] };
      }

      hasCorridorOverlap = true;
      const slotIndex = corridorGroup.findIndex(item => item.id === line.id);
      const centeredOffsetMeters =
        (slotIndex - (corridorGroup.length - 1) / 2) * spacingMeters;

      const prev = idx > 0 ? pts[idx - 1] : pt;
      const next = idx < pts.length - 1 ? pts[idx + 1] : pt;
      const [lat, lon] = offsetCoordinatePerpendicular(
        pt,
        prev,
        next,
        centeredOffsetMeters
      );

      return { latitude: lat, longitude: lon };
    });

    return {
      line,
      coordinates: shiftedCoords,
      hasCorridorOverlap,
    };
  });
}
