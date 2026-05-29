import { nanoid } from 'nanoid';
import { cableAnchorTaken } from './cable-slots';
import { refreshCablePaths } from './cable-geometry';
import { refreshConduitRunPaths } from './conduit-run-geometry';
import type { AnchorPosition, Cable, Diagram, Wire, WireColor } from './types';
import { isBreakerCable, isBreakerSeededWire, toggleBreakerCableClosed } from './breaker-cable';
import { deleteWire } from './mutations';

function defaultCableWireLabel(): string {
  return '';
}

function wireMultiset(colors: Iterable<WireColor>): Map<WireColor, number> {
  const m = new Map<WireColor, number>();
  const bump = (c: WireColor) => {
    m.set(c, (m.get(c) ?? 0) + 1);
  };
  for (const c of colors) {
    bump(c);
  }
  return m;
}

function multisetsEqual(a: Map<WireColor, number>, b: Map<WireColor, number>): boolean {
  for (const c of ['red', 'white', 'black'] as WireColor[]) {
    if ((a.get(c) ?? 0) !== (b.get(c) ?? 0)) return false;
  }
  return true;
}

function diagramRunsReferencingCable(diagram: Diagram, cableId: string) {
  return diagram.conduitRuns.filter(
    (r) => r.cableIdA === cableId || r.cableIdB === cableId,
  );
}

/** Assert multiset(new colors) equals multiset(colors of wires in `run`). */
function assertCableWiresCompatibleWithRuns(
  diagram: Diagram,
  cableId: string,
  proposedColors: WireColor[],
): void {
  const runs = diagramRunsReferencingCable(diagram, cableId);
  if (runs.length === 0) return;

  const proposed = wireMultiset(proposedColors);
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));

  for (const run of runs) {
    const colors: WireColor[] = [];
    for (const wid of run.wireIds) {
      const w = wireById.get(wid);
      if (!w) {
        throw new Error(`Conduit run ${run.id} references missing wire ${wid}`);
      }
      if (w.cableId !== cableId) continue;
      colors.push(w.color);
    }
    if (!multisetsEqual(proposed, wireMultiset(colors))) {
      throw new Error(
        'Cable wire colors must stay compatible with conduit run conductors (matching red/white/black counts).',
      );
    }
  }
}

function conduitRunsWithoutCable(diagram: Diagram, cableId: string): Diagram {
  const removedRunIds = new Set(
    diagram.conduitRuns.filter(
      (r) => r.cableIdA === cableId || r.cableIdB === cableId,
    ).map((r) => r.id),
  );
  const conduitRunPaths = { ...diagram.layout.conduitRunPaths };
  for (const id of removedRunIds) delete conduitRunPaths[id];

  return {
    ...diagram,
    conduitRuns: diagram.conduitRuns.filter((r) => !removedRunIds.has(r.id)),
    layout: { ...diagram.layout, conduitRunPaths },
  };
}

/** True if `anchor` is taken on `junctionBoxId` by a cable other than `excludeCableId`. */
function cableAnchorTakenExcept(
  diagram: Diagram,
  junctionBoxId: string,
  anchor: AnchorPosition,
  excludeCableId?: string,
): boolean {
  return diagram.cables.some(
    (c) =>
      c.id !== excludeCableId &&
      c.junctionBoxId === junctionBoxId &&
      c.anchor === anchor,
  );
}

export function addCable(
  diagram: Diagram,
  params: {
    junctionBoxId: string;
    anchor: AnchorPosition;
    wireColors: WireColor[];
  },
): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === params.junctionBoxId);
  if (!box) {
    throw new Error(`Unknown junction box ${params.junctionBoxId}`);
  }
  const isBreakerPanel = box.type === 'breaker';

  const n = params.wireColors.length;
  if (n < 1 || n > 3) {
    throw new Error('A cable needs between 1 and 3 wires');
  }

  if (cableAnchorTaken(diagram, params.junctionBoxId, params.anchor)) {
    throw new Error(`Junction anchor already has a cable (${params.anchor})`);
  }

  const cableId = nanoid();
  const wireCount = n as 1 | 2 | 3;

  const newWires: Wire[] = [];
  const wireIds: string[] = [];
  for (let i = 0; i < wireCount; i++) {
    const id = nanoid();
    wireIds.push(id);
    newWires.push({
      id,
      color: params.wireColors[i]!,
      label: defaultCableWireLabel(),
      conduitId: null,
      cableId,
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    });
  }

  const cable: Cable = {
    id: cableId,
    junctionBoxId: params.junctionBoxId,
    anchor: params.anchor,
    wireIds,
    ...(isBreakerPanel
      ? { role: 'breaker' as const, closed: true }
      : { role: 'junction' as const }),
  };

  let next: Diagram = {
    ...diagram,
    cables: [...diagram.cables, cable],
    wires: [...diagram.wires, ...newWires],
  };

  next = refreshCablePaths(next);
  return next;
}

export function toggleBreakerCable(diagram: Diagram, cableId: string): Diagram {
  const cable = diagram.cables.find((c) => c.id === cableId);
  if (!cable || !isBreakerCable(cable)) {
    throw new Error('Not a breaker cable');
  }
  return {
    ...diagram,
    cables: diagram.cables.map((c) => (c.id === cableId ? toggleBreakerCableClosed(c) : c)),
  };
}

export function updateCable(
  diagram: Diagram,
  cableId: string,
  patch: Partial<Pick<Cable, 'label'>>,
): Diagram {
  if (!diagram.cables.some((c) => c.id === cableId)) {
    throw new Error(`Unknown cable ${cableId}`);
  }
  return {
    ...diagram,
    cables: diagram.cables.map((c) => (c.id === cableId ? { ...c, ...patch } : c)),
  };
}

