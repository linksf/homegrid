import { describe, it, expect } from 'vitest';
import { normalizeDiagram } from '../normalize';

describe('normalizeDiagram', () => {
  it('adds missing wires array and wire labels', () => {
    const raw = {
      junctionBoxes: [],
      breakers: [],
      conduits: [],
      hubs: [],
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      dimmerSwitches: [],
      outlets: [],
      deviceNodes: [],
      wireLinks: [],
      layout: { conduitPaths: {}, conduitRunPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} },
    } as unknown as import('../types').Diagram;

    const diagram = normalizeDiagram(raw);
    expect(diagram.wires).toEqual([]);
  });

  it('fills missing wire label without throwing', () => {
    const diagram = normalizeDiagram({
      rooms: [],
      junctionBoxes: [],
      breakers: [],
      conduits: [],
      cables: [],
      conduitRuns: [],
      wires: [
        {
          id: 'w1',
          color: 'black',
          conduitId: 'c1',
          breakerId: null,
          manualDirection: null,
        } as import('../types').Wire,
      ],
      hubs: [],
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      dimmerSwitches: [],
      outlets: [],
      deviceNodes: [],
      wireLinks: [],
      layout: { conduitPaths: {}, conduitRunPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} },
    });

    expect(diagram.wires[0]!.label).toBe('');
  });

  it('migrates legacy breaker conduits and breakerId runs to breaker cables', () => {
    const legacyConduitId = 'legacy-bc';
    const panelId = 'panel1';
    const fieldCableId = 'field-cab';
    const runId = 'run1';

    const raw = {
      rooms: [],
      junctionBoxes: [
        {
          id: panelId,
          type: 'breaker',
          label: 'Panel',
          x: 0,
          y: 0,
          width: 280,
          height: 200,
        },
        {
          id: 'box1',
          type: 'normal',
          label: '',
          x: 400,
          y: 0,
          width: 200,
          height: 160,
        },
      ],
      breakers: [],
      conduits: [
        {
          id: legacyConduitId,
          kind: 'breaker',
          label: 'Circuit 1',
          junctionBoxId: panelId,
          anchor: 'middle-left',
          wireIds: ['w-panel-b', 'w-panel-w'],
        },
      ],
      cables: [
        {
          id: fieldCableId,
          junctionBoxId: 'box1',
          anchor: 'middle-right',
          wireIds: ['w-field-b', 'w-field-w'],
        },
      ],
      conduitRuns: [
        {
          id: runId,
          cableIdA: fieldCableId,
          cableIdB: null,
          breakerId: legacyConduitId,
          wireIds: ['w-field-b', 'w-panel-b', 'w-field-w', 'w-panel-w'],
        },
      ],
      wires: [
        {
          id: 'w-panel-b',
          color: 'black',
          label: '',
          conduitId: legacyConduitId,
          cableId: null,
          breakerId: null,
          hubId: null,
          deviceNodeId: null,
          manualDirection: null,
        },
        {
          id: 'w-panel-w',
          color: 'white',
          label: '',
          conduitId: legacyConduitId,
          cableId: null,
          breakerId: null,
          hubId: null,
          deviceNodeId: null,
          manualDirection: null,
        },
        {
          id: 'w-field-b',
          color: 'black',
          label: '',
          conduitId: null,
          cableId: fieldCableId,
          breakerId: null,
          hubId: null,
          deviceNodeId: null,
          manualDirection: null,
        },
        {
          id: 'w-field-w',
          color: 'white',
          label: '',
          conduitId: null,
          cableId: fieldCableId,
          breakerId: null,
          hubId: null,
          deviceNodeId: null,
          manualDirection: null,
        },
      ],
      hubs: [],
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      dimmerSwitches: [],
      outlets: [],
      deviceNodes: [],
      wireLinks: [],
      layout: {
        conduitPaths: {
          [legacyConduitId]: { points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        },
        conduitRunPaths: {},
        exposedPaths: {},
        conduitStubPaths: {},
        wireLinkPaths: {},
        hubBridgePaths: {},
      },
    } as unknown as import('../types').Diagram;

    const diagram = normalizeDiagram(raw);

    expect(diagram.conduits.some((c) => (c as { kind?: string }).kind === 'breaker')).toBe(false);
    const breakerCable = diagram.cables.find((c) => c.role === 'breaker');
    expect(breakerCable).toBeDefined();
    expect(breakerCable!.closed).toBe(true);
    expect(breakerCable!.wireIds).toEqual(['w-panel-b', 'w-panel-w']);

    const run = diagram.conduitRuns.find((r) => r.id === runId)!;
    expect((run as { breakerId?: string }).breakerId).toBeUndefined();
    expect(run.cableIdB).toBe(breakerCable!.id);

    for (const wid of breakerCable!.wireIds) {
      expect(diagram.layout.exposedPaths?.[wid]).toBeUndefined();
    }
  });
});
