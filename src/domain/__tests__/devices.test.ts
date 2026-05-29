import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import {
  addLightBulb,
  addSwitch,
  addDimmerSwitch,
  addOutlet,
  attachHubToDeviceNode,
  attachWireToDeviceNode,
  moveLightBulb,
  updateDimmerSwitch,
  updateOutlet,
  updateSwitch,
} from '../device-mutations';
import { buildContinuityFinder, isOutletEnergized, terminalContinuityKey } from '../continuity';
import { addCable } from '../cable-mutations';
import { addDeviceConduit, addHub, addJunctionBox, attachWireToHub, deviceConduitPathPoints } from '../mutations';
import { hubWireDisplayPath } from '../hub-wire-geometry';

describe('lights and switches', () => {
  it('creates a light bulb with two terminals', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 200, 200);
    expect(diagram.lightBulbs).toHaveLength(1);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'lightBulb')).toHaveLength(2);
  });

  it('creates a switch with two, three, or four terminals', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    expect(diagram.switches[0]!.terminalCount).toBe(2);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'switch')).toHaveLength(2);

    diagram = updateSwitch(diagram, diagram.switches[0]!.id, { terminalCount: 3 });
    expect(diagram.switches[0]!.terminalCount).toBe(3);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'switch')).toHaveLength(3);

    diagram = updateSwitch(diagram, diagram.switches[0]!.id, { terminalCount: 4 });
    expect(diagram.switches[0]!.terminalCount).toBe(4);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'switch')).toHaveLength(4);
  });

  it('adds a single-wire stub conduit on a terminal', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 400, 400);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;

    diagram = addDeviceConduit(diagram, {
      deviceNodeId: node.id,
      wireColors: ['black'],
    });

    const conduit = diagram.conduits.find((c) => c.kind === 'device')!;
    expect(conduit.deviceNodeId).toBe(node.id);
    expect(conduit.wireIds).toHaveLength(1);
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

  it('connects a wire directly to a light terminal and allows hub on the same wire', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addCable(diagram, { junctionBoxId: panelId, anchor: 'middle-left', wireColors: ['black', 'white'] });
    const breakerCable = diagram.cables.find((c) => c.role === 'breaker')!;
    const hotWireId = breakerCable.wireIds.find(
      (id) => diagram.wires.find((w) => w.id === id)?.color === 'black',
    )!;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hubId = diagram.hubs[0]!.id;
    diagram = addLightBulb(diagram, 400, 400);
    const hotTerminal = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;

    diagram = attachWireToDeviceNode(diagram, hotTerminal.id, hotWireId, 'end');
    diagram = attachWireToHub(diagram, hubId, hotWireId);

    const wire = diagram.wires.find((w) => w.id === hotWireId)!;
    expect(wire.deviceNodeId).toBe(hotTerminal.id);
    expect(wire.hubId).toBe(hubId);
    expect(hubWireDisplayPath(diagram, hotWireId).length).toBeGreaterThanOrEqual(2);
    expect(diagram.layout.hubWirePaths?.[hotWireId]?.points?.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects second wire on same device terminal', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addCable(diagram, { junctionBoxId: panelId, anchor: 'middle-left', wireColors: ['black', 'white'] });
    const breakerCable = diagram.cables.find((c) => c.role === 'breaker')!;
    const [hotWireId, neutralWireId] = breakerCable.wireIds;
    diagram = addLightBulb(diagram, 400, 400);
    const hotTerminal = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;

    diagram = attachWireToDeviceNode(diagram, hotTerminal.id, hotWireId!, 'end');
    expect(() => attachWireToDeviceNode(diagram, hotTerminal.id, neutralWireId!, 'end')).toThrow(
      /already has a wire/i,
    );
  });

  it('rejects a stub conduit when terminal is already wired', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addCable(diagram, { junctionBoxId: panelId, anchor: 'middle-left', wireColors: ['black', 'white'] });
    const breakerCable = diagram.cables.find((c) => c.role === 'breaker')!;
    const wireId = breakerCable.wireIds.find(
      (id) => diagram.wires.find((w) => w.id === id)?.color === 'black',
    )!;
    diagram = addLightBulb(diagram, 400, 400);
    const terminal = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = attachWireToDeviceNode(diagram, terminal.id, wireId, 'end');
    expect(() => addDeviceConduit(diagram, { deviceNodeId: terminal.id, wireColors: ['black'] })).toThrow(
      /already has a wire/i,
    );
  });

  it('rejects multi-conductor device stub conduit', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 400, 400);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    expect(() => addDeviceConduit(diagram, { deviceNodeId: node.id, wireColors: ['black', 'white'] })).toThrow(
      /exactly one/i,
    );
  });
});

