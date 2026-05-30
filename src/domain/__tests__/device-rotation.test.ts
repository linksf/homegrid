import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addSwitch } from '../device-mutations';
import { deviceNodeWorldPoint } from '../device-node-geometry';
import type { DeviceNode } from '../types';

function switchNode(diagram: ReturnType<typeof createEmptyJob>['diagram'], slot: number): DeviceNode {
  return diagram.deviceNodes.find((n) => n.deviceKind === 'switch' && n.slot === slot)!;
}

describe('rotation-aware terminal geometry', () => {
  it('leaves terminals in place at orientation 0', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const sw = diagram.switches[0]!;
    const left = deviceNodeWorldPoint(diagram, switchNode(diagram, 0))!;
    const right = deviceNodeWorldPoint(diagram, switchNode(diagram, 1))!;
    const cy = sw.y + sw.height / 2;
    expect(left).toEqual({ x: sw.x, y: cy });
    expect(right).toEqual({ x: sw.x + sw.width, y: cy });
  });

  it('rotates the left terminal to the top after one clockwise quarter turn', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const sw = { ...diagram.switches[0]!, orientation: 90 as const };
    diagram = { ...diagram, switches: [sw] };
    const cx = sw.x + sw.width / 2;
    const cy = sw.y + sw.height / 2;
    // unrotated left terminal is (sw.x, cy), width/2 left of center; rigid CW 90 maps it to (cx, cy - width/2).
    const left = deviceNodeWorldPoint(diagram, switchNode(diagram, 0))!;
    expect(left.x).toBeCloseTo(cx);
    expect(left.y).toBeCloseTo(cy - sw.width / 2);
  });

  it('rotates the left terminal to the bottom after a 270° turn', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const sw = { ...diagram.switches[0]!, orientation: 270 as const };
    diagram = { ...diagram, switches: [sw] };
    const cx = sw.x + sw.width / 2;
    const cy = sw.y + sw.height / 2;
    // unrotated left terminal (sw.x, cy) rigidly rotates CW 270 about center to (cx, cy + width/2).
    const left = deviceNodeWorldPoint(diagram, switchNode(diagram, 0))!;
    expect(left.x).toBeCloseTo(cx);
    expect(left.y).toBeCloseTo(cy + sw.width / 2);
  });
});
