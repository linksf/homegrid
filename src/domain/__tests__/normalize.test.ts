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
      deviceNodes: [],
      wireLinks: [],
      layout: { conduitPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} },
    } as unknown as import('../types').Diagram;

    const diagram = normalizeDiagram(raw);
    expect(diagram.wires).toEqual([]);
  });

  it('fills missing wire label without throwing', () => {
    const diagram = normalizeDiagram({
      junctionBoxes: [],
      breakers: [],
      conduits: [],
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
      deviceNodes: [],
      wireLinks: [],
      layout: { conduitPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} },
    });

    expect(diagram.wires[0]!.label).toBe('');
  });
});
