import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiService } from '../services/apiService';
import { geocodingService } from '../services/geocodingService';

describe('Mobile Google Places Integration & Coordinate Resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps Google Places autocomplete suggestions with needsDetails=true', async () => {
    vi.spyOn(apiService, 'fetchPlaceAutocomplete').mockResolvedValue([
      {
        placeId: 'ChIJ_dijon_toison_dor',
        label: "Centre Commercial Toison d'Or",
        secondaryText: 'Route de Langres, 21000 Dijon, France',
        type: 'poi',
        source: 'google_places',
      },
      {
        placeId: 'divia-stop:hub-darcy',
        label: 'Darcy',
        secondaryText: 'Arrêt Divia (T1, T2) · Dijon',
        type: 'stop',
        latitude: 47.3235,
        longitude: 5.0335,
        source: 'divia_local',
      },
    ]);

    const results = await geocodingService.searchAddresses('Toison');

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 'ChIJ_dijon_toison_dor',
      placeId: 'ChIJ_dijon_toison_dor',
      label: "Centre Commercial Toison d'Or",
      type: 'poi',
      needsDetails: true,
    });
    expect(results[1]).toMatchObject({
      placeId: 'divia-stop:hub-darcy',
      latitude: 47.3235,
      longitude: 5.0335,
      needsDetails: false,
    });
  });

  it('resolves exact GPS coordinates from /api/places/details when needsDetails=true', async () => {
    const detailsSpy = vi.spyOn(apiService, 'fetchPlaceDetails').mockResolvedValue({
      placeId: 'ChIJ_dijon_toison_dor',
      label: "Toison d'Or",
      formattedAddress: "Allée d'Italie, 21000 Dijon, France",
      latitude: 47.3541,
      longitude: 5.0501,
      type: 'poi',
    });

    const resolved = await geocodingService.resolveAddressCoordinates({
      id: 'ChIJ_dijon_toison_dor',
      placeId: 'ChIJ_dijon_toison_dor',
      label: "Toison d'Or",
      context: 'Dijon, France',
      latitude: 0,
      longitude: 0,
      type: 'poi',
      needsDetails: true,
    });

    expect(detailsSpy).toHaveBeenCalledWith('ChIJ_dijon_toison_dor');
    expect(resolved).not.toBeNull();
    expect(resolved?.latitude).toBeCloseTo(47.3541, 4);
    expect(resolved?.longitude).toBeCloseTo(5.0501, 4);
    expect(resolved?.needsDetails).toBe(false);
  });

  it('skips network call when address already has valid GPS coordinates', async () => {
    const detailsSpy = vi.spyOn(apiService, 'fetchPlaceDetails');

    const alreadyResolved = {
      id: 'stop-hub-darcy',
      placeId: 'divia-stop:hub-darcy',
      label: 'Darcy',
      context: 'Arrêt Divia (T1, T2)',
      latitude: 47.3235,
      longitude: 5.0335,
      type: 'stop' as const,
      needsDetails: false,
    };

    const result = await geocodingService.resolveAddressCoordinates(alreadyResolved);
    expect(detailsSpy).not.toHaveBeenCalled();
    expect(result).toEqual(alreadyResolved);
  });

  it('provides instant query search results when hitting enter/search on keyboard', async () => {
    vi.spyOn(apiService, 'fetchPlaceAutocomplete').mockResolvedValue([
      {
        placeId: 'divia-stop:hub-republique',
        label: 'République',
        secondaryText: 'Arrêt Divia (T1, T2) · Dijon',
        type: 'stop',
        latitude: 47.3262,
        longitude: 5.0461,
        source: 'divia_local',
      },
    ]);

    const results = await geocodingService.searchAddresses('Republique');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].label).toContain('République');
  });
});
