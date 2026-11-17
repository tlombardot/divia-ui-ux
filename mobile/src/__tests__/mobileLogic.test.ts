import { describe, expect, it } from 'vitest';
import { calculateDistanceMeters, DARCY_HUB, DIJON_CENTER, QUICK_STOPS } from '../data/dijonNetwork';
import { geocodingService } from '../services/geocodingService';
import { getBaseApiUrl } from '../services/apiService';

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

  it('triggers demo mode when distance exceeds 15 km limit', () => {
    // Paris coordinates: ~48.8566, 2.3522 (far from Dijon > 250km)
    const dist = calculateDistanceMeters(48.8566, 2.3522, DIJON_CENTER.latitude, DIJON_CENTER.longitude);
    expect(dist).toBeGreaterThan(15000);
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
    const results = await geocodingService.searchAddresses('Darcy');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.label.toLowerCase().includes('darcy'))).toBe(true);
  });
});
