export type TrackedPointer = {
  x: number;
  y: number;
  pointerType: string;
  /** True when the pointer down target was the canvas backdrop sheet. */
  startedOnSheet: boolean;
};

/** Pointers that participate in two-finger pinch (not pen or compatibility mouse). */
export function touchPointersForPinch(map: ReadonlyMap<number, TrackedPointer>): TrackedPointer[] {
  return [...map.values()].filter((p) => p.pointerType === 'touch');
}

export function touchPointerCount(map: ReadonlyMap<number, TrackedPointer>): number {
  return touchPointersForPinch(map).length;
}

/** Viewport pinch/pan requires both touches to have started on empty canvas. */
export function viewportMultiTouchAllowed(map: ReadonlyMap<number, TrackedPointer>): boolean {
  const touches = touchPointersForPinch(map);
  if (touches.length !== 2) return false;
  return touches.every((pointer) => pointer.startedOnSheet);
}

/**
 * iPad Safari often emits a compatibility `mouse` pointer alongside `touch` for the same finger.
 * Tracking both makes the map look like a two-finger pinch and causes runaway zoom.
 */
export function shouldTrackPointer(
  pointerType: string,
  map: ReadonlyMap<number, TrackedPointer>,
): boolean {
  if (pointerType === 'mouse' && touchPointerCount(map) > 0) {
    return false;
  }
  return true;
}

/** Drop compatibility mouse entries when a real touch begins. */
export function purgeCompatibilityMousePointers(map: Map<number, TrackedPointer>): void {
  for (const [id, p] of map) {
    if (p.pointerType === 'mouse') {
      map.delete(id);
    }
  }
}

/** Browser pinch-to-zoom is often delivered as ctrl+wheel; ignore for canvas zoom. */
export function shouldIgnoreWheelZoom(ctrlKey: boolean): boolean {
  return ctrlKey;
}
