import type { Job } from '../domain/types';

/** Persistence layer for saved wiring jobs (maps). */
export interface JobsBackend {
  listJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  putJob(job: Job): Promise<void>;
  deleteJob(id: string): Promise<void>;
}
