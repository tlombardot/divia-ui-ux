import { calculateDistanceMeters } from '../data/dijonNetwork';
import { TransitStop } from '../types';

export type LatLng = [number, number]; // [latitude, longitude]

const METERS_PER_DEG_LAT = 111320;

function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Exact orthogonal projection of a GPS point onto a segment [segA, segB]
 */
export function projectPointOntoSegment(
  pt: LatLng,
  segA: LatLng,
  segB: LatLng
): { projected: LatLng; distanceMeters: number; t: number } {
  const mLon = metersPerDegLon(pt[0]);
  const ax = (segA[1] - pt[1]) * mLon;
  const ay = (segA[0] - pt[0]) * METERS_PER_DEG_LAT;
  const bx = (segB[1] - pt[1]) * mLon;
  const by = (segB[0] - pt[0]) * METERS_PER_DEG_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-9) {
    return {
      projected: segA,
      distanceMeters: Math.hypot(ax, ay),
      t: 0,
    };
  }

  let t = (-ax * dx + -ay * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = segA[0] + t * (segB[0] - segA[0]);
  const projLon = segA[1] + t * (segB[1] - segA[1]);
  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return {
    projected: [projLat, projLon],
    distanceMeters: Math.hypot(projX, projY),
    t,
  };
}

/**
 * Find closest projection of a GPS point onto a full polyline
 */
export function projectPointOntoPolyline(
  pt: LatLng,
  polyline: LatLng[]
): {
  projected: LatLng;
  distanceMeters: number;
  segmentIndex: number;
  t: number;
} {
  if (polyline.length === 0) {
    return { projected: pt, distanceMeters: Infinity, segmentIndex: 0, t: 0 };
  }
  if (polyline.length === 1) {
    return {
      projected: polyline[0],
      distanceMeters: calculateDistanceMeters(pt[0], pt[1], polyline[0][0], polyline[0][1]),
      segmentIndex: 0,
      t: 0,
    };
  }

  let bestDist = Infinity;
  let bestProj: LatLng = polyline[0];
  let bestSegIdx = 0;
  let bestT = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const res = projectPointOntoSegment(pt, polyline[i], polyline[i + 1]);
    if (res.distanceMeters < bestDist) {
      bestDist = res.distanceMeters;
      bestProj = res.projected;
      bestSegIdx = i;
      bestT = res.t;
    }
  }

  return {
    projected: bestProj,
    distanceMeters: bestDist,
    segmentIndex: bestSegIdx,
    t: bestT,
  };
}

/**
 * Snap a TransitStop millimeter-accurately onto its line's rail/street polyline
 */
export function snapStopToPolyline(
  stop: TransitStop,
  polyline: LatLng[],
  maxSnapDistanceMeters: number = 350
): TransitStop {
  if (polyline.length < 2) return stop;

  const proj = projectPointOntoPolyline([stop.latitude, stop.longitude], polyline);
  if (proj.distanceMeters > maxSnapDistanceMeters) {
    return stop;
  }

  return {
    ...stop,
    latitude: Number(proj.projected[0].toFixed(6)),
    longitude: Number(proj.projected[1].toFixed(6)),
  };
}

/**
 * Compute total length along a polyline in meters
 */
export function computePolylineLengthMeters(polyline: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    total += calculateDistanceMeters(
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1]
    );
  }
  return total;
}

/**
 * Pure deterministic topological stitching algorithm for OSM ways:
 * - Connects segments end-to-end within `toleranceMeters` (default 15m),
 *   reversing segments automatically when needed.
 * - Splits/rejects any aberrant jump > `maxJumpMeters` (default 150m).
 * - Returns the longest continuous stitched chain oriented cleanly toward `startHint`.
 */
