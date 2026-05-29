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
  cableId: string | null;
  breakerId: string | null;
  /** Hub attachment for this wire (can coexist with a device terminal on the same wire). */
  hubId: string | null;
  /** Terminal on a light bulb or switch (can coexist with hub attachment). */
  deviceNodeId: string | null;
  manualDirection: WireDirection | null;
}

/** Connection terminal on a device; many wires may share one terminal. */
export interface DeviceNode {
  id: string;
  deviceKind: 'lightBulb' | 'switch' | 'dimmerSwitch' | 'outlet';
  deviceId: string;
  /** Index within the device (meaning varies by device kind). */
  slot: number;
}

export interface LightBulb {
  id: string;
  label: string;
  /** Top-left of bounding square in world space. */
  x: number;
  y: number;
}

export type SwitchTerminalCount = 2 | 3 | 4;

export interface Switch {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  terminalCount: SwitchTerminalCount;
  /** SPST: open/closed. Three-way: common (slot 0) to traveler A/B. Four-way: straight or cross pairs. */
  position?: SinglePoleSwitchPosition | ThreeWaySwitchPosition | FourWaySwitchPosition;
}

/** Two-terminal single-pole switch simulation. */
export type SinglePoleSwitchPosition = 'open' | 'closed';

/** Three-terminal three-way switch simulation (common on slot 0). */
export type ThreeWaySwitchPosition = 'travelerA' | 'travelerB';

/** Four-terminal four-way switch: pairs 0↔2 & 1↔3 (straight) or 0↔3 & 1↔2 (cross). */
export type FourWaySwitchPosition = 'straight' | 'cross';

export type SwitchPosition = SinglePoleSwitchPosition | ThreeWaySwitchPosition | FourWaySwitchPosition;

/** Two-terminal dimmer: line (slot 0) and load (slot 1). */
export type DimmerSwitchPosition = 'off' | 'on';

export interface DimmerSwitch {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 = off (open), 100 = full current to load. */
  level?: number;
  /** Legacy on/off; migrated to `level` on load. */
  position?: DimmerSwitchPosition;
}

/** Duplex outlet: hot (slot 0) and neutral (slot 1), or passthrough with four terminals. */
export interface Outlet {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** When true, hot in/out (0↔1) and neutral in/out (2↔3) pass through. */
  passthrough: boolean;
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

export interface Cable {
  id: string;
  junctionBoxId: string;
  anchor: AnchorPosition;
  wireIds: string[];
  label?: string;
  /** `breaker` on panel anchors: toggle instead of exposed wires. Default `junction`. */
  role?: 'junction' | 'breaker';
  /** Breaker cables only; default true (ON). */
  closed?: boolean;
}

export interface ConduitRun {
  id: string;
  cableIdA: string;
  cableIdB: string | null;
  wireIds: string[];
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

/** Stub bundle from a light or switch terminal outward into the diagram. */
export interface DeviceConduit extends ConduitBase {
  kind: 'device';
  deviceNodeId: string;
}

/** Stub bundle from a hub outward into the diagram; wires are tied to the hub. */
export interface HubConduit extends ConduitBase {
  kind: 'hub';
  hubId: string;
}

export type Conduit = LocalConduit | SpanConduit | DeviceConduit | HubConduit;

export type WireEndpoint = 'start' | 'end';

export interface WireLink {
  id: string;
  wireIdA: string;
  endpointA: WireEndpoint;
  wireIdB: string;
  endpointB: WireEndpoint;
}

export interface PathOffset {
  dx: number;
  dy: number;
}

export type RoomWall = 'north' | 'east' | 'south' | 'west';

export interface RoomDoor {
  id: string;
  wall: RoomWall;
  /** Distance from the wall start corner along that wall, grid-snapped. */
  offset: number;
  width: number;
}

/** Visual-only floor-plan region; does not affect wiring simulation. */
export interface Room {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doors: RoomDoor[];
}

export interface LayoutState {
  conduitPaths: Record<string, { points: { x: number; y: number }[] }>;
  exposedPaths?: Record<string, { points: { x: number; y: number }[] }>;
  conduitStubPaths?: Record<string, { points: { x: number; y: number }[] }>;
  conduitRunPaths: Record<string, { points: { x: number; y: number }[] }>;
  /** Sideways nudge for the whole conduit bundle (ends stay on anchor and tip). */
  conduitOffsets?: Record<string, PathOffset>;
  /** Extra sideways nudge for one wire within its conduit bundle. */
  wireOffsets?: Record<string, PathOffset>;
  /** Independent orthogonal path per wire (stub conduits). */
  wirePaths?: Record<string, { points: { x: number; y: number }[] }>;
  wireLinkPaths: Record<string, { points: { x: number; y: number }[] }>;
  /** Orthogonal path from hub to wire or device terminal per hub-attached wire. */
  hubWirePaths?: Record<string, { points: { x: number; y: number }[] }>;
  /** Orthogonal path from device terminal to wire tip per device-attached wire. */
  deviceWirePaths?: Record<string, { points: { x: number; y: number }[] }>;
  /** Sideways nudge for a wire-to-wire link (ends stay on wire tips). */
  wireLinkOffsets?: Record<string, PathOffset>;
  hubBridgePaths: Record<string, { points: { x: number; y: number }[] }>;
}

export interface Diagram {
  rooms: Room[];
  junctionBoxes: JunctionBox[];
  breakers: Breaker[];
  hubs: Hub[];
  hubBridges: HubBridge[];
  lightBulbs: LightBulb[];
  switches: Switch[];
  dimmerSwitches: DimmerSwitch[];
  outlets: Outlet[];
  deviceNodes: DeviceNode[];
  conduits: Conduit[];
  cables: Cable[];
  conduitRuns: ConduitRun[];
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
