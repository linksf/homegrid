import { orthogonalRoute, type Point } from './orthogonal-path';
import type { Conduit } from './types';

export type ConduitEndpointRoles = {
  start: 'fixed' | 'free';
  end: 'fixed' | 'free';
};

export function conduitUsesPerWirePaths(conduit: Conduit): boolean {
  return conduit.kind === 'local' || conduit.kind === 'device' || conduit.kind === 'breaker';
}

export const PATH_EDIT_SNAP = 12;

/** Wires and wire links always use exactly four anchors (three segments). */
export const FIXED_WIRE_VERTEX_COUNT = 4;
export const FIXED_LINK_VERTEX_COUNT = 4;

const EPS = 1e-6;

export function snapPathCoord(value: number, step = PATH_EDIT_SNAP): number {
  return Math.round(value / step) * step;
}

export function snapPathPoint(p: Point, step = PATH_EDIT_SNAP): Point {
  return { x: snapPathCoord(p.x, step), y: snapPathCoord(p.y, step) };
}

/** Removes collinear middle vertices. */
export function simplifyOrthogonalPath(points: Point[]): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));

  const out: Point[] = [{ ...points[0]! }];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const collinear =
      (Math.abs(prev.x - cur.x) < EPS && Math.abs(cur.x - next.x) < EPS) ||
      (Math.abs(prev.y - cur.y) < EPS && Math.abs(cur.y - next.y) < EPS);
    if (!collinear) out.push({ ...cur });
  }
  out.push({ ...points[points.length - 1]! });
  return out;
}

/** Default four-anchor orthogonal path between a fixed start and end. */
export function defaultFourPointPath(start: Point, end: Point): Point[] {
  const a = { ...start };
  const b = { ...end };
  const route = orthogonalRoute(a, b);

  if (route.length >= 4) {
    return [a, { ...route[1]! }, { ...route[route.length - 2]! }, b];
  }

  if (route.length === 3) {
    const corner = route[1]!;
    const midA = { x: (a.x + corner.x) / 2, y: (a.y + corner.y) / 2 };
    return [a, snapPathPoint(midA), { ...corner }, b];
  }

  if (Math.abs(a.x - b.x) < EPS) {
    const y1 = a.y + (b.y - a.y) / 3;
    const y2 = a.y + (2 * (b.y - a.y)) / 3;
    return [a, { x: a.x, y: y1 }, { x: a.x, y: y2 }, b];
  }

  if (Math.abs(a.y - b.y) < EPS) {
    const x1 = a.x + (b.x - a.x) / 3;
    const x2 = a.x + (2 * (b.x - a.x)) / 3;
    return [a, { x: x1, y: a.y }, { x: x2, y: a.y }, b];
  }

  const corner = { x: b.x, y: a.y };
  const midA = { x: (a.x + corner.x) / 2, y: a.y };
  const midB = { x: corner.x, y: (corner.y + b.y) / 2 };
  return [a, snapPathPoint(midA), snapPathPoint(midB), b];
}

/** Normalize any stored path to exactly four anchors, pinning both ends. */
export function normalizeFixedPath(
  points: Point[] | null | undefined,
  start: Point,
  end: Point,
  vertexCount: number = FIXED_WIRE_VERTEX_COUNT,
): Point[] {
  if (points && points.length === vertexCount) {
    const out = points.map((p) => ({ ...p }));
    out[0] = { ...start };
    out[vertexCount - 1] = { ...end };
    return out;
  }

  if (points && points.length > vertexCount) {
    const last = points.length - 1;
    return normalizeFixedPath(
      [points[0]!, points[1]!, points[last - 1]!, points[last]!],
      start,
      end,
      vertexCount,
    );
  }

  return defaultFourPointPath(start, end);
}

export function normalizeWirePath(
  points: Point[] | null | undefined,
  start: Point,
  end: Point,
): Point[] {
  return normalizeFixedPath(points, start, end, FIXED_WIRE_VERTEX_COUNT);
}

