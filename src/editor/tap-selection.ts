import type { ContextMenuTarget } from './context-menu-target';
import { contextMenuTargetKey } from './context-menu-target-key';

export const TAP_CYCLE_RADIUS_PX = 24;
export const TAP_CYCLE_WINDOW_MS = 450;

export type TapCycleState = {
  clientX: number;
  clientY: number;
  index: number;
  time: number;
  /** Keys of candidates from the last tap (order matters for cycling). */
  candidateKeys: readonly string[];
};

export type HitCandidate = {
  target: ContextMenuTarget;
  dist: number;
};

function tapSpotMatches(state: TapCycleState, clientX: number, clientY: number, now: number): boolean {
  if (now - state.time > TAP_CYCLE_WINDOW_MS) return false;
  return Math.hypot(clientX - state.clientX, clientY - state.clientY) <= TAP_CYCLE_RADIUS_PX;
}

/** Pick the next target when tapping the same spot; otherwise start at the nearest hit. */
export function resolveTapCycleTarget(
  candidates: readonly HitCandidate[],
  prior: TapCycleState | null,
  clientX: number,
  clientY: number,
  now = Date.now(),
): { target: ContextMenuTarget | null; nextState: TapCycleState | null } {
  if (candidates.length === 0) {
    return { target: null, nextState: null };
  }

  const keys = candidates.map((c) => contextMenuTargetKey(c.target));

  if (prior && tapSpotMatches(prior, clientX, clientY, now) && keys.join('\0') === prior.candidateKeys.join('\0')) {
    const nextIndex = (prior.index + 1) % candidates.length;
    return {
      target: candidates[nextIndex]!.target,
      nextState: {
        clientX,
        clientY,
        index: nextIndex,
        time: now,
        candidateKeys: keys,
      },
    };
  }

  return {
    target: candidates[0]!.target,
    nextState: {
      clientX,
      clientY,
      index: 0,
      time: now,
      candidateKeys: keys,
    },
  };
}