export function stitchWays(
  rawWays: LatLng[][],
  toleranceMeters: number = 15,
  maxJumpMeters: number = 150,
  startHint?: LatLng
): LatLng[] {
  const ways = rawWays.filter(w => w.length >= 2);
  if (ways.length === 0) return [];

  const used = new Array<boolean>(ways.length).fill(false);
  const chains: LatLng[][] = [];

  for (let seedIdx = 0; seedIdx < ways.length; seedIdx++) {
    if (used[seedIdx]) continue;
    used[seedIdx] = true;

    let chain: LatLng[] = [...ways[seedIdx]];
    let extended = true;

    while (extended) {
      extended = false;
      const chainStart = chain[0];
      const chainEnd = chain[chain.length - 1];

      let bestIdx = -1;
      let bestDist = Infinity;
      let bestMode: 'append_fwd' | 'append_rev' | 'prepend_fwd' | 'prepend_rev' = 'append_fwd';

      for (let i = 0; i < ways.length; i++) {
        if (used[i]) continue;
        const w = ways[i];
        const wStart = w[0];
        const wEnd = w[w.length - 1];

        const dEndToStart = calculateDistanceMeters(chainEnd[0], chainEnd[1], wStart[0], wStart[1]);
        if (dEndToStart <= toleranceMeters && dEndToStart < bestDist) {
          bestDist = dEndToStart;
          bestIdx = i;
          bestMode = 'append_fwd';
        }

        const dEndToEnd = calculateDistanceMeters(chainEnd[0], chainEnd[1], wEnd[0], wEnd[1]);
        if (dEndToEnd <= toleranceMeters && dEndToEnd < bestDist) {
          bestDist = dEndToEnd;
          bestIdx = i;
          bestMode = 'append_rev';
        }

        const dStartToEnd = calculateDistanceMeters(chainStart[0], chainStart[1], wEnd[0], wEnd[1]);
        if (dStartToEnd <= toleranceMeters && dStartToEnd < bestDist) {
          bestDist = dStartToEnd;
          bestIdx = i;
          bestMode = 'prepend_fwd';
        }

        const dStartToStart = calculateDistanceMeters(chainStart[0], chainStart[1], wStart[0], wStart[1]);
        if (dStartToStart <= toleranceMeters && dStartToStart < bestDist) {
          bestDist = dStartToStart;
          bestIdx = i;
          bestMode = 'prepend_rev';
        }
      }

      if (bestIdx !== -1) {
        used[bestIdx] = true;
        const seg = ways[bestIdx];
        if (bestMode === 'append_fwd') {
          chain = [...chain, ...seg.slice(1)];
        } else if (bestMode === 'append_rev') {
          chain = [...chain, ...[...seg].reverse().slice(1)];
        } else if (bestMode === 'prepend_fwd') {
          chain = [...seg.slice(0, -1), ...chain];
        } else {
          chain = [...[...seg].reverse().slice(0, -1), ...chain];
        }
        extended = true;
      }
    }

    chains.push(chain);
  }

  // Split any internal aberrant jumps > maxJumpMeters into clean continuous sub-chains
  const cleanChains: LatLng[][] = [];
  for (const chain of chains) {
    let current: LatLng[] = [chain[0]];
    for (let i = 1; i < chain.length; i++) {
      const prev = current[current.length - 1];
      const pt = chain[i];
      const dist = calculateDistanceMeters(prev[0], prev[1], pt[0], pt[1]);
      if (dist > maxJumpMeters) {
        if (current.length >= 2) cleanChains.push(current);
        current = [pt];
      } else if (dist >= 1) {
        current.push(pt);
      }
    }
    if (current.length >= 2) cleanChains.push(current);
  }

  if (cleanChains.length === 0) return [];

  // Select the longest continuous stitched chain by physical length
  let longest = cleanChains[0];
  let longestLen = computePolylineLengthMeters(longest);
  for (let i = 1; i < cleanChains.length; i++) {
    const len = computePolylineLengthMeters(cleanChains[i]);
    if (len > longestLen) {
      longestLen = len;
      longest = cleanChains[i];
    }
  }

  // Orient chain so it starts closest to startHint (terminusA) if provided
  if (startHint && longest.length >= 2) {
    const dStart = calculateDistanceMeters(
      startHint[0],
      startHint[1],
      longest[0][0],
      longest[0][1]
    );
    const dEnd = calculateDistanceMeters(
      startHint[0],
      startHint[1],
      longest[longest.length - 1][0],
      longest[longest.length - 1][1]
    );
    if (dEnd < dStart) {
      longest = [...longest].reverse();
    }
  }

  return longest;
}

/**
 * Densify a polyline so no two consecutive vertices exceed `maxSegmentMeters`
 */
export function densifyPolyline(
  points: LatLng[],
  maxSegmentMeters: number = 120
): LatLng[] {
  if (points.length < 2) return points;
  const output: LatLng[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = calculateDistanceMeters(a[0], a[1], b[0], b[1]);

    if (dist > maxSegmentMeters) {
      const steps = Math.ceil(dist / maxSegmentMeters);
      for (let s = 1; s < steps; s++) {
        const ratio = s / steps;
        output.push([
          Number((a[0] + (b[0] - a[0]) * ratio).toFixed(6)),
          Number((a[1] + (b[1] - a[1]) * ratio).toFixed(6)),
        ]);
      }
    }
    output.push(b);
  }

  return output;
}

/**
 * Build a local Dijkstra graph strictly over OSM `railway=tram` ways
 * and route between ordered stations exclusively along tram tracks.
 */
