import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import {
  conduitsOnDeviceNode,
  deviceNodeLocalPoint,
  deviceOrientation,
  deviceNodesForDevice,
  wireOnDeviceNode,
} from '../domain/device-node-geometry';
import {
  normalizeSwitchPosition,
  switchConnectedSlots,
} from '../domain/continuity';
import { flipSwitchPosition } from '../domain/device-mutations';
import type { Diagram, Switch } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { captureSelectionMoveSnapshot, moveSelectionByDelta, switchIdsForGroupMove } from '../editor/selection-move';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';
import { DeviceNodeMarker } from './DeviceNodeMarker';

type SwitchShapeProps = {
  sw: Switch;
  diagram: Diagram;
  tool: EditorMainTool;
  selected: boolean;
  selectedNodeIds: Set<string>;
  selection: DiagramSelection;
  connectPendingNodeId: string | null;
  connectInteractionActive?: boolean;
  onSelect: () => void;
  onSelectNode: (nodeId: string) => void;
  onNodePointerDown?: (nodeId: string) => void;
  onApplyDiagram: ApplyDiagramFn;
  onCommitHistory?: () => void;
};

export function SwitchShape({
  sw,
  diagram,
  tool,
  selected,
  selectedNodeIds,
  selection,
  connectPendingNodeId,
  connectInteractionActive = false,
  onSelect,
  onSelectNode,
  onNodePointerDown,
  onApplyDiagram,
  onCommitHistory,
}: SwitchShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const drag = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    snapshot: ReturnType<typeof captureSelectionMoveSnapshot>;
  } | null>(null);
  const nodes = deviceNodesForDevice(diagram, 'switch', sw.id);
  const connectInteractive = connectInteractionActive;
  const conduitInteractive = tool === 'cable';
  const position = normalizeSwitchPosition(sw);
  const connectedPairs = switchConnectedSlots(sw);
  const connectedSlots = new Set(connectedPairs.flat());
  const isFourWay = sw.terminalCount === 4;
  const isClosed = sw.terminalCount === 2 ? position === 'closed' : true;
  const statusLabel =
    sw.terminalCount === 4
      ? position === 'cross'
        ? 'Cross'
        : 'Straight'
      : sw.terminalCount === 3
        ? position === 'travelerB'
          ? 'Common ↔ bottom'
          : 'Common ↔ right'
        : position === 'closed'
          ? 'Closed'
          : 'Open';

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    if (!selected) onSelect();
    const p = worldPoint(e);
    if (!p) return;

    const switchIds = [...switchIdsForGroupMove(selection, sw.id)];
    const moveSelection: DiagramSelection = {
      ...selection,
      switches: new Set([...selection.switches, ...switchIds]),
    };
    const snapshot = captureSelectionMoveSnapshot(diagram, moveSelection);

    drag.current = { pointerId: e.pointerId, start: p, snapshot };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const session = drag.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const p = worldPoint(e);
    if (!p) return;
    const dx = p.x - session.start.x;
    const dy = p.y - session.start.y;
    onApplyDiagram((d) => moveSelectionByDelta(d, session.snapshot, dx, dy), {
      history: false,
    });
  }

  function endDrag(e: ReactPointerEvent) {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    onCommitHistory?.();
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const cx = sw.width / 2;
  const cy = sw.height / 2;

  const nodeLayout = nodes
    .map((node) => {
      const world = deviceNodeLocalPoint(diagram, node);
      if (!world) return null;
      return {
        node,
        lx: world.x - sw.x,
        ly: world.y - sw.y,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const slotPoint = new Map(nodeLayout.map(({ node, lx, ly }) => [node.slot, { lx, ly }]));

  const orientation = deviceOrientation(sw);

  return (
    <g
      className={[
        'switch-device',
        selected ? 'switch-device--selected' : '',
        isClosed ? 'switch-device--closed' : 'switch-device--open',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${sw.x}, ${sw.y}) rotate(${orientation}, ${cx}, ${cy})`}
    >
      <rect
        className="switch-device__body"
        width={sw.width}
        height={sw.height}
        rx={6}
        ry={6}
        onPointerDown={beginMove}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          if (tool !== 'select') return;
          e.stopPropagation();
          onApplyDiagram((d) => flipSwitchPosition(d, sw.id));
        }}
      />
      <text className="switch-device__state" x={cx} y={cy + 4} textAnchor="middle">
        {statusLabel}
      </text>
      {isFourWay
        ? connectedPairs.map(([slotA, slotB]) => {
            const a = slotPoint.get(slotA);
            const b = slotPoint.get(slotB);
            if (!a || !b) return null;
            return (
              <line
                key={`${slotA}-${slotB}`}
                className="switch-device__path switch-device__path--closed"
                x1={a.lx}
                y1={a.ly}
                x2={b.lx}
                y2={b.ly}
              />
            );
          })
        : nodeLayout.map(({ node, lx, ly }) => {
            const active = connectedSlots.has(node.slot);
            return (
              <line
                key={`path-${node.id}-${position}`}
                className={active ? 'switch-device__path switch-device__path--closed' : 'switch-device__path'}
                x1={cx}
                y1={cy}
                x2={lx}
                y2={ly}
              />
            );
          })}
      {nodeLayout.map(({ node, lx, ly }) => {
        const active = connectedSlots.has(node.slot);
        return (
          <g key={node.id}>
            <DeviceNodeMarker
              x={lx}
              y={ly}
              hasConduit={
                conduitsOnDeviceNode(diagram, node.id).length > 0 || Boolean(wireOnDeviceNode(diagram, node.id))
              }
              selected={selectedNodeIds.has(node.id)}
              connectPending={connectPendingNodeId === node.id}
              active={active}
              interactive={tool === 'select' || connectInteractive || conduitInteractive}
              onSelect={() => onSelectNode(node.id)}
              onPointerDown={() => onNodePointerDown?.(node.id)}
            />
          </g>
        );
      })}
    </g>
  );
}
