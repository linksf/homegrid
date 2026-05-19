import { anchorPoint } from './anchors';
import { nanoid } from 'nanoid';
import type {
  AnchorPosition,
  Conduit,
  ConduitBase,
  Diagram,
  Hub,
  HubBridge,
  JunctionBox,
  Wire,
  WireColor,
  WireLink,
} from './types';
import { isWhiteMismatch } from './warnings';
import { isBreakerSeededWire } from './breaker-conduit';
import {
  firstAvailableHubSlot,
  HUB_SLOT_COUNT,
  hubById,
  hubWorldPoint,
} from './hub-geometry';
import {
  breakerConduitPathPoints,
  deviceConduitPathPoints,
  localConduitPathPoints,
} from './conduit-geometry';
import { wireLinkForWire } from './wire-link-utils';
import { defaultFourPointPath } from './path-editing';
import { chordPerpendicular, orthogonalRoute } from './orthogonal-path';
import { rebuildConduitPathsPreservingFreeEnds } from './path-routing';
import { materializeWirePath, rebuildWirePathsPreservingTips, wireFarTip } from './wire-routing';
import { deviceNodeById } from './device-node-geometry';

export { moveConduitJoint } from './path-routing';
export { wireLinkForWire } from './wire-link-utils';
export {
  breakerConduitPathPoints,
  deviceConduitPathPoints,
  localConduitPathPoints,
  LOCAL_CONDUIT_STUB_LENGTH,
  rebuildDeviceConduitPathsForDevice,
} from './conduit-geometry';

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
  const { width: w, height: h } = DEFAULT_JUNCTION_SIZE;
  const junction: JunctionBox = {
    id: nanoid(),
    type: 'normal',
    label: '',
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

function conduitTouchesJunction(conduit: Conduit, junctionId: string): boolean {
  if (conduit.kind === 'local' || conduit.kind === 'breaker') {
    return conduit.junctionBoxId === junctionId;
  }
  if (conduit.kind === 'span') {
    return conduit.junctionBoxIdA === junctionId || conduit.junctionBoxIdB === junctionId;
  }
  return false;
}

function wireIdsOnJunction(diagram: Diagram, junctionId: string): Set<string> {
  const ids = new Set<string>();
  for (const conduit of diagram.conduits) {
    if (!conduitTouchesJunction(conduit, junctionId)) continue;
    for (const wireId of conduit.wireIds) {
      ids.add(wireId);
    }
  }
  for (const breaker of diagram.breakers) {
    if (breaker.junctionBoxId !== junctionId) continue;
    ids.add(breaker.blackWireId);
    ids.add(breaker.whiteWireId);
  }
  return ids;
}

/** Keeps stored conduit and wire-link geometry aligned when a junction box is dragged. */
function shiftLayoutForJunctionMove(diagram: Diagram, junctionId: string): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === junctionId);
  if (!box) return diagram;

  const conduitPaths = { ...diagram.layout.conduitPaths };

  for (const conduit of diagram.conduits) {
    const entry = conduitPaths[conduit.id];
    if (!entry?.points?.length) continue;

    if (conduit.kind === 'span') {
      const boxA = diagram.junctionBoxes.find((j) => j.id === conduit.junctionBoxIdA);
      const boxB = diagram.junctionBoxes.find((j) => j.id === conduit.junctionBoxIdB);
      if (boxA && boxB) {
        const start = anchorPoint(boxA, conduit.anchorA);
        const end = anchorPoint(boxB, conduit.anchorB);
        conduitPaths[conduit.id] = { points: orthogonalRoute(start, end) };
      }
      continue;
    }

  }

  let withConduitPaths: Diagram = {
    ...diagram,
    layout: { ...diagram.layout, conduitPaths },
  };
  withConduitPaths = rebuildConduitPathsPreservingFreeEnds(withConduitPaths);
  withConduitPaths = rebuildWirePathsPreservingTips(withConduitPaths);

  const affectedWireIds = wireIdsOnJunction(withConduitPaths, junctionId);
  const wireLinkPaths = { ...withConduitPaths.layout.wireLinkPaths };

  for (const link of withConduitPaths.wireLinks) {
    if (!affectedWireIds.has(link.wireIdA) && !affectedWireIds.has(link.wireIdB)) {
      continue;
    }
    const wa = withConduitPaths.wires.find((w) => w.id === link.wireIdA);
    const wb = withConduitPaths.wires.find((w) => w.id === link.wireIdB);
    if (!wa || !wb) continue;

    const pa = wireFarTip(withConduitPaths, wa);
    const pb = wireFarTip(withConduitPaths, wb);
    if (!pa || !pb) continue;

    wireLinkPaths[link.id] = { points: defaultFourPointPath(pa, pb) };
  }

  const hubBridgePaths = { ...withConduitPaths.layout.hubBridgePaths };
  for (const bridge of withConduitPaths.hubBridges) {
    const ha = hubById(withConduitPaths, bridge.hubIdA);
    const hb = hubById(withConduitPaths, bridge.hubIdB);
    if (!ha || !hb) continue;
    if (ha.junctionBoxId !== junctionId && hb.junctionBoxId !== junctionId) continue;
    const boxA = withConduitPaths.junctionBoxes.find((j) => j.id === ha.junctionBoxId);
    const boxB = withConduitPaths.junctionBoxes.find((j) => j.id === hb.junctionBoxId);
    if (!boxA || !boxB) continue;
    hubBridgePaths[bridge.id] = {
      points: orthogonalRoute(hubWorldPoint(boxA, ha), hubWorldPoint(boxB, hb)),
    };
  }

  return {
    ...withConduitPaths,
    layout: { ...withConduitPaths.layout, wireLinkPaths, hubBridgePaths },
  };
}

