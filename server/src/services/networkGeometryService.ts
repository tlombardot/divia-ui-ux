import fs from 'fs';
import path from 'path';
import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  DIJON_LINES,
} from '../data/dijonNetwork';
import { LineCategory, ShapeSource, TransitLine, TransitStop } from '../types';
import {
  computePolylineLengthMeters,
  densifyPolyline,
  LatLng,
  routeOnTramRailGraph,
  snapStopToPolyline,
  stitchWays,
} from '../utils/geometryTopology';
import {
  fetchGoogleTransitLineByChunks,
  GoogleExtractedStopCoord,
} from './googleTransitService';

export interface NetworkShapesCachePayload {
  version: number;
  cacheVersion: number;
  generatedAt: number;
  lines: TransitLine[];
  stops: TransitStop[];
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
  type: 'relation' | 'way' | 'node';
  lat?: number;
  lon?: number;
  tags?: {
    ref?: string;
    route?: string;
    name?: string;
    railway?: string;
    highway?: string;
    public_transport?: string;
  };
  members?: OverpassMember[];
  geometry?: OverpassGeomNode[];
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

interface OSRMRouteResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    geometry?: {
      coordinates: [number, number][]; // [lon, lat]
    };
  }>;
}

export const NETWORK_CACHE_VERSION = 5;
export const SHAPES_CACHE_VERSION = 2; // Mandatory cacheVersion: 2 invalidation gate
const MIN_HIGH_DENSITY_POINTS = 31; // > 30 points required for B10/B12/B13 & all lines
const REQUIRED_LINE_IDS = ['T1', 'T2', 'L3', 'L4', 'L5', 'L6', 'B10', 'B12', 'B13'];
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_TIMEOUT_MS = 10000;
const OSRM_TIMEOUT_MS = 3500;
const DEFAULT_CACHE_PATH = path.resolve(__dirname, '../../data/network-shapes-cache.json');
const MAX_OSRM_DETOUR_RATIO = 1.75;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Ensure every line polyline is clean, continuous, and high-density (> 30 vertices)
 * so snapping and interpolation along curves stay accurate on all 9 lines (T1..B13).
 */
