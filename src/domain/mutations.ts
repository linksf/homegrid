import { nanoid } from 'nanoid';
import { anchorPoint } from './anchors';
import {
  isBreakerSeededWire,
} from './breaker-cable';
import { GRID_SIZE, snapGridPoint, snapJunctionBoxRect } from './grid';
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
  WireEndpoint,
  WireLink,
} from './types';
import {
  firstAvailableHubSlot,
  HUB_SLOT_COUNT,
  hubById,
  hubWorldPoint,
} from './hub-geometry';
import {
  deviceConduitPathPoints,
  hubConduitPathPoints,
  localConduitPathPoints,
} from './conduit-geometry';
import { wireLinkAtEndpoint, wireLinksForWire, normalizeWireLinkRecord, linkIdentityKey, normalizeWireLink } from './wire-link-utils';
import { defaultFourPointPath, defaultFivePointPath, hasCustomLinkPathShape, normalizeLinkPath } from './path-editing';
import { chordPerpendicular, orthogonalRoute } from './orthogonal-path';
import { rebuildConduitPathsPreservingFreeEnds } from './path-routing';
import {
  materializeWirePath,
  rebuildWirePathsPreservingTips,
  wireEndpointPoint,
  wireEndpointRole,
} from './wire-routing';
import { refreshHubWirePaths } from './hub-wire-geometry';
import { refreshHubBridgePaths } from './hub-bridge-geometry';
import { refreshDeviceWirePaths } from './device-wire-geometry';
import { deviceNodeById, wireIdsOnDeviceTerminal } from './device-node-geometry';

export { moveConduitJoint } from './path-routing';
export { moveHubWireJoint } from './hub-wire-geometry';
export { moveHubBridgeJoint } from './hub-bridge-geometry';
export { wireLinkForWire } from './wire-link-utils';
export {
  breakerConduitPathPoints,
  deviceConduitPathPoints,
  hubConduitPathPoints,
  localConduitPathPoints,
  LOCAL_CONDUIT_STUB_LENGTH,
  rebuildDeviceConduitPathsForDevice,
  rebuildHubConduitPathsForJunction,
} from './conduit-geometry';

export const MIN_JUNCTION_SIZE = Object.freeze({
  width: GRID_SIZE * 8,
  height: GRID_SIZE * 8,
});

export const DEFAULT_JUNCTION_SIZE = Object.freeze({
  width: GRID_SIZE * 14,
  height: GRID_SIZE * 10,
});

function clampBoxSize(width: number, height: number): { width: number; height: number } {
  const snapped = snapJunctionBoxRect({ x: 0, y: 0, width, height });
  return {
    width: Math.max(MIN_JUNCTION_SIZE.width, snapped.width),
    height: Math.max(MIN_JUNCTION_SIZE.height, snapped.height),
  };
}

/** Adds a normal junction box centered on the placement coordinate in world SVG space. */
export function addJunctionBox(diagram: Diagram, worldX: number, worldY: number): Diagram {
  const { width: w, height: h } = DEFAULT_JUNCTION_SIZE;
  const center = snapGridPoint({ x: worldX, y: worldY });
  const rect = snapJunctionBoxRect({
    x: center.x - w / 2,
    y: center.y - h / 2,
    width: w,
    height: h,
  });
  const junction: JunctionBox = {
    id: nanoid(),
    type: 'normal',
    label: '',
    ...rect,
  };

  return {
    ...diagram,
    junctionBoxes: [...diagram.junctionBoxes, junction],
  };
}

