import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeJob } from '../domain/normalize';
import type { Job } from '../domain/types';
import { SCHEMA_VERSION } from './schema';

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

export async function listJobs(): Promise<Job[]> {
  const db = await getDb();
  const jobs = await db.getAll(STORE);
  return jobs.map(normalizeJob);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const db = await getDb();
  const job = await db.get(STORE, id);
  return job ? normalizeJob(job) : undefined;
}

export async function putJob(job: Job): Promise<void> {
  const db = await getDb();
  await db.put(STORE, normalizeJob(job));
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}
