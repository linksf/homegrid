import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import { addCable } from '../../domain/cable-mutations';
import { addJunctionBox } from '../../domain/mutations';
import { GRID_SIZE } from '../../domain/grid';
import { chainNeighborPoints, snapPointToChainNeighbors } from '../path-anchor-snap';

describe('path anchor chain snap', () => {
  it('snaps x/y to neighbor anchor coordinates within threshold', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 10, GRID_SIZE * 10);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const wireId = diagram.cables[0]!.wireIds[0]!;
    const path = diagram.layout.exposedPaths?.[wireId]?.points;
    expect(path && path.length >= 3).toBe(true);
    const ref = { kind: 'exposedWire' as const, wireId, index: 1 };
    const neighbors = chainNeighborPoints(diagram, ref);
    expect(neighbors.length).toBe(2);

    const nearNeighborX = neighbors[0]!.x + 4;
    const snapped = snapPointToChainNeighbors(nearNeighborX, 999, neighbors, 1);
    expect(snapped.x).toBe(neighbors[0]!.x);
    expect(snapped.y).toBe(999);
  });
});
