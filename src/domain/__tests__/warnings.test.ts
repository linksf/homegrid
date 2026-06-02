import { describe, expect, it } from 'vitest';
import { resolveDirections } from '../direction';
import { createWireLink } from '../mutations';
import { createEmptyJob } from '../defaults';
import { isDirectionOpposedLink } from '../wire-link-utils';
import type { Wire } from '../types';

const baseWire = (id: string, overrides: Partial<Wire> = {}): Wire => ({
  id,
  color: 'black',
  label: '',
  conduitId: 'c1',
  cableId: null,
  breakerId: null,
  hubId: null,
  deviceNodeId: null,
  manualDirection: null,
  ...overrides,
});

describe('isDirectionOpposedLink', () => {
  it('warns when both wires pull flow from the link', () => {
    const link = createWireLink(
      baseWire('a', { manualDirection: 'toward' }),
      'end',
      baseWire('b', { manualDirection: 'toward' }),
      'end',
    );
    const resolved = resolveDirections({
      ...createEmptyJob().diagram,
      wires: [
        baseWire('a', { manualDirection: 'toward' }),
        baseWire('b', { manualDirection: 'toward' }),
      ],
      wireLinks: [link],
    });
    expect(
      isDirectionOpposedLink(link, resolved.get('a'), resolved.get('b')),
    ).toBe(true);
  });

  it('does not warn when both wires flow out of the link', () => {
    const link = createWireLink(
      baseWire('a', { manualDirection: 'away' }),
      'end',
      baseWire('b', { manualDirection: 'away' }),
      'end',
    );
    const resolved = resolveDirections({
      ...createEmptyJob().diagram,
      wires: [
        baseWire('a', { manualDirection: 'away' }),
        baseWire('b', { manualDirection: 'away' }),
      ],
      wireLinks: [link],
    });
    expect(
      isDirectionOpposedLink(link, resolved.get('a'), resolved.get('b')),
    ).toBe(false);
  });

  it('does not warn when one wire feeds the link and the other draws from it', () => {
    const link = createWireLink(
      baseWire('a', { manualDirection: 'toward' }),
      'end',
      baseWire('b', { manualDirection: 'away' }),
      'end',
    );
    const resolved = resolveDirections({
      ...createEmptyJob().diagram,
      wires: [
        baseWire('a', { manualDirection: 'toward' }),
        baseWire('b', { manualDirection: 'away' }),
      ],
      wireLinks: [link],
    });
    expect(
      isDirectionOpposedLink(link, resolved.get('a'), resolved.get('b')),
    ).toBe(false);
  });

  it('does not warn when either wire has no resolved direction', () => {
    const link = createWireLink(baseWire('a'), 'end', baseWire('b'), 'end');
    expect(
      isDirectionOpposedLink(link, { resolvedDirection: 'toward', color: 'black' }, undefined),
    ).toBe(false);
  });

  it('does not warn for white-to-white links when directions match', () => {
    const link = createWireLink(
      baseWire('a', { color: 'white', manualDirection: 'toward' }),
      'end',
      baseWire('b', { color: 'white', manualDirection: 'toward' }),
      'end',
    );
    const resolved = resolveDirections({
      ...createEmptyJob().diagram,
      wires: [
        baseWire('a', { color: 'white', manualDirection: 'toward' }),
        baseWire('b', { color: 'white', manualDirection: 'toward' }),
      ],
      wireLinks: [link],
    });
    expect(isDirectionOpposedLink(link, resolved.get('a'), resolved.get('b'))).toBe(false);
  });

  it('warns when two switch legs both pull flow from the link', () => {
    const diagram = {
      ...createEmptyJob().diagram,
      switches: [
        {
          id: 'sw1',
          label: '',
          x: 0,
          y: 0,
          width: 96,
          height: 48,
          terminalCount: 2 as const,
          position: 'closed' as const,
        },
      ],
      deviceNodes: [
        { id: 'n0', deviceKind: 'switch' as const, deviceId: 'sw1', slot: 0 },
        { id: 'n1', deviceKind: 'switch' as const, deviceId: 'sw1', slot: 1 },
      ],
      conduits: [
        {
          id: 'c0',
          kind: 'device' as const,
          label: '',
          deviceNodeId: 'n0',
          wireIds: ['w0'],
        },
        {
          id: 'c1',
          kind: 'device' as const,
          label: '',
          deviceNodeId: 'n1',
          wireIds: ['w1'],
        },
      ],
      wires: [
        baseWire('w0', { conduitId: 'c0', manualDirection: 'toward' }),
        baseWire('w1', { conduitId: 'c1', manualDirection: 'toward' }),
      ],
      wireLinks: [
        createWireLink(baseWire('w0'), 'end', baseWire('w1'), 'end'),
      ],
    };
    const resolved = resolveDirections(diagram);
    const link = diagram.wireLinks[0]!;
    expect(isDirectionOpposedLink(link, resolved.get('w0'), resolved.get('w1'))).toBe(true);
  });

  it('does not warn when switch legs both flow out and match', () => {
    const diagram = {
      ...createEmptyJob().diagram,
      switches: [
        {
          id: 'sw1',
          label: '',
          x: 0,
          y: 0,
          width: 96,
          height: 48,
          terminalCount: 2 as const,
          position: 'closed' as const,
        },
      ],
      deviceNodes: [
        { id: 'n0', deviceKind: 'switch' as const, deviceId: 'sw1', slot: 0 },
        { id: 'n1', deviceKind: 'switch' as const, deviceId: 'sw1', slot: 1 },
      ],
      conduits: [
        {
          id: 'c0',
          kind: 'device' as const,
          label: '',
          deviceNodeId: 'n0',
          wireIds: ['w0'],
        },
        {
          id: 'c1',
          kind: 'device' as const,
          label: '',
          deviceNodeId: 'n1',
          wireIds: ['w1'],
        },
      ],
      wires: [
        baseWire('w0', { conduitId: 'c0', manualDirection: 'away' }),
        baseWire('w1', { conduitId: 'c1', manualDirection: 'away' }),
      ],
      wireLinks: [
        createWireLink(baseWire('w0'), 'end', baseWire('w1'), 'end'),
      ],
    };
    const resolved = resolveDirections(diagram);
    const link = diagram.wireLinks[0]!;
    expect(isDirectionOpposedLink(link, resolved.get('w0'), resolved.get('w1'))).toBe(false);
  });

  it('still warns for a head-on white/black link (only white-to-white is suppressed)', () => {
    const link = createWireLink(
      baseWire('w0', { color: 'white', manualDirection: 'toward' }),
      'end',
      baseWire('w1', { color: 'black', manualDirection: 'toward' }),
      'end',
    );
    const resolved = resolveDirections({
      ...createEmptyJob().diagram,
      wires: [
        baseWire('w0', { color: 'white', manualDirection: 'toward' }),
        baseWire('w1', { color: 'black', manualDirection: 'toward' }),
      ],
      wireLinks: [link],
    });
    expect(isDirectionOpposedLink(link, resolved.get('w0'), resolved.get('w1'))).toBe(true);
  });
});