describe('dimmers and outlets', () => {
  it('creates a dimmer with two terminals', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addDimmerSwitch(diagram, 200, 200);
    expect(diagram.dimmerSwitches).toHaveLength(1);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'dimmerSwitch')).toHaveLength(2);
  });

  it('connects dimmer terminals when level is above zero', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addDimmerSwitch(diagram, 200, 200);
    const dimId = diagram.dimmerSwitches[0]!.id;
    const nodes = diagram.deviceNodes.filter((n) => n.deviceKind === 'dimmerSwitch' && n.deviceId === dimId);

    let uf = buildContinuityFinder(diagram);
    expect(uf.find(terminalContinuityKey(nodes[0]!.id))).not.toBe(
      uf.find(terminalContinuityKey(nodes[1]!.id)),
    );

    diagram = updateDimmerSwitch(diagram, dimId, { level: 50 });
    uf = buildContinuityFinder(diagram);
    expect(uf.find(terminalContinuityKey(nodes[0]!.id))).toBe(
      uf.find(terminalContinuityKey(nodes[1]!.id)),
    );
    expect(diagram.dimmerSwitches[0]!.level).toBe(50);
  });

  it('creates standard and passthrough outlets with correct terminal counts', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addOutlet(diagram, 100, 100, false);
    expect(diagram.outlets[0]!.passthrough).toBe(false);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'outlet')).toHaveLength(2);

    diagram = addOutlet(diagram, 300, 100, true);
    expect(diagram.outlets[1]!.passthrough).toBe(true);
    expect(diagram.deviceNodes.filter((n) => n.deviceKind === 'outlet')).toHaveLength(6);
  });

  it('passthrough outlet connects hot and neutral pairs separately', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addOutlet(diagram, 200, 200, true);
    const outletId = diagram.outlets[0]!.id;
    const nodes = diagram.deviceNodes.filter((n) => n.deviceKind === 'outlet' && n.deviceId === outletId);
    const bySlot = new Map(nodes.map((n) => [n.slot, n]));
    const uf = buildContinuityFinder(diagram);

    expect(uf.find(terminalContinuityKey(bySlot.get(0)!.id))).toBe(
      uf.find(terminalContinuityKey(bySlot.get(1)!.id)),
    );
    expect(uf.find(terminalContinuityKey(bySlot.get(2)!.id))).toBe(
      uf.find(terminalContinuityKey(bySlot.get(3)!.id)),
    );
    expect(uf.find(terminalContinuityKey(bySlot.get(0)!.id))).not.toBe(
      uf.find(terminalContinuityKey(bySlot.get(2)!.id)),
    );
  });

  it('can convert a standard outlet to passthrough', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addOutlet(diagram, 200, 200, false);
    const outletId = diagram.outlets[0]!.id;
    diagram = updateOutlet(diagram, outletId, { passthrough: true });
    expect(diagram.outlets[0]!.passthrough).toBe(true);
    expect(
      diagram.deviceNodes.filter((n) => n.deviceKind === 'outlet' && n.deviceId === outletId),
    ).toHaveLength(4);
  });

  it('reports outlet energized when hot and neutral are present', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addOutlet(diagram, 400, 400, false);
    const outletId = diagram.outlets[0]!.id;
    expect(isOutletEnergized(diagram, outletId)).toBe(false);
  });
});
