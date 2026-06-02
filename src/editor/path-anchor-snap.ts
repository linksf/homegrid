import { resolveExposedCableWirePath } from '../domain/exposed-wire-endpoints';
import { conduitStubResolvedPath } from '../domain/cable-geometry';
import { conduitCenterPath } from '../domain/layout-offsets';
import { conduitRunDisplayPath } from '../domain/conduit-run-geometry';
import { deviceWireDisplayPath } from '../domain/device-wire-geometry';
import { hubBridgeDisplayPath } from '../domain/hub-bridge-geometry';
import { hubWireDisplayPath } from '../domain/hub-wire-geometry';
import type { Diagram } from '../domain/types';
import { wireLinkDisplayPath, wireWorldPolyline } from '../domain/wire-geometry';
import type { PathAnchorRef } from './anchor-selection';

/** Screen-space alignment snap when dragging path bend anchors. */
export const PATH_CHAIN_ALIGN_SNAP_SCREEN_PX = 14;

function pathPointsForRef(diagram: Diagram, ref: PathAnchorRef): { x: number; y: number }[] | null {
  switch (ref.kind) {
    case 'wire':
      return wireWorldPolyline(diagram, ref.wireId);
    case 'exposedWire':
      return resolveExposedCableWirePath(diagram, ref.wireId);
    case 'hubWire':
      return hubWireDisplayPath(diagram, ref.wireId);
    case 'deviceWire':
      return deviceWireDisplayPath(diagram, ref.wireId);
    case 'conduitStub':
      return conduitStubResolvedPath(diagram, ref.cableId);
    case 'link':
      return wireLinkDisplayPath(diagram, ref.linkId);
    case 'hubBridge':
      return hubBridgeDisplayPath(diagram, ref.bridgeId);
    case 'conduitRun':
      return conduitRunDisplayPath(diagram, ref.runId);
    case 'conduit':
      return conduitCenterPath(diagram, ref.conduitId);
  }
}

/** Neighbor vertices on the same path segment chain (before / after the dragged anchor). */
export function chainNeighborPoints(
  diagram: Diagram,
  ref: PathAnchorRef,
): { x: number; y: number }[] {
  const path = pathPointsForRef(diagram, ref);
  if (!path) return [];
  const neighbors: { x: number; y: number }[] = [];
  if (ref.index > 0) neighbors.push(path[ref.index - 1]!);
  if (ref.index < path.length - 1) neighbors.push(path[ref.index + 1]!);
  return neighbors;
}

export function snapPointToChainNeighbors(
  x: number,
  y: number,
  neighbors: readonly { x: number; y: number }[],
  viewScale: number,
): { x: number; y: number } {
  if (neighbors.length === 0) return { x, y };
  const threshold = PATH_CHAIN_ALIGN_SNAP_SCREEN_PX / Math.max(viewScale, 0.001);
  let sx = x;
  let sy = y;
  for (const neighbor of neighbors) {
    if (Math.abs(x - neighbor.x) <= threshold) sx = neighbor.x;
    if (Math.abs(y - neighbor.y) <= threshold) sy = neighbor.y;
  }
  return { x: sx, y: sy };
}
