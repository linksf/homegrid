import { describe, expect, it } from 'vitest';
import { addCable } from '../../domain/cable-mutations';
import { addJunctionBox, addLocalConduit } from '../../domain/mutations';
import { addLightBulb } from '../../domain/device-mutations';
import { createEmptyJob } from '../../domain/defaults';
import { collectMarqueeSelection, marqueeModeFromDrag } from '../marquee-selection';

describe('marquee selection', () => {
  it('uses crossing mode when dragging left to right', () => {
    expect(marqueeModeFromDrag(100, 200)).toBe('crossing');
  });

  it('uses window mode when dragging right to left', () => {
    expect(marqueeModeFromDrag(200, 100)).toBe('window');
  });

  it('crossing select hits partially overlapped boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    const sel = collectMarqueeSelection(diagram, 280, 280, 320, 320);
    expect(sel.junctionBoxes.has(box.id)).toBe(true);
  });

  it('window select ignores partially overlapped boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    const sel = collectMarqueeSelection(diagram, 320, 320, 280, 280);
    expect(sel.junctionBoxes.has(box.id)).toBe(false);
  });

  it('window select includes fully enclosed boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    const sel = collectMarqueeSelection(diagram, 200, 200, 500, 500);
    expect(sel.junctionBoxes.has(box.id)).toBe(true);
  });

  it('crossing select picks wires that intersect the marquee', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black'],
    });
    const wireId = diagram.wires[0]!.id;

    const sel = collectMarqueeSelection(diagram, 250, 200, 350, 400);
    expect(sel.wires.has(wireId)).toBe(true);
  });

  it('selects light bulbs touched by a crossing marquee', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 400, 400);
    const bulbId = diagram.lightBulbs[0]!.id;

    const sel = collectMarqueeSelection(diagram, 380, 380, 430, 430);
    expect(sel.lightBulbs.has(bulbId)).toBe(true);
  });

  it('window select collects path anchors on cable exposed wires without throwing', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });

    const sel = collectMarqueeSelection(diagram, 200, 200, 500, 500);
    expect(sel.pathAnchors.size).toBeGreaterThan(0);
  });
});
