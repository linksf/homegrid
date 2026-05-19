import {
  conduitUsesPerWirePaths,
  defaultFourPointPath,
  dragFixedVertex,
  draggableWireVertexIndices,
  FIXED_WIRE_VERTEX_COUNT,
  normalizeLinkPath,
  normalizeWirePath,
  pinPathEndpoints,
} from './path-editing';
import {
  defaultConduitPath,
  resolveConduitPath,
} from './path-routing';
import { wireLinkForWire } from './wire-link-utils';
import {
  chordPerpendicular,
  offsetPolylineFixedEndpoints,
  type Point,
} from './orthogonal-path';
import type { ConduitEndpointRoles } from './path-editing';
import type { Conduit, Diagram, Wire } from './types';

const BUNDLE_TIP_SPACING = 16;

export { conduitUsesPerWirePaths };

export function wireFarEndConnected(diagram: Diagram, wireId: string): boolean {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return false;
  if (wireLinkForWire(diagram, wireId)) return true;
  if (wire.hubId) return true;
  return false;
}

export function wireEndpointRoles(diagram: Diagram, wireId: string): ConduitEndpointRoles {
  const wire = diagram.wires.find((w) => w.id === wireId);
  const conduit = wire?.conduitId
    ? diagram.conduits.find((c) => c.id === wire.conduitId)
    : undefined;
  if (!conduit || conduit.kind === 'span') {
    return { start: 'fixed', end: 'fixed' };
  }
  return {
    start: 'fixed',
    end: wireFarEndConnected(diagram, wireId) ? 'fixed' : 'free',
  };
}

function bundleWires(diagram: Diagram, conduit: Conduit): Wire[] {
  return conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is Wire => Boolean(w));
}

function storedWireFarTip(diagram: Diagram, wireId: string): Point | null {
  const stored = diagram.layout.wirePaths?.[wireId]?.points;
  if (!stored || stored.length < 2) return null;
  return { ...stored[stored.length - 1]! };
}

/** Default four-anchor run for one wire (anchor → separated stub tip). */
export function defaultWirePath(diagram: Diagram, wireId: string): Point[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return null;

  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit) return null;

  const center = defaultConduitPath(diagram, conduit);
  if (!center || center.length < 2) return null;

  const anchor = { ...center[0]! };
  const stubEnd = { ...center[center.length - 1]! };
  const wires = bundleWires(diagram, conduit);
  const idx = wires.findIndex((w) => w.id === wireId);
  if (idx < 0) return null;

  if (wires.length <= 1) {
    return defaultFourPointPath(anchor, stubEnd);
  }

  const perp = chordPerpendicular(center);
  const scalar = (idx - (wires.length - 1) / 2) * BUNDLE_TIP_SPACING;
  const tip = {
    x: stubEnd.x + perp.x * scalar,
    y: stubEnd.y + perp.y * scalar,
  };
  return defaultFourPointPath(anchor, tip);
}

function pinnedWireEndpoints(
  diagram: Diagram,
  wireId: string,
  defaults: Point[],
): { start: Point; end: Point } {
  const start = { ...defaults[0]! };
  const defaultEnd = { ...defaults[defaults.length - 1]! };
  const end = storedWireFarTip(diagram, wireId) ?? defaultEnd;
  return { start, end };
}

/** Span/breaker bundle: offset from shared conduit centerline. */
function resolveBundledWirePath(diagram: Diagram, wireId: string): Point[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return null;

  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit) return null;

  const center = resolveConduitPath(diagram, conduit);
  if (!center || center.length < 2) return null;

  const wires = bundleWires(diagram, conduit);
  const idx = wires.findIndex((w) => w.id === wireId);
  if (idx < 0) return null;

  const perp = chordPerpendicular(center);
  const spacing = 24;
  const n = wires.length;
  const bundleScalar = (idx - (n - 1) / 2) * spacing;
  const wireOff = diagram.layout.wireOffsets?.[wireId] ?? { dx: 0, dy: 0 };
  const extraScalar = wireOff.dx * perp.x + wireOff.dy * perp.y;
  const totalScalar = bundleScalar + extraScalar;

  return offsetPolylineFixedEndpoints(center, perp.x * totalScalar, perp.y * totalScalar);
}

/** World-space polyline for one wire. */
export function resolveWirePath(diagram: Diagram, wireId: string): Point[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return null;

  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit) return null;

  if (!conduitUsesPerWirePaths(conduit)) {
    return resolveBundledWirePath(diagram, wireId);
  }

  const defaults = defaultWirePath(diagram, wireId);
  if (!defaults || defaults.length < 2) return null;

  const roles = wireEndpointRoles(diagram, wireId);
  const { start, end } = pinnedWireEndpoints(diagram, wireId, defaults);
  const stored = diagram.layout.wirePaths?.[wireId]?.points;
  const points = normalizeWirePath(stored, start, end);
  return pinPathEndpoints(points, start, end, roles);
}

