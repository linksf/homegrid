import { isFirebaseConfigured, getFirebaseStorage } from '../firebase/app';
import type { Job } from '../domain/types';
import type { JobsBackend } from './backend';
import { createFirebaseBackend } from './firebase-backend';
import { indexedDbBackend } from './indexed-db-backend';
import { memoryBackend } from './memory-backend';

let backend: JobsBackend | null = null;

function resolveBackend(): JobsBackend {
  if (backend) return backend;

  if (import.meta.env.MODE === 'test') {
    backend = memoryBackend;
    return backend;
  }

  if (isFirebaseConfigured()) {
    backend = createFirebaseBackend(getFirebaseStorage());
    return backend;
  }

  console.warn('Firebase is not configured; jobs will be saved to local IndexedDB only.');
  backend = indexedDbBackend;
  return backend;
}

/** Swap persistence backend in tests. */
export function setJobsBackendForTests(next: JobsBackend | null): void {
  backend = next;
}

export async function listJobs(): Promise<Job[]> {
  return resolveBackend().listJobs();
}

export async function getJob(id: string): Promise<Job | undefined> {
  return resolveBackend().getJob(id);
}

export async function putJob(job: Job): Promise<void> {
  return resolveBackend().putJob(job);
}

export async function deleteJob(id: string): Promise<void> {
  return resolveBackend().deleteJob(id);
}
