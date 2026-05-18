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
  manualDirection: WireDirection | null;
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

export type Conduit = LocalConduit | SpanConduit;

export interface WireLink {
  id: string;
  wireIdA: string;
  wireIdB: string;
  whiteMismatchWarning: boolean;
}

export interface LayoutState {
  conduitPaths: Record<string, { points: { x: number; y: number }[] }>;
  wireLinkPaths: Record<string, { points: { x: number; y: number }[] }>;
}

export interface Diagram {
  junctionBoxes: JunctionBox[];
  breakers: Breaker[];
  conduits: Conduit[];
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
