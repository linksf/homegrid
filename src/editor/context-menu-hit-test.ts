import type { Diagram } from '../domain/types';
import type { ContextMenuTarget } from './context-menu-target';
import { contextMenuTargetKey } from './context-menu-target-key';
import type { HitCandidate } from './tap-selection';

export type { HitCandidate };

import { anchorPoint } from '../domain/anchors';
import { conduitStubResolvedPath } from '../domain/cable-geometry';
import {
  DEFAULT_DIMMER_SIZE,
  DEFAULT_OUTLET_SIZE,
  LIGHT_BULB_RADIUS,
  deviceNodeById,
  deviceNodeWorldPoint,
  lightBulbCenter,
} from '../domain/device-node-geometry';
import { resolveExposedCableWirePath } from '../domain/exposed-wire-endpoints';
import { conduitCenterPath } from '../domain/layout-offsets';
import { hubBridgeDisplayPath } from '../domain/hub-bridge-geometry';
import { hubSlotWorldPoint } from '../domain/hub-geometry';
import { hubWireDisplayPath } from '../domain/hub-wire-geometry';
import { roomOutlineSegments } from '../domain/room-mutations';
import type { AnchorPosition } from '../domain/types';
import { wireLinkDisplayPath, wireWorldPolyline } from '../domain/wire-geometry';
import { HIT_RADIUS_SCREEN_PX, HIT_STROKE_SCREEN_PX, ANCHOR_HIT_TEST_RADIUS_SCREEN_PX, CABLE_HIT_STROKE_SCREEN_PX } from '../canvas/hit-targets';
import { sortHitCandidates, type HitPriorityOptions } from './hit-priority';

export type { HitPriorityOptions };

const JUNCTION_ANCHORS: AnchorPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

function worldHitTolerance(screenPx: number, viewScale: number): number {
  return screenPx / Math.max(viewScale, 0.001);
}

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToPolyline(px: number, py: number, pts: { x: number; y: number }[]): number {
  if (pts.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    min = Math.min(min, distToSegment(px, py, a.x, a.y, b.x, b.y));
  }
  return min;
}

function pushPolyline(
  candidates: HitCandidate[],
  target: ContextMenuTarget,
  px: number,
  py: number,
  pts: { x: number; y: number }[] | null | undefined,
  tolerance: number,
): void {
  if (!pts || pts.length < 2) return;
  const dist = distToPolyline(px, py, pts);
  if (dist <= tolerance) candidates.push({ target, dist });
}

function pushCircle(
  candidates: HitCandidate[],
  target: ContextMenuTarget,
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
): void {
  const dist = Math.hypot(px - cx, py - cy);
  if (dist <= radius) candidates.push({ target, dist });
}

function pointInRect(
  px: number,
  py: number,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return px >= x && px <= x + width && py >= y && py <= y + height;
}

function dedupeAndSort(candidates: HitCandidate[], options: HitPriorityOptions = {}): HitCandidate[] {
  const bestByKey = new Map<string, HitCandidate>();
  for (const candidate of candidates) {
    const key = contextMenuTargetKey(candidate.target);
    const existing = bestByKey.get(key);
    if (!existing || candidate.dist < existing.dist) {
      bestByKey.set(key, candidate);
    }
  }
  return sortHitCandidates([...bestByKey.values()], options);
}

