import fs from 'fs';
import path from 'path';
import { ALL_DIJON_STOPS, DIJON_LINES } from '../data/dijonNetwork';
import { LineCategory, ShapeSource, TransitLine, TransitStop } from '../types';

export interface NetworkShapesCachePayload {
  version: number;
  generatedAt: number;
  lines: TransitLine[];
}

interface OverpassGeomNode {
  lat: number;
  lon: number;
}

interface OverpassMember {
  type: string;
  role?: string;
  geometry?: OverpassGeomNode[];
}

interface OverpassElement {
  type: string;
  tags?: {
    ref?: string;
    route?: string;
    name?: string;
  };
  members?: OverpassMember[];
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface OSRMRouteResponse {
  code?: string;
  routes?: Array<{
    geometry?: {
      coordinates: [number, number][]; // [lon, lat]
    };
  }>;
}

const CACHE_VERSION = 1;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 5000;
const OSRM_TIMEOUT_MS = 4000;
const DEFAULT_CACHE_PATH = path.resolve(__dirname, '../../data/network-shapes-cache.json');

/**
 * Downsample very dense polylines while keeping start/end points intact
 */
function simplifyPolyline(
  points: [number, number][],
  maxPoints: number = 220
): [number, number][] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: [number, number][] = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }
  const last = points[points.length - 1];
  const prevLast = sampled[sampled.length - 1];
  if (prevLast[0] !== last[0] || prevLast[1] !== last[1]) {
    sampled.push(last);
  }
  return sampled;
}

export class NetworkGeometryService {
  private memoryCache: NetworkShapesCachePayload | null = null;
  private inflightPromise: Promise<NetworkShapesCachePayload> | null = null;
  private cacheFilePath: string;
  private allowExternalFetch: boolean;

  constructor(options?: { cacheFilePath?: string; allowExternalFetch?: boolean }) {
    this.cacheFilePath = options?.cacheFilePath || DEFAULT_CACHE_PATH;
    this.allowExternalFetch = options?.allowExternalFetch ?? true;
  }

