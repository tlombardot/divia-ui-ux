import { describe, expect, it } from 'vitest';
import { ActiveTripBottomSheet } from '../components/navigation/ActiveTripBottomSheet';
import { RouteTimelineContent } from '../components/sheet/RouteTimelineContent';
import { getTripStepStatus } from '../utils/routeTimelineUtils';

describe('Active Trip Details & Live Step Status', () => {
  it('classifies each segment as completed, current, or upcoming during active navigation', () => {
    expect(getTripStepStatus(0, 1)).toBe('completed');
    expect(getTripStepStatus(1, 1)).toBe('current');
    expect(getTripStepStatus(2, 1)).toBe('upcoming');
    expect(getTripStepStatus(0, undefined)).toBe('upcoming');
  });

  it('exports ActiveTripBottomSheet and RouteTimelineContent cleanly for embedded navigation details', () => {
    expect(ActiveTripBottomSheet).toBeDefined();
    expect(typeof ActiveTripBottomSheet).toBe('function');
    expect(RouteTimelineContent).toBeDefined();
    expect(typeof RouteTimelineContent).toBe('function');
  });
});
