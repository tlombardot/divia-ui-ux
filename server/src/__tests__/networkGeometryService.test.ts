import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { DIJON_LINES } from '../data/dijonNetwork';
import { NetworkGeometryService } from '../services/networkGeometryService';
import { networkShapesQuerySchema } from '../types';

describe('NetworkGeometryService — Official Palette, Shapes & Disk/Memory Cache', () => {
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

    // Every color must be strictly unique
    const colors = DIJON_LINES.map(l => l.color.toUpperCase());
    expect(new Set(colors).size).toBe(DIJON_LINES.length);

    // Check categories
    expect(DIJON_LINES.filter(l => l.category === 'TRAM').map(l => l.id)).toEqual(['T1', 'T2']);
    expect(DIJON_LINES.filter(l => l.category === 'LIANE').map(l => l.id)).toEqual([
      'L3',
      'L4',
      'L5',
      'L6',
    ]);
    expect(DIJON_LINES.filter(l => l.category === 'BUS').map(l => l.id)).toEqual([
      'B10',
      'B12',
      'B13',
    ]);

    // Check official palette samples
    expect(DIJON_LINES.find(l => l.id === 'T1')?.color).toBe('#E11535');
    expect(DIJON_LINES.find(l => l.id === 'T2')?.color).toBe('#4B2982');
    expect(DIJON_LINES.find(l => l.id === 'L3')?.color).toBe('#F39200');
    expect(DIJON_LINES.find(l => l.id === 'L4')?.color).toBe('#009FE3');
    expect(DIJON_LINES.find(l => l.id === 'L5')?.color).toBe('#00875A');
    expect(DIJON_LINES.find(l => l.id === 'L6')?.color).toBe('#D81B60');
    expect(DIJON_LINES.find(l => l.id === 'B10')?.color).toBe('#00695C');
    expect(DIJON_LINES.find(l => l.id === 'B12')?.color).toBe('#6D4C41');
    expect(DIJON_LINES.find(l => l.id === 'B13')?.color).toBe('#3949AB');
  });

  it('gracefully falls back when external APIs are offline and persists to disk/memory cache', async () => {
    const service = new NetworkGeometryService({
      cacheFilePath: tempCachePath,
      allowExternalFetch: false,
    });

    // First call generates & writes disk cache
    const first = await service.getNetworkShapes();
    expect(first.fromCache).toBe(false);
    expect(first.lines.length).toBe(9);
    expect(fs.existsSync(tempCachePath)).toBe(true);

    for (const line of first.lines) {
      expect(line.polyline.length).toBeGreaterThanOrEqual(2);
      expect(line.terminusA.length).toBeGreaterThan(0);
      expect(line.terminusB.length).toBeGreaterThan(0);
      expect(line.shapeSource).toBe('fallback');
    }

    // Second call serves instantaneously from memory cache
    const second = await service.getNetworkShapes();
    expect(second.fromCache).toBe(true);
    expect(second.lines.length).toBe(9);

    // Clearing memory cache still reloads instantaneously from disk cache
    service.clearMemoryCache();
    const third = await service.getNetworkShapes({ category: 'TRAM' });
    expect(third.fromCache).toBe(true);
    expect(third.lines.map(l => l.id)).toEqual(['T1', 'T2']);
  });

  it('validates /api/network/shapes query params strictly with Zod', () => {
    expect(networkShapesQuerySchema.safeParse({}).success).toBe(true);
    expect(networkShapesQuerySchema.safeParse({ category: 'TRAM' }).success).toBe(true);
    expect(networkShapesQuerySchema.safeParse({ category: 'SUBWAY' }).success).toBe(false);
    const parsedRefresh = networkShapesQuerySchema.safeParse({ refresh: 'true' });
    expect(parsedRefresh.success).toBe(true);
    if (parsedRefresh.success) {
      expect(parsedRefresh.data.refresh).toBe(true);
    }
  });
});
