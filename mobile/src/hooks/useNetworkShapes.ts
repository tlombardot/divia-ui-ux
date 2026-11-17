import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { DIJON_LINES } from '../data/dijonNetwork';
import { apiService } from '../services/apiService';
import { TransitLine } from '../types';

export const NETWORK_SHAPES_CACHE_KEY = '@diviakhaaa/network_shapes_cache';
export const EXPECTED_NETWORK_SHAPES_VERSION = 3;

interface CachedShapesRecord {
  version: number;
  lines: TransitLine[];
}

export function useNetworkShapes() {
  const [lines, setLines] = useState<TransitLine[]>(DIJON_LINES);
  const [shapesVersion, setShapesVersion] = useState<number>(EXPECTED_NETWORK_SHAPES_VERSION);
  const [isLoadedFromServer, setIsLoadedFromServer] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadShapes() {
      // 1. Check local AsyncStorage cache and purge immediately if obsolete version
      try {
        const raw = await AsyncStorage.getItem(NETWORK_SHAPES_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CachedShapesRecord;
          if (
            parsed &&
            parsed.version === EXPECTED_NETWORK_SHAPES_VERSION &&
            Array.isArray(parsed.lines) &&
            parsed.lines.length > 0
          ) {
            if (isMounted) {
              setLines(parsed.lines);
              setShapesVersion(parsed.version);
            }
          } else {
            // Obsolete local geometry cache -> purge cleanly
            await AsyncStorage.removeItem(NETWORK_SHAPES_CACHE_KEY);
          }
        }
      } catch {
        await AsyncStorage.removeItem(NETWORK_SHAPES_CACHE_KEY).catch(() => undefined);
      }

      // 2. Always sync with fresh server shapes and invalidate cache if server version changed
      const serverData = await apiService.fetchNetworkShapes();
      if (isMounted && serverData && serverData.lines.length > 0) {
        setLines(serverData.lines);
        setShapesVersion(serverData.version);
        setIsLoadedFromServer(true);

        try {
          await AsyncStorage.setItem(
            NETWORK_SHAPES_CACHE_KEY,
            JSON.stringify({
              version: serverData.version,
              lines: serverData.lines,
            })
          );
        } catch {
          // Ignore storage write error
        }
      }
    }

    loadShapes();
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    lines,
    shapesVersion,
    isLoadedFromServer,
  };
}
