import { anchorPoint } from './anchors';
import {
  breakerConduitPathPoints,
  deviceConduitPathPoints,
  hubConduitPathPoints,
  localConduitPathPoints,
} from './conduit-geometry';
import {
  conduitUsesPerWirePaths,
  dragPathVertex,
  hasCustomConduitPathShape,
  pinPathEndpoints,
  simplifyOrthogonalPath,
  type ConduitEndpointRoles,
} from './path-editing';
import {
  offsetPolylineFixedEndpoints,
  orthogonalRoute,
  perpendicularDelta,
  type Point,
} from './orthogonal-path';
import type { AnchorPosition, Conduit, Diagram } from './types';

export type { ConduitEndpointRoles } from './path-editing';
export type EndpointRole = ConduitEndpointRoles['start'];

const EPS = 1e-6;

/** Default centerline from domain geometry (anchor/terminal → stub tip). */
export function defaultConduitPath(diagram: Diagram, conduit: Conduit): Point[] | null {
  if (conduit.kind === 'local') {
    const box = diagram.junctionBoxes.find((j) => j.id === conduit.junctionBoxId);
    if (!box) return null;
    return localConduitPathPoints(box, conduit.anchor);
  }
  if (conduit.kind === 'device') {
    return deviceConduitPathPoints(diagram, conduit.deviceNodeId);
  }
  if (conduit.kind === 'hub') {
    return hubConduitPathPoints(diagram, conduit.hubId);
  }
  if ((conduit as { kind: string }).kind === 'breaker') {
    const legacy = conduit as typeof conduit & { junctionBoxId: string; anchor: AnchorPosition };
    const box = diagram.junctionBoxes.find((j) => j.id === legacy.junctionBoxId);
    if (!box) return null;
    return breakerConduitPathPoints(box, legacy.anchor);
  }
  if (conduit.kind === 'span') {
    const boxA = diagram.junctionBoxes.find((j) => j.id === conduit.junctionBoxIdA);
    const boxB = diagram.junctionBoxes.find((j) => j.id === conduit.junctionBoxIdB);
    if (!boxA || !boxB) return null;
    return orthogonalRoute(
      anchorPoint(boxA, conduit.anchorA),
      anchorPoint(boxB, conduit.anchorB),
    );
  }
  return null;
}

/** True when any wire on this conduit is tied to a hub or terminal at the far end. */
export function isConduitFarEndConnected(diagram: Diagram, conduit: Conduit): boolean {
  if (conduit.kind === 'hub') {
    for (const wireId of conduit.wireIds) {
      const wire = diagram.wires.find((w) => w.id === wireId);
      if (wire?.deviceNodeId) return true;
    }
    return false;
  }
  for (const wireId of conduit.wireIds) {
    const wire = diagram.wires.find((w) => w.id === wireId);
    if (!wire) continue;
    if (wire.hubId) return true;
  }
  return false;
}

export function conduitEndpointRoles(diagram: Diagram, conduit: Conduit): ConduitEndpointRoles {
  if (conduit.kind === 'span') {
    return { start: 'fixed', end: 'fixed' };
  }
  if (conduitUsesPerWirePaths(conduit) && conduit.wireIds.length > 1) {
    return { start: 'fixed', end: 'fixed' };
  }
  return {
    start: 'fixed',
    end: isConduitFarEndConnected(diagram, conduit) ? 'fixed' : 'free',
  };
}

function storedFreeTip(diagram: Diagram, conduit: Conduit): Point | null {
  const stored = diagram.layout.conduitPaths[conduit.id]?.points;
  if (!stored || stored.length < 2) return null;
  return { ...stored[stored.length - 1]! };
}

function pinnedDefaultEndpoints(
  diagram: Diagram,
  conduit: Conduit,
  defaults: Point[],
  roles: ConduitEndpointRoles,
): { start: Point; end: Point } {
  const start = { ...defaults[0]! };
  const end =
    roles.end === 'free'
      ? storedFreeTip(diagram, conduit) ?? { ...defaults[defaults.length - 1]! }
      : { ...defaults[defaults.length - 1]! };
  return { start, end };
}

/** Resolved conduit centerline for rendering and wire bundling. */
export function resolveConduitPath(diagram: Diagram, conduit: Conduit): Point[] | null {
  const defaults = defaultConduitPath(diagram, conduit);
  if (!defaults || defaults.length < 2) return null;

  const roles = conduitEndpointRoles(diagram, conduit);
  const { start, end } = pinnedDefaultEndpoints(diagram, conduit, defaults, roles);
  const stored = diagram.layout.conduitPaths[conduit.id]?.points;

  if (hasCustomConduitPathShape(stored)) {
    return pinPathEndpoints(stored!, start, end, roles);
  }

  const off = diagram.layout.conduitOffsets?.[conduit.id] ?? { dx: 0, dy: 0 };

  if (roles.start === 'fixed' && roles.end === 'fixed') {
    return offsetPolylineFixedEndpoints(defaults, off.dx, off.dy);
  }

  if (Math.hypot(end.x - start.x, end.y - start.y) < EPS) {
    return [start, end];
  }

  return orthogonalRoute(start, end);
}

