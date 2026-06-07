import {
  deviceNodeWorldPoint,
  deviceNodesForDevice,
  wireIdsOnDeviceTerminal,
} from '../domain/device-node-geometry';
import { hubById, hubWorldPoint } from '../domain/hub-geometry';
import { wiresOnHub } from '../domain/mutations';
import type {
  AnchorPosition,
  ConduitRun,
  DeviceNode,
  Diagram,
  Job,
  JunctionBox,
  Wire,
  WireLink,
} from '../domain/types';
import { wireLinksForWire } from '../domain/wire-link-utils';
import {
  conduitRunContentBounds,
  wireContentBounds,
  wireLinkContentBounds,
  type Bounds,
} from './diagram-bounds';
import { entityCenterFromBounds, roomForEntityCenter } from '../domain/spatial-room-index';

export type NavigatorNodeKind =
  | 'floorplan'
  | 'area'
  | 'room'
  | 'junctionBox'
  | 'hub'
  | 'cable'
  | 'lightBulb'
  | 'switch'
  | 'dimmerSwitch'
  | 'outlet'
  | 'deviceNode'
  | 'wire'
  | 'wireLink'
  | 'conduitRun'
  | 'unassigned';

export interface NavigatorNode {
  /** Unique within the tree (React keys, expand/collapse state). */
  id: string;
  kind: NavigatorNodeKind;
  label: string;
  bounds: Bounds | null;
  children: NavigatorNode[];
  /** Canvas entity id when it differs from `id`. */
  entityId?: string;
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

function pointBounds(point: { x: number; y: number }, pad = 32): Bounds {
  return { x: point.x - pad, y: point.y - pad, width: pad * 2, height: pad * 2 };
}

function unionWireBounds(diagram: Diagram, wireIds: readonly string[], fallback: Bounds | null): Bounds | null {
  let acc: Bounds | null = null;
  for (const wireId of wireIds) {
    const bounds = wireContentBounds(diagram, wireId);
    if (!bounds) continue;
    if (!acc) {
      acc = bounds;
      continue;
    }
    const x1 = Math.min(acc.x, bounds.x);
    const y1 = Math.min(acc.y, bounds.y);
    const x2 = Math.max(acc.x + acc.width, bounds.x + bounds.width);
    const y2 = Math.max(acc.y + acc.height, bounds.y + bounds.height);
    acc = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
  return acc ?? fallback;
}

function anchorSortKey(anchor: AnchorPosition): number {
  const order: AnchorPosition[] = [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ];
  return order.indexOf(anchor);
}

function cableDisplayLabel(diagram: Diagram, cableId: string, box?: JunctionBox): string {
  const cable = diagram.cables.find((c) => c.id === cableId);
  if (!cable) return 'Cable';
  const label = (cable.label ?? '').trim();
  if (label.length > 0) return label;
  const host =
    box ?? diagram.junctionBoxes.find((b) => b.id === cable.junctionBoxId);
  const boxLabel = deviceLabel(
    host?.label ?? '',
    host?.type === 'breaker' ? 'Breaker panel' : 'Junction box',
  );
  if (cable.role === 'breaker') return `${boxLabel} · breaker`;
  return `${boxLabel} · ${cable.anchor}`;
}

function conduitRunsForCable(diagram: Diagram, cableId: string): ConduitRun[] {
  return diagram.conduitRuns.filter((run) => run.cableIdA === cableId || run.cableIdB === cableId);
}

function conduitRunLabel(diagram: Diagram, run: ConduitRun, viaCableId: string): string {
  const peerId = run.cableIdA === viaCableId ? run.cableIdB : run.cableIdA;
  if (!peerId) return 'Conduit (open)';
  return `Conduit → ${cableDisplayLabel(diagram, peerId)}`;
}

function buildConduitRunNode(diagram: Diagram, run: ConduitRun, viaCableId: string): NavigatorNode {
  return {
    id: `nav:conduit-run:${run.id}:via:${viaCableId}`,
    kind: 'conduitRun',
    entityId: run.id,
    label: conduitRunLabel(diagram, run, viaCableId),
    bounds: conduitRunContentBounds(diagram, run.id),
    children: [],
  };
}

function wireDisplayLabel(wire: Wire): string {
  const label = wire.label.trim();
  return label.length > 0 ? label : `${wire.color} wire`;
}

function wireLinkLabel(diagram: Diagram, link: WireLink, viaWireId: string): string {
  const peerId = link.wireIdA === viaWireId ? link.wireIdB : link.wireIdA;
  const peer = diagram.wires.find((w) => w.id === peerId);
  const peerLabel = peer ? wireDisplayLabel(peer) : 'wire';
  return `Link → ${peerLabel}`;
}

export function deviceTerminalLabel(diagram: Diagram, node: DeviceNode): string {
  if (node.deviceKind === 'outlet') {
    const outlet = diagram.outlets.find((o) => o.id === node.deviceId);
    const slotNames = outlet?.passthrough
      ? ['Hot in', 'Hot out', 'Neutral in', 'Neutral out']
      : ['Hot', 'Neutral'];
    return slotNames[node.slot] ?? `Terminal ${node.slot + 1}`;
  }
  if (node.deviceKind === 'switch') {
    const sw = diagram.switches.find((s) => s.id === node.deviceId);
    if (sw?.terminalCount === 3) {
      if (node.slot === 0) return 'Common';
      if (node.slot === 1) return 'Traveler A';
      if (node.slot === 2) return 'Traveler B';
    }
    if (sw?.terminalCount === 4) {
      return ['Terminal 1', 'Terminal 2', 'Terminal 3', 'Terminal 4'][node.slot] ?? `Terminal ${node.slot + 1}`;
    }
    return node.slot === 0 ? 'Terminal 1' : 'Terminal 2';
  }
  if (node.deviceKind === 'dimmerSwitch') {
    return node.slot === 0 ? 'Line' : 'Load';
  }
  return `Terminal ${node.slot + 1}`;
}

function buildWireNode(diagram: Diagram, wireId: string): NavigatorNode {
  const wire = diagram.wires.find((w) => w.id === wireId);
  const links = wireLinksForWire(diagram, wireId);
  return {
    id: `nav:wire:${wireId}`,
    kind: 'wire',
    entityId: wireId,
    label: wire ? wireDisplayLabel(wire) : wireId,
    bounds: wireContentBounds(diagram, wireId),
    children: links.map((link) => ({
      id: `nav:link:${link.id}:via:${wireId}`,
      kind: 'wireLink',
      entityId: link.id,
      label: wireLinkLabel(diagram, link, wireId),
      bounds: wireLinkContentBounds(diagram, link.id),
      children: [],
    })),
  };
}

function buildTerminalNode(diagram: Diagram, node: DeviceNode): NavigatorNode {
  const pt = deviceNodeWorldPoint(diagram, node);
  const wireIds = wireIdsOnDeviceTerminal(diagram, node.id);
  return {
    id: `nav:terminal:${node.id}`,
    kind: 'deviceNode',
    entityId: node.id,
    label: deviceTerminalLabel(diagram, node),
    bounds: pt ? pointBounds(pt) : null,
    children: wireIds.map((wireId) => buildWireNode(diagram, wireId)),
  };
}

function buildHubNode(diagram: Diagram, hubId: string): NavigatorNode {
  const hub = hubById(diagram, hubId);
  const box = hub ? diagram.junctionBoxes.find((b) => b.id === hub.junctionBoxId) : undefined;
  const pt = hub && box ? hubWorldPoint(box, hub) : null;
  const wires = wiresOnHub(diagram, hubId);
  return {
    id: `nav:hub:${hubId}`,
    kind: 'hub',
    entityId: hubId,
    label: deviceLabel(hub?.label ?? '', 'Hub'),
    bounds: pt ? pointBounds(pt) : null,
    children: wires.map((wire) => buildWireNode(diagram, wire.id)),
  };
}

function buildCableNode(diagram: Diagram, cableId: string, box: JunctionBox): NavigatorNode {
  const cable = diagram.cables.find((c) => c.id === cableId);
  const wireIds = cable?.wireIds ?? [];
  const fallback = boxBounds(box);
  const runs = conduitRunsForCable(diagram, cableId);
  return {
    id: `nav:cable:${cableId}`,
    kind: 'cable',
    entityId: cableId,
    label: cableDisplayLabel(diagram, cableId, box),
    bounds: unionWireBounds(diagram, wireIds, fallback),
    children: [
      ...runs.map((run) => buildConduitRunNode(diagram, run, cableId)),
      ...wireIds.map((wireId) => buildWireNode(diagram, wireId)),
    ],
  };
}

function buildJunctionBoxNode(diagram: Diagram, box: JunctionBox): NavigatorNode {
  const hubs = diagram.hubs
    .filter((h) => h.junctionBoxId === box.id)
    .sort((a, b) => a.slot - b.slot)
    .map((h) => buildHubNode(diagram, h.id));
  const cables = diagram.cables
    .filter((c) => c.junctionBoxId === box.id)
    .sort((a, b) => anchorSortKey(a.anchor) - anchorSortKey(b.anchor))
    .map((c) => buildCableNode(diagram, c.id, box));
  return {
    id: box.id,
    kind: 'junctionBox',
    label: deviceLabel(box.label, box.type === 'breaker' ? 'Breaker panel' : 'Junction box'),
    bounds: boxBounds(box),
    children: [...hubs, ...cables],
  };
}

function attachDeviceTerminals(
  diagram: Diagram,
  deviceNode: NavigatorNode,
  deviceKind: DeviceNode['deviceKind'],
  deviceId: string,
): NavigatorNode {
  const terminals = deviceNodesForDevice(diagram, deviceKind, deviceId).map((node) =>
    buildTerminalNode(diagram, node),
  );
  if (terminals.length === 0) return deviceNode;
  return { ...deviceNode, children: terminals };
}

export function navigatorEntityId(node: NavigatorNode): string {
  return node.entityId ?? node.id;
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
    addToRoom(buildJunctionBoxNode(diagram, box), entityCenterFromBounds(box));
  }

  for (const bulb of diagram.lightBulbs) {
    const bounds = bulbBounds(bulb);
    addToRoom(
      attachDeviceTerminals(
        diagram,
        {
          id: bulb.id,
          kind: 'lightBulb',
          label: deviceLabel(bulb.label, 'Light'),
          bounds,
          children: [],
        },
        'lightBulb',
        bulb.id,
      ),
      entityCenterFromBounds(bounds),
    );
  }

  for (const sw of diagram.switches) {
    addToRoom(
      attachDeviceTerminals(
        diagram,
        {
          id: sw.id,
          kind: 'switch',
          label: deviceLabel(sw.label, 'Switch'),
          bounds: boxBounds(sw),
          children: [],
        },
        'switch',
        sw.id,
      ),
      entityCenterFromBounds(sw),
    );
  }

  for (const dim of diagram.dimmerSwitches ?? []) {
    addToRoom(
      attachDeviceTerminals(
        diagram,
        {
          id: dim.id,
          kind: 'dimmerSwitch',
          label: deviceLabel(dim.label, 'Dimmer'),
          bounds: boxBounds(dim),
          children: [],
        },
        'dimmerSwitch',
        dim.id,
      ),
      entityCenterFromBounds(dim),
    );
  }

  for (const outlet of diagram.outlets ?? []) {
    addToRoom(
      attachDeviceTerminals(
        diagram,
        {
          id: outlet.id,
          kind: 'outlet',
          label: deviceLabel(outlet.label, 'Outlet'),
          bounds: boxBounds(outlet),
          children: [],
        },
        'outlet',
        outlet.id,
      ),
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

export function findNavigatorNodeByEntityId(root: NavigatorNode, entityId: string): NavigatorNode | null {
  if (navigatorEntityId(root) === entityId && root.kind !== 'floorplan') return root;
  for (const child of root.children) {
    const found = findNavigatorNodeByEntityId(child, entityId);
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
