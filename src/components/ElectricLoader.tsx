import type { JSX } from 'react';

type ElectricLoaderProps = {
  /** Status text shown beneath the animation. */
  label?: string;
  /** `inline` sits in flow; `overlay` covers its positioned parent with a backdrop. */
  variant?: 'inline' | 'overlay';
};

/**
 * Electrical-themed loading indicator: current (gold chevron dashes) flows along
 * a wire into a light bulb that pulses on. Pure SVG + CSS so it scales crisply.
 */
export function ElectricLoader({ label = 'Loading…', variant = 'inline' }: ElectricLoaderProps): JSX.Element {
  return (
    <div
      className={['electric-loader', `electric-loader--${variant}`].join(' ')}
      role="status"
      aria-live="polite"
    >
      <svg
        className="electric-loader__svg"
        viewBox="0 0 220 120"
        width="220"
        height="120"
        aria-hidden="true"
        focusable="false"
      >
        {/* Wire the current travels along */}
        <path className="electric-loader__wire" d="M12 60 H150" />
        <path className="electric-loader__current" d="M12 60 H150" />

        {/* Light bulb that powers up as current arrives */}
        <g className="electric-loader__bulb" transform="translate(178 60)">
          <circle className="electric-loader__glow" r="30" />
          <circle className="electric-loader__glass" r="20" />
          <path className="electric-loader__filament" d="M-9 7 L-3.5 -7 L1.5 7 L7 -7" />
          <rect className="electric-loader__base" x="-9" y="17" width="18" height="11" rx="2.5" />
          <line className="electric-loader__base-line" x1="-9" y1="22" x2="9" y2="22" />
        </g>
      </svg>
      <p className="electric-loader__label">{label}</p>
    </div>
  );
}
