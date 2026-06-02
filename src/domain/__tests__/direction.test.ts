import { describe, expect, it } from 'vitest';
import { flipSwitchPosition } from '../device-mutations';
import { resolveDirections } from '../direction';
import type { Breaker, Cable, ConduitRun, Diagram, Wire, WireLink } from '../types';

function wire(overrides: Partial<Wire> & Pick<Wire, 'id'>): Wire {
  return {
    color: 'black',
    label: '',
    conduitId: null,
    cableId: null,
    breakerId: null,
    hubId: null,
    deviceNodeId: null,
    manualDirection: null,
    ...overrides,
  };
}

function diagram(overrides: Partial<Diagram>): Diagram {
  return {
    rooms: [],
    junctionBoxes: [],
    breakers: [],
    conduits: [],
    wires: [],
    hubs: [],
    hubBridges: [],
    lightBulbs: [],
    switches: [],
    dimmerSwitches: [],
    outlets: [],
    deviceNodes: [],
    wireLinks: [],
    cables: [],
    conduitRuns: [],
    layout: { conduitPaths: {}, conduitRunPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} },
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
      endpointA: 'end',
      wireIdB: whiteId,
      endpointB: 'end',
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

  it('inverts direction through a conduit run', () => {
    const breakerCableId = 'bc1';
    const cableId = 'cab1';

    const run: ConduitRun = {
      id: 'run1',
      cableIdA: cableId,
      cableIdB: breakerCableId,
      wireIds: ['w-cab-b', 'w-bc-b', 'w-cab-w', 'w-bc-w'],
    };

    const cab: Cable = {
      id: cableId,
      junctionBoxId: 'jb-feed',
      anchor: 'middle-left',
      wireIds: ['w-cab-b', 'w-cab-w'],
    };

    const breakerCable: Cable = {
      id: breakerCableId,
      junctionBoxId: 'jb-panel',
      anchor: 'middle-left',
      wireIds: ['w-bc-b', 'w-bc-w'],
      role: 'breaker',
      closed: true,
    };

    const d = diagram({
      cables: [cab, breakerCable],
      conduitRuns: [run],
      wires: [
        wire({ id: 'w-bc-b', color: 'black', cableId: breakerCableId }),
        wire({ id: 'w-bc-w', color: 'white', cableId: breakerCableId }),
        wire({ id: 'w-cab-b', color: 'black', cableId }),
        wire({ id: 'w-cab-w', color: 'white', cableId }),
      ],
    });

    const resolved = resolveDirections(d);
    expect(resolved.get('w-cab-b')?.resolvedDirection).toBe('toward');
    expect(resolved.get('w-cab-w')?.resolvedDirection).toBe('away');
    expect(resolved.get('w-cab-b')?.directionSource).toBe('propagated');
    expect(resolved.get('w-cab-w')?.directionSource).toBe('propagated');
    expect(resolved.get('w-cab-b')?.directionConflict).toBe(false);
  });

  it('inverts direction across a chain of two conduit runs', () => {
    const runA: ConduitRun = {
      id: 'run-a',
      cableIdA: 'cab-mid',
      cableIdB: 'cab-panel',
      wireIds: ['w-mid-b', 'w-panel-b', 'w-mid-w', 'w-panel-w'],
    };
    const runB: ConduitRun = {
      id: 'run-b',
      cableIdA: 'cab-load',
      cableIdB: 'cab-mid',
      wireIds: ['w-load-b', 'w-mid-b', 'w-load-w', 'w-mid-w'],
    };

    const d = diagram({
      cables: [
        {
          id: 'cab-panel',
          junctionBoxId: 'jb-panel',
          anchor: 'middle-left',
          wireIds: ['w-panel-b', 'w-panel-w'],
          role: 'breaker',
          closed: true,
        },
        {
          id: 'cab-mid',
          junctionBoxId: 'jb-mid',
          anchor: 'middle-left',
          wireIds: ['w-mid-b', 'w-mid-w'],
        },
        {
          id: 'cab-load',
          junctionBoxId: 'jb-load',
          anchor: 'middle-left',
          wireIds: ['w-load-b', 'w-load-w'],
        },
      ],
      conduitRuns: [runA, runB],
      wires: [
        wire({ id: 'w-panel-b', color: 'black', cableId: 'cab-panel' }),
        wire({ id: 'w-panel-w', color: 'white', cableId: 'cab-panel' }),
        wire({ id: 'w-mid-b', color: 'black', cableId: 'cab-mid' }),
        wire({ id: 'w-mid-w', color: 'white', cableId: 'cab-mid' }),
        wire({ id: 'w-load-b', color: 'black', cableId: 'cab-load' }),
        wire({ id: 'w-load-w', color: 'white', cableId: 'cab-load' }),
      ],
    });

    const resolved = resolveDirections(d);
    expect(resolved.get('w-panel-b')?.resolvedDirection).toBe('away');
    expect(resolved.get('w-mid-b')?.resolvedDirection).toBe('toward');
    expect(resolved.get('w-load-b')?.resolvedDirection).toBe('away');
  });

  it('open breaker cable does not seed direction or propagate through conduit run', () => {
    const breakerCableId = 'bc1';
    const cableId = 'cab1';

    const run: ConduitRun = {
      id: 'run1',
      cableIdA: cableId,
      cableIdB: breakerCableId,
      wireIds: ['w-cab-b', 'w-bc-b', 'w-cab-w', 'w-bc-w'],
    };

    const d = diagram({
      cables: [
        {
          id: cableId,
          junctionBoxId: 'jb-feed',
          anchor: 'middle-left',
          wireIds: ['w-cab-b', 'w-cab-w'],
        },
        {
          id: breakerCableId,
          junctionBoxId: 'jb-panel',
          anchor: 'middle-left',
          wireIds: ['w-bc-b', 'w-bc-w'],
          role: 'breaker',
          closed: false,
        },
      ],
      conduitRuns: [run],
      wires: [
        wire({ id: 'w-bc-b', color: 'black', cableId: breakerCableId }),
        wire({ id: 'w-bc-w', color: 'white', cableId: breakerCableId }),
        wire({ id: 'w-cab-b', color: 'black', cableId }),
        wire({ id: 'w-cab-w', color: 'white', cableId }),
      ],
    });

    const resolved = resolveDirections(d);
    expect(resolved.get('w-bc-b')?.resolvedDirection).toBeNull();
    expect(resolved.get('w-bc-w')?.resolvedDirection).toBeNull();
    expect(resolved.get('w-cab-b')?.resolvedDirection).toBeNull();
    expect(resolved.get('w-cab-w')?.resolvedDirection).toBeNull();
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
      wireLinks: [{
        id: 'l1',
        wireIdA: blackId,
        endpointA: 'end',
        wireIdB: remoteId,
        endpointB: 'end',
      }],
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
      endpointA: 'end',
      wireIdB: w2,
      endpointB: 'end',
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

  it('seeds breaker cable red away and white toward', () => {
    const blackId = 'bw-b';
    const whiteId = 'bw-w';
    const redId = 'bw-r';
    const cableId = 'bc1';
    const d = diagram({
      cables: [
        {
          id: cableId,
          junctionBoxId: 'jb1',
          anchor: 'middle-left',
          wireIds: [whiteId, blackId, redId],
          role: 'breaker',
          closed: true,
        },
      ],
      wires: [
        wire({ id: whiteId, color: 'white', cableId }),
        wire({ id: blackId, color: 'black', cableId }),
        wire({ id: redId, color: 'red', cableId }),
      ],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(blackId)?.resolvedDirection).toBe('away');
    expect(resolved.get(redId)?.resolvedDirection).toBe('away');
    expect(resolved.get(whiteId)?.resolvedDirection).toBe('toward');
    expect(resolved.get(redId)?.directionSource).toBe('breaker');
  });

  it('propagates direction across a closed single-pole switch', () => {
    const hotId = 'hot';
    const loadId = 'load';
    const commonNode = 'n-common';
    const loadNode = 'n-load';
    const d = diagram({
      switches: [
        {
          id: 'sw1',
          label: '',
          x: 0,
          y: 0,
          width: 96,
          height: 48,
          terminalCount: 2,
          position: 'closed',
        },
      ],
      deviceNodes: [
        { id: commonNode, deviceKind: 'switch', deviceId: 'sw1', slot: 0 },
        { id: loadNode, deviceKind: 'switch', deviceId: 'sw1', slot: 1 },
      ],
      conduits: [
        {
          id: 'c-hot',
          kind: 'device',
          label: '',
          deviceNodeId: commonNode,
          wireIds: [hotId],
        },
        {
          id: 'c-load',
          kind: 'device',
          label: '',
          deviceNodeId: loadNode,
          wireIds: [loadId],
        },
      ],
      wires: [
        wire({ id: hotId, color: 'black', conduitId: 'c-hot', manualDirection: 'toward' }),
        wire({ id: loadId, color: 'black', conduitId: 'c-load' }),
      ],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(hotId)?.resolvedDirection).toBe('toward');
    expect(resolved.get(loadId)?.resolvedDirection).toBe('away');
    expect(resolved.get(loadId)?.directionSource).toBe('propagated');
  });

  it('propagates direction through a three-way switch on the active traveler only', () => {
    const hotId = 'hot';
    const travelerAId = 'ta';
    const travelerBId = 'tb';
    const commonNode = 'n-common';
    const nodeA = 'n-a';
    const nodeB = 'n-b';
    const base = {
      switches: [
        {
          id: 'sw3',
          label: '',
          x: 0,
          y: 0,
          width: 96,
          height: 48,
          terminalCount: 3 as const,
          position: 'travelerA' as const,
        },
      ],
      deviceNodes: [
        { id: commonNode, deviceKind: 'switch' as const, deviceId: 'sw3', slot: 0 },
        { id: nodeA, deviceKind: 'switch' as const, deviceId: 'sw3', slot: 1 },
        { id: nodeB, deviceKind: 'switch' as const, deviceId: 'sw3', slot: 2 },
      ],
      conduits: [
        {
          id: 'c-hot',
          kind: 'device' as const,
          label: '',
          deviceNodeId: commonNode,
          wireIds: [hotId],
        },
        {
          id: 'c-a',
          kind: 'device' as const,
          label: '',
          deviceNodeId: nodeA,
          wireIds: [travelerAId],
        },
        {
          id: 'c-b',
          kind: 'device' as const,
          label: '',
          deviceNodeId: nodeB,
          wireIds: [travelerBId],
        },
      ],
      wires: [
        wire({ id: hotId, color: 'black', conduitId: 'c-hot', manualDirection: 'toward' }),
        wire({ id: travelerAId, color: 'red', conduitId: 'c-a' }),
        wire({ id: travelerBId, color: 'red', conduitId: 'c-b' }),
      ],
    };

    const resolvedA = resolveDirections(diagram(base));
    expect(resolvedA.get(travelerAId)?.resolvedDirection).toBe('away');
    expect(resolvedA.get(travelerBId)?.resolvedDirection).toBeNull();

    const resolvedB = resolveDirections(
      diagram({
        ...base,
        switches: [{ ...base.switches[0]!, position: 'travelerB' }],
      }),
    );
    expect(resolvedB.get(travelerBId)?.resolvedDirection).toBe('away');
    expect(resolvedB.get(travelerAId)?.resolvedDirection).toBeNull();
  });

  it('moves three-way direction off inactive traveler when toggled, even with a shared hub', () => {
    const hotId = 'hot';
    const travelerAId = 'ta';
    const travelerBId = 'tb';
    const commonNode = 'n-common';
    const nodeA = 'n-a';
    const nodeB = 'n-b';
    const hubId = 'hub-sw';
    const base = {
      switches: [
        {
          id: 'sw3',
          label: '',
          x: 0,
          y: 0,
          width: 96,
          height: 48,
          terminalCount: 3 as const,
          position: 'travelerA' as const,
        },
      ],
      deviceNodes: [
        { id: commonNode, deviceKind: 'switch' as const, deviceId: 'sw3', slot: 0 },
        { id: nodeA, deviceKind: 'switch' as const, deviceId: 'sw3', slot: 1 },
        { id: nodeB, deviceKind: 'switch' as const, deviceId: 'sw3', slot: 2 },
      ],
      hubs: [{ id: hubId, junctionBoxId: 'jb1', label: '', slot: 0 as const }],
      conduits: [
        {
          id: 'c-hot',
          kind: 'device' as const,
          label: '',
          deviceNodeId: commonNode,
          wireIds: [hotId],
        },
        {
          id: 'c-a',
          kind: 'device' as const,
          label: '',
          deviceNodeId: nodeA,
          wireIds: [travelerAId],
        },
        {
          id: 'c-b',
          kind: 'device' as const,
          label: '',
          deviceNodeId: nodeB,
          wireIds: [travelerBId],
        },
      ],
      wires: [
        wire({ id: hotId, color: 'black', conduitId: 'c-hot', hubId, manualDirection: 'toward' }),
        wire({ id: travelerAId, color: 'red', conduitId: 'c-a', hubId }),
        wire({ id: travelerBId, color: 'red', conduitId: 'c-b', hubId }),
      ],
    };

    const resolvedA = resolveDirections(diagram(base));
    expect(resolvedA.get(travelerAId)?.resolvedDirection).toBe('away');
    expect(resolvedA.get(travelerBId)?.resolvedDirection).toBeNull();

    const toggled = flipSwitchPosition(
      diagram(base),
      'sw3',
    );
    const resolvedB = resolveDirections(toggled);
    expect(resolvedB.get(travelerBId)?.resolvedDirection).toBe('away');
    expect(resolvedB.get(travelerAId)?.resolvedDirection).toBeNull();
  });

  it('inverts direction through a hub splice', () => {
    const feedId = 'feed';
    const branchAId = 'branch-a';
    const branchBId = 'branch-b';
    const hubId = 'hub1';
    const d = diagram({
      hubs: [{ id: hubId, junctionBoxId: 'jb1', label: '', slot: 0 as const }],
      conduits: [
        {
          id: 'c-feed',
          kind: 'local' as const,
          label: '',
          junctionBoxId: 'jb1',
          anchor: 'middle-left',
          wireIds: [feedId],
        },
        {
          id: 'c-a',
          kind: 'local' as const,
          label: '',
          junctionBoxId: 'jb1',
          anchor: 'middle-right',
          wireIds: [branchAId],
        },
        {
          id: 'c-b',
          kind: 'local' as const,
          label: '',
          junctionBoxId: 'jb1',
          anchor: 'bottom-center',
          wireIds: [branchBId],
        },
      ],
      wires: [
        wire({ id: feedId, color: 'black', conduitId: 'c-feed', hubId, manualDirection: 'toward' }),
        wire({ id: branchAId, color: 'black', conduitId: 'c-a', hubId }),
        wire({ id: branchBId, color: 'black', conduitId: 'c-b', hubId }),
      ],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(feedId)?.resolvedDirection).toBe('toward');
    expect(resolved.get(branchAId)?.resolvedDirection).toBe('away');
    expect(resolved.get(branchBId)?.resolvedDirection).toBe('away');
  });

  it('propagates from breaker through a closed switch to the load side', () => {
    const hotId = 'hot';
    const loadId = 'load';
    const feedId = 'feed';
    const commonNode = 'n-common';
    const loadNode = 'n-load';
    const d = diagram({
      breakers: [
        {
          id: 'br1',
          junctionBoxId: 'jb1',
          label: '',
          blackWireId: feedId,
          whiteWireId: 'w-w',
        },
      ],
      switches: [
        {
          id: 'sw1',
          label: '',
          x: 0,
          y: 0,
          width: 96,
          height: 48,
          terminalCount: 2,
          position: 'closed',
        },
      ],
      deviceNodes: [
        { id: commonNode, deviceKind: 'switch', deviceId: 'sw1', slot: 0 },
        { id: loadNode, deviceKind: 'switch', deviceId: 'sw1', slot: 1 },
      ],
      conduits: [
        {
          id: 'c-hot',
          kind: 'device',
          label: '',
          deviceNodeId: commonNode,
          wireIds: [hotId],
        },
        {
          id: 'c-load',
          kind: 'device',
          label: '',
          deviceNodeId: loadNode,
          wireIds: [loadId],
        },
      ],
      wires: [
        wire({ id: feedId, color: 'black', breakerId: 'br1' }),
        wire({ id: 'w-w', color: 'white', breakerId: 'br1' }),
        wire({ id: hotId, color: 'black', conduitId: 'c-hot' }),
        wire({ id: loadId, color: 'black', conduitId: 'c-load' }),
      ],
      wireLinks: [
        {
          id: 'l1',
          wireIdA: feedId,
          endpointA: 'end',
          wireIdB: hotId,
          endpointB: 'end',
        },
      ],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(hotId)?.resolvedDirection).toBe('toward');
    expect(resolved.get(loadId)?.resolvedDirection).toBe('away');
  });

  it('does not propagate direction through an open single-pole switch', () => {
    const hotId = 'hot';
    const loadId = 'load';
    const commonNode = 'n-common';
    const loadNode = 'n-load';
    const d = diagram({
      switches: [
        {
          id: 'sw1',
          label: '',
          x: 0,
          y: 0,
          width: 96,
          height: 48,
          terminalCount: 2,
          position: 'open',
        },
      ],
      deviceNodes: [
        { id: commonNode, deviceKind: 'switch', deviceId: 'sw1', slot: 0 },
        { id: loadNode, deviceKind: 'switch', deviceId: 'sw1', slot: 1 },
      ],
      conduits: [
        {
          id: 'c-hot',
          kind: 'device',
          label: '',
          deviceNodeId: commonNode,
          wireIds: [hotId],
        },
        {
          id: 'c-load',
          kind: 'device',
          label: '',
          deviceNodeId: loadNode,
          wireIds: [loadId],
        },
      ],
      wires: [
        wire({ id: hotId, color: 'black', conduitId: 'c-hot', manualDirection: 'toward' }),
        wire({ id: loadId, color: 'black', conduitId: 'c-load' }),
      ],
    });
    const resolved = resolveDirections(d);
    expect(resolved.get(hotId)?.resolvedDirection).toBe('toward');
    expect(resolved.get(loadId)?.resolvedDirection).toBeNull();
  });
});
