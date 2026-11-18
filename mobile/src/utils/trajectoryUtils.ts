import { calculateBearing, calculateDistanceMeters } from '../data/dijonNetwork';

export interface TrajectoryPoint {
  latitude: number;
  longitude: number;
  heading: number;
}

/**
 * Interpole le cap de manière fluide entre deux angles en degrés (0..360°)
 * en empruntant toujours le chemin angulaire le plus court (franchissement 0°/360°).
 */
export function interpolateAngle(fromAngle: number, toAngle: number, t: number): number {
  let diff = (toAngle - fromAngle) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const result = fromAngle + diff * Math.max(0, Math.min(1, t));
  return (Math.round(result) + 360) % 360;
}

/**
 * Génère une trajectoire GPS continue et fluide à partir d'une polyline clairsemée.
 * Subdivise les segments trop espacés en sous-étapes métriques régulières (~3m)
 * pour éviter les téléportations et assurer un glissement d'animation de type GPS natif.
 */
export function generateSmoothTrajectory(
  polyline: [number, number][],
  stepMeters: number = 3
): TrajectoryPoint[] {
  if (!polyline || polyline.length === 0) return [];
  if (polyline.length === 1) {
    return [
      {
        latitude: polyline[0][0],
        longitude: polyline[0][1],
        heading: 0,
      },
    ];
  }

  const result: TrajectoryPoint[] = [];

  for (let i = 0; i < polyline.length - 1; i++) {
    const [lat1, lon1] = polyline[i];
    const [lat2, lon2] = polyline[i + 1];

    const dist = calculateDistanceMeters(lat1, lon1, lat2, lon2);
    const bearing = calculateBearing(lat1, lon1, lat2, lon2);

    if (dist <= stepMeters) {
      result.push({
        latitude: lat1,
        longitude: lon1,
        heading: bearing,
      });
    } else {
      const stepsCount = Math.max(1, Math.ceil(dist / stepMeters));
      for (let s = 0; s < stepsCount; s++) {
        const t = s / stepsCount;
        result.push({
          latitude: lat1 + (lat2 - lat1) * t,
          longitude: lon1 + (lon2 - lon1) * t,
          heading: bearing,
        });
      }
    }
  }

  // Ajoute le point d'arrivée exact
  const lastCoord = polyline[polyline.length - 1];
  const lastHeading = result.length > 0 ? result[result.length - 1].heading : 0;
  result.push({
    latitude: lastCoord[0],
    longitude: lastCoord[1],
    heading: lastHeading,
  });

  return result;
}
