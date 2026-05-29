import { describe, expect, it } from 'vitest';
import { anchorPoint } from '../anchors';
import { cableAnchorTaken, cableWallSlots } from '../cable-slots';
import { createEmptyJob } from '../defaults';
import { GRID_SIZE } from '../grid';
import { addJunctionBox } from '../mutations';
import type { JunctionBox } from '../types';

describe('cableWallSlots', () => {
  it('middle-left 1 wire: slot at box left edge, y = vertical center', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal') as JunctionBox;
    expect(cableWallSlots(box, 'middle-left', 1)).toEqual([
      anchorPoint(box, 'middle-left'),
    ]);
  });

  it('top-center 3 wires: middle at top-center, ±GRID_SIZE on X', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal') as JunctionBox;
    const c = anchorPoint(box, 'top-center');
    expect(cableWallSlots(box, 'top-center', 3)).toEqual([
      { x: c.x - GRID_SIZE, y: box.y },
      { x: c.x, y: box.y },
      { x: c.x + GRID_SIZE, y: box.y },
    ]);
  });
});

describe('cableAnchorTaken', () => {
  it('is true when a cable exists on that box anchor', () => {
    const diagram = createEmptyJob().diagram;
    const boxId = diagram.junctionBoxes[0]?.id ?? 'jb-test';
    const next = {
      ...diagram,
      cables: [
        {
          id: 'c1',
          junctionBoxId: boxId,
          anchor: 'top-left' as const,
          wireIds: ['w1'],
        },
      ],
    };
    expect(cableAnchorTaken(next, boxId, 'top-left')).toBe(true);
    expect(cableAnchorTaken(next, boxId, 'top-right')).toBe(false);
  });
});
