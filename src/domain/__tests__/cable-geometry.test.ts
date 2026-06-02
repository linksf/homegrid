import { describe, expect, it } from 'vitest';
import { addCable } from '../cable-mutations';
import { refreshConduitRunPaths } from '../conduit-run-geometry';
import { connectConduitRun } from '../conduit-run-mutations';
import { createEmptyJob } from '../defaults';
import {
  conduitStubResolvedPath,
  moveConduitStubJoint,
  moveExposedJoint,
  refreshCablePaths,
} from '../cable-geometry';
import { GRID_SIZE } from '../grid';
import { addJunctionBox } from '../mutations';
import type { Cable, Diagram, JunctionBox, Wire } from '../types';

const box: JunctionBox = {
  id: 'b1',
  type: 'normal',
  label: '',
  x: 0,
  y: 0,
  width: GRID_SIZE * 14,
  height: GRID_SIZE * 10,
};

function minimalDiagram(wire: Wire, cable: Cable, junctionBox: JunctionBox = box): Diagram {
  return {
    rooms: [],
    junctionBoxes: [junctionBox],
    breakers: [],
    hubs: [],
    hubBridges: [],
    lightBulbs: [],
    switches: [],
    dimmerSwitches: [],
    outlets: [],
    deviceNodes: [],
    conduits: [],
    cables: [cable],
    conduitRuns: [],
    wires: [wire],
    wireLinks: [],
    layout: {
      conduitPaths: {},
      conduitRunPaths: {},
      exposedPaths: {},
      conduitStubPaths: {},
      conduitOffsets: {},
      wireOffsets: {},
      wirePaths: {},
      wireLinkPaths: {},
      wireLinkOffsets: {},
      hubBridgePaths: {},
      hubWirePaths: {},
      deviceWirePaths: {},
    },
  };
}

describe('refreshCablePaths', () => {
  it('skips exposedPaths for breaker cable wires', () => {
    const breakerBox: JunctionBox = { ...box, id: 'panel', type: 'breaker' };
    const wire: Wire = {
      id: 'w1',
      color: 'black',
      label: '',
      conduitId: null,
      cableId: 'c1',
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    };
    const cable: Cable = {
      id: 'c1',
      junctionBoxId: 'panel',
      anchor: 'middle-left',
      wireIds: ['w1'],
      role: 'breaker',
      closed: true,
    };
    const next = refreshCablePaths(minimalDiagram(wire, cable, breakerBox));
    expect(next.layout.exposedPaths?.w1).toBeUndefined();
    expect(next.layout.conduitStubPaths?.c1?.points?.length).toBe(5);
  });

  it('fills exposedPaths with 4 points per junction cable wire', () => {
    const wire: Wire = {
      id: 'w1',
      color: 'black',
      label: '',
      conduitId: null,
      cableId: 'c1',
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    };
    const cable: Cable = {
      id: 'c1',
      junctionBoxId: 'b1',
      anchor: 'middle-left',
      wireIds: ['w1'],
    };
    const next = refreshCablePaths(minimalDiagram(wire, cable));
    const pts = next.layout.exposedPaths?.w1?.points;
    expect(pts).toBeDefined();
    expect(pts!.length).toBe(4);
  });

  it('fills conduitStubPaths with 5 points for the cable sheath stub', () => {
    const wire: Wire = {
      id: 'w1',
      color: 'black',
      label: '',
      conduitId: null,
      cableId: 'c1',
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    };
    const cable: Cable = {
      id: 'c1',
      junctionBoxId: 'b1',
      anchor: 'middle-left',
      wireIds: ['w1'],
    };
    const next = refreshCablePaths(minimalDiagram(wire, cable));
    const pts = next.layout.conduitStubPaths?.c1?.points;
    expect(pts).toBeDefined();
    expect(pts!.length).toBe(5);
  });

  it('drops exposedPaths entries for wires no longer on a valid cable', () => {
    const wire: Wire = {
      id: 'w1',
      color: 'black',
      label: '',
      conduitId: null,
      cableId: 'c1',
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    };
    const cable: Cable = {
      id: 'c1',
      junctionBoxId: 'b1',
      anchor: 'middle-left',
      wireIds: ['w1'],
    };
    let d = minimalDiagram(wire, cable);
    d = refreshCablePaths(d);
    expect(d.layout.exposedPaths?.w1?.points?.length).toBe(4);

    d = {
      ...d,
      cables: [],
      layout: {
        ...d.layout,
        exposedPaths: { ...d.layout.exposedPaths },
        conduitStubPaths: { ...d.layout.conduitStubPaths },
      },
    };
    d = refreshCablePaths(d);
    expect(d.layout.exposedPaths?.w1).toBeUndefined();
  });
});

