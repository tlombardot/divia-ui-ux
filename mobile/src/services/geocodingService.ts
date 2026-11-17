import { ALL_DIJON_STOPS } from '../data/dijonNetwork';
import { GeocodedAddress } from '../types';

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
   * Rechercher des adresses ou arrêts à Dijon (Base Adresse Nationale + Réseau Divia)
   */
  public async searchAddresses(query: string): Promise<GeocodedAddress[]> {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) return [];

    const results: GeocodedAddress[] = [];

    // 1. Recherche instantanée dans les arrêts du réseau Divia
    const matchedStops = ALL_DIJON_STOPS.filter(stop =>
      stop.name.toLowerCase().includes(trimmed)
    ).slice(0, 3);

    for (const stop of matchedStops) {
      results.push({
        id: `stop-${stop.id}`,
        label: stop.name,
        context: `Arrêt Divia (${stop.lines.join(', ')})`,
        latitude: stop.latitude,
        longitude: stop.longitude,
        type: 'stop',
      });
    }

    // 2. Recherche via l'API officielle Base Adresse Nationale (BAN) centrée sur Dijon
    try {
      const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
        trimmed
      )}&lat=47.3220&lon=5.0415&limit=5`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

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
            });
          }
        }
      }
    } catch {
      // Si hors-ligne ou timeout, ajouter des POI majeurs de repli si la recherche correspond
      const mockPois = [
        { label: 'Gare SNCF de Dijon', context: 'Cour de la Gare, 21000 Dijon', lat: 47.3236, lon: 5.0278 },
        { label: 'Centre Commercial Toison d\'Or', context: 'Allée d\'Italie, 21000 Dijon', lat: 47.3541, lon: 5.0501 },
        { label: 'Cité Internationale de la Gastronomie', context: '12 Parvis de l\'Unesco, 21000 Dijon', lat: 47.3178, lon: 5.0345 },
        { label: 'Université de Bourgogne (Campus)', context: 'Boulevard Gabriel, 21000 Dijon', lat: 47.3135, lon: 5.0712 },
        { label: 'Place Darcy', context: '21000 Dijon', lat: 47.3235, lon: 5.0335 },
      ];

      for (const poi of mockPois) {
        if (poi.label.toLowerCase().includes(trimmed) && !results.some(r => r.label === poi.label)) {
          results.push({
            id: `poi-${poi.lat}-${poi.lon}`,
            label: poi.label,
            context: poi.context,
            latitude: poi.lat,
            longitude: poi.lon,
            type: 'poi',
          });
        }
      }
    }

    return results;
  }
}

export const geocodingService = new GeocodingService();
