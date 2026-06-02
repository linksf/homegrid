import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import {
  addLightBulb,
  addSwitch,
  addDimmerSwitch,
  attachHubToDeviceNode,
  updateDimmerSwitch,
  updateSwitch,
} from '../device-mutations';
import {
  areWiresConnected,
  buildContinuityFinder,
  isLightBulbLit,
  lightBulbBrightness,
  normalizeSwitchPosition,
  switchConnectedSlots,
  terminalContinuityKey,
  toggleSwitchPosition,
} from '../continuity';
import { addCable, toggleBreakerCable } from '../cable-mutations';
import {
  addDeviceConduit,
  addHub,
  addHubBridge,
  addJunctionBox,
  addWireLinkToDiagram,
  attachWireToHub,
} from '../mutations';
import { connectConduitRun, connectConduitRunToBreakerAnchor } from '../conduit-run-mutations';
import { resolveDirections } from '../direction';
import { GRID_SIZE } from '../grid';

describe('conduit run continuity', () => {
  it('connects same-color wires across a conduit run', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 15, GRID_SIZE * 15);
    diagram = addJunctionBox(diagram, GRID_SIZE * 50, GRID_SIZE * 15);
    const [boxA, boxB] = diagram.junctionBoxes.filter((b) => b.type === 'normal');

    diagram = addCable(diagram, {
      junctionBoxId: boxA!.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    diagram = addCable(diagram, {
      junctionBoxId: boxB!.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });

    const cabA = diagram.cables.find((c) => c.junctionBoxId === boxA!.id)!;
    const cabB = diagram.cables.find((c) => c.junctionBoxId === boxB!.id)!;

    diagram = connectConduitRun(diagram, cabA.id, { kind: 'cable', cableId: cabB.id });

    const blackA = diagram.wires.find((w) => w.cableId === cabA.id && w.color === 'black')!;
    const whiteA = diagram.wires.find((w) => w.cableId === cabA.id && w.color === 'white')!;
    const blackB = diagram.wires.find((w) => w.cableId === cabB.id && w.color === 'black')!;
    const whiteB = diagram.wires.find((w) => w.cableId === cabB.id && w.color === 'white')!;

    expect(areWiresConnected(diagram, blackA.id, blackB.id)).toBe(true);
    expect(areWiresConnected(diagram, whiteA.id, whiteB.id)).toBe(true);
    expect(areWiresConnected(diagram, blackA.id, whiteB.id)).toBe(false);
  });
});

