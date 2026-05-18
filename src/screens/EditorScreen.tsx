import type { JSX } from 'react';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { DiagramSvg } from '../canvas/DiagramSvg';
import { useJobStore } from '../store/job-store';

type EditorScreenProps = {
  onBack: () => void;
};

export function EditorScreen({ onBack }: EditorScreenProps): JSX.Element {
  const job = useJobStore((s) => s.activeJob);

  if (!job) {
    return (
      <div className="editor-screen">
        <p>No job open.</p>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="editor-screen editor-screen--deck">
      <header className="editor-screen__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Library
        </button>
        <h2 className="editor-screen__title">{job.name || 'Untitled job'}</h2>
      </header>

      <div className="editor-screen__viewport">
        <CanvasViewport viewBox="-800 -600 5200 4000">
          <DiagramSvg diagram={job.diagram} />
        </CanvasViewport>
      </div>

      <footer className="editor-screen__helper">Scroll to zoom, drag canvas to pan.</footer>
    </div>
  );
}
