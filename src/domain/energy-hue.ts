import type { CSSProperties } from 'react';
import {
  breakerCableClosed,
  directionForBreakerWire,
  isBreakerCable,
} from './breaker-cable';
import { buildWireFlowAdjacency } from './wire-flow-adjacency';
import type { Diagram, ResolvedWire, WireDirection, WireLink } from './types';

export const ENERGY_HUE_LEVELS = 32;

function oppositeDirection(d: WireDirection): WireDirection {
  return d === 'away' ? 'toward' : 'away';
}

function breakerSeedWireIds(diagram: Diagram): string[] {
  const seeds: string[] = [];
  const wireById = new Map(diagram.wires.map((w) => [w.id, w]));

  for (const breaker of diagram.breakers) {
    seeds.push(breaker.blackWireId, breaker.whiteWireId);
  }

  for (const cable of diagram.cables) {
    if (!isBreakerCable(cable) || !breakerCableClosed(cable)) continue;
    for (const wireId of cable.wireIds) {
      const w = wireById.get(wireId);
      if (!w) continue;
      if (directionForBreakerWire(w.color) != null) seeds.push(wireId);
    }
  }

  return seeds;
}

/**
 * Assigns 0–31 hue levels from breaker panels along resolved flow paths.
 * Branches share the same next level; merges keep only the shortest path (BFS first visit).
 */
export function resolveEnergyHue(
  diagram: Diagram,
  resolvedByWireId: Map<string, ResolvedWire>,
): Map<string, number> {
  const adj = buildWireFlowAdjacency(diagram);
  const hueByWire = new Map<string, number>();
  const queue: string[] = [];

  for (const seed of breakerSeedWireIds(diagram)) {
    const rw = resolvedByWireId.get(seed);
    if (!rw?.resolvedDirection) continue;
    if (hueByWire.has(seed)) continue;
    hueByWire.set(seed, 0);
    queue.push(seed);
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++]!;
    const h = hueByWire.get(u)!;
    if (h >= ENERGY_HUE_LEVELS - 1) continue;

    const du = resolvedByWireId.get(u)?.resolvedDirection;
    if (!du) continue;

    for (const { wireId: v, flip } of adj.get(u) ?? []) {
      const rv = resolvedByWireId.get(v);
      if (!rv?.resolvedDirection) continue;

      const expected = flip ? oppositeDirection(du) : du;
      if (rv.resolvedDirection !== expected) continue;
      if (hueByWire.has(v)) continue;

      hueByWire.set(v, h + 1);
      queue.push(v);
    }
  }

  return hueByWire;
}

function energyHueAngle(level: number): number {
  return (level % ENERGY_HUE_LEVELS) * (360 / ENERGY_HUE_LEVELS);
}

export function energyHueCss(level: number | null | undefined): string | undefined {
  if (level == null || level < 0) return undefined;
  return `hsl(${energyHueAngle(level)} 78% 46%)`;
}

/** Chevron fill/stroke matched to an energy level. */
export function energyChevronStyle(level: number | null | undefined): CSSProperties | undefined {
  if (level == null || level < 0) return undefined;
  const angle = energyHueAngle(level);
  return {
    fill: `hsl(${angle} 78% 46%)`,
    stroke: `hsl(${angle} 78% 30%)`,
  };
}

export function energyHueStrokeStyle(level: number | null | undefined): CSSProperties | undefined {
  const stroke = energyHueCss(level);
  return stroke ? { stroke } : undefined;
}

export function mergeEnergyStrokeStyle(
  level: number | null | undefined,
  base?: CSSProperties,
): CSSProperties | undefined {
  const energy = energyHueStrokeStyle(level);
  if (!energy) return base;
  return { ...base, ...energy };
}

export function minEnergyHue(hueByWireId: Map<string, number>, wireIds: readonly string[]): number | null {
  let min: number | null = null;
  for (const id of wireIds) {
    const h = hueByWireId.get(id);
    if (h == null) continue;
    min = min == null ? h : Math.min(min, h);
  }
  return min;
}

export function wireLinkEnergyHue(
  link: WireLink,
  hueByWireId: Map<string, number>,
): number | null {
  const ha = hueByWireId.get(link.wireIdA);
  const hb = hueByWireId.get(link.wireIdB);
  if (ha == null && hb == null) return null;
  if (ha == null) return hb!;
  if (hb == null) return ha;
  return Math.min(ha, hb);
}
