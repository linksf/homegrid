import type { JSX } from 'react';
import { hubWorldPoint } from '../domain/hub-geometry';
import { LIGHT_BULB_RADIUS } from '../domain/device-node-geometry';
import type { Diagram } from '../domain/types';
import { conduitCenterPath } from '../domain/layout-offsets';
import { polylineMidpoint, wireWorldPolyline } from '../domain/wire-geometry';
import { ZoomLabel } from './ZoomLabel';

type DiagramLabelsLayerProps = {
  diagram: Diagram;
  showLabels: boolean;
};

/** All diagram text labels — rendered above junction boxes and wiring geometry. */
export function DiagramLabelsLayer({
  diagram,
  showLabels,
}: DiagramLabelsLayerProps): JSX.Element | null {
  if (!showLabels) return null;

  return (
    <g className="diagram-labels-layer" role="presentation" aria-label="Diagram labels">
      {diagram.junctionBoxes.map((box) => {
        const boxLabel = (box.label ?? '').trim();
        if (boxLabel.length === 0) return null;
        return (
          <ZoomLabel
            key={`box-${box.id}`}
            x={box.x + box.width / 2}
            y={box.y + (box.type === 'breaker' ? 22 : 20)}
            className={`diagram-label junction-box__label ${
              box.type === 'breaker' ? 'junction-box__label--breaker' : ''
            }`}
            dominantBaseline="hanging"
          >
            {boxLabel}
          </ZoomLabel>
        );
      })}

      {diagram.hubs.map((hub) => {
        const box = diagram.junctionBoxes.find((b) => b.id === hub.junctionBoxId);
        if (!box) return null;
        const trimmed = (hub.label ?? '').trim();
        if (trimmed.length === 0) return null;
        const pt = hubWorldPoint(box, hub);
        return (
          <ZoomLabel
            key={`hub-${hub.id}`}
            x={pt.x}
            y={pt.y}
            offsetScreenY={18}
            className="diagram-label hub-label"
          >
            {trimmed}
          </ZoomLabel>
        );
      })}

      {diagram.conduits.map((conduit) => {
        const wires = conduit.wireIds
          .map((id) => diagram.wires.find((w) => w.id === id))
          .filter((w): w is NonNullable<typeof w> => Boolean(w));
        const centerPath = conduitCenterPath(diagram, conduit.id);
        const conduitMid = centerPath ? polylineMidpoint(centerPath) : null;
        const conduitLabel = (conduit.label ?? '').trim();

        return (
          <g key={`conduit-labels-${conduit.id}`}>
            {wires.map((wire) => {
              const pts = wireWorldPolyline(diagram, wire.id);
              const mid = pts ? polylineMidpoint(pts) : null;
              const trimmed = (wire.label ?? '').trim();
              if (!mid || trimmed.length === 0) return null;
              return (
                <ZoomLabel
                  key={`wire-${wire.id}`}
                  x={mid.x}
                  y={mid.y}
                  className="diagram-label wire-label"
                >
                  {trimmed}
                </ZoomLabel>
              );
            })}
            {conduitMid && conduitLabel.length > 0 && (
              <ZoomLabel
                x={conduitMid.x}
                y={conduitMid.y}
                offsetScreenY={16}
                className="diagram-label conduit-label"
              >
                {conduitLabel}
              </ZoomLabel>
            )}
          </g>
        );
      })}

      {diagram.lightBulbs.map((bulb) => {
        const trimmed = (bulb.label ?? '').trim();
        if (trimmed.length === 0) return null;
        const r = LIGHT_BULB_RADIUS;
        return (
          <ZoomLabel
            key={`bulb-${bulb.id}`}
            x={bulb.x + r}
            y={bulb.y - 8}
            className="light-bulb__label"
            textAnchor="middle"
          >
            {trimmed}
          </ZoomLabel>
        );
      })}

      {diagram.switches.map((sw) => {
        const trimmed = (sw.label ?? '').trim();
        if (trimmed.length === 0) return null;
        return (
          <ZoomLabel
            key={`switch-${sw.id}`}
            x={sw.x + sw.width / 2}
            y={sw.y - 8}
            className="switch-device__label"
            textAnchor="middle"
          >
            {trimmed}
          </ZoomLabel>
        );
      })}
    </g>
  );
}
