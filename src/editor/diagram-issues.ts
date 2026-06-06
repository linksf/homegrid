import type { Diagram, ResolvedWire, WireLink } from '../domain/types';
import { isDirectionOpposedLink } from '../domain/wire-link-utils';

export type DirectionConflictIssue = {
  kind: 'direction-conflict';
  wireId: string;
  title: string;
  detail: string;
};

export type OpposedFlowIssue = {
  kind: 'opposed-flow';
  linkId: string;
  wireIdA: string;
  wireIdB: string;
  title: string;
  detail: string;
};

export type DiagramIssue = DirectionConflictIssue | OpposedFlowIssue;

function wireDisplayName(diagram: Diagram, wireId: string): string {
  const w = diagram.wires.find((x) => x.id === wireId);
  if (!w) return wireId;
  const label = w.label.trim();
  if (label.length > 0) return label;
  return `${w.color} wire`;
}

function wireContext(diagram: Diagram, wireId: string): string {
  const w = diagram.wires.find((x) => x.id === wireId);
  if (!w) return '';
  if (w.cableId) {
    const cable = diagram.cables.find((c) => c.id === w.cableId);
    if (cable?.label?.trim()) return cable.label.trim();
    if (cable?.role === 'breaker') return 'breaker circuit';
    return 'cable stub';
  }
  if (w.hubId) return 'hub connection';
  if (w.conduitId) {
    const conduit = diagram.conduits.find((c) => c.id === w.conduitId);
    if (conduit?.kind === 'span') return 'span wire';
    return 'conduit wire';
  }
  return 'field wire';
}

function directionLabel(dir: 'toward' | 'away' | null | undefined): string {
  if (dir === 'toward') return 'toward box';
  if (dir === 'away') return 'away from box';
  return 'unset';
}

function directionConflictDetail(
  diagram: Diagram,
  wireId: string,
  resolved: ResolvedWire | undefined,
): string {
  const w = diagram.wires.find((x) => x.id === wireId);
  if (!w) return 'Flow direction disagrees with a connected conductor.';
  const resolvedDir = directionLabel(resolved?.resolvedDirection);
  if (w.manualDirection != null) {
    return `Manual arrow (${directionLabel(w.manualDirection)}) conflicts with neighbors — resolved as ${resolvedDir} but that disagrees across a link, hub, or conduit run.`;
  }
  if (resolved?.directionSource === 'breaker') {
    return `Breaker seed (${resolvedDir}) conflicts with manual arrows or other seeds on a connected path.`;
  }
  return `Propagated flow (${resolvedDir}) disagrees with a connected conductor. Check manual arrows on this path or at splices/hubs.`;
}

function opposedFlowDetail(link: WireLink, diagram: Diagram): string {
  const epA = link.endpointA ?? 'end';
  const epB = link.endpointB ?? 'end';
  return `Both ${wireDisplayName(diagram, link.wireIdA)} (${epA}) and ${wireDisplayName(diagram, link.wireIdB)} (${epB}) show flow into this splice. That can mean two hots meeting — double-check before energizing.`;
}

/** Issues worth surfacing in the inspector panel, with human-readable explanations. */
export function collectDiagramIssues(
  diagram: Diagram,
  resolvedByWireId: Map<string, ResolvedWire>,
): DiagramIssue[] {
  const issues: DiagramIssue[] = [];

  for (const w of diagram.wires) {
    const resolved = resolvedByWireId.get(w.id);
    if (!resolved?.directionConflict) continue;
    const name = wireDisplayName(diagram, w.id);
    const context = wireContext(diagram, w.id);
    issues.push({
      kind: 'direction-conflict',
      wireId: w.id,
      title: context.length > 0 ? `${name} · ${context}` : name,
      detail: directionConflictDetail(diagram, w.id, resolved),
    });
  }

  issues.sort((a, b) => a.title.localeCompare(b.title));

  for (const link of diagram.wireLinks) {
    if (
      !isDirectionOpposedLink(
        link,
        resolvedByWireId.get(link.wireIdA),
        resolvedByWireId.get(link.wireIdB),
      )
    ) {
      continue;
    }
    const a = wireDisplayName(diagram, link.wireIdA);
    const b = wireDisplayName(diagram, link.wireIdB);
    issues.push({
      kind: 'opposed-flow',
      linkId: link.id,
      wireIdA: link.wireIdA,
      wireIdB: link.wireIdB,
      title: `${a} ↔ ${b}`,
      detail: opposedFlowDetail(link, diagram),
    });
  }

  return issues;
}

export function directionConflictIssues(issues: readonly DiagramIssue[]): DirectionConflictIssue[] {
  return issues.filter((issue): issue is DirectionConflictIssue => issue.kind === 'direction-conflict');
}

export function opposedFlowIssues(issues: readonly DiagramIssue[]): OpposedFlowIssue[] {
  return issues.filter((issue): issue is OpposedFlowIssue => issue.kind === 'opposed-flow');
}
