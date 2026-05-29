import { breakerCableClosed, isBreakerCable } from './breaker-cable';
import {
  conduitsOnDeviceNode,
  deviceNodeById,
  deviceNodesForDevice,
} from './device-node-geometry';
import type {
  DeviceNode,
  Diagram,
  DimmerSwitch,
  DimmerSwitchPosition,
  FourWaySwitchPosition,
  Outlet,
  SinglePoleSwitchPosition,
  Switch,
  SwitchPosition,
  SwitchTerminalCount,
  ThreeWaySwitchPosition,
  Wire,
  WireColor,
} from './types';

export type { FourWaySwitchPosition, SinglePoleSwitchPosition, ThreeWaySwitchPosition, DimmerSwitchPosition };

export type ContinuityKey = `w:${string}` | `t:${string}`;

export function wireContinuityKey(wireId: string): ContinuityKey {
  return `w:${wireId}`;
}

export function terminalContinuityKey(nodeId: string): ContinuityKey {
  return `t:${nodeId}`;
}

export function switchTerminalCount(value: Switch | SwitchTerminalCount): SwitchTerminalCount {
  const n = typeof value === 'number' ? value : value.terminalCount;
  if (n === 4) return 4;
  if (n === 3) return 3;
  return 2;
}

export function defaultSwitchPosition(terminalCount: SwitchTerminalCount): SwitchPosition {
  if (terminalCount === 4) return 'straight';
  if (terminalCount === 3) return 'travelerA';
  return 'open';
}

export function normalizeSwitchPosition(sw: Switch): SwitchPosition {
  const terminalCount = switchTerminalCount(sw);
  if (terminalCount === 4) {
    return sw.position === 'cross' ? 'cross' : 'straight';
  }
  if (terminalCount === 3) {
    return sw.position === 'travelerB' ? 'travelerB' : 'travelerA';
  }
  return sw.position === 'closed' ? 'closed' : 'open';
}

export function toggleSwitchPosition(sw: Switch): SwitchPosition {
  const position = normalizeSwitchPosition(sw);
  const terminalCount = switchTerminalCount(sw);
  if (terminalCount === 4) {
    return position === 'straight' ? 'cross' : 'straight';
  }
  if (terminalCount === 3) {
    return position === 'travelerA' ? 'travelerB' : 'travelerA';
  }
  return position === 'closed' ? 'open' : 'closed';
}

/** Slot pairs electrically connected inside a switch for its current position. */
export function switchConnectedSlots(sw: Switch): [number, number][] {
  const position = normalizeSwitchPosition(sw);
  const terminalCount = switchTerminalCount(sw);
  if (terminalCount === 4) {
    return position === 'cross'
      ? [
          [0, 3],
          [1, 2],
        ]
      : [
          [0, 2],
          [1, 3],
        ];
  }
  if (terminalCount === 3) {
    return position === 'travelerB' ? [[0, 2]] : [[0, 1]];
  }
  return position === 'closed' ? [[0, 1]] : [];
}

export function defaultDimmerPosition(): DimmerSwitchPosition {
  return 'off';
}

export function defaultDimmerLevel(): number {
  return 0;
}

export function normalizeDimmerPosition(dim: DimmerSwitch): DimmerSwitchPosition {
  return normalizeDimmerLevel(dim) > 0 ? 'on' : 'off';
}

/** Dimmer output level from 0 (off) to 100 (full). */
export function normalizeDimmerLevel(dim: DimmerSwitch): number {
  if (typeof dim.level === 'number' && Number.isFinite(dim.level)) {
    return Math.max(0, Math.min(100, Math.round(dim.level)));
  }
  return dim.position === 'on' ? 100 : 0;
}

export function toggleDimmerPosition(dim: DimmerSwitch): DimmerSwitchPosition {
  return normalizeDimmerPosition(dim) === 'on' ? 'off' : 'on';
}

export function toggleDimmerLevel(dim: DimmerSwitch): number {
  return normalizeDimmerLevel(dim) > 0 ? 0 : 100;
}

/** Slot pairs electrically connected inside a dimmer for its current level. */
export function dimmerConnectedSlots(dim: DimmerSwitch): [number, number][] {
  return normalizeDimmerLevel(dim) > 0 ? [[0, 1]] : [];
}

/** Slot pairs electrically connected inside a passthrough outlet. */
export function outletConnectedSlots(outlet: Outlet): [number, number][] {
  if (!outlet.passthrough) return [];
  return [
    [0, 1],
    [2, 3],
  ];
}

