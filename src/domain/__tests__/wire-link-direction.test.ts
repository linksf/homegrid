import { describe, expect, it } from 'vitest';
import { wireLinkFlowDirection } from '../wire-link-utils';
import type { WireLink } from '../types';

function link(overrides: Partial<WireLink> & Pick<WireLink, 'wireIdA' | 'wireIdB'>): WireLink {
  return {
    id: 'l1',
    endpointA: 'end',
    endpointB: 'end',
    ...overrides,
  };
}

describe('wireLinkFlowDirection', () => {
  it('shows flow along the link when only wire A feeds it', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'hot', wireIdB: 'load' }),
      { resolvedDirection: 'away' },
      undefined,
    );
    expect(result).toEqual({ direction: 'away', conflict: false });
  });

  it('maps wire B end-endpoint flow onto the link orientation', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'hot', wireIdB: 'load' }),
      undefined,
      { resolvedDirection: 'toward' },
    );
    expect(result).toEqual({ direction: 'away', conflict: false });
  });

  it('accounts for a start-endpoint link on wire A', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'return', wireIdB: 'load', endpointA: 'start' }),
      { resolvedDirection: 'toward' },
      undefined,
    );
    expect(result).toEqual({ direction: 'away', conflict: false });
  });

  it('flags conflict when both wires push flow into the link', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'a', wireIdB: 'b' }),
      { resolvedDirection: 'away' },
      { resolvedDirection: 'away' },
    );
    expect(result.direction).toBe('away');
    expect(result.conflict).toBe(true);
  });
});
