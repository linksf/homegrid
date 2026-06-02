import type { JSX } from 'react';
import { wireLinkAtEndpoint } from '../domain/wire-link-utils';
import { connectableWireEndpoints, wireEndpointPoint } from '../domain/wire-routing';
import type { Diagram, WireEndpoint } from '../domain/types';

type WireEndpointHitLayerProps = {
  diagram: Diagram;
  connectInteractionActive: boolean;
  connectPendingWireId: string | null;
  connectPendingWireEndpoint: WireEndpoint | null;
  onWireEndpointPointerDown?: (wireId: string, endpoint: WireEndpoint) => void;
};

/** Click targets on wire end anchors for the connect tool. */
export function WireEndpointHitLayer({
  diagram,
  connectInteractionActive,
  connectPendingWireId,
  connectPendingWireEndpoint,
  onWireEndpointPointerDown,
}: WireEndpointHitLayerProps): JSX.Element | null {
  if (!connectInteractionActive || !onWireEndpointPointerDown) return null;

  const r = 10;

  return (
    <g className="wire-endpoint-hit-layer" role="presentation" aria-label="Wire endpoint links">
      {diagram.wires.flatMap((wire) =>
        connectableWireEndpoints(diagram, wire.id).map((endpoint) => {
          const point = wireEndpointPoint(diagram, wire.id, endpoint);
          if (!point) return null;
          const linked = Boolean(wireLinkAtEndpoint(diagram, wire.id, endpoint));
          const pending =
            connectPendingWireId === wire.id && connectPendingWireEndpoint === endpoint;
          return (
            <circle
              key={`${wire.id}-${endpoint}`}
              className={[
                'wire-endpoint-hit',
                linked ? 'wire-endpoint-hit--linked' : '',
                pending ? 'wire-endpoint-hit--pending' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              cx={point.x}
              cy={point.y}
              r={r}
              pointerEvents={pending ? 'none' : 'all'}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onWireEndpointPointerDown(wire.id, endpoint);
              }}
            />
          );
        }),
      )}
    </g>
  );
}
