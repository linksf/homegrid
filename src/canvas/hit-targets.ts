/** Stroke hit width in CSS pixels (constant on screen via non-scaling-stroke). */
export const HIT_STROKE_SCREEN_PX = 28;

/** Tap target radius in CSS pixels (~44pt Apple HIG diameter). */
export const HIT_RADIUS_SCREEN_PX = 22;

/** Junction anchor hit radius on canvas (tap target). */
export const ANCHOR_HIT_RADIUS_SCREEN_PX = 44;

/** Junction anchor radius used when resolving overlapping hit targets. */
export const ANCHOR_HIT_TEST_RADIUS_SCREEN_PX = 32;

/** Slightly wider hit stroke for cables and conduit runs (stub connections). */
export const CABLE_HIT_STROKE_SCREEN_PX = 36;

/** World-space circle radius for a fixed screen-space tap target at the current zoom. */
export function worldHitRadius(viewScale: number, screenRadius = HIT_RADIUS_SCREEN_PX): number {
  return screenRadius / Math.max(viewScale, 0.001);
}
