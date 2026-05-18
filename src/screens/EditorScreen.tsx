import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { AnchorPosition, WireColor } from '../domain/types';
import { addLocalConduit, addSpanConduit, addWireLinkToDiagram, updateWire } from '../domain/mutations';
import { isWhiteMismatch } from '../domain/warnings';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { DiagramSvg } from '../canvas/DiagramSvg';
import { useJobStore, useResolvedWireMap } from '../store/job-store';
import type { EditorMainTool } from '../editor/editor-tools';
import { Toolbar } from '../editor/Toolbar';
import { Inspector } from '../editor/Inspector';
import { IssuesPanel } from '../editor/IssuesPanel';
import { ConduitDialog, type ConduitDialogState } from '../editor/ConduitDialog';

const WORLD_BOUNDS = {
  minX: -800,
  minY: -600,
  width: 5200,
  height: 4000,
} as const;

const WHITE_MISMATCH_SESSION_KEY = 'wirer:white-mismatch-toast';

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
  const [connectPendingWireId, setConnectPendingWireId] = useState<string | null>(null);
  const [whiteMismatchBanner, setWhiteMismatchBanner] = useState(false);
  const [conduitDialog, setConduitDialog] = useState<ConduitDialogState>(null);
  const [spanAnchorA, setSpanAnchorA] = useState<{ boxId: string; anchor: AnchorPosition } | null>(null);

  useEffect(() => {
    setSpanAnchorA(null);
    setConduitDialog(null);
    setConnectPendingWireId(null);
  }, [tool]);

  function handleAnchorPick(payload: { boxId: string; anchor: AnchorPosition }) {
    if (tool === 'conduit-local') {
      setConduitDialog({ kind: 'local', junctionBoxId: payload.boxId, anchor: payload.anchor });
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
      return;
    }

    if (tool !== 'connect-wires') {
      return;
    }

    if (!connectPendingWireId) {
      setConnectPendingWireId(wireId);
      return;
    }

    if (connectPendingWireId === wireId) {
      return;
    }

    const wa = job.diagram.wires.find((w) => w.id === connectPendingWireId);
    const wb = job.diagram.wires.find((w) => w.id === wireId);
    if (!wa || !wb) {
      setConnectPendingWireId(null);
      return;
    }

    const sorted = [connectPendingWireId, wireId].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const [idLo, idHi] = sorted;
    const dupe = job.diagram.wireLinks.some((l) => l.wireIdA === idLo && l.wireIdB === idHi);
    if (dupe) {
      setConnectPendingWireId(null);
      return;
    }

    const willWarn = isWhiteMismatch(wa, wb);

    try {
      updateDiagram((d) => addWireLinkToDiagram(d, connectPendingWireId, wireId));
    } catch {
      setConnectPendingWireId(null);
      return;
    }

    setConnectPendingWireId(null);

    if (willWarn && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(WHITE_MISMATCH_SESSION_KEY)) {
      sessionStorage.setItem(WHITE_MISMATCH_SESSION_KEY, '1');
      setWhiteMismatchBanner(true);
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
    } else {
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
    setTool('select');
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

  const selectedWire = selectedWireId ? (job.diagram.wires.find((w) => w.id === selectedWireId) ?? null) : null;

  let helper = 'Scroll to zoom, drag empty canvas to pan.';
  if (tool === 'place-junction') {
    helper = 'Tap the canvas to drop a new junction box. Wheel zoom still works; switch back to Select to drag the sheet.';
  } else if (tool === 'conduit-local') {
    helper = 'Tap any anchor ring on a junction box to start a local conduit bundle.';
  } else if (tool === 'conduit-span') {
    helper = spanAnchorA
      ? 'Tap an anchor on a second junction box to complete the span run.'
      : 'Tap an anchor on the starting junction box, then a second box.';
  } else if (tool === 'connect-wires') {
    helper = connectPendingWireId
      ? 'Tap a second wire to place the dashed link.'
      : 'Tap one wire, then another, to add a link between them.';
  }

  return (
    <div className="editor-screen editor-screen--deck">
      <header className="editor-screen__header">
        <button type="button" className="btn" onClick={onBack}>
          ← Library
        </button>
        <h2 className="editor-screen__title">{job.name || 'Untitled job'}</h2>
      </header>

      <Toolbar tool={tool} onToolChange={setTool} />

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
            <CanvasViewport viewBox="-800 -600 5200 4000">
              <DiagramSvg
                diagram={job.diagram}
                resolvedByWireId={resolvedByWireId}
                tool={tool}
                selectedBoxId={selectedBoxId}
                selectedWireId={selectedWireId}
                connectPendingWireId={connectPendingWireId}
                onSelectBox={(id) => {
                  setSelectedBoxId(id);
                  setSelectedWireId(null);
                  setSelectedLinkId(null);
                }}
                selectedLinkId={selectedLinkId}
                onWirePointerDown={handleWirePointerDown}
                onApplyDiagram={(mutator) => updateDiagram(mutator)}
                onPlacedJunction={() => setTool('select')}
                onAnchorPick={handleAnchorPick}
                worldRect={WORLD_BOUNDS}
              />
            </CanvasViewport>
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
            }}
            onSelectLink={(id) => {
              setSelectedLinkId(id);
              setSelectedWireId(null);
              setSelectedBoxId(null);
            }}
            onExport={exportActive}
            onBack={onBack}
          />
          <div className="editor-screen__inspector-sheet">
            <div className="inspector-sheet__grip" aria-hidden />
            <Inspector
              wire={selectedWire}
              onUpdateWire={(patch) => {
                if (!selectedWireId) return;
                updateDiagram((d) => updateWire(d, selectedWireId, patch));
              }}
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
      />
    </div>
  );
}
