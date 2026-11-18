import fs from 'fs';
import path from 'path';
import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  DIJON_LINES,
} from '../data/dijonNetwork';
import { TransitLine, TransitStop } from '../types';

export interface DiviaCatalogLine {
  id: string;
  name: string;
  stops: TransitStop[];
}

export interface DiviaCatalogData {
  version: number;
  generatedAt: number;
  source: 'overpass' | 'local_seed';
  lines: DiviaCatalogLine[];
  allStops: TransitStop[];
}

interface OverpassNodeElement {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string | undefined>;
}

interface OverpassRelationMember {
  type: string;
  ref: number;
  role?: string;
}

interface OverpassRelationElement {
  type: 'relation';
  id: number;
  tags?: Record<string, string | undefined>;
  members?: OverpassRelationMember[];
}

export interface OverpassCatalogResponse {
  elements?: Array<OverpassNodeElement | OverpassRelationElement | { type: string }>;
}

const DIVIA_CATALOG_VERSION = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OVERPASS_TIMEOUT_MS = 12000;
const DEFAULT_CATALOG_CACHE_PATH = path.resolve(
  __dirname,
  '../../data/divia-catalog-cache.json'
);
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const DIJON_BBOX = '47.25,4.95,47.39,5.15';

const LIANE_NUMBERS = new Set(['3', '4', '5', '6', '7', '8', '9']);

/**
 * Normalizes DiviaMobilités line codes across all Google Routes API / Overpass formats:
 * - "T1" / "Tram T1" -> "T1"
 * - "L3" <-> "3", "L5" <-> "5", ..., "L9" <-> "9"
 * - "B10" <-> "10", "B12" <-> "12", ..., "B22" <-> "22"
 * - "COROL" / "CO" -> "COROL"
 * - "CITY" / "Navette City" -> "CITY"
 */
export function normalizeDiviaLineCode(rawCode?: string): string {
  if (!rawCode) {
    return '';
  }

  const cleaned = rawCode
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (!cleaned) {
    return '';
  }

  if (/\bCOROL\b/.test(cleaned) || cleaned === 'CO') {
    return 'COROL';
  }
  if (/\bCITY\b/.test(cleaned)) {
    return 'CITY';
  }

  // Strip common verbose prefixes ("TRAMWAY ", "TRAM ", "LIANE ", "BUS ", "LIGNE ")
  const stripped = cleaned
    .replace(/^(TRAMWAY|TRAM|LIANE|BUS|LIGNE|DIVIA)\s+/i, '')
    .trim();

  // Explicit prefixed code: T1, T2, L3..L9, B10..B29, F40..F49, P30..P39
  const prefixedMatch = stripped.match(/^(T[12]|L[3-9]|B1\d|B2\d|F\d+|P\d+|EX\d*)\b/);
  if (prefixedMatch) {
    return prefixedMatch[1];
  }

  // Bare numeric code returned by Google Routes API ("3" -> "L3", "10" -> "B10", "12" -> "B12")
  const bareNumMatch = stripped.match(/^(\d{1,2})$/);
  if (bareNumMatch) {
    const numStr = bareNumMatch[1];
    const num = parseInt(numStr, 10);
    if (LIANE_NUMBERS.has(numStr)) {
      return `L${numStr}`;
    }
    if (num >= 10 && num <= 29) {
      return `B${numStr}`;
    }
    if (num >= 30 && num <= 39) {
      return `P${numStr}`;
    }
    if (num >= 40 && num <= 49) {
      return `F${numStr}`;
    }
  }

  // Extract token inside longer string e.g. "Bus B12 - Plombières"
  const embeddedMatch = stripped.match(/\b(T[12]|L[3-9]|B1\d|B2\d|F\d+|P\d+|COROL|CITY)\b/);
  if (embeddedMatch) {
    return embeddedMatch[1];
  }

  return stripped;
}

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Supplemental real Dijon Divia stops & lines (L7, L8, L9, COROL, CITY + key intermediate
 * stops on B10/B12/B13/L3-L6) to guarantee exhaustive coverage even before Overpass warms up.
 */
