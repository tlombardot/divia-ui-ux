import Constants from 'expo-constants';
import {
  CrowdLevel,
  PlaceDetailsResult,
  PlaceSuggestion,
  Report,
  ReportType,
  RouteOption,
  TransitLine,
} from '../types';

export const DEFAULT_API_TIMEOUT_MS = 8000;

/**
 * Headers required to transparently bypass interstitial warning pages
 * returned by localtunnel (*.loca.lt) and ngrok (*.ngrok-free.app).
 */
export const TUNNEL_BYPASS_HEADERS: Readonly<Record<string, string>> = {
  'Bypass-Tunnel-Reminder': 'true',
  'ngrok-skip-browser-warning': 'true',
};

/**
 * Cleans an API base URL by trimming whitespace and stripping trailing slashes.
 */
export function cleanApiUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, '');
}

/**
 * Hybrid connection resolver:
 * 1. Checks EXPO_PUBLIC_API_URL if configured (trimmed, without trailing slash)
 * 2. Dynamically extracts local machine IP from Constants.expoConfig?.hostUri
 *    to work automatically in Expo Go on physical phones without hardcoding.
 * 3. Falls back to http://localhost:3000
 */
export function getBaseApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return cleanApiUrl(envUrl);
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0]?.trim();
    if (host) {
      return `http://${host}:3000`;
    }
  }

  return 'http://localhost:3000';
}

export function buildApiDiagnosticMessage(
  baseUrl: string,
  error?: unknown,
  httpStatus?: number
): string {
  if (typeof httpStatus === 'number') {
    if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
      return `Serveur injoignable sur ${baseUrl} (HTTP ${httpStatus}) — Vérifie que npm run dev tourne sur le port 3000 et que le tunnel pointe vers 127.0.0.1:3000`;
    }
    return `Erreur API (HTTP ${httpStatus}) sur ${baseUrl}`;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return `Serveur injoignable sur ${baseUrl} (délai d'attente dépassé : ${DEFAULT_API_TIMEOUT_MS / 1000}s) — Vérifie que npm run dev tourne sur le port 3000`;
  }

  if (error instanceof Error && error.message) {
    if (error.message.includes(baseUrl)) {
      return error.message;
    }
    return `Serveur injoignable sur ${baseUrl} (${error.message}) — Vérifie que npm run dev tourne sur le port 3000`;
  }

  return `Serveur injoignable sur ${baseUrl} — Vérifie que npm run dev tourne sur le port 3000`;
}

export class ApiService {
  private lastErrorMessage: string | null = null;

  private get baseUrl(): string {
    return getBaseApiUrl();
  }

  public getLastError(): string | null {
    return this.lastErrorMessage;
  }

  private async requestWithTimeout(
    path: string,
    init: RequestInit = {},
    timeoutMs: number = DEFAULT_API_TIMEOUT_MS
  ): Promise<Response> {
    const baseUrl = this.baseUrl;
    const url = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const mergedHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...TUNNEL_BYPASS_HEADERS,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: mergedHeaders,
      });

      if (!response.ok) {
        const message = buildApiDiagnosticMessage(baseUrl, undefined, response.status);
        this.lastErrorMessage = message;
        throw new Error(message);
      }

      const contentType = response.headers?.get?.('content-type') ?? '';
      if (contentType.includes('text/html')) {
        const message = `Réponse HTML inattendue sur ${baseUrl} (page d'avertissement tunnel/proxy) — Vérifie EXPO_PUBLIC_API_URL et que npm run dev tourne sur le port 3000`;
        this.lastErrorMessage = message;
        throw new Error(message);
      }

      this.lastErrorMessage = null;
      return response;
    } catch (error) {
      const message = buildApiDiagnosticMessage(baseUrl, error);
      this.lastErrorMessage = message;
      throw new Error(message);
    } finally {
      clearTimeout(timeoutId);
    }
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
      let path = `/api/routes?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`;
      if (fromLabel) path += `&fromLabel=${encodeURIComponent(fromLabel)}`;
      if (toLabel) path += `&toLabel=${encodeURIComponent(toLabel)}`;

      const response = await this.requestWithTimeout(path);
      const data = (await response.json()) as { routes: RouteOption[] };
      return data.routes || [];
    } catch (error) {
      console.warn('[ApiService] fetchRoutes fallback:', error);
      return [];
    }
  }

  public async fetchNetworkShapes(): Promise<{ version: number; lines: TransitLine[] } | null> {
    try {
      const response = await this.requestWithTimeout('/api/network/shapes');
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

  public async fetchPlaceAutocomplete(input: string): Promise<PlaceSuggestion[]> {
    try {
      const path = `/api/places/autocomplete?input=${encodeURIComponent(input)}`;
      const response = await this.requestWithTimeout(path);
      const data = (await response.json()) as { suggestions?: PlaceSuggestion[] };
      return data.suggestions || [];
    } catch (error) {
      console.warn('[ApiService] fetchPlaceAutocomplete fallback:', error);
      return [];
    }
  }

  public async fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
    try {
      const path = `/api/places/details?placeId=${encodeURIComponent(placeId)}`;
      const response = await this.requestWithTimeout(path);
      const data = (await response.json()) as { place?: PlaceDetailsResult };
      return data.place || null;
    } catch (error) {
      console.warn('[ApiService] fetchPlaceDetails error:', error);
      return null;
    }
  }

  public async fetchReports(): Promise<Report[]> {
    try {
      const response = await this.requestWithTimeout('/api/reports');
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
    directionTerminus?: string;
    description?: string;
    crowdLevel?: CrowdLevel;
  }): Promise<Report | null> {
    try {
      const response = await this.requestWithTimeout('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { report: Report };
      return data.report;
    } catch (error) {
      console.error('[ApiService] createReport error:', error);
      return null;
    }
  }

  public async voteReport(
    reportId: string,
    voteType: 'up' | 'down',
    recalibrateStopId?: string
  ): Promise<boolean> {
    try {
      const response = await this.requestWithTimeout('/api/reports/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportId, voteType, recalibrateStopId }),
      });

      return response.ok;
    } catch (error) {
      console.error('[ApiService] voteReport error:', error);
      return false;
    }
  }
}

export const apiService = new ApiService();
