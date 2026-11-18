export const HEADING_MIN_DELTA_DEG = 5;
export const HEADING_THROTTLE_MS = 250;

/**
 * Shortest angular distance in degrees on a 360-degree compass circle (0..180).
 */
export function angularDeltaDegrees(a: number, b: number): number {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

/**
 * Gate high-frequency magnetometer events so tiny jitter (< 5 deg) and rapid bursts
 * (< 250 ms) do not flood React state updates or native MapView animations.
 */
export function shouldAcceptHeadingUpdate(
  prevHeading: number | null | undefined,
  nextHeading: number,
  lastUpdatedAt: number,
  now: number,
  minDeltaDeg: number = HEADING_MIN_DELTA_DEG,
  minIntervalMs: number = HEADING_THROTTLE_MS
): boolean {
  if (prevHeading === null || prevHeading === undefined || Number.isNaN(prevHeading)) {
    return true;
  }
  if (now - lastUpdatedAt < minIntervalMs) {
    return false;
  }
  return angularDeltaDegrees(prevHeading, nextHeading) >= minDeltaDeg;
}
