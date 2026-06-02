import { useMemo, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react';
import type { AnchorPosition, RoomWall } from '../domain/types';
import { addLightBulb, addSwitch, addDimmerSwitch, addOutlet } from '../domain/device-mutations';
import { GRID_SIZE } from '../domain/grid';
import { addJunctionBox } from '../domain/mutations';
import { addRoom, addRoomFromBounds } from '../domain/room-mutations';
import { snapRoomDraftCorners } from '../domain/room-snap';
import type { Diagram, ResolvedWire, WireEndpoint } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import {
  switchTerminalCountForPlacement,
  type SwitchPlacementKind,
} from '../editor/placement-options';
import { DiagramGrid } from './DiagramGrid';
import { RoomShape } from './RoomShape';
import { CableLayer } from './CableLayer';
import { ConduitRunLayer } from './ConduitRunLayer';
import { conduitGroupColors } from './conduit-group-colors';
import { ConduitLayer } from './ConduitLayer';
import { DiagramLabelsLayer } from './DiagramLabelsLayer';
import { JunctionBoxShape } from './JunctionBoxShape';
import { DeviceConnectionLayer } from './DeviceConnectionLayer';
import { HubConnectionLayer } from './HubConnectionLayer';
import { HubConnectHitLayer } from './HubConnectHitLayer';
import { LightBulbShape } from './LightBulbShape';
import { SwitchShape } from './SwitchShape';
import { DimmerSwitchShape } from './DimmerSwitchShape';
import { OutletShape } from './OutletShape';
import { WireLinkLayer } from './WireLinkShape';
import { WireHitLayer } from './WireHitLayer';
import { WireEndpointHitLayer } from './WireEndpointHitLayer';
import { PathEditLayer } from './PathEditLayer';
import { PathAnchorEditLayer } from './PathAnchorEditLayer';
import { SelectionMarquee } from './SelectionMarquee';
import { PenHoverIndicator } from './PenHoverIndicator';
import type { DiagramSelection } from '../editor/diagram-selection';
import { soleSelectedId } from '../editor/diagram-selection';
import type { ContextMenuTarget } from '../editor/context-menu-target';
import { useEntityContextMenuGesture } from '../editor/use-context-menu-gesture';
import { DESKTOP_LONG_PRESS_MS, TOUCH_LONG_PRESS_MS, useTouchNavigationProfile } from '../canvas/touch-profile';
import { useDiagramViewport } from './CanvasViewport';

export type DiagramSvgProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  tool: EditorMainTool;
  connectInteractionActive?: boolean;
  selection: DiagramSelection;
  connectPendingWireId: string | null;
  connectPendingHubId: string | null;
  connectPendingNodeId: string | null;
  marquee: { ax: number; ay: number; bx: number; by: number } | null;
  penHover?: { world: { x: number; y: number }; label: string | null } | null;
  onSelectBox: (id: string | null) => void;
  onSelectRoom?: (id: string) => void;
  doorPlacingRoomId?: string | null;
  onPlaceRoomDoor?: (roomId: string, wall: RoomWall, centerOffset: number) => void;
  onWirePointerDown?: (wireId: string) => void;
  onWireEndpointPointerDown?: (wireId: string, endpoint: WireEndpoint) => void;
  connectPendingWireEndpoint?: WireEndpoint | null;
  onApplyDiagram: ApplyDiagramFn;
  onCommitHistory?: () => void;
  onAnchorPick?: (payload: { boxId: string; anchor: AnchorPosition }) => void;
  onSelectLink?: (linkId: string) => void;
  onSelectConduit?: (conduitId: string) => void;
  onSelectCable?: (cableId: string) => void;
  onToggleBreakerCable?: (cableId: string) => void;
  onSelectConduitRun?: (conduitRunId: string) => void;
  onSelectCableConduit?: (cableId: string) => void;
  onConduitConnectStubPick?: (cableId: string) => void;
  conduitConnectHighlightCableIds?: Set<string> | null;
  conduitConnectPendingCableId?: string | null;
  conduitConnectDimStubNonTargets?: boolean;
  onSelectHub?: (hubId: string) => void;
  onSelectHubBridge?: (bridgeId: string) => void;
  onSelectHubWire?: (wireId: string) => void;
  onHubPointerDown?: (hubId: string) => void;
  onHubConduitPick?: (hubId: string) => void;
  onSelectLightBulb?: (id: string) => void;
  onSelectSwitch?: (id: string) => void;
  onSelectDimmerSwitch?: (id: string) => void;
  onSelectOutlet?: (id: string) => void;
  onSelectDeviceNode?: (nodeId: string) => void;
  onDeviceNodePointerDown?: (nodeId: string) => void;
  onJunctionAnchorPointerDown?: (boxId: string, anchor: AnchorPosition) => void;
  worldRect: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  showLabels: boolean;
  hideConduits: boolean;
  colorConduitGroups: boolean;
  switchPlacementKind: SwitchPlacementKind;
  outletPassthrough: boolean;
  onEntityContextMenu?: (target: ContextMenuTarget, clientX: number, clientY: number) => void;
  onSurfaceLongPress?: (clientX: number, clientY: number) => void;
};

