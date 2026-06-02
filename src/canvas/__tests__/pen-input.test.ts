import { describe, expect, it } from 'vitest';
import {
  isPenBarrelPressEvent,
  isPenHoverEvent,
  isPenPointer,
  sheetPanAllowedForPointer,
  supportsTapGesturePointer,
} from '../pen-input';

describe('isPenPointer', () => {
  it('recognizes pen pointer type', () => {
    expect(isPenPointer('pen')).toBe(true);
    expect(isPenPointer('touch')).toBe(false);
    expect(isPenPointer('mouse')).toBe(false);
  });
});

describe('isPenHoverEvent', () => {
  it('is true when pen moves with no buttons down', () => {
    expect(isPenHoverEvent({ pointerType: 'pen', buttons: 0 })).toBe(true);
    expect(isPenHoverEvent({ pointerType: 'pen', buttons: 1 })).toBe(false);
    expect(isPenHoverEvent({ pointerType: 'touch', buttons: 0 })).toBe(false);
  });
});

describe('isPenBarrelPressEvent', () => {
  it('detects barrel-only presses', () => {
    expect(
      isPenBarrelPressEvent({ pointerType: 'pen', buttons: 2, button: 2, pressure: 0 }),
    ).toBe(true);
    expect(
      isPenBarrelPressEvent({ pointerType: 'pen', buttons: 1, button: 0, pressure: 0.4 }),
    ).toBe(false);
    expect(
      isPenBarrelPressEvent({ pointerType: 'mouse', buttons: 2, button: 2, pressure: 0 }),
    ).toBe(false);
  });
});

describe('supportsTapGesturePointer', () => {
  it('enables touch taps only on touch-first devices and pen everywhere', () => {
    expect(supportsTapGesturePointer('touch', true)).toBe(true);
    expect(supportsTapGesturePointer('touch', false)).toBe(false);
    expect(supportsTapGesturePointer('pen', true)).toBe(true);
    expect(supportsTapGesturePointer('pen', false)).toBe(true);
    expect(supportsTapGesturePointer('mouse', false)).toBe(false);
  });
});

describe('sheetPanAllowedForPointer', () => {
  it('allows finger pan on touch nav but not pen unless hand tool', () => {
    expect(sheetPanAllowedForPointer('touch', true, false)).toBe(true);
    expect(sheetPanAllowedForPointer('pen', true, false)).toBe(false);
    expect(sheetPanAllowedForPointer('pen', true, true)).toBe(true);
    expect(sheetPanAllowedForPointer('mouse', false, false)).toBe(true);
  });
});
