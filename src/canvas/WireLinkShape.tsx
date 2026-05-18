import type { JSX } from 'react';
import type { Diagram, WireLink } from '../domain/types';

function pathD(points: { x: number; y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

type WireLinkShapeProps = {
  link: WireLink;
  points: { x: number; y: number }[];
  selected?: boolean;
};

export function WireLinkShape({ link, points, selected }: WireLinkShapeProps): JSX.Element | null {
  if (points.length < 2) return null;

  const [a, b] = [points[0]!, points[points.length - 1]!];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const warn = link.whiteMismatchWarning;

  const pathClass = [
    'wire-link__path',
    warn ? 'wire-link__path--warning' : '',
    selected ? 'wire-link__path--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <g
      className={['wire-link', selected ? 'wire-link--selected' : ''].filter(Boolean).join(' ')}
      data-wire-link-id={link.id}
      aria-label={warn ? 'Wire link, white mismatch' : 'Wire link'}
    >
      <path className={pathClass} d={pathD(points)} />
      {warn && (
        <g className="wire-link__warn" transform={`translate(${mx}, ${my})`} pointerEvents="none">
          <circle className="wire-link__warn-bg" cx={0} cy={0} r={9} />
          <text className="wire-link__warn-icon" x={0} y={4} textAnchor="middle">
            !
          </text>
        </g>
      )}
    </g>
  );
}

type WireLinkLayerProps = {
  diagram: Diagram;
  selectedLinkId: string | null;
};

export function WireLinkLayer({ diagram, selectedLinkId }: WireLinkLayerProps): JSX.Element {
  return (
    <g className="wire-link-layer" role="presentation" aria-label="Wire links">
      {diagram.wireLinks.map((link) => {
        const pts = diagram.layout.wireLinkPaths[link.id]?.points;
        if (!pts || pts.length < 2) return null;
        return (
          <WireLinkShape key={link.id} link={link} points={pts} selected={selectedLinkId === link.id} />
        );
      })}
    </g>
  );
}
