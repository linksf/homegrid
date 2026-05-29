import type { Diagram } from '../domain/types';

export type DiagramHistoryState = {
  past: Diagram[];
  future: Diagram[];
};

const MAX_HISTORY = 100;
const COALESCE_MS = 400;

const historyByJobId = new Map<string, DiagramHistoryState>();
let lastRecordAt = 0;
let lastRecordJobId: string | null = null;

let transientBase: Diagram | null = null;
let transientJobId: string | null = null;

function cloneDiagram(diagram: Diagram): Diagram {
  return structuredClone(diagram);
}

function diagramsEqual(a: Diagram, b: Diagram): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getOrCreateHistory(jobId: string): DiagramHistoryState {
  let state = historyByJobId.get(jobId);
  if (!state) {
    state = { past: [], future: [] };
    historyByJobId.set(jobId, state);
  }
  return state;
}

export function resetDiagramHistory(jobId: string): void {
  historyByJobId.set(jobId, { past: [], future: [] });
  lastRecordAt = 0;
  lastRecordJobId = null;
  if (transientJobId === jobId) {
    transientBase = null;
    transientJobId = null;
  }
}

export function clearDiagramHistory(jobId: string): void {
  historyByJobId.delete(jobId);
  if (transientJobId === jobId) {
    transientBase = null;
    transientJobId = null;
  }
}

export function canUndoDiagram(jobId: string | undefined): boolean {
  if (!jobId) return false;
  return getOrCreateHistory(jobId).past.length > 0;
}

export function canRedoDiagram(jobId: string | undefined): boolean {
  if (!jobId) return false;
  return getOrCreateHistory(jobId).future.length > 0;
}

export function beginTransientDiagramHistory(jobId: string, diagram: Diagram): void {
  if (transientJobId === jobId && transientBase) return;
  transientBase = cloneDiagram(diagram);
  transientJobId = jobId;
}

export function cancelTransientDiagramHistory(jobId?: string): void {
  if (jobId && transientJobId !== jobId) return;
  transientBase = null;
  transientJobId = null;
}

/** Flush a drag/resize batch into the undo stack when the diagram changed. */
export function commitTransientDiagramHistory(jobId: string, diagram: Diagram): boolean {
  if (transientJobId !== jobId || !transientBase) return false;

  const base = transientBase;
  transientBase = null;
  transientJobId = null;

  if (diagramsEqual(base, diagram)) return false;
  recordDiagramHistory(jobId, base);
  return true;
}

/** Push a pre-change diagram snapshot onto the undo stack. */
export function recordDiagramHistory(jobId: string, diagram: Diagram): void {
  const state = getOrCreateHistory(jobId);
  const now = Date.now();
  const snapshot = cloneDiagram(diagram);

  if (
    state.past.length > 0 &&
    lastRecordJobId === jobId &&
    now - lastRecordAt < COALESCE_MS
  ) {
    lastRecordAt = now;
    state.future = [];
    return;
  }

  if (state.past.length > 0 && diagramsEqual(state.past[state.past.length - 1]!, snapshot)) {
    return;
  }

  state.past.push(snapshot);
  if (state.past.length > MAX_HISTORY) {
    state.past.shift();
  }
  state.future = [];
  lastRecordAt = now;
  lastRecordJobId = jobId;
}

export function popUndoDiagram(jobId: string, current: Diagram): Diagram | null {
  cancelTransientDiagramHistory(jobId);
  const state = getOrCreateHistory(jobId);
  const previous = state.past.pop();
  if (!previous) return null;

  state.future.unshift(cloneDiagram(current));
  lastRecordAt = 0;
  lastRecordJobId = null;
  return previous;
}

export function popRedoDiagram(jobId: string, current: Diagram): Diagram | null {
  cancelTransientDiagramHistory(jobId);
  const state = getOrCreateHistory(jobId);
  const next = state.future.shift();
  if (!next) return null;

  state.past.push(cloneDiagram(current));
  lastRecordAt = 0;
  lastRecordJobId = null;
  return next;
}
