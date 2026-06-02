import { moveLightBulb, moveSwitch, moveDimmerSwitch, moveOutlet } from '../domain/device-mutations';
import { deviceNodeById, deviceNodeWorldPoint } from '../domain/device-node-geometry';
import { hubById, hubWorldPoint } from '../domain/hub-geometry';
import { hubWireAnchorPoint } from '../domain/hub-wire-geometry';
import { moveJunctionBox } from '../domain/mutations';
import {
  defaultFivePointPath,
  hasCustomLinkPathShape,
  normalizeLinkPath,
} from '../domain/path-editing';
import { moveRoom } from '../domain/room-mutations';
import { refreshConduitRunPaths } from '../domain/conduit-run-geometry';
import type { Conduit, ConduitRun, Diagram, HubBridge, WireLink } from '../domain/types';
import { wireLinkEndpoint } from '../domain/wire-geometry';
import {
  conduitUsesPerWirePaths,
} from '../domain/path-editing';
import {
  resolveWirePath,
  wireEndpointRoles,
} from '../domain/wire-routing';
import {
  decodePathAnchor,
  junctionBoxIdsFromAnchorKeys,
  movePathAnchor,
  pathAnchorWorldPoint,
  type PathAnchorRef,
} from './anchor-selection';
import type { DiagramSelection } from './diagram-selection';

type Point = { x: number; y: number };

export type ConnectionPathBaselines = {
  wireLinks: Record<string, Point[]>;
  hubBridges: Record<string, Point[]>;
  deviceWires: Record<string, Point[]>;
  hubWires: Record<string, Point[]>;
  exposedWires: Record<string, Point[]>;
  conduitStubs: Record<string, Point[]>;
  wirePaths: Record<string, Point[]>;
  conduitPaths: Record<string, Point[]>;
  conduitRunPaths: Record<string, Point[]>;
};

function emptyConnectionBaselines(): ConnectionPathBaselines {
  return {
    wireLinks: {},
    hubBridges: {},
    deviceWires: {},
    hubWires: {},
    exposedWires: {},
    conduitStubs: {},
    wirePaths: {},
    conduitPaths: {},
    conduitRunPaths: {},
  };
}

export type SelectionMoveSnapshot = {
  junctionBoxes: Map<string, { x: number; y: number }>;
  lightBulbs: Map<string, { x: number; y: number }>;
  switches: Map<string, { x: number; y: number }>;
  dimmerSwitches: Map<string, { x: number; y: number }>;
  outlets: Map<string, { x: number; y: number }>;
  rooms: Map<string, { x: number; y: number }>;
  pathAnchors: Map<string, { x: number; y: number }>;
  connectionBaselines: ConnectionPathBaselines;
};

/** Capture start positions for every movable item in the current selection. */
export function captureSelectionMoveSnapshot(
  diagram: Diagram,
  selection: DiagramSelection,
): SelectionMoveSnapshot {
  const junctionBoxIds = new Set(selection.junctionBoxes);
  for (const boxId of junctionBoxIdsFromAnchorKeys(selection.junctionAnchors)) {
    junctionBoxIds.add(boxId);
  }

  const junctionBoxes = new Map<string, { x: number; y: number }>();
  for (const id of junctionBoxIds) {
    const box = diagram.junctionBoxes.find((b) => b.id === id);
    if (box) junctionBoxes.set(id, { x: box.x, y: box.y });
  }

  const lightBulbs = new Map<string, { x: number; y: number }>();
  for (const id of selection.lightBulbs) {
    const bulb = diagram.lightBulbs.find((b) => b.id === id);
    if (bulb) lightBulbs.set(id, { x: bulb.x, y: bulb.y });
  }

  const switches = new Map<string, { x: number; y: number }>();
  for (const id of selection.switches) {
    const sw = diagram.switches.find((s) => s.id === id);
    if (sw) switches.set(id, { x: sw.x, y: sw.y });
  }

  const dimmerSwitches = new Map<string, { x: number; y: number }>();
  for (const id of selection.dimmerSwitches) {
    const dim = diagram.dimmerSwitches?.find((d) => d.id === id);
    if (dim) dimmerSwitches.set(id, { x: dim.x, y: dim.y });
  }

  const outlets = new Map<string, { x: number; y: number }>();
  for (const id of selection.outlets) {
    const outlet = diagram.outlets?.find((o) => o.id === id);
    if (outlet) outlets.set(id, { x: outlet.x, y: outlet.y });
  }

  const rooms = new Map<string, { x: number; y: number }>();
  for (const id of selection.rooms) {
    const room = diagram.rooms?.find((r) => r.id === id);
    if (room) rooms.set(id, { x: room.x, y: room.y });
  }

  const pathAnchors = new Map<string, { x: number; y: number }>();
  for (const key of selection.pathAnchors) {
    const ref = decodePathAnchor(key);
    if (!ref) continue;
    const pt = pathAnchorWorldPoint(diagram, ref);
    if (pt) pathAnchors.set(key, { ...pt });
  }

  const connectionBaselines = captureConnectionBaselines(diagram, {
    junctionBoxes,
    lightBulbs,
    switches,
    dimmerSwitches,
    outlets,
    rooms,
    pathAnchors,
    connectionBaselines: emptyConnectionBaselines(),
  });

  return {
    junctionBoxes,
    lightBulbs,
    switches,
    dimmerSwitches,
    outlets,
    rooms,
    pathAnchors,
    connectionBaselines,
  };
}

