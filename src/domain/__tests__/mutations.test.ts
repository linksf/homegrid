import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import { createEmptyJob } from '../defaults';
import { addBreaker, addJunctionBox, MIN_JUNCTION_SIZE, moveJunctionBox, resizeJunctionBox } from '../mutations';
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
