import { describe, it, expect } from 'vitest';
import {
  addJunctionBox,
  addLocalConduit,
  addWireLinkToDiagram,
  deleteConduit,
  deleteJunctionBox,
  deleteWire,
  deleteWireLink,
  updateConduit,
  updateJunctionBox,
} from '../mutations';
import { addCable } from '../cable-mutations';
import { breakerPresetWireColors } from '../breaker-cable';
import { createEmptyJob } from '../defaults';

describe('delete mutations', () => {
  it('deleteWireLink removes only that link', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black', 'white'],
    });
    const [wA, wB] = diagram.wires;
    diagram = addWireLinkToDiagram(diagram, wA!.id, 'end', wB!.id, 'end');
    const linkId = diagram.wireLinks[0]!.id;

    const next = deleteWireLink(diagram, linkId);
    expect(next.wireLinks).toHaveLength(0);
    expect(next.wires).toHaveLength(2);
  });

  it('deleteWire removes wire and its links', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black', 'red'],
    });
    const black = diagram.wires.find((w) => w.color === 'black')!;
    const red = diagram.wires.find((w) => w.color === 'red')!;
    diagram = addWireLinkToDiagram(diagram, black.id, 'end', red.id, 'end');

    const next = deleteWire(diagram, black.id);
    expect(next.wires).toHaveLength(1);
    expect(next.wires[0]!.id).toBe(red.id);
    expect(next.wireLinks).toHaveLength(0);
    expect(next.conduits[0]!.wireIds).toEqual([red.id]);
  });

  it('deleteWire rejects breaker cable wires', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addCable(diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: breakerPresetWireColors('twoWire'),
    });
    const wireId = diagram.cables[0]!.wireIds[0]!;
    expect(() => deleteWire(diagram, wireId)).toThrow(/breaker cable/i);
  });

  it('updateJunctionBox and updateConduit change labels', () => {
    let diagram = createEmptyJob().diagram;
    const boxId = diagram.junctionBoxes[0]!.id;
    diagram = updateJunctionBox(diagram, boxId, { label: 'Main panel' });
    expect(diagram.junctionBoxes[0]!.label).toBe('Main panel');

    diagram = addJunctionBox(diagram, 400, 300);
    const normalId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: normalId,
      anchor: 'bottom-center',
      wireColors: ['black'],
    });
    const conduitId = diagram.conduits.find((c) => c.kind === 'local')!.id;
    diagram = updateConduit(diagram, conduitId, { label: 'Feeder north' });
    expect(diagram.conduits[0]!.label).toBe('Feeder north');
  });

  it('deleteConduit removes bundle and wires', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black', 'white', 'red'],
    });
    const conduitId = diagram.conduits[0]!.id;
    const next = deleteConduit(diagram, conduitId);
    expect(next.conduits).toHaveLength(0);
    expect(next.wires).toHaveLength(0);
    expect(next.layout.conduitPaths[conduitId]).toBeUndefined();
  });

  it('deleteJunctionBox removes the box and its conduits and hubs', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxId,
      anchor: 'top-center',
      wireColors: ['black'],
    });

    const next = deleteJunctionBox(diagram, boxId);
    expect(next.junctionBoxes.some((b) => b.id === boxId)).toBe(false);
    expect(next.conduits).toHaveLength(0);
    expect(next.wires).toHaveLength(0);
    expect(next.junctionBoxes).toHaveLength(1);
  });
});
