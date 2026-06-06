import type { Diagram, WireDirection, WireEndpoint, WireLink, ResolvedWire } from './types';

export type { WireEndpoint };

export function wireEndpointIndex(pathLength: number, endpoint: WireEndpoint): number {
  return endpoint === 'start' ? 0 : pathLength - 1;
}

export function linkEndpointForWire(link: WireLink, wireId: string): WireEndpoint {
  if (link.wireIdA === wireId) return link.endpointA ?? 'end';
  if (link.wireIdB === wireId) return link.endpointB ?? 'end';
  throw new Error(`Wire ${wireId} is not part of link ${link.id}`);
}

export function linkPartnerWireId(link: WireLink, wireId: string): string {
  return link.wireIdA === wireId ? link.wireIdB : link.wireIdA;
}

export function wireLinkAtEndpoint(
  diagram: Diagram,
  wireId: string,
  endpoint: WireEndpoint,
): WireLink | undefined {
  return diagram.wireLinks.find((link) => {
    if (link.wireIdA === wireId && (link.endpointA ?? 'end') === endpoint) return true;
    if (link.wireIdB === wireId && (link.endpointB ?? 'end') === endpoint) return true;
    return false;
  });
}

export function wireLinksForWire(diagram: Diagram, wireId: string): WireLink[] {
  return diagram.wireLinks.filter((link) => link.wireIdA === wireId || link.wireIdB === wireId);
}

/** @deprecated Prefer wireLinksForWire or wireLinkAtEndpoint */
export function wireLinkForWire(diagram: Diagram, wireId: string): WireLink | undefined {
  return wireLinksForWire(diagram, wireId)[0];
}

export function endpointLinkKey(wireId: string, endpoint: WireEndpoint): string {
  return `${wireId}:${endpoint}`;
}

export function normalizeWireLinkRecord(
  wireIdA: string,
  endpointA: WireEndpoint,
  wireIdB: string,
  endpointB: WireEndpoint,
): Pick<WireLink, 'wireIdA' | 'endpointA' | 'wireIdB' | 'endpointB'> {
  if (wireIdA === wireIdB) {
    throw new Error('Cannot link a wire to itself');
  }
  if (wireIdA < wireIdB) {
    return { wireIdA, endpointA, wireIdB, endpointB };
  }
  return {
    wireIdA: wireIdB,
    endpointA: endpointB,
    wireIdB: wireIdA,
    endpointB: endpointA,
  };
}

export function linkIdentityKey(
  link: Pick<WireLink, 'wireIdA' | 'endpointA' | 'wireIdB' | 'endpointB'>,
): string {
  const sorted = normalizeWireLinkRecord(
    link.wireIdA,
    link.endpointA ?? 'end',
    link.wireIdB,
    link.endpointB ?? 'end',
  );
  return `${sorted.wireIdA}:${sorted.endpointA}:${sorted.wireIdB}:${sorted.endpointB}`;
}

export function normalizeWireLink(link: WireLink): WireLink {
  const sorted = normalizeWireLinkRecord(
    link.wireIdA,
    link.endpointA ?? 'end',
    link.wireIdB,
    link.endpointB ?? 'end',
  );
  return { ...link, ...sorted };
}

/** True when resolved flow leaves the wire at its linked endpoint (into the link). */
export function flowExitsWireAtEndpoint(direction: WireDirection, endpoint: WireEndpoint): boolean {
  return endpoint === 'end' ? direction === 'away' : direction === 'toward';
}

function linkDirectionFromWireEndpoint(
  direction: WireDirection,
  endpoint: WireEndpoint,
  linkSide: 'start' | 'end',
): WireDirection {
  const exits = flowExitsWireAtEndpoint(direction, endpoint);
  if (linkSide === 'start') return exits ? 'away' : 'toward';
  return exits ? 'toward' : 'away';
}

/**
 * Map wire-resolved flow onto a tie segment polyline (start→end) where the wire
 * meets the segment at `pathAttachment` on its `wireEndpoint`.
 */
export function tieSegmentFlowDirection(
  direction: WireDirection,
  wireEndpoint: WireEndpoint,
  pathAttachment: 'start' | 'end',
): WireDirection {
  return linkDirectionFromWireEndpoint(direction, wireEndpoint, pathAttachment);
}

/** True when both linked wires push flow into the link (a genuine head-on conflict). */
export function isDirectionOpposedLink(
  link: WireLink,
  resolvedA: Pick<ResolvedWire, 'resolvedDirection' | 'color'> | undefined,
  resolvedB: Pick<ResolvedWire, 'resolvedDirection' | 'color'> | undefined,
): boolean {
  const dirA = resolvedA?.resolvedDirection ?? null;
  const dirB = resolvedB?.resolvedDirection ?? null;
  if (dirA == null || dirB == null) return false;
  // Neutral-to-neutral splices share a return path; flow polarity is not meaningful.
  if (resolvedA?.color === 'white' && resolvedB?.color === 'white') return false;
  const epA = link.endpointA ?? 'end';
  const epB = link.endpointB ?? 'end';
  const entersA = !flowExitsWireAtEndpoint(dirA, epA);
  const entersB = !flowExitsWireAtEndpoint(dirB, epB);
  return entersA && entersB;
}

/** Flow direction along a wire-to-wire link path (wire A → wire B). */
export function wireLinkFlowDirection(
  link: WireLink,
  resolvedA: (Pick<ResolvedWire, 'resolvedDirection'> & Partial<Pick<ResolvedWire, 'color'>>) | undefined,
  resolvedB: (Pick<ResolvedWire, 'resolvedDirection'> & Partial<Pick<ResolvedWire, 'color'>>) | undefined,
): { direction: WireDirection | null; conflict: boolean } {
  const dirA = resolvedA?.resolvedDirection ?? null;
  const dirB = resolvedB?.resolvedDirection ?? null;
  const epA = link.endpointA ?? 'end';
  const epB = link.endpointB ?? 'end';
  const whiteNeutral =
    resolvedA?.color === 'white' && resolvedB?.color === 'white';

  const fromA = dirA != null ? linkDirectionFromWireEndpoint(dirA, epA, 'start') : null;
  const fromB = dirB != null ? linkDirectionFromWireEndpoint(dirB, epB, 'end') : null;

  if (fromA != null && fromB != null) {
    if (whiteNeutral) {
      if (fromA === fromB) {
        return { direction: fromA, conflict: false };
      }
      // Neutral splices can meet head-on; skip misleading link arrows.
      return { direction: null, conflict: false };
    }
    return { direction: fromA, conflict: fromA !== fromB };
  }
  return { direction: fromA ?? fromB, conflict: false };
}

/** Keep flow markers off corner segments where a tie/link continues the run. */
export function wireChevronTrim(
  diagram: Diagram,
  wireId: string,
): { trimStart: number; trimEnd: number } {
  const CORNER_TRIM = 36;
  let trimStart = 0;
  let trimEnd = 0;

  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return { trimStart, trimEnd };

  if (wire.hubId || wire.deviceNodeId) {
    trimEnd = Math.max(trimEnd, CORNER_TRIM);
  }

  for (const endpoint of ['start', 'end'] as const) {
    if (!wireLinkAtEndpoint(diagram, wireId, endpoint)) continue;
    if (endpoint === 'start') trimStart = Math.max(trimStart, CORNER_TRIM);
    else trimEnd = Math.max(trimEnd, CORNER_TRIM);
  }

  return { trimStart, trimEnd };
}
