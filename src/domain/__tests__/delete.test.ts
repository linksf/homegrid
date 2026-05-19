import { describe, it, expect } from 'vitest';
import {
  addBreaker,
  addJunctionBox,
  addLocalConduit,
  addWireLinkToDiagram,
  deleteConduit,
  deleteWire,
  deleteWireLink,
  updateConduit,
  updateJunctionBox,
} from '../mutations';
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
    diagram = addWireLinkToDiagram(diagram, wA!.id, wB!.id);
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
    diagram = addWireLinkToDiagram(diagram, black.id, red.id);

    const next = deleteWire(diagram, black.id);
    expect(next.wires).toHaveLength(1);
    expect(next.wires[0]!.id).toBe(red.id);
    expect(next.wireLinks).toHaveLength(0);
    expect(next.conduits[0]!.wireIds).toEqual([red.id]);
  });

  it('deleteWire rejects breaker conduit wires', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addBreaker(diagram, panelId);
    const wireId = diagram.conduits[0]!.wireIds[0]!;
    expect(() => deleteWire(diagram, wireId)).toThrow(/breaker conduit/i);
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
});
