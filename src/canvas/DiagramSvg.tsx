import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import type { AnchorPosition } from '../domain/types';
import { addLightBulb, addSwitch } from '../domain/device-mutations';
import { addJunctionBox } from '../domain/mutations';
import type { Diagram, ResolvedWire } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { ConduitLayer } from './ConduitLayer';
import { DiagramLabelsLayer } from './DiagramLabelsLayer';
import { JunctionBoxShape } from './JunctionBoxShape';
import { DeviceConnectionLayer } from './DeviceConnectionLayer';
import { HubConnectionLayer } from './HubConnectionLayer';
import { LightBulbShape } from './LightBulbShape';
import { SwitchShape } from './SwitchShape';
import { WireLinkLayer } from './WireLinkShape';
import { WireHitLayer } from './WireHitLayer';
import { PathEditLayer } from './PathEditLayer';
import { useDiagramViewport } from './CanvasViewport';

export type DiagramSvgProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  tool: EditorMainTool;
  selectedBoxId: string | null;
  selectedWireId: string | null;
  selectedLinkId: string | null;
  selectedConduitId: string | null;
  selectedHubId: string | null;
  selectedHubBridgeId: string | null;
  connectPendingWireId: string | null;
  connectPendingHubId: string | null;
  connectPendingNodeId: string | null;
  selectedLightBulbId: string | null;
  selectedSwitchId: string | null;
  selectedDeviceNodeId: string | null;
  onSelectBox: (id: string | null) => void;
  onWirePointerDown?: (wireId: string) => void;
  onApplyDiagram: (mutator: (diagram: Diagram) => Diagram) => void;
  onAnchorPick?: (payload: { boxId: string; anchor: AnchorPosition }) => void;
  onSelectLink?: (linkId: string) => void;
  onSelectConduit?: (conduitId: string) => void;
  onSelectHub?: (hubId: string) => void;
  onSelectHubBridge?: (bridgeId: string) => void;
  onHubPointerDown?: (hubId: string) => void;
  onSelectLightBulb?: (id: string) => void;
  onSelectSwitch?: (id: string) => void;
  onSelectDeviceNode?: (nodeId: string) => void;
  onDeviceNodePointerDown?: (nodeId: string) => void;
  worldRect: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
  showLabels: boolean;
};

