import { cableWallSlots } from '../domain/cable-slots';
import { conduitCenterPath } from '../domain/layout-offsets';
import { GRID_SIZE } from '../domain/grid';
import { hubWorldPoint } from '../domain/hub-geometry';
import {
  deviceNodeWorldPoint,
  deviceNodesForDevice,
  LIGHT_BULB_RADIUS,
} from '../domain/device-node-geometry';
import { wireLinkDisplayPath, wireWorldPolyline } from '../domain/wire-geometry';
import { conduitRunDisplayPath } from '../domain/conduit-run-geometry';
import { hubWireDisplayPath } from '../domain/hub-wire-geometry';
import type { Diagram } from '../domain/types';
import {
  collectJunctionAnchorsInMarquee,
  collectPathAnchorsInMarquee,
} from './anchor-selection';
import type { DiagramSelection } from './diagram-selection';
import { emptySelection } from './diagram-selection';

export type MarqueeRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type MarqueeMode = 'crossing' | 'window';

export function normalizeMarqueeRect(ax: number, ay: number, bx: number, by: number): MarqueeRect {
  return {
    x1: Math.min(ax, bx),
    y1: Math.min(ay, by),
    x2: Math.max(ax, bx),
    y2: Math.max(ay, by),
  };
}

export function marqueeModeFromDrag(ax: number, bx: number): MarqueeMode {
  return bx >= ax ? 'crossing' : 'window';
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: MarqueeRect,
): boolean {
  return a.x < b.x2 && a.x + a.width > b.x1 && a.y < b.y2 && a.y + a.height > b.y1;
}

function rectFullyInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: MarqueeRect,
): boolean {
  return (
    inner.x >= outer.x1 &&
    inner.y >= outer.y1 &&
    inner.x + inner.width <= outer.x2 &&
    inner.y + inner.height <= outer.y2
  );
}

function pointInRect(p: { x: number; y: number }, r: MarqueeRect): boolean {
  return p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2;
}

function segmentIntersectsRect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  r: MarqueeRect,
): boolean {
  if (pointInRect(p1, r) || pointInRect(p2, r)) return true;

  const edges: [{ x: number; y: number }, { x: number; y: number }][] = [
    [
      { x: r.x1, y: r.y1 },
      { x: r.x2, y: r.y1 },
    ],
    [
      { x: r.x2, y: r.y1 },
      { x: r.x2, y: r.y2 },
    ],
    [
      { x: r.x2, y: r.y2 },
      { x: r.x1, y: r.y2 },
    ],
    [
      { x: r.x1, y: r.y2 },
      { x: r.x1, y: r.y1 },
    ],
  ];

  for (const [a, b] of edges) {
    if (segmentsIntersect(p1, p2, a, b)) return true;
  }
  return false;
}

function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function polylineMatches(
  points: { x: number; y: number }[],
  rect: MarqueeRect,
  mode: MarqueeMode,
): boolean {
  if (points.length === 0) return false;
  if (mode === 'window') {
    return points.every((p) => pointInRect(p, rect));
  }
  for (let i = 1; i < points.length; i++) {
    if (segmentIntersectsRect(points[i - 1]!, points[i]!, rect)) return true;
  }
  return points.some((p) => pointInRect(p, rect));
}

function circleMatches(
  center: { x: number; y: number },
  radius: number,
  rect: MarqueeRect,
  mode: MarqueeMode,
): boolean {
  const bounds = {
    x: center.x - radius,
    y: center.y - radius,
    width: radius * 2,
    height: radius * 2,
  };
  return mode === 'window' ? rectFullyInside(bounds, rect) : rectsIntersect(bounds, rect);
}

/** Matches `CableLayer` wall footprint stroking (~28 world units along the stub line). */
const CABLE_WALL_FOOTPRINT_STROKE = 28;