export function wiresOnHub(diagram: Diagram, hubId: string): Wire[] {
  return diagram.wires.filter((w) => w.hubId === hubId);
}

export function moveJunctionBox(diagram: Diagram, junctionId: string, x: number, y: number): Diagram {
  const box = diagram.junctionBoxes.find((b) => b.id === junctionId);
  if (!box) return diagram;

  const dx = x - box.x;
  const dy = y - box.y;
  if (dx === 0 && dy === 0) return diagram;

  const junctionBoxes = diagram.junctionBoxes.map((b) =>
    b.id === junctionId ? { ...b, x, y } : b,
  );

  return shiftLayoutForJunctionMove({ ...diagram, junctionBoxes }, junctionId);
}

/** Updates geometry while enforcing diagram minimum widths/heights. */
export function resizeJunctionBox(
  diagram: Diagram,
  junctionId: string,
  patch: Partial<Pick<JunctionBox, 'x' | 'y' | 'width' | 'height'>>,
): Diagram {
  const next = {
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
  return refreshHubBridgePaths(next);
}

export function updateJunctionBox(
  diagram: Diagram,
  junctionId: string,
  patch: Partial<Pick<JunctionBox, 'label'>>,
): Diagram {
  return {
    ...diagram,
    junctionBoxes: diagram.junctionBoxes.map((box) =>
      box.id === junctionId ? { ...box, ...patch } : box,
    ),
  };
}

export function updateConduit(
  diagram: Diagram,
  conduitId: string,
  patch: Partial<Pick<ConduitBase, 'label'>>,
): Diagram {
  return {
    ...diagram,
    conduits: diagram.conduits.map((c) => (c.id === conduitId ? { ...c, ...patch } : c)),
  };
}

export function updateWire(
  diagram: Diagram,
  wireId: string,
  patch: Partial<Pick<Wire, 'label' | 'manualDirection'>>,
): Diagram {
  return {
    ...diagram,
    wires: diagram.wires.map((w) => {
      if (w.id !== wireId) return w;
      const label = patch.label !== undefined ? patch.label : w.label;
      const manualDirection = isBreakerSeededWire(diagram, w)
        ? null
        : patch.manualDirection !== undefined
          ? patch.manualDirection
          : w.manualDirection;
      return { ...w, label, manualDirection };
    }),
  };
}

const BREAKER_CONDUIT_ANCHORS: AnchorPosition[] = [
  'middle-left',
  'center',
  'middle-right',
  'top-center',
  'bottom-center',
];

/** Adds a breaker-panel circuit (black + white) that seeds wire direction. */
export function addBreakerConduit(
  diagram: Diagram,
  params: { junctionBoxId: string; anchor: AnchorPosition; label?: string },
): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === params.junctionBoxId);
  if (!box || box.type !== 'breaker') {
    throw new Error(`No breaker junction box with id ${params.junctionBoxId}`);
  }

  const conduitId = nanoid();
  const blackWireId = nanoid();
  const whiteWireId = nanoid();

  const newWires: Wire[] = [
    {
      id: blackWireId,
      color: 'black',
      label: defaultWireLabel('black', 1),
      conduitId,
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    },
    {
      id: whiteWireId,
      color: 'white',
      label: defaultWireLabel('white', 1),
      conduitId,
      breakerId: null,
      hubId: null,
      deviceNodeId: null,
      manualDirection: null,
    },
  ];

  const conduit = {
    id: conduitId,
    kind: 'breaker' as const,
    label: params.label ?? '',
    junctionBoxId: params.junctionBoxId,
    anchor: params.anchor,
    wireIds: [blackWireId, whiteWireId],
  };

  return {
    ...diagram,
    conduits: [...diagram.conduits, conduit],
    wires: [...diagram.wires, ...newWires],
    layout: {
      ...diagram.layout,
      conduitPaths: {
        ...diagram.layout.conduitPaths,
        [conduitId]: { points: breakerConduitPathPoints(box, params.anchor) },
      },
    },
  };
}

