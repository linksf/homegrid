import { breakerCableClosed, isBreakerCable } from './breaker-cable';
import {
  dimmerConnectedSlots,
  hubWirePairAllowed,
  outletConnectedSlots,
  switchConnectedSlots,
} from './continuity';
import { deviceNodesForDevice, wireIdsOnDeviceTerminal } from './device-node-geometry';
import type { Diagram, WireColor } from './types';

/** Matches `continuity.ts` conduit-run conductor pairing order. */
const CONDUIT_RUN_COLOR_ORDER: readonly WireColor[] = ['black', 'white', 'red'];

export type WireFlowNeighbor = { wireId: string; flip: boolean };

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

function addNeighbor(adj: Map<string, WireFlowNeighbor[]>, from: string, to: string, flip: boolean): void {
  if (!adj.has(from)) adj.set(from, []);
  adj.get(from)!.push({ wireId: to, flip });
}

function addConduitRunSameColorNeighbors(adj: Map<string, WireFlowNeighbor[]>, diagram: Diagram): void {
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

/** Undirected wire connectivity with direction-flip semantics for flow propagation. */
export function buildWireFlowAdjacency(diagram: Diagram): Map<string, WireFlowNeighbor[]> {
  const adj = new Map<string, WireFlowNeighbor[]>();

  for (const w of diagram.wires) {
    if (!adj.has(w.id)) adj.set(w.id, []);
  }

  for (const link of diagram.wireLinks) {
    addNeighbor(adj, link.wireIdA, link.wireIdB, true);
    addNeighbor(adj, link.wireIdB, link.wireIdA, true);
  }

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

  return adj;
}
