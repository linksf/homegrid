import {
  breakerCableClosed,
  directionForBreakerWire,
  isBreakerCable,
  isBreakerSeededWire,
} from './breaker-cable';
import {
  hubWirePairAllowed,
  switchConnectedSlots,
  dimmerConnectedSlots,
  outletConnectedSlots,
} from './continuity';
import { deviceNodesForDevice, wireIdsOnDeviceTerminal } from './device-node-geometry';
import type { Diagram, ResolvedWire, WireColor, WireDirection } from './types';

/** Matches `continuity.ts` conduit-run conductor pairing order. */
const CONDUIT_RUN_COLOR_ORDER: readonly WireColor[] = ['black', 'white', 'red'];

function conduitRunPairingAllowed(
  diagram: Diagram,
  run: Diagram['conduitRuns'][number],
): boolean {
  if (!run.cableIdB) return false;
  const cableA = diagram.cables.find((c) => c.id === run.cableIdA);
  const cableB = diagram.cables.find((c) => c.id === run.cableIdB);
  if (!cableA || !cableB) return false;
  if (isBreakerCable(cableA) && !breakerCableClosed(cableA)) return false;
  if (isBreakerCable(cableB) && !breakerCableClosed(cableB)) return false;
  return true;
}

function addConduitRunSameColorNeighbors(adj: Map<string, Neighbor[]>, diagram: Diagram): void {
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));

  for (const run of diagram.conduitRuns) {
    if (!conduitRunPairingAllowed(diagram, run) || !run.cableIdB) continue;

    const colorQueuesFromRun = (includeWire: (wire: Diagram['wires'][number]) => boolean): Map<
      WireColor,
      string[]
    > => {
      const qs = new Map<WireColor, string[]>();
      for (const c of CONDUIT_RUN_COLOR_ORDER) qs.set(c, []);
      for (const wid of run.wireIds) {
        const w = wireById.get(wid);
        if (!w || !includeWire(w)) continue;
        const q = qs.get(w.color) ?? [];
        q.push(wid);
        qs.set(w.color, q);
      }
      return qs;
    };

    const cableA = diagram.cables.find((c) => c.id === run.cableIdA);
    const cableB = diagram.cables.find((c) => c.id === run.cableIdB);
    if (!cableA || !cableB) continue;

    for (const color of CONDUIT_RUN_COLOR_ORDER) {
      const aw = colorQueuesFromRun((w) => w.cableId === cableA.id).get(color) ?? [];
      const bw = colorQueuesFromRun((w) => w.cableId === cableB.id).get(color) ?? [];
      const n = Math.min(aw.length, bw.length);
      for (let i = 0; i < n; i++) {
        const a = aw[i]!;
        const b = bw[i]!;
        addNeighbor(adj, a, b, true);
        addNeighbor(adj, b, a, true);
      }
    }
  }
}

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

  /**
   * Conduit-run same-conductor pairing inverts direction: each cable's exposed wire
   * polyline runs wall→interior, and the run joins them at their wall ends, so flow
   * leaves one box (toward) and enters the other (away).
   */
  addConduitRunSameColorNeighbors(adj, diagram);

  const byHub = new Map<string, string[]>();
  for (const w of diagram.wires) {
    if (!w.hubId) continue;
    if (!byHub.has(w.hubId)) byHub.set(w.hubId, []);
    byHub.get(w.hubId)!.push(w.id);
  }
  for (const ids of byHub.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!hubWirePairAllowed(diagram, ids[i]!, ids[j]!)) continue;
        addNeighbor(adj, ids[i]!, ids[j]!, true);
        addNeighbor(adj, ids[j]!, ids[i]!, true);
      }
    }
  }

  for (const bridge of diagram.hubBridges) {
    const a = byHub.get(bridge.hubIdA) ?? [];
    const b = byHub.get(bridge.hubIdB) ?? [];
    for (const wa of a) {
      for (const wb of b) {
        addNeighbor(adj, wa, wb, true);
        addNeighbor(adj, wb, wa, true);
      }
    }
  }

  /** Switches invert direction between connected terminals (in at one stub, out at the other). */
  for (const sw of diagram.switches) {
    const nodes = deviceNodesForDevice(diagram, 'switch', sw.id);
    const bySlot = new Map(nodes.map((n) => [n.slot, n]));
    for (const [slotA, slotB] of switchConnectedSlots(sw)) {
      const nodeA = bySlot.get(slotA);
      const nodeB = bySlot.get(slotB);
      if (!nodeA || !nodeB) continue;
      const wiresA = wireIdsOnDeviceTerminal(diagram, nodeA.id);
      const wiresB = wireIdsOnDeviceTerminal(diagram, nodeB.id);
      for (const wa of wiresA) {
        for (const wb of wiresB) {
          addNeighbor(adj, wa, wb, true);
          addNeighbor(adj, wb, wa, true);
        }
      }
    }
  }

  /** Dimmers invert direction like single-pole switches when on. */
  for (const dim of diagram.dimmerSwitches ?? []) {
    const nodes = deviceNodesForDevice(diagram, 'dimmerSwitch', dim.id);
    const bySlot = new Map(nodes.map((n) => [n.slot, n]));
    for (const [slotA, slotB] of dimmerConnectedSlots(dim)) {
      const nodeA = bySlot.get(slotA);
      const nodeB = bySlot.get(slotB);
      if (!nodeA || !nodeB) continue;
      const wiresA = wireIdsOnDeviceTerminal(diagram, nodeA.id);
      const wiresB = wireIdsOnDeviceTerminal(diagram, nodeB.id);
      for (const wa of wiresA) {
        for (const wb of wiresB) {
          addNeighbor(adj, wa, wb, true);
          addNeighbor(adj, wb, wa, true);
        }
      }
    }
  }

  /** Passthrough outlets carry flow through hot and neutral pairs without inverting. */
  for (const outlet of diagram.outlets ?? []) {
    if (!outlet.passthrough) continue;
    const nodes = deviceNodesForDevice(diagram, 'outlet', outlet.id);
    const bySlot = new Map(nodes.map((n) => [n.slot, n]));
    for (const [slotA, slotB] of outletConnectedSlots(outlet)) {
      const nodeA = bySlot.get(slotA);
      const nodeB = bySlot.get(slotB);
      if (!nodeA || !nodeB) continue;
      const wiresA = wireIdsOnDeviceTerminal(diagram, nodeA.id);
      const wiresB = wireIdsOnDeviceTerminal(diagram, nodeB.id);
      for (const wa of wiresA) {
        for (const wb of wiresB) {
          addNeighbor(adj, wa, wb, false);
          addNeighbor(adj, wb, wa, false);
        }
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

  for (const cable of diagram.cables) {
    if (!isBreakerCable(cable) || !breakerCableClosed(cable)) continue;
    for (const wireId of cable.wireIds) {
      const w = wireById.get(wireId);
      if (!w) continue;
      const dir = directionForBreakerWire(w.color);
      if (dir == null) continue;
      seedDir.set(wireId, dir);
      seedIsBreaker.set(wireId, true);
    }
  }

  for (const w of diagram.wires) {
    if (isBreakerSeededWire(diagram, w)) {
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
    const conflictWires = new Set<string>();

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
        conflictWires.add(id);
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
          conflictWires.add(u);
          conflictWires.add(v);
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
        directionConflict: conflictWires.has(id),
      });
    }
  };

  for (const w of diagram.wires) {
    visitComponent(w.id);
  }

  return out;
}
