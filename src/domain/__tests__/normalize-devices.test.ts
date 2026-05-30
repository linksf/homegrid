import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addSwitch } from '../device-mutations';
import { normalizeDeviceNodes } from '../normalize-devices';

describe('normalizeDeviceNodes orientation', () => {
  it('normalizes device orientation to a quarter turn, defaulting to 0', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const id = diagram.switches[0]!.id;
    // Invalid / missing orientation values get snapped.
    const dirty = {
      ...diagram,
      switches: diagram.switches.map((s) => ({ ...s, orientation: 95 as unknown as 0 })),
    };
    const cleaned = normalizeDeviceNodes(dirty);
    expect(cleaned.switches.find((s) => s.id === id)!.orientation).toBe(90);

    const missing = {
      ...diagram,
      switches: diagram.switches.map((s) => {
        const rest = { ...s } as typeof s & { orientation?: number };
        delete rest.orientation;
        return rest;
      }),
    };
    const cleaned2 = normalizeDeviceNodes(missing);
    expect(cleaned2.switches.find((s) => s.id === id)!.orientation).toBe(0);
  });
});
