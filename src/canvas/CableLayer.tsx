import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { isBreakerCable, breakerCableClosed } from '../domain/breaker-cable';
import { cableCenterPoint } from '../domain/cable-geometry';
import { cableWallSlots } from '../domain/cable-slots';
import { junctionBoxAnchorInwardNormal } from '../domain/conduit-geometry';
import { GRID_SIZE } from '../domain/grid';
import type { Diagram, ResolvedWire, WireColor } from '../domain/types';
import { resolveExposedCableWirePath } from '../domain/exposed-wire-endpoints';
import type { EditorMainTool } from '../editor/editor-tools';
import { BreakerToggle } from './BreakerToggle';
import { WireChevronPath } from './WireChevronPath';
import { HIT_STROKE_SCREEN_PX, worldHitRadius } from './hit-targets';
import { useDiagramViewport } from './CanvasViewport';

const BREAKER_TOGGLE_INSET = 48;

const WIRE_CLASS: Record<WireColor, string> = {
  red: 'wire-stroke wire-stroke--red',
  white: 'wire-stroke wire-stroke--white',
  black: 'wire-stroke wire-stroke--black',
};

function polylineToPath(pts: { x: number; y: number }[]): string {
  return pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

const CABLE_WIRE_HIT_STROKE = HIT_STROKE_SCREEN_PX;

type CableWallFootprintHitProps = {
  slots: { x: number; y: number }[];
  interactive: boolean;
  selected: boolean;
  footprintRadius: number;
  onPointerDown?: (e: ReactPointerEvent<SVGPathElement | SVGCircleElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<SVGPathElement | SVGCircleElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<SVGPathElement | SVGCircleElement>) => void;
  onPointerCancel?: (e: ReactPointerEvent<SVGPathElement | SVGCircleElement>) => void;
  onContextMenu?: (e: React.MouseEvent<SVGPathElement | SVGCircleElement>) => void;
};

function CableWallFootprintHit({
  slots,
  interactive,
  selected,
  footprintRadius,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
}: CableWallFootprintHitProps): JSX.Element | null {
  if (slots.length === 0) return null;

  const commonClasses = ['cable-footprint', interactive ? '' : 'cable-footprint--inactive', selected ? 'cable-footprint--selected' : '']
    .filter(Boolean)
    .join(' ');

  const pe = interactive ? 'all' : 'none';

  if (slots.length === 1) {
    const c = slots[0]!;
    return (
      <circle
        className={commonClasses}
        cx={c.x}
        cy={c.y}
        r={footprintRadius}
        fill="rgb(0 0 0 / 0.001)"
        stroke="transparent"
        pointerEvents={pe}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={onContextMenu}
      />
    );
  }

  return (
    <path
      className={`${commonClasses} diagram-hit-stroke`}
      d={polylineToPath(slots)}
      fill="none"
      stroke="transparent"
      strokeWidth={HIT_STROKE_SCREEN_PX}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents={pe}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
    />
  );
}

export type CableLayerProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  selectedCableIds: Set<string>;
  selectedWireIds: Set<string>;
  tool: EditorMainTool;
  interactive: boolean;
  connectPendingWireId: string | null;
  connectInteractionActive?: boolean;
  onSelectCable?: (cableId: string) => void;
  onWirePointerDown?: (wireId: string) => void;
  onToggleBreakerCable?: (cableId: string) => void;
  bindContextMenu?: (
    target: import('../editor/context-menu-target').ContextMenuTarget,
  ) => import('../editor/use-context-menu-gesture').ContextMenuBindHandlers;
  showLabels?: boolean;
  /** When set, tint a grouped cable's exposed wires with its conduit-group color. */
  groupColorByCableId?: Map<string, string> | null;
};

