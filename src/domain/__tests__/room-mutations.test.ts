import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { GRID_SIZE } from '../grid';
import {
  addRoom,
  addRoomDoor,
  removeRoomDoor,
  resizeRoom,
  roomOutlineSegments,
  updateRoom,
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
