import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeJob } from '../domain/normalize';
import type { Job } from '../domain/types';
import { SCHEMA_VERSION } from './schema';
import type { JobsBackend } from './backend';

const DB_NAME = 'wirer-v1';
const STORE = 'jobs';

interface WirerDB extends DBSchema {
  jobs: {
    key: string;
    value: Job;
  };
}

async function getDb(): Promise<IDBPDatabase<WirerDB>> {
  return openDB<WirerDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    },
  });
}

/** Local IndexedDB fallback when Firebase is not configured. */
export const indexedDbBackend: JobsBackend = {
  async listJobs() {
    const db = await getDb();
    const jobs = await db.getAll(STORE);
    return jobs.map(normalizeJob);
  },

  async getJob(id) {
    const db = await getDb();
    const job = await db.get(STORE, id);
    return job ? normalizeJob(job) : undefined;
  },

  async putJob(job) {
    const db = await getDb();
    await db.put(STORE, normalizeJob(job));
  },

  async deleteJob(id) {
    const db = await getDb();
    await db.delete(STORE, id);
  },
};

export { DB_NAME };
