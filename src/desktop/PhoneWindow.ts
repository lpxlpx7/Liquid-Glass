import { Spring, clamp } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { ICONS, drawIcon } from '../scene/GlyphLayer';
import { art, rr, text } from './draw';
import { FrameInfo, hysteresis } from './types';

interface Rect { x: number; y: number; w: number; h: number }

const TABS = [
  { icon: ICONS.home, label: 'Home' },
  { icon: ICONS.search, label: 'Search' },
  { icon: ICONS.heart, label: 'Favorites' },
  { icon: ICONS.person, label: 'Profile' },
];
const BEZEL = 10;
const BAR_H = 62;
const CATEGORIES: [string, string][] = [
  ['Nature', '#34c759'], ['Cities', '#0a84ff'], ['Food', '#ff9f0a'], ['Art', '#bf5af2'],
  ['Travel', '#ff375f'], ['Music', '#5e5ce6'], ['Sports', '#30b0c7'], ['Design', '#ff6b3d'],
];
const SETTINGS = ['Account', 'Notifications', 'Appearance', 'Privacy', 'Storage', 'About'];

export type PointerResult = 'drag' | 'capture' | 'none';

/**
 * A phone-shaped window that hosts the iOS 26 style floating tab bar.
 * The selection indicator is layer-1 glass: press or drag it and it lifts into a
 * larger, clear, magnifying lens that stretches with velocity, then settles on
 * the nearest tab. Tab icons sit on the glass, so the lens magnifies them.
 */
export class PhoneWindow {
  readonly kind = 'phone';
  readonly title = 'Phone Demo';
  open = false;
  focused = false;
  placed = false;
  saved: Rect | null = null;
  readonly appear = new Spring(0, 0.32, 0.82);
  x = 0;
  y = 0;
  w = 360;
  h = 740;
  scroll = 0;
  scrollT = 0;
  maxScroll = 0;
  dark = false;

  readonly bar: GlassShape;
  readonly ind: GlassShape;
  readonly shapes: GlassShape[];

  private selected = 0;
  private indX = new Spring(0, 0.34, 0.68); // indicator centre, relative to the bar's left edge
  private pressed = false;
  private moved = false;
  private downX = 0;
  private pointerX = 0;
  private liftUntil = 0;
  private dragScroll: { y: number; s: number } | null = null;
  private adapt = new Spring(1, 0.4, 1);
  private lastKey = '';

  constructor() {
    this.bar = new GlassShape({
      rest: material({
        radius: 999, frost: 0.85, refraction: 22, bezel: 20, dispersion: 0.35, specular: 1,
        tint: [1, 1, 1, 0.1], saturation: 1.5, brightness: 1.04, shadow: 0.3,
      }),
    });
    this.ind = new GlassShape({
      layer: 1,
      rest: material({
        radius: 999, frost: 0, refraction: 6, bezel: 12, dispersion: 0.2, specular: 0.55,
        tint: [1, 1, 1, 0.16], saturation: 1.1, shadow: 0,
      }),
      lifted: material({
        radius: 999, frost: 0, refraction: 28, bezel: 22, dispersion: 0.6, specular: 1.15, magnify: 1.2,
        tint: [1, 1, 1, 0.02], saturation: 1.25, shadow: 0.25,
      }),
    });
    this.ind.activeScaleX = 1.14;
    this.ind.activeScaleY = 1.42;
    this.ind.stretch = 0.00026;
    this.shapes = [this.bar, this.ind];
  }

  // ---------- geometry ----------

  get screen(): Rect {
    return { x: this.x + BEZEL, y: this.y + BEZEL, w: this.w - BEZEL * 2, h: this.h - BEZEL * 2 };
  }

  get barRect(): Rect {
    const s = this.screen;
    return { x: s.x + 14, y: s.y + s.h - 16 - BAR_H, w: s.w - 28, h: BAR_H };
  }

  private get tabW(): number {
    return (this.barRect.w - 8) / TABS.length;
  }

  private tabLocal(i: number): number {
    return 4 + this.tabW * (i + 0.5);
  }

  private indexAt(x: number): number {
    return clamp(Math.floor((x - this.barRect.x - 4) / this.tabW), 0, TABS.length - 1);
  }

