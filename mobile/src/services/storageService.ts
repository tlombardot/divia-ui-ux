import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedNavigationState } from '../types';

const STORAGE_KEY_ACTIVE_TRIP = '@diviakhaaa/active_trip';

export class StorageService {
  public async saveActiveNavigation(state: SavedNavigationState): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_TRIP, JSON.stringify(state));
    } catch (error) {
      console.warn('[StorageService] Erreur lors de la sauvegarde du trajet:', error);
    }
  }

  public async loadActiveNavigation(): Promise<SavedNavigationState | null> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_TRIP);
      if (!json) return null;
      return JSON.parse(json) as SavedNavigationState;
    } catch (error) {
      console.warn('[StorageService] Erreur lors du chargement du trajet:', error);
      return null;
    }
  }

  public async clearActiveNavigation(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_TRIP);
    } catch (error) {
      console.warn('[StorageService] Erreur lors de la suppression du trajet:', error);
    }
  }
}

export const storageService = new StorageService();