/** Device terminal reached by a wire (direct attachment or device-conduit stub). */
export function deviceTerminalNodeForWire(diagram: Diagram, wireId: string): DeviceNode | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return null;
  if (wire.deviceNodeId) {
    return deviceNodeById(diagram, wire.deviceNodeId) ?? null;
  }
  if (wire.conduitId) {
    const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
    if (conduit?.kind === 'device') {
      return deviceNodeById(diagram, conduit.deviceNodeId) ?? null;
    }
  }
  return null;
}

function deviceInternallyConnectsSlots(
  diagram: Diagram,
  deviceKind: DeviceNode['deviceKind'],
  deviceId: string,
  slotA: number,
  slotB: number,
): boolean {
  if (slotA === slotB) return true;

  if (deviceKind === 'switch') {
    const sw = diagram.switches.find((s) => s.id === deviceId);
    if (!sw) return true;
    return switchConnectedSlots(sw).some(
      ([a, b]) => (a === slotA && b === slotB) || (a === slotB && b === slotA),
    );
  }

  if (deviceKind === 'dimmerSwitch') {
    const dim = diagram.dimmerSwitches?.find((d) => d.id === deviceId);
    if (!dim) return true;
    return dimmerConnectedSlots(dim).some(
      ([a, b]) => (a === slotA && b === slotB) || (a === slotB && b === slotA),
    );
  }

  if (deviceKind === 'outlet') {
    const outlet = diagram.outlets?.find((o) => o.id === deviceId);
    if (!outlet) return true;
    return outletConnectedSlots(outlet).some(
      ([a, b]) => (a === slotA && b === slotB) || (a === slotB && b === slotA),
    );
  }

  // Light-bulb filament always ties both terminals.
  return true;
}

/** Hub splices must not bridge switch/dimmer terminals; use the device internal path instead. */
export function hubWirePairAllowed(diagram: Diagram, wireIdA: string, wireIdB: string): boolean {
  const nodeA = deviceTerminalNodeForWire(diagram, wireIdA);
  const nodeB = deviceTerminalNodeForWire(diagram, wireIdB);
  if (!nodeA || !nodeB) return true;
  if (nodeA.deviceKind !== nodeB.deviceKind || nodeA.deviceId !== nodeB.deviceId) return true;
  if (nodeA.slot === nodeB.slot) return true;

  if (nodeA.deviceKind === 'switch' || nodeA.deviceKind === 'dimmerSwitch') {
    return false;
  }

  return deviceInternallyConnectsSlots(
    diagram,
    nodeA.deviceKind,
    nodeA.deviceId,
    nodeA.slot,
    nodeB.slot,
  );
}

class UnionFind {
  private parent = new Map<string, string>();

  find(key: string): string {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
    let root = this.parent.get(key)!;
    while (root !== this.parent.get(root)) {
      root = this.parent.get(root)!;
    }
    let current = key;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(rb, ra);
    }
  }
}

/** Matches `conduit-run-mutations` conductor pairing order. */
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

function unionSameColorAcrossConduitRun(diagram: Diagram, run: Diagram['conduitRuns'][number], uf: UnionFind): void {
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));

  const colorQueuesFromRun = (includeWire: (w: Wire) => boolean): Map<
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

  function pairAndUnion(qa: Map<WireColor, string[]>, qb: Map<WireColor, string[]>): void {
    for (const color of CONDUIT_RUN_COLOR_ORDER) {
      const aw = qa.get(color) ?? [];
      const bw = qb.get(color) ?? [];
      const n = Math.min(aw.length, bw.length);
      for (let i = 0; i < n; i++) {
        uf.union(wireContinuityKey(aw[i]!), wireContinuityKey(bw[i]!));
      }
    }
  }

  if (run.cableIdB) {
    if (!conduitRunPairingAllowed(diagram, run)) return;
    const cableA = diagram.cables.find((c) => c.id === run.cableIdA);
    const cableB = diagram.cables.find((c) => c.id === run.cableIdB);
    if (!cableA || !cableB) return;
    pairAndUnion(
      colorQueuesFromRun((w) => w.cableId === cableA.id),
      colorQueuesFromRun((w) => w.cableId === cableB.id),
    );
  }
}

