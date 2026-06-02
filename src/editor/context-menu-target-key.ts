import type { ContextMenuTarget } from './context-menu-target';

/** Stable string key for deduplicating and cycling hit targets. */
export function contextMenuTargetKey(target: ContextMenuTarget): string {
  switch (target.kind) {
    case 'wire':
      return `wire:${target.wireId}`;
    case 'junctionBox':
      return `box:${target.boxId}`;
    case 'junctionAnchor':
      return `anchor:${target.boxId}:${target.anchor}`;
    case 'room':
      return `room:${target.roomId}`;
    case 'cable':
      return `cable:${target.cableId}`;
    case 'link':
      return `link:${target.linkId}`;
    case 'hub':
      return `hub:${target.hubId}`;
    case 'hubBridge':
      return `hubBridge:${target.bridgeId}`;
    case 'hubWire':
      return `hubWire:${target.wireId}`;
    case 'conduitRun':
      return `run:${target.runId}`;
    case 'conduit':
      return `conduit:${target.conduitId}`;
    case 'lightBulb':
      return `lightBulb:${target.id}`;
    case 'switch':
      return `switch:${target.id}`;
    case 'dimmerSwitch':
      return `dimmer:${target.id}`;
    case 'outlet':
      return `outlet:${target.id}`;
    case 'deviceNode':
      return `node:${target.nodeId}`;
    case 'multi':
      return 'multi';
  }
}

export function contextMenuTargetsEqual(a: ContextMenuTarget, b: ContextMenuTarget): boolean {
  return contextMenuTargetKey(a) === contextMenuTargetKey(b);
}
