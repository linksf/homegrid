import { describe, expect, it } from 'vitest';
import { hitTargetPriority, sortHitCandidates } from '../hit-priority';

describe('hitTargetPriority', () => {
  it('prefers anchors over wires and boxes', () => {
    expect(hitTargetPriority({ kind: 'junctionAnchor', boxId: 'b', anchor: 'top-left' })).toBeLessThan(
      hitTargetPriority({ kind: 'wire', wireId: 'w' }),
    );
    expect(hitTargetPriority({ kind: 'wire', wireId: 'w' })).toBeLessThan(
      hitTargetPriority({ kind: 'junctionBox', boxId: 'b' }),
    );
    expect(hitTargetPriority({ kind: 'junctionBox', boxId: 'b' })).toBeLessThan(
      hitTargetPriority({ kind: 'room', roomId: 'r' }),
    );
  });
});

describe('sortHitCandidates', () => {
  it('sorts by priority tier then distance', () => {
    const sorted = sortHitCandidates([
      { target: { kind: 'room', roomId: 'r' }, dist: 1 },
      { target: { kind: 'junctionAnchor', boxId: 'b', anchor: 'top-left' }, dist: 50 },
      { target: { kind: 'wire', wireId: 'w' }, dist: 5 },
    ]);
    expect(sorted[0]?.target.kind).toBe('junctionAnchor');
    expect(sorted[1]?.target.kind).toBe('wire');
    expect(sorted[2]?.target.kind).toBe('room');
  });

  it('prefers hub over anchors when preferHub is set', () => {
    const sorted = sortHitCandidates(
      [
        { target: { kind: 'junctionAnchor', boxId: 'b', anchor: 'top-left' }, dist: 1 },
        { target: { kind: 'hub', hubId: 'h' }, dist: 20 },
      ],
      { preferHub: true },
    );
    expect(sorted[0]?.target.kind).toBe('hub');
  });
});
