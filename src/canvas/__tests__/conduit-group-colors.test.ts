import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import type { ConduitRun, Diagram } from '../../domain/types';
import { CONDUIT_GROUP_PALETTE, conduitGroupColors } from '../conduit-group-colors';

function withRuns(runs: ConduitRun[]): Diagram {
  return { ...createEmptyJob().diagram, conduitRuns: runs };
}

function run(id: string, cableIdA: string, cableIdB: string | null): ConduitRun {
  return { id, cableIdA, cableIdB, wireIds: [] };
}

describe('conduitGroupColors', () => {
  it('returns empty maps when there are no conduit runs', () => {
    const { runColorById, cableColorById } = conduitGroupColors(withRuns([]));
    expect(runColorById.size).toBe(0);
    expect(cableColorById.size).toBe(0);
  });

  it('assigns each run and both its cables the palette color at the run index', () => {
    const diagram = withRuns([
      run('r0', 'cA0', 'cB0'),
      run('r1', 'cA1', 'cB1'),
      run('r2', 'cA2', 'cB2'),
    ]);
    const { runColorById, cableColorById } = conduitGroupColors(diagram);

    for (let i = 0; i < 3; i++) {
      const expected = CONDUIT_GROUP_PALETTE[i]!;
      expect(runColorById.get(`r${i}`)).toBe(expected);
      expect(cableColorById.get(`cA${i}`)).toBe(expected);
      expect(cableColorById.get(`cB${i}`)).toBe(expected);
    }
  });

  it('cycles the palette when there are more runs than colors', () => {
    const len = CONDUIT_GROUP_PALETTE.length;
    const runs = Array.from({ length: len + 2 }, (_, i) => run(`r${i}`, `cA${i}`, `cB${i}`));
    const { runColorById } = conduitGroupColors(withRuns(runs));

    expect(runColorById.get('r0')).toBe(CONDUIT_GROUP_PALETTE[0]);
    expect(runColorById.get(`r${len}`)).toBe(CONDUIT_GROUP_PALETTE[0]);
    expect(runColorById.get(`r${len + 1}`)).toBe(CONDUIT_GROUP_PALETTE[1]);
  });

  it('omits cables that are not part of any run and handles a null second cable', () => {
    const diagram = withRuns([run('r0', 'cA0', null)]);
    const { cableColorById } = conduitGroupColors(diagram);

    expect(cableColorById.get('cA0')).toBe(CONDUIT_GROUP_PALETTE[0]);
    expect(cableColorById.has('someOtherCable')).toBe(false);
    expect(cableColorById.size).toBe(1);
  });

  it('is deterministic for the same input', () => {
    const make = () => withRuns([run('r0', 'cA0', 'cB0'), run('r1', 'cA1', 'cB1')]);
    const a = conduitGroupColors(make());
    const b = conduitGroupColors(make());
    expect([...a.runColorById]).toEqual([...b.runColorById]);
    expect([...a.cableColorById]).toEqual([...b.cableColorById]);
  });
});
