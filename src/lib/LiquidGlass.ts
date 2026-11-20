import { GlassShape } from '../glass/GlassShape';
import { LiquidGlassRenderer } from '../glass/LiquidGlassRenderer';
import { Material, material } from '../glass/Material';
import { GlassSettings, defaultSettings } from '../glass/settings';

/** Something the glass can refract. A string is treated as an image URL. */
export type BackgroundSource = string | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

/** Ready-made materials. Use them by name in `data-glass="..."` or `add(el, { preset })`. */
export const PRESETS = {
  /** Frosted glass for bars, cards and panels. */
  regular: material({
    radius: 24, frost: 0.9, refraction: 20, bezel: 20, dispersion: 0.3, specular: 1,
    tint: [1, 1, 1, 0.12], saturation: 1.6, shadow: 0.25,
  }),
  /** Clear glass: little blur, strong edge refraction. Good for buttons over photos. */
  clear: material({
    radius: 24, frost: 0.1, refraction: 26, bezel: 24, dispersion: 0.45, specular: 1.1,
    tint: [1, 1, 1, 0.04], saturation: 1.2, magnify: 1.02, shadow: 0.22,
  }),
  /** A magnifying droplet. Put it on layer 1 to refract other glass too. */
  lens: material({
    radius: 999, frost: 0, refraction: 34, bezel: 46, dispersion: 0.4, specular: 1.15,
    tint: [1, 1, 1, 0.02], saturation: 1.15, magnify: 1.12, shadow: 0.3,
  }),
  /** Dark frosted glass for light text. */
  dark: material({
    radius: 24, frost: 1, refraction: 20, bezel: 20, dispersion: 0.3, specular: 0.9,
    tint: [0.06, 0.06, 0.08, 0.45], saturation: 1.4, brightness: 0.95, shadow: 0.3,
  }),
  /** Blue-tinted glass, like a prominent button. */
  tinted: material({
    radius: 24, frost: 0.6, refraction: 18, bezel: 18, dispersion: 0.3, specular: 1,
    tint: [0.04, 0.52, 1, 0.45], saturation: 1.5, shadow: 0.25,
  }),
};
export type PresetName = keyof typeof PRESETS;

export interface GlassOptions {
  /** Base material (default `regular`). */
  preset?: PresetName;
  /** Overrides on top of the preset. */
  material?: Partial<Material>;
  /** 0 = refracts the background; 1 = refracts the background and all layer-0 glass. */
  layer?: 0 | 1;
  /** Press feedback: the glass swells, clears up and glows under the pointer. */
  interactive?: boolean;
  /** Smooth-union radius (px) with the previously added glass element. */
  merge?: number;
  /** Corner radius in px. Defaults to the element's CSS border-radius. */
  radius?: number;
  /** Use continuous ("squircle") corners instead of circular ones. */
  squircle?: boolean;
}

export interface MountOptions {
  /** What the glass refracts. It is drawn to cover the stage, like `background-size: cover`. */
  background: BackgroundSource;
  /** Global multipliers (blur, refraction, dispersion, ...). */
  settings?: Partial<GlassSettings>;
  /** CSS selector for elements that get glass automatically. Default `[data-glass]`. */
  selector?: string;
  /** Cap on devicePixelRatio, for performance. Default 2. */
  maxDpr?: number;
  /** Re-upload the background every frame (needed for canvases you keep drawing into). */
  liveBackground?: boolean;
  /** Called if a background image fails to load. */
  onError?: (message: string) => void;
}

interface Tracked {
  el: HTMLElement;
  shape: GlassShape;
  opts: GlassOptions;
  dispose: () => void;
}

const PX = (v: string, size: number): number => (v.endsWith('%') ? (parseFloat(v) / 100) * size : parseFloat(v) || 0);

/**
 * Liquid Glass for any web page.
 *
 *   const glass = LiquidGlass.mount(document.querySelector('.hero'), { background: 'photo.jpg' });
 *
 * A WebGL canvas is inserted as the first child of the stage, behind its content.
 * Every `[data-glass]` element inside the stage gets a piece of glass that follows
 * the element's position, size and border-radius, so layout stays in CSS.
 */
export class LiquidGlass {
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly settings: GlassSettings;
  /** Pointer position in stage coordinates; drives the light when followPointer is on. */
  readonly pointer = { x: 0, y: 0 };

  private renderer: LiquidGlassRenderer;
  private backdrop = document.createElement('canvas');
  private bctx = this.backdrop.getContext('2d')!;
  private overlay = document.createElement('canvas');
  private bg: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null = null;
  private items: Tracked[] = [];
  private dirty = true;
  private raf = 0;
  private last = performance.now();
  private w = 1;
  private h = 1;
  private dpr = 1;
  private ro: ResizeObserver;
  private opts: MountOptions;
  private onMove = (e: PointerEvent) => {
    const r = this.stage.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
  };

  /** Create an instance and give glass to every element matching `selector`. */
  static mount(stage: HTMLElement, opts: MountOptions): LiquidGlass {
    const g = new LiquidGlass(stage, opts);
    g.scan();
    return g;
  }

