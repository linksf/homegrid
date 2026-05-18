import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useRef } from 'react';
import { anchorPoint } from '../domain/anchors';
import type { AnchorPosition, JunctionBox } from '../domain/types';
import {
  MIN_JUNCTION_SIZE,
  moveJunctionBox,
  resizeJunctionBox,
} from '../domain/mutations';
import type { Diagram } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { useDiagramViewport } from './CanvasViewport';

const ANCHORS: AnchorPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

type JunctionBoxShapeProps = {
  box: JunctionBox;
  tool: EditorMainTool;
  selected: boolean;
  anchorsInteractive?: boolean;
  onAnchorPointerDown?: (anchor: AnchorPosition) => void;
  onSelect: () => void;
  onApplyDiagram: (mutator: (diagram: Diagram) => Diagram) => void;
};

type DragKind =
  | { id: 'move'; pointerId: number; startPointer: { x: number; y: number }; startBox: JunctionBox }
  | {
      id: 'resize';
      pointerId: number;
      corner: ResizeCorner;
      startPointer: { x: number; y: number };
      base: JunctionBox;
    };

function displayLabel(box: JunctionBox): string {
  const trimmed = box.label.trim();
  if (trimmed.length > 0) return trimmed;
  if (box.type === 'breaker') return 'Breaker panel';
  return 'Junction box';
}

function clampWithMinimums(rect: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const width = Math.max(MIN_JUNCTION_SIZE.width, rect.width);
  const height = Math.max(MIN_JUNCTION_SIZE.height, rect.height);
  return { ...rect, width, height };
}

export function JunctionBoxShape({
  box,
  tool,
  selected,
  anchorsInteractive = false,
  onAnchorPointerDown,
  onSelect,
  onApplyDiagram,
}: JunctionBoxShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const dragSession = useRef<DragKind | null>(null);

  const frameClass = useMemo(() => {
    const base = 'junction-box-frame';
    if (box.type === 'breaker') return `${base} junction-box-frame--breaker`;
    return `${base} junction-box-frame--normal`;
  }, [box.type]);

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0) return;

    if (tool !== 'select') {
      e.stopPropagation();
      return;
    }

    e.stopPropagation();
    onSelect();

    const p = worldPoint(e);
    if (!p) return;

    dragSession.current = {
      id: 'move',
      pointerId: e.pointerId,
      startPointer: p,
      startBox: box,
    };

    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function beginResize(e: ReactPointerEvent, corner: ResizeCorner) {
    if (e.button !== 0) return;

    if (tool !== 'select') {
      e.stopPropagation();
      return;
    }

    e.stopPropagation();
    onSelect();

    const p = worldPoint(e);
    if (!p) return;

    dragSession.current = {
      id: 'resize',
      pointerId: e.pointerId,
      corner,
      startPointer: p,
      base: box,
    };

    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const drag = dragSession.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const p = worldPoint(e);
    if (!p) return;

    if (drag.id === 'move') {
      const dx = p.x - drag.startPointer.x;
      const dy = p.y - drag.startPointer.y;

      onApplyDiagram((diagram) =>
        moveJunctionBox(diagram, box.id, drag.startBox.x + dx, drag.startBox.y + dy),
      );
      return;
    }

    /** Resize handles keep opposing edges anchored where appropriate. */
    const { corner, base } = drag;
    const right = base.x + base.width;
    const bottom = base.y + base.height;

    let next = { x: base.x, y: base.y, width: base.width, height: base.height };

    switch (corner) {
      case 'se': {
        next = {
          ...base,
          width: p.x - base.x,
          height: p.y - base.y,
        };
        break;
      }
      case 'ne': {
        next = {
          ...base,
          width: p.x - base.x,
          y: p.y,
          height: bottom - p.y,
        };
        break;
      }
      case 'sw': {
        next = {
          ...base,
          x: p.x,
          width: right - p.x,
          height: p.y - base.y,
        };
        break;
      }
      case 'nw': {
        next = {
          ...base,
          x: p.x,
          y: p.y,
          width: right - p.x,
          height: bottom - p.y,
        };
        break;
      }
      default: {
        break;
      }
    }

    if (next.width <= 0 || next.height <= 0) {
      return;
    }

    const safe = clampWithMinimums(next);
    onApplyDiagram((diagram) => resizeJunctionBox(diagram, box.id, safe));
  }

  function endDrag(e: ReactPointerEvent) {
    const drag = dragSession.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    dragSession.current = null;

    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const label = displayLabel(box);

  return (
    <g
      className={`junction-box ${selected ? 'junction-box--selected' : ''}`}
      data-junction-id={box.id}
      data-junction-role={box.type}
    >
      <rect
        className={frameClass}
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={6}
        ry={6}
        onPointerDown={beginMove}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      <text
        className={`junction-box__label ${
          box.type === 'breaker' ? 'junction-box__label--breaker' : ''
        }`}
        pointerEvents="none"
        x={box.x + box.width / 2}
        y={box.y + (box.type === 'breaker' ? 20 : 18)}
        textAnchor="middle"
      >
        {label}
      </text>

      {/* Anchor rings use r=11 (22px diameter) for tap targets */}
      {ANCHORS.map((anchor) => {
        const pt = anchorPoint(box, anchor);
        const interactive = anchorsInteractive && Boolean(onAnchorPointerDown);

        return (
          <circle
            key={anchor}
            className="junction-anchor"
            cx={pt.x}
            cy={pt.y}
            r={11}
            pointerEvents={interactive ? 'auto' : 'none'}
            data-anchor={anchor}
            onPointerDown={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    onAnchorPointerDown?.(anchor);
                  }
                : undefined
            }
          />
        );
      })}

      {tool === 'select' && (
        <g className="junction-box__handles" pointerEvents="auto">
          <circle
            className="junction-handle junction-handle--nw"
            cx={box.x}
            cy={box.y}
            r={10}
            onPointerDown={(e) => beginResize(e, 'nw')}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <circle
            className="junction-handle junction-handle--ne"
            cx={box.x + box.width}
            cy={box.y}
            r={10}
            onPointerDown={(e) => beginResize(e, 'ne')}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <circle
            className="junction-handle junction-handle--sw"
            cx={box.x}
            cy={box.y + box.height}
            r={10}
            onPointerDown={(e) => beginResize(e, 'sw')}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <circle
            className="junction-handle junction-handle--se"
            cx={box.x + box.width}
            cy={box.y + box.height}
            r={10}
            onPointerDown={(e) => beginResize(e, 'se')}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </g>
      )}
    </g>
  );
}
