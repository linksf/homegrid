import type { JSX } from 'react';
import { GRID_SIZE } from '../domain/grid';

type DiagramGridProps = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

/** Subtle alignment grid in world coordinates. */
export function DiagramGrid({ minX, minY, width, height }: DiagramGridProps): JSX.Element {
  const maxX = minX + width;
  const maxY = minY + height;
  const lines: JSX.Element[] = [];

  const startX = Math.floor(minX / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(minY / GRID_SIZE) * GRID_SIZE;

  for (let x = startX; x <= maxX; x += GRID_SIZE) {
    lines.push(
      <line
        key={`v-${x}`}
        className="diagram-grid__line diagram-grid__line--major"
        x1={x}
        y1={minY}
        x2={x}
        y2={maxY}
      />,
    );
  }

  for (let y = startY; y <= maxY; y += GRID_SIZE) {
    lines.push(
      <line
        key={`h-${y}`}
        className="diagram-grid__line diagram-grid__line--major"
        x1={minX}
        y1={y}
        x2={maxX}
        y2={y}
      />,
    );
  }

  return (
    <g className="diagram-grid" aria-hidden="true" pointerEvents="none">
      {lines}
    </g>
  );
}
