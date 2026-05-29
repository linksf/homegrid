import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

const TOGGLE_WIDTH = 40;
const TOGGLE_HEIGHT = 24;

type BreakerToggleProps = {
  x: number;
  y: number;
  closed: boolean;
  selected: boolean;
  interactive: boolean;
  onDoubleClick?: (e: ReactPointerEvent<SVGRectElement>) => void;
};

/** Panel-side ON/OFF control for a breaker-type cable. */
export function BreakerToggle({
  x,
  y,
  closed,
  selected,
  interactive,
  onDoubleClick,
}: BreakerToggleProps): JSX.Element {
  const halfW = TOGGLE_WIDTH / 2;
  const halfH = TOGGLE_HEIGHT / 2;

  return (
    <g
      className={[
        'breaker-toggle',
        closed ? 'breaker-toggle--closed' : 'breaker-toggle--open',
        selected ? 'breaker-toggle--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      transform={`translate(${x - halfW}, ${y - halfH})`}
    >
      <rect
        className="breaker-toggle__body"
        width={TOGGLE_WIDTH}
        height={TOGGLE_HEIGHT}
        rx={5}
        ry={5}
        pointerEvents={interactive ? 'all' : 'none'}
        onDoubleClick={interactive ? onDoubleClick : undefined}
      />
      <text className="breaker-toggle__state" x={halfW} y={halfH + 4} textAnchor="middle">
        {closed ? 'ON' : 'OFF'}
      </text>
    </g>
  );
}
