import { describe, expect, it } from 'vitest';
import { resolveTapCycleTarget } from '../tap-selection';

describe('resolveTapCycleTarget', () => {
  const candidates = [
    { target: { kind: 'wire' as const, wireId: 'w1' }, dist: 1 },
    { target: { kind: 'conduit' as const, conduitId: 'c1' }, dist: 4 },
  ];

  it('selects the nearest target on a fresh tap', () => {
    const result = resolveTapCycleTarget(candidates, null, 100, 200, 1000);
    expect(result.target).toEqual({ kind: 'wire', wireId: 'w1' });
    expect(result.nextState?.index).toBe(0);
  });

  it('cycles to the next target when tapping the same spot again', () => {
    const first = resolveTapCycleTarget(candidates, null, 100, 200, 1000);
    const second = resolveTapCycleTarget(candidates, first.nextState, 102, 201, 1100);
    expect(second.target).toEqual({ kind: 'conduit', conduitId: 'c1' });
    expect(second.nextState?.index).toBe(1);
  });

  it('wraps the cycle back to the first target', () => {
    const first = resolveTapCycleTarget(candidates, null, 100, 200, 1000);
    const second = resolveTapCycleTarget(candidates, first.nextState, 100, 200, 1200);
    const third = resolveTapCycleTarget(candidates, second.nextState, 100, 200, 1300);
    expect(third.target).toEqual({ kind: 'wire', wireId: 'w1' });
  });

  it('starts a new cycle when the tap moves too far', () => {
    const first = resolveTapCycleTarget(candidates, null, 100, 200, 1000);
    const moved = resolveTapCycleTarget(candidates, first.nextState, 150, 200, 1100);
    expect(moved.target).toEqual({ kind: 'wire', wireId: 'w1' });
    expect(moved.nextState?.index).toBe(0);
  });
});
