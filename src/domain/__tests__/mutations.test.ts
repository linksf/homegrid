import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import { createEmptyJob } from '../defaults';
import { addBreaker } from '../mutations';
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
