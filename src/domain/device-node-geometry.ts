import type { DeviceNode, Diagram, DimmerSwitch, LightBulb, Outlet, Switch, Wire } from './types';
import { GRID_SIZE } from './grid';

/** Two grid cells; terminals sit on grid lines when the bulb center is snapped. */
export const LIGHT_BULB_RADIUS = GRID_SIZE * 2;

export const DEFAULT_SWITCH_SIZE = Object.freeze({
  width: GRID_SIZE * 8,
  height: GRID_SIZE * 4,
});

export const DEFAULT_DIMMER_SIZE = DEFAULT_SWITCH_SIZE;

export const DEFAULT_OUTLET_SIZE = Object.freeze({
  width: GRID_SIZE * 6,
  height: GRID_SIZE * 5,
});

export function lightBulbById(diagram: Diagram, id: string): LightBulb | undefined {
  return diagram.lightBulbs.find((b) => b.id === id);
}

export function switchById(diagram: Diagram, id: string): Switch | undefined {
  return diagram.switches.find((s) => s.id === id);
}

export function dimmerById(diagram: Diagram, id: string): DimmerSwitch | undefined {
  return (diagram.dimmerSwitches ?? []).find((d) => d.id === id);
}

export function outletById(diagram: Diagram, id: string): Outlet | undefined {
  return (diagram.outlets ?? []).find((o) => o.id === id);
}

export function deviceNodeById(diagram: Diagram, nodeId: string): DeviceNode | undefined {
  return diagram.deviceNodes.find((n) => n.id === nodeId);
}

export function deviceNodesForDevice(
  diagram: Diagram,
  deviceKind: DeviceNode['deviceKind'],
  deviceId: string,
): DeviceNode[] {
  return diagram.deviceNodes
    .filter((n) => n.deviceKind === deviceKind && n.deviceId === deviceId)
    .sort((a, b) => a.slot - b.slot);
}

export function lightBulbCenter(bulb: LightBulb): { x: number; y: number } {
  const r = LIGHT_BULB_RADIUS;
  return { x: bulb.x + r, y: bulb.y + r };
}

/** Clockwise rotation for a device, defaulting to 0. */
export function deviceOrientation(device: { orientation?: number } | null | undefined): number {
  const raw = device?.orientation ?? 0;
  const norm = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  return norm;
}

/** Center of a device in world space, used as the rotation pivot. */
export function deviceCenter(diagram: Diagram, node: DeviceNode): { x: number; y: number } | null {
  if (node.deviceKind === 'lightBulb') {
    const bulb = lightBulbById(diagram, node.deviceId);
    return bulb ? lightBulbCenter(bulb) : null;
  }
  const sw = switchById(diagram, node.deviceId);
  if (sw) return { x: sw.x + sw.width / 2, y: sw.y + sw.height / 2 };
  const dim = dimmerById(diagram, node.deviceId);
  if (dim) return { x: dim.x + dim.width / 2, y: dim.y + dim.height / 2 };
  const outlet = outletById(diagram, node.deviceId);
  if (outlet) return { x: outlet.x + outlet.width / 2, y: outlet.y + outlet.height / 2 };
  return null;
}

/** Rotate a point clockwise by `deg` (only 0/90/180/270 expected) around `center`. */
export function rotateAroundCenter(
  pt: { x: number; y: number },
  center: { x: number; y: number },
  deg: number,
): { x: number; y: number } {
  if (deg === 0) return pt;
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  // Clockwise rotation in SVG's y-down coordinate system.
  switch (((deg % 360) + 360) % 360) {
    case 90:
      return { x: center.x - dy, y: center.y + dx };
    case 180:
      return { x: center.x - dx, y: center.y - dy };
    case 270:
      return { x: center.x + dy, y: center.y - dx };
    default:
      return pt;
  }
}

/** Orientation-aware lookup of the device this node belongs to. */
function deviceForNode(diagram: Diagram, node: DeviceNode): { orientation?: number } | null {
  if (node.deviceKind === 'lightBulb') return lightBulbById(diagram, node.deviceId) ?? null;
  if (node.deviceKind === 'switch') return switchById(diagram, node.deviceId) ?? null;
  if (node.deviceKind === 'dimmerSwitch') return dimmerById(diagram, node.deviceId) ?? null;
  if (node.deviceKind === 'outlet') return outletById(diagram, node.deviceId) ?? null;
  return null;
}

