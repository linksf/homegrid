import { describe, expect, it } from 'vitest';
import { addJunctionBox, addLocalConduit } from '../mutations';
import { createEmptyJob } from '../defaults';
import { wireLinkEndpoint, wireWorldPolyline } from '../wire-geometry';

describe('wireLinkEndpoint', () => {
  it('uses the far end of the wire run, not the corner vertex on L-shaped paths', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'bottom-right',
      wireColors: ['black'],
    });
    const wire = diagram.wires[0]!;
    const poly = wireWorldPolyline(diagram, wire.id)!;
    expect(poly.length).toBeGreaterThanOrEqual(3);

    const endpoint = wireLinkEndpoint(diagram, wire)!;
    const tip = poly[poly.length - 1]!;
    const corner = poly[1]!;

    expect(endpoint.x).toBeCloseTo(tip.x);
    expect(endpoint.y).toBeCloseTo(tip.y);
    expect(Math.hypot(endpoint.x - corner.x, endpoint.y - corner.y)).toBeGreaterThan(10);
  });
});
