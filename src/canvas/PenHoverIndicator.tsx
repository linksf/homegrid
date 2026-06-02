import type { JSX } from 'react';
import { HIT_RADIUS_SCREEN_PX } from './hit-targets';
import { useDiagramViewport } from './CanvasViewport';

type PenHoverIndicatorProps = {
  world: { x: number; y: number };
};

/** Hover ring under an Apple Pencil tip (label is shown in the canvas banner). */
export function PenHoverIndicator({ world }: PenHoverIndicatorProps): JSX.Element {
  const { scale } = useDiagramViewport();
  const ringR = HIT_RADIUS_SCREEN_PX / Math.max(scale, 0.001);

  return (
    <circle
      className="pen-hover-indicator__ring"
      cx={world.x}
      cy={world.y}
      r={ringR}
      pointerEvents="none"
      aria-hidden
    />
  );
}
