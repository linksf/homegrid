import type { JSX } from 'react';
import { useState } from 'react';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { DiagramSvg } from '../canvas/DiagramSvg';
import { useJobStore } from '../store/job-store';
import type { EditorMainTool } from '../editor/editor-tools';
import { Toolbar } from '../editor/Toolbar';

const WORLD_BOUNDS = {
  minX: -800,
  minY: -600,
  width: 5200,
  height: 4000,
} as const;

type EditorScreenProps = {
  onBack: () => void;
};

export function EditorScreen({ onBack }: EditorScreenProps): JSX.Element {
  const job = useJobStore((s) => s.activeJob);
  const updateDiagram = useJobStore((s) => s.updateDiagram);

  const [tool, setTool] = useState<EditorMainTool>('select');
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

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

      <Toolbar tool={tool} onToolChange={setTool} />

      <div className="editor-screen__viewport">
        <CanvasViewport viewBox="-800 -600 5200 4000">
          <DiagramSvg
            diagram={job.diagram}
            tool={tool}
            selectedBoxId={selectedBoxId}
            onSelectBox={(id) => setSelectedBoxId(id)}
            onApplyDiagram={(mutator) => updateDiagram(mutator)}
            onPlacedJunction={() => setTool('select')}
            worldRect={WORLD_BOUNDS}
          />
        </CanvasViewport>
      </div>

      <footer className="editor-screen__helper">
        {tool === 'place-junction'
          ? 'Tap the canvas to drop a new junction box. Wheel zoom still works; switch tool to drag the sheet.'
          : 'Scroll to zoom, drag empty canvas to pan.'}
      </footer>
    </div>
  );
}
