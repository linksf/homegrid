import { describe, expect, it } from 'vitest';
import { anchorPoint } from '../../domain/anchors';
import { createEmptyJob } from '../../domain/defaults';
import { addJunctionBox, addLocalConduit } from '../../domain/mutations';
import {
  collectJunctionAnchorsInMarquee,
  collectPathAnchorsInMarquee,
  encodeJunctionAnchor,
  decodePathAnchor,
  encodePathAnchor,
  junctionBoxIdsFromAnchorKeys,
  movePathAnchorsByDelta,
  pathAnchorWorldPoint,
} from '../anchor-selection';
import { collectMarqueeSelection, normalizeMarqueeRect } from '../marquee-selection';
import { moveJunctionBoxesByDelta } from '../selection-move';

describe('anchor selection', () => {
  it('round-trips cable exposed + conduit stub path anchor keys', () => {
    const exposed = { kind: 'exposedWire', wireId: 'wx', index: 1 } as const;
    expect(decodePathAnchor(encodePathAnchor(exposed))).toEqual(exposed);
    const stub = { kind: 'conduitStub', cableId: 'cab', index: 2 } as const;
    expect(decodePathAnchor(encodePathAnchor(stub))).toEqual(stub);
  });

  it('collects junction anchors inside a window marquee', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    const topCenter = anchorPoint(box, 'top-center');

    const rect = normalizeMarqueeRect(
      topCenter.x - 20,
      topCenter.y - 20,
      topCenter.x + 20,
      topCenter.y + 20,
    );
    const keys = collectJunctionAnchorsInMarquee(diagram, rect, 'window');
    expect(keys.has(encodeJunctionAnchor(box.id, 'top-center'))).toBe(true);
  });

  it('maps junction anchor keys to parent box ids', () => {
    const keys = new Set([
      encodeJunctionAnchor('a', 'top-left'),
      encodeJunctionAnchor('b', 'middle-right'),
    ]);
    expect(junctionBoxIdsFromAnchorKeys(keys)).toEqual(new Set(['a', 'b']));
  });

  it('collects path anchors from wires in a crossing marquee', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black'],
    });

    const sel = collectMarqueeSelection(diagram, 250, 200, 350, 400);
    expect(sel.pathAnchors.size).toBeGreaterThan(0);
  });

  it('moves multiple junction boxes together by delta', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    diagram = addJunctionBox(diagram, 600, 300);
    const boxes = diagram.junctionBoxes.filter((b) => b.type === 'normal');
    const startPositions = new Map(
      boxes.map((b) => [b.id, { x: b.x, y: b.y }] as const),
    );

    diagram = moveJunctionBoxesByDelta(
      diagram,
      boxes.map((b) => b.id),
      startPositions,
      48,
      0,
    );

    for (const box of boxes) {
      const moved = diagram.junctionBoxes.find((b) => b.id === box.id)!;
      expect(moved.x - box.x).toBe(48);
    }
  });

  it('moves multiple path anchors together by delta', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black'],
    });
    const wireId = diagram.wires[0]!.id;
    const anchorKey = encodePathAnchor({ kind: 'wire', wireId, index: 1 });
    const start = pathAnchorWorldPoint(diagram, { kind: 'wire', wireId, index: 1 })!;
    const startPositions = new Map([[anchorKey, start]]);

    diagram = movePathAnchorsByDelta(
      diagram,
      [anchorKey],
      startPositions,
      anchorKey,
      start.x + 36,
      start.y,
    );

    const after = pathAnchorWorldPoint(diagram, { kind: 'wire', wireId, index: 1 })!;
    expect(after.x - start.x).toBe(36);
  });
});

describe('marquee path anchor collection', () => {
  it('includes interior wire bends touched by crossing marquee', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black'],
    });

    const keys = collectPathAnchorsInMarquee(
      diagram,
      normalizeMarqueeRect(250, 200, 350, 400),
      'crossing',
    );
    expect(keys.size).toBeGreaterThan(0);
  });
});