/** Exposed cable wires at the junction-box wall plus wall footprint selection (conduit stub in a later layer). */
export function CableLayer({
  diagram,
  resolvedByWireId,
  selectedCableIds,
  selectedWireIds,
  tool,
  interactive,
  connectPendingWireId,
  connectInteractionActive = false,
  onSelectCable,
  onWirePointerDown,
  onToggleBreakerCable,
  bindContextMenu,
  showLabels: _showLabels,
  groupColorByCableId = null,
}: CableLayerProps): JSX.Element {
  void _showLabels;
  const vp = useDiagramViewport();
  const footprintRadius = worldHitRadius(vp.scale, GRID_SIZE * 0.75);
  const footprintInteractive = interactive && tool === 'select' && Boolean(onSelectCable);
  const wireHitsInteractive = interactive && tool === 'select' && Boolean(onWirePointerDown);

  return (
    <g className="cable-layer" role="presentation" aria-label="Cables">
      {diagram.cables.map((cable) => {
        const box = diagram.junctionBoxes.find((j) => j.id === cable.junctionBoxId);
        const n = cable.wireIds.length;
        if (!box || n < 1 || n > 3) return null;

        const wireCount = n as 1 | 2 | 3;
        const slots = cableWallSlots(box, cable.anchor, wireCount);
        const bundleSelected = selectedCableIds.has(cable.id);
        const groupColor = groupColorByCableId?.get(cable.id);
        const isBreaker = isBreakerCable(cable);
        const toggleInteractive = interactive && tool === 'select' && Boolean(onToggleBreakerCable);

        let togglePoint: { x: number; y: number } | null = null;
        if (isBreaker) {
          const center = cableCenterPoint(box, cable.anchor, wireCount);
          const inward = junctionBoxAnchorInwardNormal(box, cable.anchor);
          togglePoint = {
            x: center.x + inward.x * BREAKER_TOGGLE_INSET,
            y: center.y + inward.y * BREAKER_TOGGLE_INSET,
          };
        }

        const cableMenu = bindContextMenu ? bindContextMenu({ kind: 'cable', cableId: cable.id }) : null;

        return (
          <g key={cable.id} className={['cable-bundle', bundleSelected ? 'cable-bundle--selected' : ''].filter(Boolean).join(' ')}>
            <CableWallFootprintHit
              slots={slots}
              interactive={footprintInteractive}
              selected={bundleSelected}
              footprintRadius={footprintRadius}
              {...(cableMenu ?? {})}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                cableMenu?.onPointerDown?.(e);
                onSelectCable?.(cable.id);
              }}
              onPointerMove={cableMenu?.onPointerMove}
              onPointerUp={cableMenu?.onPointerUp}
              onPointerCancel={cableMenu?.onPointerCancel}
              onContextMenu={cableMenu?.onContextMenu}
            />

            {isBreaker && togglePoint ? (
              <BreakerToggle
                x={togglePoint.x}
                y={togglePoint.y}
                closed={breakerCableClosed(cable)}
                selected={bundleSelected}
                interactive={toggleInteractive}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onToggleBreakerCable?.(cable.id);
                }}
              />
            ) : null}

            {!isBreaker
              ? cable.wireIds.map((wireId) => {
              const wire = diagram.wires.find((w) => w.id === wireId);
              if (!wire) return null;

              const pts = resolveExposedCableWirePath(diagram, wireId);
              if (!pts || pts.length < 2) return null;

              const rw = resolvedByWireId.get(wireId);
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
                    style={groupColor ? { stroke: groupColor } : undefined}
                  />
                  <WireChevronPath
                    points={pts}
                    resolvedDirection={rw?.resolvedDirection ?? null}
                    directionConflict={rw?.directionConflict ?? false}
                  />
                  {wireHitsInteractive ? (
                    (() => {
                      const wireMenu = bindContextMenu
                        ? bindContextMenu({ kind: 'wire', wireId: wire.id })
                        : null;
                      return (
                    <path
                      className="wire-hit cable-wire-hit diagram-hit-stroke"
                      data-wire-id={wire.id}
                      d={polylineToPath(pts)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={CABLE_WIRE_HIT_STROKE}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="stroke"
                      onContextMenu={wireMenu?.onContextMenu}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        wireMenu?.onPointerDown?.(e);
                        onWirePointerDown?.(wire.id);
                      }}
                      onPointerMove={wireMenu?.onPointerMove}
                      onPointerUp={wireMenu?.onPointerUp}
                      onPointerCancel={wireMenu?.onPointerCancel}
                    />
                      );
                    })()
                  ) : null}
                </g>
              );
            })
              : null}
          </g>
        );
      })}
    </g>
  );
}
