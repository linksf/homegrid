import { nanoid } from 'nanoid';
import { conduitStubResolvedPath, refreshCablePaths } from './cable-geometry';
import {
  refreshConduitRunPaths,
} from './conduit-run-geometry';
import { hubById } from './hub-geometry';
import {
  FIXED_LINK_VERTEX_COUNT,
  FIXED_WIRE_VERTEX_COUNT,
  hasCustomWirePathShape,
  normalizeWirePath,
  pinPathEndpoints,
  type ConduitEndpointRoles,
} from './path-editing';
import type { Point } from './orthogonal-path';
import type {
  AnchorPosition,
  Cable,
  Diagram,
  LocalConduit,
  SpanConduit,
  Wire,
  WireColor,
  WireLink,
} from './types';

const COLOR_PAIR_ORDER: readonly WireColor[] = ['black', 'white', 'red'];
const MAX_CABLE_WIRES = 3;

function findCable(diagram: Diagram, junctionBoxId: string, anchor: AnchorPosition): Cable | undefined {
  return diagram.cables.find((c) => c.junctionBoxId === junctionBoxId && c.anchor === anchor);
}

function stubOuterTipFromDiagram(diagram: Diagram, cableId: string): Point | null {
  const resolved = conduitStubResolvedPath(diagram, cableId);
  if (resolved && resolved.length >= 2) {
    return { ...resolved[resolved.length - 1]! };
  }
  const fallback = diagram.layout.conduitStubPaths?.[cableId]?.points;
  if (fallback && fallback.length >= 2) {
    return { ...fallback[fallback.length - 1]! };
  }
  return null;
}

function conduitRunStubEndpoints(diagram: Diagram, run: import('./types').ConduitRun): {
  start: Point;
  end: Point;
} | null {
  const tipA = stubOuterTipFromDiagram(diagram, run.cableIdA);
  if (!tipA) return null;
  if (!run.cableIdB) return null;
  const tipB = stubOuterTipFromDiagram(diagram, run.cableIdB);
  if (!tipB) return null;
  return { start: tipA, end: tipB };
}

function colorQueuesFromCable(diagram: Diagram, cable: Cable): Map<WireColor, string[]> {
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));
  const qs = new Map<WireColor, string[]>();
  for (const c of COLOR_PAIR_ORDER) qs.set(c, []);

  for (const wid of cable.wireIds) {
    const w = wireById.get(wid);
    if (!w || w.cableId !== cable.id) continue;
    const q = qs.get(w.color) ?? [];
    q.push(wid);
    qs.set(w.color, q);
  }
  return qs;
}

function pairWireIdsForTwoCables(diagram: Diagram, cableA: Cable, cableB: Cable): string[] {
  const qa = colorQueuesFromCable(diagram, cableA);
  const qb = colorQueuesFromCable(diagram, cableB);
  const paired: string[] = [];
  for (const c of COLOR_PAIR_ORDER) {
    const aQueue = qa.get(c) ?? [];
    const bQueue = qb.get(c) ?? [];
    while (aQueue.length > 0 && bQueue.length > 0) {
      paired.push(aQueue.shift()!, bQueue.shift()!);
    }
  }
  let remaining = 0;
  for (const c of COLOR_PAIR_ORDER) {
    remaining += (qa.get(c)?.length ?? 0) + (qb.get(c)?.length ?? 0);
  }
  if (remaining !== 0) {
    throw new Error('Span migration: cable conductors could not be paired by color.');
  }
  return paired;
}

function remapWireLinksForSpanClones(wireLinks: WireLink[], cloneByOriginal: Map<string, string>): WireLink[] {
  if (cloneByOriginal.size === 0) return wireLinks;
  return wireLinks.map((link) => {
    let wireIdA = link.wireIdA;
    let wireIdB = link.wireIdB;
    const epA = link.endpointA ?? 'end';
    const epB = link.endpointB ?? 'end';
    if (cloneByOriginal.has(wireIdA) && epA === 'end') {
      wireIdA = cloneByOriginal.get(wireIdA)!;
    }
    if (cloneByOriginal.has(wireIdB) && epB === 'end') {
      wireIdB = cloneByOriginal.get(wireIdB)!;
    }
    return { ...link, wireIdA, wireIdB };
  });
}

function pruneConduitLayoutEntry(diagram: Diagram, conduitId: string): Diagram {
  const conduitPaths = { ...diagram.layout.conduitPaths };
  delete conduitPaths[conduitId];
  const conduitOffsets = { ...(diagram.layout.conduitOffsets ?? {}) };
  delete conduitOffsets[conduitId];
  return {
    ...diagram,
    layout: { ...diagram.layout, conduitPaths, conduitOffsets },
  };
}

