import { nanoid } from 'nanoid';
import {
  doorSpan,
  doorSpansTouchOrOverlap,
  findSharedWallNeighbor,
  mapDoorToSharedWall,
  unionDoorSpan,
} from './room-adjacency';
import { snapRoomDraftCorners, snapRoomRect } from './room-snap';
import { GRID_SIZE, snapGridCoord, snapGridPoint, snapJunctionBoxRect } from './grid';
import type { Diagram, Room, RoomDoor, RoomWall } from './types';

export const MIN_ROOM_SIZE = Object.freeze({
  width: GRID_SIZE * 6,
  height: GRID_SIZE * 6,
});

export const DEFAULT_ROOM_SIZE = Object.freeze({
  width: GRID_SIZE * 16,
  height: GRID_SIZE * 12,
});

export const DEFAULT_DOOR_WIDTH = GRID_SIZE * 6;
export const MIN_DOOR_WIDTH = GRID_SIZE * 4;

export type RoomSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function clampRoomSize(width: number, height: number): { width: number; height: number } {
  const snapped = snapJunctionBoxRect({ x: 0, y: 0, width, height });
  return {
    width: Math.max(MIN_ROOM_SIZE.width, snapped.width),
    height: Math.max(MIN_ROOM_SIZE.height, snapped.height),
  };
}

export function wallLength(room: Pick<Room, 'width' | 'height'>, wall: RoomWall): number {
  return wall === 'north' || wall === 'south' ? room.width : room.height;
}

export function normalizeRoomDoor(
  room: Pick<Room, 'width' | 'height'>,
  door: RoomDoor,
): RoomDoor {
  const length = wallLength(room, door.wall);
  const width = Math.max(
    MIN_DOOR_WIDTH,
    Math.min(length, snapGridCoord(Math.max(MIN_DOOR_WIDTH, door.width))),
  );
  const maxOffset = Math.max(0, length - width);
  const offset = Math.max(0, Math.min(maxOffset, snapGridCoord(door.offset)));
  const normalized: RoomDoor = {
    id: door.id,
    wall: door.wall,
    offset,
    width,
  };
  if (door.linkedRoomId && door.linkedDoorId) {
    normalized.linkedRoomId = door.linkedRoomId;
    normalized.linkedDoorId = door.linkedDoorId;
  }
  return normalized;
}

export function normalizeRoomDoors(room: Pick<Room, 'width' | 'height' | 'doors'>): RoomDoor[] {
  return (room.doors ?? []).map((door) => normalizeRoomDoor(room, door));
}

function doorsOnWall(doors: RoomDoor[], wall: RoomWall): RoomDoor[] {
  return doors.filter((d) => d.wall === wall).sort((a, b) => a.offset - b.offset);
}

/** Outline segments for a room wall, omitting door gaps. */
export function wallOutlineSegments(
  room: Pick<Room, 'x' | 'y' | 'width' | 'height' | 'doors'>,
  wall: RoomWall,
): RoomSegment[] {
  const length = wallLength(room, wall);
  const gaps = doorsOnWall(normalizeRoomDoors(room), wall);
  const segments: RoomSegment[] = [];

  let cursor = 0;
  for (const gap of gaps) {
    const gapStart = gap.offset;
    const gapEnd = gap.offset + gap.width;
    if (gapStart > cursor) {
      segments.push(segmentForSpan(room, wall, cursor, gapStart));
    }
    cursor = Math.max(cursor, gapEnd);
  }
  if (cursor < length) {
    segments.push(segmentForSpan(room, wall, cursor, length));
  }

  return segments;
}

function segmentForSpan(
  room: Pick<Room, 'x' | 'y' | 'width' | 'height'>,
  wall: RoomWall,
  start: number,
  end: number,
): RoomSegment {
  const { x, y, width, height } = room;
  switch (wall) {
    case 'north':
      return { x1: x + start, y1: y, x2: x + end, y2: y };
    case 'east':
      return { x1: x + width, y1: y + start, x2: x + width, y2: y + end };
    case 'south':
      return { x1: x + end, y1: y + height, x2: x + start, y2: y + height };
    case 'west':
      return { x1: x, y1: y + end, x2: x, y2: y + start };
  }
}

export function roomOutlineSegments(room: Room): RoomSegment[] {
  const walls: RoomWall[] = ['north', 'east', 'south', 'west'];
  return walls.flatMap((wall) => wallOutlineSegments(room, wall));
}