const SUPPLEMENTAL_DIVIA_STOPS: TransitStop[] = [
  { id: 'divia-grangier', name: 'Grangier', latitude: 47.3224, longitude: 5.0369, lines: ['CITY', 'B10', 'B12', 'B13'] },
  { id: 'divia-miroir', name: 'Miroir', latitude: 47.3219, longitude: 5.0398, lines: ['CITY', 'B10', 'B12'] },
  { id: 'divia-liberation', name: 'Libération', latitude: 47.3211, longitude: 5.0414, lines: ['CITY'] },
  { id: 'divia-bossuet', name: 'Bossuet', latitude: 47.3204, longitude: 5.0378, lines: ['CITY', 'B12', 'B13'] },
  { id: 'divia-emile-zola', name: 'Émile Zola', latitude: 47.3193, longitude: 5.0375, lines: ['CITY', 'B12', 'B13'] },
  { id: 'divia-cordeliers', name: 'Cordeliers', latitude: 47.3190, longitude: 5.0422, lines: ['L5', 'L6', 'CITY'] },
  { id: 'divia-30-octobre', name: '30 Octobre', latitude: 47.3217, longitude: 5.0507, lines: ['L3', 'L6', 'L8'] },
  { id: 'divia-barbe', name: 'Barbe', latitude: 47.3266, longitude: 5.0397, lines: ['L4', 'B10'] },
  { id: 'divia-sainte-bernadette', name: 'Sainte-Bernadette', latitude: 47.3340, longitude: 5.0604, lines: ['L3', 'L6', 'COROL'] },
  { id: 'divia-chu-hopitaux', name: 'CHU - Hôpitaux', latitude: 47.3214, longitude: 5.0672, lines: ['T1', 'L3', 'COROL'] },
  { id: 'divia-fac-mirande', name: 'Fac Mirande', latitude: 47.3127, longitude: 5.0729, lines: ['T1', 'L5', 'COROL'] },
  { id: 'divia-mazen-sully', name: 'Mazen Sully', latitude: 47.3183, longitude: 5.0764, lines: ['T1', 'COROL'] },
  { id: 'divia-parc-colombiere', name: 'Parc de la Colombière', latitude: 47.3054, longitude: 5.0467, lines: ['L6', 'COROL'] },
  { id: 'divia-lycee-montchapet', name: 'Lycée Montchapet', latitude: 47.3304, longitude: 5.0268, lines: ['B10', 'COROL'] },
  { id: 'divia-fontaine-centre', name: 'Fontaine Centre', latitude: 47.3435, longitude: 5.0190, lines: ['L4', 'COROL'] },
  { id: 'divia-talant-dullin', name: 'Talant Dullin', latitude: 47.3358, longitude: 5.0048, lines: ['L5', 'B10'] },
  { id: 'divia-chevigny-mairie', name: 'Chevigny Mairie', latitude: 47.3016, longitude: 5.1342, lines: ['L7'] },
  { id: 'divia-quetigny-allies', name: 'Quetigny Alliés', latitude: 47.3112, longitude: 5.1060, lines: ['T1', 'L7'] },
  { id: 'divia-st-apollinaire', name: 'Saint-Apollinaire Tabourot', latitude: 47.3315, longitude: 5.0835, lines: ['L7', 'B11'] },
  { id: 'divia-st-michel', name: 'Saint-Michel', latitude: 47.3208, longitude: 5.0468, lines: ['L5', 'L6', 'L8', 'B11'] },
  { id: 'divia-victor-hugo', name: 'Victor Hugo', latitude: 47.3277, longitude: 5.0315, lines: ['L4', 'B10'] },
  { id: 'divia-devosge', name: 'Devosge', latitude: 47.3257, longitude: 5.0352, lines: ['L4', 'B10', 'B13'] },
  { id: 'divia-spuller', name: 'Spuller', latitude: 47.3249, longitude: 5.0319, lines: ['B10', 'B13'] },
  { id: 'divia-suquet', name: 'Suquet', latitude: 47.3210, longitude: 5.0308, lines: ['B12', 'B13'] },
  { id: 'divia-tivoli', name: 'Tivoli', latitude: 47.3168, longitude: 5.0398, lines: ['L5', 'B12'] },
  { id: 'divia-berbisey', name: 'Berbisey', latitude: 47.3186, longitude: 5.0364, lines: ['B12', 'B13'] },
];

