import { afterEach, describe, expect, it } from 'vitest';
import { DIJON_LINES } from '../data/dijonNetwork';
import {
  normalizeDiviaLineCode,
  parseOverpassCatalogPayload,
} from '../services/diviaCatalogService';
import {
  computeGoogleTransitRoutes,
  decodeGooglePolyline,
  decodeGooglePolylineLatLng,
  GoogleRoute,
  mapGoogleRouteToRouteOption,
  normalizeStopNameForMatching,
  resolveIntermediateStops,
  resolveIntermediateStopsAlongPolyline,
  resolveIntermediateStopsForTransitLeg,
  resolveStopIndexOnLine,
} from '../services/googleTransitService';
import { getPlaceDetails } from '../services/googlePlacesService';
import { placeDetailsQuerySchema, placesAutocompleteQuerySchema, Report } from '../types';

/**
 * Helper: standard Google Polyline encoder for deterministic Dijon test vectors
 */
function encodeGooglePolyline(coords: [number, number][]): string {
  let result = '';
  let prevLat = 0;
  let prevLng = 0;

  const encodeValue = (v: number): string => {
    let s = v < 0 ? ~(v << 1) : v << 1;
    let out = '';
    while (s >= 0x20) {
      out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
      s >>= 5;
    }
    out += String.fromCharCode(s + 63);
    return out;
  };

  for (const [lat, lng] of coords) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    result += encodeValue(iLat - prevLat);
    result += encodeValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }

  return result;
}

