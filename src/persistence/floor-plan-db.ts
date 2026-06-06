import { isFirebaseConfigured } from '../firebase/app';
import type { FloorPlan } from '../domain/types';
import type { FloorPlansBackend } from './floor-plan-backend';
import { indexedDbFloorPlansBackend } from './indexed-db-backend';
import { memoryFloorPlansBackend } from './floor-plan-memory-backend';

let backend: FloorPlansBackend | null = null;

function resolveBackend(): FloorPlansBackend {
  if (backend) return backend;

  if (import.meta.env.MODE === 'test') {
    backend = memoryFloorPlansBackend;
    return backend;
  }

  if (isFirebaseConfigured()) {
    // Floor plans are local-only for MVP; Firebase jobs still work.
    backend = indexedDbFloorPlansBackend;
    return backend;
  }

  backend = indexedDbFloorPlansBackend;
  return backend;
}

export function setFloorPlansBackendForTests(next: FloorPlansBackend | null): void {
  backend = next;
}

export async function listFloorPlans(): Promise<FloorPlan[]> {
  return resolveBackend().listFloorPlans();
}

export async function getFloorPlan(id: string): Promise<FloorPlan | undefined> {
  return resolveBackend().getFloorPlan(id);
}

export async function putFloorPlan(plan: FloorPlan): Promise<void> {
  return resolveBackend().putFloorPlan(plan);
}

export async function deleteFloorPlan(id: string): Promise<void> {
  return resolveBackend().deleteFloorPlan(id);
}
