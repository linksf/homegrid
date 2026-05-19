import type { Diagram } from './types';

export type Point = { x: number; y: number };

/** Separation between wire-to-wire links that share a collinear segment. */
export const WIRE_LINK_LANE_SPACING = 14;

const EPS = 1e-3;

function segmentLaneKey(a: Point, b: Point): string | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) < EPS && Math.abs(dx) >= EPS) {
    const y = Math.round(a.y);
    const x0 = Math.round(Math.min(a.x, b.x));
    const x1 = Math.round(Math.max(a.x, b.x));
    return `h:${y}:${x0}-${x1}`;
  }
  if (Math.abs(dx) < EPS && Math.abs(dy) >= EPS) {
    const x = Math.round(a.x);
    const y0 = Math.round(Math.min(a.y, b.y));
    const y1 = Math.round(Math.max(a.y, b.y));
    return `v:${x}:${y0}-${y1}`;
  }
  return null;
}

function segmentPerpendicular(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

export function laneOffset(linkId: string, group: string[]): number {
  const lane = group.indexOf(linkId);
  if (lane < 0 || group.length <= 1) return 0;
  return (lane - (group.length - 1) / 2) * WIRE_LINK_LANE_SPACING;
}

/** Lane separation for a link along its primary segment (endpoints stay fixed). */
export function laneOffsetForLink(
  points: Point[],
  linkId: string,
  segmentLanes: Map<string, string[]>,
): number {
  if (points.length < 2) return 0;
  const a = points[0]!;
  const b = points[1]!;
  const key = segmentLaneKey(a, b);
  const group = key ? segmentLanes.get(key) : undefined;
  return group ? laneOffset(linkId, group) : 0;
}

/** Maps collinear segment keys to sorted wire-link ids sharing that segment. */
export function buildWireLinkLaneMap(diagram: Diagram): Map<string, string[]> {
  const keyToIds = new Map<string, Set<string>>();

  for (const link of diagram.wireLinks) {
    const points = diagram.layout.wireLinkPaths[link.id]?.points;
    if (!points || points.length < 2) continue;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) continue;
      const key = segmentLaneKey(a, b);
      if (!key) continue;
      let set = keyToIds.get(key);
      if (!set) {
        set = new Set();
        keyToIds.set(key, set);
      }
      set.add(link.id);
    }
  }

  const result = new Map<string, string[]>();
  for (const [key, set] of keyToIds) {
    result.set(key, [...set].sort());
  }
  return result;
}

/** Offset each segment so collinear wire links do not stack. */
export function offsetPolylineByLanes(
  points: Point[],
  linkId: string,
  segmentLanes: Map<string, string[]>,
): Point[] {
  if (points.length < 2) return points;

  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const key = segmentLaneKey(a, b);
    const group = key ? segmentLanes.get(key) : undefined;
    const offset = group ? laneOffset(linkId, group) : 0;
    const perp = segmentPerpendicular(a, b);
    const aO = { x: a.x + perp.x * offset, y: a.y + perp.y * offset };
    const bO = { x: b.x + perp.x * offset, y: b.y + perp.y * offset };
    if (i === 0) out.push(aO);
    out.push(bO);
  }
  return out;
}
