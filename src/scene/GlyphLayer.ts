/**
 * Transparent canvas holding icons/labels that sit ON the glass (layer 0).
 * It is composited after layer-0 glass and before layer-1 glass, so a floating
 * lens magnifies and refracts these glyphs just like iOS does.
 */
export class GlyphLayer {
  readonly canvas = document.createElement('canvas');
  readonly ctx = this.canvas.getContext('2d')!;
  dirty = true;
  private dpr = 1;

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dirty = true;
  }

  begin(): CanvasRenderingContext2D {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return c;
  }
}

/** 24x24 stroke icons (SVG path data). */
export const ICONS = {
  plus: 'M12 5v14M5 12h14',
  search: 'M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0M16 16l4.5 4.5',
  heart: 'M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 7a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M8 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  sun: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  folder: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  photo: 'M4 6h16v12H4zM4 16l5-5 4 4 2-2 5 5M14 9.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0',
  notes: 'M7 4h10v16H7zM9.5 8h5M9.5 11.5h5M9.5 15h3',
  music: 'M9 18V6l10-2v12M4 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M14 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
  terminal: 'M4 5h16v14H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10.5 10.5v6M13.5 10.5v6',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M6 12.5a9 9 0 0 1 12 0M9.5 16a4 4 0 0 1 5 0M12 19.5h.01',
  bluetooth: 'M7 7l10 10-5 4V3l5 4L7 17',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  lens: 'M5 12a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M9 10a3.5 3.5 0 0 1 3-2',
  back: 'M14.5 6l-6 6 6 6',
  forward: 'M9.5 6l6 6-6 6',
  grid: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  share: 'M12 4v11M8 8l4-4 4 4M6 12v7h12v-7',
  compose: 'M5 19h4l10-10-4-4L5 15zM13 7l4 4',
  drop: 'M12 3c3.5 4.5 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.5 6-11z',
  speaker: 'M4 9.5h4l5-4v13l-5-4H4zM16.5 9a4 4 0 0 1 0 6',
  display: 'M4 5h16v11H4zM9 20h6M12 16v4',
  cursor: 'M6 4l12 7-5.5 1.5L10 18z',
  hotspot: 'M8.5 15.5a5 5 0 1 1 7 0M6 18a8.5 8.5 0 1 1 12 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
} as const;

const pathCache = new Map<string, Path2D>();

export function drawIcon(
  ctx: CanvasRenderingContext2D, d: string, cx: number, cy: number, size: number,
  color: string, rotation = 0, lineWidth = 2,
): void {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.restore();
}
