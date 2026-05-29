import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import { clearMemoryBackend, memoryBackend } from '../../persistence/memory-backend';
import * as jobsDb from '../../persistence/db';
import { useJobStore } from '../job-store';

describe('job store bulk actions', () => {
  beforeEach(() => {
    clearMemoryBackend();
    jobsDb.setJobsBackendForTests(memoryBackend);
    useJobStore.setState({ jobs: [], activeJob: null, historyTick: 0 });
  });

  it('deleteJobs removes multiple jobs and clears activeJob when needed', async () => {
    const jobA = createEmptyJob('A');
    const jobB = createEmptyJob('B');
    const jobC = createEmptyJob('C');

    await useJobStore.getState().loadLibrary();
    const { loadLibrary } = useJobStore.getState();

    await jobsDb.putJob(jobA);
    await jobsDb.putJob(jobB);
    await jobsDb.putJob(jobC);
    await loadLibrary();

    useJobStore.setState({ activeJob: jobB });
    await useJobStore.getState().deleteJobs([jobA.id, jobB.id]);
    await loadLibrary();

    const { jobs, activeJob } = useJobStore.getState();
    expect(jobs.map((j) => j.id)).toEqual([jobC.id]);
    expect(activeJob).toBeNull();
  });
});
