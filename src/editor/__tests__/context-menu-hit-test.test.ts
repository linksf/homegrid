import { describe, expect, it } from 'vitest';
import { addCable } from '../../domain/cable-mutations';
import { createEmptyJob } from '../../domain/defaults';
import { addJunctionBox } from '../../domain/mutations';
import { addRoom } from '../../domain/room-mutations';
import { GRID_SIZE } from '../../domain/grid';
import { anchorPoint } from '../../domain/anchors';
import { resolveExposedCableWirePath } from '../../domain/exposed-wire-endpoints';
import { hitContextMenuTarget } from '../context-menu-hit-test';

const JUNCTION_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

describe('hitContextMenuTarget', () => {
  it('finds a cable wall wire near the pointer', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 10, GRID_SIZE * 10);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const wireId = diagram.cables[0]!.wireIds[0]!;
    const path = resolveExposedCableWirePath(diagram, wireId);
    expect(path && path.length >= 2).toBe(true);
    const anchorPts = JUNCTION_ANCHORS.map((anchor) => anchorPoint(box, anchor));

    let sample = path![0]!;
    let bestClearance = -1;
    for (let i = 0; i < path!.length - 1; i++) {
      const a = path![i]!;
      const b = path![i + 1]!;
      const candidate = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const clearance = Math.min(...anchorPts.map((pt) => Math.hypot(candidate.x - pt.x, candidate.y - pt.y)));
      if (clearance > bestClearance) {
        bestClearance = clearance;
        sample = candidate;
      }
    }
    expect(bestClearance).toBeGreaterThan(GRID_SIZE * 2);

    const target = hitContextMenuTarget(diagram, sample.x, sample.y);
    expect(target).toEqual({ kind: 'wire', wireId });
  });

  it('prefers a junction anchor over a wire at the same spot', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 10, GRID_SIZE * 10);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const anchorPt = anchorPoint(box, 'middle-right');
    const target = hitContextMenuTarget(diagram, anchorPt.x, anchorPt.y);
    expect(target).toEqual({ kind: 'junctionAnchor', boxId: box.id, anchor: 'middle-right' });
  });

  it('finds a room when clicking inside its bounds', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 400, 400);
    const room = diagram.rooms[0]!;

    const target = hitContextMenuTarget(
      diagram,
      room.x + room.width / 2,
      room.y + room.height / 2,
    );
    expect(target).toEqual({ kind: 'room', roomId: room.id });
  });
});
