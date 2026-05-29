import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { attachWireToDeviceNode } from '../device-mutations';
import { addCable } from '../cable-mutations';
import {
  addHub,
  addJunctionBox,
  addLocalConduit,
  attachWireToHub,
  moveJunctionBox,
} from '../mutations';
import { addLightBulb } from '../device-mutations';
import { hubWireDisplayPath, moveHubWireJoint } from '../hub-wire-geometry';

describe('hub wire geometry', () => {
  it('stores an editable path from hub to device terminal', () => {
    let diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    diagram = addCable(diagram, { junctionBoxId: panelId, anchor: 'middle-left', wireColors: ['black', 'white'] });
    const breakerCable = diagram.cables.find((c) => c.role === 'breaker')!;
    const wireId = breakerCable.wireIds.find(
      (id) => diagram.wires.find((w) => w.id === id)?.color === 'black',
    )!;
    diagram = addJunctionBox(diagram, 100, 100);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hubId = diagram.hubs[0]!.id;
    diagram = addLightBulb(diagram, 400, 400);
    const terminal = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;

    diagram = attachWireToDeviceNode(diagram, terminal.id, wireId, 'end');
    diagram = attachWireToHub(diagram, hubId, wireId);

    const before = hubWireDisplayPath(diagram, wireId);
    expect(before.length).toBeGreaterThanOrEqual(2);

    diagram = moveHubWireJoint(diagram, wireId, 1, before[1]!.x + 36, before[1]!.y + 12);
    const after = hubWireDisplayPath(diagram, wireId);
    expect(after[1]!.x).toBe(before[1]!.x + 36);
    expect(after[1]!.y).toBe(before[1]!.y + 12);
    expect(after[0]).toEqual(before[0]);
    expect(after[after.length - 1]).toEqual(before[before.length - 1]);
  });

  it('refreshes hub wire paths when the junction box moves', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hubId = diagram.hubs[0]!.id;
    diagram = addLocalConduit(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const wireId = diagram.conduits.find((c) => c.kind === 'local')!.wireIds[0]!;
    diagram = attachWireToHub(diagram, hubId, wireId);

    const before = hubWireDisplayPath(diagram, wireId);
    diagram = moveJunctionBox(diagram, box.id, box.x + 48, box.y);
    const after = hubWireDisplayPath(diagram, wireId);
    expect(after[0]!.x - before[0]!.x).toBe(48);
  });
});
