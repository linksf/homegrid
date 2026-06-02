import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import { addLightBulb, addSwitch } from '../../domain/device-mutations';
import { LIGHT_BULB_RADIUS } from '../../domain/device-node-geometry';
import { diagramContentBounds, selectionContentBounds } from '../diagram-bounds';
import { emptySelection, setSingleLightBulb } from '../diagram-selection';

function contains(outer: { x: number; y: number; width: number; height: number }, inner: { x: number; y: number; width: number; height: number }) {
  return (
    outer.x <= inner.x + 1e-6 &&
    outer.y <= inner.y + 1e-6 &&
    outer.x + outer.width >= inner.x + inner.width - 1e-6 &&
    outer.y + outer.height >= inner.y + inner.height - 1e-6
  );
}

describe('diagramContentBounds', () => {
  it('returns bounds covering the initial breaker box', () => {
    const diagram = createEmptyJob().diagram;
    const bounds = diagramContentBounds(diagram);
    expect(bounds).not.toBeNull();
    const box = diagram.junctionBoxes[0]!;
    expect(contains(bounds!, box)).toBe(true);
  });

  it('expands to include a far-away device', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 3000, 2000);
    const bulb = diagram.lightBulbs[0]!;
    const bulbRect = { x: bulb.x, y: bulb.y, width: LIGHT_BULB_RADIUS * 2, height: LIGHT_BULB_RADIUS * 2 };
    const bounds = diagramContentBounds(diagram)!;
    expect(contains(bounds, bulbRect)).toBe(true);
    expect(contains(bounds, diagram.junctionBoxes[0]!)).toBe(true);
  });
});

describe('selectionContentBounds', () => {
  it('is null when nothing fittable is selected', () => {
    const diagram = createEmptyJob().diagram;
    expect(selectionContentBounds(diagram, emptySelection())).toBeNull();
  });

  it('returns just the selected device bounds', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 500, 500, 2);
    diagram = addLightBulb(diagram, 3000, 2000);
    const bulb = diagram.lightBulbs[0]!;
    const bounds = selectionContentBounds(diagram, setSingleLightBulb(bulb.id))!;
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeCloseTo(bulb.x);
    expect(bounds.y).toBeCloseTo(bulb.y);
    expect(bounds.width).toBeCloseTo(LIGHT_BULB_RADIUS * 2);
  });
});