  defaultRect(vw: number, vh: number): Rect {
    const h = Math.max(420, Math.min(740, vh - 100));
    const w = Math.round(h * 0.48);
    return { w, h, x: Math.max(20, vw - 20 - 164 - 36 - w), y: 38 };
  }

  get scale(): number {
    return 0.9 + 0.1 * clamp(this.appear.value, 0, 1.2);
  }

  contains(px: number, py: number): boolean {
    return this.open && this.appear.target > 0 && px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }

  private tx(px: number): number {
    const c = this.x + this.w / 2;
    return c + (px - c) * this.scale;
  }

  private ty(py: number): number {
    const c = this.y + this.h / 2;
    return c + (py - c) * this.scale;
  }

  private withTransform(ctx: CanvasRenderingContext2D, fn: () => void): void {
    const k = this.scale;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();
    ctx.globalAlpha = clamp(this.appear.value, 0, 1);
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    fn();
    ctx.restore();
  }

  // ---------- input (called by the WindowManager) ----------

  pointerDown(x: number, y: number): PointerResult {
    const s = this.screen;
    const b = this.barRect;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      this.pressed = true;
      this.moved = false;
      this.downX = x;
      this.pointerX = x;
      this.bar.touch(x, y, 0.18);
      if (this.indexAt(x) === this.selected) this.ind.active.target = 1;
      return 'capture';
    }
    const inScreen = x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
    if (!inScreen || y < s.y + 44) return 'drag';
    this.dragScroll = { y, s: this.scrollT };
    return 'capture';
  }

  pointerMove(x: number, y: number): void {
    if (this.pressed) {
      this.pointerX = x;
      this.bar.moveTouch(x, y);
      if (Math.abs(x - this.downX) > 6) {
        this.moved = true;
        this.ind.active.target = 1;
      }
    } else if (this.dragScroll) {
      this.scrollT = clamp(this.dragScroll.s - (y - this.dragScroll.y), 0, this.maxScroll);
    }
  }

  pointerUp(x: number): void {
    if (this.pressed) {
      this.pressed = false;
      this.bar.release();
      const next = this.indexAt(this.moved ? this.barRect.x + this.indX.value : x);
      if (next !== this.selected) this.scroll = this.scrollT = 0;
      this.selected = next;
      this.ind.active.target = 0;
      if (!this.moved) this.liftUntil = performance.now() + 200;
    }
    this.dragScroll = null;
  }

  // ---------- frame ----------

  update(f: FrameInfo): void {
    this.dark = f.ui.dark;
    const before = this.appear.value;
    this.appear.step(f.dt);
    if (this.appear.target === 0 && this.appear.value < 0.02) {
      this.open = false;
      this.appear.snap(0);
    }
    if (before !== this.appear.value) f.flags.scene = true;
    const ds = this.scrollT - this.scroll;
    if (Math.abs(ds) > 0.1) {
      this.scroll += ds * (1 - Math.exp(-f.dt * 18));
      f.flags.scene = true;
    } else this.scroll = this.scrollT;

    // indicator position (local to the bar)
    if (this.pressed && this.moved) {
      const lo = this.tabLocal(0) - this.tabW * 0.25;
      const hi = this.tabLocal(TABS.length - 1) + this.tabW * 0.25;
      this.indX.target = clamp(this.pointerX - this.barRect.x, lo, hi);
    } else if (!this.pressed) {
      this.indX.target = this.tabLocal(this.selected);
      const travelling = Math.abs(this.indX.value - this.indX.target) > 10;
      this.ind.active.target = travelling || performance.now() < this.liftUntil ? 1 : 0;
    }
    this.indX.step(f.dt);

    const b = this.barRect;
    const k = this.scale;
    this.bar.place(this.tx(b.x + b.w / 2), this.ty(b.y + b.h / 2), b.w * k, b.h * k);
    this.ind.place(this.tx(b.x + this.indX.value), this.ty(b.y + b.h / 2), this.tabW * k, (BAR_H - 8) * k);
    this.ind.extVX = this.indX.velocity;
    const vis = this.open && this.focused && this.appear.value > 0.05;
    this.bar.visible = this.ind.visible = vis;

    const lum = f.lum.at(b.x, b.y, b.w, b.h);
    this.adapt.target = hysteresis(this.adapt.target, lum);
    this.adapt.step(f.dt);
    this.bar.rest.tint[3] = this.bar.lifted.tint[3] = 0.1 + this.adapt.value * 0.14;
    this.bar.update(f.dt);
    this.ind.update(f.dt);

    const d = new Date();
    const key = `${this.indX.value.toFixed(1)}|${this.adapt.value.toFixed(3)}|${this.selected}|${d.getMinutes()}|${this.focused}`;
    if (key !== this.lastKey || !this.ind.active.isSettled()) {
      this.lastKey = key;
      f.flags.glyphs = true;
      if (!this.focused) f.flags.scene = true;
    }
  }

  // ---------- drawing ----------

  drawBody(ctx: CanvasRenderingContext2D): void {
    if (!this.open) return;
    this.withTransform(ctx, () => {
      const s = this.screen;
      const dark = this.dark;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = this.focused ? 50 : 26;
      ctx.shadowOffsetY = this.focused ? 20 : 10;
      ctx.fillStyle = '#1c1c1e';
      rr(ctx, this.x, this.y, this.w, this.h, 54);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#3a3a3c';
      ctx.lineWidth = 2;
      rr(ctx, this.x + 1, this.y + 1, this.w - 2, this.h - 2, 53);
      ctx.stroke();

      ctx.save();
      rr(ctx, s.x, s.y, s.w, s.h, 44);
      ctx.clip();
      ctx.fillStyle = dark ? '#000000' : '#f2f2f7';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      this.drawContent(ctx, s);
      this.drawStatusBar(ctx, s);
      if (!this.focused) {
        const b = this.barRect;
        ctx.fillStyle = dark ? 'rgba(44,44,48,0.92)' : 'rgba(255,255,255,0.9)';
        rr(ctx, b.x, b.y, b.w, b.h, b.h / 2);
        ctx.fill();
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
        rr(ctx, b.x + this.indX.value - this.tabW / 2, b.y + 4, this.tabW, BAR_H - 8, (BAR_H - 8) / 2);
        ctx.fill();
        this.drawTabs(ctx, dark ? 0 : 1);
      }
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.75)';
      rr(ctx, s.x + s.w / 2 - 60, s.y + s.h - 8, 120, 5, 3);
      ctx.fill();
      ctx.restore();
    });
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    if (!this.open || !this.focused) return;
    this.withTransform(ctx, () => this.drawTabs(ctx, this.adapt.value));
  }

  private drawTabs(ctx: CanvasRenderingContext2D, a: number): void {
    const b = this.barRect;
    const cy = b.y + b.h / 2;
    const base = a > 0.5 ? [29, 29, 31] : [255, 255, 255];
    const blue = [10, 132, 255];
    TABS.forEach((t, i) => {
      const cx = b.x + this.tabLocal(i);
      const wgt = clamp(1 - Math.abs(this.indX.value - this.tabLocal(i)) / this.tabW, 0, 1);
      const c = base.map((v, k) => Math.round(v + (blue[k] - v) * wgt));
      const col = `rgba(${c[0]},${c[1]},${c[2]},0.95)`;
      drawIcon(ctx, t.icon, cx, cy - 7, 23, col, 0, 2.1);
      text(ctx, t.label, cx, cy + 18, 10, col, 600, 'center');
    });
    ctx.textAlign = 'left';
  }

  private drawStatusBar(ctx: CanvasRenderingContext2D, s: Rect): void {
    const c = this.dark ? '#ffffff' : '#000000';
    const d = new Date();
    const hr = d.getHours() % 12 || 12;
    text(ctx, `${hr}:${String(d.getMinutes()).padStart(2, '0')}`, s.x + 30, s.y + 25, 15, c, 600);
    ctx.fillStyle = '#000';
    rr(ctx, s.x + s.w / 2 - 46, s.y + 11, 92, 28, 14);
    ctx.fill();
    const rx = s.x + s.w - 30;
    ctx.fillStyle = c;
    for (let i = 0; i < 4; i++) ctx.fillRect(rx - 60 + i * 5, s.y + 29 - (i + 1) * 3, 3, (i + 1) * 3);
    drawIcon(ctx, ICONS.wifi, rx - 28, s.y + 25, 14, c, 0, 2.2);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    rr(ctx, rx - 16, s.y + 20, 22, 11, 3.5);
    ctx.stroke();
    rr(ctx, rx - 14, s.y + 22, 15, 7, 2);
    ctx.fill();
  }

  private drawContent(ctx: CanvasRenderingContext2D, s: Rect): void {
    const dark = this.dark;
    const fg = dark ? '#ffffff' : '#000000';
    const sub = dark ? '#98989d' : '#6e6e73';
    const card = dark ? '#1c1c1e' : '#ffffff';
    const px = s.x + 18;
    const cw = s.w - 36;
    let y = s.y + 56 - this.scroll;
    text(ctx, TABS[this.selected].label, px, y + 18, 32, fg, 800);
    y += 50;

    if (this.selected === 0) {
      art(ctx, px, y, cw, cw * 0.62, 301, 20);
      text(ctx, 'Featured', px + 16, y + cw * 0.62 - 22, 20, '#ffffff', 800);
      y += cw * 0.62 + 24;
      text(ctx, 'Picked for you', px, y, 20, fg, 700);
      y += 20;
      const gw = (cw - 12) / 2;
      for (let i = 0; i < 8; i++) {
        const gx = px + (i % 2) * (gw + 12);
        const gy = y + Math.floor(i / 2) * (gw + 46);
        art(ctx, gx, gy, gw, gw, 320 + i * 3, 14);
        text(ctx, `Collection ${i + 1}`, gx, gy + gw + 16, 13, fg, 600);
        text(ctx, `${12 + i * 3} items`, gx, gy + gw + 32, 11, sub, 500);
      }
      y += 4 * (gw + 46);
    } else if (this.selected === 1) {
      ctx.fillStyle = dark ? '#1c1c1e' : '#e3e3e8';
      rr(ctx, px, y, cw, 38, 12);
      ctx.fill();
      drawIcon(ctx, ICONS.search, px + 20, y + 19, 16, sub, 0, 2);
      text(ctx, 'Artists, songs, places', px + 36, y + 19, 15, sub, 500);
      y += 62;
      text(ctx, 'Browse categories', px, y, 20, fg, 700);
      y += 20;
      const gw = (cw - 12) / 2;
      CATEGORIES.forEach(([name, col], i) => {
        const gx = px + (i % 2) * (gw + 12);
        const gy = y + Math.floor(i / 2) * (gw * 0.62 + 12);
        ctx.fillStyle = col;
        rr(ctx, gx, gy, gw, gw * 0.62, 14);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.arc(gx + gw - 10, gy + gw * 0.62 - 6, gw * 0.3, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, name, gx + 14, gy + 22, 15, '#ffffff', 700);
      });
      y += 4 * (gw * 0.62 + 12);
    } else if (this.selected === 2) {
      const gw = (cw - 8) / 3;
      for (let i = 0; i < 24; i++) art(ctx, px + (i % 3) * (gw + 4), y + Math.floor(i / 3) * (gw + 4), gw, gw, 500 + i * 7, 6);
      y += 8 * (gw + 4);
    } else {
      ctx.fillStyle = '#5e5ce6';
      ctx.beginPath();
      ctx.arc(s.x + s.w / 2, y + 44, 44, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, 'LG', s.x + s.w / 2, y + 44, 30, '#ffffff', 700, 'center');
      text(ctx, 'Liquid Glass', s.x + s.w / 2, y + 112, 20, fg, 700, 'center');
      text(ctx, 'Demo account', s.x + s.w / 2, y + 134, 13, sub, 500, 'center');
      ctx.textAlign = 'left';
      y += 160;
      for (let g = 0; g < 2; g++) {
        const rows = SETTINGS.slice(g * 3, g * 3 + 3);
        ctx.fillStyle = card;
        rr(ctx, px, y, cw, rows.length * 46, 14);
        ctx.fill();
        rows.forEach((r, i) => {
          const ry = y + i * 46;
          if (i > 0) {
            ctx.fillStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
            ctx.fillRect(px + 16, ry, cw - 16, 1);
          }
          text(ctx, r, px + 16, ry + 23, 15, fg, 500);
          drawIcon(ctx, ICONS.forward, px + cw - 18, ry + 23, 14, sub, 0, 2);
        });
        y += rows.length * 46 + 24;
      }
    }
    // Content runs under the floating tab bar; leave room to scroll the last row above it.
    this.maxScroll = Math.max(0, y + this.scroll - (s.y + s.h) + BAR_H + 40);
  }
}
