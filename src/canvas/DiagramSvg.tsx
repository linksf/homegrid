import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import type { AnchorPosition } from '../domain/types';
import { addLightBulb, addSwitch, addDimmerSwitch, addOutlet } from '../domain/device-mutations';
import { addJunctionBox } from '../domain/mutations';
import { addRoom } from '../domain/room-mutations';
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
import { ConduitLayer } from './ConduitLayer';
import { DiagramLabelsLayer } from './DiagramLabelsLayer';
import { JunctionBoxShape } from './JunctionBoxShape';
import { DeviceConnectionLayer } from './DeviceConnectionLayer';
import { HubConnectionLayer } from './HubConnectionLayer';
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
import type { DiagramSelection } from '../editor/diagram-selection';
import { soleSelectedId } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';

export type DiagramSvgProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  tool: EditorMainTool;
  selection: DiagramSelection;
  connectPendingWireId: string | null;
  connectPendingHubId: string | null;
  connectPendingNodeId: string | null;
  marquee: { ax: number; ay: number; bx: number; by: number } | null;
  onSelectBox: (id: string | null) => void;
  onSelectRoom?: (id: string) => void;
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
  switchPlacementKind: SwitchPlacementKind;
  outletPassthrough: boolean;
};

export function DiagramSvg({
  diagram,
  resolvedByWireId,
  tool,
  selection,
  connectPendingWireId,
  connectPendingHubId,
  connectPendingNodeId,
  marquee,
  onSelectBox,
  onSelectRoom,
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
  switchPlacementKind,
  outletPassthrough,
}: DiagramSvgProps): JSX.Element {
  const vp = useDiagramViewport();

  const { minX, minY, width, height } = worldRect;

  const anchorsInteractive =
    tool === 'cable' || tool === 'conduit-connect';

  function placeJunction(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0) return;
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
    if (e.button !== 0) return;
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
    if (e.button !== 0) return;
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
    if (e.button !== 0) return;
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

  function placeRoomDevice(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    e.stopPropagation();
    let newId: string | undefined;
    onApplyDiagram((d) => {
      const next = addRoom(d, world.x, world.y);
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
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
        />
      ))}

      <ConduitLayer
        diagram={diagram}
        layerClassName="conduit-layer--under-boxes"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireIds={selection.wires}
        connectPendingWireId={connectPendingWireId}
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
          anchorsInteractive={anchorsInteractive}
          onAnchorPointerDown={(anchor) => onAnchorPick?.({ boxId: box.id, anchor })}
          onJunctionAnchorPointerDown={onJunctionAnchorPointerDown}
          onSelect={() => onSelectBox(box.id)}
          onSelectHub={(hubId) => onSelectHub?.(hubId)}
          onHubPointerDown={onHubPointerDown}
          onHubConduitPick={onHubConduitPick}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
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
        onSelectCable={onSelectCable}
        onWirePointerDown={onWirePointerDown}
        onToggleBreakerCable={onToggleBreakerCable}
      />

      <ConduitLayer
        diagram={diagram}
        kinds={['hub']}
        layerClassName="conduit-layer--over-boxes"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireIds={selection.wires}
        connectPendingWireId={connectPendingWireId}
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
        selectedHubBridgeIds={selection.hubBridges}
        interactive={tool === 'select'}
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
      />

      <WireHitLayer diagram={diagram} tool={tool} onWirePointerDown={onWirePointerDown} />

      <WireEndpointHitLayer
        diagram={diagram}
        tool={tool}
        connectPendingWireId={connectPendingWireId}
        connectPendingWireEndpoint={connectPendingWireEndpoint}
        onWireEndpointPointerDown={onWireEndpointPointerDown}
      />

      <PathEditLayer
        diagram={diagram}
        tool={tool}
        selectedWireId={soleWireId}
        selectedCableId={
          soleWireId || soleConduitId || soleLinkId || soleHubBridgeId ? null : soleCableId
        }
        selectedConduitId={soleConduitId}
        selectedLinkId={soleLinkId}
        selectedHubBridgeId={soleHubBridgeId}
        onApplyDiagram={onApplyDiagram}
        onCommitHistory={onCommitHistory}
      />

      {tool === 'select' && selection.pathAnchors.size > 0 && (
        <PathAnchorEditLayer
          diagram={diagram}
          selectedPathAnchorKeys={selection.pathAnchors}
          onApplyDiagram={onApplyDiagram}
          onCommitHistory={onCommitHistory}
        />
      )}

      <DiagramLabelsLayer diagram={diagram} showLabels={showLabels} />

      {marquee && <SelectionMarquee ax={marquee.ax} ay={marquee.ay} bx={marquee.bx} by={marquee.by} />}

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
                    ? placeRoomDevice
                    : placeJunction
          }
        />
      )}
    </g>
  );
}
