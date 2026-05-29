import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import {
  conduitsOnDeviceNode,
  deviceNodeWorldPoint,
  deviceNodesForDevice,
  wireOnDeviceNode,
} from '../domain/device-node-geometry';
import { isOutletEnergized, outletConnectedSlots } from '../domain/continuity';
import type { Diagram, Outlet } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { moveOutletsByDelta, outletIdsForGroupMove } from '../editor/selection-move';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';
import { DeviceNodeMarker } from './DeviceNodeMarker';

type OutletShapeProps = {
  outlet: Outlet;
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

export function OutletShape({
  outlet,
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
}: OutletShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const drag = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    outletIds: string[];
    startOutlets: Map<string, { x: number; y: number }>;
  } | null>(null);
  const nodes = deviceNodesForDevice(diagram, 'outlet', outlet.id);
  const connectInteractive = tool === 'connect-wires';
  const conduitInteractive = tool === 'cable';
  const energized = isOutletEnergized(diagram, outlet.id);
  const connectedPairs = outletConnectedSlots(outlet);
  const passthroughSlots = new Set(connectedPairs.flat());

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    if (!selected) onSelect();
    const p = worldPoint(e);
    if (!p) return;

    const outletIds = [...outletIdsForGroupMove(selection, outlet.id)];
    const startOutlets = new Map<string, { x: number; y: number }>();
    for (const id of outletIds) {
      const item = (diagram.outlets ?? []).find((o) => o.id === id);
      if (item) startOutlets.set(id, { x: item.x, y: item.y });
    }

    drag.current = { pointerId: e.pointerId, start: p, outletIds, startOutlets };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const session = drag.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const p = worldPoint(e);
    if (!p) return;
    const dx = p.x - session.start.x;
    const dy = p.y - session.start.y;
    onApplyDiagram((d) => moveOutletsByDelta(d, session.outletIds, session.startOutlets, dx, dy), {
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

  const cx = outlet.width / 2;
  const cy = outlet.height / 2;

  const nodeLayout = nodes
    .map((node) => {
      const world = deviceNodeWorldPoint(diagram, node);
      if (!world) return null;
      return { node, lx: world.x - outlet.x, ly: world.y - outlet.y };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);

  const slotPoint = new Map(nodeLayout.map(({ node, lx, ly }) => [node.slot, { lx, ly }]));

  return (
    <g
      className={[
        'outlet-device',
        selected ? 'outlet-device--selected' : '',
        energized ? 'outlet-device--energized' : '',
        outlet.passthrough ? 'outlet-device--passthrough' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${outlet.x}, ${outlet.y})`}
    >
      <rect
        className="outlet-device__body"
        width={outlet.width}
        height={outlet.height}
        rx={6}
        ry={6}
        onPointerDown={beginMove}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <rect
        className="outlet-device__face"
        x={outlet.width * 0.2}
        y={outlet.height * 0.22}
        width={outlet.width * 0.6}
        height={outlet.height * 0.56}
        rx={4}
        ry={4}
        pointerEvents="none"
      />
      <line
        className="outlet-device__slot-divider"
        x1={cx}
        y1={outlet.height * 0.28}
        x2={cx}
        y2={outlet.height * 0.72}
        pointerEvents="none"
      />
      {outlet.passthrough
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
        : null}
      {nodeLayout.map(({ node, lx, ly }) => {
        const active = outlet.passthrough ? passthroughSlots.has(node.slot) : energized && node.slot < 2;
        return (
          <g key={node.id}>
            {!outlet.passthrough ? (
              <line className="device-node__stub" x1={cx} y1={cy} x2={lx} y2={ly} />
            ) : null}
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
