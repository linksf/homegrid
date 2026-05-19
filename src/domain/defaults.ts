import { nanoid } from 'nanoid';
import type { Job, JunctionBox } from './types';

export function createEmptyJob(name = 'Untitled job'): Job {
  const now = new Date().toISOString();
  const breakerBoxId = nanoid();
  const breakerBox: JunctionBox = {
    id: breakerBoxId,
    type: 'breaker',
    label: '',
    x: 80,
    y: 80,
    width: 200,
    height: 320,
  };
  return {
    id: nanoid(),
    name,
    notes: '',
    createdAt: now,
    updatedAt: now,
    diagram: {
      junctionBoxes: [breakerBox],
      breakers: [],
      conduits: [],
      wires: [],
      hubs: [],
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      deviceNodes: [],
      wireLinks: [],
      layout: {
        conduitPaths: {},
        conduitOffsets: {},
        wireOffsets: {},
        wirePaths: {},
        wireLinkPaths: {},
        wireLinkOffsets: {},
        hubBridgePaths: {},
      },
    },
  };
}
