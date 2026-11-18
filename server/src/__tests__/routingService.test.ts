import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateDistanceMeters,
  DIJON_LINES,
  findNearestStop,
  HUB_DARCY,
  HUB_GARE,
  HUB_GODRANS,
  HUB_REPUBLIQUE,
  HUB_UNIVERSITE,
} from '../data/dijonNetwork';
import { networkGeometryService } from '../services/networkGeometryService';
import { getPedestrianRoute } from '../services/pedestrianService';
import {
  calculateRoutes,
  getLineHeadwayMinutes,
  getNextDepartureEstimate,
} from '../services/routingService';
import { projectPointOntoPolyline } from '../utils/geometryTopology';

describe('routingService — Door-to-Door & Anti-Detour Dijkstra', () => {
  beforeEach(() => {
    vi.spyOn(networkGeometryService, 'getCachedLinesSync').mockReturnValue(DIJON_LINES);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('calculates direct distance accurately with Haversine formula', () => {
    // Darcy (47.3235, 5.0335) to Gare (47.3236, 5.0278) is ~430m
    const distance = calculateDistanceMeters(47.3235, 5.0335, 47.3236, 5.0278);
    expect(distance).toBeGreaterThan(350);
    expect(distance).toBeLessThan(500);
  });

  it('finds the nearest transit stop correctly', () => {
    const nearest = findNearestStop(47.3235, 5.0335);
    expect(nearest).not.toBeNull();
    expect(nearest?.stop.name).toBe('Darcy');
    expect(nearest?.distanceMeters).toBe(0);
  });

  it('adjusts headways dynamically during peak vs off-peak hours', () => {
    const morningPeak = new Date();
    morningPeak.setHours(8, 15, 0, 0);

    const offPeak = new Date();
    offPeak.setHours(14, 0, 0, 0);

    const evening = new Date();
    evening.setHours(23, 0, 0, 0);

    expect(getLineHeadwayMinutes('T1', morningPeak)).toBe(4);
    expect(getLineHeadwayMinutes('T1', offPeak)).toBe(8);
    expect(getLineHeadwayMinutes('T1', evening)).toBe(15);

    expect(getLineHeadwayMinutes('L5', morningPeak)).toBe(6);
    expect(getLineHeadwayMinutes('L5', offPeak)).toBe(10);
  });

  it('estimates next departure time dynamically', () => {
    const date = new Date();
    date.setMinutes(10);
    const estimate = getNextDepartureEstimate('T1', date);
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThanOrEqual(15);
  });

  it('computes pedestrian route with polyline and turn instructions (with graceful fallback)', async () => {
    const route = await getPedestrianRoute(47.3235, 5.0335, 47.3232, 5.0401, 'Godrans');
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.durationMinutes).toBeGreaterThan(0);
    expect(route.polyline.length).toBeGreaterThanOrEqual(2);
    expect(route.turnInstructions.length).toBeGreaterThan(0);
  });

  it('calculates door-to-door route with multiple segments without absurd detours', async () => {
    // From 12 Rue de la Liberté (~47.3228, 5.0380) to Quetigny Centre (~47.3101, 5.1095)
    const routes = await calculateRoutes({
      fromLat: 47.3228,
      fromLng: 5.0380,
      fromLabel: '12 Rue de la Liberté',
      toLat: 47.3101,
      toLng: 5.1095,
      toLabel: 'Quetigny Centre',
    });

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.length).toBeLessThanOrEqual(4); // Max 4 alternatives

    const best = routes[0];
    expect(best.segments.length).toBeGreaterThanOrEqual(2);
    expect(best.segments[0].type).toBe('WALK');

    // Verification of estimatedStopTimes for transit segments
    const transitSeg = best.segments.find(s => s.type === 'TRANSIT');
    if (transitSeg && transitSeg.passedStops && transitSeg.passedStops.length > 0) {
      expect(transitSeg.estimatedStopTimes).toBeDefined();
      expect(transitSeg.estimatedStopTimes?.length).toBe(transitSeg.passedStops.length);
    }
  });

  it('eliminates detours exceeding +35% of optimal transit duration', async () => {
    // From Darcy to Université (Campus)
    const routes = await calculateRoutes({
      fromLat: 47.3235,
      fromLng: 5.0335,
      fromLabel: 'Place Darcy',
      toLat: 47.3135,
      toLng: 5.0712,
      toLabel: 'Université',
    });

    expect(routes.length).toBeGreaterThan(0);
    const transitRoutes = routes.filter(r => r.transitDurationMinutes > 0);
    if (transitRoutes.length > 1) {
      const bestDuration = transitRoutes[0].totalDurationMinutes;
      for (const r of transitRoutes) {
        expect(r.totalDurationMinutes).toBeLessThanOrEqual(Math.round(bestDuration * 1.35) + 1);
      }
    }
  });

  it('proposes 100% walking alternative when distance is under 2.5 km', async () => {
    // Short distance near Darcy to République (~1 km)
    const routes = await calculateRoutes({
      fromLat: 47.3235,
      fromLng: 5.0335,
      fromLabel: 'Place Darcy',
      toLat: 47.3262,
      toLng: 5.0461,
      toLabel: 'Place de la République',
    });

    const walkOption = routes.find(r => r.title.includes('100% à pied') || r.summary.includes('À pied direct'));
    expect(walkOption).toBeDefined();
    expect(walkOption?.transitDurationMinutes).toBe(0);
  });

  it('routes Gare SNCF -> République via pedestrian center (Godrans) along real T1 rails, never outer car roads', async () => {
    const routes = await calculateRoutes({
      fromLat: HUB_GARE.latitude,
      fromLng: HUB_GARE.longitude,
      fromLabel: 'Dijon Gare',
      toLat: HUB_REPUBLIQUE.latitude,
      toLng: HUB_REPUBLIQUE.longitude,
      toLabel: 'République',
    });

    const t1Route = routes.find(r =>
      r.segments.some(s => s.type === 'TRANSIT' && s.lineId === 'T1')
    );
    expect(t1Route).toBeDefined();

    const t1Seg = t1Route!.segments.find(s => s.type === 'TRANSIT' && s.lineId === 'T1')!;
    expect(t1Seg.polyline.length).toBeGreaterThanOrEqual(4);

    // Must pass directly through Godrans Les Halles pedestrian tram zone (< 50 m of resolved stop, never outer car roads)
    const godransStop = t1Seg.passedStops?.find(s => s.id === HUB_GODRANS.id) || HUB_GODRANS;
    const projGodrans = projectPointOntoPolyline(
      [godransStop.latitude, godransStop.longitude],
      t1Seg.polyline
    );
    expect(projGodrans.distanceMeters).toBeLessThan(50);
    expect(
      calculateDistanceMeters(
        godransStop.latitude,
        godransStop.longitude,
        HUB_GODRANS.latitude,
        HUB_GODRANS.longitude
      )
    ).toBeLessThan(300);
  });

  it('routes Darcy -> Université on T1 using sliced rail geometry and realistic 22 km/h duration', async () => {
    const routes = await calculateRoutes({
      fromLat: HUB_DARCY.latitude,
      fromLng: HUB_DARCY.longitude,
      fromLabel: 'Darcy',
      toLat: HUB_UNIVERSITE.latitude,
      toLng: HUB_UNIVERSITE.longitude,
      toLabel: 'Université',
    });

    const t1Route = routes.find(r =>
      r.segments.some(s => s.type === 'TRANSIT' && s.lineId === 'T1')
    );
    expect(t1Route).toBeDefined();

    const t1Seg = t1Route!.segments.find(s => s.type === 'TRANSIT' && s.lineId === 'T1')!;
    expect(t1Seg.direction).toContain('Quetigny');
    expect(t1Seg.durationMinutes).toBeGreaterThanOrEqual(8);
    expect(t1Seg.durationMinutes).toBeLessThanOrEqual(24);

    // Confirm sliced rail polyline crosses Godrans Les Halles (< 50 m of resolved stop)
    const godransStop = t1Seg.passedStops?.find(s => s.id === HUB_GODRANS.id) || HUB_GODRANS;
    const projGodrans = projectPointOntoPolyline(
      [godransStop.latitude, godransStop.longitude],
      t1Seg.polyline
    );
    expect(projGodrans.distanceMeters).toBeLessThan(50);
  });

  it('enforces strict reverse directional order on République -> Dijon Gare (T1 Retour)', async () => {
    const routes = await calculateRoutes({
      fromLat: HUB_REPUBLIQUE.latitude,
      fromLng: HUB_REPUBLIQUE.longitude,
      fromLabel: 'République',
      toLat: HUB_GARE.latitude,
      toLng: HUB_GARE.longitude,
      toLabel: 'Dijon Gare',
    });

    const t1Route = routes.find(r =>
      r.segments.some(s => s.type === 'TRANSIT' && s.lineId === 'T1')
    );
    expect(t1Route).toBeDefined();

    const t1Seg = t1Route!.segments.find(s => s.type === 'TRANSIT' && s.lineId === 'T1')!;
    expect(t1Seg.direction).toContain('Dijon Gare');
    expect(t1Seg.passedStops?.[0].id).toBe(HUB_REPUBLIQUE.id);
    expect(t1Seg.passedStops?.[t1Seg.passedStops.length - 1].id).toBe(HUB_GARE.id);
  });
});
