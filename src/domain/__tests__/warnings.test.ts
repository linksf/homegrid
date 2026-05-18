import { describe, expect, it } from 'vitest';
import { createWireLink } from '../mutations';
import type { Wire } from '../types';

const white: Wire = {
  id: 'w1',
  color: 'white',
  label: '',
  conduitId: 'c1',
  breakerId: null,
  manualDirection: null,
};
const black: Wire = {
  id: 'w2',
  color: 'black',
  label: '',
  conduitId: 'c1',
  breakerId: null,
  manualDirection: null,
};

describe('createWireLink', () => {
  it('flags whiteMismatchWarning when white connects to non-white', () => {
    const link = createWireLink(white, black);
    expect(link.whiteMismatchWarning).toBe(true);
  });

  it('no warning when both white', () => {
    const link = createWireLink(white, { ...white, id: 'w3' });
    expect(link.whiteMismatchWarning).toBe(false);
  });
});
