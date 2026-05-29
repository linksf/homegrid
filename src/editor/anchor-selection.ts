import { anchorPoint } from '../domain/anchors';
import {
  conduitStubResolvedPath,
  moveConduitStubJoint,
  moveExposedJoint,
} from '../domain/cable-geometry';
import { conduitCenterPath } from '../domain/layout-offsets';
import {
  conduitUsesPerWirePaths,
  draggableLinkVertexIndices,
  draggablePathVertexIndices,
  draggableWireVertexIndices,
} from '../domain/path-editing';
import { conduitEndpointRoles, moveConduitJoint } from '../domain/path-routing';
import { deviceWireDisplayPath, moveDeviceWireJoint } from '../domain/device-wire-geometry';
import { resolveExposedCableWirePath } from '../domain/exposed-wire-endpoints';
import { hubBridgeDisplayPath, moveHubBridgeJoint } from '../domain/hub-bridge-geometry';
import { hubWireDisplayPath, moveHubWireJoint } from '../domain/hub-wire-geometry';
import { moveWireJoint, wireEndpointRoles } from '../domain/wire-routing';
import { moveWireLinkJoint, wireLinkDisplayPath, wireWorldPolyline } from '../domain/wire-geometry';
import type { AnchorPosition, Diagram } from '../domain/types';
import { pointMatches, type MarqueeMode, type MarqueeRect } from './marquee-selection';

const JUNCTION_ANCHORS: AnchorPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export type PathAnchorRef =
  | { kind: 'wire'; wireId: string; index: number }
  | { kind: 'exposedWire'; wireId: string; index: number }
  | { kind: 'hubWire'; wireId: string; index: number }
  | { kind: 'deviceWire'; wireId: string; index: number }
  | { kind: 'conduitStub'; cableId: string; index: number }
  | { kind: 'link'; linkId: string; index: number }
  | { kind: 'hubBridge'; bridgeId: string; index: number }
  | { kind: 'conduit'; conduitId: string; index: number };

export function encodeJunctionAnchor(boxId: string, anchor: AnchorPosition): string {
  return `jb:${boxId}:${anchor}`;
}

export function decodeJunctionAnchor(key: string): { boxId: string; anchor: AnchorPosition } | null {
  const parts = key.split(':');
  if (parts.length !== 3 || parts[0] !== 'jb') return null;
  const anchor = parts[2] as AnchorPosition;
  if (!JUNCTION_ANCHORS.includes(anchor)) return null;
  return { boxId: parts[1]!, anchor };
}

export function junctionBoxIdsFromAnchorKeys(keys: Iterable<string>): Set<string> {
  const ids = new Set<string>();
  for (const key of keys) {
    const decoded = decodeJunctionAnchor(key);
    if (decoded) ids.add(decoded.boxId);
  }
  return ids;
}

export function encodePathAnchor(ref: PathAnchorRef): string {
  switch (ref.kind) {
    case 'wire':
      return `wire:${ref.wireId}:${ref.index}`;
    case 'exposedWire':
      return `xw:${ref.wireId}:${ref.index}`;
    case 'hubWire':
      return `hub:${ref.wireId}:${ref.index}`;
    case 'deviceWire':
      return `dev:${ref.wireId}:${ref.index}`;
    case 'conduitStub':
      return `stub:${ref.cableId}:${ref.index}`;
    case 'link':
      return `link:${ref.linkId}:${ref.index}`;
    case 'hubBridge':
      return `bridge:${ref.bridgeId}:${ref.index}`;
    case 'conduit':
      return `conduit:${ref.conduitId}:${ref.index}`;
  }
}