function conduitTouchesJunction(conduit: Conduit, junctionId: string): boolean {
  if (conduit.kind === 'local') {
    return conduit.junctionBoxId === junctionId;
  }
  if ((conduit as { kind: string }).kind === 'breaker') {
    return (conduit as unknown as { junctionBoxId: string }).junctionBoxId === junctionId;
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

    const pa = wireEndpointPoint(withConduitPaths, link.wireIdA, link.endpointA ?? 'end');
    const pb = wireEndpointPoint(withConduitPaths, link.wireIdB, link.endpointB ?? 'end');
    if (!pa || !pb) continue;

    const stored = wireLinkPaths[link.id]?.points;
    if (hasCustomLinkPathShape(stored)) {
      wireLinkPaths[link.id] = { points: normalizeLinkPath(stored, pa, pb) };
    } else {
      wireLinkPaths[link.id] = { points: defaultFivePointPath(pa, pb) };
    }
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
    const start = hubWorldPoint(boxA, ha);
    const end = hubWorldPoint(boxB, hb);
    const stored = hubBridgePaths[bridge.id]?.points;
    if (hasCustomLinkPathShape(stored)) {
      hubBridgePaths[bridge.id] = { points: normalizeLinkPath(stored, start, end) };
    } else {
      hubBridgePaths[bridge.id] = { points: defaultFivePointPath(start, end) };
    }
  }

  return refreshDeviceWirePaths(refreshHubWirePaths({
    ...withConduitPaths,
    layout: { ...withConduitPaths.layout, wireLinkPaths, hubBridgePaths },
  }));
}

export function wiresOnHub(diagram: Diagram, hubId: string): Wire[] {
  return diagram.wires.filter((w) => w.hubId === hubId);
}

export function moveJunctionBox(diagram: Diagram, junctionId: string, x: number, y: number): Diagram {
  const box = diagram.junctionBoxes.find((b) => b.id === junctionId);
  if (!box) return diagram;

  const snapped = snapGridPoint({ x, y });
  const dx = snapped.x - box.x;
  const dy = snapped.y - box.y;
  if (dx === 0 && dy === 0) return diagram;

  const junctionBoxes = diagram.junctionBoxes.map((b) =>
    b.id === junctionId ? { ...b, x: snapped.x, y: snapped.y } : b,
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

      const snapped = snapJunctionBoxRect(merged);
      const { width, height } = clampBoxSize(snapped.width, snapped.height);

      return {
        ...merged,
        x: snapped.x,
        y: snapped.y,
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

/** Removes a junction box and all conduits, hubs, and wiring owned by it. */
export function deleteJunctionBox(diagram: Diagram, junctionId: string): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === junctionId);
  if (!box) return diagram;

  const conduitIds = diagram.conduits
    .filter((c) => conduitTouchesJunction(c, junctionId))
    .map((c) => c.id);

  let next = diagram;
  for (const conduitId of conduitIds) {
    next = deleteConduit(next, conduitId);
  }

  for (const hub of next.hubs.filter((h) => h.junctionBoxId === junctionId)) {
    next = deleteHub(next, hub.id);
  }

  return {
    ...next,
    breakers: next.breakers.filter((b) => b.junctionBoxId !== junctionId),
    junctionBoxes: next.junctionBoxes.filter((b) => b.id !== junctionId),
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

export function updateWireColor(diagram: Diagram, wireId: string, color: WireColor): Diagram {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire || isBreakerSeededWire(diagram, wire)) return diagram;
  return {
    ...diagram,
    wires: diagram.wires.map((w) => (w.id === wireId ? { ...w, color } : w)),
  };
}


export function createWireLink(
  a: Wire,
  endpointA: WireEndpoint,
  b: Wire,
  endpointB: WireEndpoint,
): WireLink {
  const sorted = normalizeWireLinkRecord(a.id, endpointA, b.id, endpointB);
  return {
    id: nanoid(),
    ...sorted,
  };
}

export function addWireLinkToDiagram(
  diagram: Diagram,
  wireIdA: string,
  endpointA: WireEndpoint,
  wireIdB: string,
  endpointB: WireEndpoint,
): Diagram {
  const wa = diagram.wires.find((w) => w.id === wireIdA);
  const wb = diagram.wires.find((w) => w.id === wireIdB);
  if (!wa || !wb) {
    throw new Error('Wire not found');
  }
  if (wireIdA === wireIdB) {
    throw new Error('Cannot link a wire to itself');
  }
  if (wa.hubId || wb.hubId) {
    throw new Error('A wire connected to a hub cannot use a wire-to-wire link; connect through the hub instead');
  }
  for (const [wireId, endpoint, cableId] of [
    [wireIdA, endpointA, wa.cableId],
    [wireIdB, endpointB, wb.cableId],
  ] as const) {
    if (cableId && endpoint !== 'end') {
      throw new Error(
        'Wire links attach only at cable exposed free ends (far tip away from the box), not the wall side.',
      );
    }
    if (wireEndpointRole(diagram, wireId, endpoint) !== 'free') {
      throw new Error('That wire end cannot form a wire link.');
    }
  }
  if (wireLinkAtEndpoint(diagram, wireIdA, endpointA) || wireLinkAtEndpoint(diagram, wireIdB, endpointB)) {
    throw new Error('That wire end is already linked');
  }

  const sorted = normalizeWireLinkRecord(wireIdA, endpointA, wireIdB, endpointB);
  const identity = linkIdentityKey(sorted);
  const already = diagram.wireLinks.some((l) => linkIdentityKey(normalizeWireLink(l)) === identity);
  if (already) {
    return diagram;
  }

  const link = createWireLink(wa, endpointA, wb, endpointB);
  let withPaths = materializeWirePath(diagram, wa.id);
  withPaths = materializeWirePath(withPaths, wb.id);

  const pa = wireEndpointPoint(withPaths, link.wireIdA, link.endpointA);
  const pb = wireEndpointPoint(withPaths, link.wireIdB, link.endpointB);
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
        [link.id]: { points: defaultFivePointPath(pa, pb) },
      },
    },
  };
}

