import type { JSX } from 'react';
import type { Diagram } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import type { ContextMenuTarget } from '../editor/context-menu-target';
import { useEntityContextMenuGesture } from '../editor/use-context-menu-gesture';
import { DESKTOP_LONG_PRESS_MS, TOUCH_LONG_PRESS_MS, useTouchNavigationProfile } from '../canvas/touch-profile';
import { wireWorldPolyline } from '../domain/wire-geometry';
import { HIT_STROKE_SCREEN_PX } from './hit-targets';

type WireHitLayerProps = {
  diagram: Diagram;
  tool: EditorMainTool;
  connectInteractionActive?: boolean;
  onWirePointerDown?: (wireId: string) => void;
  onEntityContextMenu?: (target: ContextMenuTarget, clientX: number, clientY: number) => void;
  onSurfaceLongPress?: (clientX: number, clientY: number) => void;
};

function polylineToPath(pts: { x: number; y: number }[]): string {
  return pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

/** Wire hit targets above wire links so linked stubs stay selectable. */
export function WireHitLayer({
  diagram,
  tool,
  connectInteractionActive = false,
  onWirePointerDown,
  onEntityContextMenu,
  onSurfaceLongPress,
}: WireHitLayerProps): JSX.Element {
  const interactive = tool === 'select' && Boolean(onWirePointerDown) && !connectInteractionActive;
  const touchNavigation = useTouchNavigationProfile();
  const { bind: bindContextMenu } = useEntityContextMenuGesture(onEntityContextMenu ?? (() => {}), {
    longPressMs: touchNavigation ? TOUCH_LONG_PRESS_MS : DESKTOP_LONG_PRESS_MS,
    onLongPressAt: onSurfaceLongPress,
  });

  return (
    <g className="wire-hit-layer" role="presentation" aria-label="Wire selection">
      {interactive &&
        diagram.conduits.flatMap((conduit) =>
          conduit.wireIds.map((wireId) => {
            const pts = wireWorldPolyline(diagram, wireId);
            if (!pts || pts.length < 2) return null;
            const wireMenu = onEntityContextMenu ? bindContextMenu({ kind: 'wire', wireId }) : null;
            return (
              <path
                key={wireId}
                className="wire-hit diagram-hit-stroke"
                data-wire-id={wireId}
                d={polylineToPath(pts)}
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_STROKE_SCREEN_PX}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="stroke"
                {...(wireMenu ?? {})}
                onContextMenu={wireMenu?.onContextMenu}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  wireMenu?.onPointerDown?.(e);
                  onWirePointerDown?.(wireId);
                }}
                onPointerMove={wireMenu?.onPointerMove}
                onPointerUp={wireMenu?.onPointerUp}
                onPointerCancel={wireMenu?.onPointerCancel}
              />
            );
          }),
        )}
    </g>
  );
}