export function addBreaker(diagram: Diagram, breakerBoxId: string): Diagram {
  const count = diagram.conduits.filter(
    (c) => c.kind === 'breaker' && c.junctionBoxId === breakerBoxId,
  ).length;
  const anchor = BREAKER_CONDUIT_ANCHORS[count % BREAKER_CONDUIT_ANCHORS.length]!;
  return addBreakerConduit(diagram, { junctionBoxId: breakerBoxId, anchor });
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
  if (wa.hubId || wb.hubId || wa.deviceNodeId || wb.deviceNodeId) {
    throw new Error('A wire connected to a hub or terminal cannot also use a wire-to-wire link');
  }
  if (wireLinkForWire(diagram, wireIdA) || wireLinkForWire(diagram, wireIdB)) {
    throw new Error('Each wire can have only one wire-to-wire connection');
  }

  const sortedPair = [wireIdA, wireIdB].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const [idA, idB] = sortedPair;
  const already = diagram.wireLinks.some((l) => l.wireIdA === idA && l.wireIdB === idB);
  if (already) {
    return diagram;
  }

  const link = createWireLink(wa, wb);
  let withPaths = materializeWirePath(diagram, wa.id);
  withPaths = materializeWirePath(withPaths, wb.id);

  const pa = wireFarTip(withPaths, wa);
  const pb = wireFarTip(withPaths, wb);
  if (!pa || !pb) {
    throw new Error('Cannot place wire link: missing wire geometry');
  }

  return {
    ...withPaths,
    wireLinks: [...withPaths.wireLinks, link],
    layout: {
      ...withPaths.layout,
      wireLinkPaths: {
        ...withPaths.layout.wireLinkPaths,
        [link.id]: { points: defaultFourPointPath(pa, pb) },
      },
    },
  };
}

function defaultWireLabel(_color: WireColor, _index1: number): string {
  return '';
}

