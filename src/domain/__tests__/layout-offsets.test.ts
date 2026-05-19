import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addLightBulb } from '../device-mutations';
import { addDeviceConduit, addLocalConduit, addWireLinkToDiagram } from '../mutations';
import { nudgeWirePath } from '../layout-offsets';
import { moveWireLinkJoint, wireLinkDisplayPath } from '../wire-geometry';
import { addJunctionBox } from '../mutations';
import { draggableWireVertexIndices } from '../path-editing';
import { moveWireJoint, wireEndpointRoles } from '../wire-routing';
import { wireLinkEndpoint, wireWorldPolyline } from '../wire-geometry';

describe('layout offsets', () => {
  it('moves a free wire tip while keeping the anchor fixed', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 300, 300);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: node.id, wireColors: ['black', 'white'] });
    const conduit = diagram.conduits.find((c) => c.kind === 'device')!;
    const wireId = conduit.wireIds[0]!;
    expect(wireEndpointRoles(diagram, wireId).end).toBe('free');

    const base = wireWorldPolyline(diagram, wireId)!;
    const baseStart = base[0]!;
    const baseEnd = base[base.length - 1]!;

    diagram = nudgeWirePath(diagram, wireId, 0, 24);
    const shifted = wireWorldPolyline(diagram, wireId)!;
    expect(shifted[0]).toEqual(baseStart);
    expect(shifted[shifted.length - 1]).not.toEqual(baseEnd);
    expect(shifted[shifted.length - 1]!.y).toBe(baseEnd.y + 24);
    for (let i = 1; i < shifted.length; i++) {
      const a = shifted[i - 1]!;
      const b = shifted[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it('nudges one wire tip without moving sibling wires in the same conduit', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 300, 300);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: node.id, wireColors: ['black', 'white'] });
    const conduit = diagram.conduits.find((c) => c.kind === 'device')!;
    const wireA = conduit.wireIds[0]!;
    const wireB = conduit.wireIds[1]!;

    const pathABefore = wireWorldPolyline(diagram, wireA)!;
    const tipABefore = pathABefore[pathABefore.length - 1]!;
    const pathBBefore = wireWorldPolyline(diagram, wireB)!;
    const tipBBefore = pathBBefore[pathBBefore.length - 1]!;

    diagram = nudgeWirePath(diagram, wireA, 0, 18);
    const pathA = wireWorldPolyline(diagram, wireA)!;
    const pathB = wireWorldPolyline(diagram, wireB)!;

    expect(pathA[pathA.length - 1]!.y).toBe(tipABefore.y + 18);
    expect(pathB[pathB.length - 1]).toEqual(tipBBefore);
    expect(pathA[pathA.length - 1]).not.toEqual(pathB[pathB.length - 1]);
  });

  it('reshapes a wire link via joint drag while keeping both tips attached', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 120, 160);
    diagram = addJunctionBox(diagram, 420, 280);
    const boxes = diagram.junctionBoxes.filter((b) => b.type === 'normal');
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[0]!.id,
      anchor: 'bottom-center',
      wireColors: ['black'],
    });
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[1]!.id,
      anchor: 'bottom-center',
      wireColors: ['black'],
    });
    const wireOnBoxA = diagram.conduits[0]!.wireIds[0]!;
    const wireOnBoxB = diagram.conduits[1]!.wireIds[0]!;
    diagram = addWireLinkToDiagram(diagram, wireOnBoxA, wireOnBoxB);
    const link = diagram.wireLinks[0]!;
    const wa = diagram.wires.find((w) => w.id === link.wireIdA)!;
    const wb = diagram.wires.find((w) => w.id === link.wireIdB)!;

    const base = wireLinkDisplayPath(diagram, link.id);
    expect(base.length).toBe(4);

    diagram = moveWireLinkJoint(diagram, link.id, 1, base[1]!.x, base[1]!.y + 36);
    const path = wireLinkDisplayPath(diagram, link.id);
    expect(path[0]).toEqual(wireLinkEndpoint(diagram, wa));
    expect(path[path.length - 1]).toEqual(wireLinkEndpoint(diagram, wb));
    expect(path.length).toBe(4);
  });

  it('keeps linked wires editable via an interior joint', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 120, 160);
    diagram = addJunctionBox(diagram, 420, 280);
    const boxes = diagram.junctionBoxes.filter((b) => b.type === 'normal');
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[0]!.id,
      anchor: 'bottom-center',
      wireColors: ['black'],
    });
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[1]!.id,
      anchor: 'bottom-center',
      wireColors: ['black'],
    });
    const wireOnBoxA = diagram.conduits[0]!.wireIds[0]!;
    const wireOnBoxB = diagram.conduits[1]!.wireIds[0]!;
    diagram = addWireLinkToDiagram(diagram, wireOnBoxA, wireOnBoxB);

    expect(wireEndpointRoles(diagram, wireOnBoxA).end).toBe('fixed');
    const path = wireWorldPolyline(diagram, wireOnBoxA)!;
    expect(path.length).toBe(4);
    expect(draggableWireVertexIndices(false)).toEqual([1, 2, 3]);
  });

  it('drags a linked wire stub bend without collapsing the path', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 120, 160);
    diagram = addJunctionBox(diagram, 420, 280);
    const boxes = diagram.junctionBoxes.filter((b) => b.type === 'normal');
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[0]!.id,
      anchor: 'bottom-center',
      wireColors: ['black'],
    });
    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxes[1]!.id,
      anchor: 'bottom-center',
      wireColors: ['black'],
    });
    const wireOnBoxA = diagram.conduits[0]!.wireIds[0]!;
    const wireOnBoxB = diagram.conduits[1]!.wireIds[0]!;
    diagram = nudgeWirePath(diagram, wireOnBoxA, 0, 24);
    diagram = addWireLinkToDiagram(diagram, wireOnBoxA, wireOnBoxB);

    const before = wireWorldPolyline(diagram, wireOnBoxA)!;
    const tipBefore = before[before.length - 1]!;
    expect(before.length).toBe(4);

    diagram = moveWireJoint(diagram, wireOnBoxA, 1, before[1]!.x + 36, before[1]!.y);
    const after = wireWorldPolyline(diagram, wireOnBoxA)!;
    expect(after.length).toBe(4);
    expect(after[after.length - 1]).toEqual(tipBefore);
    expect(after[1]!.x).toBe(before[1]!.x + 36);
  });
});
