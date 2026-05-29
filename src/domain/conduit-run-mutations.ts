import { nanoid } from 'nanoid';
import { isBreakerCable } from './breaker-cable';
import { cableAnchorTaken } from './cable-slots';
import { addCable } from './cable-mutations';
import { refreshConduitRunPaths } from './conduit-run-geometry';
import type { AnchorPosition, Cable, Diagram, WireColor } from './types';

const COLOR_PAIR_ORDER: readonly WireColor[] = ['black', 'white', 'red'];

function wireMultiset(colors: Iterable<WireColor>): Map<WireColor, number> {
  const m = new Map<WireColor, number>();
  for (const c of colors) {
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

function multisetsEqual(a: Map<WireColor, number>, b: Map<WireColor, number>): boolean {
  for (const c of COLOR_PAIR_ORDER) {
    if ((a.get(c) ?? 0) !== (b.get(c) ?? 0)) return false;
  }
  return true;
}

function multisetFromCableWires(diagram: Diagram, cable: Cable): Map<WireColor, number> {
  const colors: WireColor[] = [];
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));
  for (const wid of cable.wireIds) {
    const w = wireById.get(wid);
    if (w?.cableId === cable.id) colors.push(w.color);
  }
  return wireMultiset(colors);
}

function orderedWireColorsForMultiset(multiset: Map<WireColor, number>): WireColor[] {
  const ordered: WireColor[] = [];
  for (const c of COLOR_PAIR_ORDER) {
    const n = multiset.get(c) ?? 0;
    for (let i = 0; i < n; i++) ordered.push(c);
  }
  return ordered;
}

export function cableParticipatesInConduitRun(diagram: Diagram, cableId: string): boolean {
  return diagram.conduitRuns.some((r) => r.cableIdA === cableId || r.cableIdB === cableId);
}

/** Stub hit targets without an existing conduit run (first pick in conduit connect). */
export function conduitStubAvailableCableIds(diagram: Diagram): Set<string> {
  const ids = new Set<string>();
  for (const c of diagram.cables) {
    if (!cableParticipatesInConduitRun(diagram, c.id)) ids.add(c.id);
  }
  return ids;
}

/** Other cables matching conductor multiset and available for conduit connect (pending second cable pick). */
export function conduitConnectCompatibleCableIds(diagram: Diagram, fromCableId: string): Set<string> {
  const fromCable = diagram.cables.find((c) => c.id === fromCableId);
  if (!fromCable) return new Set();

  const fromMultiset = multisetFromCableWires(diagram, fromCable);
  const ids = new Set<string>();
  for (const c of diagram.cables) {
    if (c.id === fromCableId) continue;
    if (cableParticipatesInConduitRun(diagram, c.id)) continue;
    if (multisetsEqual(fromMultiset, multisetFromCableWires(diagram, c))) ids.add(c.id);
  }
  return ids;
}

/** FIFO queues keyed by conductor color following each cable's `wireIds` order. */
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
    throw new Error('Cable conductors could not be paired by matching colors.');
  }

  return paired;
}

