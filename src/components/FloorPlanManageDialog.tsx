import type { ChangeEvent, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FLOOR_PLAN_FILE_EXT } from '../app-brand';
import type { FloorPlanSummary } from '../store/floor-plan-store';
import { useFloorPlanStore } from '../store/floor-plan-store';

export type FloorPlanManageChoice =
  | { kind: 'create-new' }
  | { kind: 'use-saved'; floorPlanId: string }
  | { kind: 'imported'; floorPlanId: string };

type FloorPlanManageDialogProps = {
  open: boolean;
  title?: string;
  showEditCurrent?: boolean;
  onClose: () => void;
  onEditCurrent?: () => void;
  onChoose: (choice: FloorPlanManageChoice) => void;
};

export function FloorPlanManageDialog({
  open,
  title = 'Floor plan',
  showEditCurrent = false,
  onClose,
  onEditCurrent,
  onChoose,
}: FloorPlanManageDialogProps): JSX.Element | null {
  const floorPlans = useFloorPlanStore((s) => s.floorPlans);
  const libraryLoading = useFloorPlanStore((s) => s.libraryLoading);
  const loadLibrary = useFloorPlanStore((s) => s.loadLibrary);
  const importFile = useFloorPlanStore((s) => s.importFile);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) void loadLibrary();
  }, [open, loadLibrary]);

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  if (!open) return null;

  async function handleImportChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const plan = await importFile(file);
      onChoose({ kind: 'imported', floorPlanId: plan.id });
    } catch {
      window.alert('Could not import that file. Check that it is a valid floor plan export.');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal new-job-dialog floor-plan-manage-dialog"
        role="dialog"
        aria-labelledby="floor-plan-manage-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="floor-plan-manage-title">{title}</h2>
          <button type="button" className="btn btn--small" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        <p className="new-job-dialog__intro">
          Add or change the floor plan layout for navigation. Wiring and devices stay where they are.
        </p>

        <div className="new-job-dialog__options">
          {showEditCurrent && onEditCurrent ? (
            <button type="button" className="new-job-dialog__option" onClick={onEditCurrent}>
              <span className="new-job-dialog__option-title">Edit current layout</span>
              <span className="new-job-dialog__option-desc">Open the room and area editor for this job.</span>
            </button>
          ) : null}

          <button type="button" className="new-job-dialog__option" onClick={() => onChoose({ kind: 'create-new' })}>
            <span className="new-job-dialog__option-title">Create new floor plan</span>
            <span className="new-job-dialog__option-desc">Draw rooms and areas, then apply them to this job.</span>
          </button>

          <button type="button" className="new-job-dialog__option" onClick={() => fileInputRef.current?.click()}>
            <span className="new-job-dialog__option-title">Import floor plan file…</span>
            <span className="new-job-dialog__option-desc">Load a saved `.${FLOOR_PLAN_FILE_EXT}` file from disk.</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={`application/json,.json,.${FLOOR_PLAN_FILE_EXT}`}
            className="visually-hidden"
            onChange={(e) => void handleImportChange(e)}
          />

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
                        name="floor-plan-manage"
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
              onClick={() => selectedId && onChoose({ kind: 'use-saved', floorPlanId: selectedId })}
            >
              Use selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
