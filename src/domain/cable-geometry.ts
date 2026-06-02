import { isBreakerCable } from './breaker-cable';
import { cableWallSlots } from './cable-slots';
import {
  LOCAL_CONDUIT_STUB_LENGTH,
  junctionBoxAnchorInwardNormal,
  junctionBoxAnchorOutwardNormal,
} from './conduit-geometry';
import { pinnedCableExposedEnds } from './exposed-wire-endpoints';
import type { Point } from './orthogonal-path';
import {
  dragFixedVertex,
  draggableWireVertexIndices,
  defaultFivePointPath,
  defaultFourPointPath,
  FIXED_SPAN_WIRE_VERTEX_COUNT,
  FIXED_WIRE_VERTEX_COUNT,
  hasCustomWirePathShape,
  normalizeWirePath,
  pinPathEndpoints,
  type ConduitEndpointRoles,
} from './path-editing';
import type { AnchorPosition, Diagram, JunctionBox } from './types';
import { refreshLinksForWire } from './wire-routing';

const DEFAULT_EXPOSED_AND_STUB_LENGTH = LOCAL_CONDUIT_STUB_LENGTH;

export function defaultExposedPath(
  slot: { x: number; y: number },
  inward: { x: number; y: number },
  length: number = DEFAULT_EXPOSED_AND_STUB_LENGTH,
): { x: number; y: number }[] {
  const tip = {
    x: slot.x + inward.x * length,
    y: slot.y + inward.y * length,
  };
  return defaultFourPointPath(slot, tip);
}

export function defaultConduitStubPath(
  cableCenter: { x: number; y: number },
  outward: { x: number; y: number },
  length: number = DEFAULT_EXPOSED_AND_STUB_LENGTH,
): { x: number; y: number }[] {
  const tip = {
    x: cableCenter.x + outward.x * length,
    y: cableCenter.y + outward.y * length,
  };
  return defaultFivePointPath(cableCenter, tip);
}

export function cableCenterPoint(
  box: JunctionBox,
  anchor: AnchorPosition,
  wireCount: 1 | 2 | 3,
): { x: number; y: number } {
  const slots = cableWallSlots(box, anchor, wireCount);
  if (slots.length === 0) {
    throw new Error('cableCenterPoint: expected at least one wall slot');
  }
  let sx = 0;
  let sy = 0;
  for (const s of slots) {
    sx += s.x;
    sy += s.y;
  }
  return { x: sx / slots.length, y: sy / slots.length };
}

export function exposedDisplayPath(diagram: Diagram, wireId: string): Point[] {
  return diagram.layout.exposedPaths?.[wireId]?.points?.map((p) => ({ ...p })) ?? [];
}

export function conduitStubDisplayPath(diagram: Diagram, cableId: string): Point[] {
  return diagram.layout.conduitStubPaths?.[cableId]?.points?.map((p) => ({ ...p })) ?? [];
}

function conduitStubPinnedEndpoints(diagram: Diagram, cableId: string): {
  start: Point;
  end: Point;
  defaults: Point[];
  roles: ConduitEndpointRoles;
} | null {
  const cable = diagram.cables.find((c) => c.id === cableId);
  const box = cable ? diagram.junctionBoxes.find((j) => j.id === cable.junctionBoxId) : undefined;
  if (!cable || !box) return null;

  const wireCount = cable.wireIds.length as 1 | 2 | 3;
  if (wireCount < 1 || wireCount > 3) return null;

  const inwardValid = cable.wireIds.every((wid) =>
    diagram.wires.some((w) => w.id === wid && w.cableId === cable.id),
  );
  if (!inwardValid) return null;

  const outward = junctionBoxAnchorOutwardNormal(box, cable.anchor);
  const center = cableCenterPoint(box, cable.anchor, wireCount);
  const defaults = defaultConduitStubPath(center, outward);
  const roles: ConduitEndpointRoles = { start: 'fixed', end: 'free' };

  const stored = diagram.layout.conduitStubPaths?.[cableId]?.points;
  const start = { ...center };
  const defaultTip = { ...defaults[defaults.length - 1]! };
  const end =
    stored && stored.length >= 2 ? { ...stored[stored.length - 1]! } : defaultTip;

  return { start, end, defaults, roles };
}

