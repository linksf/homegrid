import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { GRID_SIZE } from '../grid';
import { connectConduitRun, connectConduitRunToBreakerAnchor, disconnectConduitRun } from '../conduit-run-mutations';
import { addCable } from '../cable-mutations';
import { addJunctionBox } from '../mutations';
import { isBreakerCable } from '../breaker-cable';

function twoNormalBoxesSeparated() {
  let diagram = createEmptyJob().diagram;
  diagram = addJunctionBox(diagram, GRID_SIZE * 15, GRID_SIZE * 15);
  diagram = addJunctionBox(diagram, GRID_SIZE * 50, GRID_SIZE * 15);
  const boxes = diagram.junctionBoxes.filter((b) => b.type === 'normal');
  return { diagram, boxA: boxes[0]!, boxB: boxes[1]! };
}

describe('connectConduitRun', () => {
  it('connects two cables with matching colors and lays out a conduit run path', () => {
    let { diagram, boxA, boxB } = twoNormalBoxesSeparated();
    diagram = addCable(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });

    const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA.id)!;
    const cabB = diagram.cables.find((c) => c.junctionBoxId === boxB.id)!;

    diagram = connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id });

    expect(diagram.conduitRuns).toHaveLength(1);
    const run = diagram.conduitRuns[0]!;
    expect(run.cableIdA).toBe(cabA.id);
    expect(run.cableIdB).toBe(cabB.id);
    expect(run.wireIds).toHaveLength(4);

    const path = diagram.layout.conduitRunPaths[run.id]?.points ?? [];
    expect(path.length).toBeGreaterThanOrEqual(2);
  });

  it('auto-creates destination cable when connecting to a bare anchor', () => {
    let { diagram, boxA, boxB } = twoNormalBoxesSeparated();
    diagram = addCable(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    expect(diagram.cables.filter((c) => c.junctionBoxId === boxB.id)).toHaveLength(0);

    const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA.id)!;

    diagram = connectConduitRun(diagram, cabA.id, {
      kind: 'anchor',
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
    });

    expect(diagram.cables.filter((c) => c.junctionBoxId === boxB.id)).toHaveLength(1);
    const created = diagram.cables.find((c) => c.junctionBoxId === boxB.id)!;
    expect(created.anchor).toBe('middle-left');
    expect(created.wireIds).toHaveLength(2);
    expect(diagram.conduitRuns).toHaveLength(1);
  });

  it('rejects mismatched conductor multiset', () => {
    let { diagram, boxA, boxB } = twoNormalBoxesSeparated();
    diagram = addCable(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['black', 'red'],
    });

    const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA.id)!;
    const cabB = diagram.cables.find((c) => c.junctionBoxId === boxB.id)!;

    expect(() =>
      connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id }),
    ).toThrow(/colors must match/i);
  });

  it('rejects duplicate connection off the same cable stub', () => {
    let { diagram, boxA, boxB } = twoNormalBoxesSeparated();
    diagram = addCable(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA.id)!;
    const cabB = diagram.cables.find((c) => c.junctionBoxId === boxB.id)!;

    diagram = connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id });
    expect(() =>
      connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id }),
    ).toThrow(/already connected/i);
  });

  it('disconnectConduitRun removes the run layout entry', () => {
    let { diagram, boxA, boxB } = twoNormalBoxesSeparated();
    diagram = addCable(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA.id)!;
    const cabB = diagram.cables.find((c) => c.junctionBoxId === boxB.id)!;

    diagram = connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id });
    const runId = diagram.conduitRuns[0]!.id;

    diagram = disconnectConduitRun(diagram, runId);

    expect(diagram.conduitRuns).toHaveLength(0);
    expect(diagram.layout.conduitRunPaths[runId]).toBeUndefined();
  });
});

describe('connectConduitRunToBreakerAnchor', () => {
  it('creates a breaker cable and conduit run when connecting to an empty panel anchor', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addJunctionBox(diagram, GRID_SIZE * 30, GRID_SIZE * 15);

    const normalBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: normalBox.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });

    const cab = diagram.cables[0]!;
    expect(diagram.cables.filter((c) => isBreakerCable(c))).toHaveLength(0);

    diagram = connectConduitRunToBreakerAnchor(diagram, cab.id, panelId, 'middle-left');

    const breakerCable = diagram.cables.find(
      (c) => c.junctionBoxId === panelId && c.anchor === 'middle-left',
    )!;
    expect(isBreakerCable(breakerCable)).toBe(true);
    expect(breakerCable.wireIds).toHaveLength(2);
    expect(diagram.conduitRuns).toHaveLength(1);
    expect(diagram.conduitRuns[0]!.cableIdB).toBe(breakerCable.id);
  });

  it('connects to an existing breaker cable at the anchor', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addJunctionBox(diagram, GRID_SIZE * 30, GRID_SIZE * 15);
    diagram = addCable(diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const breakerCable = diagram.cables.find((c) => isBreakerCable(c))!;

    const normalBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: normalBox.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const fieldCable = diagram.cables.find((c) => c.junctionBoxId === normalBox.id)!;

    diagram = connectConduitRunToBreakerAnchor(
      diagram,
      fieldCable.id,
      panelId,
      'middle-left',
    );

    expect(diagram.conduitRuns).toHaveLength(1);
    expect(diagram.conduitRuns[0]!.cableIdB).toBe(breakerCable.id);
    expect(diagram.cables.filter((c) => isBreakerCable(c))).toHaveLength(1);
  });

  it('rejects breaker connection when multiset differs from existing breaker cable', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addJunctionBox(diagram, GRID_SIZE * 30, GRID_SIZE * 15);

    diagram = addCable(diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });

    const normalBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: normalBox.id,
      anchor: 'middle-left',
      wireColors: ['red', 'white', 'black'],
    });

    const cab = diagram.cables.find((c) => c.junctionBoxId === normalBox.id)!;
    expect(() =>
      connectConduitRunToBreakerAnchor(diagram, cab.id, panelId, 'middle-left'),
    ).toThrow(/colors must match/i);
  });
});
