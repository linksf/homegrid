import {
  conduitUsesPerWirePaths,
  defaultFourPointPath,
  defaultFivePointPath,
  defaultWirePathBetween,
  dragFixedVertex,
  draggableWireVertexIndices,
  normalizeLinkPath,
  normalizeWirePath,
  pinPathEndpoints,
  wirePathVertexCount,
  type ConduitEndpointRoles,
} from './path-editing';
import { exposedCableWireEndpointPoint } from './exposed-wire-endpoints';
import { defaultConduitPath } from './path-routing';
import {
  wireEndpointIndex,
  wireLinksForWire,
} from './wire-link-utils';
import { chordPerpendicular, type Point } from './orthogonal-path';
import type { Conduit, Diagram, Wire, WireEndpoint } from './types';

const BUNDLE_TIP_SPACING = 16;

export { conduitUsesPerWirePaths };

function bundleWires(diagram: Diagram, conduit: Conduit): Wire[] {
  return conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is Wire => Boolean(w));
}

function storedWireEndpoint(
  diagram: Diagram,
  wireId: string,
  endpoint: WireEndpoint,
): Point | null {
  const stored = diagram.layout.wirePaths?.[wireId]?.points;
  if (!stored || stored.length < 2) return null;
  const index = wireEndpointIndex(stored.length, endpoint);
  return { ...stored[index]! };
}

/** Whether an endpoint is pinned to geometry, a link partner, or a hub/device. */
export function wireEndpointRole(
  diagram: Diagram,
  wireId: string,
  endpoint: WireEndpoint,
): 'fixed' | 'free' {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return 'free';

  if (wire.cableId) {
    return endpoint === 'start' ? 'fixed' : 'free';
  }

  if (wire.deviceNodeId && endpoint === 'end') return 'fixed';

  const conduit = wire.conduitId ? diagram.conduits.find((c) => c.id === wire.conduitId) : undefined;
  if (!conduit) return 'free';

  if (conduit.kind === 'span') return 'fixed';
  if (endpoint === 'start') return 'fixed';
  return 'free';
}

export function wireEndpointRoles(diagram: Diagram, wireId: string): ConduitEndpointRoles {
  return {
    start: wireEndpointRole(diagram, wireId, 'start'),
    end: wireEndpointRole(diagram, wireId, 'end'),
  };
}

/** Endpoints the connect (J) tool may pick on a wire (exposed free tips, stub tips, etc.). */
export function connectableWireEndpoints(diagram: Diagram, wireId: string): WireEndpoint[] {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return [];

  const out: WireEndpoint[] = [];
  for (const endpoint of ['start', 'end'] as const) {
    if (wire.cableId && endpoint !== 'end') continue;
    if (wireEndpointRole(diagram, wireId, endpoint) !== 'free') continue;
    if (!wireEndpointPoint(diagram, wireId, endpoint)) continue;
    out.push(endpoint);
  }
  return out;
}

/** Default orthogonal run for one wire. */
export function defaultWirePath(diagram: Diagram, wireId: string): Point[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return null;

  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit) return null;

  const center = defaultConduitPath(diagram, conduit);
  if (!center || center.length < 2) return null;

  const anchor = { ...center[0]! };
  const farEnd = { ...center[center.length - 1]! };
  const wires = bundleWires(diagram, conduit);
  const idx = wires.findIndex((w) => w.id === wireId);
  if (idx < 0) return null;

  const vertexCount = wirePathVertexCount(conduit);

  if (wires.length <= 1) {
    return defaultWirePathBetween(anchor, farEnd, vertexCount);
  }

  const perp = chordPerpendicular(center);
  const scalar = (idx - (wires.length - 1) / 2) * BUNDLE_TIP_SPACING;

  if (conduit.kind === 'span') {
    const start = {
      x: anchor.x + perp.x * scalar,
      y: anchor.y + perp.y * scalar,
    };
    const end = {
      x: farEnd.x + perp.x * scalar,
      y: farEnd.y + perp.y * scalar,
    };
    return defaultWirePathBetween(start, end, vertexCount);
  }

  const tip = {
    x: farEnd.x + perp.x * scalar,
    y: farEnd.y + perp.y * scalar,
  };
  return defaultWirePathBetween(anchor, tip, vertexCount);
}

