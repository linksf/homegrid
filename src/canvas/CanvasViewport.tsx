import type { JSX, PropsWithChildren, ReactNode, RefObject } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fitTransform, type FitBounds } from './viewport-fit';
import {
  purgeCompatibilityMousePointers,
  shouldIgnoreWheelZoom,
  shouldTrackPointer,
  touchPointerCount,
  touchPointersForPinch,
  viewportMultiTouchAllowed,
  type TrackedPointer,
} from './viewport-pointer-tracking';
import {
  isPenHoverEvent,
  isPenPointer,
  sheetPanAllowedForPointer,
  supportsTapGesturePointer,
} from './pen-input';
import { clientPointerMoved, SHEET_GESTURE_THRESHOLD_PX } from './pointer-drag-threshold';
import { useTouchNavigationProfile } from './touch-profile';
import {
  classifyMultiTouchGesture,
  clientCenter,
  clientDistance,
  pinchStartDistancePx,
  viewForMultiTouchGesture,
  type MultiTouchGestureMode,
  type MultiTouchSession,
} from './viewport-multitouch-gesture';

const MIN_SCALE = 0.25;
const MAX_SCALE = 16;

type CanvasViewportProps = PropsWithChildren<{
  className?: string;
  /** HTML controls rendered over the canvas (zoom buttons, etc.). */
  overlay?: ReactNode;
  /** SVG viewBox "minX minY width height"; large sheet leaves room for panning. */
  viewBox?: string;
  /** When true, canvas pan is disabled so placement clicks reach the diagram. */
  placementToolActive?: boolean;
  /** When true, left-drag on the sheet starts a marquee instead of panning. */
  marqueeSelectActive?: boolean;
  /** When true, left-drag anywhere pans the view (hand tool). */
  panToolActive?: boolean;
  /** Receives the live viewport API so parents above the provider can drive zoom/fit. */
  apiRef?: RefObject<DiagramViewportSnapshot | null>;
  /** CSS class setting the default canvas cursor for the active tool (e.g. canvas-viewport--tool-select). */
  toolCursorClass?: string;
  onMarqueeStart?: (world: { x: number; y: number }, e: React.PointerEvent) => void;
  onMarqueeMove?: (world: { x: number; y: number }, e: React.PointerEvent) => void;
  onMarqueeEnd?: (world: { x: number; y: number }, e: React.PointerEvent) => void;
  /** When true, right-click uses diagram hit-testing instead of the browser context menu. */
  entityContextMenuActive?: boolean;
  onEntityContextMenuAt?: (clientX: number, clientY: number) => void;
  /** Two-finger drag on empty canvas drives a marquee (touch select). */
  touchMarqueeSelectActive?: boolean;
  onMarqueeBoundsChange?: (bounds: { ax: number; ay: number; bx: number; by: number }) => void;
  onMarqueeBoundsCommit?: (bounds: { ax: number; ay: number; bx: number; by: number }) => void;
  /** Clears a touch marquee preview without applying selection. */
  onMarqueeBoundsClear?: () => void;
  /** Tap-to-cycle and long-press pick on touch and pen. */
  tapGestureActive?: boolean;
  longPressMs?: number;
  onTapAt?: (clientX: number, clientY: number, pointerType: string) => void;
  onLongPressAt?: (clientX: number, clientY: number, pointerType: string) => void;
  /** One-finger-style marquee drag with Apple Pencil on empty canvas (touch-first tablets). */
  penMarqueeSelectActive?: boolean;
  /** Hover preview while the pencil tip is above the display. */
  penHoverActive?: boolean;
  onPenHoverAt?: (clientX: number, clientY: number) => void;
  onPenHoverClear?: () => void;
  /** Large legible label shown in the canvas corner while the pencil hovers. */
  penHoverLabel?: string | null;
}>;

type PointerCaptureSession = {
  pointerId: number;
  captureTarget: Element;
};

type PanSession = PointerCaptureSession;

type MarqueeSession = PointerCaptureSession;