export function connectConduitRun(
  diagram: Diagram,
  fromCableId: string,
  to:
    | { kind: 'cable'; cableId: string }
    | { kind: 'anchor'; junctionBoxId: string; anchor: AnchorPosition },
): Diagram {
  const fromCable = diagram.cables.find((c) => c.id === fromCableId);
  if (!fromCable) {
    throw new Error(`Unknown cable ${fromCableId}`);
  }

  if (cableParticipatesInConduitRun(diagram, fromCableId)) {
    throw new Error('That cable stub is already connected by a conduit run.');
  }

  const fromMultiset = multisetFromCableWires(diagram, fromCable);
  let next: Diagram = diagram;
  let toCableId: string;

  if (to.kind === 'cable') {
    const toCable = diagram.cables.find((c) => c.id === to.cableId);
    if (!toCable) {
      throw new Error(`Unknown cable ${to.cableId}`);
    }
    if (toCable.id === fromCable.id) {
      throw new Error('Cannot connect a cable conduit stub to itself.');
    }
    if (cableParticipatesInConduitRun(diagram, toCable.id)) {
      throw new Error('The destination cable stub is already connected by a conduit run.');
    }
    if (!multisetsEqual(fromMultiset, multisetFromCableWires(diagram, toCable))) {
      throw new Error('Cable conductor colors must match to create a conduit run.');
    }

    const wireIds = pairWireIdsForTwoCables(next, fromCable, toCable);
    toCableId = toCable.id;

    const run = {
      id: nanoid(),
      cableIdA: fromCableId,
      cableIdB: toCableId,
      wireIds,
    };

    next = {
      ...next,
      conduitRuns: [...next.conduitRuns, run],
    };
  } else {
    const box = diagram.junctionBoxes.find((j) => j.id === to.junctionBoxId);
    if (!box) {
      throw new Error(`Unknown junction box ${to.junctionBoxId}`);
    }
    if (box.type === 'breaker') {
      throw new Error('Use connectConduitRunToBreakerAnchor for breaker panel stubs.');
    }

    const anchorBusy = cableAnchorTaken(diagram, to.junctionBoxId, to.anchor);
    let toCable: Cable;

    if (!anchorBusy) {
      const wireColors = orderedWireColorsForMultiset(fromMultiset);
      next = addCable(next, {
        junctionBoxId: to.junctionBoxId,
        anchor: to.anchor,
        wireColors,
      });
      const created = next.cables.find(
        (c) => c.junctionBoxId === to.junctionBoxId && c.anchor === to.anchor,
      );
      if (!created) {
        throw new Error('Failed to create destination cable.');
      }
      toCable = created;
    } else {
      const existing = diagram.cables.find(
        (c) => c.junctionBoxId === to.junctionBoxId && c.anchor === to.anchor,
      );
      if (!existing) {
        throw new Error(`Junction anchor already has something other than a cable (${to.anchor}).`);
      }
      toCable = existing;
      if (cableParticipatesInConduitRun(diagram, toCable.id)) {
        throw new Error('The destination cable stub is already connected by a conduit run.');
      }
      if (!multisetsEqual(fromMultiset, multisetFromCableWires(diagram, toCable))) {
        throw new Error('Cable conductor colors must match to create a conduit run.');
      }
    }

    toCableId = toCable.id;
    const refreshedFrom = next.cables.find((c) => c.id === fromCableId)!;

    const wireIds = pairWireIdsForTwoCables(next, refreshedFrom, toCable);

    const run = {
      id: nanoid(),
      cableIdA: fromCableId,
      cableIdB: toCableId,
      wireIds,
    };

    next = {
      ...next,
      conduitRuns: [...next.conduitRuns, run],
    };
  }

  return refreshConduitRunPaths(next);
}

/** Connect a cable stub to a breaker panel anchor, creating a matching breaker cable when needed. */
export function connectConduitRunToBreakerAnchor(
  diagram: Diagram,
  fromCableId: string,
  junctionBoxId: string,
  anchor: AnchorPosition,
): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === junctionBoxId);
  if (!box || box.type !== 'breaker') {
    throw new Error('Breaker conduit runs must terminate on the breaker panel.');
  }

  const junctionCableAtAnchor = diagram.cables.find(
    (c) =>
      c.junctionBoxId === junctionBoxId &&
      c.anchor === anchor &&
      !isBreakerCable(c),
  );
  if (junctionCableAtAnchor) {
    throw new Error('That breaker panel anchor already has a junction cable.');
  }

  const fromCable = diagram.cables.find((c) => c.id === fromCableId);
  if (!fromCable) {
    throw new Error(`Unknown cable ${fromCableId}`);
  }

  let next = diagram;
  let breakerCable = next.cables.find(
    (c) =>
      c.junctionBoxId === junctionBoxId &&
      c.anchor === anchor &&
      isBreakerCable(c),
  );

  if (!breakerCable) {
    const wireColors = orderedWireColorsForMultiset(multisetFromCableWires(next, fromCable));
    if (wireColors.length < 1 || wireColors.length > 3) {
      throw new Error('Cable must have between 1 and 3 conductors to feed a breaker.');
    }
    next = addCable(next, { junctionBoxId, anchor, wireColors });
    breakerCable = next.cables.find(
      (c) =>
        c.junctionBoxId === junctionBoxId &&
        c.anchor === anchor &&
        isBreakerCable(c),
    );
    if (!breakerCable) {
      throw new Error('Failed to create breaker cable at that anchor.');
    }
  }

  if (cableParticipatesInConduitRun(next, breakerCable.id)) {
    throw new Error('That breaker circuit is already fed by a conduit run.');
  }

  return connectConduitRun(next, fromCableId, { kind: 'cable', cableId: breakerCable.id });
}

export function disconnectConduitRun(diagram: Diagram, runId: string): Diagram {
  if (!diagram.conduitRuns.some((r) => r.id === runId)) {
    return diagram;
  }
  const conduitRunPaths = { ...(diagram.layout.conduitRunPaths ?? {}) };
  delete conduitRunPaths[runId];

  return {
    ...diagram,
    conduitRuns: diagram.conduitRuns.filter((r) => r.id !== runId),
    layout: { ...diagram.layout, conduitRunPaths },
  };
}
