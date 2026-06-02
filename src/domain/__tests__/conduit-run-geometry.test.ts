import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { GRID_SIZE } from '../grid';
import { addCable } from '../cable-mutations';
import { connectConduitRun } from '../conduit-run-mutations';
import { addJunctionBox } from '../mutations';
import { moveConduitRunJoint } from '../conduit-run-geometry';

function twoConnectedCables() {
  let diagram = createEmptyJob().diagram;
  diagram = addJunctionBox(diagram, GRID_SIZE * 15, GRID_SIZE * 15);
  diagram = addJunctionBox(diagram, GRID_SIZE * 50, GRID_SIZE * 15);
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
  const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA!.id)!;
  const cabB = diagram.cables.find((c) => c.junctionBoxId === boxB!.id)!;
  diagram = connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id });
  const run = diagram.conduitRuns[0]!;
  return { diagram, cabA, cabB, run };
}

describe('moveConduitRunJoint', () => {
  it('moves the cable A junction when dragging run endpoint index 0', () => {
    const { diagram, cabA, run } = twoConnectedCables();
    const runPath = diagram.layout.conduitRunPaths[run.id]?.points!;
    const nx = runPath[0]!.x + 48;
    const ny = runPath[0]!.y + 24;

    const next = moveConduitRunJoint(diagram, run.id, 0, nx, ny);
    const stubTip = next.layout.conduitStubPaths?.[cabA.id]?.points?.at(-1);
    const runStart = next.layout.conduitRunPaths?.[run.id]?.points?.[0];

    expect(stubTip?.x).toBeCloseTo(Math.round(nx / GRID_SIZE) * GRID_SIZE);
    expect(stubTip?.y).toBeCloseTo(Math.round(ny / GRID_SIZE) * GRID_SIZE);
    expect(runStart).toEqual(stubTip);
  });

  it('moves the cable B junction when dragging run endpoint index last', () => {
    const { diagram, cabB, run } = twoConnectedCables();
    const runPath = diagram.layout.conduitRunPaths[run.id]?.points!;
    const last = runPath.length - 1;
    const nx = runPath[last]!.x - 48;
    const ny = runPath[last]!.y + 24;

    const next = moveConduitRunJoint(diagram, run.id, last, nx, ny);
    const stubTip = next.layout.conduitStubPaths?.[cabB.id]?.points?.at(-1);
    const runEnd = next.layout.conduitRunPaths?.[run.id]?.points?.[last];

    expect(stubTip?.x).toBeCloseTo(Math.round(nx / GRID_SIZE) * GRID_SIZE);
    expect(stubTip?.y).toBeCloseTo(Math.round(ny / GRID_SIZE) * GRID_SIZE);
    expect(runEnd).toEqual(stubTip);
  });
});
