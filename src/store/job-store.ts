import { useMemo } from 'react';
import { create } from 'zustand';
import { createEmptyJob } from '../domain/defaults';
import { resolveDirections } from '../domain/direction';
import type { Diagram, Job, ResolvedWire } from '../domain/types';
import * as jobsDb from '../persistence/db';
import { exportJob, importJob } from '../persistence/file-io';

export type JobSummary = Pick<Job, 'id' | 'name' | 'updatedAt' | 'createdAt'>;

function toSummaries(jobs: Job[]): JobSummary[] {
  return [...jobs]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((j) => ({
      id: j.id,
      name: j.name,
      updatedAt: j.updatedAt,
      createdAt: j.createdAt,
    }));
}

export interface JobStore {
  jobs: JobSummary[];
  activeJob: Job | null;
  loadLibrary: () => Promise<void>;
  createJob: () => Promise<void>;
  openJob: (id: string) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  updateDiagram: (updater: (d: Diagram) => Diagram) => void;
  exportActive: () => void;
  importFile: (file: File) => Promise<void>;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistJobId: string | null = null;

function schedulePersist(job: Job, reloadLibrary: () => Promise<void>): void {
  const toPersist = job;
  pendingPersistJobId = toPersist.id;

  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    pendingPersistJobId = null;
    void jobsDb.putJob(toPersist).then(() => {
      void reloadLibrary();
    });
  }, 300);
}

export const useJobStore = create<JobStore>((set, get) => ({
  jobs: [],
  activeJob: null,

  loadLibrary: async () => {
    const list = await jobsDb.listJobs();
    set({ jobs: toSummaries(list) });
  },

  createJob: async () => {
    const job = createEmptyJob();
    await jobsDb.putJob(job);
    await get().loadLibrary();
    set({ activeJob: job });
  },

  openJob: async (id: string) => {
    const job = await jobsDb.getJob(id);
    if (!job) return;
    set({ activeJob: job });
  },

  deleteJob: async (id: string) => {
    if (pendingPersistJobId === id && persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
      pendingPersistJobId = null;
    }

    await jobsDb.deleteJob(id);
    const { activeJob } = get();
    if (activeJob?.id === id) {
      set({ activeJob: null });
    }
    await get().loadLibrary();
  },

  updateDiagram: (updater) => {
    const current = get().activeJob;
    if (!current) return;

    const diagram = updater(current.diagram);
    const updatedAt = new Date().toISOString();
    const next: Job = { ...current, diagram, updatedAt };
    set({ activeJob: next });
    schedulePersist(next, get().loadLibrary);
  },

  exportActive: () => {
    const job = get().activeJob;
    if (!job) return;

    const blob = exportJob(job);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = job.name.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'job';
    a.download = `${safe}.wirer.json`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  importFile: async (file: File) => {
    const json = await file.text();
    const job = importJob(json);
    await jobsDb.putJob(job);
    await get().loadLibrary();
    set({ activeJob: job });
  },
}));

/** Resolved wire directions derived from `activeJob.diagram` (breaker seeds + propagation). */
export function useResolvedWireMap(): Map<string, ResolvedWire> {
  const diagram = useJobStore((s) => s.activeJob?.diagram);
  return useMemo(() => (diagram ? resolveDirections(diagram) : new Map()), [diagram]);
}
