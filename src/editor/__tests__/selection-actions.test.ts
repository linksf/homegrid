import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import { addJunctionBox, addHub, attachWireToHub } from '../../domain/mutations';
import { addCable } from '../../domain/cable-mutations';
import { connectConduitRun } from '../../domain/conduit-run-mutations';
import { GRID_SIZE } from '../../domain/grid';
import { setSingleConduitRun, setSingleHubWire } from '../diagram-selection';
import { deleteAllSelected } from '../selection-actions';

describe('deleteAllSelected', () => {
  it('disconnects a selected conduit run without removing cables', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 20, GRID_SIZE * 15);
    diagram = addJunctionBox(diagram, GRID_SIZE * 45, GRID_SIZE * 15);
    const [boxA, boxB] = diagram.junctionBoxes.filter((b) => b.type === 'normal');

    diagram = addCable(diagram, {
      junctionBoxId: boxA!.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: boxB!.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const cableA = diagram.cables.find((c) => c.junctionBoxId === boxA!.id)!;
    const cableB = diagram.cables.find((c) => c.junctionBoxId === boxB!.id)!;
    diagram = connectConduitRun(diagram, cableA.id, { kind: 'cable', cableId: cableB.id });

    const runId = diagram.conduitRuns[0]!.id;
    const next = deleteAllSelected(diagram, setSingleConduitRun(runId));

    expect(next.conduitRuns).toHaveLength(0);
    expect(next.cables).toHaveLength(2);
    expect(next.layout.conduitRunPaths[runId]).toBeUndefined();
  });

  it('detaches a selected hub wire tie without deleting the wire', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hubId = diagram.hubs[0]!.id;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const wireId = diagram.cables[0]!.wireIds[0]!;
    diagram = attachWireToHub(diagram, hubId, wireId);

    const next = deleteAllSelected(diagram, setSingleHubWire(wireId));

    expect(next.wires.find((w) => w.id === wireId)?.hubId).toBeNull();
    expect(next.layout.hubWirePaths?.[wireId]).toBeUndefined();
    expect(next.wires.some((w) => w.id === wireId)).toBe(true);
  });
});
