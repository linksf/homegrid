import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import {
  conduitsOnDeviceNode,
  deviceNodeLocalPoint,
  deviceOrientation,
  deviceNodesForDevice,
  wireOnDeviceNode,
} from '../domain/device-node-geometry';
import { dimmerConnectedSlots, normalizeDimmerLevel } from '../domain/continuity';
import { adjustDimmerLevel, flipDimmerPosition } from '../domain/device-mutations';
import type { Diagram, DimmerSwitch } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { dimmerSwitchIdsForGroupMove, moveDimmerSwitchesByDelta } from '../editor/selection-move';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';
import { DeviceNodeMarker } from './DeviceNodeMarker';

type DimmerSwitchShapeProps = {
  dim: DimmerSwitch;
  diagram: Diagram;
  tool: EditorMainTool;
  selected: boolean;
  selectedNodeIds: Set<string>;
  selection: DiagramSelection;
  connectPendingNodeId: string | null;
  onSelect: () => void;
  onSelectNode: (nodeId: string) => void;
  onNodePointerDown?: (nodeId: string) => void;
  onApplyDiagram: ApplyDiagramFn;
  onCommitHistory?: () => void;
};

export function DimmerSwitchShape({
  dim,
  diagram,
  tool,
  selected,
  selectedNodeIds,
  selection,
  connectPendingNodeId,
  onSelect,
  onSelectNode,
  onNodePointerDown,
  onApplyDiagram,
  onCommitHistory,
}: DimmerSwitchShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const drag = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    dimmerIds: string[];
    startDimmers: Map<string, { x: number; y: number }>;
  } | null>(null);
  const nodes = deviceNodesForDevice(diagram, 'dimmerSwitch', dim.id);
  const connectInteractive = tool === 'connect-wires';
  const conduitInteractive = tool === 'cable';
  const position = normalizeDimmerLevel(dim);
  const connectedPairs = dimmerConnectedSlots(dim);
  const connectedSlots = new Set(connectedPairs.flat());
  const isOn = position > 0;

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    if (!selected) onSelect();
    const p = worldPoint(e);
    if (!p) return;

    const dimmerIds = [...dimmerSwitchIdsForGroupMove(selection, dim.id)];
    const startDimmers = new Map<string, { x: number; y: number }>();
    for (const id of dimmerIds) {
      const item = (diagram.dimmerSwitches ?? []).find((d) => d.id === id);
      if (item) startDimmers.set(id, { x: item.x, y: item.y });
    }

    drag.current = { pointerId: e.pointerId, start: p, dimmerIds, startDimmers };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const session = drag.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const p = worldPoint(e);
    if (!p) return;
    const dx = p.x - session.start.x;
    const dy = p.y - session.start.y;
    onApplyDiagram((d) => moveDimmerSwitchesByDelta(d, session.dimmerIds, session.startDimmers, dx, dy), {
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

  const cx = dim.width / 2;
  const cy = dim.height / 2;

  const nodeLayout = nodes
    .map((node) => {
      const world = deviceNodeLocalPoint(diagram, node);
      if (!world) return null;
      return { node, lx: world.x - dim.x, ly: world.y - dim.y };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const orientation = deviceOrientation(dim);

  return (
    <g
      className={[
        'dimmer-device',
        selected ? 'dimmer-device--selected' : '',
        isOn ? 'dimmer-device--on' : 'dimmer-device--off',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${dim.x}, ${dim.y}) rotate(${orientation}, ${cx}, ${cy})`}
    >
      <rect
        className="dimmer-device__body"
        width={dim.width}
        height={dim.height}
        rx={6}
        ry={6}
        onPointerDown={beginMove}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          if (tool !== 'select') return;
          e.stopPropagation();
          onApplyDiagram((d) => flipDimmerPosition(d, dim.id));
        }}
        onWheel={(e) => {
          if (tool !== 'select' || !selected) return;
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY < 0 ? 5 : -5;
          onApplyDiagram((d) => adjustDimmerLevel(d, dim.id, delta));
        }}
      />
      <text className="dimmer-device__icon" x={cx} y={cy - 2} textAnchor="middle">
        ☀
      </text>
      <text className="dimmer-device__state" x={cx} y={cy + 12} textAnchor="middle">
        {isOn ? `${position}%` : 'Off'}
      </text>
      <rect
        className="dimmer-device__level-track"
        x={8}
        y={dim.height - 8}
        width={dim.width - 16}
        height={4}
        rx={2}
      />
      <rect
        className="dimmer-device__level-fill"
        x={8}
        y={dim.height - 8}
        width={Math.max(0, ((dim.width - 16) * position) / 100)}
        height={4}
        rx={2}
      />
      {nodeLayout.map(({ node, lx, ly }) => {
        const active = connectedSlots.has(node.slot);
        return (
          <g key={node.id}>
            <line
              className={active ? 'switch-device__path switch-device__path--closed' : 'switch-device__path'}
              x1={cx}
              y1={cy}
              x2={lx}
              y2={ly}
            />
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
