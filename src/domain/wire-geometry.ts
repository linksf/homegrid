import {
  defaultFivePointPath,
  dragFixedVertex,
  draggableLinkVertexIndices,
  hasCustomLinkPathShape,
  normalizeLinkPath,
  pinPathEndpoints,
} from './path-editing';
import { resolveExposedCableWirePath } from './exposed-wire-endpoints';
import { wireLinkEndpointsFullyAnchored } from './path-routing';
import {
  moveWireJoint,
  nudgeWirePathGeometry,
  resolveWirePath,
  wireEndpointPoint,
  wireEndpointRoles,
} from './wire-routing';
import { chordPerpendicular, offsetPolylineFixedEndpoints, perpendicularDelta } from './orthogonal-path';
import type { ConduitEndpointRoles } from './path-routing';
import type { Diagram, Wire, WireEndpoint } from './types';
import { buildWireLinkLaneMap, laneOffsetForLink } from './wire-link-lanes';

/** World-space polyline for a wire's rendered stroke. */
export function wireWorldPolyline(diagram: Diagram, wireId: string): { x: number; y: number }[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (wire?.cableId) {
    return resolveExposedCableWirePath(diagram, wireId);
  }
  return resolveWirePath(diagram, wireId);
}

export { resolveConduitPath as conduitCenterPath } from './path-routing';
export {
  resolveWirePath,
  moveWireJoint,
  wireEndpointRoles,
  wireEndpointPoint,
  wireEndpointRole,
} from './wire-routing';

let cachedDiagram: Diagram | null = null;
let cachedLinkLanes: Map<string, string[]> | null = null;

function linkLanesFor(diagram: Diagram): Map<string, string[]> {
  if (cachedDiagram === diagram && cachedLinkLanes) {
    return cachedLinkLanes;
  }
  cachedDiagram = diagram;
  cachedLinkLanes = buildWireLinkLaneMap(diagram);
  return cachedLinkLanes;
}

/** Clears memoized wire-link lane map (for tests). */
export function clearWireLinkLaneCache(): void {
  cachedDiagram = null;
  cachedLinkLanes = null;
}

/** Routed link centerline (tips + lane), before manual sideways nudge offset. */
export function wireLinkRoutedCenterline(
  diagram: Diagram,
  linkId: string,
): { x: number; y: number }[] {
  const link = diagram.wireLinks.find((l) => l.id === linkId);
  if (!link) return [];

  const pa = wireLinkEndpoint(diagram, link.wireIdA, link.endpointA ?? 'end');
  const pb = wireLinkEndpoint(diagram, link.wireIdB, link.endpointB ?? 'end');
  if (!pa || !pb) return [];

  let pts = defaultFivePointPath(pa, pb);
  const lanes = linkLanesFor(diagram);
  const laneScalar = laneOffsetForLink(pts, linkId, lanes);
  const perp = chordPerpendicular(pts);
  return offsetPolylineFixedEndpoints(pts, perp.x * laneScalar, perp.y * laneScalar);
}

/** Wire-to-wire link path between two wire end anchors. */
export function wireLinkDisplayPath(
  diagram: Diagram,
  linkId: string,
): { x: number; y: number }[] {
  const link = diagram.wireLinks.find((l) => l.id === linkId);
  if (!link) return [];

  const pa = wireLinkEndpoint(diagram, link.wireIdA, link.endpointA ?? 'end');
  const pb = wireLinkEndpoint(diagram, link.wireIdB, link.endpointB ?? 'end');
  if (!pa || !pb) return [];

  const stored = diagram.layout.wireLinkPaths[linkId]?.points;
  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  if (hasCustomLinkPathShape(stored)) {
    return pinPathEndpoints(stored!, pa, pb, fixedRoles);
  }

  let pts = wireLinkRoutedCenterline(diagram, linkId);
  if (pts.length < 2) return pts;

  if (wireLinkEndpointsFullyAnchored(diagram, linkId)) {
    const off = diagram.layout.wireLinkOffsets?.[linkId] ?? { dx: 0, dy: 0 };
    pts = offsetPolylineFixedEndpoints(pts, off.dx, off.dy);
  }

  return pts;
}

/** Drag a bend on a wire-to-wire link (endpoints stay on wire anchors). */
export function moveWireLinkJoint(
  diagram: Diagram,
  linkId: string,
  vertexIndex: number,
  x: number,
  y: number,
): Diagram {
  const link = diagram.wireLinks.find((l) => l.id === linkId);
  if (!link) return diagram;

  if (!draggableLinkVertexIndices().includes(vertexIndex)) {
    return diagram;
  }

  const pa = wireLinkEndpoint(diagram, link.wireIdA, link.endpointA ?? 'end');
  const pb = wireLinkEndpoint(diagram, link.wireIdB, link.endpointB ?? 'end');
  if (!pa || !pb) return diagram;

  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
  const current = normalizeLinkPath(wireLinkDisplayPath(diagram, linkId), pa, pb);
  if (vertexIndex <= 0 || vertexIndex >= current.length) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y });
  points = normalizeLinkPath(points, pa, pb);
  points = pinPathEndpoints(points, pa, pb, fixedRoles);

  const { [linkId]: _lo, ...wireLinkOffsets } = diagram.layout.wireLinkOffsets ?? {};

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      wireLinkPaths: { ...diagram.layout.wireLinkPaths, [linkId]: { points } },
      wireLinkOffsets,
    },
  };
}

