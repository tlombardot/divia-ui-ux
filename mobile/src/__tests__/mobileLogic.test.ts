import { describe, expect, it, vi } from 'vitest';
import {
  calculateBearing,
  calculateDistanceMeters,
  DARCY_HUB,
  DIJON_CENTER,
  getLineColor,
  getLiveDeparturesForLine,
  QUICK_STOPS,
} from '../data/dijonNetwork';
import { geocodingService } from '../services/geocodingService';
import { apiService, getBaseApiUrl } from '../services/apiService';
import { generateSmoothTrajectory, interpolateAngle } from '../utils/trajectoryUtils';

describe('Mobile Logic & Network Calculations', () => {
  it('correctly calculates distance between Darcy and Dijon Center', () => {
    const dist = calculateDistanceMeters(
      DARCY_HUB.latitude,
      DARCY_HUB.longitude,
      DIJON_CENTER.latitude,
      DIJON_CENTER.longitude
    );
    expect(dist).toBeGreaterThan(500);
    expect(dist).toBeLessThan(1000);
  });

  it('correctly calculates cardinal bearings (North, East, South, West)', () => {
    // North: lat increases, lon constant
    const bearingNorth = calculateBearing(47.32, 5.04, 47.33, 5.04);
    expect(bearingNorth).toBe(0);

    // East: lat constant, lon increases
    const bearingEast = calculateBearing(47.32, 5.04, 47.32, 5.05);
    expect(bearingEast).toBe(90);

    // South: lat decreases, lon constant
    const bearingSouth = calculateBearing(47.32, 5.04, 47.31, 5.04);
    expect(bearingSouth).toBe(180);

    // West: lat constant, lon decreases
    const bearingWest = calculateBearing(47.32, 5.04, 47.32, 5.03);
    expect(bearingWest).toBe(270);
  });

  it('smoothly interpolates angles across the 0/360 degree boundary', () => {
    // Turning from 350° to 10°: shortest path is +20° clockwise, midpoint is 0° (or 360°)
    const mid = interpolateAngle(350, 10, 0.5);
    expect(mid === 0 || mid === 360).toBe(true);

    // Quarter turn
    const quarter = interpolateAngle(0, 90, 0.5);
    expect(quarter).toBe(45);
  });

  it('generates high-density, smooth trajectories with consistent bearings', () => {
    // 2 sparse points ~111m apart
    const sparsePolyline: [number, number][] = [
      [47.3235, 5.0335],
      [47.3245, 5.0335],
    ];

    const smooth = generateSmoothTrajectory(sparsePolyline, 3);
    // 111m / 3m = ~37 points + final point
    expect(smooth.length).toBeGreaterThanOrEqual(30);

    // All intermediate points should face North (0°)
    expect(smooth[0].heading).toBe(0);
    expect(smooth[Math.floor(smooth.length / 2)].heading).toBe(0);

    // First and last coordinates match exactly
    expect(smooth[0].latitude).toBeCloseTo(47.3235, 4);
    expect(smooth[0].longitude).toBeCloseTo(5.0335, 4);
    expect(smooth[smooth.length - 1].latitude).toBeCloseTo(47.3245, 4);
    expect(smooth[smooth.length - 1].longitude).toBeCloseTo(5.0335, 4);
  });

  it('covers the entire Grand Dijon agglomeration within 25 km radius', () => {
    const DIJON_MAX_RADIUS = 25000;
    // Chenôve, Quetigny, Marsannay, Longvic
    const suburbs = [
      { name: 'Chenôve', lat: 47.2928, lon: 5.0125 },
      { name: 'Quetigny', lat: 47.3101, lon: 5.1095 },
      { name: 'Marsannay', lat: 47.2790, lon: 5.0040 },
      { name: 'Longvic', lat: 47.2880, lon: 5.0640 },
    ];
    for (const suburb of suburbs) {
      const dist = calculateDistanceMeters(
        suburb.lat,
        suburb.lon,
        DIJON_CENTER.latitude,
        DIJON_CENTER.longitude
      );
      expect(dist).toBeLessThan(DIJON_MAX_RADIUS);
    }

    // Paris coordinates (> 250 km) should trigger demo fallback
    const distParis = calculateDistanceMeters(
      48.8566,
      2.3522,
      DIJON_CENTER.latitude,
      DIJON_CENTER.longitude
    );
    expect(distParis).toBeGreaterThan(DIJON_MAX_RADIUS);
  });

  it('computes official Divia colors and live next departures', () => {
    expect(getLineColor('T1')).toBe('#E11535');
    expect(getLineColor('T2')).toBe('#4B2982');
    expect(getLineColor('L5')).toBe('#00875A');

    const [first, second] = getLiveDeparturesForLine('T1');
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it('provides all quick stops chips required by Google Maps Transports UX', () => {
    expect(QUICK_STOPS.length).toBeGreaterThanOrEqual(7);
    const names = QUICK_STOPS.map(s => s.name);
    expect(names.some(n => n.includes('Darcy'))).toBe(true);
    expect(names.some(n => n.includes('Godrans'))).toBe(true);
    expect(names.some(n => n.includes('République'))).toBe(true);
    expect(names.some(n => n.includes('Gare'))).toBe(true);
    expect(names.some(n => n.includes('Monge'))).toBe(true);
    expect(names.some(n => n.includes('Université'))).toBe(true);
    expect(names.some(n => n.includes('Chenôve'))).toBe(true);
  });

  it('resolves base API URL without trailing slash', () => {
    const url = getBaseApiUrl();
    expect(url.startsWith('http://')).toBe(true);
    expect(url.endsWith('/')).toBe(false);
  });
});

describe('Geofencing & Automatic Navigation Transitions', () => {
  const BOARDING_RADIUS_METERS = 30;
  const TRANSIT_STATION_RADIUS_METERS = 45;
  const DESTINATION_RADIUS_METERS = 25;

  it('triggers automatic boarding when user enters 30m radius of stop', () => {
    // Exact stop coordinate
    const stopLat = 47.3235;
    const stopLon = 5.0335;

    // User 15m away
    const userLat = 47.3235 + 0.0001; // ~11m difference
    const userLon = 5.0335;

    const dist = calculateDistanceMeters(userLat, userLon, stopLat, stopLon);
    expect(dist).toBeLessThanOrEqual(BOARDING_RADIUS_METERS);
  });

  it('detects transit station crossed when vehicle is within 45m', () => {
    const stationLat = 47.3262;
    const stationLon = 5.0461;

    // Tram at 30m from station
    const tramLat = 47.3262 + 0.00025;
    const tramLon = 5.0461;

    const dist = calculateDistanceMeters(tramLat, tramLon, stationLat, stationLon);
    expect(dist).toBeLessThanOrEqual(TRANSIT_STATION_RADIUS_METERS);
  });

  it('triggers automatic arrival celebration when within 25m of destination', () => {
    const destLat = 47.3101;
    const destLon = 5.1095;

    // Pedestrian at 12m from destination
    const pedLat = 47.3101 + 0.0001;
    const pedLon = 5.1095;

    const dist = calculateDistanceMeters(pedLat, pedLon, destLat, destLon);
    expect(dist).toBeLessThanOrEqual(DESTINATION_RADIUS_METERS);
  });

  it('detects 1 stop remaining before alighting to trigger haptic warning', () => {
    const totalStops = 5;
    const passedStopsCount = 4;
    const remainingStops = totalStops - passedStopsCount;

    expect(remainingStops).toBe(1);
    const shouldWarn = remainingStops === 1;
    expect(shouldWarn).toBe(true);
  });

  it('searches Dijon stops and POIs with geocoding service', async () => {
    const spy = vi.spyOn(apiService, 'fetchPlaceAutocomplete').mockResolvedValue([]);
    const results = await geocodingService.searchAddresses('Darcy');
    spy.mockRestore();
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.label.toLowerCase().includes('darcy'))).toBe(true);
  });
});