export function buildContinuityFinder(diagram: Diagram): UnionFind {
  const uf = new UnionFind();

  for (const wire of diagram.wires) {
    uf.find(wireContinuityKey(wire.id));
  }
  for (const node of diagram.deviceNodes) {
    uf.find(terminalContinuityKey(node.id));
  }

  for (const wire of diagram.wires) {
    if (!wire.hubId) continue;
    for (const other of diagram.wires) {
      if (other.id === wire.id || other.hubId !== wire.hubId) continue;
      if (!hubWirePairAllowed(diagram, wire.id, other.id)) continue;
      uf.union(wireContinuityKey(wire.id), wireContinuityKey(other.id));
    }
  }

  const hubWireIds = new Map<string, string[]>();
  for (const wire of diagram.wires) {
    if (!wire.hubId) continue;
    if (!hubWireIds.has(wire.hubId)) hubWireIds.set(wire.hubId, []);
    hubWireIds.get(wire.hubId)!.push(wire.id);
  }

  for (const bridge of diagram.hubBridges) {
    const a = hubWireIds.get(bridge.hubIdA) ?? [];
    const b = hubWireIds.get(bridge.hubIdB) ?? [];
    for (const wa of a) {
      for (const wb of b) {
        uf.union(wireContinuityKey(wa), wireContinuityKey(wb));
      }
    }
  }

  for (const link of diagram.wireLinks) {
    uf.union(wireContinuityKey(link.wireIdA), wireContinuityKey(link.wireIdB));
  }

  for (const run of diagram.conduitRuns) {
    unionSameColorAcrossConduitRun(diagram, run, uf);
  }

  for (const wire of diagram.wires) {
    if (!wire.deviceNodeId) continue;
    uf.union(wireContinuityKey(wire.id), terminalContinuityKey(wire.deviceNodeId));
  }

  for (const conduit of diagram.conduits) {
    if (conduit.kind !== 'device') continue;
    const terminalKey = terminalContinuityKey(conduit.deviceNodeId);
    for (const wireId of conduit.wireIds) {
      uf.union(wireContinuityKey(wireId), terminalKey);
    }
  }

  for (const bulb of diagram.lightBulbs) {
    const nodes = deviceNodesForDevice(diagram, 'lightBulb', bulb.id);
    if (nodes.length >= 2) {
      uf.union(terminalContinuityKey(nodes[0]!.id), terminalContinuityKey(nodes[1]!.id));
    }
  }

  for (const sw of diagram.switches) {
    const nodes = deviceNodesForDevice(diagram, 'switch', sw.id);
    const bySlot = new Map(nodes.map((n) => [n.slot, n]));
    for (const [a, b] of switchConnectedSlots(sw)) {
      const na = bySlot.get(a);
      const nb = bySlot.get(b);
      if (na && nb) {
        uf.union(terminalContinuityKey(na.id), terminalContinuityKey(nb.id));
      }
    }
  }

  for (const dim of diagram.dimmerSwitches ?? []) {
    const nodes = deviceNodesForDevice(diagram, 'dimmerSwitch', dim.id);
    const bySlot = new Map(nodes.map((n) => [n.slot, n]));
    for (const [a, b] of dimmerConnectedSlots(dim)) {
      const na = bySlot.get(a);
      const nb = bySlot.get(b);
      if (na && nb) {
        uf.union(terminalContinuityKey(na.id), terminalContinuityKey(nb.id));
      }
    }
  }

  for (const outlet of diagram.outlets ?? []) {
    const nodes = deviceNodesForDevice(diagram, 'outlet', outlet.id);
    const bySlot = new Map(nodes.map((n) => [n.slot, n]));
    for (const [a, b] of outletConnectedSlots(outlet)) {
      const na = bySlot.get(a);
      const nb = bySlot.get(b);
      if (na && nb) {
        uf.union(terminalContinuityKey(na.id), terminalContinuityKey(nb.id));
      }
    }
  }

  return uf;
}

export function areContinuityKeysConnected(
  diagram: Diagram,
  a: ContinuityKey,
  b: ContinuityKey,
): boolean {
  const uf = buildContinuityFinder(diagram);
  return uf.find(a) === uf.find(b);
}

export function areWiresConnected(diagram: Diagram, wireIdA: string, wireIdB: string): boolean {
  return areContinuityKeysConnected(
    diagram,
    wireContinuityKey(wireIdA),
    wireContinuityKey(wireIdB),
  );
}

