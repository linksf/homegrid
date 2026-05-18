import { nanoid } from 'nanoid';
import type { Breaker, Diagram, Wire, WireLink } from './types';
import { isWhiteMismatch } from './warnings';

export function addBreaker(diagram: Diagram, breakerBoxId: string): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === breakerBoxId);
  if (!box || box.type !== 'breaker') {
    throw new Error(`No breaker junction box with id ${breakerBoxId}`);
  }

  const breakerId = nanoid();
  const blackWireId = nanoid();
  const whiteWireId = nanoid();

  const breaker: Breaker = {
    id: breakerId,
    junctionBoxId: breakerBoxId,
    label: `Breaker ${diagram.breakers.length + 1}`,
    blackWireId,
    whiteWireId,
  };

  const wires: Wire[] = [
    {
      id: blackWireId,
      color: 'black',
      label: '',
      conduitId: null,
      breakerId: breakerId,
      manualDirection: null,
    },
    {
      id: whiteWireId,
      color: 'white',
      label: '',
      conduitId: null,
      breakerId: breakerId,
      manualDirection: null,
    },
  ];

  return {
    ...diagram,
    breakers: [...diagram.breakers, breaker],
    wires: [...diagram.wires, ...wires],
  };
}

export function createWireLink(a: Wire, b: Wire): WireLink {
  const [wireIdA, wireIdB] = [a.id, b.id].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return {
    id: nanoid(),
    wireIdA,
    wireIdB,
    whiteMismatchWarning: isWhiteMismatch(a, b),
  };
}