export function moveCableAnchor(
  diagram: Diagram,
  cableId: string,
  anchor: AnchorPosition,
): Diagram {
  const cableIdx = diagram.cables.findIndex((c) => c.id === cableId);
  if (cableIdx < 0) {
    throw new Error(`Unknown cable ${cableId}`);
  }
  const cable = diagram.cables[cableIdx]!;

  const box = diagram.junctionBoxes.find((j) => j.id === cable.junctionBoxId);
  if (!box) {
    throw new Error(`Unknown junction box ${cable.junctionBoxId}`);
  }
  if (box.type === 'breaker') {
    throw new Error('Use breaker circuits (K) inside a breaker panel, not junction cables');
  }

  if (cable.anchor === anchor) {
    let d = refreshCablePaths(diagram);
    if (d.conduitRuns.length > 0) {
      d = refreshConduitRunPaths(d);
    }
    return d;
  }

  if (cableAnchorTakenExcept(diagram, cable.junctionBoxId, anchor, cableId)) {
    throw new Error(`Junction anchor already has a cable (${anchor})`);
  }

  const nextCables = diagram.cables.map((c) =>
    c.id === cableId ? { ...c, anchor } : c,
  );

  let next: Diagram = { ...diagram, cables: nextCables };
  next = refreshCablePaths(next);
  if (next.conduitRuns.length > 0) {
    next = refreshConduitRunPaths(next);
  }
  return next;
}

/** Remaps conduit run wire id entries when a cable swaps its wire identities. */
function remapConduitRunsAfterCableRewire(
  diagram: Diagram,
  oldCableWireIds: Set<string>,
  wireColorByOldId: Map<string, WireColor>,
  newWireQueues: Map<WireColor, string[]>,
): Diagram {
  const pools = new Map<WireColor, string[]>(
    [...newWireQueues.entries()].map(([color, ids]) => [color, [...ids]]),
  );

  const takeNewIdOfColor = (color: WireColor): string => {
    const queue = pools.get(color);
    if (!queue?.length) {
      throw new Error('Cable wire remap: missing replacement wire id for color slot');
    }
    const id = queue.shift()!;
    pools.set(color, queue);
    return id;
  };

  const conduitRuns = diagram.conduitRuns.map((run) => ({
    ...run,
    wireIds: run.wireIds.map((wid) => {
      if (!oldCableWireIds.has(wid)) return wid;
      const color = wireColorByOldId.get(wid);
      if (!color) {
        throw new Error(`Conduit run remap: missing old wire ${wid}`);
      }
      return takeNewIdOfColor(color);
    }),
  }));

  return { ...diagram, conduitRuns };
}

export function updateCableWires(
  diagram: Diagram,
  cableId: string,
  wireColors: WireColor[],
): Diagram {
  const cable = diagram.cables.find((c) => c.id === cableId);
  if (!cable) {
    throw new Error(`Unknown cable ${cableId}`);
  }

  const n = wireColors.length;
  if (n < 1 || n > 3) {
    throw new Error('A cable needs between 1 and 3 wires');
  }

  assertCableWiresCompatibleWithRuns(diagram, cableId, wireColors);

  const oldWireIds = [...cable.wireIds];
  const oldSet = new Set(oldWireIds);

  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));
  const wireColorByOldId = new Map<string, WireColor>();
  for (const wid of oldWireIds) {
    const ow = wireById.get(wid);
    if (!ow) continue;
    wireColorByOldId.set(wid, ow.color);
    if (
      ow.hubId != null ||
      ow.deviceNodeId != null ||
      diagram.wireLinks.some((l) => l.wireIdA === wid || l.wireIdB === wid)
    ) {
      throw new Error('Disconnect hub, devices, or wire links before changing cable conductors.');
    }
    if (isBreakerSeededWire(diagram, ow)) {
      throw new Error('Breaker-seeded wires cannot be replaced through cable edits.');
    }
  }

  const wireCount = n as 1 | 2 | 3;

  const newWires: Wire[] = [];
  const newWireIds: string[] = [];
  const newWireQueues = new Map<WireColor, string[]>();

  for (let i = 0; i < wireCount; i++) {
    const color = wireColors[i]!;
    const id = nanoid();
    newWireIds.push(id);
    newWires.push({
      id,
      color,
      label: defaultCableWireLabel(),
      conduitId: null,
      cableId,
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    });
    const q = newWireQueues.get(color) ?? [];
    q.push(id);
    newWireQueues.set(color, q);
  }

  let nextWires = diagram.wires.filter((w) => !oldSet.has(w.id));
  nextWires = [...nextWires, ...newWires];

  let nextDiagram: Diagram = {
    ...diagram,
    wires: nextWires,
    cables: diagram.cables.map((c) =>
      c.id === cableId ? { ...c, wireIds: newWireIds } : c,
    ),
  };

  if (diagramRunsReferencingCable(diagram, cableId).length > 0) {
    nextDiagram = remapConduitRunsAfterCableRewire(
      nextDiagram,
      oldSet,
      wireColorByOldId,
      newWireQueues,
    );
  }

  nextDiagram = refreshCablePaths(nextDiagram);
  return nextDiagram;
}

export function deleteCable(diagram: Diagram, cableId: string): Diagram {
  const cable = diagram.cables.find((c) => c.id === cableId);
  if (!cable) return diagram;

  let next = conduitRunsWithoutCable(diagram, cableId);
  next = { ...next, cables: next.cables.filter((c) => c.id !== cableId) };

  const wireIds = [...cable.wireIds];
  for (const wid of wireIds) {
    next = deleteWire(next, wid);
  }

  next = refreshCablePaths(next);
  return next;
}