export function DiagramSvg({
  diagram,
  resolvedByWireId,
  tool,
  connectInteractionActive = false,
  selection,
  connectPendingWireId,
  connectPendingHubId,
  connectPendingNodeId,
  marquee,
  penHover = null,
  onSelectBox,
  onSelectRoom,
  doorPlacingRoomId = null,
  onPlaceRoomDoor,
  onWirePointerDown,
  onWireEndpointPointerDown,
  connectPendingWireEndpoint = null,
  onApplyDiagram,
  onCommitHistory,
  onAnchorPick,
  onSelectLink,
  onSelectConduit,
  onSelectCable,
  onToggleBreakerCable,
  onSelectConduitRun,
  onSelectCableConduit,
  onConduitConnectStubPick,
  conduitConnectHighlightCableIds = null,
  conduitConnectPendingCableId = null,
  conduitConnectDimStubNonTargets = false,
  onSelectHub,
  onSelectHubBridge,
  onSelectHubWire,
  onHubPointerDown,
  onHubConduitPick,
  onSelectLightBulb,
  onSelectSwitch,
  onSelectDimmerSwitch,
  onSelectOutlet,
  onSelectDeviceNode,
  onDeviceNodePointerDown,
  onJunctionAnchorPointerDown,
  worldRect,
  showLabels,
  hideConduits,
  colorConduitGroups,
  switchPlacementKind,
  outletPassthrough,
  onEntityContextMenu,
  onSurfaceLongPress,
}: DiagramSvgProps): JSX.Element {
  const vp = useDiagramViewport();
  const touchNavigation = useTouchNavigationProfile();
  const longPressGestureOptions = {
    longPressMs: touchNavigation ? TOUCH_LONG_PRESS_MS : DESKTOP_LONG_PRESS_MS,
    onLongPressAt: onSurfaceLongPress,
  };
  const { bind: bindContextMenu } = useEntityContextMenuGesture(onEntityContextMenu ?? (() => {}), longPressGestureOptions);

  const groupColors = useMemo(
    () => (colorConduitGroups ? conduitGroupColors(diagram) : null),
    [colorConduitGroups, diagram],
  );
  const groupColorByRunId = groupColors?.runColorById ?? null;
  const groupColorByCableId = groupColors?.cableColorById ?? null;

  const roomDragRef = useRef<{ pointerId: number; start: { x: number; y: number } } | null>(null);
  const [roomDraft, setRoomDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const { minX, minY, width, height } = worldRect;

  const anchorsInteractive =
    tool === 'cable' || tool === 'conduit-connect';

  function placeJunction(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0 || vp.isMultiTouchActive()) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    e.stopPropagation();
    let newBoxId: string | undefined;
    onApplyDiagram((d) => {
      const next = addJunctionBox(d, world.x, world.y);
      newBoxId = next.junctionBoxes[next.junctionBoxes.length - 1]?.id;
      return next;
    });
    if (newBoxId) onSelectBox(newBoxId);
  }

  function placeBulb(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0 || vp.isMultiTouchActive()) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    e.stopPropagation();
    let newBulbId: string | undefined;
    onApplyDiagram((d) => {
      const next = addLightBulb(d, world.x, world.y);
      newBulbId = next.lightBulbs[next.lightBulbs.length - 1]?.id;
      return next;
    });
    if (newBulbId) onSelectLightBulb?.(newBulbId);
  }

  function placeSwitchDevice(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0 || vp.isMultiTouchActive()) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    e.stopPropagation();

    if (switchPlacementKind === 'dimmer') {
      let newId: string | undefined;
      onApplyDiagram((d) => {
        const next = addDimmerSwitch(d, world.x, world.y);
        newId = next.dimmerSwitches[next.dimmerSwitches.length - 1]?.id;
        return next;
      });
      if (newId) onSelectDimmerSwitch?.(newId);
      return;
    }

    const terminalCount = switchTerminalCountForPlacement(switchPlacementKind);
    let newSwitchId: string | undefined;
    onApplyDiagram((d) => {
      const next = addSwitch(d, world.x, world.y, terminalCount);
      newSwitchId = next.switches[next.switches.length - 1]?.id;
      return next;
    });
    if (newSwitchId) onSelectSwitch?.(newSwitchId);
  }

  function placeOutletDevice(e: ReactPointerEvent<SVGRectElement>, passthrough: boolean) {
    if (e.button !== 0 || vp.isMultiTouchActive()) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    e.stopPropagation();
    let newId: string | undefined;
    onApplyDiagram((d) => {
      const next = addOutlet(d, world.x, world.y, passthrough);
      newId = next.outlets[next.outlets.length - 1]?.id;
      return next;
    });
    if (newId) onSelectOutlet?.(newId);
  }

  const ROOM_DRAG_THRESHOLD = GRID_SIZE * 2;

  function beginRoomDraft(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0 || vp.isMultiTouchActive()) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    e.stopPropagation();
    roomDragRef.current = { pointerId: e.pointerId, start: world };
    setRoomDraft({ x0: world.x, y0: world.y, x1: world.x, y1: world.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveRoomDraft(e: ReactPointerEvent<SVGRectElement>) {
    const drag = roomDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    const snapped = snapRoomDraftCorners(
      drag.start.x,
      drag.start.y,
      world.x,
      world.y,
      diagram.rooms ?? [],
    );
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

    const world = vp.clientPointToWorld(e.clientX, e.clientY) ?? drag.start;
    const dragged =
      Math.abs(world.x - drag.start.x) >= ROOM_DRAG_THRESHOLD ||
      Math.abs(world.y - drag.start.y) >= ROOM_DRAG_THRESHOLD;

    let newId: string | undefined;
    onApplyDiagram((d) => {
      const next = dragged
        ? addRoomFromBounds(d, drag.start.x, drag.start.y, world.x, world.y)
        : addRoom(d, drag.start.x, drag.start.y);
      newId = next.rooms[next.rooms.length - 1]?.id;
      return next;
    });
    if (newId) onSelectRoom?.(newId);
  }

  const placementActive =
    tool === 'place-junction' ||
    tool === 'place-room' ||
    tool === 'place-light-bulb' ||
    tool === 'place-switch' ||
    tool === 'place-outlet';

  const soleWireId = soleSelectedId(selection.wires);
  const soleCableId = soleSelectedId(selection.cables);
  const soleConduitId = soleSelectedId(selection.conduits);
  const soleLinkId = soleSelectedId(selection.links);
  const soleHubBridgeId = soleSelectedId(selection.hubBridges);
  const soleHubWireId = soleSelectedId(selection.hubWires);
  const soleConduitRunId = soleSelectedId(selection.conduitRuns);

  return (
    <g
      className={['diagram-svg', placementActive ? 'diagram-svg--placing' : ''].filter(Boolean).join(' ')}
      aria-label="Wiring diagram"
    >
      <DiagramGrid minX={minX} minY={minY} width={width} height={height} />

      {(diagram.rooms ?? []).map((room) => (
        <RoomShape
          key={room.id}
          room={room}
          diagram={diagram}
          tool={tool}
          selected={selection.rooms.has(room.id)}
          selection={selection}
          onSelect={() => onSelectRoom?.(room.id)}
          doorPlacing={doorPlacingRoomId === room.id}
          onPlaceDoor={(wall, centerOffset) => onPlaceRoomDoor?.(room.id, wall, centerOffset)}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
          onEntityContextMenu={onEntityContextMenu}
          onSurfaceLongPress={onSurfaceLongPress}
        />
      ))}

      <ConduitLayer
        diagram={diagram}
        layerClassName="conduit-layer--under-boxes"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireIds={selection.wires}
        connectPendingWireId={connectPendingWireId}
        connectInteractionActive={connectInteractionActive}
        onWirePointerDown={onWirePointerDown}
        showLabels={showLabels}
        renderLabels={false}
        selectedConduitIds={selection.conduits}
        onSelectConduit={onSelectConduit}
        onApplyDiagram={onApplyDiagram}
      />

      <ConduitRunLayer
        diagram={diagram}
        selectedConduitRunIds={selection.conduitRuns}
        selectedCableIds={selection.cables}
        interactive={tool === 'select'}
        hideConduits={hideConduits}
        conduitConnectActive={tool === 'conduit-connect'}
        groupColorByRunId={groupColorByRunId}
        groupColorByCableId={groupColorByCableId}
        onSelectConduitRun={onSelectConduitRun}
        onSelectCableConduit={tool === 'select' ? onSelectCableConduit : undefined}
        conduitConnectInteractive={tool === 'conduit-connect'}
        conduitConnectHighlightCableIds={tool === 'conduit-connect' ? conduitConnectHighlightCableIds : null}
        conduitConnectDimNonTargets={tool === 'conduit-connect' && conduitConnectDimStubNonTargets}
        conduitConnectPendingCableId={tool === 'conduit-connect' ? conduitConnectPendingCableId : null}
        onConduitConnectStubPick={tool === 'conduit-connect' ? onConduitConnectStubPick : undefined}
      />

      {diagram.junctionBoxes.map((box) => (
        <JunctionBoxShape
          key={box.id}
          box={box}
          diagram={diagram}
          hubs={diagram.hubs.filter((h) => h.junctionBoxId === box.id)}
          tool={tool}
          selected={selection.junctionBoxes.has(box.id)}
          selectedHubIds={selection.hubs}
          selectedJunctionAnchorKeys={selection.junctionAnchors}
          selection={selection}
          connectPendingHubId={connectPendingHubId}
          connectInteractionActive={connectInteractionActive}
          anchorsInteractive={anchorsInteractive}
          onAnchorPointerDown={(anchor) => onAnchorPick?.({ boxId: box.id, anchor })}
          onJunctionAnchorPointerDown={onJunctionAnchorPointerDown}
          onSelect={() => onSelectBox(box.id)}
          onSelectHub={(hubId) => onSelectHub?.(hubId)}
          onHubPointerDown={onHubPointerDown}
          onHubConduitPick={onHubConduitPick}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
          onEntityContextMenu={onEntityContextMenu}
          onSurfaceLongPress={onSurfaceLongPress}
        />
      ))}

      <CableLayer
        diagram={diagram}
        resolvedByWireId={resolvedByWireId}
        selectedCableIds={selection.cables}
        selectedWireIds={selection.wires}
        tool={tool}
        interactive={tool === 'select'}
        connectPendingWireId={connectPendingWireId}
        connectInteractionActive={connectInteractionActive}
        onSelectCable={onSelectCable}
        onWirePointerDown={onWirePointerDown}
        onToggleBreakerCable={onToggleBreakerCable}
        groupColorByCableId={groupColorByCableId}
        bindContextMenu={onEntityContextMenu ? bindContextMenu : undefined}
      />

      <ConduitLayer
        diagram={diagram}
        kinds={['hub']}
        layerClassName="conduit-layer--over-boxes"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireIds={selection.wires}
        connectPendingWireId={connectPendingWireId}
        connectInteractionActive={connectInteractionActive}
        onWirePointerDown={onWirePointerDown}
        showLabels={showLabels}
        renderLabels={false}
        selectedConduitIds={selection.conduits}
        onSelectConduit={onSelectConduit}
        onApplyDiagram={onApplyDiagram}
      />

      <DeviceConnectionLayer diagram={diagram} />

      <HubConnectionLayer
        diagram={diagram}
        selectedHubWireIds={selection.hubWires}
        selectedHubBridgeIds={selection.hubBridges}
        interactive={tool === 'select' && !connectInteractionActive}
        onSelectHubWire={onSelectHubWire}
        onSelectHubBridge={onSelectHubBridge}
      />

      {diagram.lightBulbs.map((bulb) => (
        <LightBulbShape
          key={bulb.id}
          bulb={bulb}
          diagram={diagram}
          tool={tool}
          selected={selection.lightBulbs.has(bulb.id)}
          selectedNodeIds={selection.deviceNodes}
          selection={selection}
          connectPendingNodeId={connectPendingNodeId}
          connectInteractionActive={connectInteractionActive}
          onSelect={() => onSelectLightBulb?.(bulb.id)}
          onSelectNode={(nodeId) => onSelectDeviceNode?.(nodeId)}
          onNodePointerDown={onDeviceNodePointerDown}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
        />
      ))}

      {diagram.switches.map((sw) => (
        <SwitchShape
          key={sw.id}
          sw={sw}
          diagram={diagram}
          tool={tool}
          selected={selection.switches.has(sw.id)}
          selectedNodeIds={selection.deviceNodes}
          selection={selection}
          connectPendingNodeId={connectPendingNodeId}
          connectInteractionActive={connectInteractionActive}
          onSelect={() => onSelectSwitch?.(sw.id)}
          onSelectNode={(nodeId) => onSelectDeviceNode?.(nodeId)}
          onNodePointerDown={onDeviceNodePointerDown}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
        />
      ))}

      {(diagram.dimmerSwitches ?? []).map((dim) => (
        <DimmerSwitchShape
          key={dim.id}
          dim={dim}
          diagram={diagram}
          tool={tool}
          selected={selection.dimmerSwitches.has(dim.id)}
          selectedNodeIds={selection.deviceNodes}
          selection={selection}
          connectPendingNodeId={connectPendingNodeId}
          connectInteractionActive={connectInteractionActive}
          onSelect={() => onSelectDimmerSwitch?.(dim.id)}
          onSelectNode={(nodeId) => onSelectDeviceNode?.(nodeId)}
          onNodePointerDown={onDeviceNodePointerDown}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
        />
      ))}

      {(diagram.outlets ?? []).map((outlet) => (
        <OutletShape
          key={outlet.id}
          outlet={outlet}
          diagram={diagram}
          tool={tool}
          selected={selection.outlets.has(outlet.id)}
          selectedNodeIds={selection.deviceNodes}
          selection={selection}
          connectPendingNodeId={connectPendingNodeId}
          connectInteractionActive={connectInteractionActive}
          onSelect={() => onSelectOutlet?.(outlet.id)}
          onSelectNode={(nodeId) => onSelectDeviceNode?.(nodeId)}
          onNodePointerDown={onDeviceNodePointerDown}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
        />
      ))}

      <ConduitLayer
        diagram={diagram}
        kinds={['device']}
        layerClassName="conduit-layer--over-devices"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireIds={selection.wires}
        connectPendingWireId={connectPendingWireId}
        connectInteractionActive={connectInteractionActive}
        onWirePointerDown={onWirePointerDown}
        showLabels={showLabels}
        renderLabels={false}
        selectedConduitIds={selection.conduits}
        onSelectConduit={onSelectConduit}
        onApplyDiagram={onApplyDiagram}
      />

      <WireLinkLayer
        diagram={diagram}
        resolvedByWireId={resolvedByWireId}
        selectedLinkIds={selection.links}
        interactive={tool === 'select'}
        onSelectLink={onSelectLink}
        bindContextMenu={onEntityContextMenu ? bindContextMenu : undefined}
      />

      <WireHitLayer
        diagram={diagram}
        tool={tool}
        connectInteractionActive={connectInteractionActive}
        onWirePointerDown={onWirePointerDown}
        onEntityContextMenu={onEntityContextMenu}
        onSurfaceLongPress={onSurfaceLongPress}
      />

      <WireEndpointHitLayer
        diagram={diagram}
        connectInteractionActive={connectInteractionActive}
        connectPendingWireId={connectPendingWireId}
        connectPendingWireEndpoint={connectPendingWireEndpoint}
        onWireEndpointPointerDown={onWireEndpointPointerDown}
      />

      <PathEditLayer
        diagram={diagram}
        tool={tool}
        selectedWireId={
          soleHubWireId || soleConduitRunId || soleLinkId || soleHubBridgeId ? null : soleWireId
        }
        selectedCableId={
          soleWireId ||
          soleConduitId ||
          soleLinkId ||
          soleHubBridgeId ||
          soleHubWireId ||
          soleConduitRunId
            ? null
            : soleCableId
        }
        selectedConduitRunId={soleConduitRunId}
        selectedHubWireId={soleHubWireId}
        selectedConduitId={soleConduitId}
        selectedLinkId={soleLinkId}
        selectedHubBridgeId={soleHubBridgeId}
        onApplyDiagram={onApplyDiagram}
        onCommitHistory={onCommitHistory}
      />

      {tool === 'select' && selection.pathAnchors.size > 0 && (
        <PathAnchorEditLayer
          diagram={diagram}
          selection={selection}
          selectedPathAnchorKeys={selection.pathAnchors}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
        />
      )}

      <DiagramLabelsLayer diagram={diagram} showLabels={showLabels} />

      {marquee && <SelectionMarquee ax={marquee.ax} ay={marquee.ay} bx={marquee.bx} by={marquee.by} />}

      {penHover && <PenHoverIndicator world={penHover.world} />}

      {connectInteractionActive && onHubPointerDown && (
        <HubConnectHitLayer diagram={diagram} onHubPointerDown={onHubPointerDown} />
      )}

      {roomDraft && tool === 'place-room' && (
        <rect
          className="room-place-preview"
          x={Math.min(roomDraft.x0, roomDraft.x1)}
          y={Math.min(roomDraft.y0, roomDraft.y1)}
          width={Math.abs(roomDraft.x1 - roomDraft.x0)}
          height={Math.abs(roomDraft.y1 - roomDraft.y0)}
          pointerEvents="none"
        />
      )}

      {(tool === 'place-junction' ||
        tool === 'place-room' ||
        tool === 'place-light-bulb' ||
        tool === 'place-switch' ||
        tool === 'place-outlet') && (
        <rect
          className="diagram-place-overlay"
          x={minX}
          y={minY}
          width={width}
          height={height}
          pointerEvents="all"
          onPointerDown={
            tool === 'place-light-bulb'
              ? placeBulb
              : tool === 'place-switch'
                ? placeSwitchDevice
                : tool === 'place-outlet'
                  ? (e) => placeOutletDevice(e, outletPassthrough)
                  : tool === 'place-room'
                    ? beginRoomDraft
                    : placeJunction
          }
          onPointerMove={tool === 'place-room' ? moveRoomDraft : undefined}
          onPointerUp={tool === 'place-room' ? endRoomDraft : undefined}
          onPointerCancel={tool === 'place-room' ? endRoomDraft : undefined}
        />
      )}
    </g>
  );
}
