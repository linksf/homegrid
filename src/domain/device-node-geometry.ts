import type { DeviceNode, Diagram, LightBulb, Switch } from './types';

export const LIGHT_BULB_RADIUS = 28;

export const DEFAULT_SWITCH_SIZE = Object.freeze({
  width: 80,
  height: 44,
});

export function lightBulbById(diagram: Diagram, id: string): LightBulb | undefined {
  return diagram.lightBulbs.find((b) => b.id === id);
}

export function switchById(diagram: Diagram, id: string): Switch | undefined {
  return diagram.switches.find((s) => s.id === id);
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

/** World position for a device terminal (slot 0 = left, 1 = right, 2 = bottom on 3-way switches). */
export function deviceNodeWorldPoint(diagram: Diagram, node: DeviceNode): { x: number; y: number } | null {
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
  if (!sw) return null;
  const cx = sw.x + sw.width / 2;
  const cy = sw.y + sw.height / 2;
  if (node.slot === 0) return { x: sw.x, y: cy };
  if (node.slot === 1) return { x: sw.x + sw.width, y: cy };
  if (node.slot === 2 && sw.terminalCount >= 3) return { x: cx, y: sw.y + sw.height };
  return null;
}

export function wireOnDeviceNode(diagram: Diagram, nodeId: string) {
  return diagram.wires.find((w) => w.deviceNodeId === nodeId);
}

export function conduitsOnDeviceNode(diagram: Diagram, nodeId: string) {
  return diagram.conduits.filter((c) => c.kind === 'device' && c.deviceNodeId === nodeId);
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
  if (!sw) return null;
  const center = { x: sw.x + sw.width / 2, y: sw.y + sw.height / 2 };
  const vx = pt.x - center.x;
  const vy = pt.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
}