/** Pinned sheath stub geometry for rendering and marquee hit-testing. */
export function conduitStubResolvedPath(diagram: Diagram, cableId: string): Point[] | null {
  const pin = conduitStubPinnedEndpoints(diagram, cableId);
  if (!pin) return null;
  const stored = diagram.layout.conduitStubPaths?.[cableId]?.points;
  let points = normalizeWirePath(stored, pin.start, pin.end, FIXED_SPAN_WIRE_VERTEX_COUNT);
  points = pinPathEndpoints(points, pin.start, pin.end, pin.roles);
  return points;
}

/** Drag an interior bend or free sheath tip on a cable's exposed inward path (per-wire). */
export function moveExposedJoint(
  diagram: Diagram,
  wireId: string,
  vertexIndex: number,
  x: number,
  y: number,
  options?: { snap?: boolean },
): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.cableId) return diagram;

  const pinned = pinnedCableExposedEnds(diagram, wireId);
  if (!pinned) return diagram;

  const roles: ConduitEndpointRoles = { start: 'fixed', end: 'free' };
  const { start, end } = pinned;

  let current = normalizeWirePath(
    diagram.layout.exposedPaths?.[wireId]?.points,
    start,
    end,
    FIXED_WIRE_VERTEX_COUNT,
  );
  current = pinPathEndpoints(current, start, end, roles);
  if (current.length !== FIXED_WIRE_VERTEX_COUNT) return diagram;

  const indices = draggableWireVertexIndices(current.length, true, false);
  if (!indices.includes(vertexIndex)) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y }, options);
  const last = points.length - 1;
  if (vertexIndex === last && roles.end === 'free') {
    if (roles.start === 'fixed') {
      points[0] = { ...start };
    }
  } else if (vertexIndex === 0 && roles.start === 'free') {
    points[last] = { ...end };
  } else {
    points = normalizeWirePath(points, start, end, FIXED_WIRE_VERTEX_COUNT);
  }
  points = pinPathEndpoints(points, start, end, roles);

  const next = {
    ...diagram,
    layout: {
      ...diagram.layout,
      exposedPaths: { ...(diagram.layout.exposedPaths ?? {}), [wireId]: { points } },
    },
  };
  return refreshLinksForWire(next, wireId);
}

/** Drag joints on the cream conduit stub emanating outward from `cableId`. */
export function moveConduitStubJoint(
  diagram: Diagram,
  cableId: string,
  vertexIndex: number,
  x: number,
  y: number,
  options?: { snap?: boolean },
): Diagram {
  const pin = conduitStubPinnedEndpoints(diagram, cableId);
  if (!pin) return diagram;

  const { start, end, roles } = pin;

  let current = normalizeWirePath(
    diagram.layout.conduitStubPaths?.[cableId]?.points,
    start,
    end,
    FIXED_SPAN_WIRE_VERTEX_COUNT,
  );
  current = pinPathEndpoints(current, start, end, roles);
  if (current.length !== FIXED_SPAN_WIRE_VERTEX_COUNT) return diagram;

  const indices = draggableWireVertexIndices(current.length, true, false);
  if (!indices.includes(vertexIndex)) return diagram;

  let points = dragFixedVertex(current, vertexIndex, { x, y }, options);
  const last = points.length - 1;
  if (vertexIndex === last) {
    points[0] = { ...start };
  } else if (vertexIndex === 0 && roles.start === 'free') {
    points[last] = { ...end };
  } else {
    points = normalizeWirePath(points, start, points[last]!, FIXED_SPAN_WIRE_VERTEX_COUNT);
  }
  points = pinPathEndpoints(points, start, points[points.length - 1]!, roles);

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      conduitStubPaths: { ...(diagram.layout.conduitStubPaths ?? {}), [cableId]: { points } },
    },
  };
}

