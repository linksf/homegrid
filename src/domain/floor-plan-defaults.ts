import { nanoid } from 'nanoid';
import { GRID_SIZE } from './grid';
import type { Area, FloorPlan, Job, Room } from './types';
import { createEmptyJob } from './defaults';

export const SANDBOX_ROOM_LABEL = 'Sandbox';

const SANDBOX_ROOM_SIZE = Object.freeze({
  width: GRID_SIZE * 80,
  height: GRID_SIZE * 60,
});

export function createEmptyFloorPlan(name = 'Untitled floor plan'): FloorPlan {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    name,
    rooms: [],
    areas: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createSandboxRoom(): Room {
  return {
    id: nanoid(),
    label: SANDBOX_ROOM_LABEL,
    x: 0,
    y: 0,
    width: SANDBOX_ROOM_SIZE.width,
    height: SANDBOX_ROOM_SIZE.height,
    doors: [],
  };
}

export type CreateJobOptions =
  | { mode: 'sandbox'; name?: string }
  | { mode: 'floorplan'; floorPlan: FloorPlan; name?: string };

export function createJobWithNavigation(options: CreateJobOptions): Job {
  const base = createEmptyJob(options.name);

  if (options.mode === 'sandbox') {
    return {
      ...base,
      navigationMode: 'sandbox',
      floorPlanId: null,
      diagram: {
        ...base.diagram,
        rooms: [createSandboxRoom()],
        areas: [],
      },
    };
  }

  const { floorPlan } = options;
  return {
    ...base,
    navigationMode: 'floorplan',
    floorPlanId: floorPlan.id,
    floorPlanName: floorPlan.name,
    diagram: {
      ...base.diagram,
      rooms: floorPlan.rooms.map((room) => ({ ...room, doors: room.doors.map((d) => ({ ...d })) })),
      areas: floorPlan.areas.map((area) => ({ ...area })),
    },
  };
}

export function cloneArea(area: Area): Area {
  return { ...area };
}
