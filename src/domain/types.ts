export type WireColor = 'red' | 'white' | 'black';

export type WireDirection = 'toward' | 'away';

export type AnchorPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface JunctionBox {
  id: string;
  type: 'normal' | 'breaker';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Breaker {
  id: string;
  junctionBoxId: string;
  label: string;
  blackWireId: string;
  whiteWireId: string;
}

export interface Wire {
  id: string;
  color: WireColor;
  label: string;
  conduitId: string | null;
  breakerId: string | null;
  /** At most one hub attachment per wire (exclusive with wire-to-wire links and device nodes). */
  hubId: string | null;
  /** Terminal on a light bulb or switch (exclusive with hub and wire-to-wire links). */
  deviceNodeId: string | null;
  manualDirection: WireDirection | null;
}

/** Connection terminal on a light bulb or switch; at most one wire per node. */
export interface DeviceNode {
  id: string;
  deviceKind: 'lightBulb' | 'switch';
  deviceId: string;
  /** Index within the device (0..1 for bulbs; 0..2 for switches). */
  slot: number;
}

export interface LightBulb {
  id: string;
  label: string;
  /** Top-left of bounding square in world space. */
  x: number;
  y: number;
}

export interface Switch {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  terminalCount: 2 | 3;
}

/** Fixed attachment point inside a junction box (four per box). */
export type HubSlot = 0 | 1 | 2 | 3;

/** Splice / junction point inside a junction box; fans out to many wires. */
export interface Hub {
  id: string;
  junctionBoxId: string;
  label: string;
  slot: HubSlot;
}

/** Connects two hubs in different junction boxes. */
export interface HubBridge {
  id: string;
  hubIdA: string;
  hubIdB: string;
}

export interface ConduitBase {
  id: string;
  label: string;
  wireIds: string[];
}

export interface LocalConduit extends ConduitBase {
  kind: 'local';
  junctionBoxId: string;
  anchor: AnchorPosition;
}

export interface SpanConduit extends ConduitBase {
  kind: 'span';
  junctionBoxIdA: string;
  anchorA: AnchorPosition;
  junctionBoxIdB: string;
  anchorB: AnchorPosition;
}

/** Circuit stub inside a breaker panel; black/white wires seed direction for the network. */
export interface BreakerConduit extends ConduitBase {
  kind: 'breaker';
  junctionBoxId: string;
  anchor: AnchorPosition;
}

/** Stub bundle from a light or switch terminal outward into the diagram. */
export interface DeviceConduit extends ConduitBase {
  kind: 'device';
  deviceNodeId: string;
}

export type Conduit = LocalConduit | SpanConduit | BreakerConduit | DeviceConduit;

export interface WireLink {
  id: string;
  wireIdA: string;
  wireIdB: string;
  whiteMismatchWarning: boolean;
}

export interface PathOffset {
  dx: number;
  dy: number;
}

export interface LayoutState {
  conduitPaths: Record<string, { points: { x: number; y: number }[] }>;
  /** Sideways nudge for the whole conduit bundle (ends stay on anchor and tip). */
  conduitOffsets?: Record<string, PathOffset>;
  /** Extra sideways nudge for one wire within its conduit bundle. */
  wireOffsets?: Record<string, PathOffset>;
  /** Independent orthogonal path per wire (stub conduits). */
  wirePaths?: Record<string, { points: { x: number; y: number }[] }>;
  wireLinkPaths: Record<string, { points: { x: number; y: number }[] }>;
  /** Sideways nudge for a wire-to-wire link (ends stay on wire tips). */
  wireLinkOffsets?: Record<string, PathOffset>;
  hubBridgePaths: Record<string, { points: { x: number; y: number }[] }>;
}

export interface Diagram {
  junctionBoxes: JunctionBox[];
  breakers: Breaker[];
  hubs: Hub[];
  hubBridges: HubBridge[];
  lightBulbs: LightBulb[];
  switches: Switch[];
  deviceNodes: DeviceNode[];
  conduits: Conduit[];
  wires: Wire[];
  wireLinks: WireLink[];
  layout: LayoutState;
}

export interface Job {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  diagram: Diagram;
}

export type ResolvedWire = Wire & {
  resolvedDirection: WireDirection | null;
  directionConflict: boolean;
  directionSource: 'breaker' | 'manual' | 'propagated' | null;
};
