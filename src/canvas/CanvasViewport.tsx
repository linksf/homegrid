import type { JSX, PropsWithChildren, ReactNode, RefObject } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

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
  /** CSS class setting the default canvas cursor for the active tool (e.g. canvas-viewport--tool-select). */
  toolCursorClass?: string;
  onMarqueeStart?: (world: { x: number; y: number }, e: React.PointerEvent) => void;
  onMarqueeMove?: (world: { x: number; y: number }, e: React.PointerEvent) => void;
  onMarqueeEnd?: (world: { x: number; y: number }, e: React.PointerEvent) => void;
}>;

type PanSession = {
  pointerId: number;
};

type MarqueeSession = {
  pointerId: number;
};

export type DiagramViewportSnapshot = Readonly<{
  translateX: number;
  translateY: number;
  scale: number;
  svgRef: RefObject<SVGSVGElement | null>;
  clientPointToWorld: (clientX: number, clientY: number) => { x: number; y: number } | null;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
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
  onMarqueeStart,
  onMarqueeMove,
  onMarqueeEnd,
}: CanvasViewportProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, scale: 1 });
  const [overlayPanActive, setOverlayPanActive] = useState(false);
  const panSession = useRef<PanSession | null>(null);
  const marqueeSession = useRef<MarqueeSession | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    initialDistance: number;
    initialScale: number;
    pivotRoot: { x: number; y: number };
  } | null>(null);

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
    };
  }, [view.scale, view.tx, view.ty, zoomIn, zoomOut, resetView]);

  const syncPinchFromPointers = useCallback(() => {
    const svg = svgRef.current;
    const pts = [...pointersRef.current.values()];
    if (!svg || pts.length !== 2) return;

    const dist = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
    if (dist < 6) return;

    const cx = (pts[0]!.x + pts[1]!.x) / 2;
    const cy = (pts[0]!.y + pts[1]!.y) / 2;
    const pivotRoot = svgRootPointFromClient(svg, cx, cy);
    pinchRef.current = {
      initialDistance: dist,
      initialScale: viewRef.current.scale,
      pivotRoot,
    };
    panSession.current = null;
    marqueeSession.current = null;
    lastPointer.current = null;
  }, []);

  const trackPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2) {
        syncPinchFromPointers();
      }
    },
    [syncPinchFromPointers],
  );

  const trackPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinch = pinchRef.current;
    if (!pinch || pointersRef.current.size < 2) return;

    const pts = [...pointersRef.current.values()];
    const dist = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
    const ratio = dist / pinch.initialDistance;
    setView((vp) => zoomViewAroundRoot(vp, pinch.initialScale * ratio, pinch.pivotRoot));
  }, []);

  const trackPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
  }, []);

  const onWheelCapture = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    const dzRaw = Math.exp(-e.deltaY * 0.0015);

    const pivot = svgRootPointFromClient(svg, e.clientX, e.clientY);

    setView((vp) => zoomViewAroundRoot(vp, vp.scale * dzRaw, pivot));
  }, []);

  function beginPan(e: React.PointerEvent) {
    if (pinchRef.current) return;
    if (!svgRef.current) return;
    if (e.button !== 0 && e.button !== 1) return;

    panSession.current = { pointerId: e.pointerId };
    lastPointer.current = svgRootPointFromClient(svgRef.current, e.clientX, e.clientY);
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function beginSheetPointer(e: React.PointerEvent) {
    if (placementToolActive) return;
    if (!svgRef.current) return;
    if (pinchRef.current || pointersRef.current.size >= 2) return;

    if (marqueeSelectActive && e.button === 0 && onMarqueeStart) {
      const world = worldPointFromClient(svgRef.current, e.clientX, e.clientY, viewRef.current);
      marqueeSession.current = { pointerId: e.pointerId };
      onMarqueeStart(world, e);
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
      return;
    }

    const canPanWithLeft = panToolActive || !marqueeSelectActive;
    if (e.button === 0 && !canPanWithLeft) return;

    beginPan(e);
  }

  function beginPanOverlay(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setOverlayPanActive(true);
    beginPan(e);
  }

  function movePanPointer(e: React.PointerEvent) {
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
    panSession.current = null;
    lastPointer.current = null;
    setOverlayPanActive(false);

    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function moveSheetPointer(e: React.PointerEvent) {
    if (marqueeSession.current && e.pointerId === marqueeSession.current.pointerId) {
      if (!svgRef.current) return;
      const world = worldPointFromClient(svgRef.current, e.clientX, e.clientY, viewRef.current);
      onMarqueeMove?.(world, e);
      return;
    }

    movePanPointer(e);
  }

  function endSheetPointer(e: React.PointerEvent) {
    if (marqueeSession.current && e.pointerId === marqueeSession.current.pointerId) {
      if (svgRef.current) {
        const world = worldPointFromClient(svgRef.current, e.clientX, e.clientY, viewRef.current);
        onMarqueeEnd?.(world, e);
      }
      marqueeSession.current = null;
      try {
        (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    endPanPointer(e);
  }

  const viewBoxNums = useMemo(() => viewBox.trim().split(/[\s,]+/).map(Number), [viewBox]);
  const [minX = -800, minY = -600, vw = 5200, vh = 4000] = viewBoxNums;
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
          ]
            .filter(Boolean)
            .join(' ')}
          viewBox={`${minX} ${minY} ${vw} ${vh}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDownCapture={trackPointerDown}
          onPointerMoveCapture={trackPointerMove}
          onPointerUpCapture={trackPointerUp}
          onPointerCancelCapture={trackPointerUp}
          onLostPointerCaptureCapture={trackPointerUp}
          onWheelCapture={onWheelCapture}
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
      </div>
    </DiagramViewportContext.Provider>
  );
}
