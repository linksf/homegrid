import type { JSX } from 'react';
import { useJobStore } from '../store/job-store';

type EditorScreenProps = {
  onBack: () => void;
};

/** Expanded in Task 10 with canvas viewport. */
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
    <div className="editor-screen">
      <header className="editor-screen__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Library
        </button>
        <h1 className="editor-screen__title">{job.name || 'Untitled job'}</h1>
      </header>
      <p className="editor-screen__placeholder">Editor loads in the next step.</p>
    </div>
  );
}
