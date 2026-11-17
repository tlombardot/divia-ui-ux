import {
  calculateDistanceMeters,
  DIJON_LINES,
  findNearbyStops,
} from '../data/dijonNetwork';
import {
  CrowdLevel,
  CrowdStatus,
  Report,
  RouteOption,
  RouteQuery,
  RouteSegment,
  RouteStep,
  TransitLine,
  TransitStop,
} from '../types';
import { getPedestrianRoute, PedestrianRoute } from './pedestrianService';
import { reportService } from './reportService';

const TRANSIT_MINUTES_PER_STOP = 2; // ~2 min par interstation
const BOARDING_WAIT_PENALTY_MINUTES = 4; // Temps d'attente moyen première montée
const TRANSFER_WAIT_PENALTY_MINUTES = 6; // Pénalité de correspondance quai à quai (anti-zigzag)

/**
 * Cadence dynamique de la ligne selon l'heure (Dijon)
 */
export function getLineHeadwayMinutes(lineId: string, date: Date = new Date()): number {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Heures de pointe : 7h30-9h et 17h-18h30
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
    return 10;
  }

  // Lignes de bus B10, B12, B13
  if (isPeak) return 10;
  if (isEvening) return 25;
  return 15;
}

/**
 * Estimation de l'attente du prochain départ
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
 * Trouver un trajet direct entre 2 arrêts sur une ligne
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
 * Trouver les signalements contrôleurs Waze actifs sur un trajet
 */
function findMatchingReports(linesUsed: string[], stopsUsed: string[]): Report[] {
  const activeReports = reportService.getActiveControllerReports();
  return activeReports.filter(
    rep => linesUsed.includes(rep.lineId) || stopsUsed.includes(rep.stopId)
  );
}

function crowdRank(level: CrowdLevel): number {
  return level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1;
}

function summarizeRouteCrowd(
  segments: RouteSegment[]
): { crowdStatus?: CrowdStatus; crowdSummary?: string } {
  const transitSegs = segments.filter(s => s.type === 'TRANSIT' && s.crowdStatus);
  if (transitSegs.length === 0) return {};

  let worstSeg = transitSegs[0];
  for (const seg of transitSegs) {
    if (
      seg.crowdStatus &&
      worstSeg.crowdStatus &&
      crowdRank(seg.crowdStatus.level) > crowdRank(worstSeg.crowdStatus.level)
    ) {
      worstSeg = seg;
    }
  }

  const status = worstSeg.crowdStatus!;
  const lineLabel = worstSeg.lineId || 'Divia';
  const vehicleWord = lineLabel.startsWith('T') ? 'Rame' : 'Bus';

  const crowdSummary =
    status.level === 'HIGH'
      ? `${vehicleWord} bondé${vehicleWord === 'Rame' ? 'e' : ''} sur ${lineLabel}`
      : status.level === 'MEDIUM'
        ? `${vehicleWord} chargé${vehicleWord === 'Rame' ? 'e' : ''} sur ${lineLabel}`
        : `Trajet calme sur ${lineLabel}`;

  return { crowdStatus: status, crowdSummary };
}

/**
 * Convertir segments en steps pour compatibilité ascendante
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
 * Génère les heures de passage estimées pour chaque arrêt intermédiaire
 */
function generateEstimatedStopTimes(startTime: Date, stopCount: number): string[] {
  const times: string[] = [];
  for (let i = 0; i <= stopCount; i++) {
    const stopDate = new Date(startTime.getTime() + i * TRANSIT_MINUTES_PER_STOP * 60 * 1000);
    times.push(formatTime(stopDate));
  }
  return times;
}

/**
 * Calcul multimodal Dijkstra Porte-à-Porte avec OSRM et filtres anti-détours stricts
 */
