import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import { createEmptyJob } from '../defaults';
import {
  addBreaker,
  addJunctionBox,
  addLocalConduit,
  addSpanConduit,
  addWireLinkToDiagram,
  MIN_JUNCTION_SIZE,
  moveJunctionBox,
  LOCAL_CONDUIT_STUB_LENGTH,
  resizeJunctionBox,
  updateWire,
} from '../mutations';
import { anchorPoint } from '../anchors';
import type { Diagram } from '../types';

describe('addBreaker', () => {
  it('creates a breaker conduit with black and white wires that seed direction', () => {
    const job = createEmptyJob('Test');
    const panelId = job.diagram.junctionBoxes[0]!.id;
    const next = addBreaker(job.diagram, panelId);

    expect(next.breakers).toHaveLength(0);
    const conduit = next.conduits[0]!;
    expect(conduit.kind).toBe('breaker');
    if (conduit.kind === 'breaker') {
      expect(conduit.junctionBoxId).toBe(panelId);
    }

    expect(next.wires).toHaveLength(2);
    const black = next.wires.find((w) => w.color === 'black');
    const white = next.wires.find((w) => w.color === 'white');
    expect(black!.conduitId).toBe(conduit.id);
    expect(white!.conduitId).toBe(conduit.id);
    expect(black!.breakerId).toBeNull();

    const resolved = resolveDirections(next);
    expect(resolved.get(black!.id)?.resolvedDirection).toBe('away');
    expect(resolved.get(white!.id)?.resolvedDirection).toBe('toward');
    expect(resolved.get(black!.id)?.directionSource).toBe('breaker');
  });

  it('throws when breaker box id is missing or not a breaker panel', () => {
    const job = createEmptyJob();
    expect(() => addBreaker(job.diagram, 'no-such-box')).toThrow();
    const d: Diagram = {
      ...job.diagram,
      junctionBoxes: [{ ...job.diagram.junctionBoxes[0]!, type: 'normal' }],
    };
    expect(() => addBreaker(d, d.junctionBoxes[0]!.id)).toThrow();
  });
});

describe('updateWire', () => {
  it('sets label and manual direction only when not breaker-locked', () => {
    const job = createEmptyJob('U');
    const panelId = job.diagram.junctionBoxes[0]!.id;
    let diagram = addBreaker(job.diagram, panelId);
    const breakerConduit = diagram.conduits.find((c) => c.kind === 'breaker')!;
    const blackId = breakerConduit.wireIds.find(
      (id) => diagram.wires.find((w) => w.id === id)?.color === 'black',
    )!;

    diagram = updateWire(diagram, blackId, { label: 'Renamed hot', manualDirection: 'toward' });
    const black = diagram.wires.find((w) => w.id === blackId)!;
    expect(black.label).toBe('Renamed hot');
    expect(black.manualDirection).toBeNull();

    diagram = addJunctionBox(diagram, 300, 300);
    diagram = addLocalConduit(diagram, {
      junctionBoxId: diagram.junctionBoxes.find((b) => b.type === 'normal')!.id,
      anchor: 'top-center',
      wireColors: ['red'],
    });
    const redWire = diagram.wires.find((w) => w.color === 'red' && w.conduitId)!;
    diagram = updateWire(diagram, redWire.id, { manualDirection: 'away', label: 'Traveler A' });
    const updated = diagram.wires.find((w) => w.id === redWire.id)!;
    expect(updated.manualDirection).toBe('away');
    expect(updated.label).toBe('Traveler A');
  });
});