function pruneWireLayoutEntries(diagram: Diagram, wireIds: Iterable<string>): Diagram {
  const wirePaths = { ...(diagram.layout.wirePaths ?? {}) };
  const wireOffsets = { ...(diagram.layout.wireOffsets ?? {}) };
  for (const wid of wireIds) {
    delete wirePaths[wid];
    delete wireOffsets[wid];
  }
  return {
    ...diagram,
    layout: { ...diagram.layout, wirePaths, wireOffsets },
  };
}

function copyLocalWirePathsToExposed(diagram: Diagram, wireIds: string[]): Diagram {
  let exposedPaths = { ...(diagram.layout.exposedPaths ?? {}) };
  const wirePaths = diagram.layout.wirePaths ?? {};
  for (const wid of wireIds) {
    const pts = wirePaths[wid]?.points;
    if (hasCustomWirePathShape(pts, FIXED_WIRE_VERTEX_COUNT)) {
      exposedPaths = { ...exposedPaths, [wid]: { points: pts!.map((p) => ({ ...p })) } };
    }
  }
  return { ...diagram, layout: { ...diagram.layout, exposedPaths } };
}

function hubIdsToMoveToBClones(span: SpanConduit, bundleWires: Wire[], diagram: Diagram): Map<string, string> {
  const move = new Map<string, string>();
  for (const w of bundleWires) {
    if (!w.hubId) continue;
    const hub = hubById(diagram, w.hubId);
    if (hub?.junctionBoxId === span.junctionBoxIdB) move.set(w.id, w.hubId);
  }
  return move;
}

function finalizeLocalMigrate(next: Diagram, conduitId: string, wireIds: string[]): Diagram {
  let out = copyLocalWirePathsToExposed(next, wireIds);
  out = pruneWireLayoutEntries(out, wireIds);
  out = pruneConduitLayoutEntry(out, conduitId);
  return {
    ...out,
    conduits: out.conduits.filter((c) => c.id !== conduitId),
  };
}

function migrateLocalConduit(
  diagram: Diagram,
  conduit: LocalConduit,
): { diagram: Diagram; migrated: boolean } {
  const { junctionBoxId, anchor, wireIds } = conduit;
  if (wireIds.length === 0 || wireIds.length > MAX_CABLE_WIRES) {
    return { diagram, migrated: false };
  }

  const bundleWires = wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is Wire => Boolean(w));
  if (
    bundleWires.length !== wireIds.length ||
    !bundleWires.every((w) => w.conduitId === conduit.id)
  ) {
    return { diagram, migrated: false };
  }

  const existing = findCable(diagram, junctionBoxId, anchor);

  if (!existing) {
    const cableId = nanoid();
    const cable: Cable = { id: cableId, junctionBoxId, anchor, wireIds: [...wireIds] };
    let next: Diagram = {
      ...diagram,
      cables: [...diagram.cables, cable],
      wires: diagram.wires.map((w) => {
        if (!wireIds.includes(w.id)) return w;
        return {
          ...w,
          cableId,
          conduitId: w.conduitId === conduit.id ? null : w.conduitId,
        };
      }),
    };
    next = finalizeLocalMigrate(next, conduit.id, wireIds);
    return { diagram: next, migrated: true };
  }

  const allOnCable =
    bundleWires.every((w) => w.cableId === existing.id) &&
    wireIds.every((wid) => existing.wireIds.includes(wid));

  if (allOnCable) {
    const next = finalizeLocalMigrate(diagram, conduit.id, wireIds);
    return { diagram: next, migrated: true };
  }

  if (wireIds.some((wid) => existing.wireIds.includes(wid))) {
    return { diagram, migrated: false };
  }

  const mergedIds = [...existing.wireIds, ...wireIds];
  if (mergedIds.length > MAX_CABLE_WIRES) return { diagram, migrated: false };

  let next: Diagram = {
    ...diagram,
    cables: diagram.cables.map((c) => (c.id === existing.id ? { ...c, wireIds: mergedIds } : c)),
    wires: diagram.wires.map((w) => {
      if (!wireIds.includes(w.id)) return w;
      return {
        ...w,
        cableId: existing.id,
        conduitId: w.conduitId === conduit.id ? null : w.conduitId,
      };
    }),
  };
  next = finalizeLocalMigrate(next, conduit.id, wireIds);
  return { diagram: next, migrated: true };
}

function pruneSpan(diagram: Diagram, span: SpanConduit): Diagram {
  let next = pruneConduitLayoutEntry(diagram, span.id);
  next = pruneWireLayoutEntries(next, span.wireIds);
  return { ...next, conduits: next.conduits.filter((c) => c.id !== span.id) };
}

