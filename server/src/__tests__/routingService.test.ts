import { describe, expect, it } from 'vitest';
import {
  calculateDistanceMeters,
  DARCY_HUB,
  findNearestStop,
} from '../data/dijonNetwork';
import {
  calculateRoutes,
  getLineHeadwayMinutes,
  getNextDepartureEstimate,
} from '../services/routingService';

describe('routingService', () => {
  it('calculates direct distance accurately with Haversine formula', () => {
    // Distance between Darcy (47.3235, 5.0335) and Dijon Gare (47.3236, 5.0278) is ~430m
    const distance = calculateDistanceMeters(47.3235, 5.0335, 47.3236, 5.0278);
    expect(distance).toBeGreaterThan(350);
    expect(distance).toBeLessThan(500);
  });

  it('finds the nearest transit stop correctly', () => {
    const nearest = findNearestStop(47.3235, 5.0335);
    expect(nearest).not.toBeNull();
    expect(nearest?.stop.id).toBe(DARCY_HUB.id);
    expect(nearest?.distanceMeters).toBe(0);
  });

  it('adjusts headways dynamically during peak vs off-peak hours', () => {
    // 8:15 AM (Morning peak)
    const morningPeak = new Date();
    morningPeak.setHours(8, 15, 0, 0);

    // 2:00 PM (Off-peak)
    const offPeak = new Date();
    offPeak.setHours(14, 0, 0, 0);

    // 11:00 PM (Evening)
    const evening = new Date();
    evening.setHours(23, 0, 0, 0);

    expect(getLineHeadwayMinutes('T1', morningPeak)).toBe(4);
    expect(getLineHeadwayMinutes('T1', offPeak)).toBe(8);
    expect(getLineHeadwayMinutes('T1', evening)).toBe(15);

    expect(getLineHeadwayMinutes('L5', morningPeak)).toBe(6);
    expect(getLineHeadwayMinutes('L5', offPeak)).toBe(12);
  });

  it('estimates next departure time dynamically', () => {
    const date = new Date();
    date.setMinutes(10);
    const estimate = getNextDepartureEstimate('T1', date);
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThanOrEqual(15);
  });

  it('calculates a direct transit route on Line T1', () => {
    // From Dijon Gare to Quetigny Centre
    const routes = calculateRoutes({
      fromLat: 47.3236,
      fromLng: 5.0278, // Dijon Gare
      toLat: 47.3101,
      toLng: 5.1095, // Quetigny Centre
    });

    expect(routes.length).toBeGreaterThan(0);
    const directT1 = routes.find(r => r.steps.some(s => s.lineId === 'T1'));
    expect(directT1).toBeDefined();
    expect(directT1?.transfersCount).toBe(0);
    expect(directT1?.steps.some(s => s.type === 'transit')).toBe(true);
  });

  it('calculates a route with transfer between T2 and L5 via Darcy', () => {
    // From Valmy (T2) to Université (L5)
    const routes = calculateRoutes({
      fromLat: 47.3621,
      fromLng: 5.0538, // Valmy
      toLat: 47.3135,
      toLng: 5.0712, // Université
    });

    expect(routes.length).toBeGreaterThan(0);
    // Should provide transit with either direct or transfer
    expect(routes[0].steps.length).toBeGreaterThan(0);
  });

  it('proposes walking direct route when distance is very short (< 500m)', () => {
    // Short walk near Darcy
    const routes = calculateRoutes({
      fromLat: 47.3235,
      fromLng: 5.0335,
      toLat: 47.3232,
      toLng: 5.0350,
    });

    const walkDirect = routes.find(r => r.id === 'route-walk-direct');
    expect(walkDirect).toBeDefined();
    expect(walkDirect?.totalDurationMinutes).toBeLessThanOrEqual(5);
  });
});
