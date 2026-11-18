import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, io } from '../index';
import { ALLOWED_CORS_HEADERS, isOriginAllowed } from '../utils/corsConfig';

describe('Server Network, Reverse-Proxy & Tunnel CORS Configuration', () => {
  let testServer: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    testServer = http.createServer(app);
    await new Promise<void>(resolve => {
      testServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = testServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    io.close();
    await new Promise<void>(resolve => {
      testServer.close(() => resolve());
    });
  });

  it('enables Express trust proxy (1 hop) before rate limiting', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('includes tunnel bypass headers in CORS allowed headers', () => {
    expect(ALLOWED_CORS_HEADERS).toContain('Bypass-Tunnel-Reminder');
    expect(ALLOWED_CORS_HEADERS).toContain('ngrok-skip-browser-warning');
  });

  it('always allows requests without Origin header (React Native / Expo Go)', () => {
    expect(isOriginAllowed(undefined, { nodeEnv: 'development', corsOrigin: '' })).toBe(true);
    expect(isOriginAllowed(undefined, { nodeEnv: 'production', corsOrigin: 'https://app.diviakhaaa.fr' })).toBe(true);
  });

  it('allows development tunnel domains and exp:// only when NODE_ENV !== production', () => {
    const devOrigins = [
      'https://abc123.lhr.life',
      'https://my-tunnel-42.loca.lt',
      'https://9f21-193-52.ngrok-free.app',
      'exp://192.168.1.42:8081',
      'http://localhost:8081',
    ];

    for (const origin of devOrigins) {
      expect(isOriginAllowed(origin, { nodeEnv: 'development', corsOrigin: '' })).toBe(true);
      expect(isOriginAllowed(origin, { nodeEnv: 'production', corsOrigin: '' })).toBe(false);
    }
  });

  it('rejects spoofed tunnel hostnames and wildcard * in production', () => {
    expect(
      isOriginAllowed('https://abc.lhr.life.attacker.com', { nodeEnv: 'development', corsOrigin: '' })
    ).toBe(false);
    expect(
      isOriginAllowed('https://evil.example.com', { nodeEnv: 'production', corsOrigin: '*' })
    ).toBe(false);
    expect(
      isOriginAllowed('https://app.diviakhaaa.fr', {
        nodeEnv: 'production',
        corsOrigin: 'https://app.diviakhaaa.fr, https://admin.diviakhaaa.fr',
      })
    ).toBe(true);
  });

  it('serves /health and rate-limited /api endpoints cleanly behind X-Forwarded-For proxy headers', async () => {
    const healthRes = await fetch(`${baseUrl}/health`, {
      headers: {
        'X-Forwarded-For': '203.0.113.42',
        'Bypass-Tunnel-Reminder': 'true',
        'ngrok-skip-browser-warning': 'true',
      },
    });
    expect(healthRes.status).toBe(200);
    const healthBody = (await healthRes.json()) as { status: string };
    expect(healthBody.status).toBe('ok');

    const linesRes = await fetch(`${baseUrl}/api/network/lines`, {
      headers: {
        'X-Forwarded-For': '203.0.113.42',
        Origin: 'https://demo123.lhr.life',
        'Bypass-Tunnel-Reminder': 'true',
        'ngrok-skip-browser-warning': 'true',
      },
    });
    expect(linesRes.status).toBe(200);
    expect(linesRes.headers.get('access-control-allow-origin')).toBe('https://demo123.lhr.life');
  });
});
