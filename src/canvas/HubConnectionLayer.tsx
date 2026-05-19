import type { JSX } from 'react';
import { hubById, hubWorldPoint } from '../domain/hub-geometry';
import { orthogonalRoute } from '../domain/orthogonal-path';
import type { Diagram, WireColor } from '../domain/types';
import { wireLinkEndpoint } from '../domain/wire-geometry';
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
  selectedHubBridgeId: string | null;
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
  selectedHubBridgeId,
  interactive,
  onSelectHubBridge,
}: HubConnectionLayerProps): JSX.Element {
  const wireToHub: HubWireSegment[] = [];

  for (const wire of diagram.wires) {
    if (!wire.hubId) continue;
    const hub = hubById(diagram, wire.hubId);
    if (!hub) continue;
    const box = diagram.junctionBoxes.find((j) => j.id === hub.junctionBoxId);
    if (!box) continue;
    const end = wireLinkEndpoint(diagram, wire);
    if (!end) continue;
    const start = hubWorldPoint(box, hub);
    wireToHub.push({ key: `wh-${wire.id}`, points: orthogonalRoute(start, end), color: wire.color });
  }

  return (
    <g className="hub-connection-layer" role="presentation" aria-label="Hub connections">
      {wireToHub.map(({ key, points, color }) => (
        <g key={key} className="hub-wire-link">
          <HubWireLinkPath points={points} color={color} />
        </g>
      ))}

      {diagram.hubBridges.map((bridge) => {
        const pts = diagram.layout.hubBridgePaths[bridge.id]?.points;
        if (!pts || pts.length < 2) return null;
        const selected = selectedHubBridgeId === bridge.id;
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
