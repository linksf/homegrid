import { nanoid } from 'nanoid';
import type { Breaker, Diagram, JunctionBox, Wire, WireLink } from './types';
import { isWhiteMismatch } from './warnings';

export const MIN_JUNCTION_SIZE = Object.freeze({
  width: 96,
  height: 72,
});

export const DEFAULT_JUNCTION_SIZE = Object.freeze({
  width: 168,
  height: 126,
});

function clampBoxSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(MIN_JUNCTION_SIZE.width, width),
    height: Math.max(MIN_JUNCTION_SIZE.height, height),
  };
}

/** Adds a normal junction box centered on the placement coordinate in world SVG space. */
export function addJunctionBox(diagram: Diagram, worldX: number, worldY: number): Diagram {
  const normalCount = diagram.junctionBoxes.filter((j) => j.type === 'normal').length;

  const { width: w, height: h } = DEFAULT_JUNCTION_SIZE;
  const junction: JunctionBox = {
    id: nanoid(),
    type: 'normal',
    label: `J-box ${normalCount + 1}`,
    x: worldX - w / 2,
    y: worldY - h / 2,
    width: w,
    height: h,
  };

  return {
    ...diagram,
    junctionBoxes: [...diagram.junctionBoxes, junction],
  };
}

export function moveJunctionBox(diagram: Diagram, junctionId: string, x: number, y: number): Diagram {
  return {
    ...diagram,
    junctionBoxes: diagram.junctionBoxes.map((box) =>
      box.id === junctionId
        ? {
            ...box,
            x,
            y,
          }
        : box,
    ),
  };
}

/** Updates geometry while enforcing diagram minimum widths/heights. */
export function resizeJunctionBox(
  diagram: Diagram,
  junctionId: string,
  patch: Partial<Pick<JunctionBox, 'x' | 'y' | 'width' | 'height'>>,
): Diagram {
  return {
    ...diagram,
    junctionBoxes: diagram.junctionBoxes.map((box) => {
      if (box.id !== junctionId) return box;

      const merged = {
        ...box,
        ...patch,
      };

      const { width, height } = clampBoxSize(merged.width, merged.height);

      return {
        ...merged,
        width,
        height,
      };
    }),
  };
}

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
