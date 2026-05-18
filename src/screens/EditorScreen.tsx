import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { AnchorPosition, WireColor } from '../domain/types';
import { addLocalConduit, addSpanConduit } from '../domain/mutations';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { DiagramSvg } from '../canvas/DiagramSvg';
import { useJobStore, useResolvedWireMap } from '../store/job-store';
import type { EditorMainTool } from '../editor/editor-tools';
import { Toolbar } from '../editor/Toolbar';
import { ConduitDialog, type ConduitDialogState } from '../editor/ConduitDialog';

const WORLD_BOUNDS = {
  minX: -800,
  minY: -600,
  width: 5200,
  height: 4000,
} as const;

type EditorScreenProps = {
  onBack: () => void;
};

export function EditorScreen({ onBack }: EditorScreenProps): JSX.Element {
  const job = useJobStore((s) => s.activeJob);
  const updateDiagram = useJobStore((s) => s.updateDiagram);
  const resolvedByWireId = useResolvedWireMap();

  const [tool, setTool] = useState<EditorMainTool>('select');
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [conduitDialog, setConduitDialog] = useState<ConduitDialogState>(null);
  const [spanAnchorA, setSpanAnchorA] = useState<{ boxId: string; anchor: AnchorPosition } | null>(null);

  useEffect(() => {
    setSpanAnchorA(null);
    setConduitDialog(null);
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

  let helper = 'Scroll to zoom, drag empty canvas to pan.';
  if (tool === 'place-junction') {
    helper = 'Tap the canvas to drop a new junction box. Wheel zoom still works; switch back to Select to drag the sheet.';
  } else if (tool === 'conduit-local') {
    helper = 'Tap any anchor ring on a junction box to start a local conduit bundle.';
  } else if (tool === 'conduit-span') {
    helper = spanAnchorA
      ? 'Tap an anchor on a second junction box to complete the span run.'
      : 'Tap an anchor on the starting junction box, then a second box.';
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

      <div className="editor-screen__viewport">
        <CanvasViewport viewBox="-800 -600 5200 4000">
          <DiagramSvg
            diagram={job.diagram}
            resolvedByWireId={resolvedByWireId}
            tool={tool}
            selectedBoxId={selectedBoxId}
            onSelectBox={(id) => setSelectedBoxId(id)}
            onApplyDiagram={(mutator) => updateDiagram(mutator)}
            onPlacedJunction={() => setTool('select')}
            onAnchorPick={handleAnchorPick}
            worldRect={WORLD_BOUNDS}
          />
        </CanvasViewport>
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
