import { anchorPoint } from './anchors';
import { GRID_SIZE, snapGridPoint } from './grid';
import type { AnchorPosition, Diagram, JunctionBox } from './types';

/**
 * World-space grid slots for wires in a cable on a junction-box wall anchor.
 *
 * Anchor point is the geometric center of the span (see `./anchors`).
 * Slots lie on adjacent grid intersections along the wall tangent; coordinates
 * are snapped to `GRID_SIZE` from `./grid`.
 */
export function cableWallSlots(
  box: JunctionBox,
  anchor: AnchorPosition,
  wireCount: 1 | 2 | 3,
): { x: number; y: number }[] {
  const center = anchorPoint(box, anchor);
  const { spreadX, fixedCoord } = wallSlotAxis(box, anchor, center);

  const slots: { x: number; y: number }[] = [];

  for (let i = 0; i < wireCount; i++) {
    const multiplier =
      wireCount % 2 === 1
        ? -(wireCount - 1) / 2 + i // n=1:[0]; n=3:[-1,0,1]
        : -(wireCount - 1) + 2 * i; // n=2:[-1,1]
    const offset = multiplier * GRID_SIZE;

    if (spreadX) {
      slots.push(snapGridPoint({ x: center.x + offset, y: fixedCoord }));
    } else {
      slots.push(snapGridPoint({ x: fixedCoord, y: center.y + offset }));
    }
  }

  return slots;
}

/** True when this box already has a cable occupying `anchor`. */
export function cableAnchorTaken(
  diagram: Diagram,
  junctionBoxId: string,
  anchor: AnchorPosition,
): boolean {
  return diagram.cables.some(
    (c) => c.junctionBoxId === junctionBoxId && c.anchor === anchor,
  );
}

function wallSlotAxis(
  box: JunctionBox,
  anchor: AnchorPosition,
  center: { x: number; y: number },
): { spreadX: boolean; fixedCoord: number } {
  const { x, y, width: w, height: h } = box;

  if (anchor === 'middle-left') {
    return { spreadX: false, fixedCoord: x };
  }
  if (anchor === 'middle-right') {
    return { spreadX: false, fixedCoord: x + w };
  }

  const row = anchor.split('-')[0] as string | undefined;

  if (row === 'top') {
    return { spreadX: true, fixedCoord: y };
  }
  if (row === 'bottom') {
    return { spreadX: true, fixedCoord: y + h };
  }

  // `center`: no wall tangent; spread along X, keep anchor Y.
  return { spreadX: true, fixedCoord: center.y };
}
