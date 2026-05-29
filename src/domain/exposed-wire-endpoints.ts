/**
 * Resolved positions for cables' exposed paths (diagram.layout.exposedPaths).
 * Keeps wire-routing free of cyclic imports vs cable-geometry.
 */
import { isBreakerCable } from './breaker-cable';
import { cableWallSlots } from './cable-slots';
import { junctionBoxAnchorInwardNormal, LOCAL_CONDUIT_STUB_LENGTH } from './conduit-geometry';
import type { Point } from './orthogonal-path';
import {
  defaultFourPointPath,
  FIXED_WIRE_VERTEX_COUNT,
  normalizeWirePath,
  pinPathEndpoints,
  type ConduitEndpointRoles,
} from './path-editing';
import type { Diagram } from './types';

const EXPOSED_ROLES: ConduitEndpointRoles = { start: 'fixed', end: 'free' };

function defaultCableExposedPathPoints(diagram: Diagram, wireId: string): Point[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  const cableId = wire?.cableId;
  if (!wire || !cableId) return null;

  const cable = diagram.cables.find((c) => c.id === cableId);
  const box = cable ? diagram.junctionBoxes.find((j) => j.id === cable.junctionBoxId) : undefined;
  if (!cable || !box) return null;
  if (isBreakerCable(cable)) return null;

  const wireCount = cable.wireIds.length as 1 | 2 | 3;
  if (wireCount < 1 || wireCount > 3) return null;

  const slotIdx = cable.wireIds.indexOf(wireId);
  if (slotIdx < 0) return null;

  const inward = junctionBoxAnchorInwardNormal(box, cable.anchor);
  const slots = cableWallSlots(box, cable.anchor, wireCount);
  const slot = slots[slotIdx] ?? slots[0]!;
  const tip = {
    x: slot.x + inward.x * LOCAL_CONDUIT_STUB_LENGTH,
    y: slot.y + inward.y * LOCAL_CONDUIT_STUB_LENGTH,
  };
  return defaultFourPointPath(slot, tip);
}

export function pinnedCableExposedEnds(
  diagram: Diagram,
  wireId: string,
): { start: Point; end: Point; defaults: Point[] } | null {
  const defaults = defaultCableExposedPathPoints(diagram, wireId);
  if (!defaults?.length) return null;

  const start = { ...defaults[0]! };
  const defaultTip = { ...defaults[defaults.length - 1]! };
  const stored = diagram.layout.exposedPaths?.[wireId]?.points;
  const end =
    stored && stored.length >= 2 ? { ...stored[stored.length - 1]! } : defaultTip;
  return { start, end, defaults };
}

export function resolveExposedCableWirePath(diagram: Diagram, wireId: string): Point[] | null {
  const pinned = pinnedCableExposedEnds(diagram, wireId);
  if (!pinned) return null;

  const stored = diagram.layout.exposedPaths?.[wireId]?.points;
  let points = normalizeWirePath(stored, pinned.start, pinned.end, FIXED_WIRE_VERTEX_COUNT);
  points = pinPathEndpoints(points, pinned.start, pinned.end, EXPOSED_ROLES);
  return points;
}

export function exposedCableWireEndpointPoint(
  diagram: Diagram,
  wireId: string,
  endpoint: 'start' | 'end',
): Point | null {
  if (endpoint === 'start') {
    return pinnedCableExposedEnds(diagram, wireId)?.start ?? null;
  }
  const path = resolveExposedCableWirePath(diagram, wireId);
  if (!path?.length) return null;
  return { ...path[path.length - 1]! };
}
