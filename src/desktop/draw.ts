import { GlassShape } from '../glass/GlassShape';

export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif';

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

export function text(
  ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number,
  color: string, weight = 500, align: CanvasTextAlign = 'left',
): number {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

const mctx = document.createElement('canvas').getContext('2d')!;

/** Text width without needing a drawing context. */
export function tw(s: string, size: number, weight = 500): number {
  mctx.font = `${weight} ${size}px ${FONT}`;
  return mctx.measureText(s).width;
}

export function ellipsize(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

export function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const tokens = s.match(/\S+|\s+/g) ?? [];
  const lines: string[] = [];
  let line = '';
  for (const tk of tokens) {
    const next = line + tk;
    if (ctx.measureText(next).width > maxW && line.trim() !== '') {
      lines.push(line);
      line = tk.trim() === '' ? '' : tk;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Text colour on glass: a = 0 dark backdrop (white ink), a = 1 light backdrop (dark ink). */
export function ink(a: number, alpha = 1): string {
  const v = Math.round(255 - (255 - 29) * a);
  return `rgba(${v},${v},${v + Math.round(2 * a)},${alpha})`;
}

/** Remove whatever lower widgets drew in the glyph layer under this glass. */
export function eraseShape(ctx: CanvasRenderingContext2D, s: GlassShape): void {
  if (!s.visible || s.hw < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  rr(ctx, s.cx - s.hw - 1, s.cy - s.hh - 1, s.hw * 2 + 2, s.hh * 2 + 2, s.mat.radius + 1);
  ctx.fill();
  ctx.restore();
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ART_PALETTES = [
  ['#f4f1de', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'],
  ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  ['#0b132b', '#1c2541', '#3a506b', '#5bc0be', '#ffffff'],
  ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'],
  ['#fefae0', '#dda15e', '#bc6c25', '#606c38', '#283618'],
  ['#edf6f9', '#83c5be', '#006d77', '#ffddd2', '#e29578'],
];

/** Flat-colour generative "photo" so windows have detailed content to refract. */
export function art(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, r = 0): void {
  const rnd = mulberry32(seed * 7919 + 13);
  const pal = ART_PALETTES[Math.floor(rnd() * ART_PALETTES.length)];
  const pick = () => pal[Math.floor(rnd() * pal.length)];
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = pick();
  ctx.fillRect(x, y, w, h);
  const kind = seed % 5;
  if (kind === 0) {
    // horizon scene: sun, hills
    ctx.fillStyle = pick();
    ctx.beginPath();
    ctx.arc(x + w * (0.3 + rnd() * 0.4), y + h * 0.4, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = pick();
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      const base = y + h * (0.55 + i * 0.13);
      for (let k = 0; k <= 6; k++) ctx.lineTo(x + (k / 6) * w, base - rnd() * h * 0.15);
      ctx.lineTo(x + w, y + h);
      ctx.fill();
    }
  } else if (kind === 1) {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = pick();
      ctx.fillRect(x + (i / 6) * w, y, w / 6 + 1, h);
    }
    ctx.fillStyle = pick();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 2) {
    ctx.lineWidth = Math.max(2, w * 0.05);
    for (let i = 6; i > 0; i--) {
      ctx.strokeStyle = pick();
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, i * Math.min(w, h) * 0.075, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === 3) {
    const n = 4;
    const cw = w / n;
    const ch = h / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = pick();
        ctx.beginPath();
        const corner = Math.floor(rnd() * 4);
        const cx = x + i * cw + (corner % 2) * cw;
        const cy = y + j * ch + Math.floor(corner / 2) * ch;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + i * cw, y + j * ch, cw, ch);
        ctx.clip();
        ctx.beginPath();
        ctx.arc(cx, cy, cw, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
  } else {
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = pick();
      ctx.beginPath();
      ctx.moveTo(x + rnd() * w, y + rnd() * h);
      ctx.lineTo(x + rnd() * w, y + rnd() * h);
      ctx.lineTo(x + rnd() * w, y + rnd() * h);
      ctx.fill();
    }
  }
  ctx.restore();
}