  /**
   * Read disk cache if valid and matching current schema version
   */
  public loadFromDiskCache(): NetworkShapesCachePayload | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) return null;
      const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as NetworkShapesCachePayload;

      if (
        parsed &&
        parsed.version === CACHE_VERSION &&
        Array.isArray(parsed.lines) &&
        parsed.lines.length === DIJON_LINES.length
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Persist generated geometries to disk cache
   */
  public saveToDiskCache(payload: NetworkShapesCachePayload): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(payload), 'utf-8');
    } catch (err) {
      console.warn('[NetworkGeometryService] Impossible d\'écrire le cache disque:', err);
    }
  }

  /**
   * Query OpenStreetMap Overpass API for real Divia tram & bus geometries in Dijon bbox
   */
  private async fetchOverpassDiviaGeometries(): Promise<Map<string, [number, number][]>> {
    const result = new Map<string, [number, number][]>();
    if (!this.allowExternalFetch) return result;

    const query = `
      [out:json][timeout:6];
      (
        relation["network"~"Divia",i]["route"~"^(tram|bus)$"](47.27,4.98,47.37,5.12);
      );
      out geom;
    `;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'DiviAkhaaa-Server/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      clearTimeout(timeoutId);
      if (!res.ok) return result;

      const data = (await res.json()) as OverpassResponse;
      if (!data.elements) return result;

      for (const el of data.elements) {
        const ref = el.tags?.ref?.toUpperCase().trim();
        if (!ref || result.has(ref) || !el.members) continue;

        const coords: [number, number][] = [];
        for (const m of el.members) {
          if (m.type === 'way' && m.geometry && m.geometry.length > 0 && m.role !== 'platform') {
            for (const pt of m.geometry) {
              coords.push([pt.lat, pt.lon]);
            }
          }
        }

        if (coords.length >= 6) {
          result.set(ref, simplifyPolyline(coords, 220));
        }
      }
    } catch {
      // Graceful fallback to OSRM / local coordinates
    }

    return result;
  }

  /**
   * Snap an ordered sequence of stops onto real Dijon streets via OSRM
   */
  private async fetchOsrmSnappedLine(stops: TransitStop[]): Promise<[number, number][] | null> {
    if (!this.allowExternalFetch || stops.length < 2) return null;

    const coordsParam = stops.map(s => `${s.longitude},${s.latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'DiviAkhaaa-Server/1.0',
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);
      if (!res.ok) return null;

      const data = (await res.json()) as OSRMRouteResponse;
      const rawCoords = data.routes?.[0]?.geometry?.coordinates;
      if (!rawCoords || rawCoords.length < 2) return null;

      const latLngs: [number, number][] = rawCoords.map(([lon, lat]) => [lat, lon]);
      return simplifyPolyline(latLngs, 220);
    } catch {
      return null;
    }
  }

  /**
   * Generate full network shapes with priority:
   * 1. OSM Overpass real Divia tracks (especially Tram T1/T2 rails)
   * 2. OSRM road snapping between ordered stops
   * 3. Clean fallback to ordered stop coordinates
   */
  public async generateNetworkShapes(): Promise<NetworkShapesCachePayload> {
    const overpassMap = await this.fetchOverpassDiviaGeometries();

    const enrichedLines: TransitLine[] = await Promise.all(
      DIJON_LINES.map(async line => {
        // 1. Check Overpass geometry first
        const overpassGeom = overpassMap.get(line.id.toUpperCase());
        if (overpassGeom && overpassGeom.length >= 6) {
          return {
            ...line,
            polyline: overpassGeom,
            shapeSource: 'overpass' as ShapeSource,
          };
        }

        // 2. Snap ordered stops onto real Dijon streets via OSRM
        const osrmGeom = await this.fetchOsrmSnappedLine(line.stops);
        if (osrmGeom && osrmGeom.length >= line.stops.length) {
          return {
            ...line,
            polyline: osrmGeom,
            shapeSource: 'osrm' as ShapeSource,
          };
        }

        // 3. Clean fallback to ordered stop coordinates
        return {
          ...line,
          polyline: line.stops.map(s => [s.latitude, s.longitude] as [number, number]),
          shapeSource: 'fallback' as ShapeSource,
        };
      })
    );

    const payload: NetworkShapesCachePayload = {
      version: CACHE_VERSION,
      generatedAt: Date.now(),
      lines: enrichedLines,
    };

    this.memoryCache = payload;
    this.saveToDiskCache(payload);
    return payload;
  }

  /**
   * Retrieve cached shapes (< 5ms from memory/disk) or build them on first run
   */
  public async getNetworkShapes(options?: {
    category?: LineCategory;
    forceRefresh?: boolean;
  }): Promise<{
    lines: TransitLine[];
    stops: TransitStop[];
    cachedAt: number;
    fromCache: boolean;
  }> {
    let fromCache = true;
    let payload: NetworkShapesCachePayload | null = null;

    if (!options?.forceRefresh) {
      if (this.memoryCache) {
        payload = this.memoryCache;
      } else {
        const disk = this.loadFromDiskCache();
        if (disk) {
          this.memoryCache = disk;
          payload = disk;
        }
      }
    }

    if (!payload) {
      fromCache = false;
      if (!this.inflightPromise) {
        this.inflightPromise = this.generateNetworkShapes().finally(() => {
          this.inflightPromise = null;
        });
      }
      payload = await this.inflightPromise;
    }

    const filteredLines = options?.category
      ? payload.lines.filter(l => l.category === options.category)
      : payload.lines;

    return {
      lines: filteredLines,
      stops: ALL_DIJON_STOPS,
      cachedAt: payload.generatedAt,
      fromCache,
    };
  }

  /**
   * Non-blocking startup warmup
   */
  public warmupCache(): void {
    this.getNetworkShapes().catch(() => {
      // Fallback safely on demand
    });
  }

  public clearMemoryCache(): void {
    this.memoryCache = null;
  }
}

export const networkGeometryService = new NetworkGeometryService();
