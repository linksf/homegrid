import { describe, expect, it } from 'vitest';
import { createEmptyFloorPlan } from '../../domain/floor-plan-defaults';
import { exportFloorPlan, importFloorPlan } from '../floor-plan-file-io';

async function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('floor-plan-file-io', () => {
  it('round-trips a floor plan export', async () => {
    const plan = createEmptyFloorPlan('Kitchen plan');
    plan.rooms.push({ id: 'r1', label: 'Kitchen', x: 0, y: 0, width: 200, height: 160, doors: [] });
    const blob = exportFloorPlan(plan);
    const restored = importFloorPlan(await blobToText(blob));
    expect(restored.id).toBe(plan.id);
    expect(restored.name).toBe('Kitchen plan');
    expect(restored.rooms).toHaveLength(1);
    expect(restored.rooms[0]?.label).toBe('Kitchen');
  });
});
