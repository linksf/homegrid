import type { JSX } from 'react';
import type { Wire, WireDirection } from '../domain/types';

type InspectorProps = {
  wire: Wire | null;
  onUpdateWire: (patch: Partial<Pick<Wire, 'label' | 'manualDirection'>>) => void;
};

export function Inspector({ wire, onUpdateWire }: InspectorProps): JSX.Element {
  if (!wire) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <p className="inspector__empty">Select a wire in the diagram to edit its label and direction.</p>
      </aside>
    );
  }

  const breakerLocked = wire.breakerId != null;

  return (
    <aside className="inspector" aria-label="Inspector">
      <h3 className="inspector__title">Wire</h3>
      <p className="inspector__meta">
        Color: <strong>{wire.color}</strong>
      </p>

      <label className="inspector__field">
        <span className="inspector__label">Label</span>
        <input
          className="inspector__input"
          type="text"
          value={wire.label}
          onChange={(e) => onUpdateWire({ label: e.target.value })}
          autoComplete="off"
        />
      </label>

      <label className="inspector__field">
        <span className="inspector__label">Manual direction</span>
        <select
          className="inspector__input"
          value={wire.manualDirection ?? ''}
          disabled={breakerLocked}
          onChange={(e) => {
            const v = e.target.value;
            const manualDirection: WireDirection | null =
              v === '' ? null : v === 'toward' || v === 'away' ? v : null;
            onUpdateWire({ manualDirection });
          }}
        >
          <option value="">Follow propagation / breaker</option>
          <option value="toward">Toward</option>
          <option value="away">Away</option>
        </select>
      </label>
      {breakerLocked && (
        <p className="inspector__hint">Breaker panel conductors keep the seeded direction; manual override is disabled.</p>
      )}
    </aside>
  );
}
