import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import {
  conduitsOnDeviceNode,
  deviceNodeLocalPoint,
  deviceOrientation,
  LIGHT_BULB_RADIUS,
  deviceNodesForDevice,
  wireOnDeviceNode,
} from '../domain/device-node-geometry';
import { lightBulbBrightness } from '../domain/continuity';
import type { Diagram, LightBulb } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { lightBulbIdsForGroupMove, moveLightBulbsByDelta } from '../editor/selection-move';
import type { DiagramSelection } from '../editor/diagram-selection';
import { useDiagramViewport } from './CanvasViewport';
import { DeviceNodeMarker } from './DeviceNodeMarker';
type LightBulbShapeProps = {
  bulb: LightBulb;
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

export function LightBulbShape({
  bulb,
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
}: LightBulbShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const drag = useRef<{
    pointerId: number;
    start: { x: number; y: number };
    bulbIds: string[];
    startBulbs: Map<string, { x: number; y: number }>;
  } | null>(null);
  const r = LIGHT_BULB_RADIUS;
  const nodes = deviceNodesForDevice(diagram, 'lightBulb', bulb.id);
  const brightness = lightBulbBrightness(diagram, bulb.id);
  const lit = brightness > 0;
  const connectInteractive = tool === 'connect-wires';
  const conduitInteractive = tool === 'cable';
  const orientation = deviceOrientation(bulb);

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    if (!selected) onSelect();
    const p = worldPoint(e);
    if (!p) return;

    const bulbIds = [...lightBulbIdsForGroupMove(selection, bulb.id)];
    const startBulbs = new Map<string, { x: number; y: number }>();
    for (const id of bulbIds) {
      const item = diagram.lightBulbs.find((b) => b.id === id);
      if (item) startBulbs.set(id, { x: item.x, y: item.y });
    }

    drag.current = { pointerId: e.pointerId, start: p, bulbIds, startBulbs };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const session = drag.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const p = worldPoint(e);
    if (!p) return;
    const dx = p.x - session.start.x;
    const dy = p.y - session.start.y;
    onApplyDiagram((d) => moveLightBulbsByDelta(d, session.bulbIds, session.startBulbs, dx, dy), {
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

  return (
    <g
      className={[
        'light-bulb',
        selected ? 'light-bulb--selected' : '',
        lit ? 'light-bulb--lit' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${bulb.x}, ${bulb.y}) rotate(${orientation}, ${r}, ${r})`}
      style={{ '--bulb-brightness': String(brightness / 100) } as CSSProperties}
    >
      <circle
        className="light-bulb__body"
        cx={r}
        cy={r}
        r={r}
        onPointerDown={beginMove}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      {nodes.map((node) => {
        const world = deviceNodeLocalPoint(diagram, node);
        if (!world) return null;
        const lx = world.x - bulb.x;
        const ly = world.y - bulb.y;
        return (
          <g key={node.id}>
            <line className="device-node__stub" x1={r} y1={r} x2={lx} y2={ly} />
            <DeviceNodeMarker
            x={lx}
            y={ly}
            hasConduit={
              conduitsOnDeviceNode(diagram, node.id).length > 0 || Boolean(wireOnDeviceNode(diagram, node.id))
            }
            selected={selectedNodeIds.has(node.id)}
            connectPending={connectPendingNodeId === node.id}
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
