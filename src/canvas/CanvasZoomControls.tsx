import type { JSX } from 'react';
import { useDiagramViewport } from './CanvasViewport';

function formatZoomPercent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

type CanvasZoomControlsProps = {
  /** Frame selection (or all when empty). When omitted, the Fit button is hidden. */
  onFit?: () => void;
  /** Frame the entire diagram (Shift+F). Shown as a separate touch target on coarse pointers. */
  onFitAll?: () => void;
};

/** Floating zoom controls for touch and small screens. */
export function CanvasZoomControls({ onFit, onFitAll }: CanvasZoomControlsProps = {}): JSX.Element {
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
      {onFit ? (
        <button
          type="button"
          className="canvas-zoom-controls__btn canvas-zoom-controls__btn--fit"
          aria-label="Fit to selection or content"
          title="Fit to selection or content (F)"
          onClick={onFit}
        >
          ⤢
        </button>
      ) : null}
      {onFitAll ? (
        <button
          type="button"
          className="canvas-zoom-controls__btn canvas-zoom-controls__btn--fit-all"
          aria-label="Fit entire diagram"
          title="Fit entire diagram (⇧F)"
          onClick={onFitAll}
        >
          ⤢…
        </button>
      ) : null}
    </div>
  );
}