export function nudgeWireLinkRoute(
  diagram: Diagram,
  linkId: string,
  dx: number,
  dy: number,
): Diagram {
  if (dx === 0 && dy === 0) return diagram;

  const link = diagram.wireLinks.find((l) => l.id === linkId);
  if (!link) return diagram;

  if (!wireLinkEndpointsFullyAnchored(diagram, linkId)) {
    const epA = link.endpointA ?? 'end';
    const epB = link.endpointB ?? 'end';
    const rolesA = wireEndpointRoles(diagram, link.wireIdA);
    const rolesB = wireEndpointRoles(diagram, link.wireIdB);
    if (rolesA[epA === 'start' ? 'start' : 'end'] === 'free') {
      return nudgeWireEndpoint(diagram, link.wireIdA, epA, dx, dy);
    }
    if (rolesB[epB === 'start' ? 'start' : 'end'] === 'free') {
      return nudgeWireEndpoint(diagram, link.wireIdB, epB, dx, dy);
    }
    return diagram;
  }

  const base = wireLinkRoutedCenterline(diagram, linkId);
  if (base.length < 2) return diagram;

  const current = diagram.layout.wireLinkOffsets?.[linkId] ?? { dx: 0, dy: 0 };
  const projected = perpendicularDelta(base, dx, dy);
  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      wireLinkOffsets: {
        ...diagram.layout.wireLinkOffsets,
        [linkId]: { dx: current.dx + projected.x, dy: current.dy + projected.y },
      },
    },
  };
}

function nudgeWireEndpoint(
  diagram: Diagram,
  wireId: string,
  endpoint: WireEndpoint,
  dx: number,
  dy: number,
): Diagram {
  if (endpoint === 'end') {
    return nudgeWirePathGeometry(diagram, wireId, dx, dy);
  }
  const path = resolveWirePath(diagram, wireId);
  if (!path || path.length < 2) return diagram;
  if (wireEndpointRoles(diagram, wireId).start !== 'free') return diagram;
  const tip = path[0]!;
  return moveWireJoint(diagram, wireId, 0, tip.x + dx, tip.y + dy, { snap: false });
}

export function polylineMidpoint(points: { x: number; y: number }[]): { x: number; y: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0]!;

  const total = polylineLength(points);
  if (total === 0) return { ...points[0]! };

  let target = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (target <= seg) {
      const t = seg === 0 ? 0 : target / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= seg;
  }
  return { ...points[points.length - 1]! };
}

export function polylineLength(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** Placement for a wire-link endpoint at a specific wire end anchor. */
export function wireLinkEndpoint(
  diagram: Diagram,
  wireOrId: Wire | string,
  endpoint: WireEndpoint = 'end',
): { x: number; y: number } | null {
  const wireId = typeof wireOrId === 'string' ? wireOrId : wireOrId.id;
  const wire = typeof wireOrId === 'string'
    ? diagram.wires.find((w) => w.id === wireOrId)
    : wireOrId;
  if (!wire) return null;

  const point = wireEndpointPoint(diagram, wireId, endpoint);
  if (point) return point;

  if (wire.breakerId) {
    const br = diagram.breakers.find((b) => b.id === wire.breakerId);
    if (!br) return null;
    const box = diagram.junctionBoxes.find((j) => j.id === br.junctionBoxId);
    if (!box) return null;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return null;
}

/** Recomputes stored wire-link geometry from current wire anchor positions. */
export function refreshWireLinkPaths(diagram: Diagram): Diagram {
  const wireLinkPaths = { ...diagram.layout.wireLinkPaths };
  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  for (const link of diagram.wireLinks) {
    const epA = link.endpointA ?? 'end';
    const epB = link.endpointB ?? 'end';
    const pa = wireLinkEndpoint(diagram, link.wireIdA, epA);
    const pb = wireLinkEndpoint(diagram, link.wireIdB, epB);
    if (!pa || !pb) continue;

    const stored = wireLinkPaths[link.id]?.points;
    if (hasCustomLinkPathShape(stored)) {
      wireLinkPaths[link.id] = {
        points: pinPathEndpoints(stored!, pa, pb, fixedRoles),
      };
      continue;
    }

    wireLinkPaths[link.id] = { points: defaultFivePointPath(pa, pb) };
  }
  return { ...diagram, layout: { ...diagram.layout, wireLinkPaths } };
}
