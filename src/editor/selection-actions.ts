import { deleteLightBulb, deleteSwitch, deleteDimmerSwitch, deleteOutlet } from '../domain/device-mutations';
import {
  deleteConduit,
  deleteHub,
  deleteHubBridge,
  deleteJunctionBox,
  deleteWire,
  deleteWireLink,
} from '../domain/mutations';
import { deleteCable } from '../domain/cable-mutations';
import { deleteRoom } from '../domain/room-mutations';
import type { Diagram } from '../domain/types';
import type { DiagramSelection } from './diagram-selection';

/** Removes every object in a diagram selection. */
export function deleteAllSelected(diagram: Diagram, selection: DiagramSelection): Diagram {
  let next = diagram;

  for (const id of selection.links) {
    next = deleteWireLink(next, id);
  }
  for (const id of selection.hubBridges) {
    next = deleteHubBridge(next, id);
  }
  for (const id of selection.conduits) {
    next = deleteConduit(next, id);
  }
  for (const id of selection.cables) {
    next = deleteCable(next, id);
  }
  for (const id of selection.wires) {
    if (!next.wires.some((w) => w.id === id)) continue;
    try {
      next = deleteWire(next, id);
    } catch {
      /* breaker-locked wires must be removed via conduit */
    }
  }
  for (const id of selection.hubs) {
    next = deleteHub(next, id);
  }
  for (const id of selection.junctionBoxes) {
    next = deleteJunctionBox(next, id);
  }
  for (const id of selection.lightBulbs) {
    next = deleteLightBulb(next, id);
  }
  for (const id of selection.switches) {
    next = deleteSwitch(next, id);
  }
  for (const id of selection.dimmerSwitches) {
    next = deleteDimmerSwitch(next, id);
  }
  for (const id of selection.outlets) {
    next = deleteOutlet(next, id);
  }
  for (const id of selection.rooms) {
    next = deleteRoom(next, id);
  }

  return next;
}
