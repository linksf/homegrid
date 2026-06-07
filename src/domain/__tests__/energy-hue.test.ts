import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import { ENERGY_HUE_LEVELS, resolveEnergyHue } from '../energy-hue';
import type { Diagram, Hub, Wire, WireLink } from '../types';

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

describe('resolveEnergyHue', () => {
  it('starts at hue 0 on breaker hot and neutral wires', () => {
    const bId = 'br1';
    const blackId = 'bw-b';
    const whiteId = 'bw-w';
    const d = diagram({
      breakers: [
        {
          id: bId,
          junctionBoxId: 'jb1',
          label: 'B1',
          blackWireId: blackId,
          whiteWireId: whiteId,
        },
      ],
      wires: [
        wire({ id: blackId, color: 'black', breakerId: bId }),
        wire({ id: whiteId, color: 'white', breakerId: bId }),
      ],
    });
    const resolved = resolveDirections(d);
    const hues = resolveEnergyHue(d, resolved);
    expect(hues.get(blackId)).toBe(0);
    expect(hues.get(whiteId)).toBe(0);
  });

  it('assigns the same next hue to sibling branches from one wire', () => {
    const bId = 'br1';
    const hotId = 'hot';
    const inId = 'w-in';
    const outA = 'w-a';
    const outB = 'w-b';
    const hub: Hub = { id: 'hub1', junctionBoxId: 'jb1', label: 'H', slot: 0 };
    const d = diagram({
      breakers: [
        {
          id: bId,
          junctionBoxId: 'jb1',
          label: 'B1',
          blackWireId: hotId,
          whiteWireId: 'neutral',
        },
      ],
      hubs: [hub],
      wires: [
        wire({ id: hotId, color: 'black', breakerId: bId }),
        wire({ id: 'neutral', color: 'white', breakerId: bId }),
        wire({ id: inId, color: 'black', hubId: hub.id }),
        wire({ id: outA, color: 'black', hubId: hub.id }),
        wire({ id: outB, color: 'black', hubId: hub.id }),
      ],
      wireLinks: [
        { id: 'l1', wireIdA: hotId, endpointA: 'end', wireIdB: inId, endpointB: 'end' },
      ] satisfies WireLink[],
    });
    const resolved = resolveDirections(d);
    const hues = resolveEnergyHue(d, resolved);
    expect(hues.get(hotId)).toBe(0);
    expect(hues.get(inId)).toBe(1);
    expect(hues.get(outA)).toBe(2);
    expect(hues.get(outB)).toBe(2);
  });

  it('cycles through 32 hue levels', () => {
    expect(ENERGY_HUE_LEVELS).toBe(32);
  });
});