const SUPPLEMENTAL_DIVIA_LINES: DiviaCatalogLine[] = [
  {
    id: 'COROL',
    name: 'Corol (Rocade)',
    stops: [
      { id: 'divia-fontaine-centre', name: 'Fontaine Centre', latitude: 47.3435, longitude: 5.0190, lines: ['COROL'] },
      { id: 'divia-lycee-montchapet', name: 'Lycée Montchapet', latitude: 47.3304, longitude: 5.0268, lines: ['COROL'] },
      { id: 'divia-sainte-bernadette', name: 'Sainte-Bernadette', latitude: 47.3340, longitude: 5.0604, lines: ['COROL'] },
      { id: 'divia-chu-hopitaux', name: 'CHU - Hôpitaux', latitude: 47.3214, longitude: 5.0672, lines: ['COROL'] },
      { id: 'divia-mazen-sully', name: 'Mazen Sully', latitude: 47.3183, longitude: 5.0764, lines: ['COROL'] },
      { id: 'divia-fac-mirande', name: 'Fac Mirande', latitude: 47.3127, longitude: 5.0729, lines: ['COROL'] },
      { id: 'divia-parc-colombiere', name: 'Parc de la Colombière', latitude: 47.3054, longitude: 5.0467, lines: ['COROL'] },
    ],
  },
  {
    id: 'CITY',
    name: 'Navette City',
    stops: [
      { id: 'hub-darcy', name: 'Darcy', latitude: 47.3235, longitude: 5.0335, lines: ['CITY'] },
      { id: 'divia-grangier', name: 'Grangier', latitude: 47.3224, longitude: 5.0369, lines: ['CITY'] },
      { id: 'divia-miroir', name: 'Miroir', latitude: 47.3219, longitude: 5.0398, lines: ['CITY'] },
      { id: 'divia-liberation', name: 'Libération', latitude: 47.3211, longitude: 5.0414, lines: ['CITY'] },
      { id: 'divia-cordeliers', name: 'Cordeliers', latitude: 47.3190, longitude: 5.0422, lines: ['CITY'] },
      { id: 'divia-emile-zola', name: 'Émile Zola', latitude: 47.3193, longitude: 5.0375, lines: ['CITY'] },
      { id: 'divia-bossuet', name: 'Bossuet', latitude: 47.3204, longitude: 5.0378, lines: ['CITY'] },
    ],
  },
];

function mergeStopsCatalog(baseStops: TransitStop[], extraStops: TransitStop[]): TransitStop[] {
  const result: TransitStop[] = baseStops.map(s => ({ ...s, lines: [...s.lines] }));

  for (const candidate of extraStops) {
    const candKey = normalizeKey(candidate.name);
    if (!candKey) continue;

    const existing = result.find(
      s =>
        s.id === candidate.id ||
        (normalizeKey(s.name) === candKey &&
          calculateDistanceMeters(s.latitude, s.longitude, candidate.latitude, candidate.longitude) <
            120)
    );

    if (existing) {
      const mergedLines = new Set([...existing.lines, ...candidate.lines]);
      existing.lines = Array.from(mergedLines);
    } else {
      result.push({ ...candidate, lines: [...candidate.lines] });
    }
  }

  return result;
}

export function buildLocalSeedCatalog(
  seedLines: TransitLine[] = DIJON_LINES,
  seedStops: TransitStop[] = ALL_DIJON_STOPS
): DiviaCatalogData {
  const lines: DiviaCatalogLine[] = seedLines.map(line => ({
    id: normalizeDiviaLineCode(line.id),
    name: line.name,
    stops: line.stops.map(s => ({ ...s, lines: [...s.lines] })),
  }));

  for (const extraLine of SUPPLEMENTAL_DIVIA_LINES) {
    if (!lines.some(l => l.id === extraLine.id)) {
      lines.push(extraLine);
    }
  }

  const allStops = mergeStopsCatalog(seedStops, SUPPLEMENTAL_DIVIA_STOPS);

  return {
    version: DIVIA_CATALOG_VERSION,
    generatedAt: Date.now(),
    source: 'local_seed',
    lines,
    allStops,
  };
}

