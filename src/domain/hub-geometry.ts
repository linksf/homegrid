import { anchorPoint } from './anchors';
import { GRID_SIZE, HUB_DIAMOND_OFFSET, snapGridCoord } from './grid';
import { resolveWirePath } from './wire-routing';
import type { Diagram, Hub, HubSlot, JunctionBox, Wire } from './types';

export const HUB_SLOT_COUNT = 4;

export const HUB_SLOTS: HubSlot[] = [0, 1, 2, 3];

export function isHubSlot(n: number): n is HubSlot {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

function hubDiamondOffset(box: Pick<JunctionBox, 'width' | 'height'>): number {
  const maxFromWidth = Math.floor((box.width - GRID_SIZE * 2) / 2 / GRID_SIZE) * GRID_SIZE;
  const maxFromHeight = Math.floor((box.height - GRID_SIZE * 2) / 2 / GRID_SIZE) * GRID_SIZE;
  const max = Math.min(maxFromWidth, maxFromHeight);
  return Math.max(GRID_SIZE, Math.min(HUB_DIAMOND_OFFSET, max));
}

/** Grid-aligned hub positions in a diamond around the box center (top, right, bottom, left). */
export function hubSlotWorldPoint(
  box: Pick<JunctionBox, 'x' | 'y' | 'width' | 'height'>,
  slot: HubSlot,
): { x: number; y: number } {
  const cx = snapGridCoord(box.x + box.width / 2);
  const cy = snapGridCoord(box.y + box.height / 2);
  const d = hubDiamondOffset(box);
  switch (slot) {
    case 0:
      return { x: cx, y: cy - d };
    case 1:
      return { x: cx + d, y: cy };
    case 2:
      return { x: cx, y: cy + d };
    case 3:
      return { x: cx - d, y: cy };
    default:
      return { x: cx, y: cy - d };
  }
}

export function hubWorldPoint(box: JunctionBox, hub: Hub): { x: number; y: number } {
  return hubSlotWorldPoint(box, hub.slot);
}

/** Normalized diamond positions for legacy u/v hub migration. */
export const HUB_SLOT_POSITIONS = {
  0: { u: 0.5, v: 0 },
  1: { u: 1, v: 0.5 },
  2: { u: 0.5, v: 1 },
  3: { u: 0, v: 0.5 },
} as const;

export function hubById(diagram: Diagram, hubId: string): Hub | undefined {
  return diagram.hubs.find((h) => h.id === hubId);
}

/**
 * Wires tied to this hub by the Connect tool (not created as part of a hub conduit stub bundle).
 * Hub conduit wires share `hubId` but are excluded so multiple conductors can stub from one hub.
 */
export function wiresDirectAttachedToHub(diagram: Diagram, hubId: string): Wire[] {
  return diagram.wires.filter((w) => {
    if (w.hubId !== hubId) return false;
    if (!w.conduitId) return true;
    const conduit = diagram.conduits.find((c) => c.id === w.conduitId);
    return !(conduit?.kind === 'hub' && conduit.hubId === hubId);
  });
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

  if (conduit.kind === 'local') {
    return conduit.junctionBoxId;
  }

  if ((conduit as { kind: string }).kind === 'breaker') {
    return (conduit as unknown as { junctionBoxId: string }).junctionBoxId;
  }

  if (conduit.kind === 'span') {
    const boxA = diagram.junctionBoxes.find((j) => j.id === conduit.junctionBoxIdA);
    const boxB = diagram.junctionBoxes.find((j) => j.id === conduit.junctionBoxIdB);
    const path = resolveWirePath(diagram, wireId);
    if (!path || path.length < 2 || !boxA || !boxB) return null;

    const anchorA = anchorPoint(boxA, conduit.anchorA);
    const anchorB = anchorPoint(boxB, conduit.anchorB);
    const start = path[0]!;
    const distA = Math.hypot(start.x - anchorA.x, start.y - anchorA.y);
    const distB = Math.hypot(start.x - anchorB.x, start.y - anchorB.y);
    return distA <= distB ? conduit.junctionBoxIdA : conduit.junctionBoxIdB;
  }

  return null;
}
