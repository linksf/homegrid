import { moveLightBulb, moveSwitch, moveDimmerSwitch, moveOutlet } from '../domain/device-mutations';
import { moveJunctionBox } from '../domain/mutations';
import { moveRoom } from '../domain/room-mutations';
import type { Diagram } from '../domain/types';
import { junctionBoxIdsFromAnchorKeys } from './anchor-selection';
import type { DiagramSelection } from './diagram-selection';

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
