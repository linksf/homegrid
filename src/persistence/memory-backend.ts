import type { Job } from '../domain/types';
import { normalizeJob } from '../domain/normalize';
import type { JobsBackend } from './backend';

const jobs = new Map<string, Job>();

/** In-memory backend for unit tests. */
export const memoryBackend: JobsBackend = {
  async listJobs() {
    return [...jobs.values()].map(normalizeJob);
  },

  async getJob(id) {
    const job = jobs.get(id);
    return job ? normalizeJob(job) : undefined;
  },

  async putJob(job) {
    jobs.set(job.id, normalizeJob(job));
  },

  async deleteJob(id) {
    jobs.delete(id);
  },
};

export function clearMemoryBackend(): void {
  jobs.clear();
}
