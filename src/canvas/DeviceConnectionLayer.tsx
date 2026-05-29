import type { JSX } from 'react';
import { deviceWireDisplayPath } from '../domain/device-wire-geometry';
import type { Diagram } from '../domain/types';

function pathD(points: { x: number; y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

type DeviceConnectionLayerProps = {
  diagram: Diagram;
};

/** Orthogonal ties from device terminals to attached wires. */
export function DeviceConnectionLayer({ diagram }: DeviceConnectionLayerProps): JSX.Element {
  const segments: { key: string; points: { x: number; y: number }[] }[] = [];

  for (const wire of diagram.wires) {
    if (!wire.deviceNodeId) continue;
    const points = deviceWireDisplayPath(diagram, wire.id);
    if (points.length < 2) continue;
    segments.push({ key: `dn-${wire.id}`, points });
  }

  return (
    <g className="device-connection-layer" role="presentation" aria-label="Device wire connections">
      {segments.map(({ key, points }) => (
        <path key={key} className="device-wire-link" d={pathD(points)} fill="none" strokeLinecap="round" />
      ))}
    </g>
  );
}
