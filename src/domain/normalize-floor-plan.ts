import { normalizeRoomDoors } from './room-mutations';
import type { Area, FloorPlan, Room } from './types';

function normalizeArea(area: Area): Area {
  return {
    id: area.id,
    label: typeof area.label === 'string' ? area.label : '',
    x: typeof area.x === 'number' ? area.x : 0,
    y: typeof area.y === 'number' ? area.y : 0,
    width: typeof area.width === 'number' ? area.width : 0,
    height: typeof area.height === 'number' ? area.height : 0,
  };
}

function normalizeRoom(room: Room): Room {
  return {
    id: room.id,
    label: typeof room.label === 'string' ? room.label : '',
    x: typeof room.x === 'number' ? room.x : 0,
    y: typeof room.y === 'number' ? room.y : 0,
    width: typeof room.width === 'number' ? room.width : 0,
    height: typeof room.height === 'number' ? room.height : 0,
    doors: normalizeRoomDoors(room),
  };
}

export function normalizeFloorPlan(plan: FloorPlan): FloorPlan {
  return {
    id: plan.id,
    name: typeof plan.name === 'string' ? plan.name : 'Untitled floor plan',
    rooms: (plan.rooms ?? []).map(normalizeRoom),
    areas: (plan.areas ?? []).map(normalizeArea),
    createdAt: typeof plan.createdAt === 'string' ? plan.createdAt : new Date().toISOString(),
    updatedAt: typeof plan.updatedAt === 'string' ? plan.updatedAt : new Date().toISOString(),
  };
}
