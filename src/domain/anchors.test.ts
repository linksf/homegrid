import { describe, expect, it } from 'vitest';
import { anchorPoint } from './anchors';
import type { JunctionBox } from './types';

const box = (overrides: Partial<JunctionBox> = {}): JunctionBox => ({
  id: 'jb1',
  type: 'normal',
  label: 'Test',
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  ...overrides,
});

describe('anchorPoint', () => {
  it('returns corners and center from box geometry', () => {
    expect(anchorPoint(box(), 'top-left')).toEqual({ x: 10, y: 20 });
    expect(anchorPoint(box(), 'bottom-right')).toEqual({ x: 110, y: 60 });
    expect(anchorPoint(box(), 'center')).toEqual({ x: 60, y: 40 });
  });

  it('handles fractional anchors on edges', () => {
    expect(anchorPoint(box(), 'top-center')).toEqual({ x: 60, y: 20 });
    expect(anchorPoint(box(), 'middle-left')).toEqual({ x: 10, y: 40 });
  });
});
