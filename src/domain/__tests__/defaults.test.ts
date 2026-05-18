import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';

describe('createEmptyJob', () => {
  it('creates exactly one breaker-type junction box', () => {
    const job = createEmptyJob();
    const breakerBoxes = job.diagram.junctionBoxes.filter((b) => b.type === 'breaker');
    expect(breakerBoxes).toHaveLength(1);
  });
});
