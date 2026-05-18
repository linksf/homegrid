import type { Wire } from './types';

export function isWhiteMismatch(a: Wire, b: Wire): boolean {
  const aWhite = a.color === 'white';
  const bWhite = b.color === 'white';
  return aWhite !== bWhite;
}
