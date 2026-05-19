import { anchorPoint } from './anchors';
import {
  deviceNodeById,
  deviceNodeOutwardNormal,
  deviceNodeWorldPoint,
} from './device-node-geometry';
import { conduitStubPath } from './orthogonal-path';
import type { AnchorPosition, Diagram, JunctionBox } from './types';

/** Local conduit runs from the anchor into the junction box (shorter than breaker stubs). */
export const LOCAL_CONDUIT_STUB_LENGTH = 56;

const BREAKER_CONDUIT_STUB_LENGTH = 140;

function outwardNormal(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number } {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pt = anchorPoint(box, anchor);
  const vx = pt.x - center.x;
  const vy = pt.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
}

function inwardNormal(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number } {
  const out = outwardNormal(box, anchor);
  return { x: -out.x, y: -out.y };
}

export function localConduitPathPoints(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number }[] {
  const start = anchorPoint(box, anchor);
  return conduitStubPath(start, inwardNormal(box, anchor), LOCAL_CONDUIT_STUB_LENGTH);
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

export function breakerConduitPathPoints(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number }[] {
  const start = anchorPoint(box, anchor);
  return conduitStubPath(start, outwardNormal(box, anchor), BREAKER_CONDUIT_STUB_LENGTH);
}

export function rebuildDeviceConduitPathsForDevice(
  diagram: Diagram,
  deviceKind: 'lightBulb' | 'switch',
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
