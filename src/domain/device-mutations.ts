import { nanoid } from 'nanoid';
import { defaultSwitchPosition, defaultDimmerLevel, defaultDimmerPosition, normalizeSwitchPosition, switchTerminalCount, toggleSwitchPosition, toggleDimmerLevel, normalizeDimmerLevel } from './continuity';
import { snapGridPoint } from './grid';
import type { DeviceNode, Diagram, DimmerSwitch, LightBulb, Outlet, Switch, SwitchTerminalCount, WireEndpoint } from './types';
import {
  DEFAULT_DIMMER_SIZE,
  DEFAULT_OUTLET_SIZE,
  DEFAULT_SWITCH_SIZE,
  conduitsOnDeviceNode,
  deviceNodeById,
  LIGHT_BULB_RADIUS,
  wiresOnDeviceNode,
  wireIdsOnDeviceTerminal,
} from './device-node-geometry';
import { refreshHubWirePaths } from './hub-wire-geometry';
import { refreshDeviceWirePaths } from './device-wire-geometry';
import { hubById } from './hub-geometry';
import { normalizeDeviceNodes } from './normalize-devices';
import { rebuildDeviceConduitPathsForDevice } from './conduit-geometry';
import { attachWireToHub } from './mutations';
import { wireLinksForWire } from './wire-link-utils';

function createBulbNodes(bulbId: string): DeviceNode[] {
  return [0, 1].map((slot) => ({
    id: nanoid(),
    deviceKind: 'lightBulb' as const,
    deviceId: bulbId,
    slot,
  }));
}

function createSwitchNodes(switchId: string, terminalCount: SwitchTerminalCount): DeviceNode[] {
  const count = switchTerminalCount(terminalCount);
  return Array.from({ length: count }, (_, slot) => ({
    id: nanoid(),
    deviceKind: 'switch' as const,
    deviceId: switchId,
    slot,
  }));
}

function createDimmerNodes(dimmerId: string): DeviceNode[] {
  return [0, 1].map((slot) => ({
    id: nanoid(),
    deviceKind: 'dimmerSwitch' as const,
    deviceId: dimmerId,
    slot,
  }));
}

function createOutletNodes(outletId: string, passthrough: boolean): DeviceNode[] {
  const count = passthrough ? 4 : 2;
  return Array.from({ length: count }, (_, slot) => ({
    id: nanoid(),
    deviceKind: 'outlet' as const,
    deviceId: outletId,
    slot,
  }));
}

