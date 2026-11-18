export const ALLOWED_CORS_HEADERS: string[] = [
  'Content-Type',
  'Authorization',
  'Accept',
  'Bypass-Tunnel-Reminder',
  'ngrok-skip-browser-warning',
];

const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';

const DEV_PRIVATE_LAN_ORIGIN_PATTERNS: RegExp[] = [
  new RegExp(`^https?:\\/\\/10\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}(:\\d+)?$`, 'i'),
  new RegExp(`^https?:\\/\\/192\\.168\\.${IPV4_OCTET}\\.${IPV4_OCTET}(:\\d+)?$`, 'i'),
  new RegExp(
    `^https?:\\/\\/172\\.(1[6-9]|2\\d|3[0-1])\\.${IPV4_OCTET}\\.${IPV4_OCTET}(:\\d+)?$`,
    'i'
  ),
];

const DEV_TUNNEL_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/([a-z0-9-]+\.)+lhr\.life(:\d+)?$/i,
  /^https?:\/\/([a-z0-9-]+\.)+loca\.lt(:\d+)?$/i,
  /^https?:\/\/([a-z0-9-]+\.)+ngrok-free\.(app|dev)(:\d+)?$/i,
  /^https?:\/\/([a-z0-9-]+\.)+trycloudflare\.com(:\d+)?$/i,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
  /^exp:\/\/[^\s]+$/i,
  /^exps:\/\/[^\s]+$/i,
  ...DEV_PRIVATE_LAN_ORIGIN_PATTERNS,
];

export interface CorsConfigOptions {
  corsOrigin?: string;
  nodeEnv?: string;
}

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function parseConfiguredOrigins(corsOriginEnv?: string): string[] {
  if (!corsOriginEnv) {
    return [];
  }

  return corsOriginEnv
    .split(',')
    .map(origin => normalizeOrigin(origin))
    .filter(origin => origin.length > 0);
}

/**
 * Validates whether a request Origin is permitted.
 * - Requests without an Origin header (React Native, Expo Go, healthchecks) are always allowed.
 * - Explicitly configured origins in CORS_ORIGIN are allowed (wildcard '*' is ignored in production).
 * - In non-production environments, common development tunnel domains (*.lhr.life, *.loca.lt,
 *   *.ngrok-free.app, exp://*, localhost) are automatically permitted.
 */
export function isOriginAllowed(
  origin: string | undefined,
  options?: CorsConfigOptions
): boolean {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return true;
  }

  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const rawCorsOrigin =
    options?.corsOrigin !== undefined
      ? options.corsOrigin
      : process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || '';
  const configuredOrigins = parseConfiguredOrigins(rawCorsOrigin);

  if (configuredOrigins.some(allowed => allowed !== '*' && allowed === normalizedOrigin)) {
    return true;
  }

  if (isProduction) {
    return false;
  }

  if (configuredOrigins.includes('*')) {
    return true;
  }

  return DEV_TUNNEL_ORIGIN_PATTERNS.some(pattern => pattern.test(normalizedOrigin));
}

export function createCorsOriginHandler(
  options?: CorsConfigOptions
): (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void {
  return (origin, callback) => {
    callback(null, isOriginAllowed(origin, options));
  };
}