export function addLocalConduit(
  diagram: Diagram,
  params: { junctionBoxId: string; anchor: AnchorPosition; wireColors: WireColor[] },
): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === params.junctionBoxId);
  if (!box) {
    throw new Error(`Unknown junction box ${params.junctionBoxId}`);
  }
  if (box.type === 'breaker') {
    throw new Error('Use breaker conduits inside a breaker panel (not local conduits)');
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
    hubId: null,
    deviceNodeId: null,
    manualDirection: null,
  }));

  const conduit = {
    id: conduitId,
    kind: 'local' as const,
    label: '',
    junctionBoxId: params.junctionBoxId,
    anchor: params.anchor,
    wireIds: newWires.map((w) => w.id),
  };

  const center = localConduitPathPoints(box, params.anchor);
  const wirePaths = { ...(diagram.layout.wirePaths ?? {}) };
  const anchor = center[0]!;
  const stubEnd = center[center.length - 1]!;
  const perp = chordPerpendicular(center);
  newWires.forEach((w, i) => {
    const scalar = (i - (newWires.length - 1) / 2) * 16;
    const tip = {
      x: stubEnd.x + perp.x * scalar,
      y: stubEnd.y + perp.y * scalar,
    };
    wirePaths[w.id] = { points: defaultFourPointPath(anchor, tip) };
  });

  return {
    ...diagram,
    conduits: [...diagram.conduits, conduit],
    wires: [...diagram.wires, ...newWires],
    layout: {
      ...diagram.layout,
      conduitPaths: { ...diagram.layout.conduitPaths, [conduitId]: { points: center } },
      wirePaths,
    },
  };
}

export function addDeviceConduit(
  diagram: Diagram,
  params: { deviceNodeId: string; wireColors: WireColor[] },
): Diagram {
  const node = deviceNodeById(diagram, params.deviceNodeId);
  if (!node) {
    throw new Error(`Unknown device terminal ${params.deviceNodeId}`);
  }

  if (params.wireColors.length < 1 || params.wireColors.length > 12) {
    throw new Error('Conduit must include between 1 and 12 wires');
  }

  const points = deviceConduitPathPoints(diagram, params.deviceNodeId);
  if (!points) {
    throw new Error('Could not place conduit on this terminal');
  }

  const conduitId = nanoid();
  const newWires: Wire[] = params.wireColors.map((color, idx) => ({
    id: nanoid(),
    color,
    label: defaultWireLabel(color, idx + 1),
    conduitId,
    breakerId: null,
    hubId: null,
    deviceNodeId: null,
    manualDirection: null,
  }));

  const conduit = {
    id: conduitId,
    kind: 'device' as const,
    label: '',
    deviceNodeId: params.deviceNodeId,
    wireIds: newWires.map((w) => w.id),
  };

  const wirePaths = { ...(diagram.layout.wirePaths ?? {}) };
  const anchor = points[0]!;
  const stubEnd = points[points.length - 1]!;
  const perp = chordPerpendicular(points);
  newWires.forEach((w, i) => {
    const scalar = (i - (newWires.length - 1) / 2) * 16;
    const tip = {
      x: stubEnd.x + perp.x * scalar,
      y: stubEnd.y + perp.y * scalar,
    };
    wirePaths[w.id] = { points: defaultFourPointPath(anchor, tip) };
  });

  return {
    ...diagram,
    conduits: [...diagram.conduits, conduit],
    wires: [...diagram.wires, ...newWires],
    layout: {
      ...diagram.layout,
      conduitPaths: { ...diagram.layout.conduitPaths, [conduitId]: { points } },
      wirePaths,
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
    hubId: null,
    deviceNodeId: null,
    manualDirection: null,
  }));

  const conduit = {
    id: conduitId,
    kind: 'span' as const,
    label: '',
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
        [conduitId]: { points: orthogonalRoute(start, end) },
      },
    },
  };
}

function removeWireLinks(
  diagram: Diagram,
  shouldRemove: (link: WireLink) => boolean,
): Diagram {
  const wireLinks: WireLink[] = [];
  const wireLinkPaths = { ...diagram.layout.wireLinkPaths };
  const wireLinkOffsets = { ...(diagram.layout.wireLinkOffsets ?? {}) };

  for (const link of diagram.wireLinks) {
    if (shouldRemove(link)) {
      delete wireLinkPaths[link.id];
      delete wireLinkOffsets[link.id];
    } else {
      wireLinks.push(link);
    }
  }

  return {
    ...diagram,
    wireLinks,
    layout: { ...diagram.layout, wireLinkPaths, wireLinkOffsets },
  };
}

