import type { SwitchTerminalCount } from '../domain/types';

/** Switch variant used when placing with the Switch tool. */
export type SwitchPlacementKind = 'single-pole' | 'three-way' | 'four-way' | 'dimmer';

export function switchTerminalCountForPlacement(kind: SwitchPlacementKind): SwitchTerminalCount {
  if (kind === 'four-way') return 4;
  if (kind === 'three-way') return 3;
  return 2;
}

export const SWITCH_PLACEMENT_OPTIONS: { value: SwitchPlacementKind; label: string }[] = [
  { value: 'single-pole', label: 'Single pole' },
  { value: 'three-way', label: 'Three-way' },
  { value: 'four-way', label: 'Four-way' },
  { value: 'dimmer', label: 'Dimmer' },
];

export const OUTLET_PLACEMENT_OPTIONS: { value: 'standard' | 'passthrough'; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'passthrough', label: 'Pass-through' },
];
