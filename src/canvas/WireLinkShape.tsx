import type { JSX } from 'react';
import { wireLinkDisplayPath } from '../domain/wire-geometry';
import type { Diagram, WireColor, WireLink } from '../domain/types';
import { WIRE_STROKE_HEX } from './wire-colors';

function pathD(points: { x: number; y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

function offsetPath(
  points: { x: number; y: number }[],
  ox: number,
  oy: number,
): { x: number; y: number }[] {
  return points.map((pt) => ({ x: pt.x + ox, y: pt.y + oy }));
}

function linkPerpendicular(points: { x: number; y: number }[]): { x: number; y: number } {
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

const LINK_OFFSET = 10;

type WireLinkShapeProps = {
  link: WireLink;
  diagram: Diagram;
  points: { x: number; y: number }[];
  selected?: boolean;
  interactive?: boolean;
  onSelect?: () => void;
};

export function WireLinkShape({
  link,
  diagram,
  points,
  selected,
  interactive,
  onSelect,
}: WireLinkShapeProps): JSX.Element | null {
  if (points.length < 2) return null;

  const displayPoints = wireLinkDisplayPath(diagram, link.id);
  if (displayPoints.length < 2) return null;

  const wa = diagram.wires.find((w) => w.id === link.wireIdA);
  const wb = diagram.wires.find((w) => w.id === link.wireIdB);
  const colorA: WireColor = wa?.color ?? 'black';
  const colorB: WireColor = wb?.color ?? 'black';

  const [a, b] = [displayPoints[0]!, displayPoints[displayPoints.length - 1]!];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const warn = link.whiteMismatchWarning;
  const perp = linkPerpendicular(displayPoints);

  const pathClass = ['wire-link__path', selected ? 'wire-link__path--selected' : ''].filter(Boolean).join(' ');

  const paths =
    colorA === colorB ? (
      <path className={pathClass} d={pathD(displayPoints)} stroke={WIRE_STROKE_HEX[colorA]} />
    ) : (
      <>
        <path
          className={pathClass}
          d={pathD(offsetPath(displayPoints, perp.x * LINK_OFFSET, perp.y * LINK_OFFSET))}
          stroke={WIRE_STROKE_HEX[colorA]}
        />
        <path
          className={pathClass}
          d={pathD(offsetPath(displayPoints, -perp.x * LINK_OFFSET, -perp.y * LINK_OFFSET))}
          stroke={WIRE_STROKE_HEX[colorB]}
        />
      </>
    );

  const hitD = pathD(displayPoints);

  return (
    <g
      className={['wire-link', selected ? 'wire-link--selected' : ''].filter(Boolean).join(' ')}
      data-wire-link-id={link.id}
      aria-label={warn ? 'Wire link, white mismatch' : 'Wire link'}
    >
      {paths}
      {interactive && (
        <path
          className="wire-link-hit"
          d={hitD}
          fill="none"
          stroke="transparent"
          strokeWidth={32}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="stroke"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onSelect?.();
          }}
        />
      )}
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
  interactive: boolean;
  onSelectLink?: (linkId: string) => void;
};

export function WireLinkLayer({
  diagram,
  selectedLinkId,
  interactive,
  onSelectLink,
}: WireLinkLayerProps): JSX.Element {
  return (
    <g className="wire-link-layer" role="presentation" aria-label="Wire links">
      {diagram.wireLinks.map((link) => {
        const pts = diagram.layout.wireLinkPaths[link.id]?.points;
        if (!pts || pts.length < 2) return null;
        return (
          <WireLinkShape
            key={link.id}
            link={link}
            diagram={diagram}
            points={pts}
            selected={selectedLinkId === link.id}
            interactive={interactive}
            onSelect={() => onSelectLink?.(link.id)}
          />
        );
      })}
    </g>
  );
}