export function decodePathAnchor(key: string): PathAnchorRef | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const index = Number(parts[2]);
  if (!Number.isInteger(index)) return null;
  switch (parts[0]) {
    case 'wire':
      return { kind: 'wire', wireId: parts[1]!, index };
    case 'xw':
      return { kind: 'exposedWire', wireId: parts[1]!, index };
    case 'hub':
      return { kind: 'hubWire', wireId: parts[1]!, index };
    case 'dev':
      return { kind: 'deviceWire', wireId: parts[1]!, index };
    case 'stub':
      return { kind: 'conduitStub', cableId: parts[1]!, index };
    case 'link':
      return { kind: 'link', linkId: parts[1]!, index };
    case 'bridge':
      return { kind: 'hubBridge', bridgeId: parts[1]!, index };
    case 'conduit':
      return { kind: 'conduit', conduitId: parts[1]!, index };
    default:
      return null;
  }
}

export function pathAnchorWorldPoint(diagram: Diagram, ref: PathAnchorRef): { x: number; y: number } | null {
  switch (ref.kind) {
    case 'wire': {
      const path = wireWorldPolyline(diagram, ref.wireId);
      return path?.[ref.index] ?? null;
    }
    case 'exposedWire': {
      const path = resolveExposedCableWirePath(diagram, ref.wireId);
      return path?.[ref.index] ?? null;
    }
    case 'hubWire': {
      const path = hubWireDisplayPath(diagram, ref.wireId);
      return path[ref.index] ?? null;
    }
    case 'deviceWire': {
      const path = deviceWireDisplayPath(diagram, ref.wireId);
      return path[ref.index] ?? null;
    }
    case 'conduitStub': {
      const path = conduitStubResolvedPath(diagram, ref.cableId);
      return path?.[ref.index] ?? null;
    }
    case 'link': {
      const path = wireLinkDisplayPath(diagram, ref.linkId);
      return path[ref.index] ?? null;
    }
    case 'hubBridge': {
      const path = hubBridgeDisplayPath(diagram, ref.bridgeId);
      return path[ref.index] ?? null;
    }
    case 'conduit': {
      const path = conduitCenterPath(diagram, ref.conduitId);
      return path?.[ref.index] ?? null;
    }
  }
}

export function collectJunctionAnchorsInMarquee(
  diagram: Diagram,
  rect: MarqueeRect,
  mode: MarqueeMode,
): Set<string> {
  const result = new Set<string>();
  for (const box of diagram.junctionBoxes) {
    for (const anchor of JUNCTION_ANCHORS) {
      const pt = anchorPoint(box, anchor);
      if (pointMatches(pt, rect, mode, 11)) {
        result.add(encodeJunctionAnchor(box.id, anchor));
      }
    }
  }
  return result;
}

