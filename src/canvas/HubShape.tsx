import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { hubWorldPoint } from '../domain/hub-geometry';
import type { Diagram, Hub, JunctionBox } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { useDiagramViewport } from './CanvasViewport';
import { worldHitRadius } from './hit-targets';
type HubShapeProps = {
  box: JunctionBox;
  hub: Hub;
  diagram: Diagram;
  tool: EditorMainTool;
  selected: boolean;
  connectPendingHubId: string | null;
  connectInteractionActive?: boolean;
  onSelect: () => void;
  onHubPointerDown?: (hubId: string) => void;
  onHubConduitPick?: (hubId: string) => void;
};

export function HubShape({
  box,
  hub,
  diagram,
  tool,
  selected,
  connectPendingHubId,
  connectInteractionActive = false,
  onSelect,
  onHubPointerDown,
  onHubConduitPick,
}: HubShapeProps): JSX.Element {
  const vp = useDiagramViewport();
  const hitRadius = worldHitRadius(vp.scale);
  const pt = hubWorldPoint(box, hub);
  const pending = connectPendingHubId === hub.id;

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (connectInteractionActive) {
      onHubPointerDown?.(hub.id);
      return;
    }

    if (tool === 'cable') {
      onHubConduitPick?.(hub.id);
      return;
    }

    if (tool !== 'select') return;
    onSelect();
  }

  const trimmed = (hub.label ?? '').trim();
  const wireCount = diagram.wires.filter((w) => w.hubId === hub.id).length;

  return (
    <g
      className={['hub', selected ? 'hub--selected' : '', pending ? 'hub--pending' : '']
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${pt.x}, ${pt.y})`}
    >
      <circle className="hub__ring" r={14} pointerEvents="none" />
      <circle className="hub__core" r={8} pointerEvents="none" />
      <circle
        className="hub-hit"
        r={hitRadius}
        fill="transparent"
        pointerEvents="all"
        onPointerDown={onPointerDown}
      />
      <circle className="hub__core" r={8} />
      <title>
        {trimmed || 'Hub'} ({wireCount} wire{wireCount === 1 ? '' : 's'})
      </title>
    </g>
  );
}
