import { nanoid } from 'nanoid';
import { snapGridCoord, snapJunctionBoxRect } from './grid';
import { snapRoomDraftCorners } from './room-snap';
import type { Area, Diagram } from './types';

export const MIN_AREA_SIZE = Object.freeze({ width: 48, height: 48 });

export const DEFAULT_AREA_SIZE = Object.freeze({ width: 192, height: 144 });

function clampAreaSize(width: number, height: number): { width: number; height: number } {
  const snapped = snapJunctionBoxRect({ x: 0, y: 0, width, height });
  return {
    width: Math.max(MIN_AREA_SIZE.width, snapped.width),
    height: Math.max(MIN_AREA_SIZE.height, snapped.height),
  };
}

function normalizeArea(area: Area): Area {
  const { width, height } = clampAreaSize(area.width, area.height);
  return {
    id: area.id,
    label: typeof area.label === 'string' ? area.label : '',
    x: snapGridCoord(area.x),
    y: snapGridCoord(area.y),
    width,
    height,
  };
}

export function addArea(diagram: Diagram, worldX: number, worldY: number): Diagram {
  const { width: w, height: h } = DEFAULT_AREA_SIZE;
  const area = normalizeArea({
    id: nanoid(),
    label: '',
    x: snapGridCoord(worldX - w / 2),
    y: snapGridCoord(worldY - h / 2),
    width: w,
    height: h,
  });
  return {
    ...diagram,
    areas: [...(diagram.areas ?? []), area],
  };
}

export function addAreaFromBounds(
  diagram: Diagram,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Diagram {
  const snapped = snapRoomDraftCorners(x0, y0, x1, y1, diagram.rooms ?? []);
  const minX = Math.min(snapped.x0, snapped.x1);
  const minY = Math.min(snapped.y0, snapped.y1);
  const area = normalizeArea({
    id: nanoid(),
    label: '',
    x: minX,
    y: minY,
    width: Math.abs(snapped.x1 - snapped.x0),
    height: Math.abs(snapped.y1 - snapped.y0),
  });
  return {
    ...diagram,
    areas: [...(diagram.areas ?? []), area],
  };
}

export function updateArea(diagram: Diagram, areaId: string, patch: Partial<Area>): Diagram {
  const areas = (diagram.areas ?? []).map((area) =>
    area.id === areaId ? normalizeArea({ ...area, ...patch }) : area,
  );
  return { ...diagram, areas };
}

export function removeArea(diagram: Diagram, areaId: string): Diagram {
  return {
    ...diagram,
    areas: (diagram.areas ?? []).filter((area) => area.id !== areaId),
  };
}
