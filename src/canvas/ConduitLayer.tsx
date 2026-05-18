import type { JSX } from 'react';
import type { Diagram, ResolvedWire, WireColor } from '../domain/types';
import { WireChevronPath } from './WireChevronPath';
import { wireWorldPolyline } from './wire-path-utils';

const WIRE_CLASS: Record<WireColor, string> = {
  red: 'wire-stroke wire-stroke--red',
  white: 'wire-stroke wire-stroke--white',
  black: 'wire-stroke wire-stroke--black',
};

type ConduitBundleProps = {
  diagram: Diagram;
  conduit: Diagram['conduits'][number];
  resolvedByWireId: Map<string, ResolvedWire>;
};

function polylineToPath(pts: { x: number; y: number }[]): string {
  return pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

export function ConduitBundle({ diagram, conduit, resolvedByWireId }: ConduitBundleProps): JSX.Element | null {
  const wires = conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (wires.length === 0) return null;

  return (
    <g className="conduit-bundle" data-conduit-id={conduit.id}>
      {wires.map((wire) => {
        const pts = wireWorldPolyline(diagram, wire.id);
        if (!pts || pts.length < 2) return null;
        const rw = resolvedByWireId.get(wire.id);
        return (
          <g key={wire.id} data-wire-id={wire.id}>
            <path
              className={WIRE_CLASS[wire.color]}
              d={polylineToPath(pts)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <WireChevronPath
              points={pts}
              resolvedDirection={rw?.resolvedDirection ?? null}
              directionConflict={rw?.directionConflict ?? false}
            />
          </g>
        );
      })}
      <title>{conduit.label}</title>
    </g>
  );
}

type ConduitLayerProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
};

export function ConduitLayer({ diagram, resolvedByWireId }: ConduitLayerProps): JSX.Element {
  return (
    <g className="conduit-layer" role="presentation" aria-label="Conduits">
      {diagram.conduits.map((c) => (
        <ConduitBundle key={c.id} conduit={c} diagram={diagram} resolvedByWireId={resolvedByWireId} />
      ))}
    </g>
  );
}
