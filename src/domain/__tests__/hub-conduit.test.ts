import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addHub, addHubConduit, addJunctionBox, hubConduitPathPoints } from '../mutations';

describe('hub conduits', () => {
  it('adds a conduit stub from a hub with wires tied to the hub', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hubId = diagram.hubs[0]!.id;

    diagram = addHubConduit(diagram, { hubId, wireColors: ['black', 'white'] });

    const conduit = diagram.conduits.find((c) => c.kind === 'hub')!;
    expect(conduit.hubId).toBe(hubId);
    expect(conduit.wireIds).toHaveLength(2);
    for (const wireId of conduit.wireIds) {
      const wire = diagram.wires.find((w) => w.id === wireId)!;
      expect(wire.hubId).toBe(hubId);
      expect(wire.conduitId).toBe(conduit.id);
    }
    expect(hubConduitPathPoints(diagram, hubId)?.length).toBeGreaterThanOrEqual(2);
  });
});
