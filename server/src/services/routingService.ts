import {
  calculateDistanceMeters,
  findNearbyStops,
} from '../data/dijonNetwork';
import {
  CrowdLevel,
  CrowdStatus,
  RouteOption,
  RouteQuery,
  RouteSegment,
  RouteStep,
  TransitLine,
  TransitStop,
} from '../types';
import {
  computePolylineLengthMeters,
  LatLng,
  sliceLineGeometry,
} from '../utils/geometryTopology';
import { matchRouteControllerReports } from './controllerTrackerService';
import { networkGeometryService } from './networkGeometryService';
import { getPedestrianRoute, PedestrianRoute } from './pedestrianService';
import { reportService } from './reportService';

const TRAM_SPEED_METERS_PER_MIN = (22 * 1000) / 60; // ~22 km/h commercial speed
const BUS_SPEED_METERS_PER_MIN = (16 * 1000) / 60; // ~16 km/h commercial speed
const DWELL_MINUTES_PER_STOP = 0.5; // 30s per stop
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

  if (lineId.startsWith('L')) {
    if (isPeak) return 6;
    if (isEvening) return 20;
    return 10;
  }

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
 * Calcul réaliste de durée d'un tronçon transport à partir de la distance réelle sur rails/rues
 */
export function computeTransitDurationMinutes(
  line: TransitLine,
  distanceMeters: number,
  stopsCount: number
): number {
  const speedMpm = line.category === 'TRAM' ? TRAM_SPEED_METERS_PER_MIN : BUS_SPEED_METERS_PER_MIN;
  const runMinutes = distanceMeters / speedMpm;
  const dwellMinutes = stopsCount * DWELL_MINUTES_PER_STOP;
  return Math.max(2, Math.round(runMinutes + dwellMinutes));
}

/**
 * Résolution directionnelle stricte (Aller vs Retour) et découpage exact de la polyligne
 */
function findDirectionalLineSegment(
  line: TransitLine,
  fromStop: TransitStop,
  toStop: TransitStop
): {
  stops: TransitStop[];
  direction: string;
  polyline: LatLng[];
  distanceMeters: number;
  durationMinutes: number;
} | null {
  const fromIdx = line.stops.findIndex(s => s.id === fromStop.id);
  const toIdx = line.stops.findIndex(s => s.id === toStop.id);

  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
    return null;
  }

  const isForward = fromIdx < toIdx;
  const segmentStops = isForward
    ? line.stops.slice(fromIdx, toIdx + 1)
    : line.stops.slice(toIdx, fromIdx + 1).reverse();

  const direction = isForward
    ? `Direction ${line.terminusB}`
    : `Direction ${line.terminusA}`;

  // Select exact directional geometry (Aller vs Retour)
  const directionalTrack = isForward
    ? line.polyline
    : line.returnPolyline && line.returnPolyline.length >= 2
      ? line.returnPolyline
      : [...line.polyline].reverse();

  const slicedPolyline = sliceLineGeometry(
    directionalTrack,
    segmentStops[0],
    segmentStops[segmentStops.length - 1]
  );

  const distanceMeters = Math.max(
    100,
    Math.round(computePolylineLengthMeters(slicedPolyline))
  );
  const stopsCount = segmentStops.length - 1;
  const durationMinutes = computeTransitDurationMinutes(line, distanceMeters, stopsCount);

  return {
    stops: segmentStops,
    direction,
    polyline: slicedPolyline,
    distanceMeters,
    durationMinutes,
  };
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

function generateEstimatedStopTimes(
  startTime: Date,
  totalTransitMinutes: number,
  stopCount: number
): string[] {
  const times: string[] = [];
  for (let i = 0; i <= stopCount; i++) {
    const ratio = stopCount > 0 ? i / stopCount : 0;
    const stopDate = new Date(
      startTime.getTime() + Math.round(totalTransitMinutes * ratio) * 60 * 1000
    );
    times.push(formatTime(stopDate));
  }
  return times;
}

/**
 * Calcul multimodal Dijkstra Porte-à-Porte aligné sur les vrais rails et sens Divia
 */
