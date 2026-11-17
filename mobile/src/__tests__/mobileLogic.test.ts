import { describe, expect, it } from 'vitest';
import { calculateDistanceMeters, DARCY_HUB, DIJON_CENTER, QUICK_STOPS } from '../data/dijonNetwork';
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

  it('provides all 7 quick stops chips required by Google Maps Transports UX', () => {
    expect(QUICK_STOPS.length).toBe(7);
    const names = QUICK_STOPS.map(s => s.name);
    expect(names).toContain('Darcy');
    expect(names).toContain('Godrans');
    expect(names).toContain('République');
    expect(names).toContain('Gare SNCF');
    expect(names).toContain('Monge');
    expect(names).toContain('Université');
    expect(names).toContain('Chenôve Centre');
  });

  it('resolves base API URL without trailing slash', () => {
    const url = getBaseApiUrl();
    expect(url.startsWith('http://')).toBe(true);
    expect(url.endsWith('/')).toBe(false);
  });
});
