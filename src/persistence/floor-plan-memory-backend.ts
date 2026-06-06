import { normalizeFloorPlan } from '../domain/normalize-floor-plan';
import type { FloorPlan } from '../domain/types';
import type { FloorPlansBackend } from './floor-plan-backend';

const floorPlans = new Map<string, FloorPlan>();

export const memoryFloorPlansBackend: FloorPlansBackend = {
  async listFloorPlans() {
    return [...floorPlans.values()].map(normalizeFloorPlan);
  },

  async getFloorPlan(id) {
    const plan = floorPlans.get(id);
    return plan ? normalizeFloorPlan(plan) : undefined;
  },

  async putFloorPlan(plan) {
    floorPlans.set(plan.id, normalizeFloorPlan(plan));
  },

  async deleteFloorPlan(id) {
    floorPlans.delete(id);
  },
};

export function clearMemoryFloorPlansBackend(): void {
  floorPlans.clear();
}
