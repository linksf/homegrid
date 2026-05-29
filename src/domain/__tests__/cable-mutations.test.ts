import { describe, expect, it } from 'vitest';
import {
  addCable,
  deleteCable,
  moveCableAnchor,
  toggleBreakerCable,
  updateCable,
} from '../cable-mutations';
import { createEmptyJob } from '../defaults';
import { addJunctionBox } from '../mutations';
import { breakerPresetWireColors } from '../breaker-cable';

describe('updateCable', () => {
  it('updates cable label without changing wires', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const cable = diagram.cables[0]!;
    diagram = updateCable(diagram, cable.id, { label: 'Feed A' });

    const updated = diagram.cables.find((c) => c.id === cable.id)!;
    expect(updated.label).toBe('Feed A');
    expect(updated.wireIds).toEqual(cable.wireIds);
  });

  it('throws for unknown cable', () => {
    const diagram = createEmptyJob().diagram;
    expect(() => updateCable(diagram, 'missing', { label: 'x' })).toThrow(/unknown cable/i);
  });
});

describe('addCable', () => {
  it('creates 2 wires with exposed paths length 4', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const cable = diagram.cables[0]!;
    expect(cable.wireIds).toHaveLength(2);
    for (const wireId of cable.wireIds) {
      const w = diagram.wires.find((x) => x.id === wireId)!;
      expect(w.cableId).toBe(cable.id);
      expect(w.conduitId).toBeNull();
      const pts = diagram.layout.exposedPaths?.[wireId]?.points;
      expect(pts).toBeDefined();
      expect(pts!.length).toBe(4);
    }
  });

  it('rejects second cable on same anchor', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'top-center',
      wireColors: ['black'],
    });
    expect(() =>
      addCable(diagram, {
        junctionBoxId: box.id,
        anchor: 'top-center',
        wireColors: ['white'],
      }),
    ).toThrow(/already has a cable/);
  });

  it('addCable on breaker panel creates role breaker with closed true and no exposed paths', () => {
    const diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes.find((b) => b.type === 'breaker')!.id;
    const next = addCable(diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const cable = next.cables.find((c) => c.junctionBoxId === panelId)!;
    expect(cable.role).toBe('breaker');
    expect(cable.closed).toBe(true);
    for (const wid of cable.wireIds) {
      expect(next.layout.exposedPaths?.[wid]).toBeUndefined();
    }
    expect(next.layout.conduitStubPaths?.[cable.id]?.points?.length).toBe(5);
  });
});

describe('toggleBreakerCable', () => {
  it('flips closed state on breaker cables', () => {
    const diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes.find((b) => b.type === 'breaker')!.id;
    let next = addCable(diagram, {
      junctionBoxId: panelId,
      anchor: 'middle-left',
      wireColors: breakerPresetWireColors('twoWire'),
    });
    const cable = next.cables[0]!;
    next = toggleBreakerCable(next, cable.id);
    expect(next.cables.find((c) => c.id === cable.id)!.closed).toBe(false);
    next = toggleBreakerCable(next, cable.id);
    expect(next.cables.find((c) => c.id === cable.id)!.closed).toBe(true);
  });

  it('throws for non-breaker cables', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-left',
      wireColors: ['black'],
    });
    expect(() => toggleBreakerCable(diagram, diagram.cables[0]!.id)).toThrow(/not a breaker cable/i);
  });
});

describe('moveCableAnchor', () => {
  it('moves cable to a free anchor and refreshes paths', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-left',
      wireColors: ['black', 'red'],
    });
    let cable = diagram.cables[0]!;
    diagram = moveCableAnchor(diagram, cable.id, 'middle-right');

    cable = diagram.cables[0]!;
    expect(cable.anchor).toBe('middle-right');
    for (const wireId of cable.wireIds) {
      expect(diagram.layout.exposedPaths?.[wireId]?.points?.length).toBe(4);
    }
    expect(diagram.layout.conduitStubPaths?.[cable.id]?.points?.length).toBe(5);
  });
});

describe('deleteCable', () => {
  it('removes wires and cable', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 200, 200);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-left',
      wireColors: ['black', 'white'],
    });
    const cable = diagram.cables[0]!;
    const wireIds = [...cable.wireIds];

    diagram = deleteCable(diagram, cable.id);

    expect(diagram.cables).toHaveLength(0);
    for (const wid of wireIds) {
      expect(diagram.wires.some((w) => w.id === wid)).toBe(false);
      expect(diagram.layout.exposedPaths?.[wid]).toBeUndefined();
    }
    expect(diagram.layout.conduitStubPaths?.[cable.id]).toBeUndefined();
  });
});
