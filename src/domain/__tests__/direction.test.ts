import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import type { Breaker, Diagram, Wire, WireLink } from '../types';

function wire(overrides: Partial<Wire> & Pick<Wire, 'id'>): Wire {
  return {
    color: 'black',
    label: '',
    conduitId: null,
    breakerId: null,
    hubId: null,
    deviceNodeId: null,
    manualDirection: null,
    ...overrides,
  };
}

function diagram(overrides: Partial<Diagram>): Diagram {
  return {
    junctionBoxes: [],
    breakers: [],
    conduits: [],
    wires: [],
    hubs: [],
    hubBridges: [],
    lightBulbs: [],
    switches: [],
    deviceNodes: [],
    wireLinks: [],
    layout: { conduitPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} },
    ...overrides,
  };
}

describe('resolveDirections', () => {
  it('seeds breaker black away and white toward', () => {
    const bId = 'br1';
    const blackId = 'bw-b';
    const whiteId = 'bw-w';
    const breaker: Breaker = {
      id: bId,
      junctionBoxId: 'jb1',
      label: 'B1',
      blackWireId: blackId,
      whiteWireId: whiteId,
    };
    const d = diagram({
      breakers: [breaker],
      wires: [
        wire({ id: blackId, color: 'black', breakerId: bId }),
        wire({ id: whiteId, color: 'white', breakerId: bId }),
      ],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(blackId)?.resolvedDirection).toBe('away');
    expect(resolved.get(blackId)?.directionSource).toBe('breaker');
    expect(resolved.get(whiteId)?.resolvedDirection).toBe('toward');
    expect(resolved.get(whiteId)?.directionSource).toBe('breaker');
    expect(resolved.get(blackId)?.directionConflict).toBe(false);
    expect(resolved.get(whiteId)?.directionConflict).toBe(false);
  });

  it('propagates direction across a wire link', () => {
    const bId = 'br1';
    const whiteId = 'bw-w';
    const remoteId = 'w-remote';
    const breaker: Breaker = {
      id: bId,
      junctionBoxId: 'jb1',
      label: 'B1',
      blackWireId: 'bw-b',
      whiteWireId: whiteId,
    };
    const link: WireLink = {
      id: 'link1',
      wireIdA: remoteId,
      wireIdB: whiteId,
      whiteMismatchWarning: false,
    };
    const d = diagram({
      breakers: [breaker],
      wires: [
        wire({ id: 'bw-b', color: 'black', breakerId: bId }),
        wire({ id: whiteId, color: 'white', breakerId: bId }),
        wire({ id: remoteId, color: 'red', conduitId: 'c1' }),
      ],
      wireLinks: [link],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(remoteId)?.resolvedDirection).toBe('away');
    expect(resolved.get(remoteId)?.directionSource).toBe('propagated');
    expect(resolved.get(remoteId)?.directionConflict).toBe(false);
  });

  it('inverts direction across a wire link from breaker black', () => {
    const blackId = 'bw-b';
    const remoteId = 'w-remote';
    const d = diagram({
      breakers: [
        {
          id: 'br1',
          junctionBoxId: 'jb1',
          label: '',
          blackWireId: blackId,
          whiteWireId: 'bw-w',
        },
      ],
      wires: [
        wire({ id: blackId, color: 'black', breakerId: 'br1' }),
        wire({ id: 'bw-w', color: 'white', breakerId: 'br1' }),
        wire({ id: remoteId, color: 'red', conduitId: 'c1' }),
      ],
      wireLinks: [{ id: 'l1', wireIdA: blackId, wireIdB: remoteId, whiteMismatchWarning: true }],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(blackId)?.resolvedDirection).toBe('away');
    expect(resolved.get(remoteId)?.resolvedDirection).toBe('toward');
  });

  it('sets directionConflict when linked wires have incompatible manual seeds', () => {
    const w1 = 'w1';
    const w2 = 'w2';
    const link: WireLink = {
      id: 'link1',
      wireIdA: w1,
      wireIdB: w2,
      whiteMismatchWarning: false,
    };
    const d = diagram({
      wires: [
        wire({ id: w1, color: 'red', conduitId: 'c1', manualDirection: 'toward' }),
        wire({ id: w2, color: 'red', conduitId: 'c1', manualDirection: 'toward' }),
      ],
      wireLinks: [link],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(w1)?.directionConflict).toBe(true);
    expect(resolved.get(w2)?.directionConflict).toBe(true);
  });

  it('ignores manualDirection on breaker-locked wires', () => {
    const bId = 'br1';
    const blackId = 'bw-b';
    const breaker: Breaker = {
      id: bId,
      junctionBoxId: 'jb1',
      label: 'B1',
      blackWireId: blackId,
      whiteWireId: 'bw-w',
    };
    const d = diagram({
      breakers: [breaker],
      wires: [
        wire({
          id: blackId,
          color: 'black',
          breakerId: bId,
          manualDirection: 'toward',
        }),
        wire({ id: 'bw-w', color: 'white', breakerId: bId }),
      ],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(blackId)?.resolvedDirection).toBe('away');
    expect(resolved.get(blackId)?.directionSource).toBe('breaker');
    expect(resolved.get(blackId)?.directionConflict).toBe(false);
  });
});
