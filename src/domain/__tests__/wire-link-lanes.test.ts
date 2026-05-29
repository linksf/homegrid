import { beforeEach, describe, expect, it } from 'vitest';
import { clearWireLinkLaneCache } from '../wire-geometry';
import { buildWireLinkLaneMap, offsetPolylineByLanes } from '../wire-link-lanes';
import type { Diagram } from '../types';

function diagramWithOverlappingLinks(): Diagram {
  const path = [
    { x: 0, y: 50 },
    { x: 120, y: 50 },
    { x: 120, y: 150 },
  ];
  return {
    rooms: [],
    junctionBoxes: [],
    breakers: [],
    hubs: [],
    hubBridges: [],
    lightBulbs: [],
    switches: [],
    dimmerSwitches: [],
    outlets: [],
    deviceNodes: [],
    conduits: [],
    cables: [],
    conduitRuns: [],
    wires: [
      {
        id: 'w1',
        color: 'black',
        label: '',
        conduitId: null,
        cableId: null,
        breakerId: null,
        hubId: null,
        deviceNodeId: null,
        manualDirection: null,
      },
      {
        id: 'w2',
        color: 'white',
        label: '',
        conduitId: null,
        cableId: null,
        breakerId: null,
        hubId: null,
        deviceNodeId: null,
        manualDirection: null,
      },
    ],
    wireLinks: [
      { id: 'l1', wireIdA: 'w1', endpointA: 'end', wireIdB: 'w2', endpointB: 'end' },
      { id: 'l2', wireIdA: 'w1', endpointA: 'end', wireIdB: 'w2', endpointB: 'end' },
    ],
    layout: {
      conduitPaths: {},
      conduitRunPaths: {},
      wireLinkPaths: {
        l1: { points: path.map((p) => ({ ...p })) },
        l2: { points: path.map((p) => ({ ...p })) },
      },
      hubBridgePaths: {},
    },
  };
}

describe('wire-link-lanes', () => {
  beforeEach(() => {
    clearWireLinkLaneCache();
  });

  it('separates wire links on identical paths', () => {
    const diagram = diagramWithOverlappingLinks();
    const lanes = buildWireLinkLaneMap(diagram);
    const p1 = offsetPolylineByLanes(diagram.layout.wireLinkPaths.l1!.points, 'l1', lanes);
    const p2 = offsetPolylineByLanes(diagram.layout.wireLinkPaths.l2!.points, 'l2', lanes);
    expect(p1[0]!.y).not.toBeCloseTo(p2[0]!.y);
    expect(p1[1]!.y).not.toBeCloseTo(p2[1]!.y);
  });
});
