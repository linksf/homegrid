import type { JSX } from 'react';
import { MAX_LABEL_SCREEN_PX, MIN_LABEL_SCREEN_PX } from '../canvas/LabelSizeContext';

type EditorLabelSettingsProps = {
  showLabels: boolean;
  onShowLabelsChange: (show: boolean) => void;
  labelSizePx: number;
  onLabelSizeChange: (px: number) => void;
};

export function EditorLabelSettings({
  showLabels,
  onShowLabelsChange,
  labelSizePx,
  onLabelSizeChange,
}: EditorLabelSettingsProps): JSX.Element {
  return (
    <section className="editor-label-settings" aria-label="Label display settings">
      <h3 className="editor-label-settings__title">Labels</h3>

      <label className="inspector__field inspector__field--row">
        <span className="inspector__label">Show on diagram</span>
        <input
          type="checkbox"
          checked={showLabels}
          onChange={(e) => onShowLabelsChange(e.target.checked)}
        />
      </label>

      <label className="inspector__field">
        <span className="inspector__label">
          Size <span className="editor-label-settings__value">{labelSizePx}px</span>
        </span>
        <input
          className="editor-label-settings__slider"
          type="range"
          min={MIN_LABEL_SCREEN_PX}
          max={MAX_LABEL_SCREEN_PX}
          step={2}
          value={labelSizePx}
          onChange={(e) => onLabelSizeChange(Number(e.target.value))}
        />
      </label>
    </section>
  );
}
