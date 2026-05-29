import type { JunctionBox } from './types';
import type { Point } from './orthogonal-path';

/** World-space grid pitch; all diagram geometry aligns to this. */
export const GRID_SIZE = 12;

export function snapGridCoord(value: number, step = GRID_SIZE): number {
  return Math.round(value / step) * step;
}

export function snapGridPoint(p: Point, step = GRID_SIZE): Point {
  return { x: snapGridCoord(p.x, step), y: snapGridCoord(p.y, step) };
}

/** Snap a span to the nearest whole number of grid cells (minimum minCells). */
export function snapGridSpan(length: number, minCells = 1, step = GRID_SIZE): number {
  const cells = Math.max(minCells, Math.round(length / step));
  return cells * step;
}

/**
 * Junction box width/height use an even cell count so edge-mid anchors
 * (at 50%) land on grid intersections when the box origin is snapped.
 */
export function snapJunctionBoxSpan(length: number, minCells = 4, step = GRID_SIZE): number {
  const min = minCells * step;
  let cells = Math.max(minCells, Math.round(length / step));
  if (cells % 2 !== 0) cells += 1;
  return Math.max(min, cells * step);
}

export function snapJunctionBoxRect(
  rect: Pick<JunctionBox, 'x' | 'y' | 'width' | 'height'>,
): Pick<JunctionBox, 'x' | 'y' | 'width' | 'height'> {
  return {
    x: snapGridCoord(rect.x),
    y: snapGridCoord(rect.y),
    width: snapJunctionBoxSpan(rect.width),
    height: snapJunctionBoxSpan(rect.height),
  };
}

/** Inset for hub nodes from the junction box interior (one grid cell). */
export const HUB_GRID_INSET = GRID_SIZE;
