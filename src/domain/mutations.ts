import { nanoid } from 'nanoid';
import type { Wire, WireLink } from './types';
import { isWhiteMismatch } from './warnings';

export function createWireLink(a: Wire, b: Wire): WireLink {
  const [wireIdA, wireIdB] = [a.id, b.id].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return {
    id: nanoid(),
    wireIdA,
    wireIdB,
    whiteMismatchWarning: isWhiteMismatch(a, b),
  };
}