function snapshotHasStructuralItems(snapshot: SelectionMoveSnapshot): boolean {
  return (
    snapshot.junctionBoxes.size > 0 ||
    snapshot.lightBulbs.size > 0 ||
    snapshot.switches.size > 0 ||
    snapshot.dimmerSwitches.size > 0 ||
    snapshot.outlets.size > 0 ||
    snapshot.rooms.size > 0
  );
}

function copyPoints(points: Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

function shiftPoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** True when a wire endpoint is anchored to structure included in the move snapshot. */
function wireEndpointTouchesSnapshot(
  diagram: Diagram,
  wireId: string,
  snapshot: SelectionMoveSnapshot,
): boolean {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return false;

  if (wire.cableId) {
    const cable = diagram.cables.find((c) => c.id === wire.cableId);
    return cable ? snapshot.junctionBoxes.has(cable.junctionBoxId) : false;
  }
  if (wire.hubId) {
    const hub = diagram.hubs.find((h) => h.id === wire.hubId);
    return hub ? snapshot.junctionBoxes.has(hub.junctionBoxId) : false;
  }
  if (wire.deviceNodeId) {
    const node = diagram.deviceNodes.find((n) => n.id === wire.deviceNodeId);
    return node ? deviceIdInSnapshot(snapshot, node.deviceKind, node.deviceId) : false;
  }
  if (wire.conduitId) {
    const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
    if (!conduit) return false;
    if (conduit.kind === 'local') return snapshot.junctionBoxes.has(conduit.junctionBoxId);
    if (conduit.kind === 'span') {
      return (
        snapshot.junctionBoxes.has(conduit.junctionBoxIdA) ||
        snapshot.junctionBoxes.has(conduit.junctionBoxIdB)
      );
    }
    if (conduit.kind === 'device') {
      const node = diagram.deviceNodes.find((n) => n.id === conduit.deviceNodeId);
      return node ? deviceIdInSnapshot(snapshot, node.deviceKind, node.deviceId) : false;
    }
    if (conduit.kind === 'hub') {
      const hub = diagram.hubs.find((h) => h.id === conduit.hubId);
      return hub ? snapshot.junctionBoxes.has(hub.junctionBoxId) : false;
    }
  }
  return false;
}

function linkFullyCarriedBySnapshot(
  diagram: Diagram,
  link: WireLink,
  snapshot: SelectionMoveSnapshot,
): boolean {
  return (
    wireEndpointTouchesSnapshot(diagram, link.wireIdA, snapshot) &&
    wireEndpointTouchesSnapshot(diagram, link.wireIdB, snapshot)
  );
}

function hubBridgeFullyCarriedBySnapshot(
  diagram: Diagram,
  bridge: HubBridge,
  snapshot: SelectionMoveSnapshot,
): boolean {
  const ha = hubById(diagram, bridge.hubIdA);
  const hb = hubById(diagram, bridge.hubIdB);
  if (!ha || !hb) return false;
  return (
    snapshot.junctionBoxes.has(ha.junctionBoxId) &&
    snapshot.junctionBoxes.has(hb.junctionBoxId)
  );
}

function hubWireFullyCarriedBySnapshot(
  diagram: Diagram,
  wireId: string,
  snapshot: SelectionMoveSnapshot,
): boolean {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.hubId) return false;
  const hub = diagram.hubs.find((h) => h.id === wire.hubId);
  if (!hub || !snapshot.junctionBoxes.has(hub.junctionBoxId)) return false;
  if (wire.deviceNodeId) {
    const node = diagram.deviceNodes.find((n) => n.id === wire.deviceNodeId);
    return node ? deviceIdInSnapshot(snapshot, node.deviceKind, node.deviceId) : false;
  }
  return wireEndpointTouchesSnapshot(diagram, wire.id, snapshot);
}