function ensureHighDensityPolyline(
  points: LatLng[],
  maxJumpMeters: number = 145
): LatLng[] {
  const sanitized = sanitizeContinuousPolyline(points, maxJumpMeters);
  if (sanitized.length >= MIN_HIGH_DENSITY_POINTS) {
    return sanitized;
  }
  const totalMeters = computePolylineLengthMeters(sanitized);
  if (totalMeters <= 0) return sanitized;
  const targetStep = Math.max(15, Math.floor(totalMeters / (MIN_HIGH_DENSITY_POINTS + 4)));
  return densifyPolyline(sanitized, Math.min(115, targetStep));
}
function sanitizeContinuousPolyline(
  points: LatLng[],
  maxJumpMeters: number = 145
): LatLng[] {
  if (points.length < 2) return points;
  const deduped: LatLng[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1];
    const cur = points[i];
    const d = calculateDistanceMeters(prev[0], prev[1], cur[0], cur[1]);
    if (d >= 2) {
      deduped.push(cur);
    }
  }

  return densifyPolyline(deduped, Math.min(120, maxJumpMeters - 10));
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

  public loadFromDiskCache(): NetworkShapesCachePayload | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) return null;
      const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as NetworkShapesCachePayload;

      if (
        parsed &&
        parsed.cacheVersion === SHAPES_CACHE_VERSION &&
        parsed.version === NETWORK_CACHE_VERSION &&
        Array.isArray(parsed.lines) &&
        parsed.lines.length === DIJON_LINES.length
      ) {
        const lineIds = new Set(parsed.lines.map(l => l.id));
        const hasAllRequiredLines = REQUIRED_LINE_IDS.every(id => {
          const found = parsed.lines.find(l => l.id === id);
          return (
            lineIds.has(id) &&
            Boolean(found && found.polyline.length >= MIN_HIGH_DENSITY_POINTS)
          );
        });
        if (hasAllRequiredLines) {
          return parsed;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  public saveToDiskCache(payload: NetworkShapesCachePayload): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(payload), 'utf-8');
    } catch (err) {
      console.warn('[NetworkGeometryService] Erreur écriture cache disque:', err);
    }
  }

  private async executeOverpassQuery(query: string): Promise<OverpassElement[]> {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

        const res = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'DiviAkhaaa-Server/2.0',
          },
          body: `data=${encodeURIComponent(query)}`,
        });

        clearTimeout(timeoutId);
        if (!res.ok) continue;

        const data = (await res.json()) as OverpassResponse;
        if (data.elements && data.elements.length > 0) {
          return data.elements;
        }
      } catch {
        // Try next mirror
      }
    }
    return [];
  }

  /**
   * Fetch Overpass OSM data for Dijon:
   * 1. Dedicated fast query for Tram relations (T1, T2) + full Dijon `railway=tram` rail graph + tram stops
   * 2. Separate query for Divia Bus relations (Aller & Retour)
   */
  private async fetchOverpassDijonData(): Promise<{
    tramRelationsByRef: Map<string, LatLng[][][]>;
    busRelationsByRef: Map<string, LatLng[][][]>;
    tramRailWays: LatLng[][];
    osmStops: Array<{ name: string; lat: number; lon: number }>;
  }> {
    const tramRelationsByRef = new Map<string, LatLng[][][]>();
    const busRelationsByRef = new Map<string, LatLng[][][]>();
    const tramRailWays: LatLng[][] = [];
    const osmStops: Array<{ name: string; lat: number; lon: number }> = [];

    if (!this.allowExternalFetch) {
      return { tramRelationsByRef, busRelationsByRef, tramRailWays, osmStops };
    }

    const tramQuery = `
      [out:json][timeout:10];
      (
        relation["route"="tram"](47.27,4.98,47.37,5.12);
        way["railway"="tram"](47.27,4.98,47.37,5.12);
        node["railway"="tram_stop"](47.27,4.98,47.37,5.12);
      );
      out geom;
    `;

    const busQuery = `
      [out:json][timeout:10];
      (
        relation["route"="bus"]["ref"~"^(L3|L4|L5|L6|B10|B12|B13)$"](47.27,4.98,47.37,5.12);
      );
      out geom;
    `;

    const [tramElements, busElements] = await Promise.all([
      this.executeOverpassQuery(tramQuery),
      this.executeOverpassQuery(busQuery),
    ]);

    for (const el of [...tramElements, ...busElements]) {
      if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined && el.tags?.name) {
        osmStops.push({ name: el.tags.name, lat: el.lat, lon: el.lon });
        continue;
      }

      if (el.type === 'way' && el.tags?.railway === 'tram' && el.geometry && el.geometry.length >= 2) {
        tramRailWays.push(el.geometry.map(pt => [pt.lat, pt.lon]));
        continue;
      }

      if (el.type === 'relation' && el.tags?.ref && el.members) {
        const ref = el.tags.ref.toUpperCase().trim();
        const ways: LatLng[][] = [];

        for (const m of el.members) {
          if (
            m.type === 'way' &&
            m.geometry &&
            m.geometry.length >= 2 &&
            m.role !== 'platform' &&
            m.role !== 'stop'
          ) {
            ways.push(m.geometry.map(pt => [pt.lat, pt.lon]));
          }
        }

        if (ways.length === 0) continue;

        if (el.tags.route === 'tram') {
          const list = tramRelationsByRef.get(ref) || [];
          list.push(ways);
          tramRelationsByRef.set(ref, list);
        } else if (el.tags.route === 'bus') {
          const list = busRelationsByRef.get(ref) || [];
          list.push(ways);
          busRelationsByRef.set(ref, list);
        }
      }
    }

    return { tramRelationsByRef, busRelationsByRef, tramRailWays, osmStops };
  }

  /**
   * For BUS fallback ONLY (strictly forbidden for TRAM!):
   * Snaps stop[i] -> stop[i+1] via OSRM driving ONLY if road distance < 1.75 * crow-fly distance.
   */
  private async fetchGuardedOsrmBusLeg(stopA: TransitStop, stopB: TransitStop): Promise<LatLng[]> {
    const fallbackLeg = densifyPolyline(
      [
        [stopA.latitude, stopA.longitude],
        [stopB.latitude, stopB.longitude],
      ],
      115
    );

    if (!this.allowExternalFetch) return fallbackLeg;

    const crowFly = calculateDistanceMeters(
      stopA.latitude,
      stopA.longitude,
      stopB.latitude,
      stopB.longitude
    );
    if (crowFly < 40) return fallbackLeg;

    const url = `https://router.project-osrm.org/route/v1/driving/${stopA.longitude},${stopA.latitude};${stopB.longitude},${stopB.latitude}?overview=full&geometries=geojson`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'DiviAkhaaa-Server/2.0',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!res.ok) return fallbackLeg;

      const data = (await res.json()) as OSRMRouteResponse;
      const route = data.routes?.[0];
      const rawCoords = route?.geometry?.coordinates;
      const roadDist = route?.distance ?? Infinity;

      // Strict anti-loop guard: reject OSRM car detour > 1.75x crow-fly distance
      if (!rawCoords || rawCoords.length < 2 || roadDist > crowFly * MAX_OSRM_DETOUR_RATIO) {
        return fallbackLeg;
      }

      const latLngs: LatLng[] = rawCoords.map(([lon, lat]) => [lat, lon]);
      return sanitizeContinuousPolyline(latLngs, 145);
    } catch {
      return fallbackLeg;
    }
  }

  /**
   * Assemble a full bus polyline segment-by-segment using guarded OSRM
   */
  private async buildGuardedBusFallbackPolyline(orderedStops: TransitStop[]): Promise<LatLng[]> {
    const full: LatLng[] = [];
    for (let i = 0; i < orderedStops.length - 1; i++) {
      const leg = await this.fetchGuardedOsrmBusLeg(orderedStops[i], orderedStops[i + 1]);
      if (full.length === 0) {
        full.push(...leg);
      } else {
        full.push(...leg.slice(1));
      }
    }
    return sanitizeContinuousPolyline(full, 145);
  }

  /**
   * Refine stop coordinates with real OSM stop positions before snapping to track
   */
  private enrichStopsWithOsm(
    stops: TransitStop[],
    osmStops: Array<{ name: string; lat: number; lon: number }>
  ): TransitStop[] {
    if (osmStops.length === 0) return stops;

    return stops.map(stop => {
      const normTarget = normalizeName(stop.name);
      let bestMatch: { lat: number; lon: number } | null = null;
      let bestDist = 250; // max 250m tolerance

      for (const candidate of osmStops) {
        const normCand = normalizeName(candidate.name);
        if (
          normCand === normTarget ||
          normCand.includes(normTarget) ||
          normTarget.includes(normCand)
        ) {
          const d = calculateDistanceMeters(
            stop.latitude,
            stop.longitude,
            candidate.lat,
            candidate.lon
          );
          if (d < bestDist) {
            bestDist = d;
            bestMatch = candidate;
          }
        }
      }

      if (!bestMatch) return stop;
      return {
        ...stop,
        latitude: Number(bestMatch.lat.toFixed(6)),
        longitude: Number(bestMatch.lon.toFixed(6)),
      };
    });
  }

  /**
   * Generate full topological network shapes & aligned stations:
   * 1. Primary: Official Google Routes API v2 (TRANSIT) chunked extraction (3-4 stops/chunk)
   *    guaranteeing direct street-by-street B10/B12/B13/L3..L6/T1..T2 shapes + Google stop coords
   * 2. Fallback: Overpass OSM tram rails / bus relations + guarded OSRM / densified waypoints
   * 3. Mandatory orthogonal Snap-to-Polyline on every station with distanceAlongLineMeters
   * Saved to server/data/network-shapes-cache.json with cacheVersion: 2.
   */
  public async generateNetworkShapes(): Promise<NetworkShapesCachePayload> {
    const googleLinesMap = new Map<string, LatLng[]>();
    const googleStopsByLine = new Map<string, GoogleExtractedStopCoord[]>();
    const hasGoogleKey = Boolean(
      this.allowExternalFetch && process.env.GOOGLE_MAPS_API_KEY?.trim()
    );

    if (hasGoogleKey) {
      await Promise.all(
        DIJON_LINES.map(async line => {
          if (line.stops.length < 2) return;

          const extracted = await fetchGoogleTransitLineByChunks(
            line.id,
            line.stops,
            line.category
          );
          if (extracted && extracted.polyline.length >= 6) {
            googleLinesMap.set(
              line.id,
              ensureHighDensityPolyline(extracted.polyline, 145)
            );
            googleStopsByLine.set(line.id, extracted.googleStops);
          }
        })
      );
    }

    const needsOsmFallback = googleLinesMap.size < DIJON_LINES.length;
    const { tramRelationsByRef, busRelationsByRef, tramRailWays, osmStops } =
      needsOsmFallback
        ? await this.fetchOverpassDijonData()
        : {
            tramRelationsByRef: new Map<string, LatLng[][][]>(),
            busRelationsByRef: new Map<string, LatLng[][][]>(),
            tramRailWays: [] as LatLng[][],
            osmStops: [] as Array<{ name: string; lat: number; lon: number }>,
          };

    const enrichedLines: TransitLine[] = [];

    for (const line of DIJON_LINES) {
      const googleStopHints = (googleStopsByLine.get(line.id) || []).map(gs => ({
        name: gs.name,
        lat: gs.latitude,
        lon: gs.longitude,
      }));
      const refinedStops = this.enrichStopsWithOsm(
        line.stops,
        googleStopHints.length > 0 ? googleStopHints : osmStops
      );
      const startHint: LatLng = [
        refinedStops[0].latitude,
        refinedStops[0].longitude,
      ];
      const endHint: LatLng = [
        refinedStops[refinedStops.length - 1].latitude,
        refinedStops[refinedStops.length - 1].longitude,
      ];

      let forwardPolyline: LatLng[] = [];
      let returnPolyline: LatLng[] = [];
      let shapeSource: ShapeSource = 'fallback';

      // =======================================================================
      // 0. PRIMARY: Official Google Routes API v2 TRANSIT chunked shape
      // =======================================================================
      const googlePoly = googleLinesMap.get(line.id);
      if (googlePoly && googlePoly.length >= 6) {
        forwardPolyline = ensureHighDensityPolyline(googlePoly, 145);
        returnPolyline = [...forwardPolyline].reverse();
        shapeSource = 'google_routes';
      } else if (line.category === 'TRAM') {
        // =====================================================================
        // 1. TRAMWAYS (T1, T2) — STRICTLY NO OSRM DRIVING! RAILS ONLY!
        // =====================================================================
        const relations = tramRelationsByRef.get(line.id.toUpperCase()) || [];

        if (relations.length > 0) {
          const stitchedFwd = stitchWays(relations[0], 15, 150, startHint);
          if (stitchedFwd.length >= 10) {
            forwardPolyline = ensureHighDensityPolyline(stitchedFwd, 145);
            shapeSource = 'overpass';

            if (relations.length >= 2) {
              const stitchedRet = stitchWays(relations[1], 15, 150, endHint);
              returnPolyline =
                stitchedRet.length >= 10
                  ? ensureHighDensityPolyline(stitchedRet, 145)
                  : [...forwardPolyline].reverse();
            } else {
              returnPolyline = [...forwardPolyline].reverse();
            }
          }
        }

        // Local Dijkstra rail graph fallback strictly over `railway=tram` ways
        if (forwardPolyline.length < 10 && tramRailWays.length > 0) {
          const railPath = routeOnTramRailGraph(tramRailWays, refinedStops);
          if (railPath && railPath.length >= 10) {
            forwardPolyline = ensureHighDensityPolyline(railPath, 145);
            returnPolyline = [...forwardPolyline].reverse();
            shapeSource = 'overpass_rail_graph';
          }
        }

        // Clean high-density fallback along exact Dijon tram rail waypoints (never OSRM car!)
        if (forwardPolyline.length < 2) {
          const baseRailWaypoints =
            line.polyline.length >= refinedStops.length
              ? line.polyline
              : refinedStops.map(s => [s.latitude, s.longitude] as LatLng);
          forwardPolyline = ensureHighDensityPolyline(baseRailWaypoints, 115);
          returnPolyline = [...forwardPolyline].reverse();
          shapeSource = 'fallback';
        }
      } else {
        // =====================================================================
        // 2. BUS & LIANES (L3..L6, B10..B13) — OSM Directional + Guarded OSRM
        // =====================================================================
        const relations = busRelationsByRef.get(line.id.toUpperCase()) || [];

        if (relations.length > 0) {
          const stitchedFwd = stitchWays(relations[0], 15, 150, startHint);
          if (stitchedFwd.length >= 6) {
            forwardPolyline = ensureHighDensityPolyline(stitchedFwd, 145);
            shapeSource = 'overpass';

            if (relations.length >= 2) {
              const stitchedRet = stitchWays(relations[1], 15, 150, endHint);
              returnPolyline =
                stitchedRet.length >= 6
                  ? ensureHighDensityPolyline(stitchedRet, 145)
                  : [...forwardPolyline].reverse();
            } else {
              returnPolyline = [...forwardPolyline].reverse();
            }
          }
        }

        // Guarded OSRM bus fallback (rejects > 1.75x detours)
        if (forwardPolyline.length < 6) {
          forwardPolyline = ensureHighDensityPolyline(
            await this.buildGuardedBusFallbackPolyline(refinedStops),
            145
          );
          returnPolyline = ensureHighDensityPolyline(
            await this.buildGuardedBusFallbackPolyline([...refinedStops].reverse()),
            145
          );
          shapeSource = this.allowExternalFetch ? 'osrm' : 'fallback';
        }
      }

      // Snap EVERY station orthogonally onto this line's polyline (0m perpendicular distance)
      // and record polylineVertexIndex + distanceAlongLineMeters
      const snappedStops = refinedStops.map(stop =>
        snapStopToPolyline(stop, forwardPolyline, 2000)
      );

      enrichedLines.push({
        ...line,
        stops: snappedStops,
        polyline: forwardPolyline,
        returnPolyline,
        shapeSource,
      });
    }

    // Deduplicate global snapped stops (prioritizing tram rail alignment for hubs)
    const snappedStopMap = new Map<string, TransitStop>();
    for (const line of enrichedLines) {
      for (const stop of line.stops) {
        if (!snappedStopMap.has(stop.id)) {
          snappedStopMap.set(stop.id, stop);
        }
      }
    }

    const payload: NetworkShapesCachePayload = {
      version: NETWORK_CACHE_VERSION,
      cacheVersion: SHAPES_CACHE_VERSION,
      generatedAt: Date.now(),
      lines: enrichedLines,
      stops: Array.from(snappedStopMap.values()),
    };

    this.memoryCache = payload;
    this.saveToDiskCache(payload);
    return payload;
  }

  public async getNetworkShapes(options?: {
    category?: LineCategory;
    forceRefresh?: boolean;
  }): Promise<{
    version: number;
    cacheVersion: number;
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
      version: payload.version,
      cacheVersion: payload.cacheVersion,
      lines: filteredLines,
      stops: payload.stops || ALL_DIJON_STOPS,
      cachedAt: payload.generatedAt,
      fromCache,
    };
  }

  /**
   * Synchronous fast accessor for routing service (returns cached lines or DIJON_LINES)
   */
  public getCachedLinesSync(): TransitLine[] {
    if (this.memoryCache) return this.memoryCache.lines;
    const disk = this.loadFromDiskCache();
    if (disk) {
      this.memoryCache = disk;
      return disk.lines;
    }
    return DIJON_LINES;
  }

  public warmupCache(): void {
    this.getNetworkShapes().catch(() => {
      // Safe fallback
    });
  }

  public clearMemoryCache(): void {
    this.memoryCache = null;
  }
}

export const networkGeometryService = new NetworkGeometryService();
