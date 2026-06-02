import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import {
  addHub,
  addHubBridge,
  addHubConduit,
  addJunctionBox,
  addLocalConduit,
  addWireLinkToDiagram,
  attachWireToHub,
  wireLinkForWire,
} from '../mutations';

describe('hubs', () => {
  it('addHubBridge ties hubs with conduit wires and bundled hub stubs', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    diagram = addJunctionBox(diagram, 700, 200);
    const boxA = diagram.junctionBoxes.find((b) => b.type === 'normal' && b.x < 500)!;
    const boxB = diagram.junctionBoxes.find((b) => b.type === 'normal' && b.x > 500)!;

    diagram = addHub(diagram, boxA.id);
    diagram = addHub(diagram, boxB.id);
    const hubA = diagram.hubs.find((h) => h.junctionBoxId === boxA.id)!;
    const hubB = diagram.hubs.find((h) => h.junctionBoxId === boxB.id)!;

    diagram = addHubConduit(diagram, { hubId: hubA.id, wireColors: ['black', 'red'] });

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['white'],
    });
    const w3 = diagram.conduits.find((c) => c.kind === 'local' && c.junctionBoxId === boxB.id)!.wireIds[0]!;

    diagram = attachWireToHub(diagram, hubB.id, w3);
    diagram = addHubBridge(diagram, hubA.id, hubB.id);

    expect(diagram.wires.filter((w) => w.hubId === hubA.id)).toHaveLength(2);
    expect(diagram.hubBridges).toHaveLength(1);
    const bridgePts = diagram.layout.hubBridgePaths[diagram.hubBridges[0]!.id]?.points;
    expect(bridgePts!.length).toBeGreaterThanOrEqual(2);
  });

  it('allows multiple wires on the same hub (wire-nut splice)', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hub = diagram.hubs[0]!;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'bottom-center',
      wireColors: ['black', 'white'],
    });
    const [a, b] = diagram.conduits[0]!.wireIds;
    diagram = attachWireToHub(diagram, hub.id, a);
    diagram = attachWireToHub(diagram, hub.id, b);
    expect(diagram.wires.filter((w) => w.hubId === hub.id)).toHaveLength(2);
  });

  it('rejects wire link when wire is on a hub', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hub = diagram.hubs[0]!;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'bottom-center',
      wireColors: ['black', 'white'],
    });
    const [a, b] = diagram.conduits[0]!.wireIds;
    diagram = attachWireToHub(diagram, hub.id, a);

    expect(() => addWireLinkToDiagram(diagram, a, 'end', b, 'end')).toThrow(/hub/i);
  });

  it('places hubs on distinct slots up to four per junction box', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;

    diagram = addHub(diagram, boxId);
    diagram = addHub(diagram, boxId);
    diagram = addHub(diagram, boxId);
    diagram = addHub(diagram, boxId);

    const slots = diagram.hubs.filter((h) => h.junctionBoxId === boxId).map((h) => h.slot);
    expect(slots).toHaveLength(4);
    expect(new Set(slots).size).toBe(4);

    expect(() => addHub(diagram, boxId)).toThrow(/maximum of 4/i);
  });

  it('allows only one wire-to-wire link per wire end', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 0, 0);
    diagram = addJunctionBox(diagram, 400, 0);
    const boxes = diagram.junctionBoxes.filter((b) => b.type === 'normal');

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[0]!.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const w1 = diagram.conduits[0]!.wireIds[0]!;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[1]!.id,
      anchor: 'middle-left',
      wireColors: ['black'],
    });
    const w2 = diagram.conduits[1]!.wireIds[0]!;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[1]!.id,
      anchor: 'top-center',
      wireColors: ['red'],
    });
    const w3 = diagram.conduits[2]!.wireIds[0]!;

    diagram = addWireLinkToDiagram(diagram, w1, 'end', w2, 'end');
    expect(wireLinkForWire(diagram, w1)).toBeDefined();

    expect(() => addWireLinkToDiagram(diagram, w1, 'end', w3, 'end')).toThrow(/already linked/i);
    expect(() => addWireLinkToDiagram(diagram, w1, 'start', w3, 'end')).toThrow(/cannot form a wire link/i);
    expect(diagram.wireLinks).toHaveLength(1);
  });
});
