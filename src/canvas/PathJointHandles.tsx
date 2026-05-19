import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import { PATH_EDIT_SNAP } from '../domain/path-editing';
import { useDiagramViewport } from './CanvasViewport';

type PathJointHandlesProps = {
  path: { x: number; y: number }[];
  vertexIndices: number[];
  onMoveVertex: (index: number, x: number, y: number) => void;
};

export function PathJointHandles({
  path,
  vertexIndices,
  onMoveVertex,
}: PathJointHandlesProps): JSX.Element | null {
  const vp = useDiagramViewport();
  const dragRef = useRef<{ pointerId: number; index: number } | null>(null);

  if (vertexIndices.length === 0) return null;

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function snap(value: number): number {
    return Math.round(value / PATH_EDIT_SNAP) * PATH_EDIT_SNAP;
  }

  function beginDrag(e: ReactPointerEvent, index: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { pointerId: e.pointerId, index };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = worldPoint(e);
    if (!p) return;
    onMoveVertex(drag.index, snap(p.x), snap(p.y));
  }

  function endDrag(e: ReactPointerEvent) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const r = 7;

  return (
    <g className="path-joint-handles" pointerEvents="all">
      {vertexIndices.map((index) => {
        const pt = path[index];
        if (!pt) return null;
        return (
          <circle
            key={index}
            className="path-joint-handle"
            cx={pt.x}
            cy={pt.y}
            r={r}
            onPointerDown={(e) => beginDrag(e, index)}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        );
      })}
    </g>
  );
}
