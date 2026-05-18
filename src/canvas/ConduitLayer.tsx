import type { JSX } from 'react';
import type { Conduit, Diagram, WireColor } from '../domain/types';

const WIRE_CLASS: Record<WireColor, string> = {
  red: 'wire-stroke wire-stroke--red',
  white: 'wire-stroke wire-stroke--white',
  black: 'wire-stroke wire-stroke--black',
};

type ConduitBundleProps = {
  diagram: Diagram;
  conduit: Conduit;
};

function offsetPolyline(points: { x: number; y: number }[], ox: number, oy: number): { x: number; y: number }[] {
  return points.map((pt) => ({ x: pt.x + ox, y: pt.y + oy }));
}

export function ConduitBundle({ diagram, conduit }: ConduitBundleProps): JSX.Element | null {
  const layout = diagram.layout.conduitPaths[conduit.id]?.points;
  if (!layout || layout.length < 2) return null;

  const wires = conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (wires.length === 0) return null;

  const [p0, p1] = [layout[0]!, layout[layout.length - 1]!];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  /** Unit perpendicular for bundling parallel runs */
  const px = -uy;
  const py = ux;

  const spacing = 5;
  const n = wires.length;

  const polylineToPath = (pts: { x: number; y: number }[]): string =>
    pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

  return (
    <g className="conduit-bundle" data-conduit-id={conduit.id}>
      {wires.map((wire, idx) => {
        const offset = (idx - (n - 1) / 2) * spacing;
        const ox = px * offset;
        const oy = py * offset;
        const pts = offsetPolyline(layout, ox, oy);
        return (
          <path
            key={wire.id}
            className={WIRE_CLASS[wire.color]}
            d={polylineToPath(pts)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      <title>{conduit.label}</title>
    </g>
  );
}

export function ConduitLayer({ diagram }: { diagram: Diagram }): JSX.Element {
  return (
    <g className="conduit-layer" role="presentation" aria-label="Conduits">
      {diagram.conduits.map((c) => (
        <ConduitBundle key={c.id} conduit={c} diagram={diagram} />
      ))}
    </g>
  );
}
