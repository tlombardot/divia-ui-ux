import { describe, expect, it } from 'vitest';
import { ALL_DIJON_STOPS } from '../data/dijonNetwork';
import { TransitStop } from '../types';
import {
  buildQuickControllerPayload,
  formatStopDistance,
  getNearestStops,
  resolveDefaultLineId,
} from '../utils/quickReportUtils';

describe('quickReportUtils', () => {
  const mockDarcyLocation = {
    latitude: 47.3235,
    longitude: 5.0335,
  };

  const mockStopDarcy: TransitStop = {
    id: 'hub-darcy',
    name: 'Darcy',
    latitude: 47.3235,
    longitude: 5.0335,
    lines: ['T1', 'T2', 'L5', 'L3'],
  };

  const mockBusStop: TransitStop = {
    id: 'stop-grangier',
    name: 'Grangier',
    latitude: 47.3228,
    longitude: 5.0381,
    lines: ['L3', 'L5'],
  };

  const mockLineLessStop: TransitStop = {
    id: 'stop-isolated',
    name: 'Arrêt Isolé',
    latitude: 47.35,
    longitude: 5.05,
    lines: [],
  };

  describe('formatStopDistance', () => {
    it('formats meters when under 1000m', () => {
      expect(formatStopDistance(0)).toBe('0 m');
      expect(formatStopDistance(42)).toBe('42 m');
      expect(formatStopDistance(999)).toBe('999 m');
    });

    it('formats kilometers with 1 decimal when 1000m or more', () => {
      expect(formatStopDistance(1000)).toBe('1.0 km');
      expect(formatStopDistance(1450)).toBe('1.5 km');
      expect(formatStopDistance(3200)).toBe('3.2 km');
    });
  });

  describe('resolveDefaultLineId', () => {
    it('prioritizes T1 if available', () => {
      expect(resolveDefaultLineId(mockStopDarcy)).toBe('T1');
    });

    it('prioritizes T2 if T1 not available', () => {
      const stopT2: TransitStop = {
        ...mockStopDarcy,
        lines: ['L5', 'T2'],
      };
      expect(resolveDefaultLineId(stopT2)).toBe('T2');
    });

    it('falls back to first line if no tram line exists', () => {
      expect(resolveDefaultLineId(mockBusStop)).toBe('L3');
    });

    it('falls back to ALL if no lines attached', () => {
      expect(resolveDefaultLineId(mockLineLessStop)).toBe('ALL');
    });
  });

  describe('getNearestStops', () => {
    it('sorts stops by distance to user and limits results', () => {
      const results = getNearestStops(
        mockDarcyLocation.latitude,
        mockDarcyLocation.longitude,
        ALL_DIJON_STOPS,
        3
      );

      expect(results).toHaveLength(3);
      expect(results[0].distanceMeters).toBeLessThanOrEqual(results[1].distanceMeters);
      expect(results[1].distanceMeters).toBeLessThanOrEqual(results[2].distanceMeters);
      expect(results[0].stop.name).toBe('Darcy');
      expect(results[0].distanceMeters).toBeLessThan(50);
      expect(results[0].formattedDistance).toMatch(/m$/);
    });

    it('handles empty stop lists gracefully', () => {
      const results = getNearestStops(47.32, 5.03, [], 5);
      expect(results).toEqual([]);
    });
  });

  describe('buildQuickControllerPayload', () => {
    it('builds a valid 1-tap controller report payload with STATIONARY quai default', () => {
      const payload = buildQuickControllerPayload(mockStopDarcy, 'T1');

      expect(payload).toEqual({
        type: 'CONTROLLER',
        stopId: 'hub-darcy',
        stopName: 'Darcy',
        lineId: 'T1',
        lineName: 'T1 · Dijon Gare ↔ Quetigny Centre',
        latitude: 47.3235,
        longitude: 5.0335,
        direction: 'À quai (fixe) · Darcy',
        directionTerminus: 'STATIONARY',
        description: undefined,
      });
    });

    it('supports ALL lines with generic name and custom optional note', () => {
      const payload = buildQuickControllerPayload(
        mockStopDarcy,
        'ALL',
        '2 contrôleurs en civil'
      );

      expect(payload.lineId).toBe('ALL');
      expect(payload.lineName).toBe('Toutes lignes');
      expect(payload.directionTerminus).toBe('STATIONARY');
      expect(payload.description).toBe('2 contrôleurs en civil');
    });
  });
});
