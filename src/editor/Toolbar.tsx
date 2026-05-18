import type { JSX } from 'react';
import type { EditorMainTool } from './editor-tools';

type ToolbarProps = {
  tool: EditorMainTool;
  onToolChange: (next: EditorMainTool) => void;
};

export function Toolbar({ tool, onToolChange }: ToolbarProps): JSX.Element {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor tools">
      <button
        type="button"
        className={['btn', tool === 'select' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'select'}
        onClick={() => onToolChange('select')}
      >
        Select
      </button>
      <button
        type="button"
        className={['btn', tool === 'place-junction' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'place-junction'}
        onClick={() => onToolChange('place-junction')}
      >
        Add box
      </button>
    </div>
  );
}
