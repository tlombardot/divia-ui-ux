import { describe, expect, it } from 'vitest';
import {
  calculateDistanceMeters,
  findNearestStop,
} from '../data/dijonNetwork';
import { getPedestrianRoute } from '../services/pedestrianService';
import {
  calculateRoutes,
  getLineHeadwayMinutes,
  getNextDepartureEstimate,
} from '../services/routingService';

describe('routingService — Door-to-Door & Dijkstra Multi-Segments', () => {
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
    expect(getLineHeadwayMinutes('L5', offPeak)).toBe(11);
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

  it('calculates door-to-door route with multiple segments (WALK, TRANSIT)', async () => {
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
    const transitRoute = routes.find(r => r.transitDurationMinutes > 0);
    expect(transitRoute).toBeDefined();

    if (transitRoute) {
      expect(transitRoute.segments.length).toBeGreaterThanOrEqual(2);
      expect(transitRoute.segments[0].type).toBe('WALK');
      expect(transitRoute.segments.some(s => s.type === 'TRANSIT')).toBe(true);
      expect(transitRoute.fullPolyline.length).toBeGreaterThan(5);
    }
  });

  it('proposes 100% walking alternative when distance is under 2.2 km', async () => {
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
});