function applySpanCenterlineToRun(
  diagram: Diagram,
  run: import('./types').ConduitRun,
  spanCenterline: Point[],
): Diagram {
  if (spanCenterline.length < 2) return diagram;

  let conduitRunPaths = { ...(diagram.layout.conduitRunPaths ?? {}) };
  const pinned = conduitRunStubEndpoints(diagram, run);

  let points: Point[];
  const rolesFixed: ConduitEndpointRoles = { start: 'fixed', end: 'fixed' };

  if (pinned) {
    points = normalizeWirePath(spanCenterline, pinned.start, pinned.end, FIXED_LINK_VERTEX_COUNT);
    points = pinPathEndpoints(points, pinned.start, pinned.end, rolesFixed);
  } else {
    points = spanCenterline.map((p) => ({ ...p }));
  }

  conduitRunPaths = { ...conduitRunPaths, [run.id]: { points } };
  return { ...diagram, layout: { ...diagram.layout, conduitRunPaths } };
}

function migrateSpanConduit(diagram: Diagram, span: SpanConduit): { diagram: Diagram; migrated: boolean } {
  if (span.wireIds.length === 0 || span.wireIds.length > MAX_CABLE_WIRES) {
    return { diagram, migrated: false };
  }

  const boxA = diagram.junctionBoxes.find((j) => j.id === span.junctionBoxIdA);
  const boxB = diagram.junctionBoxes.find((j) => j.id === span.junctionBoxIdB);

  if (!boxA || !boxB || boxA.type === 'breaker' || boxB.type === 'breaker') {
    return { diagram, migrated: false };
  }

  const bundleWires = span.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is Wire => Boolean(w));

  if (
    bundleWires.length !== span.wireIds.length ||
    !bundleWires.every((w) => w.conduitId === span.id)
  ) {
    return { diagram, migrated: false };
  }

  if (findCable(diagram, span.junctionBoxIdB, span.anchorB)) return { diagram, migrated: false };

  const spanCenterlineSnapshot = [...(diagram.layout.conduitPaths?.[span.id]?.points ?? [])] as Point[];

  let next = diagram;
  const hubMovePlan = hubIdsToMoveToBClones(span, bundleWires, diagram);
  if (hubMovePlan.size > 0) {
    next = {
      ...next,
      wires: next.wires.map((w) => (hubMovePlan.has(w.id) ? { ...w, hubId: null } : w)),
    };
  }

  let cabA = findCable(next, span.junctionBoxIdA, span.anchorA);

  if (!cabA) {
    const cableIdA = nanoid();
    cabA = {
      id: cableIdA,
      junctionBoxId: span.junctionBoxIdA,
      anchor: span.anchorA,
      wireIds: [...span.wireIds],
    };
    next = {
      ...next,
      cables: [...next.cables, cabA],
      wires: next.wires.map((w) => {
        if (!span.wireIds.includes(w.id)) return w;
        return {
          ...w,
          cableId: cableIdA,
          conduitId: null,
          hubId: hubMovePlan.has(w.id) ? null : w.hubId,
        };
      }),
    };
  } else {
    const sameIds =
      span.wireIds.length === cabA.wireIds.length &&
      [...span.wireIds].sort().join('|') === [...cabA.wireIds].sort().join('|');
    if (!sameIds) return { diagram, migrated: false };

    next = {
      ...next,
      wires: next.wires.map((w) => {
        if (!span.wireIds.includes(w.id)) return w;
        return {
          ...w,
          cableId: cabA!.id,
          conduitId: null,
          hubId: hubMovePlan.has(w.id) ? null : w.hubId,
        };
      }),
    };
  }

  const cableIdB = nanoid();
  const cloneByOriginal = new Map<string, string>();
  const clones: Wire[] = [];

  for (const w of bundleWires) {
    const nid = nanoid();
    cloneByOriginal.set(w.id, nid);
    clones.push({
      ...w,
      id: nid,
      conduitId: null,
      cableId: cableIdB,
      hubId: hubMovePlan.get(w.id) ?? null,
      deviceNodeId: null,
      manualDirection: w.manualDirection,
    });
  }

  const cableB: Cable = {
    id: cableIdB,
    junctionBoxId: span.junctionBoxIdB,
    anchor: span.anchorB,
    wireIds: clones.map((w) => w.id),
  };

  const wireLinks = remapWireLinksForSpanClones(next.wireLinks, cloneByOriginal);

  next = {
    ...next,
    cables: [...next.cables, cableB],
    wires: [...next.wires, ...clones],
    wireLinks,
  };

  const runId = nanoid();

  cabA = findCable(next, span.junctionBoxIdA, span.anchorA)!;
  let runBlueprint: import('./types').ConduitRun = {
    id: runId,
    cableIdA: cabA.id,
    cableIdB: cableB.id,
    wireIds: pairWireIdsForTwoCables(next, cabA, cableB),
  };

  next = pruneSpan(next, span);
  next = { ...next, conduitRuns: [...next.conduitRuns, runBlueprint] };
  next = refreshCablePaths(next);

  runBlueprint = next.conduitRuns.find((r) => r.id === runId)!;
  next = applySpanCenterlineToRun(next, runBlueprint, spanCenterlineSnapshot);
  next = refreshConduitRunPaths(next);
  return { diagram: next, migrated: true };
}

