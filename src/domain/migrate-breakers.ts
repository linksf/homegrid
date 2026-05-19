import { anchorPoint } from './anchors';
import { conduitStubPath } from './orthogonal-path';
import { nanoid } from 'nanoid';
import type { AnchorPosition, BreakerConduit, Diagram, JunctionBox } from './types';

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

function outwardNormal(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number } {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pt = anchorPoint(box, anchor);
  const vx = pt.x - center.x;
  const vy = pt.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
}

/** Converts legacy `breakers[]` entries into `kind: 'breaker'` conduits. */
export function migrateLegacyBreakers(diagram: Diagram): Diagram {
  if (diagram.breakers.length === 0) {
    return diagram;
  }

  const conduits = [...diagram.conduits];
  const conduitPaths = { ...diagram.layout.conduitPaths };
  const wires = diagram.wires.map((w) => ({ ...w }));
  let anchorIdx = conduits.filter((c) => c.kind === 'breaker').length;

  for (const legacy of diagram.breakers) {
    const box = diagram.junctionBoxes.find((j) => j.id === legacy.junctionBoxId);
    if (!box) continue;

    const black = wires.find((w) => w.id === legacy.blackWireId);
    const white = wires.find((w) => w.id === legacy.whiteWireId);
    if (!black || !white) continue;

    if (black.conduitId != null) {
      const existing = conduits.find((c) => c.id === black.conduitId);
      if (existing?.kind === 'breaker') continue;
    }

    const anchor = MIGRATION_ANCHORS[anchorIdx % MIGRATION_ANCHORS.length]!;
    anchorIdx += 1;

    const conduitId = nanoid();
    black.conduitId = conduitId;
    black.breakerId = null;
    black.manualDirection = null;
    white.conduitId = conduitId;
    white.breakerId = null;
    white.manualDirection = null;

    const conduit: BreakerConduit = {
      id: conduitId,
      kind: 'breaker',
      label: legacy.label ?? '',
      junctionBoxId: legacy.junctionBoxId,
      anchor,
      wireIds: [black.id, white.id],
    };
    conduits.push(conduit);

    const start = anchorPoint(box, anchor);
    const norm = outwardNormal(box, anchor);
    const stubLength = 140;
    conduitPaths[conduitId] = { points: conduitStubPath(start, norm, stubLength) };
  }

  return {
    ...diagram,
    breakers: [],
    conduits,
    wires,
    layout: { ...diagram.layout, conduitPaths },
  };
}
