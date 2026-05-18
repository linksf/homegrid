import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import type { AnchorPosition } from '../domain/types';
import { addJunctionBox } from '../domain/mutations';
import type { Diagram, ResolvedWire } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { ConduitLayer } from './ConduitLayer';
import { JunctionBoxShape } from './JunctionBoxShape';
import { WireLinkLayer } from './WireLinkShape';
import { useDiagramViewport } from './CanvasViewport';

export type DiagramSvgProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  tool: EditorMainTool;
  selectedBoxId: string | null;
  selectedWireId: string | null;
  selectedLinkId: string | null;
  connectPendingWireId: string | null;
  onSelectBox: (id: string | null) => void;
  onWirePointerDown?: (wireId: string) => void;
  onApplyDiagram: (mutator: (diagram: Diagram) => Diagram) => void;
  onPlacedJunction?: () => void;
  onAnchorPick?: (payload: { boxId: string; anchor: AnchorPosition }) => void;
  worldRect: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
};

export function DiagramSvg({
  diagram,
  resolvedByWireId,
  tool,
  selectedBoxId,
  selectedWireId,
  selectedLinkId,
  connectPendingWireId,
  onSelectBox,
  onWirePointerDown,
  onApplyDiagram,
  onPlacedJunction,
  onAnchorPick,
  worldRect,
}: DiagramSvgProps): JSX.Element {
  const vp = useDiagramViewport();

  const { minX, minY, width, height } = worldRect;

  const anchorsInteractive = tool === 'conduit-local' || tool === 'conduit-span';

  function placeJunction(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0) return;

    const world = vp.clientPointToWorld(e.clientX, e.clientY);
    if (!world) return;

    e.stopPropagation();
    onApplyDiagram((d) => addJunctionBox(d, world.x, world.y));
    onPlacedJunction?.();
  }

  return (
    <g className="diagram-svg" aria-label="Wiring diagram">
      <ConduitLayer
        diagram={diagram}
        resolvedByWireId={resolvedByWireId}
        tool={tool}
        selectedWireId={selectedWireId}
        connectPendingWireId={connectPendingWireId}
        onWirePointerDown={onWirePointerDown}
      />

      {diagram.junctionBoxes.map((box) => (
        <JunctionBoxShape
          key={box.id}
          box={box}
          tool={tool}
          selected={selectedBoxId === box.id}
          anchorsInteractive={anchorsInteractive}
          onAnchorPointerDown={(anchor) => onAnchorPick?.({ boxId: box.id, anchor })}
          onSelect={() => onSelectBox(box.id)}
          onApplyDiagram={onApplyDiagram}
        />
      ))}

      <WireLinkLayer diagram={diagram} selectedLinkId={selectedLinkId} />

      {tool === 'place-junction' && (
        <rect
          className="diagram-place-overlay"
          x={minX}
          y={minY}
          width={width}
          height={height}
          onPointerDown={placeJunction}
        />
      )}
    </g>
  );
}
