import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { AnchorPosition, WireColor } from '../domain/types';
import { isBreakerSeededWire } from '../domain/breaker-conduit';
import {
  addBreaker,
  addHub,
  addHubBridge,
  addBreakerConduit,
  addDeviceConduit,
  addLocalConduit,
  addSpanConduit,
  addWireLinkToDiagram,
  attachWireToHub,
  deleteConduit,
  deleteHub,
  deleteHubBridge,
  deleteWire,
  deleteWireLink,
  detachWireFromHub,
  updateConduit,
  updateHub,
  updateJunctionBox,
  updateWire,
  wireLinkForWire,
} from '../domain/mutations';
import {
  attachHubToDeviceNode,
  deleteLightBulb,
  deleteSwitch,
  detachWireFromDeviceNode,
  updateLightBulb,
  updateSwitch,
} from '../domain/device-mutations';
import { deviceNodeById } from '../domain/device-node-geometry';
import type { Diagram } from '../domain/types';
import { isWhiteMismatch } from '../domain/warnings';
import { CanvasViewport } from '../canvas/CanvasViewport';
import {
  DEFAULT_LABEL_SCREEN_PX,
  LabelSizeProvider,
  MAX_LABEL_SCREEN_PX,
  MIN_LABEL_SCREEN_PX,
} from '../canvas/LabelSizeContext';
import { DiagramSvg } from '../canvas/DiagramSvg';
import { useJobStore, useResolvedWireMap } from '../store/job-store';
import type { EditorMainTool } from '../editor/editor-tools';
import { Toolbar } from '../editor/Toolbar';
import { Inspector, type InspectorSelection } from '../editor/Inspector';
import { IssuesPanel } from '../editor/IssuesPanel';
import { ConduitDialog, type ConduitDialogState } from '../editor/ConduitDialog';
import { EditorLabelSettings } from '../editor/EditorLabelSettings';

const WORLD_BOUNDS = {
  minX: -800,
  minY: -600,
  width: 5200,
  height: 4000,
} as const;

const WHITE_MISMATCH_SESSION_KEY = 'wirer:white-mismatch-toast';
const SHOW_LABELS_KEY = 'wirer:show-labels';
const LABEL_SIZE_KEY = 'wirer:label-size-px';

