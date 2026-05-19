import type { Diagram, BreakerConduit, Wire, WireDirection } from './types';

export function isBreakerConduit(
  conduit: Diagram['conduits'][number],
): conduit is BreakerConduit {
  return conduit.kind === 'breaker';
}

export function breakerConduitForWire(diagram: Diagram, wireId: string): BreakerConduit | undefined {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return undefined;
  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  return conduit && isBreakerConduit(conduit) ? conduit : undefined;
}

export function isBreakerSeededWire(diagram: Diagram, wire: Wire): boolean {
  if (wire.breakerId != null) return true;
  return breakerConduitForWire(diagram, wire.id) != null;
}

/** Standard panel convention: black away from breaker, white toward. */
export function directionForBreakerWire(color: Wire['color']): WireDirection | null {
  if (color === 'black') return 'away';
  if (color === 'white') return 'toward';
  return null;
}
