import type { JSX } from 'react';
import type { Diagram, ResolvedWire, WireColor } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { WireChevronPath } from './WireChevronPath';
import { wireWorldPolyline } from '../domain/wire-geometry';

const WIRE_CLASS: Record<WireColor, string> = {
  red: 'wire-stroke wire-stroke--red',
  white: 'wire-stroke wire-stroke--white',
  black: 'wire-stroke wire-stroke--black',
};

type ConduitBundleProps = {
  diagram: Diagram;
  conduit: Diagram['conduits'][number];
  resolvedByWireId: Map<string, ResolvedWire>;
  tool: EditorMainTool;
  selectedWireId: string | null;
  connectPendingWireId: string | null;
  onWirePointerDown?: (wireId: string) => void;
};

function polylineToPath(pts: { x: number; y: number }[]): string {
  return pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

export function ConduitBundle({
  diagram,
  conduit,
  resolvedByWireId,
  tool,
  selectedWireId,
  connectPendingWireId,
  onWirePointerDown,
}: ConduitBundleProps): JSX.Element | null {
  const wires = conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (wires.length === 0) return null;

  const wireInteractive = (tool === 'select' || tool === 'connect-wires') && Boolean(onWirePointerDown);

  return (
    <g className="conduit-bundle" data-conduit-id={conduit.id}>
      {wires.map((wire) => {
        const pts = wireWorldPolyline(diagram, wire.id);
        if (!pts || pts.length < 2) return null;
        const rw = resolvedByWireId.get(wire.id);
        const strokeClass = [
          WIRE_CLASS[wire.color],
          tool === 'select' && selectedWireId === wire.id ? 'wire-stroke--selected' : '',
          tool === 'connect-wires' && connectPendingWireId === wire.id ? 'wire-stroke--pending-link' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <g key={wire.id} data-wire-id={wire.id}>
            <path
              className={strokeClass}
              d={polylineToPath(pts)}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <WireChevronPath
              points={pts}
              resolvedDirection={rw?.resolvedDirection ?? null}
              directionConflict={rw?.directionConflict ?? false}
            />
            {wireInteractive && (
              <path
                className="wire-hit"
                d={polylineToPath(pts)}
                fill="none"
                stroke="transparent"
                strokeWidth={22}
                strokeLinecap="round"
                strokeLinejoin="round"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onWirePointerDown?.(wire.id);
                }}
              />
            )}
          </g>
        );
      })}
      <title>{conduit.label}</title>
    </g>
  );
}

type ConduitLayerProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  tool: EditorMainTool;
  selectedWireId: string | null;
  connectPendingWireId: string | null;
  onWirePointerDown?: (wireId: string) => void;
};

export function ConduitLayer({
  diagram,
  resolvedByWireId,
  tool,
  selectedWireId,
  connectPendingWireId,
  onWirePointerDown,
}: ConduitLayerProps): JSX.Element {
  return (
    <g className="conduit-layer" role="presentation" aria-label="Conduits">
      {diagram.conduits.map((c) => (
        <ConduitBundle
          key={c.id}
          conduit={c}
          diagram={diagram}
          resolvedByWireId={resolvedByWireId}
          tool={tool}
          selectedWireId={selectedWireId}
          connectPendingWireId={connectPendingWireId}
          onWirePointerDown={onWirePointerDown}
        />
      ))}
    </g>
  );
}
