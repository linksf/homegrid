import type { AnchorPosition, JunctionBox } from './types';

export function anchorPoint(
  box: JunctionBox,
  anchor: AnchorPosition,
): { x: number; y: number } {
  const { x, y, width: w, height: h } = box;
  const map: Record<AnchorPosition, [number, number]> = {
    'top-left': [0, 0],
    'top-center': [0.5, 0],
    'top-right': [1, 0],
    'middle-left': [0, 0.5],
    center: [0.5, 0.5],
    'middle-right': [1, 0.5],
    'bottom-left': [0, 1],
    'bottom-center': [0.5, 1],
    'bottom-right': [1, 1],
  };
  const [fx, fy] = map[anchor];
  return { x: x + fx * w, y: y + fy * h };
}
