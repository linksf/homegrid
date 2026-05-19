import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import {
  addLightBulb,
  addSwitch,
  attachHubToDeviceNode,
  moveLightBulb,
  updateSwitch,
} from '../device-mutations';
import { addDeviceConduit, addHub, addJunctionBox, deviceConduitPathPoints } from '../mutations';

describe('lights and switches', () => {
  it('creates a light bulb with two terminals', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 200, 200);
    expect(diagram.lightBulbs).toHaveLength(1);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'lightBulb')).toHaveLength(2);
  });

  it('creates a switch with two or three terminals', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    expect(diagram.switches[0]!.terminalCount).toBe(2);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'switch')).toHaveLength(2);

    diagram = updateSwitch(diagram, diagram.switches[0]!.id, { terminalCount: 3 });
    expect(diagram.switches[0]!.terminalCount).toBe(3);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'switch')).toHaveLength(3);
  });

  it('adds a conduit bundle on a terminal', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 400, 400);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;

    diagram = addDeviceConduit(diagram, {
      deviceNodeId: node.id,
      wireColors: ['black', 'white'],
    });

    const conduit = diagram.conduits.find((c) => c.kind === 'device')!;
    expect(conduit.deviceNodeId).toBe(node.id);
    expect(conduit.wireIds).toHaveLength(2);
    expect(diagram.layout.conduitPaths[conduit.id]?.points.length).toBeGreaterThanOrEqual(2);
  });

  it('rebuilds device conduit paths when the device moves', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 400, 400);
    const bulb = diagram.lightBulbs[0]!;
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: node.id, wireColors: ['black'] });
    const conduitId = diagram.conduits.find((c) => c.kind === 'device')!.id;
    const before = diagram.layout.conduitPaths[conduitId]!.points[0]!;

    diagram = moveLightBulb(diagram, bulb.id, bulb.x + 80, bulb.y);
    const after = diagram.layout.conduitPaths[conduitId]!.points[0]!;
    expect(after.x).not.toBe(before.x);
  });

  it('device conduit stub runs outward from the terminal', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 200, 200);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    const points = deviceConduitPathPoints(diagram, node.id)!;
    const start = points[0]!;
    const end = points[points.length - 1]!;
    const stubLen = Math.hypot(end.x - start.x, end.y - start.y);
    expect(stubLen).toBeGreaterThan(40);
  });

  it('links a hub to a terminal via conduit wires', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hubId = diagram.hubs[0]!.id;
    diagram = addLightBulb(diagram, 400, 400);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: node.id, wireColors: ['black'] });
    const wireId = diagram.conduits.find((c) => c.kind === 'device')!.wireIds[0]!;
    diagram = attachHubToDeviceNode(diagram, hubId, node.id);

    const wire = diagram.wires.find((w) => w.id === wireId)!;
    expect(wire.hubId).toBe(hubId);
    expect(wire.deviceNodeId).toBeNull();
  });
});
