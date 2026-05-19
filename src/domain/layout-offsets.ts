import { conduitUsesPerWirePaths } from './path-editing';
import { nudgeConduitSideways, resolveConduitPath } from './path-routing';
import { moveWireJoint, nudgeWirePathGeometry, resolveWirePath } from './wire-routing';
import { moveWireLinkJoint, nudgeWireLinkRoute } from './wire-geometry';
import type { Diagram, LayoutState, PathOffset } from './types';

export type { PathOffset };

export const PATH_NUDGE_STEP = 12;

export function emptyLayoutOffsets(): Pick<
  LayoutState,
  'conduitOffsets' | 'wireOffsets' | 'wireLinkOffsets'
> {
  return { conduitOffsets: {}, wireOffsets: {}, wireLinkOffsets: {} };
}

export function normalizeLayoutOffsets(layout: LayoutState): LayoutState {
  return {
    ...layout,
    conduitOffsets: layout.conduitOffsets ?? {},
    wireOffsets: layout.wireOffsets ?? {},
    wirePaths: layout.wirePaths ?? {},
    wireLinkOffsets: layout.wireLinkOffsets ?? {},
  };
}

export function conduitPathOffset(diagram: Diagram, conduitId: string): PathOffset {
  return diagram.layout.conduitOffsets?.[conduitId] ?? { dx: 0, dy: 0 };
}

export function wirePathOffset(diagram: Diagram, wireId: string): PathOffset {
  return diagram.layout.wireOffsets?.[wireId] ?? { dx: 0, dy: 0 };
}

export function wireLinkPathOffset(diagram: Diagram, linkId: string): PathOffset {
  return diagram.layout.wireLinkOffsets?.[linkId] ?? { dx: 0, dy: 0 };
}

export function conduitCenterPath(
  diagram: Diagram,
  conduitId: string,
): { x: number; y: number }[] | null {
  const conduit = diagram.conduits.find((c) => c.id === conduitId);
  if (!conduit) return null;
  if (conduitUsesPerWirePaths(conduit) && conduit.wireIds.length > 0) {
    return resolveWirePath(diagram, conduit.wireIds[0]!) ?? resolveConduitPath(diagram, conduit);
  }
  return resolveConduitPath(diagram, conduit);
}

export function nudgeConduitPath(diagram: Diagram, conduitId: string, dx: number, dy: number): Diagram {
  return nudgeConduitSideways(diagram, conduitId, dx, dy);
}

export function nudgeWirePath(diagram: Diagram, wireId: string, dx: number, dy: number): Diagram {
  return nudgeWirePathGeometry(diagram, wireId, dx, dy);
}

export function nudgeWireLinkPath(diagram: Diagram, linkId: string, dx: number, dy: number): Diagram {
  return nudgeWireLinkRoute(diagram, linkId, dx, dy);
}

export { moveConduitFreeEnd, moveConduitJoint } from './path-routing';
export { moveWireJoint, moveWireLinkJoint };

export function pruneLayoutOffsets(diagram: Diagram): Diagram {
  const layout = normalizeLayoutOffsets(diagram.layout);
  const conduitIds = new Set(diagram.conduits.map((c) => c.id));
  const wireIds = new Set(diagram.wires.map((w) => w.id));
  const linkIds = new Set(diagram.wireLinks.map((l) => l.id));

  const conduitOffsets: Record<string, PathOffset> = {};
  for (const [id, off] of Object.entries(layout.conduitOffsets!)) {
    if (conduitIds.has(id) && (off.dx !== 0 || off.dy !== 0)) conduitOffsets[id] = off;
  }

  const wireOffsets: Record<string, PathOffset> = {};
  for (const [id, off] of Object.entries(layout.wireOffsets!)) {
    if (wireIds.has(id) && (off.dx !== 0 || off.dy !== 0)) wireOffsets[id] = off;
  }

  const wireLinkOffsets: Record<string, PathOffset> = {};
  for (const [id, off] of Object.entries(layout.wireLinkOffsets!)) {
    if (linkIds.has(id) && (off.dx !== 0 || off.dy !== 0)) wireLinkOffsets[id] = off;
  }

  const wirePaths: Record<string, { points: { x: number; y: number }[] }> = {};
  for (const [id, entry] of Object.entries(layout.wirePaths ?? {})) {
    if (wireIds.has(id) && entry?.points?.length) wirePaths[id] = entry;
  }

  return {
    ...diagram,
    layout: { ...layout, conduitOffsets, wireOffsets, wireLinkOffsets, wirePaths },
  };
}
