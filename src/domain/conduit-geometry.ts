import { anchorPoint } from './anchors';
import { hubById, hubWorldPoint } from './hub-geometry';
import {
  deviceNodeById,
  deviceNodeOutwardNormal,
  deviceNodeWorldPoint,
} from './device-node-geometry';
import { conduitStubPath } from './orthogonal-path';
import type { AnchorPosition, DeviceNode, Diagram, Hub, JunctionBox } from './types';

import { GRID_SIZE } from './grid';

/** Legacy `kind: local` junction-wall stub length (anchor inward toward box center — shorter than breaker stubs). */
export const LOCAL_CONDUIT_STUB_LENGTH = GRID_SIZE * 4;

const BREAKER_CONDUIT_STUB_LENGTH = GRID_SIZE * 12;

/** Unit normal from box center toward the anchor — stub leaves the box this way from the wall. */
export function junctionBoxAnchorOutwardNormal(
  box: JunctionBox,
  anchor: AnchorPosition,
): { x: number; y: number } {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pt = anchorPoint(box, anchor);
  const vx = pt.x - center.x;
  const vy = pt.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
}

/** Into the box from the anchor (matches `localConduitPathPoints`). */
export function junctionBoxAnchorInwardNormal(
  box: JunctionBox,
  anchor: AnchorPosition,
): { x: number; y: number } {
  const out = junctionBoxAnchorOutwardNormal(box, anchor);
  return { x: -out.x, y: -out.y };
}

export function localConduitPathPoints(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number }[] {
  const start = anchorPoint(box, anchor);
  return conduitStubPath(start, junctionBoxAnchorInwardNormal(box, anchor), LOCAL_CONDUIT_STUB_LENGTH);
}

export function deviceConduitPathPoints(
  diagram: Diagram,
  deviceNodeId: string,
): { x: number; y: number }[] | null {
  const node = deviceNodeById(diagram, deviceNodeId);
  if (!node) return null;
  const start = deviceNodeWorldPoint(diagram, node);
  const normal = deviceNodeOutwardNormal(diagram, node);
  if (!start || !normal) return null;
  return conduitStubPath(start, normal, LOCAL_CONDUIT_STUB_LENGTH);
}

function hubOutwardNormal(box: JunctionBox, hub: Hub): { x: number; y: number } {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pt = hubWorldPoint(box, hub);
  const vx = pt.x - center.x;
  const vy = pt.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
}

export function hubConduitPathPoints(
  diagram: Diagram,
  hubId: string,
): { x: number; y: number }[] | null {
  const hub = hubById(diagram, hubId);
  if (!hub) return null;
  const box = diagram.junctionBoxes.find((j) => j.id === hub.junctionBoxId);
  if (!box) return null;
  const start = hubWorldPoint(box, hub);
  return conduitStubPath(start, hubOutwardNormal(box, hub), LOCAL_CONDUIT_STUB_LENGTH);
}

export function rebuildHubConduitPathsForJunction(
  diagram: Diagram,
  junctionBoxId: string,
): Diagram {
  const conduitPaths = { ...diagram.layout.conduitPaths };
  for (const conduit of diagram.conduits) {
    if (conduit.kind !== 'hub') continue;
    const hub = hubById(diagram, conduit.hubId);
    if (!hub || hub.junctionBoxId !== junctionBoxId) continue;
    const points = hubConduitPathPoints(diagram, conduit.hubId);
    if (points) {
      conduitPaths[conduit.id] = { points };
    }
  }
  return { ...diagram, layout: { ...diagram.layout, conduitPaths } };
}

export function breakerConduitPathPoints(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number }[] {
  const start = anchorPoint(box, anchor);
  return conduitStubPath(start, junctionBoxAnchorOutwardNormal(box, anchor), BREAKER_CONDUIT_STUB_LENGTH);
}

export function rebuildDeviceConduitPathsForDevice(
  diagram: Diagram,
  deviceKind: DeviceNode['deviceKind'],
  deviceId: string,
): Diagram {
  const conduitPaths = { ...diagram.layout.conduitPaths };
  for (const conduit of diagram.conduits) {
    if (conduit.kind !== 'device') continue;
    const node = deviceNodeById(diagram, conduit.deviceNodeId);
    if (!node || node.deviceKind !== deviceKind || node.deviceId !== deviceId) continue;
    const points = deviceConduitPathPoints(diagram, conduit.deviceNodeId);
    if (points) {
      conduitPaths[conduit.id] = { points };
    }
  }
  return { ...diagram, layout: { ...diagram.layout, conduitPaths } };
}
