import { encodeJunctionAnchor } from './anchor-selection';
import type { ContextMenuTarget } from './context-menu-target';
import {
  emptySelection,
  setSingleCable,
  setSingleConduit,
  setSingleConduitRun,
  setSingleDimmerSwitch,
  setSingleHub,
  setSingleHubBridge,
  setSingleHubWire,
  setSingleJunctionBox,
  setSingleLightBulb,
  setSingleLink,
  setSingleOutlet,
  setSingleRoom,
  setSingleSwitch,
  setSingleWire,
  type DiagramSelection,
} from './diagram-selection';
import { deviceNodeById } from '../domain/device-node-geometry';

/** Select exactly the entity targeted by a context menu gesture. */
export function selectionForContextMenuTarget(target: ContextMenuTarget): DiagramSelection {
  switch (target.kind) {
    case 'wire':
      return setSingleWire(target.wireId);
    case 'junctionBox':
      return setSingleJunctionBox(target.boxId);
    case 'junctionAnchor': {
      const next = emptySelection();
      next.junctionAnchors.add(encodeJunctionAnchor(target.boxId, target.anchor));
      return next;
    }
    case 'room':
      return setSingleRoom(target.roomId);
    case 'cable':
      return setSingleCable(target.cableId);
    case 'link':
      return setSingleLink(target.linkId);
    case 'hub':
      return setSingleHub(target.hubId);
    case 'hubBridge':
      return setSingleHubBridge(target.bridgeId);
    case 'hubWire':
      return setSingleHubWire(target.wireId);
    case 'conduitRun':
      return setSingleConduitRun(target.runId);
    case 'conduit':
      return setSingleConduit(target.conduitId);
    case 'lightBulb':
      return setSingleLightBulb(target.id);
    case 'switch':
      return setSingleSwitch(target.id);
    case 'dimmerSwitch':
      return setSingleDimmerSwitch(target.id);
    case 'outlet':
      return setSingleOutlet(target.id);
    case 'deviceNode': {
      const next = emptySelection();
      next.deviceNodes.add(target.nodeId);
      return next;
    }
    case 'multi':
      return emptySelection();
  }
}

export function enrichDeviceNodeSelection(
  diagram: import('../domain/types').Diagram,
  selection: DiagramSelection,
): DiagramSelection {
  if (selection.deviceNodes.size !== 1) return selection;
  const nodeId = selection.deviceNodes.values().next().value;
  if (!nodeId) return selection;
  const node = deviceNodeById(diagram, nodeId);
  if (!node) return selection;

  const next = emptySelection();
  next.deviceNodes.add(nodeId);
  switch (node.deviceKind) {
    case 'lightBulb':
      next.lightBulbs.add(node.deviceId);
      break;
    case 'switch':
      next.switches.add(node.deviceId);
      break;
    case 'dimmerSwitch':
      next.dimmerSwitches.add(node.deviceId);
      break;
    case 'outlet':
      next.outlets.add(node.deviceId);
      break;
  }
  return next;
}
