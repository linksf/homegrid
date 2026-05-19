import type { Diagram, WireLink } from './types';

export function wireLinkForWire(diagram: Diagram, wireId: string): WireLink | undefined {
  return diagram.wireLinks.find((l) => l.wireIdA === wireId || l.wireIdB === wireId);
}
