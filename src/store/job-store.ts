import { useMemo } from 'react';
import { create } from 'zustand';
import { JOB_FILE_EXT } from '../app-brand';
import { createJobWithNavigation, type CreateJobOptions } from '../domain/floor-plan-defaults';
import { resolveDirections } from '../domain/direction';
import type { Diagram, Job, ResolvedWire } from '../domain/types';
import * as jobsDb from '../persistence/db';
import { exportJob, importJob } from '../persistence/file-io';
import {
  beginTransientDiagramHistory,
  canRedoDiagram,
  canUndoDiagram,
  clearDiagramHistory,
  commitTransientDiagramHistory,
  popRedoDiagram,
  popUndoDiagram,
  recordDiagramHistory,
  resetDiagramHistory,
} from './diagram-history';

export type UpdateDiagramOptions = {
  history?: boolean;
};

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

function downloadJobFile(job: Job): void {
  const blob = exportJob(job);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = job.name.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'job';
  a.download = `${safe}.${JOB_FILE_EXT}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface JobStore {
  jobs: JobSummary[];
  activeJob: Job | null;
  /** Bumped when undo/redo availability changes. */
  historyTick: number;
  /** True while the job library is being fetched from storage. */
  libraryLoading: boolean;
  /** True while a job is being created, opened, or imported. */
  jobLoading: boolean;
  loadLibrary: () => Promise<void>;
  createJob: (options?: CreateJobOptions) => Promise<void>;
  openJob: (id: string) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  deleteJobs: (ids: string[]) => Promise<void>;
  renameJob: (id: string, name: string) => Promise<void>;
  updateDiagram: (updater: (d: Diagram) => Diagram, options?: UpdateDiagramOptions) => void;
  commitDiagramHistory: () => void;
  undoDiagram: () => void;
  redoDiagram: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  exportActive: () => void;
  exportJobs: (ids: string[]) => Promise<void>;
  importFile: (file: File) => Promise<void>;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistJobId: string | null = null;

function normalizeJobName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : 'Untitled job';
}

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

function bumpHistoryTick(set: (partial: Partial<JobStore> | ((state: JobStore) => Partial<JobStore>)) => void): void {
  set((state) => ({ historyTick: state.historyTick + 1 }));
}

export const useJobStore = create<JobStore>((set, get) => ({
  jobs: [],
  activeJob: null,
  historyTick: 0,
  libraryLoading: true,
  jobLoading: false,

  loadLibrary: async () => {
    set({ libraryLoading: true });
    try {
      const list = await jobsDb.listJobs();
      set({ jobs: toSummaries(list) });
    } finally {
      set({ libraryLoading: false });
    }
  },

  createJob: async (options) => {
    set({ jobLoading: true });
    try {
      const job = createJobWithNavigation(options ?? { mode: 'sandbox' });
      await jobsDb.putJob(job);
      await get().loadLibrary();
      resetDiagramHistory(job.id);
      set({ activeJob: job });
      bumpHistoryTick(set);
    } finally {
      set({ jobLoading: false });
    }
  },

  openJob: async (id: string) => {
    set({ jobLoading: true });
    try {
      const job = await jobsDb.getJob(id);
      if (!job) return;
      resetDiagramHistory(job.id);
      set({ activeJob: job });
      bumpHistoryTick(set);
    } finally {
      set({ jobLoading: false });
    }
  },

  deleteJob: async (id: string) => {
    await get().deleteJobs([id]);
  },

  deleteJobs: async (ids: string[]) => {
    if (ids.length === 0) return;

    for (const id of ids) {
      if (pendingPersistJobId === id && persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
        pendingPersistJobId = null;
      }
      await jobsDb.deleteJob(id);
    }

    const { activeJob } = get();
    if (activeJob && ids.includes(activeJob.id)) {
      clearDiagramHistory(activeJob.id);
      set({ activeJob: null });
      bumpHistoryTick(set);
    }
    await get().loadLibrary();
  },

  renameJob: async (id: string, name: string) => {
    const nextName = normalizeJobName(name);
    const { activeJob } = get();

    if (activeJob?.id === id) {
      const updatedAt = new Date().toISOString();
      const next: Job = { ...activeJob, name: nextName, updatedAt };
      set({ activeJob: next });
      await jobsDb.putJob(next);
      await get().loadLibrary();
      return;
    }

    const job = await jobsDb.getJob(id);
    if (!job) return;
    const updatedAt = new Date().toISOString();
    await jobsDb.putJob({ ...job, name: nextName, updatedAt });
    await get().loadLibrary();
  },

  updateDiagram: (updater, options) => {
    const current = get().activeJob;
    if (!current) return;

    const recordHistory = options?.history !== false;
    if (recordHistory) {
      recordDiagramHistory(current.id, current.diagram);
    } else {
      beginTransientDiagramHistory(current.id, current.diagram);
    }

    const diagram = updater(current.diagram);
    const updatedAt = new Date().toISOString();
    const next: Job = { ...current, diagram, updatedAt };
    set({ activeJob: next });
    if (recordHistory) {
      bumpHistoryTick(set);
    }
    schedulePersist(next, get().loadLibrary);
  },

  commitDiagramHistory: () => {
    const current = get().activeJob;
    if (!current) return;
    if (commitTransientDiagramHistory(current.id, current.diagram)) {
      bumpHistoryTick(set);
    }
  },

  undoDiagram: () => {
    const current = get().activeJob;
    if (!current) return;
    const previous = popUndoDiagram(current.id, current.diagram);
    if (!previous) return;
    const updatedAt = new Date().toISOString();
    const next: Job = { ...current, diagram: previous, updatedAt };
    set({ activeJob: next });
    bumpHistoryTick(set);
    schedulePersist(next, get().loadLibrary);
  },

  redoDiagram: () => {
    const current = get().activeJob;
    if (!current) return;
    const restored = popRedoDiagram(current.id, current.diagram);
    if (!restored) return;
    const updatedAt = new Date().toISOString();
    const next: Job = { ...current, diagram: restored, updatedAt };
    set({ activeJob: next });
    bumpHistoryTick(set);
    schedulePersist(next, get().loadLibrary);
  },

  canUndo: () => {
    const { activeJob, historyTick } = get();
    void historyTick;
    return canUndoDiagram(activeJob?.id);
  },

  canRedo: () => {
    const { activeJob, historyTick } = get();
    void historyTick;
    return canRedoDiagram(activeJob?.id);
  },

  exportActive: () => {
    const job = get().activeJob;
    if (!job) return;
    downloadJobFile(job);
  },

  exportJobs: async (ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      const job = await jobsDb.getJob(ids[i]!);
      if (!job) continue;
      downloadJobFile(job);
      if (i < ids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  },

  importFile: async (file: File) => {
    set({ jobLoading: true });
    try {
      const json = await file.text();
      const job = importJob(json);
      await jobsDb.putJob(job);
      await get().loadLibrary();
      resetDiagramHistory(job.id);
      set({ activeJob: job });
      bumpHistoryTick(set);
    } finally {
      set({ jobLoading: false });
    }
  },
}));

/** Resolved wire directions derived from `activeJob.diagram` (breaker seeds + propagation). */
export function useResolvedWireMap(): Map<string, ResolvedWire> {
  const diagram = useJobStore((s) => s.activeJob?.diagram);
  const switchStateKey = useJobStore((s) =>
    (s.activeJob?.diagram.switches ?? [])
      .map((sw) => `${sw.id}:${sw.terminalCount}:${sw.position ?? ''}`)
      .join('|'),
  );
  const dimmerStateKey = useJobStore((s) =>
    (s.activeJob?.diagram.dimmerSwitches ?? [])
      .map((dim) => `${dim.id}:${dim.level ?? ''}:${dim.position ?? ''}`)
      .join('|'),
  );
  return useMemo(() => {
    if (!diagram?.wires) return new Map();
    try {
      return resolveDirections(diagram);
    } catch (err) {
      console.error('resolveDirections failed:', err);
      return new Map();
    }
  }, [diagram, switchStateKey, dimmerStateKey]);
}
