import { nanoid } from 'nanoid';
import { LIGHT_BULB_RADIUS } from '../domain/device-node-geometry';
import { GRID_SIZE } from '../domain/grid';
import type {
  Cable,
  Conduit,
  ConduitRun,
  DeviceNode,
  Diagram,
  DimmerSwitch,
  Hub,
  HubBridge,
  JunctionBox,
  LightBulb,
  Outlet,
  Room,
  RoomDoor,
  Switch,
  Wire,
  WireLink,
} from '../domain/types';
import type { DiagramSelection } from './diagram-selection';
import { emptySelection } from './diagram-selection';
import { decodePathAnchor, encodePathAnchor, type PathAnchorRef } from './anchor-selection';

/** Grid steps between a duplicate and its source (or between repeated pastes). */
export const DUPLICATE_OFFSET = GRID_SIZE * 4;

export type DuplicateLayoutPaths = {
  wirePaths: Record<string, { points: { x: number; y: number }[] }>;
  exposedPaths: Record<string, { points: { x: number; y: number }[] }>;
  conduitStubPaths: Record<string, { points: { x: number; y: number }[] }>;
  wireLinkPaths: Record<string, { points: { x: number; y: number }[] }>;
  hubWirePaths: Record<string, { points: { x: number; y: number }[] }>;
  deviceWirePaths: Record<string, { points: { x: number; y: number }[] }>;
  conduitPaths: Record<string, { points: { x: number; y: number }[] }>;
  conduitRunPaths: Record<string, { points: { x: number; y: number }[] }>;
};

export type DuplicateClipboard = {
  junctionBoxes: JunctionBox[];
  hubs: Hub[];
  hubBridges: HubBridge[];
  lightBulbs: LightBulb[];
  switches: Switch[];
  dimmerSwitches: DimmerSwitch[];
  outlets: Outlet[];
  rooms: Room[];
  deviceNodes: DeviceNode[];
  wires: Wire[];
  cables: Cable[];
  conduits: Conduit[];
  wireLinks: WireLink[];
  conduitRuns: ConduitRun[];
  layoutPaths: DuplicateLayoutPaths;
  /** Path bend anchors from the source selection (remapped to new ids on paste). */
  pathAnchors: string[];
};

function emptyLayoutPaths(): DuplicateLayoutPaths {
  return {
    wirePaths: {},
    exposedPaths: {},
    conduitStubPaths: {},
    wireLinkPaths: {},
    hubWirePaths: {},
    deviceWirePaths: {},
    conduitPaths: {},
    conduitRunPaths: {},
  };
}

function copyPathPoints(points: { x: number; y: number }[] | undefined): { x: number; y: number }[] {
  return points?.map((p) => ({ ...p })) ?? [];
}

