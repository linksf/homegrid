import type { JSX, ReactNode } from 'react';
import type { EditorMainTool } from './editor-tools';
import { shortcutForTool, shortcutKeyLabel } from './editor-shortcuts';
import {
  OUTLET_PLACEMENT_OPTIONS,
  SWITCH_PLACEMENT_OPTIONS,
  type SwitchPlacementKind,
} from './placement-options';
import {
  IconBox,
  IconRoom,
  IconCable,
  IconConduitColor,
  IconConduitConnect,
  IconConduitHidden,
  IconLabels,
  IconLight,
  IconLink,
  IconOutlet,
  IconPan,
  IconRedo,
  IconSelect,
  IconSwitch,
  IconUndo,
} from './ToolbarIcons';

type ToolbarProps = {
  tool: EditorMainTool;
  onToolChange: (next: EditorMainTool) => void;
  showLabels: boolean;
  onShowLabelsChange: (show: boolean) => void;
  hideConduits: boolean;
  onHideConduitsChange: (hide: boolean) => void;
  colorConduitGroups: boolean;
  onColorConduitGroupsChange: (color: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  switchPlacementKind: SwitchPlacementKind;
  onSwitchPlacementKindChange: (kind: SwitchPlacementKind) => void;
  outletPassthrough: boolean;
  onOutletPassthroughChange: (passthrough: boolean) => void;
  /** Hide room placement when using a floor-plan job. */
  hideRoomTool?: boolean;
};

type ToolButtonProps = {
  tool: EditorMainTool;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
};

function ToolButton({ tool, active, onClick, icon, label }: ToolButtonProps): JSX.Element {
  const shortcut = shortcutForTool(tool);
  const keyHint = shortcut ? shortcutKeyLabel(shortcut.key) : null;
  const title = keyHint ? `${label} (${keyHint})` : label;

  return (
    <button
      type="button"
      className={['toolbar-btn', active ? 'toolbar-btn--active' : ''].filter(Boolean).join(' ')}
      aria-pressed={active}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      {icon}
      {keyHint ? <span className="toolbar-btn__key">{keyHint}</span> : null}
    </button>
  );
}

export function Toolbar({
  tool,
  onToolChange,
  showLabels,
  onShowLabelsChange,
  hideConduits,
  onHideConduitsChange,
  colorConduitGroups,
  onColorConduitGroupsChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  switchPlacementKind,
  onSwitchPlacementKindChange,
  outletPassthrough,
  onOutletPassthroughChange,
  hideRoomTool = false,
}: ToolbarProps): JSX.Element {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor tools">
      <button
        type="button"
        className="toolbar-btn"
        disabled={!canUndo}
        aria-label="Undo (⌘Z)"
        title="Undo (⌘Z)"
        onClick={onUndo}
      >
        <IconUndo />
      </button>
      <button
        type="button"
        className="toolbar-btn"
        disabled={!canRedo}
        aria-label="Redo (⇧⌘Z)"
        title="Redo (⇧⌘Z)"
        onClick={onRedo}
      >
        <IconRedo />
      </button>

      <span className="editor-toolbar__divider" aria-hidden />

      <ToolButton
        tool="select"
        active={tool === 'select'}
        onClick={() => onToolChange('select')}
        icon={<IconSelect />}
        label="Select"
      />
      <ToolButton
        tool="pan"
        active={tool === 'pan'}
        onClick={() => onToolChange('pan')}
        icon={<IconPan />}
        label="Pan"
      />

      <span className="editor-toolbar__divider" aria-hidden />

      <ToolButton
        tool="place-junction"
        active={tool === 'place-junction'}
        onClick={() => onToolChange('place-junction')}
        icon={<IconBox />}
        label="Junction box"
      />
      {!hideRoomTool ? (
        <ToolButton
          tool="place-room"
          active={tool === 'place-room'}
          onClick={() => onToolChange('place-room')}
          icon={<IconRoom />}
          label="Room"
        />
      ) : null}
      <ToolButton
        tool="place-light-bulb"
        active={tool === 'place-light-bulb'}
        onClick={() => onToolChange('place-light-bulb')}
        icon={<IconLight />}
        label="Light"
      />

      <div className="toolbar-group">
        <ToolButton
          tool="place-switch"
          active={tool === 'place-switch'}
          onClick={() => onToolChange('place-switch')}
          icon={<IconSwitch kind={switchPlacementKind} />}
          label="Switch"
        />
        <select
          className="toolbar-variant-select"
          aria-label="Switch type"
          value={switchPlacementKind}
          onChange={(e) => onSwitchPlacementKindChange(e.target.value as SwitchPlacementKind)}
        >
          {SWITCH_PLACEMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-group">
        <ToolButton
          tool="place-outlet"
          active={tool === 'place-outlet'}
          onClick={() => onToolChange('place-outlet')}
          icon={<IconOutlet passthrough={outletPassthrough} />}
          label="Outlet"
        />
        <select
          className="toolbar-variant-select"
          aria-label="Outlet type"
          value={outletPassthrough ? 'passthrough' : 'standard'}
          onChange={(e) => onOutletPassthroughChange(e.target.value === 'passthrough')}
        >
          {OUTLET_PLACEMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <span className="editor-toolbar__divider" aria-hidden />

      <ToolButton
        tool="cable"
        active={tool === 'cable'}
        onClick={() => onToolChange('cable')}
        icon={<IconCable />}
        label="Cable"
      />
      <ToolButton
        tool="conduit-connect"
        active={tool === 'conduit-connect'}
        onClick={() => onToolChange('conduit-connect')}
        icon={<IconConduitConnect />}
        label="Conduit connect"
      />
      <ToolButton
        tool="connect-wires"
        active={tool === 'connect-wires'}
        onClick={() => onToolChange('connect-wires')}
        icon={<IconLink />}
        label="Link wires"
      />

      <span className="editor-toolbar__divider" aria-hidden />

      <button
        type="button"
        className={['toolbar-btn', showLabels ? 'toolbar-btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={showLabels}
        aria-label="Toggle labels (T)"
        title="Toggle labels (T)"
        onClick={() => onShowLabelsChange(!showLabels)}
      >
        <IconLabels />
        <span className="toolbar-btn__key">T</span>
      </button>

      <button
        type="button"
        className={['toolbar-btn', hideConduits ? 'toolbar-btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={hideConduits}
        aria-label="Hide conduits in walls (W)"
        title="Hide conduits in walls (W)"
        onClick={() => onHideConduitsChange(!hideConduits)}
      >
        <IconConduitHidden />
        <span className="toolbar-btn__key">W</span>
      </button>

      <button
        type="button"
        className={['toolbar-btn', colorConduitGroups ? 'toolbar-btn--active' : ''].filter(Boolean).join(' ')}
        aria-pressed={colorConduitGroups}
        aria-label="Color-differentiate conduit groups (G)"
        title="Color-differentiate conduit groups (G)"
        onClick={() => onColorConduitGroupsChange(!colorConduitGroups)}
      >
        <IconConduitColor />
        <span className="toolbar-btn__key">G</span>
      </button>
    </div>
  );
}
