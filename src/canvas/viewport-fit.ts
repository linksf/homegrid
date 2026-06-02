export type FitBounds = { x: number; y: number; width: number; height: number };
export type ViewBoxRect = { minX: number; minY: number; width: number; height: number };
export type FitView = { tx: number; ty: number; scale: number };

export type FitOptions = {
  /** Fraction of the smaller viewBox dimension reserved as margin on each side. */
  paddingFrac?: number;
  minScale?: number;
  maxScale?: number;
};

const EPSILON = 1e-6;

/**
 * Compute a {tx, ty, scale} view transform that frames `content` within `viewBox`
 * (root coordinates), centered, with padding, clamped to the allowed scale range.
 *
 * World→root mapping is `root = translate + world * scale`; this is the inverse fit.
 */
export function fitTransform(content: FitBounds, viewBox: ViewBoxRect, opts: FitOptions = {}): FitView {
  const paddingFrac = opts.paddingFrac ?? 0.08;
  const minScale = opts.minScale ?? 0.25;
  const maxScale = opts.maxScale ?? 16;

  const pad = paddingFrac * Math.min(viewBox.width, viewBox.height);
  const availW = Math.max(viewBox.width - 2 * pad, EPSILON);
  const availH = Math.max(viewBox.height - 2 * pad, EPSILON);

  const contentW = Math.max(content.width, EPSILON);
  const contentH = Math.max(content.height, EPSILON);

  const rawScale = Math.min(availW / contentW, availH / contentH);
  const scale = Math.min(maxScale, Math.max(minScale, rawScale));

  const contentCx = content.x + content.width / 2;
  const contentCy = content.y + content.height / 2;
  const viewCx = viewBox.minX + viewBox.width / 2;
  const viewCy = viewBox.minY + viewBox.height / 2;

  return {
    scale,
    tx: viewCx - contentCx * scale,
    ty: viewCy - contentCy * scale,
  };
}
