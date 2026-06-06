import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeFloorPlan } from '../domain/normalize-floor-plan';
import { normalizeJob } from '../domain/normalize';
import type { FloorPlan, Job } from '../domain/types';
import { IDB_SCHEMA_VERSION } from './schema';
import type { JobsBackend } from './backend';
import type { FloorPlansBackend } from './floor-plan-backend';

const DB_NAME = 'wirer-v1';
const JOBS_STORE = 'jobs';
const FLOOR_PLANS_STORE = 'floorPlans';

interface HomeGridDB extends DBSchema {
  jobs: {
    key: string;
    value: Job;
  };
  floorPlans: {
    key: string;
    value: FloorPlan;
  };
}

async function getDb(): Promise<IDBPDatabase<HomeGridDB>> {
  return openDB<HomeGridDB>(DB_NAME, IDB_SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(JOBS_STORE)) {
        db.createObjectStore(JOBS_STORE, { keyPath: 'id' });
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains(FLOOR_PLANS_STORE)) {
        db.createObjectStore(FLOOR_PLANS_STORE, { keyPath: 'id' });
      }
    },
  });
}

/** Local IndexedDB fallback when Firebase is not configured. */
export const indexedDbBackend: JobsBackend = {
  async listJobs() {
    const db = await getDb();
    const jobs = await db.getAll(JOBS_STORE);
    return jobs.map(normalizeJob);
  },

  async getJob(id) {
    const db = await getDb();
    const job = await db.get(JOBS_STORE, id);
    return job ? normalizeJob(job) : undefined;
  },

  async putJob(job) {
    const db = await getDb();
    await db.put(JOBS_STORE, normalizeJob(job));
  },

  async deleteJob(id) {
    const db = await getDb();
    await db.delete(JOBS_STORE, id);
  },
};

export const indexedDbFloorPlansBackend: FloorPlansBackend = {
  async listFloorPlans() {
    const db = await getDb();
    const plans = await db.getAll(FLOOR_PLANS_STORE);
    return plans.map(normalizeFloorPlan);
  },

  async getFloorPlan(id) {
    const db = await getDb();
    const plan = await db.get(FLOOR_PLANS_STORE, id);
    return plan ? normalizeFloorPlan(plan) : undefined;
  },

  async putFloorPlan(plan) {
    const db = await getDb();
    await db.put(FLOOR_PLANS_STORE, normalizeFloorPlan(plan));
  },

  async deleteFloorPlan(id) {
    const db = await getDb();
    await db.delete(FLOOR_PLANS_STORE, id);
  },
};

export { DB_NAME };