describe('GoogleTransitService — Polyline decoding, TransitDetails mapping & Waze fusion', () => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    }
  });

  it('decodes standard Google Encoded Polyline vectors accurately', () => {
    const officialVector = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const points = decodeGooglePolyline(officialVector);

    expect(points).toHaveLength(3);
    expect(points[0][0]).toBeCloseTo(38.5, 4);
    expect(points[0][1]).toBeCloseTo(-120.2, 4);
    expect(points[1][0]).toBeCloseTo(40.7, 4);
    expect(points[1][1]).toBeCloseTo(-120.95, 4);
    expect(points[2][0]).toBeCloseTo(43.252, 3);
    expect(points[2][1]).toBeCloseTo(-126.453, 3);

    const latLngObjs = decodeGooglePolylineLatLng(officialVector);
    expect(latLngObjs[0]).toEqual({ latitude: 38.5, longitude: -120.2 });

    expect(decodeGooglePolyline('')).toEqual([]);
  });

  it('decodes Dijon tramway polylines with sub-meter precision', () => {
    const dijonCoords: [number, number][] = [
      [47.3235, 5.0335], // Darcy
      [47.3232, 5.0401], // Godrans
      [47.3262, 5.0461], // République
      [47.3133, 5.0706], // Université
    ];
    const encoded = encodeGooglePolyline(dijonCoords);
    const decoded = decodeGooglePolyline(encoded);

    expect(decoded).toHaveLength(dijonCoords.length);
    for (let i = 0; i < dijonCoords.length; i++) {
      expect(decoded[i][0]).toBeCloseTo(dijonCoords[i][0], 4);
      expect(decoded[i][1]).toBeCloseTo(dijonCoords[i][1], 4);
    }
  });

  it('maps Google Routes API TRANSIT + WALK legs and fuses active Waze controller & crowd alerts', () => {
    const walkToStopEncoded = encodeGooglePolyline([
      [47.3236, 5.0278],
      [47.3235, 5.0335],
    ]);
    const tramT1Encoded = encodeGooglePolyline([
      [47.3235, 5.0335],
      [47.3232, 5.0401],
      [47.3262, 5.0461],
      [47.3133, 5.0706],
    ]);
    const walkToDestEncoded = encodeGooglePolyline([
      [47.3133, 5.0706],
      [47.3125, 5.0725],
    ]);

    const now = new Date('2026-11-17T08:15:00.000Z');
    const mockGoogleRoute: GoogleRoute = {
      duration: '1200s', // 20 min
      distanceMeters: 4200,
      legs: [
        {
          duration: '1200s',
          distanceMeters: 4200,
          steps: [
            {
              travelMode: 'WALK',
              staticDuration: '240s',
              distanceMeters: 300,
              navigationInstruction: {
                instructions: 'Marcher vers Darcy',
              },
              polyline: { encodedPolyline: walkToStopEncoded },
            },
            {
              travelMode: 'TRANSIT',
              staticDuration: '780s',
              distanceMeters: 3650,
              polyline: { encodedPolyline: tramT1Encoded },
              transitDetails: {
                headsign: 'Quetigny Centre',
                headway: '300s',
                stopCount: 6,
                transitLine: {
                  name: 'Tramway T1',
                  nameShort: 'T1',
                  color: '#E11535',
                  vehicle: { type: 'TRAM' },
                },
                stopDetails: {
                  departureStop: {
                    name: 'Darcy',
                    location: { latLng: { latitude: 47.3235, longitude: 5.0335 } },
                  },
                  arrivalStop: {
                    name: 'Université',
                    location: { latLng: { latitude: 47.3133, longitude: 5.0706 } },
                  },
                  departureTime: '2026-11-17T08:20:00.000Z',
                  arrivalTime: '2026-11-17T08:33:00.000Z',
                },
                localizedValues: {
                  departureTime: { time: { text: '09:20' } },
                  arrivalTime: { time: { text: '09:33' } },
                },
              },
            },
            {
              travelMode: 'WALK',
              staticDuration: '180s',
              distanceMeters: 250,
              navigationInstruction: {
                instructions: 'Marcher vers Campus Sciences',
              },
              polyline: { encodedPolyline: walkToDestEncoded },
            },
          ],
        },
      ],
    };

    const option = mapGoogleRouteToRouteOption(mockGoogleRoute, 0, now);
    expect(option).not.toBeNull();
    if (!option) return;

    expect(option.totalDurationMinutes).toBe(20);
    expect(option.transfersCount).toBe(0);
    expect(option.headwayMinutes).toBe(5);
    expect(option.segments).toHaveLength(3);

    const walkStart = option.segments[0];
    const transitLeg = option.segments[1];
    const walkEnd = option.segments[2];

    expect(walkStart.type).toBe('WALK');
    expect(walkStart.polyline).toHaveLength(2);
    expect(walkEnd.type).toBe('WALK');

    expect(transitLeg.type).toBe('TRANSIT');
    expect(transitLeg.lineId).toBe('T1');
    expect(transitLeg.lineColor).toBe('#E11535');
    expect(transitLeg.direction).toBe('Direction Quetigny Centre');
    expect(transitLeg.stopsCount).toBe(6);
    expect(transitLeg.fromStop?.name).toBe('Darcy');
    expect(transitLeg.fromStop?.id).toBe('hub-darcy');
    expect(transitLeg.toStop?.name).toBe('Université');
    expect(transitLeg.toStop?.id).toBe('hub-universite');
    expect(transitLeg.departureTime).toBe('09:20');
    expect(transitLeg.arrivalTime).toBe('09:33');
    expect(transitLeg.polyline).toHaveLength(4);

    // Waze fusion: seeded controller alert on Darcy / T1 must be fused onto this Google Transit route
    expect(option.hasControllerAlert).toBe(true);
    expect(option.alerts.length).toBeGreaterThanOrEqual(1);

    // Waze crowd fusion: seeded HIGH crowd report on Darcy must be attached
    expect(transitLeg.crowdStatus?.level).toBe('HIGH');
    expect(option.crowdStatus?.level).toBe('HIGH');
    expect(option.crowdSummary).toContain('T1');

    // Full polyline concatenates all decoded segments without adjacent duplicates
    expect(option.fullPolyline.length).toBe(6);
  });

  it('merges 3 consecutive WALK sub-steps (40s + 50s + 90s) into a single 3 min WALK segment preserving all 3 street instructions', () => {
    const walk1 = encodeGooglePolyline([
      [47.3236, 5.0278],
      [47.3236, 5.0295],
    ]);
    const walk2 = encodeGooglePolyline([
      [47.3236, 5.0295],
      [47.3235, 5.0315],
    ]);
    const walk3 = encodeGooglePolyline([
      [47.3235, 5.0315],
      [47.3235, 5.0335],
    ]);
    const tramT1 = encodeGooglePolyline([
      [47.3235, 5.0335],
      [47.3262, 5.0461],
    ]);
    const tramT2 = encodeGooglePolyline([
      [47.3262, 5.0461],
      [47.3541, 5.0501],
    ]);
    const walkEnd1 = encodeGooglePolyline([
      [47.3541, 5.0501],
      [47.3545, 5.0505],
    ]);
    const walkEnd2 = encodeGooglePolyline([
      [47.3545, 5.0505],
      [47.3550, 5.0510],
    ]);

    const mockRoute: GoogleRoute = {
      duration: '1500s',
      distanceMeters: 4800,
      legs: [
        {
          duration: '1500s',
          distanceMeters: 4800,
          steps: [
            {
              travelMode: 'WALK',
              staticDuration: '40s',
              distanceMeters: 50,
              navigationInstruction: { instructions: 'Prendre Avenue Foch' },
              polyline: { encodedPolyline: walk1 },
            },
            {
              travelMode: 'WALK',
              staticDuration: '50s',
              distanceMeters: 65,
              navigationInstruction: { instructions: 'Tourner à droite Rue de la Poste' },
              polyline: { encodedPolyline: walk2 },
            },
            {
              travelMode: 'WALK',
              staticDuration: '90s',
              distanceMeters: 115,
              navigationInstruction: { instructions: 'Continuer vers Place Darcy' },
              polyline: { encodedPolyline: walk3 },
            },
            {
              travelMode: 'TRANSIT',
              staticDuration: '420s',
              distanceMeters: 1500,
              polyline: { encodedPolyline: tramT1 },
              transitDetails: {
                headsign: 'Quetigny Centre',
                stopCount: 3,
                transitLine: { name: 'Tramway T1', nameShort: 'T1', color: '#E11535', vehicle: { type: 'TRAM' } },
                stopDetails: {
                  departureStop: { name: 'Darcy', location: { latLng: { latitude: 47.3235, longitude: 5.0335 } } },
                  arrivalStop: { name: 'République', location: { latLng: { latitude: 47.3262, longitude: 5.0461 } } },
                },
              },
            },
            // Same-platform transfer < 20m -> must be omitted from summary pills
            {
              travelMode: 'WALK',
              staticDuration: '15s',
              distanceMeters: 10,
              navigationInstruction: { instructions: 'Changer sur le même quai' },
              polyline: { encodedPolyline: '' },
            },
            {
              travelMode: 'TRANSIT',
              staticDuration: '600s',
              distanceMeters: 2900,
              polyline: { encodedPolyline: tramT2 },
              transitDetails: {
                headsign: 'Valmy',
                stopCount: 6,
                transitLine: { name: 'Tramway T2', nameShort: 'T2', color: '#4B2982', vehicle: { type: 'TRAM' } },
                stopDetails: {
                  departureStop: { name: 'République', location: { latLng: { latitude: 47.3262, longitude: 5.0461 } } },
                  arrivalStop: { name: "Toison d'Or", location: { latLng: { latitude: 47.3541, longitude: 5.0501 } } },
                },
              },
            },
            // Final 2 consecutive WALK sub-steps (55s + 65s = 120s -> 2 min)
            {
              travelMode: 'WALK',
              staticDuration: '55s',
              distanceMeters: 70,
              navigationInstruction: { instructions: 'Traverser Route de Langres' },
              polyline: { encodedPolyline: walkEnd1 },
            },
            {
              travelMode: 'WALK',
              staticDuration: '65s',
              distanceMeters: 90,
              navigationInstruction: { instructions: "Entrer Centre Commercial Toison d'Or" },
              polyline: { encodedPolyline: walkEnd2 },
            },
          ],
        },
      ],
    };

    const option = mapGoogleRouteToRouteOption(mockRoute, 0, new Date('2026-11-17T08:15:00.000Z'));
    expect(option).not.toBeNull();
    if (!option) return;

    // Expected clean chain: WALK(3 min) -> TRANSIT(T1) -> TRANSIT(T2) -> WALK(2 min)
    expect(option.segments.map(s => s.type)).toEqual(['WALK', 'TRANSIT', 'TRANSIT', 'WALK']);

    const mergedFirstWalk = option.segments[0];
    expect(mergedFirstWalk.durationSeconds).toBe(180);
    expect(mergedFirstWalk.durationMinutes).toBe(3);
    expect(mergedFirstWalk.distanceMeters).toBe(230);
    expect(mergedFirstWalk.instructions).toEqual([
      'Prendre Avenue Foch',
      'Tourner à droite Rue de la Poste',
      'Continuer vers Place Darcy',
    ]);
    expect(mergedFirstWalk.turnInstructions).toHaveLength(3);
    expect(mergedFirstWalk.polyline).toHaveLength(4); // deduplicated join points
    expect(mergedFirstWalk.toStop?.name).toBe('Darcy');

    const mergedLastWalk = option.segments[3];
    expect(mergedLastWalk.durationSeconds).toBe(120);
    expect(mergedLastWalk.durationMinutes).toBe(2);
    expect(mergedLastWalk.distanceMeters).toBe(160);
    expect(mergedLastWalk.instructions).toHaveLength(2);

    // Ensure no two consecutive WALK segments exist
    for (let i = 0; i < option.segments.length - 1; i++) {
      expect(
        option.segments[i].type === 'WALK' && option.segments[i + 1].type === 'WALK'
      ).toBe(false);
    }
  });

  it('returns null cleanly when GOOGLE_MAPS_API_KEY is not configured', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await computeGoogleTransitRoutes({
      fromLat: 47.3235,
      fromLng: 5.0335,
      toLat: 47.3133,
      toLng: 5.0706,
    });
    expect(result).toBeNull();
  });

  it('validates Places proxy query schemas and resolves fallback Divia/BAN place IDs', async () => {
    expect(placesAutocompleteQuerySchema.safeParse({ input: 'a' }).success).toBe(false);
    expect(placesAutocompleteQuerySchema.safeParse({ input: 'Place Darcy' }).success).toBe(true);

    expect(placeDetailsQuerySchema.safeParse({ placeId: '' }).success).toBe(false);
    expect(placeDetailsQuerySchema.safeParse({ placeId: 'divia-stop:hub-darcy' }).success).toBe(
      true
    );

    const darcyDetails = await getPlaceDetails('divia-stop:hub-darcy');
    expect(darcyDetails).not.toBeNull();
    expect(darcyDetails?.label).toBe('Darcy');
    expect(darcyDetails?.type).toBe('stop');
    expect(darcyDetails?.latitude).toBeCloseTo(47.3235, 3);

    const banDetails = await getPlaceDetails(
      'ban:47.321500:5.041400:Place%20de%20la%20Lib%C3%A9ration%2C%20Dijon'
    );
    expect(banDetails).not.toBeNull();
    expect(banDetails?.label).toBe('Place de la Libération, Dijon');
    expect(banDetails?.latitude).toBeCloseTo(47.3215, 4);
  });

  it('resolves intermediate stops in forward (Aller) direction with linear estimated times and controller alerts', () => {
    const depDate = new Date(2026, 10, 18, 14, 0, 0);
    const arrDate = new Date(2026, 10, 18, 14, 12, 0); // 12 min across 4 intervals -> +3 min/stop

    const mockControllerAtGodrans: Report = {
      id: 'ctrl-godrans-test',
      type: 'CONTROLLER',
      stopId: 'hub-godrans',
      stopName: 'Godrans Les Halles',
      lineId: 'T1',
      lineName: 'Tramway T1',
      latitude: 47.3232,
      longitude: 5.0401,
      direction: 'Dir. Quetigny Centre',
      reportedAt: depDate.getTime(),
      expiresAt: depDate.getTime() + 40 * 60 * 1000,
      upvotes: 2,
      downvotes: 0,
      reliabilityScore: 90,
      status: 'active',
    };

    const intermediates = resolveIntermediateStopsForTransitLeg(
      'T1',
      { name: 'Dijon Gare', location: { latLng: { latitude: 47.3236, longitude: 5.0278 } } },
      { name: 'République', location: { latLng: { latitude: 47.3262, longitude: 5.0461 } } },
      depDate,
      arrDate,
      [mockControllerAtGodrans]
    );

    expect(intermediates.map(s => s.name)).toEqual([
      'Foch Gare',
      'Darcy',
      'Godrans Les Halles',
    ]);
    expect(intermediates.map(s => s.estimatedTime)).toEqual(['14:03', '14:06', '14:09']);
    expect(intermediates[0].hasControllerAlert).toBe(false);
    expect(intermediates[1].hasControllerAlert).toBe(false);
    expect(intermediates[2].hasControllerAlert).toBe(true);
  });

  it('resolves intermediate stops in reversed return (Retour) direction without returning empty array', () => {
    const depDate = new Date(2026, 10, 18, 15, 0, 0);
    const arrDate = new Date(2026, 10, 18, 15, 16, 0);

    // T1 Retour: République (index 4) -> Dijon Gare (index 0)
    const intermediates = resolveIntermediateStopsForTransitLeg(
      'T1',
      { name: 'Station République', location: { latLng: { latitude: 47.3262, longitude: 5.0461 } } },
      { name: 'Gare SNCF', location: { latLng: { latitude: 47.3236, longitude: 5.0278 } } },
      depDate,
      arrDate,
      []
    );

    expect(intermediates.map(s => s.name)).toEqual([
      'Godrans Les Halles',
      'Darcy',
      'Foch Gare',
    ]);
    expect(intermediates.map(s => s.estimatedTime)).toEqual(['15:04', '15:08', '15:12']);
  });

  it('matches Google stop name variations via fuzzy normalization and mandatory <180m GPS fallback', () => {
    const lineT1 = DIJON_LINES.find(l => l.id === 'T1');
    expect(lineT1).toBeDefined();
    if (!lineT1) return;

    // Fuzzy normalization: parasite words & synonyms
    expect(normalizeStopNameForMatching('Place Darcy')).toBe('darcy');
    expect(normalizeStopNameForMatching('Gare SNCF')).toBe('gare');
    expect(normalizeStopNameForMatching('Dijon Gare')).toBe('gare');
    expect(normalizeStopNameForMatching('Arrêt Avenue Poincaré')).toBe('poincare');

    const idxGare = resolveStopIndexOnLine(lineT1, 'Gare SNCF');
    const idxDarcy = resolveStopIndexOnLine(lineT1, 'Place Darcy');
    const idxFoch = resolveStopIndexOnLine(lineT1, 'Foch Gare');
    expect(lineT1.stops[idxGare].id).toBe('hub-gare');
    expect(lineT1.stops[idxDarcy].id).toBe('hub-darcy');
    expect(lineT1.stops[idxFoch].id).toBe('t1-foch');

    // GPS fallback (< 180m): unrecognizable Google stop label near Godrans (~45m away)
    const idxByGps = resolveStopIndexOnLine(lineT1, 'Arrêt Inconnu Quai Nord', {
      latitude: 47.3235,
      longitude: 5.0404,
    });
    expect(lineT1.stops[idxByGps].id).toBe('hub-godrans');

    // GPS fallback rejected when > 180m away from every stop on line
    const idxTooFar = resolveStopIndexOnLine(lineT1, 'Arrêt Hors Zone', {
      latitude: 47.38,
      longitude: 5.15,
    });
    expect(idxTooFar).toBe(-1);
  });

  it('populates intermediateStops, passedStops and estimatedStopTimes in mapGoogleRouteToRouteOption for return trips and preserves stopCount for unknown secondary lines', () => {
    const depIso = new Date(2026, 10, 18, 16, 0, 0).toISOString();
    const arrIso = new Date(2026, 10, 18, 16, 12, 0).toISOString();

    const reverseRoute: GoogleRoute = {
      duration: '720s',
      distanceMeters: 2100,
      legs: [
        {
          duration: '720s',
          distanceMeters: 2100,
          steps: [
            {
              travelMode: 'TRANSIT',
              staticDuration: '720s',
              distanceMeters: 2100,
              transitDetails: {
                headsign: 'Dijon Gare',
                stopCount: 4,
                transitLine: { name: 'Tramway T1', nameShort: 'T1', color: '#E11535', vehicle: { type: 'TRAM' } },
                stopDetails: {
                  departureStop: {
                    name: 'Place de la République',
                    location: { latLng: { latitude: 47.3262, longitude: 5.0461 } },
                  },
                  arrivalStop: {
                    name: 'Gare SNCF',
                    location: { latLng: { latitude: 47.3236, longitude: 5.0278 } },
                  },
                  departureTime: depIso,
                  arrivalTime: arrIso,
                },
              },
            },
            {
              travelMode: 'TRANSIT',
              staticDuration: '480s',
              distanceMeters: 1800,
              transitDetails: {
                headsign: 'Perrigny',
                stopCount: 5,
                transitLine: { name: 'Bus B99', nameShort: 'B99', color: '#0066AA', vehicle: { type: 'BUS' } },
                stopDetails: {
                  departureStop: {
                    name: 'Arrêt Secondaire A',
                    location: { latLng: { latitude: 47.28, longitude: 5.01 } },
                  },
                  arrivalStop: {
                    name: 'Arrêt Secondaire B',
                    location: { latLng: { latitude: 47.26, longitude: 5.0 } },
                  },
                },
              },
            },
          ],
        },
      ],
    };

    const option = mapGoogleRouteToRouteOption(reverseRoute, 0, new Date(2026, 10, 18, 15, 58, 0));
    expect(option).not.toBeNull();
    if (!option) return;

    const t1Seg = option.segments[0];
    expect(t1Seg.intermediateStops?.map(s => s.name)).toEqual([
      'Godrans Les Halles',
      'Darcy',
      'Foch Gare',
    ]);
    expect(t1Seg.passedStops?.map(s => s.name)).toEqual([
      'Place de la République',
      'Godrans Les Halles',
      'Darcy',
      'Foch Gare',
      'Gare SNCF',
    ]);
    expect(t1Seg.estimatedStopTimes).toHaveLength(5);
    expect(t1Seg.intermediateStops?.map(s => s.estimatedTime)).toEqual(['16:03', '16:06', '16:09']);

    // Unknown secondary line preserves stopCount=5 for UI safety net
    const secondarySeg = option.segments[1];
    expect(secondarySeg.intermediateStops).toEqual([]);
    expect(secondarySeg.stopsCount).toBe(5);
  });

  it('normalizes all Divia line codes returned by Google Routes API and Overpass', () => {
    expect(normalizeDiviaLineCode('T1')).toBe('T1');
    expect(normalizeDiviaLineCode('Tramway T2')).toBe('T2');
    expect(normalizeDiviaLineCode('3')).toBe('L3');
    expect(normalizeDiviaLineCode('L3')).toBe('L3');
    expect(normalizeDiviaLineCode('5')).toBe('L5');
    expect(normalizeDiviaLineCode('Liane 5')).toBe('L5');
    expect(normalizeDiviaLineCode('10')).toBe('B10');
    expect(normalizeDiviaLineCode('B10')).toBe('B10');
    expect(normalizeDiviaLineCode('12')).toBe('B12');
    expect(normalizeDiviaLineCode('Bus 13')).toBe('B13');
    expect(normalizeDiviaLineCode('Corol')).toBe('COROL');
    expect(normalizeDiviaLineCode('Navette City')).toBe('CITY');
  });

  it('parses Overpass Divia route relations and named bus/tram stops into the catalog', () => {
    const parsed = parseOverpassCatalogPayload({
      elements: [
        { type: 'node', id: 1001, lat: 47.3235, lon: 5.0335, tags: { name: 'Darcy', highway: 'bus_stop' } },
        { type: 'node', id: 1002, lat: 47.3224, lon: 5.0369, tags: { name: 'Grangier', highway: 'bus_stop' } },
        { type: 'node', id: 1003, lat: 47.3219, lon: 5.0398, tags: { name: 'Miroir', highway: 'bus_stop' } },
        { type: 'node', id: 1004, lat: 47.3211, lon: 5.0414, tags: { name: 'Libération', highway: 'bus_stop' } },
        {
          type: 'relation',
          id: 2001,
          tags: { type: 'route', route: 'bus', network: 'DiviaMobilités', ref: 'B18', name: 'Bus B18' },
          members: [
            { type: 'node', ref: 1001, role: 'platform' },
            { type: 'node', ref: 1002, role: 'platform' },
            { type: 'node', ref: 1003, role: 'platform' },
            { type: 'node', ref: 1004, role: 'platform' },
          ],
        },
      ],
    });

    const lineB18 = parsed.lines.find(l => l.id === 'B18');
    expect(lineB18).toBeDefined();
    expect(lineB18?.stops.map(s => s.name)).toEqual(['Darcy', 'Grangier', 'Miroir', 'Libération']);
  });

  it('resolves bus B10/B12 real stop names (including numeric Google code "12") in both directions', () => {
    const depDate = new Date(2026, 10, 18, 11, 0, 0);
    const arrDate = new Date(2026, 10, 18, 11, 15, 0);

    const b12Line = DIJON_LINES.find(l => l.id === 'B12');
    expect(b12Line).toBeDefined();
    if (!b12Line || b12Line.stops.length < 4) return;

    const firstStop = b12Line.stops[0];
    const lastStop = b12Line.stops[b12Line.stops.length - 1];

    // Forward direction using bare numeric code "12" from Google Routes API
    const forwardStops = resolveIntermediateStops({
      lineId: '12',
      depStopRaw: {
        name: firstStop.name,
        location: { latLng: { latitude: firstStop.latitude, longitude: firstStop.longitude } },
      },
      arrStopRaw: {
        name: lastStop.name,
        location: { latLng: { latitude: lastStop.latitude, longitude: lastStop.longitude } },
      },
      depDate,
      arrDate,
      stopCount: b12Line.stops.length - 1,
      activeControllers: [],
    });

    const expectedForwardNames = b12Line.stops.slice(1, -1).map(s => s.name);
    expect(forwardStops.map(s => s.name)).toEqual(expectedForwardNames);
    expect(forwardStops.every(s => /^\d{2}:\d{2}$/.test(s.estimatedTime))).toBe(true);

    // Reverse direction on B12
    const reverseStops = resolveIntermediateStops({
      lineId: 'B12',
      depStopRaw: {
        name: lastStop.name,
        location: { latLng: { latitude: lastStop.latitude, longitude: lastStop.longitude } },
      },
      arrStopRaw: {
        name: firstStop.name,
        location: { latLng: { latitude: firstStop.latitude, longitude: firstStop.longitude } },
      },
      depDate,
      arrDate,
      stopCount: b12Line.stops.length - 1,
      activeControllers: [],
    });

    expect(reverseStops.map(s => s.name)).toEqual([...expectedForwardNames].reverse());
  });

  it('extracts real ordered stop names via Layer 2 spatial polyline matching (<35m) when line is absent from line catalog', () => {
    const depDate = new Date(2026, 10, 18, 17, 0, 0);
    const arrDate = new Date(2026, 10, 18, 17, 12, 0);

    // Polyline passing directly through Darcy -> Grangier -> Miroir -> Libération (simulating uncatalogued line B19)
    const polylineCoords: [number, number][] = [
      [47.3235, 5.0335], // Darcy (departure)
      [47.3224, 5.0369], // Grangier (intermediate 1)
      [47.3219, 5.0398], // Miroir (intermediate 2)
      [47.3211, 5.0414], // Libération (arrival)
    ];

    const spatial = resolveIntermediateStopsAlongPolyline(
      polylineCoords,
      [
        { id: 'hub-darcy', name: 'Darcy', latitude: 47.3235, longitude: 5.0335, lines: ['B19'] },
        { id: 'divia-miroir', name: 'Miroir', latitude: 47.32195, longitude: 5.03985, lines: ['B19'] },
        { id: 'divia-grangier', name: 'Grangier', latitude: 47.32242, longitude: 5.03692, lines: ['B19'] },
        { id: 'far-away', name: 'Arrêt Hors Trajet', latitude: 47.3500, longitude: 5.0900, lines: ['B19'] },
        { id: 'divia-liberation', name: 'Libération', latitude: 47.3211, longitude: 5.0414, lines: ['B19'] },
      ],
      {
        lineId: 'B19',
        depStopRaw: { name: 'Darcy', location: { latLng: { latitude: 47.3235, longitude: 5.0335 } } },
        arrStopRaw: { name: 'Libération', location: { latLng: { latitude: 47.3211, longitude: 5.0414 } } },
        expectedCount: 2,
      }
    );

    // Must be sorted strictly along polyline progression (Grangier before Miroir), excluding far-away & endpoints
    expect(spatial.map(s => s.name)).toEqual(['Grangier', 'Miroir']);

    // End-to-end via mapGoogleRouteToRouteOption for uncatalogued line "19" (normalized to B19)
    const encodedPoly = encodeGooglePolyline(polylineCoords);
    const routeWithUnknownLine: GoogleRoute = {
      duration: '720s',
      distanceMeters: 900,
      legs: [
        {
          duration: '720s',
          distanceMeters: 900,
          steps: [
            {
              travelMode: 'TRANSIT',
              staticDuration: '720s',
              distanceMeters: 900,
              polyline: { encodedPolyline: encodedPoly },
              transitDetails: {
                headsign: 'Centre Ville',
                stopCount: 3,
                transitLine: { name: 'Bus 19', nameShort: '19', color: '#0066AA', vehicle: { type: 'BUS' } },
                stopDetails: {
                  departureStop: { name: 'Place Darcy', location: { latLng: { latitude: 47.3235, longitude: 5.0335 } } },
                  arrivalStop: { name: 'Libération', location: { latLng: { latitude: 47.3211, longitude: 5.0414 } } },
                  departureTime: depDate.toISOString(),
                  arrivalTime: arrDate.toISOString(),
                },
              },
            },
          ],
        },
      ],
    };

    const mapped = mapGoogleRouteToRouteOption(routeWithUnknownLine, 0, depDate);
    expect(mapped).not.toBeNull();
    const seg = mapped!.segments[0];
    expect(seg.lineId).toBe('B19');
    expect(seg.intermediateStops?.map(s => s.name)).toEqual(['Grangier', 'Miroir']);
    expect(seg.intermediateStops?.map(s => s.estimatedTime)).toEqual(['17:04', '17:08']);
  });

  it('does NOT flag hasControllerAlert on a T2 North Dijon route when the only T2 controller is South at Monge', () => {
    const now = new Date();
    const t2NorthEncoded = encodeGooglePolyline([
      [47.3262, 5.0461],
      [47.3382, 5.0485],
      [47.3545, 5.0512],
    ]);

    const northT2Route: GoogleRoute = {
      duration: '600s',
      distanceMeters: 3500,
      legs: [
        {
          duration: '600s',
          distanceMeters: 3500,
          steps: [
            {
              travelMode: 'TRANSIT',
              staticDuration: '600s',
              distanceMeters: 3500,
              polyline: { encodedPolyline: t2NorthEncoded },
              transitDetails: {
                headsign: 'Dijon Valmy',
                stopCount: 5,
                stopDetails: {
                  departureStop: {
                    name: 'République',
                    location: { latLng: { latitude: 47.3262, longitude: 5.0461 } },
                  },
                  arrivalStop: {
                    name: "Toison d'Or",
                    location: { latLng: { latitude: 47.3545, longitude: 5.0512 } },
                  },
                },
                transitLine: {
                  name: 'Tram T2',
                  nameShort: 'T2',
                  color: '#4B2982',
                  vehicle: { type: 'TRAM' },
                },
              },
            },
          ],
        },
      ],
    };

    const option = mapGoogleRouteToRouteOption(northT2Route, 0, now);
    expect(option).not.toBeNull();
    expect(option?.hasControllerAlert).toBe(false);
    expect(option?.alerts).toHaveLength(0);
    expect(option?.predictiveAlerts).toHaveLength(0);
  });
});
