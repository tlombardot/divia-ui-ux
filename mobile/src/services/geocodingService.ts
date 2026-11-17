import { ALL_DIJON_STOPS } from '../data/dijonNetwork';
import { GeocodedAddress } from '../types';
import { apiService } from './apiService';

interface BANFeature {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    id: string;
    label: string;
    context: string;
    city: string;
    type: string;
  };
}

interface BANResponse {
  features: BANFeature[];
}

export class GeocodingService {
  /**
   * Recherche d'adresses, commerces et arrêts à Dijon :
   * 1. Proxy serveur Google Places API (New) (/api/places/autocomplete)
   * 2. Repli automatique local Divia + Base Adresse Nationale (BAN) si hors-ligne
   */
  public async searchAddresses(query: string): Promise<GeocodedAddress[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    // 1. Proxy sécurisé serveur (Google Places API New biaisé sur Dijon)
    const serverSuggestions = await apiService.fetchPlaceAutocomplete(trimmed);
    if (serverSuggestions.length > 0) {
      return serverSuggestions.map(s => ({
        id: s.placeId,
        placeId: s.placeId,
        label: s.label,
        context: s.secondaryText,
        latitude: s.latitude ?? 0,
        longitude: s.longitude ?? 0,
        type: s.type,
        needsDetails: s.latitude === undefined || s.longitude === undefined,
      }));
    }

    // 2. Repli hors-ligne : arrêts Divia locaux + Base Adresse Nationale
    const lower = trimmed.toLowerCase();
    const results: GeocodedAddress[] = [];

    const matchedStops = ALL_DIJON_STOPS.filter(stop =>
      stop.name.toLowerCase().includes(lower)
    ).slice(0, 3);

    for (const stop of matchedStops) {
      results.push({
        id: `stop-${stop.id}`,
        placeId: `divia-stop:${stop.id}`,
        label: stop.name,
        context: `Arrêt Divia (${stop.lines.join(', ')})`,
        latitude: stop.latitude,
        longitude: stop.longitude,
        type: 'stop',
        needsDetails: false,
      });
    }

    try {
      const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
        lower
      )}&lat=47.3220&lon=5.0415&limit=5`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as BANResponse;
        if (data.features) {
          for (const feat of data.features) {
            const [lon, lat] = feat.geometry.coordinates;
            results.push({
              id: feat.properties.id || `ban-${lat}-${lon}`,
              label: feat.properties.label,
              context: feat.properties.context || feat.properties.city || 'Dijon',
              latitude: lat,
              longitude: lon,
              type: 'address',
              needsDetails: false,
            });
          }
        }
      }
    } catch {
      const mockPois = [
        { label: 'Gare SNCF de Dijon', context: 'Cour de la Gare, 21000 Dijon', lat: 47.3236, lon: 5.0278 },
        { label: 'Centre Commercial Toison d\'Or', context: 'Allée d\'Italie, 21000 Dijon', lat: 47.3541, lon: 5.0501 },
        { label: 'Cité Internationale de la Gastronomie', context: '12 Parvis de l\'Unesco, 21000 Dijon', lat: 47.3178, lon: 5.0345 },
        { label: 'Université de Bourgogne (Campus)', context: 'Boulevard Gabriel, 21000 Dijon', lat: 47.3135, lon: 5.0712 },
        { label: 'Place Darcy', context: '21000 Dijon', lat: 47.3235, lon: 5.0335 },
      ];

      for (const poi of mockPois) {
        if (poi.label.toLowerCase().includes(lower) && !results.some(r => r.label === poi.label)) {
          results.push({
            id: `poi-${poi.lat}-${poi.lon}`,
            label: poi.label,
            context: poi.context,
            latitude: poi.lat,
            longitude: poi.lon,
            type: 'poi',
            needsDetails: false,
          });
        }
      }
    }

    return results;
  }

  /**
   * Résout les coordonnées GPS exactes d'une suggestion Google Places via /api/places/details
   */
  public async resolveAddressCoordinates(
    address: GeocodedAddress
  ): Promise<GeocodedAddress | null> {
    if (!address.needsDetails && (address.latitude !== 0 || address.longitude !== 0)) {
      return address;
    }

    if (!address.placeId) {
      return null;
    }

    const details = await apiService.fetchPlaceDetails(address.placeId);
    if (!details) {
      return null;
    }

    return {
      ...address,
      label: details.label || address.label,
      context: details.formattedAddress || address.context,
      latitude: details.latitude,
      longitude: details.longitude,
      type: details.type || address.type,
      needsDetails: false,
    };
  }
}

export const geocodingService = new GeocodingService();
