import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  HUB_DARCY,
  HUB_GARE,
  HUB_REPUBLIQUE,
  HUB_UNIVERSITE,
} from '../data/dijonNetwork';
import { TransitStop, UserLocation } from '../types';

export const FAVORITE_STATIONS_STORAGE_KEY = '@diviakhaaa/favorite_stations';

export const SUGGESTED_FAVORITES: TransitStop[] = [
  HUB_DARCY,
  HUB_GARE,
  HUB_REPUBLIQUE,
  HUB_UNIVERSITE,
];

/**
 * Pure helper: toggle station ID inside favorites list
 */
export function toggleFavoriteId(currentIds: string[], stationId: string): string[] {
  if (currentIds.includes(stationId)) {
    return currentIds.filter(id => id !== stationId);
  }
  return [stationId, ...currentIds];
}

/**
 * Pure helper: resolve favorite stop objects and optionally sort by proximity to user
 */
export function resolveAndSortFavoriteStops(
  favoriteIds: string[],
  userLocation?: UserLocation
): TransitStop[] {
  const stops = favoriteIds
    .map(id => ALL_DIJON_STOPS.find(s => s.id === id))
    .filter((s): s is TransitStop => Boolean(s));

  if (!userLocation) return stops;

  return [...stops].sort((a, b) => {
    const distA = calculateDistanceMeters(
      userLocation.latitude,
      userLocation.longitude,
      a.latitude,
      a.longitude
    );
    const distB = calculateDistanceMeters(
      userLocation.latitude,
      userLocation.longitude,
      b.latitude,
      b.longitude
    );
    return distA - distB;
  });
}

export function useFavoriteStations(userLocation?: UserLocation) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Load persisted favorite stations on mount
  useEffect(() => {
    let isMounted = true;
    async function loadFavorites() {
      try {
        const stored = await AsyncStorage.getItem(FAVORITE_STATIONS_STORAGE_KEY);
        if (stored && isMounted) {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) {
            setFavoriteIds(parsed.filter((item): item is string => typeof item === 'string'));
          }
        }
      } catch (err) {
        console.warn('[useFavoriteStations] Erreur chargement favoris:', err);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    }
    loadFavorites();
    return () => {
      isMounted = false;
    };
  }, []);

  const persistIds = useCallback(async (nextIds: string[]) => {
    try {
      await AsyncStorage.setItem(FAVORITE_STATIONS_STORAGE_KEY, JSON.stringify(nextIds));
    } catch (err) {
      console.warn('[useFavoriteStations] Erreur sauvegarde favoris:', err);
    }
  }, []);

  const isFavorite = useCallback(
    (stationId: string) => favoriteIds.includes(stationId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    (stationId: string) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignore in non-haptic environments
      }
      setFavoriteIds(prev => {
        const next = toggleFavoriteId(prev, stationId);
        persistIds(next);
        return next;
      });
    },
    [persistIds]
  );

  const addFavorite = useCallback(
    (stationId: string) => {
      setFavoriteIds(prev => {
        if (prev.includes(stationId)) return prev;
        const next = [stationId, ...prev];
        persistIds(next);
        return next;
      });
    },
    [persistIds]
  );

  const favoriteStops = useMemo(
    () => resolveAndSortFavoriteStops(favoriteIds, userLocation),
    [favoriteIds, userLocation]
  );

  return {
    favoriteIds,
    favoriteStops,
    isLoaded,
    isFavorite,
    toggleFavorite,
    addFavorite,
  };
}