type ConnectPending =
  | { kind: 'wire'; id: string }
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
  const exportActive = useJobStore((s) => s.exportActive);
  const resolvedByWireId = useResolvedWireMap();

  const [tool, setTool] = useState<EditorMainTool>('select');
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [selectedConduitId, setSelectedConduitId] = useState<string | null>(null);
  const [selectedHubId, setSelectedHubId] = useState<string | null>(null);
  const [selectedHubBridgeId, setSelectedHubBridgeId] = useState<string | null>(null);
  const [selectedLightBulbId, setSelectedLightBulbId] = useState<string | null>(null);
  const [selectedSwitchId, setSelectedSwitchId] = useState<string | null>(null);
  const [selectedDeviceNodeId, setSelectedDeviceNodeId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [connectPending, setConnectPending] = useState<ConnectPending>(null);
  const [whiteMismatchBanner, setWhiteMismatchBanner] = useState(false);
  const [conduitDialog, setConduitDialog] = useState<ConduitDialogState>(null);
  const [spanAnchorA, setSpanAnchorA] = useState<{ boxId: string; anchor: AnchorPosition } | null>(null);
  const [showLabels, setShowLabels] = useState(readShowLabelsPreference);
  const [labelSizePx, setLabelSizePx] = useState(readLabelSizePreference);

  useEffect(() => {
    setSpanAnchorA(null);
    setConduitDialog(null);
    setConnectPending(null);
  }, [tool]);

  useEffect(() => {
    setDeleteError(null);
  }, [
    selectedWireId,
    selectedLinkId,
    selectedConduitId,
    selectedBoxId,
    selectedHubId,
    selectedHubBridgeId,
    selectedLightBulbId,
    selectedSwitchId,
    selectedDeviceNodeId,
  ]);

  function clearSelection() {
    setSelectedWireId(null);
    setSelectedBoxId(null);
    setSelectedLinkId(null);
    setSelectedConduitId(null);
    setSelectedHubId(null);
    setSelectedHubBridgeId(null);
    setSelectedLightBulbId(null);
    setSelectedSwitchId(null);
    setSelectedDeviceNodeId(null);
  }

  function returnToSelectTool() {
    setConduitDialog(null);
    setSpanAnchorA(null);
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

    setDeleteError(null);

    if (selectedLinkId) {
      updateDiagram((d) => deleteWireLink(d, selectedLinkId));
      setSelectedLinkId(null);
      return;
    }

    if (selectedHubBridgeId) {
      updateDiagram((d) => deleteHubBridge(d, selectedHubBridgeId));
      setSelectedHubBridgeId(null);
      return;
    }

    if (selectedHubId) {
      updateDiagram((d) => deleteHub(d, selectedHubId));
      setSelectedHubId(null);
      return;
    }

    if (selectedLightBulbId) {
      updateDiagram((d) => deleteLightBulb(d, selectedLightBulbId));
      setSelectedLightBulbId(null);
      setSelectedDeviceNodeId(null);
      return;
    }

    if (selectedSwitchId) {
      updateDiagram((d) => deleteSwitch(d, selectedSwitchId));
      setSelectedSwitchId(null);
      setSelectedDeviceNodeId(null);
      return;
    }

    if (selectedConduitId) {
      updateDiagram((d) => deleteConduit(d, selectedConduitId));
      setSelectedConduitId(null);
      return;
    }

    if (selectedWireId) {
      try {
        updateDiagram((d) => deleteWire(d, selectedWireId));
        setSelectedWireId(null);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Could not delete wire.');
      }
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (tool !== 'select' || conduitDialog || connectPending || spanAnchorA) {
          e.preventDefault();
          returnToSelectTool();
        }
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (tool !== 'select') return;
      if (
        !selectedWireId &&
        !selectedLinkId &&
        !selectedConduitId &&
        !selectedBoxId &&
        !selectedHubId &&
        !selectedHubBridgeId &&
        !selectedLightBulbId &&
        !selectedSwitchId
      ) {
        return;
      }
      e.preventDefault();
      handleDeleteSelection();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    tool,
    conduitDialog,
    connectPending,
    spanAnchorA,
    selectedWireId,
    selectedLinkId,
    selectedConduitId,
    selectedBoxId,
    selectedHubId,
    selectedHubBridgeId,
    selectedLightBulbId,
    selectedSwitchId,
    job,
    updateDiagram,
  ]);

  function finishConnect(target: ConnectPending) {
    if (!job || !target) return;

    if (!connectPending) {
      setConnectPending(target);
      return;
    }

    if (connectPending.kind === target.kind && connectPending.id === target.id) {
      setConnectPending(null);
      return;
    }

    try {
      if (connectPending.kind === 'wire' && target.kind === 'wire') {
        const wa = job.diagram.wires.find((w) => w.id === connectPending.id);
        const wb = job.diagram.wires.find((w) => w.id === target.id);
        if (!wa || !wb) {
          setConnectPending(null);
          return;
        }

        if (wa.hubId || wb.hubId || wa.deviceNodeId || wb.deviceNodeId) {
          setDeleteError('A wire on a hub or terminal cannot use a direct wire-to-wire link. Detach it first.');
          setConnectPending(null);
          return;
        }

        if (wireLinkForWire(job.diagram, connectPending.id) || wireLinkForWire(job.diagram, target.id)) {
          setDeleteError('Each wire can have only one wire-to-wire connection.');
          setConnectPending(null);
          return;
        }

        const willWarn = isWhiteMismatch(wa, wb);
        updateDiagram((d) => addWireLinkToDiagram(d, connectPending.id, target.id));

        if (willWarn && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(WHITE_MISMATCH_SESSION_KEY)) {
          sessionStorage.setItem(WHITE_MISMATCH_SESSION_KEY, '1');
          setWhiteMismatchBanner(true);
        }
      } else if (connectPending.kind === 'wire' && target.kind === 'hub') {
        updateDiagram((d) => attachWireToHub(d, target.id, connectPending.id));
      } else if (connectPending.kind === 'hub' && target.kind === 'wire') {
        updateDiagram((d) => attachWireToHub(d, connectPending.id, target.id));
      } else if (connectPending.kind === 'hub' && target.kind === 'hub') {
        updateDiagram((d) => addHubBridge(d, connectPending.id, target.id));
      } else if (connectPending.kind === 'hub' && target.kind === 'node') {
        updateDiagram((d) => attachHubToDeviceNode(d, connectPending.id, target.id));
      } else if (connectPending.kind === 'node' && target.kind === 'hub') {
        updateDiagram((d) => attachHubToDeviceNode(d, target.id, connectPending.id));
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not connect.');
    }

    setConnectPending(null);
  }

  function handleAnchorPick(payload: { boxId: string; anchor: AnchorPosition }) {
    if (tool === 'conduit-local') {
      const box = job?.diagram.junctionBoxes.find((b) => b.id === payload.boxId);
      if (box?.type === 'breaker') {
        setDeleteError('Use the Breaker tool for circuits inside the breaker panel.');
        return;
      }
      setConduitDialog({ kind: 'local', junctionBoxId: payload.boxId, anchor: payload.anchor });
    } else if (tool === 'conduit-breaker') {
      const box = job?.diagram.junctionBoxes.find((b) => b.id === payload.boxId);
      if (!box || box.type !== 'breaker') {
        setDeleteError('Breaker circuits can only be placed on the breaker panel.');
        return;
      }
      setDeleteError(null);
      setConduitDialog({ kind: 'breaker', junctionBoxId: payload.boxId, anchor: payload.anchor });
    } else if (tool === 'conduit-span') {
      if (!spanAnchorA) {
        setSpanAnchorA({ boxId: payload.boxId, anchor: payload.anchor });
        return;
      }

      if (spanAnchorA.boxId === payload.boxId) {
        return;
      }

      setConduitDialog({
        kind: 'span',
        junctionBoxIdA: spanAnchorA.boxId,
        anchorA: spanAnchorA.anchor,
        junctionBoxIdB: payload.boxId,
        anchorB: payload.anchor,
      });
      setSpanAnchorA(null);
    }
  }

  function handleWirePointerDown(wireId: string) {
    if (!job) return;

    if (tool === 'select') {
      setSelectedWireId(wireId);
      setSelectedBoxId(null);
      setSelectedLinkId(null);
      setSelectedConduitId(null);
      setSelectedHubId(null);
      setSelectedHubBridgeId(null);
      setSelectedLightBulbId(null);
      setSelectedSwitchId(null);
      setSelectedDeviceNodeId(null);
      return;
    }

    if (tool === 'connect-wires') {
      finishConnect({ kind: 'wire', id: wireId });
    }
  }

  function handleHubPointerDown(hubId: string) {
    if (tool !== 'connect-wires') return;
    finishConnect({ kind: 'hub', id: hubId });
  }

  function handleDeviceNodePointerDown(nodeId: string) {
    if (tool === 'conduit-local') {
      setDeleteError(null);
      setConduitDialog({ kind: 'device', deviceNodeId: nodeId });
      return;
    }
    if (tool === 'connect-wires') {
      finishConnect({ kind: 'node', id: nodeId });
      return;
    }
    if (tool === 'select') {
      setSelectedDeviceNodeId(nodeId);
      const node = deviceNodeById(job!.diagram, nodeId);
      if (node?.deviceKind === 'lightBulb') {
        setSelectedLightBulbId(node.deviceId);
        setSelectedSwitchId(null);
      } else if (node?.deviceKind === 'switch') {
        setSelectedSwitchId(node.deviceId);
        setSelectedLightBulbId(null);
      }
      setSelectedWireId(null);
      setSelectedBoxId(null);
      setSelectedLinkId(null);
      setSelectedConduitId(null);
      setSelectedHubId(null);
      setSelectedHubBridgeId(null);
    }
  }

  function handleConduitConfirm(wireColors: WireColor[]) {
    if (!conduitDialog) return;

    if (conduitDialog.kind === 'local') {
      updateDiagram((d) =>
        addLocalConduit(d, {
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
    } else if (conduitDialog.kind === 'span') {
      updateDiagram((d) =>
        addSpanConduit(d, {
          junctionBoxIdA: conduitDialog.junctionBoxIdA,
          anchorA: conduitDialog.anchorA,
          junctionBoxIdB: conduitDialog.junctionBoxIdB,
          anchorB: conduitDialog.anchorB,
          wireColors,
        }),
      );
    }

    setConduitDialog(null);
  }

  function handleBreakerConduitConfirm(label: string) {
    if (!conduitDialog || conduitDialog.kind !== 'breaker') return;
    updateDiagram((d) =>
      addBreakerConduit(d, {
        junctionBoxId: conduitDialog.junctionBoxId,
        anchor: conduitDialog.anchor,
        label,
      }),
    );
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

  let inspectorSelection: InspectorSelection = null;
  if (selectedLinkId) {
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
      const link = wireLinkForWire(job.diagram, wire.id);
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
              const sw = job.diagram.switches.find((s) => s.id === node.deviceId);
              const name = (sw?.label ?? '').trim() || 'Switch';
              return `${name} · terminal ${node.slot + 1}`;
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
  } else if (selectedBoxId) {
    const box = job.diagram.junctionBoxes.find((b) => b.id === selectedBoxId);
    if (box) {
      const hubCount = job.diagram.hubs.filter((h) => h.junctionBoxId === box.id).length;
      inspectorSelection = { kind: 'junctionBox', box, hubCount, hubSlotsFull: hubCount >= 4 };
    }
  }

  let helper = 'Scroll to zoom, drag empty canvas to pan. Select items and press Delete to remove.';
  if (tool === 'place-junction') {
    helper = 'Tap the canvas to place junction boxes. Press Escape to return to Select.';
  } else if (tool === 'conduit-local') {
    helper =
      'Tap a junction box anchor or a light/switch terminal to add a conduit bundle. Press Escape to return to Select.';
  } else if (tool === 'conduit-span') {
    helper = spanAnchorA
      ? 'Tap an anchor on a second junction box to complete the span run. Press Escape to cancel.'
      : 'Tap an anchor on the starting junction box, then a second box. Press Escape to return to Select.';
  } else if (tool === 'conduit-breaker') {
    helper = 'Tap an anchor on the breaker panel to add a circuit (black away, white toward). Press Escape to return to Select.';
  } else if (tool === 'place-light-bulb') {
    helper = 'Tap the canvas to place lights. Press Escape to return to Select.';
  } else if (tool === 'place-switch') {
    helper = 'Tap the canvas to place switches. Press Escape to return to Select.';
  } else if (tool === 'connect-wires') {
    helper = connectPending
      ? 'Tap a wire, hub, or device terminal to complete the connection. Press Escape to cancel.'
      : 'Tap wires or hubs to link them. Terminals with conduits can link to a hub. Press Escape to return to Select.';
  }

  return (
    <div className="editor-screen editor-screen--deck">
      <header className="editor-screen__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Library
        </button>
        <h2 className="editor-screen__title">{job.name || 'Untitled job'}</h2>
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
      />

      {whiteMismatchBanner && (
        <div className="editor-screen__banner" role="status">
          <p>
            You linked a white conductor to a non-white one. That often means a neutral is tied to a hot — double-check
            before energizing.
          </p>
          <button type="button" className="btn btn--small" onClick={() => setWhiteMismatchBanner(false)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="editor-screen__main">
        <div className="editor-screen__canvas-col">
          <div className="editor-screen__viewport">
            <LabelSizeProvider labelScreenPx={labelSizePx}>
              <CanvasViewport viewBox="-800 -600 5200 4000">
                <DiagramSvg
                diagram={job.diagram}
                resolvedByWireId={resolvedByWireId}
                tool={tool}
                selectedBoxId={selectedBoxId}
                selectedWireId={selectedWireId}
                connectPendingWireId={connectPending?.kind === 'wire' ? connectPending.id : null}
                connectPendingHubId={connectPending?.kind === 'hub' ? connectPending.id : null}
                connectPendingNodeId={connectPending?.kind === 'node' ? connectPending.id : null}
                selectedLightBulbId={selectedLightBulbId}
                selectedSwitchId={selectedSwitchId}
                selectedDeviceNodeId={selectedDeviceNodeId}
                selectedLinkId={selectedLinkId}
                selectedConduitId={selectedConduitId}
                selectedHubId={selectedHubId}
                selectedHubBridgeId={selectedHubBridgeId}
                onWirePointerDown={handleWirePointerDown}
                onHubPointerDown={handleHubPointerDown}
                onDeviceNodePointerDown={handleDeviceNodePointerDown}
                onApplyDiagram={(mutator) => updateDiagram(mutator)}
                onAnchorPick={handleAnchorPick}
                onSelectLink={(id) => {
                  clearSelection();
                  setSelectedLinkId(id);
                }}
                onSelectHubBridge={(id) => {
                  clearSelection();
                  setSelectedHubBridgeId(id);
                }}
                onSelectConduit={(id) => {
                  clearSelection();
                  setSelectedConduitId(id);
                }}
                onSelectHub={(id) => {
                  clearSelection();
                  setSelectedHubId(id);
                }}
                onSelectBox={(id) => {
                  clearSelection();
                  setSelectedBoxId(id);
                }}
                onSelectLightBulb={(id) => {
                  clearSelection();
                  setSelectedLightBulbId(id);
                }}
                onSelectSwitch={(id) => {
                  clearSelection();
                  setSelectedSwitchId(id);
                }}
                onSelectDeviceNode={(nodeId) => {
                  handleDeviceNodePointerDown(nodeId);
                }}
                worldRect={WORLD_BOUNDS}
                showLabels={showLabels}
                />
              </CanvasViewport>
            </LabelSizeProvider>
          </div>
        </div>

        <aside className="editor-screen__sidebar">
          <IssuesPanel
            diagram={job.diagram}
            resolvedByWireId={resolvedByWireId}
            selectedWireId={selectedWireId}
            selectedLinkId={selectedLinkId}
            onSelectWire={(id) => {
              setSelectedWireId(id);
              setSelectedBoxId(null);
              setSelectedLinkId(null);
              setSelectedConduitId(null);
            }}
            onSelectLink={(id) => {
              setSelectedLinkId(id);
              setSelectedWireId(null);
              setSelectedBoxId(null);
              setSelectedConduitId(null);
            }}
            onExport={exportActive}
            onBack={onBack}
          />
          <div className="editor-screen__inspector-sheet">
            <div className="inspector-sheet__grip" aria-hidden />
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
              selection={inspectorSelection}
              deleteError={deleteError}
              onUpdateWire={(patch) => {
                if (!selectedWireId) return;
                updateDiagram((d) => updateWire(d, selectedWireId, patch));
              }}
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
                      updateDiagram((d) => addBreaker(d, selectedBoxId));
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
              onDelete={handleDeleteSelection}
            />
          </div>
        </aside>
      </div>

      <footer className="editor-screen__helper">{helper}</footer>

      <ConduitDialog
        state={conduitDialog}
        onDismiss={() => {
          setConduitDialog(null);
          setSpanAnchorA(null);
        }}
        onConfirm={handleConduitConfirm}
        onConfirmBreaker={handleBreakerConduitConfirm}
      />
    </div>
  );
}