function conduitFullyCarriedBySnapshot(
  diagram: Diagram,
  conduit: Conduit,
  snapshot: SelectionMoveSnapshot,
): boolean {
  if (conduit.kind === 'local') return snapshot.junctionBoxes.has(conduit.junctionBoxId);
  if (conduit.kind === 'span') {
    return (
      snapshot.junctionBoxes.has(conduit.junctionBoxIdA) &&
      snapshot.junctionBoxes.has(conduit.junctionBoxIdB)
    );
  }
  if (conduit.kind === 'device') {
    const node = diagram.deviceNodes.find((n) => n.id === conduit.deviceNodeId);
    return node ? deviceIdInSnapshot(snapshot, node.deviceKind, node.deviceId) : false;
  }
  if (conduit.kind === 'hub') {
    const hub = diagram.hubs.find((h) => h.id === conduit.hubId);
    return hub ? snapshot.junctionBoxes.has(hub.junctionBoxId) : false;
  }
  return false;
}

function wirePathFullyCarriedBySnapshot(
  diagram: Diagram,
  wireId: string,
  snapshot: SelectionMoveSnapshot,
): boolean {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return false;
  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit || !conduitUsesPerWirePaths(conduit)) return false;
  if (!conduitFullyCarriedBySnapshot(diagram, conduit, snapshot)) return false;

  if (conduit.kind === 'device' || conduit.kind === 'hub' || conduit.kind === 'span') {
    return true;
  }

  if (conduit.kind === 'local') {
    for (const link of diagram.wireLinks) {
      if (link.wireIdA !== wireId && link.wireIdB !== wireId) continue;
      if (linkFullyCarriedBySnapshot(diagram, link, snapshot)) return true;
    }
    return wireEndpointRoles(diagram, wireId).end !== 'free';
  }

  return false;
}

function conduitRunFullyCarriedBySnapshot(
  diagram: Diagram,
  run: ConduitRun,
  snapshot: SelectionMoveSnapshot,
): boolean {
  const cableA = diagram.cables.find((c) => c.id === run.cableIdA);
  if (!cableA || !snapshot.junctionBoxes.has(cableA.junctionBoxId)) return false;
  if (!run.cableIdB) return false;
  const cableB = diagram.cables.find((c) => c.id === run.cableIdB);
  return cableB ? snapshot.junctionBoxes.has(cableB.junctionBoxId) : false;
}