export function addLightBulb(diagram: Diagram, worldX: number, worldY: number): Diagram {
  const r = LIGHT_BULB_RADIUS;
  const center = snapGridPoint({ x: worldX, y: worldY });
  const id = nanoid();
  const bulb: LightBulb = {
    id,
    label: '',
    x: center.x - r,
    y: center.y - r,
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
  terminalCount: SwitchTerminalCount = 2,
): Diagram {
  const { width, height } = DEFAULT_SWITCH_SIZE;
  const id = nanoid();
  const count = switchTerminalCount(terminalCount);
  const center = snapGridPoint({ x: worldX, y: worldY });
  const sw: Switch = {
    id,
    label: '',
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    terminalCount: count,
    position: defaultSwitchPosition(count),
  };
  return {
    ...diagram,
    switches: [...diagram.switches, sw],
    deviceNodes: [...diagram.deviceNodes, ...createSwitchNodes(id, count)],
  };
}

export function addDimmerSwitch(diagram: Diagram, worldX: number, worldY: number): Diagram {
  const { width, height } = DEFAULT_DIMMER_SIZE;
  const id = nanoid();
  const center = snapGridPoint({ x: worldX, y: worldY });
  const dim: DimmerSwitch = {
    id,
    label: '',
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    level: defaultDimmerLevel(),
    position: defaultDimmerPosition(),
  };
  return {
    ...diagram,
    dimmerSwitches: [...(diagram.dimmerSwitches ?? []), dim],
    deviceNodes: [...diagram.deviceNodes, ...createDimmerNodes(id)],
  };
}

export function addOutlet(
  diagram: Diagram,
  worldX: number,
  worldY: number,
  passthrough = false,
): Diagram {
  const { width, height } = DEFAULT_OUTLET_SIZE;
  const id = nanoid();
  const center = snapGridPoint({ x: worldX, y: worldY });
  const outlet: Outlet = {
    id,
    label: '',
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    passthrough,
  };
  return {
    ...diagram,
    outlets: [...(diagram.outlets ?? []), outlet],
    deviceNodes: [...diagram.deviceNodes, ...createOutletNodes(id, passthrough)],
  };
}

export function moveLightBulb(diagram: Diagram, bulbId: string, x: number, y: number): Diagram {
  const r = LIGHT_BULB_RADIUS;
  const center = snapGridPoint({ x: x + r, y: y + r });
  return refreshHubWirePaths(
    rebuildDeviceConduitPathsForDevice(
      {
        ...diagram,
        lightBulbs: diagram.lightBulbs.map((b) =>
          b.id === bulbId ? { ...b, x: center.x - r, y: center.y - r } : b,
        ),
      },
      'lightBulb',
      bulbId,
    ),
  );
}

export function moveSwitch(diagram: Diagram, switchId: string, x: number, y: number): Diagram {
  const sw = diagram.switches.find((s) => s.id === switchId);
  if (!sw) return diagram;
  const center = snapGridPoint({ x: x + sw.width / 2, y: y + sw.height / 2 });
  return refreshHubWirePaths(
    rebuildDeviceConduitPathsForDevice(
      {
        ...diagram,
        switches: diagram.switches.map((s) =>
          s.id === switchId
            ? { ...s, x: center.x - sw.width / 2, y: center.y - sw.height / 2 }
            : s,
        ),
      },
      'switch',
      switchId,
    ),
  );
}

export function moveDimmerSwitch(diagram: Diagram, dimmerId: string, x: number, y: number): Diagram {
  const dim = (diagram.dimmerSwitches ?? []).find((d) => d.id === dimmerId);
  if (!dim) return diagram;
  const center = snapGridPoint({ x: x + dim.width / 2, y: y + dim.height / 2 });
  return refreshHubWirePaths(
    rebuildDeviceConduitPathsForDevice(
      {
        ...diagram,
        dimmerSwitches: (diagram.dimmerSwitches ?? []).map((d) =>
          d.id === dimmerId
            ? { ...d, x: center.x - dim.width / 2, y: center.y - dim.height / 2 }
            : d,
        ),
      },
      'dimmerSwitch',
      dimmerId,
    ),
  );
}

export function moveOutlet(diagram: Diagram, outletId: string, x: number, y: number): Diagram {
  const outlet = (diagram.outlets ?? []).find((o) => o.id === outletId);
  if (!outlet) return diagram;
  const center = snapGridPoint({ x: x + outlet.width / 2, y: y + outlet.height / 2 });
  return refreshHubWirePaths(
    rebuildDeviceConduitPathsForDevice(
      {
        ...diagram,
        outlets: (diagram.outlets ?? []).map((o) =>
          o.id === outletId
            ? { ...o, x: center.x - outlet.width / 2, y: center.y - outlet.height / 2 }
            : o,
        ),
      },
      'outlet',
      outletId,
    ),
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
  patch: Partial<Pick<Switch, 'label' | 'terminalCount' | 'position'>>,
): Diagram {
  const sw = diagram.switches.find((s) => s.id === switchId);
  if (!sw) return diagram;

  const terminalCount: SwitchTerminalCount =
    patch.terminalCount === 4
      ? 4
      : patch.terminalCount === 3
        ? 3
        : patch.terminalCount === 2
          ? 2
          : switchTerminalCount(sw);
  const terminalCountChanged = terminalCount !== sw.terminalCount;
  const position = terminalCountChanged
    ? defaultSwitchPosition(terminalCount)
    : patch.position !== undefined
      ? patch.position
      : sw.position;

  const updated: Switch = {
    ...sw,
    ...patch,
    terminalCount,
    position: normalizeSwitchPosition({ ...sw, terminalCount, position }),
  };

  return normalizeDeviceNodes({
    ...diagram,
    switches: diagram.switches.map((s) => (s.id === switchId ? updated : s)),
  });
}

export function flipSwitchPosition(diagram: Diagram, switchId: string): Diagram {
  const sw = diagram.switches.find((s) => s.id === switchId);
  if (!sw) return diagram;
  return updateSwitch(diagram, switchId, { position: toggleSwitchPosition(sw) });
}

export function updateDimmerSwitch(
  diagram: Diagram,
  dimmerId: string,
  patch: Partial<Pick<DimmerSwitch, 'label' | 'position' | 'level'>>,
): Diagram {
  const dim = (diagram.dimmerSwitches ?? []).find((d) => d.id === dimmerId);
  if (!dim) return diagram;

  let level = dim.level;
  if (patch.level !== undefined && Number.isFinite(patch.level)) {
    level = Math.max(0, Math.min(100, Math.round(patch.level)));
  } else if (patch.position !== undefined) {
    level = patch.position === 'on' ? 100 : 0;
  }

  const normalizedLevel = normalizeDimmerLevel({ ...dim, ...patch, level });
  const updated: DimmerSwitch = {
    ...dim,
    ...patch,
    level: normalizedLevel,
    position: normalizedLevel > 0 ? 'on' : 'off',
  };
  return {
    ...diagram,
    dimmerSwitches: (diagram.dimmerSwitches ?? []).map((d) => (d.id === dimmerId ? updated : d)),
  };
}

export function flipDimmerPosition(diagram: Diagram, dimmerId: string): Diagram {
  const dim = (diagram.dimmerSwitches ?? []).find((d) => d.id === dimmerId);
  if (!dim) return diagram;
  return updateDimmerSwitch(diagram, dimmerId, { level: toggleDimmerLevel(dim) });
}

export function adjustDimmerLevel(diagram: Diagram, dimmerId: string, delta: number): Diagram {
  const dim = (diagram.dimmerSwitches ?? []).find((d) => d.id === dimmerId);
  if (!dim) return diagram;
  const next = normalizeDimmerLevel(dim) + delta;
  return updateDimmerSwitch(diagram, dimmerId, { level: next });
}

export function updateOutlet(
  diagram: Diagram,
  outletId: string,
  patch: Partial<Pick<Outlet, 'label' | 'passthrough'>>,
): Diagram {
  const outlet = (diagram.outlets ?? []).find((o) => o.id === outletId);
  if (!outlet) return diagram;
  const passthrough = patch.passthrough ?? outlet.passthrough;
  const updated: Outlet = { ...outlet, ...patch, passthrough };
  return normalizeDeviceNodes({
    ...diagram,
    outlets: (diagram.outlets ?? []).map((o) => (o.id === outletId ? updated : o)),
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

export type DeviceRotationKind = 'lightBulb' | 'switch' | 'dimmerSwitch' | 'outlet';
export type RotationDirection = 'cw' | 'ccw';

function nextOrientation(current: number | undefined, direction: RotationDirection): 0 | 90 | 180 | 270 {
  const base = ((Math.round((current ?? 0) / 90) * 90) % 360 + 360) % 360;
  const delta = direction === 'cw' ? 90 : -90;
  const next = ((base + delta) % 360 + 360) % 360;
  return next as 0 | 90 | 180 | 270;
}

/** Rotates a single device 90° around its own center and refreshes attached paths. */
export function rotateDevice(
  diagram: Diagram,
  kind: DeviceRotationKind,
  id: string,
  direction: RotationDirection,
): Diagram {
  if (kind === 'lightBulb') {
    const bulb = diagram.lightBulbs.find((b) => b.id === id);
    if (!bulb) return diagram;
    const orientation = nextOrientation(bulb.orientation, direction);
    return refreshHubWirePaths(
      rebuildDeviceConduitPathsForDevice(
        {
          ...diagram,
          lightBulbs: diagram.lightBulbs.map((b) => (b.id === id ? { ...b, orientation } : b)),
        },
        'lightBulb',
        id,
      ),
    );
  }
  if (kind === 'switch') {
    const sw = diagram.switches.find((s) => s.id === id);
    if (!sw) return diagram;
    const orientation = nextOrientation(sw.orientation, direction);
    return refreshHubWirePaths(
      rebuildDeviceConduitPathsForDevice(
        {
          ...diagram,
          switches: diagram.switches.map((s) => (s.id === id ? { ...s, orientation } : s)),
        },
        'switch',
        id,
      ),
    );
  }
  if (kind === 'dimmerSwitch') {
    const dim = (diagram.dimmerSwitches ?? []).find((d) => d.id === id);
    if (!dim) return diagram;
    const orientation = nextOrientation(dim.orientation, direction);
    return refreshHubWirePaths(
      rebuildDeviceConduitPathsForDevice(
        {
          ...diagram,
          dimmerSwitches: (diagram.dimmerSwitches ?? []).map((d) =>
            d.id === id ? { ...d, orientation } : d,
          ),
        },
        'dimmerSwitch',
        id,
      ),
    );
  }
  const outlet = (diagram.outlets ?? []).find((o) => o.id === id);
  if (!outlet) return diagram;
  const orientation = nextOrientation(outlet.orientation, direction);
  return refreshHubWirePaths(
    rebuildDeviceConduitPathsForDevice(
      {
        ...diagram,
        outlets: (diagram.outlets ?? []).map((o) => (o.id === id ? { ...o, orientation } : o)),
      },
      'outlet',
      id,
    ),
  );
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

export function deleteDimmerSwitch(diagram: Diagram, dimmerId: string): Diagram {
  const nodeIds = new Set(
    diagram.deviceNodes
      .filter((n) => n.deviceKind === 'dimmerSwitch' && n.deviceId === dimmerId)
      .map((n) => n.id),
  );
  return removeDeviceConduitsForNodes({
    ...diagram,
    dimmerSwitches: (diagram.dimmerSwitches ?? []).filter((d) => d.id !== dimmerId),
    deviceNodes: diagram.deviceNodes.filter((n) => !nodeIds.has(n.id)),
    wires: diagram.wires.map((w) =>
      w.deviceNodeId && nodeIds.has(w.deviceNodeId) ? { ...w, deviceNodeId: null } : w,
    ),
  }, nodeIds);
}

export function deleteOutlet(diagram: Diagram, outletId: string): Diagram {
  const nodeIds = new Set(
    diagram.deviceNodes
      .filter((n) => n.deviceKind === 'outlet' && n.deviceId === outletId)
      .map((n) => n.id),
  );
  return removeDeviceConduitsForNodes({
    ...diagram,
    outlets: (diagram.outlets ?? []).filter((o) => o.id !== outletId),
    deviceNodes: diagram.deviceNodes.filter((n) => !nodeIds.has(n.id)),
    wires: diagram.wires.map((w) =>
      w.deviceNodeId && nodeIds.has(w.deviceNodeId) ? { ...w, deviceNodeId: null } : w,
    ),
  }, nodeIds);
}

export function detachWireFromDeviceNode(diagram: Diagram, wireId: string): Diagram {
  const wires = diagram.wires.map((w) => (w.id === wireId ? { ...w, deviceNodeId: null } : w));
  return refreshDeviceWirePaths(refreshHubWirePaths({ ...diagram, wires }));
}

/** Attaches a wire's free end directly to a light or switch terminal. */
export function attachWireToDeviceNode(
  diagram: Diagram,
  nodeId: string,
  wireId: string,
  endpoint: WireEndpoint,
): Diagram {
  const node = deviceNodeById(diagram, nodeId);
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!node || !wire) {
    throw new Error('Terminal or wire not found');
  }
  if (endpoint !== 'end') {
    throw new Error('Connect the free wire end to a terminal');
  }
  if (wire.deviceNodeId) {
    throw new Error('Wire is already connected to a terminal');
  }
  if (wireLinksForWire(diagram, wireId).length > 0) {
    throw new Error('Disconnect wire-to-wire links before connecting to a terminal');
  }

  if (wireIdsOnDeviceTerminal(diagram, nodeId).length > 0) {
    throw new Error('Terminal already has a wire connection');
  }

  const wires = diagram.wires.map((w) =>
    w.id === wireId ? { ...w, deviceNodeId: nodeId } : w,
  );
  return refreshDeviceWirePaths(refreshHubWirePaths({ ...diagram, wires }));
}

/** Links a device terminal to a hub via a direct wire or conduit wire on that terminal. */
export function attachHubToDeviceNode(diagram: Diagram, hubId: string, nodeId: string): Diagram {
  if (!hubById(diagram, hubId) || !deviceNodeById(diagram, nodeId)) {
    throw new Error('Hub or terminal not found');
  }

  const directWires = wiresOnDeviceNode(diagram, nodeId);
  if (directWires.length > 0) {
    const wire = directWires.find((w) => !w.hubId) ?? directWires[0]!;
    return attachWireToHub(diagram, hubId, wire.id);
  }

  const conduit = conduitsOnDeviceNode(diagram, nodeId)[0];
  if (!conduit || conduit.wireIds.length === 0) {
    throw new Error('Connect a wire to this terminal before linking to a hub');
  }
  const conduitWire =
    conduit.wireIds.map((id) => diagram.wires.find((w) => w.id === id)).find((w) => w && !w.hubId) ??
    diagram.wires.find((w) => w.id === conduit.wireIds[0]);
  if (!conduitWire) {
    throw new Error('No wire available on this terminal');
  }
  return attachWireToHub(diagram, hubId, conduitWire.id);
}
