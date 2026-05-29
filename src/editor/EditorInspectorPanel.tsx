import type { JSX, ReactNode } from 'react';

type EditorInspectorPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

/** Collapsible info / inspector column (bottom sheet on mobile, side panel on desktop). */
export function EditorInspectorPanel({
  open,
  onOpenChange,
  children,
}: EditorInspectorPanelProps): JSX.Element {
  return (
    <aside
      className={['editor-panel', open ? 'editor-panel--open' : 'editor-panel--collapsed']
        .filter(Boolean)
        .join(' ')}
      aria-label="Diagram info and inspector"
    >
      <button
        type="button"
        className="editor-panel__toggle"
        aria-expanded={open}
        aria-controls="editor-panel-content"
        onClick={() => onOpenChange(!open)}
      >
        <span className="editor-panel__toggle-icon" aria-hidden />
        <span className="editor-panel__toggle-label">{open ? 'Hide panel' : 'Info & tools'}</span>
      </button>

      <div id="editor-panel-content" className="editor-panel__content" hidden={!open}>
        {children}
      </div>
    </aside>
  );
}