function captureConnectionBaselines(
  diagram: Diagram,
  snapshot: SelectionMoveSnapshot,
): ConnectionPathBaselines {
  const baselines = emptyConnectionBaselines();
  if (!snapshotHasStructuralItems(snapshot)) return baselines;

  for (const link of diagram.wireLinks) {
    if (!linkFullyCarriedBySnapshot(diagram, link, snapshot)) continue;
    const pts = diagram.layout.wireLinkPaths[link.id]?.points;
    if (pts?.length) baselines.wireLinks[link.id] = copyPoints(pts);
  }

  for (const bridge of diagram.hubBridges) {
    if (!hubBridgeFullyCarriedBySnapshot(diagram, bridge, snapshot)) continue;
    const pts = diagram.layout.hubBridgePaths[bridge.id]?.points;
    if (pts?.length) baselines.hubBridges[bridge.id] = copyPoints(pts);
  }

  for (const wire of diagram.wires) {
    if (wire.deviceNodeId) {
      const node = diagram.deviceNodes.find((n) => n.id === wire.deviceNodeId);
      if (!node || !deviceIdInSnapshot(snapshot, node.deviceKind, node.deviceId)) continue;
      const pts = diagram.layout.deviceWirePaths?.[wire.id]?.points;
      if (pts?.length) baselines.deviceWires[wire.id] = copyPoints(pts);
      continue;
    }
    if (wire.hubId && hubWireFullyCarriedBySnapshot(diagram, wire.id, snapshot)) {
      const pts = diagram.layout.hubWirePaths?.[wire.id]?.points;
      if (pts?.length) baselines.hubWires[wire.id] = copyPoints(pts);
      continue;
    }
    if (wire.cableId) {
      const cable = diagram.cables.find((c) => c.id === wire.cableId);
      if (!cable || !snapshot.junctionBoxes.has(cable.junctionBoxId)) continue;
      const pts = diagram.layout.exposedPaths?.[wire.id]?.points;
      if (pts?.length) baselines.exposedWires[wire.id] = copyPoints(pts);
    }
  }

  for (const cable of diagram.cables) {
    if (!snapshot.junctionBoxes.has(cable.junctionBoxId)) continue;
    const stub = diagram.layout.conduitStubPaths?.[cable.id]?.points;
    if (stub?.length) baselines.conduitStubs[cable.id] = copyPoints(stub);
  }

  for (const conduit of diagram.conduits) {
    if (!conduitFullyCarriedBySnapshot(diagram, conduit, snapshot)) continue;
    const pts = diagram.layout.conduitPaths[conduit.id]?.points;
    if (pts?.length) baselines.conduitPaths[conduit.id] = copyPoints(pts);
  }

  for (const wire of diagram.wires) {
    if (!wirePathFullyCarriedBySnapshot(diagram, wire.id, snapshot)) continue;
    const pts = diagram.layout.wirePaths?.[wire.id]?.points ?? resolveWirePath(diagram, wire.id);
    if (pts?.length) baselines.wirePaths[wire.id] = copyPoints(pts);
  }

  for (const run of diagram.conduitRuns) {
    if (!conduitRunFullyCarriedBySnapshot(diagram, run, snapshot)) continue;
    const pts = diagram.layout.conduitRunPaths?.[run.id]?.points;
    if (pts?.length) baselines.conduitRunPaths[run.id] = copyPoints(pts);
  }

  return baselines;
}

