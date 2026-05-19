import { describe, expect, it } from 'vitest';
import { normalizeDiagram } from '../normalize';

describe('normalizeHubSlots', () => {
  it('migrates legacy u/v hubs to slots', () => {
    const normalized = normalizeDiagram({
      junctionBoxes: [{ id: 'jb1', type: 'normal', label: '', x: 0, y: 0, width: 100, height: 80 }],
      breakers: [],
      hubs: [
        {
          id: 'h1',
          junctionBoxId: 'jb1',
          label: '',
          u: 0.5,
          v: 0.5,
        },
      ] as never,
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      deviceNodes: [],
      conduits: [],
      wires: [],
      wireLinks: [],
      layout: { conduitPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} },
    });

    expect(normalized.hubs[0]!.slot).toBeGreaterThanOrEqual(0);
    expect(normalized.hubs[0]!.slot).toBeLessThanOrEqual(3);
    expect('u' in normalized.hubs[0]!).toBe(false);
  });
});
