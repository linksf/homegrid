import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AreaShape } from '../canvas/AreaShape';
import { CanvasViewport, type DiagramViewportSnapshot } from '../canvas/CanvasViewport';
import { CanvasZoomControls } from '../canvas/CanvasZoomControls';
import { DiagramGrid } from '../canvas/DiagramGrid';
import { RoomShape } from '../canvas/RoomShape';
import { addArea, addAreaFromBounds } from '../domain/area-mutations';
import {
  addRoom,
  addRoomFromBounds,
  addRoomDoorAt,
  deleteRoom,
  removeRoomDoor,
  updateRoom,
  updateRoomDoor,
  wallLength,
} from '../domain/room-mutations';
import { snapRoomDraftCorners } from '../domain/room-snap';
import type { Diagram, FloorPlan, RoomWall } from '../domain/types';
import { diagramFloorPlanBounds } from '../editor/navigator-tree';
import { emptySelection, setSingleRoom } from '../editor/diagram-selection';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useFloorPlanStore } from '../store/floor-plan-store';

const WORLD_BOUNDS = { minX: -800, minY: -600, width: 5200, height: 4000 };
const ROOM_DRAG_THRESHOLD = 4;

type FloorPlanTool = 'select' | 'pan' | 'place-room' | 'place-area';

type FloorPlanEditorScreenProps = {
  onBack: () => void;
  onDone: () => void;
  doneLabel?: string;
};

const ROOM_WALL_LABELS: Record<RoomWall, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
};

function planToDiagram(plan: FloorPlan): Diagram {
  return {
    rooms: plan.rooms,
    areas: plan.areas,
    junctionBoxes: [],
    breakers: [],
    hubs: [],
    hubBridges: [],
    lightBulbs: [],
    switches: [],
    dimmerSwitches: [],
    outlets: [],
    deviceNodes: [],
    conduits: [],
    cables: [],
    conduitRuns: [],
    wires: [],
    wireLinks: [],
    layout: {
      conduitPaths: {},
      conduitRunPaths: {},
      wireLinkPaths: {},
      hubBridgePaths: {},
    },
  };
}

