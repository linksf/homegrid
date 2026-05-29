import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

type DeviceNodeMarkerProps = {
  /** Position in the parent device group's local coordinates. */
  x: number;
  y: number;
  hasConduit: boolean;
  selected: boolean;
  connectPending: boolean;
  /** Switch simulation: terminal is part of a closed internal path. */
  active?: boolean;
  interactive: boolean;
  onSelect?: () => void;
  onPointerDown?: () => void;
};

export function DeviceNodeMarker({
  x,
  y,
  hasConduit,
  selected,
  connectPending,
  active = false,
  interactive,
  onSelect,
  onPointerDown,
}: DeviceNodeMarkerProps): JSX.Element {
  const className = [
    'device-node',
    selected ? 'device-node--selected' : '',
    connectPending ? 'device-node--pending' : '',
    hasConduit ? 'device-node--conduit' : '',
    active ? 'device-node--active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  function handleDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    onPointerDown?.();
  }

  return (
    <g className={className} transform={`translate(${x}, ${y})`}>
      <circle className="device-node__ring" r={9} />
      <circle className="device-node__core" r={4.5} />
      {interactive && (
        <circle
          className="device-node-hit"
          r={14}
          fill="transparent"
          onPointerDown={handleDown}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
        />
      )}
    </g>
  );
}
