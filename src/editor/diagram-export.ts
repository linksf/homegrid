import type { Bounds } from '../editor/diagram-bounds';

const EXPORT_STRIP_SELECTORS = [
  '.selection-marquee',
  '.path-edit-layer',
  '.path-anchor-edit-layer',
  '.diagram-place-overlay',
  '.room-place-preview',
  '.wire-hit',
  '.wire-link-hit',
  '.conduit-hit',
  '.conduit-run-hit',
  '.cable-footprint',
  '.wire-endpoint-hit',
  '.canvas-pan-overlay',
].join(',');

const INLINE_STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'filter',
  'visibility',
  'display',
] as const;

/** Canvas sheet color — matches `--homegrid-canvas` in app.css. */
export const DIAGRAM_EXPORT_BG = '#6ba8dc';

export type DiagramExportSvg = {
  svg: SVGSVGElement;
  bounds: Bounds;
};

function stripExportChrome(root: ParentNode): void {
  root.querySelectorAll(EXPORT_STRIP_SELECTORS).forEach((el) => el.remove());
  root.querySelectorAll('[data-export-hide]').forEach((el) => el.remove());
  root.querySelectorAll('.wire-stroke--selected, .cable-bundle--selected, .conduit-run--selected').forEach((el) => {
    el.classList.remove('wire-stroke--selected', 'cable-bundle--selected', 'conduit-run--selected');
  });
}

function inlineComputedStyles(source: Element, target: Element): void {
  if (!(source instanceof SVGElement) || !(target instanceof SVGElement)) return;
  const cs = getComputedStyle(source);
  const parts: string[] = [];
  for (const prop of INLINE_STYLE_PROPS) {
    const val = cs.getPropertyValue(prop);
    if (val && val !== 'none' && val !== 'normal') {
      parts.push(`${prop}:${val}`);
    }
  }
  if (parts.length > 0) {
    const existing = target.getAttribute('style') ?? '';
    target.setAttribute('style', existing ? `${existing};${parts.join(';')}` : parts.join(';'));
  }

  const srcKids = [...source.children];
  const tgtKids = [...target.children];
  for (let i = 0; i < srcKids.length; i++) {
    const s = srcKids[i];
    const t = tgtKids[i];
    if (s && t) inlineComputedStyles(s, t);
  }
}

function measureCloneBounds(clone: SVGGElement, padding: number): Bounds {
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('width', '1');
  host.setAttribute('height', '1');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '-10000px';
  host.style.visibility = 'hidden';
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const bb = clone.getBBox();
    return {
      x: bb.x - padding,
      y: bb.y - padding,
      width: bb.width + 2 * padding,
      height: bb.height + 2 * padding,
    };
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Build a standalone SVG from the live diagram canvas, stripping editor chrome and
 * inlining computed styles so the export renders without the app stylesheet.
 */
export function buildDiagramExportSvg(sourceSvg: SVGSVGElement, padding = 48): DiagramExportSvg | null {
  const diagramRoot = sourceSvg.querySelector('g.diagram-svg');
  if (!diagramRoot) return null;

  const clone = diagramRoot.cloneNode(true) as SVGGElement;
  stripExportChrome(clone);
  inlineComputedStyles(diagramRoot, clone);

  const bounds = measureCloneBounds(clone.cloneNode(true) as SVGGElement, padding);

  const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  exportSvg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  exportSvg.setAttribute('width', String(Math.ceil(bounds.width)));
  exportSvg.setAttribute('height', String(Math.ceil(bounds.height)));

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', String(bounds.x));
  bg.setAttribute('y', String(bounds.y));
  bg.setAttribute('width', String(bounds.width));
  bg.setAttribute('height', String(bounds.height));
  bg.setAttribute('fill', DIAGRAM_EXPORT_BG);
  exportSvg.appendChild(bg);
  exportSvg.appendChild(clone);

  return { svg: exportSvg, bounds };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportDiagramSvgFile(sourceSvg: SVGSVGElement, filename: string): boolean {
  const built = buildDiagramExportSvg(sourceSvg);
  if (!built) return false;
  const xml = new XMLSerializer().serializeToString(built.svg);
  downloadBlob(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), filename);
  return true;
}

export function exportDiagramPngFile(
  sourceSvg: SVGSVGElement,
  filename: string,
  scale = 2,
): Promise<boolean> {
  const built = buildDiagramExportSvg(sourceSvg);
  if (!built) return Promise.resolve(false);

  const { svg, bounds } = built;
  const xml = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(bounds.width * scale);
        canvas.height = Math.ceil(bounds.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.fillStyle = DIAGRAM_EXPORT_BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((png) => {
          if (png) downloadBlob(png, filename);
          resolve(Boolean(png));
        }, 'image/png');
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}

export function diagramExportFilename(jobName: string, ext: 'svg' | 'png'): string {
  const base = jobName.trim().replace(/\s+/g, '-').replace(/[^\w.-]+/g, '') || 'diagram';
  return `${base}.${ext}`;
}
