import {
  calculateDistanceMeters,
  DIJON_LINES,
  findNearbyStops,
} from '../data/dijonNetwork';
import {
  Report,
  RouteOption,
  RouteQuery,
  RouteSegment,
  RouteStep,
  TransitLine,
  TransitStop,
} from '../types';
import { getPedestrianRoute } from './pedestrianService';
import { reportService } from './reportService';

const TRANSIT_MINUTES_PER_STOP = 2; // ~2 minutes par interstation
const TRANSFER_WAIT_MINUTES = 4; // Temps moyen de battement pour correspondance

/**
 * Calcul de la cadence dynamique selon l'heure de la journée (Dijon)
 */
export function getLineHeadwayMinutes(lineId: string, date: Date = new Date()): number {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Heures de pointe dijonnaises : 7h30 - 9h00 (450-540) et 17h00 - 18h30 (1020-1110)
  const isMorningPeak = timeInMinutes >= 450 && timeInMinutes <= 540;
  const isEveningPeak = timeInMinutes >= 1020 && timeInMinutes <= 1110;
  const isPeak = isMorningPeak || isEveningPeak;
  const isEvening = hours >= 21 || hours < 6;

  if (lineId === 'T1' || lineId === 'T2') {
    if (isPeak) return 4;
    if (isEvening) return 15;
    return 8;
  }

  // Lianes L3, L4, L5, L6
  if (lineId.startsWith('L')) {
    if (isPeak) return 6;
    if (isEvening) return 20;
    return 11;
  }

  // Lignes de bus B10, B12, B13
  if (isPeak) return 10;
  if (isEvening) return 25;
  return 15;
}

/**
 * Estimation dynamique de l'attente du prochain passage
 */
export function getNextDepartureEstimate(lineId: string, date: Date = new Date()): number {
  const headway = getLineHeadwayMinutes(lineId, date);
  const currentMinute = date.getMinutes();
  const remainder = currentMinute % headway;
  const wait = remainder === 0 ? headway : headway - remainder;
  return Math.max(1, wait);
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Trouver un trajet direct sur une ligne entre deux arrêts
 */
function findDirectLineSegment(
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
    const segmentStops = line.stops.slice(fromIdx, toIdx + 1);
    const lastStop = line.stops[line.stops.length - 1];
    return { stops: segmentStops, direction: `Direction ${lastStop.name}` };
  } else {
    const segmentStops = line.stops.slice(toIdx, fromIdx + 1).reverse();
    const firstStop = line.stops[0];
    return { stops: segmentStops, direction: `Direction ${firstStop.name}` };
  }
}

/**
 * Vérifier les signalements contrôleurs Waze actifs sur un ensemble d'arrêts ou de lignes
 */
function findMatchingReports(linesUsed: string[], stopsUsed: string[]): Report[] {
  const activeReports = reportService.getActiveReports();
  return activeReports.filter(
    rep => linesUsed.includes(rep.lineId) || stopsUsed.includes(rep.stopId)
  );
}

/**
 * Convertir les segments en steps pour compatibilité arrière
 */
function mapSegmentsToSteps(segments: RouteSegment[]): RouteStep[] {
  return segments.map(seg => ({
    type: seg.type === 'TRANSIT' ? 'transit' : 'walk',
    instruction: seg.instruction,
    durationMinutes: seg.durationMinutes,
    distanceMeters: seg.distanceMeters,
    lineId: seg.lineId,
    lineName: seg.lineName,
    lineColor: seg.lineColor,
    fromStop: seg.fromStop,
    toStop: seg.toStop,
    stopsCount: seg.stopsCount,
    intermediateStops: seg.passedStops ? seg.passedStops.slice(1, -1) : undefined,
  }));
}

/**
 * Calcul multimodal Dijkstra Porte-à-Porte complet
 */
