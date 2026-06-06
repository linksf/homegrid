import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../../domain/direction';
import type { Diagram, Wire, WireLink } from '../../domain/types';
import { collectDiagramIssues } from '../diagram-issues';

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

describe('collectDiagramIssues', () => {
  it('lists only wires directly involved in a direction conflict', () => {
    const w1 = 'w1';
    const w2 = 'w2';
    const w3 = 'w3';
    const link: WireLink = {
      id: 'link1',
      wireIdA: w1,
      endpointA: 'end',
      wireIdB: w2,
      endpointB: 'end',
    };
    const d = diagram({
      conduits: [
        {
          id: 'c1',
          kind: 'local',
          label: '',
          anchor: 'middle-left',
          junctionBoxId: 'jb1',
          wireIds: [w1, w2, w3],
        },
      ],
      junctionBoxes: [{ id: 'jb1', type: 'normal', label: '', x: 0, y: 0, width: 120, height: 120 }],
      wires: [
        wire({ id: w1, color: 'black', conduitId: 'c1', manualDirection: 'toward' }),
        wire({ id: w2, color: 'black', conduitId: 'c1', manualDirection: 'toward' }),
        wire({ id: w3, color: 'black', conduitId: 'c1' }),
      ],
      wireLinks: [link],
    });
    const resolved = resolveDirections(d);
    const issues = collectDiagramIssues(d, resolved);
    const conflictWireIds = issues
      .filter((issue) => issue.kind === 'direction-conflict')
      .map((issue) => issue.wireId);
    expect(conflictWireIds).toContain(w1);
    expect(conflictWireIds).toContain(w2);
    expect(conflictWireIds).not.toContain(w3);
  });

  it('includes an explanation on each direction conflict', () => {
    const w1 = 'w1';
    const w2 = 'w2';
    const d = diagram({
      conduits: [
        {
          id: 'c1',
          kind: 'local',
          label: '',
          anchor: 'middle-left',
          junctionBoxId: 'jb1',
          wireIds: [w1, w2],
        },
      ],
      junctionBoxes: [{ id: 'jb1', type: 'normal', label: '', x: 0, y: 0, width: 120, height: 120 }],
      wires: [
        wire({ id: w1, color: 'red', conduitId: 'c1', manualDirection: 'toward' }),
        wire({ id: w2, color: 'red', conduitId: 'c1', manualDirection: 'toward' }),
      ],
      wireLinks: [{ id: 'link1', wireIdA: w1, endpointA: 'end', wireIdB: w2, endpointB: 'end' }],
    });
    const resolved = resolveDirections(d);
    const issues = collectDiagramIssues(d, resolved);
    expect(issues.some((issue) => issue.kind === 'direction-conflict' && issue.detail.length > 20)).toBe(true);
  });
});