describe('junction geometry mutations', () => {
  it('adds a centered normal junction box with incremental label', () => {
    let diagram = createEmptyJob().diagram;

    diagram = addJunctionBox(diagram, 200, 200);
    diagram = addJunctionBox(diagram, 480, 200);

    const normals = diagram.junctionBoxes.filter((b) => b.type === 'normal');
    expect(normals).toHaveLength(2);
    expect(normals[0]!.label).toBe('');
    expect(normals[1]!.label).toBe('');

    const first = normals[0]!;
    expect(first.width).toBeGreaterThan(MIN_JUNCTION_SIZE.width);

    /** Center anchoring expectation */
    expect(first.x).toBeCloseTo(200 - first.width / 2);
    expect(first.y).toBeCloseTo(200 - first.height / 2);
  });

  it('mutates junction position and clamps resize minimums', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 0, 0);
    const id = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;

    diagram = moveJunctionBox(diagram, id, 111, 222);
    const moved = diagram.junctionBoxes.find((b) => b.id === id)!;
    expect(moved.x).toBeCloseTo(111);
    expect(moved.y).toBeCloseTo(222);

    diagram = resizeJunctionBox(diagram, id, { width: 10, height: MIN_JUNCTION_SIZE.height - 1 });
    const resized = diagram.junctionBoxes.find((b) => b.id === id)!;
    expect(resized.width).toBeGreaterThanOrEqual(MIN_JUNCTION_SIZE.width);
    expect(resized.height).toBeGreaterThanOrEqual(MIN_JUNCTION_SIZE.height);
  });

  it('moveJunctionBox shifts conduit paths and wire links on that box', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 300, 300);
    const boxA = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addJunctionBox(diagram, 900, 300);
    const boxB = diagram.junctionBoxes.find((b) => b.id !== boxA.id && b.type === 'normal')!;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxA.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const localWireId = diagram.conduits[0]!.wireIds[0]!;
    const localPathBefore = diagram.layout.conduitPaths[diagram.conduits[0]!.id]!.points;

    diagram = addSpanConduit(diagram, {
      junctionBoxIdA: boxA.id,
      anchorA: 'top-center',
      junctionBoxIdB: boxB.id,
      anchorB: 'top-center',
      wireColors: ['red'],
    });
    const spanConduitId = diagram.conduits.find((c) => c.kind === 'span')!.id;
    const spanPathBefore = diagram.layout.conduitPaths[spanConduitId]!.points;

    diagram = addLocalConduit(diagram, {
      junctionBoxId: boxB.id,
      anchor: 'middle-left',
      wireColors: ['white'],
    });
    const remoteWireId = diagram.conduits.find((c) => c.kind === 'local' && c.junctionBoxId === boxB.id)!.wireIds[0]!;

    diagram = addWireLinkToDiagram(diagram, localWireId, remoteWireId);
    const linkId = diagram.wireLinks[0]!.id;
    const linkPathBefore = diagram.layout.wireLinkPaths[linkId]!.points;

    const dx = 50;
    const dy = -30;
    diagram = moveJunctionBox(diagram, boxA.id, boxA.x + dx, boxA.y + dy);

    const localPathAfter = diagram.layout.conduitPaths[diagram.conduits.find((c) => c.kind === 'local' && c.junctionBoxId === boxA.id)!.id]!.points;
    expect(localPathAfter[0]!.x).toBeCloseTo(localPathBefore[0]!.x + dx);
    expect(localPathAfter[0]!.y).toBeCloseTo(localPathBefore[0]!.y + dy);

    const spanPathAfter = diagram.layout.conduitPaths[spanConduitId]!.points;
    expect(spanPathAfter.length).toBeGreaterThanOrEqual(2);
    expect(spanPathAfter[0]!.x).toBeCloseTo(spanPathBefore[0]!.x + dx);
    expect(spanPathAfter[0]!.y).toBeCloseTo(spanPathBefore[0]!.y + dy);
    for (let i = 1; i < spanPathAfter.length; i++) {
      const a = spanPathAfter[i - 1]!;
      const b = spanPathAfter[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }

    const linkPathAfter = diagram.layout.wireLinkPaths[linkId]!.points;
    expect(linkPathAfter.length).toBe(4);
    expect(linkPathAfter[0]).toEqual(linkPathBefore[0]);
    expect(linkPathAfter[linkPathAfter.length - 1]).toEqual(linkPathBefore[linkPathAfter.length - 1]);

    const wirePathAfter = diagram.layout.wirePaths![localWireId]!.points;
    expect(wirePathAfter[0]!.x).toBeCloseTo(localPathAfter[0]!.x);
    expect(wirePathAfter[0]!.y).toBeCloseTo(localPathAfter[0]!.y);
  });
});

describe('conduit mutations', () => {
  it('rejects local conduits on the breaker panel', () => {
    const diagram = createEmptyJob().diagram;
    const panelId = diagram.junctionBoxes[0]!.id;
    expect(() =>
      addLocalConduit(diagram, {
        junctionBoxId: panelId,
        anchor: 'bottom-center',
        wireColors: ['black'],
      }),
    ).toThrow(/breaker/i);
  });

  it('adds a local conduit with wires and a short stub pointing into the box', () => {
    const job = createEmptyJob('C');
    let diagram = job.diagram;
    diagram = addJunctionBox(diagram, 400, 400);
    const normal = diagram.junctionBoxes.find((b) => b.type === 'normal');
    expect(normal).toBeDefined();

    const anchor = 'middle-right' as const;
    const next = addLocalConduit(diagram, {
      junctionBoxId: normal!.id,
      anchor,
      wireColors: ['black', 'red'],
    });

    expect(next.conduits).toHaveLength(1);
    const conduit = next.conduits[0]!;
    expect(conduit.kind).toBe('local');
    expect(next.wires.filter((w) => w.conduitId === conduit.id)).toHaveLength(2);
    const path = next.layout.conduitPaths[conduit.id]?.points;
    expect(path?.length).toBeGreaterThanOrEqual(2);

    const start = anchorPoint(normal!, anchor);
    const tip = path![path!.length - 1]!;
    const center = { x: normal!.x + normal!.width / 2, y: normal!.y + normal!.height / 2 };
    const startDist = Math.hypot(start.x - center.x, start.y - center.y);
    const tipDist = Math.hypot(tip.x - center.x, tip.y - center.y);
    expect(tipDist).toBeLessThan(startDist);
    expect(Math.hypot(tip.x - start.x, tip.y - start.y)).toBeLessThanOrEqual(LOCAL_CONDUIT_STUB_LENGTH + 20);
  });

  it('adds a span conduit between two boxes', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 500, 500);
    diagram = addJunctionBox(diagram, 900, 500);

    const normals = diagram.junctionBoxes.filter((j) => j.type === 'normal');
    expect(normals.length).toBeGreaterThanOrEqual(2);

    const next = addSpanConduit(diagram, {
      junctionBoxIdA: normals[0]!.id,
      anchorA: 'middle-right',
      junctionBoxIdB: normals[1]!.id,
      anchorB: 'middle-left',
      wireColors: ['white'],
    });

    expect(next.conduits[0]!.kind).toBe('span');
    const path = next.layout.conduitPaths[next.conduits[0]!.id]?.points;
    expect(path!.length).toBeGreaterThanOrEqual(2);
  });
});