/** Removes a wire-to-wire connection. */
export function deleteWireLink(diagram: Diagram, linkId: string): Diagram {
  return removeWireLinks(diagram, (l) => l.id === linkId);
}

/** Removes a single conduit wire and any links attached to it. Breaker wires cannot be deleted this way. */
export function deleteWire(diagram: Diagram, wireId: string): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return diagram;
  if (isBreakerSeededWire(diagram, wire)) {
    throw new Error('Delete the breaker conduit bundle instead of individual panel wires.');
  }

  let next = removeWireLinks(diagram, (l) => l.wireIdA === wireId || l.wireIdB === wireId);
  const { [wireId]: _wo, ...wireOffsets } = next.layout.wireOffsets ?? {};
  next = {
    ...next,
    wires: next.wires.filter((w) => w.id !== wireId),
    conduits: next.conduits.map((c) => ({
      ...c,
      wireIds: c.wireIds.filter((id) => id !== wireId),
    })),
    layout: { ...next.layout, wireOffsets },
  };
  return next;
}

/** Removes a conduit bundle, all of its wires, and any wire links involving those wires. */
export function deleteConduit(diagram: Diagram, conduitId: string): Diagram {
  const conduit = diagram.conduits.find((c) => c.id === conduitId);
  if (!conduit) return diagram;

  const wireIds = new Set(conduit.wireIds);
  let next = removeWireLinks(
    diagram,
    (l) => wireIds.has(l.wireIdA) || wireIds.has(l.wireIdB),
  );

  const { [conduitId]: _removed, ...conduitPaths } = next.layout.conduitPaths;
  const { [conduitId]: _co, ...conduitOffsets } = next.layout.conduitOffsets ?? {};
  const wireOffsets = { ...(next.layout.wireOffsets ?? {}) };
  const wirePaths = { ...(next.layout.wirePaths ?? {}) };
  for (const id of wireIds) {
    delete wireOffsets[id];
    delete wirePaths[id];
  }

  return {
    ...next,
    conduits: next.conduits.filter((c) => c.id !== conduitId),
    wires: next.wires.filter((w) => !wireIds.has(w.id)),
    layout: { ...next.layout, conduitPaths, conduitOffsets, wireOffsets, wirePaths },
  };
}

function hubBridgePath(diagram: Diagram, bridge: HubBridge): { x: number; y: number }[] | null {
  const ha = hubById(diagram, bridge.hubIdA);
  const hb = hubById(diagram, bridge.hubIdB);
  if (!ha || !hb) return null;
  const boxA = diagram.junctionBoxes.find((j) => j.id === ha.junctionBoxId);
  const boxB = diagram.junctionBoxes.find((j) => j.id === hb.junctionBoxId);
  if (!boxA || !boxB) return null;
  return orthogonalRoute(hubWorldPoint(boxA, ha), hubWorldPoint(boxB, hb));
}

function removeHubBridges(
  diagram: Diagram,
  shouldRemove: (bridge: HubBridge) => boolean,
): Diagram {
  const hubBridges: HubBridge[] = [];
  const hubBridgePaths = { ...diagram.layout.hubBridgePaths };

  for (const bridge of diagram.hubBridges) {
    if (shouldRemove(bridge)) {
      delete hubBridgePaths[bridge.id];
    } else {
      hubBridges.push(bridge);
    }
  }

  return {
    ...diagram,
    hubBridges,
    layout: { ...diagram.layout, hubBridgePaths },
  };
}

