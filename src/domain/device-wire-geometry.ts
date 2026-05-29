import {
  defaultFivePointPath,
  dragFixedVertex,
  draggableLinkVertexIndices,
  hasCustomLinkPathShape,
  normalizeLinkPath,
  pinPathEndpoints,
} from './path-editing';
import { deviceNodeById, deviceNodeWorldPoint } from './device-node-geometry';
import type { ConduitEndpointRoles } from './path-routing';
import type { Diagram, Wire } from './types';
import { wireLinkEndpoint } from './wire-geometry';

function deviceWireEndpoints(
  diagram: Diagram,
  wire: Wire,
): { terminal: { x: number; y: number }; wireEnd: { x: number; y: number } } | null {
  if (!wire.deviceNodeId) return null;
  const node = deviceNodeById(diagram, wire.deviceNodeId);
  if (!node) return null;
  const terminal = deviceNodeWorldPoint(diagram, node);
  const wireEnd = wireLinkEndpoint(diagram, wire);
  if (!terminal || !wireEnd) return null;
  return { terminal, wireEnd };
}

export function deviceWireDisplayPath(
  diagram: Diagram,
  wireId: string,
): { x: number; y: number }[] {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.deviceNodeId) return [];

  const ends = deviceWireEndpoints(diagram, wire);
  if (!ends) return [];

  const stored = diagram.layout.deviceWirePaths?.[wireId]?.points;
  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  if (hasCustomLinkPathShape(stored)) {
    return pinPathEndpoints(stored!, ends.terminal, ends.wireEnd, fixedRoles);
  }

  if (stored && stored.length >= 2) {
    return normalizeLinkPath(stored, ends.terminal, ends.wireEnd);
  }

  return defaultFivePointPath(ends.terminal, ends.wireEnd);
}

export function moveDeviceWireJoint(
  diagram: Diagram,
  wireId: string,
  vertexIndex: number,
  x: number,
  y: number,
): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.deviceNodeId) return diagram;
  if (!draggableLinkVertexIndices().includes(vertexIndex)) return diagram;

  const ends = deviceWireEndpoints(diagram, wire);
  if (!ends) return diagram;

  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
  const current = normalizeLinkPath(deviceWireDisplayPath(diagram, wireId), ends.terminal, ends.wireEnd);
  if (vertexIndex <= 0 || vertexIndex >= current.length) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y });
  points = normalizeLinkPath(points, ends.terminal, ends.wireEnd);
  points = pinPathEndpoints(points, ends.terminal, ends.wireEnd, fixedRoles);

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      deviceWirePaths: {
        ...(diagram.layout.deviceWirePaths ?? {}),
        [wireId]: { points },
      },
    },
  };
}

export function refreshDeviceWirePaths(diagram: Diagram): Diagram {
  const deviceWirePaths = { ...(diagram.layout.deviceWirePaths ?? {}) };
  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  for (const wire of diagram.wires) {
    if (!wire.deviceNodeId) {
      delete deviceWirePaths[wire.id];
      continue;
    }

    const ends = deviceWireEndpoints(diagram, wire);
    if (!ends) continue;

    const stored = deviceWirePaths[wire.id]?.points;
    if (hasCustomLinkPathShape(stored)) {
      deviceWirePaths[wire.id] = {
        points: pinPathEndpoints(stored!, ends.terminal, ends.wireEnd, fixedRoles),
      };
      continue;
    }

    deviceWirePaths[wire.id] = {
      points: defaultFivePointPath(ends.terminal, ends.wireEnd),
    };
  }

  for (const id of Object.keys(deviceWirePaths)) {
    if (!diagram.wires.some((w) => w.id === id && w.deviceNodeId)) {
      delete deviceWirePaths[id];
    }
  }

  return { ...diagram, layout: { ...diagram.layout, deviceWirePaths } };
}

export function ensureDeviceWirePath(diagram: Diagram, wireId: string): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.deviceNodeId) return diagram;

  const stored = diagram.layout.deviceWirePaths?.[wireId]?.points;
  if (hasCustomLinkPathShape(stored)) return diagram;

  return refreshDeviceWirePaths(diagram);
}
