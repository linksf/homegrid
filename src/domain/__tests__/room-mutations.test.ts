import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { GRID_SIZE } from '../grid';
import {
  addRoom,
  addRoomDoor,
  addRoomDoorAt,
  addRoomFromBounds,
  MIN_ROOM_SIZE,
  removeRoomDoor,
  resizeRoom,
  roomOutlineSegments,
  updateRoom,
  wallOffsetForPoint,
} from '../room-mutations';

describe('rooms', () => {
  it('creates a room with default size', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 200, 200);
    expect(diagram.rooms).toHaveLength(1);
    expect(diagram.rooms[0]!.doors).toEqual([]);
    expect(diagram.rooms[0]!.width).toBeGreaterThan(0);
    expect(diagram.rooms[0]!.height).toBeGreaterThan(0);
  });

  it('splits wall outline segments around doors', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 200, 200);
    const roomId = diagram.rooms[0]!.id;
    diagram = addRoomDoor(diagram, roomId, 'north');

    const room = diagram.rooms[0]!;
    const northSegments = roomOutlineSegments(room).filter(
      (seg) => seg.y1 === room.y && seg.y2 === room.y,
    );
    expect(northSegments.length).toBe(2);

    const door = room.doors.find((entry) => entry.wall === 'north')!;
    const totalNorthSpan = northSegments.reduce(
      (sum, seg) => sum + Math.abs(seg.x2 - seg.x1),
      0,
    );
    expect(totalNorthSpan).toBeCloseTo(room.width - door.width, 0);
  });

  it('updates label and removes doors', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 200, 200);
    const roomId = diagram.rooms[0]!.id;
    diagram = addRoomDoor(diagram, roomId, 'east');
    const doorId = diagram.rooms[0]!.doors[0]!.id;

    diagram = updateRoom(diagram, roomId, { label: 'Kitchen' });
    expect(diagram.rooms[0]!.label).toBe('Kitchen');

    diagram = removeRoomDoor(diagram, roomId, doorId);
    expect(diagram.rooms[0]!.doors).toHaveLength(0);
  });

  it('creates a room from drag bounds regardless of corner order', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoomFromBounds(diagram, 400, 360, 100, 120);
    const room = diagram.rooms[0]!;
    expect(room.x).toBeLessThanOrEqual(100);
    expect(room.y).toBeLessThanOrEqual(120);
    expect(room.width).toBeGreaterThanOrEqual(GRID_SIZE * 6);
    expect(room.height).toBeGreaterThanOrEqual(GRID_SIZE * 6);
  });

  it('clamps a tiny drag up to the minimum room size', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoomFromBounds(diagram, 200, 200, 205, 203);
    const room = diagram.rooms[0]!;
    expect(room.width).toBe(MIN_ROOM_SIZE.width);
    expect(room.height).toBe(MIN_ROOM_SIZE.height);
  });

  it('places a door centered at a point along a wall', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 200, 200);
    const room = diagram.rooms[0]!;
    const center = room.width / 2;
    diagram = addRoomDoorAt(diagram, room.id, 'north', center);

    const door = diagram.rooms[0]!.doors[0]!;
    expect(door.wall).toBe('north');
    // Door is centered on the requested offset, within one grid cell of snap tolerance.
    expect(Math.abs(door.offset + door.width / 2 - center)).toBeLessThanOrEqual(GRID_SIZE);
  });

  it('maps a world point to a grid-snapped wall offset', () => {
    const room = { x: 100, y: 80, width: 240, height: 180 };
    expect(wallOffsetForPoint(room, 'north', 173, 80)).toBe(72);
    expect(wallOffsetForPoint(room, 'west', 100, 153)).toBe(72);
  });

  it('resizes from a corner with minimum size', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 200, 200);
    const room = diagram.rooms[0]!;
    diagram = resizeRoom(diagram, room.id, {
      width: GRID_SIZE * 4,
      height: GRID_SIZE * 4,
    });
    expect(diagram.rooms[0]!.width).toBeGreaterThanOrEqual(GRID_SIZE * 6);
  });
});
