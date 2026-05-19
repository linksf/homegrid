import { HUB_SLOTS, isHubSlot, nearestHubSlot } from './hub-geometry';
import type { Diagram, Hub, HubSlot } from './types';

type LegacyHub = Hub & { u?: number; v?: number };

function firstFreeSlot(used: Set<HubSlot>): HubSlot | null {
  for (const slot of HUB_SLOTS) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

function takeSlot(used: Set<HubSlot>, preferred: HubSlot): HubSlot | null {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  const free = firstFreeSlot(used);
  if (free == null) return null;
  used.add(free);
  return free;
}

/** Migrates legacy u/v hubs to fixed slots (max four per junction box). */
export function normalizeHubSlots(diagram: Diagram): Diagram {
  const byBox = new Map<string, LegacyHub[]>();
  for (const hub of diagram.hubs as LegacyHub[]) {
    const list = byBox.get(hub.junctionBoxId) ?? [];
    list.push(hub);
    byBox.set(hub.junctionBoxId, list);
  }

  const hubs: Hub[] = [];

  for (const [, boxHubs] of byBox) {
    const used = new Set<HubSlot>();
    let placed = 0;

    for (const raw of boxHubs) {
      if (placed >= 4) break;

      let preferred: HubSlot;
      if (isHubSlot(raw.slot as number)) {
        preferred = raw.slot;
      } else if (typeof raw.u === 'number' && typeof raw.v === 'number') {
        preferred = nearestHubSlot(raw.u, raw.v);
      } else {
        const free = firstFreeSlot(used);
        if (free == null) break;
        preferred = free;
      }

      const slot = takeSlot(used, preferred);
      if (slot == null) break;

      hubs.push({
        id: raw.id,
        junctionBoxId: raw.junctionBoxId,
        label: raw.label ?? '',
        slot,
      });
      placed += 1;
    }
  }

  return { ...diagram, hubs };
}
