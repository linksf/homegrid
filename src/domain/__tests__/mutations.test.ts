import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import { createEmptyJob } from '../defaults';
import {
  addJunctionBox,
  addLocalConduit,
  addSpanConduit,
  addWireLinkToDiagram,
  MIN_JUNCTION_SIZE,
  moveJunctionBox,
  LOCAL_CONDUIT_STUB_LENGTH,
  resizeJunctionBox,
  updateWire,
} from '../mutations';
import { addCable } from '../cable-mutations';
import { breakerPresetWireColors } from '../breaker-cable';
import { anchorPoint } from '../anchors';
import { snapGridCoord, GRID_SIZE } from '../grid';

describe('addCable on breaker panel', () => {
  it('creates a breaker cable with wires that seed direction', () => {
    const job = createEmptyJob('Test');
    const panelId = job.diagram.junctionBoxes[0]!.id;
    const next = addCable(job.diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: breakerPresetWireColors('twoWire'),
    });

    expect(next.breakers).toHaveLength(0);
    const cable = next.cables[0]!;
    expect(cable.role).toBe('breaker');
    expect(cable.junctionBoxId).toBe(panelId);

    expect(next.wires).toHaveLength(2);
    const black = next.wires.find((w) => w.color === 'black')!;
    const white = next.wires.find((w) => w.color === 'white')!;
    expect(black.cableId).toBe(cable.id);
    expect(white.cableId).toBe(cable.id);
    expect(black.conduitId).toBeNull();

    const resolved = resolveDirections(next);
    expect(resolved.get(black.id)?.resolvedDirection).toBe('away');
    expect(resolved.get(white.id)?.resolvedDirection).toBe('toward');
    expect(resolved.get(black.id)?.directionSource).toBe('breaker');
  });

  it('creates a three-wire breaker cable with both hots seeded away', () => {
    const job = createEmptyJob('Test');
    const panelId = job.diagram.junctionBoxes[0]!.id;
    const next = addCable(job.diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: breakerPresetWireColors('threeWire'),
    });

    expect(next.wires).toHaveLength(3);
    const colors = next.wires.map((w) => w.color);
    expect(colors).toEqual(['white', 'black', 'red']);

    const resolved = resolveDirections(next);
    const black = next.wires.find((w) => w.color === 'black')!;
    const white = next.wires.find((w) => w.color === 'white')!;
    const red = next.wires.find((w) => w.color === 'red')!;
    expect(resolved.get(black.id)?.resolvedDirection).toBe('away');
    expect(resolved.get(red.id)?.resolvedDirection).toBe('away');
    expect(resolved.get(white.id)?.resolvedDirection).toBe('toward');
    expect(resolved.get(black.id)?.directionSource).toBe('breaker');
    expect(resolved.get(red.id)?.directionSource).toBe('breaker');
  });
});

describe('updateWire', () => {
  it('sets label and manual direction only when not breaker-locked', () => {
    const job = createEmptyJob('U');
    const panelId = job.diagram.junctionBoxes[0]!.id;
    let diagram = addCable(job.diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: breakerPresetWireColors('twoWire'),
    });
    const breakerCable = diagram.cables[0]!;
    const blackId = breakerCable.wireIds.find(
      (id) => diagram.wires.find((w) => w.id === id)?.color === 'black',
    )!;

    diagram = updateWire(diagram, blackId, { label: 'Renamed hot', manualDirection: 'toward' });
    const black = diagram.wires.find((w) => w.id === blackId)!;
    expect(black.label).toBe('Renamed hot');
    expect(black.manualDirection).toBeNull();

    diagram = addJunctionBox(diagram, 300, 300);
    diagram = addLocalConduit(diagram, {
      junctionBoxId: diagram.junctionBoxes.find((b) => b.type === 'normal')!.id,
      anchor: 'top-center',
      wireColors: ['red'],
    });
    const redWire = diagram.wires.find((w) => w.color === 'red' && w.conduitId)!;
    diagram = updateWire(diagram, redWire.id, { manualDirection: 'away', label: 'Traveler A' });
    const updated = diagram.wires.find((w) => w.id === redWire.id)!;
    expect(updated.manualDirection).toBe('away');
    expect(updated.label).toBe('Traveler A');
  });
});

