import { Spring, clamp } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { ICONS, drawIcon } from '../scene/GlyphLayer';
import { eraseShape, ink, rr, text, tw } from './draw';
import { Desktop, FrameInfo, Widget, hysteresis } from './types';
import { WindowManager } from './Windows';

interface App { id: string; name: string; color: string; icon: string; dark?: boolean }

const APPS: App[] = [
  { id: 'finder', name: 'Finder', color: '#1e88ff', icon: ICONS.folder },
  { id: 'photos', name: 'Photos', color: '#ff9f0a', icon: ICONS.photo },
  { id: 'notes', name: 'Notes', color: '#ffd60a', icon: ICONS.notes, dark: true },
  { id: 'music', name: 'Music', color: '#ff2d55', icon: ICONS.music },
  { id: 'terminal', name: 'Terminal', color: '#2c2c2e', icon: ICONS.terminal },
  { id: 'test', name: 'Test Panel', color: '#8e8e93', icon: ICONS.sliders },
  { id: 'trash', name: 'Trash', color: 'glass', icon: ICONS.trash },
];
const SEP_BEFORE = 6;

const S = 50;
const GAP = 8;
const PADX = 10;
const H = 68;
const MAG = 0.6;

/** Glass dock with macOS-style hover magnification and launch bounce. */
export class Dock implements Widget {
  readonly shape: GlassShape;
  readonly shapes: GlassShape[];
  private scales = APPS.map(() => new Spring(1, 0.16, 0.9));
  private bounceAt = APPS.map(() => -1);
  private icons: { cx: number; cy: number; size: number }[] = [];
  private hoverX = -1;
  private hovered = -1;
  private pressed = -1;
  private vw = 1;
  private vh = 1;
  private adapt = new Spring(0, 0.4, 1);
  private openIds = '';

  constructor(private readonly desk: Desktop, private readonly wm: WindowManager) {
    this.shape = new GlassShape({
      rest: material({
        radius: 24, cornerPower: 2.6, frost: 0.9, refraction: 22, bezel: 22, dispersion: 0.35,
        specular: 1, tint: [1, 1, 1, 0.12], saturation: 1.5, shadow: 0.3,
      }),
    });
    this.shapes = [this.shape];
  }

  private baseCenters(): number[] {
    const total = APPS.length * S + (APPS.length - 1) * GAP + 14;
    let x = this.vw / 2 - total / 2;
    return APPS.map((_, i) => {
      if (i === SEP_BEFORE) x += 14;
      const c = x + S / 2;
      x += S + GAP;
      return c;
    });
  }

  layout(vw: number, vh: number): void {
    this.vw = vw;
    this.vh = vh;
    this.shape.place(vw / 2, vh - 8 - H / 2, 400, H);
  }

  hover(x: number, y: number): void {
    const top = this.vh - 8 - H - 40;
    const nx = y > top && y < this.vh ? x : -1;
    if (nx !== this.hoverX) this.hoverX = nx;
  }

  hit(x: number, y: number): boolean {
    return this.shape.contains(x, y, 2) || this.iconAt(x, y) >= 0;
  }

  private iconAt(x: number, y: number): number {
    return this.icons.findIndex((ic) => Math.abs(x - ic.cx) <= ic.size / 2 + GAP / 2 && Math.abs(y - ic.cy) <= ic.size / 2 + 6);
  }

  down(x: number, y: number): void {
    this.pressed = this.iconAt(x, y);
    this.shape.touch(x, y, 0.16);
  }

  move(x: number, y: number): void {
    this.shape.moveTouch(x, y);
    this.hover(x, y);
  }

  up(x: number, y: number): void {
    this.shape.release();
    const i = this.iconAt(x, y);
    if (i >= 0 && i === this.pressed) {
      const app = APPS[i];
      this.bounceAt[i] = performance.now();
      if (app.id === 'test') {
        const ic = this.icons[i];
        this.desk.toggleTestPanel({ x: ic.cx, y: ic.cy });
      } else this.desk.openApp(app.id);
    }
    this.pressed = -1;
  }