export function createDefaultDoor(room: Pick<Room, 'width' | 'height'>, wall: RoomWall = 'north'): RoomDoor {
  const length = wallLength(room, wall);
  const width = Math.min(DEFAULT_DOOR_WIDTH, length);
  const offset = snapGridCoord(Math.max(0, (length - width) / 2));
  return normalizeRoomDoor(room, { id: nanoid(), wall, offset, width });
}

function normalizeRoom(room: Room): Room {
  const snapped = snapJunctionBoxRect(room);
  const { width, height } = clampRoomSize(snapped.width, snapped.height);
  const base = { ...room, x: snapped.x, y: snapped.y, width, height, doors: room.doors ?? [] };
  return {
    ...base,
    label: typeof room.label === 'string' ? room.label : '',
    doors: normalizeRoomDoors(base),
  };
}

export function addRoom(diagram: Diagram, worldX: number, worldY: number): Diagram {
  const { width: w, height: h } = DEFAULT_ROOM_SIZE;
  const center = snapGridPoint({ x: worldX, y: worldY });
  const rect = snapRoomRect(
    snapJunctionBoxRect({
      x: center.x - w / 2,
      y: center.y - h / 2,
      width: w,
      height: h,
    }),
    diagram.rooms ?? [],
  );
  const room: Room = normalizeRoom({
    id: nanoid(),
    label: '',
    ...rect,
    doors: [],
  });
  return {
    ...diagram,
    rooms: [...(diagram.rooms ?? []), room],
  };
}

