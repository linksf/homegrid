import type { CSSProperties } from 'react';
import { energyHueStrokeStyle, mergeEnergyStrokeStyle, minEnergyHue } from '../domain/energy-hue';
import type { WireColor } from '../domain/types';
import { wireStrokeStyle } from './wire-stroke-style';

export function wirePathStrokeStyle(options: {
  showEnergyFlow: boolean;
  wireId: string;
  color: WireColor;
  energyHueByWireId: Map<string, number>;
  groupColor?: string | null;
}): CSSProperties | undefined {
  const { showEnergyFlow, wireId, color, energyHueByWireId, groupColor } = options;
  const base = wireStrokeStyle(color);
  if (showEnergyFlow) {
    return mergeEnergyStrokeStyle(energyHueByWireId.get(wireId), base);
  }
  if (groupColor) {
    return { stroke: groupColor, ...base };
  }
  return base;
}

export function bundlePathStrokeStyle(options: {
  showEnergyFlow: boolean;
  wireIds: readonly string[];
  energyHueByWireId: Map<string, number>;
  groupColor?: string | null;
}): CSSProperties | undefined {
  const { showEnergyFlow, wireIds, energyHueByWireId, groupColor } = options;
  if (showEnergyFlow) {
    return energyHueStrokeStyle(minEnergyHue(energyHueByWireId, wireIds));
  }
  if (groupColor) {
    return { stroke: groupColor };
  }
  return undefined;
}
