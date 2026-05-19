import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnchorPosition, WireColor } from '../domain/types';

export type ConduitDialogState =
  | null
  | {
      kind: 'local';
      junctionBoxId: string;
      anchor: AnchorPosition;
    }
  | {
      kind: 'breaker';
      junctionBoxId: string;
      anchor: AnchorPosition;
    }
  | {
      kind: 'span';
      junctionBoxIdA: string;
      anchorA: AnchorPosition;
      junctionBoxIdB: string;
      anchorB: AnchorPosition;
    }
  | {
      kind: 'device';
      deviceNodeId: string;
    };

type ConduitDialogProps = {
  state: ConduitDialogState;
  onDismiss: () => void;
  onConfirm: (wireColors: WireColor[]) => void;
  onConfirmBreaker?: (label: string) => void;
};

const COLOR_OPTIONS: WireColor[] = ['black', 'white', 'red'];

export function ConduitDialog({
  state,
  onDismiss,
  onConfirm,
  onConfirmBreaker,
}: ConduitDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [count, setCount] = useState(3);
  const [colors, setColors] = useState<WireColor[]>(() => Array.from({ length: 3 }, () => 'black'));
  const [breakerLabel, setBreakerLabel] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!state) {
      el?.close();
      return;
    }
    el?.showModal();
    if (state.kind === 'breaker') {
      setBreakerLabel('');
    }
  }, [state]);

  useEffect(() => {
    setColors((prev) => {
      const next = [...prev];
      if (count > next.length) {
        for (let i = next.length; i < count; i += 1) {
          next.push('black');
        }
      } else {
        next.length = count;
      }
      return next;
    });
  }, [count]);

  const title = useMemo(() => {
    if (!state) return '';
    if (state.kind === 'local') return 'Local conduit';
    if (state.kind === 'device') return 'Terminal conduit';
    if (state.kind === 'breaker') return 'Breaker circuit';
    return 'Span conduit';
  }, [state]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onDismiss();
    }
  }

  if (!state) {
    return null;
  }

  if (state.kind === 'breaker') {
    return (
      <dialog ref={dialogRef} className="conduit-dialog" onClose={onDismiss} onClick={handleBackdropClick}>
        <form
          className="conduit-dialog__form"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirmBreaker?.(breakerLabel.trim());
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="conduit-dialog__title">{title}</h2>
          <p className="conduit-dialog__hint">
            Adds one black and one white conductor leaving the panel. Black is seeded <strong>away</strong> from the
            panel; white is seeded <strong>toward</strong> the panel. Direction propagates to connected wires.
          </p>
          <label className="conduit-dialog__field">
            <span>Label</span>
            <input
              type="text"
              value={breakerLabel}
              onChange={(e) => setBreakerLabel(e.target.value)}
              placeholder="Breaker circuit"
              autoComplete="off"
            />
          </label>
          <div className="conduit-dialog__actions">
            <button type="button" className="btn" onClick={onDismiss}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              Add breaker circuit
            </button>
          </div>
        </form>
      </dialog>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (colors.length === 0) return;
    onConfirm(colors);
  }

  return (
    <dialog ref={dialogRef} className="conduit-dialog" onClose={onDismiss} onClick={handleBackdropClick}>
      <form className="conduit-dialog__form" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <h2 className="conduit-dialog__title">{title}</h2>
        <p className="conduit-dialog__hint">Choose how many conductors run in this bundle and set each wire color.</p>

        <label className="conduit-dialog__field">
          <span>Wire count</span>
          <input
            type="number"
            min={1}
            max={12}
            value={count}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(next)) return;
              const clamped = Math.min(12, Math.max(1, next));
              setCount(clamped);
            }}
          />
        </label>

        <div className="conduit-dialog__wires" aria-label="Wire colors">
          {colors.map((color, idx) => (
            <label key={idx} className="conduit-dialog__field conduit-dialog__field--inline">
              <span>{`Wire ${idx + 1}`}</span>
              <select
                value={color}
                onChange={(e) => {
                  const nextColor = e.target.value as WireColor;
                  setColors((prev) => prev.map((c, j) => (j === idx ? nextColor : c)));
                }}
              >
                {COLOR_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="conduit-dialog__actions">
          <button type="button" className="btn" onClick={onDismiss}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Add conduit
          </button>
        </div>
      </form>
    </dialog>
  );
}
