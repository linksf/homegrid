import { describe, expect, it } from 'vitest';
import { anchorPoint } from '../anchors';
import { createEmptyJob } from '../defaults';
import { addJunctionBox, DEFAULT_JUNCTION_SIZE, MIN_JUNCTION_SIZE } from '../mutations';
import { addLightBulb } from '../device-mutations';
import { hubSlotWorldPoint } from '../hub-geometry';
import {
  GRID_SIZE,
  snapGridCoord,
  snapJunctionBoxRect,
  snapJunctionBoxSpan,
} from '../grid';

describe('grid snapping', () => {
  it('snaps junction boxes to even grid spans', () => {
    const rect = snapJunctionBoxRect({ x: 13, y: 27, width: 100, height: 80 });
    expect(rect.x).toBe(12);
    expect(rect.y).toBe(24);
    expect(rect.width % (GRID_SIZE * 2)).toBe(0);
    expect(rect.height % (GRID_SIZE * 2)).toBe(0);
    expect(rect.width).toBeGreaterThanOrEqual(MIN_JUNCTION_SIZE.width);
  });

  it('places anchors on grid intersections for snapped boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    for (const anchor of [
      'top-left',
      'top-center',
      'top-right',
      'middle-left',
      'center',
      'middle-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ] as const) {
      const pt = anchorPoint(box, anchor);
      expect(pt.x % GRID_SIZE).toBe(0);
      expect(pt.y % GRID_SIZE).toBe(0);
    }
  });

  it('places hub slots on grid intersections', () => {
    const box = snapJunctionBoxRect({
      x: 120,
      y: 120,
      width: DEFAULT_JUNCTION_SIZE.width,
      height: DEFAULT_JUNCTION_SIZE.height,
    });
    for (const slot of [0, 1, 2, 3] as const) {
      const pt = hubSlotWorldPoint(box, slot);
      expect(pt.x % GRID_SIZE).toBe(0);
      expect(pt.y % GRID_SIZE).toBe(0);
    }
  });

  it('snaps light placement to grid-centered terminals', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 205, 199);
    const bulb = diagram.lightBulbs[0]!;
    const centerX = bulb.x + 24;
    const centerY = bulb.y + 24;
    expect(centerX % GRID_SIZE).toBe(0);
    expect(centerY % GRID_SIZE).toBe(0);
  });

  it('rounds resize spans to the nearest even cell count', () => {
    expect(snapJunctionBoxSpan(100)).toBe(96);
    expect(snapJunctionBoxSpan(110)).toBe(120);
    expect(snapGridCoord(17)).toBe(12);
  });
});
