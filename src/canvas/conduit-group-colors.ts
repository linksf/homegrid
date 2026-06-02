import type { Diagram } from '../domain/types';

/**
 * Distinct hues used to color-differentiate conduit runs and the cables they connect.
 * Avoids pure black/white and the red conductor color so groups don't read as conductors.
 */
export const CONDUIT_GROUP_PALETTE: readonly string[] = [
  '#2563eb', // blue
  '#16a34a', // green
  '#f59e0b', // amber
  '#9333ea', // purple
  '#db2777', // pink
  '#0891b2', // cyan
  '#ea580c', // orange
  '#0d9488', // teal
  '#6366f1', // indigo
  '#65a30d', // lime
];

export type ConduitGroupColors = {
  runColorById: Map<string, string>;
  cableColorById: Map<string, string>;
};

/**
 * Assign each conduit run a stable color from {@link CONDUIT_GROUP_PALETTE} (cycling in run
 * order) and map the same color onto the two cables the run connects. Cables not part of any
 * run get no entry.
 */
export function conduitGroupColors(diagram: Diagram): ConduitGroupColors {
  const runColorById = new Map<string, string>();
  const cableColorById = new Map<string, string>();

  diagram.conduitRuns.forEach((run, index) => {
    const color = CONDUIT_GROUP_PALETTE[index % CONDUIT_GROUP_PALETTE.length]!;
    runColorById.set(run.id, color);
    if (run.cableIdA) cableColorById.set(run.cableIdA, color);
    if (run.cableIdB) cableColorById.set(run.cableIdB, color);
  });

  return { runColorById, cableColorById };
}
