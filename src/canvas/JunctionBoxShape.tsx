import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useRef } from 'react';
import { anchorPoint } from '../domain/anchors';
import { snapGridCoord } from '../domain/grid';
import type { AnchorPosition, JunctionBox } from '../domain/types';
import {
  MIN_JUNCTION_SIZE,
  resizeJunctionBox,
} from '../domain/mutations';
import type { Diagram, Hub } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { encodeJunctionAnchor, junctionBoxIdsFromAnchorKeys } from '../editor/anchor-selection';
import { junctionBoxIdsForGroupMove, moveJunctionBoxesByDelta } from '../editor/selection-move';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';
import { HubShape } from './HubShape';
import { HubSlotMarkers } from './HubSlotMarkers';
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
  diagram: Diagram;
  hubs: Hub[];
  tool: EditorMainTool;
  selected: boolean;
  selectedHubIds: Set<string>;
  selectedJunctionAnchorKeys: Set<string>;
  selection: DiagramSelection;
  connectPendingHubId: string | null;
  anchorsInteractive?: boolean;
  onAnchorPointerDown?: (anchor: AnchorPosition) => void;
  onJunctionAnchorPointerDown?: (boxId: string, anchor: AnchorPosition) => void;
  onSelect: () => void;
  onSelectHub: (hubId: string) => void;
  onHubPointerDown?: (hubId: string) => void;
  onHubConduitPick?: (hubId: string) => void;
  onApplyDiagram: ApplyDiagramFn;
  onCommitHistory?: () => void;
};

type DragKind =
  | {
      id: 'move';
      pointerId: number;
      startPointer: { x: number; y: number };
      boxIds: string[];
      startBoxes: Map<string, { x: number; y: number }>;
    }
  | {
      id: 'anchor-move';
      pointerId: number;
      startPointer: { x: number; y: number };
      boxIds: string[];
      startBoxes: Map<string, { x: number; y: number }>;
    }
  | {
      id: 'resize';
      pointerId: number;
      corner: ResizeCorner;
      startPointer: { x: number; y: number };
      base: JunctionBox;
    };


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
  diagram,
  hubs,
  tool,
  selected,
  selectedHubIds,
  selectedJunctionAnchorKeys,
  selection,
  connectPendingHubId,
  anchorsInteractive = false,
  onAnchorPointerDown,
  onJunctionAnchorPointerDown,
  onSelect,
  onSelectHub,
  onHubPointerDown,
  onHubConduitPick,
  onApplyDiagram,
  onCommitHistory,
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
    if (!selected) onSelect();

    const p = worldPoint(e);
    if (!p) return;
    const sx = snapGridCoord(p.x);
    const sy = snapGridCoord(p.y);

    const boxIds = [...junctionBoxIdsForGroupMove(selection, box.id)];
    const startBoxes = new Map<string, { x: number; y: number }>();
    for (const id of boxIds) {
      const junction = diagram.junctionBoxes.find((b) => b.id === id);
      if (junction) startBoxes.set(id, { x: junction.x, y: junction.y });
    }

    dragSession.current = {
      id: 'move',
      pointerId: e.pointerId,
      startPointer: { x: sx, y: sy },
      boxIds,
      startBoxes,
    };

    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function beginAnchorMove(e: ReactPointerEvent, anchor: AnchorPosition) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    onJunctionAnchorPointerDown?.(box.id, anchor);

    const p = worldPoint(e);
    if (!p) return;
    const sx = snapGridCoord(p.x);
    const sy = snapGridCoord(p.y);

    const anchorKey = encodeJunctionAnchor(box.id, anchor);
    const anchorKeys =
      selectedJunctionAnchorKeys.has(anchorKey) && selectedJunctionAnchorKeys.size > 0
        ? selectedJunctionAnchorKeys
        : new Set([anchorKey]);
    const boxIds = [...junctionBoxIdsFromAnchorKeys(anchorKeys)];
    const startBoxes = new Map<string, { x: number; y: number }>();
    for (const id of boxIds) {
      const junction = diagram.junctionBoxes.find((b) => b.id === id);
      if (junction) startBoxes.set(id, { x: junction.x, y: junction.y });
    }

    dragSession.current = {
      id: 'anchor-move',
      pointerId: e.pointerId,
      startPointer: { x: sx, y: sy },
      boxIds,
      startBoxes,
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
      startPointer: { x: snapGridCoord(p.x), y: snapGridCoord(p.y) },
      base: box,
    };

    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const drag = dragSession.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const p = worldPoint(e);
    if (!p) return;
    const sx = snapGridCoord(p.x);
    const sy = snapGridCoord(p.y);

    if (drag.id === 'move' || drag.id === 'anchor-move') {
      const dx = sx - drag.startPointer.x;
      const dy = sy - drag.startPointer.y;

      onApplyDiagram(
        (diagram) => moveJunctionBoxesByDelta(diagram, drag.boxIds, drag.startBoxes, dx, dy),
        { history: false },
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
          width: sx - base.x,
          height: sy - base.y,
        };
        break;
      }
      case 'ne': {
        next = {
          ...base,
          width: sx - base.x,
          y: sy,
          height: bottom - sy,
        };
        break;
      }
      case 'sw': {
        next = {
          ...base,
          x: sx,
          width: right - sx,
          height: sy - base.y,
        };
        break;
      }
      case 'nw': {
        next = {
          ...base,
          x: sx,
          y: sy,
          width: right - sx,
          height: bottom - sy,
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
    onApplyDiagram((diagram) => resizeJunctionBox(diagram, box.id, safe), { history: false });
  }

  function endDrag(e: ReactPointerEvent) {
    const drag = dragSession.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    dragSession.current = null;
    onCommitHistory?.();

    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

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

      {/* Anchor rings use r=11 (22px diameter) for tap targets */}
      {ANCHORS.map((anchor) => {
        const pt = anchorPoint(box, anchor);
        const anchorKey = encodeJunctionAnchor(box.id, anchor);
        const anchorSelected = selectedJunctionAnchorKeys.has(anchorKey);
        const placementInteractive = anchorsInteractive && Boolean(onAnchorPointerDown);
        const selectInteractive = tool === 'select' && Boolean(onJunctionAnchorPointerDown);

        return (
          <circle
            key={anchor}
            className={[
              'junction-anchor',
              anchorSelected ? 'junction-anchor--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            cx={pt.x}
            cy={pt.y}
            r={11}
            pointerEvents={placementInteractive || selectInteractive ? 'auto' : 'none'}
            data-anchor={anchor}
            onPointerDown={
              placementInteractive
                ? (e) => {
                    e.stopPropagation();
                    onAnchorPointerDown?.(anchor);
                  }
                : selectInteractive
                  ? (e) => beginAnchorMove(e, anchor)
                  : undefined
            }
            onPointerMove={selectInteractive ? handlePointerMove : undefined}
            onPointerUp={selectInteractive ? endDrag : undefined}
            onPointerCancel={selectInteractive ? endDrag : undefined}
          />
        );
      })}

      <HubSlotMarkers box={box} diagram={diagram} />

      {hubs.map((hub) => (
        <HubShape
          key={hub.id}
          box={box}
          hub={hub}
          diagram={diagram}
          tool={tool}
          selected={selectedHubIds.has(hub.id)}
          connectPendingHubId={connectPendingHubId}
          onSelect={() => onSelectHub(hub.id)}
          onHubPointerDown={onHubPointerDown}
          onHubConduitPick={onHubConduitPick}
        />
      ))}

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
