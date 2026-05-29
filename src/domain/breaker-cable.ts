import type { Cable, WireColor, WireDirection } from './types';

export type BreakerCircuitPreset = 'twoWire' | 'threeWire';

export const BREAKER_PRESET_WIRE_COLORS: Record<BreakerCircuitPreset, readonly WireColor[]> = {
  twoWire: ['black', 'white'],
  threeWire: ['white', 'black', 'red'],
};

export function isBreakerCable(cable: Cable): boolean {
  return cable.role === 'breaker';
}

export function breakerCableClosed(cable: Cable): boolean {
  return cable.closed !== false;
}

export function toggleBreakerCableClosed(cable: Cable): Cable {
  return { ...cable, closed: !breakerCableClosed(cable) };
}

/** Panel convention: hots away from breaker, neutral toward. */
export function directionForBreakerWire(color: WireColor): WireDirection | null {
  if (color === 'black' || color === 'red') return 'away';
  if (color === 'white') return 'toward';
  return null;
}

export function breakerPresetWireColors(preset: BreakerCircuitPreset): WireColor[] {
  return [...BREAKER_PRESET_WIRE_COLORS[preset]];
}

export function breakerCableForWire(
  diagram: { cables: Cable[]; wires: { id: string; cableId: string | null }[] },
  wireId: string,
): Cable | undefined {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.cableId) return undefined;
  const cable = diagram.cables.find((c) => c.id === wire.cableId);
  return cable && isBreakerCable(cable) ? cable : undefined;
}

export function isBreakerSeededWire(
  diagram: { cables: Cable[]; wires: { id: string; cableId: string | null; breakerId: string | null }[] },
  wire: { id: string; cableId: string | null; breakerId: string | null },
): boolean {
  if (wire.breakerId != null) return true;
  return breakerCableForWire(diagram, wire.id) != null;
}