/** Adds a hub on the first free slot inside a junction box (max four per box). */
export function addHub(diagram: Diagram, junctionBoxId: string): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === junctionBoxId);
  if (!box) {
    throw new Error(`Unknown junction box ${junctionBoxId}`);
  }

  const slot = firstAvailableHubSlot(diagram, junctionBoxId);
  if (slot == null) {
    throw new Error(`Junction box already has the maximum of ${HUB_SLOT_COUNT} hubs`);
  }

  const hub: Hub = {
    id: nanoid(),
    junctionBoxId,
    label: '',
    slot,
  };

  return {
    ...diagram,
    hubs: [...diagram.hubs, hub],
  };
}

export function updateHub(
  diagram: Diagram,
  hubId: string,
  patch: Partial<Pick<Hub, 'label'>>,
): Diagram {
  return {
    ...diagram,
    hubs: diagram.hubs.map((h) => (h.id === hubId ? { ...h, ...patch } : h)),
  };
}

function refreshHubBridgePaths(diagram: Diagram): Diagram {
  const hubBridgePaths = { ...diagram.layout.hubBridgePaths };
  for (const bridge of diagram.hubBridges) {
    const pts = hubBridgePath(diagram, bridge);
    if (pts) {
      hubBridgePaths[bridge.id] = { points: pts };
    }
  }
  return { ...diagram, layout: { ...diagram.layout, hubBridgePaths } };
}

/** Attaches a wire to a hub (replaces any prior hub or blocks if wire-linked). */
export function attachWireToHub(diagram: Diagram, hubId: string, wireId: string): Diagram {
  const hub = hubById(diagram, hubId);
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!hub || !wire) {
    throw new Error('Hub or wire not found');
  }
  if (wireLinkForWire(diagram, wireId)) {
    throw new Error('Disconnect the wire-to-wire link before attaching to a hub');
  }
  const wires = diagram.wires.map((w) => {
    if (w.id !== wireId) return w;
    return { ...w, hubId };
  });

  return { ...diagram, wires };
}

export function detachWireFromHub(diagram: Diagram, wireId: string): Diagram {
  const wires = diagram.wires.map((w) => (w.id === wireId ? { ...w, hubId: null } : w));
  return { ...diagram, wires };
}

export function addHubBridge(diagram: Diagram, hubIdA: string, hubIdB: string): Diagram {
  const ha = hubById(diagram, hubIdA);
  const hb = hubById(diagram, hubIdB);
  if (!ha || !hb) {
    throw new Error('Hub not found');
  }
  if (hubIdA === hubIdB) {
    throw new Error('Cannot bridge a hub to itself');
  }
  if (ha.junctionBoxId === hb.junctionBoxId) {
    throw new Error('Use one hub and attach multiple wires inside the same junction box');
  }

  const sorted = [hubIdA, hubIdB].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const [idLo, idHi] = sorted;
  const exists = diagram.hubBridges.some((b) => {
    const pair = [b.hubIdA, b.hubIdB].sort((a, c) => (a < c ? -1 : a > c ? 1 : 0));
    return pair[0] === idLo && pair[1] === idHi;
  });
  if (exists) {
    return diagram;
  }

  const bridge: HubBridge = { id: nanoid(), hubIdA: idLo, hubIdB: idHi };
  const points = hubBridgePath(diagram, bridge);
  if (!points) {
    throw new Error('Cannot place hub bridge');
  }

  return {
    ...diagram,
    hubBridges: [...diagram.hubBridges, bridge],
    layout: {
      ...diagram.layout,
      hubBridgePaths: {
        ...diagram.layout.hubBridgePaths,
        [bridge.id]: { points },
      },
    },
  };
}

export function deleteHubBridge(diagram: Diagram, bridgeId: string): Diagram {
  return removeHubBridges(diagram, (b) => b.id === bridgeId);
}

export function deleteHub(diagram: Diagram, hubId: string): Diagram {
  let next = removeHubBridges(diagram, (b) => b.hubIdA === hubId || b.hubIdB === hubId);
  const wires = next.wires.map((w) => (w.hubId === hubId ? { ...w, hubId: null } : w));
  return {
    ...next,
    hubs: next.hubs.filter((h) => h.id !== hubId),
    wires,
  };
}
