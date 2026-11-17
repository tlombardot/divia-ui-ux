import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateDistanceMeters, DARCY_HUB, DIJON_CENTER } from '../data/dijonNetwork';
import { storageService } from '../services/storageService';
import { RouteOption, RouteSegment, UserLocation } from '../types';

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
const DIJON_MAX_DISTANCE_METERS = 15000;

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

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const simulationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        const boardingStop = currentSegment.toStop;
        if (boardingStop) {
          const dist = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            boardingStop.latitude,
            boardingStop.longitude
          );
          setDistanceToNextStep(dist);

          // Geofencing : Entrée dans le rayon de 30m de l'arrêt
          if (dist <= BOARDING_RADIUS_METERS) {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              // Ignore in environments without haptics
            }

            // Bascule AUTOMATIQUE sur le segment transit suivant
            const nextIdx = currentSegmentIndex + 1;
            setCurrentSegmentIndex(nextIdx);
            setNavState('ON_TRANSIT');
            setPassedStopsCount(0);
            setAlightingWarning(null);

            storageService.saveActiveNavigation({
              activeRoute,
              currentSegmentIndex: nextIdx,
              currentStepIndex: nextIdx,
              startedAt: Date.now(),
              navState: 'ON_TRANSIT',
            });
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
              setCurrentSegmentIndex(nextIdx);

              if (nextSegment.type === 'TRANSFER') {
                setNavState('TRANSFER');
              } else {
                setNavState('WALKING_TO_DEST');
              }

              storageService.saveActiveNavigation({
                activeRoute,
                currentSegmentIndex: nextIdx,
                currentStepIndex: nextIdx,
                startedAt: Date.now(),
                navState: nextSegment.type === 'TRANSFER' ? 'TRANSFER' : 'WALKING_TO_DEST',
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
        const nextBoarding = currentSegment.toStop;
        if (nextBoarding) {
          const dist = calculateDistanceMeters(
            coords.latitude,
            coords.longitude,
            nextBoarding.latitude,
            nextBoarding.longitude
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

  // ---------------------------------------------------------------------------
  // Suivi GPS réel continu en arrière-plan via expo-location
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    async function startContinuousTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000, // 2s
            distanceInterval: 4, // 4m
          },
          position => {
            if (!isMounted || isSimulating) return;

            const dist = calculateDistanceMeters(
              position.coords.latitude,
              position.coords.longitude,
              DIJON_CENTER.latitude,
              DIJON_CENTER.longitude
            );

            // Bascule sur Darcy si testeur à > 15 km
            if (dist > DIJON_MAX_DISTANCE_METERS) {
              setCurrentLocation({
                latitude: DARCY_HUB.latitude,
                longitude: DARCY_HUB.longitude,
                isDemoMode: true,
                heading: position.coords.heading,
              });
            } else {
              processLocationUpdate({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                heading: position.coords.heading,
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
  }, [processLocationUpdate, isSimulating]);

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
    const initialNavState: NavState =
      firstSegment?.type === 'TRANSIT' ? 'ON_TRANSIT' : 'WALKING_TO_STOP';

    setNavState(initialNavState);

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
    const polyline = activeRoute.fullPolyline;

    if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);

    simulationTimerRef.current = setInterval(() => {
      if (index >= polyline.length) {
        if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
        setIsSimulating(false);
        setNavState('ARRIVED');
        return;
      }

      const [lat, lon] = polyline[index];
      const progress = index / (polyline.length - 1);
      setSimulationProgress(progress);

      processLocationUpdate({
        latitude: lat,
        longitude: lon,
      });

      index++;
    }, 1200); // Avance d'un point toutes les 1.2s pour une simulation fluide
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