/** All diagram entities near a world point, nearest first. Tolerances scale with zoom. */
export function hitContextMenuTargetsAt(
  diagram: Diagram,
  x: number,
  y: number,
  viewScale = 1,
  options: HitPriorityOptions = {},
): HitCandidate[] {
  const candidates: HitCandidate[] = [];
  const wireTol = worldHitTolerance(HIT_STROKE_SCREEN_PX / 2, viewScale);
  const cableTol = worldHitTolerance(CABLE_HIT_STROKE_SCREEN_PX / 2, viewScale);
  const runTol = worldHitTolerance(CABLE_HIT_STROKE_SCREEN_PX / 2, viewScale);
  const anchorRadius = worldHitTolerance(ANCHOR_HIT_TEST_RADIUS_SCREEN_PX, viewScale);
  const hubRadius = worldHitTolerance(HIT_RADIUS_SCREEN_PX, viewScale);
  const nodeRadius = worldHitTolerance(HIT_RADIUS_SCREEN_PX, viewScale);

  for (const link of diagram.wireLinks) {
    pushPolyline(
      candidates,
      { kind: 'link', linkId: link.id },
      x,
      y,
      wireLinkDisplayPath(diagram, link.id),
      wireTol,
    );
  }

  for (const wire of diagram.wires) {
    pushPolyline(candidates, { kind: 'wire', wireId: wire.id }, x, y, wireWorldPolyline(diagram, wire.id), wireTol);
    pushPolyline(
      candidates,
      { kind: 'wire', wireId: wire.id },
      x,
      y,
      resolveExposedCableWirePath(diagram, wire.id),
      cableTol,
    );
  }

  for (const bridge of diagram.hubBridges) {
    pushPolyline(
      candidates,
      { kind: 'hubBridge', bridgeId: bridge.id },
      x,
      y,
      hubBridgeDisplayPath(diagram, bridge.id),
      wireTol,
    );
  }

  for (const wire of diagram.wires) {
    if (!wire.hubId) continue;
    const conduit = wire.conduitId ? diagram.conduits.find((c) => c.id === wire.conduitId) : undefined;
    if (conduit?.kind === 'hub') continue;
    pushPolyline(
      candidates,
      { kind: 'hubWire', wireId: wire.id },
      x,
      y,
      hubWireDisplayPath(diagram, wire.id),
      wireTol,
    );
  }

  for (const cable of diagram.cables) {
    pushPolyline(
      candidates,
      { kind: 'cable', cableId: cable.id },
      x,
      y,
      conduitStubResolvedPath(diagram, cable.id),
      cableTol,
    );
  }

  for (const run of diagram.conduitRuns) {
    pushPolyline(
      candidates,
      { kind: 'conduitRun', runId: run.id },
      x,
      y,
      diagram.layout.conduitRunPaths?.[run.id]?.points,
      runTol,
    );
  }

  for (const conduit of diagram.conduits) {
    pushPolyline(
      candidates,
      { kind: 'conduit', conduitId: conduit.id },
      x,
      y,
      conduitCenterPath(diagram, conduit.id),
      wireTol,
    );
  }

  for (const node of diagram.deviceNodes) {
    const deviceNode = deviceNodeById(diagram, node.id);
    if (!deviceNode) continue;
    const pt = deviceNodeWorldPoint(diagram, deviceNode);
    if (!pt) continue;
    pushCircle(candidates, { kind: 'deviceNode', nodeId: node.id }, x, y, pt.x, pt.y, nodeRadius);
  }

  for (const bulb of diagram.lightBulbs) {
    const center = lightBulbCenter(bulb);
    pushCircle(
      candidates,
      { kind: 'lightBulb', id: bulb.id },
      x,
      y,
      center.x,
      center.y,
      worldHitTolerance(LIGHT_BULB_RADIUS, viewScale),
    );
  }

  for (const sw of diagram.switches) {
    if (!pointInRect(x, y, sw.x, sw.y, sw.width, sw.height)) continue;
    const cx = sw.x + sw.width / 2;
    const cy = sw.y + sw.height / 2;
    candidates.push({ target: { kind: 'switch', id: sw.id }, dist: Math.hypot(x - cx, y - cy) });
  }

  for (const dim of diagram.dimmerSwitches ?? []) {
    const w = dim.width ?? DEFAULT_DIMMER_SIZE.width;
    const h = dim.height ?? DEFAULT_DIMMER_SIZE.height;
    if (!pointInRect(x, y, dim.x, dim.y, w, h)) continue;
    const cx = dim.x + w / 2;
    const cy = dim.y + h / 2;
    candidates.push({ target: { kind: 'dimmerSwitch', id: dim.id }, dist: Math.hypot(x - cx, y - cy) });
  }

  for (const outlet of diagram.outlets ?? []) {
    const w = outlet.width ?? DEFAULT_OUTLET_SIZE.width;
    const h = outlet.height ?? DEFAULT_OUTLET_SIZE.height;
    if (!pointInRect(x, y, outlet.x, outlet.y, w, h)) continue;
    const cx = outlet.x + w / 2;
    const cy = outlet.y + h / 2;
    candidates.push({ target: { kind: 'outlet', id: outlet.id }, dist: Math.hypot(x - cx, y - cy) });
  }

  for (const box of diagram.junctionBoxes) {
    for (const anchor of JUNCTION_ANCHORS) {
      const pt = anchorPoint(box, anchor);
      pushCircle(candidates, { kind: 'junctionAnchor', boxId: box.id, anchor }, x, y, pt.x, pt.y, anchorRadius);
    }
  }

  for (const hub of diagram.hubs) {
    const box = diagram.junctionBoxes.find((b) => b.id === hub.junctionBoxId);
    if (!box) continue;
    const pt = hubSlotWorldPoint(box, hub.slot);
    pushCircle(candidates, { kind: 'hub', hubId: hub.id }, x, y, pt.x, pt.y, hubRadius);
  }

  for (const box of diagram.junctionBoxes) {
    if (!pointInRect(x, y, box.x, box.y, box.width, box.height)) continue;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    candidates.push({ target: { kind: 'junctionBox', boxId: box.id }, dist: Math.hypot(x - cx, y - cy) });
  }

  for (const room of diagram.rooms ?? []) {
    if (!pointInRect(x, y, room.x, room.y, room.width, room.height)) continue;
    let dist = Infinity;
    for (const seg of roomOutlineSegments(room)) {
      dist = Math.min(dist, distToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2));
    }
    candidates.push({ target: { kind: 'room', roomId: room.id }, dist });
  }

  return dedupeAndSort(candidates, options);
}

export function hitContextMenuTarget(
  diagram: Diagram,
  x: number,
  y: number,
  viewScale = 1,
  options: HitPriorityOptions = {},
): ContextMenuTarget | null {
  return hitContextMenuTargetsAt(diagram, x, y, viewScale, options)[0]?.target ?? null;
}
