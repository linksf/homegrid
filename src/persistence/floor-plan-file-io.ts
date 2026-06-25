import { normalizeFloorPlan } from '../domain/normalize-floor-plan';
import type { FloorPlan } from '../domain/types';
import { SCHEMA_VERSION } from './schema';

export function exportFloorPlan(plan: FloorPlan): Blob {
  return new Blob([JSON.stringify({ schemaVersion: SCHEMA_VERSION, floorPlan: plan }, null, 2)], {
    type: 'application/json',
  });
}

export function importFloorPlan(json: string): FloorPlan {
  const parsed = JSON.parse(json) as { schemaVersion?: unknown; floorPlan?: FloorPlan };
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported schema');
  }
  return normalizeFloorPlan(parsed.floorPlan as FloorPlan);
}
