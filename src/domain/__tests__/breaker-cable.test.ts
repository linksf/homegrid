import { describe, expect, it } from 'vitest';
import {
  breakerCableClosed,
  directionForBreakerWire,
  isBreakerCable,
  toggleBreakerCableClosed,
} from '../breaker-cable';
import type { Cable } from '../types';

describe('isBreakerCable', () => {
  it('returns true when role is breaker', () => {
    const c: Cable = { id: '1', junctionBoxId: 'b', anchor: 'center', wireIds: [], role: 'breaker' };
    expect(isBreakerCable(c)).toBe(true);
  });

  it('returns false for junction cables', () => {
    const c: Cable = { id: '1', junctionBoxId: 'b', anchor: 'center', wireIds: [] };
    expect(isBreakerCable(c)).toBe(false);
  });
});

describe('breakerCableClosed', () => {
  it('defaults to true when closed omitted', () => {
    expect(
      breakerCableClosed({ id: '1', junctionBoxId: 'b', anchor: 'center', wireIds: [], role: 'breaker' }),
    ).toBe(true);
  });
});

describe('toggleBreakerCableClosed', () => {
  it('flips closed state', () => {
    const c: Cable = {
      id: '1',
      junctionBoxId: 'b',
      anchor: 'center',
      wireIds: [],
      role: 'breaker',
      closed: true,
    };
    expect(toggleBreakerCableClosed(c).closed).toBe(false);
  });
});

describe('directionForBreakerWire', () => {
  it('maps black/red away and white toward', () => {
    expect(directionForBreakerWire('black')).toBe('away');
    expect(directionForBreakerWire('red')).toBe('away');
    expect(directionForBreakerWire('white')).toBe('toward');
  });
});
