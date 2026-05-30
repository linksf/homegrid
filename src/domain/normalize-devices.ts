import { nanoid } from 'nanoid';
import { normalizeDimmerLevel, normalizeDimmerPosition, normalizeSwitchPosition, switchTerminalCount } from './continuity';
import type { DeviceNode, Diagram, DimmerSwitch, LightBulb, Outlet, Switch } from './types';

function normalizeOrientation(value: unknown): 0 | 90 | 180 | 270 {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const norm = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  return norm as 0 | 90 | 180 | 270;
}

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
  const count = switchTerminalCount(sw);
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

function nodesForDimmer(dim: DimmerSwitch, existing: DeviceNode[]): DeviceNode[] {
  const bySlot = new Map(
    existing.filter((n) => n.deviceKind === 'dimmerSwitch' && n.deviceId === dim.id).map((n) => [n.slot, n]),
  );
  const nodes: DeviceNode[] = [];
  for (let slot = 0; slot < 2; slot++) {
    const found = bySlot.get(slot);
    nodes.push(
      found ?? {
        id: nanoid(),
        deviceKind: 'dimmerSwitch',
        deviceId: dim.id,
        slot,
      },
    );
  }
  return nodes;
}

function nodesForOutlet(outlet: Outlet, existing: DeviceNode[]): DeviceNode[] {
  const bySlot = new Map(
    existing.filter((n) => n.deviceKind === 'outlet' && n.deviceId === outlet.id).map((n) => [n.slot, n]),
  );
  const count = outlet.passthrough ? 4 : 2;
  const nodes: DeviceNode[] = [];
  for (let slot = 0; slot < count; slot++) {
    const found = bySlot.get(slot);
    nodes.push(
      found ?? {
        id: nanoid(),
        deviceKind: 'outlet',
        deviceId: outlet.id,
        slot,
      },
    );
  }
  return nodes;
}

/** Ensures each device has the correct terminal nodes; drops orphan nodes. */
export function normalizeDeviceNodes(diagram: Diagram): Diagram {
  const bulbs: LightBulb[] = Array.isArray(diagram.lightBulbs) ? diagram.lightBulbs : [];
  const switches: Switch[] = Array.isArray(diagram.switches) ? diagram.switches : [];
  const dimmerSwitches: DimmerSwitch[] = Array.isArray(diagram.dimmerSwitches) ? diagram.dimmerSwitches : [];
  const outlets: Outlet[] = Array.isArray(diagram.outlets) ? diagram.outlets : [];
  const existing = Array.isArray(diagram.deviceNodes) ? diagram.deviceNodes : [];

  const deviceNodes: DeviceNode[] = [];
  for (const bulb of bulbs) {
    deviceNodes.push(...nodesForBulb(bulb.id, existing));
  }
  for (const sw of switches) {
    const terminalCount = switchTerminalCount(sw);
    deviceNodes.push(...nodesForSwitch({ ...sw, terminalCount }, existing));
  }
  for (const dim of dimmerSwitches) {
    deviceNodes.push(...nodesForDimmer(dim, existing));
  }
  for (const outlet of outlets) {
    deviceNodes.push(...nodesForOutlet(outlet, existing));
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
    lightBulbs: bulbs.map((b) => ({ ...b, orientation: normalizeOrientation(b.orientation) })),
    switches: switches.map((s) => {
      const terminalCount = switchTerminalCount(s);
      return {
        ...s,
        terminalCount,
        position: normalizeSwitchPosition({ ...s, terminalCount }),
        orientation: normalizeOrientation(s.orientation),
      };
    }),
    dimmerSwitches: dimmerSwitches.map((d) => ({
      ...d,
      level: normalizeDimmerLevel(d),
      position: normalizeDimmerPosition(d),
      orientation: normalizeOrientation(d.orientation),
    })),
    outlets: outlets.map((o) => ({
      ...o,
      passthrough: Boolean(o.passthrough),
      orientation: normalizeOrientation(o.orientation),
    })),
    deviceNodes,
    conduits,
    wires,
  };
}
