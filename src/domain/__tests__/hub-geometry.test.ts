import { describe, expect, it } from 'vitest';
import { DEFAULT_JUNCTION_SIZE } from '../mutations';
import { GRID_SIZE, snapJunctionBoxRect } from '../grid';
import { hubSlotWorldPoint } from '../hub-geometry';

describe('hub slot geometry', () => {
  const box = snapJunctionBoxRect({
    x: 120,
    y: 120,
    width: DEFAULT_JUNCTION_SIZE.width,
    height: DEFAULT_JUNCTION_SIZE.height,
  });

  it('places four hubs in a diamond around the box center', () => {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const top = hubSlotWorldPoint(box, 0);
    const right = hubSlotWorldPoint(box, 1);
    const bottom = hubSlotWorldPoint(box, 2);
    const left = hubSlotWorldPoint(box, 3);

    expect(top.x).toBe(bottom.x);
    expect(left.y).toBe(right.y);
    expect(top.y).toBeLessThan(cy);
    expect(bottom.y).toBeGreaterThan(cy);
    expect(left.x).toBeLessThan(cx);
    expect(right.x).toBeGreaterThan(cx);
    expect(top.y).toBe(cy - GRID_SIZE * 2);
    expect(bottom.y).toBe(cy + GRID_SIZE * 2);
    expect(left.x).toBe(cx - GRID_SIZE * 2);
    expect(right.x).toBe(cx + GRID_SIZE * 2);
  });

  it('keeps hub slots on grid intersections', () => {
    for (const slot of [0, 1, 2, 3] as const) {
      const pt = hubSlotWorldPoint(box, slot);
      expect(pt.x % GRID_SIZE).toBe(0);
      expect(pt.y % GRID_SIZE).toBe(0);
    }
  });
});
