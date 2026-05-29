import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { hubWorldPoint } from '../domain/hub-geometry';
import type { Diagram, Hub, JunctionBox } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
type HubShapeProps = {
  box: JunctionBox;
  hub: Hub;
  diagram: Diagram;
  tool: EditorMainTool;
  selected: boolean;
  connectPendingHubId: string | null;
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
  onSelect,
  onHubPointerDown,
  onHubConduitPick,
}: HubShapeProps): JSX.Element {
  const pt = hubWorldPoint(box, hub);
  const pending = connectPendingHubId === hub.id;

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (tool === 'connect-wires') {
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
      onPointerDown={onPointerDown}
    >
      <circle className="hub__ring" r={14} />
      <circle className="hub__core" r={8} />
      <title>
        {trimmed || 'Hub'} ({wireCount} wire{wireCount === 1 ? '' : 's'})
      </title>
    </g>
  );
}