function defaultWireLabel(_color: WireColor, _index1: number): string {
  return '';
}

/**
 * @deprecated Replaced by `addCable` and `migrateConduitsToCables`. Kept for tests and migration fixtures only.
 */
export function addLocalConduit(
  diagram: Diagram,
  params: { junctionBoxId: string; anchor: AnchorPosition; wireColors: WireColor[] },
): Diagram {
  const box = diagram.junctionBoxes.find((j) => j.id === params.junctionBoxId);
  if (!box) {
    throw new Error(`Unknown junction box ${params.junctionBoxId}`);
  }
  if (box.type === 'breaker') {
    throw new Error('Use breaker circuits (K) inside a breaker panel, not junction-wall bundles');
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
    cableId: null,
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

  if (wireIdsOnDeviceTerminal(diagram, params.deviceNodeId).length > 0) {
    throw new Error('Terminal already has a wire connection');
  }

  if (params.wireColors.length !== 1) {
    throw new Error('Device terminals accept exactly one conductor per stub conduit');
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
    cableId: null,
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

export function addHubConduit(
  diagram: Diagram,
  params: { hubId: string; wireColors: WireColor[] },
): Diagram {
  const hub = hubById(diagram, params.hubId);
  if (!hub) {
    throw new Error(`Unknown hub ${params.hubId}`);
  }

  if (params.wireColors.length < 1 || params.wireColors.length > 12) {
    throw new Error('Conduit must include between 1 and 12 wires');
  }

  const points = hubConduitPathPoints(diagram, params.hubId);
  if (!points) {
    throw new Error('Could not place conduit on this hub');
  }

  const conduitId = nanoid();
  const newWires: Wire[] = params.wireColors.map((color, idx) => ({
    id: nanoid(),
    color,
    label: defaultWireLabel(color, idx + 1),
    conduitId,
    cableId: null,
    breakerId: null,
    hubId: params.hubId,
    deviceNodeId: null,
    manualDirection: null,
  }));

  const conduit = {
    id: conduitId,
    kind: 'hub' as const,
    label: '',
    hubId: params.hubId,
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

/**
 * @deprecated Replaced by conduit runs linking two cables. Kept for tests and migration fixtures only.
 */
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
    throw new Error('Junction box missing for box-to-box bundle');
  }
  if (params.junctionBoxIdA === params.junctionBoxIdB) {
    throw new Error('Box-to-box bundle must connect two different junction boxes');
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
    cableId: null,
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
  const center = orthogonalRoute(start, end);
  const wirePaths = { ...(diagram.layout.wirePaths ?? {}) };
  const perp = chordPerpendicular(center);
  newWires.forEach((w, i) => {
    const scalar = (i - (newWires.length - 1) / 2) * 16;
    const wireStart = {
      x: start.x + perp.x * scalar,
      y: start.y + perp.y * scalar,
    };
    const wireEnd = {
      x: end.x + perp.x * scalar,
      y: end.y + perp.y * scalar,
    };
    wirePaths[w.id] = { points: defaultFivePointPath(wireStart, wireEnd) };
  });

  return {
    ...diagram,
    conduits: [...diagram.conduits, conduit],
    wires: [...diagram.wires, ...newWires],
    layout: {
      ...diagram.layout,
      conduitPaths: {
        ...diagram.layout.conduitPaths,
        [conduitId]: { points: center },
      },
      wirePaths,
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
    throw new Error('Delete the breaker cable instead of individual panel wires.');
  }

  let next = removeWireLinks(diagram, (l) => l.wireIdA === wireId || l.wireIdB === wireId);
  const { [wireId]: _wo, ...wireOffsets } = next.layout.wireOffsets ?? {};
  const { [wireId]: _hw, ...hubWirePaths } = next.layout.hubWirePaths ?? {};
  next = {
    ...next,
    wires: next.wires.filter((w) => w.id !== wireId),
    conduits: next.conduits.map((c) => ({
      ...c,
      wireIds: c.wireIds.filter((id) => id !== wireId),
    })),
    layout: { ...next.layout, wireOffsets, hubWirePaths },
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

/** Attaches a wire to a hub (wire-nut splice — many wires may share one hub). */
export function attachWireToHub(diagram: Diagram, hubId: string, wireId: string): Diagram {
  const hub = hubById(diagram, hubId);
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!hub || !wire) {
    throw new Error('Hub or wire not found');
  }
  if (wireLinksForWire(diagram, wireId).length > 0) {
    throw new Error('Disconnect wire-to-wire links before attaching to a hub');
  }
  if (wire.hubId === hubId) {
    return diagram;
  }
  const wires = diagram.wires.map((w) => {
    if (w.id !== wireId) return w;
    return { ...w, hubId };
  });

  return refreshHubWirePaths({ ...diagram, wires });
}

export function detachWireFromHub(diagram: Diagram, wireId: string): Diagram {
  const wires = diagram.wires.map((w) => (w.id === wireId ? { ...w, hubId: null } : w));
  const { [wireId]: _removed, ...hubWirePaths } = diagram.layout.hubWirePaths ?? {};
  return {
    ...diagram,
    wires,
    layout: { ...diagram.layout, hubWirePaths },
  };
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

  return refreshHubBridgePaths({
    ...diagram,
    hubBridges: [...diagram.hubBridges, bridge],
  });
}

export function deleteHubBridge(diagram: Diagram, bridgeId: string): Diagram {
  return removeHubBridges(diagram, (b) => b.id === bridgeId);
}

export function deleteHub(diagram: Diagram, hubId: string): Diagram {
  let next = removeHubBridges(diagram, (b) => b.hubIdA === hubId || b.hubIdB === hubId);
  for (const conduit of next.conduits.filter((c) => c.kind === 'hub' && c.hubId === hubId)) {
    next = deleteConduit(next, conduit.id);
  }
  const hubWirePaths = { ...(next.layout.hubWirePaths ?? {}) };
  const wires = next.wires.map((w) => {
    if (w.hubId !== hubId) return w;
    delete hubWirePaths[w.id];
    return { ...w, hubId: null };
  });
  return {
    ...next,
    hubs: next.hubs.filter((h) => h.id !== hubId),
    wires,
    layout: { ...next.layout, hubWirePaths },
  };
}
