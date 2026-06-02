import type { AnchorPosition } from '../domain/types';

export type ContextMenuTarget =
  | { kind: 'wire'; wireId: string }
  | { kind: 'junctionBox'; boxId: string }
  | { kind: 'junctionAnchor'; boxId: string; anchor: AnchorPosition }
  | { kind: 'room'; roomId: string }
  | { kind: 'cable'; cableId: string }
  | { kind: 'link'; linkId: string }
  | { kind: 'hub'; hubId: string }
  | { kind: 'hubBridge'; bridgeId: string }
  | { kind: 'hubWire'; wireId: string }
  | { kind: 'conduitRun'; runId: string }
  | { kind: 'conduit'; conduitId: string }
  | { kind: 'lightBulb'; id: string }
  | { kind: 'switch'; id: string }
  | { kind: 'dimmerSwitch'; id: string }
  | { kind: 'outlet'; id: string }
  | { kind: 'deviceNode'; nodeId: string }
  | { kind: 'multi' };
