import type { JSX } from 'react';
import { breakerCableClosed, isBreakerCable } from '../domain/breaker-cable';
import type {
  AnchorPosition,
  Cable,
  Conduit,
  Hub,
  HubBridge,
  JunctionBox,
  LightBulb,
  Switch,
  DimmerSwitch,
  DimmerSwitchPosition,
  Outlet,
  Room,
  RoomDoor,
  RoomWall,
  SwitchPosition,
  Wire,
  WireColor,
  WireDirection,
  WireLink,
  ResolvedWire,
  Diagram,
} from '../domain/types';
import { normalizeDimmerLevel } from '../domain/continuity';
import { wallLength } from '../domain/room-mutations';
import { isDirectionOpposedLink } from '../domain/wire-link-utils';
export type InspectorSelection =
  | {
      kind: 'wire';
      wire: Wire;
      hubLabel: string | null;
      deviceTerminalLabel: string | null;
      wireLinkPeer: string | null;
      breakerLocked: boolean;
    }
  | { kind: 'link'; link: WireLink; wireLabelA: string; wireLabelB: string }
  | { kind: 'hubBridge'; bridge: HubBridge; hubLabelA: string; hubLabelB: string }
  | { kind: 'hub'; hub: Hub; wireLabels: string[] }
  | { kind: 'cable'; cable: Cable }
  | { kind: 'conduit'; conduit: Conduit; wireCount: number }
  | { kind: 'junctionBox'; box: JunctionBox; hubCount: number; hubSlotsFull: boolean }
  | { kind: 'lightBulb'; bulb: LightBulb; wireLabels: string[] }
  | { kind: 'switch'; sw: Switch; wireLabels: string[] }
  | { kind: 'dimmerSwitch'; dim: DimmerSwitch; wireLabels: string[] }
  | { kind: 'outlet'; outlet: Outlet; wireLabels: string[] }
  | { kind: 'room'; room: Room }
  | {
      kind: 'multi';
      counts: {
        junctionBoxes: number;
        wires: number;
        conduits: number;
        cables: number;
        hubs: number;
        hubBridges: number;
        links: number;
        lightBulbs: number;
        switches: number;
        dimmerSwitches: number;
        outlets: number;
        rooms: number;
        deviceNodes: number;
        junctionAnchors: number;
        pathAnchors: number;
      };
    }
  | null;

function RotateControl({ onRotate }: { onRotate?: (direction: 'cw' | 'ccw') => void }): JSX.Element | null {
  if (!onRotate) return null;
  return (
    <div className="inspector__field">
      <span className="inspector__label">Rotation</span>
      <div className="inspector__rotate-buttons">
        <button type="button" className="btn" onClick={() => onRotate('ccw')} title="Rotate 90° counter-clockwise (Shift+R)">
          ⟲ 90°
        </button>
        <button type="button" className="btn" onClick={() => onRotate('cw')} title="Rotate 90° clockwise (R)">
          ⟳ 90°
        </button>
      </div>
    </div>
  );
}

const BOX_WALL_ANCHORS: AnchorPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

type InspectorProps = {
  diagram: Diagram;
  selection: InspectorSelection;
  resolvedByWireId: Map<string, ResolvedWire>;
  onUpdateWire: (patch: Partial<Pick<Wire, 'label' | 'manualDirection'>>) => void;
  onUpdateCable?: (patch: Partial<Pick<Cable, 'label'>>) => void;
  onUpdateCableWires?: (wireColors: WireColor[]) => void;
  onMoveCableAnchor?: (anchor: AnchorPosition) => void;
  onToggleBreakerCable?: () => void;
  onUpdateConduit: (label: string) => void;
  onUpdateJunctionBox: (label: string) => void;
  onUpdateHub: (label: string) => void;
  onAddHub?: () => void;
  onAddBreakerCircuit?: () => void;
  onDetachWireFromHub?: (wireId: string) => void;
  onDetachWireFromDeviceNode?: (wireId: string) => void;
  onUpdateLightBulb?: (label: string) => void;
  onUpdateSwitch?: (patch: {
    label?: string;
    terminalCount?: 2 | 3 | 4;
    position?: SwitchPosition;
  }) => void;
  onToggleSwitch?: () => void;
  onUpdateDimmerSwitch?: (patch: { label?: string; level?: number; position?: DimmerSwitchPosition }) => void;
  onToggleDimmer?: () => void;
  onUpdateOutlet?: (patch: { label?: string; passthrough?: boolean }) => void;
  onRotateDevice?: (direction: 'cw' | 'ccw') => void;
  onUpdateRoom?: (patch: { label?: string; doors?: RoomDoor[] }) => void;
  onRemoveRoomDoor?: (doorId: string) => void;
  doorPlacing?: boolean;
  onToggleDoorPlacing?: () => void;
  onDelete: () => void;
  deleteError: string | null;
};