describe('cable exposed + stub joints', () => {
  const cableWireSample: Wire = {
    id: 'w1',
    color: 'black',
    label: '',
    conduitId: null,
    cableId: 'c1',
    breakerId: null,
    hubId: null,
    deviceNodeId: null,
    manualDirection: null,
  };
  const cableSample: Cable = {
    id: 'c1',
    junctionBoxId: 'b1',
    anchor: 'middle-left',
    wireIds: ['w1'],
  };

  it('moves an exposed wire joint interior point', () => {
    let d = refreshCablePaths(minimalDiagram(cableWireSample, cableSample));
    const path0 = d.layout.exposedPaths?.w1?.points!;
    expect(path0.length).toBe(4);
    const index = 1;
    const nx = path0[index]!.x + 24;
    const ny = path0[index]!.y;
    d = moveExposedJoint(d, 'w1', index, nx, ny);
    const pts = d.layout.exposedPaths?.w1?.points!;
    expect(pts[index]!.x).toBeCloseTo(Math.round(nx / GRID_SIZE) * GRID_SIZE);
    expect(pts[0]).toEqual(path0[0]);
    expect(conduitStubResolvedPath(d, 'c1')?.length).toBe(5);
  });

  it('updates conduit stub bends while pinning the sheath start at cable center when unconnected', () => {
    let d = refreshCablePaths(minimalDiagram(cableWireSample, cableSample));
    const path0 = d.layout.conduitStubPaths?.c1?.points!;
    const index = 1;
    const shifted = moveConduitStubJoint(
      d,
      'c1',
      index,
      path0[index]!.x,
      path0[index]!.y + 48,
    );
    const pts = shifted.layout.conduitStubPaths?.c1?.points!;
    expect(pts[0]).toEqual(path0[0]);
    expect(pts[index]!.y).not.toBe(path0[index]!.y);
  });

  it('allows dragging the stub tip when connected to a conduit run', () => {
    let d = createEmptyJob().diagram;
    d = addJunctionBox(d, GRID_SIZE * 15, GRID_SIZE * 15);
    d = addJunctionBox(d, GRID_SIZE * 50, GRID_SIZE * 15);
    const [boxA, boxB] = d.junctionBoxes.filter((b) => b.type === 'normal');
    d = addCable(d, {
      junctionBoxId: boxA!.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    d = addCable(d, {
      junctionBoxId: boxB!.id,
      anchor: 'middle-left',
      wireColors: ['black'],
    });
    const cabA = d.cables.find((c) => c.junctionBoxId === boxA!.id)!;
    const cabB = d.cables.find((c) => c.junctionBoxId === boxB!.id)!;
    d = connectConduitRun(d, cabA.id, { kind: 'cable', cableId: cabB.id });
    const run = d.conduitRuns[0]!;

    const stubBefore = d.layout.conduitStubPaths?.[cabA.id]?.points!;
    const tipIndex = stubBefore.length - 1;
    const nx = stubBefore[tipIndex]!.x + 48;
    const ny = stubBefore[tipIndex]!.y + 24;

    d = refreshConduitRunPaths(moveConduitStubJoint(d, cabA.id, tipIndex, nx, ny));

    const stubAfter = d.layout.conduitStubPaths?.[cabA.id]?.points!;
    expect(stubAfter[tipIndex]!.x).toBeCloseTo(Math.round(nx / GRID_SIZE) * GRID_SIZE);
    expect(stubAfter[tipIndex]!.y).toBeCloseTo(Math.round(ny / GRID_SIZE) * GRID_SIZE);
    expect(stubAfter[0]).toEqual(stubBefore[0]);

    const runPath = d.layout.conduitRunPaths?.[run.id]?.points!;
    expect(runPath[0]).toEqual(stubAfter[tipIndex]);
  });
});