/** World-space position of one wire end anchor (independent of link partners). */
export function wireEndpointPoint(
  diagram: Diagram,
  wireId: string,
  endpoint: WireEndpoint,
): Point | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (wire?.cableId) {
    return exposedCableWireEndpointPoint(diagram, wireId, endpoint);
  }

  const defaults = defaultWirePath(diagram, wireId);
  if (!defaults || defaults.length < 2) return null;

  const defaultPoint = endpoint === 'start' ? defaults[0]! : defaults[defaults.length - 1]!;
  if (wireEndpointRole(diagram, wireId, endpoint) === 'free') {
    return storedWireEndpoint(diagram, wireId, endpoint) ?? defaultPoint;
  }
  return defaultPoint;
}

function pinnedWireEndpoints(
  diagram: Diagram,
  wireId: string,
  defaults: Point[],
): { start: Point; end: Point } {
  const start =
    wireEndpointPoint(diagram, wireId, 'start') ??
    storedWireEndpoint(diagram, wireId, 'start') ??
    { ...defaults[0]! };
  const end =
    wireEndpointPoint(diagram, wireId, 'end') ??
    storedWireEndpoint(diagram, wireId, 'end') ??
    { ...defaults[defaults.length - 1]! };
  return { start, end };
}

/** World-space polyline for one wire. */
export function resolveWirePath(diagram: Diagram, wireId: string): Point[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return null;

  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit) return null;

  const defaults = defaultWirePath(diagram, wireId);
  if (!defaults || defaults.length < 2) return null;

  const vertexCount = wirePathVertexCount(conduit);
  const roles = wireEndpointRoles(diagram, wireId);
  const { start, end } = pinnedWireEndpoints(diagram, wireId, defaults);
  const stored = diagram.layout.wirePaths?.[wireId]?.points;
  const points = normalizeWirePath(stored, start, end, vertexCount);
  return pinPathEndpoints(points, start, end, roles);
}

export function refreshLinksForWire(diagram: Diagram, wireId: string): Diagram {
  let next = diagram;
  for (const link of wireLinksForWire(next, wireId)) {
    const wa = next.wires.find((w) => w.id === link.wireIdA);
    const wb = next.wires.find((w) => w.id === link.wireIdB);
    if (!wa || !wb) continue;

    const pa = wireEndpointPoint(next, link.wireIdA, link.endpointA ?? 'end');
    const pb = wireEndpointPoint(next, link.wireIdB, link.endpointB ?? 'end');
    if (!pa || !pb) continue;

    const linkStored = next.layout.wireLinkPaths[link.id]?.points;
    const linkPoints = normalizeLinkPath(linkStored, pa, pb);
    next = {
      ...next,
      layout: {
        ...next.layout,
        wireLinkPaths: {
          ...next.layout.wireLinkPaths,
          [link.id]: { points: linkPoints },
        },
      },
    };
  }
  return next;
}

/** Drag a bend or free end on a single wire path. */
export function moveWireJoint(
  diagram: Diagram,
  wireId: string,
  vertexIndex: number,
  x: number,
  y: number,
  options?: { snap?: boolean },
): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  const conduit = wire?.conduitId
    ? diagram.conduits.find((c) => c.id === wire.conduitId)
    : undefined;
  if (!wire || !conduit || !conduitUsesPerWirePaths(conduit)) {
    return diagram;
  }

  const vertexCount = wirePathVertexCount(conduit);
  const roles = wireEndpointRoles(diagram, wireId);
  const indices = draggableWireVertexIndices(vertexCount, roles.start === 'fixed', roles.end === 'fixed');
  if (!indices.includes(vertexIndex)) {
    return diagram;
  }

  const defaults = defaultWirePath(diagram, wireId);
  if (!defaults) return diagram;

  const { start, end } = pinnedWireEndpoints(diagram, wireId, defaults);
  const current = normalizeWirePath(resolveWirePath(diagram, wireId), start, end, vertexCount);
  if (vertexIndex <= 0 || vertexIndex >= current.length) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y }, options);
  const last = points.length - 1;
  if (vertexIndex === last && roles.end === 'free') {
    if (roles.start === 'fixed') {
      points[0] = { ...start };
    }
  } else if (vertexIndex === 0 && roles.start === 'free') {
    points[last] = { ...end };
  } else {
    points = normalizeWirePath(points, start, end, vertexCount);
  }
  points = pinPathEndpoints(points, start, end, roles);

  let next: Diagram = {
    ...diagram,
    layout: {
      ...diagram.layout,
      wirePaths: {
        ...diagram.layout.wirePaths,
        [wireId]: { points },
      },
    },
  };

  return refreshLinksForWire(next, wireId);
}

