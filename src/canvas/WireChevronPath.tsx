import type { JSX } from 'react';
import type { WireColor, WireDirection } from '../domain/types';
import { polylineLength } from '../domain/wire-geometry';

type Pt79 = { x: number; y: number };

function pointAtLength(points: Pt79[], target: number): { x: number; y: number; tx: number; ty: number } | null {
  if (points.length < 2 || target < 0) return null;

  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-6) continue;

    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      const tx = dx / seg;
      const ty = dy / seg;
      return { x, y, tx, ty };
    }
    acc += seg;
  }

  const a = points[points.length - 2]!;
  const b = points[points.length - 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const seg = Math.hypot(dx, dy) || 1;
  return { x: b.x, y: b.y, tx: dx / seg, ty: dy / seg };
}

const CHEVRON_EVERY = 56;
const CHEVRON_SIZE = 14;

function chevronPolygon(cx: number, cy: number, tx: number, ty: number, flip: boolean): string {
  const nx = flip ? -tx : tx;
  const ny = flip ? -ty : ty;
  const bx = cx - nx * CHEVRON_SIZE * 0.55;
  const by = cy - ny * CHEVRON_SIZE * 0.55;
  const px = -ny;
  const py = nx;
  const halfW = CHEVRON_SIZE * 0.4;
  const wing1x = bx + px * halfW;
  const wing1y = by + py * halfW;
  const wing2x = bx - px * halfW;
  const wing2y = by - py * halfW;
  const tipx = cx + nx * CHEVRON_SIZE * 0.45;
  const tipy = cy + ny * CHEVRON_SIZE * 0.45;
  return `${tipx},${tipy} ${wing1x},${wing1y} ${wing2x},${wing2y}`;
}

export type WireChevronPathProps = {
  points: Pt79[];
  resolvedDirection: WireDirection | null;
  directionConflict: boolean;
  /** Tighter spacing for short wire-to-wire links. */
  compact?: boolean;
  /** Adds contrast when chevrons sit on or beside a light neutral stroke. */
  wireColor?: WireColor;
  /** Skip markers near fixed endpoints (links, hubs, device terminals). */
  trimStart?: number;
  trimEnd?: number;
};

/** Flow markers along a wire stroke; reversed for `toward` vs `away`. */
export function WireChevronPath({
  points,
  resolvedDirection,
  directionConflict,
  compact = false,
  wireColor,
  trimStart = 0,
  trimEnd = 0,
}: WireChevronPathProps): JSX.Element | null {
  if (resolvedDirection == null || points.length < 2) {
    return null;
  }

  const total = polylineLength(points);
  const spacing = compact ? 28 : CHEVRON_EVERY;
  const minTotal = compact ? 12 : spacing * 0.75;
  const span = total - trimStart - trimEnd;
  if (span < minTotal) {
    return null;
  }

  const flip = resolvedDirection === 'toward';
  const polys: string[] = [];

  if (span < spacing * 0.75) {
    const p = pointAtLength(points, trimStart + span / 2);
    if (p) polys.push(chevronPolygon(p.x, p.y, p.tx, p.ty, flip));
  } else {
    let d = trimStart + spacing * 0.5;
    while (d < total - trimEnd - spacing * 0.35) {
      const p = pointAtLength(points, d);
      if (p) {
        polys.push(chevronPolygon(p.x, p.y, p.tx, p.ty, flip));
      }
      d += spacing;
    }
  }

  if (polys.length === 0) {
    return null;
  }

  const groupClass = [
    'wire-chevron-group',
    directionConflict ? 'wire-chevron-group--conflict' : '',
    wireColor === 'white' ? 'wire-chevron-group--on-white' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <g className={groupClass} aria-hidden>
      {polys.map((pts, i) => (
        <polygon key={i} className="wire-chevron" points={pts} />
      ))}
    </g>
  );
}
