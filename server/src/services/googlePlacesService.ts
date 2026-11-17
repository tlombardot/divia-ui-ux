import { ALL_DIJON_STOPS, DIJON_CENTER } from '../data/dijonNetwork';
import { PlaceDetailsResult, PlaceSuggestion } from '../types';

interface GoogleAutocompleteSuggestion {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    types?: string[];
  };
}

interface GoogleAutocompleteResponse {
  suggestions?: GoogleAutocompleteSuggestion[];
}

interface GooglePlaceDetailsResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  types?: string[];
}

interface BANFeature {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    id?: string;
    label: string;
    context?: string;
    city?: string;
  };
}

interface BANResponse {
  features?: BANFeature[];
}

const PLACES_AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACES_DETAILS_BASE_URL = 'https://places.googleapis.com/v1/places';
const PLACES_TIMEOUT_MS = 4000;

function classifyGooglePlaceTypes(types?: string[]): 'stop' | 'address' | 'poi' {
  if (!types || types.length === 0) return 'address';
  if (
    types.some(t =>
      ['transit_station', 'bus_station', 'light_rail_station', 'train_station', 'subway_station'].includes(t)
    )
  ) {
    return 'stop';
  }
  if (types.some(t => ['street_address', 'route', 'premise', 'subpremise'].includes(t))) {
    return 'address';
  }
  return 'poi';
}

/**
 * Fallback search when GOOGLE_MAPS_API_KEY is not configured yet:
 * merges Divia local stops + official French Base Adresse Nationale (BAN)
 */
async function fallbackAutocomplete(input: string): Promise<PlaceSuggestion[]> {
  const lower = input.trim().toLowerCase();
  const suggestions: PlaceSuggestion[] = [];

  const matchedStops = ALL_DIJON_STOPS.filter(s =>
    s.name.toLowerCase().includes(lower)
  ).slice(0, 4);

  for (const stop of matchedStops) {
    suggestions.push({
      placeId: `divia-stop:${stop.id}`,
      label: stop.name,
      secondaryText: `Arrêt Divia (${stop.lines.join(', ')}) · Dijon`,
      type: 'stop',
      latitude: stop.latitude,
      longitude: stop.longitude,
      source: 'divia_local',
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
      input
    )}&lat=${DIJON_CENTER.latitude}&lon=${DIJON_CENTER.longitude}&limit=5`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as BANResponse;
      for (const feat of data.features || []) {
        const [lon, lat] = feat.geometry.coordinates;
        suggestions.push({
          placeId: `ban:${lat.toFixed(6)}:${lon.toFixed(6)}:${encodeURIComponent(feat.properties.label)}`,
          label: feat.properties.label,
          secondaryText: feat.properties.context || feat.properties.city || 'Dijon',
          type: 'address',
          latitude: lat,
          longitude: lon,
          source: 'ban_fallback',
        });
      }
    }
  } catch {
    // Keep Divia local matches
  }

  return suggestions;
}

/**
 * Proxy Google Places API (New) Autocomplete centered on Dijon (20 km radius)
 */
export async function autocompletePlaces(input: string): Promise<PlaceSuggestion[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return fallbackAutocomplete(input);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS);

    const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input,
        languageCode: 'fr',
        regionCode: 'FR',
        locationBias: {
          circle: {
            center: {
              latitude: DIJON_CENTER.latitude,
              longitude: DIJON_CENTER.longitude,
            },
            radius: 20000.0, // 20 km around Dijon
          },
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return fallbackAutocomplete(input);
    }

    const data = (await res.json()) as GoogleAutocompleteResponse;
    const suggestions: PlaceSuggestion[] = [];

    for (const item of data.suggestions || []) {
      const pred = item.placePrediction;
      if (!pred?.placeId) continue;

      const label =
        pred.structuredFormat?.mainText?.text || pred.text?.text || 'Lieu à Dijon';
      const secondaryText =
        pred.structuredFormat?.secondaryText?.text || 'Dijon, France';

      suggestions.push({
        placeId: pred.placeId,
        label,
        secondaryText,
        type: classifyGooglePlaceTypes(pred.types),
        source: 'google_places',
      });
    }

    return suggestions.length > 0 ? suggestions : fallbackAutocomplete(input);
  } catch {
    return fallbackAutocomplete(input);
  }
}

/**
 * Proxy Google Places API (New) Place Details to resolve exact GPS coordinates
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
  // Handle local fallback Divia stop IDs
  if (placeId.startsWith('divia-stop:')) {
    const stopId = placeId.replace('divia-stop:', '');
    const stop = ALL_DIJON_STOPS.find(s => s.id === stopId);
    if (!stop) return null;
    return {
      placeId,
      label: stop.name,
      formattedAddress: `Arrêt Divia ${stop.name}, Dijon`,
      latitude: stop.latitude,
      longitude: stop.longitude,
      type: 'stop',
    };
  }

  // Handle local fallback BAN IDs
  if (placeId.startsWith('ban:')) {
    const parts = placeId.split(':');
    if (parts.length >= 4) {
      const latitude = parseFloat(parts[1]);
      const longitude = parseFloat(parts[2]);
      const label = decodeURIComponent(parts.slice(3).join(':'));
      if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
        return {
          placeId,
          label,
          formattedAddress: label,
          latitude,
          longitude,
          type: 'address',
        };
      }
    }
    return null;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS);

    const url = `${PLACES_DETAILS_BASE_URL}/${encodeURIComponent(placeId)}?languageCode=fr`;
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types',
      },
    });

    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = (await res.json()) as GooglePlaceDetailsResponse;
    if (
      data.location?.latitude === undefined ||
      data.location?.longitude === undefined
    ) {
      return null;
    }

    return {
      placeId: data.id || placeId,
      label: data.displayName?.text || data.formattedAddress || 'Lieu sélectionné',
      formattedAddress: data.formattedAddress || data.displayName?.text || 'Dijon',
      latitude: data.location.latitude,
      longitude: data.location.longitude,
      type: classifyGooglePlaceTypes(data.types),
    };
  } catch {
    return null;
  }
}
