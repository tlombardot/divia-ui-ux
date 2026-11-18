import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiService,
  buildApiDiagnosticMessage,
  cleanApiUrl,
  DEFAULT_API_TIMEOUT_MS,
  extractHostFromExpoUri,
  getBaseApiUrl,
  resetLoggedBackendUrl,
  resolveExpoLanHost,
  TUNNEL_BYPASS_HEADERS,
} from '../services/apiService';
import { buildSocketOptions } from '../services/socketService';

describe('Mobile API & Socket Tunnel Resilience', () => {
  const originalEnvApiUrl = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    resetLoggedBackendUrl();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnvApiUrl === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL;
    } else {
      process.env.EXPO_PUBLIC_API_URL = originalEnvApiUrl;
    }
  });

  it('cleans EXPO_PUBLIC_API_URL by trimming spaces and removing trailing slashes', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(cleanApiUrl('  https://abc123.lhr.life///  ')).toBe('https://abc123.lhr.life');

    process.env.EXPO_PUBLIC_API_URL = '  https://my-tunnel.loca.lt/  ';
    expect(getBaseApiUrl()).toBe('https://my-tunnel.loca.lt');

    process.env.EXPO_PUBLIC_API_URL = '   ';
    // Blank EXPO_PUBLIC_API_URL falls back to mocked expo-constants hostUri (192.168.1.50:8081)
    expect(getBaseApiUrl()).toBe('http://192.168.1.50:3000');
    expect(logSpy).toHaveBeenCalledWith('[Network] Backend cible : http://192.168.1.50:3000');
  });

  it('extracts local LAN IPv4 from expoConfig.hostUri or manifest2.extra.expoGo.debuggerHost', () => {
    expect(extractHostFromExpoUri('10.21.40.29:8081')).toBe('10.21.40.29');
    expect(extractHostFromExpoUri('exp://192.168.1.42:8081')).toBe('192.168.1.42');
    expect(extractHostFromExpoUri('')).toBeNull();

    expect(
      resolveExpoLanHost({
        expoConfig: null,
        manifest2: { extra: { expoGo: { debuggerHost: '10.21.40.29:8081' } } },
      })
    ).toBe('10.21.40.29');

    expect(
      resolveExpoLanHost({
        expoConfig: { hostUri: '192.168.0.15:8081' },
        manifest2: { extra: { expoGo: { debuggerHost: '10.0.0.2:8081' } } },
      })
    ).toBe('192.168.0.15');
  });

  it('sends localtunnel & ngrok bypass headers and AbortSignal on API fetch calls', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://demo123.lhr.life/';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ reports: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService();
    const reports = await service.fetchReports();

    expect(reports).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://demo123.lhr.life/api/reports');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      ...TUNNEL_BYPASS_HEADERS,
    });
  });

  it('produces explicit diagnostic errors with exact server URL on 502 and AbortError timeout', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://broken.lhr.life';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers({ 'content-type': 'text/plain' }),
      })
    );

    const service = new ApiService();
    const routes = await service.fetchRoutes(47.32, 5.03, 47.33, 5.05);

    expect(routes).toEqual([]);
    expect(service.getLastError()).toContain('https://broken.lhr.life');
    expect(service.getLastError()).toContain('HTTP 502');
    expect(service.getLastError()).toContain('3000');
    expect(warnSpy).toHaveBeenCalled();

    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    const timeoutMsg = buildApiDiagnosticMessage('https://slow.loca.lt', abortErr);
    expect(timeoutMsg).toContain('https://slow.loca.lt');
    expect(timeoutMsg).toContain(`${DEFAULT_API_TIMEOUT_MS / 1000}s`);
    expect(timeoutMsg).toContain('3000');
  });

  it('detects HTML tunnel warning pages instead of crashing JSON.parse', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://warn.loca.lt';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      })
    );

    const service = new ApiService();
    const shapes = await service.fetchNetworkShapes();
    expect(shapes).toBeNull();
    expect(service.getLastError()).toContain('HTML');
    expect(service.getLastError()).toContain('https://warn.loca.lt');
  });

  it('configures Socket.io with websocket+polling fallback and tunnel bypass extraHeaders', () => {
    const opts = buildSocketOptions();
    expect(opts.transports).toEqual(['websocket', 'polling']);
    expect(opts.extraHeaders).toMatchObject({
      'Bypass-Tunnel-Reminder': 'true',
      'ngrok-skip-browser-warning': 'true',
    });
    expect(opts.timeout).toBe(DEFAULT_API_TIMEOUT_MS);
  });
});
