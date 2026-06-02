import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';
import { snapGridCoord } from '../domain/grid';
import {
  DEFAULT_DOOR_WIDTH,
  roomOutlineSegments,
  resizeRoom,
  wallLength,
  wallOffsetForPoint,
} from '../domain/room-mutations';
import type { Diagram, Room, RoomWall } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { captureSelectionMoveSnapshot, moveSelectionByDelta, roomIdsForGroupMove } from '../editor/selection-move';
import type { DiagramSelection } from '../editor/diagram-selection';
import type { ContextMenuTarget } from '../editor/context-menu-target';
import { useEntityContextMenuGesture } from '../editor/use-context-menu-gesture';
import { DESKTOP_LONG_PRESS_MS, TOUCH_LONG_PRESS_MS, useTouchNavigationProfile } from '../canvas/touch-profile';
import { useDiagramViewport } from './CanvasViewport';
import { HIT_STROKE_SCREEN_PX } from './hit-targets';
import {
  clientPointerMoved,
  LARGE_ENTITY_DRAG_THRESHOLD_PX,
} from './pointer-drag-threshold';

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

type RoomShapeProps = {
  room: Room;
  diagram: Diagram;
  tool: EditorMainTool;
  selected: boolean;
  selection: DiagramSelection;
  onSelect: () => void;
  doorPlacing?: boolean;
  onPlaceDoor?: (wall: RoomWall, centerOffset: number) => void;
  onApplyDiagram: ApplyDiagramFn;
  onCommitHistory?: () => void;
  onEntityContextMenu?: (target: ContextMenuTarget, clientX: number, clientY: number) => void;
  onSurfaceLongPress?: (clientX: number, clientY: number) => void;
};

type DragKind =
  | {
      id: 'move-pending';
      pointerId: number;
      startClient: { x: number; y: number };
    }
  | {
      id: 'move';
      pointerId: number;
      startPointer: { x: number; y: number };
      snapshot: ReturnType<typeof captureSelectionMoveSnapshot>;
    }
  | {
      id: 'resize';
      pointerId: number;
      corner: ResizeCorner;
      startPointer: { x: number; y: number };
      base: Room;
    };

const OUTLINE_HIT_WIDTH = HIT_STROKE_SCREEN_PX;

