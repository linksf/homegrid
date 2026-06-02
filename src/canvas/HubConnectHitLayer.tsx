import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { hubWorldPoint } from '../domain/hub-geometry';
import type { Diagram } from '../domain/types';
import { useDiagramViewport } from './CanvasViewport';
import { worldHitRadius } from './hit-targets';

/** Screen-space hub target while linking (above wires and endpoint hits). */
const CONNECT_HUB_HIT_RADIUS_SCREEN_PX = 40;

type HubConnectHitLayerProps = {
  diagram: Diagram;
  onHubPointerDown: (hubId: string) => void;
};

/** Top-layer hub targets for the connect / link-wires flow. */
export function HubConnectHitLayer({ diagram, onHubPointerDown }: HubConnectHitLayerProps): JSX.Element {
  const vp = useDiagramViewport();
  const hitRadius = worldHitRadius(vp.scale, CONNECT_HUB_HIT_RADIUS_SCREEN_PX);

  function onPointerDown(e: ReactPointerEvent, hubId: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onHubPointerDown(hubId);
  }

  return (
    <g className="hub-connect-hit-layer" role="presentation" aria-label="Hub connect targets">
      {diagram.hubs.map((hub) => {
        const box = diagram.junctionBoxes.find((b) => b.id === hub.junctionBoxId);
        if (!box) return null;
        const pt = hubWorldPoint(box, hub);
        return (
          <circle
            key={hub.id}
            className="hub-connect-hit"
            cx={pt.x}
            cy={pt.y}
            r={hitRadius}
            fill="transparent"
            pointerEvents="all"
            onPointerDown={(e) => onPointerDown(e, hub.id)}
          />
        );
      })}
    </g>
  );
}
