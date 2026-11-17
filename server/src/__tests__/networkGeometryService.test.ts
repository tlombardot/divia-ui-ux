import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { calculateDistanceMeters, DIJON_LINES } from '../data/dijonNetwork';
import {
  NETWORK_CACHE_VERSION,
  NetworkGeometryService,
} from '../services/networkGeometryService';
import { networkShapesQuerySchema } from '../types';
import {
  LatLng,
  projectPointOntoPolyline,
  routeOnTramRailGraph,
  snapStopToPolyline,
  stitchWays,
} from '../utils/geometryTopology';

describe('Geometry Topology — stitchWays, Rail Graph & Snap-to-Track', () => {
  it('stitches unordered and reversed OSM way segments within 15m tolerance', () => {
    // 3 connected segments forming A -> B -> C -> D, given out of order & partially reversed
    const seg1: LatLng[] = [
      [47.3235, 5.0335], // A
      [47.3235, 5.0345], // B
    ];
    const seg2Reversed: LatLng[] = [
      [47.3235, 5.0355], // C
      [47.3235, 5.03455], // ~4m from B (within 15m tolerance)
    ];
    const seg3: LatLng[] = [
      [47.3235, 5.0355], // C
      [47.3235, 5.0365], // D
    ];

    const stitched = stitchWays([seg3, seg2Reversed, seg1], 15, 150, [47.3235, 5.0335]);
    expect(stitched.length).toBeGreaterThanOrEqual(4);
    expect(stitched[0][1]).toBeCloseTo(5.0335, 4);
    expect(stitched[stitched.length - 1][1]).toBeCloseTo(5.0365, 4);
  });

  it('rejects aberrant >150m jumps without creating zig-zags', () => {
    const cleanMain: LatLng[] = [
      [47.3235, 5.0335],
      [47.3235, 5.0345],
      [47.3235, 5.0355],
      [47.3235, 5.0365],
    ];
    // Way containing a huge 900m jump to a disconnected spur
    const jumpWay: LatLng[] = [
      [47.3235, 5.0365],
      [47.3315, 5.0365], // ~890m jump!
      [47.3320, 5.0370],
    ];

    const stitched = stitchWays([cleanMain, jumpWay], 15, 150);
    for (let i = 0; i < stitched.length - 1; i++) {
      const d = calculateDistanceMeters(
        stitched[i][0],
        stitched[i][1],
        stitched[i + 1][0],
        stitched[i + 1][1]
      );
      expect(d).toBeLessThanOrEqual(150);
    }
  });

  it('snaps station markers onto the exact rail polyline (< 1m distance)', () => {
    const track: LatLng[] = [
      [47.3235, 5.0300],
      [47.3235, 5.0400],
    ];
    // Station slightly 45m north of the rail
    const offTrackStop = {
      id: 'test-stop',
      name: 'Test Station',
      latitude: 47.3239,
      longitude: 5.0350,
      lines: ['T1'],
    };

    const snapped = snapStopToPolyline(offTrackStop, track);
    const proj = projectPointOntoPolyline([snapped.latitude, snapped.longitude], track);
    expect(proj.distanceMeters).toBeLessThan(1);
  });

  it('routes strictly along a local railway=tram graph via Dijkstra', () => {
    const railWays: LatLng[][] = [
      [
        [47.3235, 5.0280],
        [47.3235, 5.0300],
        [47.3235, 5.0320],
        [47.3235, 5.0340],
        [47.3235, 5.0360],
        [47.3235, 5.0380],
        [47.3235, 5.0400],
        [47.3235, 5.0420],
        [47.3235, 5.0440],
        [47.3235, 5.0460],
      ],
    ];
    const stops = [
      { id: 's1', name: 'Gare', latitude: 47.3235, longitude: 5.0280, lines: ['T1'] },
      { id: 's2', name: 'Republique', latitude: 47.3235, longitude: 5.0460, lines: ['T1'] },
    ];

    const railPath = routeOnTramRailGraph(railWays, stops);
    expect(railPath).not.toBeNull();
    expect(railPath!.length).toBe(10);
  });
});

describe('NetworkGeometryService — Official Palette, Continuity & Disk Cache', () => {
  const tempCachePath = path.join(
    os.tmpdir(),
    `diviakhaaa-shapes-test-${Date.now()}.json`
  );

  afterEach(() => {
    if (fs.existsSync(tempCachePath)) {
      fs.unlinkSync(tempCachePath);
    }
  });

  it('defines all 9 major Dijon Divia lines with exact categories and 100% unique official colors', () => {
    const expectedIds = ['T1', 'T2', 'L3', 'L4', 'L5', 'L6', 'B10', 'B12', 'B13'];
    expect(DIJON_LINES.map(l => l.id)).toEqual(expectedIds);

    const colors = DIJON_LINES.map(l => l.color.toUpperCase());
    expect(new Set(colors).size).toBe(DIJON_LINES.length);
  });

  it('guarantees zero >150m jumps on T1/T2, snaps all stations onto polylines, and caches to disk', async () => {
    const service = new NetworkGeometryService({
      cacheFilePath: tempCachePath,
      allowExternalFetch: false,
    });

    const first = await service.getNetworkShapes();
    expect(first.fromCache).toBe(false);
    expect(first.version).toBe(NETWORK_CACHE_VERSION);
    expect(first.lines.length).toBe(9);
    expect(fs.existsSync(tempCachePath)).toBe(true);

    // Verify strict continuity (< 150m jump) & snapped stations for T1 and T2
    for (const tramId of ['T1', 'T2']) {
      const tram = first.lines.find(l => l.id === tramId)!;
      expect(tram.polyline.length).toBeGreaterThan(10);
      expect(tram.returnPolyline?.length).toBeGreaterThan(10);

      for (let i = 0; i < tram.polyline.length - 1; i++) {
        const jump = calculateDistanceMeters(
          tram.polyline[i][0],
          tram.polyline[i][1],
          tram.polyline[i + 1][0],
          tram.polyline[i + 1][1]
        );
        expect(jump).toBeLessThanOrEqual(150);
      }

      for (const stop of tram.stops) {
        const proj = projectPointOntoPolyline([stop.latitude, stop.longitude], tram.polyline);
        expect(proj.distanceMeters).toBeLessThan(1.5);
      }
    }

    // Verify memory & disk cache reload
    const second = await service.getNetworkShapes();
    expect(second.fromCache).toBe(true);

    service.clearMemoryCache();
    const third = await service.getNetworkShapes({ category: 'TRAM' });
    expect(third.fromCache).toBe(true);
    expect(third.lines.map(l => l.id)).toEqual(['T1', 'T2']);
  });

  it('validates /api/network/shapes query params strictly with Zod', () => {
    expect(networkShapesQuerySchema.safeParse({}).success).toBe(true);
    expect(networkShapesQuerySchema.safeParse({ category: 'TRAM' }).success).toBe(true);
    expect(networkShapesQuerySchema.safeParse({ category: 'SUBWAY' }).success).toBe(false);
  });
});
