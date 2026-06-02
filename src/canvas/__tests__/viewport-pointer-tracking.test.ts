import { describe, expect, it } from 'vitest';
import {
  purgeCompatibilityMousePointers,
  shouldIgnoreWheelZoom,
  shouldTrackPointer,
  touchPointerCount,
  touchPointersForPinch,
  viewportMultiTouchAllowed,
  type TrackedPointer,
} from '../viewport-pointer-tracking';

function mapOf(entries: [number, TrackedPointer][]): Map<number, TrackedPointer> {
  return new Map(entries);
}

describe('touchPointersForPinch', () => {
  it('includes only touch pointers', () => {
    const m = mapOf([
      [1, { x: 0, y: 0, pointerType: 'touch', startedOnSheet: true }],
      [2, { x: 10, y: 0, pointerType: 'mouse', startedOnSheet: false }],
      [3, { x: 20, y: 0, pointerType: 'pen', startedOnSheet: false }],
    ]);
    expect(touchPointersForPinch(m)).toHaveLength(1);
    expect(touchPointerCount(m)).toBe(1);
  });
});

describe('shouldTrackPointer', () => {
  it('rejects mouse while a touch is active', () => {
    const m = mapOf([[1, { x: 0, y: 0, pointerType: 'touch', startedOnSheet: true }]]);
    expect(shouldTrackPointer('mouse', m)).toBe(false);
    expect(shouldTrackPointer('touch', m)).toBe(true);
  });

  it('allows mouse when no touch is tracked', () => {
    expect(shouldTrackPointer('mouse', new Map())).toBe(true);
  });
});

describe('purgeCompatibilityMousePointers', () => {
  it('removes mouse entries but keeps touch', () => {
    const m = mapOf([
      [1, { x: 0, y: 0, pointerType: 'touch', startedOnSheet: true }],
      [2, { x: 1, y: 1, pointerType: 'mouse', startedOnSheet: false }],
    ]);
    purgeCompatibilityMousePointers(m);
    expect([...m.keys()]).toEqual([1]);
  });
});

describe('viewportMultiTouchAllowed', () => {
  it('requires both touches to start on the sheet', () => {
    const bothSheet = mapOf([
      [1, { x: 0, y: 0, pointerType: 'touch', startedOnSheet: true }],
      [2, { x: 10, y: 0, pointerType: 'touch', startedOnSheet: true }],
    ]);
    const mixed = mapOf([
      [1, { x: 0, y: 0, pointerType: 'touch', startedOnSheet: false }],
      [2, { x: 10, y: 0, pointerType: 'touch', startedOnSheet: true }],
    ]);
    expect(viewportMultiTouchAllowed(bothSheet)).toBe(true);
    expect(viewportMultiTouchAllowed(mixed)).toBe(false);
  });
});

describe('shouldIgnoreWheelZoom', () => {
  it('ignores ctrl+wheel (pinch synthesis)', () => {
    expect(shouldIgnoreWheelZoom(true)).toBe(true);
    expect(shouldIgnoreWheelZoom(false)).toBe(false);
  });
});
