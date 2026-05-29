import type { JSX } from 'react';
import type { Diagram } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { wireWorldPolyline } from '../domain/wire-geometry';

type WireHitLayerProps = {
  diagram: Diagram;
  tool: EditorMainTool;
  onWirePointerDown?: (wireId: string) => void;
};

function polylineToPath(pts: { x: number; y: number }[]): string {
  return pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

/** Wire hit targets above wire links so linked stubs stay selectable. */
export function WireHitLayer({ diagram, tool, onWirePointerDown }: WireHitLayerProps): JSX.Element {
  const interactive = tool === 'select' && Boolean(onWirePointerDown);

  return (
    <g className="wire-hit-layer" role="presentation" aria-label="Wire selection">
      {interactive &&
        diagram.conduits.flatMap((conduit) =>
          conduit.wireIds.map((wireId) => {
            const pts = wireWorldPolyline(diagram, wireId);
            if (!pts || pts.length < 2) return null;
            return (
              <path
                key={wireId}
                className="wire-hit"
                data-wire-id={wireId}
                d={polylineToPath(pts)}
                fill="none"
                stroke="transparent"
                strokeWidth={28}
                strokeLinecap="round"
                strokeLinejoin="round"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  onWirePointerDown?.(wireId);
                }}
              />
            );
          }),
        )}
    </g>
  );
}
