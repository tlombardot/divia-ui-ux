import { useEffect, useState } from 'react';
import { DIJON_LINES } from '../data/dijonNetwork';
import { apiService } from '../services/apiService';
import { TransitLine } from '../types';

export function useNetworkShapes() {
  const [lines, setLines] = useState<TransitLine[]>(DIJON_LINES);
  const [isLoadedFromServer, setIsLoadedFromServer] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadShapes() {
      const serverLines = await apiService.fetchNetworkShapes();
      if (isMounted && serverLines.length > 0) {
        setLines(serverLines);
        setIsLoadedFromServer(true);
      }
    }

    loadShapes();
    return () => {
      isMounted = false;
    };
  }, []);

  return {
    lines,
    isLoadedFromServer,
  };
}
