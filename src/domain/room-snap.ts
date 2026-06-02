import { GRID_SIZE, snapGridCoord } from './grid';
import type { Room } from './types';

/** Max distance (world units) to magnetically snap a new room edge to an existing one. */
export const ROOM_SNAP_THRESHOLD = GRID_SIZE * 2;

type Rect = { x: number; y: number; width: number; height: number };

function edges(room: Pick<Room, 'x' | 'y' | 'width' | 'height'>) {
  return {
    left: room.x,
    right: room.x + room.width,
    top: room.y,
    bottom: room.y + room.height,
  };
}

function collectSnapTargets(rooms: Room[]): { x: number[]; y: number[] } {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const room of rooms) {
    const e = edges(room);
    xs.add(e.left);
    xs.add(e.right);
    ys.add(e.top);
    ys.add(e.bottom);
  }
  return { x: [...xs], y: [...ys] };
}

function nearestSnap(value: number, targets: number[], threshold: number): number | null {
  let best: number | null = null;
  let bestDist = threshold + 1;
  for (const target of targets) {
    const dist = Math.abs(value - target);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  return best;
}

/** Snap a fixed-size room rect by aligning its closest edge on each axis. */
export function snapRoomRect(rect: Rect, rooms: Room[]): Rect {
  if (rooms.length === 0) return rect;

  const { x: snapX, y: snapY } = collectSnapTargets(rooms);
  let { x, y, width, height } = rect;

  const leftSnap = nearestSnap(x, snapX, ROOM_SNAP_THRESHOLD);
  const rightSnap = nearestSnap(x + width, snapX, ROOM_SNAP_THRESHOLD);
  if (leftSnap != null && (rightSnap == null || Math.abs(x - leftSnap) <= Math.abs(x + width - rightSnap))) {
    x = leftSnap;
  } else if (rightSnap != null) {
    x = rightSnap - width;
  }

  const topSnap = nearestSnap(y, snapY, ROOM_SNAP_THRESHOLD);
  const bottomSnap = nearestSnap(y + height, snapY, ROOM_SNAP_THRESHOLD);
  if (topSnap != null && (bottomSnap == null || Math.abs(y - topSnap) <= Math.abs(y + height - bottomSnap))) {
    y = topSnap;
  } else if (bottomSnap != null) {
    y = bottomSnap - height;
  }

  return { x: snapGridCoord(x), y: snapGridCoord(y), width, height };
}

/** Snap drag corners when drawing a new room from two opposite points. */
export function snapRoomDraftCorners(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rooms: Room[],
): { x0: number; y0: number; x1: number; y1: number } {
  if (rooms.length === 0) return { x0, y0, x1, y1 };

  const { x: snapX, y: snapY } = collectSnapTargets(rooms);

  function snapCoord(value: number, targets: number[]): number {
    return nearestSnap(value, targets, ROOM_SNAP_THRESHOLD) ?? value;
  }

  return {
    x0: snapGridCoord(snapCoord(x0, snapX)),
    y0: snapGridCoord(snapCoord(y0, snapY)),
    x1: snapGridCoord(snapCoord(x1, snapX)),
    y1: snapGridCoord(snapCoord(y1, snapY)),
  };
}