function breakerSeedGroups(diagram: Diagram, uf: UnionFind): { hot: Set<string>; neutral: Set<string> } {
  const hot = new Set<string>();
  const neutral = new Set<string>();

  for (const breaker of diagram.breakers) {
    hot.add(uf.find(wireContinuityKey(breaker.blackWireId)));
    neutral.add(uf.find(wireContinuityKey(breaker.whiteWireId)));
  }

  for (const cable of diagram.cables) {
    if (!isBreakerCable(cable) || !breakerCableClosed(cable)) continue;
    for (const wireId of cable.wireIds) {
      const wire = diagram.wires.find((w) => w.id === wireId);
      if (!wire) continue;
      if (wire.color === 'black' || wire.color === 'red') hot.add(uf.find(wireContinuityKey(wireId)));
      if (wire.color === 'white') neutral.add(uf.find(wireContinuityKey(wireId)));
    }
  }

  return { hot, neutral };
}

function terminalNetworkGroups(diagram: Diagram, nodeId: string, uf: UnionFind): Set<string> {
  const groups = new Set<string>();
  groups.add(uf.find(terminalContinuityKey(nodeId)));
  for (const conduit of conduitsOnDeviceNode(diagram, nodeId)) {
    for (const wireId of conduit.wireIds) {
      groups.add(uf.find(wireContinuityKey(wireId)));
    }
  }
  return groups;
}

/** True when hot and neutral reach opposite bulb terminals through the wiring graph. */
export function isLightBulbLit(diagram: Diagram, bulbId: string): boolean {
  return lightBulbBrightness(diagram, bulbId) > 0;
}

/**
 * Brightness from 0–100 for a bulb on a complete hot/neutral circuit.
 * Dimmers in series on the hot leg scale output; multiple dimmers use the minimum level.
 */
export function lightBulbBrightness(diagram: Diagram, bulbId: string): number {
  const nodes = deviceNodesForDevice(diagram, 'lightBulb', bulbId);
  if (nodes.length < 2) return 0;

  const uf = buildContinuityFinder(diagram);
  const { hot, neutral } = breakerSeedGroups(diagram, uf);
  if (hot.size === 0 || neutral.size === 0) return 0;

  const leftGroups = terminalNetworkGroups(diagram, nodes[0]!.id, uf);
  const rightGroups = terminalNetworkGroups(diagram, nodes[1]!.id, uf);

  const leftHot = [...leftGroups].some((g) => hot.has(g));
  const leftNeutral = [...leftGroups].some((g) => neutral.has(g));
  const rightHot = [...rightGroups].some((g) => hot.has(g));
  const rightNeutral = [...rightGroups].some((g) => neutral.has(g));

  const energized = (leftHot && rightNeutral) || (leftNeutral && rightHot);
  if (!energized) return 0;

  const hotTerminalId =
    leftHot && rightNeutral
      ? nodes[0]!.id
      : leftNeutral && rightHot
        ? nodes[1]!.id
        : leftHot
          ? nodes[0]!.id
          : nodes[1]!.id;
  const hotPathGroups = terminalNetworkGroups(diagram, hotTerminalId, uf);

  const dimmerLevels: number[] = [];
  for (const dim of diagram.dimmerSwitches ?? []) {
    const level = normalizeDimmerLevel(dim);
    if (level <= 0) continue;

    const dimNodes = deviceNodesForDevice(diagram, 'dimmerSwitch', dim.id);
    const line = dimNodes.find((n) => n.slot === 0);
    const load = dimNodes.find((n) => n.slot === 1);
    if (!line || !load) continue;

    const lineGroup = uf.find(terminalContinuityKey(line.id));
    const loadGroup = uf.find(terminalContinuityKey(load.id));
    if (lineGroup !== loadGroup) continue;

    if ([...hotPathGroups].some((g) => g === lineGroup)) {
      dimmerLevels.push(level);
    }
  }

  if (dimmerLevels.length === 0) return 100;
  return Math.min(...dimmerLevels);
}

/** True when hot and neutral reach the outlet's hot and neutral terminals. */
export function isOutletEnergized(diagram: Diagram, outletId: string): boolean {
  const nodes = deviceNodesForDevice(diagram, 'outlet', outletId);
  const hotNode = nodes.find((n) => n.slot === 0);
  const neutralNode = nodes.find((n) => n.slot === 1);
  if (!hotNode || !neutralNode) return false;

  const uf = buildContinuityFinder(diagram);
  const { hot, neutral } = breakerSeedGroups(diagram, uf);
  if (hot.size === 0 || neutral.size === 0) return false;

  const hotGroups = terminalNetworkGroups(diagram, hotNode.id, uf);
  const neutralGroups = terminalNetworkGroups(diagram, neutralNode.id, uf);

  const hasHot = [...hotGroups].some((g) => hot.has(g));
  const hasNeutral = [...neutralGroups].some((g) => neutral.has(g));
  return hasHot && hasNeutral;
}
