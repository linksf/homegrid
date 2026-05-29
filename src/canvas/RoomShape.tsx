import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import { snapGridCoord } from '../domain/grid';
import { roomOutlineSegments, resizeRoom } from '../domain/room-mutations';
import type { Diagram, Room } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { roomIdsForGroupMove, moveRoomsByDelta } from '../editor/selection-move';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

type RoomShapeProps = {
  room: Room;
  diagram: Diagram;
  tool: EditorMainTool;
  selected: boolean;
  selection: DiagramSelection;
  onSelect: () => void;
  onApplyDiagram: ApplyDiagramFn;
  onCommitHistory?: () => void;
};

type DragKind =
  | {
      id: 'move';
      pointerId: number;
      startPointer: { x: number; y: number };
      roomIds: string[];
      startRooms: Map<string, { x: number; y: number }>;
    }
  | {
      id: 'resize';
      pointerId: number;
      corner: ResizeCorner;
      startPointer: { x: number; y: number };
      base: Room;
    };

const OUTLINE_HIT_WIDTH = 18;

export function RoomShape({
  room,
  diagram,
  tool,
  selected,
  selection,
  onSelect,
  onApplyDiagram,
  onCommitHistory,
}: RoomShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const dragSession = useRef<DragKind | null>(null);
  const segments = roomOutlineSegments(room);

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    if (!selected) onSelect();

    const p = worldPoint(e);
    if (!p) return;

    const roomIds = [...roomIdsForGroupMove(selection, room.id)];
    const startRooms = new Map<string, { x: number; y: number }>();
    for (const id of roomIds) {
      const item = (diagram.rooms ?? []).find((r) => r.id === id);
      if (item) startRooms.set(id, { x: item.x, y: item.y });
    }

    dragSession.current = {
      id: 'move',
      pointerId: e.pointerId,
      startPointer: { x: snapGridCoord(p.x), y: snapGridCoord(p.y) },
      roomIds,
      startRooms,
    };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function beginResize(e: ReactPointerEvent, corner: ResizeCorner) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    onSelect();

    const p = worldPoint(e);
    if (!p) return;

    dragSession.current = {
      id: 'resize',
      pointerId: e.pointerId,
      corner,
      startPointer: { x: snapGridCoord(p.x), y: snapGridCoord(p.y) },
      base: room,
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

    if (drag.id === 'move') {
      const dx = sx - drag.startPointer.x;
      const dy = sy - drag.startPointer.y;
      onApplyDiagram((d) => moveRoomsByDelta(d, drag.roomIds, drag.startRooms, dx, dy), {
        history: false,
      });
      return;
    }

    const { corner, base } = drag;
    const right = base.x + base.width;
    const bottom = base.y + base.height;
    let patch: Partial<Pick<Room, 'x' | 'y' | 'width' | 'height'>>;

    switch (corner) {
      case 'se':
        patch = { ...base, width: sx - base.x, height: sy - base.y };
        break;
      case 'ne':
        patch = { ...base, width: sx - base.x, y: sy, height: bottom - sy };
        break;
      case 'sw':
        patch = { ...base, x: sx, width: right - sx, height: sy - base.y };
        break;
      case 'nw':
        patch = { ...base, x: sx, y: sy, width: right - sx, height: bottom - sy };
        break;
    }

    onApplyDiagram((d) => resizeRoom(d, base.id, patch), { history: false });
  }

  function endDrag(e: ReactPointerEvent) {
    if (dragSession.current?.pointerId !== e.pointerId) return;
    dragSession.current = null;
    onCommitHistory?.();
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const handles: { corner: ResizeCorner; cx: number; cy: number }[] = [
    { corner: 'nw', cx: room.x, cy: room.y },
    { corner: 'ne', cx: room.x + room.width, cy: room.y },
    { corner: 'sw', cx: room.x, cy: room.y + room.height },
    { corner: 'se', cx: room.x + room.width, cy: room.y + room.height },
  ];

  return (
    <g
      className={['room', selected ? 'room--selected' : ''].filter(Boolean).join(' ')}
      data-room-id={room.id}
    >
      {segments.map((seg, index) => (
        <g key={`${room.id}-seg-${index}`}>
          <line
            className="room__outline"
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            pointerEvents="none"
          />
          <line
            className="room__hit"
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            strokeWidth={OUTLINE_HIT_WIDTH}
            onPointerDown={beginMove}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </g>
      ))}

      {selected && tool === 'select'
        ? handles.map(({ corner, cx, cy }) => (
            <circle
              key={corner}
              className="room__handle"
              cx={cx}
              cy={cy}
              r={6}
              onPointerDown={(e) => beginResize(e, corner)}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          ))
        : null}
    </g>
  );
}
