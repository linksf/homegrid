import type { Diagram } from '../domain/types';
import type { ContextMenuTarget } from './context-menu-target';

function trimmedLabel(label: string | undefined | null, fallback: string): string {
  const t = (label ?? '').trim();
  return t.length > 0 ? t : fallback;
}

/** Short label for overlap pick menus and tap-cycle affordances. */
export function contextMenuTargetLabel(diagram: Diagram, target: ContextMenuTarget): string {
  switch (target.kind) {
    case 'wire': {
      const wire = diagram.wires.find((w) => w.id === target.wireId);
      return trimmedLabel(wire?.label, wire ? `${wire.color} wire` : 'Wire');
    }
    case 'junctionBox': {
      const box = diagram.junctionBoxes.find((b) => b.id === target.boxId);
      return trimmedLabel(box?.label, box?.type === 'breaker' ? 'Breaker panel' : 'Junction box');
    }
    case 'junctionAnchor':
      return `Anchor (${target.anchor})`;
    case 'room': {
      const room = diagram.rooms?.find((r) => r.id === target.roomId);
      return trimmedLabel(room?.label, 'Room');
    }
    case 'cable': {
      const cable = diagram.cables.find((c) => c.id === target.cableId);
      return trimmedLabel(cable?.label, cable?.role === 'breaker' ? 'Breaker circuit' : 'Cable');
    }
    case 'link':
      return 'Wire link';
    case 'hub': {
      const hub = diagram.hubs.find((h) => h.id === target.hubId);
      return trimmedLabel(hub?.label, 'Hub');
    }
    case 'hubBridge':
      return 'Hub bridge';
    case 'hubWire': {
      const wire = diagram.wires.find((w) => w.id === target.wireId);
      return trimmedLabel(wire?.label, wire ? `Hub ${wire.color} wire` : 'Hub wire');
    }
    case 'conduitRun':
      return 'Conduit run';
    case 'conduit':
      return 'Conduit bundle';
    case 'lightBulb': {
      const bulb = diagram.lightBulbs.find((b) => b.id === target.id);
      return trimmedLabel(bulb?.label, 'Light');
    }
    case 'switch': {
      const sw = diagram.switches.find((s) => s.id === target.id);
      return trimmedLabel(sw?.label, 'Switch');
    }
    case 'dimmerSwitch': {
      const dim = diagram.dimmerSwitches?.find((d) => d.id === target.id);
      return trimmedLabel(dim?.label, 'Dimmer');
    }
    case 'outlet': {
      const outlet = diagram.outlets?.find((o) => o.id === target.id);
      return trimmedLabel(outlet?.label, 'Outlet');
    }
    case 'deviceNode':
      return 'Terminal';
    case 'multi':
      return 'Selection';
  }
}
