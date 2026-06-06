import { describe, expect, it } from 'vitest';
import { createJobWithNavigation } from '../floor-plan-defaults';
import { addRoomFromBounds } from '../room-mutations';
import { buildNavigatorTree, findNavigatorNode } from '../../editor/navigator-tree';
import { roomAtPoint, roomForEntityCenter } from '../spatial-room-index';

describe('spatial-room-index', () => {
  it('picks the smallest room containing a point', () => {
    const outer = { id: 'outer', label: 'Outer', x: 0, y: 0, width: 400, height: 400, doors: [] };
    const inner = { id: 'inner', label: 'Inner', x: 100, y: 100, width: 100, height: 100, doors: [] };
    expect(roomAtPoint([outer, inner], { x: 150, y: 150 })?.id).toBe('inner');
  });

  it('assigns entities to rooms by center point', () => {
    let job = createJobWithNavigation({ mode: 'sandbox' });
    job = {
      ...job,
      diagram: addRoomFromBounds(job.diagram, 0, 0, 200, 200),
    };
    const room = job.diagram.rooms.find((r) => r.label !== 'Sandbox')!;
    job = {
      ...job,
      diagram: {
        ...job.diagram,
        junctionBoxes: [
          {
            id: 'box-1',
            type: 'normal',
            label: 'Kitchen box',
            x: room.x + 20,
            y: room.y + 20,
            width: 48,
            height: 48,
          },
        ],
      },
    };
    const hit = roomForEntityCenter(job.diagram, { x: room.x + 44, y: room.y + 44 });
    expect(hit?.id).toBe(room.id);
  });
});

describe('navigator-tree', () => {
  it('groups devices under spatially assigned rooms', () => {
    let job = createJobWithNavigation({ mode: 'floorplan', floorPlan: {
      id: 'fp1',
      name: 'Main floor',
      rooms: [{ id: 'kitchen', label: 'Kitchen', x: 0, y: 0, width: 300, height: 200, doors: [] }],
      areas: [],
      createdAt: '',
      updatedAt: '',
    }});
    job = {
      ...job,
      diagram: {
        ...job.diagram,
        lightBulbs: [{ id: 'light-1', label: 'Island', x: 40, y: 40 }],
      },
    };
    const tree = buildNavigatorTree(job);
    expect(tree.label).toBe('Main floor');
    const kitchen = tree.children.find((n) => n.id === 'kitchen');
    expect(kitchen?.children.some((c) => c.id === 'light-1')).toBe(true);
    expect(findNavigatorNode(tree, 'light-1')?.kind).toBe('lightBulb');
  });

  it('uses Sandbox label for sandbox jobs', () => {
    const job = createJobWithNavigation({ mode: 'sandbox' });
    expect(buildNavigatorTree(job).label).toBe('Sandbox');
    expect(job.diagram.rooms[0]?.label).toBe('Sandbox');
  });
});