describe('switch continuity simulation', () => {
  it('defaults single-pole switches to open, three-way to traveler A, and four-way to straight', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 200, 200, 2);
    diagram = addSwitch(diagram, 300, 200, 3);
    diagram = addSwitch(diagram, 400, 200, 4);
    expect(normalizeSwitchPosition(diagram.switches[0]!)).toBe('open');
    expect(normalizeSwitchPosition(diagram.switches[1]!)).toBe('travelerA');
    expect(normalizeSwitchPosition(diagram.switches[2]!)).toBe('straight');
  });

  it('connects SPST terminals only when closed', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 200, 200, 2);
    const sw = diagram.switches[0]!;
    const nodes = diagram.deviceNodes.filter((n) => n.deviceKind === 'switch' && n.deviceId === sw.id);

    expect(switchConnectedSlots(sw)).toEqual([]);

    diagram = updateSwitch(diagram, sw.id, { position: 'closed' });
    expect(switchConnectedSlots(diagram.switches[0]!)).toEqual([[0, 1]]);

    diagram = updateSwitch(diagram, sw.id, { position: 'open' });
    const ufOpen = buildContinuityFinder(diagram);
    expect(
      ufOpen.find(terminalContinuityKey(nodes[0]!.id)) ===
        ufOpen.find(terminalContinuityKey(nodes[1]!.id)),
    ).toBe(false);

    diagram = updateSwitch(diagram, sw.id, { position: 'closed' });
    const ufClosed = buildContinuityFinder(diagram);
    expect(
      ufClosed.find(terminalContinuityKey(nodes[0]!.id)) ===
        ufClosed.find(terminalContinuityKey(nodes[1]!.id)),
    ).toBe(true);
  });

  it('routes three-way switches between common and one traveler', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 200, 200, 3);
    const sw = diagram.switches[0]!;
    const nodes = diagram.deviceNodes.filter((n) => n.deviceKind === 'switch' && n.deviceId === sw.id);
    const common = nodes.find((n) => n.slot === 0)!;
    const right = nodes.find((n) => n.slot === 1)!;
    const bottom = nodes.find((n) => n.slot === 2)!;

    expect(switchConnectedSlots(sw)).toEqual([[0, 1]]);

    diagram = updateSwitch(diagram, sw.id, { position: 'travelerB' });
    expect(switchConnectedSlots(diagram.switches[0]!)).toEqual([[0, 2]]);

    const uf = buildContinuityFinder(diagram);
    expect(uf.find(terminalContinuityKey(common.id))).toBe(uf.find(terminalContinuityKey(bottom.id)));
    expect(uf.find(terminalContinuityKey(common.id))).not.toBe(uf.find(terminalContinuityKey(right.id)));
  });

  it('routes four-way switches between straight and cross pairs', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 200, 200, 4);
    const sw = diagram.switches[0]!;
    const nodes = diagram.deviceNodes.filter((n) => n.deviceKind === 'switch' && n.deviceId === sw.id);
    const tl = nodes.find((n) => n.slot === 0)!;
    const tr = nodes.find((n) => n.slot === 1)!;
    const bl = nodes.find((n) => n.slot === 2)!;
    const br = nodes.find((n) => n.slot === 3)!;

    expect(switchConnectedSlots(sw)).toEqual([
      [0, 2],
      [1, 3],
    ]);

    diagram = updateSwitch(diagram, sw.id, { position: 'cross' });
    expect(switchConnectedSlots(diagram.switches[0]!)).toEqual([
      [0, 3],
      [1, 2],
    ]);

    const uf = buildContinuityFinder(diagram);
    expect(uf.find(terminalContinuityKey(tl.id))).toBe(uf.find(terminalContinuityKey(br.id)));
    expect(uf.find(terminalContinuityKey(tr.id))).toBe(uf.find(terminalContinuityKey(bl.id)));
    expect(uf.find(terminalContinuityKey(tl.id))).not.toBe(uf.find(terminalContinuityKey(tr.id)));
  });

  it('toggles switch position', () => {
    const sw = { id: 's', label: '', x: 0, y: 0, width: 80, height: 44, terminalCount: 2 as const };
    expect(toggleSwitchPosition({ ...sw, position: 'open' })).toBe('closed');
    expect(toggleSwitchPosition({ ...sw, position: 'closed' })).toBe('open');
    expect(
      toggleSwitchPosition({ ...sw, terminalCount: 3, position: 'travelerA' }),
    ).toBe('travelerB');
    expect(
      toggleSwitchPosition({ ...sw, terminalCount: 4, position: 'straight' }),
    ).toBe('cross');
  });

  it('lights a bulb when a closed switch completes hot to neutral', () => {
    let diagram = createEmptyJob().diagram;
    const breakerBox = diagram.junctionBoxes.find((b) => b.type === 'breaker')!;

    diagram = addJunctionBox(diagram, 200, 200);
    const feedBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: feedBox.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const feedCable = diagram.cables.find((c) => c.junctionBoxId === feedBox.id)!;
    diagram = connectConduitRunToBreakerAnchor(
      diagram,
      feedCable.id,
      breakerBox.id,
      'bottom-center',
    );

    const hotWire = diagram.wires.find((w) => w.cableId === feedCable.id && w.color === 'black')!;
    const neutralWire = diagram.wires.find((w) => w.cableId === feedCable.id && w.color === 'white')!;
    diagram = addJunctionBox(diagram, 380, 200);
    diagram = addJunctionBox(diagram, 540, 200);
    const loadNormals = [...diagram.junctionBoxes.filter((b) => b.type === 'normal')].sort((a, b) => a.x - b.x);
    const bulbHubBox = loadNormals[loadNormals.length - 2]!;
    const switchHubBox = loadNormals[loadNormals.length - 1]!;
    diagram = addHub(diagram, bulbHubBox.id);
    diagram = addHub(diagram, switchHubBox.id);
    const loadHubBulb = diagram.hubs.find((h) => h.junctionBoxId === bulbHubBox.id)!;
    const loadHubSwitch = diagram.hubs.find((h) => h.junctionBoxId === switchHubBox.id)!;

    diagram = addLightBulb(diagram, 500, 200);
    const bulb = diagram.lightBulbs[0]!;
    const hotTerminal = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'lightBulb' && n.deviceId === bulb.id && n.slot === 0,
    )!;
    const neutralTerminal = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'lightBulb' && n.deviceId === bulb.id && n.slot === 1,
    )!;

    diagram = addDeviceConduit(diagram, { deviceNodeId: hotTerminal.id, wireColors: ['black'] });
    diagram = addDeviceConduit(diagram, { deviceNodeId: neutralTerminal.id, wireColors: ['white'] });
    const neutralStub = diagram.conduits.find((c) => c.kind === 'device' && c.deviceNodeId === neutralTerminal.id)!;

    diagram = addSwitch(diagram, 350, 200, 2);
    const sw = diagram.switches[0]!;
    const switchHot = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'switch' && n.deviceId === sw.id && n.slot === 0,
    )!;
    const switchLoad = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'switch' && n.deviceId === sw.id && n.slot === 1,
    )!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: switchHot.id, wireColors: ['black'] });
    diagram = addDeviceConduit(diagram, { deviceNodeId: switchLoad.id, wireColors: ['black'] });
    const switchHotStub = diagram.conduits.find((c) => c.kind === 'device' && c.deviceNodeId === switchHot.id)!;
    const switchLoadStub = diagram.conduits.find((c) => c.kind === 'device' && c.deviceNodeId === switchLoad.id)!;

    diagram = attachHubToDeviceNode(diagram, loadHubBulb.id, hotTerminal.id);
    diagram = attachWireToHub(diagram, loadHubSwitch.id, switchLoadStub.wireIds[0]!);
    diagram = addHubBridge(diagram, loadHubBulb.id, loadHubSwitch.id);
    diagram = addWireLinkToDiagram(
      diagram,
      hotWire!.id,
      'end',
      switchHotStub.wireIds[0]!,
      'end',
    );
    diagram = addWireLinkToDiagram(
      diagram,
      neutralWire!.id,
      'end',
      neutralStub.wireIds[0]!,
      'end',
    );

    expect(isLightBulbLit(diagram, bulb.id)).toBe(false);

    diagram = updateSwitch(diagram, sw.id, { position: 'closed' });
    expect(isLightBulbLit(diagram, bulb.id)).toBe(true);

    diagram = updateSwitch(diagram, sw.id, { position: 'open' });
    expect(isLightBulbLit(diagram, bulb.id)).toBe(false);
    expect(areWiresConnected(diagram, hotWire!.id, switchHotStub.wireIds[0]!)).toBe(true);
    expect(areWiresConnected(diagram, hotWire!.id, switchLoadStub.wireIds[0]!)).toBe(false);
  });

  it('scales light brightness with dimmer level on the hot leg', () => {
    let diagram = createEmptyJob().diagram;
    const breakerBox = diagram.junctionBoxes.find((b) => b.type === 'breaker')!;

    diagram = addJunctionBox(diagram, 200, 200);
    const feedBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: feedBox.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const feedCable = diagram.cables.find((c) => c.junctionBoxId === feedBox.id)!;
    diagram = connectConduitRunToBreakerAnchor(
      diagram,
      feedCable.id,
      breakerBox.id,
      'bottom-center',
    );

    const hotWire = diagram.wires.find((w) => w.cableId === feedCable.id && w.color === 'black')!;
    const neutralWire = diagram.wires.find((w) => w.cableId === feedCable.id && w.color === 'white')!;

    diagram = addJunctionBox(diagram, 380, 200);
    diagram = addJunctionBox(diagram, 540, 200);
    const dimLoadNormals = [...diagram.junctionBoxes.filter((b) => b.type === 'normal')].sort((a, b) => a.x - b.x);
    const dimBulbHubBox = dimLoadNormals[dimLoadNormals.length - 2]!;
    const dimSwitchHubBox = dimLoadNormals[dimLoadNormals.length - 1]!;
    diagram = addHub(diagram, dimBulbHubBox.id);
    diagram = addHub(diagram, dimSwitchHubBox.id);
    const loadHubBulb = diagram.hubs.find((h) => h.junctionBoxId === dimBulbHubBox.id)!;
    const loadHubDim = diagram.hubs.find((h) => h.junctionBoxId === dimSwitchHubBox.id)!;

    diagram = addLightBulb(diagram, 500, 200);
    const bulb = diagram.lightBulbs[0]!;
    const hotTerminal = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'lightBulb' && n.deviceId === bulb.id && n.slot === 0,
    )!;
    const neutralTerminal = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'lightBulb' && n.deviceId === bulb.id && n.slot === 1,
    )!;

    diagram = addDeviceConduit(diagram, { deviceNodeId: hotTerminal.id, wireColors: ['black'] });
    diagram = addDeviceConduit(diagram, { deviceNodeId: neutralTerminal.id, wireColors: ['white'] });
    const neutralStub = diagram.conduits.find((c) => c.kind === 'device' && c.deviceNodeId === neutralTerminal.id)!;

    diagram = addDimmerSwitch(diagram, 350, 200);
    const dim = diagram.dimmerSwitches[0]!;
    const dimLine = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'dimmerSwitch' && n.deviceId === dim.id && n.slot === 0,
    )!;
    const dimLoad = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'dimmerSwitch' && n.deviceId === dim.id && n.slot === 1,
    )!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: dimLine.id, wireColors: ['black'] });
    diagram = addDeviceConduit(diagram, { deviceNodeId: dimLoad.id, wireColors: ['black'] });
    const dimLineStub = diagram.conduits.find((c) => c.kind === 'device' && c.deviceNodeId === dimLine.id)!;
    const dimLoadStub = diagram.conduits.find((c) => c.kind === 'device' && c.deviceNodeId === dimLoad.id)!;

    diagram = attachHubToDeviceNode(diagram, loadHubBulb.id, hotTerminal.id);
    diagram = attachWireToHub(diagram, loadHubDim.id, dimLoadStub.wireIds[0]!);
    diagram = addHubBridge(diagram, loadHubBulb.id, loadHubDim.id);
    diagram = addWireLinkToDiagram(diagram, hotWire.id, 'end', dimLineStub.wireIds[0]!, 'end');
    diagram = addWireLinkToDiagram(diagram, neutralWire.id, 'end', neutralStub.wireIds[0]!, 'end');

    expect(lightBulbBrightness(diagram, bulb.id)).toBe(0);

    diagram = updateDimmerSwitch(diagram, dim.id, { level: 40 });
    expect(isLightBulbLit(diagram, bulb.id)).toBe(true);
    expect(lightBulbBrightness(diagram, bulb.id)).toBe(40);

    diagram = updateDimmerSwitch(diagram, dim.id, { level: 100 });
    expect(lightBulbBrightness(diagram, bulb.id)).toBe(100);

    diagram = updateDimmerSwitch(diagram, dim.id, { level: 0 });
    expect(lightBulbBrightness(diagram, bulb.id)).toBe(0);
  });

  it('open breaker cable isolates field conductors in continuity', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes.find((b) => b.type === 'breaker')!.id;
    diagram = addJunctionBox(diagram, GRID_SIZE * 30, GRID_SIZE * 15);
    const fieldBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    diagram = addCable(diagram, {
      junctionBoxId: fieldBox.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const fieldCable = diagram.cables.find((c) => c.junctionBoxId === fieldBox.id)!;
    diagram = connectConduitRunToBreakerAnchor(diagram, fieldCable.id, panelId, 'middle-left');

    const breakerCable = diagram.cables.find((c) => c.role === 'breaker')!;
    const panelHot = diagram.wires.find((w) => w.cableId === breakerCable.id && w.color === 'black')!;
    const fieldHot = diagram.wires.find((w) => w.cableId === fieldCable.id && w.color === 'black')!;

    diagram = addJunctionBox(diagram, GRID_SIZE * 50, GRID_SIZE * 15);
    const linkBox = diagram.junctionBoxes.filter((b) => b.type === 'normal').find((b) => b.id !== fieldBox.id)!;
    diagram = addCable(diagram, {
      junctionBoxId: linkBox.id,
      anchor: 'middle-left',
      wireColors: ['black'],
    });
    const remoteCable = diagram.cables.find((c) => c.junctionBoxId === linkBox.id)!;
    const remoteHot = remoteCable.wireIds[0]!;
    diagram = addWireLinkToDiagram(diagram, fieldHot.id, 'end', remoteHot, 'end');

    expect(areWiresConnected(diagram, panelHot.id, fieldHot.id)).toBe(true);

    diagram = toggleBreakerCable(diagram, breakerCable.id);
    expect(areWiresConnected(diagram, panelHot.id, fieldHot.id)).toBe(false);
    expect(areWiresConnected(diagram, fieldHot.id, remoteHot)).toBe(true);

    const resolved = resolveDirections(diagram);
    expect(resolved.get(panelHot.id)?.resolvedDirection).toBeNull();
    expect(resolved.get(fieldHot.id)?.resolvedDirection).toBeNull();
  });

  it('does not light a bulb when only the hot leg has charge', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes.find((b) => b.type === 'breaker')!.id;
    diagram = addJunctionBox(diagram, GRID_SIZE * 30, GRID_SIZE * 15);
    const fieldBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    diagram = addCable(diagram, {
      junctionBoxId: fieldBox.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const fieldCable = diagram.cables.find((c) => c.junctionBoxId === fieldBox.id)!;
    diagram = connectConduitRunToBreakerAnchor(diagram, fieldCable.id, panelId, 'middle-left');

    diagram = addHub(diagram, fieldBox.id);
    const hubId = diagram.hubs[0]!.id;
    const fieldHot = diagram.wires.find((w) => w.cableId === fieldCable.id && w.color === 'black')!;
    diagram = attachWireToHub(diagram, hubId, fieldHot.id);

    diagram = addLightBulb(diagram, GRID_SIZE * 50, GRID_SIZE * 15);
    const bulb = diagram.lightBulbs[0]!;
    const hotTerminal = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'lightBulb' && n.deviceId === bulb.id && n.slot === 0,
    )!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: hotTerminal.id, wireColors: ['black'] });
    const hotStub = diagram.conduits.find((c) => c.kind === 'device')!.wireIds[0]!;
    diagram = attachWireToHub(diagram, hubId, hotStub);

    expect(isLightBulbLit(diagram, bulb.id)).toBe(false);
  });

  it('does not bridge hot and neutral through a shared hub', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes.find((b) => b.type === 'breaker')!.id;
    diagram = addJunctionBox(diagram, GRID_SIZE * 30, GRID_SIZE * 15);
    const fieldBox = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    diagram = addCable(diagram, {
      junctionBoxId: fieldBox.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const fieldCable = diagram.cables.find((c) => c.junctionBoxId === fieldBox.id)!;
    diagram = connectConduitRunToBreakerAnchor(diagram, fieldCable.id, panelId, 'middle-left');

    diagram = addHub(diagram, fieldBox.id);
    const hubId = diagram.hubs[0]!.id;
    const fieldHot = diagram.wires.find((w) => w.cableId === fieldCable.id && w.color === 'black')!;
    const fieldNeutral = diagram.wires.find((w) => w.cableId === fieldCable.id && w.color === 'white')!;
    diagram = attachWireToHub(diagram, hubId, fieldHot.id);
    diagram = attachWireToHub(diagram, hubId, fieldNeutral.id);

    diagram = addLightBulb(diagram, GRID_SIZE * 50, GRID_SIZE * 15);
    const bulb = diagram.lightBulbs[0]!;
    const hotTerminal = diagram.deviceNodes.find(
      (n) => n.deviceKind === 'lightBulb' && n.deviceId === bulb.id && n.slot === 0,
    )!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: hotTerminal.id, wireColors: ['black'] });
    const hotStub = diagram.conduits.find((c) => c.kind === 'device')!.wireIds[0]!;
    diagram = attachWireToHub(diagram, hubId, hotStub);

    expect(isLightBulbLit(diagram, bulb.id)).toBe(false);
  });
});
