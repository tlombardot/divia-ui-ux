import { describe, expect, it } from 'vitest';
import {
  angularDeltaDegrees,
  HEADING_MIN_DELTA_DEG,
  HEADING_THROTTLE_MS,
  shouldAcceptHeadingUpdate,
} from '../utils/headingUtils';

describe('headingUtils — Compass Throttling & Angular Dead-Band', () => {
  it('computes shortest angular delta across 0/360 degree wraparound', () => {
    expect(angularDeltaDegrees(10, 15)).toBe(5);
    expect(angularDeltaDegrees(358, 2)).toBe(4);
    expect(angularDeltaDegrees(2, 358)).toBe(4);
    expect(angularDeltaDegrees(0, 180)).toBe(180);
    expect(angularDeltaDegrees(90, 270)).toBe(180);
  });

  it('always accepts the first heading when previous heading is missing', () => {
    expect(shouldAcceptHeadingUpdate(undefined, 42, 0, 100)).toBe(true);
    expect(shouldAcceptHeadingUpdate(null, 0, 0, 100)).toBe(true);
  });

  it('rejects small sensor jitter below HEADING_MIN_DELTA_DEG even after throttle window', () => {
    expect(
      shouldAcceptHeadingUpdate(90, 92, 1000, 1000 + HEADING_THROTTLE_MS + 100)
    ).toBe(false);
    expect(
      shouldAcceptHeadingUpdate(359, 1, 1000, 1000 + HEADING_THROTTLE_MS + 100)
    ).toBe(false);
  });

  it('rejects rapid updates inside HEADING_THROTTLE_MS even for large rotations', () => {
    expect(shouldAcceptHeadingUpdate(90, 130, 1000, 1050)).toBe(false);
  });

  it('accepts meaningful rotation >= HEADING_MIN_DELTA_DEG once throttle window elapsed', () => {
    expect(
      shouldAcceptHeadingUpdate(
        90,
        90 + HEADING_MIN_DELTA_DEG,
        1000,
        1000 + HEADING_THROTTLE_MS
      )
    ).toBe(true);
    expect(
      shouldAcceptHeadingUpdate(358, 5, 1000, 1000 + HEADING_THROTTLE_MS)
    ).toBe(true);
  });
});
