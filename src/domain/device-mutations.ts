import { nanoid } from 'nanoid';
import type { DeviceNode, Diagram, LightBulb, Switch } from './types';
import {
  DEFAULT_SWITCH_SIZE,
  conduitsOnDeviceNode,
  deviceNodeById,
  LIGHT_BULB_RADIUS,
} from './device-node-geometry';
import { hubById } from './hub-geometry';
import { normalizeDeviceNodes } from './normalize-devices';
import { rebuildDeviceConduitPathsForDevice } from './conduit-geometry';
import { attachWireToHub } from './mutations';

function createBulbNodes(bulbId: string): DeviceNode[] {
  return [0, 1].map((slot) => ({
    id: nanoid(),
    deviceKind: 'lightBulb' as const,
    deviceId: bulbId,
    slot,
  }));
}

function createSwitchNodes(switchId: string, terminalCount: 2 | 3): DeviceNode[] {
  const count = terminalCount === 3 ? 3 : 2;
  return Array.from({ length: count }, (_, slot) => ({
    id: nanoid(),
    deviceKind: 'switch' as const,
    deviceId: switchId,
    slot,
  }));
}

export function addLightBulb(diagram: Diagram, worldX: number, worldY: number): Diagram {
  const r = LIGHT_BULB_RADIUS;
  const id = nanoid();
  const bulb: LightBulb = {
    id,
    label: '',
    x: worldX - r,
    y: worldY - r,
  };
  return {
    ...diagram,
    lightBulbs: [...diagram.lightBulbs, bulb],
    deviceNodes: [...diagram.deviceNodes, ...createBulbNodes(id)],
  };
}

export function addSwitch(
  diagram: Diagram,
  worldX: number,
  worldY: number,
  terminalCount: 2 | 3 = 2,
): Diagram {
  const { width, height } = DEFAULT_SWITCH_SIZE;
  const id = nanoid();
  const count: 2 | 3 = terminalCount === 3 ? 3 : 2;
  const sw: Switch = {
    id,
    label: '',
    x: worldX - width / 2,
    y: worldY - height / 2,
    width,
    height,
    terminalCount: count,
  };
  return {
    ...diagram,
    switches: [...diagram.switches, sw],
    deviceNodes: [...diagram.deviceNodes, ...createSwitchNodes(id, count)],
  };
}

export function moveLightBulb(diagram: Diagram, bulbId: string, x: number, y: number): Diagram {
  return rebuildDeviceConduitPathsForDevice(
    {
      ...diagram,
      lightBulbs: diagram.lightBulbs.map((b) => (b.id === bulbId ? { ...b, x, y } : b)),
    },
    'lightBulb',
    bulbId,
  );
}

export function moveSwitch(diagram: Diagram, switchId: string, x: number, y: number): Diagram {
  return rebuildDeviceConduitPathsForDevice(
    {
      ...diagram,
      switches: diagram.switches.map((s) => (s.id === switchId ? { ...s, x, y } : s)),
    },
    'switch',
    switchId,
  );
}

export function updateLightBulb(
  diagram: Diagram,
  bulbId: string,
  patch: Partial<Pick<LightBulb, 'label'>>,
): Diagram {
  return {
    ...diagram,
    lightBulbs: diagram.lightBulbs.map((b) => (b.id === bulbId ? { ...b, ...patch } : b)),
  };
}

export function updateSwitch(
  diagram: Diagram,
  switchId: string,
  patch: Partial<Pick<Switch, 'label' | 'terminalCount'>>,
): Diagram {
  const sw = diagram.switches.find((s) => s.id === switchId);
  if (!sw) return diagram;

  const terminalCount: 2 | 3 =
    patch.terminalCount === 3 ? 3 : patch.terminalCount === 2 ? 2 : sw.terminalCount;
  const updated: Switch = { ...sw, ...patch, terminalCount };

  return normalizeDeviceNodes({
    ...diagram,
    switches: diagram.switches.map((s) => (s.id === switchId ? updated : s)),
  });
}

function removeDeviceConduitsForNodes(diagram: Diagram, nodeIds: Set<string>): Diagram {
  const toRemove = diagram.conduits.filter(
    (c) => c.kind === 'device' && nodeIds.has(c.deviceNodeId),
  );
  if (toRemove.length === 0) {
    return diagram;
  }

  const removeIds = new Set(toRemove.map((c) => c.id));
  const wireIds = new Set(toRemove.flatMap((c) => c.wireIds));
  const conduitPaths = { ...diagram.layout.conduitPaths };
  const conduitOffsets = { ...(diagram.layout.conduitOffsets ?? {}) };
  for (const id of removeIds) {
    delete conduitPaths[id];
    delete conduitOffsets[id];
  }

  return {
    ...diagram,
    conduits: diagram.conduits.filter((c) => !removeIds.has(c.id)),
    wires: diagram.wires.filter((w) => !wireIds.has(w.id)),
    layout: { ...diagram.layout, conduitPaths, conduitOffsets },
  };
}

export function deleteLightBulb(diagram: Diagram, bulbId: string): Diagram {
  const nodeIds = new Set(
    diagram.deviceNodes
      .filter((n) => n.deviceKind === 'lightBulb' && n.deviceId === bulbId)
      .map((n) => n.id),
  );
  return removeDeviceConduitsForNodes({
    ...diagram,
    lightBulbs: diagram.lightBulbs.filter((b) => b.id !== bulbId),
    deviceNodes: diagram.deviceNodes.filter((n) => !nodeIds.has(n.id)),
    wires: diagram.wires.map((w) =>
      w.deviceNodeId && nodeIds.has(w.deviceNodeId) ? { ...w, deviceNodeId: null } : w,
    ),
  }, nodeIds);
}

export function deleteSwitch(diagram: Diagram, switchId: string): Diagram {
  const nodeIds = new Set(
    diagram.deviceNodes
      .filter((n) => n.deviceKind === 'switch' && n.deviceId === switchId)
      .map((n) => n.id),
  );
  return removeDeviceConduitsForNodes({
    ...diagram,
    switches: diagram.switches.filter((s) => s.id !== switchId),
    deviceNodes: diagram.deviceNodes.filter((n) => !nodeIds.has(n.id)),
    wires: diagram.wires.map((w) =>
      w.deviceNodeId && nodeIds.has(w.deviceNodeId) ? { ...w, deviceNodeId: null } : w,
    ),
  }, nodeIds);
}

export function detachWireFromDeviceNode(diagram: Diagram, wireId: string): Diagram {
  const wires = diagram.wires.map((w) => (w.id === wireId ? { ...w, deviceNodeId: null } : w));
  return { ...diagram, wires };
}

/** Links a device terminal to a hub via a wire in a conduit on that terminal. */
export function attachHubToDeviceNode(diagram: Diagram, hubId: string, nodeId: string): Diagram {
  if (!hubById(diagram, hubId) || !deviceNodeById(diagram, nodeId)) {
    throw new Error('Hub or terminal not found');
  }
  const conduit = conduitsOnDeviceNode(diagram, nodeId)[0];
  if (!conduit || conduit.wireIds.length === 0) {
    throw new Error('Add a conduit to this terminal before linking to a hub');
  }
  return attachWireToHub(diagram, hubId, conduit.wireIds[0]!);
}