/**
 * Pure parser transforming an Overpass API response (Divia route relations + all named
 * bus_stop/tram_stop/platform nodes in Dijon Métropole) into a unified DiviaCatalogData.
 */
export function parseOverpassCatalogPayload(
  payload: OverpassCatalogResponse,
  seedLines: TransitLine[] = DIJON_LINES,
  seedStops: TransitStop[] = ALL_DIJON_STOPS
): DiviaCatalogData {
  const base = buildLocalSeedCatalog(seedLines, seedStops);
  const elements = payload.elements || [];

  const nodeById = new Map<number, OverpassNodeElement>();
  const osmNamedStops: TransitStop[] = [];

  for (const el of elements) {
    if (el.type === 'node' && 'lat' in el && 'lon' in el && 'id' in el) {
      const node = el as OverpassNodeElement;
      nodeById.set(node.id, node);

      const rawName = node.tags?.name?.trim();
      const isTransitNode =
        node.tags?.highway === 'bus_stop' ||
        node.tags?.railway === 'tram_stop' ||
        node.tags?.public_transport === 'platform' ||
        node.tags?.public_transport === 'stop_position';

      if (rawName && isTransitNode) {
        osmNamedStops.push({
          id: `osm-stop-${node.id}`,
          name: rawName,
          latitude: node.lat,
          longitude: node.lon,
          lines: [],
        });
      }
    }
  }

  const allStops = mergeStopsCatalog(base.allStops, osmNamedStops);

  // Helper to resolve an OSM node to an existing canonical stop in allStops
  const resolveCanonicalStop = (node: OverpassNodeElement, lineCode: string): TransitStop | null => {
    const rawName = node.tags?.name?.trim();
    if (!rawName) return null;

    const norm = normalizeKey(rawName);
    const match = allStops.find(
      s =>
        normalizeKey(s.name) === norm &&
        calculateDistanceMeters(s.latitude, s.longitude, node.lat, node.lon) < 150
    );

    if (match) {
      if (!match.lines.includes(lineCode)) {
        match.lines.push(lineCode);
      }
      return match;
    }

    const created: TransitStop = {
      id: `osm-stop-${node.id}`,
      name: rawName,
      latitude: node.lat,
      longitude: node.lon,
      lines: [lineCode],
    };
    allStops.push(created);
    return created;
  };

  // Extract ordered stop lists from Overpass Divia route relations
  const bestOverpassLineById = new Map<string, DiviaCatalogLine>();

  for (const el of elements) {
    if (el.type !== 'relation' || !('members' in el)) continue;
    const rel = el as OverpassRelationElement;
    const rawRef = rel.tags?.ref || rel.tags?.name;
    const lineCode = normalizeDiviaLineCode(rawRef);
    if (!lineCode) continue;

    const orderedStops: TransitStop[] = [];
    for (const member of rel.members || []) {
      if (member.type !== 'node') continue;
      const role = (member.role || '').toLowerCase();
      if (role && !role.includes('stop') && !role.includes('platform')) continue;

      const node = nodeById.get(member.ref);
      if (!node) continue;

      const stop = resolveCanonicalStop(node, lineCode);
      if (!stop) continue;

      const prev = orderedStops[orderedStops.length - 1];
      if (!prev || normalizeKey(prev.name) !== normalizeKey(stop.name)) {
        orderedStops.push(stop);
      }
    }

    if (orderedStops.length < 3) continue;

    const existingBest = bestOverpassLineById.get(lineCode);
    if (!existingBest || orderedStops.length > existingBest.stops.length) {
      bestOverpassLineById.set(lineCode, {
        id: lineCode,
        name: rel.tags?.name || `Ligne ${lineCode}`,
        stops: orderedStops,
      });
    }
  }

  // Merge Overpass lines into base catalog (keep richer ordered stop list per line)
  const mergedLinesMap = new Map<string, DiviaCatalogLine>();
  for (const line of base.lines) {
    mergedLinesMap.set(line.id, line);
  }

  for (const [lineCode, osmLine] of bestOverpassLineById.entries()) {
    const existing = mergedLinesMap.get(lineCode);
    if (!existing || osmLine.stops.length > existing.stops.length) {
      mergedLinesMap.set(lineCode, osmLine);
    }
  }

  return {
    version: DIVIA_CATALOG_VERSION,
    generatedAt: Date.now(),
    source: 'overpass',
    lines: Array.from(mergedLinesMap.values()),
    allStops,
  };
}

