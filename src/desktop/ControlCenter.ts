import { Spring, clamp } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { ICONS, drawIcon } from '../scene/GlyphLayer';
import { eraseShape, ink, rr, text } from './draw';
import { Desktop, FrameInfo, Widget, hysteresis } from './types';

interface Rect { x: number; y: number; w: number; h: number }
interface Toggle { id: string; label: string; icon: string; get: () => boolean; set: (v: boolean) => void; sub?: () => string }

const W = 324;
const P = 12;
const KW = 34;
const KH = 22;

/** Opaque white knob at rest that turns into a clear magnifying lens while held (iOS 26 sliders). */
function knob(): GlassShape {
  const s = new GlassShape({
    layer: 1,
    w: KW,
    h: KH,
    rest: material({
      radius: 999, frost: 0, refraction: 2, bezel: 8, dispersion: 0, specular: 0.45,
      tint: [1, 1, 1, 1], saturation: 1, shadow: 0.24,
    }),
    lifted: material({
      radius: 999, frost: 0, refraction: 14, bezel: 15, dispersion: 0.45, specular: 1.15, magnify: 1.35,
      tint: [1, 1, 1, 0.03], saturation: 1.15, shadow: 0.28,
    }),
  });
  s.active.configure(0.32, 0.58);
  s.activeScaleX = 1.7;
  s.activeScaleY = 1.65;
  s.visible = false;
  return s;
}

export class ControlCenter implements Widget {
  readonly shape: GlassShape;
  readonly knobs = [knob(), knob()];
  readonly shapes: GlassShape[];
  open = false;
  private rect: Rect = { x: 0, y: 0, w: W, h: 386 };
  private drag = -1;
  private pressedToggle = -1;
  private toggles: Toggle[];
  private tiles: Rect[] = [];
  private lastKey = '';
  private sliderVals: Spring[];
  private adapt = new Spring(0, 0.4, 1);

  constructor(desk: Desktop, private readonly anchor: () => { x: number; y: number }) {
    this.shape = new GlassShape({
      rest: material({
        radius: 26, cornerPower: 2.6, merge: 14, frost: 1, refraction: 24, bezel: 24, dispersion: 0.35,
        specular: 0.95, tint: [0.1, 0.1, 0.12, 0.42], saturation: 1.6, shadow: 0.32,
      }),
      posResponse: 0.42,
      posDamping: 0.74,
      sizeResponse: 0.42,
      sizeDamping: 0.72,
    });
    this.shape.visible = false;
    this.shapes = [this.shape];
    const ui = desk.ui;
    const s = desk.settings;
    this.toggles = [
      { id: 'wifi', label: 'Wi-Fi', icon: ICONS.wifi, get: () => ui.wifi, set: (v) => (ui.wifi = v), sub: () => (ui.wifi ? 'Connected' : 'Off') },
      { id: 'bt', label: 'Bluetooth', icon: ICONS.bluetooth, get: () => ui.bluetooth, set: (v) => (ui.bluetooth = v), sub: () => (ui.bluetooth ? 'On' : 'Off') },
      { id: 'hotspot', label: 'Hotspot', icon: ICONS.hotspot, get: () => ui.hotspot, set: (v) => (ui.hotspot = v), sub: () => (ui.hotspot ? 'On' : 'Off') },
      { id: 'dark', label: 'Dark Mode', icon: ICONS.moon, get: () => ui.dark, set: (v) => (ui.dark = v) },
      { id: 'lens', label: 'Liquid Lens', icon: ICONS.lens, get: () => ui.lens, set: (v) => (ui.lens = v) },
      { id: 'follow', label: 'Follow Light', icon: ICONS.cursor, get: () => s.followPointer, set: (v) => (s.followPointer = v) },
      { id: 'fps', label: 'Show FPS', icon: ICONS.display, get: () => ui.showFps, set: (v) => (ui.showFps = v) },
    ];
    this.sliderVals = [new Spring((ui.brightness - 0.3) / 0.7, 0.15, 0.9), new Spring(ui.volume, 0.15, 0.9)];
  }

