import type { CSSProperties } from 'react';
import type { WireColor } from '../domain/types';

/** Keeps light neutral strokes visible on the diagram surface. */
export function wireStrokeStyle(color: WireColor): CSSProperties | undefined {
  return color === 'white' ? { filter: 'drop-shadow(0 0 1px #1a1a1a)' } : undefined;
}