  update(f: FrameInfo): void {
    const base = this.baseCenters();
    let moving = false;
    APPS.forEach((_, i) => {
      const d = this.hoverX < 0 ? Infinity : (this.hoverX - base[i]) / (S * 1.3);
      this.scales[i].target = 1 + MAG * Math.exp(-d * d);
      this.scales[i].step(f.dt);
      if (!this.scales[i].isSettled()) moving = true;
    });
    const sizes = this.scales.map((s) => S * s.value);
    const total = sizes.reduce((a, b) => a + b, 0) + (APPS.length - 1) * GAP + 14;
    this.shape.w.snap(total + PADX * 2);
    this.shape.x.snap(this.vw / 2);
    this.shape.y.snap(this.vh - 8 - H / 2);

    const bottom = this.shape.y.value + S / 2;
    let x = this.vw / 2 - total / 2;
    const now = performance.now();
    this.icons = sizes.map((size, i) => {
      if (i === SEP_BEFORE) x += 14;
      const t = this.bounceAt[i] < 0 ? 1 : (now - this.bounceAt[i]) / 900;
      let lift = 0;
      if (t < 1) {
        lift = Math.abs(Math.sin(t * Math.PI * 3)) * 20 * (1 - t);
        moving = true;
      } else this.bounceAt[i] = -1;
      const ic = { cx: x + size / 2, cy: bottom - size / 2 - lift, size };
      x += size + GAP;
      return ic;
    });

    let hov = -1;
    if (this.hoverX >= 0) hov = this.icons.findIndex((ic) => Math.abs(this.hoverX - ic.cx) <= ic.size / 2 + GAP / 2);
    const ids = this.wm.list().filter((w) => w.open).map((w) => w.id).join();
    const lum = f.lum.at(this.shape.cx - this.shape.hw, this.shape.cy - this.shape.hh, this.shape.hw * 2, this.shape.hh * 2);
    this.adapt.target = hysteresis(this.adapt.target, lum);
    this.adapt.step(f.dt);
    this.shape.rest.tint[3] = 0.12 + this.adapt.value * 0.16;
    if (moving || hov !== this.hovered || ids !== this.openIds || !this.adapt.isSettled()) f.flags.glyphs = true;
    this.hovered = hov;
    this.openIds = ids;
    this.shape.update(f.dt);
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    eraseShape(ctx, this.shape);
    const a = this.adapt.value;
    const open = new Set(this.openIds.split(','));
    this.icons.forEach((ic, i) => {
      const app = APPS[i];
      const s = ic.size;
      const x0 = ic.cx - s / 2;
      const y0 = ic.cy - s / 2;
      if (i === SEP_BEFORE) {
        ctx.fillStyle = ink(a, 0.25);
        ctx.fillRect(x0 - GAP / 2 - 7.5, this.shape.cy - 22, 1, 44);
      }
      if (app.color === 'glass') {
        ctx.fillStyle = ink(a, 0.12);
        rr(ctx, x0, y0, s, s, s * 0.23);
        ctx.fill();
        drawIcon(ctx, app.icon, ic.cx, ic.cy, s * 0.55, ink(a, 0.9), 0, 1.8);
      } else {
        ctx.fillStyle = app.color;
        rr(ctx, x0, y0, s, s, s * 0.23);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        rr(ctx, x0, y0, s, s * 0.5, s * 0.23);
        ctx.fill();
        drawIcon(ctx, app.icon, ic.cx, ic.cy, s * 0.56, app.dark ? '#3a2f00' : '#ffffff', 0, 2);
      }
      if (open.has(app.id)) {
        ctx.fillStyle = ink(a, 0.8);
        ctx.beginPath();
        ctx.arc(ic.cx, this.shape.cy + H / 2 - 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const h = this.hovered;
    if (h >= 0 && this.scales[h].value > 1.25) {
      const ic = this.icons[h];
      const label = APPS[h].name;
      const w = tw(label, 13, 500) + 20;
      const y = ic.cy - ic.size / 2 - 22;
      ctx.fillStyle = 'rgba(40,40,44,0.82)';
      rr(ctx, clamp(ic.cx - w / 2, 4, this.vw - w - 4), y - 12, w, 24, 8);
      ctx.fill();
      text(ctx, label, clamp(ic.cx, w / 2 + 4, this.vw - w / 2 - 4), y, 13, '#fff', 500, 'center');
      ctx.textAlign = 'left';
    }
  }
}
