import { clamp } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { DEBUG_MODES, GlassSettings, defaultSettings } from '../glass/settings';
import { eraseShape } from './draw';
import { FrameInfo, UIState, Widget } from './types';
import { WALLPAPERS, Wallpaper } from './Wallpaper';

type NumKey = { [K in keyof GlassSettings]: GlassSettings[K] extends number ? K : never }[keyof GlassSettings];

const SLIDERS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'blur', label: 'Backdrop Blur', min: 0, max: 40, step: 0.5 },
  { key: 'frost', label: 'Frost', min: 0, max: 1.5, step: 0.01 },
  { key: 'refraction', label: 'Refraction', min: 0, max: 3, step: 0.01 },
  { key: 'bezel', label: 'Bezel Width', min: 0.2, max: 3, step: 0.01 },
  { key: 'dispersion', label: 'Dispersion', min: 0, max: 3, step: 0.01 },
  { key: 'specular', label: 'Specular', min: 0, max: 2.5, step: 0.01 },
  { key: 'rimWidth', label: 'Rim Light Width', min: 0.5, max: 6, step: 0.1 },
  { key: 'saturation', label: 'Vibrancy', min: 0, max: 2.5, step: 0.01 },
  { key: 'shadow', label: 'Shadow', min: 0, max: 2.5, step: 0.01 },
  { key: 'merge', label: 'Merge Radius', min: 0, max: 3, step: 0.01 },
  { key: 'lightAngle', label: 'Light Angle', min: -180, max: 180, step: 1 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

/** Parameter / test panel. DOM controls on top of a glass sheet that morphs out of its launcher. */
export class TestPanel implements Widget {
  readonly shape: GlassShape;
  readonly shapes: GlassShape[];
  open = false;
  private root: HTMLDivElement;
  private fps: HTMLSpanElement;
  private rect = { x: 0, y: 0, w: 300, h: 560 };
  private origin = { x: 0, y: 0 };
  private syncs: (() => void)[] = [];
  private lastFps = 0;

  constructor(overlay: HTMLElement, private readonly s: GlassSettings, private readonly ui: UIState, wallpaper: Wallpaper) {
    this.shape = new GlassShape({
      rest: material({
        radius: 26, cornerPower: 2.6, frost: 1, refraction: 24, bezel: 24, dispersion: 0.35,
        specular: 0.9, tint: [0.06, 0.06, 0.08, 0.55], saturation: 1.35, brightness: 0.9, shadow: 0.35,
      }),
      posResponse: 0.45,
      posDamping: 0.75,
      sizeResponse: 0.45,
      sizeDamping: 0.72,
    });
    this.shape.visible = false;
    this.shapes = [this.shape];

    const root = (this.root = el('div', 'panel', overlay));
    const head = el('div', 'panel-head', root);
    el('span', 'panel-title', head).textContent = 'Test Panel';
    this.fps = el('span', 'panel-fps', head);
    const close = el('button', 'panel-close', head);
    close.textContent = '×';
    close.addEventListener('click', () => this.toggle(false));

    el('div', 'section', root).textContent = 'WALLPAPER';
    const wp = el('div', 'chips', root);
    for (const w of WALLPAPERS) {
      const b = el('button', 'chip', wp);
      b.textContent = w.name;
      b.addEventListener('click', () => wallpaper.set(w.id));
    }
    const up = el('button', 'chip', wp);
    up.textContent = 'Upload Image';
    const file = el('input', '', wp);
    file.type = 'file';
    file.accept = 'image/*';
    file.style.display = 'none';
    up.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      if (file.files?.[0]) wallpaper.loadFile(file.files[0]);
      file.value = '';
    });

    el('div', 'section', root).textContent = 'GLASS';
    for (const d of SLIDERS) {
      const row = el('label', 'row', root);
      el('span', 'row-label', row).textContent = d.label;
      const val = el('span', 'row-val', row);
      const input = el('input', '', row);
      input.type = 'range';
      input.min = String(d.min);
      input.max = String(d.max);
      input.step = String(d.step);
      const sync = () => {
        input.value = String(this.s[d.key]);
        val.textContent = Number(this.s[d.key]).toFixed(d.step >= 1 ? 0 : 2);
      };
      input.addEventListener('input', () => {
        (this.s[d.key] as number) = Number(input.value);
        sync();
      });
      this.syncs.push(sync);
    }

    el('div', 'section', root).textContent = 'View';
    const check = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const row = el('label', 'row check', root);
      el('span', 'row-label', row).textContent = label;
      const cb = el('input', '', row);
      cb.type = 'checkbox';
      cb.addEventListener('change', () => set(cb.checked));
      this.syncs.push(() => (cb.checked = get()));
    };
    check('Light Follows Pointer', () => s.followPointer, (v) => (s.followPointer = v));
    check('Liquid Lens', () => ui.lens, (v) => (ui.lens = v));
    check('Dark Mode', () => ui.dark, (v) => (ui.dark = v));
    check('Show FPS in Menu Bar', () => ui.showFps, (v) => (ui.showFps = v));

    const dbg = el('label', 'row check', root);
    el('span', 'row-label', dbg).textContent = 'Debug View';
    const sel = el('select', '', dbg);
    DEBUG_MODES.forEach((m, i) => {
      const o = el('option', '', sel);
      o.value = String(i);
      o.textContent = m;
    });
    sel.addEventListener('change', () => (s.debug = Number(sel.value)));
    this.syncs.push(() => (sel.value = String(s.debug)));

    const reset = el('button', 'reset', root);
    reset.textContent = 'Reset to Defaults';
    reset.addEventListener('click', () => Object.assign(this.s, defaultSettings()));
    root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  toggle(force?: boolean, from?: { x: number; y: number }): void {
    const next = force ?? !this.open;
    if (from) this.origin = from;
    if (next && !this.shape.visible) {
      const o = this.origin;
      this.shape.place(o.x, o.y, 40, 40);
    }
    this.open = next;
    if (next) this.shape.visible = true;
  }

  layout(vw: number, vh: number): void {
    const w = Math.min(310, vw - 24);
    const h = Math.min(640, vh - 48 - 96);
    this.rect = { x: 12, y: 46, w, h };
    if (!this.origin.x) this.origin = { x: vw / 2, y: vh - 40 };
    Object.assign(this.root.style, {
      width: w + 'px',
      height: h + 'px',
      transform: `translate(${this.rect.x}px, ${this.rect.y}px)`,
    });
  }

  update(f: FrameInfo): void {
    const s = this.shape;
    const r = this.rect;
    if (this.open) {
      s.x.target = r.x + r.w / 2;
      s.y.target = r.y + r.h / 2;
      s.w.target = r.w;
      s.h.target = r.h;
    } else {
      s.x.target = this.origin.x;
      s.y.target = this.origin.y;
      s.w.target = s.h.target = 30;
      if (s.visible && s.h.value < 40 && s.isSettled()) s.visible = false;
    }
    s.update(f.dt);
    const p = clamp((s.h.value - 60) / (r.h - 60), 0, 1);
    const o = this.open ? clamp((p - 0.6) / 0.4, 0, 1) : clamp((p - 0.75) / 0.25, 0, 1);
    this.root.style.opacity = String(o);
    this.root.style.pointerEvents = this.open && o > 0.5 ? 'auto' : 'none';
    if (this.open) this.syncs.forEach((fn) => fn());
    if (f.now - this.lastFps > 300) {
      this.lastFps = f.now;
      this.fps.textContent = `${Math.round(this.ui.fps)} fps`;
    }
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    eraseShape(ctx, this.shape);
  }
}
