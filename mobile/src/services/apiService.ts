import Constants from 'expo-constants';
import { CrowdLevel, Report, ReportType, RouteOption, TransitLine } from '../types';

/**
 * Hybrid connection resolver:
 * 1. Checks EXPO_PUBLIC_API_URL if configured
 * 2. Dynamically extracts local machine IP from Constants.expoConfig?.hostUri
 *    to work automatically in Expo Go on physical phones without hardcoding.
 * 3. Falls back to localhost:3000
 */
export function getBaseApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) {
      return `http://${host}:3000`;
    }
  }

  return 'http://localhost:3000';
}

export class ApiService {
  private get baseUrl(): string {
    return getBaseApiUrl();
  }

  public async fetchRoutes(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    fromLabel?: string,
    toLabel?: string
  ): Promise<RouteOption[]> {
    try {
      let url = `${this.baseUrl}/api/routes?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`;
      if (fromLabel) url += `&fromLabel=${encodeURIComponent(fromLabel)}`;
      if (toLabel) url += `&toLabel=${encodeURIComponent(toLabel)}`;

      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Erreur réseau (${response.status})`);
      }

      const data = (await response.json()) as { routes: RouteOption[] };
      return data.routes || [];
    } catch (error) {
      console.warn('[ApiService] fetchRoutes fallback:', error);
      return [];
    }
  }

  public async fetchNetworkShapes(): Promise<{ version: number; lines: TransitLine[] } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/network/shapes`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Erreur réseau (${response.status})`);
      }

      const data = (await response.json()) as { version?: number; lines: TransitLine[] };
      if (!data.lines || data.lines.length === 0) return null;
      return {
        version: data.version ?? 1,
        lines: data.lines,
      };
    } catch (error) {
      console.warn('[ApiService] fetchNetworkShapes fallback:', error);
      return null;
    }
  }

  public async fetchReports(): Promise<Report[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/reports`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Erreur réseau (${response.status})`);
      }

      const data = (await response.json()) as { reports: Report[] };
      return data.reports || [];
    } catch (error) {
      console.warn('[ApiService] fetchReports fallback:', error);
      return [];
    }
  }

  public async createReport(payload: {
    type?: ReportType;
    stopId: string;
    stopName: string;
    lineId: string;
    lineName: string;
    latitude: number;
    longitude: number;
    direction: string;
    description?: string;
    crowdLevel?: CrowdLevel;
  }): Promise<Report | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de la création du signalement (${response.status})`);
      }

      const data = (await response.json()) as { report: Report };
      return data.report;
    } catch (error) {
      console.error('[ApiService] createReport error:', error);
      return null;
    }
  }

  public async voteReport(
    reportId: string,
    voteType: 'up' | 'down'
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/reports/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ reportId, voteType }),
      });

      return response.ok;
    } catch (error) {
      console.error('[ApiService] voteReport error:', error);
      return false;
    }
  }
}

export const apiService = new ApiService();
