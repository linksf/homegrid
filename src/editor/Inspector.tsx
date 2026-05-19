import type { JSX } from 'react';
import type {
  Conduit,
  Hub,
  HubBridge,
  JunctionBox,
  LightBulb,
  Switch,
  Wire,
  WireDirection,
  WireLink,
} from '../domain/types';
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
  | { kind: 'conduit'; conduit: Conduit; wireCount: number }
  | { kind: 'junctionBox'; box: JunctionBox; hubCount: number; hubSlotsFull: boolean }
  | { kind: 'lightBulb'; bulb: LightBulb; wireLabels: string[] }
  | { kind: 'switch'; sw: Switch; wireLabels: string[] }
  | null;

type InspectorProps = {
  selection: InspectorSelection;
  onUpdateWire: (patch: Partial<Pick<Wire, 'label' | 'manualDirection'>>) => void;
  onUpdateConduit: (label: string) => void;
  onUpdateJunctionBox: (label: string) => void;
  onUpdateHub: (label: string) => void;
  onAddHub?: () => void;
  onAddBreakerCircuit?: () => void;
  onDetachWireFromHub?: (wireId: string) => void;
  onDetachWireFromDeviceNode?: (wireId: string) => void;
  onUpdateLightBulb?: (label: string) => void;
  onUpdateSwitch?: (patch: { label?: string; terminalCount?: 2 | 3 }) => void;
  onDelete: () => void;
  deleteError: string | null;
};

export function Inspector({
  selection,
  onUpdateWire,
  onUpdateConduit,
  onUpdateJunctionBox,
  onUpdateHub,
  onAddHub,
  onAddBreakerCircuit,
  onDetachWireFromHub,
  onDetachWireFromDeviceNode,
  onUpdateLightBulb,
  onUpdateSwitch,
  onDelete,
  deleteError,
}: InspectorProps): JSX.Element {
  if (!selection) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <p className="inspector__empty">
          Select a junction box, hub, conduit, wire, light, switch, or connection to edit. Use Connect to link wires,
          hubs, or device terminals. Press <kbd>Delete</kbd> to remove the selection.
        </p>
      </aside>
    );
  }

  if (selection.kind === 'link') {
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Wire connection</h3>
        <p className="inspector__meta">
          {selection.wireLabelA} ↔ {selection.wireLabelB}
        </p>
        {selection.link.whiteMismatchWarning && (
          <p className="inspector__hint inspector__hint--warn">White ↔ non-white mismatch flagged.</p>
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
    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">Switch</h3>
        <p className="inspector__meta">{sw.terminalCount} terminals</p>
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
        <label className="inspector__field">
          <span className="inspector__label">Terminals</span>
          <select
            className="inspector__input"
            value={String(sw.terminalCount)}
            onChange={(e) => {
              const n = Number(e.target.value);
              onUpdateSwitch?.({ terminalCount: n === 3 ? 3 : 2 });
            }}
          >
            <option value="2">2 (single pole)</option>
            <option value="3">3 (three-way)</option>
          </select>
        </label>
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
            Add breaker circuit
          </button>
        )}

        {deleteError && <p className="inspector__hint inspector__hint--error">{deleteError}</p>}
      </aside>
    );
  }

  if (selection.kind === 'conduit') {
    const conduit = selection.conduit;
    const kindLabel =
      conduit.kind === 'breaker'
        ? 'breaker'
        : conduit.kind === 'local'
          ? 'local'
          : conduit.kind === 'device'
            ? 'device terminal'
            : 'span';

    return (
      <aside className="inspector" aria-label="Inspector">
        <h3 className="inspector__title">{conduit.kind === 'breaker' ? 'Breaker circuit' : 'Conduit'}</h3>
        <p className="inspector__meta">
          {selection.wireCount} wire{selection.wireCount === 1 ? '' : 's'} · {kindLabel}
        </p>
        {conduit.kind === 'breaker' && (
          <p className="inspector__hint">
            Black wire seeds <strong>away</strong> from the panel; white seeds <strong>toward</strong>. Direction
            propagates through connections.
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