export function refreshCablePaths(diagram: Diagram): Diagram {
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));
  const validExposedWireIds = new Set<string>();
  const validStubCableIds = new Set<string>();

  let next = diagram;

  for (const cable of diagram.cables) {
    const box = diagram.junctionBoxes.find((j) => j.id === cable.junctionBoxId);
    if (!box) continue;

    const wireCount = cable.wireIds.length as 1 | 2 | 3;
    if (wireCount < 1 || wireCount > 3) continue;

    let allWiresValid = true;
    for (const wid of cable.wireIds) {
      const w = wireById.get(wid);
      if (!w || w.cableId !== cable.id) {
        allWiresValid = false;
        break;
      }
    }
    if (!allWiresValid) continue;

    validStubCableIds.add(cable.id);

    const inward = junctionBoxAnchorInwardNormal(box, cable.anchor);
    const outward = junctionBoxAnchorOutwardNormal(box, cable.anchor);
    const slots = cableWallSlots(box, cable.anchor, wireCount);
    const center = cableCenterPoint(box, cable.anchor, wireCount);

    if (!isBreakerCable(cable)) {
      for (const wid of cable.wireIds) validExposedWireIds.add(wid);
      for (let i = 0; i < cable.wireIds.length; i++) {
        const wireId = cable.wireIds[i]!;
        const slot = slots[i] ?? slots[0]!;
        const existing = next.layout.exposedPaths?.[wireId]?.points;
        if (hasCustomWirePathShape(existing, FIXED_WIRE_VERTEX_COUNT)) continue;
        const points = defaultExposedPath(slot, inward);
        next = setExposedPath(next, wireId, points);
      }
    }

    const stubExisting = next.layout.conduitStubPaths?.[cable.id]?.points;
    if (!hasCustomWirePathShape(stubExisting, FIXED_SPAN_WIRE_VERTEX_COUNT)) {
      next = setConduitStubPath(next, cable.id, defaultConduitStubPath(center, outward));
    }
  }

  next = pruneStaleCableLayout(next, validExposedWireIds, validStubCableIds);
  return next;
}

function setExposedPath(diagram: Diagram, wireId: string, points: Point[]): Diagram {
  const exposedPaths = { ...(diagram.layout.exposedPaths ?? {}) };
  exposedPaths[wireId] = { points: points.map((p) => ({ ...p })) };
  return {
    ...diagram,
    layout: { ...diagram.layout, exposedPaths },
  };
}

function setConduitStubPath(diagram: Diagram, cableId: string, points: Point[]): Diagram {
  const conduitStubPaths = { ...(diagram.layout.conduitStubPaths ?? {}) };
  conduitStubPaths[cableId] = { points: points.map((p) => ({ ...p })) };
  return {
    ...diagram,
    layout: { ...diagram.layout, conduitStubPaths },
  };
}

function pruneStaleCableLayout(
  diagram: Diagram,
  validExposedWireIds: Set<string>,
  validStubCableIds: Set<string>,
): Diagram {
  const exposedPaths = { ...(diagram.layout.exposedPaths ?? {}) };
  for (const id of Object.keys(exposedPaths)) {
    if (!validExposedWireIds.has(id)) delete exposedPaths[id];
  }

  const conduitStubPaths = { ...(diagram.layout.conduitStubPaths ?? {}) };
  for (const id of Object.keys(conduitStubPaths)) {
    if (!validStubCableIds.has(id)) delete conduitStubPaths[id];
  }

  return {
    ...diagram,
    layout: { ...diagram.layout, exposedPaths, conduitStubPaths },
  };
}
