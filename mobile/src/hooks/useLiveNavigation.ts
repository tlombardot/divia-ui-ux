import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateBearing,
  calculateDistanceMeters,
  DARCY_HUB,
  DIJON_CENTER,
} from '../data/dijonNetwork';
import { storageService } from '../services/storageService';
import { RouteOption, RouteSegment, UserLocation } from '../types';
import { shouldAcceptHeadingUpdate } from '../utils/headingUtils';
import { generateSmoothTrajectory } from '../utils/trajectoryUtils';

export type NavState =
  | 'IDLE'
  | 'WALKING_TO_STOP'
  | 'ON_TRANSIT'
  | 'TRANSFER'
  | 'WALKING_TO_DEST'
  | 'ARRIVED';

const BOARDING_RADIUS_METERS = 30;
const TRANSIT_STATION_RADIUS_METERS = 45;
const DESTINATION_RADIUS_METERS = 25;
const DIJON_MAX_DISTANCE_METERS = 25000; // 25 km Grand Dijon limit

export function useLiveNavigation() {
  const [activeRoute, setActiveRoute] = useState<RouteOption | null>(null);
  const [navState, setNavState] = useState<NavState>('IDLE');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);
  const [passedStopsCount, setPassedStopsCount] = useState<number>(0);
  const [distanceToNextStep, setDistanceToNextStep] = useState<number>(0);
  const [alightingWarning, setAlightingWarning] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationProgress, setSimulationProgress] = useState<number>(0);

  const [currentLocation, setCurrentLocation] = useState<UserLocation>({
    latitude: DARCY_HUB.latitude,
    longitude: DARCY_HUB.longitude,
    isDemoMode: true,
  });

  const lastLocationRef = useRef<UserLocation>(currentLocation);
  lastLocationRef.current = currentLocation;

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const headingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const simulationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const lastHeadingUpdateRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Traitement d'une mise à jour GPS et Machine à États Geofencing Automatique
  // ---------------------------------------------------------------------------
  const processLocationUpdate = useCallback(
    (coords: { latitude: number; longitude: number; heading?: number | null }) => {
      setCurrentLocation(prev => ({
        ...prev,
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading ?? prev.heading,
      }));

      if (!activeRoute || navState === 'IDLE' || navState === 'ARRIVED') return;

      const segments = activeRoute.segments;
      const currentSegment: RouteSegment | undefined = segments[currentSegmentIndex];
      if (!currentSegment) return;

      // =======================================================================
      // État 1 : Marche vers l'arrêt de montée (WALKING_TO_STOP)
      // =======================================================================
      if (navState === 'WALKING_TO_STOP') {
        const nextSeg = segments[currentSegmentIndex + 1];
        const boardingStop = currentSegment.toStop ?? nextSeg?.fromStop;
        const lastWalkPt = currentSegment.polyline[currentSegment.polyline.length - 1];
        const targetLat = boardingStop?.latitude ?? lastWalkPt?.[0];
        const targetLon = boardingStop?.longitude ?? lastWalkPt?.[1];

        if (targetLat !== undefined && targetLon !== undefined) {
          const dist = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            targetLat,
            targetLon
          );
          setDistanceToNextStep(dist);

          // Geofencing : Entrée dans le rayon de 30m de l'arrêt
          if (dist <= BOARDING_RADIUS_METERS) {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              // Ignore in environments without haptics
            }

            const nextIdx = currentSegmentIndex + 1;
            if (nextIdx < segments.length) {
              const nextState: NavState =
                segments[nextIdx].type === 'TRANSIT' ? 'ON_TRANSIT' : 'WALKING_TO_DEST';
              setCurrentSegmentIndex(nextIdx);
              setNavState(nextState);
              setPassedStopsCount(0);
              setAlightingWarning(null);

              storageService.saveActiveNavigation({
                activeRoute,
                currentSegmentIndex: nextIdx,
                currentStepIndex: nextIdx,
                startedAt: Date.now(),
                navState: nextState,
              });
            } else {
              setNavState('ARRIVED');
              storageService.clearActiveNavigation();
            }
            return;
          }
        }
      }

      // =======================================================================
      // État 2 : À bord du tram/bus (ON_TRANSIT)
      // =======================================================================
      if (navState === 'ON_TRANSIT') {
        const alightingStop = currentSegment.toStop;
        const passedStops = currentSegment.passedStops || [];

        // 1. Détection automatique des arrêts franchis le long de la ligne (< 45m)
        if (passedStops.length > 0) {
          for (let i = passedStopsCount; i < passedStops.length; i++) {
            const stop = passedStops[i];
            const distStop = calculateDistanceMeters(
              coords.latitude,
              coords.longitude,
              stop.latitude,
              stop.longitude
            );

            if (distStop <= TRANSIT_STATION_RADIUS_METERS) {
              const newPassed = i + 1;
              setPassedStopsCount(newPassed);

              const remainingStops = passedStops.length - newPassed;

              // Alerte 1 arrêt avant la descente
              if (remainingStops === 1 && alightingStop) {
                setAlightingWarning(
                  `Prochain arrêt : ${alightingStop.name} — Préparez-vous à descendre`
                );
                try {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                } catch {
                  // Ignore
                }
              }
              break;
            }
          }
        }

        // 2. Détection de l'arrivée à l'arrêt de descente (< 45m)
        if (alightingStop) {
          const distToExit = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            alightingStop.latitude,
            alightingStop.longitude
          );
          setDistanceToNextStep(distToExit);

          if (distToExit <= TRANSIT_STATION_RADIUS_METERS) {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              // Ignore
            }

            const nextIdx = currentSegmentIndex + 1;
            setAlightingWarning(null);

            if (nextIdx < segments.length) {
              const nextSegment = segments[nextIdx];
              const followingSegment = segments[nextIdx + 1];
              setCurrentSegmentIndex(nextIdx);

              let nextState: NavState = 'WALKING_TO_DEST';
              if (nextSegment.type === 'TRANSIT') {
                nextState = 'ON_TRANSIT';
                setPassedStopsCount(0);
              } else if (
                nextSegment.type === 'TRANSFER' ||
                (nextSegment.type === 'WALK' && followingSegment?.type === 'TRANSIT')
              ) {
                nextState = 'TRANSFER';
              }

              setNavState(nextState);

              storageService.saveActiveNavigation({
                activeRoute,
                currentSegmentIndex: nextIdx,
                currentStepIndex: nextIdx,
                startedAt: Date.now(),
                navState: nextState,
              });
            } else {
              setNavState('ARRIVED');
              storageService.clearActiveNavigation();
            }
            return;
          }
        }
      }

      // =======================================================================
      // État 3 : Correspondance quai à quai (TRANSFER)
      // =======================================================================
      if (navState === 'TRANSFER') {
        const nextSeg = segments[currentSegmentIndex + 1];
        const nextBoarding = currentSegment.toStop ?? nextSeg?.fromStop;
        const lastTransferPt = currentSegment.polyline[currentSegment.polyline.length - 1];
        const targetLat = nextBoarding?.latitude ?? lastTransferPt?.[0];
        const targetLon = nextBoarding?.longitude ?? lastTransferPt?.[1];

        if (targetLat !== undefined && targetLon !== undefined) {
          const dist = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            targetLat,
            targetLon
          );
          setDistanceToNextStep(dist);

          if (dist <= BOARDING_RADIUS_METERS) {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              // Ignore
            }
            const nextIdx = currentSegmentIndex + 1;
            setCurrentSegmentIndex(nextIdx);
            setNavState('ON_TRANSIT');
            setPassedStopsCount(0);
            return;
          }
        }
      }

      // =======================================================================
      // État 4 : Marche finale vers destination exacte (WALKING_TO_DEST)
      // =======================================================================
      if (navState === 'WALKING_TO_DEST') {
        const lastCoord = currentSegment.polyline[currentSegment.polyline.length - 1];
        if (lastCoord) {
          const [destLat, destLon] = lastCoord;
          const dist = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            destLat,
            destLon
          );
          setDistanceToNextStep(dist);

          // Geofencing final : Arrivée à moins de 25m de l'adresse
          if (dist <= DESTINATION_RADIUS_METERS) {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              // Ignore
            }
            setNavState('ARRIVED');
            storageService.clearActiveNavigation();
          }
        }
      }
    },
    [activeRoute, navState, currentSegmentIndex, passedStopsCount]
  );

  const processLocationUpdateRef = useRef(processLocationUpdate);
  processLocationUpdateRef.current = processLocationUpdate;

  const isTrackingActive = navState !== 'IDLE' && navState !== 'ARRIVED' && !isSimulating;

  // ---------------------------------------------------------------------------
  // Suivi GPS réel continu uniquement pendant une navigation active (zéro coût en mode accueil)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isTrackingActive) return;

    let isMounted = true;

    async function startContinuousTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !isMounted) return;

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000, // 2s
            distanceInterval: 4, // 4m
          },
          position => {
            if (!isMounted) return;

            const dist = calculateDistanceMeters(
              position.coords.latitude,
              position.coords.longitude,
              DIJON_CENTER.latitude,
              DIJON_CENTER.longitude
            );

            // Bascule sur Darcy si testeur à > 25 km
            if (dist > DIJON_MAX_DISTANCE_METERS) {
              setCurrentLocation(prev => ({
                ...prev,
                latitude: DARCY_HUB.latitude,
                longitude: DARCY_HUB.longitude,
                isDemoMode: true,
                heading: position.coords.heading ?? prev.heading,
              }));
            } else {
              const posLat = position.coords.latitude;
              const posLon = position.coords.longitude;
              let heading: number | null | undefined = position.coords.heading;

              // Si le heading natif n'est pas fourni (< 0 ou null), calculer le cap par rapport à la position précédente
              if (heading === null || heading === undefined || heading < 0) {
                const prev = lastLocationRef.current;
                const moved = calculateDistanceMeters(prev.latitude, prev.longitude, posLat, posLon);
                if (moved >= 2) {
                  heading = calculateBearing(prev.latitude, prev.longitude, posLat, posLon);
                } else {
                  heading = prev.heading;
                }
              }

              processLocationUpdateRef.current({
                latitude: posLat,
                longitude: posLon,
                heading,
              });
            }
          }
        );

        locationSubscriptionRef.current = sub;
      } catch (e) {
        console.warn('[useLiveNavigation] Erreur subscription GPS:', e);
      }
    }

    startContinuousTracking();

    return () => {
      isMounted = false;
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
    };
  }, [isTrackingActive]);

  // ---------------------------------------------------------------------------
  // Suivi boussole physique uniquement en navigation active (throttlé + dead-band anti-jitter)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isTrackingActive) return;

    let isMounted = true;

    async function startCompassTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !isMounted) return;

        const sub = await Location.watchHeadingAsync(headingObj => {
          if (!isMounted) return;
          const h =
            headingObj.trueHeading >= 0
              ? headingObj.trueHeading
              : headingObj.magHeading;

          if (h >= 0) {
            const rounded = Math.round(h);
            const now = Date.now();
            if (
              !shouldAcceptHeadingUpdate(
                lastHeadingRef.current,
                rounded,
                lastHeadingUpdateRef.current,
                now
              )
            ) {
              return;
            }
            lastHeadingRef.current = rounded;
            lastHeadingUpdateRef.current = now;
            setCurrentLocation(prev => {
              if (prev.heading === rounded) return prev;
              return {
                ...prev,
                heading: rounded,
              };
            });
          }
        });

        headingSubscriptionRef.current = sub;
      } catch (e) {
        console.warn('[useLiveNavigation] Erreur subscription boussole:', e);
      }
    }

    startCompassTracking();

    return () => {
      isMounted = false;
      if (headingSubscriptionRef.current) {
        headingSubscriptionRef.current.remove();
        headingSubscriptionRef.current = null;
      }
    };
  }, [isTrackingActive]);

  // ---------------------------------------------------------------------------
  // Restauration de session depuis AsyncStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function restore() {
      const saved = await storageService.loadActiveNavigation();
      if (saved && saved.activeRoute) {
        setActiveRoute(saved.activeRoute);
        setCurrentSegmentIndex(saved.currentSegmentIndex || 0);
        setNavState((saved.navState as NavState) || 'WALKING_TO_STOP');
      }
    }
    restore();
  }, []);

  // ---------------------------------------------------------------------------
  // Démarrer / Quitter la navigation
  // ---------------------------------------------------------------------------
  const startNavigation = useCallback((route: RouteOption) => {
    setActiveRoute(route);
    setCurrentSegmentIndex(0);
    setPassedStopsCount(0);
    setAlightingWarning(null);

    const firstSegment = route.segments[0];
    const hasTransit = route.segments.some(s => s.type === 'TRANSIT');
    const initialNavState: NavState =
      firstSegment?.type === 'TRANSIT'
        ? 'ON_TRANSIT'
        : hasTransit
          ? 'WALKING_TO_STOP'
          : 'WALKING_TO_DEST';

    setNavState(initialNavState);

    // Initialise le cap le long des premiers mètres du trajet si disponible
    if (route.fullPolyline && route.fullPolyline.length >= 2) {
      const initialBearing = calculateBearing(
        route.fullPolyline[0][0],
        route.fullPolyline[0][1],
        route.fullPolyline[1][0],
        route.fullPolyline[1][1]
      );
      setCurrentLocation(prev => ({
        ...prev,
        heading: initialBearing,
      }));
    }

    storageService.saveActiveNavigation({
      activeRoute: route,
      currentSegmentIndex: 0,
      currentStepIndex: 0,
      startedAt: Date.now(),
      navState: initialNavState,
    });
  }, []);

  const stopNavigation = useCallback(async () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setIsSimulating(false);
    setSimulationProgress(0);
    setNavState('IDLE');
    setActiveRoute(null);
    setCurrentSegmentIndex(0);
    setAlightingWarning(null);
    await storageService.clearActiveNavigation();
  }, []);

  // ---------------------------------------------------------------------------
  // Simulateur GPS de Test (Déplacement automatique le long du tracé calculé)
  // ---------------------------------------------------------------------------
  const startSimulation = useCallback(() => {
    if (!activeRoute || activeRoute.fullPolyline.length === 0) return;

    setIsSimulating(true);
    let index = 0;
    // Subdivise la polyline en sous-étapes métriques rapprochées (tous les 2.5m)
    // pour un déplacement GPS continu, réaliste et sans à-coups
    const trajectory = generateSmoothTrajectory(activeRoute.fullPolyline, 2.5);
    if (trajectory.length === 0) return;

    if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);

    simulationTimerRef.current = setInterval(() => {
      if (index >= trajectory.length) {
        if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
        setIsSimulating(false);
        setNavState('ARRIVED');
        return;
      }

      const point = trajectory[index];
      const progress = index / Math.max(1, trajectory.length - 1);
      setSimulationProgress(progress);

      processLocationUpdate({
        latitude: point.latitude,
        longitude: point.longitude,
        heading: point.heading,
      });

      index++;
    }, 140); // 140ms par pas de 2.5m : glissement continu et naturel de guidage GPS
  }, [activeRoute, processLocationUpdate]);

  const stopSimulation = useCallback(() => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setIsSimulating(false);
  }, []);

  return {
    activeRoute,
    navState,
    currentSegmentIndex,
    currentLocation,
    distanceToNextStep,
    passedStopsCount,
    alightingWarning,
    isSimulating,
    simulationProgress,
    startNavigation,
    stopNavigation,
    startSimulation,
    stopSimulation,
  };
}