function offsetLayoutPaths(layoutPaths: DuplicateLayoutPaths, dx: number, dy: number): DuplicateLayoutPaths {
  const offsetRecord = (record: Record<string, { points: { x: number; y: number }[] }>) => {
    const out: Record<string, { points: { x: number; y: number }[] }> = {};
    for (const [id, entry] of Object.entries(record)) {
      out[id] = {
        points: entry.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    }
    return out;
  };
  return {
    wirePaths: offsetRecord(layoutPaths.wirePaths),
    exposedPaths: offsetRecord(layoutPaths.exposedPaths),
    conduitStubPaths: offsetRecord(layoutPaths.conduitStubPaths),
    wireLinkPaths: offsetRecord(layoutPaths.wireLinkPaths),
    hubWirePaths: offsetRecord(layoutPaths.hubWirePaths),
    deviceWirePaths: offsetRecord(layoutPaths.deviceWirePaths),
    conduitPaths: offsetRecord(layoutPaths.conduitPaths),
    conduitRunPaths: offsetRecord(layoutPaths.conduitRunPaths),
  };
}

function captureLayoutPaths(
  diagram: Diagram,
  wireIds: Set<string>,
  cableIds: Set<string>,
  conduitIds: Set<string>,
  linkIds: Set<string>,
  runIds: Set<string>,
): DuplicateLayoutPaths {
  const layout = diagram.layout;
  const layoutPaths = emptyLayoutPaths();

  for (const wireId of wireIds) {
    const wirePath = layout.wirePaths?.[wireId]?.points;
    if (wirePath?.length) layoutPaths.wirePaths[wireId] = { points: copyPathPoints(wirePath) };
    const exposed = layout.exposedPaths?.[wireId]?.points;
    if (exposed?.length) layoutPaths.exposedPaths[wireId] = { points: copyPathPoints(exposed) };
    const hubWire = layout.hubWirePaths?.[wireId]?.points;
    if (hubWire?.length) layoutPaths.hubWirePaths[wireId] = { points: copyPathPoints(hubWire) };
    const deviceWire = layout.deviceWirePaths?.[wireId]?.points;
    if (deviceWire?.length) layoutPaths.deviceWirePaths[wireId] = { points: copyPathPoints(deviceWire) };
  }

  for (const cableId of cableIds) {
    const stub = layout.conduitStubPaths?.[cableId]?.points;
    if (stub?.length) layoutPaths.conduitStubPaths[cableId] = { points: copyPathPoints(stub) };
  }

  for (const conduitId of conduitIds) {
    const path = layout.conduitPaths?.[conduitId]?.points;
    if (path?.length) layoutPaths.conduitPaths[conduitId] = { points: copyPathPoints(path) };
  }

  for (const linkId of linkIds) {
    const path = layout.wireLinkPaths?.[linkId]?.points;
    if (path?.length) layoutPaths.wireLinkPaths[linkId] = { points: copyPathPoints(path) };
  }

  for (const runId of runIds) {
    const path = layout.conduitRunPaths?.[runId]?.points;
    if (path?.length) layoutPaths.conduitRunPaths[runId] = { points: copyPathPoints(path) };
  }

  return layoutPaths;
}

function expandWiringForDuplicate(
  diagram: Diagram,
  wireIds: Set<string>,
  cableIds: Set<string>,
  conduitIds: Set<string>,
  junctionBoxIds: Set<string>,
): void {
  for (const cableId of [...cableIds]) {
    const cable = diagram.cables.find((c) => c.id === cableId);
    if (!cable || !junctionBoxIds.has(cable.junctionBoxId)) continue;
    for (const wid of cable.wireIds) wireIds.add(wid);
  }

  for (const wireId of [...wireIds]) {
    const wire = diagram.wires.find((w) => w.id === wireId);
    if (!wire?.cableId) continue;
    const cable = diagram.cables.find((c) => c.id === wire.cableId);
    if (cable && junctionBoxIds.has(cable.junctionBoxId)) {
      cableIds.add(cable.id);
      for (const wid of cable.wireIds) wireIds.add(wid);
    }
  }

  for (const conduitId of [...conduitIds]) {
    const conduit = diagram.conduits.find((c) => c.id === conduitId);
    if (!conduit) continue;
    for (const wid of conduit.wireIds) wireIds.add(wid);
  }

  for (const wireId of [...wireIds]) {
    const wire = diagram.wires.find((w) => w.id === wireId);
    if (!wire?.conduitId) continue;
    const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
    if (!conduit) continue;
    const onBox =
      (conduit.kind === 'local' && junctionBoxIds.has(conduit.junctionBoxId)) ||
      (conduit.kind === 'span' &&
        (junctionBoxIds.has(conduit.junctionBoxIdA) || junctionBoxIds.has(conduit.junctionBoxIdB)));
    if (onBox) {
      conduitIds.add(conduit.id);
      for (const wid of conduit.wireIds) wireIds.add(wid);
    }
  }
}

function pathAnchorInDuplicateScope(
  ref: PathAnchorRef,
  wireIds: Set<string>,
  cableIds: Set<string>,
  conduitIds: Set<string>,
  linkIds: Set<string>,
  runIds: Set<string>,
  bridgeIds: Set<string>,
): boolean {
  switch (ref.kind) {
    case 'wire':
    case 'exposedWire':
    case 'hubWire':
    case 'deviceWire':
      return wireIds.has(ref.wireId);
    case 'conduitStub':
      return cableIds.has(ref.cableId);
    case 'link':
      return linkIds.has(ref.linkId);
    case 'hubBridge':
      return bridgeIds.has(ref.bridgeId);
    case 'conduitRun':
      return runIds.has(ref.runId);
    case 'conduit':
      return conduitIds.has(ref.conduitId);
  }
}

function remapPathAnchorKey(
  key: string,
  wireIdMap: Map<string, string>,
  cableIdMap: Map<string, string>,
  conduitIdMap: Map<string, string>,
  linkIdMap: Map<string, string>,
  bridgeIdMap: Map<string, string>,
  runIdMap: Map<string, string>,
): string | null {
  const ref = decodePathAnchor(key);
  if (!ref) return null;
  switch (ref.kind) {
    case 'wire':
    case 'exposedWire':
    case 'hubWire':
    case 'deviceWire': {
      const wireId = wireIdMap.get(ref.wireId);
      return wireId ? encodePathAnchor({ ...ref, wireId }) : null;
    }
    case 'conduitStub': {
      const cableId = cableIdMap.get(ref.cableId);
      return cableId ? encodePathAnchor({ ...ref, cableId }) : null;
    }
    case 'link': {
      const linkId = linkIdMap.get(ref.linkId);
      return linkId ? encodePathAnchor({ ...ref, linkId }) : null;
    }
    case 'hubBridge': {
      const bridgeId = bridgeIdMap.get(ref.bridgeId);
      return bridgeId ? encodePathAnchor({ ...ref, bridgeId }) : null;
    }
    case 'conduitRun': {
      const runId = runIdMap.get(ref.runId);
      return runId ? encodePathAnchor({ ...ref, runId }) : null;
    }
    case 'conduit': {
      const conduitId = conduitIdMap.get(ref.conduitId);
      return conduitId ? encodePathAnchor({ ...ref, conduitId }) : null;
    }
  }
}

function buildDuplicateSelection(
  junctionBoxes: JunctionBox[],
  hubs: Hub[],
  hubBridges: HubBridge[],
  lightBulbs: LightBulb[],
  switches: Switch[],
  dimmerSwitches: DimmerSwitch[],
  outlets: Outlet[],
  rooms: Room[],
  deviceNodes: DeviceNode[],
  newWires: Wire[],
  newCables: Cable[],
  newConduits: Conduit[],
  newWireLinks: WireLink[],
  newConduitRuns: ConduitRun[],
  remappedPathAnchors: string[],
): DiagramSelection {
  const selection = emptySelection();
  for (const box of junctionBoxes) selection.junctionBoxes.add(box.id);
  for (const hub of hubs) selection.hubs.add(hub.id);
  for (const bridge of hubBridges) selection.hubBridges.add(bridge.id);
  for (const bulb of lightBulbs) selection.lightBulbs.add(bulb.id);
  for (const sw of switches) selection.switches.add(sw.id);
  for (const dim of dimmerSwitches) selection.dimmerSwitches.add(dim.id);
  for (const outlet of outlets) selection.outlets.add(outlet.id);
  for (const room of rooms) selection.rooms.add(room.id);
  for (const node of deviceNodes) selection.deviceNodes.add(node.id);
  for (const wire of newWires) {
    if (wire.hubId) selection.hubWires.add(wire.id);
    else selection.wires.add(wire.id);
  }
  for (const cable of newCables) selection.cables.add(cable.id);
  for (const conduit of newConduits) selection.conduits.add(conduit.id);
  for (const link of newWireLinks) selection.links.add(link.id);
  for (const run of newConduitRuns) selection.conduitRuns.add(run.id);
  for (const key of remappedPathAnchors) selection.pathAnchors.add(key);
  return selection;
}

export function selectionHasDuplicateableContent(selection: DiagramSelection): boolean {
  return (
    selection.junctionBoxes.size > 0 ||
    selection.lightBulbs.size > 0 ||
    selection.switches.size > 0 ||
    selection.dimmerSwitches.size > 0 ||
    selection.outlets.size > 0 ||
    selection.rooms.size > 0
  );
}

function bulbRect(bulb: LightBulb) {
  const d = LIGHT_BULB_RADIUS * 2;
  return { x: bulb.x, y: bulb.y, width: d, height: d };
}

function unionBounds(items: { x: number; y: number; width: number; height: number }[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (items.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of items) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Collect structure-only items from the current selection (no wires/cables/conduits). */
export function captureSelectionForDuplicate(
  diagram: Diagram,
  selection: DiagramSelection,
): DuplicateClipboard | null {
  const junctionBoxIds = new Set(selection.junctionBoxes);
  const lightBulbIds = new Set(selection.lightBulbs);
  const switchIds = new Set(selection.switches);
  const dimmerIds = new Set(selection.dimmerSwitches);
  const outletIds = new Set(selection.outlets);
  const roomIds = new Set(selection.rooms);

  for (const hubId of selection.hubs) {
    const hub = diagram.hubs.find((h) => h.id === hubId);
    if (hub) junctionBoxIds.add(hub.junctionBoxId);
  }

  for (const nodeId of selection.deviceNodes) {
    const node = diagram.deviceNodes.find((n) => n.id === nodeId);
    if (!node) continue;
    if (node.deviceKind === 'lightBulb') lightBulbIds.add(node.deviceId);
    else if (node.deviceKind === 'switch') switchIds.add(node.deviceId);
    else if (node.deviceKind === 'dimmerSwitch') dimmerIds.add(node.deviceId);
    else if (node.deviceKind === 'outlet') outletIds.add(node.deviceId);
  }

  const junctionBoxes = diagram.junctionBoxes.filter((b) => junctionBoxIds.has(b.id));
  const hubs = diagram.hubs.filter((h) => junctionBoxIds.has(h.junctionBoxId));
  const hubIdSet = new Set(hubs.map((h) => h.id));
  const hubBridges = diagram.hubBridges.filter(
    (b) => hubIdSet.has(b.hubIdA) && hubIdSet.has(b.hubIdB),
  );
  const lightBulbs = diagram.lightBulbs.filter((b) => lightBulbIds.has(b.id));
  const switches = diagram.switches.filter((s) => switchIds.has(s.id));
  const dimmerSwitches = (diagram.dimmerSwitches ?? []).filter((d) => dimmerIds.has(d.id));
  const outlets = (diagram.outlets ?? []).filter((o) => outletIds.has(o.id));
  const rooms = (diagram.rooms ?? []).filter((r) => roomIds.has(r.id));

  const deviceIds = new Set([
    ...lightBulbIds,
    ...switchIds,
    ...dimmerIds,
    ...outletIds,
  ]);
  const deviceNodes = diagram.deviceNodes.filter((n) => deviceIds.has(n.deviceId));

  const wireIds = new Set<string>([...selection.wires, ...selection.hubWires]);
  const cableIds = new Set(selection.cables);
  const conduitIds = new Set(selection.conduits);
  const linkIds = new Set(selection.links);
  const runIds = new Set(selection.conduitRuns);

  for (const cableId of selection.cables) {
    const cable = diagram.cables.find((c) => c.id === cableId);
    if (cable) for (const wid of cable.wireIds) wireIds.add(wid);
  }

  for (const conduitId of selection.conduits) {
    const conduit = diagram.conduits.find((c) => c.id === conduitId);
    if (conduit) for (const wid of conduit.wireIds) wireIds.add(wid);
  }

  expandWiringForDuplicate(diagram, wireIds, cableIds, conduitIds, junctionBoxIds);

  for (const link of diagram.wireLinks) {
    if (linkIds.has(link.id)) continue;
    if (wireIds.has(link.wireIdA) && wireIds.has(link.wireIdB)) linkIds.add(link.id);
  }

  for (const run of diagram.conduitRuns) {
    if (runIds.has(run.id)) continue;
    if (cableIds.has(run.cableIdA) && run.cableIdB && cableIds.has(run.cableIdB)) {
      runIds.add(run.id);
      for (const wid of run.wireIds) wireIds.add(wid);
    }
  }

  const wires = diagram.wires.filter((w) => wireIds.has(w.id));
  const cables = diagram.cables.filter((c) => cableIds.has(c.id));
  const conduits = diagram.conduits.filter((c) => conduitIds.has(c.id));
  const wireLinks = diagram.wireLinks.filter((l) => linkIds.has(l.id));
  const conduitRuns = diagram.conduitRuns.filter((r) => runIds.has(r.id));
  const layoutPaths = captureLayoutPaths(diagram, wireIds, cableIds, conduitIds, linkIds, runIds);
  const bridgeIds = new Set(hubBridges.map((b) => b.id));

  const pathAnchors: string[] = [];
  for (const key of selection.pathAnchors) {
    const ref = decodePathAnchor(key);
    if (!ref) continue;
    if (
      pathAnchorInDuplicateScope(ref, wireIds, cableIds, conduitIds, linkIds, runIds, bridgeIds)
    ) {
      pathAnchors.push(key);
    }
  }

  if (
    junctionBoxes.length +
      lightBulbs.length +
      switches.length +
      dimmerSwitches.length +
      outlets.length +
      rooms.length +
      wires.length ===
    0
  ) {
    return null;
  }

  return {
    junctionBoxes: junctionBoxes.map((b) => ({ ...b })),
    hubs: hubs.map((h) => ({ ...h })),
    hubBridges: hubBridges.map((b) => ({ ...b })),
    lightBulbs: lightBulbs.map((b) => ({ ...b })),
    switches: switches.map((s) => ({ ...s })),
    dimmerSwitches: dimmerSwitches.map((d) => ({ ...d })),
    outlets: outlets.map((o) => ({ ...o })),
    rooms: rooms.map((r) => ({ ...r, doors: (r.doors ?? []).map((d) => ({ ...d })) })),
    deviceNodes: deviceNodes.map((n) => ({ ...n })),
    wires: wires.map((w) => ({ ...w })),
    cables: cables.map((c) => ({ ...c, wireIds: [...c.wireIds] })),
    conduits: conduits.map((c) => ({ ...c, wireIds: [...c.wireIds] })),
    wireLinks: wireLinks.map((l) => ({ ...l })),
    conduitRuns: conduitRuns.map((r) => ({ ...r, wireIds: [...r.wireIds] })),
    layoutPaths,
    pathAnchors,
  };
}

function cloneRoomDoors(doors: RoomDoor[]): RoomDoor[] {
  return doors.map((d) => ({ ...d, id: nanoid() }));
}

/** Paste a captured clipboard onto the diagram, offset by dx/dy, returning the new selection. */
export function duplicateClipboardOntoDiagram(
  diagram: Diagram,
  clipboard: DuplicateClipboard,
  dx: number,
  dy: number,
): { diagram: Diagram; selection: DiagramSelection } {
  const boxIdMap = new Map<string, string>();
  const hubIdMap = new Map<string, string>();
  const bridgeIdMap = new Map<string, string>();
  const deviceIdMap = new Map<string, string>();

  const junctionBoxes: JunctionBox[] = clipboard.junctionBoxes.map((box) => {
    const id = nanoid();
    boxIdMap.set(box.id, id);
    return { ...box, id, x: box.x + dx, y: box.y + dy };
  });

  const hubs: Hub[] = clipboard.hubs.map((hub) => {
    const id = nanoid();
    hubIdMap.set(hub.id, id);
    const junctionBoxId = boxIdMap.get(hub.junctionBoxId);
    if (!junctionBoxId) throw new Error('Hub clipboard missing parent junction box');
    return { ...hub, id, junctionBoxId };
  });

  const hubBridges: HubBridge[] = clipboard.hubBridges.flatMap((bridge) => {
    const hubIdA = hubIdMap.get(bridge.hubIdA);
    const hubIdB = hubIdMap.get(bridge.hubIdB);
    if (!hubIdA || !hubIdB) return [];
    const id = nanoid();
    bridgeIdMap.set(bridge.id, id);
    return [{ id, hubIdA, hubIdB }];
  });

  const lightBulbs: LightBulb[] = clipboard.lightBulbs.map((bulb) => {
    const id = nanoid();
    deviceIdMap.set(bulb.id, id);
    return { ...bulb, id, x: bulb.x + dx, y: bulb.y + dy };
  });

  const switches: Switch[] = clipboard.switches.map((sw) => {
    const id = nanoid();
    deviceIdMap.set(sw.id, id);
    return { ...sw, id, x: sw.x + dx, y: sw.y + dy };
  });

  const dimmerSwitches: DimmerSwitch[] = clipboard.dimmerSwitches.map((dim) => {
    const id = nanoid();
    deviceIdMap.set(dim.id, id);
    return { ...dim, id, x: dim.x + dx, y: dim.y + dy };
  });

  const outlets: Outlet[] = clipboard.outlets.map((outlet) => {
    const id = nanoid();
    deviceIdMap.set(outlet.id, id);
    return { ...outlet, id, x: outlet.x + dx, y: outlet.y + dy };
  });

  const rooms: Room[] = clipboard.rooms.map((room) => ({
    ...room,
    id: nanoid(),
    x: room.x + dx,
    y: room.y + dy,
    doors: cloneRoomDoors(room.doors ?? []),
  }));

  const deviceNodeIdMap = new Map<string, string>();
  const deviceNodes: DeviceNode[] = clipboard.deviceNodes.flatMap((node) => {
    const deviceId = deviceIdMap.get(node.deviceId);
    if (!deviceId) return [];
    const id = nanoid();
    deviceNodeIdMap.set(node.id, id);
    return [{ ...node, id, deviceId }];
  });

  const wireIdMap = new Map<string, string>();
  for (const wire of clipboard.wires) {
    wireIdMap.set(wire.id, nanoid());
  }

  const conduitIdMap = new Map<string, string>();
  const newConduits: Conduit[] = [];
  for (const conduit of clipboard.conduits) {
    const id = nanoid();
    conduitIdMap.set(conduit.id, id);
    const wireIds = conduit.wireIds.map((wid) => wireIdMap.get(wid)).filter((wid): wid is string => Boolean(wid));
    if (conduit.kind === 'local') {
      const junctionBoxId = boxIdMap.get(conduit.junctionBoxId);
      if (!junctionBoxId) continue;
      newConduits.push({ ...conduit, id, junctionBoxId, wireIds });
      continue;
    }
    if (conduit.kind === 'span') {
      const junctionBoxIdA = boxIdMap.get(conduit.junctionBoxIdA);
      const junctionBoxIdB = boxIdMap.get(conduit.junctionBoxIdB);
      if (!junctionBoxIdA || !junctionBoxIdB) continue;
      newConduits.push({ ...conduit, id, junctionBoxIdA, junctionBoxIdB, wireIds });
      continue;
    }
    if (conduit.kind === 'device') {
      const deviceNodeId = deviceNodeIdMap.get(conduit.deviceNodeId);
      if (!deviceNodeId) continue;
      newConduits.push({ ...conduit, id, deviceNodeId, wireIds });
      continue;
    }
    const hubId = hubIdMap.get(conduit.hubId);
    if (!hubId) continue;
    newConduits.push({ ...conduit, id, hubId, wireIds });
  }

  const cableIdMap = new Map<string, string>();
  const newCables: Cable[] = clipboard.cables.flatMap((cable) => {
    const junctionBoxId = boxIdMap.get(cable.junctionBoxId);
    if (!junctionBoxId) return [];
    const id = nanoid();
    cableIdMap.set(cable.id, id);
    const wireIds = cable.wireIds.map((wid) => wireIdMap.get(wid)).filter((wid): wid is string => Boolean(wid));
    return [{ ...cable, id, junctionBoxId, wireIds }];
  });

  const newWires: Wire[] = clipboard.wires.flatMap((wire) => {
    const id = wireIdMap.get(wire.id);
    if (!id) return [];
    return [
      {
        ...wire,
        id,
        cableId: wire.cableId ? (cableIdMap.get(wire.cableId) ?? null) : null,
        conduitId: wire.conduitId ? (conduitIdMap.get(wire.conduitId) ?? null) : null,
        hubId: wire.hubId ? (hubIdMap.get(wire.hubId) ?? null) : null,
        deviceNodeId: wire.deviceNodeId ? (deviceNodeIdMap.get(wire.deviceNodeId) ?? null) : null,
        breakerId: null,
      },
    ];
  });

  const linkIdMap = new Map<string, string>();
  const newWireLinks: WireLink[] = clipboard.wireLinks.flatMap((link) => {
    const wireIdA = wireIdMap.get(link.wireIdA);
    const wireIdB = wireIdMap.get(link.wireIdB);
    if (!wireIdA || !wireIdB) return [];
    const id = nanoid();
    linkIdMap.set(link.id, id);
    return [{ ...link, id, wireIdA, wireIdB }];
  });

  const runIdMap = new Map<string, string>();
  const newConduitRuns: ConduitRun[] = clipboard.conduitRuns.flatMap((run) => {
    const cableIdA = cableIdMap.get(run.cableIdA);
    if (!cableIdA) return [];
    let cableIdB: string | null = null;
    if (run.cableIdB) {
      const mapped = cableIdMap.get(run.cableIdB);
      if (!mapped) return [];
      cableIdB = mapped;
    }
    const id = nanoid();
    runIdMap.set(run.id, id);
    const wireIds = run.wireIds.map((wid) => wireIdMap.get(wid)).filter((wid): wid is string => Boolean(wid));
    return [{ ...run, id, cableIdA, cableIdB, wireIds }];
  });

  const remapPathRecord = (
    record: Record<string, { points: { x: number; y: number }[] }>,
    idMap: Map<string, string>,
  ) => {
    const out: Record<string, { points: { x: number; y: number }[] }> = {};
    for (const [oldId, entry] of Object.entries(record)) {
      const newId = idMap.get(oldId);
      if (!newId) continue;
      out[newId] = {
        points: entry.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    }
    return out;
  };

  const pastedLayout = {
    wirePaths: remapPathRecord(clipboard.layoutPaths.wirePaths, wireIdMap),
    exposedPaths: remapPathRecord(clipboard.layoutPaths.exposedPaths, wireIdMap),
    hubWirePaths: remapPathRecord(clipboard.layoutPaths.hubWirePaths, wireIdMap),
    deviceWirePaths: remapPathRecord(clipboard.layoutPaths.deviceWirePaths, wireIdMap),
    conduitStubPaths: remapPathRecord(clipboard.layoutPaths.conduitStubPaths, cableIdMap),
    conduitPaths: remapPathRecord(clipboard.layoutPaths.conduitPaths, conduitIdMap),
    wireLinkPaths: remapPathRecord(clipboard.layoutPaths.wireLinkPaths, linkIdMap),
    conduitRunPaths: remapPathRecord(clipboard.layoutPaths.conduitRunPaths, runIdMap),
  };

  const remappedPathAnchors = (clipboard.pathAnchors ?? [])
    .map((key) =>
      remapPathAnchorKey(key, wireIdMap, cableIdMap, conduitIdMap, linkIdMap, bridgeIdMap, runIdMap),
    )
    .filter((key): key is string => Boolean(key));

  const selection = buildDuplicateSelection(
    junctionBoxes,
    hubs,
    hubBridges,
    lightBulbs,
    switches,
    dimmerSwitches,
    outlets,
    rooms,
    deviceNodes,
    newWires,
    newCables,
    newConduits,
    newWireLinks,
    newConduitRuns,
    remappedPathAnchors,
  );

  return {
    diagram: {
      ...diagram,
      junctionBoxes: [...diagram.junctionBoxes, ...junctionBoxes],
      hubs: [...diagram.hubs, ...hubs],
      hubBridges: [...diagram.hubBridges, ...hubBridges],
      lightBulbs: [...diagram.lightBulbs, ...lightBulbs],
      switches: [...diagram.switches, ...switches],
      dimmerSwitches: [...(diagram.dimmerSwitches ?? []), ...dimmerSwitches],
      outlets: [...(diagram.outlets ?? []), ...outlets],
      rooms: [...(diagram.rooms ?? []), ...rooms],
      deviceNodes: [...diagram.deviceNodes, ...deviceNodes],
      wires: [...diagram.wires, ...newWires],
      cables: [...diagram.cables, ...newCables],
      conduits: [...diagram.conduits, ...newConduits],
      wireLinks: [...diagram.wireLinks, ...newWireLinks],
      conduitRuns: [...diagram.conduitRuns, ...newConduitRuns],
      layout: {
        ...diagram.layout,
        wirePaths: { ...(diagram.layout.wirePaths ?? {}), ...pastedLayout.wirePaths },
        exposedPaths: { ...(diagram.layout.exposedPaths ?? {}), ...pastedLayout.exposedPaths },
        hubWirePaths: { ...(diagram.layout.hubWirePaths ?? {}), ...pastedLayout.hubWirePaths },
        deviceWirePaths: { ...(diagram.layout.deviceWirePaths ?? {}), ...pastedLayout.deviceWirePaths },
        conduitStubPaths: { ...(diagram.layout.conduitStubPaths ?? {}), ...pastedLayout.conduitStubPaths },
        conduitPaths: { ...diagram.layout.conduitPaths, ...pastedLayout.conduitPaths },
        wireLinkPaths: { ...diagram.layout.wireLinkPaths, ...pastedLayout.wireLinkPaths },
        conduitRunPaths: { ...diagram.layout.conduitRunPaths, ...pastedLayout.conduitRunPaths },
      },
    },
    selection,
  };
}

/** Shift every item in the clipboard by dx/dy (for repeated paste stacking). */
export function shiftDuplicateClipboard(clipboard: DuplicateClipboard, dx: number, dy: number): DuplicateClipboard {
  return {
    junctionBoxes: clipboard.junctionBoxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })),
    hubs: clipboard.hubs.map((h) => ({ ...h })),
    hubBridges: clipboard.hubBridges.map((b) => ({ ...b })),
    lightBulbs: clipboard.lightBulbs.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })),
    switches: clipboard.switches.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
    dimmerSwitches: clipboard.dimmerSwitches.map((d) => ({ ...d, x: d.x + dx, y: d.y + dy })),
    outlets: clipboard.outlets.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
    rooms: clipboard.rooms.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy, doors: r.doors.map((d) => ({ ...d })) })),
    deviceNodes: clipboard.deviceNodes.map((n) => ({ ...n })),
    wires: clipboard.wires.map((w) => ({ ...w })),
    cables: clipboard.cables.map((c) => ({ ...c, wireIds: [...c.wireIds] })),
    conduits: clipboard.conduits.map((c) => ({ ...c, wireIds: [...c.wireIds] })),
    wireLinks: clipboard.wireLinks.map((l) => ({ ...l })),
    conduitRuns: clipboard.conduitRuns.map((r) => ({ ...r, wireIds: [...r.wireIds] })),
    layoutPaths: offsetLayoutPaths(clipboard.layoutPaths, dx, dy),
    pathAnchors: [...(clipboard.pathAnchors ?? [])],
  };
}

/** Bounds of clipboard content for optional viewport framing. */
export function duplicateClipboardBounds(clipboard: DuplicateClipboard) {
  const rects = [
    ...clipboard.junctionBoxes,
    ...clipboard.lightBulbs.map(bulbRect),
    ...clipboard.switches,
    ...clipboard.dimmerSwitches,
    ...clipboard.outlets,
    ...clipboard.rooms,
  ];
  return unionBounds(rects);
}