export async function calculateRoutes(query: RouteQuery): Promise<RouteOption[]> {
  const now = query.departureTime ? new Date(query.departureTime) : new Date();
  const routes: RouteOption[] = [];

  const toLabel = query.toLabel || 'Arrivée';

  const directDistance = calculateDistanceMeters(
    query.fromLat,
    query.fromLng,
    query.toLat,
    query.toLng
  );

  // ---------------------------------------------------------------------------
  // Option 1 : Alternative 100 % à pied si distance piétonne < 2.2 km
  // ---------------------------------------------------------------------------
  if (directDistance <= 2200) {
    const walkRoute = await getPedestrianRoute(
      query.fromLat,
      query.fromLng,
      query.toLat,
      query.toLng,
      toLabel
    );

    const depDate = new Date(now.getTime());
    const arrDate = new Date(now.getTime() + walkRoute.durationMinutes * 60 * 1000);

    const walkSegment: RouteSegment = {
      type: 'WALK',
      instruction: `Marcher jusqu'à ${toLabel} (${walkRoute.distanceMeters} m)`,
      durationMinutes: walkRoute.durationMinutes,
      distanceMeters: walkRoute.distanceMeters,
      polyline: walkRoute.polyline,
      turnInstructions: walkRoute.turnInstructions,
    };

    routes.push({
      id: 'route-walk-100',
      title: '100% à pied',
      departureTime: formatTime(depDate),
      arrivalTime: formatTime(arrDate),
      totalDurationMinutes: walkRoute.durationMinutes,
      walkingDurationMinutes: walkRoute.durationMinutes,
      transitDurationMinutes: 0,
      transfersCount: 0,
      summary: `À pied direct · ${walkRoute.distanceMeters} m`,
      nextDepartureMinutes: 0,
      hasControllerAlert: false,
      alerts: [],
      fullPolyline: walkRoute.polyline,
      segments: [walkSegment],
      steps: mapSegmentsToSteps([walkSegment]),
    });
  }

  // ---------------------------------------------------------------------------
  // Recherche des arrêts proches du départ et de l'arrivée (Porte-à-Porte)
  // ---------------------------------------------------------------------------
  const departureStops = findNearbyStops(query.fromLat, query.fromLng, 1200, 4);
  const arrivalStops = findNearbyStops(query.toLat, query.toLng, 1200, 4);

  if (departureStops.length === 0 || arrivalStops.length === 0) {
    return routes;
  }

  // ---------------------------------------------------------------------------
  // Option 2 : Recherche de lignes directes
  // ---------------------------------------------------------------------------
  for (const dep of departureStops) {
    for (const arr of arrivalStops) {
      if (dep.stop.id === arr.stop.id) continue;

      for (const line of DIJON_LINES) {
        const lineSeg = findDirectLineSegment(line, dep.stop, arr.stop);
        if (!lineSeg) continue;

        const stopCount = lineSeg.stops.length - 1;
        const transitMinutes = stopCount * TRANSIT_MINUTES_PER_STOP;
        const nextDepMinutes = getNextDepartureEstimate(line.id, now);

        // Tracé piéton départ -> arrêt de montée
        const walkToBoarding = await getPedestrianRoute(
          query.fromLat,
          query.fromLng,
          dep.stop.latitude,
          dep.stop.longitude,
          dep.stop.name
        );

        // Tracé piéton arrêt de descente -> destination finale
        const walkFromAlighting = await getPedestrianRoute(
          arr.stop.latitude,
          arr.stop.longitude,
          query.toLat,
          query.toLng,
          toLabel
        );

        const totalMinutes =
          walkToBoarding.durationMinutes +
          nextDepMinutes +
          transitMinutes +
          walkFromAlighting.durationMinutes;

        const depDate = new Date(
          now.getTime() + (walkToBoarding.durationMinutes + nextDepMinutes) * 60 * 1000
        );
        const arrDate = new Date(now.getTime() + totalMinutes * 60 * 1000);

        const transitPolyline: [number, number][] = lineSeg.stops.map(s => [
          s.latitude,
          s.longitude,
        ]);

        const segments: RouteSegment[] = [];

        // 1. Marche d'approche
        segments.push({
          type: 'WALK',
          instruction: `Marcher jusqu'à l'arrêt ${dep.stop.name}`,
          durationMinutes: walkToBoarding.durationMinutes,
          distanceMeters: walkToBoarding.distanceMeters,
          polyline: walkToBoarding.polyline,
          turnInstructions: walkToBoarding.turnInstructions,
          toStop: dep.stop,
        });

        // 2. Segment Transit
        segments.push({
          type: 'TRANSIT',
          instruction: `Prendre le ${line.type === 'tram' ? 'Tram' : 'Bus'} ${line.id} (${lineSeg.direction})`,
          durationMinutes: transitMinutes,
          distanceMeters: stopCount * 650,
          polyline: transitPolyline,
          lineId: line.id,
          lineName: line.name,
          lineColor: line.color,
          direction: lineSeg.direction,
          fromStop: dep.stop,
          toStop: arr.stop,
          stopsCount: stopCount,
          passedStops: lineSeg.stops,
        });

        // 3. Marche finale
        segments.push({
          type: 'WALK',
          instruction: `Marcher jusqu'à ${toLabel}`,
          durationMinutes: walkFromAlighting.durationMinutes,
          distanceMeters: walkFromAlighting.distanceMeters,
          polyline: walkFromAlighting.polyline,
          turnInstructions: walkFromAlighting.turnInstructions,
          fromStop: arr.stop,
        });

        const fullPolyline: [number, number][] = [
          ...walkToBoarding.polyline,
          ...transitPolyline,
          ...walkFromAlighting.polyline,
        ];

        const matchingAlerts = findMatchingReports(
          [line.id],
          lineSeg.stops.map(s => s.id)
        );

        routes.push({
          id: `route-direct-${line.id}-${dep.stop.id}-${arr.stop.id}`,
          title: `Direct sans correspondance (${line.id})`,
          departureTime: formatTime(depDate),
          arrivalTime: formatTime(arrDate),
          totalDurationMinutes: totalMinutes,
          walkingDurationMinutes:
            walkToBoarding.durationMinutes + walkFromAlighting.durationMinutes,
          transitDurationMinutes: transitMinutes,
          transfersCount: 0,
          summary: `${line.id} direct (${transitMinutes} min en transit)`,
          nextDepartureMinutes: nextDepMinutes,
          hasControllerAlert: matchingAlerts.length > 0,
          alerts: matchingAlerts,
          fullPolyline,
          segments,
          steps: mapSegmentsToSteps(segments),
        });

        break; // Une seule variante par couple d'arrêts
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Option 3 : Correspondance via pôles de correspondance (Darcy, République, etc.)
  // ---------------------------------------------------------------------------
  if (routes.filter(r => r.transfersCount === 0 && r.transitDurationMinutes > 0).length < 2) {
    const candidateHubs = ['hub-darcy', 'hub-republique', 'hub-monge', 'hub-gare', 'hub-universite'];

    for (const dep of departureStops.slice(0, 2)) {
      for (const arr of arrivalStops.slice(0, 2)) {
        for (const hubId of candidateHubs) {
          for (const lineA of DIJON_LINES) {
            const hubStopA = lineA.stops.find(s => s.id === hubId);
            if (!hubStopA) continue;

            const legA = findDirectLineSegment(lineA, dep.stop, hubStopA);
            if (!legA) continue;

            for (const lineB of DIJON_LINES) {
              if (lineB.id === lineA.id) continue;
              const hubStopB = lineB.stops.find(s => s.id === hubId);
              if (!hubStopB) continue;

              const legB = findDirectLineSegment(lineB, hubStopB, arr.stop);
              if (!legB) continue;

              const stopsCountA = legA.stops.length - 1;
              const stopsCountB = legB.stops.length - 1;
              const transitMinA = stopsCountA * TRANSIT_MINUTES_PER_STOP;
              const transitMinB = stopsCountB * TRANSIT_MINUTES_PER_STOP;
              const nextDepMinA = getNextDepartureEstimate(lineA.id, now);

              const walkToBoarding = await getPedestrianRoute(
                query.fromLat,
                query.fromLng,
                dep.stop.latitude,
                dep.stop.longitude,
                dep.stop.name
              );

              const walkFromAlighting = await getPedestrianRoute(
                arr.stop.latitude,
                arr.stop.longitude,
                query.toLat,
                query.toLng,
                toLabel
              );

              const totalMinutes =
                walkToBoarding.durationMinutes +
                nextDepMinA +
                transitMinA +
                TRANSFER_WAIT_MINUTES +
                transitMinB +
                walkFromAlighting.durationMinutes;

              const depDate = new Date(
                now.getTime() + (walkToBoarding.durationMinutes + nextDepMinA) * 60 * 1000
              );
              const arrDate = new Date(now.getTime() + totalMinutes * 60 * 1000);

              const polylineA: [number, number][] = legA.stops.map(s => [s.latitude, s.longitude]);
              const polylineB: [number, number][] = legB.stops.map(s => [s.latitude, s.longitude]);

              const segments: RouteSegment[] = [
                {
                  type: 'WALK',
                  instruction: `Marcher jusqu'à ${dep.stop.name}`,
                  durationMinutes: walkToBoarding.durationMinutes,
                  distanceMeters: walkToBoarding.distanceMeters,
                  polyline: walkToBoarding.polyline,
                  turnInstructions: walkToBoarding.turnInstructions,
                  toStop: dep.stop,
                },
                {
                  type: 'TRANSIT',
                  instruction: `Prendre le ${lineA.type === 'tram' ? 'Tram' : 'Bus'} ${lineA.id} (${legA.direction})`,
                  durationMinutes: transitMinA,
                  distanceMeters: stopsCountA * 650,
                  polyline: polylineA,
                  lineId: lineA.id,
                  lineName: lineA.name,
                  lineColor: lineA.color,
                  direction: legA.direction,
                  fromStop: dep.stop,
                  toStop: hubStopA,
                  stopsCount: stopsCountA,
                  passedStops: legA.stops,
                },
                {
                  type: 'TRANSFER',
                  instruction: `Correspondance à ${hubStopA.name} : rejoindre le quai ${lineB.id}`,
                  durationMinutes: TRANSFER_WAIT_MINUTES,
                  distanceMeters: 60,
                  polyline: [[hubStopA.latitude, hubStopA.longitude], [hubStopB.latitude, hubStopB.longitude]],
                  turnInstructions: [`Changer de quai vers ${lineB.id}`],
                  fromStop: hubStopA,
                  toStop: hubStopB,
                },
                {
                  type: 'TRANSIT',
                  instruction: `Prendre le ${lineB.type === 'tram' ? 'Tram' : 'Bus'} ${lineB.id} (${legB.direction})`,
                  durationMinutes: transitMinB,
                  distanceMeters: stopsCountB * 650,
                  polyline: polylineB,
                  lineId: lineB.id,
                  lineName: lineB.name,
                  lineColor: lineB.color,
                  direction: legB.direction,
                  fromStop: hubStopB,
                  toStop: arr.stop,
                  stopsCount: stopsCountB,
                  passedStops: legB.stops,
                },
                {
                  type: 'WALK',
                  instruction: `Marcher jusqu'à ${toLabel}`,
                  durationMinutes: walkFromAlighting.durationMinutes,
                  distanceMeters: walkFromAlighting.distanceMeters,
                  polyline: walkFromAlighting.polyline,
                  turnInstructions: walkFromAlighting.turnInstructions,
                  fromStop: arr.stop,
                },
              ];

              const fullPolyline: [number, number][] = [
                ...walkToBoarding.polyline,
                ...polylineA,
                ...polylineB,
                ...walkFromAlighting.polyline,
              ];

              const allStops = [...legA.stops, ...legB.stops].map(s => s.id);
              const matchingAlerts = findMatchingReports([lineA.id, lineB.id], allStops);

              routes.push({
                id: `route-transfer-${lineA.id}-${lineB.id}-${hubId}`,
                title: `${lineA.id} ➜ ${lineB.id} via ${hubStopA.name}`,
                departureTime: formatTime(depDate),
                arrivalTime: formatTime(arrDate),
                totalDurationMinutes: totalMinutes,
                walkingDurationMinutes:
                  walkToBoarding.durationMinutes + TRANSFER_WAIT_MINUTES + walkFromAlighting.durationMinutes,
                transitDurationMinutes: transitMinA + transitMinB,
                transfersCount: 1,
                summary: `${lineA.id} ➜ ${lineB.id} via ${hubStopA.name}`,
                nextDepartureMinutes: nextDepMinA,
                hasControllerAlert: matchingAlerts.length > 0,
                alerts: matchingAlerts,
                fullPolyline,
                segments,
                steps: mapSegmentsToSteps(segments),
              });

              break;
            }
          }
        }
      }
    }
  }

  // Trier par durée totale et assigner le titre "Le plus rapide" au meilleur itinéraire
  const sorted = routes.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
  if (sorted.length > 0 && !sorted[0].title.startsWith('100%')) {
    sorted[0].title = `Le plus rapide · ${sorted[0].summary}`;
  }

  return sorted;
}