/** Create a room from two opposite drag corners; snapped and clamped to the minimum size. */
export function addRoomFromBounds(
  diagram: Diagram,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Diagram {
  const snapped = snapRoomDraftCorners(x0, y0, x1, y1, diagram.rooms ?? []);
  const minX = Math.min(snapped.x0, snapped.x1);
  const minY = Math.min(snapped.y0, snapped.y1);
  const room: Room = normalizeRoom({
    id: nanoid(),
    label: '',
    x: minX,
    y: minY,
    width: Math.abs(snapped.x1 - snapped.x0),
    height: Math.abs(snapped.y1 - snapped.y0),
    doors: [],
  });
  return {
    ...diagram,
    rooms: [...(diagram.rooms ?? []), room],
  };
}

/** Distance along `wall` (from its start corner) for a world point; grid-snapped. */
export function wallOffsetForPoint(
  room: Pick<Room, 'x' | 'y' | 'width' | 'height'>,
  wall: RoomWall,
  worldX: number,
  worldY: number,
): number {
  const raw = wall === 'north' || wall === 'south' ? worldX - room.x : worldY - room.y;
  return snapGridCoord(raw);
}

function mergeDoorsOnWall(
  room: Pick<Room, 'width' | 'height' | 'doors'>,
  wall: RoomWall,
  proposedSpan: { start: number; end: number },
  newDoorDefaults: Pick<RoomDoor, 'id' | 'offset' | 'width'>,
): { doors: RoomDoor[]; merged: RoomDoor; absorbedIds: Set<string> } {
  const existing = (room.doors ?? []).filter((d) => d.wall === wall);
  const touching = existing.filter((d) => doorSpansTouchOrOverlap(doorSpan(d), proposedSpan));

  if (touching.length === 0) {
    const merged = normalizeRoomDoor(room, { wall, ...newDoorDefaults });
    return {
      doors: [...(room.doors ?? []), merged],
      merged,
      absorbedIds: new Set(),
    };
  }

  const span = unionDoorSpan(proposedSpan, ...touching.map(doorSpan));
  const primary = touching[0]!;
  const merged = normalizeRoomDoor(room, {
    ...primary,
    wall,
    offset: span.start,
    width: span.end - span.start,
  });
  const absorbedIds = new Set(touching.filter((d) => d.id !== primary.id).map((d) => d.id));
  const doors = [...(room.doors ?? []).filter((d) => !touching.some((t) => t.id === d.id)), merged];
  return { doors, merged, absorbedIds };
}

function syncDoorOnSharedWall(
  diagram: Diagram,
  roomId: string,
  wall: RoomWall,
  mergedDoor: RoomDoor,
  priorDoors: RoomDoor[],
  absorbedIds: Set<string>,
): Diagram {
  const room = (diagram.rooms ?? []).find((r) => r.id === roomId);
  if (!room) return diagram;

  const shared = findSharedWallNeighbor(diagram, room, wall);
  if (!shared) return diagram;

  const neighbor = (diagram.rooms ?? []).find((r) => r.id === shared.neighborRoomId);
  if (!neighbor) return diagram;

  const mapped = mapDoorToSharedWall(room, wall, neighbor, shared.neighborWall, mergedDoor);
  if (!mapped) return diagram;

  const linkedNeighborIds = new Set<string>();
  for (const id of absorbedIds) {
    const local = priorDoors.find((d) => d.id === id);
    if (local?.linkedDoorId) linkedNeighborIds.add(local.linkedDoorId);
  }
  const priorMerged = priorDoors.find((d) => d.id === mergedDoor.id);
  if (priorMerged?.linkedDoorId) linkedNeighborIds.add(priorMerged.linkedDoorId);
  if (mergedDoor.linkedDoorId) linkedNeighborIds.add(mergedDoor.linkedDoorId);

  const neighborOnWall = (neighbor.doors ?? []).filter((d) => d.wall === shared.neighborWall);
  const toMerge = neighborOnWall.filter((d) => linkedNeighborIds.has(d.id));

  let neighborDoor: RoomDoor;
  let neighborDoors: RoomDoor[];

  if (toMerge.length > 0) {
    const primary = toMerge[0]!;
    neighborDoor = normalizeRoomDoor(neighbor, {
      ...primary,
      wall: shared.neighborWall,
      offset: mapped.offset,
      width: mapped.width,
    });
    neighborDoors = [
      ...(neighbor.doors ?? []).filter((d) => !toMerge.some((t) => t.id === d.id)),
      neighborDoor,
    ];
  } else {
    neighborDoor = normalizeRoomDoor(neighbor, {
      id: nanoid(),
      wall: shared.neighborWall,
      offset: mapped.offset,
      width: mapped.width,
    });
    neighborDoors = [...(neighbor.doors ?? []), neighborDoor];
  }

  neighborDoor = {
    ...neighborDoor,
    linkedRoomId: roomId,
    linkedDoorId: mergedDoor.id,
  };
  neighborDoors = neighborDoors.map((d) => (d.id === neighborDoor.id ? neighborDoor : d));

  const linkedMerged: RoomDoor = {
    ...mergedDoor,
    linkedRoomId: neighbor.id,
    linkedDoorId: neighborDoor.id,
  };
  const roomDoors = room.doors.map((d) => (d.id === linkedMerged.id ? linkedMerged : d));

  let next = updateRoom(diagram, roomId, { doors: roomDoors });
  next = updateRoom(next, neighbor.id, { doors: neighborDoors });
  return next;
}

/** Add a door on `wall` centered at `centerAlongWall` (distance from the wall start corner). */
export function addRoomDoorAt(
  diagram: Diagram,
  roomId: string,
  wall: RoomWall,
  centerAlongWall: number,
  width: number = DEFAULT_DOOR_WIDTH,
): Diagram {
  const room = (diagram.rooms ?? []).find((r) => r.id === roomId);
  if (!room) return diagram;

  const priorDoors = room.doors ?? [];
  const doorWidth = Math.min(wallLength(room, wall), Math.max(MIN_DOOR_WIDTH, width));
  const proposedSpan = doorSpan({
    offset: centerAlongWall - doorWidth / 2,
    width: doorWidth,
  });

  const { doors, merged, absorbedIds } = mergeDoorsOnWall(room, wall, proposedSpan, {
    id: nanoid(),
    offset: proposedSpan.start,
    width: doorWidth,
  });

  let next = updateRoom(diagram, roomId, { doors });
  const placed = (next.rooms ?? [])
    .find((r) => r.id === roomId)!
    .doors.find((d) => d.id === merged.id)!;
  next = syncDoorOnSharedWall(next, roomId, wall, placed, priorDoors, absorbedIds);
  return next;
}

export function moveRoom(diagram: Diagram, roomId: string, x: number, y: number): Diagram {
  const room = (diagram.rooms ?? []).find((r) => r.id === roomId);
  if (!room) return diagram;
  const snapped = snapGridPoint({ x: x + room.width / 2, y: y + room.height / 2 });
  const nextX = snapped.x - room.width / 2;
  const nextY = snapped.y - room.height / 2;
  if (nextX === room.x && nextY === room.y) return diagram;
  return {
    ...diagram,
    rooms: (diagram.rooms ?? []).map((r) => (r.id === roomId ? { ...r, x: nextX, y: nextY } : r)),
  };
}

export function resizeRoom(
  diagram: Diagram,
  roomId: string,
  patch: Partial<Pick<Room, 'x' | 'y' | 'width' | 'height'>>,
): Diagram {
  return {
    ...diagram,
    rooms: (diagram.rooms ?? []).map((room) => {
      if (room.id !== roomId) return room;
      return normalizeRoom({ ...room, ...patch });
    }),
  };
}

export function updateRoom(
  diagram: Diagram,
  roomId: string,
  patch: Partial<Pick<Room, 'label' | 'doors'>>,
): Diagram {
  return {
    ...diagram,
    rooms: (diagram.rooms ?? []).map((room) => {
      if (room.id !== roomId) return room;
      return normalizeRoom({ ...room, ...patch, doors: patch.doors ?? room.doors });
    }),
  };
}

export function addRoomDoor(
  diagram: Diagram,
  roomId: string,
  wall: RoomWall = 'north',
): Diagram {
  const room = (diagram.rooms ?? []).find((r) => r.id === roomId);
  if (!room) return diagram;
  const center = wallLength(room, wall) / 2;
  return addRoomDoorAt(diagram, roomId, wall, center);
}

export function updateRoomDoor(
  diagram: Diagram,
  roomId: string,
  doorId: string,
  patch: Partial<Pick<RoomDoor, 'wall' | 'offset' | 'width'>>,
): Diagram {
  const room = (diagram.rooms ?? []).find((r) => r.id === roomId);
  if (!room) return diagram;
  const door = (room.doors ?? []).find((d) => d.id === doorId);
  if (!door) return diagram;

  const updated = normalizeRoomDoor(room, { ...door, ...patch });
  let next = updateRoom(diagram, roomId, {
    doors: (room.doors ?? []).map((d) => (d.id === doorId ? updated : d)),
  });

  if (!updated.linkedRoomId || !updated.linkedDoorId) return next;

  const neighbor = (next.rooms ?? []).find((r) => r.id === updated.linkedRoomId);
  const neighborDoor = (neighbor?.doors ?? []).find((d) => d.id === updated.linkedDoorId);
  const updatedRoom = (next.rooms ?? []).find((r) => r.id === roomId);
  if (!neighbor || !neighborDoor || !updatedRoom) return next;

  const mapped = mapDoorToSharedWall(updatedRoom, updated.wall, neighbor, neighborDoor.wall, updated);
  if (!mapped) return next;

  const synced = normalizeRoomDoor(neighbor, {
    ...neighborDoor,
    wall: neighborDoor.wall,
    offset: mapped.offset,
    width: mapped.width,
    linkedRoomId: roomId,
    linkedDoorId: updated.id,
  });
  next = updateRoom(next, neighbor.id, {
    doors: (neighbor.doors ?? []).map((d) => (d.id === synced.id ? synced : d)),
  });

  const withLinks: RoomDoor = {
    ...updated,
    linkedRoomId: neighbor.id,
    linkedDoorId: synced.id,
  };
  return updateRoom(next, roomId, {
    doors: (updatedRoom.doors ?? []).map((d) => (d.id === doorId ? withLinks : d)),
  });
}

export function removeRoomDoor(diagram: Diagram, roomId: string, doorId: string): Diagram {
  const room = (diagram.rooms ?? []).find((r) => r.id === roomId);
  if (!room) return diagram;
  const door = (room.doors ?? []).find((d) => d.id === doorId);
  if (!door) return diagram;

  let next = updateRoom(diagram, roomId, {
    doors: (room.doors ?? []).filter((d) => d.id !== doorId),
  });

  if (door.linkedRoomId && door.linkedDoorId) {
    const neighbor = (next.rooms ?? []).find((r) => r.id === door.linkedRoomId);
    if (neighbor) {
      next = updateRoom(next, neighbor.id, {
        doors: (neighbor.doors ?? []).filter((d) => d.id !== door.linkedDoorId),
      });
    }
  }

  return next;
}

export function deleteRoom(diagram: Diagram, roomId: string): Diagram {
  return {
    ...diagram,
    rooms: (diagram.rooms ?? []).filter((room) => room.id !== roomId),
  };
}