/** Re-anchor wire paths when boxes move but keep free endpoints and interior bends. */
export function rebuildWirePathsPreservingTips(diagram: Diagram): Diagram {
  const wirePaths = { ...(diagram.layout.wirePaths ?? {}) };

  for (const wire of diagram.wires) {
    if (!wire.conduitId) continue;
    const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
    if (!conduit || !conduitUsesPerWirePaths(conduit)) continue;

    const expected = wirePathVertexCount(conduit);
    const resolved = resolveWirePath(diagram, wire.id);
    if (resolved && resolved.length === expected) {
      wirePaths[wire.id] = { points: resolved };
    }
  }

  return {
    ...diagram,
    layout: { ...diagram.layout, wirePaths },
  };
}

/** Far tip of a wire run for legacy call sites. */
export function wireFarTip(diagram: Diagram, wire: Wire): Point | null {
  return wireEndpointPoint(diagram, wire.id, 'end');
}

/** Nudge one wire's free end anchor. */
export function nudgeWirePathGeometry(
  diagram: Diagram,
  wireId: string,
  dx: number,
  dy: number,
): Diagram {
  if (dx === 0 && dy === 0) return diagram;
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return diagram;

  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit || !conduitUsesPerWirePaths(conduit)) return diagram;

  const vertexCount = wirePathVertexCount(conduit);
  const roles = wireEndpointRoles(diagram, wireId);
  if (roles.end !== 'free') return diagram;

  const path = resolveWirePath(diagram, wireId);
  if (!path || path.length !== vertexCount) return diagram;
  const tip = path[vertexCount - 1]!;
  return moveWireJoint(diagram, wireId, vertexCount - 1, tip.x + dx, tip.y + dy, {
    snap: false,
  });
}

/** Persist a wire's resolved shape for joint editing. */
export function materializeWirePath(diagram: Diagram, wireId: string): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  const conduit = wire?.conduitId
    ? diagram.conduits.find((c) => c.id === wire.conduitId)
    : undefined;
  if (!wire || !conduit || !conduitUsesPerWirePaths(conduit)) {
    return diagram;
  }

  const vertexCount = wirePathVertexCount(conduit);
  const stored = diagram.layout.wirePaths?.[wireId]?.points;
  if (stored && stored.length === vertexCount) {
    return diagram;
  }

  const resolved = resolveWirePath(diagram, wireId);
  if (!resolved || resolved.length < 2) return diagram;

  const defaults = defaultWirePath(diagram, wireId);
  if (!defaults) return diagram;

  const { start, end } = pinnedWireEndpoints(diagram, wireId, defaults);
  const points = normalizeWirePath(stored ?? resolved, start, end, vertexCount);

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      wirePaths: {
        ...diagram.layout.wirePaths,
        [wireId]: { points },
      },
    },
  };
}

export function ensureWirePaths(diagram: Diagram): Diagram {
  let next = diagram;

  for (const wire of next.wires) {
    if (!wire.conduitId) continue;
    const conduit = next.conduits.find((c) => c.id === wire.conduitId);
    if (!conduit || !conduitUsesPerWirePaths(conduit)) continue;

    const vertexCount = wirePathVertexCount(conduit);
    const stored = next.layout.wirePaths?.[wire.id]?.points;
    if (stored && stored.length === vertexCount) continue;

    const defaults = defaultWirePath(next, wire.id);
    if (!defaults) continue;

    const { start, end } = pinnedWireEndpoints(next, wire.id, defaults);
    next = {
      ...next,
      layout: {
        ...next.layout,
        wirePaths: {
          ...next.layout.wirePaths,
          [wire.id]: { points: normalizeWirePath(stored, start, end, vertexCount) },
        },
      },
    };
  }

  for (const wire of next.wires) {
    if (wireLinksForWire(next, wire.id).length === 0) continue;
    next = materializeWirePath(next, wire.id);
  }

  return next;
}

export { defaultFourPointPath, defaultFivePointPath };
