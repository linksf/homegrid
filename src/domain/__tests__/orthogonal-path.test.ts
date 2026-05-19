import { describe, expect, it } from 'vitest';
import { conduitStubPath, orthogonalRoute } from '../orthogonal-path';

describe('orthogonalRoute', () => {
  it('returns a horizontal then vertical path', () => {
    const pts = orthogonalRoute({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]).toEqual({ x: 100, y: 0 });
    expect(pts[2]).toEqual({ x: 100, y: 50 });
  });

  it('returns two points when already axis-aligned', () => {
    expect(orthogonalRoute({ x: 0, y: 5 }, { x: 80, y: 5 })).toHaveLength(2);
    expect(orthogonalRoute({ x: 3, y: 0 }, { x: 3, y: 90 })).toHaveLength(2);
  });
});

describe('conduitStubPath', () => {
  it('uses only axis-aligned segments', () => {
    const pts = conduitStubPath({ x: 200, y: 200 }, { x: 1, y: 0 }, 120);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const axisAligned = a.x === b.x || a.y === b.y;
      expect(axisAligned).toBe(true);
    }
  });
});
