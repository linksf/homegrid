import { nanoid } from 'nanoid';
import { GRID_SIZE } from './grid';
import type { Area, FloorPlan, Job, Room } from './types';
import { createEmptyJob } from './defaults';

export const SANDBOX_ROOM_LABEL = 'Sandbox';

const SANDBOX_ROOM_SIZE = Object.freeze({
  width: GRID_SIZE * 80,
  height: GRID_SIZE * 60,
});

function cloneRoom(room: Room): Room {
  return { ...room, doors: room.doors.map((door) => ({ ...door })) };
}

function cloneRoomsAndAreas(rooms: Room[], areas: Area[]): { rooms: Room[]; areas: Area[] } {
  return {
    rooms: rooms.map(cloneRoom),
    areas: areas.map((area) => ({ ...area })),
  };
}

/** Build a floor plan snapshot from a job's current rooms and areas. */
export function floorPlanFromJob(job: Job): FloorPlan {
  const now = new Date().toISOString();
  const { rooms, areas } = cloneRoomsAndAreas(job.diagram.rooms, job.diagram.areas ?? []);
  return {
    id: job.floorPlanId ?? nanoid(),
    name: job.floorPlanName?.trim() || 'Floor plan',
    rooms,
    areas,
    createdAt: now,
    updatedAt: now,
  };
}

/** Replace navigation rooms/areas on a job; wiring and devices stay in place. */
export function applyFloorPlanToJob(job: Job, floorPlan: FloorPlan): Job {
  const { rooms, areas } = cloneRoomsAndAreas(floorPlan.rooms, floorPlan.areas);
  return {
    ...job,
    navigationMode: 'floorplan',
    floorPlanId: floorPlan.id,
    floorPlanName: floorPlan.name,
    updatedAt: new Date().toISOString(),
    diagram: {
      ...job.diagram,
      rooms,
      areas,
    },
  };
}

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
      rooms: floorPlan.rooms.map(cloneRoom),
      areas: floorPlan.areas.map((area) => ({ ...area })),
    },
  };
}

export function cloneArea(area: Area): Area {
  return { ...area };
}
