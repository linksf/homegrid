import { directionForBreakerWire, isBreakerConduit } from './breaker-conduit';
import type { Diagram, ResolvedWire, WireDirection } from './types';

type DirectionSource = ResolvedWire['directionSource'];

type Neighbor = { wireId: string; flip: boolean };

function oppositeDirection(d: WireDirection): WireDirection {
  return d === 'away' ? 'toward' : 'away';
}

function addNeighbor(adj: Map<string, Neighbor[]>, from: string, to: string, flip: boolean) {
  if (!adj.has(from)) adj.set(from, []);
  adj.get(from)!.push({ wireId: to, flip });
}

export function resolveDirections(diagram: Diagram): Map<string, ResolvedWire> {
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));
  const adj = new Map<string, Neighbor[]>();

  for (const w of diagram.wires) {
    if (!adj.has(w.id)) adj.set(w.id, []);
  }

  /** Wire-to-wire splices invert direction (each wire's polyline runs out from its junction). */
  for (const link of diagram.wireLinks) {
    addNeighbor(adj, link.wireIdA, link.wireIdB, true);
    addNeighbor(adj, link.wireIdB, link.wireIdA, true);
  }

  const byHub = new Map<string, string[]>();
  for (const w of diagram.wires) {
    if (!w.hubId) continue;
    if (!byHub.has(w.hubId)) byHub.set(w.hubId, []);
    byHub.get(w.hubId)!.push(w.id);
  }
  for (const ids of byHub.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addNeighbor(adj, ids[i]!, ids[j]!, false);
        addNeighbor(adj, ids[j]!, ids[i]!, false);
      }
    }
  }

  for (const bridge of diagram.hubBridges) {
    const a = byHub.get(bridge.hubIdA) ?? [];
    const b = byHub.get(bridge.hubIdB) ?? [];
    for (const wa of a) {
      for (const wb of b) {
        addNeighbor(adj, wa, wb, false);
        addNeighbor(adj, wb, wa, false);
      }
    }
  }

  const seedDir = new Map<string, WireDirection>();
  const seedIsBreaker = new Map<string, boolean>();

  for (const b of diagram.breakers) {
    seedDir.set(b.blackWireId, 'away');
    seedIsBreaker.set(b.blackWireId, true);
    seedDir.set(b.whiteWireId, 'toward');
    seedIsBreaker.set(b.whiteWireId, true);
  }

  for (const conduit of diagram.conduits) {
    if (!isBreakerConduit(conduit)) continue;
    for (const wireId of conduit.wireIds) {
      const w = wireById.get(wireId);
      if (!w) continue;
      const dir = directionForBreakerWire(w.color);
      if (dir == null) continue;
      seedDir.set(wireId, dir);
      seedIsBreaker.set(wireId, true);
    }
  }

  for (const w of diagram.wires) {
    if (w.breakerId != null) {
      continue;
    }
    if (diagram.conduits.some((c) => c.id === w.conduitId && isBreakerConduit(c))) {
      continue;
    }
    if (w.manualDirection != null) {
      seedDir.set(w.id, w.manualDirection);
      seedIsBreaker.set(w.id, false);
    }
  }

  const visited = new Set<string>();
  const out = new Map<string, ResolvedWire>();

  for (const w of diagram.wires) {
    out.set(w.id, {
      ...w,
      resolvedDirection: null,
      directionConflict: false,
      directionSource: null,
    });
  }

  const visitComponent = (start: string) => {
    if (visited.has(start)) {
      return;
    }
    const comp: string[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const { wireId: v } of adj.get(u) ?? []) {
        if (!visited.has(v)) {
          visited.add(v);
          stack.push(v);
        }
      }
    }

    const assignedDir = new Map<string, WireDirection>();
    const assignedSource = new Map<string, DirectionSource>();
    let conflict = false;

    for (const id of comp) {
      const d = seedDir.get(id);
      if (d === undefined) {
        continue;
      }
      const prev = assignedDir.get(id);
      const src: DirectionSource = seedIsBreaker.get(id) ? 'breaker' : 'manual';
      if (prev === undefined) {
        assignedDir.set(id, d);
        assignedSource.set(id, src);
      } else if (prev !== d) {
        conflict = true;
      }
    }

    const queue = [...assignedDir.keys()];
    let i = 0;
    while (i < queue.length) {
      const u = queue[i++]!;
      const du = assignedDir.get(u)!;
      for (const { wireId: v, flip } of adj.get(u) ?? []) {
        const dv = flip ? oppositeDirection(du) : du;
        if (!assignedDir.has(v)) {
          assignedDir.set(v, dv);
          assignedSource.set(v, 'propagated');
          queue.push(v);
        } else if (assignedDir.get(v)! !== dv) {
          conflict = true;
        }
      }
    }

    for (const id of comp) {
      const w = wireById.get(id);
      if (!w) {
        continue;
      }
      const rd = assignedDir.get(id) ?? null;
      const rs = assignedSource.get(id) ?? null;
      out.set(id, {
        ...w,
        resolvedDirection: rd,
        directionSource: rs,
        directionConflict: conflict,
      });
    }
  };

  for (const w of diagram.wires) {
    visitComponent(w.id);
  }

  return out;
}
