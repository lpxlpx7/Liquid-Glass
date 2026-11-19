import { Spring, clamp } from '../core/Spring';
import { Material, material, mixMaterial } from './Material';

export interface ShapeOptions {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rest: Material;
  /** Material while pressed / lifted. Defaults to `rest`. */
  lifted?: Material;
  /** 0 = sits on content, 1 = floats above layer 0 and refracts it. */
  layer?: 0 | 1;
  posResponse?: number;
  posDamping?: number;
  sizeResponse?: number;
  sizeDamping?: number;
}

/**
 * One animated piece of glass. Geometry and material are spring driven;
 * velocity produces squash & stretch, `active` morphs rest -> lifted material.
 */
export class GlassShape {
  readonly x: Spring;
  readonly y: Spring;
  readonly w: Spring;
  readonly h: Spring;
  readonly active = new Spring(0, 0.38, 0.62);
  readonly scale = new Spring(1, 0.32, 0.5);
  readonly glow = new Spring(0, 0.25, 1);

  rest: Material;
  lifted: Material;
  layer: 0 | 1;
  visible = true;
  /** Size multiplier when fully active (overshoot of `active` makes it wobble). */
  activeScaleX = 1;
  activeScaleY = 1;
  /** Squash & stretch per px/s of velocity. */
  stretch = 0.00016;
  maxStretch = 0.32;

  // Computed each update (CSS px)
  cx = 0;
  cy = 0;
  hw = 0;
  hh = 0;
  mat: Material = material({});
  glowX = 0;
  glowY = 0;
  glowRadius = 0;

  private glowDX = 0;
  private glowDY = 0;
  private sx = 1;
  private sy = 1;

  constructor(o: ShapeOptions) {
    this.x = new Spring(o.x ?? 0, o.posResponse ?? 0.35, o.posDamping ?? 0.8);
    this.y = new Spring(o.y ?? 0, o.posResponse ?? 0.35, o.posDamping ?? 0.8);
    this.w = new Spring(o.w ?? 100, o.sizeResponse ?? 0.4, o.sizeDamping ?? 0.7);
    this.h = new Spring(o.h ?? 100, o.sizeResponse ?? 0.4, o.sizeDamping ?? 0.7);
    this.rest = o.rest;
    this.lifted = o.lifted ?? o.rest;
    this.layer = o.layer ?? 0;
    this.update(0);
  }

  place(x: number, y: number, w: number, h: number): void {
    this.x.snap(x);
    this.y.snap(y);
    this.w.snap(w);
    this.h.snap(h);
  }

  /** Light bloom spreading from the touch point (Apple's interactive glass glow). */
  touch(px: number, py: number, intensity = 0.32): void {
    this.glowDX = px - this.cx;
    this.glowDY = py - this.cy;
    this.glow.target = intensity;
  }

  moveTouch(px: number, py: number): void {
    this.glowDX = px - this.cx;
    this.glowDY = py - this.cy;
  }

  release(): void {
    this.glow.target = 0;
  }

  contains(px: number, py: number, pad = 0): boolean {
    return Math.abs(px - this.cx) <= this.hw + pad && Math.abs(py - this.cy) <= this.hh + pad;
  }

  isSettled(): boolean {
    return (
      this.x.isSettled() && this.y.isSettled() && this.w.isSettled() && this.h.isSettled() &&
      this.active.isSettled() && this.scale.isSettled() && this.glow.isSettled()
    );
  }

  update(dt: number): void {
    if (dt > 0) {
      this.x.step(dt);
      this.y.step(dt);
      this.w.step(dt);
      this.h.step(dt);
      this.active.step(dt);
      this.scale.step(dt);
      this.glow.step(dt);
    }
    const a = this.active.value;
    mixMaterial(this.rest, this.lifted, clamp(a, 0, 1), this.mat);

    // Squash & stretch: elongate along the direction of travel, keep volume roughly constant.
    const tx = Math.min(Math.abs(this.x.velocity) * this.stretch, this.maxStretch);
    const ty = Math.min(Math.abs(this.y.velocity) * this.stretch, this.maxStretch);
    const k = dt > 0 ? Math.min(1, dt * 22) : 1;
    this.sx += (1 + tx - ty * 0.55 - this.sx) * k;
    this.sy += (1 + ty - tx * 0.55 - this.sy) * k;

    const asx = 1 + (this.activeScaleX - 1) * a;
    const asy = 1 + (this.activeScaleY - 1) * a;
    const s = this.scale.value;
    this.cx = this.x.value;
    this.cy = this.y.value;
    this.hw = Math.max(0, (this.w.value / 2) * s * asx * this.sx);
    this.hh = Math.max(0, (this.h.value / 2) * s * asy * this.sy);

    this.glowX = this.cx + this.glowDX;
    this.glowY = this.cy + this.glowDY;
    this.glowRadius = Math.max(this.hw, this.hh) * 0.9;
  }
}
