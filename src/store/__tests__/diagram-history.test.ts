import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import {
  beginTransientDiagramHistory,
  canRedoDiagram,
  canUndoDiagram,
  commitTransientDiagramHistory,
  popRedoDiagram,
  popUndoDiagram,
  recordDiagramHistory,
  resetDiagramHistory,
} from '../diagram-history';

describe('diagram history', () => {
  it('undo and redo restore prior diagram states', () => {
    const job = createEmptyJob();
    const jobId = job.id;
    resetDiagramHistory(jobId);

    const initial = job.diagram;
    const afterEdit = { ...initial, lightBulbs: [{ id: 'b1', label: '', x: 0, y: 0 }] };

    recordDiagramHistory(jobId, initial);
    expect(canUndoDiagram(jobId)).toBe(true);

    const undone = popUndoDiagram(jobId, afterEdit);
    expect(undone).toEqual(initial);
    expect(canRedoDiagram(jobId)).toBe(true);

    const redone = popRedoDiagram(jobId, initial);
    expect(redone).toEqual(afterEdit);
  });

  it('commits transient drag batches as a single undo step', () => {
    const job = createEmptyJob();
    const jobId = job.id;
    resetDiagramHistory(jobId);

    const moved = {
      ...job.diagram,
      lightBulbs: [{ id: 'b1', label: '', x: 48, y: 48 }],
    };

    beginTransientDiagramHistory(jobId, job.diagram);
    expect(canUndoDiagram(jobId)).toBe(false);

    expect(commitTransientDiagramHistory(jobId, moved)).toBe(true);
    expect(canUndoDiagram(jobId)).toBe(true);

    const restored = popUndoDiagram(jobId, moved);
    expect(restored).toEqual(job.diagram);
  });
});
