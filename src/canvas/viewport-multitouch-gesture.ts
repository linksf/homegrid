export type MultiTouchGestureMode = 'undecided' | 'pan' | 'zoom';

export type ViewTransform = {
  tx: number;
  ty: number;
  scale: number;
};

export type MultiTouchSession = {
  mode: MultiTouchGestureMode;
  initialDistance: number;
  initialScale: number;
  initialView: ViewTransform;
  initialCenterRoot: { x: number; y: number };
  initialCenterClient: { x: number; y: number };
};

/** Finger separation must change by this fraction before zoom locks in. */
export const MULTITOUCH_ZOOM_ACTIVATION_RATIO = 0.18;

/** Midpoint must move this many CSS pixels before pan locks in. */
export const MULTITOUCH_PAN_ACTIVATION_PX = 16;

export const MULTITOUCH_PINCH_START_DISTANCE_PX = 12;
export const MULTITOUCH_PINCH_START_DISTANCE_TOUCH_PX = 28;

export function pinchStartDistancePx(touchNavigation: boolean): number {
  return touchNavigation ? MULTITOUCH_PINCH_START_DISTANCE_TOUCH_PX : MULTITOUCH_PINCH_START_DISTANCE_PX;
}

export function clientCenter(pts: readonly { x: number; y: number }[]): { x: number; y: number } {
  return {
    x: (pts[0]!.x + pts[1]!.x) / 2,
    y: (pts[0]!.y + pts[1]!.y) / 2,
  };
}

export function clientDistance(pts: readonly { x: number; y: number }[]): number {
  return Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
}

export function classifyMultiTouchGesture(
  currentMode: MultiTouchGestureMode,
  initialCenterClient: { x: number; y: number },
  initialDistance: number,
  pts: readonly { x: number; y: number }[],
): MultiTouchGestureMode {
  if (currentMode !== 'undecided') return currentMode;
  if (pts.length < 2 || initialDistance <= 0) return 'undecided';

  const center = clientCenter(pts);
  const dist = clientDistance(pts);
  const distDeltaRatio = Math.abs(dist - initialDistance) / initialDistance;
  const centerMove = Math.hypot(center.x - initialCenterClient.x, center.y - initialCenterClient.y);

  if (distDeltaRatio >= MULTITOUCH_ZOOM_ACTIVATION_RATIO) return 'zoom';
  if (centerMove >= MULTITOUCH_PAN_ACTIVATION_PX) return 'pan';
  return 'undecided';
}

function worldPointUnderRoot(view: ViewTransform, root: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (root.x - view.tx) / view.scale,
    y: (root.y - view.ty) / view.scale,
  };
}

export function viewForMultiTouchPan(
  session: MultiTouchSession,
  centerRoot: { x: number; y: number },
): ViewTransform {
  const worldCenter = worldPointUnderRoot(session.initialView, session.initialCenterRoot);
  return {
    scale: session.initialView.scale,
    tx: centerRoot.x - worldCenter.x * session.initialView.scale,
    ty: centerRoot.y - worldCenter.y * session.initialView.scale,
  };
}

export function viewForMultiTouchZoom(
  session: MultiTouchSession,
  distance: number,
  centerRoot: { x: number; y: number },
  clampScale: (value: number) => number,
): ViewTransform {
  const scale = clampScale(session.initialScale * (distance / session.initialDistance));
  const worldCenter = worldPointUnderRoot(session.initialView, session.initialCenterRoot);
  return {
    scale,
    tx: centerRoot.x - worldCenter.x * scale,
    ty: centerRoot.y - worldCenter.y * scale,
  };
}

/** Pan-only while undecided; locked pan ignores pinch; locked zoom ignores pan translation. */
export function viewForMultiTouchGesture(
  session: MultiTouchSession,
  pts: readonly { x: number; y: number }[],
  centerRoot: { x: number; y: number },
  clampScale: (value: number) => number,
): ViewTransform {
  if (session.mode === 'zoom') {
    return viewForMultiTouchZoom(session, clientDistance(pts), centerRoot, clampScale);
  }
  return viewForMultiTouchPan(session, centerRoot);
}
