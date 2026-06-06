import { migrateConduitsToCables, migrateBreakerConduitsToCables } from './cable-migration';
import { migrateLegacyBreakers } from './migrate-breakers';
import { rebuildConduitPathsPreservingFreeEnds } from './path-routing';
import { ensureWirePaths, rebuildWirePathsPreservingTips } from './wire-routing';
import { refreshWireLinkPaths } from './wire-geometry';
import { refreshHubWirePaths } from './hub-wire-geometry';
import { refreshHubBridgePaths } from './hub-bridge-geometry';
import { refreshDeviceWirePaths } from './device-wire-geometry';
import { normalizeLayoutOffsets, pruneLayoutOffsets } from './layout-offsets';
import { normalizeDeviceNodes } from './normalize-devices';
import { snapDiagramToGrid } from './snap-layout';
import { orthogonalizeLayoutPaths } from './orthogonal-path';
import { normalizeHubSlots } from './normalize-hubs';
import type { Diagram, Job, Wire, WireLink } from './types';
import {
  endpointLinkKey,
  linkIdentityKey,
  normalizeWireLink,
} from './wire-link-utils';

function normalizeWire(w: Wire): Wire {
  return {
    id: w.id,
    color: w.color,
    label: typeof w.label === 'string' ? w.label : '',
    conduitId: w.conduitId ?? null,
    cableId: w.cableId ?? null,
    breakerId: w.breakerId ?? null,
    hubId: w.hubId ?? null,
    deviceNodeId: w.deviceNodeId ?? null,
    manualDirection: w.manualDirection ?? null,
  };
}

function dedupeWireLinks(diagram: Diagram): Diagram {
  const usedEndpoints = new Set<string>();
  const seenLinks = new Set<string>();
  const wireLinks: WireLink[] = [];
  const wireLinkPaths = { ...diagram.layout.wireLinkPaths };

  for (const link of diagram.wireLinks.map((l) => normalizeWireLink(l))) {
    const identity = linkIdentityKey(link);
    const keyA = endpointLinkKey(link.wireIdA, link.endpointA);
    const keyB = endpointLinkKey(link.wireIdB, link.endpointB);

    if (seenLinks.has(identity) || usedEndpoints.has(keyA) || usedEndpoints.has(keyB)) {
      delete wireLinkPaths[link.id];
      continue;
    }

    seenLinks.add(identity);
    usedEndpoints.add(keyA);
    usedEndpoints.add(keyB);
    wireLinks.push(link);
  }

  return { ...diagram, wireLinks, layout: { ...diagram.layout, wireLinkPaths } };
}

function migrateWireLinks(diagram: Diagram): Diagram {
  return {
    ...diagram,
    wireLinks: diagram.wireLinks.map((link) => normalizeWireLink(link)),
  };
}