export function Inspector({
  diagram,
  selection,
  resolvedByWireId,
  onUpdateWire,
  onUpdateCable,
  onUpdateCableWires,
  onMoveCableAnchor,
  onToggleBreakerCable,
  onUpdateConduit,
  onUpdateJunctionBox,
  onUpdateHub,
  onAddHub,
  onAddBreakerCircuit,
  onDetachWireFromHub,
  onDetachWireFromDeviceNode,
  onUpdateLightBulb,
  onUpdateSwitch,
  onToggleSwitch,
  onUpdateDimmerSwitch,
  onToggleDimmer,
  onUpdateOutlet,
  onRotateDevice,
  onUpdateRoom,
  onRemoveRoomDoor,
  doorPlacing = false,
  onToggleDoorPlacing,
  onDelete,
  deleteError,
}: InspectorProps): JSX.Element {
  if (!selection) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <p className="inspector__empty">
          Select a junction box, hub, conduit bundle, cable, wire, light, switch, dimmer, outlet, room, or connection to
          edit. Use Cable (C) for junction-wall stubs and Conduit connect (E) for sheathed runs. Use Link (J) to connect
          wire ends, hubs, or device terminals. Press <kbd>Delete</kbd> to remove the selection.
        </p>
      </aside>
    );
  }

  if (selection.kind === 'multi') {
    const { counts } = selection;
    const parts: string[] = [];
    if (counts.junctionBoxes) parts.push(`${counts.junctionBoxes} box${counts.junctionBoxes === 1 ? '' : 'es'}`);
    if (counts.wires) parts.push(`${counts.wires} wire${counts.wires === 1 ? '' : 's'}`);
    if (counts.conduits) parts.push(`${counts.conduits} conduit${counts.conduits === 1 ? '' : 's'}`);
    if (counts.cables) parts.push(`${counts.cables} cable${counts.cables === 1 ? '' : 's'}`);
    if (counts.hubs) parts.push(`${counts.hubs} hub${counts.hubs === 1 ? '' : 's'}`);
    if (counts.hubBridges) parts.push(`${counts.hubBridges} bridge${counts.hubBridges === 1 ? '' : 's'}`);
    if (counts.links) parts.push(`${counts.links} link${counts.links === 1 ? '' : 's'}`);
    if (counts.lightBulbs) parts.push(`${counts.lightBulbs} light${counts.lightBulbs === 1 ? '' : 's'}`);
    if (counts.switches) parts.push(`${counts.switches} switch${counts.switches === 1 ? '' : 'es'}`);
    if (counts.dimmerSwitches) parts.push(`${counts.dimmerSwitches} dimmer${counts.dimmerSwitches === 1 ? '' : 's'}`);
    if (counts.outlets) parts.push(`${counts.outlets} outlet${counts.outlets === 1 ? '' : 's'}`);
    if (counts.rooms) parts.push(`${counts.rooms} room${counts.rooms === 1 ? '' : 's'}`);
    if (counts.junctionAnchors) {
      parts.push(`${counts.junctionAnchors} junction anchor${counts.junctionAnchors === 1 ? '' : 's'}`);
    }
    if (counts.pathAnchors) {
      parts.push(`${counts.pathAnchors} path anchor${counts.pathAnchors === 1 ? '' : 's'}`);
    }

    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Multiple selected</h3>
        <p className="inspector__meta">{parts.join(' · ')}</p>
        <p className="inspector__hint">
          Drag junction anchors or path bends to move them together. Drag left-to-right to select everything the box
          touches; drag right-to-left to select only items fully inside the box. Press <kbd>Delete</kbd> to remove all
          selected items.
        </p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete selection
        </button>
      </aside>
    );
  }

  if (selection.kind === 'link') {
    const opposed = isDirectionOpposedLink(
      selection.link,
      resolvedByWireId.get(selection.link.wireIdA),
      resolvedByWireId.get(selection.link.wireIdB),
    );
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Wire connection</h3>
        <p className="inspector__meta">
          {selection.wireLabelA} ↔ {selection.wireLabelB}
        </p>
        {opposed && (
          <p className="inspector__hint inspector__hint--warn">
            Both wires flow into this connection — check that the splice is intentional.
          </p>
        )}
        <p className="inspector__hint">
          Drag the square joints on the connection path to reshape it (horizontal and vertical segments only).
        </p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete connection
        </button>
      </aside>
    );
  }

  if (selection.kind === 'hubBridge') {
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Hub bridge</h3>
        <p className="inspector__meta">
          {selection.hubLabelA} ↔ {selection.hubLabelB}
        </p>
        <p className="inspector__hint">Electrical tie between two junction boxes. All wires on each hub share direction.</p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete hub bridge
        </button>
      </aside>
    );
  }

  if (selection.kind === 'hub') {
    const hub = selection.hub;
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Hub</h3>
        <p className="inspector__meta">{selection.wireLabels.length} attached wire{selection.wireLabels.length === 1 ? '' : 's'}</p>
        <p className="inspector__hint">
          Direct ties from Connect mode: one conductor per hub. Use a hub conduit stub for multi-wire bundles.
        </p>

        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={hub.label}
            onChange={(e) => onUpdateHub(e.target.value)}
            placeholder="Hub"
            autoComplete="off"
          />
        </label>

        {selection.wireLabels.length > 0 && (
          <ul className="inspector__wire-list">
            {selection.wireLabels.map((label, idx) => (
              <li key={idx}>{label}</li>
            ))}
          </ul>
        )}

        <p className="inspector__hint">Connect mode: tap wires to attach, or another hub in a different box to bridge.</p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete hub
        </button>
      </aside>
    );
  }

  if (selection.kind === 'lightBulb') {
    const bulb = selection.bulb;
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Light</h3>
        <p className="inspector__meta">Two terminals (left and right)</p>
        <p className="inspector__hint">One wire connection only per terminal.</p>
        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={bulb.label}
            onChange={(e) => onUpdateLightBulb?.(e.target.value)}
            placeholder="Light"
            autoComplete="off"
          />
        </label>
        <RotateControl onRotate={onRotateDevice} />
        {selection.wireLabels.length > 0 && (
          <ul className="inspector__wire-list">
            {selection.wireLabels.map((label, idx) => (
              <li key={idx}>{label}</li>
            ))}
          </ul>
        )}
        <p className="inspector__hint">Connect mode: tap a wire, then a terminal (or the reverse).</p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete light
        </button>
      </aside>
    );
  }

  if (selection.kind === 'switch') {
    const sw = selection.sw;
    const position =
      sw.terminalCount === 4
        ? sw.position === 'cross'
          ? 'cross'
          : 'straight'
        : sw.terminalCount === 3
          ? sw.position === 'travelerB'
            ? 'travelerB'
            : 'travelerA'
          : sw.position === 'closed'
            ? 'closed'
            : 'open';
    const switchKindLabel =
      sw.terminalCount === 4 ? 'four-way' : sw.terminalCount === 3 ? 'three-way' : 'single pole';
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Switch</h3>
        <p className="inspector__meta">
          {sw.terminalCount} terminals · {switchKindLabel}
        </p>
        <p className="inspector__hint">One wire connection only per terminal.</p>
        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={sw.label}
            onChange={(e) => onUpdateSwitch?.({ label: e.target.value })}
            placeholder="Switch"
            autoComplete="off"
          />
        </label>
        <RotateControl onRotate={onRotateDevice} />
        <label className="inspector__field">
          <span className="inspector__label">Terminals</span>
          <select
            className="inspector__input"
            value={String(sw.terminalCount)}
            onChange={(e) => {
              const n = Number(e.target.value);
              onUpdateSwitch?.({
                terminalCount: n === 4 ? 4 : n === 3 ? 3 : 2,
              });
            }}
          >
            <option value="2">2 (single pole)</option>
            <option value="3">3 (three-way)</option>
            <option value="4">4 (four-way)</option>
          </select>
        </label>
        <label className="inspector__field">
          <span className="inspector__label">Simulation</span>
          {sw.terminalCount === 4 ? (
            <select
              className="inspector__input"
              value={position}
              onChange={(e) => {
                onUpdateSwitch?.({
                  position: e.target.value === 'cross' ? 'cross' : 'straight',
                });
              }}
            >
              <option value="straight">Straight (0↔2, 1↔3)</option>
              <option value="cross">Cross (0↔3, 1↔2)</option>
            </select>
          ) : sw.terminalCount === 3 ? (
            <select
              className="inspector__input"
              value={position}
              onChange={(e) => {
                const v = e.target.value;
                onUpdateSwitch?.({
                  position: v === 'travelerB' ? 'travelerB' : 'travelerA',
                });
              }}
            >
              <option value="travelerA">Common ↔ right traveler</option>
              <option value="travelerB">Common ↔ bottom traveler</option>
            </select>
          ) : (
            <select
              className="inspector__input"
              value={position}
              onChange={(e) => {
                onUpdateSwitch?.({ position: e.target.value === 'closed' ? 'closed' : 'open' });
              }}
            >
              <option value="open">Open (off)</option>
              <option value="closed">Closed (on)</option>
            </select>
          )}
        </label>
        {onToggleSwitch && (
          <button type="button" className="btn btn--block" onClick={onToggleSwitch}>
            Toggle switch
          </button>
        )}
        <p className="inspector__hint">
          Double-click a switch on the canvas to toggle its position. Connected terminals are highlighted.
        </p>
        {selection.wireLabels.length > 0 && (
          <ul className="inspector__wire-list">
            {selection.wireLabels.map((label, idx) => (
              <li key={idx}>{label}</li>
            ))}
          </ul>
        )}
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete switch
        </button>
      </aside>
    );
  }

  if (selection.kind === 'dimmerSwitch') {
    const dim = selection.dim;
    const level = normalizeDimmerLevel(dim);
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Dimmer switch</h3>
        <p className="inspector__meta">2 terminals · line and load</p>
        <p className="inspector__hint">One wire connection only per terminal.</p>
        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={dim.label}
            onChange={(e) => onUpdateDimmerSwitch?.({ label: e.target.value })}
            placeholder="Dimmer"
            autoComplete="off"
          />
        </label>
        <RotateControl onRotate={onRotateDevice} />
        <label className="inspector__field">
          <span className="inspector__label">Level ({level}%)</span>
          <input
            className="inspector__range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={level}
            onChange={(e) => onUpdateDimmerSwitch?.({ level: Number(e.target.value) })}
          />
        </label>
        {onToggleDimmer && (
          <button type="button" className="btn btn--block" onClick={onToggleDimmer}>
            {level > 0 ? 'Turn off' : 'Turn on full'}
          </button>
        )}
        <p className="inspector__hint">
          Scroll over a selected dimmer to adjust level. Double-click toggles off and full. Attached lights dim with the level.
        </p>
        {selection.wireLabels.length > 0 && (
          <ul className="inspector__wire-list">
            {selection.wireLabels.map((label, idx) => (
              <li key={idx}>{label}</li>
            ))}
          </ul>
        )}
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete dimmer
        </button>
      </aside>
    );
  }

  if (selection.kind === 'outlet') {
    const outlet = selection.outlet;
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Outlet</h3>
        <p className="inspector__meta">
          {outlet.passthrough ? 'Pass-through · 4 terminals' : 'Standard · hot and neutral'}
        </p>
        <p className="inspector__hint">One wire connection only per terminal.</p>
        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={outlet.label}
            onChange={(e) => onUpdateOutlet?.({ label: e.target.value })}
            placeholder="Outlet"
            autoComplete="off"
          />
        </label>
        <RotateControl onRotate={onRotateDevice} />
        <label className="inspector__field">
          <span className="inspector__label">Type</span>
          <select
            className="inspector__input"
            value={outlet.passthrough ? 'passthrough' : 'standard'}
            onChange={(e) => onUpdateOutlet?.({ passthrough: e.target.value === 'passthrough' })}
          >
            <option value="standard">Standard (hot + neutral)</option>
            <option value="passthrough">Pass-through (hot/neutral in and out)</option>
          </select>
        </label>
        <p className="inspector__hint">
          {outlet.passthrough
            ? 'Green lines show hot and neutral pairs passing through the outlet.'
            : 'Highlights when hot and neutral are both present at the outlet.'}
        </p>
        {selection.wireLabels.length > 0 && (
          <ul className="inspector__wire-list">
            {selection.wireLabels.map((label, idx) => (
              <li key={idx}>{label}</li>
            ))}
          </ul>
        )}
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete outlet
        </button>
      </aside>
    );
  }

  if (selection.kind === 'room') {
    const room = selection.room;
    const wallLabels: Record<RoomWall, string> = {
      north: 'North',
      east: 'East',
      south: 'South',
      west: 'West',
    };

    function updateDoor(doorId: string, patch: Partial<RoomDoor>) {
      const doors = (room.doors ?? []).map((door) =>
        door.id === doorId ? { ...door, ...patch } : door,
      );
      onUpdateRoom?.({ doors });
    }

    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Room</h3>
        <p className="inspector__meta">Visual only · does not affect wiring</p>
        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={room.label}
            onChange={(e) => onUpdateRoom?.({ label: e.target.value })}
            placeholder="Room name"
            autoComplete="off"
          />
        </label>

        <div className="inspector__field">
          <span className="inspector__label">Doors</span>
          <button
            type="button"
            className={['btn', 'btn--block', doorPlacing ? 'btn--active' : ''].filter(Boolean).join(' ')}
            aria-pressed={doorPlacing}
            onClick={() => onToggleDoorPlacing?.()}
          >
            {doorPlacing ? 'Click a wall to place… (Esc to stop)' : 'Place door'}
          </button>
          {(room.doors ?? []).length === 0 ? (
            <p className="inspector__hint">
              No doors yet. Choose “Place door”, then click anywhere along a wall to drop one.
            </p>
          ) : (
            <ul className="inspector__door-list">
              {(room.doors ?? []).map((door) => (
                <li key={door.id} className="inspector__door-item">
                  <label className="inspector__door-field">
                    <span>Wall</span>
                    <select
                      className="inspector__input"
                      value={door.wall}
                      onChange={(e) => updateDoor(door.id, { wall: e.target.value as RoomWall })}
                    >
                      {(Object.keys(wallLabels) as RoomWall[]).map((wall) => (
                        <option key={wall} value={wall}>
                          {wallLabels[wall]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inspector__door-field">
                    <span>Width</span>
                    <input
                      className="inspector__input"
                      type="number"
                      min={24}
                      max={wallLength(room, door.wall)}
                      step={12}
                      value={door.width}
                      onChange={(e) => updateDoor(door.id, { width: Number(e.target.value) })}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => onRemoveRoomDoor?.(door.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="inspector__hint">
          Click the room outline to select. Drag corners to resize. Interior clicks pass through to wiring below.
        </p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete room
        </button>
      </aside>
    );
  }

  if (selection.kind === 'junctionBox') {
    const box = selection.box;
    const typeLabel = box.type === 'breaker' ? 'Breaker panel' : 'Junction box';

    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">{typeLabel}</h3>
        <p className="inspector__meta">
          Type: {typeLabel} · {selection.hubCount} hub{selection.hubCount === 1 ? '' : 's'}
        </p>

        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={box.label}
            onChange={(e) => onUpdateJunctionBox(e.target.value)}
            placeholder={box.type === 'breaker' ? 'Breaker panel' : 'J-box'}
            autoComplete="off"
          />
        </label>

        {onAddHub && box.type !== 'breaker' && (
          <button
            type="button"
            className="btn btn--block"
            onClick={onAddHub}
            disabled={selection.hubSlotsFull}
            title={selection.hubSlotsFull ? 'All four hub slots are in use' : undefined}
          >
            Add hub
          </button>
        )}
        {selection.hubSlotsFull && box.type !== 'breaker' && (
          <p className="inspector__hint">This box has all four hub slots filled.</p>
        )}

        {onAddBreakerCircuit && box.type === 'breaker' && (
          <button type="button" className="btn btn--block" onClick={onAddBreakerCircuit}>
            Add breaker cable
          </button>
        )}

        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <p className="inspector__hint">
          Deleting removes this box, its hubs, and all conduit bundles, conduit runs, and wires attached to it
          (including links to other boxes).
        </p>
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete {box.type === 'breaker' ? 'panel' : 'box'}
        </button>
      </aside>
    );
  }

  if (selection.kind === 'cable') {
    const cable = selection.cable;
    const isBreaker = isBreakerCable(cable);
    const junctionBoxId = cable.junctionBoxId;
    const anchorChoices = BOX_WALL_ANCHORS.filter(
      (a) =>
        !diagram.cables.some(
          (c) => c.junctionBoxId === junctionBoxId && c.anchor === a && c.id !== cable.id,
        ),
    );
    const wireById = new Map(diagram.wires.map((w) => [w.id, w]));
    const wireColors: WireColor[] = cable.wireIds.map((id) => wireById.get(id)?.color ?? 'black');
    const n = wireColors.length as 1 | 2 | 3;

    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">{isBreaker ? 'Breaker circuit' : 'Cable'}</h3>
        <p className="inspector__meta">
          {isBreaker ? 'Panel toggle + field conduit' : 'Exposed wires + conduit stub'}
        </p>

        {isBreaker && onToggleBreakerCable ? (
          <div className="inspector__field">
            <span className="inspector__label">Breaker</span>
            <button type="button" className="btn btn--block" onClick={onToggleBreakerCable}>
              {breakerCableClosed(cable) ? 'Turn OFF' : 'Turn ON'}
            </button>
            <p className="inspector__hint">
              Double-click the toggle on the canvas to flip it. OFF opens the circuit (no flow from the panel).
            </p>
          </div>
        ) : null}

        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={cable.label ?? ''}
            onChange={(e) => onUpdateCable?.({ label: e.target.value })}
            placeholder="Cable"
            autoComplete="off"
          />
        </label>

        <label className="inspector__field">
          <span className="inspector__label">Wire count</span>
          <select
            className="inspector__input"
            value={String(n)}
            onChange={(e) => {
              const nextLen = Number(e.target.value) as 1 | 2 | 3;
              if (nextLen === n || !onUpdateCableWires) return;
              if (nextLen > n) {
                const fill: WireColor = wireColors[n - 1] ?? 'black';
                const added: WireColor[] = Array.from({ length: nextLen - n }, (): WireColor => fill);
                onUpdateCableWires([...wireColors, ...added]);
              } else {
                onUpdateCableWires(wireColors.slice(0, nextLen) as WireColor[]);
              }
            }}
          >
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>

        <div className="inspector__field">
          <span className="inspector__label">Wire colors</span>
          {wireColors.map((color, idx) => (
            <label key={`${cable.id}-wire-${idx}`} className="inspector__door-field" style={{ marginTop: idx ? 8 : 0 }}>
              <span>Wire {idx + 1}</span>
              <select
                className="inspector__input"
                value={color}
                onChange={(e) => {
                  const next = e.target.value as WireColor;
                  const copy = [...wireColors];
                  copy[idx] = next;
                  onUpdateCableWires?.(copy);
                }}
              >
                <option value="red">Red</option>
                <option value="black">Black</option>
                <option value="white">White</option>
              </select>
            </label>
          ))}
        </div>

        <label className="inspector__field">
          <span className="inspector__label">Wall anchor</span>
          <select
            className="inspector__input"
            value={cable.anchor}
            onChange={(e) => onMoveCableAnchor?.(e.target.value as AnchorPosition)}
          >
            {anchorChoices.map((a) => (
              <option key={a} value={a}>
                {a.replace(/-/g, ' ')}
              </option>
            ))}
          </select>
        </label>

        <p className="inspector__hint">
          {isBreaker
            ? 'Conduit runs connect on the field side. Wire count and colors must match connected runs.'
            : 'Drag wire paths at the free end; the wall anchor stays on the box until you move it here.'}
        </p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete {isBreaker ? 'breaker circuit' : 'cable'}
        </button>
      </aside>
    );
  }

  if (selection.kind === 'conduit') {
    const conduit = selection.conduit;
    const legacyKind = (conduit as { kind: string }).kind;
    const kindLabel =
      legacyKind === 'breaker'
        ? 'breaker circuit'
        : conduit.kind === 'local'
          ? 'legacy wall bundle (prefer Cable after migration)'
          : conduit.kind === 'device'
            ? 'device terminal'
            : conduit.kind === 'hub'
              ? 'hub'
              : 'legacy box-to-box bundle (prefer Conduit connect after migration)';

    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">{legacyKind === 'breaker' ? 'Breaker circuit' : 'Conduit'}</h3>
        <p className="inspector__meta">
          {selection.wireCount} wire{selection.wireCount === 1 ? '' : 's'} · {kindLabel}
        </p>
        {conduit.kind === 'device' && (
          <p className="inspector__hint">
            Terminal stubs carry one conductor. Use Connect mode when you already have an exposed wire tip.
          </p>
        )}
        {legacyKind === 'breaker' && (
          <p className="inspector__hint">
            {(conduit as { preset?: string; wireIds: string[] }).preset === 'threeWire' ||
            conduit.wireIds.length >= 3 ? (
              <>
                Black and red wires seed <strong>away</strong> from the panel; white seeds{' '}
                <strong>toward</strong>. Direction propagates through connections.
              </>
            ) : (
              <>
                Black wire seeds <strong>away</strong> from the panel; white seeds <strong>toward</strong>. Direction
                propagates through connections.
              </>
            )}
          </p>
        )}

        <p className="inspector__hint">
          Select a wire in this bundle, then drag its joints to reshape that wire only. The anchor stays fixed on the
          box or device.
        </p>

        <label className="inspector__field">
          <span className="inspector__label">Label</span>
          <input
            className="inspector__input"
            type="text"
            value={conduit.label}
            onChange={(e) => onUpdateConduit(e.target.value)}
            placeholder="Conduit"
            autoComplete="off"
          />
        </label>

        <p className="inspector__hint">Deleting removes the whole bundle and all wires in it.</p>
        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>
          Delete conduit
        </button>
      </aside>
    );
  }

  const wire = selection.wire;
  const breakerLocked = selection.breakerLocked;

  return (
    <aside className="inspector" aria-label="Inspector">
      <h3 className="inspector__title">Wire</h3>
      <p className="inspector__meta">
        Color: <strong>{wire.color}</strong>
        {selection.hubLabel && (
          <>
            {' '}
            · Hub: <strong>{selection.hubLabel}</strong>
          </>
        )}
        {selection.deviceTerminalLabel && (
          <>
            {' '}
            · <strong>{selection.deviceTerminalLabel}</strong>
          </>
        )}
        {selection.wireLinkPeer && (
          <>
            {' '}
            · Linked to <strong>{selection.wireLinkPeer}</strong>
          </>
        )}
      </p>

      {!breakerLocked && (
        <p className="inspector__hint">
          Drag the square joints on this wire&apos;s path to move its tip or bends. Each wire in a conduit has its
          own route.
        </p>
      )}

      <label className="inspector__field">
        <span className="inspector__label">Label</span>
        <input
          className="inspector__input"
          type="text"
          value={wire.label}
          onChange={(e) => onUpdateWire({ label: e.target.value })}
          autoComplete="off"
        />
      </label>

      <label className="inspector__field">
        <span className="inspector__label">Manual direction</span>
        <select
          className="inspector__input"
          value={wire.manualDirection ?? ''}
          disabled={breakerLocked}
          onChange={(e) => {
            const v = e.target.value;
            const manualDirection: WireDirection | null =
              v === '' ? null : v === 'toward' || v === 'away' ? v : null;
            onUpdateWire({ manualDirection });
          }}
        >
          <option value="">Follow propagation / breaker</option>
          <option value="toward">Toward</option>
          <option value="away">Away</option>
        </select>
      </label>
      {breakerLocked && (
        <p className="inspector__hint">Breaker panel conductors keep the seeded direction; manual override is disabled.</p>
      )}
      {!breakerLocked && wire.hubId && onDetachWireFromHub && (
        <button type="button" className="btn btn--block" onClick={() => onDetachWireFromHub(wire.id)}>
          Detach from hub
        </button>
      )}
      {!breakerLocked && wire.deviceNodeId && onDetachWireFromDeviceNode && (
        <button type="button" className="btn btn--block" onClick={() => onDetachWireFromDeviceNode(wire.id)}>
          Detach from terminal
        </button>
      )}
      {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
      <button
        type="button"
        className="btn btn--danger btn--block"
        onClick={onDelete}
        disabled={breakerLocked}
        title={breakerLocked ? 'Breaker wires cannot be deleted individually' : undefined}
      >
        Delete wire
      </button>
    </aside>
  );
}
