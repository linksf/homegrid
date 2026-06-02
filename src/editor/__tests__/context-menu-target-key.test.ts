import { describe, expect, it } from 'vitest';
import { contextMenuTargetKey } from '../context-menu-target-key';

describe('contextMenuTargetKey', () => {
  it('deduplicates wire targets by id', () => {
    expect(contextMenuTargetKey({ kind: 'wire', wireId: 'a' })).toBe('wire:a');
    expect(contextMenuTargetKey({ kind: 'wire', wireId: 'a' })).toBe(
      contextMenuTargetKey({ kind: 'wire', wireId: 'a' }),
    );
  });

  it('encodes anchor targets with box and anchor', () => {
    expect(contextMenuTargetKey({ kind: 'junctionAnchor', boxId: 'b1', anchor: 'top-left' })).toBe(
      'anchor:b1:top-left',
    );
  });
});
