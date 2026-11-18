import MapView, { Camera } from 'react-native-maps';

export interface NavigationCameraOptions {
  latitude: number;
  longitude: number;
  heading?: number | null;
  duration?: number;
  isNavigating?: boolean;
}

/**
 * Cadre la caméra de la carte en mode GPS haute précision (type Google Maps / Waze) :
 * - Zoom serré au niveau rue (zoom ~18.8 / altitude ~150m / delta ~0.0012)
 *   pour distinguer clairement les noms de rues, trottoirs, carrefours et angles de virage.
 * - Perspective 3D immersive (pitch ~50°) orientée vers l'avant.
 * - Orientation automatique de la carte dans le sens du déplacement (heading),
 *   la rue à emprunter s'affichant toujours droit devant vers le haut de l'écran.
 * - Décalage optique vers l'avant le long du cap pour dégager la vue au-dessus de la carte de trajet.
 */
export function animateCameraToUser(
  mapRef: React.RefObject<MapView | null>,
  options: NavigationCameraOptions
) {
  if (!mapRef.current) return;

  const {
    latitude,
    longitude,
    heading = 0,
    duration = 350,
    isNavigating = false,
  } = options;

  if (isNavigating) {
    const effectiveHeading =
      typeof heading === 'number' && !isNaN(heading) ? heading : 0;

    // Décalage visuel vers l'avant (environ 30m) le long du cap pour positionner
    // la flèche dans le tiers inférieur dégagé au-dessus de la bottom sheet
    const headingRad = (effectiveHeading * Math.PI) / 180;
    const forwardOffsetLat = 0.00025 * Math.cos(headingRad);
    const forwardOffsetLon = 0.00025 * Math.sin(headingRad);

    const targetCenter = {
      latitude: latitude + forwardOffsetLat,
      longitude: longitude + forwardOffsetLon,
    };

    try {
      if (typeof mapRef.current.animateCamera === 'function') {
        const camera: Partial<Camera> = {
          center: targetCenter,
          pitch: 50, // Inclinaison 3D perspective GPS
          heading: effectiveHeading, // Carte orientée dans le sens de la marche/conduite
          altitude: 150, // ~150m altitude au-dessus du sol (Apple Maps)
          zoom: 18.8, // Niveau de zoom très rapproché rue (Google Maps)
        };
        mapRef.current.animateCamera(camera, { duration });
        return;
      }
    } catch {
      // Fallback animateToRegion si le device ne supporte pas animateCamera
    }

    mapRef.current.animateToRegion(
      {
        latitude: latitude - 0.0003,
        longitude,
        latitudeDelta: 0.0012, // Zoom niveau rue ultra-détaillé
        longitudeDelta: 0.0012,
      },
      duration
    );
  } else {
    // Mode exploration standard : vue 2D à plat orientée Nord
    try {
      if (typeof mapRef.current.animateCamera === 'function') {
        mapRef.current.animateCamera(
          {
            center: { latitude, longitude },
            pitch: 0,
            heading: 0,
            altitude: 1200,
            zoom: 15.5,
          },
          { duration }
        );
        return;
      }
    } catch {
      // Fallback
    }

    mapRef.current.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      duration
    );
  }
}