export function routeOnTramRailGraph(
  railWays: LatLng[][],
  orderedStops: TransitStop[]
): LatLng[] | null {
  if (railWays.length === 0 || orderedStops.length < 2) return null;

  // Quantize coordinates to ~1m grid keys so shared track junctions connect cleanly
  const keyOf = (pt: LatLng) => `${pt[0].toFixed(5)},${pt[1].toFixed(5)}`;
  const coordsByKey = new Map<string, LatLng>();
  const adj = new Map<string, Array<{ to: string; weight: number }>>();

  const addNode = (pt: LatLng): string => {
    const k = keyOf(pt);
    if (!coordsByKey.has(k)) {
      coordsByKey.set(k, pt);
      adj.set(k, []);
    }
    return k;
  };

  for (const way of railWays) {
    for (let i = 0; i < way.length - 1; i++) {
      const kA = addNode(way[i]);
      const kB = addNode(way[i + 1]);
      if (kA === kB) continue;
      const w = calculateDistanceMeters(way[i][0], way[i][1], way[i + 1][0], way[i + 1][1]);
      if (w > 200) continue; // Ignore aberrant edges
      adj.get(kA)!.push({ to: kB, weight: w });
      adj.get(kB)!.push({ to: kA, weight: w });
    }
  }

  const allNodes = Array.from(coordsByKey.entries());
  if (allNodes.length < 10) return null;

  const nearestGraphNode = (stop: TransitStop): string | null => {
    let bestKey: string | null = null;
    let bestDist = Infinity;
    for (const [key, pt] of allNodes) {
      const d = calculateDistanceMeters(stop.latitude, stop.longitude, pt[0], pt[1]);
      if (d < bestDist) {
        bestDist = d;
        bestKey = key;
      }
    }
    return bestDist <= 300 ? bestKey : null;
  };

  const dijkstra = (startKey: string, endKey: string): LatLng[] | null => {
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    dist.set(startKey, 0);

    const queue: Array<{ key: string; d: number }> = [{ key: startKey, d: 0 }];

    while (queue.length > 0) {
      queue.sort((a, b) => a.d - b.d);
      const current = queue.shift()!;
      if (visited.has(current.key)) continue;
      visited.add(current.key);

      if (current.key === endKey) break;

      const neighbors = adj.get(current.key) || [];
      for (const edge of neighbors) {
        if (visited.has(edge.to)) continue;
        const alt = current.d + edge.weight;
        if (alt < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, current.key);
          queue.push({ key: edge.to, d: alt });
        }
      }
    }

    if (!dist.has(endKey)) return null;
    const pathKeys: string[] = [];
    let cur: string | undefined = endKey;
    while (cur) {
      pathKeys.push(cur);
      if (cur === startKey) break;
      cur = prev.get(cur);
    }
    pathKeys.reverse();
    return pathKeys.map(k => coordsByKey.get(k)!);
  };

  const fullPath: LatLng[] = [];
  for (let i = 0; i < orderedStops.length - 1; i++) {
    const startNode = nearestGraphNode(orderedStops[i]);
    const endNode = nearestGraphNode(orderedStops[i + 1]);
    if (!startNode || !endNode) return null;

    const legPath = dijkstra(startNode, endNode);
    if (!legPath || legPath.length < 2) return null;

    if (fullPath.length === 0) {
      fullPath.push(...legPath);
    } else {
      fullPath.push(...legPath.slice(1));
    }
  }

  return fullPath.length >= 2 ? fullPath : null;
}

/**
 * Slice the exact sub-polyline along a real directional rail/bus geometry
 * between `boardStop` and `alightStop`.
 */
export function sliceLineGeometry(
  polyline: LatLng[],
  boardStop: TransitStop,
  alightStop: TransitStop
): LatLng[] {
  if (polyline.length < 2) {
    return [
      [boardStop.latitude, boardStop.longitude],
      [alightStop.latitude, alightStop.longitude],
    ];
  }

  const startProj = projectPointOntoPolyline(
    [boardStop.latitude, boardStop.longitude],
    polyline
  );
  const endProj = projectPointOntoPolyline(
    [alightStop.latitude, alightStop.longitude],
    polyline
  );

  const startPos = startProj.segmentIndex + startProj.t;
  const endPos = endProj.segmentIndex + endProj.t;

  const result: LatLng[] = [startProj.projected];

  if (startPos <= endPos) {
    for (let i = startProj.segmentIndex + 1; i <= endProj.segmentIndex; i++) {
      result.push(polyline[i]);
    }
  } else {
    // Handle reverse slicing cleanly if caller passed a single bidirectional rail polyline
    for (let i = startProj.segmentIndex; i >= endProj.segmentIndex + 1; i--) {
      result.push(polyline[i]);
    }
  }

  result.push(endProj.projected);
  return result;
}
