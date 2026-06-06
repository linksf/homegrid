import { entityCenterFromBounds, roomForEntityCenter } from '../domain/spatial-room-index';
import type { Diagram, Job } from '../domain/types';
import type { Bounds } from './diagram-bounds';

export type NavigatorNodeKind =
  | 'floorplan'
  | 'area'
  | 'room'
  | 'junctionBox'
  | 'lightBulb'
  | 'switch'
  | 'dimmerSwitch'
  | 'outlet'
  | 'unassigned';

export interface NavigatorNode {
  id: string;
  kind: NavigatorNodeKind;
  label: string;
  bounds: Bounds | null;
  children: NavigatorNode[];
}

function deviceLabel(label: string, fallback: string): string {
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function roomBounds(room: { x: number; y: number; width: number; height: number }): Bounds {
  return { x: room.x, y: room.y, width: room.width, height: room.height };
}

function boxBounds(box: { x: number; y: number; width: number; height: number }): Bounds {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function bulbBounds(bulb: { x: number; y: number }): Bounds {
  const size = 48;
  return { x: bulb.x, y: bulb.y, width: size, height: size };
}

export function buildNavigatorTree(job: Job): NavigatorNode {
  const diagram = job.diagram;
  const rootLabel =
    job.navigationMode === 'floorplan'
      ? job.floorPlanName?.trim() || 'Floor plan'
      : 'Sandbox';

  const roomNodes = new Map<string, NavigatorNode>();
  for (const room of diagram.rooms ?? []) {
    roomNodes.set(room.id, {
      id: room.id,
      kind: 'room',
      label: deviceLabel(room.label, 'Room'),
      bounds: roomBounds(room),
      children: [],
    });
  }

  const unassigned: NavigatorNode = {
    id: '__unassigned__',
    kind: 'unassigned',
    label: 'Unassigned',
    bounds: null,
    children: [],
  };

  function addToRoom(entity: NavigatorNode, center: { x: number; y: number }): void {
    const room = roomForEntityCenter(diagram, center);
    if (room && roomNodes.has(room.id)) {
      roomNodes.get(room.id)!.children.push(entity);
    } else {
      unassigned.children.push(entity);
    }
  }

  for (const box of diagram.junctionBoxes) {
    const center = entityCenterFromBounds(box);
    addToRoom(
      {
        id: box.id,
        kind: 'junctionBox',
        label: deviceLabel(box.label, box.type === 'breaker' ? 'Breaker panel' : 'Junction box'),
        bounds: boxBounds(box),
        children: [],
      },
      center,
    );
  }

  for (const bulb of diagram.lightBulbs) {
    const bounds = bulbBounds(bulb);
    addToRoom(
      {
        id: bulb.id,
        kind: 'lightBulb',
        label: deviceLabel(bulb.label, 'Light'),
        bounds,
        children: [],
      },
      entityCenterFromBounds(bounds),
    );
  }

  for (const sw of diagram.switches) {
    addToRoom(
      {
        id: sw.id,
        kind: 'switch',
        label: deviceLabel(sw.label, 'Switch'),
        bounds: boxBounds(sw),
        children: [],
      },
      entityCenterFromBounds(sw),
    );
  }

  for (const dim of diagram.dimmerSwitches ?? []) {
    addToRoom(
      {
        id: dim.id,
        kind: 'dimmerSwitch',
        label: deviceLabel(dim.label, 'Dimmer'),
        bounds: boxBounds(dim),
        children: [],
      },
      entityCenterFromBounds(dim),
    );
  }

  for (const outlet of diagram.outlets ?? []) {
    addToRoom(
      {
        id: outlet.id,
        kind: 'outlet',
        label: deviceLabel(outlet.label, 'Outlet'),
        bounds: boxBounds(outlet),
        children: [],
      },
      entityCenterFromBounds(outlet),
    );
  }

  const areaNodes: NavigatorNode[] = (diagram.areas ?? []).map((area) => ({
    id: area.id,
    kind: 'area' as const,
    label: deviceLabel(area.label, 'Area'),
    bounds: roomBounds(area),
    children: [],
  }));

  const children: NavigatorNode[] = [
    ...areaNodes,
    ...[...roomNodes.values()].sort((a, b) => a.label.localeCompare(b.label)),
  ];
  if (unassigned.children.length > 0) {
    children.push(unassigned);
  }

  const allBounds = children
    .map((c) => c.bounds)
    .filter((b): b is Bounds => b !== null);

  let rootBounds: Bounds | null = null;
  if (allBounds.length > 0) {
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const b of allBounds) {
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.width);
      y2 = Math.max(y2, b.y + b.height);
    }
    rootBounds = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  return {
    id: '__floorplan__',
    kind: 'floorplan',
    label: rootLabel,
    bounds: rootBounds,
    children,
  };
}

export function findNavigatorNode(root: NavigatorNode, nodeId: string): NavigatorNode | null {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const found = findNavigatorNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function ancestorPath(root: NavigatorNode, nodeId: string): string[] {
  function walk(node: NavigatorNode, path: string[]): string[] | null {
    const nextPath = [...path, node.id];
    if (node.id === nodeId) return nextPath;
    for (const child of node.children) {
      const found = walk(child, nextPath);
      if (found) return found;
    }
    return null;
  }
  return walk(root, []) ?? [];
}

export function diagramFloorPlanBounds(diagram: Diagram): Bounds | null {
  const rooms = diagram.rooms ?? [];
  const areas = diagram.areas ?? [];
  const rects = [...rooms, ...areas];
  if (rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
