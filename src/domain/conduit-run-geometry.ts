import {
  conduitStubDisplayPath,
  conduitStubResolvedPath,
  moveConduitStubJoint,
} from './cable-geometry';
import type { ConduitRun, Diagram } from './types';
import type { Point } from './orthogonal-path';
import {
  defaultFivePointPath,
  draggableLinkVertexIndices,
  dragFixedVertex,
  FIXED_LINK_VERTEX_COUNT,
  FIXED_SPAN_WIRE_VERTEX_COUNT,
  hasCustomLinkPathShape,
  normalizeWirePath,
  pinPathEndpoints,
  type ConduitEndpointRoles,
} from './path-editing';

function stubOuterTip(diagram: Diagram, cableId: string): Point | null {
  const resolved = conduitStubResolvedPath(diagram, cableId);
  if (resolved && resolved.length >= 2) {
    return { ...resolved[resolved.length - 1]! };
  }
  const fallback = conduitStubDisplayPath(diagram, cableId);
  if (fallback.length >= 2) {
    return { ...fallback[fallback.length - 1]! };
  }
  return null;
}

function conduitRunPinnedEndpoints(
  diagram: Diagram,
  run: ConduitRun,
): { start: Point; end: Point } | null {
  const tipA = stubOuterTip(diagram, run.cableIdA);
  if (!tipA) return null;

  if (!run.cableIdB) return null;
  const tipB = stubOuterTip(diagram, run.cableIdB);
  if (!tipB) return null;

  return { start: tipA, end: tipB };
}

export function conduitRunDisplayPath(diagram: Diagram, runId: string): Point[] {
  return diagram.layout.conduitRunPaths?.[runId]?.points?.map((p) => ({ ...p })) ?? [];
}

/** Recompute orthogonal run geometry from stub endpoints; preserves custom five-point bends. */
export function refreshConduitRunPaths(diagram: Diagram): Diagram {
  let conduitRunPaths = { ...(diagram.layout.conduitRunPaths ?? {}) };
  const validIds = new Set(diagram.conduitRuns.map((r) => r.id));

  for (const id of Object.keys(conduitRunPaths)) {
    if (!validIds.has(id)) delete conduitRunPaths[id];
  }

  for (const run of diagram.conduitRuns) {
    const pinned = conduitRunPinnedEndpoints(diagram, run);
    if (!pinned) continue;

    const stored = conduitRunPaths[run.id]?.points;
    let points: Point[];
    if (hasCustomLinkPathShape(stored)) {
      points = normalizeWirePath(stored, pinned.start, pinned.end, FIXED_LINK_VERTEX_COUNT);
    } else {
      points = defaultFivePointPath(pinned.start, pinned.end);
    }
    const roles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
    points = pinPathEndpoints(points, pinned.start, pinned.end, roles);
    conduitRunPaths = { ...conduitRunPaths, [run.id]: { points } };
  }

  return {
    ...diagram,
    layout: { ...diagram.layout, conduitRunPaths },
  };
}

/** Interior bends plus cable-stub junction endpoints on a conduit run. */
export function draggableConduitRunVertexIndices(pathLength: number): number[] {
  if (pathLength < 2) return [];
  const indices = draggableLinkVertexIndices(pathLength);
  indices.unshift(0);
  indices.push(pathLength - 1);
  return indices;
}

export function moveConduitRunJoint(
  diagram: Diagram,
  runId: string,
  vertexIndex: number,
  x: number,
  y: number,
  options?: { snap?: boolean },
): Diagram {
  const run = diagram.conduitRuns.find((r) => r.id === runId);
  if (!run) return diagram;

  const pinned = conduitRunPinnedEndpoints(diagram, run);
  if (!pinned) return diagram;

  const roles: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };
  let current = normalizeWirePath(
    diagram.layout.conduitRunPaths?.[runId]?.points,
    pinned.start,
    pinned.end,
    FIXED_LINK_VERTEX_COUNT,
  );
  current = pinPathEndpoints(current, pinned.start, pinned.end, roles);
  if (current.length !== FIXED_LINK_VERTEX_COUNT) return diagram;

  const last = current.length - 1;
  if (vertexIndex === 0 && run.cableIdA) {
    let next = moveConduitStubJoint(diagram, run.cableIdA, FIXED_SPAN_WIRE_VERTEX_COUNT - 1, x, y, options);
    return refreshConduitRunPaths(next);
  }
  if (vertexIndex === last && run.cableIdB) {
    let next = moveConduitStubJoint(diagram, run.cableIdB, FIXED_SPAN_WIRE_VERTEX_COUNT - 1, x, y, options);
    return refreshConduitRunPaths(next);
  }

  const indices = draggableLinkVertexIndices(current.length);
  if (!indices.includes(vertexIndex)) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y }, options);
  points = normalizeWirePath(points, pinned.start, pinned.end, FIXED_LINK_VERTEX_COUNT);
  points = pinPathEndpoints(points, pinned.start, pinned.end, roles);

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      conduitRunPaths: { ...(diagram.layout.conduitRunPaths ?? {}), [runId]: { points } },
    },
  };
}
