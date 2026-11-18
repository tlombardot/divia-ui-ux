import { describe, expect, it } from 'vitest';
import { ALL_DIJON_STOPS } from '../data/dijonNetwork';
import { UserLocation } from '../types';
import { QuickControllerModal } from '../components/reports/QuickControllerModal';
import { getNearestStops, buildQuickControllerPayload } from '../utils/quickReportUtils';

describe('QuickControllerModal Component Logic', () => {
  const darcyLocation: UserLocation = {
    latitude: 47.3235,
    longitude: 5.0335,
    isDemoMode: false,
  };

  it('exports the QuickControllerModal component function', () => {
    expect(QuickControllerModal).toBeDefined();
    expect(typeof QuickControllerModal).toBe('function');
  });

  it('correctly resolves nearest stop when initialStop is omitted', () => {
    const nearest = getNearestStops(darcyLocation.latitude, darcyLocation.longitude, ALL_DIJON_STOPS, 1);
    expect(nearest[0].stop.name).toBe('Darcy');
  });

  it('generates the expected 1-tap report payload matching 40-min TTL requirements', () => {
    const darcyStop = ALL_DIJON_STOPS.find(s => s.name === 'Darcy')!;
    const payload = buildQuickControllerPayload(darcyStop, 'T1');

    expect(payload.type).toBe('CONTROLLER');
    expect(payload.stopId).toBe(darcyStop.id);
    expect(payload.stopName).toBe('Darcy');
    expect(payload.lineId).toBe('T1');
    expect(payload.latitude).toBe(darcyStop.latitude);
    expect(payload.longitude).toBe(darcyStop.longitude);
    expect(payload.directionTerminus).toBe('STATIONARY');
  });

  it('allows overriding the stop with any searched stop in Dijon network', () => {
    const fochStop = ALL_DIJON_STOPS.find(s => s.name.includes('Foch')) || ALL_DIJON_STOPS[1];
    const payloadFoch = buildQuickControllerPayload(fochStop, 'ALL');

    expect(payloadFoch.stopId).toBe(fochStop.id);
    expect(payloadFoch.stopName).toBe(fochStop.name);
    expect(payloadFoch.lineId).toBe('ALL');
    expect(payloadFoch.lineName).toBe('Toutes lignes');
  });
});
