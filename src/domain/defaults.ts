import { nanoid } from 'nanoid';
import { GRID_SIZE } from './grid';
import type { Job, JunctionBox } from './types';

export function createEmptyJob(name = 'Untitled job'): Job {
  const now = new Date().toISOString();
  const breakerBoxId = nanoid();
  const breakerBox: JunctionBox = {
    id: breakerBoxId,
    type: 'breaker',
    label: '',
    x: GRID_SIZE * 7,
    y: GRID_SIZE * 7,
    width: GRID_SIZE * 16,
    height: GRID_SIZE * 26,
  };
  return {
    id: nanoid(),
    name,
    notes: '',
    createdAt: now,
    updatedAt: now,
    diagram: {
      rooms: [],
      junctionBoxes: [breakerBox],
      breakers: [],
      conduits: [],
      cables: [],
      conduitRuns: [],
      wires: [],
      hubs: [],
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      dimmerSwitches: [],
      outlets: [],
      deviceNodes: [],
      wireLinks: [],
      layout: {
        conduitPaths: {},
        conduitRunPaths: {},
        exposedPaths: {},
        conduitStubPaths: {},
        conduitOffsets: {},
        wireOffsets: {},
        wirePaths: {},
        wireLinkPaths: {},
        wireLinkOffsets: {},
        hubBridgePaths: {},
        hubWirePaths: {},
        deviceWirePaths: {},
      },
    },
  };
}
