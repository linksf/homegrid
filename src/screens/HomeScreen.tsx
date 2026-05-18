import type { JSX, MouseEvent } from 'react';
import { useRef } from 'react';
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
  const createJob = useJobStore((s) => s.createJob);
  const openJob = useJobStore((s) => s.openJob);
  const deleteJob = useJobStore((s) => s.deleteJob);
  const importFile = useJobStore((s) => s.importFile);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          <h1>Wirer</h1>
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
            accept="application/json,.json,.wirer"
            className="visually-hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
      </header>

      <section className="home-screen__library" aria-label="Job library">
        {jobs.length === 0 ? (
          <p className="home-screen__empty">No saved jobs yet. Create a new job or open a file.</p>
        ) : (
          <ul className="job-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <button type="button" className="job-row" onClick={() => void handleOpenRow(job)}>
                  <span className="job-row__name">{job.name || 'Untitled job'}</span>
                  <span className="job-row__meta">{formatRelativeTime(job.updatedAt)}</span>
                  <span className="job-row__actions">
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      aria-label={`Delete ${job.name}`}
                      onClick={(e) => void handleDelete(e, job)}
                    >
                      Delete
                    </button>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
