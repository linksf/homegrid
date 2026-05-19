import {
  defaultFourPointPath,
  dragFixedVertex,
  draggableLinkVertexIndices,
  hasCustomLinkPathShape,
  normalizeLinkPath,
  pinPathEndpoints,
} from './path-editing';
import { wireLinkEndpointsFullyAnchored, wireHasFreeFarEnd } from './path-routing';
import { nudgeWirePathGeometry, resolveWirePath } from './wire-routing';
import { chordPerpendicular, offsetPolylineFixedEndpoints, perpendicularDelta } from './orthogonal-path';
import type { ConduitEndpointRoles } from './path-routing';
import type { Diagram, Wire } from './types';
import { buildWireLinkLaneMap, laneOffsetForLink } from './wire-link-lanes';

/** World-space polyline for a wire's rendered stroke. */
export function wireWorldPolyline(diagram: Diagram, wireId: string): { x: number; y: number }[] | null {
  return resolveWirePath(diagram, wireId);
}

export { resolveConduitPath as conduitCenterPath } from './path-routing';
export { resolveWirePath, moveWireJoint, wireEndpointRoles } from './wire-routing';

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

  const wa = diagram.wires.find((w) => w.id === link.wireIdA);
  const wb = diagram.wires.find((w) => w.id === link.wireIdB);
  if (!wa || !wb) return [];

  const pa = wireLinkEndpoint(diagram, wa);
  const pb = wireLinkEndpoint(diagram, wb);
  if (!pa || !pb) return [];

  let pts = defaultFourPointPath(pa, pb);
  const lanes = linkLanesFor(diagram);
  const laneScalar = laneOffsetForLink(pts, linkId, lanes);
  const perp = chordPerpendicular(pts);
  return offsetPolylineFixedEndpoints(pts, perp.x * laneScalar, perp.y * laneScalar);
}

/** Wire-to-wire link path anchored at both wire tips; middle bends adjust on nudge. */
export function wireLinkDisplayPath(
  diagram: Diagram,
  linkId: string,
): { x: number; y: number }[] {
  const link = diagram.wireLinks.find((l) => l.id === linkId);
  if (!link) return [];

  const wa = diagram.wires.find((w) => w.id === link.wireIdA);
  const wb = diagram.wires.find((w) => w.id === link.wireIdB);
  if (!wa || !wb) return [];

  const pa = wireLinkEndpoint(diagram, wa);
  const pb = wireLinkEndpoint(diagram, wb);
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

/** Drag a bend on a wire-to-wire link (endpoints stay on wire tips). */
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

  const wa = diagram.wires.find((w) => w.id === link.wireIdA);
  const wb = diagram.wires.find((w) => w.id === link.wireIdB);
  if (!wa || !wb) return diagram;

  const pa = wireLinkEndpoint(diagram, wa);
  const pb = wireLinkEndpoint(diagram, wb);
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
    const wa = diagram.wires.find((w) => w.id === link.wireIdA);
    const wb = diagram.wires.find((w) => w.id === link.wireIdB);
    if (wa && wireHasFreeFarEnd(diagram, wa.id)) {
      return nudgeWirePathGeometry(diagram, wa.id, dx, dy);
    }
    if (wb && wireHasFreeFarEnd(diagram, wb.id)) {
      return nudgeWirePathGeometry(diagram, wb.id, dx, dy);
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

/** Placement for a wire-link endpoint: tip of the wire run (last polyline vertex), or breaker panel center. */
export function wireLinkEndpoint(diagram: Diagram, wire: Wire): { x: number; y: number } | null {
  const poly = wireWorldPolyline(diagram, wire.id);
  if (poly && poly.length >= 2) {
    return poly[poly.length - 1]!;
  }
  if (wire.breakerId) {
    const br = diagram.breakers.find((b) => b.id === wire.breakerId);
    if (!br) return null;
    const box = diagram.junctionBoxes.find((j) => j.id === br.junctionBoxId);
    if (!box) return null;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  return null;
}

/** Recomputes stored wire-link geometry from current wire tip positions. */
export function refreshWireLinkPaths(diagram: Diagram): Diagram {
  const wireLinkPaths = { ...diagram.layout.wireLinkPaths };
  const fixedRoles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  for (const link of diagram.wireLinks) {
    const wa = diagram.wires.find((w) => w.id === link.wireIdA);
    const wb = diagram.wires.find((w) => w.id === link.wireIdB);
    if (!wa || !wb) continue;
    const pa = wireLinkEndpoint(diagram, wa);
    const pb = wireLinkEndpoint(diagram, wb);
    if (!pa || !pb) continue;

    const stored = wireLinkPaths[link.id]?.points;
    if (hasCustomLinkPathShape(stored)) {
      wireLinkPaths[link.id] = {
        points: pinPathEndpoints(stored!, pa, pb, fixedRoles),
      };
      continue;
    }

    wireLinkPaths[link.id] = { points: defaultFourPointPath(pa, pb) };
  }
  return { ...diagram, layout: { ...diagram.layout, wireLinkPaths } };
}