export class DiviaCatalogService {
  private memoryCache: DiviaCatalogData | null = null;
  private inflightRefresh: Promise<DiviaCatalogData> | null = null;
  private readonly cachePath: string;

  constructor(cachePath: string = DEFAULT_CATALOG_CACHE_PATH) {
    this.cachePath = cachePath;
  }

  private loadFromDiskCache(): DiviaCatalogData | null {
    try {
      if (!fs.existsSync(this.cachePath)) return null;
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DiviaCatalogData>;

      if (
        parsed.version !== DIVIA_CATALOG_VERSION ||
        !Array.isArray(parsed.lines) ||
        !Array.isArray(parsed.allStops) ||
        parsed.allStops.length === 0
      ) {
        return null;
      }

      if (parsed.generatedAt && Date.now() - parsed.generatedAt > CACHE_TTL_MS) {
        return null;
      }

      return parsed as DiviaCatalogData;
    } catch {
      return null;
    }
  }

  private saveToDiskCache(data: DiviaCatalogData): void {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cachePath, JSON.stringify(data), 'utf-8');
    } catch (error) {
      console.warn('[DiviaCatalogService] Impossible d\'écrire le cache disque:', error);
    }
  }

  /**
   * Synchronous zero-latency accessor for route mapping.
   * Returns in-memory cache -> disk cache -> local seed catalog.
   */
  public getCatalogSync(): DiviaCatalogData {
    if (this.memoryCache) {
      return this.memoryCache;
    }

    const fromDisk = this.loadFromDiskCache();
    if (fromDisk) {
      this.memoryCache = fromDisk;
      return fromDisk;
    }

    const seed = buildLocalSeedCatalog();
    this.memoryCache = seed;
    return seed;
  }

  public getLineByCodeSync(rawLineCode: string): DiviaCatalogLine | undefined {
    const normalized = normalizeDiviaLineCode(rawLineCode);
    if (!normalized) return undefined;
    return this.getCatalogSync().lines.find(l => l.id === normalized);
  }

  public getAllStopsSync(): TransitStop[] {
    return this.getCatalogSync().allStops;
  }

  public async refreshCatalogFromOverpass(): Promise<DiviaCatalogData> {
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }

    this.inflightRefresh = (async () => {
      const query = `[out:json][timeout:25];
(
  relation["type"="route"]["route"~"tram|bus|light_rail"]["network"~"Divia",i](${DIJON_BBOX});
  node["highway"="bus_stop"]["name"](${DIJON_BBOX});
  node["railway"="tram_stop"]["name"](${DIJON_BBOX});
  node["public_transport"="platform"]["name"](${DIJON_BBOX});
  node["public_transport"="stop_position"]["name"](${DIJON_BBOX});
);
out body;
>;
out skel qt;`;

      for (const endpoint of OVERPASS_ENDPOINTS) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              Accept: 'application/json',
            },
            body: `data=${encodeURIComponent(query)}`,
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            continue;
          }

          const payload = (await response.json()) as OverpassCatalogResponse;
          if (!payload.elements || payload.elements.length === 0) {
            continue;
          }

          const catalog = parseOverpassCatalogPayload(payload);
          this.memoryCache = catalog;
          this.saveToDiskCache(catalog);
          console.log(
            `[DiviaCatalogService] Catalogue Overpass chargé : ${catalog.lines.length} lignes, ${catalog.allStops.length} arrêts Dijon Métropole`
          );
          return catalog;
        } catch {
          clearTimeout(timeoutId);
        }
      }

      return this.getCatalogSync();
    })().finally(() => {
      this.inflightRefresh = null;
    });

    return this.inflightRefresh;
  }

  public warmupCatalog(): void {
    const existing = this.loadFromDiskCache();
    if (existing) {
      this.memoryCache = existing;
      return;
    }
    this.refreshCatalogFromOverpass().catch(() => {
      // Safe fallback to local seed
    });
  }

  public clearMemoryCache(): void {
    this.memoryCache = null;
  }
}

export const diviaCatalogService = new DiviaCatalogService();