export type DiagramViewportSnapshot = Readonly<{
  translateX: number;
  translateY: number;
  scale: number;
  svgRef: RefObject<SVGSVGElement | null>;
  clientPointToWorld: (clientX: number, clientY: number) => { x: number; y: number } | null;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  /** Frame the given world-space rect within the viewport (no-op when null). */
  fitToRect: (rect: FitBounds | null) => void;
  /** True while a two-finger canvas gesture is active (pan/zoom). */
  isMultiTouchActive: () => boolean;
}>;

const DiagramViewportContext = createContext<DiagramViewportSnapshot | null>(null);

export function useDiagramViewport(): DiagramViewportSnapshot {
  const snapshot = useContext(DiagramViewportContext);
  if (!snapshot) {
    throw new Error('useDiagramViewport must be used beneath <CanvasViewport/>');
  }
  return snapshot;
}

type ViewTransform = {
  tx: number;
  ty: number;
  scale: number;
};

const ZOOM_STEP = 1.2;

function isSheetPointerTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.classList.contains('canvas-viewport__sheet');
}

const TAP_MOVE_TOLERANCE_PX = SHEET_GESTURE_THRESHOLD_PX;

type PendingSheetGesture = {
  pointerId: number;
  kind: 'pan' | 'marquee';
  startClient: { x: number; y: number };
  captureTarget: Element;
  worldStart: { x: number; y: number };
};

type TapGestureSession = {
  pointerId: number;
  startClient: { x: number; y: number };
  startTime: number;
  pointerType: string;
};

function worldBoundsFromClientPoints(
  svg: SVGSVGElement,
  pts: { x: number; y: number }[],
  view: ViewTransform,
): { ax: number; ay: number; bx: number; by: number } {
  const worlds = pts.map((pt) => worldPointFromClient(svg, pt.x, pt.y, view));
  const xs = worlds.map((w) => w.x);
  const ys = worlds.map((w) => w.y);
  return {
    ax: Math.min(...xs),
    ay: Math.min(...ys),
    bx: Math.max(...xs),
    by: Math.max(...ys),
  };
}

function zoomViewAroundRoot(
  view: ViewTransform,
  nextScale: number,
  pivotRoot: { x: number; y: number },
): ViewTransform {
  const prevS = view.scale;
  const clamped = clampScale(nextScale);
  if (clamped === prevS) return view;
  const world = {
    x: (pivotRoot.x - view.tx) / prevS,
    y: (pivotRoot.y - view.ty) / prevS,
  };
  return {
    scale: clamped,
    tx: pivotRoot.x - world.x * clamped,
    ty: pivotRoot.y - world.y * clamped,
  };
}

function clampScale(v: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
}

function svgRootPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function worldPointFromClient(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  view: ViewTransform,
): { x: number; y: number } {
  const root = svgRootPointFromClient(svg, clientX, clientY);
  return {
    x: (root.x - view.tx) / view.scale,
    y: (root.y - view.ty) / view.scale,
  };
}

function releasePointerCapture(session: PointerCaptureSession | null): void {
  if (!session) return;
  try {
    session.captureTarget.releasePointerCapture(session.pointerId);
  } catch {
    /* ignore */
  }
}

