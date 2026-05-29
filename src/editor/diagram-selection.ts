export type DiagramSelection = {
  rooms: Set<string>;
  junctionBoxes: Set<string>;
  wires: Set<string>;
  conduits: Set<string>;
  conduitRuns: Set<string>;
  cables: Set<string>;
  hubs: Set<string>;
  hubBridges: Set<string>;
  links: Set<string>;
  lightBulbs: Set<string>;
  switches: Set<string>;
  dimmerSwitches: Set<string>;
  outlets: Set<string>;
  deviceNodes: Set<string>;
  /** Junction box edge anchors, encoded as `jb:{boxId}:{anchor}`. */
  junctionAnchors: Set<string>;
  /** Wire/conduit/link path bend anchors. */
  pathAnchors: Set<string>;
};

export function emptySelection(): DiagramSelection {
  return {
    rooms: new Set(),
    junctionBoxes: new Set(),
    wires: new Set(),
    conduits: new Set(),
    conduitRuns: new Set(),
    cables: new Set(),
    hubs: new Set(),
    hubBridges: new Set(),
    links: new Set(),
    lightBulbs: new Set(),
    switches: new Set(),
    dimmerSwitches: new Set(),
    outlets: new Set(),
    deviceNodes: new Set(),
    junctionAnchors: new Set(),
    pathAnchors: new Set(),
  };
}

export function cloneSelection(selection: DiagramSelection): DiagramSelection {
  return {
    rooms: new Set(selection.rooms),
    junctionBoxes: new Set(selection.junctionBoxes),
    wires: new Set(selection.wires),
    conduits: new Set(selection.conduits),
    conduitRuns: new Set(selection.conduitRuns),
    cables: new Set(selection.cables),
    hubs: new Set(selection.hubs),
    hubBridges: new Set(selection.hubBridges),
    links: new Set(selection.links),
    lightBulbs: new Set(selection.lightBulbs),
    switches: new Set(selection.switches),
    dimmerSwitches: new Set(selection.dimmerSwitches),
    outlets: new Set(selection.outlets),
    deviceNodes: new Set(selection.deviceNodes),
    junctionAnchors: new Set(selection.junctionAnchors),
    pathAnchors: new Set(selection.pathAnchors),
  };
}

export function selectionTotalCount(selection: DiagramSelection): number {
  return (
    selection.rooms.size +
    selection.junctionBoxes.size +
    selection.wires.size +
    selection.conduits.size +
    selection.conduitRuns.size +
    selection.cables.size +
    selection.hubs.size +
    selection.hubBridges.size +
    selection.links.size +
    selection.lightBulbs.size +
    selection.switches.size +
    selection.dimmerSwitches.size +
    selection.outlets.size +
    selection.deviceNodes.size +
    selection.junctionAnchors.size +
    selection.pathAnchors.size
  );
}

export function isAnythingSelected(selection: DiagramSelection): boolean {
  return selectionTotalCount(selection) > 0;
}

export function setSingleRoom(id: string): DiagramSelection {
  const next = emptySelection();
  next.rooms.add(id);
  return next;
}

export function setSingleJunctionBox(id: string): DiagramSelection {
  const next = emptySelection();
  next.junctionBoxes.add(id);
  return next;
}

export function setSingleWire(id: string): DiagramSelection {
  const next = emptySelection();
  next.wires.add(id);
  return next;
}

export function setSingleConduit(id: string): DiagramSelection {
  const next = emptySelection();
  next.conduits.add(id);
  return next;
}

export function setSingleConduitRun(id: string): DiagramSelection {
  const next = emptySelection();
  next.conduitRuns.add(id);
  return next;
}

export function setSingleCable(id: string): DiagramSelection {
  const next = emptySelection();
  next.cables.add(id);
  return next;
}

export function setSingleHub(id: string): DiagramSelection {
  const next = emptySelection();
  next.hubs.add(id);
  return next;
}

export function setSingleHubBridge(id: string): DiagramSelection {
  const next = emptySelection();
  next.hubBridges.add(id);
  return next;
}

export function setSingleLink(id: string): DiagramSelection {
  const next = emptySelection();
  next.links.add(id);
  return next;
}

export function setSingleLightBulb(id: string): DiagramSelection {
  const next = emptySelection();
  next.lightBulbs.add(id);
  return next;
}

export function setSingleSwitch(id: string): DiagramSelection {
  const next = emptySelection();
  next.switches.add(id);
  return next;
}

export function setSingleDimmerSwitch(id: string): DiagramSelection {
  const next = emptySelection();
  next.dimmerSwitches.add(id);
  return next;
}

export function setSingleOutlet(id: string): DiagramSelection {
  const next = emptySelection();
  next.outlets.add(id);
  return next;
}

export function setSingleDeviceNode(id: string): DiagramSelection {
  const next = emptySelection();
  next.deviceNodes.add(id);
  return next;
}

/** First id when exactly one item is selected; used for inspector detail and path editing. */
export function soleSelectedId(set: Set<string>): string | null {
  if (set.size !== 1) return null;
  return set.values().next().value ?? null;
}
