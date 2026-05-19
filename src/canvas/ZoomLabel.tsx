import type { JSX, ReactNode } from 'react';
import { useDiagramViewport } from './CanvasViewport';
import { useLabelScreenPx } from './LabelSizeContext';

type ZoomLabelProps = {
  x: number;
  y: number;
  /** Screen-pixel offset above the anchor (applied after inverse zoom). */
  offsetScreenY?: number;
  className?: string;
  textAnchor?: 'start' | 'middle' | 'end';
  dominantBaseline?: 'auto' | 'middle' | 'hanging' | 'alphabetic';
  children: ReactNode;
};

/** Text label counter-scaled so it remains readable at any canvas zoom level. */
export function ZoomLabel({
  x,
  y,
  offsetScreenY = 0,
  className,
  textAnchor = 'middle',
  dominantBaseline = 'middle',
  children,
}: ZoomLabelProps): JSX.Element {
  const { scale } = useDiagramViewport();
  const labelScreenPx = useLabelScreenPx();
  const inv = 1 / Math.max(scale, 0.05);

  return (
    <g transform={`translate(${x} ${y}) scale(${inv})`} pointerEvents="none">
      <text
        className={className}
        x={0}
        y={-offsetScreenY}
        textAnchor={textAnchor}
        dominantBaseline={dominantBaseline}
        pointerEvents="none"
        style={{ fontSize: labelScreenPx }}
      >
        {children}
      </text>
    </g>
  );
}
