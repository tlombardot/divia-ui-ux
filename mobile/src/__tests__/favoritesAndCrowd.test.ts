import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it } from 'vitest';
import { HUB_DARCY, HUB_UNIVERSITE } from '../data/dijonNetwork';
import {
  FAVORITE_STATIONS_STORAGE_KEY,
  resolveAndSortFavoriteStops,
  toggleFavoriteId,
} from '../hooks/useFavoriteStations';
import { Report } from '../types';
import {
  computeStationCrowdStatus,
  estimateClientCrowdLevel,
  formatCrowdSourceLabel,
  getCrowdBadgeTheme,
} from '../utils/crowdUtils';

describe('Favorite Stations — Persistence & Proximity Sorting', () => {
  it('toggles station IDs cleanly without duplicates', () => {
    const step1 = toggleFavoriteId([], 'hub-darcy');
    expect(step1).toEqual(['hub-darcy']);

    const step2 = toggleFavoriteId(step1, 'hub-universite');
    expect(step2).toEqual(['hub-universite', 'hub-darcy']);

    const step3 = toggleFavoriteId(step2, 'hub-darcy');
    expect(step3).toEqual(['hub-universite']);
  });

  it('sorts resolved favorite stations by proximity to user GPS location', () => {
    // User standing right next to Université
    const userNearUniv = {
      latitude: HUB_UNIVERSITE.latitude,
      longitude: HUB_UNIVERSITE.longitude,
      isDemoMode: false,
    };

    const sortedNearUniv = resolveAndSortFavoriteStops(
      ['hub-darcy', 'hub-universite'],
      userNearUniv
    );
    expect(sortedNearUniv[0].id).toBe('hub-universite');
    expect(sortedNearUniv[1].id).toBe('hub-darcy');

    // User standing right next to Darcy
    const userNearDarcy = {
      latitude: HUB_DARCY.latitude,
      longitude: HUB_DARCY.longitude,
      isDemoMode: false,
    };

    const sortedNearDarcy = resolveAndSortFavoriteStops(
      ['hub-universite', 'hub-darcy'],
      userNearDarcy
    );
    expect(sortedNearDarcy[0].id).toBe('hub-darcy');
    expect(sortedNearDarcy[1].id).toBe('hub-universite');
  });

  it('persists and restores favorite station IDs via AsyncStorage', async () => {
    const sample = ['hub-darcy', 'hub-gare'];
    await AsyncStorage.setItem(FAVORITE_STATIONS_STORAGE_KEY, JSON.stringify(sample));

    const raw = await AsyncStorage.getItem(FAVORITE_STATIONS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(sample);
  });
});

describe('Crowd Reporting & Formatting Utils', () => {
  it('returns official Divia-aligned themes for LOW, MEDIUM and HIGH crowd levels', () => {
    const low = getCrowdBadgeTheme('LOW');
    expect(low.label).toBe('Calme');
    expect(low.color).toBe('#00875A');

    const medium = getCrowdBadgeTheme('MEDIUM');
    expect(medium.label).toBe('Chargé');
    expect(medium.color).toBe('#D97706');

    const high = getCrowdBadgeTheme('HIGH');
    expect(high.label).toBe('Bondé');
    expect(high.color).toBe('#E11535');
  });

  it('aggregates active community CROWD reports into source="community" and formats labels', () => {
    const now = Date.now();
    const mockReports: Report[] = [
      {
        id: 'crowd-1',
        type: 'CROWD',
        stopId: 'hub-darcy',
        stopName: 'Darcy',
        lineId: 'T1',
        lineName: 'T1',
        latitude: 47.3235,
        longitude: 5.0335,
        direction: 'Quai',
        crowdLevel: 'HIGH',
        reportedAt: now - 3 * 60 * 1000,
        expiresAt: now + 22 * 60 * 1000,
        upvotes: 3,
        downvotes: 0,
        reliabilityScore: 90,
        status: 'active',
      },
      {
        id: 'crowd-2',
        type: 'CROWD',
        stopId: 'hub-darcy',
        stopName: 'Darcy',
        lineId: 'T1',
        lineName: 'T1',
        latitude: 47.3235,
        longitude: 5.0335,
        direction: 'Quai',
        crowdLevel: 'HIGH',
        reportedAt: now - 1 * 60 * 1000,
        expiresAt: now + 24 * 60 * 1000,
        upvotes: 1,
        downvotes: 0,
        reliabilityScore: 80,
        status: 'active',
      },
    ];

    const status = computeStationCrowdStatus('hub-darcy', mockReports, 'T1', new Date(now));
    expect(status.source).toBe('community');
    expect(status.level).toBe('HIGH');
    expect(status.label).toBe('Bondé');
    expect(formatCrowdSourceLabel(status)).toBe('Vérifié (2 usagers)');
  });

  it('estimates crowd accurately during rush hours vs off-peak when no community votes exist', () => {
    const weekdayRush = new Date(2026, 10, 17, 17, 30, 0);
    expect(estimateClientCrowdLevel('T1', weekdayRush)).toBe('HIGH');

    const weekdayOffPeak = new Date(2026, 10, 17, 14, 30, 0);
    expect(estimateClientCrowdLevel('T1', weekdayOffPeak)).toBe('LOW');

    const status = computeStationCrowdStatus('hub-republique', [], 'T1', weekdayOffPeak);
    expect(status.source).toBe('estimated');
    expect(status.level).toBe('LOW');
    expect(formatCrowdSourceLabel(status)).toBe('Estimé (horaire)');
  });
});
