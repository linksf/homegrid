import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addLightBulb } from '../device-mutations';
import { createJobWithNavigation, applyFloorPlanToJob } from '../floor-plan-defaults';
import { addRoomFromBounds } from '../room-mutations';
import { addCable } from '../cable-mutations';
import { connectConduitRun } from '../conduit-run-mutations';
import { GRID_SIZE } from '../grid';
import {
  addDeviceConduit,
  addHub,
  addHubConduit,
  addJunctionBox,
  addWireLinkToDiagram,
} from '../mutations';
import {
  buildNavigatorTree,
  findNavigatorNode,
  findNavigatorNodeByEntityId,
} from '../../editor/navigator-tree';
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
    let job = createJobWithNavigation({
      mode: 'floorplan',
      floorPlan: {
        id: 'fp1',
        name: 'Main floor',
        rooms: [{ id: 'kitchen', label: 'Kitchen', x: 0, y: 0, width: 300, height: 200, doors: [] }],
        areas: [],
        createdAt: '',
        updatedAt: '',
      },
    });
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

  it('nests wires and links under device terminals', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 200, 200);
    const bulb = diagram.lightBulbs[0]!;
    const terminalA = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    const terminalB = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 1)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: terminalA.id, wireColors: ['black'] });
    diagram = addDeviceConduit(diagram, { deviceNodeId: terminalB.id, wireColors: ['white'] });
    const wireA = diagram.wires[0]!.id;
    const wireB = diagram.wires[1]!.id;
    diagram = addWireLinkToDiagram(diagram, wireA, 'end', wireB, 'end');
    const linkId = diagram.wireLinks[0]!.id;

    const tree = buildNavigatorTree({ ...createEmptyJob(), diagram });
    const lightNode = findNavigatorNodeByEntityId(tree, bulb.id);
    const terminalANode = lightNode?.children.find((n) => n.entityId === terminalA.id);
    const terminalBNode = lightNode?.children.find((n) => n.entityId === terminalB.id);
    expect(terminalANode?.children.find((n) => n.entityId === wireA)?.children.some((n) => n.entityId === linkId)).toBe(true);
    expect(terminalBNode?.children.find((n) => n.entityId === wireB)?.children.some((n) => n.entityId === linkId)).toBe(true);
  });

  it('lists hub wires under junction boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes[0]!;
    diagram = addHub(diagram, box.id);
    const hub = diagram.hubs[0]!;
    diagram = addHubConduit(diagram, { hubId: hub.id, wireColors: ['red', 'white'] });

    const tree = buildNavigatorTree({ ...createEmptyJob(), diagram });
    const boxNode = findNavigatorNodeByEntityId(tree, box.id);
    expect(boxNode?.children.some((n) => n.entityId === hub.id && n.kind === 'hub')).toBe(true);
    const hubNode = boxNode?.children.find((n) => n.entityId === hub.id);
    expect(hubNode?.children.filter((n) => n.kind === 'wire')).toHaveLength(2);
  });

  it('lists conduit runs under both connected cables', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 15, GRID_SIZE * 15);
    diagram = addJunctionBox(diagram, GRID_SIZE * 50, GRID_SIZE * 15);
    const boxA = diagram.junctionBoxes.filter((b) => b.type === 'normal')[0]!;
    const boxB = diagram.junctionBoxes.filter((b) => b.type === 'normal')[1]!;
    diagram = addCable(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA.id)!;
    const cabB = diagram.cables.find((c) => c.junctionBoxId === boxB.id)!;
    diagram = connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id });
    const runId = diagram.conduitRuns[0]!.id;

    const tree = buildNavigatorTree({ ...createEmptyJob(), diagram });
    const cableANode = findNavigatorNodeByEntityId(tree, cabA.id);
    const cableBNode = findNavigatorNodeByEntityId(tree, cabB.id);
    expect(cableANode?.children.some((n) => n.entityId === runId && n.kind === 'conduitRun')).toBe(true);
    expect(cableBNode?.children.some((n) => n.entityId === runId && n.kind === 'conduitRun')).toBe(true);
  });

  it('lists cable wires under junction boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white', 'red'],
    });
    const cable = diagram.cables[0]!;

    const tree = buildNavigatorTree({ ...createEmptyJob(), diagram });
    const boxNode = findNavigatorNodeByEntityId(tree, box.id);
    const cableNode = boxNode?.children.find((n) => n.entityId === cable.id);
    expect(cableNode?.kind).toBe('cable');
    expect(cableNode?.children.filter((n) => n.kind === 'wire')).toHaveLength(3);
  });
});

describe('applyFloorPlanToJob', () => {
  it('replaces rooms and areas while keeping wiring in place', () => {
    let job = createJobWithNavigation({ mode: 'sandbox' });
    job = {
      ...job,
      diagram: {
        ...job.diagram,
        lightBulbs: [{ id: 'light-1', label: 'Test', x: 400, y: 300 }],
      },
    };
    const next = applyFloorPlanToJob(job, {
      id: 'fp-new',
      name: 'Updated layout',
      rooms: [{ id: 'bedroom', label: 'Bedroom', x: 0, y: 0, width: 400, height: 300, doors: [] }],
      areas: [{ id: 'zone-a', label: 'Zone A', x: 0, y: 0, width: 800, height: 600 }],
      createdAt: '',
      updatedAt: '',
    });
    expect(next.navigationMode).toBe('floorplan');
    expect(next.floorPlanId).toBe('fp-new');
    expect(next.diagram.rooms).toHaveLength(1);
    expect(next.diagram.rooms[0]?.label).toBe('Bedroom');
    expect(next.diagram.areas).toHaveLength(1);
    expect(next.diagram.lightBulbs).toHaveLength(1);
    expect(next.diagram.lightBulbs[0]?.x).toBe(400);
  });
});
