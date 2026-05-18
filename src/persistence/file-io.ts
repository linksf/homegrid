import type { Job } from '../domain/types';
import { SCHEMA_VERSION } from './schema';

export function exportJob(job: Job): Blob {
  return new Blob([JSON.stringify({ schemaVersion: SCHEMA_VERSION, job }, null, 2)], {
    type: 'application/json',
  });
}

export function importJob(json: string): Job {
  const parsed = JSON.parse(json) as { schemaVersion?: unknown; job?: Job };
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported schema');
  }
  return parsed.job as Job;
}
