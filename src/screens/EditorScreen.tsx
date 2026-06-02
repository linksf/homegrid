import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PREFERENCE_KEY_PREFIX } from '../app-brand';
import type { AnchorPosition, WireColor, WireEndpoint } from '../domain/types';
import type { BreakerCircuitPreset } from '../domain/breaker-cable';
import { breakerPresetWireColors, isBreakerSeededWire } from '../domain/breaker-cable';
import {
  addCable,
  deleteCable,
  moveCableAnchor,
  toggleBreakerCable,
  updateCable,
  updateCableWires,
} from '../domain/cable-mutations';
import { cableAnchorTaken } from '../domain/cable-slots';
import {
  addHub,
  addHubBridge,
  addDeviceConduit,
  addHubConduit,
  addWireLinkToDiagram,
  attachWireToHub,
  deleteWire,
  detachWireFromHub,
  updateConduit,
  updateHub,
  updateJunctionBox,
  updateWire,
  updateWireColor,
} from '../domain/mutations';
import {
  conduitConnectCompatibleCableIds,
  connectConduitRun,
  connectConduitRunToBreakerAnchor,
  conduitStubAvailableCableIds,
} from '../domain/conduit-run-mutations';
import {
  isDirectionOpposedLink,
  wireLinkAtEndpoint,
  wireLinksForWire,
} from '../domain/wire-link-utils';
import { resolveDirections } from '../domain/direction';
import {
  connectHubToDeviceTerminal,
  connectWireToDeviceTerminal,
  detachWireFromDeviceNode,
  updateLightBulb,
  flipSwitchPosition,
  updateSwitch,
  flipDimmerPosition,
  adjustDimmerLevel,
  updateDimmerSwitch,
  updateOutlet,
  rotateDevice,
} from '../domain/device-mutations';
import { addRoomDoorAt, removeRoomDoor, updateRoom, updateRoomDoor } from '../domain/room-mutations';
import { deviceNodeById } from '../domain/device-node-geometry';
import type { Diagram } from '../domain/types';
import { CanvasViewport, type DiagramViewportSnapshot } from '../canvas/CanvasViewport';
import { useTouchNavigationProfile, TOUCH_LONG_PRESS_MS } from '../canvas/touch-profile';
import { usePenBarrelGesture } from '../canvas/use-pen-barrel-gesture';
import { hitContextMenuTarget, hitContextMenuTargetsAt } from '../editor/context-menu-hit-test';
import { contextMenuTargetLabel } from '../editor/context-menu-target-label';
import { resolveTapCycleTarget, type TapCycleState } from '../editor/tap-selection';
import { CanvasZoomControls } from '../canvas/CanvasZoomControls';
import { diagramContentBounds, selectionContentBounds } from '../editor/diagram-bounds';
import {
  captureSelectionForDuplicate,
  DUPLICATE_OFFSET,
  duplicateClipboardOntoDiagram,
  type DuplicateClipboard,
  selectionHasDuplicateableContent,
  shiftDuplicateClipboard,
} from '../editor/duplicate-selection';
import {
  diagramExportFilename,
  exportDiagramPngFile,
  exportDiagramSvgFile,
} from '../editor/diagram-export';
import { JobNameField } from '../components/JobNameField';
import {
  DEFAULT_LABEL_SCREEN_PX,
  LabelSizeProvider,
  MAX_LABEL_SCREEN_PX,
  MIN_LABEL_SCREEN_PX,
} from '../canvas/LabelSizeContext';
import { DiagramSvg } from '../canvas/DiagramSvg';
import { useJobStore, useResolvedWireMap } from '../store/job-store';
import { viewportCursorClass } from '../editor/editor-cursor';
import type { EditorMainTool } from '../editor/editor-tools';
import { toolForShortcutKey } from '../editor/editor-shortcuts';
import { EditorInspectorPanel } from '../editor/EditorInspectorPanel';
import { Toolbar } from '../editor/Toolbar';
import type { SwitchPlacementKind } from '../editor/placement-options';
import { Inspector, type InspectorSelection } from '../editor/Inspector';
import { IssuesPanel } from '../editor/IssuesPanel';
import { ConduitDialog, type ConduitDialogState } from '../editor/ConduitDialog';
import { EditorLabelSettings } from '../editor/EditorLabelSettings';
import {
  emptySelection,
  isAnythingSelected,
  selectionTotalCount,
  setSingleCable,
  setSingleConduit,
  setSingleConduitRun,
  setSingleDeviceNode,
  setSingleHub,
  setSingleHubBridge,
  setSingleHubWire,
  setSingleJunctionBox,
  setSingleLightBulb,
  setSingleLink,
  setSingleSwitch,
  setSingleDimmerSwitch,
  setSingleOutlet,
  setSingleRoom,
  setSingleWire,
  soleSelectedId,
  type DiagramSelection,
} from '../editor/diagram-selection';
import { encodeJunctionAnchor } from '../editor/anchor-selection';
import { collectMarqueeSelection } from '../editor/marquee-selection';
import { deleteAllSelected, rotateSelectedDevices, selectionHasRotatableDevice } from '../editor/selection-actions';
import { ContextMenu } from '../components/ContextMenu';
import { PickMenu } from '../components/PickMenu';
import {
  buildContextMenuActions,
  cableColorsFromActionId,
  wireColorFromActionId,
  type ContextMenuAction,
} from '../editor/context-menu-actions';
import { selectionForContextMenuTarget, enrichDeviceNodeSelection } from '../editor/context-menu-selection';
import type { ContextMenuTarget } from '../editor/context-menu-target';
import { connectableWireEndpoints } from '../domain/wire-routing';

const WORLD_BOUNDS = {
  minX: -800,
  minY: -600,
  width: 5200,
  height: 4000,
} as const;

const OPPOSED_FLOW_SESSION_KEY = `${PREFERENCE_KEY_PREFIX}opposed-flow-toast`;
const SHOW_LABELS_KEY = `${PREFERENCE_KEY_PREFIX}show-labels`;
const HIDE_CONDUITS_KEY = `${PREFERENCE_KEY_PREFIX}hide-conduits`;
const COLOR_CONDUIT_GROUPS_KEY = `${PREFERENCE_KEY_PREFIX}color-conduit-groups`;
const LABEL_SIZE_KEY = `${PREFERENCE_KEY_PREFIX}label-size-px`;

type ConnectPending =
  | { kind: 'wire-end'; wireId: string; endpoint: import('../domain/types').WireEndpoint }
  | { kind: 'hub'; id: string }
  | { kind: 'node'; id: string }
  | null;

type EntityContextMenuState = {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  target: ContextMenuTarget;
};

type PickMenuState = {
  x: number;
  y: number;
  items: { target: ContextMenuTarget; label: string }[];
};

