import type { JSX } from 'react';
import type { WireDirection } from '../domain/types';
import { polylineLength } from './wire-path-utils';

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

const CHEVRON_EVERY = 38;
const CHEVRON_SIZE = 7;

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
};

/** Flow markers along a wire stroke; reversed for `toward` vs `away`. */
export function WireChevronPath({ points, resolvedDirection, directionConflict }: WireChevronPathProps): JSX.Element | null {
  if (resolvedDirection == null || points.length < 2) {
    return null;
  }

  const total = polylineLength(points);
  if (total < CHEVRON_EVERY * 0.75) {
    return null;
  }

  const flip = resolvedDirection === 'toward';
  const polys: string[] = [];
  let d = CHEVRON_EVERY * 0.5;
  while (d < total - CHEVRON_EVERY * 0.35) {
    const p = pointAtLength(points, d);
    if (p) {
      polys.push(chevronPolygon(p.x, p.y, p.tx, p.ty, flip));
    }
    d += CHEVRON_EVERY;
  }

  if (polys.length === 0) {
    return null;
  }

  const groupClass = ['wire-chevron-group', directionConflict ? 'wire-chevron-group--conflict' : '']
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
