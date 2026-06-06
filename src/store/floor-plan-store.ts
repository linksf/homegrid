import { create } from 'zustand';
import { createEmptyFloorPlan } from '../domain/floor-plan-defaults';
import type { FloorPlan } from '../domain/types';
import * as floorPlanDb from '../persistence/floor-plan-db';

export type FloorPlanSummary = Pick<FloorPlan, 'id' | 'name' | 'updatedAt' | 'createdAt'>;

function toSummaries(plans: FloorPlan[]): FloorPlanSummary[] {
  return [...plans]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
    }));
}

export interface FloorPlanStore {
  floorPlans: FloorPlanSummary[];
  activeFloorPlan: FloorPlan | null;
  libraryLoading: boolean;
  loadLibrary: () => Promise<void>;
  createFloorPlan: (name?: string) => Promise<FloorPlan>;
  openFloorPlan: (id: string) => Promise<FloorPlan | undefined>;
  saveActiveFloorPlan: (updater: (plan: FloorPlan) => FloorPlan) => Promise<void>;
  deleteFloorPlan: (id: string) => Promise<void>;
  renameFloorPlan: (id: string, name: string) => Promise<void>;
}

export const useFloorPlanStore = create<FloorPlanStore>((set, get) => ({
  floorPlans: [],
  activeFloorPlan: null,
  libraryLoading: true,

  loadLibrary: async () => {
    set({ libraryLoading: true });
    try {
      const list = await floorPlanDb.listFloorPlans();
      set({ floorPlans: toSummaries(list) });
    } finally {
      set({ libraryLoading: false });
    }
  },

  createFloorPlan: async (name) => {
    const plan = createEmptyFloorPlan(name);
    await floorPlanDb.putFloorPlan(plan);
    await get().loadLibrary();
    set({ activeFloorPlan: plan });
    return plan;
  },

  openFloorPlan: async (id) => {
    const plan = await floorPlanDb.getFloorPlan(id);
    if (plan) set({ activeFloorPlan: plan });
    return plan;
  },

  saveActiveFloorPlan: async (updater) => {
    const current = get().activeFloorPlan;
    if (!current) return;
    const updatedAt = new Date().toISOString();
    const next = updater({ ...current, updatedAt });
    await floorPlanDb.putFloorPlan(next);
    set({ activeFloorPlan: next });
    await get().loadLibrary();
  },

  deleteFloorPlan: async (id) => {
    await floorPlanDb.deleteFloorPlan(id);
    const { activeFloorPlan } = get();
    if (activeFloorPlan?.id === id) {
      set({ activeFloorPlan: null });
    }
    await get().loadLibrary();
  },

  renameFloorPlan: async (id, name) => {
    const trimmed = name.trim() || 'Untitled floor plan';
    const plan = await floorPlanDb.getFloorPlan(id);
    if (!plan) return;
    const updatedAt = new Date().toISOString();
    const next = { ...plan, name: trimmed, updatedAt };
    await floorPlanDb.putFloorPlan(next);
    const { activeFloorPlan } = get();
    if (activeFloorPlan?.id === id) {
      set({ activeFloorPlan: next });
    }
    await get().loadLibrary();
  },
}));