  toggle(force?: boolean): void {
    const next = force ?? !this.open;
    if (next === this.open) return;
    this.open = next;
    if (next) {
      const a = this.anchor();
      if (!this.shape.visible) this.shape.place(a.x, a.y, 32, 24);
      this.shape.visible = true;
    }
  }

  layout(vw: number): void {
    this.rect = { x: vw - 8 - W, y: 34, w: W, h: 386 };
    const { x, y } = this.rect;
    const half = (W - P * 3) / 2;
    this.tiles = [
      { x: x + P, y: y + P, w: half, h: 136 }, // 0 connectivity (3 toggles)
      { x: x + P * 2 + half, y: y + P, w: half, h: 62 }, // 1 dark
      { x: x + P * 2 + half, y: y + P + 74, w: half, h: 62 }, // 2 lens
      { x: x + P, y: y + P + 148, w: half, h: 62 }, // 3 follow
      { x: x + P * 2 + half, y: y + P + 148, w: half, h: 62 }, // 4 fps
      { x: x + P, y: y + P + 222, w: W - P * 2, h: 64 }, // 5 brightness
      { x: x + P, y: y + P + 298, w: W - P * 2, h: 64 }, // 6 volume
    ];
  }

  /** Circle button centre for toggle i. */
  private circle(i: number): { x: number; y: number } {
    if (i < 3) return { x: this.tiles[0].x + 26, y: this.tiles[0].y + 26 + i * 42 };
    const t = this.tiles[i - 2];
    return { x: t.x + 28, y: t.y + t.h / 2 };
  }

  private track(i: number): Rect {
    const t = this.tiles[5 + i];
    return { x: t.x + 16, y: t.y + 44, w: t.w - 32, h: 6 };
  }

  hit(x: number, y: number): boolean {
    return this.open && this.shape.contains(x, y);
  }

  down(x: number, y: number): void {
    this.shape.touch(x, y, 0.12);
    for (let i = 0; i < 2; i++) {
      const t = this.tiles[5 + i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        this.drag = i;
        this.knobs[i].active.target = 1;
        this.setSlider(i, x);
        return;
      }
    }
    for (let i = 0; i < this.toggles.length; i++) {
      const c = this.circle(i);
      const tile = i < 3 ? null : this.tiles[i - 2];
      const inTile = tile && x >= tile.x && x <= tile.x + tile.w && y >= tile.y && y <= tile.y + tile.h;
      if (Math.hypot(x - c.x, y - c.y) < 18 || inTile || (i < 3 && Math.abs(y - c.y) < 20 && x > this.tiles[0].x && x < this.tiles[0].x + this.tiles[0].w)) {
        this.pressedToggle = i;
        return;
      }
    }
  }

  private setSlider(i: number, x: number): void {
    const t = this.track(i);
    this.sliderVals[i].target = clamp((x - t.x) / t.w, 0, 1);
  }

  move(x: number, y: number): void {
    this.shape.moveTouch(x, y);
    if (this.drag >= 0) this.setSlider(this.drag, x);
  }

  up(): void {
    this.shape.release();
    if (this.drag >= 0) this.knobs[this.drag].active.target = 0;
    this.drag = -1;
    if (this.pressedToggle >= 0) {
      const t = this.toggles[this.pressedToggle];
      t.set(!t.get());
    }
    this.pressedToggle = -1;
  }

