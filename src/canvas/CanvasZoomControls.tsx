import type { JSX } from 'react';
import { useDiagramViewport } from './CanvasViewport';

function formatZoomPercent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

/** Floating zoom controls for touch and small screens. */
export function CanvasZoomControls(): JSX.Element {
  const { scale, zoomIn, zoomOut, resetView } = useDiagramViewport();

  return (
    <div className="canvas-zoom-controls" role="group" aria-label="Canvas zoom">
      <button type="button" className="canvas-zoom-controls__btn" aria-label="Zoom out" onClick={zoomOut}>
        −
      </button>
      <button
        type="button"
        className="canvas-zoom-controls__btn canvas-zoom-controls__btn--label"
        aria-label="Reset zoom to 100%"
        onClick={resetView}
      >
        {formatZoomPercent(scale)}
      </button>
      <button type="button" className="canvas-zoom-controls__btn" aria-label="Zoom in" onClick={zoomIn}>
        +
      </button>
    </div>
  );
}
