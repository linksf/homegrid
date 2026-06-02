import type { JSX, ReactNode, SVGProps } from 'react';
import type { SwitchPlacementKind } from './placement-options';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

function TerminalDot({ cx, cy }: { cx: number; cy: number }): JSX.Element {
  return <circle cx={cx} cy={cy} r={1.2} fill="currentColor" />;
}

/** Editor chrome — not in wiring icon set. */
export function IconUndo(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h10a5 5 0 0 1 0 10h-1" />
    </IconBase>
  );
}

export function IconRedo(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="m15 7 5 5-5 5" />
      <path d="M20 12H10a5 5 0 0 0 0 10h1" />
    </IconBase>
  );
}

export function IconSelect(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M5 3l12 7-5 .5L10 18z" />
    </IconBase>
  );
}

export function IconPan(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M8 8l8 8M16 8l-8 8" />
    </IconBase>
  );
}

export function IconLabels(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M4 7h16M4 12h10M4 17h14" />
    </IconBase>
  );
}

/** Hide conduits in walls — dashed conduit with a slash. */
export function IconConduitHidden(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M3 9h18M3 15h18" strokeDasharray="3 3" />
      <path d="M4 20 L20 4" />
    </IconBase>
  );
}

/** Color-differentiate conduit groups — three offset colored strokes. */
export function IconConduitColor(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M3 7h18" stroke="#2563eb" />
      <path d="M3 12h18" stroke="#16a34a" />
      <path d="M3 17h18" stroke="#ea580c" />
    </IconBase>
  );
}

/** Junction box — wiring diagram icon set. */
export function IconBox(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
      <circle cx="15" cy="9" r="1" fill="currentColor" />
      <circle cx="9" cy="15" r="1" fill="currentColor" />
      <circle cx="15" cy="15" r="1" fill="currentColor" />
      <path d="M9 9 L15 15" />
      <path d="M15 9 L9 15" />
    </IconBase>
  );
}

/** Room outline — dashed rectangle. */
export function IconRoom(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="3 2" />
      <path d="M8 12h8" strokeWidth={1.2} />
    </IconBase>
  );
}

/** Light fixture — circle with X (NEC style). */
export function IconLight(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="7" />
      <path d="M7 7 L17 17" />
      <path d="M17 7 L7 17" />
    </IconBase>
  );
}

export function IconSwitchSinglePole(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 15 L15 9" />
      <TerminalDot cx={9} cy={15} />
      <TerminalDot cx={15} cy={9} />
    </IconBase>
  );
}

export function IconSwitchThreeWay(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8 L14 12" />
      <TerminalDot cx={8} cy={8} />
      <circle cx="8" cy="16" r="1.2" fill="currentColor" />
      <circle cx="16" cy="12" r="1.2" fill="currentColor" />
    </IconBase>
  );
}

export function IconSwitchFourWay(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9 L16 13" />
      <path d="M8 13 L16 9" />
      <circle cx="8" cy="9" r="1.2" fill="currentColor" />
      <circle cx="8" cy="13" r="1.2" fill="currentColor" />
      <circle cx="16" cy="9" r="1.2" fill="currentColor" />
      <circle cx="16" cy="13" r="1.2" fill="currentColor" />
    </IconBase>
  );
}

export function IconSwitchDimmer(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 15 L15 9" />
      <TerminalDot cx={9} cy={15} />
      <TerminalDot cx={15} cy={9} />
      <path d="M6 18 L18 18" />
      <path d="M16.5 16.5 L18 18 L16.5 19.5" />
    </IconBase>
  );
}

type IconSwitchProps = IconProps & {
  kind?: SwitchPlacementKind;
};

export function IconSwitch({ kind = 'single-pole', ...props }: IconSwitchProps): JSX.Element {
  switch (kind) {
    case 'three-way':
      return <IconSwitchThreeWay {...props} />;
    case 'four-way':
      return <IconSwitchFourWay {...props} />;
    case 'dimmer':
      return <IconSwitchDimmer {...props} />;
    default:
      return <IconSwitchSinglePole {...props} />;
  }
}

/** General duplex outlet. */
export function IconOutletStandard(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <circle cx="12" cy="9" r="1.4" />
      <circle cx="12" cy="15" r="1.4" />
      <rect x="10.5" y="8.5" width="0.5" height="1" fill="currentColor" stroke="none" />
      <rect x="13" y="8.5" width="0.5" height="1" fill="currentColor" stroke="none" />
      <rect x="10.5" y="14.5" width="0.5" height="1" fill="currentColor" stroke="none" />
      <rect x="13" y="14.5" width="0.5" height="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconOutletPassthrough(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M2 12 L5 12" />
      <path d="M19 12 L22 12" />
      <path d="M20.5 10.5 L22 12 L20.5 13.5" />
    </IconBase>
  );
}

type IconOutletProps = IconProps & {
  passthrough?: boolean;
};

export function IconOutlet({ passthrough = false, ...props }: IconOutletProps): JSX.Element {
  return passthrough ? <IconOutletPassthrough {...props} /> : <IconOutletStandard {...props} />;
}

/** Cable tool — conductors from a junction-wall footprint. */
export function IconCable(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="2" y="9" width="4" height="6" rx="0.5" />
      <rect x="18" y="9" width="4" height="6" rx="0.5" />
      <path d="M6 10.5 L18 10.5" strokeWidth={1.2} />
      <path d="M6 12 L18 12" strokeWidth={1.2} />
      <path d="M6 13.5 L18 13.5" strokeWidth={1.2} />
      <path d="M10 8 Q12 7 14 8" strokeWidth={1.2} />
      <path d="M10 16 Q12 17 14 16" strokeWidth={1.2} />
    </IconBase>
  );
}

/** Conduit connect — sheathed paths between stubs / boxes. */
export function IconConduitConnect(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M3 7 L21 7" />
      <path d="M3 17 L21 17" />
      <path d="M5 10 L19 10" strokeWidth={1.2} />
      <path d="M5 12 L19 12" strokeWidth={1.2} />
      <path d="M5 14 L19 14" strokeWidth={1.2} />
    </IconBase>
  );
}

export function IconBreaker(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <path d="M9 8 L15 8" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" />
      <path d="M9 16 L15 16" />
    </IconBase>
  );
}

/** Wire-to-wire splice. */
export function IconLink(props: IconProps): JSX.Element {
  return (
    <IconBase {...props}>
      <path d="M3 12 L11 12" />
      <path d="M13 12 L21 12" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </IconBase>
  );
}
