import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { conduitStubResolvedPath } from '../domain/cable-geometry';
import type { Diagram } from '../domain/types';
import { bundlePathStrokeStyle } from './wire-render-style';
import { HIT_STROKE_SCREEN_PX } from './hit-targets';

function pathD(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}


export type ConduitRunLayerProps = {
  diagram: Diagram;
  selectedConduitRunIds: Set<string>;
  selectedCableIds: Set<string>;
  interactive: boolean;
  /** Hide all conduit runs + cable stubs, as if buried in the walls. */
  hideConduits?: boolean;
  /** Conduit connect tool active — keep stubs visible/pickable even when hidden. */
  conduitConnectActive?: boolean;
  /** When set, tint each run's sheath with its group color. */
  groupColorByRunId?: Map<string, string> | null;
  /** When set, tint each cable stub's sheath with its group color. */
  groupColorByCableId?: Map<string, string> | null;
  showEnergyFlow?: boolean;
  energyHueByWireId?: Map<string, number>;
  onSelectConduitRun?: (id: string) => void;
  /** Select tool — choose a cable bundle from its stub hit target */
  onSelectCableConduit?: (cableId: string) => void;
  conduitConnectInteractive?: boolean;
  /** Highlight valid stub targets while using conduit connect tool */
  conduitConnectHighlightCableIds?: Set<string> | null;
  /** When conduit connect pending: dim stubs outside `conduitConnectHighlightCableIds` */
  conduitConnectDimNonTargets?: boolean;
  conduitConnectPendingCableId?: string | null;
  onConduitConnectStubPick?: (cableId: string) => void;
};

export function ConduitRunLayer({
  diagram,
  selectedConduitRunIds,
  selectedCableIds,
  interactive,
  hideConduits = false,
  conduitConnectActive = false,
  groupColorByRunId = null,
  groupColorByCableId = null,
  showEnergyFlow = false,
  energyHueByWireId,
  onSelectConduitRun,
  onSelectCableConduit,
  conduitConnectInteractive = false,
  conduitConnectHighlightCableIds = null,
  conduitConnectDimNonTargets = false,
  conduitConnectPendingCableId = null,
  onConduitConnectStubPick,
}: ConduitRunLayerProps): JSX.Element {
  const runInteractive = interactive && Boolean(onSelectConduitRun);

  const stubSelectMode = interactive && Boolean(onSelectCableConduit);
  const stubConnectMode = conduitConnectInteractive && Boolean(onConduitConnectStubPick);
  const stubHitActive = stubSelectMode || stubConnectMode;

  return (
    <g className="conduit-run-layer" role="presentation" aria-label="Conduit runs">
      {!hideConduits && diagram.conduitRuns.map((run) => {
        const pts = diagram.layout.conduitRunPaths?.[run.id]?.points ?? [];
        if (pts.length < 2) return null;
        const d = pathD(pts);
        const selected = selectedConduitRunIds.has(run.id);
        const runColor = groupColorByRunId?.get(run.id);
        const runEnergyStyle = bundlePathStrokeStyle({
          showEnergyFlow,
          wireIds: run.wireIds,
          energyHueByWireId: energyHueByWireId ?? new Map(),
          groupColor: runColor,
        });

        return (
          <g
            key={run.id}
            className={['conduit-run', selected ? 'conduit-run--selected' : ''].filter(Boolean).join(' ')}
            data-conduit-run-id={run.id}
          >
            <path className="conduit-run__sheath-outline" d={d} fill="none" />
            <path
              className="conduit-run__sheath"
              d={d}
              fill="none"
              style={runEnergyStyle}
            />
            {runInteractive && (
              <path
                className="conduit-run-hit diagram-hit-stroke"
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_STROKE_SCREEN_PX}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
                onPointerDown={(e: ReactPointerEvent<SVGPathElement>) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onSelectConduitRun?.(run.id);
                }}
              />
            )}
          </g>
        );
      })}

      {!(hideConduits && !conduitConnectActive) && diagram.cables.map((cable) => {
        const box = diagram.junctionBoxes.find((j) => j.id === cable.junctionBoxId);
        const n = cable.wireIds.length;
        if (!box || n < 1 || n > 3) return null;

        const pts = conduitStubResolvedPath(diagram, cable.id);
        if (!pts || pts.length < 2) return null;

        const stubColor = groupColorByCableId?.get(cable.id);
        const stubEnergyStyle = bundlePathStrokeStyle({
          showEnergyFlow,
          wireIds: cable.wireIds,
          energyHueByWireId: energyHueByWireId ?? new Map(),
          groupColor: stubColor,
        });

        const d = pathD(pts);
        const selectedStub = selectedCableIds.has(cable.id);
        const inHighlight =
          conduitConnectHighlightCableIds == null ||
          conduitConnectHighlightCableIds.size === 0 ||
          conduitConnectHighlightCableIds.has(cable.id);

        const dimStub =
          stubConnectMode && conduitConnectDimNonTargets && !inHighlight ? ' conduit-run--stub-dimmed' : '';

        const pendingSource =
          stubConnectMode && conduitConnectPendingCableId === cable.id ? ' conduit-run--stub-connect-pending-source' : '';
        const compatGlow =
          stubConnectMode &&
          conduitConnectPendingCableId != null &&
          cable.id !== conduitConnectPendingCableId &&
          (conduitConnectHighlightCableIds?.has(cable.id) ?? false)
            ? ' conduit-run--stub-connect-compat'
            : '';
        const firstPickGlow =
          stubConnectMode && conduitConnectPendingCableId == null && inHighlight
            ? ' conduit-run--stub-connect-first-target'
            : '';

        return (
          <g
            key={`stub-${cable.id}`}
            className={[
              'conduit-run conduit-run--stub',
              stubConnectMode ? 'conduit-run--stub-hit' : '',
              selectedStub ? 'conduit-run--selected' : '',
              dimStub,
              pendingSource,
              compatGlow,
              firstPickGlow,
            ]
              .filter(Boolean)
              .join(' ')}
            data-cable-id={cable.id}
          >
            <path className="conduit-run__sheath-outline" d={d} fill="none" />
            <path
              className="conduit-run__sheath"
              d={d}
              fill="none"
              style={stubEnergyStyle}
            />
            {stubHitActive && (
              <path
                className="conduit-run-hit conduit-run-hit--stub diagram-hit-stroke"
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_STROKE_SCREEN_PX}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
                onPointerDown={(e: ReactPointerEvent<SVGPathElement>) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  if (stubConnectMode) onConduitConnectStubPick?.(cable.id);
                  else onSelectCableConduit?.(cable.id);
                }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
