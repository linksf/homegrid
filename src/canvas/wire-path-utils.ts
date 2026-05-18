import type { Diagram, Wire } from '../domain/types';

function offsetPolyline(points: { x: number; y: number }[], ox: number, oy: number): { x: number; y: number }[] {
  return points.map((pt) => ({ x: pt.x + ox, y: pt.y + oy }));
}

/** World-space polyline for a wire's rendered stroke (includes bundle offset). */
export function wireWorldPolyline(diagram: Diagram, wireId: string): { x: number; y: number }[] | null {
  const wire = diagram.wires.find((w) => w.id === wireId);
  if (!wire?.conduitId) return null;

  const conduit = diagram.conduits.find((c) => c.id === wire.conduitId);
  if (!conduit) return null;

  const layout = diagram.layout.conduitPaths[conduit.id]?.points;
  if (!layout || layout.length < 2) return null;

  const wires = conduit.wireIds
    .map((id) => diagram.wires.find((w) => w.id === id))
    .filter((w): w is Wire => Boolean(w));
  const idx = wires.findIndex((w) => w.id === wireId);
  if (idx < 0) return null;

  const [p0, p1] = [layout[0]!, layout[layout.length - 1]!];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const spacing = 5;
  const n = wires.length;
  const offset = (idx - (n - 1) / 2) * spacing;
  return offsetPolyline(layout, px * offset, py * offset);
}

export function polylineLength(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}
