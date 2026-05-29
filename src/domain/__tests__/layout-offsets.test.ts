import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addLocalConduit, addSpanConduit, addWireLinkToDiagram } from '../mutations';
import { nudgeWirePath } from '../layout-offsets';
import { moveWireLinkJoint, wireLinkDisplayPath } from '../wire-geometry';
import { addJunctionBox } from '../mutations';
import { draggableWireVertexIndices } from '../path-editing';
import { moveWireJoint, wireEndpointRoles } from '../wire-routing';
import { wireLinkEndpoint, wireWorldPolyline } from '../wire-geometry';

describe('layout offsets', () => {
  it('moves a free wire tip while keeping the anchor fixed', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-left',
      wireColors: ['black'],
    });
    const conduit = diagram.conduits.find((c) => c.kind === 'local')!;
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
  });

  it('nudges one wire tip without moving sibling wires in the same conduit', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const conduit = diagram.conduits.find((c) => c.kind === 'local' && c.junctionBoxId === box.id)!;
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
    diagram = addWireLinkToDiagram(diagram, wireOnBoxA, 'end', wireOnBoxB, 'end');
    const link = diagram.wireLinks[0]!;
    const wa = diagram.wires.find((w) => w.id === link.wireIdA)!;
    const wb = diagram.wires.find((w) => w.id === link.wireIdB)!;

    const base = wireLinkDisplayPath(diagram, link.id);
    expect(base.length).toBe(5);

    diagram = moveWireLinkJoint(diagram, link.id, 1, base[1]!.x, base[1]!.y + 36);
    const path = wireLinkDisplayPath(diagram, link.id);
    expect(path[0]).toEqual(wireLinkEndpoint(diagram, wa.id, 'end'));
    expect(path[path.length - 1]).toEqual(wireLinkEndpoint(diagram, wb.id, 'end'));
    expect(path.length).toBe(5);
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
    diagram = addWireLinkToDiagram(diagram, wireOnBoxA, 'end', wireOnBoxB, 'end');

    expect(wireEndpointRoles(diagram, wireOnBoxA).end).toBe('free');
    const path = wireWorldPolyline(diagram, wireOnBoxA)!;
    expect(path.length).toBe(4);
    expect(draggableWireVertexIndices(4, true, false)).toEqual([1, 2, 3]);
  });

  it('does not move wire end anchors when a link is created', () => {
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
    diagram = nudgeWirePath(diagram, wireOnBoxB, 0, -18);
    const tipA = wireWorldPolyline(diagram, wireOnBoxA)!.at(-1)!;
    const tipB = wireWorldPolyline(diagram, wireOnBoxB)!.at(-1)!;

    diagram = addWireLinkToDiagram(diagram, wireOnBoxA, 'end', wireOnBoxB, 'end');
    const afterA = wireWorldPolyline(diagram, wireOnBoxA)!.at(-1)!;
    const afterB = wireWorldPolyline(diagram, wireOnBoxB)!.at(-1)!;

    expect(afterA).toEqual(tipA);
    expect(afterB).toEqual(tipB);
    expect(afterA).not.toEqual(afterB);

    const link = diagram.wireLinks[0]!;
    const linkPath = wireLinkDisplayPath(diagram, link.id);
    const linkStart = wireLinkEndpoint(diagram, link.wireIdA, link.endpointA ?? 'end')!;
    const linkEnd = wireLinkEndpoint(diagram, link.wireIdB, link.endpointB ?? 'end')!;
    expect(linkPath[0]).toEqual(linkStart);
    expect(linkPath[linkPath.length - 1]).toEqual(linkEnd);
    expect(new Set([linkStart, linkEnd])).toEqual(new Set([tipA, tipB]));
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
    diagram = addWireLinkToDiagram(diagram, wireOnBoxA, 'end', wireOnBoxB, 'end');

    const before = wireWorldPolyline(diagram, wireOnBoxA)!;
    const tipBefore = before[before.length - 1]!;
    expect(before.length).toBe(4);

    diagram = moveWireJoint(diagram, wireOnBoxA, 1, before[1]!.x + 36, before[1]!.y);
    const after = wireWorldPolyline(diagram, wireOnBoxA)!;
    expect(after.length).toBe(4);
    expect(after[after.length - 1]).toEqual(tipBefore);
    expect(after[1]!.x).toBe(before[1]!.x + 36);
  });

  it('drags a span wire bend while keeping both box anchors fixed', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    diagram = addJunctionBox(diagram, 600, 200);
    const boxes = diagram.junctionBoxes.filter((b) => b.type === 'normal');
    diagram = addSpanConduit(diagram, {
      junctionBoxIdA: boxes[0]!.id,
      anchorA: 'middle-right',
      junctionBoxIdB: boxes[1]!.id,
      anchorB: 'middle-left',
      wireColors: ['black'],
    });
    const wireId = diagram.conduits[0]!.wireIds[0]!;
    expect(wireEndpointRoles(diagram, wireId)).toEqual({ start: 'fixed', end: 'fixed' });
    expect(draggableWireVertexIndices(5, true, true)).toEqual([1, 2, 3]);

    const before = wireWorldPolyline(diagram, wireId)!;
    expect(before).toHaveLength(5);
    const startBefore = before[0]!;
    const endBefore = before[before.length - 1]!;

    diagram = moveWireJoint(diagram, wireId, 1, before[1]!.x + 48, before[1]!.y + 24, { snap: false });
    const after = wireWorldPolyline(diagram, wireId)!;
    expect(after).toHaveLength(5);
    expect(after[0]).toEqual(startBefore);
    expect(after[after.length - 1]).toEqual(endBefore);
    expect(after[1]!.x).toBe(before[1]!.x + 48);
    expect(after[1]!.y).toBe(before[1]!.y + 24);
  });
});
