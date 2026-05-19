import type { JSX } from 'react';
import type { EditorMainTool } from './editor-tools';

type ToolbarProps = {
  tool: EditorMainTool;
  onToolChange: (next: EditorMainTool) => void;
  showLabels: boolean;
  onShowLabelsChange: (show: boolean) => void;
};

export function Toolbar({ tool, onToolChange, showLabels, onShowLabelsChange }: ToolbarProps): JSX.Element {
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
      <button
        type="button"
        className={['btn', tool === 'place-light-bulb' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'place-light-bulb'}
        onClick={() => onToolChange('place-light-bulb')}
      >
        Light
      </button>
      <button
        type="button"
        className={['btn', tool === 'place-switch' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'place-switch'}
        onClick={() => onToolChange('place-switch')}
      >
        Switch
      </button>
      <button
        type="button"
        className={['btn', tool === 'conduit-local' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'conduit-local'}
        onClick={() => onToolChange('conduit-local')}
      >
        Local conduit
      </button>
      <button
        type="button"
        className={['btn', tool === 'conduit-span' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'conduit-span'}
        onClick={() => onToolChange('conduit-span')}
      >
        Span conduit
      </button>
      <button
        type="button"
        className={['btn', tool === 'conduit-breaker' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'conduit-breaker'}
        onClick={() => onToolChange('conduit-breaker')}
      >
        Breaker
      </button>
      <button
        type="button"
        className={['btn', tool === 'connect-wires' ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={tool === 'connect-wires'}
        onClick={() => onToolChange('connect-wires')}
      >
        Link wires
      </button>
      <button
        type="button"
        className={['btn', showLabels ? 'btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={showLabels}
        onClick={() => onShowLabelsChange(!showLabels)}
      >
        Labels
      </button>
    </div>
  );
}
