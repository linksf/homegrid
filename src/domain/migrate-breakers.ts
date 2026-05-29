import { nanoid } from 'nanoid';
import { refreshCablePaths } from './cable-geometry';
import type { AnchorPosition, Cable, Diagram } from './types';

const MIGRATION_ANCHORS: AnchorPosition[] = [
  'middle-left',
  'center',
  'middle-right',
  'top-center',
  'bottom-center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

/** Converts legacy `breakers[]` entries into breaker-type `Cable`s. */
export function migrateLegacyBreakers(diagram: Diagram): Diagram {
  if (diagram.breakers.length === 0) {
    return diagram;
  }

  let next = diagram;
  let anchorIdx = next.cables.filter((c) => c.role === 'breaker').length;

  for (const legacy of diagram.breakers) {
    const box = next.junctionBoxes.find((j) => j.id === legacy.junctionBoxId);
    if (!box) continue;

    const black = next.wires.find((w) => w.id === legacy.blackWireId);
    const white = next.wires.find((w) => w.id === legacy.whiteWireId);
    if (!black || !white) continue;

    if (black.cableId != null) {
      const existing = next.cables.find((c) => c.id === black.cableId);
      if (existing?.role === 'breaker') continue;
    }

    const anchor = MIGRATION_ANCHORS[anchorIdx % MIGRATION_ANCHORS.length]!;
    anchorIdx += 1;

    const cableId = nanoid();
    const cable: Cable = {
      id: cableId,
      junctionBoxId: legacy.junctionBoxId,
      anchor,
      wireIds: [black.id, white.id],
      role: 'breaker',
      closed: true,
      label: legacy.label || undefined,
    };

    next = {
      ...next,
      cables: [...next.cables, cable],
      wires: next.wires.map((w) => {
        if (w.id !== black.id && w.id !== white.id) return w;
        return {
          ...w,
          cableId,
          conduitId: null,
          breakerId: null,
          manualDirection: null,
        };
      }),
    };
  }

  next = { ...next, breakers: [] };
  next = refreshCablePaths(next);
  return next;
}
