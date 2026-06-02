import { describe, expect, it } from 'vitest';
import { worldHitRadius, HIT_RADIUS_SCREEN_PX } from '../hit-targets';

describe('worldHitRadius', () => {
  it('shrinks world radius as zoom increases', () => {
    expect(worldHitRadius(2)).toBe(HIT_RADIUS_SCREEN_PX / 2);
    expect(worldHitRadius(0.5)).toBe(HIT_RADIUS_SCREEN_PX / 0.5);
  });

  it('guards against zero scale', () => {
    expect(worldHitRadius(0)).toBe(HIT_RADIUS_SCREEN_PX / 0.001);
  });
});
