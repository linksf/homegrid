import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { addJunctionBox } from '../domain/mutations';
import type { Diagram } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { JunctionBoxShape } from './JunctionBoxShape';
import { useDiagramViewport } from './CanvasViewport';

export type DiagramSvgProps = {
  diagram: Diagram;
  tool: EditorMainTool;
  selectedBoxId: string | null;
  onSelectBox: (id: string | null) => void;
  onApplyDiagram: (mutator: (diagram: Diagram) => Diagram) => void;
  onPlacedJunction?: () => void;
  worldRect: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  };
};

export function DiagramSvg({
  diagram,
  tool,
  selectedBoxId,
  onSelectBox,
  onApplyDiagram,
  onPlacedJunction,
  worldRect,
}: DiagramSvgProps): JSX.Element {
  const vp = useDiagramViewport();

  const { minX, minY, width, height } = worldRect;

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
      {diagram.junctionBoxes.map((box) => (
        <JunctionBoxShape
          key={box.id}
          box={box}
          tool={tool}
          selected={selectedBoxId === box.id}
          anchorsInteractive={false}
          onSelect={() => onSelectBox(box.id)}
          onApplyDiagram={onApplyDiagram}
        />
      ))}

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
