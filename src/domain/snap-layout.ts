import { LIGHT_BULB_RADIUS } from './device-node-geometry';
import { snapGridPoint, snapJunctionBoxRect } from './grid';
import { refreshWireLinkPaths } from './wire-geometry';
import { rebuildConduitPathsPreservingFreeEnds } from './path-routing';
import { rebuildWirePathsPreservingTips } from './wire-routing';
import type { Diagram } from './types';
import type { Point } from './orthogonal-path';

function snapPoints(points: Point[]): Point[] {
  return points.map((p) => snapGridPoint(p));
}

function snapPathRecord(
  record: Record<string, { points: Point[] }> | undefined,
): Record<string, { points: Point[] }> {
  if (!record) return {};
  const out: Record<string, { points: Point[] }> = {};
  for (const [key, entry] of Object.entries(record)) {
    out[key] = entry?.points?.length ? { points: snapPoints(entry.points) } : entry;
  }
  return out;
}

/** Aligns persisted diagram geometry to the world grid. */
export function snapDiagramToGrid(diagram: Diagram): Diagram {
  let next: Diagram = {
    ...diagram,
    rooms: (diagram.rooms ?? []).map((room) => ({
      ...room,
      ...snapJunctionBoxRect(room),
    })),
    junctionBoxes: diagram.junctionBoxes.map((box) => ({
      ...box,
      ...snapJunctionBoxRect(box),
    })),
    lightBulbs: diagram.lightBulbs.map((bulb) => {
      const r = LIGHT_BULB_RADIUS;
      const center = snapGridPoint({ x: bulb.x + r, y: bulb.y + r });
      return { ...bulb, x: center.x - r, y: center.y - r };
    }),
    switches: diagram.switches.map((sw) => {
      const center = snapGridPoint({ x: sw.x + sw.width / 2, y: sw.y + sw.height / 2 });
      return { ...sw, x: center.x - sw.width / 2, y: center.y - sw.height / 2 };
    }),
    dimmerSwitches: (diagram.dimmerSwitches ?? []).map((dim) => {
      const center = snapGridPoint({ x: dim.x + dim.width / 2, y: dim.y + dim.height / 2 });
      return { ...dim, x: center.x - dim.width / 2, y: center.y - dim.height / 2 };
    }),
    outlets: (diagram.outlets ?? []).map((outlet) => {
      const center = snapGridPoint({ x: outlet.x + outlet.width / 2, y: outlet.y + outlet.height / 2 });
      return { ...outlet, x: center.x - outlet.width / 2, y: center.y - outlet.height / 2 };
    }),
    layout: {
      ...diagram.layout,
      conduitPaths: snapPathRecord(diagram.layout.conduitPaths),
      wirePaths: snapPathRecord(diagram.layout.wirePaths),
      conduitRunPaths: snapPathRecord(diagram.layout.conduitRunPaths),
      exposedPaths: snapPathRecord(diagram.layout.exposedPaths),
      conduitStubPaths: snapPathRecord(diagram.layout.conduitStubPaths),
      wireLinkPaths: snapPathRecord(diagram.layout.wireLinkPaths),
      hubBridgePaths: snapPathRecord(diagram.layout.hubBridgePaths),
      hubWirePaths: snapPathRecord(diagram.layout.hubWirePaths),
      deviceWirePaths: snapPathRecord(diagram.layout.deviceWirePaths),
    },
  };

  next = rebuildConduitPathsPreservingFreeEnds(next);
  next = rebuildWirePathsPreservingTips(next);
  next = refreshWireLinkPaths(next);
  return next;
}
