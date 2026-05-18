import { anchorPoint } from './anchors';
import { nanoid } from 'nanoid';
import type {
  AnchorPosition,
  Breaker,
  Diagram,
  JunctionBox,
  Wire,
  WireColor,
  WireLink,
} from './types';
import { isWhiteMismatch } from './warnings';
import { wireLinkEndpoint } from './wire-geometry';

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

export function addWireLinkToDiagram(diagram: Diagram, wireIdA: string, wireIdB: string): Diagram {
  const wa = diagram.wires.find((w) => w.id === wireIdA);
  const wb = diagram.wires.find((w) => w.id === wireIdB);
  if (!wa || !wb) {
    throw new Error('Wire not found');
  }
  if (wireIdA === wireIdB) {
    throw new Error('Cannot link a wire to itself');
  }

  const sortedPair = [wireIdA, wireIdB].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const [idA, idB] = sortedPair;
  const already = diagram.wireLinks.some((l) => l.wireIdA === idA && l.wireIdB === idB);
  if (already) {
    return diagram;
  }

  const link = createWireLink(wa, wb);
  const pa = wireLinkEndpoint(diagram, wa);
  const pb = wireLinkEndpoint(diagram, wb);
  if (!pa || !pb) {
    throw new Error('Cannot place wire link: missing wire geometry');
  }

  return {
    ...diagram,
    wireLinks: [...diagram.wireLinks, link],
    layout: {
      ...diagram.layout,
      wireLinkPaths: {
        ...diagram.layout.wireLinkPaths,
        [link.id]: { points: [pa, pb] },
      },
    },
  };
}

function defaultWireLabel(color: WireColor, index1: number): string {
  const title = color === 'red' ? 'Red' : color === 'black' ? 'Black' : 'White';
  return `${title} #${index1}`;
}

function outwardNormal(box: JunctionBox, anchor: AnchorPosition): { x: number; y: number } {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const pt = anchorPoint(box, anchor);
  const vx = pt.x - center.x;
  const vy = pt.y - center.y;
  const len = Math.hypot(vx, vy) || 1;
  return { x: vx / len, y: vy / len };
}

export function addLocalConduit(
  diagram: Diagram,
  params: { junctionBoxId: string; anchor: AnchorPosition; wireColors: WireColor[] },
): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === params.junctionBoxId);
  if (!box) {
    throw new Error(`Unknown junction box ${params.junctionBoxId}`);
  }

  if (params.wireColors.length < 1 || params.wireColors.length > 12) {
    throw new Error('Conduit must include between 1 and 12 wires');
  }

  const conduitId = nanoid();
  const newWires: Wire[] = params.wireColors.map((color, idx) => ({
    id: nanoid(),
    color,
    label: defaultWireLabel(color, idx + 1),
    conduitId,
    breakerId: null,
    manualDirection: null,
  }));

  const conduit = {
    id: conduitId,
    kind: 'local' as const,
    label: `Conduit ${diagram.conduits.length + 1}`,
    junctionBoxId: params.junctionBoxId,
    anchor: params.anchor,
    wireIds: newWires.map((w) => w.id),
  };

  const start = anchorPoint(box, params.anchor);
  const norm = outwardNormal(box, params.anchor);
  const stubLength = 140;
  const end = { x: start.x + norm.x * stubLength, y: start.y + norm.y * stubLength };

  return {
    ...diagram,
    conduits: [...diagram.conduits, conduit],
    wires: [...diagram.wires, ...newWires],
    layout: {
      ...diagram.layout,
      conduitPaths: {
        ...diagram.layout.conduitPaths,
        [conduitId]: { points: [start, end] },
      },
    },
  };
}

export function addSpanConduit(
  diagram: Diagram,
  params: {
    junctionBoxIdA: string;
    anchorA: AnchorPosition;
    junctionBoxIdB: string;
    anchorB: AnchorPosition;
    wireColors: WireColor[];
  },
): Diagram {
  const boxA = diagram.junctionBoxes.find((j) => j.id === params.junctionBoxIdA);
  const boxB = diagram.junctionBoxes.find((j) => j.id === params.junctionBoxIdB);
  if (!boxA || !boxB) {
    throw new Error('Junction box missing for span conduit');
  }
  if (params.junctionBoxIdA === params.junctionBoxIdB) {
    throw new Error('Span conduit must connect two different junction boxes');
  }

  if (params.wireColors.length < 1 || params.wireColors.length > 12) {
    throw new Error('Conduit must include between 1 and 12 wires');
  }

  const conduitId = nanoid();
  const newWires: Wire[] = params.wireColors.map((color, idx) => ({
    id: nanoid(),
    color,
    label: defaultWireLabel(color, idx + 1),
    conduitId,
    breakerId: null,
    manualDirection: null,
  }));

  const conduit = {
    id: conduitId,
    kind: 'span' as const,
    label: `Conduit ${diagram.conduits.length + 1}`,
    junctionBoxIdA: params.junctionBoxIdA,
    anchorA: params.anchorA,
    junctionBoxIdB: params.junctionBoxIdB,
    anchorB: params.anchorB,
    wireIds: newWires.map((w) => w.id),
  };

  const start = anchorPoint(boxA, params.anchorA);
  const end = anchorPoint(boxB, params.anchorB);

  return {
    ...diagram,
    conduits: [...diagram.conduits, conduit],
    wires: [...diagram.wires, ...newWires],
    layout: {
      ...diagram.layout,
      conduitPaths: {
        ...diagram.layout.conduitPaths,
        [conduitId]: { points: [start, end] },
      },
    },
  };
}
