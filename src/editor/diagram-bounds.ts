import { LIGHT_BULB_RADIUS } from '../domain/device-node-geometry';
import type { Diagram } from '../domain/types';
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

/** Union bounds of selected boxes/rooms/devices. Null when none of those are selected. */
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
  return acc;
}