/** Drag a bend or free tip on a conduit centerline. */
export function moveConduitJoint(
  diagram: Diagram,
  conduitId: string,
  vertexIndex: number,
  x: number,
  y: number,
): Diagram {
  const conduit = diagram.conduits.find((c) => c.id === conduitId);
  if (!conduit) return diagram;

  const current = resolveConduitPath(diagram, conduit);
  if (!current || vertexIndex <= 0 || vertexIndex >= current.length) return diagram;

  const defaults = defaultConduitPath(diagram, conduit);
  if (!defaults) return diagram;

  const roles = conduitEndpointRoles(diagram, conduit);
  const { start, end } = pinnedDefaultEndpoints(diagram, conduit, defaults, roles);
  let points = dragPathVertex(current, vertexIndex, { x, y });
  points = pinPathEndpoints(points, start, end, roles);

  const { [conduitId]: _co, ...conduitOffsets } = diagram.layout.conduitOffsets ?? {};
  const wireOffsets = { ...diagram.layout.wireOffsets };
  for (const wireId of conduit.wireIds) {
    delete wireOffsets[wireId];
  }

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      conduitPaths: { ...diagram.layout.conduitPaths, [conduitId]: { points } },
      conduitOffsets,
      wireOffsets,
    },
  };
}

/** Moves a free conduit end; rebuilds an orthogonal path from the fixed anchor. */
export function moveConduitFreeEnd(
  diagram: Diagram,
  conduitId: string,
  dx: number,
  dy: number,
): Diagram {
  if (dx === 0 && dy === 0) return diagram;
  const conduit = diagram.conduits.find((c) => c.id === conduitId);
  if (!conduit) return diagram;

  if (conduitUsesPerWirePaths(conduit) && conduit.wireIds.length > 1) {
    return diagram;
  }

  const roles = conduitEndpointRoles(diagram, conduit);
  if (roles.end !== 'free') {
    return nudgeConduitSideways(diagram, conduitId, dx, dy);
  }

  const current = resolveConduitPath(diagram, conduit) ?? defaultConduitPath(diagram, conduit);
  if (!current || current.length < 2) return diagram;

  const anchor = { ...current[0]! };
  const tip = {
    x: current[current.length - 1]!.x + dx,
    y: current[current.length - 1]!.y + dy,
  };
  const points = simplifyOrthogonalPath(orthogonalRoute(anchor, tip));

  const { [conduitId]: _removed, ...conduitOffsets } = diagram.layout.conduitOffsets ?? {};

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      conduitPaths: { ...diagram.layout.conduitPaths, [conduitId]: { points } },
      conduitOffsets,
    },
  };
}

export function nudgeConduitSideways(
  diagram: Diagram,
  conduitId: string,
  dx: number,
  dy: number,
): Diagram {
  const conduit = diagram.conduits.find((c) => c.id === conduitId);
  if (!conduit || (dx === 0 && dy === 0)) return diagram;

  const defaults = defaultConduitPath(diagram, conduit);
  if (!defaults) return diagram;

  const roles = conduitEndpointRoles(diagram, conduit);
  if (roles.end === 'free' || roles.start === 'free') {
    return moveConduitFreeEnd(diagram, conduitId, dx, dy);
  }

  const current = diagram.layout.conduitOffsets?.[conduitId] ?? { dx: 0, dy: 0 };
  const projected = perpendicularDelta(defaults, dx, dy);
  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      conduitOffsets: {
        ...diagram.layout.conduitOffsets,
        [conduitId]: { dx: current.dx + projected.x, dy: current.dy + projected.y },
      },
    },
  };
}

export function wireHasFreeFarEnd(diagram: Diagram, wireId: string): boolean {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return false;
  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit || conduit.kind === 'span') return false;
  if (wire.deviceNodeId) return false;
  return true;
}

function wireEndpointFixedForLink(
  diagram: Diagram,
  wireId: string,
  endpoint: 'start' | 'end',
): boolean {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return true;
  if (wire.deviceNodeId && endpoint === 'end') return true;
  const conduit = wire.conduitId ? diagram.conduits.find((c) => c.id === wire.conduitId) : undefined;
  if (conduit?.kind === 'span') return true;
  if (endpoint === 'start') return true;
  return false;
}

export function wireLinkEndpointsFullyAnchored(diagram: Diagram, linkId: string): boolean {
  const link = diagram.wireLinks.find((l) => l.id === linkId);
  if (!link) return false;
  const epA = link.endpointA ?? 'end';
  const epB = link.endpointB ?? 'end';
  return (
    wireEndpointFixedForLink(diagram, link.wireIdA, epA) &&
    wireEndpointFixedForLink(diagram, link.wireIdB, epB)
  );
}


/** Rebuild paths when anchors move but keep free tips and sideways offsets. */
export function rebuildConduitPathsPreservingFreeEnds(diagram: Diagram): Diagram {
  const conduitPaths = { ...diagram.layout.conduitPaths };

  for (const conduit of diagram.conduits) {
    const resolved = resolveConduitPath(diagram, conduit);
    if (resolved && resolved.length >= 2) {
      conduitPaths[conduit.id] = { points: resolved };
    }
  }

  return { ...diagram, layout: { ...diagram.layout, conduitPaths } };
}
