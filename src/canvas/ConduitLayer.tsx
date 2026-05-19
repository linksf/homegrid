import type { JSX } from 'react';
import { conduitCenterPath } from '../domain/layout-offsets';
import type { Conduit, Diagram, ResolvedWire, WireColor } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { WireChevronPath } from './WireChevronPath';
import { polylineMidpoint, wireWorldPolyline } from '../domain/wire-geometry';
import { ZoomLabel } from './ZoomLabel';

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
  showLabels: boolean;
  selectedConduitId?: string | null;
  onSelectConduit?: (conduitId: string) => void;
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
  onWirePointerDown: _onWirePointerDown,
  showLabels,
  selectedConduitId,
  onSelectConduit,
}: ConduitBundleProps): JSX.Element | null {
  const wires = conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (wires.length === 0) return null;

  const centerPath = conduitCenterPath(diagram, conduit.id);
  const conduitMid = centerPath ? polylineMidpoint(centerPath) : null;
  const conduitSelected = selectedConduitId === conduit.id;
  const conduitSelectable =
    tool === 'select' && Boolean(onSelectConduit) && centerPath && centerPath.length >= 2;

  const kindClass =
    conduit.kind === 'breaker'
      ? 'conduit-bundle--breaker'
      : conduit.kind === 'span'
        ? 'conduit-bundle--span'
        : conduit.kind === 'device'
          ? 'conduit-bundle--device'
          : 'conduit-bundle--local';

  return (
    <g
      className={['conduit-bundle', kindClass, conduitSelected ? 'conduit-bundle--selected' : '']
        .filter(Boolean)
        .join(' ')}
      data-conduit-id={conduit.id}
    >
      {conduitSelectable && (
        <path
          className="conduit-hit"
          d={polylineToPath(centerPath)}
          fill="none"
          stroke="transparent"
          strokeWidth={28}
          strokeLinecap="round"
          strokeLinejoin="round"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onSelectConduit?.(conduit.id);
          }}
        />
      )}
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
            {showLabels && (() => {
              const mid = polylineMidpoint(pts);
              if (!mid) return null;
              const trimmed = (wire.label ?? '').trim();
              if (trimmed.length === 0) return null;
              return (
                <ZoomLabel
                  key={`${wire.id}-label`}
                  x={mid.x}
                  y={mid.y}
                  className="diagram-label wire-label"
                >
                  {trimmed}
                </ZoomLabel>
              );
            })()}
          </g>
        );
      })}
      {showLabels && conduitMid && (conduit.label ?? '').trim().length > 0 && (
        <ZoomLabel
          x={conduitMid.x}
          y={conduitMid.y}
          offsetScreenY={16}
          className="diagram-label conduit-label"
        >
          {(conduit.label ?? '').trim()}
        </ZoomLabel>
      )}
      <title>{conduit.label}</title>
    </g>
  );
}

type ConduitLayerProps = {
  diagram: Diagram;
  /** When set, only render conduits of these kinds (for z-order splits). */
  kinds?: Conduit['kind'][];
  layerClassName?: string;
  resolvedByWireId: Map<string, ResolvedWire>;
  tool: EditorMainTool;
  selectedWireId: string | null;
  connectPendingWireId: string | null;
  onWirePointerDown?: (wireId: string) => void;
  showLabels: boolean;
  /** When false, wire/conduit labels are omitted (e.g. drawn in DiagramLabelsLayer). */
  renderLabels?: boolean;
  selectedConduitId?: string | null;
  onSelectConduit?: (conduitId: string) => void;
  onApplyDiagram?: (mutator: (diagram: Diagram) => Diagram) => void;
};

export function ConduitLayer({
  diagram,
  kinds,
  layerClassName,
  resolvedByWireId,
  tool,
  selectedWireId,
  connectPendingWireId,
  onWirePointerDown,
  showLabels,
  renderLabels,
  selectedConduitId,
  onSelectConduit,
  onApplyDiagram: _onApplyDiagram,
}: ConduitLayerProps): JSX.Element {
  const labelsVisible = renderLabels ?? showLabels;
  const conduits = kinds
    ? diagram.conduits.filter((c) => kinds.includes(c.kind))
    : diagram.conduits;

  return (
    <g
      className={['conduit-layer', layerClassName].filter(Boolean).join(' ')}
      role="presentation"
      aria-label="Conduits"
    >
      {conduits.map((c) => (
        <ConduitBundle
          key={c.id}
          conduit={c}
          diagram={diagram}
          resolvedByWireId={resolvedByWireId}
          tool={tool}
          selectedWireId={selectedWireId}
          connectPendingWireId={connectPendingWireId}
          onWirePointerDown={onWirePointerDown}
          showLabels={labelsVisible}
          selectedConduitId={selectedConduitId}
          onSelectConduit={onSelectConduit}
        />
      ))}
    </g>
  );
}
