import { calculateDistanceMeters } from '../data/dijonNetwork';

export interface PedestrianRoute {
  distanceMeters: number;
  durationMinutes: number;
  polyline: [number, number][]; // [latitude, longitude]
  turnInstructions: string[];
  isFallback: boolean;
}

interface OSRMStep {
  maneuver?: {
    type?: string;
    modifier?: string;
  };
  name?: string;
  distance?: number;
  duration?: number;
}

interface OSRMLeg {
  steps?: OSRMStep[];
}

interface OSRMRoute {
  distance: number;
  duration: number;
  geometry?: {
    coordinates: [number, number][]; // [lon, lat] in GeoJSON
  };
  legs?: OSRMLeg[];
}

interface OSRMResponse {
  code: string;
  routes?: OSRMRoute[];
}

const WALKING_SPEED_MPS = 1.25; // ~4.5 km/h
const OSRM_TIMEOUT_MS = 3000;

/**
 * Traduire les manœuvres OSRM en instructions piétonnes naturelles en français
 */
function formatOSRMInstruction(step: OSRMStep): string {
  const streetName = step.name ? `sur ${step.name}` : '';
  const modifier = step.maneuver?.modifier;
  const type = step.maneuver?.type;

  if (type === 'depart') {
    return streetName ? `Partir ${streetName}` : 'Commencer la marche';
  }
  if (type === 'arrive') {
    return 'Vous arrivez à votre étape';
  }

  switch (modifier) {
    case 'left':
    case 'sharp left':
      return `Tourner à gauche ${streetName}`.trim();
    case 'slight left':
      return `Obliquer légèrement à gauche ${streetName}`.trim();
    case 'right':
    case 'sharp right':
      return `Tourner à droite ${streetName}`.trim();
    case 'slight right':
      return `Obliquer légèrement à droite ${streetName}`.trim();
    case 'straight':
      return `Continuer tout droit ${streetName}`.trim();
    case 'uturn':
      return `Faire demi-tour ${streetName}`.trim();
    default:
      return streetName ? `Suivre ${step.name}` : 'Continuer sur le chemin';
  }
}

/**
 * Calcul de repli robuste hors ligne ou en cas d'échec d'OSRM
 */
function createFallbackPedestrianRoute(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  targetLabel: string = 'destination'
): PedestrianRoute {
  const directMeters = calculateDistanceMeters(lat1, lon1, lat2, lon2);
  // Coefficient de détour urbain moyen pour la marche : 1.28
  const walkingMeters = Math.round(directMeters * 1.28);
  const durationMinutes = Math.max(1, Math.round(walkingMeters / (WALKING_SPEED_MPS * 60)));

  // Polyline avec un point médian légèrement décalé pour un rendu plus naturel qu'une ligne droite parfaite
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;

  return {
    distanceMeters: walkingMeters,
    durationMinutes,
    polyline: [
      [lat1, lon1],
      [midLat, midLon],
      [lat2, lon2],
    ],
    turnInstructions: [
      `Marcher vers ${targetLabel} (${walkingMeters} m, ~${durationMinutes} min)`,
    ],
    isFallback: true,
  };
}

/**
 * Obtenir le tracé piéton réel rue par rue via l'API publique OSRM
 */
export async function getPedestrianRoute(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  targetLabel: string = 'destination'
): Promise<PedestrianRoute> {
  // Distance très courte (< 15 m) : pas besoin d'appel réseau
  if (calculateDistanceMeters(lat1, lon1, lat2, lon2) < 15) {
    return {
      distanceMeters: 0,
      durationMinutes: 0,
      polyline: [[lat1, lon1], [lat2, lon2]],
      turnInstructions: [`Vous êtes à ${targetLabel}`],
      isFallback: false,
    };
  }

  const url = `https://router.project-osrm.org/route/v1/foot/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson&steps=true`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'DiviAkhaaa-Transit-App/1.0',
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return createFallbackPedestrianRoute(lat1, lon1, lat2, lon2, targetLabel);
    }

    const data = (await res.json()) as OSRMResponse;
    const route = data.routes?.[0];

    if (!route || !route.geometry || !route.geometry.coordinates) {
      return createFallbackPedestrianRoute(lat1, lon1, lat2, lon2, targetLabel);
    }

    // Convertir les coordonnées GeoJSON [lon, lat] en [lat, lon]
    const polyline: [number, number][] = route.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon]
    );

    const turnInstructions: string[] = [];
    if (route.legs && route.legs[0]?.steps) {
      for (const step of route.legs[0].steps) {
        if (step.distance && step.distance > 5) {
          const formatted = formatOSRMInstruction(step);
          if (formatted && !turnInstructions.includes(formatted)) {
            turnInstructions.push(`${formatted} (${Math.round(step.distance)} m)`);
          }
        }
      }
    }

    if (turnInstructions.length === 0) {
      turnInstructions.push(`Marcher vers ${targetLabel}`);
    }

    const distanceMeters = Math.round(route.distance);
    const durationMinutes = Math.max(1, Math.round(route.duration / 60));

    return {
      distanceMeters,
      durationMinutes,
      polyline,
      turnInstructions,
      isFallback: false,
    };
  } catch {
    // Repli immédiat en cas d'erreur réseau, timeout ou mode avion
    return createFallbackPedestrianRoute(lat1, lon1, lat2, lon2, targetLabel);
  }
}
