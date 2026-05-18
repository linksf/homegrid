import type { JSX } from 'react';
import type { Diagram } from '../domain/types';

type DiagramSvgPlaceholderProps = {
  diagram: Diagram;
};

/** Task 11 replaces plain rects with richer `JunctionBoxShape` interactions; this establishes layout first. */
export function DiagramSvg({ diagram }: DiagramSvgPlaceholderProps): JSX.Element {
  return (
    <g className="diagram-svg" aria-label="Wiring diagram">
      {diagram.junctionBoxes.map((box) =>
        box.type === 'breaker' ? (
          <g key={box.id}>
            <rect
              pointerEvents="none"
              className="junction-box-frame junction-box-frame--breaker"
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={6}
              ry={6}
            />
            <text
              pointerEvents="none"
              className="junction-box-frame__label junction-box-frame__label--breaker"
              x={box.x + box.width / 2}
              y={box.y + 18}
              textAnchor="middle"
            >
              {box.label?.trim() || 'Breaker panel'}
            </text>
          </g>
        ) : (
          <rect
            key={box.id}
            pointerEvents="none"
            className="junction-box-frame junction-box-frame--normal"
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={6}
            ry={6}
          />
        ),
      )}
    </g>
  );
}
