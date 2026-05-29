import type { JSX, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useJobStore } from '../store/job-store';

type JobNameFieldProps = {
  jobId: string;
  name: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onFinished?: () => void;
};

/** Editable job title; saves on blur or Enter. */
export function JobNameField({
  jobId,
  name,
  className,
  ariaLabel = 'Job name',
  autoFocus = false,
  onFinished,
}: JobNameFieldProps): JSX.Element {
  const renameJob = useJobStore((s) => s.renameJob);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(name);
  }, [jobId, name]);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [autoFocus, jobId]);

  async function commit(): Promise<void> {
    const trimmed = draft.trim() || 'Untitled job';
    setDraft(trimmed);
    if (trimmed !== name) {
      await renameJob(jobId, trimmed);
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
