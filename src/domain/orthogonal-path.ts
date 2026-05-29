export type Point = { x: number; y: number };

const EPS = 1e-6;

function coerceFivePointPath(start: Point, end: Point): Point[] {
  const four = coerceFourPointPath(start, end);
  if (four.length !== 4) return four;
  const [a, b, c, d] = four;
  const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  return [a, b, mid, c, d];
}

function coerceFourPointPath(start: Point, end: Point): Point[] {
  const route = orthogonalRoute(start, end);
  if (route.length >= 4) {
    return [start, { ...route[1]! }, { ...route[route.length - 2]! }, end];
  }
  if (route.length === 3) {
    const corner = route[1]!;
    return [start, { x: (start.x + corner.x) / 2, y: (start.y + corner.y) / 2 }, { ...corner }, end];
  }
  return [
    start,
    { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
    { x: start.x + (2 * (end.x - start.x)) / 3, y: start.y + (2 * (end.y - start.y)) / 3 },
    end,
  ];
}

/** Manhattan route between two points (horizontal segment, then vertical). */
export function orthogonalRoute(a: Point, b: Point): Point[] {
  if (Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS) {
    return [a, b];
  }
  const corner = { x: b.x, y: a.y };
  return [a, corner, b];
}

/**
 * Orthogonal stub leaving a junction anchor along the outward normal:
 * extends on the dominant axis first, then turns to the stub tip.
 */
export function conduitStubPath(start: Point, outward: Point, length: number): Point[] {
  const tip = {
    x: start.x + outward.x * length,
    y: start.y + outward.y * length,
  };

  if (Math.abs(outward.x) < EPS && Math.abs(outward.y) < EPS) {
    return [start, tip];
  }

  if (Math.abs(outward.x) >= Math.abs(outward.y)) {
    const corner = { x: tip.x, y: start.y };
    if (Math.abs(corner.x - start.x) < EPS && Math.abs(corner.y - tip.y) < EPS) {
      return [start, tip];
    }
    if (Math.abs(corner.y - tip.y) < EPS) {
      return [start, tip];
    }
    return [start, corner, tip];
  }

  const corner = { x: start.x, y: tip.y };
  if (Math.abs(corner.x - tip.x) < EPS && Math.abs(corner.y - start.y) < EPS) {
    return [start, tip];
  }
  if (Math.abs(corner.x - tip.x) < EPS) {
    return [start, tip];
  }
  return [start, corner, tip];
}

/** Unit vector perpendicular to the chord from first to last point. */
export function chordPerpendicular(points: Point[]): Point {
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** Projects a world delta onto the perpendicular of a path chord. */
export function perpendicularDelta(points: Point[], dx: number, dy: number): Point {
  const perp = chordPerpendicular(points);
  const scalar = dx * perp.x + dy * perp.y;
  return { x: perp.x * scalar, y: perp.y * scalar };
}

function straightSegmentDetour(a: Point, b: Point, offsetX: number, offsetY: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const bumpX = offsetX;
  const bumpY = offsetY;

  if (Math.abs(dy) < EPS) {
    const span = Math.abs(dx);
    const t = Math.max(12, Math.min(span * 0.25, 48));
    const y = a.y + bumpY;
    if (dx >= 0) {
      return [
        { ...a },
        { x: a.x + t, y: a.y },
        { x: a.x + t, y },
        { x: b.x - t, y },
        { x: b.x - t, y: b.y },
        { ...b },
      ];
    }
    return [
      { ...a },
      { x: a.x - t, y: a.y },
      { x: a.x - t, y },
      { x: b.x + t, y },
      { x: b.x + t, y: b.y },
      { ...b },
    ];
  }

  if (Math.abs(dx) < EPS) {
    const span = Math.abs(dy);
    const t = Math.max(12, Math.min(span * 0.25, 48));
    const x = a.x + bumpX;
    if (dy >= 0) {
      return [
        { ...a },
        { x: a.x, y: a.y + t },
        { x, y: a.y + t },
        { x, y: b.y - t },
        { x: b.x, y: b.y - t },
        { ...b },
      ];
    }
    return [
      { ...a },
      { x: a.x, y: a.y - t },
      { x, y: a.y - t },
      { x, y: b.y + t },
      { x: b.x, y: b.y + t },
      { ...b },
    ];
  }

  const route = orthogonalRoute(a, b);
  const corner = route[1]!;
  return [
    { ...a },
    { x: corner.x + offsetX, y: corner.y + offsetY },
    { ...b },
  ];
}

/**
 * Offsets a path sideways while keeping the first and last vertices fixed
 * (anchor, terminal, wire tip, hub attachment, etc.).
 */
export function offsetPolylineFixedEndpoints(
  points: Point[],
  offsetX: number,
  offsetY: number,
): Point[] {
  if (points.length < 2) return points;
  if (Math.abs(offsetX) < EPS && Math.abs(offsetY) < EPS) {
    return points.map((pt) => ({ ...pt }));
  }

  const start = points[0]!;
  const end = points[points.length - 1]!;

  if (points.length > 2) {
    return points.map((pt, i) => {
      if (i === 0 || i === points.length - 1) return { ...pt };
      return { x: pt.x + offsetX, y: pt.y + offsetY };
    });
  }

  const route = orthogonalRoute(start, end);
  if (route.length >= 3) {
    const corner = route[1]!;
    return [
      { ...start },
      { x: corner.x + offsetX, y: corner.y + offsetY },
      { ...end },
    ];
  }

  return straightSegmentDetour(start, end, offsetX, offsetY);
}

/** Rebuild every stored path as horizontal/vertical segments only. */
export function orthogonalizeLayoutPaths<
  T extends {
    layout: {
      conduitPaths: Record<string, { points: Point[] }>;
      wireLinkPaths: Record<string, { points: Point[] }>;
      hubBridgePaths: Record<string, { points: Point[] }>;
      conduitRunPaths?: Record<string, { points: Point[] }>;
    };
  },
>(diagram: T): T {
  const conduitPaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(diagram.layout.conduitPaths)) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) conduitPaths[id] = entry;
      continue;
    }
    if (pts.length >= 3) {
      conduitPaths[id] = entry;
      continue;
    }
    conduitPaths[id] = { points: orthogonalRoute(pts[0]!, pts[pts.length - 1]!) };
  }

  const wireLinkPaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(diagram.layout.wireLinkPaths)) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) wireLinkPaths[id] = entry;
      continue;
    }
    if (pts.length === 5) {
      wireLinkPaths[id] = entry;
      continue;
    }
    wireLinkPaths[id] = { points: coerceFivePointPath(pts[0]!, pts[pts.length - 1]!) };
  }

  const wirePathsLayout: Record<string, { points: Point[] }> = {};
  const wirePathsIn = (diagram.layout as { wirePaths?: Record<string, { points: Point[] }> }).wirePaths ?? {};
  for (const [id, entry] of Object.entries(wirePathsIn)) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) wirePathsLayout[id] = entry;
      continue;
    }
    if (pts.length === 4) {
      wirePathsLayout[id] = entry;
      continue;
    }
    wirePathsLayout[id] = { points: coerceFourPointPath(pts[0]!, pts[pts.length - 1]!) };
  }

  const hubBridgePaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(diagram.layout.hubBridgePaths)) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) hubBridgePaths[id] = entry;
      continue;
    }
    if (pts.length === 5) {
      hubBridgePaths[id] = entry;
      continue;
    }
    hubBridgePaths[id] = { points: coerceFivePointPath(pts[0]!, pts[pts.length - 1]!) };
  }

  const layoutExtra = diagram.layout as {
    hubWirePaths?: Record<string, { points: Point[] }>;
    deviceWirePaths?: Record<string, { points: Point[] }>;
    conduitRunPaths?: Record<string, { points: Point[] }>;
    exposedPaths?: Record<string, { points: Point[] }>;
    conduitStubPaths?: Record<string, { points: Point[] }>;
  };

  const hubWirePaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(layoutExtra.hubWirePaths ?? {})) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) hubWirePaths[id] = entry;
      continue;
    }
    if (pts.length === 5) {
      hubWirePaths[id] = entry;
      continue;
    }
    hubWirePaths[id] = { points: coerceFivePointPath(pts[0]!, pts[pts.length - 1]!) };
  }

  const deviceWirePaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(layoutExtra.deviceWirePaths ?? {})) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) deviceWirePaths[id] = entry;
      continue;
    }
    if (pts.length === 5) {
      deviceWirePaths[id] = entry;
      continue;
    }
    deviceWirePaths[id] = { points: coerceFivePointPath(pts[0]!, pts[pts.length - 1]!) };
  }

  const conduitRunPaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(layoutExtra.conduitRunPaths ?? {})) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) conduitRunPaths[id] = entry;
      continue;
    }
    if (pts.length === 5) {
      conduitRunPaths[id] = entry;
      continue;
    }
    conduitRunPaths[id] = { points: coerceFivePointPath(pts[0]!, pts[pts.length - 1]!) };
  }

  const exposedPaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(layoutExtra.exposedPaths ?? {})) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) exposedPaths[id] = entry;
      continue;
    }
    if (pts.length === 4) {
      exposedPaths[id] = entry;
      continue;
    }
    exposedPaths[id] = { points: coerceFourPointPath(pts[0]!, pts[pts.length - 1]!) };
  }

  const conduitStubPaths: Record<string, { points: Point[] }> = {};
  for (const [id, entry] of Object.entries(layoutExtra.conduitStubPaths ?? {})) {
    const pts = entry?.points;
    if (!pts || pts.length < 2) {
      if (pts) conduitStubPaths[id] = entry;
      continue;
    }
    if (pts.length >= 3) {
      conduitStubPaths[id] = entry;
      continue;
    }
    conduitStubPaths[id] = { points: orthogonalRoute(pts[0]!, pts[pts.length - 1]!) };
  }

  return {
    ...diagram,
    layout: {
      ...diagram.layout,
      conduitPaths,
      wireLinkPaths,
      hubBridgePaths,
      wirePaths: wirePathsLayout,
      hubWirePaths,
      deviceWirePaths,
      conduitRunPaths,
      exposedPaths,
      conduitStubPaths,
    },
  };
}
