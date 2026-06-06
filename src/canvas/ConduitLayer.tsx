import type { JSX } from 'react';
import { conduitCenterPath } from '../domain/layout-offsets';
import type { Conduit, Diagram, ResolvedWire, WireColor } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { wireChevronTrim } from '../domain/wire-link-utils';
import { WireChevronPath } from './WireChevronPath';
import { polylineMidpoint, wireWorldPolyline } from '../domain/wire-geometry';
import { wireStrokeStyle } from './wire-stroke-style';
import { ZoomLabel } from './ZoomLabel';
import { HIT_STROKE_SCREEN_PX } from './hit-targets';

/** Post-cable migration: `local` / `span` bundles are drawn via `CableLayer` / `ConduitRunLayer` only. */
const SKIP_CONDUIT_BUNDLE_KINDS = new Set<Conduit['kind']>(['local', 'span']);

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
  selectedWireIds: Set<string>;
  connectPendingWireId: string | null;
  connectInteractionActive?: boolean;
  onWirePointerDown?: (wireId: string) => void;
  showLabels: boolean;
  selectedConduitIds?: Set<string>;
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
  selectedWireIds,
  connectPendingWireId,
  connectInteractionActive = false,
  onWirePointerDown: _onWirePointerDown,
  showLabels,
  selectedConduitIds,
  onSelectConduit,
}: ConduitBundleProps): JSX.Element | null {
  const wires = conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (wires.length === 0) return null;

  const centerPath = conduitCenterPath(diagram, conduit.id);
  const conduitMid = centerPath ? polylineMidpoint(centerPath) : null;
  const conduitSelected = selectedConduitIds?.has(conduit.id) ?? false;
  const conduitSelectable =
    tool === 'select' && Boolean(onSelectConduit) && centerPath && centerPath.length >= 2;

  const kindClass =
    conduit.kind === 'span'
      ? 'conduit-bundle--span'
      : conduit.kind === 'device'
        ? 'conduit-bundle--device'
        : conduit.kind === 'hub'
          ? 'conduit-bundle--hub'
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
          className="conduit-hit diagram-hit-stroke"
          d={polylineToPath(centerPath)}
          fill="none"
          stroke="transparent"
          strokeWidth={HIT_STROKE_SCREEN_PX}
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
        const chevronTrim = wireChevronTrim(diagram, wire.id);
        const strokeClass = [
          WIRE_CLASS[wire.color],
          tool === 'select' && selectedWireIds.has(wire.id) ? 'wire-stroke--selected' : '',
          connectInteractionActive && connectPendingWireId === wire.id ? 'wire-stroke--pending-link' : '',
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
              style={wireStrokeStyle(wire.color)}
            />
            <WireChevronPath
              points={pts}
              resolvedDirection={rw?.resolvedDirection ?? null}
              directionConflict={rw?.directionConflict ?? false}
              wireColor={wire.color}
              trimStart={chevronTrim.trimStart}
              trimEnd={chevronTrim.trimEnd}
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
  selectedWireIds: Set<string>;
  connectPendingWireId: string | null;
  connectInteractionActive?: boolean;
  onWirePointerDown?: (wireId: string) => void;
  showLabels: boolean;
  /** When false, wire/conduit labels are omitted (e.g. drawn in DiagramLabelsLayer). */
  renderLabels?: boolean;
  selectedConduitIds?: Set<string>;
  onSelectConduit?: (conduitId: string) => void;
  onApplyDiagram?: (mutator: (diagram: Diagram) => Diagram) => void;
};

export function ConduitLayer({
  diagram,
  kinds,
  layerClassName,
  resolvedByWireId,
  tool,
  selectedWireIds,
  connectPendingWireId,
  connectInteractionActive = false,
  onWirePointerDown,
  showLabels,
  renderLabels,
  selectedConduitIds,
  onSelectConduit,
  onApplyDiagram: _onApplyDiagram,
}: ConduitLayerProps): JSX.Element {
  const labelsVisible = renderLabels ?? showLabels;
  const conduits = diagram.conduits.filter(
    (c) => !SKIP_CONDUIT_BUNDLE_KINDS.has(c.kind) && (!kinds || kinds.includes(c.kind)),
  );

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
          selectedWireIds={selectedWireIds}
          connectPendingWireId={connectPendingWireId}
          connectInteractionActive={connectInteractionActive}
          onWirePointerDown={onWirePointerDown}
          showLabels={labelsVisible}
          selectedConduitIds={selectedConduitIds}
          onSelectConduit={onSelectConduit}
        />
      ))}
    </g>
  );
}
