import type { ContextMenuTarget } from './context-menu-target';
import type { HitCandidate } from './tap-selection';

export type HitPriorityOptions = {
  /** When linking a wire end to a hub, prefer hub over anchors and wires. */
  preferHub?: boolean;
};

/** Lower number = higher priority (smaller / more specific targets win). */
export function hitTargetPriority(target: ContextMenuTarget, options: HitPriorityOptions = {}): number {
  if (options.preferHub && target.kind === 'hub') {
    return -1;
  }
  switch (target.kind) {
    case 'junctionAnchor':
      return 0;
    case 'deviceNode':
    case 'hub':
    case 'lightBulb':
    case 'switch':
    case 'dimmerSwitch':
    case 'outlet':
      return 1;
    case 'wire':
    case 'link':
    case 'hubBridge':
    case 'hubWire':
    case 'cable':
    case 'conduitRun':
    case 'conduit':
      return 2;
    case 'junctionBox':
      return 3;
    case 'room':
      return 4;
    case 'multi':
      return 1;
  }
}

export function sortHitCandidates(
  candidates: readonly HitCandidate[],
  options: HitPriorityOptions = {},
): HitCandidate[] {
  return [...candidates].sort((a, b) => {
    const priorityDelta = hitTargetPriority(a.target, options) - hitTargetPriority(b.target, options);
    if (priorityDelta !== 0) return priorityDelta;
    return a.dist - b.dist;
  });
}
