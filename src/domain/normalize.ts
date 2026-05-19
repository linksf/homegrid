import { migrateLegacyBreakers } from './migrate-breakers';
import { rebuildConduitPathsPreservingFreeEnds } from './path-routing';
import { ensureWirePaths, rebuildWirePathsPreservingTips } from './wire-routing';
import { refreshWireLinkPaths } from './wire-geometry';
import { normalizeLayoutOffsets, pruneLayoutOffsets } from './layout-offsets';
import { normalizeDeviceNodes } from './normalize-devices';
import { orthogonalizeLayoutPaths } from './orthogonal-path';
import { normalizeHubSlots } from './normalize-hubs';
import type { Diagram, Job, Wire, WireLink } from './types';

function normalizeWire(w: Wire): Wire {
  return {
    id: w.id,
    color: w.color,
    label: typeof w.label === 'string' ? w.label : '',
    conduitId: w.conduitId ?? null,
    breakerId: w.breakerId ?? null,
    hubId: w.hubId ?? null,
    deviceNodeId: w.deviceNodeId ?? null,
    manualDirection: w.manualDirection ?? null,
  };
}

function dedupeWireLinks(diagram: Diagram): Diagram {
  const seen = new Set<string>();
  const wireLinks: WireLink[] = [];
  const wireLinkPaths = { ...diagram.layout.wireLinkPaths };

  for (const link of diagram.wireLinks) {
    const usedA = seen.has(link.wireIdA);
    const usedB = seen.has(link.wireIdB);
    if (usedA || usedB) {
      delete wireLinkPaths[link.id];
      continue;
    }
    seen.add(link.wireIdA);
    seen.add(link.wireIdB);
    wireLinks.push(link);
  }

  return { ...diagram, wireLinks, layout: { ...diagram.layout, wireLinkPaths } };
}

/** Ensure persisted / imported diagrams match the current schema (avoids runtime crashes). */
export function normalizeDiagram(diagram: Diagram | undefined | null): Diagram {
  if (!diagram) {
    return {
      junctionBoxes: [],
      breakers: [],
      conduits: [],
      wires: [],
      hubs: [],
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      deviceNodes: [],
      wireLinks: [],
      layout: {
        conduitPaths: {},
        conduitOffsets: {},
        wireOffsets: {},
        wireLinkPaths: {},
        wireLinkOffsets: {},
        hubBridgePaths: {},
        wirePaths: {},
      },
    };
  }

  const layout = diagram.layout ?? { conduitPaths: {}, wireLinkPaths: {}, hubBridgePaths: {} };

  let normalized: Diagram = {
    junctionBoxes: Array.isArray(diagram.junctionBoxes) ? diagram.junctionBoxes : [],
    breakers: Array.isArray(diagram.breakers) ? diagram.breakers : [],
    hubs: Array.isArray(diagram.hubs) ? diagram.hubs : [],
    hubBridges: Array.isArray(diagram.hubBridges) ? diagram.hubBridges : [],
    lightBulbs: Array.isArray(diagram.lightBulbs) ? diagram.lightBulbs : [],
    switches: Array.isArray(diagram.switches) ? diagram.switches : [],
    deviceNodes: Array.isArray(diagram.deviceNodes) ? diagram.deviceNodes : [],
    conduits: Array.isArray(diagram.conduits) ? diagram.conduits : [],
    wires: Array.isArray(diagram.wires) ? diagram.wires.map(normalizeWire) : [],
    wireLinks: Array.isArray(diagram.wireLinks) ? diagram.wireLinks : [],
    layout: normalizeLayoutOffsets({
      conduitPaths: layout.conduitPaths ?? {},
      conduitOffsets: layout.conduitOffsets ?? {},
      wireOffsets: layout.wireOffsets ?? {},
      wireLinkPaths: layout.wireLinkPaths ?? {},
      wireLinkOffsets: layout.wireLinkOffsets ?? {},
      hubBridgePaths: layout.hubBridgePaths ?? {},
      wirePaths: layout.wirePaths ?? {},
    }),
  };

  normalized = dedupeWireLinks(normalized);
  normalized = migrateLegacyBreakers(normalized);
  normalized = normalizeHubSlots(normalized);
  normalized = normalizeDeviceNodes(normalized);
  normalized = ensureWirePaths(normalized);
  normalized = rebuildConduitPathsPreservingFreeEnds(normalized);
  normalized = rebuildWirePathsPreservingTips(normalized);
  normalized = orthogonalizeLayoutPaths(normalized);
  normalized = refreshWireLinkPaths(normalized);
  normalized = pruneLayoutOffsets(normalized);
  return normalized;
}

export function normalizeJob(job: Job): Job {
  return {
    ...job,
    name: typeof job.name === 'string' ? job.name : 'Untitled job',
    notes: typeof job.notes === 'string' ? job.notes : '',
    diagram: normalizeDiagram(job.diagram),
  };
}
