import type { Area, Diagram, Room } from './types';

export type Point = { x: number; y: number };

function pointInRect(p: Point, rect: Pick<Room, 'x' | 'y' | 'width' | 'height'>): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

function rectCenter(rect: Pick<Room, 'x' | 'y' | 'width' | 'height'>): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Room whose bounds contain the point; prefers smallest area when overlapping. */
export function roomAtPoint(rooms: readonly Room[], point: Point): Room | null {
  let best: Room | null = null;
  let bestArea = Infinity;
  for (const room of rooms) {
    if (!pointInRect(point, room)) continue;
    const area = room.width * room.height;
    if (area < bestArea) {
      best = room;
      bestArea = area;
    }
  }
  return best;
}

export function roomForEntityCenter(
  diagram: Diagram,
  center: Point,
): Room | null {
  return roomAtPoint(diagram.rooms ?? [], center);
}

/** Areas that contain the point, smallest first. */
export function areasAtPoint(areas: readonly Area[], point: Point): Area[] {
  return (areas ?? [])
    .filter((area) => pointInRect(point, area))
    .sort((a, b) => a.width * a.height - b.width * b.height);
}

export function entityCenterFromBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Point {
  return rectCenter(bounds);
}