describe('junction geometry mutations', () => {
  it('adds a centered normal junction box with incremental label', () => {
    let diagram = createEmptyJob().diagram;

    diagram = addJunctionBox(diagram, 200, 200);
    diagram = addJunctionBox(diagram, 480, 200);

    const normals = diagram.junctionBoxes.filter((b) => b.type === 'normal');
    expect(normals).toHaveLength(2);
    expect(normals[0]!.label).toBe('');
    expect(normals[1]!.label).toBe('');

    const first = normals[0]!;
    expect(first.width).toBeGreaterThan(MIN_JUNCTION_SIZE.width);

    /** Center lands on a grid intersection after snapping. */
    const cx = first.x + first.width / 2;
    const cy = first.y + first.height / 2;
    expect(cx % GRID_SIZE).toBe(0);
    expect(cy % GRID_SIZE).toBe(0);
  });

  it('mutates junction position and clamps resize minimums', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 0, 0);
    const id = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;

    diagram = moveJunctionBox(diagram, id, 111, 222);
    const moved = diagram.junctionBoxes.find((b) => b.id === id)!;
    expect(moved.x).toBe(snapGridCoord(111));
    expect(moved.y).toBe(snapGridCoord(222));

    diagram = resizeJunctionBox(diagram, id, { width: 10, height: MIN_JUNCTION_SIZE.height - 1 });
    const resized = diagram.junctionBoxes.find((b) => b.id === id)!;
    expect(resized.width).toBeGreaterThanOrEqual(MIN_JUNCTION_SIZE.width);
    expect(resized.height).toBeGreaterThanOrEqual(MIN_JUNCTION_SIZE.height);
  });

  it('moveJunctionBox shifts conduit paths and wire links on that box', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxA = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addJunctionBox(diagram, 900, 300);
    const boxB = diagram.junctionBoxes.find((b) => b.id !== boxA.id && b.type === 'normal')!;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const localWireId = diagram.conduits[0]!.wireIds[0]!;
    const localPathBefore = diagram.layout.conduitPaths[diagram.conduits[0]!.id]!.points;

    diagram = addSpanConduit(diagram, {
      junctionBoxIdA: boxA.id,
      anchorA: 'top-center',
      junctionBoxIdB: boxB.id,
      anchorB: 'top-center',
      wireColors: ['red'],
    });
    const spanConduitId = diagram.conduits.find((c) => c.kind === 'span')!.id;
    const spanWireId = diagram.conduits.find((c) => c.kind === 'span')!.wireIds[0]!;
    const spanPathBefore = diagram.layout.conduitPaths[spanConduitId]!.points;
    const spanWireBefore = diagram.layout.wirePaths![spanWireId]!.points;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['white'],
    });
    const remoteWireId = diagram.conduits.find((c) => c.kind === 'local' && c.junctionBoxId === boxB.id)!.wireIds[0]!;

    diagram = addWireLinkToDiagram(diagram, localWireId, 'end', remoteWireId, 'end');
    const linkId = diagram.wireLinks[0]!.id;

    const dx = 50;
    const dy = -30;
    const targetX = snapGridCoord(boxA.x + dx);
    const targetY = snapGridCoord(boxA.y + dy);
    diagram = moveJunctionBox(diagram, boxA.id, targetX, targetY);
    const actualDx = targetX - boxA.x;
    const actualDy = targetY - boxA.y;

    const localPathAfter = diagram.layout.conduitPaths[diagram.conduits.find((c) => c.kind === 'local' && c.junctionBoxId === boxA.id)!.id]!.points;
    expect(localPathAfter[0]!.x).toBeCloseTo(localPathBefore[0]!.x + actualDx);
    expect(localPathAfter[0]!.y).toBeCloseTo(localPathBefore[0]!.y + actualDy);

    const spanPathAfter = diagram.layout.conduitPaths[spanConduitId]!.points;
    expect(spanPathAfter.length).toBeGreaterThanOrEqual(2);
    expect(spanPathAfter[0]!.x).toBeCloseTo(spanPathBefore[0]!.x + actualDx);
    expect(spanPathAfter[0]!.y).toBeCloseTo(spanPathBefore[0]!.y + actualDy);
    for (let i = 1; i < spanPathAfter.length; i++) {
      const a = spanPathAfter[i - 1]!;
      const b = spanPathAfter[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }

    const spanWireAfter = diagram.layout.wirePaths![spanWireId]!.points;
    expect(spanWireAfter).toHaveLength(5);
    expect(spanWireAfter[0]!.x).toBeCloseTo(spanWireBefore[0]!.x + actualDx);
    expect(spanWireAfter[0]!.y).toBeCloseTo(spanWireBefore[0]!.y + actualDy);

    const linkPathAfter = diagram.layout.wireLinkPaths[linkId]!.points;
    expect(linkPathAfter.length).toBe(5);

    const localWireAfter = diagram.layout.wirePaths![localWireId]!.points;
    expect(localWireAfter[0]!.x).toBeCloseTo(localPathAfter[0]!.x);
    expect(localWireAfter[0]!.y).toBeCloseTo(localPathAfter[0]!.y);
  });
});

