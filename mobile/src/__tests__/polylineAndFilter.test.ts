import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it } from 'vitest';
import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  DIJON_LINES,
  HUB_DARCY,
} from '../data/dijonNetwork';
import {
  applyLineFilterPreset,
  filterVisibleStops,
  LINE_FILTER_STORAGE_KEY,
  toggleLineId,
} from '../hooks/useLineFilter';
import {
  computeCorridorOffsets,
  pointToSegmentDistanceMeters,
} from '../utils/polylineOffset';

describe('Parallel Corridor Polyline Offset Algorithm', () => {
  it('computes accurate point-to-segment distance in meters', () => {
    const a: [number, number] = [47.3235, 5.0335];
    const b: [number, number] = [47.3235, 5.0401];

    // Point lying directly on segment
    const onSeg: [number, number] = [47.3235, 5.0368];
    expect(pointToSegmentDistanceMeters(onSeg, a, b)).toBeLessThan(1);

    // Point shifted ~50m North
    const north50m: [number, number] = [47.3235 + 50 / 111320, 5.0368];
    const dist = pointToSegmentDistanceMeters(north50m, a, b);
    expect(dist).toBeGreaterThan(48);
    expect(dist).toBeLessThan(52);
  });

  it('keeps an isolated single visible line strictly unshifted (0m offset)', () => {
    const t1Only = DIJON_LINES.filter(l => l.id === 'T1');
    const results = computeCorridorOffsets(t1Only, 15, 10);

    expect(results.length).toBe(1);
    expect(results[0].hasCorridorOverlap).toBe(false);
    expect(results[0].coordinates[0].latitude).toBeCloseTo(t1Only[0].polyline[0][0], 7);
    expect(results[0].coordinates[0].longitude).toBeCloseTo(t1Only[0].polyline[0][1], 7);
  });

  it('separates overlapping T1 and T2 lines cleanly with fine ±2.5m max offset on their shared Dijon trunk corridor', () => {
    const trams = DIJON_LINES.filter(l => l.id === 'T1' || l.id === 'T2');
    const results = computeCorridorOffsets(trams, 15, 5, 2.5);

    const t1Res = results.find(r => r.line.id === 'T1')!;
    const t2Res = results.find(r => r.line.id === 'T2')!;

    expect(t1Res.hasCorridorOverlap).toBe(true);
    expect(t2Res.hasCorridorOverlap).toBe(true);

    // Find Darcy point in each polyline
    const t1DarcyIdx = t1Res.line.polyline.findIndex(
      ([lat, lon]) => calculateDistanceMeters(lat, lon, HUB_DARCY.latitude, HUB_DARCY.longitude) < 5
    );
    const t2DarcyIdx = t2Res.line.polyline.findIndex(
      ([lat, lon]) => calculateDistanceMeters(lat, lon, HUB_DARCY.latitude, HUB_DARCY.longitude) < 5
    );

    const t1DarcyPt = t1Res.coordinates[t1DarcyIdx];
    const t2DarcyPt = t2Res.coordinates[t2DarcyIdx];

    // Each tram stays within <= 3m of the actual rail center (never spilling into buildings)
    const t1ShiftFromRail = calculateDistanceMeters(
      t1DarcyPt.latitude,
      t1DarcyPt.longitude,
      HUB_DARCY.latitude,
      HUB_DARCY.longitude
    );
    const t2ShiftFromRail = calculateDistanceMeters(
      t2DarcyPt.latitude,
      t2DarcyPt.longitude,
      HUB_DARCY.latitude,
      HUB_DARCY.longitude
    );
    expect(t1ShiftFromRail).toBeLessThanOrEqual(3);
    expect(t2ShiftFromRail).toBeLessThanOrEqual(3);

    // Total separation between T1 (-2.5m) and T2 (+2.5m) is ~5m
    const separationMeters = calculateDistanceMeters(
      t1DarcyPt.latitude,
      t1DarcyPt.longitude,
      t2DarcyPt.latitude,
      t2DarcyPt.longitude
    );
    expect(separationMeters).toBeGreaterThanOrEqual(3);
    expect(separationMeters).toBeLessThanOrEqual(7);
  });
});

describe('Map Line Filter & Station Synchronization', () => {
  it('resolves all 4 quick presets accurately', () => {
    expect(applyLineFilterPreset(DIJON_LINES, 'all').length).toBe(9);
    expect(applyLineFilterPreset(DIJON_LINES, 'trams')).toEqual(['T1', 'T2']);
    expect(applyLineFilterPreset(DIJON_LINES, 'trams_lianes')).toEqual([
      'T1',
      'T2',
      'L3',
      'L4',
      'L5',
      'L6',
    ]);
    expect(applyLineFilterPreset(DIJON_LINES, 'none')).toEqual([]);
  });

  it('toggles individual lines cleanly', () => {
    const added = toggleLineId(['T1'], 'T2');
    expect(added).toEqual(['T1', 'T2']);

    const removed = toggleLineId(added, 'T1');
    expect(removed).toEqual(['T2']);
  });

  it('filters stations by active lines while always preserving favorite & selected stops', () => {
    // Only T1 visible, but user has B12's Plombières pinned as a favorite!
    const visible = filterVisibleStops(
      ALL_DIJON_STOPS,
      ['T1'],
      ['b12-plombieres'],
      't2-valmy'
    );

    const ids = visible.map(s => s.id);
    // T1 stops are visible
    expect(ids).toContain('t1-quetigny');
    // Favorite stop on hidden line B12 MUST remain visible
    expect(ids).toContain('b12-plombieres');
    // Currently selected stop MUST remain visible
    expect(ids).toContain('t2-valmy');
    // Unrelated stop on hidden line B13 is hidden
    expect(ids).not.toContain('b13-mottegiron');
  });

  it('persists visible line IDs in AsyncStorage', async () => {
    const saved = ['T1', 'T2', 'L5'];
    await AsyncStorage.setItem(LINE_FILTER_STORAGE_KEY, JSON.stringify(saved));
    const raw = await AsyncStorage.getItem(LINE_FILTER_STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual(saved);
  });
});
