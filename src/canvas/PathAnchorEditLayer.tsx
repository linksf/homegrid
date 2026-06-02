import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import { PATH_EDIT_SNAP } from '../domain/path-editing';
import type { Diagram } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import {
  captureSelectionMoveSnapshot,
  moveSelectionByDelta,
} from '../editor/selection-move';
import {
  decodePathAnchor,
  pathAnchorWorldPoint,
} from '../editor/anchor-selection';
import {
  chainNeighborPoints,
  snapPointToChainNeighbors,
} from '../editor/path-anchor-snap';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';

type PathAnchorEditLayerProps = {
  diagram: Diagram;
  selection: DiagramSelection;
  selectedPathAnchorKeys: Set<string>;
  onApplyDiagram: ApplyDiagramFn;
  onCommitHistory?: () => void;
};

/** Draggable handles for marquee-selected path bend anchors. */
export function PathAnchorEditLayer({
  diagram,
  selection,
  selectedPathAnchorKeys,
  onApplyDiagram,
  onCommitHistory,
}: PathAnchorEditLayerProps): JSX.Element | null {
  const vp = useDiagramViewport();
  const dragRef = useRef<{
    pointerId: number;
    startPointer: { x: number; y: number };
    snapshot: ReturnType<typeof captureSelectionMoveSnapshot>;
  } | null>(null);

  if (selectedPathAnchorKeys.size === 0) return null;

  const handles: { key: string; x: number; y: number }[] = [];
  for (const key of selectedPathAnchorKeys) {
    const ref = decodePathAnchor(key);
    if (!ref) continue;
    const pt = pathAnchorWorldPoint(diagram, ref);
    if (!pt) continue;
    handles.push({ key, x: pt.x, y: pt.y });
  }

  if (handles.length === 0) return null;

  function snap(value: number): number {
    return Math.round(value / PATH_EDIT_SNAP) * PATH_EDIT_SNAP;
  }

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginDrag(e: ReactPointerEvent, key: string) {
    if (e.button !== 0) return;
    e.stopPropagation();

    const moveSelection: DiagramSelection = {
      ...selection,
      pathAnchors: new Set([...selection.pathAnchors, key]),
    };
    const snapshot = captureSelectionMoveSnapshot(diagram, moveSelection);

    const p = worldPoint(e);
    if (!p) return;

    dragRef.current = {
      pointerId: e.pointerId,
      startPointer: { x: snap(p.x), y: snap(p.y) },
      snapshot,
    };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const p = worldPoint(e);
    if (!p) return;

    const primaryKey = [...selectedPathAnchorKeys][0];
    const primaryRef = primaryKey ? decodePathAnchor(primaryKey) : null;
    const neighbors = primaryRef ? chainNeighborPoints(diagram, primaryRef) : [];
    const aligned = snapPointToChainNeighbors(p.x, p.y, neighbors, vp.scale);

    const sx = snap(aligned.x);
    const sy = snap(aligned.y);
    const dx = sx - drag.startPointer.x;
    const dy = sy - drag.startPointer.y;
    onApplyDiagram((d) => moveSelectionByDelta(d, drag.snapshot, dx, dy), { history: false });
  }

  function endDrag(e: ReactPointerEvent) {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    onCommitHistory?.();
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const r = 7;

  return (
    <g className="path-anchor-edit-layer" role="presentation" aria-label="Selected path anchors">
      {handles.map(({ key, x, y }) => (
        <circle
          key={key}
          className="path-joint-handle path-joint-handle--selected"
          cx={x}
          cy={y}
          r={r}
          onPointerDown={(e) => beginDrag(e, key)}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ))}
    </g>
  );
}
