import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import {
  conduitsOnDeviceNode,
  deviceNodeWorldPoint,
  deviceNodesForDevice,
} from '../domain/device-node-geometry';
import { moveSwitch as moveSwitchMutation } from '../domain/device-mutations';
import type { Diagram, Switch } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { useDiagramViewport } from './CanvasViewport';
import { DeviceNodeMarker } from './DeviceNodeMarker';
type SwitchShapeProps = {
  sw: Switch;
  diagram: Diagram;
  tool: EditorMainTool;
  selected: boolean;
  selectedNodeId: string | null;
  connectPendingNodeId: string | null;
  onSelect: () => void;
  onSelectNode: (nodeId: string) => void;
  onNodePointerDown?: (nodeId: string) => void;
  onApplyDiagram: (mutator: (diagram: Diagram) => Diagram) => void;
};

export function SwitchShape({
  sw,
  diagram,
  tool,
  selected,
  selectedNodeId,
  connectPendingNodeId,
  onSelect,
  onSelectNode,
  onNodePointerDown,
  onApplyDiagram,
}: SwitchShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const drag = useRef<{ pointerId: number; start: { x: number; y: number }; base: Switch } | null>(null);
  const nodes = deviceNodesForDevice(diagram, 'switch', sw.id);
  const connectInteractive = tool === 'connect-wires';
  const conduitInteractive = tool === 'conduit-local';

  function worldPoint(ev: ReactPointerEvent | PointerEvent) {
    return vp.clientPointToWorld(ev.clientX, ev.clientY);
  }

  function beginMove(e: ReactPointerEvent) {
    if (e.button !== 0 || tool !== 'select') return;
    e.stopPropagation();
    onSelect();
    const p = worldPoint(e);
    if (!p) return;
    drag.current = { pointerId: e.pointerId, start: p, base: sw };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const session = drag.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const p = worldPoint(e);
    if (!p) return;
    const dx = p.x - session.start.x;
    const dy = p.y - session.start.y;
    onApplyDiagram((d) => moveSwitchMutation(d, sw.id, session.base.x + dx, session.base.y + dy));
  }

  function endDrag(e: ReactPointerEvent) {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <g
      className={['switch-device', selected ? 'switch-device--selected' : ''].filter(Boolean).join(' ')}
      transform={`translate(${sw.x}, ${sw.y})`}
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
      />
      {nodes.map((node) => {
        const world = deviceNodeWorldPoint(diagram, node);
        if (!world) return null;
        const lx = world.x - sw.x;
        const ly = world.y - sw.y;
        const cx = sw.width / 2;
        const cy = sw.height / 2;
        return (
          <g key={node.id}>
            <line className="device-node__stub" x1={cx} y1={cy} x2={lx} y2={ly} />
            <DeviceNodeMarker
              x={lx}
              y={ly}
              hasConduit={conduitsOnDeviceNode(diagram, node.id).length > 0}
              selected={selectedNodeId === node.id}
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