export function DiagramSvg({
  diagram,
  resolvedByWireId,
  tool,
  selectedBoxId,
  selectedWireId,
  selectedLinkId,
  selectedConduitId,
  selectedHubId,
  selectedHubBridgeId,
  connectPendingWireId,
  connectPendingHubId,
  connectPendingNodeId,
  selectedLightBulbId,
  selectedSwitchId,
  selectedDeviceNodeId,
  onSelectBox,
  onWirePointerDown,
  onApplyDiagram,
  onAnchorPick,
  onSelectLink,
  onSelectConduit,
  onSelectHub,
  onSelectHubBridge,
  onHubPointerDown,
  onSelectLightBulb,
  onSelectSwitch,
  onSelectDeviceNode,
  onDeviceNodePointerDown,
  worldRect,
  showLabels,
}: DiagramSvgProps): JSX.Element {
  const vp = useDiagramViewport();

  const { minX, minY, width, height } = worldRect;

  const anchorsInteractive =
    tool === 'conduit-local' || tool === 'conduit-span' || tool === 'conduit-breaker';

  function placeAtWorld(
    e: ReactPointerEvent<SVGRectElement>,
    place: (d: Diagram, x: number, y: number) => Diagram,
  ) {
    if (e.button !== 0) return;
    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;
    e.stopPropagation();
    onApplyDiagram((d) => place(d, world.x, world.y));
  }

  function placeJunction(e: ReactPointerEvent<SVGRectElement>) {
    placeAtWorld(e, addJunctionBox);
  }

  function placeBulb(e: ReactPointerEvent<SVGRectElement>) {
    placeAtWorld(e, addLightBulb);
  }

  function placeSwitchDevice(e: ReactPointerEvent<SVGRectElement>) {
    placeAtWorld(e, addSwitch);
  }

  return (
    <g className="diagram-svg" aria-label="Wiring diagram">
      <ConduitLayer
        diagram={diagram}
        kinds={['span', 'breaker']}
        layerClassName="conduit-layer--under-boxes"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireId={selectedWireId}
        connectPendingWireId={connectPendingWireId}
        onWirePointerDown={onWirePointerDown}
        showLabels={showLabels}
        renderLabels={false}
        selectedConduitId={selectedConduitId}
        onSelectConduit={onSelectConduit}
        onApplyDiagram={onApplyDiagram}
      />

      {diagram.junctionBoxes.map((box) => (
        <JunctionBoxShape
          key={box.id}
          box={box}
          diagram={diagram}
          hubs={diagram.hubs.filter((h) => h.junctionBoxId === box.id)}
          tool={tool}
          selected={selectedBoxId === box.id}
          selectedHubId={selectedHubId}
          connectPendingHubId={connectPendingHubId}
          anchorsInteractive={anchorsInteractive}
          onAnchorPointerDown={(anchor) => onAnchorPick?.({ boxId: box.id, anchor })}
          onSelect={() => onSelectBox(box.id)}
          onSelectHub={(hubId) => onSelectHub?.(hubId)}
          onHubPointerDown={onHubPointerDown}
          onApplyDiagram={onApplyDiagram}
        />
      ))}

      <ConduitLayer
        diagram={diagram}
        kinds={['local']}
        layerClassName="conduit-layer--over-boxes"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireId={selectedWireId}
        connectPendingWireId={connectPendingWireId}
        onWirePointerDown={onWirePointerDown}
        showLabels={showLabels}
        renderLabels={false}
        selectedConduitId={selectedConduitId}
        onSelectConduit={onSelectConduit}
        onApplyDiagram={onApplyDiagram}
      />

      <DeviceConnectionLayer diagram={diagram} />

      <HubConnectionLayer
        diagram={diagram}
        selectedHubBridgeId={selectedHubBridgeId}
        interactive={tool === 'select'}
        onSelectHubBridge={onSelectHubBridge}
      />

      {diagram.lightBulbs.map((bulb) => (
        <LightBulbShape
          key={bulb.id}
          bulb={bulb}
          diagram={diagram}
          tool={tool}
          selected={selectedLightBulbId === bulb.id}
          selectedNodeId={selectedDeviceNodeId}
          connectPendingNodeId={connectPendingNodeId}
          onSelect={() => onSelectLightBulb?.(bulb.id)}
          onSelectNode={(nodeId) => onSelectDeviceNode?.(nodeId)}
          onNodePointerDown={onDeviceNodePointerDown}
          onApplyDiagram={onApplyDiagram}
        />
      ))}

      {diagram.switches.map((sw) => (
        <SwitchShape
          key={sw.id}
          sw={sw}
          diagram={diagram}
          tool={tool}
          selected={selectedSwitchId === sw.id}
          selectedNodeId={selectedDeviceNodeId}
          connectPendingNodeId={connectPendingNodeId}
          onSelect={() => onSelectSwitch?.(sw.id)}
          onSelectNode={(nodeId) => onSelectDeviceNode?.(nodeId)}
          onNodePointerDown={onDeviceNodePointerDown}
          onApplyDiagram={onApplyDiagram}
        />
      ))}

      <ConduitLayer
        diagram={diagram}
        kinds={['device']}
        layerClassName="conduit-layer--over-devices"
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireId={selectedWireId}
        connectPendingWireId={connectPendingWireId}
        onWirePointerDown={onWirePointerDown}
        showLabels={showLabels}
        renderLabels={false}
        selectedConduitId={selectedConduitId}
        onSelectConduit={onSelectConduit}
        onApplyDiagram={onApplyDiagram}
      />

      <WireLinkLayer
        diagram={diagram}
        selectedLinkId={selectedLinkId}
        interactive={tool === 'select'}
        onSelectLink={onSelectLink}
      />

      <WireHitLayer diagram={diagram} tool={tool} onWirePointerDown={onWirePointerDown} />

      <PathEditLayer
        diagram={diagram}
        tool={tool}
        selectedWireId={selectedWireId}
        selectedConduitId={selectedConduitId}
        selectedLinkId={selectedLinkId}
        onApplyDiagram={onApplyDiagram}
      />

      <DiagramLabelsLayer diagram={diagram} showLabels={showLabels} />

      {(tool === 'place-junction' || tool === 'place-light-bulb' || tool === 'place-switch') && (
        <rect
          className="diagram-place-overlay"
          x={minX}
          y={minY}
          width={width}
          height={height}
          onPointerDown={
            tool === 'place-light-bulb'
              ? placeBulb
              : tool === 'place-switch'
                ? placeSwitchDevice
                : placeJunction
          }
        />
      )}
    </g>
  );
}