export function FloorPlanEditorScreen({ onBack, onDone, doneLabel = 'Start wiring job' }: FloorPlanEditorScreenProps): JSX.Element | null {
  const plan = useFloorPlanStore((s) => s.activeFloorPlan);
  const saveActiveFloorPlan = useFloorPlanStore((s) => s.saveActiveFloorPlan);
  const viewportApiRef = useRef<DiagramViewportSnapshot | null>(null);
  const [tool, setTool] = useState<FloorPlanTool>('place-room');
  const [selection, setSelection] = useState<DiagramSelection>(emptySelection);
  const [doorPlacingRoomId, setDoorPlacingRoomId] = useState<string | null>(null);
  const roomDragRef = useRef<{ pointerId: number; start: { x: number; y: number } } | null>(null);
  const areaDragRef = useRef<{ pointerId: number; start: { x: number; y: number } } | null>(null);
  const [roomDraft, setRoomDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [areaDraft, setAreaDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const selectedRoomId = [...selection.rooms][0] ?? null;

  const applyPlanMutation = useCallback(
    (mutator: (diagram: Diagram) => Diagram) => {
      if (!plan) return;
      void saveActiveFloorPlan((current) => {
        const nextDiagram = mutator(planToDiagram(current));
        return {
          ...current,
          rooms: nextDiagram.rooms,
          areas: nextDiagram.areas ?? [],
        };
      });
    },
    [plan, saveActiveFloorPlan],
  );

  const fitAll = useCallback(() => {
    if (!plan) return;
    const bounds = diagramFloorPlanBounds(planToDiagram(plan));
    viewportApiRef.current?.fitToRect(bounds);
  }, [plan]);

  const handleDeleteSelectedRoom = useCallback(() => {
    if (!selectedRoomId) return;
    applyPlanMutation((d) => deleteRoom(d, selectedRoomId));
    setSelection(emptySelection);
    setDoorPlacingRoomId(null);
  }, [applyPlanMutation, selectedRoomId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!selectedRoomId || tool !== 'select') return;
      e.preventDefault();
      handleDeleteSelectedRoom();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDeleteSelectedRoom, selectedRoomId, tool]);

  if (!plan) return null;

  const diagram = planToDiagram(plan);
  const selectedRoom = selectedRoomId ? diagram.rooms.find((r) => r.id === selectedRoomId) : undefined;

  function beginRoomDraft(e: ReactPointerEvent<SVGRectElement>) {
    const vp = viewportApiRef.current;
    if (!vp) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    roomDragRef.current = { pointerId: e.pointerId, start: world };
    setRoomDraft({ x0: world.x, y0: world.y, x1: world.x, y1: world.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveRoomDraft(e: ReactPointerEvent<SVGRectElement>) {
    const drag = roomDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const vp = viewportApiRef.current;
    const world = vp?.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    const snapped = snapRoomDraftCorners(drag.start.x, drag.start.y, world.x, world.y, diagram.rooms);
    setRoomDraft({ x0: snapped.x0, y0: snapped.y0, x1: snapped.x1, y1: snapped.y1 });
  }

  function endRoomDraft(e: ReactPointerEvent<SVGRectElement>) {
    const drag = roomDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    roomDragRef.current = null;
    setRoomDraft(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const vp = viewportApiRef.current;
    const world = vp?.clientPointToWorld(e.clientX, e.clientY) ?? drag.start;
    const dragged =
      Math.abs(world.x - drag.start.x) >= ROOM_DRAG_THRESHOLD ||
      Math.abs(world.y - drag.start.y) >= ROOM_DRAG_THRESHOLD;
    applyPlanMutation((d) =>
      dragged ? addRoomFromBounds(d, drag.start.x, drag.start.y, world.x, world.y) : addRoom(d, drag.start.x, drag.start.y),
    );
  }

  function beginAreaDraft(e: ReactPointerEvent<SVGRectElement>) {
    const vp = viewportApiRef.current;
    if (!vp) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    areaDragRef.current = { pointerId: e.pointerId, start: world };
    setAreaDraft({ x0: world.x, y0: world.y, x1: world.x, y1: world.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveAreaDraft(e: ReactPointerEvent<SVGRectElement>) {
    const drag = areaDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const vp = viewportApiRef.current;
    const world = vp?.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    const snapped = snapRoomDraftCorners(drag.start.x, drag.start.y, world.x, world.y, diagram.rooms);
    setAreaDraft({ x0: snapped.x0, y0: snapped.y0, x1: snapped.x1, y1: snapped.y1 });
  }

  function endAreaDraft(e: ReactPointerEvent<SVGRectElement>) {
    const drag = areaDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    areaDragRef.current = null;
    setAreaDraft(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const vp = viewportApiRef.current;
    const world = vp?.clientPointToWorld(e.clientX, e.clientY) ?? drag.start;
    const dragged =
      Math.abs(world.x - drag.start.x) >= ROOM_DRAG_THRESHOLD ||
      Math.abs(world.y - drag.start.y) >= ROOM_DRAG_THRESHOLD;
    applyPlanMutation((d) =>
      dragged ? addAreaFromBounds(d, drag.start.x, drag.start.y, world.x, world.y) : addArea(d, drag.start.x, drag.start.y),
    );
  }

  return (
    <div className="editor-screen editor-screen--deck floor-plan-editor">
      <header className="editor-screen__header">
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <h1 className="editor-screen__title">{plan.name || 'Floor plan'}</h1>
        <button type="button" className="btn btn--primary" onClick={onDone}>
          {doneLabel}
        </button>
      </header>

      <div className="floor-plan-editor__toolbar">
        <button type="button" className={['btn', tool === 'select' ? 'btn--primary' : ''].join(' ')} onClick={() => setTool('select')}>
          Select
        </button>
        <button type="button" className={['btn', tool === 'pan' ? 'btn--primary' : ''].join(' ')} onClick={() => setTool('pan')}>
          Pan
        </button>
        <button type="button" className={['btn', tool === 'place-room' ? 'btn--primary' : ''].join(' ')} onClick={() => setTool('place-room')}>
          Room
        </button>
        <button type="button" className={['btn', tool === 'place-area' ? 'btn--primary' : ''].join(' ')} onClick={() => setTool('place-area')}>
          Area
        </button>
        {selectedRoomId ? (
          <button
            type="button"
            className={['btn', doorPlacingRoomId ? 'btn--primary' : ''].join(' ')}
            onClick={() => setDoorPlacingRoomId((prev) => (prev ? null : selectedRoomId))}
          >
            Door
          </button>
        ) : null}
      </div>

      <div className="editor-screen__main">
        <div className="editor-screen__canvas-col">
          <div className="editor-screen__viewport">
            <CanvasViewport
              viewBox={`${WORLD_BOUNDS.minX} ${WORLD_BOUNDS.minY} ${WORLD_BOUNDS.width} ${WORLD_BOUNDS.height}`}
              apiRef={viewportApiRef}
              overlay={<CanvasZoomControls onFit={fitAll} onFitAll={fitAll} />}
              placementToolActive={tool === 'place-room' || tool === 'place-area'}
              panToolActive={tool === 'pan'}
              toolCursorClass={tool === 'pan' ? 'canvas-viewport--tool-pan' : tool === 'place-room' ? 'canvas-viewport--tool-place-room' : ''}
            >
              <g className="diagram-svg" aria-label="Floor plan">
                <DiagramGrid
                  minX={WORLD_BOUNDS.minX}
                  minY={WORLD_BOUNDS.minY}
                  width={WORLD_BOUNDS.width}
                  height={WORLD_BOUNDS.height}
                />
                {(diagram.areas ?? []).map((area) => (
                  <AreaShape key={area.id} area={area} />
                ))}
                {diagram.rooms.map((room) => (
                  <RoomShape
                    key={room.id}
                    room={room}
                    diagram={diagram}
                    tool={tool === 'place-room' || tool === 'place-area' ? 'place-room' : 'select'}
                    selected={selection.rooms.has(room.id)}
                    selection={selection}
                    onSelect={() => setSelection(setSingleRoom(room.id))}
                    doorPlacing={doorPlacingRoomId === room.id}
                    onPlaceDoor={(wall: RoomWall, centerOffset: number) => {
                      applyPlanMutation((d) => addRoomDoorAt(d, room.id, wall, centerOffset));
                      setDoorPlacingRoomId(null);
                    }}
                    onApplyDiagram={(mutator) => applyPlanMutation(mutator)}
                  />
                ))}
                {roomDraft && tool === 'place-room' ? (
                  <rect
                    className="room-place-preview"
                    x={Math.min(roomDraft.x0, roomDraft.x1)}
                    y={Math.min(roomDraft.y0, roomDraft.y1)}
                    width={Math.abs(roomDraft.x1 - roomDraft.x0)}
                    height={Math.abs(roomDraft.y1 - roomDraft.y0)}
                    pointerEvents="none"
                  />
                ) : null}
                {areaDraft && tool === 'place-area' ? (
                  <rect
                    className="area-place-preview"
                    x={Math.min(areaDraft.x0, areaDraft.x1)}
                    y={Math.min(areaDraft.y0, areaDraft.y1)}
                    width={Math.abs(areaDraft.x1 - areaDraft.x0)}
                    height={Math.abs(areaDraft.y1 - areaDraft.y0)}
                    pointerEvents="none"
                  />
                ) : null}
                {(tool === 'place-room' || tool === 'place-area') && (
                  <rect
                    className="diagram-place-overlay"
                    x={WORLD_BOUNDS.minX}
                    y={WORLD_BOUNDS.minY}
                    width={WORLD_BOUNDS.width}
                    height={WORLD_BOUNDS.height}
                    pointerEvents="all"
                    onPointerDown={tool === 'place-room' ? beginRoomDraft : beginAreaDraft}
                    onPointerMove={tool === 'place-room' ? moveRoomDraft : moveAreaDraft}
                    onPointerUp={tool === 'place-room' ? endRoomDraft : endAreaDraft}
                    onPointerCancel={tool === 'place-room' ? endRoomDraft : endAreaDraft}
                  />
                )}
              </g>
            </CanvasViewport>
          </div>
        </div>

        {selectedRoom ? (
          <aside className="floor-plan-editor__inspector inspector" aria-label="Room inspector">
            <h3 className="inspector__title">Room</h3>
            <label className="inspector-field inspector__field">
              <span className="inspector__label">Label</span>
              <input
                className="inspector__input"
                type="text"
                value={selectedRoom.label}
                onChange={(e) => {
                  applyPlanMutation((d) => updateRoom(d, selectedRoom.id, { label: e.target.value }));
                }}
                placeholder="Room name"
                autoComplete="off"
              />
            </label>

            <div className="inspector__field">
              <span className="inspector__label">Doors</span>
              <button
                type="button"
                className={['btn', 'btn--block', doorPlacingRoomId === selectedRoom.id ? 'btn--active' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={doorPlacingRoomId === selectedRoom.id}
                onClick={() =>
                  setDoorPlacingRoomId((prev) => (prev === selectedRoom.id ? null : selectedRoom.id))
                }
              >
                {doorPlacingRoomId === selectedRoom.id
                  ? 'Click a wall to place…'
                  : 'Place door'}
              </button>
              {(selectedRoom.doors ?? []).length === 0 ? (
                <p className="inspector__hint">No doors yet. Use Place door, then click a wall.</p>
              ) : (
                <ul className="inspector__door-list">
                  {(selectedRoom.doors ?? []).map((door) => (
                    <li key={door.id} className="inspector__door-item">
                      <label className="inspector__door-field">
                        <span>Wall</span>
                        <select
                          className="inspector__input"
                          value={door.wall}
                          onChange={(e) =>
                            applyPlanMutation((d) =>
                              updateRoomDoor(d, selectedRoom.id, door.id, { wall: e.target.value as RoomWall }),
                            )
                          }
                        >
                          {(Object.keys(ROOM_WALL_LABELS) as RoomWall[]).map((wall) => (
                            <option key={wall} value={wall}>
                              {ROOM_WALL_LABELS[wall]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inspector__door-field">
                        <span>Width</span>
                        <input
                          className="inspector__input"
                          type="number"
                          min={24}
                          max={wallLength(selectedRoom, door.wall)}
                          step={12}
                          value={door.width}
                          onChange={(e) =>
                            applyPlanMutation((d) =>
                              updateRoomDoor(d, selectedRoom.id, door.id, { width: Number(e.target.value) }),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn--small btn--danger"
                        onClick={() =>
                          applyPlanMutation((d) => removeRoomDoor(d, selectedRoom.id, door.id))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="inspector__hint">
              Select a room, then press Delete to remove it. Linked doors on neighboring rooms are removed too.
            </p>
            <button type="button" className="btn btn--danger btn--block" onClick={handleDeleteSelectedRoom}>
              Delete room
            </button>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
