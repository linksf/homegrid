import type { JSX } from 'react';
import { HUB_SLOTS, hubSlotWorldPoint, occupiedHubSlots } from '../domain/hub-geometry';
import type { Diagram, JunctionBox } from '../domain/types';

type HubSlotMarkersProps = {
  box: JunctionBox;
  diagram: Diagram;
};

export function HubSlotMarkers({ box, diagram }: HubSlotMarkersProps): JSX.Element {
  const occupied = occupiedHubSlots(diagram, box.id);

  return (
    <g className="hub-slots" aria-hidden>
      {HUB_SLOTS.map((slot) => {
        const pt = hubSlotWorldPoint(box, slot);
        const filled = occupied.has(slot);
        return (
          <circle
            key={slot}
            className={['hub-slot', filled ? 'hub-slot--filled' : ''].filter(Boolean).join(' ')}
            cx={pt.x}
            cy={pt.y}
            r={10}
            data-hub-slot={slot}
          />
        );
      })}
    </g>
  );
}
