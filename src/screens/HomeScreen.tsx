import type { ChangeEvent, JSX, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { APP_NAME, LEGACY_JOB_FILE_EXT, JOB_FILE_EXT } from '../app-brand';
import { ElectricLoader } from '../components/ElectricLoader';
import { JobNameField } from '../components/JobNameField';
import { useJobStore, type JobSummary } from '../store/job-store';

function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;

  const diffSec = (ts - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = day * 365;

  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < hour) return rtf.format(Math.round(diffSec / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diffSec / hour), 'hour');
  if (abs < week) return rtf.format(Math.round(diffSec / day), 'day');
  if (abs < month) return rtf.format(Math.round(diffSec / week), 'week');
  if (abs < year) return rtf.format(Math.round(diffSec / month), 'month');
  return rtf.format(Math.round(diffSec / year), 'year');
}

type HomeScreenProps = {
  onOpenEditor: () => void;
};

export function HomeScreen({ onOpenEditor }: HomeScreenProps): JSX.Element {
  const jobs = useJobStore((s) => s.jobs);
  const libraryLoading = useJobStore((s) => s.libraryLoading);
  const createJob = useJobStore((s) => s.createJob);
  const openJob = useJobStore((s) => s.openJob);
  const deleteJob = useJobStore((s) => s.deleteJob);
  const deleteJobs = useJobStore((s) => s.deleteJobs);
  const exportJobs = useJobStore((s) => s.exportJobs);
  const importFile = useJobStore((s) => s.importFile);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const validIds = new Set(jobs.map((job) => job.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  const selectedCount = selectedIds.size;
  const allSelected = jobs.length > 0 && selectedCount === jobs.length;
  const someSelected = selectedCount > 0 && !allSelected;

  async function handleNew(): Promise<void> {
    await createJob();
    onOpenEditor();
  }

  async function handleOpenRow(job: JobSummary): Promise<void> {
    await openJob(job.id);
    onOpenEditor();
  }

  async function handleDelete(e: MouseEvent, job: JobSummary): Promise<void> {
    e.stopPropagation();
    if (!window.confirm(`Delete “${job.name}”? This cannot be undone.`)) return;
    await deleteJob(job.id);
  }

  function handleStartRename(e: MouseEvent, job: JobSummary): void {
    e.stopPropagation();
    setRenamingId(job.id);
  }

  function toggleSelected(jobId: string, selected: boolean): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  function handleSelectAll(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.checked) {
      setSelectedIds(new Set(jobs.map((job) => job.id)));
      return;
    }
    setSelectedIds(new Set());
  }

  async function handleBulkDelete(): Promise<void> {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const label = ids.length === 1 ? '1 job' : `${ids.length} jobs`;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    await deleteJobs(ids);
    setSelectedIds(new Set());
  }

  async function handleBulkExport(): Promise<void> {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    await exportJobs(ids);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await importFile(file);
    onOpenEditor();
  }

  return (
    <div className="home-screen">
      <header className="home-screen__header">
        <div>
          <h1>{APP_NAME}</h1>
          <p className="home-screen__subtitle">Electrical wiring mapper</p>
        </div>
        <div className="home-screen__actions">
          <button type="button" className="btn btn--primary" onClick={() => void handleNew()}>
            New job
          </button>
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
            Open file…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={`application/json,.json,.${JOB_FILE_EXT},.${LEGACY_JOB_FILE_EXT}`}
            className="visually-hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
      </header>

      <section className="home-screen__library" aria-label="Job library">
        {libraryLoading && jobs.length === 0 ? (
          <ElectricLoader label="Loading your jobs…" />
        ) : jobs.length === 0 ? (
          <p className="home-screen__empty">No saved jobs yet. Create a new job or open a file. Jobs sync to Firebase Storage when online.</p>
        ) : (
          <>
            <div className="home-screen__library-toolbar">
              <label className="job-select-all">
                <input
                  type="checkbox"
                  className="job-row__checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={handleSelectAll}
                  aria-label="Select all jobs"
                />
                <span>Select all</span>
              </label>
              {selectedCount > 0 ? (
                <div className="home-screen__bulk-actions">
                  <span className="home-screen__bulk-count">
                    {selectedCount} selected
                  </span>
                  <button type="button" className="btn btn--small" onClick={() => void handleBulkExport()}>
                    Export
                  </button>
                  <button type="button" className="btn btn--danger btn--small" onClick={() => void handleBulkDelete()}>
                    Delete
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
            <ul className="job-list">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className={['job-row', selectedIds.has(job.id) ? 'job-row--selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <input
                    type="checkbox"
                    className="job-row__checkbox"
                    checked={selectedIds.has(job.id)}
                    onChange={(e) => toggleSelected(job.id, e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${job.name || 'Untitled job'}`}
                  />
                  {renamingId === job.id ? (
                    <JobNameField
                      jobId={job.id}
                      name={job.name || 'Untitled job'}
                      className="job-row__rename-input"
                      ariaLabel={`Rename ${job.name}`}
                      autoFocus
                      onFinished={() => setRenamingId(null)}
                    />
                  ) : (
                    <button type="button" className="job-row__open" onClick={() => void handleOpenRow(job)}>
                      <span className="job-row__name">{job.name || 'Untitled job'}</span>
                      <span className="job-row__meta">{formatRelativeTime(job.updatedAt)}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--small job-row__rename"
                    aria-label={`Rename ${job.name}`}
                    onClick={(e) => handleStartRename(e, job)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--small job-row__delete"
                    aria-label={`Delete ${job.name}`}
                    onClick={(e) => void handleDelete(e, job)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
