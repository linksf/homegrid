import type { JSX, PropsWithChildren, RefObject } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

type CanvasViewportProps = PropsWithChildren<{
  className?: string;
  /** SVG viewBox "minX minY width height"; large sheet leaves room for panning. */
  viewBox?: string;
}>;

type PanSession = {
  pointerId: number;
};

export type DiagramViewportSnapshot = Readonly<{
  translateX: number;
  translateY: number;
  scale: number;
  svgRef: RefObject<SVGSVGElement | null>;
  clientPointToWorld: (clientX: number, clientY: number) => { x: number; y: number } | null;
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

/** Infinite-ish SVG diagram surface with wheel zoom toward the cursor and pointer-drag pan on the sheet backdrop. */
export function CanvasViewport({ children, className, viewBox = '-800 -600 5200 4000' }: CanvasViewportProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, scale: 1 });
  const panSession = useRef<PanSession | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

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
        const root = svgRootPointFromClient(svg, clientX, clientY);

        /** Convert from root SVG coords into world coords inside viewport `<g>`. */
        return {
          x: (root.x - view.tx) / view.scale,
          y: (root.y - view.ty) / view.scale,
        };
      },
    };
  }, [view.scale, view.tx, view.ty]);

  const onWheelCapture = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    const dzRaw = Math.exp(-e.deltaY * 0.0015);

    const pivot = svgRootPointFromClient(svg, e.clientX, e.clientY);

    setView((vp) => {
      const prevS = vp.scale;
      const nextS = clampScale(prevS * dzRaw);
      if (nextS === prevS) return vp;

      const world = {
        x: (pivot.x - vp.tx) / prevS,
        y: (pivot.y - vp.ty) / prevS,
      };

      return {
        scale: nextS,
        tx: pivot.x - world.x * nextS,
        ty: pivot.y - world.y * nextS,
      };
    });
  }, []);

  function beginPan(e: React.PointerEvent) {
    if (!svgRef.current) return;
    if (e.button !== 0) return;

    panSession.current = { pointerId: e.pointerId };
    lastPointer.current = svgRootPointFromClient(svgRef.current, e.clientX, e.clientY);
    (e.target as SVGElement).setPointerCapture(e.pointerId);
  }

  function movePan(e: React.PointerEvent) {
    if (!panSession.current || e.pointerId !== panSession.current.pointerId || !svgRef.current) return;
    const prevPt = lastPointer.current;
    if (!prevPt) return;

    const cur = svgRootPointFromClient(svgRef.current, e.clientX, e.clientY);
    const dx = cur.x - prevPt.x;
    const dy = cur.y - prevPt.y;
    lastPointer.current = cur;

    setView((vp) => ({ ...vp, tx: vp.tx + dx, ty: vp.ty + dy }));
  }

  function endPan(e: React.PointerEvent) {
    if (!panSession.current || panSession.current.pointerId !== e.pointerId) return;
    panSession.current = null;
    lastPointer.current = null;

    try {
      (e.target as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const viewBoxNums = useMemo(() => viewBox.trim().split(/[\s,]+/).map(Number), [viewBox]);
  const [minX = -800, minY = -600, vw = 5200, vh = 4000] = viewBoxNums;

  return (
    <DiagramViewportContext.Provider value={viewportSnapshot}>
      <svg
        ref={svgRef}
        className={[className, 'canvas-viewport'].filter(Boolean).join(' ')}
        viewBox={`${minX} ${minY} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        onWheelCapture={onWheelCapture}
      >
        <rect className="canvas-viewport__frame" width={vw} height={vh} x={minX} y={minY} />

        <rect
          className="canvas-viewport__sheet"
          x={minX}
          y={minY}
          width={vw}
          height={vh}
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onLostPointerCapture={endPan}
        />

        <g transform={viewportTransform}>{children}</g>
      </svg>
    </DiagramViewportContext.Provider>
  );
}
