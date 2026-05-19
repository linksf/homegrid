import type { JSX } from 'react';

type PathNudgePadProps = {
  onNudge: (dx: number, dy: number) => void;
  hint?: string;
};

export function PathNudgePad({ onNudge, hint }: PathNudgePadProps): JSX.Element {
  return (
    <div className="path-nudge">
      {hint && <p className="inspector__hint">{hint}</p>}
      <span className="inspector__label">Position</span>
      <div className="path-nudge__grid" role="group" aria-label="Nudge path">
        <span />
        <button type="button" className="btn btn--small path-nudge__btn" onClick={() => onNudge(0, -12)} aria-label="Move up">
          ↑
        </button>
        <span />
        <button type="button" className="btn btn--small path-nudge__btn" onClick={() => onNudge(-12, 0)} aria-label="Move left">
          ←
        </button>
        <span className="path-nudge__center" aria-hidden>
          ·
        </span>
        <button type="button" className="btn btn--small path-nudge__btn" onClick={() => onNudge(12, 0)} aria-label="Move right">
          →
        </button>
        <span />
        <button type="button" className="btn btn--small path-nudge__btn" onClick={() => onNudge(0, 12)} aria-label="Move down">
          ↓
        </button>
        <span />
      </div>
    </div>
  );
}
