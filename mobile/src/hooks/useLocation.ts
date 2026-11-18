import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateDistanceMeters, DARCY_HUB, DIJON_CENTER } from '../data/dijonNetwork';
import { UserLocation } from '../types';
import { shouldAcceptHeadingUpdate } from '../utils/headingUtils';

const DIJON_MAX_DISTANCE_METERS = 25000; // 25 km Grand Dijon limit (Chenôve, Talant, Quetigny, Longvic, etc.)

export function useLocation(options?: { pauseCompass?: boolean }) {
  const pauseCompass = options?.pauseCompass ?? false;
  const [location, setLocation] = useState<UserLocation>({
    latitude: DARCY_HUB.latitude,
    longitude: DARCY_HUB.longitude,
    isDemoMode: true,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const lastHeadingUpdateRef = useRef<number>(0);

  const fetchLocation = useCallback(async () => {
    setIsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission de géolocalisation refusée.');
        // Fallback to Darcy Hub
        setLocation({
          latitude: DARCY_HUB.latitude,
          longitude: DARCY_HUB.longitude,
          isDemoMode: true,
        });
        setIsLoading(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const dist = calculateDistanceMeters(
        position.coords.latitude,
        position.coords.longitude,
        DIJON_CENTER.latitude,
        DIJON_CENTER.longitude
      );

      // Check if tester is more than 15 km from Dijon
      if (dist > DIJON_MAX_DISTANCE_METERS) {
        setLocation({
          latitude: DARCY_HUB.latitude,
          longitude: DARCY_HUB.longitude,
          isDemoMode: true,
          accuracy: position.coords.accuracy,
        });
      } else {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          isDemoMode: false,
          accuracy: position.coords.accuracy,
        });
      }
    } catch (error) {
      console.warn('[useLocation] Erreur de localisation, bascule sur Darcy:', error);
      setLocation({
        latitude: DARCY_HUB.latitude,
        longitude: DARCY_HUB.longitude,
        isDemoMode: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  // Suivi en temps réel de la boussole physique du smartphone (throttlé + dead-band anti-jitter)
  useEffect(() => {
    if (pauseCompass) return;

    let isMounted = true;
    let headingSub: Location.LocationSubscription | null = null;

    async function startCompassTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || !isMounted) return;

        headingSub = await Location.watchHeadingAsync(headingObj => {
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
            setLocation(prev => {
              if (prev.heading === rounded) return prev;
              return {
                ...prev,
                heading: rounded,
              };
            });
          }
        });
      } catch (err) {
        console.warn('[useLocation] Boussole non disponible ou erreur:', err);
      }
    }

    startCompassTracking();

    return () => {
      isMounted = false;
      if (headingSub) {
        headingSub.remove();
      }
    };
  }, [pauseCompass]);

  return {
    location,
    isDemoMode: location.isDemoMode,
    isLoading,
    errorMsg,
    refreshLocation: fetchLocation,
  };
}
