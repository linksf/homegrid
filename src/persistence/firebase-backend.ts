import {
  deleteObject,
  getBytes,
  ref,
  uploadString,
} from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { normalizeJob } from '../domain/normalize';
import type { Job } from '../domain/types';
import type { JobsBackend } from './backend';
import { SCHEMA_VERSION } from './schema';

const JOBS_PREFIX = 'wirer/jobs';
const INDEX_PATH = `${JOBS_PREFIX}/index.json`;

type JobIndexEntry = Pick<Job, 'id' | 'name' | 'updatedAt' | 'createdAt'>;

type JobIndex = {
  schemaVersion: typeof SCHEMA_VERSION;
  jobs: JobIndexEntry[];
};

function jobObjectPath(id: string): string {
  return `${JOBS_PREFIX}/${id}.json`;
}

function jobFilePayload(job: Job): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, job: normalizeJob(job) });
}

async function readIndex(storage: FirebaseStorage): Promise<JobIndex> {
  try {
    const bytes = await getBytes(ref(storage, INDEX_PATH));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as JobIndex;
    if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.jobs)) {
      return { schemaVersion: SCHEMA_VERSION, jobs: [] };
    }
    return parsed;
  } catch {
    return { schemaVersion: SCHEMA_VERSION, jobs: [] };
  }
}

async function writeIndex(storage: FirebaseStorage, index: JobIndex): Promise<void> {
  await uploadString(ref(storage, INDEX_PATH), JSON.stringify(index), 'raw', {
    contentType: 'application/json',
  });
}

function indexEntryFromJob(job: Job): JobIndexEntry {
  return {
    id: job.id,
    name: job.name,
    updatedAt: job.updatedAt,
    createdAt: job.createdAt,
  };
}

function parseJobFile(bytes: ArrayBuffer): Job {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { schemaVersion?: unknown; job?: Job };
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported job schema in cloud storage');
  }
  return normalizeJob(parsed.job as Job);
}

export function createFirebaseBackend(storage: FirebaseStorage): JobsBackend {
  return {
    async listJobs() {
      const index = await readIndex(storage);
      const jobs: Job[] = [];

      for (const entry of index.jobs) {
        try {
          const bytes = await getBytes(ref(storage, jobObjectPath(entry.id)));
          jobs.push(parseJobFile(bytes));
        } catch {
          // Stale index entry; skip missing objects.
        }
      }

      return jobs;
    },

    async getJob(id) {
      try {
        const bytes = await getBytes(ref(storage, jobObjectPath(id)));
        return parseJobFile(bytes);
      } catch {
        return undefined;
      }
    },

    async putJob(job) {
      const normalized = normalizeJob(job);
      await uploadString(ref(storage, jobObjectPath(normalized.id)), jobFilePayload(normalized), 'raw', {
        contentType: 'application/json',
      });

      const index = await readIndex(storage);
      const entry = indexEntryFromJob(normalized);
      const existingIdx = index.jobs.findIndex((j) => j.id === normalized.id);
      if (existingIdx >= 0) {
        index.jobs[existingIdx] = entry;
      } else {
        index.jobs.push(entry);
      }
      await writeIndex(storage, index);
    },

    async deleteJob(id) {
      try {
        await deleteObject(ref(storage, jobObjectPath(id)));
      } catch {
        // Already removed from storage.
      }

      const index = await readIndex(storage);
      index.jobs = index.jobs.filter((j) => j.id !== id);
      await writeIndex(storage, index);
    },
  };
}