export async function calculateRoutes(query: RouteQuery): Promise<RouteOption[]> {
  const now = query.departureTime ? new Date(query.departureTime) : new Date();
  const routes: RouteOption[] = [];

  const toLabel = query.toLabel || 'Destination';

  const directDistance = calculateDistanceMeters(
    query.fromLat,
    query.fromLng,
    query.toLat,
    query.toLng
  );

  // ---------------------------------------------------------------------------
  // 1. Alternative 100 % à pied si distance < 2.5 km (2500m)
  // ---------------------------------------------------------------------------
  let walkDirectRoute: PedestrianRoute | null = null;
  if (directDistance <= 2500) {
    walkDirectRoute = await getPedestrianRoute(
      query.fromLat,
      query.fromLng,
      query.toLat,
      query.toLng,
      toLabel
    );

    const depDate = new Date(now.getTime());
    const arrDate = new Date(now.getTime() + walkDirectRoute.durationMinutes * 60 * 1000);

    const walkSegment: RouteSegment = {
      type: 'WALK',
      instruction: `Marcher jusqu'à ${toLabel} (${walkDirectRoute.distanceMeters} m)`,
      durationMinutes: walkDirectRoute.durationMinutes,
      distanceMeters: walkDirectRoute.distanceMeters,
      polyline: walkDirectRoute.polyline,
      turnInstructions: walkDirectRoute.turnInstructions,
      departureTime: formatTime(depDate),
      arrivalTime: formatTime(arrDate),
    };

    routes.push({
      id: 'route-walk-100',
      title: '100% à pied',
      departureTime: formatTime(depDate),
      arrivalTime: formatTime(arrDate),
      totalDurationMinutes: walkDirectRoute.durationMinutes,
      walkingDurationMinutes: walkDirectRoute.durationMinutes,
      transitDurationMinutes: 0,
      transfersCount: 0,
      summary: `À pied direct · ${walkDirectRoute.distanceMeters} m`,
      nextDepartureMinutes: 0,
      hasControllerAlert: false,
      alerts: [],
      fullPolyline: walkDirectRoute.polyline,
      segments: [walkSegment],
      steps: mapSegmentsToSteps([walkSegment]),
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Recherche des 5 arrêts les plus proches du départ et de l'arrivée
  // ---------------------------------------------------------------------------
  const departureStops = findNearbyStops(query.fromLat, query.fromLng, 1400, 5);
  const arrivalStops = findNearbyStops(query.toLat, query.toLng, 1400, 5);

  if (departureStops.length === 0 || arrivalStops.length === 0) {
    return routes;
  }

  // Cache des calculs piétons d'approche pour éviter de répéter OSRM
  const walkToBoardingCache = new Map<string, PedestrianRoute>();
  const walkFromAlightingCache = new Map<string, PedestrianRoute>();

  const getWalkToStop = async (stop: TransitStop): Promise<PedestrianRoute> => {
    if (!walkToBoardingCache.has(stop.id)) {
      const p = await getPedestrianRoute(
        query.fromLat,
        query.fromLng,
        stop.latitude,
        stop.longitude,
        stop.name
      );
      walkToBoardingCache.set(stop.id, p);
    }
    return walkToBoardingCache.get(stop.id)!;
  };

  const getWalkFromStop = async (stop: TransitStop): Promise<PedestrianRoute> => {
    if (!walkFromAlightingCache.has(stop.id)) {
      const p = await getPedestrianRoute(
        stop.latitude,
        stop.longitude,
        query.toLat,
        query.toLng,
        toLabel
      );
      walkFromAlightingCache.set(stop.id, p);
    }
    return walkFromAlightingCache.get(stop.id)!;
  };

  // ---------------------------------------------------------------------------
  // 3. Calcul des Lignes Directes (Anti-Détours)
  // ---------------------------------------------------------------------------
  for (const dep of departureStops) {
    for (const arr of arrivalStops) {
      if (dep.stop.id === arr.stop.id) continue;

      for (const line of DIJON_LINES) {
        const lineSeg = findDirectLineSegment(line, dep.stop, arr.stop);
        if (!lineSeg) continue;

        const stopCount = lineSeg.stops.length - 1;

        // RÈGLE ANTI-DÉTOUR 1 : Interdire tout trajet de 1 seul arrêt
        // si la marche directe entre les deux arrêts est rapide
        if (stopCount === 1) {
          const interStopDist = calculateDistanceMeters(
            dep.stop.latitude,
            dep.stop.longitude,
            arr.stop.latitude,
            arr.stop.longitude
          );
          if (interStopDist < 550) continue;
        }

        const transitMinutes = stopCount * TRANSIT_MINUTES_PER_STOP;
        const nextDepMinutes = getNextDepartureEstimate(line.id, now);
        const headway = getLineHeadwayMinutes(line.id, now);

        const walkToBoarding = await getWalkToStop(dep.stop);
        const walkFromAlighting = await getWalkFromStop(arr.stop);

        // Durée totale = marche départ + attente montée (+4 min moyenne) + transit + marche arrivée
        const totalMinutes =
          walkToBoarding.durationMinutes +
          Math.max(nextDepMinutes, BOARDING_WAIT_PENALTY_MINUTES) +
          transitMinutes +
          walkFromAlighting.durationMinutes;

        // RÈGLE ANTI-DÉTOUR 2 : Si la marche 100% à pied existe et est plus rapide ou équivalente,
        // ne pas proposer un trajet transport inutile
        if (walkDirectRoute && totalMinutes >= walkDirectRoute.durationMinutes + 3) {
          continue;
        }

        const boardingTime = new Date(
          now.getTime() + (walkToBoarding.durationMinutes + nextDepMinutes) * 60 * 1000
        );
        const alightingTime = new Date(boardingTime.getTime() + transitMinutes * 60 * 1000);
        const arrDate = new Date(now.getTime() + totalMinutes * 60 * 1000);

        const transitPolyline: [number, number][] = lineSeg.stops.map(s => [
          s.latitude,
          s.longitude,
        ]);

        const stopTimes = generateEstimatedStopTimes(boardingTime, stopCount);
        const legCrowdStatus = reportService.getStationCrowdStatus(dep.stop.id, line.id, now);

        const segments: RouteSegment[] = [
          {
            type: 'WALK',
            instruction: `Marcher jusqu'à l'arrêt ${dep.stop.name}`,
            durationMinutes: walkToBoarding.durationMinutes,
            distanceMeters: walkToBoarding.distanceMeters,
            polyline: walkToBoarding.polyline,
            turnInstructions: walkToBoarding.turnInstructions,
            toStop: dep.stop,
            departureTime: formatTime(now),
            arrivalTime: formatTime(new Date(now.getTime() + walkToBoarding.durationMinutes * 60 * 1000)),
          },
          {
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
            estimatedStopTimes: stopTimes,
            departureTime: formatTime(boardingTime),
            arrivalTime: formatTime(alightingTime),
            crowdStatus: legCrowdStatus,
          },
          {
            type: 'WALK',
            instruction: `Marcher jusqu'à ${toLabel}`,
            durationMinutes: walkFromAlighting.durationMinutes,
            distanceMeters: walkFromAlighting.distanceMeters,
            polyline: walkFromAlighting.polyline,
            turnInstructions: walkFromAlighting.turnInstructions,
            fromStop: arr.stop,
            departureTime: formatTime(alightingTime),
            arrivalTime: formatTime(arrDate),
          },
        ];

        const fullPolyline: [number, number][] = [
          ...walkToBoarding.polyline,
          ...transitPolyline,
          ...walkFromAlighting.polyline,
        ];

        const matchingAlerts = findMatchingReports(
          [line.id],
          lineSeg.stops.map(s => s.id)
        );
        const { crowdStatus, crowdSummary } = summarizeRouteCrowd(segments);

        routes.push({
          id: `route-direct-${line.id}-${dep.stop.id}-${arr.stop.id}`,
          title: `Direct (${line.id})`,
          departureTime: formatTime(boardingTime),
          arrivalTime: formatTime(arrDate),
          totalDurationMinutes: totalMinutes,
          walkingDurationMinutes:
            walkToBoarding.durationMinutes + walkFromAlighting.durationMinutes,
          transitDurationMinutes: transitMinutes,
          transfersCount: 0,
          headwayMinutes: headway,
          summary: `${line.id} direct (${transitMinutes} min en transit)`,
          nextDepartureMinutes: nextDepMinutes,
          hasControllerAlert: matchingAlerts.length > 0,
          alerts: matchingAlerts,
          crowdStatus,
          crowdSummary,
          fullPolyline,
          segments,
          steps: mapSegmentsToSteps(segments),
        });

        break; // Évite les doublons sur la même ligne pour ce couple
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Calcul des Correspondances via Pôles Majeurs (Max 1 correspondance)
  // ---------------------------------------------------------------------------
  const candidateHubs = ['hub-darcy', 'hub-republique', 'hub-monge', 'hub-gare', 'hub-universite'];

  for (const dep of departureStops.slice(0, 3)) {
    for (const arr of arrivalStops.slice(0, 3)) {
      if (dep.stop.id === arr.stop.id) continue;

      for (const hubId of candidateHubs) {
        if (dep.stop.id === hubId || arr.stop.id === hubId) continue;

        for (const lineA of DIJON_LINES) {
          const hubStopA = lineA.stops.find(s => s.id === hubId);
          if (!hubStopA) continue;

          const legA = findDirectLineSegment(lineA, dep.stop, hubStopA);
          if (!legA) continue;
          if (legA.stops.length - 1 < 2) continue; // Pas de leg de 1 seul arrêt

          for (const lineB of DIJON_LINES) {
            if (lineB.id === lineA.id) continue;
            const hubStopB = lineB.stops.find(s => s.id === hubId);
            if (!hubStopB) continue;

            const legB = findDirectLineSegment(lineB, hubStopB, arr.stop);
            if (!legB) continue;
            if (legB.stops.length - 1 < 2) continue; // Pas de leg de 1 seul arrêt

            const stopsCountA = legA.stops.length - 1;
            const stopsCountB = legB.stops.length - 1;
            const transitMinA = stopsCountA * TRANSIT_MINUTES_PER_STOP;
            const transitMinB = stopsCountB * TRANSIT_MINUTES_PER_STOP;
            const nextDepMinA = getNextDepartureEstimate(lineA.id, now);
            const headwayA = getLineHeadwayMinutes(lineA.id, now);

            const walkToBoarding = await getWalkToStop(dep.stop);
            const walkFromAlighting = await getWalkFromStop(arr.stop);

            // RÈGLE ANTI-DÉTOUR 3 : Pénalité stricte de +6 min à chaque correspondance
            const totalMinutes =
              walkToBoarding.durationMinutes +
              Math.max(nextDepMinA, BOARDING_WAIT_PENALTY_MINUTES) +
              transitMinA +
              TRANSFER_WAIT_PENALTY_MINUTES +
              transitMinB +
              walkFromAlighting.durationMinutes;

            const boardingTimeA = new Date(
              now.getTime() + (walkToBoarding.durationMinutes + nextDepMinA) * 60 * 1000
            );
            const arrivalHubA = new Date(boardingTimeA.getTime() + transitMinA * 60 * 1000);
            const boardingTimeB = new Date(arrivalHubA.getTime() + TRANSFER_WAIT_PENALTY_MINUTES * 60 * 1000);
            const alightingTimeB = new Date(boardingTimeB.getTime() + transitMinB * 60 * 1000);
            const arrDate = new Date(now.getTime() + totalMinutes * 60 * 1000);

            const polylineA: [number, number][] = legA.stops.map(s => [s.latitude, s.longitude]);
            const polylineB: [number, number][] = legB.stops.map(s => [s.latitude, s.longitude]);

            const stopTimesA = generateEstimatedStopTimes(boardingTimeA, stopsCountA);
            const stopTimesB = generateEstimatedStopTimes(boardingTimeB, stopsCountB);
            const crowdStatusA = reportService.getStationCrowdStatus(dep.stop.id, lineA.id, now);
            const crowdStatusB = reportService.getStationCrowdStatus(hubStopB.id, lineB.id, now);

            const segments: RouteSegment[] = [
              {
                type: 'WALK',
                instruction: `Marcher jusqu'à ${dep.stop.name}`,
                durationMinutes: walkToBoarding.durationMinutes,
                distanceMeters: walkToBoarding.distanceMeters,
                polyline: walkToBoarding.polyline,
                turnInstructions: walkToBoarding.turnInstructions,
                toStop: dep.stop,
                departureTime: formatTime(now),
                arrivalTime: formatTime(new Date(now.getTime() + walkToBoarding.durationMinutes * 60 * 1000)),
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
                estimatedStopTimes: stopTimesA,
                departureTime: formatTime(boardingTimeA),
                arrivalTime: formatTime(arrivalHubA),
                crowdStatus: crowdStatusA,
              },
              {
                type: 'TRANSFER',
                instruction: `Correspondance à ${hubStopA.name} : rejoindre le quai ${lineB.id}`,
                durationMinutes: TRANSFER_WAIT_PENALTY_MINUTES,
                distanceMeters: 60,
                polyline: [[hubStopA.latitude, hubStopA.longitude], [hubStopB.latitude, hubStopB.longitude]],
                turnInstructions: [`Changer de quai vers ${lineB.id}`],
                fromStop: hubStopA,
                toStop: hubStopB,
                departureTime: formatTime(arrivalHubA),
                arrivalTime: formatTime(boardingTimeB),
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
                estimatedStopTimes: stopTimesB,
                departureTime: formatTime(boardingTimeB),
                arrivalTime: formatTime(alightingTimeB),
                crowdStatus: crowdStatusB,
              },
              {
                type: 'WALK',
                instruction: `Marcher jusqu'à ${toLabel}`,
                durationMinutes: walkFromAlighting.durationMinutes,
                distanceMeters: walkFromAlighting.distanceMeters,
                polyline: walkFromAlighting.polyline,
                turnInstructions: walkFromAlighting.turnInstructions,
                fromStop: arr.stop,
                departureTime: formatTime(alightingTimeB),
                arrivalTime: formatTime(arrDate),
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
            const { crowdStatus, crowdSummary } = summarizeRouteCrowd(segments);

            routes.push({
              id: `route-transfer-${lineA.id}-${lineB.id}-${hubId}`,
              title: `${lineA.id} ➜ ${lineB.id} via ${hubStopA.name}`,
              departureTime: formatTime(boardingTimeA),
              arrivalTime: formatTime(arrDate),
              totalDurationMinutes: totalMinutes,
              walkingDurationMinutes:
                walkToBoarding.durationMinutes + TRANSFER_WAIT_PENALTY_MINUTES + walkFromAlighting.durationMinutes,
              transitDurationMinutes: transitMinA + transitMinB,
              transfersCount: 1,
              headwayMinutes: headwayA,
              summary: `${lineA.id} ➜ ${lineB.id} via ${hubStopA.name}`,
              nextDepartureMinutes: nextDepMinA,
              hasControllerAlert: matchingAlerts.length > 0,
              alerts: matchingAlerts,
              crowdStatus,
              crowdSummary,
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

  // ---------------------------------------------------------------------------
  // 5. Filtrage Intelligent des Alternatives (Anti-Détours > +35%)
  // ---------------------------------------------------------------------------
  if (routes.length === 0) return [];

  // Tri par durée totale
  const sorted = routes.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
  const bestDuration = sorted[0].totalDurationMinutes;

  // Élimine tout itinéraire faisant un détour > +35 % par rapport au meilleur trajet
  const maxAllowedDuration = Math.round(bestDuration * 1.35);
  const filtered = sorted.filter(
    r => r.totalDurationMinutes <= maxAllowedDuration || r.title.includes('100% à pied')
  );

  // Dédupliquer les propositions basées sur les mêmes lignes
  const seenLineCombos = new Set<string>();
  const distinctRoutes: RouteOption[] = [];

  for (const r of filtered) {
    const key = r.segments
      .filter(s => s.type === 'TRANSIT')
      .map(s => s.lineId)
      .join('-');

    if (!seenLineCombos.has(key) || key === '') {
      seenLineCombos.add(key);
      distinctRoutes.push(r);
    }
    if (distinctRoutes.length >= 4) break; // Maximum 3 à 4 alternatives
  }

  // Donner le titre "Recommandé" au meilleur itinéraire transport
  const bestTransit = distinctRoutes.find(r => r.transitDurationMinutes > 0);
  if (bestTransit) {
    bestTransit.title = `Recommandé · ${bestTransit.summary}`;
  }

  return distinctRoutes;
}