function applyConnectionBaselines(
  diagram: Diagram,
  baselines: ConnectionPathBaselines,
  dx: number,
  dy: number,
): Diagram {
  if (dx === 0 && dy === 0) return diagram;

  let wireLinkPaths = { ...diagram.layout.wireLinkPaths };
  for (const [linkId, baseline] of Object.entries(baselines.wireLinks)) {
    const link = diagram.wireLinks.find((l) => l.id === linkId);
    if (!link) continue;
    const pa = wireLinkEndpoint(diagram, link.wireIdA, link.endpointA ?? 'end');
    const pb = wireLinkEndpoint(diagram, link.wireIdB, link.endpointB ?? 'end');
    if (!pa || !pb) continue;
    const shifted = shiftPoints(baseline, dx, dy);
    wireLinkPaths[linkId] = {
      points: hasCustomLinkPathShape(baseline)
        ? normalizeLinkPath(shifted, pa, pb)
        : defaultFivePointPath(pa, pb),
    };
  }

  let hubBridgePaths = { ...diagram.layout.hubBridgePaths };
  for (const [bridgeId, baseline] of Object.entries(baselines.hubBridges)) {
    const bridge = diagram.hubBridges.find((b) => b.id === bridgeId);
    if (!bridge) continue;
    const ha = hubById(diagram, bridge.hubIdA);
    const hb = hubById(diagram, bridge.hubIdB);
    if (!ha || !hb) continue;
    const boxA = diagram.junctionBoxes.find((j) => j.id === ha.junctionBoxId);
    const boxB = diagram.junctionBoxes.find((j) => j.id === hb.junctionBoxId);
    if (!boxA || !boxB) continue;
    const start = hubWorldPoint(boxA, ha);
    const end = hubWorldPoint(boxB, hb);
    const shifted = shiftPoints(baseline, dx, dy);
    hubBridgePaths[bridgeId] = {
      points: hasCustomLinkPathShape(baseline)
        ? normalizeLinkPath(shifted, start, end)
        : defaultFivePointPath(start, end),
    };
  }

  let deviceWirePaths = { ...(diagram.layout.deviceWirePaths ?? {}) };
  for (const [wireId, baseline] of Object.entries(baselines.deviceWires)) {
    const wire = diagram.wires.find((w) => w.id === wireId);
    if (!wire?.deviceNodeId) continue;
    const node = deviceNodeById(diagram, wire.deviceNodeId);
    if (!node) continue;
    const terminal = deviceNodeWorldPoint(diagram, node);
    const wireEnd = wireLinkEndpoint(diagram, wire);
    if (!terminal || !wireEnd) continue;
    const shifted = shiftPoints(baseline, dx, dy);
    deviceWirePaths[wireId] = {
      points: hasCustomLinkPathShape(baseline)
        ? normalizeLinkPath(shifted, terminal, wireEnd)
        : defaultFivePointPath(terminal, wireEnd),
    };
  }

  let hubWirePaths = { ...(diagram.layout.hubWirePaths ?? {}) };
  for (const [wireId, baseline] of Object.entries(baselines.hubWires)) {
    const wire = diagram.wires.find((w) => w.id === wireId);
    if (!wire?.hubId) continue;
    const hub = hubById(diagram, wire.hubId);
    if (!hub) continue;
    const box = diagram.junctionBoxes.find((j) => j.id === hub.junctionBoxId);
    if (!box) continue;
    const hubPoint = hubWorldPoint(box, hub);
    const anchor = hubWireAnchorPoint(diagram, wire);
    if (!anchor) continue;
    const shifted = shiftPoints(baseline, dx, dy);
    hubWirePaths[wireId] = {
      points: hasCustomLinkPathShape(baseline)
        ? normalizeLinkPath(shifted, hubPoint, anchor)
        : defaultFivePointPath(hubPoint, anchor),
    };
  }

  let exposedPaths = { ...(diagram.layout.exposedPaths ?? {}) };
  for (const [wireId, baseline] of Object.entries(baselines.exposedWires)) {
    exposedPaths[wireId] = { points: shiftPoints(baseline, dx, dy) };
  }

  let conduitStubPaths = { ...(diagram.layout.conduitStubPaths ?? {}) };
  for (const [cableId, baseline] of Object.entries(baselines.conduitStubs)) {
    conduitStubPaths[cableId] = { points: shiftPoints(baseline, dx, dy) };
  }

  let conduitPaths = { ...diagram.layout.conduitPaths };
  for (const [conduitId, baseline] of Object.entries(baselines.conduitPaths)) {
    conduitPaths[conduitId] = { points: shiftPoints(baseline, dx, dy) };
  }

  let wirePaths = { ...(diagram.layout.wirePaths ?? {}) };
  for (const [wireId, baseline] of Object.entries(baselines.wirePaths)) {
    wirePaths[wireId] = { points: shiftPoints(baseline, dx, dy) };
  }

  let conduitRunPaths = { ...(diagram.layout.conduitRunPaths ?? {}) };
  for (const [runId, baseline] of Object.entries(baselines.conduitRunPaths)) {
    conduitRunPaths[runId] = { points: shiftPoints(baseline, dx, dy) };
  }

  return refreshConduitRunPaths({
    ...diagram,
    layout: {
      ...diagram.layout,
      wireLinkPaths,
      hubBridgePaths,
      deviceWirePaths,
      hubWirePaths,
      exposedPaths,
      conduitStubPaths,
      conduitPaths,
      wirePaths,
      conduitRunPaths,
    },
  });
}

function deviceIdInSnapshot(
  snapshot: SelectionMoveSnapshot,
  deviceKind: 'lightBulb' | 'switch' | 'dimmerSwitch' | 'outlet',
  deviceId: string,
): boolean {
  switch (deviceKind) {
    case 'lightBulb':
      return snapshot.lightBulbs.has(deviceId);
    case 'switch':
      return snapshot.switches.has(deviceId);
    case 'dimmerSwitch':
      return snapshot.dimmerSwitches.has(deviceId);
    case 'outlet':
      return snapshot.outlets.has(deviceId);
  }
}

