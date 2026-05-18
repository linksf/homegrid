import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import { createEmptyJob } from '../defaults';
import { addBreaker, addJunctionBox, addLocalConduit, addSpanConduit, MIN_JUNCTION_SIZE, moveJunctionBox, resizeJunctionBox, updateWire } from '../mutations';
import type { Diagram } from '../types';

describe('addBreaker', () => {
  it('creates breaker plus black and white wires locked to breakerId', () => {
    const job = createEmptyJob('Test');
    const panelId = job.diagram.junctionBoxes[0]!.id;
    const next = addBreaker(job.diagram, panelId);

    expect(next.breakers).toHaveLength(1);
    const br = next.breakers[0]!;
    expect(br.junctionBoxId).toBe(panelId);

    expect(next.wires).toHaveLength(2);
    const black = next.wires.find((w) => w.id === br.blackWireId);
    const white = next.wires.find((w) => w.id === br.whiteWireId);
    expect(black).toBeDefined();
    expect(white).toBeDefined();
    expect(black!.color).toBe('black');
    expect(white!.color).toBe('white');
    expect(black!.conduitId).toBeNull();
    expect(white!.conduitId).toBeNull();
    expect(black!.breakerId).toBe(br.id);
    expect(white!.breakerId).toBe(br.id);
    expect(black!.manualDirection).toBeNull();
    expect(white!.manualDirection).toBeNull();
    expect(black!.label).toBe('Black #1');
    expect(white!.label).toBe('White #1');

    const resolved = resolveDirections(next);
    expect(resolved.get(br.blackWireId)?.resolvedDirection).toBe('away');
    expect(resolved.get(br.whiteWireId)?.resolvedDirection).toBe('toward');
    expect(resolved.get(br.blackWireId)?.directionSource).toBe('breaker');
    expect(resolved.get(br.whiteWireId)?.directionSource).toBe('breaker');
  });

  it('throws when breaker box id is missing or not a breaker panel', () => {
    const job = createEmptyJob();
    expect(() => addBreaker(job.diagram, 'no-such-box')).toThrow();
    const d: Diagram = {
      ...job.diagram,
      junctionBoxes: [{ ...job.diagram.junctionBoxes[0]!, type: 'normal' }],
    };
    expect(() => addBreaker(d, d.junctionBoxes[0]!.id)).toThrow();
  });
});

describe('updateWire', () => {
  it('sets label and manual direction only when not breaker-locked', () => {
    const job = createEmptyJob('U');
    const panelId = job.diagram.junctionBoxes[0]!.id;
    let diagram = addBreaker(job.diagram, panelId);
    const br = diagram.breakers[0]!;
    const blackId = br.blackWireId;

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
    expect(normals[0]!.label).toBe('J-box 1');
    expect(normals[1]!.label).toBe('J-box 2');

    const first = normals[0]!;
    expect(first.width).toBeGreaterThan(MIN_JUNCTION_SIZE.width);

    /** Center anchoring expectation */
    expect(first.x).toBeCloseTo(200 - first.width / 2);
    expect(first.y).toBeCloseTo(200 - first.height / 2);
  });

  it('mutates junction position and clamps resize minimums', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 0, 0);
    const id = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;

    diagram = moveJunctionBox(diagram, id, 111, 222);
    const moved = diagram.junctionBoxes.find((b) => b.id === id)!;
    expect(moved.x).toBeCloseTo(111);
    expect(moved.y).toBeCloseTo(222);

    diagram = resizeJunctionBox(diagram, id, { width: 10, height: MIN_JUNCTION_SIZE.height - 1 });
    const resized = diagram.junctionBoxes.find((b) => b.id === id)!;
    expect(resized.width).toBeGreaterThanOrEqual(MIN_JUNCTION_SIZE.width);
    expect(resized.height).toBeGreaterThanOrEqual(MIN_JUNCTION_SIZE.height);
  });
});

describe('conduit mutations', () => {
  it('adds a local conduit with wires, layout, and outward stub path', () => {
    const job = createEmptyJob('C');
    let diagram = job.diagram;
    diagram = addJunctionBox(diagram, 400, 400);
    const normal = diagram.junctionBoxes.find((b) => b.type === 'normal');
    expect(normal).toBeDefined();

    const next = addLocalConduit(diagram, {
      junctionBoxId: normal!.id,
      anchor: 'middle-right',
      wireColors: ['black', 'red'],
    });

    expect(next.conduits).toHaveLength(1);
    const conduit = next.conduits[0]!;
    expect(conduit.kind).toBe('local');
    expect(next.wires.filter((w) => w.conduitId === conduit.id)).toHaveLength(2);
    const path = next.layout.conduitPaths[conduit.id]?.points;
    expect(path?.length).toBeGreaterThanOrEqual(2);
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
    expect(next.layout.conduitPaths[next.conduits[0]!.id]?.points).toHaveLength(2);
  });
});