export function normalizeLinkPath(
  points: Point[] | null | undefined,
  start: Point,
  end: Point,
): Point[] {
  return normalizeFixedPath(points, start, end, FIXED_LINK_VERTEX_COUNT);
}

/** Move one anchor without adding or removing path vertices. */
export function dragFixedVertex(
  points: Point[],
  index: number,
  newPos: Point,
  options?: { snap?: boolean },
): Point[] {
  if (index <= 0 || index >= points.length) return points.map((p) => ({ ...p }));
  const out = points.map((p) => ({ ...p }));
  out[index] = options?.snap === false ? newPos : snapPathPoint(newPos);
  return out;
}

/** Draggable wire anchors: interior pair plus far tip (hub wires omit the tip). */
export function draggableWireVertexIndices(hubAttached: boolean): number[] {
  return hubAttached ? [1, 2] : [1, 2, 3];
}

/** Draggable wire-link anchors (endpoints stay on wire tips). */
export function draggableLinkVertexIndices(): number[] {
  return [1, 2];
}

/** Indices the user may drag (never the fixed anchor at 0). */
export function draggablePathVertexIndices(
  pointCount: number,
  roles: ConduitEndpointRoles,
): number[] {
  if (pointCount < 2) return [];
  const indices: number[] = [];
  const last = pointCount - 1;
  for (let i = 1; i < last; i++) indices.push(i);
  if (roles.end === 'free') indices.push(last);
  return indices;
}

/**
 * Moves one bend or free tip; rebuilds adjacent legs orthogonally.
 */
export function dragPathVertex(
  points: Point[],
  index: number,
  newPos: Point,
  options?: { snap?: boolean },
): Point[] {
  if (points.length < 2 || index <= 0 || index >= points.length) return points.map((p) => ({ ...p }));

  const snapped = options?.snap === false ? newPos : snapPathPoint(newPos);

  if (index === points.length - 1) {
    const start = points[0]!;
    if (points.length === 2) {
      return orthogonalRoute(start, snapped);
    }
    const prefix = points.slice(0, index);
    const from = prefix[prefix.length - 1]!;
    const leg = orthogonalRoute(from, snapped);
    return simplifyOrthogonalPath([...prefix.slice(0, -1), ...leg]);
  }

  const from = points[index - 1]!;
  const to = points[index + 1]!;
  const leg1 = orthogonalRoute(from, snapped);
  const leg2 = orthogonalRoute(snapped, to);
  const merged = [...points.slice(0, index - 1), ...leg1, ...leg2.slice(1), ...points.slice(index + 2)];
  return simplifyOrthogonalPath(merged);
}

export function pinPathEndpoints(
  points: Point[],
  start: Point,
  end: Point,
  roles: ConduitEndpointRoles,
): Point[] {
  if (points.length < 2) return orthogonalRoute(start, end);

  if (points.length === FIXED_WIRE_VERTEX_COUNT || points.length === FIXED_LINK_VERTEX_COUNT) {
    const out = points.map((p) => ({ ...p }));
    out[0] = { ...start };
    if (roles.end === 'fixed') {
      out[out.length - 1] = { ...end };
    }
    return out;
  }

  const out = points.map((p) => ({ ...p }));
  out[0] = { ...start };
  if (roles.end === 'fixed') {
    out[out.length - 1] = { ...end };
  }
  return simplifyOrthogonalPath(out);
}

/** Conduit centerlines may have variable vertex count after joint edits. */
export function hasCustomConduitPathShape(points: Point[] | undefined | null): boolean {
  return Boolean(points && points.length >= 3);
}

export function hasCustomWirePathShape(points: Point[] | undefined | null): boolean {
  return Boolean(points && points.length === FIXED_WIRE_VERTEX_COUNT);
}

export function hasCustomLinkPathShape(points: Point[] | undefined | null): boolean {
  return Boolean(points && points.length === FIXED_LINK_VERTEX_COUNT);
}

/** @deprecated Use hasCustomConduitPathShape, hasCustomWirePathShape, or hasCustomLinkPathShape */
export function hasCustomPathShape(points: Point[] | undefined | null): boolean {
  return hasCustomConduitPathShape(points);
}
