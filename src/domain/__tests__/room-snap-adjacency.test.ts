import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { GRID_SIZE } from '../grid';
import type { Diagram, Room } from '../types';
import { addRoomFromBounds, addRoomDoorAt, DEFAULT_DOOR_WIDTH, updateRoomDoor, removeRoomDoor } from '../room-mutations';
import { snapRoomDraftCorners, snapRoomRect } from '../room-snap';
import { findSharedWallNeighbor, mapDoorToSharedWall } from '../room-adjacency';

describe('room snap', () => {
  it('snaps a new room left edge to an existing room right edge', () => {
    const existing = { x: 0, y: 0, width: GRID_SIZE * 16, height: GRID_SIZE * 12 };
    const right = existing.x + existing.width;

    const snapped = snapRoomRect(
      { x: right - GRID_SIZE, y: 0, width: GRID_SIZE * 16, height: GRID_SIZE * 12 },
      [existing as never],
    );

    expect(snapped.x).toBe(right);
  });

  it('snaps drag corners independently when drawing a room', () => {
    const existing = { x: 0, y: 0, width: 192, height: 144 };
    const { x0, x1 } = snapRoomDraftCorners(180, 0, 360, 144, [existing as never]);
    expect(x0).toBe(192);
    expect(x1).toBe(360);
  });

  it('connects a dragged room to an existing one via addRoomFromBounds', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoomFromBounds(diagram, 0, 0, 192, 144);
    diagram = addRoomFromBounds(diagram, 180, 0, 372, 144);
    const rooms = diagram.rooms ?? [];
    expect(rooms).toHaveLength(2);
    const [a, b] = rooms;
    expect(a!.x + a!.width).toBe(b!.x);
  });
});

describe('shared wall doors', () => {
  const roomA: Room = { id: 'a', label: '', x: 0, y: 0, width: 192, height: 144, doors: [] };
  const roomB: Room = { id: 'b', label: '', x: 192, y: 0, width: 192, height: 144, doors: [] };

  it('finds a neighbor across a shared vertical wall', () => {
    const diagram: Diagram = { ...createEmptyJob().diagram, rooms: [roomA, roomB] };
    const shared = findSharedWallNeighbor(diagram, roomA, 'east');
    expect(shared).toEqual({ neighborRoomId: 'b', neighborWall: 'west' });
  });

  it('maps a door to the facing wall with the same span', () => {
    const door = { offset: 48, width: DEFAULT_DOOR_WIDTH };
    const mapped = mapDoorToSharedWall(roomA, 'east', roomB, 'west', door);
    expect(mapped).toEqual({ offset: 48, width: DEFAULT_DOOR_WIDTH });
  });

  it('addRoomDoorAt creates matching doors on both rooms of a shared wall', () => {
    let diagram: Diagram = { ...createEmptyJob().diagram, rooms: [roomA, roomB] };
    diagram = addRoomDoorAt(diagram, 'a', 'east', 72);

    const a = diagram.rooms!.find((r) => r.id === 'a')!;
    const b = diagram.rooms!.find((r) => r.id === 'b')!;
    const aDoor = a.doors[0]!;
    const bDoor = b.doors[0]!;
    expect(a.doors).toHaveLength(1);
    expect(b.doors).toHaveLength(1);
    expect(aDoor.wall).toBe('east');
    expect(bDoor.wall).toBe('west');
    expect(bDoor.offset).toBe(aDoor.offset);
    expect(bDoor.width).toBe(aDoor.width);
    expect(aDoor.linkedRoomId).toBe('b');
    expect(aDoor.linkedDoorId).toBe(bDoor.id);
    expect(bDoor.linkedRoomId).toBe('a');
    expect(bDoor.linkedDoorId).toBe(aDoor.id);
  });

  it('merges adjacent doors on a shared wall into one wider opening', () => {
    let diagram: Diagram = { ...createEmptyJob().diagram, rooms: [roomA, roomB] };
    diagram = addRoomDoorAt(diagram, 'a', 'east', 48);
    diagram = addRoomDoorAt(diagram, 'a', 'east', 48 + DEFAULT_DOOR_WIDTH);

    const a = diagram.rooms!.find((r) => r.id === 'a')!;
    const b = diagram.rooms!.find((r) => r.id === 'b')!;
    expect(a.doors).toHaveLength(1);
    expect(b.doors).toHaveLength(1);
    expect(a.doors[0]!.width).toBe(DEFAULT_DOOR_WIDTH * 2);
    expect(b.doors[0]!.width).toBe(DEFAULT_DOOR_WIDTH * 2);
    expect(a.doors[0]!.linkedDoorId).toBe(b.doors[0]!.id);
  });

  it('updateRoomDoor resizes the linked door on the neighbor room', () => {
    let diagram: Diagram = { ...createEmptyJob().diagram, rooms: [roomA, roomB] };
    diagram = addRoomDoorAt(diagram, 'a', 'east', 72);
    const aDoor = diagram.rooms!.find((r) => r.id === 'a')!.doors[0]!;
    const wider = DEFAULT_DOOR_WIDTH + GRID_SIZE * 4;

    diagram = updateRoomDoor(diagram, 'a', aDoor.id, { width: wider });

    const a = diagram.rooms!.find((r) => r.id === 'a')!;
    const b = diagram.rooms!.find((r) => r.id === 'b')!;
    expect(a.doors[0]!.width).toBe(wider);
    expect(b.doors[0]!.width).toBe(wider);
  });

  it('removeRoomDoor removes the linked door on the neighbor room', () => {
    let diagram: Diagram = { ...createEmptyJob().diagram, rooms: [roomA, roomB] };
    diagram = addRoomDoorAt(diagram, 'a', 'east', 72);
    const aDoor = diagram.rooms!.find((r) => r.id === 'a')!.doors[0]!;

    diagram = removeRoomDoor(diagram, 'a', aDoor.id);

    expect(diagram.rooms!.find((r) => r.id === 'a')!.doors).toHaveLength(0);
    expect(diagram.rooms!.find((r) => r.id === 'b')!.doors).toHaveLength(0);
  });
});

describe('door sizing', () => {
  it('uses doubled default door width', () => {
    expect(DEFAULT_DOOR_WIDTH).toBe(GRID_SIZE * 6);
  });
});
