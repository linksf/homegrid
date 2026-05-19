import type { WireColor } from '../domain/types';

/** SVG stroke colors for wires and wire links (match CSS --wire-* tokens). */
export const WIRE_STROKE_HEX: Record<WireColor, string> = {
  red: '#c62828',
  black: '#1a1a1a',
  white: '#f5f5f5',
};
