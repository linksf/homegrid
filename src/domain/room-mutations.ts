import { nanoid } from 'nanoid';
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

export const DEFAULT_DOOR_WIDTH = GRID_SIZE * 3;
export const MIN_DOOR_WIDTH = GRID_SIZE * 2;

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
  return {
    id: door.id,
    wall: door.wall,
    offset,
    width,
  };
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
  const rect = snapJunctionBoxRect({
    x: center.x - w / 2,
    y: center.y - h / 2,
    width: w,
    height: h,
  });
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
  const door = createDefaultDoor(room, wall);
  return updateRoom(diagram, roomId, { doors: [...(room.doors ?? []), door] });
}

export function removeRoomDoor(diagram: Diagram, roomId: string, doorId: string): Diagram {
  const room = (diagram.rooms ?? []).find((r) => r.id === roomId);
  if (!room) return diagram;
  return updateRoom(diagram, roomId, {
    doors: (room.doors ?? []).filter((door) => door.id !== doorId),
  });
}

export function deleteRoom(diagram: Diagram, roomId: string): Diagram {
  return {
    ...diagram,
    rooms: (diagram.rooms ?? []).filter((room) => room.id !== roomId),
  };
}
