import { describe, expect, it } from 'vitest';
import { addCable } from '../../domain/cable-mutations';
import { createEmptyJob } from '../../domain/defaults';
import { addLightBulb } from '../../domain/device-mutations';
import { GRID_SIZE } from '../../domain/grid';
import { addDeviceConduit, addJunctionBox, addLocalConduit, addWireLinkToDiagram } from '../../domain/mutations';
import { moveWireLinkJoint, wireLinkDisplayPath, wireLinkEndpoint, wireWorldPolyline } from '../../domain/wire-geometry';
import { moveWireJoint } from '../../domain/wire-routing';
import { encodePathAnchor } from '../anchor-selection';
import { emptySelection } from '../diagram-selection';
import { captureSelectionMoveSnapshot, moveSelectionByDelta } from '../selection-move';

describe('moveSelectionByDelta', () => {
  it('moves a junction box and selected path anchors together', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 15, GRID_SIZE * 15);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const wireId = diagram.cables[0]!.wireIds[0]!;
    const anchorKey = encodePathAnchor({ kind: 'exposedWire', wireId, index: 1 });
    const startPt = diagram.layout.exposedPaths?.[wireId]?.points?.[1]!;

    const selection = emptySelection();
    selection.junctionBoxes.add(box.id);
    selection.pathAnchors.add(anchorKey);

    const snapshot = captureSelectionMoveSnapshot(diagram, selection);
    const next = moveSelectionByDelta(diagram, snapshot, 48, 0);

    const movedBox = next.junctionBoxes.find((b) => b.id === box.id)!;
    expect(movedBox.x - box.x).toBe(48);
    const movedPt = next.layout.exposedPaths?.[wireId]?.points?.[1]!;
    expect(movedPt.x - startPt.x).toBe(48);
  });

  it('moves a light bulb and selected path anchors together', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 400, 400);
    const bulb = diagram.lightBulbs[0]!;

    const selection = emptySelection();
    selection.lightBulbs.add(bulb.id);

    const snapshot = captureSelectionMoveSnapshot(diagram, selection);
    const next = moveSelectionByDelta(diagram, snapshot, 0, 48);

    const moved = next.lightBulbs.find((b) => b.id === bulb.id)!;
    expect(moved.y - bulb.y).toBe(48);
  });

  it('keeps wire link shape when junction box and light bulb move together', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const remoteWireId = diagram.conduits.find((c) => c.kind === 'local')!.wireIds[0]!;
    diagram = addLightBulb(diagram, 400, 400);
    const bulb = diagram.lightBulbs[0]!;
    const terminal = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: terminal.id, wireColors: ['black'] });
    const stubWireId = diagram.conduits.find((c) => c.kind === 'device')!.wireIds[0]!;
    diagram = addWireLinkToDiagram(diagram, remoteWireId, 'end', stubWireId, 'end');
    const link = diagram.wireLinks[0]!;

    const basePath = wireLinkDisplayPath(diagram, link.id);
    diagram = moveWireLinkJoint(diagram, link.id, 2, basePath[2]!.x, basePath[2]!.y + 36);
    const bentPath = wireLinkDisplayPath(diagram, link.id);
    const bendBefore = bentPath[2]!;

    const selection = emptySelection();
    selection.junctionBoxes.add(box.id);
    selection.lightBulbs.add(bulb.id);
    selection.pathAnchors.add(encodePathAnchor({ kind: 'link', linkId: link.id, index: 2 }));

    const snapshot = captureSelectionMoveSnapshot(diagram, selection);
    const next = moveSelectionByDelta(diagram, snapshot, 0, 48);

    const pathAfter = wireLinkDisplayPath(next, link.id);
    expect(pathAfter[0]).toEqual(wireLinkEndpoint(next, link.wireIdA, 'end'));
    expect(pathAfter[pathAfter.length - 1]).toEqual(wireLinkEndpoint(next, link.wireIdB, 'end'));
    expect(pathAfter[2]!.x).toBe(bendBefore.x);
    expect(pathAfter[2]!.y).toBe(bendBefore.y + 48);
  });

  it('keeps conduit wire tips when junction box and light bulb move together', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const remoteWireId = diagram.conduits.find((c) => c.kind === 'local')!.wireIds[0]!;
    diagram = addLightBulb(diagram, 400, 400);
    const bulb = diagram.lightBulbs[0]!;
    const terminal = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: terminal.id, wireColors: ['black'] });
    const stubWireId = diagram.conduits.find((c) => c.kind === 'device')!.wireIds[0]!;
    diagram = addWireLinkToDiagram(diagram, remoteWireId, 'end', stubWireId, 'end');

    const remotePath = wireWorldPolyline(diagram, remoteWireId)!;
    diagram = moveWireJoint(diagram, remoteWireId, 2, remotePath[2]!.x, remotePath[2]!.y + 24);
    const stubPath = wireWorldPolyline(diagram, stubWireId)!;
    diagram = moveWireJoint(diagram, stubWireId, 2, stubPath[2]!.x + 12, stubPath[2]!.y);
    const remoteTipBefore = wireWorldPolyline(diagram, remoteWireId)![3]!;
    const stubTipBefore = wireWorldPolyline(diagram, stubWireId)![3]!;

    const selection = emptySelection();
    selection.junctionBoxes.add(box.id);
    selection.lightBulbs.add(bulb.id);

    const snapshot = captureSelectionMoveSnapshot(diagram, selection);
    const next = moveSelectionByDelta(diagram, snapshot, 48, 0);

    const remoteTipAfter = wireWorldPolyline(next, remoteWireId)![3]!;
    const stubTipAfter = wireWorldPolyline(next, stubWireId)![3]!;
    expect(remoteTipAfter.x - remoteTipBefore.x).toBe(48);
    expect(stubTipAfter.x - stubTipBefore.x).toBe(48);
  });
});