/**
 * Migrate legacy `local` and `span` conduits to `Cable` + `ConduitRun` layout.
 * Best-effort: skips when anchors are blocked or conductors cannot be represented as ≤3 wires per cable.
 */
export function migrateConduitsToCables(diagram: Diagram): Diagram {
  let next = diagram;

  const locals = next.conduits.filter((c): c is LocalConduit => c.kind === 'local');
  for (const loc of locals) {
    const { diagram: d, migrated } = migrateLocalConduit(next, loc);
    next = migrated ? d : next;
  }

  const spans = [...next.conduits].filter((c): c is SpanConduit => c.kind === 'span');
  for (const span of spans) {
    const { diagram: d, migrated } = migrateSpanConduit(next, span);
    next = migrated ? d : next;
  }

  next = refreshCablePaths(next);
  next = refreshConduitRunPaths(next);
  return next;
}

/** Legacy breaker conduits may still exist in persisted diagrams after removal from the `Conduit` union. */
interface LegacyBreakerConduit {
  id: string;
  kind: 'breaker';
  label: string;
  junctionBoxId: string;
  anchor: AnchorPosition;
  wireIds: string[];
}

type LegacyConduitRun = import('./types').ConduitRun & { breakerId?: string | null };

function isLegacyBreakerConduit(entry: Diagram['conduits'][number]): boolean {
  return (entry as { kind?: string }).kind === 'breaker';
}

/**
 * Migrate legacy `kind: 'breaker'` conduits to breaker-type cables.
 * Uses new cable ids to avoid colliding with conduit layout keys.
 */
export function migrateBreakerConduitsToCables(diagram: Diagram): Diagram {
  const legacyBreakers = diagram.conduits.filter(isLegacyBreakerConduit) as unknown as LegacyBreakerConduit[];
  if (legacyBreakers.length === 0) {
    return {
      ...diagram,
      conduitRuns: diagram.conduitRuns.map((run) => {
        const legacyRun = run as LegacyConduitRun;
        if (legacyRun.breakerId == null) return run;
        return {
          id: run.id,
          cableIdA: run.cableIdA,
          cableIdB: run.cableIdB,
          wireIds: run.wireIds,
        };
      }),
    };
  }

  let next = diagram;
  const breakerConduitIdToCableId = new Map<string, string>();

  for (const conduit of legacyBreakers) {
    const cableId = nanoid();
    breakerConduitIdToCableId.set(conduit.id, cableId);

    const cable: Cable = {
      id: cableId,
      junctionBoxId: conduit.junctionBoxId,
      anchor: conduit.anchor,
      wireIds: [...conduit.wireIds],
      role: 'breaker',
      closed: true,
      label: conduit.label || undefined,
    };

    next = {
      ...next,
      cables: [...next.cables, cable],
      wires: next.wires.map((w) => {
        if (!conduit.wireIds.includes(w.id)) return w;
        return {
          ...w,
          cableId,
          conduitId: null,
          breakerId: null,
          manualDirection: null,
        };
      }),
    };

    next = pruneConduitLayoutEntry(next, conduit.id);
  }

  const legacyIds = new Set(legacyBreakers.map((c) => c.id));
  next = {
    ...next,
    conduits: next.conduits.filter((c) => !legacyIds.has(c.id)),
    conduitRuns: next.conduitRuns.map((run) => {
      const legacyRun = run as LegacyConduitRun;
      if (legacyRun.breakerId) {
        const breakerCableId = breakerConduitIdToCableId.get(legacyRun.breakerId);
        if (breakerCableId) {
          return {
            id: run.id,
            cableIdA: run.cableIdA,
            cableIdB: breakerCableId,
            wireIds: run.wireIds,
          };
        }
      }
      if (legacyRun.breakerId != null) {
        const { breakerId: _removed, ...clean } = legacyRun;
        return clean;
      }
      return run;
    }),
  };

  next = refreshCablePaths(next);
  next = refreshConduitRunPaths(next);
  return next;
}
