import { describe, expect, it } from 'vitest';
import {
  defaultFourPointPath,
  dragFixedVertex,
  dragPathVertex,
  draggableLinkVertexIndices,
  draggablePathVertexIndices,
  draggableWireVertexIndices,
  FIXED_LINK_VERTEX_COUNT,
  FIXED_WIRE_VERTEX_COUNT,
  normalizeLinkPath,
  normalizeWirePath,
  simplifyOrthogonalPath,
} from '../path-editing';
import { moveConduitJoint } from '../path-routing';
import { createEmptyJob } from '../defaults';
import { addLightBulb } from '../device-mutations';
import { addDeviceConduit } from '../mutations';
import { resolveConduitPath } from '../path-routing';

describe('path editing', () => {
  it('lists interior and free-end joints', () => {
    expect(draggablePathVertexIndices(3, { start: 'fixed', end: 'fixed' })).toEqual([1]);
    expect(draggablePathVertexIndices(3, { start: 'fixed', end: 'free' })).toEqual([1, 2]);
  });

  it('wire paths expose interior and free end anchors', () => {
    expect(draggableWireVertexIndices(4, true, false)).toEqual([1, 2, 3]);
    expect(draggableWireVertexIndices(4, true, true)).toEqual([1, 2]);
    expect(draggableWireVertexIndices(5, true, true)).toEqual([1, 2, 3]);
  });

  it('wire links expose only interior anchors', () => {
    expect(draggableLinkVertexIndices()).toEqual([1, 2, 3]);
  });

  it('keeps segments orthogonal when dragging a bend', () => {
    const pts = dragPathVertex(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      1,
      { x: 60, y: 40 },
    );
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it('stores a custom conduit path after joint drag', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 300, 300);
    const node = diagram.deviceNodes.find((n) => n.deviceKind === 'lightBulb' && n.slot === 0)!;
    diagram = addDeviceConduit(diagram, { deviceNodeId: node.id, wireColors: ['black'] });
    const conduit = diagram.conduits.find((c) => c.kind === 'device')!;
    const base = resolveConduitPath(diagram, conduit)!;

    diagram = moveConduitJoint(diagram, conduit.id, base.length - 1, base[base.length - 1]!.x + 48, base[base.length - 1]!.y);
    const stored = diagram.layout.conduitPaths[conduit.id]!.points;
    expect(stored.length).toBeGreaterThanOrEqual(2);
    expect(stored[0]).toEqual(base[0]);
  });

  it('simplifies collinear points', () => {
    const simplified = simplifyOrthogonalPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(simplified).toHaveLength(2);
  });

  it('creates exactly four anchors for wires and five for dashed links', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 120, y: 80 };
    expect(defaultFourPointPath(start, end)).toHaveLength(FIXED_WIRE_VERTEX_COUNT);
    expect(normalizeWirePath(null, start, end)).toHaveLength(FIXED_WIRE_VERTEX_COUNT);
    expect(normalizeLinkPath(null, start, end)).toHaveLength(FIXED_LINK_VERTEX_COUNT);
  });

  it('dragFixedVertex does not change anchor count', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 100 };
    const path = defaultFourPointPath(start, end);
    const moved = dragFixedVertex(path, 1, { x: 40, y: 12 });
    expect(moved).toHaveLength(FIXED_WIRE_VERTEX_COUNT);
    expect(moved[0]).toEqual(start);
    expect(moved[3]).toEqual(end);
    expect(moved[1]).toEqual({ x: 36, y: 12 });
  });
});
