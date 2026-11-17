import { afterEach, describe, expect, it } from 'vitest';
import {
  computeGoogleTransitRoutes,
  decodeGooglePolyline,
  decodeGooglePolylineLatLng,
  GoogleRoute,
  mapGoogleRouteToRouteOption,
} from '../services/googleTransitService';
import { getPlaceDetails } from '../services/googlePlacesService';
import { placeDetailsQuerySchema, placesAutocompleteQuerySchema } from '../types';

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

    // Full polyline concatenates all decoded segments
    expect(option.fullPolyline.length).toBe(8);
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
});
