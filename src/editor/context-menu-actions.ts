import { isBreakerSeededWire } from '../domain/breaker-cable';
import { cableAnchorTaken } from '../domain/cable-slots';
import type { AnchorPosition, Diagram, WireColor } from '../domain/types';
import { connectableWireEndpoints } from '../domain/wire-routing';
import { wireLinkAtEndpoint } from '../domain/wire-link-utils';
import type { ContextMenuTarget } from './context-menu-target';
import { selectionHasDuplicateableContent } from './duplicate-selection';
import { selectionHasRotatableDevice } from './selection-actions';
import type { DiagramSelection } from './diagram-selection';

export type ContextMenuAction = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
};

export type ContextMenuActionContext = {
  diagram: Diagram;
  selection: DiagramSelection;
  target: ContextMenuTarget;
};

export function buildContextMenuActions(ctx: ContextMenuActionContext): ContextMenuAction[] {
  const { diagram, selection, target } = ctx;

  if (target.kind === 'multi') {
    return buildMultiActions(selection);
  }

  switch (target.kind) {
    case 'wire':
      return buildWireActions(diagram, target.wireId);
    case 'junctionAnchor':
      return buildJunctionAnchorActions(diagram, target.boxId, target.anchor);
    case 'junctionBox':
      return buildJunctionBoxActions(diagram, target.boxId);
    case 'room':
      return [{ id: 'room-place-door', label: 'Place door…' }, { id: 'delete', label: 'Delete room', danger: true }];
    case 'cable':
      return [{ id: 'delete', label: 'Delete cable', danger: true }];
    case 'link':
      return [{ id: 'delete', label: 'Delete connection', danger: true }];
    case 'hub':
      return [{ id: 'delete', label: 'Delete hub', danger: true }];
    case 'hubBridge':
      return [{ id: 'delete', label: 'Delete hub bridge', danger: true }];
    case 'hubWire':
      return [{ id: 'delete', label: 'Delete hub connection', danger: true }];
    case 'conduitRun':
      return [{ id: 'delete', label: 'Delete conduit run', danger: true }];
    case 'conduit':
      return [{ id: 'delete', label: 'Delete conduit', danger: true }];
    case 'lightBulb':
      return buildDeviceActions('lightBulb', selection);
    case 'switch':
      return buildDeviceActions('switch', selection);
    case 'dimmerSwitch':
      return buildDeviceActions('dimmerSwitch', selection);
    case 'outlet':
      return buildDeviceActions('outlet', selection);
    case 'deviceNode':
      return [{ id: 'delete', label: 'Delete device', danger: true }];
    default:
      return [];
  }
}

function buildMultiActions(selection: DiagramSelection): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];
  if (selectionHasDuplicateableContent(selection)) {
    actions.push({ id: 'duplicate', label: 'Duplicate selection' });
  }
  if (selectionHasRotatableDevice(selection)) {
    actions.push({ id: 'rotate-cw', label: 'Rotate 90° clockwise' });
  }
  actions.push({ id: 'delete', label: 'Delete selection', danger: true });
  return actions;
}

function buildDeviceActions(
  _kind: 'lightBulb' | 'switch' | 'dimmerSwitch' | 'outlet',
  selection: DiagramSelection,
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = [];
  if (selectionHasRotatableDevice(selection)) {
    actions.push({ id: 'rotate-cw', label: 'Rotate 90° clockwise' });
  }
  actions.push({ id: 'delete', label: 'Delete', danger: true });
  return actions;
}

function buildWireActions(diagram: Diagram, wireId: string): ContextMenuAction[] {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire) return [];

  const breakerLocked = isBreakerSeededWire(diagram, wire);
  const actions: ContextMenuAction[] = [];

  const linkable = connectableWireEndpoints(diagram, wireId).some(
    (ep) => !wireLinkAtEndpoint(diagram, wireId, ep),
  );
  if (linkable && !wire.hubId) {
    actions.push({ id: 'wire-create-link', label: 'Create link…' });
  }

  if (!breakerLocked) {
    for (const color of ['black', 'white', 'red'] as const) {
      if (color === wire.color) continue;
      actions.push({
        id: `wire-color-${color}`,
        label: `Set color to ${color.charAt(0).toUpperCase()}${color.slice(1)}`,
      });
    }
  }

  actions.push({
    id: 'delete',
    label: 'Delete wire',
    danger: true,
    disabled: breakerLocked,
  });

  return actions;
}

function buildJunctionAnchorActions(
  diagram: Diagram,
  boxId: string,
  anchor: AnchorPosition,
): ContextMenuAction[] {
  const box = diagram.junctionBoxes.find((b) => b.id === boxId);
  if (!box) return [];

  const taken = cableAnchorTaken(diagram, boxId, anchor);
  if (taken || box.type === 'breaker') {
    return [];
  }

  return [
    { id: 'anchor-cable-bw', label: 'Add cable (black, white)' },
    { id: 'anchor-cable-bwr', label: 'Add cable (black, white, red)' },
  ];
}

function buildJunctionBoxActions(diagram: Diagram, boxId: string): ContextMenuAction[] {
  const box = diagram.junctionBoxes.find((b) => b.id === boxId);
  if (!box) return [];

  const actions: ContextMenuAction[] = [];
  const hubCount = diagram.hubs.filter((h) => h.junctionBoxId === boxId).length;

  if (box.type !== 'breaker' && hubCount < 4) {
    actions.push({ id: 'box-add-hub', label: 'Add hub' });
  }
  if (box.type === 'breaker') {
    actions.push({ id: 'box-add-breaker-circuit', label: 'Add breaker cable' });
  }

  actions.push({
    id: 'delete',
    label: box.type === 'breaker' ? 'Delete panel' : 'Delete box',
    danger: true,
  });
  return actions;
}

export function wireColorFromActionId(actionId: string): WireColor | null {
  if (actionId === 'wire-color-black') return 'black';
  if (actionId === 'wire-color-white') return 'white';
  if (actionId === 'wire-color-red') return 'red';
  return null;
}

export function cableColorsFromActionId(actionId: string): WireColor[] | null {
  if (actionId === 'anchor-cable-bw') return ['black', 'white'];
  if (actionId === 'anchor-cable-bwr') return ['black', 'white', 'red'];
  return null;
}
