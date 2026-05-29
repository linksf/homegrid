import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { migrateConduitsToCables } from '../cable-migration';
import { GRID_SIZE } from '../grid';
import { addJunctionBox, addLocalConduit, addSpanConduit } from '../mutations';

describe('migrateConduitsToCables', () => {
  it('migrates a 2-wire local conduit to one cable with cable-linked wires', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 12, GRID_SIZE * 12);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    expect(diagram.conduits.some((c) => c.kind === 'local')).toBe(true);

    diagram = migrateConduitsToCables(diagram);

    expect(diagram.conduits.filter((c) => c.kind === 'local')).toHaveLength(0);
    expect(diagram.cables).toHaveLength(1);
    const cable = diagram.cables[0]!;
    expect(cable.junctionBoxId).toBe(box.id);
    expect(cable.anchor).toBe('middle-right');
    expect(cable.wireIds).toHaveLength(2);

    for (const wid of cable.wireIds) {
      const w = diagram.wires.find((x) => x.id === wid)!;
      expect(w.cableId).toBe(cable.id);
      expect(w.conduitId).toBeNull();
    }
  });

  it('migrates a span between two boxes to two cables and one conduit run', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 14, GRID_SIZE * 14);
    diagram = addJunctionBox(diagram, GRID_SIZE * 48, GRID_SIZE * 14);
    const [boxA, boxB] = diagram.junctionBoxes.filter((b) => b.type === 'normal');

    diagram = addSpanConduit(diagram, {
      junctionBoxIdA: boxA!.id,
      anchorA: 'middle-right',
      junctionBoxIdB: boxB!.id,
      anchorB: 'middle-left',
      wireColors: ['black', 'white'],
    });
    expect(diagram.conduits.some((c) => c.kind === 'span')).toBe(true);

    diagram = migrateConduitsToCables(diagram);

    expect(diagram.conduits.filter((c) => c.kind === 'span')).toHaveLength(0);
    expect(diagram.conduitRuns).toHaveLength(1);
    expect(diagram.cables).toHaveLength(2);

    const run = diagram.conduitRuns[0]!;
    expect(run.wireIds.length).toBe(4);

    const boxACables = diagram.cables.filter((c) => c.junctionBoxId === boxA!.id);
    const boxBCables = diagram.cables.filter((c) => c.junctionBoxId === boxB!.id);
    expect(boxACables).toHaveLength(1);
    expect(boxBCables).toHaveLength(1);

    const pathPts = diagram.layout.conduitRunPaths[run.id]?.points ?? [];
    expect(pathPts.length).toBeGreaterThanOrEqual(2);
  });
});