function readShowLabelsPreference(): boolean {
  try {
    const v = sessionStorage.getItem(SHOW_LABELS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

function readBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const v = sessionStorage.getItem(key);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeBooleanPreference(key: string, value: boolean): void {
  try {
    sessionStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function readLabelSizePreference(): number {
  try {
    const v = sessionStorage.getItem(LABEL_SIZE_KEY);
    if (v) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= MIN_LABEL_SCREEN_PX && n <= MAX_LABEL_SCREEN_PX) return n;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LABEL_SCREEN_PX;
}

type EditorScreenProps = {
  onBack: () => void;
};

export function EditorScreen({ onBack }: EditorScreenProps): JSX.Element {
  const job = useJobStore((s) => s.activeJob);
  const updateDiagram = useJobStore((s) => s.updateDiagram);
  const commitDiagramHistory = useJobStore((s) => s.commitDiagramHistory);
  const undoDiagram = useJobStore((s) => s.undoDiagram);
  const redoDiagram = useJobStore((s) => s.redoDiagram);
  const canUndo = useJobStore((s) => {
    void s.historyTick;
    return s.canUndo();
  });
  const canRedo = useJobStore((s) => {
    void s.historyTick;
    return s.canRedo();
  });
  const exportActive = useJobStore((s) => s.exportActive);
  const resolvedByWireId = useResolvedWireMap();

  const [tool, setTool] = useState<EditorMainTool>('select');
  const [selection, setSelection] = useState<DiagramSelection>(() => emptySelection());
  const [marquee, setMarquee] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [connectPending, setConnectPending] = useState<ConnectPending>(null);
  const [opposedFlowBanner, setOpposedFlowBanner] = useState(false);
  const [conduitDialog, setConduitDialog] = useState<ConduitDialogState>(null);
  const [conduitConnectPending, setConduitConnectPending] = useState<{ cableIdA: string } | null>(null);
  const [showLabels, setShowLabels] = useState(readShowLabelsPreference);
  const [hideConduits, setHideConduits] = useState(() => readBooleanPreference(HIDE_CONDUITS_KEY, false));
  const [colorConduitGroups, setColorConduitGroups] = useState(() =>
    readBooleanPreference(COLOR_CONDUIT_GROUPS_KEY, false),
  );
  const [labelSizePx, setLabelSizePx] = useState(readLabelSizePreference);

  const viewportApiRef = useRef<DiagramViewportSnapshot | null>(null);
  const duplicateClipboardRef = useRef<DuplicateClipboard | null>(null);

  const fitView = useCallback(
    (mode: 'selection-or-all' | 'all') => {
      const d = job?.diagram;
      if (!d) return;
      const rect =
        mode === 'all'
          ? diagramContentBounds(d)
          : selectionContentBounds(d, selection) ?? diagramContentBounds(d);
      viewportApiRef.current?.fitToRect(rect);
    },
    [job, selection],
  );

  const applyHideConduits = useCallback((value: boolean) => {
    setHideConduits(value);
    writeBooleanPreference(HIDE_CONDUITS_KEY, value);
  }, []);
  const applyColorConduitGroups = useCallback((value: boolean) => {
    setColorConduitGroups(value);
    writeBooleanPreference(COLOR_CONDUIT_GROUPS_KEY, value);
  }, []);

  const handleCopySelection = useCallback(() => {
    if (!job) return;
    const clip = captureSelectionForDuplicate(job.diagram, selection);
    if (clip) duplicateClipboardRef.current = clip;
  }, [job, selection]);

  const handlePasteSelection = useCallback(() => {
    const clip = duplicateClipboardRef.current;
    if (!job || !clip) return;
    let nextSelection: DiagramSelection = emptySelection();
    updateDiagram((d) => {
      const result = duplicateClipboardOntoDiagram(d, clip, DUPLICATE_OFFSET, DUPLICATE_OFFSET);
      nextSelection = result.selection;
      return result.diagram;
    });
    setSelection(nextSelection);
    duplicateClipboardRef.current = shiftDuplicateClipboard(clip, DUPLICATE_OFFSET, DUPLICATE_OFFSET);
  }, [job, updateDiagram]);

  const handleDuplicateSelection = useCallback(() => {
    if (!job || !selectionHasDuplicateableContent(selection)) return;
    const clip = captureSelectionForDuplicate(job.diagram, selection);
    if (!clip) return;
    duplicateClipboardRef.current = clip;
    let nextSelection: DiagramSelection = emptySelection();
    updateDiagram((d) => {
      const result = duplicateClipboardOntoDiagram(d, clip, DUPLICATE_OFFSET, DUPLICATE_OFFSET);
      nextSelection = result.selection;
      return result.diagram;
    });
    setSelection(nextSelection);
    duplicateClipboardRef.current = shiftDuplicateClipboard(clip, DUPLICATE_OFFSET, DUPLICATE_OFFSET);
  }, [job, selection, updateDiagram]);

  const handleExportSvg = useCallback(() => {
    const svg = viewportApiRef.current?.svgRef.current;
    if (!svg || !job) return;
    exportDiagramSvgFile(svg, diagramExportFilename(job.name, 'svg'));
  }, [job]);

  const handleExportPng = useCallback(() => {
    const svg = viewportApiRef.current?.svgRef.current;
    if (!svg || !job) return;
    void exportDiagramPngFile(svg, diagramExportFilename(job.name, 'png'));
  }, [job]);

  const [shiftPanActive, setShiftPanActive] = useState(false);
  const [penBarrelPanActive, setPenBarrelPanActive] = useState(false);
  const [penHover, setPenHover] = useState<{ world: { x: number; y: number }; label: string | null } | null>(
    null,
  );
  const [switchPlacementKind, setSwitchPlacementKind] = useState<SwitchPlacementKind>('single-pole');
  const [outletPassthrough, setOutletPassthrough] = useState(false);
  const [doorPlacingRoomId, setDoorPlacingRoomId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<EntityContextMenuState | null>(null);
  const [pickMenu, setPickMenu] = useState<PickMenuState | null>(null);
  const tapCycleRef = useRef<TapCycleState | null>(null);
  /** Context-menu link flow: stay in select tool until the link is completed or cancelled. */
  const [ephemeralConnect, setEphemeralConnect] = useState(false);
  /** Context-menu door flow: exit door placement after one door is placed. */
  const [ephemeralDoorPlacing, setEphemeralDoorPlacing] = useState(false);

  const connectInteractionActive = tool === 'connect-wires' || ephemeralConnect;
  const [infoPanelOpen, setInfoPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );

  const panActive = tool === 'pan' || shiftPanActive || penBarrelPanActive;
  const touchNavigation = useTouchNavigationProfile();
  const penInputActive = touchNavigation && tool === 'select';

  usePenBarrelGesture({
    enabled: penInputActive,
    onSqueezeStart: () => setPenBarrelPanActive(true),
    onSqueezeEnd: () => setPenBarrelPanActive(false),
    onDoubleBarrelTap: () => setTool((current) => (current === 'pan' ? 'select' : 'pan')),
  });

  useEffect(() => {
    if (!penInputActive) {
      setPenHover(null);
      setPenBarrelPanActive(false);
    }
  }, [penInputActive]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      const tag = (target as HTMLElement | null)?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Shift' || isEditableTarget(e.target)) return;
      setShiftPanActive(true);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') setShiftPanActive(false);
    }

    function clearShiftPan() {
      setShiftPanActive(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearShiftPan);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearShiftPan);
    };
  }, []);

  useEffect(() => {
    if (!shiftPanActive) return;
    setMarquee(null);
    marqueeStartRef.current = null;
  }, [shiftPanActive]);

  useEffect(() => {
    setConduitConnectPending(null);
    setConduitDialog(null);
    setConnectPending(null);
    setMarquee(null);
    setDoorPlacingRoomId(null);
    marqueeStartRef.current = null;
  }, [tool]);

  useEffect(() => {
    setDeleteError(null);
  }, [selection]);

  useEffect(() => {
    setDoorPlacingRoomId((prev) => (prev && selection.rooms.has(prev) ? prev : null));
  }, [selection]);

  function clearSelection() {
    setSelection(emptySelection());
  }

  function applySelectionFromTarget(target: ContextMenuTarget) {
    if (!job) return;
    let nextSelection = selectionForContextMenuTarget(target);
    if (target.kind === 'deviceNode') {
      nextSelection = enrichDeviceNodeSelection(job.diagram, nextSelection);
    }
    setSelection(nextSelection);
  }

  function handleTouchMarqueeClear() {
    setMarquee(null);
  }

  function handleTouchMarqueeBounds(bounds: { ax: number; ay: number; bx: number; by: number }) {
    setMarquee(bounds);
  }

  function handleTouchMarqueeCommit(bounds: { ax: number; ay: number; bx: number; by: number }) {
    if (!job) {
      setMarquee(null);
      return;
    }
    const picked = collectMarqueeSelection(job.diagram, bounds.ax, bounds.ay, bounds.bx, bounds.by);
    setSelection(selectionTotalCount(picked) > 0 ? picked : emptySelection());
    setMarquee(null);
  }

  function handleMarqueeStart(world: { x: number; y: number }) {
    marqueeStartRef.current = world;
    setMarquee({ ax: world.x, ay: world.y, bx: world.x, by: world.y });
  }

  function handleMarqueeMove(world: { x: number; y: number }) {
    const start = marqueeStartRef.current;
    if (!start) return;
    setMarquee({ ax: start.x, ay: start.y, bx: world.x, by: world.y });
  }

  function handleMarqueeEnd(world: { x: number; y: number }) {
    const start = marqueeStartRef.current;
    if (!start || !job) {
      setMarquee(null);
      marqueeStartRef.current = null;
      return;
    }

    const picked = collectMarqueeSelection(job.diagram, start.x, start.y, world.x, world.y);
    setSelection(selectionTotalCount(picked) > 0 ? picked : emptySelection());
    setMarquee(null);
    marqueeStartRef.current = null;
  }

  function returnToSelectTool() {
    setConduitDialog(null);
    setConduitConnectPending(null);
    setConnectPending(null);
    setEphemeralConnect(false);
    setEphemeralDoorPlacing(false);
    setTool('select');
  }

  function handleToolChange(next: EditorMainTool) {
    if (next !== 'connect-wires') {
      setEphemeralConnect(false);
      if (next !== 'select') {
        setConnectPending(null);
      }
    } else {
      setEphemeralConnect(false);
    }
    setTool(next);
  }

  function clearEphemeralConnect() {
    setConnectPending(null);
    setEphemeralConnect(false);
  }

  function endConnectPending() {
    setConnectPending(null);
    setEphemeralConnect(false);
  }

  function hubDisplayLabel(diagram: Diagram, hubId: string): string {
    const hub = diagram.hubs.find((h) => h.id === hubId);
    if (!hub) return hubId;
    const label = (hub.label ?? '').trim();
    return label.length > 0 ? label : 'Hub';
  }

  function wireDisplayLabel(diagram: Diagram, wireId: string): string {
    const w = diagram.wires.find((x) => x.id === wireId);
    if (!w) return wireId;
    const label = (w.label ?? '').trim();
    return label.length > 0 ? label : `${w.color} wire`;
  }

  function cableDisplayLabel(diagram: Diagram, cableId: string): string {
    const cable = diagram.cables.find((c) => c.id === cableId);
    if (!cable) return cableId;
    const label = (cable.label ?? '').trim();
    if (label.length > 0) return label;
    const box = diagram.junctionBoxes.find((j) => j.id === cable.junctionBoxId);
    const boxLabel = (box?.label ?? '').trim() || 'Box';
    return `${boxLabel} · ${cable.anchor}`;
  }

  function handleDeleteSelection() {
    if (tool !== 'select' || !job) return;
    if (!isAnythingSelected(selection)) return;

    setDeleteError(null);

    if (selectionTotalCount(selection) === 1 && selection.cables.size === 1) {
      const cableId = soleSelectedId(selection.cables)!;
      try {
        updateDiagram((d) => deleteCable(d, cableId));
        clearSelection();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Could not delete cable.');
      }
      return;
    }

    if (selectionTotalCount(selection) === 1 && selection.wires.size === 1) {
      const wireId = soleSelectedId(selection.wires)!;
      try {
        updateDiagram((d) => deleteWire(d, wireId));
        clearSelection();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Could not delete wire.');
      }
      return;
    }

    try {
      updateDiagram((d) => deleteAllSelected(d, selection));
      clearSelection();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete selection.');
    }
  }

  const handleEntityContextMenu = useCallback(
    (target: ContextMenuTarget, clientX: number, clientY: number) => {
      if (tool !== 'select' || !job) return;

      let nextSelection = selectionForContextMenuTarget(target);
      if (target.kind === 'deviceNode') {
        nextSelection = enrichDeviceNodeSelection(job.diagram, nextSelection);
      }
      setSelection(nextSelection);

      const actions = buildContextMenuActions({
        diagram: job.diagram,
        selection: nextSelection,
        target,
      });
      if (actions.length === 0) return;

      setContextMenu({ x: clientX, y: clientY, actions, target });
    },
    [job, tool],
  );

  const handleDiagramTap = useCallback(
    (clientX: number, clientY: number) => {
      if (!job) return;

      if (connectInteractionActive && connectPending) {
        const vp = viewportApiRef.current;
        const world = vp?.clientPointToWorld(clientX, clientY);
        if (!world) return;
        const scale = vp?.scale ?? 1;
        const preferHub = connectPending.kind === 'wire-end' || connectPending.kind === 'hub';
        const candidates = hitContextMenuTargetsAt(job.diagram, world.x, world.y, scale, { preferHub });
        for (const candidate of candidates) {
          const target = candidate.target;
          if (target.kind === 'hub') {
            finishConnect({ kind: 'hub', id: target.hubId });
            return;
          }
          if (target.kind === 'deviceNode') {
            finishConnect({ kind: 'node', id: target.nodeId });
            return;
          }
        }
        return;
      }

      if (tool !== 'select' || ephemeralConnect) return;
      const vp = viewportApiRef.current;
      const world = vp?.clientPointToWorld(clientX, clientY);
      if (!world) return;
      const scale = vp?.scale ?? 1;
      const candidates = hitContextMenuTargetsAt(job.diagram, world.x, world.y, scale);
      const { target, nextState } = resolveTapCycleTarget(candidates, tapCycleRef.current, clientX, clientY);
      tapCycleRef.current = nextState;
      if (target) applySelectionFromTarget(target);
      else clearSelection();
    },
    [connectInteractionActive, connectPending, ephemeralConnect, job, tool],
  );

  const handleSurfaceLongPress = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== 'select' || !job) return;
      const vp = viewportApiRef.current;
      const world = vp?.clientPointToWorld(clientX, clientY);
      if (!world) return;
      const scale = vp?.scale ?? 1;
      const candidates = hitContextMenuTargetsAt(job.diagram, world.x, world.y, scale);
      if (candidates.length === 0) return;
      setPickMenu({
        x: clientX,
        y: clientY,
        items: candidates.map((candidate) => ({
          target: candidate.target,
          label: contextMenuTargetLabel(job.diagram, candidate.target),
        })),
      });
    },
    [job, tool],
  );

  const handlePenHoverAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!penInputActive || !job) {
        setPenHover(null);
        return;
      }
      const vp = viewportApiRef.current;
      const world = vp?.clientPointToWorld(clientX, clientY);
      if (!world) return;
      const scale = vp?.scale ?? 1;
      const preferHub =
        connectPending?.kind === 'wire-end' || connectPending?.kind === 'hub';
      const target = hitContextMenuTarget(job.diagram, world.x, world.y, scale, {
        preferHub: Boolean(preferHub),
      });
      setPenHover({
        world,
        label: target ? contextMenuTargetLabel(job.diagram, target) : null,
      });
    },
    [connectPending, job, penInputActive],
  );

  const handlePenHoverClear = useCallback(() => setPenHover(null), []);

  const handlePickMenuTarget = useCallback((target: ContextMenuTarget) => {
    applySelectionFromTarget(target);
    setPickMenu(null);
  }, [job]);

  const handleContextMenuAtClient = useCallback(
    (clientX: number, clientY: number) => {
      if (tool !== 'select' || !job) return;
      const world = viewportApiRef.current?.clientPointToWorld(clientX, clientY);
      if (!world) return;
      const scale = viewportApiRef.current?.scale ?? 1;
      const target = hitContextMenuTarget(job.diagram, world.x, world.y, scale);
      if (target) handleEntityContextMenu(target, clientX, clientY);
    },
    [handleEntityContextMenu, job, tool],
  );

  function handleContextMenuAction(actionId: string) {
    if (!job || !contextMenu) return;
    const { target } = contextMenu;
    setDeleteError(null);

    if (actionId === 'delete') {
      handleDeleteSelection();
      return;
    }

    if (actionId === 'duplicate') {
      handleDuplicateSelection();
      return;
    }

    if (actionId === 'rotate-cw') {
      updateDiagram((d) => rotateSelectedDevices(d, selection, 'cw'));
      return;
    }

    if (actionId === 'room-place-door' && target.kind === 'room') {
      setDoorPlacingRoomId(target.roomId);
      setEphemeralDoorPlacing(true);
      return;
    }

    if (actionId === 'box-add-hub' && target.kind === 'junctionBox') {
      try {
        updateDiagram((d) => addHub(d, target.boxId));
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Could not add hub.');
      }
      return;
    }

    if (actionId === 'box-add-breaker-circuit' && target.kind === 'junctionBox') {
      const panelAnchors: AnchorPosition[] = [
        'middle-left',
        'middle-right',
        'top-center',
        'bottom-center',
        'top-left',
        'top-right',
      ];
      updateDiagram((d) => {
        const count = d.cables.filter(
          (c) => c.junctionBoxId === target.boxId && c.role === 'breaker',
        ).length;
        const anchor = panelAnchors[count % panelAnchors.length]!;
        return addCable(d, {
          junctionBoxId: target.boxId,
          anchor,
          wireColors: breakerPresetWireColors('twoWire'),
        });
      });
      return;
    }

    const cableColors = cableColorsFromActionId(actionId);
    if (cableColors && target.kind === 'junctionAnchor') {
      if (cableAnchorTaken(job.diagram, target.boxId, target.anchor)) {
        setDeleteError('That junction anchor already has a cable.');
        return;
      }
      try {
        updateDiagram((d) =>
          addCable(d, {
            junctionBoxId: target.boxId,
            anchor: target.anchor,
            wireColors: cableColors,
          }),
        );
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Could not add cable.');
      }
      return;
    }

    const wireColor = wireColorFromActionId(actionId);
    if (wireColor && target.kind === 'wire') {
      updateDiagram((d) => updateWireColor(d, target.wireId, wireColor));
      return;
    }

    if (actionId === 'wire-create-link' && target.kind === 'wire') {
      const endpoint = connectableWireEndpoints(job.diagram, target.wireId).find(
        (ep) => !wireLinkAtEndpoint(job.diagram, target.wireId, ep),
      );
      if (!endpoint) return;
      setEphemeralConnect(true);
      setConnectPending({ kind: 'wire-end', wireId: target.wireId, endpoint });
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (contextMenu) {
          e.preventDefault();
          setContextMenu(null);
          return;
        }
        if (doorPlacingRoomId) {
          e.preventDefault();
          setDoorPlacingRoomId(null);
          setEphemeralDoorPlacing(false);
          return;
        }
        if (ephemeralConnect && connectPending) {
          e.preventDefault();
          clearEphemeralConnect();
          return;
        }
        if (tool !== 'select' || conduitDialog || connectPending || conduitConnectPending) {
          e.preventDefault();
          returnToSelectTool();
        }
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redoDiagram();
        } else {
          undoDiagram();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoDiagram();
        return;
      }

      if (mod && tool === 'select') {
        const key = e.key.toLowerCase();
        if (key === 'c' && selectionHasDuplicateableContent(selection)) {
          e.preventDefault();
          handleCopySelection();
          return;
        }
        if (key === 'v' && duplicateClipboardRef.current) {
          e.preventDefault();
          handlePasteSelection();
          return;
        }
        if (key === 'd' && selectionHasDuplicateableContent(selection)) {
          e.preventDefault();
          handleDuplicateSelection();
          return;
        }
      }

      if (!mod && !e.altKey && e.key.length === 1) {
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          setShowLabels((prev) => {
            const next = !prev;
            try {
              sessionStorage.setItem(SHOW_LABELS_KEY, next ? '1' : '0');
            } catch {
              /* ignore */
            }
            return next;
          });
          return;
        }

        if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          applyHideConduits(!hideConduits);
          return;
        }

        if (e.key.toLowerCase() === 'g') {
          e.preventDefault();
          applyColorConduitGroups(!colorConduitGroups);
          return;
        }

        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          fitView(e.shiftKey ? 'all' : 'selection-or-all');
          return;
        }

        const nextTool = toolForShortcutKey(e.key);
        if (nextTool) {
          e.preventDefault();
          handleToolChange(nextTool);
          return;
        }
      }

      if (!mod && !e.altKey && e.key.toLowerCase() === 'r' && tool === 'select' && selectionHasRotatableDevice(selection)) {
        e.preventDefault();
        const direction = e.shiftKey ? 'ccw' : 'cw';
        updateDiagram((d) => rotateSelectedDevices(d, selection, direction));
        return;
      }

      const dimmerId = soleSelectedId(selection.dimmerSwitches);
      if (dimmerId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? 5 : -5;
        updateDiagram((d) => adjustDimmerLevel(d, dimmerId, delta));
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (tool !== 'select') return;
      if (!isAnythingSelected(selection)) return;
      e.preventDefault();
      handleDeleteSelection();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    tool,
    conduitDialog,
    connectPending,
    conduitConnectPending,
    doorPlacingRoomId,
    ephemeralConnect,
    ephemeralDoorPlacing,
    contextMenu,
    selection,
    job,
    updateDiagram,
    undoDiagram,
    redoDiagram,
    hideConduits,
    colorConduitGroups,
    applyHideConduits,
    applyColorConduitGroups,
    fitView,
    handleCopySelection,
    handlePasteSelection,
    handleDuplicateSelection,
  ]);

  function finishConnect(target: ConnectPending) {
    if (!job || !target) return;

    if (!connectPending) {
      setConnectPending(target);
      return;
    }

    if (
      connectPending.kind === 'wire-end' &&
      target.kind === 'wire-end' &&
      connectPending.wireId === target.wireId &&
      connectPending.endpoint === target.endpoint
    ) {
      endConnectPending();
      return;
    }
    if (
      connectPending.kind !== 'wire-end' &&
      target.kind !== 'wire-end' &&
      'id' in connectPending &&
      'id' in target &&
      connectPending.id === target.id
    ) {
      endConnectPending();
      return;
    }

    try {
      if (connectPending.kind === 'wire-end' && target.kind === 'wire-end') {
        const wa = job.diagram.wires.find((w) => w.id === connectPending.wireId);
        const wb = job.diagram.wires.find((w) => w.id === target.wireId);
        if (!wa || !wb) {
          endConnectPending();
          return;
        }

        if (wa.hubId || wb.hubId) {
          if (wa.hubId && wb.hubId && wa.hubId !== wb.hubId) {
            setDeleteError('These wires are on different hubs. Connect both to the same hub instead.');
            endConnectPending();
            return;
          }
          if (wa.hubId && wb.hubId) {
            endConnectPending();
            return;
          }
          const hubId = wa.hubId ?? wb.hubId!;
          const wireId = wa.hubId ? target.wireId : connectPending.wireId;
          updateDiagram((d) => attachWireToHub(d, hubId, wireId));
          endConnectPending();
          return;
        }

        if (
          wireLinkAtEndpoint(job.diagram, connectPending.wireId, connectPending.endpoint) ||
          wireLinkAtEndpoint(job.diagram, target.wireId, target.endpoint)
        ) {
          setDeleteError('That wire end is already linked.');
          endConnectPending();
          return;
        }

        const preview = addWireLinkToDiagram(
          job.diagram,
          connectPending.wireId,
          connectPending.endpoint,
          target.wireId,
          target.endpoint,
        );
        const newLink = preview.wireLinks[preview.wireLinks.length - 1]!;
        const resolved = resolveDirections(preview);
        const willWarn = isDirectionOpposedLink(
          newLink,
          resolved.get(wa.id),
          resolved.get(wb.id),
        );
        updateDiagram(() => preview);

        if (willWarn && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(OPPOSED_FLOW_SESSION_KEY)) {
          sessionStorage.setItem(OPPOSED_FLOW_SESSION_KEY, '1');
          setOpposedFlowBanner(true);
        }
      } else if (connectPending.kind === 'wire-end' && target.kind === 'hub') {
        updateDiagram((d) => attachWireToHub(d, target.id, connectPending.wireId));
      } else if (connectPending.kind === 'hub' && target.kind === 'wire-end') {
        updateDiagram((d) => attachWireToHub(d, connectPending.id, target.wireId));
      } else if (connectPending.kind === 'hub' && target.kind === 'hub') {
        updateDiagram((d) => addHubBridge(d, connectPending.id, target.id));
      } else if (connectPending.kind === 'hub' && target.kind === 'node') {
        updateDiagram((d) => connectHubToDeviceTerminal(d, connectPending.id, target.id));
      } else if (connectPending.kind === 'node' && target.kind === 'hub') {
        updateDiagram((d) => connectHubToDeviceTerminal(d, target.id, connectPending.id));
      } else if (connectPending.kind === 'wire-end' && target.kind === 'node') {
        updateDiagram((d) =>
          connectWireToDeviceTerminal(d, target.id, connectPending.wireId, connectPending.endpoint),
        );
      } else if (connectPending.kind === 'node' && target.kind === 'wire-end') {
        updateDiagram((d) =>
          connectWireToDeviceTerminal(d, connectPending.id, target.wireId, target.endpoint),
        );
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not connect.');
    }

    endConnectPending();
  }

  function handleJunctionAnchorPointerDown(boxId: string, anchor: AnchorPosition) {
    const key = encodeJunctionAnchor(boxId, anchor);
    setSelection((prev) => {
      if (prev.junctionAnchors.has(key) && prev.junctionAnchors.size > 1) {
        return prev;
      }
      const next = emptySelection();
      next.junctionAnchors.add(key);
      return next;
    });
  }

  function handleHubConduitPick(hubId: string) {
    setConduitDialog({ kind: 'hub', hubId });
  }

  function handleAnchorPick(payload: { boxId: string; anchor: AnchorPosition }) {
    if (!job) return;

    if (tool === 'cable') {
      if (cableAnchorTaken(job.diagram, payload.boxId, payload.anchor)) {
        setDeleteError('That junction anchor already has a cable.');
        return;
      }
      setDeleteError(null);
      const box = job.diagram.junctionBoxes.find((b) => b.id === payload.boxId);
      if (box?.type === 'breaker') {
        setConduitDialog({ kind: 'breaker', junctionBoxId: payload.boxId, anchor: payload.anchor });
      } else {
        setConduitDialog({ kind: 'cable', junctionBoxId: payload.boxId, anchor: payload.anchor });
      }
    } else if (tool === 'conduit-connect') {
      if (!conduitConnectPending) return;

      const box = job.diagram.junctionBoxes.find((b) => b.id === payload.boxId);
      setDeleteError(null);
      try {
        if (box?.type === 'breaker') {
          updateDiagram((d) =>
            connectConduitRunToBreakerAnchor(
              d,
              conduitConnectPending.cableIdA,
              payload.boxId,
              payload.anchor,
            ),
          );
        } else {
          updateDiagram((d) =>
            connectConduitRun(d, conduitConnectPending.cableIdA, {
              kind: 'anchor',
              junctionBoxId: payload.boxId,
              anchor: payload.anchor,
            }),
          );
        }
        setConduitConnectPending(null);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Could not connect conduit run.');
      }
    }
  }

  function handleConduitConnectStubPick(cableId: string) {
    if (!job || tool !== 'conduit-connect') return;

    const available = conduitStubAvailableCableIds(job.diagram);
    if (!available.has(cableId)) {
      setDeleteError('That cable conduit stub is already connected by a conduit run.');
      return;
    }

    if (!conduitConnectPending) {
      setDeleteError(null);
      setConduitConnectPending({ cableIdA: cableId });
      return;
    }

    if (conduitConnectPending.cableIdA === cableId) {
      setDeleteError(null);
      setConduitConnectPending(null);
      return;
    }

    setDeleteError(null);
    try {
      updateDiagram((d) =>
        connectConduitRun(d, conduitConnectPending.cableIdA, { kind: 'cable', cableId }),
      );
      setConduitConnectPending(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not connect conduit run.');
    }
  }

  function handleWirePointerDown(wireId: string) {
    if (!job) return;

    if (tool === 'select' && !ephemeralConnect) {
      setSelection(setSingleWire(wireId));
      return;
    }

    if (connectInteractionActive) {
      return;
    }
  }

  function handleWireEndpointPointerDown(wireId: string, endpoint: WireEndpoint) {
    if (!connectInteractionActive) return;
    finishConnect({ kind: 'wire-end', wireId, endpoint });
  }

  function handleHubPointerDown(hubId: string) {
    if (!connectInteractionActive) return;
    finishConnect({ kind: 'hub', id: hubId });
  }

  function handleDeviceNodePointerDown(nodeId: string) {
    if (tool === 'cable') {
      setDeleteError(null);
      setConduitDialog({ kind: 'device', deviceNodeId: nodeId });
      return;
    }
    if (connectInteractionActive) {
      finishConnect({ kind: 'node', id: nodeId });
      return;
    }
    if (tool === 'select') {
      setSelection(setSingleDeviceNode(nodeId));
      const node = deviceNodeById(job!.diagram, nodeId);
      if (node?.deviceKind === 'lightBulb') {
        const next = setSingleLightBulb(node.deviceId);
        next.deviceNodes.add(nodeId);
        setSelection(next);
      } else if (node?.deviceKind === 'switch') {
        const next = setSingleSwitch(node.deviceId);
        next.deviceNodes.add(nodeId);
        setSelection(next);
      } else if (node?.deviceKind === 'dimmerSwitch') {
        const next = setSingleDimmerSwitch(node.deviceId);
        next.deviceNodes.add(nodeId);
        setSelection(next);
      } else if (node?.deviceKind === 'outlet') {
        const next = setSingleOutlet(node.deviceId);
        next.deviceNodes.add(nodeId);
        setSelection(next);
      }
    }
  }

  function handleConduitConfirm(wireColors: WireColor[]) {
    if (!conduitDialog) return;

    try {
      if (conduitDialog.kind === 'cable') {
        if (!job || cableAnchorTaken(job.diagram, conduitDialog.junctionBoxId, conduitDialog.anchor)) {
          setDeleteError('That junction anchor already has a cable.');
          return;
        }
        updateDiagram((d) =>
          addCable(d, {
            junctionBoxId: conduitDialog.junctionBoxId,
            anchor: conduitDialog.anchor,
            wireColors,
          }),
        );
      } else if (conduitDialog.kind === 'device') {
        updateDiagram((d) =>
          addDeviceConduit(d, {
            deviceNodeId: conduitDialog.deviceNodeId,
            wireColors,
          }),
        );
      } else if (conduitDialog.kind === 'hub') {
        updateDiagram((d) =>
          addHubConduit(d, {
            hubId: conduitDialog.hubId,
            wireColors,
          }),
        );
      }

      setConduitDialog(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not apply conduit.');
    }
  }

  function handleBreakerConduitConfirm(label: string, preset: BreakerCircuitPreset) {
    if (!conduitDialog || conduitDialog.kind !== 'breaker') return;
    updateDiagram((d) => {
      let next = addCable(d, {
        junctionBoxId: conduitDialog.junctionBoxId,
        anchor: conduitDialog.anchor,
        wireColors: breakerPresetWireColors(preset),
      });
      const cable = next.cables.find(
        (c) =>
          c.junctionBoxId === conduitDialog.junctionBoxId &&
          c.anchor === conduitDialog.anchor,
      );
      if (cable && label.trim()) {
        next = updateCable(next, cable.id, { label: label.trim() });
      }
      return next;
    });
    setConduitDialog(null);
  }

  if (!job) {
    return (
      <div className="editor-screen">
        <p>No job open.</p>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  const selectedLinkId = soleSelectedId(selection.links);
  const selectedHubBridgeId = soleSelectedId(selection.hubBridges);
  const selectedHubWireId = soleSelectedId(selection.hubWires);
  const selectedConduitRunId = soleSelectedId(selection.conduitRuns);
  const selectedHubId = soleSelectedId(selection.hubs);
  const selectedConduitId = soleSelectedId(selection.conduits);
  const selectedCableId = soleSelectedId(selection.cables);
  const selectedWireId = soleSelectedId(selection.wires);
  const selectedLightBulbId = soleSelectedId(selection.lightBulbs);
  const selectedSwitchId = soleSelectedId(selection.switches);
  const selectedDimmerId = soleSelectedId(selection.dimmerSwitches);
  const selectedOutletId = soleSelectedId(selection.outlets);
  const selectedRoomId = soleSelectedId(selection.rooms);
  const selectedBoxId = soleSelectedId(selection.junctionBoxes);
  const multiCount = selectionTotalCount(selection);

  let inspectorSelection: InspectorSelection = null;
  if (multiCount > 1) {
    inspectorSelection = {
      kind: 'multi',
      counts: {
        junctionBoxes: selection.junctionBoxes.size,
        wires: selection.wires.size,
        conduits: selection.conduits.size,
        cables: selection.cables.size,
        hubs: selection.hubs.size,
        hubBridges: selection.hubBridges.size,
        hubWires: selection.hubWires.size,
        conduitRuns: selection.conduitRuns.size,
        links: selection.links.size,
        lightBulbs: selection.lightBulbs.size,
        switches: selection.switches.size,
        dimmerSwitches: selection.dimmerSwitches.size,
        outlets: selection.outlets.size,
        rooms: selection.rooms.size,
        deviceNodes: selection.deviceNodes.size,
        junctionAnchors: selection.junctionAnchors.size,
        pathAnchors: selection.pathAnchors.size,
      },
    };
  } else if (selectedLinkId) {
    const link = job.diagram.wireLinks.find((l) => l.id === selectedLinkId);
    if (link) {
      inspectorSelection = {
        kind: 'link',
        link,
        wireLabelA: wireDisplayLabel(job.diagram, link.wireIdA),
        wireLabelB: wireDisplayLabel(job.diagram, link.wireIdB),
      };
    }
  } else if (selectedHubWireId) {
    const wire = job.diagram.wires.find((w) => w.id === selectedHubWireId);
    if (wire?.hubId) {
      inspectorSelection = {
        kind: 'hubWire',
        wire,
        hubLabel: hubDisplayLabel(job.diagram, wire.hubId),
        wireLabel: wireDisplayLabel(job.diagram, wire.id),
      };
    }
  } else if (selectedConduitRunId) {
    const run = job.diagram.conduitRuns.find((r) => r.id === selectedConduitRunId);
    if (run) {
      inspectorSelection = {
        kind: 'conduitRun',
        run,
        cableLabelA: cableDisplayLabel(job.diagram, run.cableIdA),
        cableLabelB: run.cableIdB ? cableDisplayLabel(job.diagram, run.cableIdB) : '—',
      };
    }
  } else if (selectedHubBridgeId) {
    const bridge = job.diagram.hubBridges.find((b) => b.id === selectedHubBridgeId);
    if (bridge) {
      inspectorSelection = {
        kind: 'hubBridge',
        bridge,
        hubLabelA: hubDisplayLabel(job.diagram, bridge.hubIdA),
        hubLabelB: hubDisplayLabel(job.diagram, bridge.hubIdB),
      };
    }
  } else if (selectedHubId) {
    const hub = job.diagram.hubs.find((h) => h.id === selectedHubId);
    if (hub) {
      const wireLabels = job.diagram.wires
        .filter((w) => w.hubId === hub.id)
        .map((w) => wireDisplayLabel(job.diagram, w.id));
      inspectorSelection = { kind: 'hub', hub, wireLabels };
    }
  } else if (selectedCableId) {
    const cable = job.diagram.cables.find((c) => c.id === selectedCableId);
    if (cable) {
      inspectorSelection = { kind: 'cable', cable };
    }
  } else if (selectedConduitId) {
    const conduit = job.diagram.conduits.find((c) => c.id === selectedConduitId);
    if (conduit) {
      inspectorSelection = {
        kind: 'conduit',
        conduit,
        wireCount: conduit.wireIds.length,
      };
    }
  } else if (selectedWireId) {
    const wire = job.diagram.wires.find((w) => w.id === selectedWireId);
    if (wire) {
      const links = wireLinksForWire(job.diagram, wire.id);
      const link = links[0];
      const peerId = link ? (link.wireIdA === wire.id ? link.wireIdB : link.wireIdA) : null;
      inspectorSelection = {
        kind: 'wire',
        wire,
        hubLabel: wire.hubId ? hubDisplayLabel(job.diagram, wire.hubId) : null,
        deviceTerminalLabel: wire.deviceNodeId
          ? (() => {
              const node = deviceNodeById(job.diagram, wire.deviceNodeId);
              if (!node) return null;
              if (node.deviceKind === 'lightBulb') {
                const bulb = job.diagram.lightBulbs.find((b) => b.id === node.deviceId);
                const name = (bulb?.label ?? '').trim() || 'Light';
                return `${name} · terminal ${node.slot + 1}`;
              }
              if (node.deviceKind === 'switch') {
                const sw = job.diagram.switches.find((s) => s.id === node.deviceId);
                const name = (sw?.label ?? '').trim() || 'Switch';
                return `${name} · terminal ${node.slot + 1}`;
              }
              if (node.deviceKind === 'dimmerSwitch') {
                const dim = job.diagram.dimmerSwitches.find((d) => d.id === node.deviceId);
                const name = (dim?.label ?? '').trim() || 'Dimmer';
                return `${name} · terminal ${node.slot + 1}`;
              }
              const outlet = job.diagram.outlets.find((o) => o.id === node.deviceId);
              const outletName = (outlet?.label ?? '').trim() || 'Outlet';
              const slotNames = outlet?.passthrough
                ? ['hot in', 'hot out', 'neutral in', 'neutral out']
                : ['hot', 'neutral'];
              const slotLabel = slotNames[node.slot] ?? `terminal ${node.slot + 1}`;
              return `${outletName} · ${slotLabel}`;
            })()
          : null,
        wireLinkPeer: peerId ? wireDisplayLabel(job.diagram, peerId) : null,
        breakerLocked: isBreakerSeededWire(job.diagram, wire),
      };
    }
  } else if (selectedLightBulbId) {
    const bulb = job.diagram.lightBulbs.find((b) => b.id === selectedLightBulbId);
    if (bulb) {
      const nodeIds = new Set(
        job.diagram.deviceNodes
          .filter((n) => n.deviceKind === 'lightBulb' && n.deviceId === bulb.id)
          .map((n) => n.id),
      );
      const wireLabels = job.diagram.conduits
        .filter((c) => c.kind === 'device' && nodeIds.has(c.deviceNodeId))
        .flatMap((c) => c.wireIds.map((wireId) => wireDisplayLabel(job.diagram, wireId)));
      inspectorSelection = { kind: 'lightBulb', bulb, wireLabels };
    }
  } else if (selectedSwitchId) {
    const sw = job.diagram.switches.find((s) => s.id === selectedSwitchId);
    if (sw) {
      const nodeIds = new Set(
        job.diagram.deviceNodes
          .filter((n) => n.deviceKind === 'switch' && n.deviceId === sw.id)
          .map((n) => n.id),
      );
      const wireLabels = job.diagram.conduits
        .filter((c) => c.kind === 'device' && nodeIds.has(c.deviceNodeId))
        .flatMap((c) => c.wireIds.map((wireId) => wireDisplayLabel(job.diagram, wireId)));
      inspectorSelection = { kind: 'switch', sw, wireLabels };
    }
  } else if (selectedDimmerId) {
    const dim = job.diagram.dimmerSwitches.find((d) => d.id === selectedDimmerId);
    if (dim) {
      const nodeIds = new Set(
        job.diagram.deviceNodes
          .filter((n) => n.deviceKind === 'dimmerSwitch' && n.deviceId === dim.id)
          .map((n) => n.id),
      );
      const wireLabels = job.diagram.conduits
        .filter((c) => c.kind === 'device' && nodeIds.has(c.deviceNodeId))
        .flatMap((c) => c.wireIds.map((wireId) => wireDisplayLabel(job.diagram, wireId)));
      inspectorSelection = { kind: 'dimmerSwitch', dim, wireLabels };
    }
  } else if (selectedOutletId) {
    const outlet = job.diagram.outlets.find((o) => o.id === selectedOutletId);
    if (outlet) {
      const nodeIds = new Set(
        job.diagram.deviceNodes
          .filter((n) => n.deviceKind === 'outlet' && n.deviceId === outlet.id)
          .map((n) => n.id),
      );
      const wireLabels = job.diagram.conduits
        .filter((c) => c.kind === 'device' && nodeIds.has(c.deviceNodeId))
        .flatMap((c) => c.wireIds.map((wireId) => wireDisplayLabel(job.diagram, wireId)));
      inspectorSelection = { kind: 'outlet', outlet, wireLabels };
    }
  } else if (selectedRoomId) {
    const room = (job.diagram.rooms ?? []).find((r) => r.id === selectedRoomId);
    if (room) {
      inspectorSelection = { kind: 'room', room };
    }
  } else if (selectedBoxId) {
    const box = job.diagram.junctionBoxes.find((b) => b.id === selectedBoxId);
    if (box) {
      const hubCount = job.diagram.hubs.filter((h) => h.junctionBoxId === box.id).length;
      inspectorSelection = { kind: 'junctionBox', box, hubCount, hubSlotsFull: hubCount >= 4 };
    }
  }

  let conduitConnectHighlightCableIds: Set<string> | null = null;
  let conduitConnectDimStubNonTargets = false;
  let conduitConnectPendingCableIdForCanvas: string | null = null;
  if (tool === 'conduit-connect') {
    conduitConnectPendingCableIdForCanvas = conduitConnectPending?.cableIdA ?? null;
    if (conduitConnectPending) {
      conduitConnectHighlightCableIds = new Set<string>([
        conduitConnectPending.cableIdA,
        ...conduitConnectCompatibleCableIds(job.diagram, conduitConnectPending.cableIdA),
      ]);
      conduitConnectDimStubNonTargets = true;
    } else {
      conduitConnectHighlightCableIds = conduitStubAvailableCableIds(job.diagram);
    }
  }

  let helper =
    'Scroll to zoom. Drag empty canvas with middle mouse to pan. Drag on empty canvas to window-select (left→right touches, right→left fully inside).';
  if (tool === 'place-junction') {
    helper = 'Tap the canvas to place junction boxes. Press Escape to return to Select.';
  } else if (tool === 'place-room') {
    helper =
      'Drag on the canvas to size a new room (or click for a default room). Click the outline to select; interior clicks pass through. Press Escape to return to Select.';
  } else if (tool === 'cable') {
    helper =
      'Cable tool (C): tap a junction anchor for cables (1–3 wires); tap a breaker panel anchor for a breaker circuit; tap a hub or device terminal for stubs. Press Escape for Select.';
  } else if (tool === 'conduit-connect') {
    helper = conduitConnectPending
      ? 'Conduit connect (E): tap a compatible cable stub, then a junction anchor or breaker panel anchor (creates a matching breaker circuit if needed). Tap the starting stub again to cancel.'
      : 'Conduit connect (E): tap a cable conduit stub that is not yet in a conduit run; then tap a compatible stub, junction anchor, or breaker panel anchor. Escape cancels.';
  } else if (tool === 'place-light-bulb') {
    helper = 'Tap the canvas to place lights. Press Escape to return to Select.';
  } else if (tool === 'place-switch') {
    helper =
      switchPlacementKind === 'dimmer'
        ? 'Tap the canvas to place dimmer switches. Choose type in the toolbar. Press Escape to return to Select.'
        : `Tap the canvas to place ${switchPlacementKind.replace('-', ' ')} switches. Choose type in the toolbar. Press Escape to return to Select.`;
  } else if (tool === 'place-outlet') {
    helper = outletPassthrough
      ? 'Tap the canvas to place pass-through outlets. Choose type in the toolbar. Press Escape to return to Select.'
      : 'Tap the canvas to place outlets. Choose type in the toolbar. Press Escape to return to Select.';
  } else if (tool === 'connect-wires') {
    helper = connectPending
      ? 'Link wires (J): tap a second wire end anchor, hub, or device terminal to complete the connection. Press Escape to cancel.'
      : 'Link wires (J): tap wire end anchors (circles at each wire tip) to link them. Hubs and device terminals work too. Press Escape to return to Select.';
  } else if (tool === 'pan') {
    helper = 'Drag anywhere to pan the diagram. Scroll to zoom. Press Escape to return to Select.';
  } else if (tool === 'select') {
    helper =
      ephemeralConnect && connectPending
        ? 'Complete the link: tap a second wire end, hub, or device terminal. Press Escape to cancel.'
        : 'Click to select one item. Right-click or long-press a selected entity for actions. Drag on empty canvas: left→right selects anything touched; right→left selects only items fully inside. Hold Shift and drag to pan. Drag selected junction anchors or path bends together. Middle-drag to pan. Tools: V select, H pan, B box, M room, L light, S switch, O outlet, C cable, E conduit connect, J link, T labels, W hide conduits, G color groups, F fit (⇧F all). ⌘C copy, ⌘V paste, ⌘D duplicate. ⌘Z undo, ⇧⌘Z redo. Press Delete to remove selection.';
  }

  if (doorPlacingRoomId) {
    helper = ephemeralDoorPlacing
      ? 'Place door: click a room wall to drop a door there. Press Escape to cancel.'
      : 'Place door: click anywhere along a room wall to drop a door there. Press Escape or toggle off when done.';
  }

  return (
    <div className="editor-screen editor-screen--deck">
      <header className="editor-screen__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Library
        </button>
        <JobNameField
          jobId={job.id}
          name={job.name || 'Untitled job'}
          className="editor-screen__title editor-screen__title-input"
        />
      </header>

      <Toolbar
        tool={tool}
        onToolChange={handleToolChange}
        showLabels={showLabels}
        onShowLabelsChange={(next) => {
          setShowLabels(next);
          try {
            sessionStorage.setItem(SHOW_LABELS_KEY, next ? '1' : '0');
          } catch {
            /* ignore */
          }
        }}
        hideConduits={hideConduits}
        onHideConduitsChange={applyHideConduits}
        colorConduitGroups={colorConduitGroups}
        onColorConduitGroupsChange={applyColorConduitGroups}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undoDiagram}
        onRedo={redoDiagram}
        switchPlacementKind={switchPlacementKind}
        onSwitchPlacementKindChange={setSwitchPlacementKind}
        outletPassthrough={outletPassthrough}
        onOutletPassthroughChange={setOutletPassthrough}
      />

      {opposedFlowBanner && (
        <div className="editor-screen__banner" role="status">
          <p>
            These wires both flow into this connection. That can mean two hots meeting at a splice — double-check
            before energizing.
          </p>
          <button type="button" className="btn btn--small" onClick={() => setOpposedFlowBanner(false)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="editor-screen__main">
        <div className="editor-screen__canvas-col">
          <div className="editor-screen__viewport">
            <LabelSizeProvider labelScreenPx={labelSizePx}>
              <CanvasViewport
                viewBox="-800 -600 5200 4000"
                apiRef={viewportApiRef}
                overlay={<CanvasZoomControls onFit={() => fitView('selection-or-all')} onFitAll={() => fitView('all')} />}
                placementToolActive={
                  tool === 'place-junction' ||
                  tool === 'place-room' ||
                  tool === 'place-light-bulb' ||
                  tool === 'place-switch' ||
                  tool === 'place-outlet'
                }
                marqueeSelectActive={tool === 'select' && !shiftPanActive && !touchNavigation}
                panToolActive={panActive}
                toolCursorClass={viewportCursorClass(tool, panActive)}
                entityContextMenuActive={tool === 'select'}
                onEntityContextMenuAt={handleContextMenuAtClient}
                onMarqueeStart={(world) => handleMarqueeStart(world)}
                onMarqueeMove={(world) => handleMarqueeMove(world)}
                onMarqueeEnd={(world) => handleMarqueeEnd(world)}
                touchMarqueeSelectActive={false}
                onMarqueeBoundsChange={handleTouchMarqueeBounds}
                onMarqueeBoundsCommit={handleTouchMarqueeCommit}
                onMarqueeBoundsClear={handleTouchMarqueeClear}
                tapGestureActive={(tool === 'select' || tool === 'connect-wires') && touchNavigation}
                longPressMs={TOUCH_LONG_PRESS_MS}
                onTapAt={handleDiagramTap}
                onLongPressAt={handleSurfaceLongPress}
                penMarqueeSelectActive={false}
                penHoverActive={penInputActive}
                onPenHoverAt={handlePenHoverAt}
                onPenHoverClear={handlePenHoverClear}
                penHoverLabel={penHover?.label ?? null}
              >
                <DiagramSvg
                diagram={job.diagram}
                resolvedByWireId={resolvedByWireId}
                tool={tool}
                connectInteractionActive={connectInteractionActive}
                selection={selection}
                marquee={marquee}
                penHover={penHover}
                connectPendingWireId={
                  connectPending?.kind === 'wire-end' ? connectPending.wireId : null
                }
                connectPendingWireEndpoint={
                  connectPending?.kind === 'wire-end' ? connectPending.endpoint : null
                }
                connectPendingHubId={connectPending?.kind === 'hub' ? connectPending.id : null}
                connectPendingNodeId={connectPending?.kind === 'node' ? connectPending.id : null}
                onWirePointerDown={handleWirePointerDown}
                onWireEndpointPointerDown={handleWireEndpointPointerDown}
                onHubPointerDown={handleHubPointerDown}
                onHubConduitPick={handleHubConduitPick}
                onDeviceNodePointerDown={handleDeviceNodePointerDown}
                onApplyDiagram={(mutator, options) => updateDiagram(mutator, options)}
                onCommitHistory={commitDiagramHistory}
                onAnchorPick={handleAnchorPick}
                onJunctionAnchorPointerDown={handleJunctionAnchorPointerDown}
                onSelectLink={(id) => setSelection(setSingleLink(id))}
                onSelectHubBridge={(id) => setSelection(setSingleHubBridge(id))}
                onSelectHubWire={(id) => setSelection(setSingleHubWire(id))}
                onSelectConduit={(id) => setSelection(setSingleConduit(id))}
                onSelectCable={(id) => setSelection(setSingleCable(id))}
                onToggleBreakerCable={(cableId) => {
                  updateDiagram((d) => toggleBreakerCable(d, cableId));
                }}
                onSelectCableConduit={(id) => setSelection(setSingleCable(id))}
                onSelectConduitRun={(runId) => setSelection(setSingleConduitRun(runId))}
                conduitConnectHighlightCableIds={conduitConnectHighlightCableIds}
                conduitConnectDimStubNonTargets={conduitConnectDimStubNonTargets}
                conduitConnectPendingCableId={conduitConnectPendingCableIdForCanvas}
                onConduitConnectStubPick={handleConduitConnectStubPick}
                onSelectHub={(id) => setSelection(setSingleHub(id))}
                onSelectBox={(id) => {
                  if (!id) {
                    clearSelection();
                    return;
                  }
                  setSelection((prev) => {
                    if (prev.junctionBoxes.has(id) && prev.junctionBoxes.size > 1) return prev;
                    return setSingleJunctionBox(id);
                  });
                }}
                onSelectRoom={(id) => {
                  if (!id) return;
                  setSelection((prev) => {
                    if (prev.rooms.has(id) && prev.rooms.size > 1) return prev;
                    return setSingleRoom(id);
                  });
                }}
                doorPlacingRoomId={doorPlacingRoomId}
                onPlaceRoomDoor={(roomId, wall, centerOffset) => {
                  updateDiagram((d) => addRoomDoorAt(d, roomId, wall, centerOffset));
                  if (ephemeralDoorPlacing) {
                    setDoorPlacingRoomId(null);
                    setEphemeralDoorPlacing(false);
                  }
                }}
                onSelectLightBulb={(id) => {
                  if (!id) return;
                  setSelection((prev) => {
                    if (prev.lightBulbs.has(id) && prev.lightBulbs.size > 1) return prev;
                    return setSingleLightBulb(id);
                  });
                }}
                onSelectSwitch={(id) => {
                  if (!id) return;
                  setSelection((prev) => {
                    if (prev.switches.has(id) && prev.switches.size > 1) return prev;
                    return setSingleSwitch(id);
                  });
                }}
                onSelectDimmerSwitch={(id) => {
                  if (!id) return;
                  setSelection((prev) => {
                    if (prev.dimmerSwitches.has(id) && prev.dimmerSwitches.size > 1) return prev;
                    return setSingleDimmerSwitch(id);
                  });
                }}
                onSelectOutlet={(id) => {
                  if (!id) return;
                  setSelection((prev) => {
                    if (prev.outlets.has(id) && prev.outlets.size > 1) return prev;
                    return setSingleOutlet(id);
                  });
                }}
                onSelectDeviceNode={(nodeId) => {
                  handleDeviceNodePointerDown(nodeId);
                }}
                worldRect={WORLD_BOUNDS}
                showLabels={showLabels}
                hideConduits={hideConduits}
                colorConduitGroups={colorConduitGroups}
                switchPlacementKind={switchPlacementKind}
                outletPassthrough={outletPassthrough}
                onEntityContextMenu={handleEntityContextMenu}
                onSurfaceLongPress={handleSurfaceLongPress}
                />
              </CanvasViewport>
            </LabelSizeProvider>
          </div>
        </div>

        {contextMenu ? (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            actions={contextMenu.actions}
            onAction={handleContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
        ) : null}

        {pickMenu ? (
          <PickMenu
            x={pickMenu.x}
            y={pickMenu.y}
            items={pickMenu.items}
            onPick={handlePickMenuTarget}
            onClose={() => setPickMenu(null)}
          />
        ) : null}

        <EditorInspectorPanel open={infoPanelOpen} onOpenChange={setInfoPanelOpen}>
          <IssuesPanel
            diagram={job.diagram}
            resolvedByWireId={resolvedByWireId}
            selectedWireId={selectedWireId}
            selectedLinkId={selectedLinkId}
            onSelectWire={(id) => setSelection(setSingleWire(id))}
            onSelectLink={(id) => setSelection(setSingleLink(id))}
            onExport={exportActive}
            onExportSvg={handleExportSvg}
            onExportPng={handleExportPng}
            onBack={onBack}
          />
          <div className="editor-panel__inspector-scroll">
            <EditorLabelSettings
              showLabels={showLabels}
              onShowLabelsChange={(next) => {
                setShowLabels(next);
                try {
                  sessionStorage.setItem(SHOW_LABELS_KEY, next ? '1' : '0');
                } catch {
                  /* ignore */
                }
              }}
              labelSizePx={labelSizePx}
              onLabelSizeChange={(px) => {
                setLabelSizePx(px);
                try {
                  sessionStorage.setItem(LABEL_SIZE_KEY, String(px));
                } catch {
                  /* ignore */
                }
              }}
            />
            <Inspector
              diagram={job.diagram}
              selection={inspectorSelection}
              resolvedByWireId={resolvedByWireId}
              deleteError={deleteError}
              onUpdateWire={(patch) => {
                if (!selectedWireId) return;
                updateDiagram((d) => updateWire(d, selectedWireId, patch));
              }}
              onUpdateCable={(patch) => {
                if (!selectedCableId) return;
                updateDiagram((d) => updateCable(d, selectedCableId, patch));
              }}
              onUpdateCableWires={(wireColors) => {
                if (!selectedCableId) return;
                try {
                  updateDiagram((d) => updateCableWires(d, selectedCableId, wireColors));
                  setDeleteError(null);
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : 'Could not update cable wires.');
                }
              }}
              onMoveCableAnchor={(anchor) => {
                if (!selectedCableId) return;
                try {
                  updateDiagram((d) => moveCableAnchor(d, selectedCableId, anchor));
                  setDeleteError(null);
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : 'Could not move cable anchor.');
                }
              }}
              onToggleBreakerCable={
                selectedCableId
                  ? () => {
                      updateDiagram((d) => toggleBreakerCable(d, selectedCableId));
                    }
                  : undefined
              }
              onUpdateConduit={(label) => {
                if (!selectedConduitId) return;
                updateDiagram((d) => updateConduit(d, selectedConduitId, { label }));
              }}
              onUpdateJunctionBox={(label) => {
                if (!selectedBoxId) return;
                updateDiagram((d) => updateJunctionBox(d, selectedBoxId, { label }));
              }}
              onUpdateHub={(label) => {
                if (!selectedHubId) return;
                updateDiagram((d) => updateHub(d, selectedHubId, { label }));
              }}
              onAddHub={
                selectedBoxId
                  ? () => {
                      try {
                        updateDiagram((d) => addHub(d, selectedBoxId));
                        setDeleteError(null);
                      } catch (err) {
                        setDeleteError(err instanceof Error ? err.message : 'Could not add hub.');
                      }
                    }
                  : undefined
              }
              onAddBreakerCircuit={
                selectedBoxId &&
                job.diagram.junctionBoxes.find((b) => b.id === selectedBoxId)?.type === 'breaker'
                  ? () => {
                      const panelAnchors: AnchorPosition[] = [
                        'middle-left',
                        'middle-right',
                        'top-center',
                        'bottom-center',
                        'top-left',
                        'top-right',
                      ];
                      updateDiagram((d) => {
                        const count = d.cables.filter(
                          (c) => c.junctionBoxId === selectedBoxId && c.role === 'breaker',
                        ).length;
                        const anchor = panelAnchors[count % panelAnchors.length]!;
                        return addCable(d, {
                          junctionBoxId: selectedBoxId,
                          anchor,
                          wireColors: breakerPresetWireColors('twoWire'),
                        });
                      });
                    }
                  : undefined
              }
              onDetachWireFromHub={(wireId) => {
                updateDiagram((d) => detachWireFromHub(d, wireId));
              }}
              onDetachWireFromDeviceNode={(wireId) => {
                updateDiagram((d) => detachWireFromDeviceNode(d, wireId));
              }}
              onUpdateLightBulb={(label) => {
                if (!selectedLightBulbId) return;
                updateDiagram((d) => updateLightBulb(d, selectedLightBulbId, { label }));
              }}
              onUpdateSwitch={(patch) => {
                if (!selectedSwitchId) return;
                updateDiagram((d) => updateSwitch(d, selectedSwitchId, patch));
              }}
              onToggleSwitch={
                selectedSwitchId
                  ? () => updateDiagram((d) => flipSwitchPosition(d, selectedSwitchId))
                  : undefined
              }
              onUpdateDimmerSwitch={(patch) => {
                if (!selectedDimmerId) return;
                updateDiagram((d) => updateDimmerSwitch(d, selectedDimmerId, patch));
              }}
              onToggleDimmer={
                selectedDimmerId
                  ? () => updateDiagram((d) => flipDimmerPosition(d, selectedDimmerId))
                  : undefined
              }
              onUpdateOutlet={(patch) => {
                if (!selectedOutletId) return;
                updateDiagram((d) => updateOutlet(d, selectedOutletId, patch));
              }}
              onRotateDevice={(direction) => {
                const kind = selectedLightBulbId
                  ? 'lightBulb'
                  : selectedSwitchId
                    ? 'switch'
                    : selectedDimmerId
                      ? 'dimmerSwitch'
                      : selectedOutletId
                        ? 'outlet'
                        : null;
                const id =
                  selectedLightBulbId ?? selectedSwitchId ?? selectedDimmerId ?? selectedOutletId;
                if (!kind || !id) return;
                updateDiagram((d) => rotateDevice(d, kind, id, direction));
              }}
              onUpdateRoom={(patch) => {
                if (!selectedRoomId) return;
                updateDiagram((d) => updateRoom(d, selectedRoomId, patch));
              }}
              onUpdateRoomDoor={(doorId, patch) => {
                if (!selectedRoomId) return;
                updateDiagram((d) => updateRoomDoor(d, selectedRoomId, doorId, patch));
              }}
              onRemoveRoomDoor={(doorId) => {
                if (!selectedRoomId) return;
                updateDiagram((d) => removeRoomDoor(d, selectedRoomId, doorId));
              }}
              doorPlacing={Boolean(selectedRoomId) && doorPlacingRoomId === selectedRoomId}
              onToggleDoorPlacing={() => {
                if (!selectedRoomId) return;
                setEphemeralDoorPlacing(false);
                setDoorPlacingRoomId((prev) => (prev === selectedRoomId ? null : selectedRoomId));
              }}
              onDelete={handleDeleteSelection}
              onDuplicate={
                tool === 'select' && selectionHasDuplicateableContent(selection)
                  ? handleDuplicateSelection
                  : undefined
              }
            />
          </div>
        </EditorInspectorPanel>
      </div>

      <footer className="editor-screen__helper">{helper}</footer>

      <ConduitDialog
        state={conduitDialog}
        onDismiss={() => {
          setConduitDialog(null);
          setConduitConnectPending(null);
        }}
        onConfirm={handleConduitConfirm}
        onConfirmBreaker={handleBreakerConduitConfirm}
      />
    </div>
  );
}
