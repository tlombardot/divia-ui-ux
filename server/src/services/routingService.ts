import {
  calculateDistanceMeters,
  DIJON_LINES,
  findNearestStop,
} from '../data/dijonNetwork';
import { RouteOption, RouteQuery, RouteStep, TransitLine, TransitStop } from '../types';

const WALKING_SPEED_MPS = 1.25; // ~4.5 km/h
const TRANSIT_MINUTES_PER_STOP = 2; // ~2 min between consecutive tram/bus stops
const TRANSFER_PENALTY_MINUTES = 4; // Transfer wait and walk time

/**
 * Get dynamic headway (frequency in minutes) for a transit line based on current time
 */
export function getLineHeadwayMinutes(lineId: string, date: Date = new Date()): number {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Peak hours: 7:30 to 9:00 (450 to 540) and 17:00 to 18:30 (1020 to 1110)
  const isMorningPeak = timeInMinutes >= 450 && timeInMinutes <= 540;
  const isEveningPeak = timeInMinutes >= 1020 && timeInMinutes <= 1110;
  const isPeak = isMorningPeak || isEveningPeak;

  const isEvening = hours >= 21 || hours < 6;

  if (lineId === 'T1' || lineId === 'T2') {
    if (isPeak) return 4;
    if (isEvening) return 15;
    return 8;
  }

  // Bus L5
  if (isPeak) return 6;
  if (isEvening) return 20;
  return 12;
}

/**
 * Estimate minutes until next vehicle departure
 */
export function getNextDepartureEstimate(lineId: string, date: Date = new Date()): number {
  const headway = getLineHeadwayMinutes(lineId, date);
  const currentMinute = date.getMinutes();
  const remainder = currentMinute % headway;
  const wait = remainder === 0 ? headway : headway - remainder;
  return Math.max(1, wait);
}

/**
 * Format timestamp into HH:mm
 */
function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Find direct route between origin stop and destination stop on a specific line
 */
function findDirectLineLeg(
  line: TransitLine,
  fromStop: TransitStop,
  toStop: TransitStop
): { stops: TransitStop[]; direction: string } | null {
  const fromIdx = line.stops.findIndex(s => s.id === fromStop.id);
  const toIdx = line.stops.findIndex(s => s.id === toStop.id);

  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
    return null;
  }

  if (fromIdx < toIdx) {
    // Forward direction
    const segment = line.stops.slice(fromIdx, toIdx + 1);
    const lastStop = line.stops[line.stops.length - 1];
    return { stops: segment, direction: `Direction ${lastStop.name}` };
  } else {
    // Reverse direction
    const segment = line.stops.slice(toIdx, fromIdx + 1).reverse();
    const firstStop = line.stops[0];
    return { stops: segment, direction: `Direction ${firstStop.name}` };
  }
}

/**
 * Calculate multimodal route options
 */
