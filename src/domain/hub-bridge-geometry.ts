import {
  defaultFivePointPath,
  dragFixedVertex,
  draggableLinkVertexIndices,
  hasCustomLinkPathShape,
  normalizeLinkPath,
  pinPathEndpoints,
} from './path-editing';
import { hubById, hubWorldPoint } from './hub-geometry';
import { orthogonalRoute } from './orthogonal-path';
import type { ConduitEndpointRoles } from './path-routing';
import type { Diagram, HubBridge } from './types';

function hubBridgeEndpoints(
  diagram: Diagram,
  bridge: HubBridge,
): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const ha = hubById(diagram, bridge.hubIdA);
  const hb = hubById(diagram, bridge.hubIdB);
  if (!ha || !hb) return null;
  const boxA = diagram.junctionBoxes.find((j) => j.id === ha.junctionBoxId);
  const boxB = diagram.junctionBoxes.find((j) => j.id === hb.junctionBoxId);
  if (!boxA || !boxB) return null;
  return {
    start: hubWorldPoint(boxA, ha),
    end: hubWorldPoint(boxB, hb),
  };
}

export function defaultHubBridgePath(
  diagram: Diagram,
  bridgeId: string,
): { x: number; y: number }[] {
  const bridge = diagram.hubBridges.find((b) => b.id === bridgeId);
  if (!bridge) return [];
  const ends = hubBridgeEndpoints(diagram, bridge);
  if (!ends) return [];
  return defaultFivePointPath(ends.start, ends.end);
}

export function hubBridgeDisplayPath(
  diagram: Diagram,
  bridgeId: string,
): { x: number; y: number }[] {
  const bridge = diagram.hubBridges.find((b) => b.id === bridgeId);
  if (!bridge) return [];

  const ends = hubBridgeEndpoints(diagram, bridge);
  if (!ends) return [];

  const stored = diagram.layout.hubBridgePaths[bridgeId]?.points;
  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  if (hasCustomLinkPathShape(stored)) {
    return pinPathEndpoints(stored!, ends.start, ends.end, fixedRoles);
  }

  if (stored && stored.length >= 2) {
    return normalizeLinkPath(stored, ends.start, ends.end);
  }

  return defaultHubBridgePath(diagram, bridgeId);
}

export function moveHubBridgeJoint(
  diagram: Diagram,
  bridgeId: string,
  vertexIndex: number,
  x: number,
  y: number,
): Diagram {
  const bridge = diagram.hubBridges.find((b) => b.id === bridgeId);
  if (!bridge) return diagram;
  if (!draggableLinkVertexIndices().includes(vertexIndex)) return diagram;

  const ends = hubBridgeEndpoints(diagram, bridge);
  if (!ends) return diagram;

  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
  const current = normalizeLinkPath(hubBridgeDisplayPath(diagram, bridgeId), ends.start, ends.end);
  if (vertexIndex <= 0 || vertexIndex >= current.length) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y });
  points = normalizeLinkPath(points, ends.start, ends.end);
  points = pinPathEndpoints(points, ends.start, ends.end, fixedRoles);

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      hubBridgePaths: { ...diagram.layout.hubBridgePaths, [bridgeId]: { points } },
    },
  };
}

export function refreshHubBridgePaths(diagram: Diagram): Diagram {
  const hubBridgePaths = { ...diagram.layout.hubBridgePaths };
  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  for (const bridge of diagram.hubBridges) {
    const ends = hubBridgeEndpoints(diagram, bridge);
    if (!ends) continue;

    const stored = hubBridgePaths[bridge.id]?.points;
    if (hasCustomLinkPathShape(stored)) {
      hubBridgePaths[bridge.id] = {
        points: pinPathEndpoints(stored!, ends.start, ends.end, fixedRoles),
      };
      continue;
    }

    hubBridgePaths[bridge.id] = {
      points: defaultFivePointPath(ends.start, ends.end),
    };
  }

  for (const id of Object.keys(hubBridgePaths)) {
    if (!diagram.hubBridges.some((b) => b.id === id)) {
      delete hubBridgePaths[id];
    }
  }

  return { ...diagram, layout: { ...diagram.layout, hubBridgePaths } };
}

/** @deprecated Use refreshHubBridgePaths */
export function hubBridgeRoutedPath(
  diagram: Diagram,
  bridge: HubBridge,
): { x: number; y: number }[] | null {
  const ends = hubBridgeEndpoints(diagram, bridge);
  if (!ends) return null;
  return orthogonalRoute(ends.start, ends.end);
}
