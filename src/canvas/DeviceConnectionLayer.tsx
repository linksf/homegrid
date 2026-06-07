import type { JSX } from 'react';
import { deviceWireDisplayPath } from '../domain/device-wire-geometry';
import { energyHueStrokeStyle } from '../domain/energy-hue';
import type { Diagram } from '../domain/types';

function pathD(points: { x: number; y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

type DeviceConnectionLayerProps = {
  diagram: Diagram;
  showEnergyFlow?: boolean;
  energyHueByWireId?: Map<string, number>;
};

/** Orthogonal ties from device terminals to attached wires. */
export function DeviceConnectionLayer({
  diagram,
  showEnergyFlow = false,
  energyHueByWireId,
}: DeviceConnectionLayerProps): JSX.Element {
  const segments: { key: string; points: { x: number; y: number }[]; wireId: string }[] = [];

  for (const wire of diagram.wires) {
    if (!wire.deviceNodeId) continue;
    const points = deviceWireDisplayPath(diagram, wire.id);
    if (points.length < 2) continue;
    segments.push({ key: `dn-${wire.id}`, points, wireId: wire.id });
  }

  return (
    <g className="device-connection-layer" role="presentation" aria-label="Device wire connections">
      {segments.map(({ key, points, wireId }) => (
        <path
          key={key}
          className="device-wire-link"
          d={pathD(points)}
          fill="none"
          strokeLinecap="round"
          style={
            showEnergyFlow
              ? energyHueStrokeStyle(energyHueByWireId?.get(wireId))
              : undefined
          }
        />
      ))}
    </g>
  );
}