export function collectPathAnchorsInMarquee(
  diagram: Diagram,
  rect: MarqueeRect,
  mode: MarqueeMode,
): Set<string> {
  const result = new Set<string>();

  for (const wire of diagram.wires) {
    if (wire.hubId) {
      const path = hubWireDisplayPath(diagram, wire.id);
      for (const index of draggableLinkVertexIndices(path.length)) {
        const pt = path[index];
        if (pt && pointMatches(pt, rect, mode)) {
          result.add(encodePathAnchor({ kind: 'hubWire', wireId: wire.id, index }));
        }
      }
    }

    if (wire.deviceNodeId) {
      const path = deviceWireDisplayPath(diagram, wire.id);
      for (const index of draggableLinkVertexIndices(path.length)) {
        const pt = path[index];
        if (pt && pointMatches(pt, rect, mode)) {
          result.add(encodePathAnchor({ kind: 'deviceWire', wireId: wire.id, index }));
        }
      }
    }

    if (wire.cableId) {
      const path = resolveExposedCableWirePath(diagram, wire.id);
      if (path) {
        for (const index of draggableWireVertexIndices(path.length, true, false)) {
          const pt = path[index];
          if (pt && pointMatches(pt, rect, mode)) {
            result.add(encodePathAnchor({ kind: 'exposedWire', wireId: wire.id, index }));
          }
        }
      }
    }

    const conduit = wire.conduitId ? diagram.conduits.find((c) => c.id === wire.conduitId) : undefined;
    if (conduit && conduitUsesPerWirePaths(conduit)) {
      const path = wireWorldPolyline(diagram, wire.id);
      if (!path) continue;
      const roles = wireEndpointRoles(diagram, wire.id);
      for (const index of draggableWireVertexIndices(
        path.length,
        roles.start === 'fixed',
        roles.end === 'fixed',
      )) {
        const pt = path[index];
        if (pt && pointMatches(pt, rect, mode)) {
          result.add(encodePathAnchor({ kind: 'wire', wireId: wire.id, index }));
        }
      }
    }
  }

  for (const cable of diagram.cables) {
    const path = conduitStubResolvedPath(diagram, cable.id);
    if (!path) continue;
    const stubEndFixed = diagram.conduitRuns.some(
      (r) => r.cableIdA === cable.id || r.cableIdB === cable.id,
    );
    const indices = stubEndFixed
      ? draggableLinkVertexIndices(path.length)
      : draggableWireVertexIndices(path.length, true, false);
    for (const index of indices) {
      const pt = path[index];
      if (pt && pointMatches(pt, rect, mode)) {
        result.add(encodePathAnchor({ kind: 'conduitStub', cableId: cable.id, index }));
      }
    }
  }

  for (const link of diagram.wireLinks) {
    const path = wireLinkDisplayPath(diagram, link.id);
    for (const index of draggableLinkVertexIndices(path.length)) {
      const pt = path[index];
      if (pt && pointMatches(pt, rect, mode)) {
        result.add(encodePathAnchor({ kind: 'link', linkId: link.id, index }));
      }
    }
  }

  for (const bridge of diagram.hubBridges) {
    const path = hubBridgeDisplayPath(diagram, bridge.id);
    for (const index of draggableLinkVertexIndices(path.length)) {
      const pt = path[index];
      if (pt && pointMatches(pt, rect, mode)) {
        result.add(encodePathAnchor({ kind: 'hubBridge', bridgeId: bridge.id, index }));
      }
    }
  }

  for (const conduit of diagram.conduits) {
    if (conduitUsesPerWirePaths(conduit) || conduit.wireIds.length !== 1) continue;
    const path = conduitCenterPath(diagram, conduit.id);
    if (!path) continue;
    const roles = conduitEndpointRoles(diagram, conduit);
    for (const index of draggablePathVertexIndices(path.length, roles)) {
      const pt = path[index];
      if (pt && pointMatches(pt, rect, mode)) {
        result.add(encodePathAnchor({ kind: 'conduit', conduitId: conduit.id, index }));
      }
    }
  }

  return result;
}

export function movePathAnchor(
  diagram: Diagram,
  ref: PathAnchorRef,
  x: number,
  y: number,
): Diagram {
  switch (ref.kind) {
    case 'wire':
      return moveWireJoint(diagram, ref.wireId, ref.index, x, y);
    case 'exposedWire':
      return moveExposedJoint(diagram, ref.wireId, ref.index, x, y);
    case 'hubWire':
      return moveHubWireJoint(diagram, ref.wireId, ref.index, x, y);
    case 'deviceWire':
      return moveDeviceWireJoint(diagram, ref.wireId, ref.index, x, y);
    case 'conduitStub':
      return moveConduitStubJoint(diagram, ref.cableId, ref.index, x, y);
    case 'link':
      return moveWireLinkJoint(diagram, ref.linkId, ref.index, x, y);
    case 'hubBridge':
      return moveHubBridgeJoint(diagram, ref.bridgeId, ref.index, x, y);
    case 'conduit':
      return moveConduitJoint(diagram, ref.conduitId, ref.index, x, y);
  }
}

export function movePathAnchorsByDelta(
  diagram: Diagram,
  keys: Iterable<string>,
  startPositions: Map<string, { x: number; y: number }>,
  draggedKey: string,
  x: number,
  y: number,
): Diagram {
  const draggedStart = startPositions.get(draggedKey);
  if (!draggedStart) return diagram;
  const dx = x - draggedStart.x;
  const dy = y - draggedStart.y;

  let next = diagram;
  for (const key of keys) {
    const ref = decodePathAnchor(key);
    const start = startPositions.get(key);
    if (!ref || !start) continue;
    next = movePathAnchor(next, ref, start.x + dx, start.y + dy);
  }
  return next;
}
