import { resolveDirections } from './direction';
import { wireIdsOnDeviceTerminal } from './device-node-geometry';
import type { Diagram, ResolvedWire } from './types';

/** Wire ids attached to a device terminal (stub conduits or direct attach). */
export function wireIdsAtTerminal(diagram: Diagram, nodeId: string): string[] {
  const ids = [...wireIdsOnDeviceTerminal(diagram, nodeId)];
  for (const w of diagram.wires) {
    if (w.deviceNodeId === nodeId) ids.push(w.id);
  }
  return ids;
}

/** True when at least one wire on the terminal shows resolved charge flow. */
export function terminalHasActiveCharge(
  diagram: Diagram,
  nodeId: string,
  resolved?: Map<string, ResolvedWire>,
): boolean {
  const map = resolved ?? resolveDirections(diagram);
  for (const wireId of wireIdsAtTerminal(diagram, nodeId)) {
    if (map.get(wireId)?.resolvedDirection != null) return true;
  }
  return false;
}
