import type { Diagram, Room, RoomDoor, RoomWall } from './types';
import { GRID_SIZE } from './grid';
import { wallLength } from './room-mutations';

const EDGE_EPS = 1;

export type DoorSpan = { start: number; end: number };

export function doorSpan(door: Pick<RoomDoor, 'offset' | 'width'>): DoorSpan {
  return { start: door.offset, end: door.offset + door.width };
}

/** True when two door spans touch or overlap (within one grid cell). */
export function doorSpansTouchOrOverlap(a: DoorSpan, b: DoorSpan, gap = GRID_SIZE): boolean {
  return a.start <= b.end + gap && b.start <= a.end + gap;
}

export function unionDoorSpan(...spans: DoorSpan[]): DoorSpan {
  return {
    start: Math.min(...spans.map((s) => s.start)),
    end: Math.max(...spans.map((s) => s.end)),
  };
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - EDGE_EPS && b0 < a1 - EDGE_EPS;
}

export type SharedWall = {
  neighborRoomId: string;
  neighborWall: RoomWall;
};

/** When `room` has `wall` flush with another room, return that neighbor and its facing wall. */
export function findSharedWallNeighbor(
  diagram: Diagram,
  room: Room,
  wall: RoomWall,
): SharedWall | null {
  const others = (diagram.rooms ?? []).filter((r) => r.id !== room.id);
  const e = {
    left: room.x,
    right: room.x + room.width,
    top: room.y,
    bottom: room.y + room.height,
  };

  for (const other of others) {
    const o = {
      left: other.x,
      right: other.x + other.width,
      top: other.y,
      bottom: other.y + other.height,
    };

    if (
      wall === 'north' &&
      Math.abs(o.bottom - e.top) <= EDGE_EPS &&
      rangesOverlap(e.left, e.right, o.left, o.right)
    ) {
      return { neighborRoomId: other.id, neighborWall: 'south' };
    }
    if (
      wall === 'south' &&
      Math.abs(o.top - e.bottom) <= EDGE_EPS &&
      rangesOverlap(e.left, e.right, o.left, o.right)
    ) {
      return { neighborRoomId: other.id, neighborWall: 'north' };
    }
    if (
      wall === 'west' &&
      Math.abs(o.right - e.left) <= EDGE_EPS &&
      rangesOverlap(e.top, e.bottom, o.top, o.bottom)
    ) {
      return { neighborRoomId: other.id, neighborWall: 'east' };
    }
    if (
      wall === 'east' &&
      Math.abs(o.left - e.right) <= EDGE_EPS &&
      rangesOverlap(e.top, e.bottom, o.top, o.bottom)
    ) {
      return { neighborRoomId: other.id, neighborWall: 'west' };
    }
  }

  return null;
}

/** Map a door on one room's wall to the equivalent offset on a shared neighbor wall. */
export function mapDoorToSharedWall(
  sourceRoom: Room,
  sourceWall: RoomWall,
  targetRoom: Room,
  targetWall: RoomWall,
  door: Pick<RoomDoor, 'offset' | 'width'>,
): Pick<RoomDoor, 'offset' | 'width'> | null {
  let offset: number;
  if (sourceWall === 'north' && targetWall === 'south') {
    offset = sourceRoom.x + door.offset - targetRoom.x;
  } else if (sourceWall === 'south' && targetWall === 'north') {
    offset = sourceRoom.x + door.offset - targetRoom.x;
  } else if (sourceWall === 'west' && targetWall === 'east') {
    offset = sourceRoom.y + door.offset - targetRoom.y;
  } else if (sourceWall === 'east' && targetWall === 'west') {
    offset = sourceRoom.y + door.offset - targetRoom.y;
  } else {
    return null;
  }

  const len = wallLength(targetRoom, targetWall);
  if (offset < 0 || offset + door.width > len + EDGE_EPS) return null;
  return { offset, width: door.width };
}
