import type { JSX } from 'react';
import { hubWireDisplayPath } from '../domain/hub-wire-geometry';
import { hubBridgeDisplayPath } from '../domain/hub-bridge-geometry';
import type { Diagram, WireColor } from '../domain/types';
import { WIRE_STROKE_HEX } from './wire-colors';

function pathD(points: { x: number; y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

type HubWireSegment = {
  key: string;
  points: { x: number; y: number }[];
  color: WireColor;
};

type HubConnectionLayerProps = {
  diagram: Diagram;
  selectedHubBridgeIds: Set<string>;
  interactive: boolean;
  onSelectHubBridge?: (bridgeId: string) => void;
};

function HubWireLinkPath({ points, color }: { points: { x: number; y: number }[]; color: WireColor }) {
  const d = pathD(points);
  const stroke = WIRE_STROKE_HEX[color];
  const whiteHalo = color === 'white' ? { filter: 'drop-shadow(0 0 1px #1a1a1a)' } : undefined;

  return (
    <>
      <path
        className="hub-wire-link__outline"
        d={d}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="hub-wire-link__stroke"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeDasharray="6 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={whiteHalo}
      />
    </>
  );
}

export function HubConnectionLayer({
  diagram,
  selectedHubBridgeIds,
  interactive,
  onSelectHubBridge,
}: HubConnectionLayerProps): JSX.Element {
  const wireToHub: HubWireSegment[] = [];

  for (const wire of diagram.wires) {
    if (!wire.hubId) continue;
    const conduit = wire.conduitId ? diagram.conduits.find((c) => c.id === wire.conduitId) : undefined;
    if (conduit?.kind === 'hub') continue;
    const points = hubWireDisplayPath(diagram, wire.id);
    if (points.length < 2) continue;
    wireToHub.push({ key: `wh-${wire.id}`, points, color: wire.color });
  }

  return (
    <g className="hub-connection-layer" role="presentation" aria-label="Hub connections">
      {wireToHub.map(({ key, points, color }) => (
        <g key={key} className="hub-wire-link">
          <HubWireLinkPath points={points} color={color} />
        </g>
      ))}

      {diagram.hubBridges.map((bridge) => {
        const pts = hubBridgeDisplayPath(diagram, bridge.id);
        if (pts.length < 2) return null;
        const selected = selectedHubBridgeIds.has(bridge.id);
        return (
          <g key={bridge.id} className={['hub-bridge', selected ? 'hub-bridge--selected' : ''].filter(Boolean).join(' ')}>
            <path className="hub-bridge__path" d={pathD(pts)} fill="none" strokeLinecap="round" />
            {interactive && (
              <path
                className="hub-bridge-hit"
                d={pathD(pts)}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                strokeLinecap="round"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onSelectHubBridge?.(bridge.id);
                }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