function cableWallFootprintTouchesMarquee(
  diagram: Diagram,
  cableId: string,
  rect: MarqueeRect,
  mode: MarqueeMode,
): boolean {
  const cable = diagram.cables.find((c) => c.id === cableId);
  if (!cable) return false;
  const box = diagram.junctionBoxes.find((b) => b.id === cable.junctionBoxId);
  const n = cable.wireIds.length;
  if (!box || n < 1 || n > 3) return false;
  const wireCount = n as 1 | 2 | 3;
  const slots = cableWallSlots(box, cable.anchor, wireCount);
  if (slots.length === 0) return false;

  if (slots.length === 1) {
    return circleMatches(slots[0]!, GRID_SIZE * 1.5, rect, mode);
  }

  const pad = CABLE_WALL_FOOTPRINT_STROKE / 2;
  const xs = slots.map((s) => s.x);
  const ys = slots.map((s) => s.y);
  let xMin = Math.min(...xs) - pad;
  let xMax = Math.max(...xs) + pad;
  let yMin = Math.min(...ys) - pad;
  let yMax = Math.max(...ys) + pad;

  const t = CABLE_WALL_FOOTPRINT_STROKE;
  if (xMax - xMin < t) {
    const mid = (xMin + xMax) / 2;
    xMin = mid - t / 2;
    xMax = mid + t / 2;
  }
  if (yMax - yMin < t) {
    const mid = (yMin + yMax) / 2;
    yMin = mid - t / 2;
    yMax = mid + t / 2;
  }

  const bounds = { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
  return mode === 'window' ? rectFullyInside(bounds, rect) : rectsIntersect(bounds, rect);
}

export function pointMatches(
  p: { x: number; y: number },
  rect: MarqueeRect,
  mode: MarqueeMode,
  touchRadius = 10,
): boolean {
  if (mode === 'window') return pointInRect(p, rect);
  const touch = {
    x: p.x - touchRadius,
    y: p.y - touchRadius,
    width: touchRadius * 2,
    height: touchRadius * 2,
  };
  return rectsIntersect(touch, rect);
}

/** Collects diagram objects inside or touched by a marquee rectangle. */
export function collectMarqueeSelection(
  diagram: Diagram,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): DiagramSelection {
  const rect = normalizeMarqueeRect(ax, ay, bx, by);
  const mode = marqueeModeFromDrag(ax, bx);
  const result = emptySelection();

  if (rect.x2 - rect.x1 < 2 && rect.y2 - rect.y1 < 2) {
    return result;
  }

  for (const box of diagram.junctionBoxes) {
    const bounds = { x: box.x, y: box.y, width: box.width, height: box.height };
    const hit = mode === 'window' ? rectFullyInside(bounds, rect) : rectsIntersect(bounds, rect);
    if (hit) result.junctionBoxes.add(box.id);
  }

  for (const room of diagram.rooms ?? []) {
    const bounds = { x: room.x, y: room.y, width: room.width, height: room.height };
    const hit = mode === 'window' ? rectFullyInside(bounds, rect) : rectsIntersect(bounds, rect);
    if (hit) result.rooms.add(room.id);
  }

  for (const bulb of diagram.lightBulbs) {
    const center = { x: bulb.x + LIGHT_BULB_RADIUS, y: bulb.y + LIGHT_BULB_RADIUS };
    if (circleMatches(center, LIGHT_BULB_RADIUS, rect, mode)) {
      result.lightBulbs.add(bulb.id);
    }
  }

  for (const sw of diagram.switches) {
    const bounds = { x: sw.x, y: sw.y, width: sw.width, height: sw.height };
    const hit = mode === 'window' ? rectFullyInside(bounds, rect) : rectsIntersect(bounds, rect);
    if (hit) result.switches.add(sw.id);
  }

  for (const dim of diagram.dimmerSwitches ?? []) {
    const bounds = { x: dim.x, y: dim.y, width: dim.width, height: dim.height };
    const hit = mode === 'window' ? rectFullyInside(bounds, rect) : rectsIntersect(bounds, rect);
    if (hit) result.dimmerSwitches.add(dim.id);
  }

  for (const outlet of diagram.outlets ?? []) {
    const bounds = { x: outlet.x, y: outlet.y, width: outlet.width, height: outlet.height };
    const hit = mode === 'window' ? rectFullyInside(bounds, rect) : rectsIntersect(bounds, rect);
    if (hit) result.outlets.add(outlet.id);
  }

  for (const node of diagram.deviceNodes) {
    const pt = deviceNodeWorldPoint(diagram, node);
    if (pt && pointMatches(pt, rect, mode)) {
      result.deviceNodes.add(node.id);
    }
  }

  for (const hub of diagram.hubs) {
    const box = diagram.junctionBoxes.find((b) => b.id === hub.junctionBoxId);
    if (!box) continue;
    const pt = hubWorldPoint(box, hub);
    if (pointMatches(pt, rect, mode)) {
      result.hubs.add(hub.id);
    }
  }

  for (const conduit of diagram.conduits) {
    const path = conduitCenterPath(diagram, conduit.id);
    if (path && polylineMatches(path, rect, mode)) {
      result.conduits.add(conduit.id);
    }
  }

  for (const cable of diagram.cables) {
    if (cableWallFootprintTouchesMarquee(diagram, cable.id, rect, mode)) {
      result.cables.add(cable.id);
    }
  }

  for (const wire of diagram.wires) {
    const path = wireWorldPolyline(diagram, wire.id);
    if (path && polylineMatches(path, rect, mode)) {
      result.wires.add(wire.id);
    }
  }

  for (const link of diagram.wireLinks) {
    const path = wireLinkDisplayPath(diagram, link.id);
    if (path.length >= 2 && polylineMatches(path, rect, mode)) {
      result.links.add(link.id);
    }
  }

  for (const bridge of diagram.hubBridges) {
    const path = diagram.layout.hubBridgePaths[bridge.id]?.points;
    if (path && path.length >= 2 && polylineMatches(path, rect, mode)) {
      result.hubBridges.add(bridge.id);
    }
  }

  for (const run of diagram.conduitRuns) {
    const path = conduitRunDisplayPath(diagram, run.id);
    if (path.length >= 2 && polylineMatches(path, rect, mode)) {
      result.conduitRuns.add(run.id);
    }
  }

  for (const wire of diagram.wires) {
    if (!wire.hubId) continue;
    const path = hubWireDisplayPath(diagram, wire.id);
    if (path.length >= 2 && polylineMatches(path, rect, mode)) {
      result.hubWires.add(wire.id);
    }
  }

  /** Selecting a device also selects its terminals when the body was not already picked. */
  for (const bulbId of result.lightBulbs) {
    for (const node of deviceNodesForDevice(diagram, 'lightBulb', bulbId)) {
      result.deviceNodes.add(node.id);
    }
  }
  for (const switchId of result.switches) {
    for (const node of deviceNodesForDevice(diagram, 'switch', switchId)) {
      result.deviceNodes.add(node.id);
    }
  }
  for (const dimmerId of result.dimmerSwitches) {
    for (const node of deviceNodesForDevice(diagram, 'dimmerSwitch', dimmerId)) {
      result.deviceNodes.add(node.id);
    }
  }
  for (const outletId of result.outlets) {
    for (const node of deviceNodesForDevice(diagram, 'outlet', outletId)) {
      result.deviceNodes.add(node.id);
    }
  }

  /** Selecting a junction box selects hubs on it unless already individually picked. */
  for (const boxId of result.junctionBoxes) {
    for (const hub of diagram.hubs.filter((h) => h.junctionBoxId === boxId)) {
      result.hubs.add(hub.id);
    }
  }

  for (const key of collectJunctionAnchorsInMarquee(diagram, rect, mode)) {
    result.junctionAnchors.add(key);
  }

  for (const key of collectPathAnchorsInMarquee(diagram, rect, mode)) {
    result.pathAnchors.add(key);
  }

  return result;
}