  constructor(stage: HTMLElement, opts: MountOptions) {
    this.stage = stage;
    this.opts = opts;
    this.settings = { ...defaultSettings(), ...opts.settings };
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      display: 'block', pointerEvents: 'none', zIndex: '0',
    });
    stage.prepend(this.canvas);
    this.renderer = new LiquidGlassRenderer(this.canvas, this.backdrop, this.overlay);
    this.setBackground(opts.background);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(stage);
    this.resize();
    const r = stage.getBoundingClientRect();
    this.pointer.x = r.width * 0.3;
    this.pointer.y = r.height * 0.2;
    stage.addEventListener('pointermove', this.onMove);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Pick up `[data-glass]` elements added since the last scan. */
  scan(selector = this.opts.selector ?? '[data-glass]'): void {
    this.stage.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (this.items.some((i) => i.el === el)) return;
      const d = el.dataset;
      const preset = (d.glass && d.glass in PRESETS ? d.glass : 'regular') as PresetName;
      this.add(el, {
        preset,
        layer: d.glassLayer === '1' ? 1 : 0,
        interactive: d.glassInteractive !== undefined,
        merge: d.glassMerge !== undefined ? Number(d.glassMerge) : undefined,
        radius: d.glassRadius !== undefined ? Number(d.glassRadius) : undefined,
        squircle: d.glassSquircle !== undefined,
      });
    });
  }

  /** Give an element glass. Returns the shape so you can tweak it further. */
  add(el: HTMLElement, opts: GlassOptions = {}): GlassShape {
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    if (cs.zIndex === 'auto') el.style.zIndex = '1';

    const rest = material({ ...PRESETS[opts.preset ?? 'regular'], ...opts.material });
    if (opts.merge !== undefined) rest.merge = opts.merge;
    if (opts.squircle) rest.cornerPower = 2.7;
    const lifted = material({
      ...rest,
      refraction: rest.refraction * 1.35,
      specular: rest.specular * 1.25,
      frost: rest.frost * 0.6,
      magnify: rest.magnify * 1.04,
    });
    const shape = new GlassShape({ rest, lifted, layer: opts.layer ?? 0 });

    let dispose = () => {};
    if (opts.interactive) {
      shape.activeScaleX = shape.activeScaleY = 1.06;
      const local = (e: PointerEvent): [number, number] => {
        const r = this.stage.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      const down = (e: PointerEvent) => {
        shape.active.target = 1;
        shape.touch(...local(e), 0.25);
      };
      const move = (e: PointerEvent) => shape.moveTouch(...local(e));
      const up = () => {
        shape.active.target = 0;
        shape.release();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      dispose = () => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        el.removeEventListener('pointerleave', up);
      };
    }
    this.items.push({ el, shape, opts, dispose });
    return shape;
  }

  remove(el: HTMLElement): void {
    const i = this.items.findIndex((t) => t.el === el);
    if (i < 0) return;
    this.items[i].dispose();
    this.items.splice(i, 1);
  }

  /** Swap what the glass refracts. */
  setBackground(src: BackgroundSource): void {
    if (typeof src === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.bg = img;
        this.dirty = true;
      };
      img.onerror = () => this.opts.onError?.(`Could not load background: ${src}`);
      img.src = src;
      return;
    }
    this.bg = src;
    if (src instanceof HTMLImageElement && !src.complete) src.addEventListener('load', () => (this.dirty = true), { once: true });
    if (src instanceof HTMLVideoElement) src.addEventListener('loadeddata', () => (this.dirty = true), { once: true });
    this.dirty = true;
  }

  /** Re-upload the background (call after drawing into a canvas background). */
  invalidate(): void {
    this.dirty = true;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.stage.removeEventListener('pointermove', this.onMove);
    this.items.forEach((t) => t.dispose());
    this.items = [];
    this.canvas.remove();
  }

  private resize(): void {
    const r = this.stage.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.dpr = Math.min(devicePixelRatio || 1, this.opts.maxDpr ?? 2);
    this.renderer.resize(this.w, this.h, this.dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.backdrop.width = Math.round(this.w * this.dpr);
    this.backdrop.height = Math.round(this.h * this.dpr);
    this.dirty = true;
  }

  private drawBackdrop(): void {
    const c = this.bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#808080';
    c.fillRect(0, 0, this.backdrop.width, this.backdrop.height);
    const bg = this.bg;
    if (bg) {
      const iw = bg instanceof HTMLVideoElement ? bg.videoWidth : bg instanceof HTMLImageElement ? bg.naturalWidth : bg.width;
      const ih = bg instanceof HTMLVideoElement ? bg.videoHeight : bg instanceof HTMLImageElement ? bg.naturalHeight : bg.height;
      if (iw > 0 && ih > 0) {
        const s = Math.max(this.backdrop.width / iw, this.backdrop.height / ih);
        c.drawImage(bg, (this.backdrop.width - iw * s) / 2, (this.backdrop.height - ih * s) / 2, iw * s, ih * s);
      }
    }
    this.renderer.uploadContent();
  }

  private frame = (now: number): void => {
    const dt = Math.min(1 / 30, (now - this.last) / 1000);
    this.last = now;
    const bg = this.bg;
    if (this.opts.liveBackground || (bg instanceof HTMLVideoElement && !bg.paused)) this.dirty = true;
    if (this.dirty) {
      this.dirty = false;
      this.drawBackdrop();
    }

    const sr = this.stage.getBoundingClientRect();
    for (const t of this.items) {
      const r = t.el.getBoundingClientRect();
      const s = t.shape;
      s.visible = r.width > 0 && r.height > 0 && t.el.isConnected && getComputedStyle(t.el).visibility !== 'hidden';
      const cs = getComputedStyle(t.el);
      const radius = t.opts.radius ?? PX(cs.borderTopLeftRadius, Math.min(r.width, r.height));
      s.rest.radius = s.lifted.radius = radius;
      s.place(r.left - sr.left + r.width / 2, r.top - sr.top + r.height / 2, r.width, r.height);
      s.update(dt);
    }
    this.renderer.render(this.items.map((t) => t.shape), this.settings, this.pointer);
    this.raf = requestAnimationFrame(this.frame);
  };
}
