import { useCallback, useEffect, useState } from 'react';
import { storageService } from '../services/storageService';
import { RouteOption } from '../types';

export function useNavigationState() {
  const [activeRoute, setActiveRoute] = useState<RouteOption | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(true);

  // Restore navigation session from AsyncStorage
  useEffect(() => {
    async function restoreSession() {
      try {
        const saved = await storageService.loadActiveNavigation();
        if (saved && saved.activeRoute) {
          setActiveRoute(saved.activeRoute);
          setCurrentStepIndex(saved.currentStepIndex || 0);
          setIsNavigating(true);
        }
      } catch (e) {
        console.warn('[useNavigationState] Restauration échouée:', e);
      } finally {
        setIsRestoring(false);
      }
    }
    restoreSession();
  }, []);

  const startTrip = useCallback(async (route: RouteOption) => {
    setActiveRoute(route);
    setCurrentStepIndex(0);
    setIsNavigating(true);
    await storageService.saveActiveNavigation({
      activeRoute: route,
      currentStepIndex: 0,
      startedAt: Date.now(),
    });
  }, []);

  const nextStep = useCallback(async () => {
    if (!activeRoute) return;

    if (currentStepIndex < activeRoute.steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      await storageService.saveActiveNavigation({
        activeRoute,
        currentStepIndex: nextIndex,
        startedAt: Date.now(),
      });
    } else {
      // Reached final destination
      await storageService.clearActiveNavigation();
      setIsNavigating(false);
      setActiveRoute(null);
      setCurrentStepIndex(0);
    }
  }, [activeRoute, currentStepIndex]);

  const endTrip = useCallback(async () => {
    await storageService.clearActiveNavigation();
    setIsNavigating(false);
    setActiveRoute(null);
    setCurrentStepIndex(0);
  }, []);

  return {
    activeRoute,
    currentStepIndex,
    isNavigating,
    isRestoring,
    startTrip,
    nextStep,
    endTrip,
  };
}