/** True when a structural move in the same gesture already carries this anchor. */
function pathAnchorCarriedByStructure(
  diagram: Diagram,
  ref: PathAnchorRef,
  snapshot: SelectionMoveSnapshot,
): boolean {
  switch (ref.kind) {
    case 'exposedWire': {
      const wire = diagram.wires.find((w) => w.id === ref.wireId);
      if (!wire?.cableId) return false;
      const cable = diagram.cables.find((c) => c.id === wire.cableId);
      return cable ? snapshot.junctionBoxes.has(cable.junctionBoxId) : false;
    }
    case 'conduitStub': {
      const cable = diagram.cables.find((c) => c.id === ref.cableId);
      return cable ? snapshot.junctionBoxes.has(cable.junctionBoxId) : false;
    }
    case 'wire': {
      const wire = diagram.wires.find((w) => w.id === ref.wireId);
      if (!wire?.conduitId) return false;
      return wirePathFullyCarriedBySnapshot(diagram, ref.wireId, snapshot);
    }
    case 'deviceWire': {
      const wire = diagram.wires.find((w) => w.id === ref.wireId);
      if (!wire?.deviceNodeId) return false;
      const node = diagram.deviceNodes.find((n) => n.id === wire.deviceNodeId);
      return node ? deviceIdInSnapshot(snapshot, node.deviceKind, node.deviceId) : false;
    }
    case 'hubWire': {
      return hubWireFullyCarriedBySnapshot(diagram, ref.wireId, snapshot);
    }
    case 'link': {
      const link = diagram.wireLinks.find((l) => l.id === ref.linkId);
      return link ? linkFullyCarriedBySnapshot(diagram, link, snapshot) : false;
    }
    case 'hubBridge': {
      const bridge = diagram.hubBridges.find((b) => b.id === ref.bridgeId);
      return bridge ? hubBridgeFullyCarriedBySnapshot(diagram, bridge, snapshot) : false;
    }
    case 'conduitRun': {
      const run = diagram.conduitRuns.find((r) => r.id === ref.runId);
      return run ? conduitRunFullyCarriedBySnapshot(diagram, run, snapshot) : false;
    }
    case 'conduit': {
      const conduit = diagram.conduits.find((c) => c.id === ref.conduitId);
      return conduit ? conduitFullyCarriedBySnapshot(diagram, conduit, snapshot) : false;
    }
  }
}

/** Move every item captured in a selection snapshot by the same delta. */
export function moveSelectionByDelta(
  diagram: Diagram,
  snapshot: SelectionMoveSnapshot,
  dx: number,
  dy: number,
): Diagram {
  let next = diagram;

  if (snapshot.junctionBoxes.size > 0) {
    next = moveJunctionBoxesByDelta(next, snapshot.junctionBoxes.keys(), snapshot.junctionBoxes, dx, dy);
  }
  if (snapshot.lightBulbs.size > 0) {
    next = moveLightBulbsByDelta(next, snapshot.lightBulbs.keys(), snapshot.lightBulbs, dx, dy);
  }
  if (snapshot.switches.size > 0) {
    next = moveSwitchesByDelta(next, snapshot.switches.keys(), snapshot.switches, dx, dy);
  }
  if (snapshot.dimmerSwitches.size > 0) {
    next = moveDimmerSwitchesByDelta(next, snapshot.dimmerSwitches.keys(), snapshot.dimmerSwitches, dx, dy);
  }
  if (snapshot.outlets.size > 0) {
    next = moveOutletsByDelta(next, snapshot.outlets.keys(), snapshot.outlets, dx, dy);
  }
  if (snapshot.rooms.size > 0) {
    next = moveRoomsByDelta(next, snapshot.rooms.keys(), snapshot.rooms, dx, dy);
  }

  next = applyConnectionBaselines(next, snapshot.connectionBaselines, dx, dy);

  for (const [key, start] of snapshot.pathAnchors) {
    const ref = decodePathAnchor(key);
    if (!ref || pathAnchorCarriedByStructure(diagram, ref, snapshot)) continue;
    next = movePathAnchor(next, ref, start.x + dx, start.y + dy);
  }

  return next;
}

