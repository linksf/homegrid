import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
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
  attachHubToDeviceNode,
  attachWireToDeviceNode,
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
import { addRoomDoorAt, removeRoomDoor, updateRoom } from '../domain/room-mutations';
import { deviceNodeById } from '../domain/device-node-geometry';
import type { Diagram } from '../domain/types';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { CanvasZoomControls } from '../canvas/CanvasZoomControls';
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

const WORLD_BOUNDS = {
  minX: -800,
  minY: -600,
  width: 5200,
  height: 4000,
} as const;

const OPPOSED_FLOW_SESSION_KEY = 'wirer:opposed-flow-toast';
const SHOW_LABELS_KEY = 'wirer:show-labels';
const LABEL_SIZE_KEY = 'wirer:label-size-px';

type ConnectPending =
  | { kind: 'wire-end'; wireId: string; endpoint: import('../domain/types').WireEndpoint }
  | { kind: 'hub'; id: string }
  | { kind: 'node'; id: string }
  | null;

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
  const [labelSizePx, setLabelSizePx] = useState(readLabelSizePreference);
  const [shiftPanActive, setShiftPanActive] = useState(false);
  const [switchPlacementKind, setSwitchPlacementKind] = useState<SwitchPlacementKind>('single-pole');
  const [outletPassthrough, setOutletPassthrough] = useState(false);
  const [doorPlacingRoomId, setDoorPlacingRoomId] = useState<string | null>(null);
  const [infoPanelOpen, setInfoPanelOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );

  const panActive = tool === 'pan' || shiftPanActive;

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
    setTool('select');
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (doorPlacingRoomId) {
          e.preventDefault();
          setDoorPlacingRoomId(null);
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

        const nextTool = toolForShortcutKey(e.key);
        if (nextTool) {
          e.preventDefault();
          setTool(nextTool);
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
    selection,
    job,
    updateDiagram,
    undoDiagram,
    redoDiagram,
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
      setConnectPending(null);
      return;
    }
    if (
      connectPending.kind !== 'wire-end' &&
      target.kind !== 'wire-end' &&
      'id' in connectPending &&
      'id' in target &&
      connectPending.id === target.id
    ) {
      setConnectPending(null);
      return;
    }

    try {
      if (connectPending.kind === 'wire-end' && target.kind === 'wire-end') {
        const wa = job.diagram.wires.find((w) => w.id === connectPending.wireId);
        const wb = job.diagram.wires.find((w) => w.id === target.wireId);
        if (!wa || !wb) {
          setConnectPending(null);
          return;
        }

        if (wa.hubId || wb.hubId || wa.deviceNodeId || wb.deviceNodeId) {
          setDeleteError('A wire on a hub or terminal cannot use a direct wire-to-wire link. Detach it first.');
          setConnectPending(null);
          return;
        }

        if (
          wireLinkAtEndpoint(job.diagram, connectPending.wireId, connectPending.endpoint) ||
          wireLinkAtEndpoint(job.diagram, target.wireId, target.endpoint)
        ) {
          setDeleteError('That wire end is already linked.');
          setConnectPending(null);
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
        updateDiagram((d) => attachHubToDeviceNode(d, connectPending.id, target.id));
      } else if (connectPending.kind === 'node' && target.kind === 'hub') {
        updateDiagram((d) => attachHubToDeviceNode(d, target.id, connectPending.id));
      } else if (connectPending.kind === 'wire-end' && target.kind === 'node') {
        updateDiagram((d) =>
          attachWireToDeviceNode(d, target.id, connectPending.wireId, connectPending.endpoint),
        );
      } else if (connectPending.kind === 'node' && target.kind === 'wire-end') {
        updateDiagram((d) =>
          attachWireToDeviceNode(d, connectPending.id, target.wireId, target.endpoint),
        );
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not connect.');
    }

    setConnectPending(null);
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

    if (tool === 'select') {
      setSelection(setSingleWire(wireId));
      return;
    }

    if (tool === 'connect-wires') {
      return;
    }
  }

  function handleWireEndpointPointerDown(wireId: string, endpoint: WireEndpoint) {
    if (tool !== 'connect-wires') return;
    finishConnect({ kind: 'wire-end', wireId, endpoint });
  }

  function handleHubPointerDown(hubId: string) {
    if (tool !== 'connect-wires') return;
    finishConnect({ kind: 'hub', id: hubId });
  }

  function handleDeviceNodePointerDown(nodeId: string) {
    if (tool === 'cable') {
      setDeleteError(null);
      setConduitDialog({ kind: 'device', deviceNodeId: nodeId });
      return;
    }
    if (tool === 'connect-wires') {
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
      'Click to select one item. Drag on empty canvas: left→right selects anything touched; right→left selects only items fully inside. Hold Shift and drag to pan. Drag selected junction anchors or path bends together. Middle-drag to pan. Tools: V select, H pan, B box, M room, L light, S switch, O outlet, C cable, E conduit connect, J link, T labels. ⌘Z undo, ⇧⌘Z redo. Press Delete to remove selection.';
  }

  if (doorPlacingRoomId) {
    helper = 'Place door: click anywhere along a room wall to drop a door there. Press Escape or toggle off when done.';
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
        onToolChange={setTool}
        showLabels={showLabels}
        onShowLabelsChange={(next) => {
          setShowLabels(next);
          try {
            sessionStorage.setItem(SHOW_LABELS_KEY, next ? '1' : '0');
          } catch {
            /* ignore */
          }
        }}
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
                overlay={<CanvasZoomControls />}
                placementToolActive={
                  tool === 'place-junction' ||
                  tool === 'place-room' ||
                  tool === 'place-light-bulb' ||
                  tool === 'place-switch' ||
                  tool === 'place-outlet'
                }
                marqueeSelectActive={tool === 'select' && !shiftPanActive}
                panToolActive={panActive}
                toolCursorClass={viewportCursorClass(tool, panActive)}
                onMarqueeStart={(world) => handleMarqueeStart(world)}
                onMarqueeMove={(world) => handleMarqueeMove(world)}
                onMarqueeEnd={(world) => handleMarqueeEnd(world)}
              >
                <DiagramSvg
                diagram={job.diagram}
                resolvedByWireId={resolvedByWireId}
                tool={tool}
                selection={selection}
                marquee={marquee}
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
                switchPlacementKind={switchPlacementKind}
                outletPassthrough={outletPassthrough}
                />
              </CanvasViewport>
            </LabelSizeProvider>
          </div>
        </div>

        <EditorInspectorPanel open={infoPanelOpen} onOpenChange={setInfoPanelOpen}>
          <IssuesPanel
            diagram={job.diagram}
            resolvedByWireId={resolvedByWireId}
            selectedWireId={selectedWireId}
            selectedLinkId={selectedLinkId}
            onSelectWire={(id) => setSelection(setSingleWire(id))}
            onSelectLink={(id) => setSelection(setSingleLink(id))}
            onExport={exportActive}
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
                        'center',
                        'middle-right',
                        'top-center',
                        'bottom-center',
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
              onRemoveRoomDoor={(doorId) => {
                if (!selectedRoomId) return;
                updateDiagram((d) => removeRoomDoor(d, selectedRoomId, doorId));
              }}
              doorPlacing={Boolean(selectedRoomId) && doorPlacingRoomId === selectedRoomId}
              onToggleDoorPlacing={() => {
                if (!selectedRoomId) return;
                setDoorPlacingRoomId((prev) => (prev === selectedRoomId ? null : selectedRoomId));
              }}
              onDelete={handleDeleteSelection}
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
