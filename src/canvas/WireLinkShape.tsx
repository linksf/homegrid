import type { CSSProperties, JSX } from 'react';
import { wireLinkDisplayPath } from '../domain/wire-geometry';
import type { Diagram, ResolvedWire, WireColor, WireLink } from '../domain/types';
import { isDirectionOpposedLink, wireLinkFlowDirection } from '../domain/wire-link-utils';
import { WireChevronPath } from './WireChevronPath';
import { WIRE_STROKE_HEX } from './wire-colors';

function pathD(points: { x: number; y: number }[]): string {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

/** Equal dash/gap length so two offset strokes interleave (A, B, A, B, …). */
const ALTERNATING_DASH = 8;

function wireStrokeStyle(color: WireColor): CSSProperties | undefined {
  return color === 'white' ? { filter: 'drop-shadow(0 0 1px #1a1a1a)' } : undefined;
}

type AlternatingDashedPathProps = {
  d: string;
  className: string;
  colorA: WireColor;
  colorB: WireColor;
};

/** One centerline; each dash alternates wire color via offset dash patterns. */
function AlternatingDashedPath({ d, className, colorA, colorB }: AlternatingDashedPathProps): JSX.Element {
  const pattern = `${ALTERNATING_DASH} ${ALTERNATING_DASH}`;
  return (
    <>
      <path
        className={className}
        d={d}
        stroke={WIRE_STROKE_HEX[colorA]}
        strokeDasharray={pattern}
        style={wireStrokeStyle(colorA)}
      />
      <path
        className={className}
        d={d}
        stroke={WIRE_STROKE_HEX[colorB]}
        strokeDasharray={pattern}
        strokeDashoffset={ALTERNATING_DASH}
        style={wireStrokeStyle(colorB)}
      />
    </>
  );
}

type WireLinkShapeProps = {
  link: WireLink;
  diagram: Diagram;
  points: { x: number; y: number }[];
  resolvedByWireId: Map<string, ResolvedWire>;
  selected?: boolean;
  interactive?: boolean;
  onSelect?: () => void;
};

export function WireLinkShape({
  link,
  diagram,
  points,
  resolvedByWireId,
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

  const pathClass = ['wire-link__path', selected ? 'wire-link__path--selected' : ''].filter(Boolean).join(' ');
  const d = pathD(displayPoints);

  const paths =
    colorA === colorB ? (
      <path className={pathClass} d={d} stroke={WIRE_STROKE_HEX[colorA]} style={wireStrokeStyle(colorA)} />
    ) : (
      <AlternatingDashedPath d={d} className={pathClass} colorA={colorA} colorB={colorB} />
    );

  const { direction: linkDirection, conflict: linkDirectionConflict } = wireLinkFlowDirection(
    link,
    resolvedByWireId.get(link.wireIdA),
    resolvedByWireId.get(link.wireIdB),
  );
  const warn = isDirectionOpposedLink(
    link,
    resolvedByWireId.get(link.wireIdA),
    resolvedByWireId.get(link.wireIdB),
  );

  const hitD = d;

  return (
    <g
      className={['wire-link', selected ? 'wire-link--selected' : ''].filter(Boolean).join(' ')}
      data-wire-link-id={link.id}
      aria-label={warn ? 'Wire link, opposing flow' : 'Wire link'}
    >
      {paths}
      <WireChevronPath
        points={displayPoints}
        resolvedDirection={linkDirection}
        directionConflict={linkDirectionConflict}
        compact
      />
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
  resolvedByWireId: Map<string, ResolvedWire>;
  selectedLinkIds: Set<string>;
  interactive: boolean;
  onSelectLink?: (linkId: string) => void;
};

export function WireLinkLayer({
  diagram,
  resolvedByWireId,
  selectedLinkIds,
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
            resolvedByWireId={resolvedByWireId}
            selected={selectedLinkIds.has(link.id)}
            interactive={interactive}
            onSelect={() => onSelectLink?.(link.id)}
          />
        );
      })}
    </g>
  );
}