describe('conduit mutations', () => {
  it('rejects local conduits on the breaker panel', () => {
    const diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    expect(() =>
      addLocalConduit(diagram, {
        junctionBoxId: panelId,
        anchor: 'bottom-center',
        wireColors: ['black'],
      }),
    ).toThrow(/breaker/i);
  });

  it('adds a local conduit with wires and a short stub pointing into the box', () => {
    const job = createEmptyJob('C');
    let diagram = job.diagram;
    diagram = addJunctionBox(diagram, 400, 400);
    const normal = diagram.junctionBoxes.find((b) => b.type === 'normal');
    expect(normal).toBeDefined();

    const anchor = 'middle-right' as const;
    const next = addLocalConduit(diagram, {
      junctionBoxId: normal!.id,
      anchor,
      wireColors: ['black', 'red'],
    });

    expect(next.conduits).toHaveLength(1);
    const conduit = next.conduits[0]!;
    expect(conduit.kind).toBe('local');
    expect(next.wires.filter((w) => w.conduitId === conduit.id)).toHaveLength(2);
    const path = next.layout.conduitPaths[conduit.id]?.points;
    expect(path?.length).toBeGreaterThanOrEqual(2);

    const start = anchorPoint(normal!, anchor);
    const tip = path![path!.length - 1]!;
    const center = { x: normal!.x + normal!.width / 2, y: normal!.y + normal!.height / 2 };
    const startDist = Math.hypot(start.x - center.x, start.y - center.y);
    const tipDist = Math.hypot(tip.x - center.x, tip.y - center.y);
    expect(tipDist).toBeLessThan(startDist);
    expect(Math.hypot(tip.x - start.x, tip.y - start.y)).toBeLessThanOrEqual(LOCAL_CONDUIT_STUB_LENGTH + 20);
  });

  it('adds a span conduit between two boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 500, 500);
    diagram = addJunctionBox(diagram, 900, 500);

    const normals = diagram.junctionBoxes.filter((j) => j.type === 'normal');
    expect(normals.length).toBeGreaterThanOrEqual(2);

    const next = addSpanConduit(diagram, {
      junctionBoxIdA: normals[0]!.id,
      anchorA: 'middle-right',
      junctionBoxIdB: normals[1]!.id,
      anchorB: 'middle-left',
      wireColors: ['white'],
    });

    expect(next.conduits[0]!.kind).toBe('span');
    const path = next.layout.conduitPaths[next.conduits[0]!.id]?.points;
    expect(path!.length).toBeGreaterThanOrEqual(2);
    const wireId = next.conduits[0]!.wireIds[0]!;
    expect(next.layout.wirePaths?.[wireId]?.points).toHaveLength(5);
  });
});

describe('addWireLinkToDiagram cable endpoints', () => {
  it('rejects linking the wall-side start of cable wires', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 400, 300);
    const box1 = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addJunctionBox(diagram, 800, 300);
    const box2 = diagram.junctionBoxes.filter((b) => b.type === 'normal').find((b) => b.id !== box1.id)!;

    diagram = addCable(diagram, {
      junctionBoxId: box1.id,
      anchor: 'top-center',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: box2.id,
      anchor: 'top-center',
      wireColors: ['black', 'white'],
    });

    const w1 = diagram.cables[0]!.wireIds[0]!;
    const w2 = diagram.cables[1]!.wireIds[0]!;

    expect(() => addWireLinkToDiagram(diagram, w1, 'start', w2, 'end')).toThrow(/wall side/);

    const linked = addWireLinkToDiagram(diagram, w1, 'end', w2, 'end');
    expect(linked.wireLinks).toHaveLength(1);
  });
});
