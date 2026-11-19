import { Spring } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { ink, rr, text } from './draw';
import { FrameInfo, Widget, hysteresis } from './types';
import { WindowManager } from './Windows';

const SIZE = 164;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Card { shape: GlassShape; adapt: Spring; flat: boolean; draw: (ctx: CanvasRenderingContext2D, x: number, y: number, a: number) => void }

/**
 * Desktop widgets (clock, calendar). They live below the windows, so when a
 * window covers one it switches to a flat version drawn into the backdrop.
 */
export class DesktopWidgets implements Widget {
  readonly shapes: GlassShape[];
  private cards: Card[];
  private lastSec = -1;
  private dark = false;

  constructor(private readonly wm: WindowManager) {
    const mat = () =>
      material({
        radius: 34, cornerPower: 2.7, frost: 1, refraction: 26, bezel: 28, dispersion: 0.3,
        specular: 0.95, tint: [1, 1, 1, 0.12], saturation: 1.5, shadow: 0.25,
      });
    this.cards = [
      { shape: new GlassShape({ rest: mat() }), adapt: new Spring(0, 0.5, 1), flat: false, draw: (c, x, y, a) => this.clock(c, x, y, a) },
      { shape: new GlassShape({ rest: mat() }), adapt: new Spring(0, 0.5, 1), flat: false, draw: (c, x, y, a) => this.calendar(c, x, y, a) },
    ];
    this.shapes = this.cards.map((c) => c.shape);
  }

  layout(vw: number): void {
    const cx = vw - 20 - SIZE / 2;
    this.cards[0].shape.place(cx, 44 + SIZE / 2, SIZE, SIZE);
    this.cards[1].shape.place(cx, 44 + SIZE * 1.5 + 16, SIZE, SIZE);
  }

  update(f: FrameInfo): void {
    const rects = this.wm.openRects();
    const sec = new Date().getSeconds();
    const tick = sec !== this.lastSec;
    this.lastSec = sec;
    if (this.dark !== f.ui.dark) {
      this.dark = f.ui.dark;
      f.flags.scene = true;
    }
    for (const c of this.cards) {
      const s = c.shape;
      const x0 = s.cx - SIZE / 2;
      const y0 = s.cy - SIZE / 2;
      const flat = rects.some((r) => r.x < x0 + SIZE && r.x + r.w > x0 && r.y < y0 + SIZE && r.y + r.h > y0);
      if (flat !== c.flat) {
        c.flat = flat;
        f.flags.scene = true;
        f.flags.glyphs = true;
      }
      s.visible = !flat;
      const lum = f.lum.at(x0, y0, SIZE, SIZE);
      c.adapt.target = hysteresis(c.adapt.target, lum);
      c.adapt.step(f.dt);
      s.rest.tint[3] = 0.12 + c.adapt.value * 0.16;
      s.update(f.dt);
      if (tick) {
        if (flat) f.flags.scene = true;
        else f.flags.glyphs = true;
      }
      if (!c.adapt.isSettled()) f.flags.glyphs = true;
    }
  }

  drawScene(ctx: CanvasRenderingContext2D): void {
    for (const c of this.cards) {
      if (!c.flat) continue;
      const x = c.shape.cx - SIZE / 2;
      const y = c.shape.cy - SIZE / 2;
      ctx.fillStyle = this.dark ? 'rgba(40,40,44,0.92)' : 'rgba(255,255,255,0.9)';
      rr(ctx, x, y, SIZE, SIZE, 34);
      ctx.fill();
      c.draw(ctx, x, y, this.dark ? 0 : 1);
    }
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    for (const c of this.cards) {
      if (c.flat) continue;
      c.draw(ctx, c.shape.cx - SIZE / 2, c.shape.cy - SIZE / 2, c.adapt.value);
    }
  }

  private clock(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
    const cx = x + SIZE / 2;
    const cy = y + SIZE / 2;
    const R = SIZE / 2 - 16;
    const d = new Date();
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * Math.PI * 2;
      const big = i % 5 === 0;
      ctx.strokeStyle = ink(a, big ? 0.9 : 0.35);
      ctx.lineWidth = big ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(ang) * R, cy - Math.cos(ang) * R);
      ctx.lineTo(cx + Math.sin(ang) * (R - (big ? 7 : 4)), cy - Math.cos(ang) * (R - (big ? 7 : 4)));
      ctx.stroke();
    }
    ['12', '3', '6', '9'].forEach((n, i) => {
      const ang = (i / 4) * Math.PI * 2;
      text(ctx, n, cx + Math.sin(ang) * (R - 18), cy - Math.cos(ang) * (R - 18), 13, ink(a, 0.9), 700, 'center');
    });
    ctx.textAlign = 'left';
    const sec = d.getSeconds();
    const min = d.getMinutes() + sec / 60;
    const hr = (d.getHours() % 12) + min / 60;
    const hand = (ang: number, len: number, w: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - Math.sin(ang) * 8, cy + Math.cos(ang) * 8);
      ctx.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
      ctx.stroke();
    };
    hand((hr / 12) * Math.PI * 2, R * 0.5, 4, ink(a, 0.95));
    hand((min / 60) * Math.PI * 2, R * 0.78, 3, ink(a, 0.95));
    hand((sec / 60) * Math.PI * 2, R * 0.86, 1.4, '#ff9f0a');
    ctx.fillStyle = '#ff9f0a';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private calendar(ctx: CanvasRenderingContext2D, x: number, y: number, a: number): void {
    const d = new Date();
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const today = d.getDate();
    text(ctx, MONTHS[mo], x + 16, y + 20, 13, '#ff453a', 700);
    const first = new Date(yr, mo, 1).getDay();
    const days = new Date(yr, mo + 1, 0).getDate();
    const cw = (SIZE - 24) / 7;
    'SMTWTFS'.split('').forEach((w, i) => text(ctx, w, x + 12 + cw * (i + 0.5), y + 40, 9, ink(a, 0.55), 600, 'center'));
    for (let day = 1; day <= days; day++) {
      const idx = first + day - 1;
      const col = idx % 7;
      const row = Math.floor(idx / 7);
      const tx = x + 12 + cw * (col + 0.5);
      const ty = y + 58 + row * 17;
      if (day === today) {
        ctx.fillStyle = '#ff453a';
        ctx.beginPath();
        ctx.arc(tx, ty, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      text(ctx, String(day), tx, ty, 10, day === today ? '#fff' : ink(a, col === 0 || col === 6 ? 0.55 : 0.9), 600, 'center');
    }
    ctx.textAlign = 'left';
  }
}