/** Ensure persisted / imported diagrams match the current schema (avoids runtime crashes). */
export function normalizeDiagram(diagram: Diagram | undefined | null): Diagram {
  if (!diagram) {
    return {
      rooms: [],
      areas: [],
      junctionBoxes: [],
      breakers: [],
      conduits: [],
      cables: [],
      conduitRuns: [],
      wires: [],
      hubs: [],
      hubBridges: [],
      lightBulbs: [],
      switches: [],
      dimmerSwitches: [],
      outlets: [],
      deviceNodes: [],
      wireLinks: [],
      layout: normalizeLayoutOffsets({
        conduitPaths: {},
        conduitRunPaths: {},
        exposedPaths: {},
        conduitStubPaths: {},
        conduitOffsets: {},
        wireOffsets: {},
        wirePaths: {},
        wireLinkPaths: {},
        wireLinkOffsets: {},
        hubBridgePaths: {},
        hubWirePaths: {},
        deviceWirePaths: {},
      }),
    };
  }

  const layout =
    diagram.layout ??
    ({
      conduitPaths: {},
      conduitRunPaths: {},
      wireLinkPaths: {},
      hubBridgePaths: {},
    } as Diagram['layout']);

  let normalized: Diagram = {
    rooms: Array.isArray(diagram.rooms) ? diagram.rooms : [],
    areas: Array.isArray(diagram.areas) ? diagram.areas : [],
    junctionBoxes: Array.isArray(diagram.junctionBoxes) ? diagram.junctionBoxes : [],
    breakers: Array.isArray(diagram.breakers) ? diagram.breakers : [],
    hubs: Array.isArray(diagram.hubs) ? diagram.hubs : [],
    hubBridges: Array.isArray(diagram.hubBridges) ? diagram.hubBridges : [],
    lightBulbs: Array.isArray(diagram.lightBulbs) ? diagram.lightBulbs : [],
    switches: Array.isArray(diagram.switches) ? diagram.switches : [],
    dimmerSwitches: Array.isArray(diagram.dimmerSwitches) ? diagram.dimmerSwitches : [],
    outlets: Array.isArray(diagram.outlets) ? diagram.outlets : [],
    deviceNodes: Array.isArray(diagram.deviceNodes) ? diagram.deviceNodes : [],
    conduits: Array.isArray(diagram.conduits) ? diagram.conduits : [],
    cables: Array.isArray(diagram.cables) ? diagram.cables : [],
    conduitRuns: Array.isArray(diagram.conduitRuns) ? diagram.conduitRuns : [],
    wires: Array.isArray(diagram.wires) ? diagram.wires.map(normalizeWire) : [],
    wireLinks: Array.isArray(diagram.wireLinks) ? diagram.wireLinks : [],
    layout: normalizeLayoutOffsets({
      conduitPaths: layout.conduitPaths ?? {},
      conduitRunPaths: layout.conduitRunPaths ?? {},
      exposedPaths: layout.exposedPaths ?? {},
      conduitStubPaths: layout.conduitStubPaths ?? {},
      conduitOffsets: layout.conduitOffsets ?? {},
      wireOffsets: layout.wireOffsets ?? {},
      wireLinkPaths: layout.wireLinkPaths ?? {},
      wireLinkOffsets: layout.wireLinkOffsets ?? {},
      hubBridgePaths: layout.hubBridgePaths ?? {},
      wirePaths: layout.wirePaths ?? {},
      hubWirePaths: layout.hubWirePaths ?? {},
      deviceWirePaths: layout.deviceWirePaths ?? {},
    }),
  };

  normalized = migrateWireLinks(normalized);
  normalized = dedupeWireLinks(normalized);
  normalized = migrateLegacyBreakers(normalized);
  normalized = normalizeHubSlots(normalized);
  normalized = normalizeDeviceNodes(normalized);
  normalized = snapDiagramToGrid(normalized);
  normalized = ensureWirePaths(normalized);
  normalized = rebuildConduitPathsPreservingFreeEnds(normalized);
  normalized = rebuildWirePathsPreservingTips(normalized);
  normalized = orthogonalizeLayoutPaths(normalized);
  normalized = migrateConduitsToCables(normalized);
  normalized = migrateBreakerConduitsToCables(normalized);
  normalized = refreshWireLinkPaths(normalized);
  normalized = refreshHubWirePaths(normalized);
  normalized = refreshHubBridgePaths(normalized);
  normalized = refreshDeviceWirePaths(normalized);
  normalized = pruneLayoutOffsets(normalized);
  return normalized;
}

export function normalizeJob(job: Job): Job {
  const navigationMode = job.navigationMode === 'floorplan' ? 'floorplan' : 'sandbox';
  return {
    ...job,
    name: typeof job.name === 'string' ? job.name : 'Untitled job',
    notes: typeof job.notes === 'string' ? job.notes : '',
    navigationMode,
    floorPlanId: navigationMode === 'floorplan' ? (job.floorPlanId ?? null) : null,
    floorPlanName: typeof job.floorPlanName === 'string' ? job.floorPlanName : undefined,
    diagram: normalizeDiagram(job.diagram),
  };
}
