import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { FloorPlanSummary } from '../store/floor-plan-store';
import { useFloorPlanStore } from '../store/floor-plan-store';

export type NewJobChoice =
  | { kind: 'sandbox' }
  | { kind: 'floorplan'; floorPlanId: string }
  | { kind: 'create-floorplan' };

type NewJobDialogProps = {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: NewJobChoice) => void;
};

export function NewJobDialog({ open, onClose, onChoose }: NewJobDialogProps): JSX.Element | null {
  const floorPlans = useFloorPlanStore((s) => s.floorPlans);
  const libraryLoading = useFloorPlanStore((s) => s.libraryLoading);
  const loadLibrary = useFloorPlanStore((s) => s.loadLibrary);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) void loadLibrary();
  }, [open, loadLibrary]);

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  if (!open) return null;

  function handleUseSaved(): void {
    if (!selectedId) return;
    onChoose({ kind: 'floorplan', floorPlanId: selectedId });
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal new-job-dialog"
        role="dialog"
        aria-labelledby="new-job-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="new-job-title">New job</h2>
          <button type="button" className="btn btn--small" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <p className="new-job-dialog__intro">Choose how to set up navigation for this wiring job.</p>

        <div className="new-job-dialog__options">
          <button type="button" className="new-job-dialog__option" onClick={() => onChoose({ kind: 'sandbox' })}>
            <span className="new-job-dialog__option-title">Sandbox</span>
            <span className="new-job-dialog__option-desc">One large room for free-form wiring without a floor plan.</span>
          </button>

          <button
            type="button"
            className="new-job-dialog__option"
            onClick={() => onChoose({ kind: 'create-floorplan' })}
          >
            <span className="new-job-dialog__option-title">Create floor plan</span>
            <span className="new-job-dialog__option-desc">Draw rooms first, then start wiring on that layout.</span>
          </button>

          <div className="new-job-dialog__saved">
            <span className="new-job-dialog__option-title">Use saved floor plan</span>
            {libraryLoading ? (
              <p className="new-job-dialog__empty">Loading floor plans…</p>
            ) : floorPlans.length === 0 ? (
              <p className="new-job-dialog__empty">No saved floor plans yet.</p>
            ) : (
              <ul className="new-job-dialog__list">
                {floorPlans.map((plan: FloorPlanSummary) => (
                  <li key={plan.id}>
                    <label className="new-job-dialog__list-item">
                      <input
                        type="radio"
                        name="floor-plan"
                        checked={selectedId === plan.id}
                        onChange={() => setSelectedId(plan.id)}
                      />
                      <span>{plan.name || 'Untitled floor plan'}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="btn btn--primary"
              disabled={!selectedId}
              onClick={handleUseSaved}
            >
              Use selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
