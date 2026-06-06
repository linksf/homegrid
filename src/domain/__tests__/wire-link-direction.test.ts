import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addWireLinkToDiagram, addLocalConduit } from '../mutations';
import { addJunctionBox } from '../mutations';
import { tieSegmentFlowDirection, wireChevronTrim, wireLinkFlowDirection } from '../wire-link-utils';
import type { WireLink } from '../types';

function link(overrides: Partial<WireLink> & Pick<WireLink, 'wireIdA' | 'wireIdB'>): WireLink {
  return {
    id: 'l1',
    endpointA: 'end',
    endpointB: 'end',
    ...overrides,
  };
}

describe('wireLinkFlowDirection', () => {
  it('shows flow along the link when only wire A feeds it', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'hot', wireIdB: 'load' }),
      { resolvedDirection: 'away' },
      undefined,
    );
    expect(result).toEqual({ direction: 'away', conflict: false });
  });

  it('maps wire B end-endpoint flow onto the link orientation', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'hot', wireIdB: 'load' }),
      undefined,
      { resolvedDirection: 'toward' },
    );
    expect(result).toEqual({ direction: 'away', conflict: false });
  });

  it('accounts for a start-endpoint link on wire A', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'return', wireIdB: 'load', endpointA: 'start' }),
      { resolvedDirection: 'toward' },
      undefined,
    );
    expect(result).toEqual({ direction: 'away', conflict: false });
  });

  it('flags conflict when both wires push flow into the link', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'a', wireIdB: 'b' }),
      { resolvedDirection: 'away', color: 'black' },
      { resolvedDirection: 'away', color: 'black' },
    );
    expect(result.direction).toBe('away');
    expect(result.conflict).toBe(true);
  });

  it('keeps hub/device tie arrows continuous when flow exits the wire end', () => {
    // Wire polyline runs toward its end; hub tie runs hub→wire end.
    expect(tieSegmentFlowDirection('away', 'end', 'end')).toBe('toward');
  });

  it('keeps hub/device tie arrows continuous when flow enters the wire end', () => {
    expect(tieSegmentFlowDirection('toward', 'end', 'end')).toBe('away');
  });

  it('shows flow on white-to-white links when both sides agree', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'a', wireIdB: 'b' }),
      { resolvedDirection: 'toward', color: 'white' },
      { resolvedDirection: 'away', color: 'white' },
    );
    expect(result.direction).toBe('toward');
    expect(result.conflict).toBe(false);
  });

  it('trims chevrons near wire links and hub ties', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 100, 100);
    const boxId = diagram.junctionBoxes.find((b) => b.type === 'normal')!.id;
    diagram = addLocalConduit(diagram, { junctionBoxId: boxId, anchor: 'middle-right', wireColors: ['black'] });
    const wireA = diagram.conduits.find((c) => c.kind === 'local')!.wireIds[0]!;
    diagram = addLocalConduit(diagram, { junctionBoxId: boxId, anchor: 'middle-left', wireColors: ['black'] });
    const wireB = diagram.conduits.find((c) => c.kind === 'local' && c.wireIds[0] !== wireA)!.wireIds[0]!;
    diagram = addWireLinkToDiagram(diagram, wireA, 'end', wireB, 'end');

    expect(wireChevronTrim(diagram, wireA).trimEnd).toBeGreaterThan(0);
    expect(wireChevronTrim(diagram, wireB).trimEnd).toBeGreaterThan(0);
  });

  it('skips link arrows on opposing white-to-white splices', () => {
    const result = wireLinkFlowDirection(
      link({ wireIdA: 'a', wireIdB: 'b' }),
      { resolvedDirection: 'toward', color: 'white' },
      { resolvedDirection: 'toward', color: 'white' },
    );
    expect(result.direction).toBeNull();
    expect(result.conflict).toBe(false);
  });
});
