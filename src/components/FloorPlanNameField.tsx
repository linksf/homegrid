import type { JSX, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useFloorPlanStore } from '../store/floor-plan-store';

type FloorPlanNameFieldProps = {
  floorPlanId: string;
  name: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onFinished?: () => void;
};

/** Editable floor plan title; saves on blur or Enter. */
export function FloorPlanNameField({
  floorPlanId,
  name,
  className,
  ariaLabel = 'Floor plan name',
  autoFocus = false,
  onFinished,
}: FloorPlanNameFieldProps): JSX.Element {
  const renameFloorPlan = useFloorPlanStore((s) => s.renameFloorPlan);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(name);
  }, [floorPlanId, name]);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [autoFocus, floorPlanId]);

  async function commit(): Promise<void> {
    const trimmed = draft.trim() || 'Untitled floor plan';
    setDraft(trimmed);
    if (trimmed !== name) {
      await renameFloorPlan(floorPlanId, trimmed);
    }
    onFinished?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(name);
      onFinished?.();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      value={draft}
      aria-label={ariaLabel}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={onKeyDown}
    />
  );
}
