import type { FloorPlan } from '../domain/types';

export interface FloorPlansBackend {
  listFloorPlans(): Promise<FloorPlan[]>;
  getFloorPlan(id: string): Promise<FloorPlan | undefined>;
  putFloorPlan(plan: FloorPlan): Promise<void>;
  deleteFloorPlan(id: string): Promise<void>;
}
