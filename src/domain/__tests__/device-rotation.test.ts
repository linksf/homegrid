import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addLightBulb, addOutlet, addDimmerSwitch, addSwitch, rotateDevice } from '../device-mutations';
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

describe('rotateDevice', () => {
  it('cycles a switch clockwise through 90/180/270/0', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const id = diagram.switches[0]!.id;
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(90);
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(180);
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(270);
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(0);
  });

  it('rotates counter-clockwise', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addOutlet(diagram, 300, 300, false);
    const id = diagram.outlets[0]!.id;
    diagram = rotateDevice(diagram, 'outlet', id, 'ccw');
    expect(diagram.outlets[0]!.orientation).toBe(270);
  });

  it('rotates a light bulb and a dimmer', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 200, 200);
    diagram = addDimmerSwitch(diagram, 400, 400);
    const bulbId = diagram.lightBulbs[0]!.id;
    const dimId = diagram.dimmerSwitches[0]!.id;
    diagram = rotateDevice(diagram, 'lightBulb', bulbId, 'cw');
    diagram = rotateDevice(diagram, 'dimmerSwitch', dimId, 'cw');
    expect(diagram.lightBulbs[0]!.orientation).toBe(90);
    expect(diagram.dimmerSwitches[0]!.orientation).toBe(90);
  });
});
