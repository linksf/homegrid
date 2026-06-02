import { describe, expect, it } from 'vitest';
import { fitTransform } from '../viewport-fit';

const VB = { minX: -800, minY: -600, width: 5200, height: 4000 };
const viewCx = VB.minX + VB.width / 2;
const viewCy = VB.minY + VB.height / 2;

describe('fitTransform', () => {
  it('maps the content center to the viewBox center', () => {
    const content = { x: 0, y: 0, width: 1000, height: 1000 };
    const { tx, ty, scale } = fitTransform(content, VB);
    const cx = content.x + content.width / 2;
    const cy = content.y + content.height / 2;
    expect(tx + cx * scale).toBeCloseTo(viewCx);
    expect(ty + cy * scale).toBeCloseTo(viewCy);
  });

  it('scales to fit within the padded viewBox, limited by the tighter axis', () => {
    const content = { x: 0, y: 0, width: 1000, height: 1000 };
    const { scale } = fitTransform(content, VB, { paddingFrac: 0.08 });
    const pad = 0.08 * Math.min(VB.width, VB.height);
    const expected = Math.min((VB.width - 2 * pad) / 1000, (VB.height - 2 * pad) / 1000);
    expect(scale).toBeCloseTo(expected);
  });

  it('clamps to maxScale for tiny content', () => {
    const { scale } = fitTransform({ x: 10, y: 10, width: 1, height: 1 }, VB, { maxScale: 16 });
    expect(scale).toBe(16);
  });

  it('clamps to minScale for huge content', () => {
    const { scale } = fitTransform({ x: 0, y: 0, width: 1e6, height: 1e6 }, VB, { minScale: 0.25 });
    expect(scale).toBe(0.25);
  });

  it('handles a zero-size point without NaN and centers it', () => {
    const { tx, ty, scale } = fitTransform({ x: 100, y: 200, width: 0, height: 0 }, VB);
    expect(Number.isFinite(tx)).toBe(true);
    expect(Number.isFinite(ty)).toBe(true);
    expect(scale).toBe(16);
    expect(tx + 100 * scale).toBeCloseTo(viewCx);
    expect(ty + 200 * scale).toBeCloseTo(viewCy);
  });
});
