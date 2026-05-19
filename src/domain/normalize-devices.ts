import { nanoid } from 'nanoid';
import type { DeviceNode, Diagram, LightBulb, Switch } from './types';

function nodesForBulb(bulbId: string, existing: DeviceNode[]): DeviceNode[] {
  const bySlot = new Map(existing.filter((n) => n.deviceId === bulbId).map((n) => [n.slot, n]));
  const nodes: DeviceNode[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const found = bySlot.get(slot);
    nodes.push(
      found ?? {
        id: nanoid(),
        deviceKind: 'lightBulb',
        deviceId: bulbId,
        slot,
      },
    );
  }
  return nodes;
}

function nodesForSwitch(sw: Switch, existing: DeviceNode[]): DeviceNode[] {
  const bySlot = new Map(
    existing.filter((n) => n.deviceKind === 'switch' && n.deviceId === sw.id).map((n) => [n.slot, n]),
  );
  const count = sw.terminalCount === 3 ? 3 : 2;
  const nodes: DeviceNode[] = [];
  for (let slot = 0; slot < count; slot++) {
    const found = bySlot.get(slot);
    nodes.push(
      found ?? {
        id: nanoid(),
        deviceKind: 'switch',
        deviceId: sw.id,
        slot,
      },
    );
  }
  return nodes;
}

/** Ensures each bulb has two nodes and each switch has 2 or 3; drops orphan nodes. */
export function normalizeDeviceNodes(diagram: Diagram): Diagram {
  const bulbs: LightBulb[] = Array.isArray(diagram.lightBulbs) ? diagram.lightBulbs : [];
  const switches: Switch[] = Array.isArray(diagram.switches) ? diagram.switches : [];
  const existing = Array.isArray(diagram.deviceNodes) ? diagram.deviceNodes : [];

  const deviceNodes: DeviceNode[] = [];
  for (const bulb of bulbs) {
    deviceNodes.push(...nodesForBulb(bulb.id, existing));
  }
  for (const sw of switches) {
    const terminalCount: 2 | 3 = sw.terminalCount === 3 ? 3 : 2;
    deviceNodes.push(...nodesForSwitch({ ...sw, terminalCount }, existing));
  }

  const validNodeIds = new Set(deviceNodes.map((n) => n.id));
  const wires = diagram.wires.map((w) => {
    if (w.deviceNodeId && !validNodeIds.has(w.deviceNodeId)) {
      return { ...w, deviceNodeId: null };
    }
    return w;
  });

  const conduits = diagram.conduits.filter((c) => {
    if (c.kind !== 'device') return true;
    return validNodeIds.has(c.deviceNodeId);
  });

  return {
    ...diagram,
    lightBulbs: bulbs,
    switches: switches.map((s) => ({
      ...s,
      terminalCount: s.terminalCount === 3 ? 3 : 2,
    })),
    deviceNodes,
    conduits,
    wires,
  };
}
