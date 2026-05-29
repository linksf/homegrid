import type { JSX } from 'react';
import { marqueeModeFromDrag, normalizeMarqueeRect } from '../editor/marquee-selection';

type SelectionMarqueeProps = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
};

export function SelectionMarquee({ ax, ay, bx, by }: SelectionMarqueeProps): JSX.Element {
  const rect = normalizeMarqueeRect(ax, ay, bx, by);
  const mode = marqueeModeFromDrag(ax, bx);
  const w = rect.x2 - rect.x1;
  const h = rect.y2 - rect.y1;

  return (
    <rect
      className={[
        'selection-marquee',
        mode === 'crossing' ? 'selection-marquee--crossing' : 'selection-marquee--window',
      ].join(' ')}
      x={rect.x1}
      y={rect.y1}
      width={w}
      height={h}
      pointerEvents="none"
    />
  );
}