export function moveJunctionBoxesByDelta(
  diagram: Diagram,
  boxIds: Iterable<string>,
  startPositions: Map<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): Diagram {
  let next = diagram;
  for (const id of boxIds) {
    const start = startPositions.get(id);
    if (!start) continue;
    next = moveJunctionBox(next, id, start.x + dx, start.y + dy);
  }
  return next;
}

export function moveLightBulbsByDelta(
  diagram: Diagram,
  bulbIds: Iterable<string>,
  startPositions: Map<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): Diagram {
  let next = diagram;
  for (const id of bulbIds) {
    const start = startPositions.get(id);
    if (!start) continue;
    next = moveLightBulb(next, id, start.x + dx, start.y + dy);
  }
  return next;
}

export function moveSwitchesByDelta(
  diagram: Diagram,
  switchIds: Iterable<string>,
  startPositions: Map<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): Diagram {
  let next = diagram;
  for (const id of switchIds) {
    const start = startPositions.get(id);
    if (!start) continue;
    next = moveSwitch(next, id, start.x + dx, start.y + dy);
  }
  return next;
}

export function junctionBoxIdsForGroupMove(selection: DiagramSelection, draggedBoxId: string): Set<string> {
  if (selection.junctionBoxes.size > 1 && selection.junctionBoxes.has(draggedBoxId)) {
    return selection.junctionBoxes;
  }
  const fromAnchors = junctionBoxIdsFromAnchorKeys(selection.junctionAnchors);
  if (fromAnchors.size > 0 && fromAnchors.has(draggedBoxId)) {
    return fromAnchors;
  }
  return new Set([draggedBoxId]);
}

export function lightBulbIdsForGroupMove(selection: DiagramSelection, draggedBulbId: string): Set<string> {
  if (selection.lightBulbs.size > 1 && selection.lightBulbs.has(draggedBulbId)) {
    return selection.lightBulbs;
  }
  return new Set([draggedBulbId]);
}

export function switchIdsForGroupMove(selection: DiagramSelection, draggedSwitchId: string): Set<string> {
  if (selection.switches.size > 1 && selection.switches.has(draggedSwitchId)) {
    return selection.switches;
  }
  return new Set([draggedSwitchId]);
}

export function moveDimmerSwitchesByDelta(
  diagram: Diagram,
  dimmerIds: Iterable<string>,
  startPositions: Map<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): Diagram {
  let next = diagram;
  for (const id of dimmerIds) {
    const start = startPositions.get(id);
    if (!start) continue;
    next = moveDimmerSwitch(next, id, start.x + dx, start.y + dy);
  }
  return next;
}

export function dimmerSwitchIdsForGroupMove(selection: DiagramSelection, draggedDimmerId: string): Set<string> {
  if (selection.dimmerSwitches.size > 1 && selection.dimmerSwitches.has(draggedDimmerId)) {
    return selection.dimmerSwitches;
  }
  return new Set([draggedDimmerId]);
}

export function moveOutletsByDelta(
  diagram: Diagram,
  outletIds: Iterable<string>,
  startPositions: Map<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): Diagram {
  let next = diagram;
  for (const id of outletIds) {
    const start = startPositions.get(id);
    if (!start) continue;
    next = moveOutlet(next, id, start.x + dx, start.y + dy);
  }
  return next;
}

export function outletIdsForGroupMove(selection: DiagramSelection, draggedOutletId: string): Set<string> {
  if (selection.outlets.size > 1 && selection.outlets.has(draggedOutletId)) {
    return selection.outlets;
  }
  return new Set([draggedOutletId]);
}

export function moveRoomsByDelta(
  diagram: Diagram,
  roomIds: Iterable<string>,
  startPositions: Map<string, { x: number; y: number }>,
  dx: number,
  dy: number,
): Diagram {
  let next = diagram;
  for (const id of roomIds) {
    const start = startPositions.get(id);
    if (!start) continue;
    next = moveRoom(next, id, start.x + dx, start.y + dy);
  }
  return next;
}

export function roomIdsForGroupMove(selection: DiagramSelection, draggedRoomId: string): Set<string> {
  if (selection.rooms.size > 1 && selection.rooms.has(draggedRoomId)) {
    return selection.rooms;
  }
  return new Set([draggedRoomId]);
}