/** Infinite-ish SVG diagram surface with wheel zoom toward the cursor and pointer-drag pan on the sheet backdrop. */
export function CanvasViewport({
  children,
  className,
  viewBox = '-800 -600 5200 4000',
  placementToolActive = false,
  marqueeSelectActive = false,
  panToolActive = false,
  toolCursorClass,
  overlay,
  apiRef,
  onMarqueeStart,
  onMarqueeMove,
  onMarqueeEnd,
  entityContextMenuActive = false,
  onEntityContextMenuAt,
  touchMarqueeSelectActive = false,
  onMarqueeBoundsChange,
  onMarqueeBoundsCommit,
  onMarqueeBoundsClear,
  tapGestureActive = false,
  longPressMs = 500,
  onTapAt,
  onLongPressAt,
  penMarqueeSelectActive = false,
  penHoverActive = false,
  onPenHoverAt,
  onPenHoverClear,
  penHoverLabel = null,
}: CanvasViewportProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const touchNavigation = useTouchNavigationProfile();

  const viewBoxRect = useMemo(() => {
    const [minX = -800, minY = -600, width = 5200, height = 4000] = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    return { minX, minY, width, height };
  }, [viewBox]);
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, scale: 1 });
  const [overlayPanActive, setOverlayPanActive] = useState(false);
  const panSession = useRef<PanSession | null>(null);
  const marqueeSession = useRef<MarqueeSession | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointersRef = useRef(new Map<number, TrackedPointer>());
  const multiTouchRef = useRef<MultiTouchSession | null>(null);
  const multiTouchActiveRef = useRef(false);
  const [multiTouchActive, setMultiTouchActive] = useState(false);
  const touchMarqueeActiveRef = useRef(false);
  const lastTouchMarqueeBoundsRef = useRef<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const tapGestureRef = useRef<TapGestureSession | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const tapGestureConsumedRef = useRef(false);
  const penHoverPointerIdRef = useRef<number | null>(null);
  const pendingSheetGestureRef = useRef<PendingSheetGesture | null>(null);

  const zoomIn = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pivot = svgRootPointFromClient(svg, rect.left + rect.width / 2, rect.top + rect.height / 2);
    setView((vp) => zoomViewAroundRoot(vp, vp.scale * ZOOM_STEP, pivot));
  }, []);

  const zoomOut = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pivot = svgRootPointFromClient(svg, rect.left + rect.width / 2, rect.top + rect.height / 2);
    setView((vp) => zoomViewAroundRoot(vp, vp.scale / ZOOM_STEP, pivot));
  }, []);

  const resetView = useCallback(() => {
    setView({ tx: 0, ty: 0, scale: 1 });
  }, []);

  const fitToRect = useCallback(
    (rect: FitBounds | null) => {
      if (!rect) return;
      setView(fitTransform(rect, viewBoxRect, { minScale: MIN_SCALE, maxScale: MAX_SCALE }));
    },
    [viewBoxRect],
  );

  const viewportTransform = useMemo(
    (): string => [`translate(${view.tx}, ${view.ty})`, `scale(${view.scale})`].join(' '),
    [view.tx, view.ty, view.scale],
  );

  const viewportSnapshot = useMemo((): DiagramViewportSnapshot => {
    return {
      translateX: view.tx,
      translateY: view.ty,
      scale: view.scale,
      svgRef,
      clientPointToWorld(clientX: number, clientY: number) {
        const svg = svgRef.current;
        if (!svg) return null;
        return worldPointFromClient(svg, clientX, clientY, viewRef.current);
      },
      zoomIn,
      zoomOut,
      resetView,
      fitToRect,
      isMultiTouchActive() {
        return multiTouchActiveRef.current;
      },
    };
  }, [view.scale, view.tx, view.ty, zoomIn, zoomOut, resetView, fitToRect]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = viewportSnapshot;
    return () => {
      if (apiRef.current === viewportSnapshot) apiRef.current = null;
    };
  }, [apiRef, viewportSnapshot]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const blockSelect = (e: Event) => e.preventDefault();
    svg.addEventListener('selectstart', blockSelect);
    return () => svg.removeEventListener('selectstart', blockSelect);
  }, []);

  const cancelSingleFingerSessions = useCallback(() => {
    releasePointerCapture(marqueeSession.current);
    marqueeSession.current = null;
    releasePointerCapture(panSession.current);
    panSession.current = null;
    lastPointer.current = null;
    setOverlayPanActive(false);
  }, []);

  const clearTapGestureTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const cancelTapGesture = useCallback(() => {
    clearTapGestureTimer();
    tapGestureRef.current = null;
  }, [clearTapGestureTimer]);

  const clearPenHover = useCallback(() => {
    penHoverPointerIdRef.current = null;
    onPenHoverClear?.();
  }, [onPenHoverClear]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !penHoverActive) return;
    const onLeave = (e: PointerEvent) => {
      if (penHoverPointerIdRef.current === e.pointerId) {
        clearPenHover();
      }
    };
    svg.addEventListener('pointerleave', onLeave);
    return () => svg.removeEventListener('pointerleave', onLeave);
  }, [clearPenHover, penHoverActive]);

  const beginTapGesture = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!tapGestureActive || e.button !== 0) return;
      if (!supportsTapGesturePointer(e.pointerType, touchNavigation)) return;
      if (placementToolActive || panToolActive) return;
      if (isPenPointer(e.pointerType)) {
        clearPenHover();
      }
      cancelTapGesture();
      tapGestureConsumedRef.current = false;
      tapGestureRef.current = {
        pointerId: e.pointerId,
        startClient: { x: e.clientX, y: e.clientY },
        startTime: Date.now(),
        pointerType: e.pointerType,
      };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        const session = tapGestureRef.current;
        if (!session || tapGestureConsumedRef.current) return;
        tapGestureConsumedRef.current = true;
        onLongPressAt?.(session.startClient.x, session.startClient.y, session.pointerType);
        cancelTapGesture();
      }, longPressMs);
    },
    [
      cancelTapGesture,
      clearPenHover,
      longPressMs,
      onLongPressAt,
      panToolActive,
      placementToolActive,
      tapGestureActive,
      touchNavigation,
    ],
  );

  const clearTouchMarqueeVisual = useCallback(() => {
    lastTouchMarqueeBoundsRef.current = null;
    touchMarqueeActiveRef.current = false;
    onMarqueeBoundsClear?.();
  }, [onMarqueeBoundsClear]);

  const updateTouchMarqueeBounds = useCallback(
    (bounds: { ax: number; ay: number; bx: number; by: number }) => {
      lastTouchMarqueeBoundsRef.current = bounds;
      touchMarqueeActiveRef.current = true;
      onMarqueeBoundsChange?.(bounds);
    },
    [onMarqueeBoundsChange],
  );

  const commitTouchMarquee = useCallback(() => {
    const bounds = lastTouchMarqueeBoundsRef.current;
    lastTouchMarqueeBoundsRef.current = null;
    touchMarqueeActiveRef.current = false;
    if (bounds) {
      onMarqueeBoundsCommit?.(bounds);
    } else {
      onMarqueeBoundsClear?.();
    }
  }, [onMarqueeBoundsClear, onMarqueeBoundsCommit]);

  const endMultiTouchGesture = useCallback(() => {
    if (touchMarqueeActiveRef.current || lastTouchMarqueeBoundsRef.current) {
      commitTouchMarquee();
    }
    multiTouchRef.current = null;
    multiTouchActiveRef.current = false;
    setMultiTouchActive(false);
  }, [commitTouchMarquee]);

  const resetPointerTracking = useCallback(() => {
    pointersRef.current.clear();
    cancelTapGesture();
    endMultiTouchGesture();
    cancelSingleFingerSessions();
  }, [cancelSingleFingerSessions, cancelTapGesture, endMultiTouchGesture]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        resetPointerTracking();
      }
    };
    window.addEventListener('blur', resetPointerTracking);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', resetPointerTracking);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [resetPointerTracking]);

  const beginMultiTouch = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !viewportMultiTouchAllowed(pointersRef.current)) return;

    const tracked = touchPointersForPinch(pointersRef.current);
    const pts = tracked.map((pointer) => ({ x: pointer.x, y: pointer.y }));
    if (pts.length !== 2) return;

    const dist = clientDistance(pts);
    if (dist < pinchStartDistancePx(touchNavigation)) return;

    cancelSingleFingerSessions();

    const centerClient = clientCenter(pts);
    const centerRoot = svgRootPointFromClient(svg, centerClient.x, centerClient.y);
    multiTouchRef.current = {
      mode: 'undecided',
      initialDistance: dist,
      initialScale: viewRef.current.scale,
      initialView: { ...viewRef.current },
      initialCenterRoot: centerRoot,
      initialCenterClient: centerClient,
    };
    multiTouchActiveRef.current = true;
    setMultiTouchActive(true);
  }, [cancelSingleFingerSessions, touchNavigation]);

  const trackPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!shouldTrackPointer(e.pointerType, pointersRef.current)) return;
      if (e.pointerType === 'touch') {
        purgeCompatibilityMousePointers(pointersRef.current);
      }
      pointersRef.current.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        pointerType: e.pointerType,
        startedOnSheet: isSheetPointerTarget(e.target),
      });
      if (touchPointerCount(pointersRef.current) === 2) {
        beginMultiTouch();
      }
      beginTapGesture(e);
    },
    [beginMultiTouch, beginTapGesture],
  );

  const finishTapGesture = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const session = tapGestureRef.current;
      if (!session || session.pointerId !== e.pointerId) return;

      const moved = Math.hypot(e.clientX - session.startClient.x, e.clientY - session.startClient.y);
      const wasLongPress = tapGestureConsumedRef.current;
      cancelTapGesture();

      if (wasLongPress || multiTouchActiveRef.current) return;
      if (panSession.current?.pointerId === e.pointerId || marqueeSession.current?.pointerId === e.pointerId) return;
      if (moved > TAP_MOVE_TOLERANCE_PX) return;

      onTapAt?.(e.clientX, e.clientY, session.pointerType);
    },
    [cancelTapGesture, onTapAt],
  );

  const trackPenHover = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!penHoverActive) return;
      if (isPenHoverEvent(e)) {
        penHoverPointerIdRef.current = e.pointerId;
        onPenHoverAt?.(e.clientX, e.clientY);
        return;
      }
      if (penHoverPointerIdRef.current === e.pointerId && isPenPointer(e.pointerType) && e.buttons !== 0) {
        clearPenHover();
      }
    },
    [clearPenHover, onPenHoverAt, penHoverActive],
  );

  const trackPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    trackPenHover(e);

    const tapSession = tapGestureRef.current;
    if (tapSession && tapSession.pointerId === e.pointerId) {
      const dx = e.clientX - tapSession.startClient.x;
      const dy = e.clientY - tapSession.startClient.y;
      if (Math.hypot(dx, dy) > TAP_MOVE_TOLERANCE_PX) {
        cancelTapGesture();
      }
    }

    const tracked = pointersRef.current.get(e.pointerId);
    if (!tracked) return;
    pointersRef.current.set(e.pointerId, {
      ...tracked,
      x: e.clientX,
      y: e.clientY,
    });

    const session = multiTouchRef.current;
    const svg = svgRef.current;
    if (!session || !svg || touchPointerCount(pointersRef.current) < 2) return;

    const pts = touchPointersForPinch(pointersRef.current).map((pointer) => ({ x: pointer.x, y: pointer.y }));
    if (pts.length < 2) return;

    const nextMode: MultiTouchGestureMode = classifyMultiTouchGesture(
      session.mode,
      session.initialCenterClient,
      session.initialDistance,
      pts,
    );
    if (nextMode !== session.mode) {
      multiTouchRef.current = { ...session, mode: nextMode };
      if (nextMode === 'zoom') {
        clearTouchMarqueeVisual();
      }
    }

    const activeMode = multiTouchRef.current!.mode;
    const sheetMultiTouch =
      touchMarqueeSelectActive && viewportMultiTouchAllowed(pointersRef.current);

    if (sheetMultiTouch && activeMode === 'pan') {
      updateTouchMarqueeBounds(worldBoundsFromClientPoints(svg, pts, viewRef.current));
      return;
    }

    if (sheetMultiTouch && activeMode === 'undecided') {
      return;
    }

    if (touchMarqueeActiveRef.current || lastTouchMarqueeBoundsRef.current) {
      clearTouchMarqueeVisual();
    }

    const centerClient = clientCenter(pts);
    const centerRoot = svgRootPointFromClient(svg, centerClient.x, centerClient.y);
    setView(viewForMultiTouchGesture(multiTouchRef.current!, pts, centerRoot, clampScale));
  }, [cancelTapGesture, clearTouchMarqueeVisual, touchMarqueeSelectActive, trackPenHover, updateTouchMarqueeBounds]);

  const trackPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      finishTapGesture(e);
      pointersRef.current.delete(e.pointerId);
      if (touchPointerCount(pointersRef.current) < 2) {
        endMultiTouchGesture();
      }
    },
    [endMultiTouchGesture, finishTapGesture],
  );

  const onWheelCapture = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (shouldIgnoreWheelZoom(e.ctrlKey) || multiTouchActiveRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;

    const dzRaw = Math.exp(-e.deltaY * 0.0015);
    const pivot = svgRootPointFromClient(svg, e.clientX, e.clientY);
    setView((vp) => zoomViewAroundRoot(vp, vp.scale * dzRaw, pivot));
  }, []);

  function beginPan(e: React.PointerEvent, captureTarget: Element) {
    if (multiTouchActiveRef.current || touchPointerCount(pointersRef.current) >= 2) return;
    if (!svgRef.current) return;
    if (e.button !== 0 && e.button !== 1) return;

    if (tapGestureRef.current?.pointerId === e.pointerId) {
      cancelTapGesture();
    }

    panSession.current = { pointerId: e.pointerId, captureTarget };
    lastPointer.current = svgRootPointFromClient(svgRef.current, e.clientX, e.clientY);
    captureTarget.setPointerCapture(e.pointerId);
  }

  function beginSheetPointer(e: React.PointerEvent) {
    if (placementToolActive) return;
    if (!svgRef.current) return;
    if (multiTouchActiveRef.current || touchPointerCount(pointersRef.current) >= 2) return;

    const penMarquee =
      penMarqueeSelectActive && isPenPointer(e.pointerType) && e.button === 0 && onMarqueeStart;
    const desktopMarquee = marqueeSelectActive && e.button === 0 && onMarqueeStart;

    if (penMarquee || desktopMarquee) {
      if (tapGestureRef.current?.pointerId === e.pointerId) {
        cancelTapGesture();
      }
      const world = worldPointFromClient(svgRef.current, e.clientX, e.clientY, viewRef.current);
      pendingSheetGestureRef.current = {
        pointerId: e.pointerId,
        kind: 'marquee',
        startClient: { x: e.clientX, y: e.clientY },
        captureTarget: e.currentTarget,
        worldStart: world,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (!sheetPanAllowedForPointer(e.pointerType, touchNavigation, panToolActive)) {
      return;
    }

    const canPanWithLeft = panToolActive || !marqueeSelectActive;
    if (e.button === 0 && !canPanWithLeft) return;

    pendingSheetGestureRef.current = {
      pointerId: e.pointerId,
      kind: 'pan',
      startClient: { x: e.clientX, y: e.clientY },
      captureTarget: e.currentTarget,
      worldStart: worldPointFromClient(svgRef.current, e.clientX, e.clientY, viewRef.current),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function activatePendingSheetGesture(e: React.PointerEvent) {
    const pending = pendingSheetGestureRef.current;
    if (!pending || pending.pointerId !== e.pointerId || !svgRef.current) return;

    pendingSheetGestureRef.current = null;

    if (pending.kind === 'marquee') {
      marqueeSession.current = { pointerId: pending.pointerId, captureTarget: pending.captureTarget };
      onMarqueeStart?.(pending.worldStart, e);
      return;
    }

    if (tapGestureRef.current?.pointerId === e.pointerId) {
      cancelTapGesture();
    }

    panSession.current = { pointerId: pending.pointerId, captureTarget: pending.captureTarget };
    lastPointer.current = svgRootPointFromClient(svgRef.current, pending.startClient.x, pending.startClient.y);
  }

  function beginPanOverlay(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setOverlayPanActive(true);
    beginPan(e, e.currentTarget);
  }

  function movePanPointer(e: React.PointerEvent) {
    if (multiTouchActiveRef.current) return;
    if (!svgRef.current) return;
    if (!panSession.current || e.pointerId !== panSession.current.pointerId) return;
    const prevPt = lastPointer.current;
    if (!prevPt) return;

    const cur = svgRootPointFromClient(svgRef.current, e.clientX, e.clientY);
    const dx = cur.x - prevPt.x;
    const dy = cur.y - prevPt.y;
    lastPointer.current = cur;

    setView((vp) => ({ ...vp, tx: vp.tx + dx, ty: vp.ty + dy }));
  }

  function endPanPointer(e: React.PointerEvent) {
    if (!panSession.current || panSession.current.pointerId !== e.pointerId) return;
    releasePointerCapture(panSession.current);
    panSession.current = null;
    lastPointer.current = null;
    setOverlayPanActive(false);
  }

  function moveSheetPointer(e: React.PointerEvent) {
    if (multiTouchActiveRef.current) return;

    const pending = pendingSheetGestureRef.current;
    if (pending && pending.pointerId === e.pointerId) {
      if (
        clientPointerMoved(
          e.clientX,
          e.clientY,
          pending.startClient.x,
          pending.startClient.y,
          SHEET_GESTURE_THRESHOLD_PX,
        )
      ) {
        activatePendingSheetGesture(e);
      } else {
        return;
      }
    }

    if (marqueeSession.current && e.pointerId === marqueeSession.current.pointerId) {
      if (!svgRef.current) return;
      const world = worldPointFromClient(svgRef.current, e.clientX, e.clientY, viewRef.current);
      onMarqueeMove?.(world, e);
      return;
    }

    movePanPointer(e);
  }

  function endSheetPointer(e: React.PointerEvent) {
    if (pendingSheetGestureRef.current?.pointerId === e.pointerId) {
      pendingSheetGestureRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (marqueeSession.current && e.pointerId === marqueeSession.current.pointerId) {
      if (svgRef.current && !multiTouchActiveRef.current) {
        const world = worldPointFromClient(svgRef.current, e.clientX, e.clientY, viewRef.current);
        onMarqueeEnd?.(world, e);
      }
      releasePointerCapture(marqueeSession.current);
      marqueeSession.current = null;
      return;
    }

    endPanPointer(e);
  }

  const { minX, minY, width: vw, height: vh } = viewBoxRect;
  const showPanOverlay = panToolActive || overlayPanActive;

  return (
    <DiagramViewportContext.Provider value={viewportSnapshot}>
      <div className="canvas-viewport-shell">
        <svg
          ref={svgRef}
          className={[
            className,
            'canvas-viewport',
            toolCursorClass,
            multiTouchActive ? 'canvas-viewport--multi-touch' : '',
            penHoverActive ? 'canvas-viewport--pen-hover' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          viewBox={`${minX} ${minY} ${vw} ${vh}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDownCapture={trackPointerDown}
          onPointerMoveCapture={trackPointerMove}
          onPointerUpCapture={trackPointerUp}
          onPointerCancelCapture={trackPointerUp}
          onWheelCapture={onWheelCapture}
          onContextMenuCapture={(e) => {
            if (!entityContextMenuActive || !onEntityContextMenuAt) return;
            e.preventDefault();
            e.stopPropagation();
            onEntityContextMenuAt(e.clientX, e.clientY);
          }}
        >
          <rect className="canvas-viewport__frame" width={vw} height={vh} x={minX} y={minY} />

          <rect
            className="canvas-viewport__sheet"
            x={minX}
            y={minY}
            width={vw}
            height={vh}
            pointerEvents={placementToolActive ? 'none' : 'auto'}
            onPointerDown={beginSheetPointer}
            onPointerMove={moveSheetPointer}
            onPointerUp={endSheetPointer}
            onPointerCancel={endSheetPointer}
            onLostPointerCapture={endSheetPointer}
          />

          <g transform={viewportTransform}>
            {children}
            {showPanOverlay && (
              <rect
                className="canvas-pan-overlay"
                x={minX}
                y={minY}
                width={vw}
                height={vh}
                pointerEvents="all"
                aria-hidden
                onPointerDown={beginPanOverlay}
                onPointerMove={movePanPointer}
                onPointerUp={endPanPointer}
                onPointerCancel={endPanPointer}
              />
            )}
          </g>
        </svg>
        {overlay}
        {penHoverLabel ? (
          <div className="pen-hover-banner" aria-live="polite">
            {penHoverLabel}
          </div>
        ) : null}
      </div>
    </DiagramViewportContext.Provider>
  );
}
