import type { Diagram, ResolvedWire, WireDirection } from './types';

type DirectionSource = ResolvedWire['directionSource'];

export function resolveDirections(diagram: Diagram): Map<string, ResolvedWire> {
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));
  const adj = new Map<string, Set<string>>();

  const linkNeighbor = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const w of diagram.wires) {
    if (!adj.has(w.id)) adj.set(w.id, new Set());
  }
  for (const link of diagram.wireLinks) {
    linkNeighbor(link.wireIdA, link.wireIdB);
  }

  const seedDir = new Map<string, WireDirection>();
  const seedIsBreaker = new Map<string, boolean>();

  for (const b of diagram.breakers) {
    seedDir.set(b.blackWireId, 'away');
    seedIsBreaker.set(b.blackWireId, true);
    seedDir.set(b.whiteWireId, 'toward');
    seedIsBreaker.set(b.whiteWireId, true);
  }

  for (const w of diagram.wires) {
    if (w.breakerId != null) {
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
      for (const v of adj.get(u) ?? []) {
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
      for (const v of adj.get(u) ?? []) {
        if (!assignedDir.has(v)) {
          assignedDir.set(v, du);
          assignedSource.set(v, 'propagated');
          queue.push(v);
        } else if (assignedDir.get(v)! !== du) {
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
