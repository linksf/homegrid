import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import * as jobsDb from '../db';

const DB_NAME = 'wirer-v1';

describe('IndexedDB jobs store', () => {
  beforeEach(async () => {
    await deleteDB(DB_NAME);
  });

  it('putJob, listJobs, getJob, and deleteJob', async () => {
    expect(await jobsDb.listJobs()).toEqual([]);

    const job = createEmptyJob('Kitchen');
    await jobsDb.putJob(job);

    const all = await jobsDb.listJobs();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(job.id);
    expect(all[0]!.name).toBe('Kitchen');

    const loaded = await jobsDb.getJob(job.id);
    expect(loaded?.diagram.junctionBoxes).toEqual(job.diagram.junctionBoxes);

    await jobsDb.deleteJob(job.id);
    expect(await jobsDb.listJobs()).toEqual([]);
  });
});