  update(f: FrameInfo): void {
    const s = this.shape;
    if (this.open) {
      const r = this.rect;
      s.x.target = r.x + r.w / 2;
      s.y.target = r.y + r.h / 2;
      s.w.target = r.w;
      s.h.target = r.h;
    } else {
      const a = this.anchor();
      s.x.target = a.x;
      s.y.target = a.y;
      s.w.target = 28;
      s.h.target = 20;
      if (s.visible && s.h.value < 30 && s.isSettled()) s.visible = false;
    }
    // Light glass + dark ink over bright backdrops, dark glass + white ink otherwise.
    const r0 = this.rect;
    const lum = f.lum.at(r0.x, r0.y, r0.w, r0.h);
    this.adapt.target = f.ui.dark ? 0 : hysteresis(this.adapt.target, lum);
    this.adapt.step(f.dt);
    const a0 = this.adapt.value;
    const tint = [0.08 + a0 * 0.88, 0.08 + a0 * 0.88, 0.1 + a0 * 0.87, 0.5 + a0 * 0.05];
    for (let i = 0; i < 4; i++) s.rest.tint[i] = tint[i];
    s.update(f.dt);

    const ui = f.ui;
    this.sliderVals.forEach((v) => v.step(f.dt));
    ui.brightness = 0.3 + 0.7 * this.sliderVals[0].value;
    ui.volume = this.sliderVals[1].value;
    const p = this.progress();
    this.knobs.forEach((k, i) => {
      const t = this.track(i);
      k.x.snap(t.x + clamp(this.sliderVals[i].value, 0, 1) * t.w);
      k.y.snap(t.y + t.h / 2);
      k.visible = this.open && p > 0.95;
      k.update(f.dt);
    });

    const key = `${p.toFixed(3)}|${this.adapt.value.toFixed(3)}|${this.toggles.map((t) => +t.get()).join('')}|${this.sliderVals.map((v) => v.value.toFixed(3)).join()}|${s.visible}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      f.flags.glyphs = true;
    }
  }

  private progress(): number {
    return clamp((this.shape.h.value - 40) / (this.rect.h - 40), 0, 1);
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    if (!this.shape.visible) return;
    eraseShape(ctx, this.shape);
    const p = this.progress();
    const alpha = this.open ? clamp((p - 0.65) / 0.35, 0, 1) : clamp((p - 0.8) / 0.2, 0, 1);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const a = this.adapt.value;
    const tile = a > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)';
    this.tiles.forEach((t) => {
      ctx.fillStyle = tile;
      rr(ctx, t.x, t.y, t.w, t.h, 18);
      ctx.fill();
    });
    this.toggles.forEach((t, i) => {
      const c = this.circle(i);
      const on = t.get();
      ctx.fillStyle = on ? '#0a84ff' : a > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 15, 0, Math.PI * 2);
      ctx.fill();
      drawIcon(ctx, t.icon, c.x, c.y, 17, on ? '#fff' : ink(a, 0.95), 0, 2);
      text(ctx, t.label, c.x + 24, c.y - (t.sub ? 7 : 0), 13, ink(a, 0.95), 600);
      if (t.sub) text(ctx, t.sub(), c.x + 24, c.y + 9, 11, ink(a, 0.6), 500);
    });
    ['Display', 'Sound'].forEach((label, i) => {
      const tl = this.tiles[5 + i];
      text(ctx, label, tl.x + 16, tl.y + 20, 13, ink(a, 0.95), 600);
      const tr = this.track(i);
      const v = clamp(this.sliderVals[i].value, 0, 1);
      text(ctx, `${Math.round(v * 100)}%`, tl.x + tl.w - 16, tl.y + 20, 12, ink(a, 0.6), 500, 'right');
      ctx.textAlign = 'left';
      ctx.fillStyle = ink(a, 0.2);
      rr(ctx, tr.x, tr.y, tr.w, tr.h, 3);
      ctx.fill();
      ctx.fillStyle = a > 0.5 ? '#0a84ff' : '#ffffff';
      rr(ctx, tr.x, tr.y, Math.max(tr.h, tr.w * v), tr.h, 3);
      ctx.fill();
      drawIcon(ctx, i === 0 ? ICONS.sun : ICONS.speaker, tl.x + tl.w - 60, tl.y + 20, 14, ink(a, 0.6), 0, 1.8);
    });
    ctx.restore();
  }
}