/** World position for a device terminal IGNORING rotation (used by shape rendering inside a rotated group). */
export function deviceNodeLocalPoint(diagram: Diagram, node: DeviceNode): { x: number; y: number } | null {
  if (node.deviceKind === 'lightBulb') {
    const bulb = lightBulbById(diagram, node.deviceId);
    if (!bulb) return null;
    const { x: cx, y: cy } = lightBulbCenter(bulb);
    const r = LIGHT_BULB_RADIUS;
    if (node.slot === 0) return { x: cx - r, y: cy };
    if (node.slot === 1) return { x: cx + r, y: cy };
    return null;
  }

  const sw = switchById(diagram, node.deviceId);
  if (sw) {
    const cx = sw.x + sw.width / 2;
    const cy = sw.y + sw.height / 2;
    if (sw.terminalCount === 4) {
      if (node.slot === 0) return { x: sw.x, y: sw.y };
      if (node.slot === 1) return { x: sw.x + sw.width, y: sw.y };
      if (node.slot === 2) return { x: sw.x, y: sw.y + sw.height };
      if (node.slot === 3) return { x: sw.x + sw.width, y: sw.y + sw.height };
      return null;
    }
    if (node.slot === 0) return { x: sw.x, y: cy };
    if (node.slot === 1) return { x: sw.x + sw.width, y: cy };
    if (node.slot === 2 && sw.terminalCount >= 3) return { x: cx, y: sw.y + sw.height };
    return null;
  }

  const dim = dimmerById(diagram, node.deviceId);
  if (dim) {
    const cy = dim.y + dim.height / 2;
    if (node.slot === 0) return { x: dim.x, y: cy };
    if (node.slot === 1) return { x: dim.x + dim.width, y: cy };
    return null;
  }

  const outlet = outletById(diagram, node.deviceId);
  if (outlet) {
    if (!outlet.passthrough) {
      const cy = outlet.y + outlet.height / 2;
      if (node.slot === 0) return { x: outlet.x, y: cy };
      if (node.slot === 1) return { x: outlet.x + outlet.width, y: cy };
      return null;
    }
    if (node.slot === 0) return { x: outlet.x, y: outlet.y + outlet.height * 0.25 };
    if (node.slot === 1) return { x: outlet.x + outlet.width, y: outlet.y + outlet.height * 0.25 };
    if (node.slot === 2) return { x: outlet.x, y: outlet.y + outlet.height * 0.75 };
    if (node.slot === 3) return { x: outlet.x + outlet.width, y: outlet.y + outlet.height * 0.75 };
    return null;
  }

  return null;
}

/** World position for a device terminal accounting for the device's orientation. */
export function deviceNodeWorldPoint(diagram: Diagram, node: DeviceNode): { x: number; y: number } | null {
  const local = deviceNodeLocalPoint(diagram, node);
  if (!local) return null;
  const orientation = deviceOrientation(deviceForNode(diagram, node));
  if (orientation === 0) return local;
  const center = deviceCenter(diagram, node);
  if (!center) return local;
  return rotateAroundCenter(local, center, orientation);
}

export function wiresOnDeviceNode(diagram: Diagram, nodeId: string): Wire[] {
  return diagram.wires.filter((w) => w.deviceNodeId === nodeId);
}

export function wireOnDeviceNode(diagram: Diagram, nodeId: string) {
  return wiresOnDeviceNode(diagram, nodeId)[0];
}

export function conduitsOnDeviceNode(diagram: Diagram, nodeId: string) {
  return diagram.conduits.filter((c) => c.kind === 'device' && c.deviceNodeId === nodeId);
}

/** Wire ids directly attached or on a terminal conduit stub. */
export function wireIdsOnDeviceTerminal(diagram: Diagram, nodeId: string): string[] {
  const ids = new Set<string>();
  for (const wire of diagram.wires) {
    if (wire.deviceNodeId === nodeId) ids.add(wire.id);
  }
  for (const conduit of conduitsOnDeviceNode(diagram, nodeId)) {
    for (const wireId of conduit.wireIds) ids.add(wireId);
  }
  return [...ids];
}

/** Unit vector from device center through the terminal (stub runs outward). */
export function deviceNodeOutwardNormal(
  diagram: Diagram,
  node: DeviceNode,
): { x: number; y: number } | null {
  const pt = deviceNodeWorldPoint(diagram, node);
  if (!pt) return null;

  if (node.deviceKind === 'lightBulb') {
    const bulb = lightBulbById(diagram, node.deviceId);
    if (!bulb) return null;
    const center = lightBulbCenter(bulb);
    const vx = pt.x - center.x;
    const vy = pt.y - center.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  const sw = switchById(diagram, node.deviceId);
  if (sw) {
    const center = { x: sw.x + sw.width / 2, y: sw.y + sw.height / 2 };
    const vx = pt.x - center.x;
    const vy = pt.y - center.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  const dim = dimmerById(diagram, node.deviceId);
  if (dim) {
    const center = { x: dim.x + dim.width / 2, y: dim.y + dim.height / 2 };
    const vx = pt.x - center.x;
    const vy = pt.y - center.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  const outlet = outletById(diagram, node.deviceId);
  if (outlet) {
    const center = { x: outlet.x + outlet.width / 2, y: outlet.y + outlet.height / 2 };
    const vx = pt.x - center.x;
    const vy = pt.y - center.y;
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  return null;
}
