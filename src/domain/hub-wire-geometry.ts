import {
  defaultFivePointPath,
  dragFixedVertex,
  draggableLinkVertexIndices,
  normalizeLinkPath,
  pinPathEndpoints,
  hasCustomLinkPathShape,
} from './path-editing';
import { hubById, hubWorldPoint } from './hub-geometry';
import { deviceNodeById, deviceNodeWorldPoint } from './device-node-geometry';
import { orthogonalRoute } from './orthogonal-path';
import type { ConduitEndpointRoles } from './path-routing';
import type { Diagram, Wire } from './types';
import { wireLinkEndpoint } from './wire-geometry';

/** World point where a hub tie meets the wire or device terminal. */
export function hubWireAnchorPoint(diagram: Diagram, wire: Wire): { x: number; y: number } | null {
  if (wire.deviceNodeId) {
    const node = deviceNodeById(diagram, wire.deviceNodeId);
    if (!node) return null;
    return deviceNodeWorldPoint(diagram, node);
  }
  return wireLinkEndpoint(diagram, wire, 'end');
}

function hubWireEndpoints(
  diagram: Diagram,
  wire: Wire,
): { hub: { x: number; y: number }; anchor: { x: number; y: number } } | null {
  if (!wire.hubId) return null;
  const hub = hubById(diagram, wire.hubId);
  if (!hub) return null;
  const box = diagram.junctionBoxes.find((j) => j.id === hub.junctionBoxId);
  if (!box) return null;
  const anchor = hubWireAnchorPoint(diagram, wire);
  if (!anchor) return null;
  return { hub: hubWorldPoint(box, hub), anchor };
}

export function defaultHubWirePath(
  diagram: Diagram,
  wireId: string,
): { x: number; y: number }[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return null;
  const ends = hubWireEndpoints(diagram, wire);
  if (!ends) return null;
  return orthogonalRoute(ends.hub, ends.anchor);
}

export function hubWireDisplayPath(
  diagram: Diagram,
  wireId: string,
): { x: number; y: number }[] {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.hubId) return [];

  const ends = hubWireEndpoints(diagram, wire);
  if (!ends) return [];

  const stored = diagram.layout.hubWirePaths?.[wireId]?.points;
  if (stored && stored.length >= 2) {
    const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
    return pinPathEndpoints(stored, ends.hub, ends.anchor, fixedRoles);
  }

  return defaultHubWirePath(diagram, wireId) ?? defaultFivePointPath(ends.hub, ends.anchor);
}

export function moveHubWireJoint(
  diagram: Diagram,
  wireId: string,
  vertexIndex: number,
  x: number,
  y: number,
): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.hubId) return diagram;
  if (!draggableLinkVertexIndices().includes(vertexIndex)) return diagram;

  const ends = hubWireEndpoints(diagram, wire);
  if (!ends) return diagram;

  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
  const current = normalizeLinkPath(hubWireDisplayPath(diagram, wireId), ends.hub, ends.anchor);
  if (vertexIndex <= 0 || vertexIndex >= current.length) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y });
  points = normalizeLinkPath(points, ends.hub, ends.anchor);
  points = pinPathEndpoints(points, ends.hub, ends.anchor, fixedRoles);

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      hubWirePaths: {
        ...(diagram.layout.hubWirePaths ?? {}),
        [wireId]: { points },
      },
    },
  };
}

export function refreshHubWirePaths(diagram: Diagram): Diagram {
  const hubWirePaths = { ...(diagram.layout.hubWirePaths ?? {}) };

  for (const wire of diagram.wires) {
    if (!wire.hubId) {
      delete hubWirePaths[wire.id];
      continue;
    }
    const conduit = wire.conduitId ? diagram.conduits.find((c) => c.id === wire.conduitId) : undefined;
    if (conduit?.kind === 'hub') {
      delete hubWirePaths[wire.id];
      continue;
    }
    const ends = hubWireEndpoints(diagram, wire);
    if (!ends) continue;

    const stored = hubWirePaths[wire.id]?.points;
    if (hasCustomLinkPathShape(stored)) {
      const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
      hubWirePaths[wire.id] = {
        points: pinPathEndpoints(stored!, ends.hub, ends.anchor, fixedRoles),
      };
      continue;
    }

    hubWirePaths[wire.id] = {
      points: defaultFivePointPath(ends.hub, ends.anchor),
    };
  }

  for (const id of Object.keys(hubWirePaths)) {
    if (!diagram.wires.some((w) => w.id === id && w.hubId)) {
      delete hubWirePaths[id];
    }
  }

  return { ...diagram, layout: { ...diagram.layout, hubWirePaths } };
}

export function ensureHubWirePath(diagram: Diagram, wireId: string): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.hubId) return diagram;

  const stored = diagram.layout.hubWirePaths?.[wireId]?.points;
  if (stored && stored.length >= 2) return diagram;

  const ends = hubWireEndpoints(diagram, wire);
  if (!ends) return diagram;

  const path = defaultFivePointPath(ends.hub, ends.anchor);

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      hubWirePaths: {
        ...(diagram.layout.hubWirePaths ?? {}),
        [wireId]: { points: path },
      },
    },
  };
}
