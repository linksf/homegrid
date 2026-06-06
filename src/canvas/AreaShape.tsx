import type { JSX } from 'react';
import type { Area } from '../domain/types';

type AreaShapeProps = {
  area: Area;
  selected?: boolean;
  onSelect?: () => void;
};

export function AreaShape({ area, selected, onSelect }: AreaShapeProps): JSX.Element {
  return (
    <g className={['area-shape', selected ? 'area-shape--selected' : ''].filter(Boolean).join(' ')}>
      <rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        className="area-shape__fill"
        onPointerDown={(e) => {
          if (!onSelect) return;
          e.stopPropagation();
          onSelect();
        }}
      />
      {area.label.trim() ? (
        <text x={area.x + 8} y={area.y + 20} className="area-shape__label">
          {area.label}
        </text>
      ) : null}
    </g>
  );
}
