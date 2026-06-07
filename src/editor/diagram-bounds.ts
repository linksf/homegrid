import { LIGHT_BULB_RADIUS } from '../domain/device-node-geometry';
import type { Diagram } from '../domain/types';
import { wireLinkDisplayPath, wireWorldPolyline } from '../domain/wire-geometry';
import type { DiagramSelection } from './diagram-selection';

export type Bounds = { x: number; y: number; width: number; height: number };

function unionRect(acc: Bounds | null, r: Bounds): Bounds {
  if (!acc) return r;
  const x1 = Math.min(acc.x, r.x);
  const y1 = Math.min(acc.y, r.y);
  const x2 = Math.max(acc.x + acc.width, r.x + r.width);
  const y2 = Math.max(acc.y + acc.height, r.y + r.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function lightBulbRect(bulb: { x: number; y: number }): Bounds {
  const d = LIGHT_BULB_RADIUS * 2;
  return { x: bulb.x, y: bulb.y, width: d, height: d };
}

/** Union bounds of all visible structure (boxes, rooms, devices). Null when empty. */
export function diagramContentBounds(diagram: Diagram): Bounds | null {
  let acc: Bounds | null = null;
  for (const box of diagram.junctionBoxes) acc = unionRect(acc, box);
  for (const room of diagram.rooms ?? []) acc = unionRect(acc, room);
  for (const sw of diagram.switches) acc = unionRect(acc, sw);
  for (const dim of diagram.dimmerSwitches ?? []) acc = unionRect(acc, dim);
  for (const outlet of diagram.outlets ?? []) acc = unionRect(acc, outlet);
  for (const bulb of diagram.lightBulbs) acc = unionRect(acc, lightBulbRect(bulb));
  return acc;
}

function boundsFromPoints(pts: readonly { x: number; y: number }[], pad = 48): Bounds | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/** Bounds around one wire's routed path for zoom-to-selection. */
export function wireContentBounds(diagram: Diagram, wireId: string): Bounds | null {
  return boundsFromPoints(wireWorldPolyline(diagram, wireId) ?? []);
}

/** Bounds around a wire-to-wire link path. */
export function wireLinkContentBounds(diagram: Diagram, linkId: string): Bounds | null {
  return boundsFromPoints(wireLinkDisplayPath(diagram, linkId));
}

/** Bounds around a conduit run path between two cable stubs. */
export function conduitRunContentBounds(diagram: Diagram, runId: string): Bounds | null {
  return boundsFromPoints(diagram.layout.conduitRunPaths?.[runId]?.points ?? []);
}

/** Union bounds of selected boxes/rooms/devices and selected wires/links. */
export function selectionContentBounds(diagram: Diagram, selection: DiagramSelection): Bounds | null {
  let acc: Bounds | null = null;
  for (const box of diagram.junctionBoxes) {
    if (selection.junctionBoxes.has(box.id)) acc = unionRect(acc, box);
  }
  for (const room of diagram.rooms ?? []) {
    if (selection.rooms.has(room.id)) acc = unionRect(acc, room);
  }
  for (const sw of diagram.switches) {
    if (selection.switches.has(sw.id)) acc = unionRect(acc, sw);
  }
  for (const dim of diagram.dimmerSwitches ?? []) {
    if (selection.dimmerSwitches.has(dim.id)) acc = unionRect(acc, dim);
  }
  for (const outlet of diagram.outlets ?? []) {
    if (selection.outlets.has(outlet.id)) acc = unionRect(acc, outlet);
  }
  for (const bulb of diagram.lightBulbs) {
    if (selection.lightBulbs.has(bulb.id)) acc = unionRect(acc, lightBulbRect(bulb));
  }
  for (const wireId of selection.wires) {
    const bounds = wireContentBounds(diagram, wireId);
    if (bounds) acc = unionRect(acc, bounds);
  }
  for (const linkId of selection.links) {
    const bounds = wireLinkContentBounds(diagram, linkId);
    if (bounds) acc = unionRect(acc, bounds);
  }
  return acc;
}