export function calculateRoutes(query: RouteQuery): RouteOption[] {
  const now = query.departureTime ? new Date(query.departureTime) : new Date();
  const routes: RouteOption[] = [];

  const directDistance = calculateDistanceMeters(
    query.fromLat,
    query.fromLng,
    query.toLat,
    query.toLng
  );

  // 1. Walking option if within 1.5 km
  if (directDistance <= 1500) {
    const walkDuration = Math.max(1, Math.round(directDistance / (WALKING_SPEED_MPS * 60)));
    const departure = new Date(now.getTime());
    const arrival = new Date(now.getTime() + walkDuration * 60 * 1000);

    routes.push({
      id: 'route-walk-direct',
      departureTime: formatTime(departure),
      arrivalTime: formatTime(arrival),
      totalDurationMinutes: walkDuration,
      walkingDurationMinutes: walkDuration,
      transitDurationMinutes: 0,
      transfersCount: 0,
      summary: 'Trajet à pied direct',
      nextDepartureMinutes: 0,
      steps: [
        {
          type: 'walk',
          instruction: `Marcher vers la destination (${Math.round(directDistance)} m)`,
          durationMinutes: walkDuration,
          distanceMeters: directDistance,
        },
      ],
    });
  }

  // 2. Identify nearest departure and arrival stops
  const originNear = findNearestStop(query.fromLat, query.fromLng);
  const destNear = findNearestStop(query.toLat, query.toLng);

  if (!originNear || !destNear) {
    return routes;
  }

  const startStop = originNear.stop;
  const endStop = destNear.stop;

  const walkToFirstMeters = originNear.distanceMeters;
  const walkToFirstMin = Math.round(walkToFirstMeters / (WALKING_SPEED_MPS * 60));

  const walkFromLastMeters = destNear.distanceMeters;
  const walkFromLastMin = Math.round(walkFromLastMeters / (WALKING_SPEED_MPS * 60));

  // If origin and destination are mapped to the exact same stop, return walking
  if (startStop.id === endStop.id) {
    return routes;
  }

  // 3. Look for Direct Lines
  for (const line of DIJON_LINES) {
    const leg = findDirectLineLeg(line, startStop, endStop);
    if (!leg) continue;

    const stopCount = leg.stops.length - 1;
    const transitMin = stopCount * TRANSIT_MINUTES_PER_STOP;
    const nextDepMin = getNextDepartureEstimate(line.id, now);
    const totalMin = walkToFirstMin + nextDepMin + transitMin + walkFromLastMin;

    const depDate = new Date(now.getTime() + (walkToFirstMin + nextDepMin) * 60 * 1000);
    const arrDate = new Date(now.getTime() + totalMin * 60 * 1000);

    const steps: RouteStep[] = [];

    if (walkToFirstMeters > 50) {
      steps.push({
        type: 'walk',
        instruction: `Marcher jusqu'à l'arrêt ${startStop.name}`,
        durationMinutes: walkToFirstMin,
        distanceMeters: walkToFirstMeters,
      });
    }

    steps.push({
      type: 'transit',
      instruction: `Prendre le ${line.type === 'tram' ? 'Tram' : 'Bus'} ${line.id} (${leg.direction})`,
      durationMinutes: transitMin,
      distanceMeters: stopCount * 650,
      lineId: line.id,
      lineName: line.name,
      lineColor: line.color,
      fromStop: startStop,
      toStop: endStop,
      stopsCount: stopCount,
      intermediateStops: leg.stops.slice(1, -1),
    });

    if (walkFromLastMeters > 50) {
      steps.push({
        type: 'walk',
        instruction: `Marcher jusqu'à la destination finale`,
        durationMinutes: walkFromLastMin,
        distanceMeters: walkFromLastMeters,
      });
    }

    routes.push({
      id: `route-direct-${line.id}`,
      departureTime: formatTime(depDate),
      arrivalTime: formatTime(arrDate),
      totalDurationMinutes: totalMin,
      walkingDurationMinutes: walkToFirstMin + walkFromLastMin,
      transitDurationMinutes: transitMin,
      transfersCount: 0,
      summary: `${line.id} direct (${transitMin} min en transit)`,
      nextDepartureMinutes: nextDepMin,
      steps,
    });
  }

  // 4. Look for Transfer routes via major hubs (Darcy, République, Erasme)
  if (routes.filter(r => r.transfersCount === 0 && r.transitDurationMinutes > 0).length === 0) {
    const hubCandidates = ['stop-darcy', 't1-republique', 't1-erasme'];

    for (const hubId of hubCandidates) {
      for (const lineA of DIJON_LINES) {
        const hubStopA = lineA.stops.find(s => s.id === hubId);
        if (!hubStopA) continue;

        const legA = findDirectLineLeg(lineA, startStop, hubStopA);
        if (!legA) continue;

        for (const lineB of DIJON_LINES) {
          if (lineB.id === lineA.id) continue;
          const hubStopB = lineB.stops.find(s => s.id === hubId);
          if (!hubStopB) continue;

          const legB = findDirectLineLeg(lineB, hubStopB, endStop);
          if (!legB) continue;

          const stopsCountA = legA.stops.length - 1;
          const stopsCountB = legB.stops.length - 1;
          const transitMinA = stopsCountA * TRANSIT_MINUTES_PER_STOP;
          const transitMinB = stopsCountB * TRANSIT_MINUTES_PER_STOP;
          const nextDepMinA = getNextDepartureEstimate(lineA.id, now);

          const totalTransitMin = transitMinA + TRANSFER_PENALTY_MINUTES + transitMinB;
          const totalMin = walkToFirstMin + nextDepMinA + totalTransitMin + walkFromLastMin;

          const depDate = new Date(now.getTime() + (walkToFirstMin + nextDepMinA) * 60 * 1000);
          const arrDate = new Date(now.getTime() + totalMin * 60 * 1000);

          const steps: RouteStep[] = [];
          if (walkToFirstMeters > 50) {
            steps.push({
              type: 'walk',
              instruction: `Marcher jusqu'à ${startStop.name}`,
              durationMinutes: walkToFirstMin,
              distanceMeters: walkToFirstMeters,
            });
          }

          steps.push({
            type: 'transit',
            instruction: `Prendre le ${lineA.type === 'tram' ? 'Tram' : 'Bus'} ${lineA.id} (${legA.direction}) jusqu'à ${hubStopA.name}`,
            durationMinutes: transitMinA,
            distanceMeters: stopsCountA * 650,
            lineId: lineA.id,
            lineName: lineA.name,
            lineColor: lineA.color,
            fromStop: startStop,
            toStop: hubStopA,
            stopsCount: stopsCountA,
            intermediateStops: legA.stops.slice(1, -1),
          });

          steps.push({
            type: 'walk',
            instruction: `Correspondance à ${hubStopA.name} vers ${lineB.id}`,
            durationMinutes: TRANSFER_PENALTY_MINUTES,
            distanceMeters: 50,
          });

          steps.push({
            type: 'transit',
            instruction: `Prendre le ${lineB.type === 'tram' ? 'Tram' : 'Bus'} ${lineB.id} (${legB.direction}) jusqu'à ${endStop.name}`,
            durationMinutes: transitMinB,
            distanceMeters: stopsCountB * 650,
            lineId: lineB.id,
            lineName: lineB.name,
            lineColor: lineB.color,
            fromStop: hubStopB,
            toStop: endStop,
            stopsCount: stopsCountB,
            intermediateStops: legB.stops.slice(1, -1),
          });

          if (walkFromLastMeters > 50) {
            steps.push({
              type: 'walk',
              instruction: `Marcher jusqu'à destination`,
              durationMinutes: walkFromLastMin,
              distanceMeters: walkFromLastMeters,
            });
          }

          routes.push({
            id: `route-transfer-${lineA.id}-${lineB.id}-${hubId}`,
            departureTime: formatTime(depDate),
            arrivalTime: formatTime(arrDate),
            totalDurationMinutes: totalMin,
            walkingDurationMinutes: walkToFirstMin + TRANSFER_PENALTY_MINUTES + walkFromLastMin,
            transitDurationMinutes: transitMinA + transitMinB,
            transfersCount: 1,
            summary: `${lineA.id} ➜ ${lineB.id} via ${hubStopA.name}`,
            nextDepartureMinutes: nextDepMinA,
            steps,
          });
          break; // Stop after finding the best transfer for this hub
        }
      }
    }
  }

  // Sort by total duration
  return routes.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
}
