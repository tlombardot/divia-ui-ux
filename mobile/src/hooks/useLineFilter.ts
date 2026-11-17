import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { DIJON_LINES } from '../data/dijonNetwork';
import { TransitLine, TransitStop } from '../types';

export const LINE_FILTER_STORAGE_KEY = '@diviakhaaa/visible_lines';

export type LineFilterPreset = 'all' | 'trams' | 'trams_lianes' | 'none';

export const DEFAULT_VISIBLE_LINE_IDS: string[] = [
  'T1',
  'T2',
  'L3',
  'L4',
  'L5',
  'L6',
];

/**
 * Pure helper: toggle a single lineId in the visible set
 */
export function toggleLineId(currentIds: string[], lineId: string): string[] {
  if (currentIds.includes(lineId)) {
    return currentIds.filter(id => id !== lineId);
  }
  return [...currentIds, lineId];
}

/**
 * Pure helper: resolve a quick preset into line IDs
 */
export function applyLineFilterPreset(
  allLines: TransitLine[],
  preset: LineFilterPreset
): string[] {
  switch (preset) {
    case 'all':
      return allLines.map(l => l.id);
    case 'trams':
      return allLines.filter(l => l.category === 'TRAM').map(l => l.id);
    case 'trams_lianes':
      return allLines
        .filter(l => l.category === 'TRAM' || l.category === 'LIANE')
        .map(l => l.id);
    case 'none':
      return [];
  }
}

/**
 * Pure helper: filter map stations based on visible lines while always keeping
 * favorite stations and any currently selected station visible.
 */
export function filterVisibleStops(
  allStops: TransitStop[],
  visibleLineIds: string[],
  favoriteStopIds: string[] = [],
  selectedStopId?: string | null
): TransitStop[] {
  const activeSet = new Set(visibleLineIds);
  const favSet = new Set(favoriteStopIds);

  return allStops.filter(stop => {
    if (favSet.has(stop.id) || (selectedStopId && stop.id === selectedStopId)) {
      return true;
    }
    return stop.lines.some(lineId => activeSet.has(lineId));
  });
}

export function useLineFilter(allLines: TransitLine[] = DIJON_LINES) {
  const [visibleLineIds, setVisibleLineIds] = useState<string[]>(DEFAULT_VISIBLE_LINE_IDS);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Restore saved visible lines on mount
  useEffect(() => {
    let isMounted = true;
    async function loadSavedFilter() {
      try {
        const stored = await AsyncStorage.getItem(LINE_FILTER_STORAGE_KEY);
        if (stored && isMounted) {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) {
            setVisibleLineIds(parsed.filter((item): item is string => typeof item === 'string'));
          }
        }
      } catch (err) {
        console.warn('[useLineFilter] Erreur chargement filtre lignes:', err);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    }
    loadSavedFilter();
    return () => {
      isMounted = false;
    };
  }, []);

  const persist = useCallback(async (nextIds: string[]) => {
    try {
      await AsyncStorage.setItem(LINE_FILTER_STORAGE_KEY, JSON.stringify(nextIds));
    } catch (err) {
      console.warn('[useLineFilter] Erreur sauvegarde filtre lignes:', err);
    }
  }, []);

  const toggleLine = useCallback(
    (lineId: string) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignore without haptics
      }
      setVisibleLineIds(prev => {
        const next = toggleLineId(prev, lineId);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const ensureLineVisible = useCallback(
    (lineId: string) => {
      setVisibleLineIds(prev => {
        if (prev.includes(lineId)) return prev;
        const next = [...prev, lineId];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const applyPreset = useCallback(
    (preset: LineFilterPreset) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Ignore
      }
      const next = applyLineFilterPreset(allLines, preset);
      setVisibleLineIds(next);
      persist(next);
    },
    [allLines, persist]
  );

  return {
    visibleLineIds,
    totalLinesCount: allLines.length,
    isLoaded,
    toggleLine,
    ensureLineVisible,
    applyPreset,
  };
}