export function RoomShape({
  room,
  diagram,
  tool,
  selected,
  selection,
  onSelect,
  doorPlacing = false,
  onPlaceDoor,
  onApplyDiagram,
  onCommitHistory,
  onEntityContextMenu,
  onSurfaceLongPress,
}: RoomShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const dragSession = useRef<DragKind | null>(null);
  const [doorHover, setDoorHover] = useState<{ wall: RoomWall; center: number } | null>(null);
  const touchNavigation = useTouchNavigationProfile();
  const { bind: bindContextMenu } = useEntityContextMenuGesture(onEntityContextMenu ?? (() => {}), {
    longPressMs: touchNavigation ? TOUCH_LONG_PRESS_MS : DESKTOP_LONG_PRESS_MS,
    onLongPressAt: onSurfaceLongPress,
  });
  const roomMenu = onEntityContextMenu ? bindContextMenu({ kind: 'room', roomId: room.id }) : null;
  const segments = roomOutlineSegments(room);

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    roomMenu?.onPointerDown?.(e);

    if (!selected) {
      onSelect();
      return;
    }

    dragSession.current = {
      id: 'move-pending',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
    };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function activateRoomMove(e: ReactPointerEvent, pending: Extract<DragKind, { id: 'move-pending' }>) {
    const p = worldPoint(e);
    if (!p) return;

    const roomIds = [...roomIdsForGroupMove(selection, room.id)];
    const moveSelection: DiagramSelection = {
      ...selection,
      rooms: new Set([...selection.rooms, ...roomIds]),
    };
    const snapshot = captureSelectionMoveSnapshot(diagram, moveSelection);

    dragSession.current = {
      id: 'move',
      pointerId: pending.pointerId,
      startPointer: { x: snapGridCoord(p.x), y: snapGridCoord(p.y) },
      snapshot,
    };
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
    let drag = dragSession.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.id === 'move-pending') {
      if (
        !clientPointerMoved(
          e.clientX,
          e.clientY,
          drag.startClient.x,
          drag.startClient.y,
          LARGE_ENTITY_DRAG_THRESHOLD_PX,
        )
      ) {
        return;
      }
      activateRoomMove(e, drag);
      drag = dragSession.current;
      if (!drag || drag.id !== 'move') return;
    }

    const p = worldPoint(e);
    if (!p) return;
    const sx = snapGridCoord(p.x);
    const sy = snapGridCoord(p.y);

    if (drag.id === 'move') {
      const dx = sx - drag.startPointer.x;
      const dy = sy - drag.startPointer.y;
      onApplyDiagram((d) => moveSelectionByDelta(d, drag.snapshot, dx, dy), {
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
    const drag = dragSession.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.id === 'move-pending') {
      dragSession.current = null;
      try {
        (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

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

  const wallTargets: { wall: RoomWall; x1: number; y1: number; x2: number; y2: number }[] = [
    { wall: 'north', x1: room.x, y1: room.y, x2: room.x + room.width, y2: room.y },
    {
      wall: 'south',
      x1: room.x,
      y1: room.y + room.height,
      x2: room.x + room.width,
      y2: room.y + room.height,
    },
    { wall: 'west', x1: room.x, y1: room.y, x2: room.x, y2: room.y + room.height },
    {
      wall: 'east',
      x1: room.x + room.width,
      y1: room.y,
      x2: room.x + room.width,
      y2: room.y + room.height,
    },
  ];

  function pointOnWall(wall: RoomWall, along: number): { x: number; y: number } {
    switch (wall) {
      case 'north':
        return { x: room.x + along, y: room.y };
      case 'south':
        return { x: room.x + along, y: room.y + room.height };
      case 'west':
        return { x: room.x, y: room.y + along };
      case 'east':
        return { x: room.x + room.width, y: room.y + along };
    }
  }

  function doorOffsetAtPointer(wall: RoomWall, e: ReactPointerEvent): number | null {
    const p = worldPoint(e);
    if (!p) return null;
    return wallOffsetForPoint(room, wall, p.x, p.y);
  }

  function handleDoorHover(e: ReactPointerEvent, wall: RoomWall) {
    const center = doorOffsetAtPointer(wall, e);
    if (center == null) return;
    setDoorHover({ wall, center });
  }

  function handleDoorPlace(e: ReactPointerEvent, wall: RoomWall) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const center = doorOffsetAtPointer(wall, e);
    if (center == null) return;
    onPlaceDoor?.(wall, center);
  }

  function doorPreviewSegment(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (!doorHover) return null;
    const length = wallLength(room, doorHover.wall);
    const width = Math.min(DEFAULT_DOOR_WIDTH, length);
    const start = Math.max(0, Math.min(length - width, doorHover.center - width / 2));
    const a = pointOnWall(doorHover.wall, start);
    const b = pointOnWall(doorHover.wall, start + width);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }

  const doorPreview = doorPlacing ? doorPreviewSegment() : null;

  return (
    <g
      className={['room', selected ? 'room--selected' : '', doorPlacing ? 'room--door-placing' : '']
        .filter(Boolean)
        .join(' ')}
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
          {!doorPlacing && (
            <line
              className="room__hit diagram-hit-stroke"
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              strokeWidth={OUTLINE_HIT_WIDTH}
              {...(roomMenu ?? {})}
              onPointerDown={beginMove}
              onPointerMove={(e) => {
                roomMenu?.onPointerMove?.(e);
                handlePointerMove(e);
              }}
              onPointerUp={(e) => {
                roomMenu?.onPointerUp?.(e);
                endDrag(e);
              }}
              onPointerCancel={(e) => {
                roomMenu?.onPointerCancel?.(e);
                endDrag(e);
              }}
              onContextMenu={roomMenu?.onContextMenu}
            />
          )}
        </g>
      ))}

      {doorPlacing &&
        wallTargets.map((wt) => (
          <line
            key={`${room.id}-door-${wt.wall}`}
            className="room__door-target diagram-hit-stroke"
            x1={wt.x1}
            y1={wt.y1}
            x2={wt.x2}
            y2={wt.y2}
            strokeWidth={OUTLINE_HIT_WIDTH}
            onPointerDown={(e) => handleDoorPlace(e, wt.wall)}
            onPointerMove={(e) => handleDoorHover(e, wt.wall)}
            onPointerLeave={() => setDoorHover(null)}
          />
        ))}

      {doorPreview && (
        <line
          className="room__door-preview"
          x1={doorPreview.x1}
          y1={doorPreview.y1}
          x2={doorPreview.x2}
          y2={doorPreview.y2}
          pointerEvents="none"
        />
      )}

      {selected && tool === 'select' && !doorPlacing
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