/** Drag a bend or free tip on a single wire path. */
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

  if (!draggableWireVertexIndices(Boolean(wire.hubId)).includes(vertexIndex)) {
    return diagram;
  }

  const defaults = defaultWirePath(diagram, wireId);
  if (!defaults) return diagram;

  const roles = wireEndpointRoles(diagram, wireId);
  const { start, end } = pinnedWireEndpoints(diagram, wireId, defaults);
  const current = normalizeWirePath(resolveWirePath(diagram, wireId), start, end);
  if (vertexIndex <= 0 || vertexIndex >= current.length) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y }, options);
  const last = points.length - 1;
  if (vertexIndex === last && roles.end === 'free') {
    points[0] = { ...start };
  } else {
    points = normalizeWirePath(points, start, end);
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

  if (wireLinkForWire(next, wireId)) {
    for (const link of next.wireLinks) {
      if (link.wireIdA !== wireId && link.wireIdB !== wireId) continue;
      const wa = next.wires.find((w) => w.id === link.wireIdA);
      const wb = next.wires.find((w) => w.id === link.wireIdB);
      if (!wa || !wb) continue;
      const tipA = wireFarTip(next, wa);
      const tipB = wireFarTip(next, wb);
      if (!tipA || !tipB) continue;
      const linkStored = next.layout.wireLinkPaths[link.id]?.points;
      const linkPoints = normalizeLinkPath(linkStored, tipA, tipB);
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
  }

  return next;
}

/** Re-anchor wire paths when boxes move but keep each wire's far tip. */
export function rebuildWirePathsPreservingTips(diagram: Diagram): Diagram {
  const wirePaths = { ...(diagram.layout.wirePaths ?? {}) };

  for (const wire of diagram.wires) {
    if (!wire.conduitId) continue;
    const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
    if (!conduit || !conduitUsesPerWirePaths(conduit)) continue;

    const resolved = resolveWirePath(diagram, wire.id);
    if (resolved && resolved.length === FIXED_WIRE_VERTEX_COUNT) {
      wirePaths[wire.id] = { points: resolved };
    }
  }

  return {
    ...diagram,
    layout: { ...diagram.layout, wirePaths },
  };
}

/** Far tip of a wire run for link placement. */
export function wireFarTip(diagram: Diagram, wire: Wire): Point | null {
  const poly = resolveWirePath(diagram, wire.id);
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

/** Nudge one wire's free tip (stub conduits) or sideways offset (span). */
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
  if (!conduit) return diagram;

  if (conduitUsesPerWirePaths(conduit)) {
    if (wire.hubId) return diagram;
    const path = resolveWirePath(diagram, wireId);
    if (!path || path.length !== FIXED_WIRE_VERTEX_COUNT) return diagram;
    const tip = path[FIXED_WIRE_VERTEX_COUNT - 1]!;
    return moveWireJoint(diagram, wireId, FIXED_WIRE_VERTEX_COUNT - 1, tip.x + dx, tip.y + dy, {
      snap: false,
    });
  }

  const center = resolveConduitPath(diagram, conduit);
  if (!center) return diagram;

  const perp = chordPerpendicular(center);
  const scalar = dx * perp.x + dy * perp.y;
  const current = diagram.layout.wireOffsets?.[wireId] ?? { dx: 0, dy: 0 };
  const projected = { x: perp.x * scalar, y: perp.y * scalar };
  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      wireOffsets: {
        ...diagram.layout.wireOffsets,
        [wireId]: { dx: current.dx + projected.x, dy: current.dy + projected.y },
      },
    },
  };
}

/** Persist a wire's resolved shape as four anchors for joint editing. */
export function materializeWirePath(diagram: Diagram, wireId: string): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  const conduit = wire?.conduitId
    ? diagram.conduits.find((c) => c.id === wire.conduitId)
    : undefined;
  if (!wire || !conduit || !conduitUsesPerWirePaths(conduit)) {
    return diagram;
  }

  const stored = diagram.layout.wirePaths?.[wireId]?.points;
  if (stored && stored.length === FIXED_WIRE_VERTEX_COUNT) {
    return diagram;
  }

  const resolved = resolveWirePath(diagram, wireId);
  if (!resolved || resolved.length < 2) return diagram;

  const defaults = defaultWirePath(diagram, wireId);
  if (!defaults) return diagram;

  const { start, end } = pinnedWireEndpoints(diagram, wireId, defaults);
  const points = normalizeWirePath(stored ?? resolved, start, end);

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

    const stored = next.layout.wirePaths?.[wire.id]?.points;
    if (stored && stored.length === FIXED_WIRE_VERTEX_COUNT) continue;

    const defaults = defaultWirePath(next, wire.id);
    if (!defaults) continue;

    const { start, end } = pinnedWireEndpoints(next, wire.id, defaults);
    next = {
      ...next,
      layout: {
        ...next.layout,
        wirePaths: {
          ...next.layout.wirePaths,
          [wire.id]: { points: normalizeWirePath(stored, start, end) },
        },
      },
    };
  }

  for (const wire of next.wires) {
    if (!wireLinkForWire(next, wire.id)) continue;
    next = materializeWirePath(next, wire.id);
  }

  return next;
}
