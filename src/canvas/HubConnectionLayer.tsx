import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { hubWireDisplayPath } from '../domain/hub-wire-geometry';
import { hubBridgeDisplayPath } from '../domain/hub-bridge-geometry';
import { energyHueStrokeStyle } from '../domain/energy-hue';
import type { Diagram, WireColor } from '../domain/types';
import { WIRE_STROKE_HEX } from './wire-colors';
import { wireStrokeStyle } from './wire-stroke-style';
import { HIT_STROKE_SCREEN_PX } from './hit-targets';

function pathD(points: { x: number; y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

type HubWireSegment = {
  wireId: string;
  points: { x: number; y: number }[];
  color: WireColor;
};

type HubConnectionLayerProps = {
  diagram: Diagram;
  selectedHubWireIds: Set<string>;
  selectedHubBridgeIds: Set<string>;
  interactive: boolean;
  showEnergyFlow?: boolean;
  energyHueByWireId?: Map<string, number>;
  onSelectHubWire?: (wireId: string) => void;
  onSelectHubBridge?: (bridgeId: string) => void;
};

function HubWireLinkPath({
  points,
  color,
  selected,
  showEnergyFlow = false,
  energyHue,
}: {
  points: { x: number; y: number }[];
  color: WireColor;
  selected: boolean;
  showEnergyFlow?: boolean;
  energyHue?: number;
}) {
  const d = pathD(points);
  const stroke = showEnergyFlow && energyHue != null ? energyHueStrokeStyle(energyHue)?.stroke : WIRE_STROKE_HEX[color];
  const halo = wireStrokeStyle(color);

  return (
    <>
      <path
        className="hub-wire-link__outline"
        d={d}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={selected ? 5.5 : 4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="hub-wire-link__stroke"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 3.5 : 2.5}
        strokeDasharray="6 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={halo}
      />
    </>
  );
}

export function HubConnectionLayer({
  diagram,
  selectedHubWireIds,
  selectedHubBridgeIds,
  interactive,
  showEnergyFlow = false,
  energyHueByWireId,
  onSelectHubWire,
  onSelectHubBridge,
}: HubConnectionLayerProps): JSX.Element {
  const wireToHub: HubWireSegment[] = [];

  for (const wire of diagram.wires) {
    if (!wire.hubId) continue;
    const conduit = wire.conduitId ? diagram.conduits.find((c) => c.id === wire.conduitId) : undefined;
    if (conduit?.kind === 'hub') continue;
    const points = hubWireDisplayPath(diagram, wire.id);
    if (points.length < 2) continue;
    wireToHub.push({ wireId: wire.id, points, color: wire.color });
  }

  return (
    <g className="hub-connection-layer" role="presentation" aria-label="Hub connections">
      {wireToHub.map(({ wireId, points, color }) => {
        const selected = selectedHubWireIds.has(wireId);
        const d = pathD(points);
        return (
          <g
            key={`wh-${wireId}`}
            className={['hub-wire-link', selected ? 'hub-wire-link--selected' : ''].filter(Boolean).join(' ')}
            data-hub-wire-id={wireId}
          >
            <HubWireLinkPath
              points={points}
              color={color}
              selected={selected}
              showEnergyFlow={showEnergyFlow}
              energyHue={energyHueByWireId?.get(wireId)}
            />
            {interactive && (
              <path
                className="hub-wire-link-hit diagram-hit-stroke"
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_STROKE_SCREEN_PX}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
                onPointerDown={(e: ReactPointerEvent<SVGPathElement>) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onSelectHubWire?.(wireId);
                }}
              />
            )}
          </g>
        );
      })}

      {diagram.hubBridges.map((bridge) => {
        const pts = hubBridgeDisplayPath(diagram, bridge.id);
        if (pts.length < 2) return null;
        const selected = selectedHubBridgeIds.has(bridge.id);
        return (
          <g key={bridge.id} className={['hub-bridge', selected ? 'hub-bridge--selected' : ''].filter(Boolean).join(' ')}>
            <path className="hub-bridge__path" d={pathD(pts)} fill="none" strokeLinecap="round" />
            {interactive && (
              <path
                className="hub-bridge-hit diagram-hit-stroke"
                d={pathD(pts)}
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_STROKE_SCREEN_PX}
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
