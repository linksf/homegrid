import type { Diagram, Hub, HubSlot, JunctionBox } from './types';

export const HUB_SLOT_COUNT = 4;

/** Normalized positions for the four hub nodes inside a junction box. */
export const HUB_SLOT_POSITIONS: Record<HubSlot, { u: number; v: number }> = {
  0: { u: 0.28, v: 0.32 },
  1: { u: 0.72, v: 0.32 },
  2: { u: 0.28, v: 0.68 },
  3: { u: 0.72, v: 0.68 },
};

export const HUB_SLOTS: HubSlot[] = [0, 1, 2, 3];

export function isHubSlot(n: number): n is HubSlot {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

export function hubWorldPoint(box: JunctionBox, hub: Hub): { x: number; y: number } {
  const pos = HUB_SLOT_POSITIONS[hub.slot];
  return {
    x: box.x + pos.u * box.width,
    y: box.y + pos.v * box.height,
  };
}

export function hubSlotWorldPoint(box: JunctionBox, slot: HubSlot): { x: number; y: number } {
  const pos = HUB_SLOT_POSITIONS[slot];
  return {
    x: box.x + pos.u * box.width,
    y: box.y + pos.v * box.height,
  };
}

export function hubById(diagram: Diagram, hubId: string): Hub | undefined {
  return diagram.hubs.find((h) => h.id === hubId);
}

export function hubsOnJunctionBox(diagram: Diagram, junctionBoxId: string): Hub[] {
  return diagram.hubs.filter((h) => h.junctionBoxId === junctionBoxId);
}

export function occupiedHubSlots(diagram: Diagram, junctionBoxId: string): Set<HubSlot> {
  const used = new Set<HubSlot>();
  for (const hub of hubsOnJunctionBox(diagram, junctionBoxId)) {
    used.add(hub.slot);
  }
  return used;
}

export function firstAvailableHubSlot(diagram: Diagram, junctionBoxId: string): HubSlot | null {
  const used = occupiedHubSlots(diagram, junctionBoxId);
  for (const slot of HUB_SLOTS) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

/** Pick the nearest slot for legacy hubs that only stored u/v. */
export function nearestHubSlot(u: number, v: number): HubSlot {
  let best: HubSlot = 0;
  let bestDist = Infinity;
  for (const slot of HUB_SLOTS) {
    const pos = HUB_SLOT_POSITIONS[slot];
    const d = (pos.u - u) ** 2 + (pos.v - v) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = slot;
    }
  }
  return best;
}

export function junctionBoxForWire(diagram: Diagram, wireId: string): string | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return null;

  if (wire.breakerId) {
    const br = diagram.breakers.find((b) => b.id === wire.breakerId);
    return br?.junctionBoxId ?? null;
  }

  if (!wire.conduitId) return null;
  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit) return null;

  if (conduit.kind === 'local' || conduit.kind === 'breaker') {
    return conduit.junctionBoxId;
  }

  if (conduit.kind !== 'span') {
    return null;
  }

  const path = diagram.layout.conduitPaths[conduit.id]?.points;
  if (!path || path.length < 2) return null;

  const wireIdx = conduit.wireIds.indexOf(wireId);
  if (wireIdx < 0) return null;

  const nearStart =
    Math.hypot(path[0]!.x - path[1]!.x, path[0]!.y - path[1]!.y) > 0
      ? wireIdx < conduit.wireIds.length / 2
      : true;

  return nearStart ? conduit.junctionBoxIdA : conduit.junctionBoxIdB;
}
