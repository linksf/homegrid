/** Screen pixels before an empty-canvas pan or marquee begins. */
export const SHEET_GESTURE_THRESHOLD_PX = 14;

/** Screen pixels before a room or junction box starts moving. */
export const LARGE_ENTITY_DRAG_THRESHOLD_PX = 18;

/** Screen pixels before a selected junction anchor starts moving. */
export const ANCHOR_DRAG_THRESHOLD_PX = 10;

export function clientPointerMoved(
  clientX: number,
  clientY: number,
  startClientX: number,
  startClientY: number,
  thresholdPx: number,
): boolean {
  return Math.hypot(clientX - startClientX, clientY - startClientY) >= thresholdPx;
}