export async function calculateRoutes(query: RouteQuery): Promise<RouteOption[]> {
  const now = query.departureTime ? new Date(query.departureTime) : new Date();
  const routes: RouteOption[] = [];
  const activeNetworkLines = networkGeometryService.getCachedLinesSync();

  const toLabel = query.toLabel || 'Destination';

  const directDistance = calculateDistanceMeters(
    query.fromLat,
    query.fromLng,
    query.toLat,
    query.toLng
  );

  // ---------------------------------------------------------------------------
  // 1. Alternative 100 % à pied (OSRM foot) si distance < 2.5 km
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
  // 3. Lignes Directes (Découpage exact de la géométrie sur rails/rues)
  // ---------------------------------------------------------------------------
  for (const dep of departureStops) {
    for (const arr of arrivalStops) {
      if (dep.stop.id === arr.stop.id) continue;

      for (const line of activeNetworkLines) {
        const lineSeg = findDirectionalLineSegment(line, dep.stop, arr.stop);
        if (!lineSeg) continue;

        const stopCount = lineSeg.stops.length - 1;
        if (stopCount === 1 && lineSeg.distanceMeters < 550) continue;

        const walkToBoarding = await getWalkToStop(lineSeg.stops[0]);
        const walkFromAlighting = await getWalkFromStop(
          lineSeg.stops[lineSeg.stops.length - 1]
        );
        const totalWalkingMin =
          walkToBoarding.durationMinutes + walkFromAlighting.durationMinutes;

        // Cohérence Marche + Transport : rejeter si la marche seule dépasse la marche directe
        if (walkDirectRoute && totalWalkingMin >= walkDirectRoute.durationMinutes) {
          continue;
        }

        const nextDepMinutes = getNextDepartureEstimate(line.id, now);
        const headway = getLineHeadwayMinutes(line.id, now);
        const transitMinutes = lineSeg.durationMinutes;

        const totalMinutes =
          totalWalkingMin +
          Math.max(nextDepMinutes, BOARDING_WAIT_PENALTY_MINUTES) +
          transitMinutes;

        const boardingTime = new Date(
          now.getTime() + (walkToBoarding.durationMinutes + nextDepMinutes) * 60 * 1000
        );
        const alightingTime = new Date(boardingTime.getTime() + transitMinutes * 60 * 1000);
        const arrDate = new Date(now.getTime() + totalMinutes * 60 * 1000);

        const stopTimes = generateEstimatedStopTimes(boardingTime, transitMinutes, stopCount);
        const legCrowdStatus = reportService.getStationCrowdStatus(
          lineSeg.stops[0].id,
          line.id,
          now
        );

        const segments: RouteSegment[] = [
          {
            type: 'WALK',
            instruction: `Marcher jusqu'à l'arrêt ${lineSeg.stops[0].name}`,
            durationMinutes: walkToBoarding.durationMinutes,
            distanceMeters: walkToBoarding.distanceMeters,
            polyline: walkToBoarding.polyline,
            turnInstructions: walkToBoarding.turnInstructions,
            toStop: lineSeg.stops[0],
            departureTime: formatTime(now),
            arrivalTime: formatTime(
              new Date(now.getTime() + walkToBoarding.durationMinutes * 60 * 1000)
            ),
          },
          {
            type: 'TRANSIT',
            instruction: `Prendre le ${line.category === 'TRAM' ? 'Tram' : 'Bus'} ${line.id} (${lineSeg.direction})`,
            durationMinutes: transitMinutes,
            distanceMeters: lineSeg.distanceMeters,
            polyline: lineSeg.polyline,
            lineId: line.id,
            lineName: line.name,
            lineColor: line.color,
            direction: lineSeg.direction,
            fromStop: lineSeg.stops[0],
            toStop: lineSeg.stops[lineSeg.stops.length - 1],
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
            fromStop: lineSeg.stops[lineSeg.stops.length - 1],
            departureTime: formatTime(alightingTime),
            arrivalTime: formatTime(arrDate),
          },
        ];

        const fullPolyline: LatLng[] = [
          ...walkToBoarding.polyline,
          ...lineSeg.polyline,
          ...walkFromAlighting.polyline,
        ];

        const directStopIds = lineSeg.stops.map(s => s.id);
        const { matchingAlerts, predictiveAlerts } = matchRouteControllerReports({
          linesUsed: [line.id],
          stopIdsUsed: directStopIds,
          activeControllers: reportService.getActiveControllerReports(now.getTime()),
          currentTime: now.getTime(),
          lines: networkGeometryService.getCachedLinesSync(),
        });
        const { crowdStatus, crowdSummary } = summarizeRouteCrowd(segments);

        routes.push({
          id: `route-direct-${line.id}-${dep.stop.id}-${arr.stop.id}`,
          title: `Direct (${line.id})`,
          departureTime: formatTime(boardingTime),
          arrivalTime: formatTime(arrDate),
          totalDurationMinutes: totalMinutes,
          walkingDurationMinutes: totalWalkingMin,
          transitDurationMinutes: transitMinutes,
          transfersCount: 0,
          headwayMinutes: headway,
          summary: `${line.id} direct (${transitMinutes} min en transit)`,
          nextDepartureMinutes: nextDepMinutes,
          hasControllerAlert: matchingAlerts.length > 0 || predictiveAlerts.length > 0,
          alerts: matchingAlerts,
          predictiveAlerts,
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

  // ---------------------------------------------------------------------------
  // 4. Correspondances via Pôles Majeurs (Max 1 correspondance, pénalité +6 min)
  // ---------------------------------------------------------------------------
  const candidateHubs = ['hub-darcy', 'hub-republique', 'hub-monge', 'hub-gare', 'hub-universite'];

  for (const dep of departureStops.slice(0, 3)) {
    for (const arr of arrivalStops.slice(0, 3)) {
      if (dep.stop.id === arr.stop.id) continue;

      for (const hubId of candidateHubs) {
        if (dep.stop.id === hubId || arr.stop.id === hubId) continue;

        for (const lineA of activeNetworkLines) {
          const hubStopA = lineA.stops.find(s => s.id === hubId);
          if (!hubStopA) continue;

          const legA = findDirectionalLineSegment(lineA, dep.stop, hubStopA);
          if (!legA || legA.stops.length - 1 < 2) continue;

          for (const lineB of activeNetworkLines) {
            if (lineB.id === lineA.id) continue;
            const hubStopB = lineB.stops.find(s => s.id === hubId);
            if (!hubStopB) continue;

            const legB = findDirectionalLineSegment(lineB, hubStopB, arr.stop);
            if (!legB || legB.stops.length - 1 < 2) continue;

            const walkToBoarding = await getWalkToStop(legA.stops[0]);
            const walkFromAlighting = await getWalkFromStop(
              legB.stops[legB.stops.length - 1]
            );
            const totalWalkingMin =
              walkToBoarding.durationMinutes + walkFromAlighting.durationMinutes;

            if (walkDirectRoute && totalWalkingMin >= walkDirectRoute.durationMinutes) {
              continue;
            }

            const transferWalk = await getPedestrianRoute(
              hubStopA.latitude,
              hubStopA.longitude,
              hubStopB.latitude,
              hubStopB.longitude,
              `quai ${lineB.id}`
            );

            const stopsCountA = legA.stops.length - 1;
            const stopsCountB = legB.stops.length - 1;
            const transitMinA = legA.durationMinutes;
            const transitMinB = legB.durationMinutes;
            const nextDepMinA = getNextDepartureEstimate(lineA.id, now);
            const headwayA = getLineHeadwayMinutes(lineA.id, now);

            const totalMinutes =
              totalWalkingMin +
              Math.max(nextDepMinA, BOARDING_WAIT_PENALTY_MINUTES) +
              transitMinA +
              TRANSFER_WAIT_PENALTY_MINUTES +
              transitMinB;

            const boardingTimeA = new Date(
              now.getTime() + (walkToBoarding.durationMinutes + nextDepMinA) * 60 * 1000
            );
            const arrivalHubA = new Date(boardingTimeA.getTime() + transitMinA * 60 * 1000);
            const boardingTimeB = new Date(
              arrivalHubA.getTime() + TRANSFER_WAIT_PENALTY_MINUTES * 60 * 1000
            );
            const alightingTimeB = new Date(boardingTimeB.getTime() + transitMinB * 60 * 1000);
            const arrDate = new Date(now.getTime() + totalMinutes * 60 * 1000);

            const stopTimesA = generateEstimatedStopTimes(boardingTimeA, transitMinA, stopsCountA);
            const stopTimesB = generateEstimatedStopTimes(boardingTimeB, transitMinB, stopsCountB);
            const crowdStatusA = reportService.getStationCrowdStatus(
              legA.stops[0].id,
              lineA.id,
              now
            );
            const crowdStatusB = reportService.getStationCrowdStatus(
              hubStopB.id,
              lineB.id,
              now
            );

            const segments: RouteSegment[] = [
              {
                type: 'WALK',
                instruction: `Marcher jusqu'à ${legA.stops[0].name}`,
                durationMinutes: walkToBoarding.durationMinutes,
                distanceMeters: walkToBoarding.distanceMeters,
                polyline: walkToBoarding.polyline,
                turnInstructions: walkToBoarding.turnInstructions,
                toStop: legA.stops[0],
                departureTime: formatTime(now),
                arrivalTime: formatTime(
                  new Date(now.getTime() + walkToBoarding.durationMinutes * 60 * 1000)
                ),
              },
              {
                type: 'TRANSIT',
                instruction: `Prendre le ${lineA.category === 'TRAM' ? 'Tram' : 'Bus'} ${lineA.id} (${legA.direction})`,
                durationMinutes: transitMinA,
                distanceMeters: legA.distanceMeters,
                polyline: legA.polyline,
                lineId: lineA.id,
                lineName: lineA.name,
                lineColor: lineA.color,
                direction: legA.direction,
                fromStop: legA.stops[0],
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
                distanceMeters: Math.max(40, transferWalk.distanceMeters),
                polyline: transferWalk.polyline,
                turnInstructions: [`Changer de quai vers ${lineB.id}`],
                fromStop: hubStopA,
                toStop: hubStopB,
                departureTime: formatTime(arrivalHubA),
                arrivalTime: formatTime(boardingTimeB),
              },
              {
                type: 'TRANSIT',
                instruction: `Prendre le ${lineB.category === 'TRAM' ? 'Tram' : 'Bus'} ${lineB.id} (${legB.direction})`,
                durationMinutes: transitMinB,
                distanceMeters: legB.distanceMeters,
                polyline: legB.polyline,
                lineId: lineB.id,
                lineName: lineB.name,
                lineColor: lineB.color,
                direction: legB.direction,
                fromStop: hubStopB,
                toStop: legB.stops[legB.stops.length - 1],
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
                fromStop: legB.stops[legB.stops.length - 1],
                departureTime: formatTime(alightingTimeB),
                arrivalTime: formatTime(arrDate),
              },
            ];

            const fullPolyline: LatLng[] = [
              ...walkToBoarding.polyline,
              ...legA.polyline,
              ...transferWalk.polyline,
              ...legB.polyline,
              ...walkFromAlighting.polyline,
            ];

            const activeControllers = reportService.getActiveControllerReports(now.getTime());
            const cachedLines = networkGeometryService.getCachedLinesSync();
            const matchA = matchRouteControllerReports({
              linesUsed: [lineA.id],
              stopIdsUsed: legA.stops.map(s => s.id),
              activeControllers,
              currentTime: now.getTime(),
              lines: cachedLines,
            });
            const matchB = matchRouteControllerReports({
              linesUsed: [lineB.id],
              stopIdsUsed: legB.stops.map(s => s.id),
              activeControllers,
              currentTime: now.getTime(),
              lines: cachedLines,
            });

            const seenAlertIds = new Set<string>();
            const matchingAlerts = [...matchA.matchingAlerts, ...matchB.matchingAlerts].filter(
              a => {
                if (seenAlertIds.has(a.id)) return false;
                seenAlertIds.add(a.id);
                return true;
              }
            );
            const seenPredIds = new Set<string>();
            const predictiveAlerts = [...matchA.predictiveAlerts, ...matchB.predictiveAlerts]
              .filter(p => {
                if (seenPredIds.has(p.reportId)) return false;
                seenPredIds.add(p.reportId);
                return true;
              })
              .sort((a, b) => a.etaMinutes - b.etaMinutes);
            const { crowdStatus, crowdSummary } = summarizeRouteCrowd(segments);

            routes.push({
              id: `route-transfer-${lineA.id}-${lineB.id}-${hubId}`,
              title: `${lineA.id} ➜ ${lineB.id} via ${hubStopA.name}`,
              departureTime: formatTime(boardingTimeA),
              arrivalTime: formatTime(arrDate),
              totalDurationMinutes: totalMinutes,
              walkingDurationMinutes: totalWalkingMin + TRANSFER_WAIT_PENALTY_MINUTES,
              transitDurationMinutes: transitMinA + transitMinB,
              transfersCount: 1,
              headwayMinutes: headwayA,
              summary: `${lineA.id} ➜ ${lineB.id} via ${hubStopA.name}`,
              nextDepartureMinutes: nextDepMinA,
              hasControllerAlert: matchingAlerts.length > 0 || predictiveAlerts.length > 0,
              alerts: matchingAlerts,
              predictiveAlerts,
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
  // 5. Filtrage Anti-Détours (> +35 %) & Déduplication
  // ---------------------------------------------------------------------------
  if (routes.length === 0) return [];

  const sorted = routes.sort((a, b) => {
    if (a.totalDurationMinutes !== b.totalDurationMinutes) {
      return a.totalDurationMinutes - b.totalDurationMinutes;
    }
    return a.walkingDurationMinutes - b.walkingDurationMinutes;
  });
  const transitCandidates = sorted.filter(r => r.transitDurationMinutes > 0);
  const bestTransitDuration =
    transitCandidates.length > 0
      ? transitCandidates[0].totalDurationMinutes
      : sorted[0].totalDurationMinutes;
  const maxAllowedTransitDuration = Math.round(bestTransitDuration * 1.35);

  const filtered = sorted.filter(
    r =>
      r.title.includes('100% à pied') ||
      r.totalDurationMinutes <= maxAllowedTransitDuration
  );

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
    if (distinctRoutes.length >= 4) break;
  }

  const bestTransit = distinctRoutes.find(r => r.transitDurationMinutes > 0);
  if (bestTransit) {
    bestTransit.title = `Recommandé · ${bestTransit.summary}`;
  }

  return distinctRoutes;
}
