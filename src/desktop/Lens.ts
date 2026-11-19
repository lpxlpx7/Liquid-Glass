import { clamp } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { FrameInfo, UIState, Widget } from './types';

/** Clear draggable glass droplet on layer 1: refracts everything, including glass below it. */
export class Lens implements Widget {
  readonly shape: GlassShape;
  readonly shapes: GlassShape[];
  private size = 140;
  private vw = 1;
  private vh = 1;
  private offX = 0;
  private offY = 0;
  private dragging = false;
  private samples: { t: number; x: number; y: number }[] = [];
  private placed = false;

  constructor(private readonly ui: UIState) {
    this.shape = new GlassShape({
      layer: 1,
      posResponse: 0.2,
      posDamping: 0.62,
      rest: material({
        radius: 999, frost: 0, refraction: 30, bezel: 46, dispersion: 0.35, specular: 1.1,
        tint: [1, 1, 1, 0.02], saturation: 1.15, magnify: 1.06, shadow: 0.3,
      }),
      lifted: material({
        radius: 999, frost: 0, refraction: 40, bezel: 52, dispersion: 0.5, specular: 1.3,
        tint: [1, 1, 1, 0], saturation: 1.2, magnify: 1.16, shadow: 0.38,
      }),
    });
    this.shape.activeScaleX = this.shape.activeScaleY = 1.12;
    this.shape.stretch = 0.00022;
    this.shape.scale.snap(ui.lens ? 1 : 0);
    this.shape.visible = ui.lens;
    this.shapes = [this.shape];
  }

  layout(vw: number, vh: number): void {
    this.vw = vw;
    this.vh = vh;
    this.size = vw < 600 ? 112 : 140;
    if (!this.placed) {
      this.placed = true;
      this.shape.place(vw * 0.55, vh * 0.45, this.size, this.size);
    }
    this.shape.w.target = this.shape.h.target = this.size;
    this.keepInside();
  }

  private keepInside(): void {
    const r = this.size / 2 + 6;
    this.shape.x.target = clamp(this.shape.x.target, r, this.vw - r);
    this.shape.y.target = clamp(this.shape.y.target, r, this.vh - r);
  }

  hit(x: number, y: number): boolean {
    return this.ui.lens && Math.hypot(x - this.shape.cx, y - this.shape.cy) < this.shape.hw;
  }

  down(x: number, y: number): void {
    this.dragging = true;
    this.offX = this.shape.x.target - x;
    this.offY = this.shape.y.target - y;
    this.shape.active.target = 1;
    this.shape.touch(x, y, 0.22);
    this.samples = [{ t: performance.now(), x, y }];
  }

  move(x: number, y: number): void {
    this.shape.x.target = x + this.offX;
    this.shape.y.target = y + this.offY;
    this.shape.moveTouch(x, y);
    const t = performance.now();
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > 80) this.samples.shift();
  }

  up(): void {
    this.dragging = false;
    this.shape.active.target = 0;
    this.shape.release();
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt > 0.01 && performance.now() - b.t < 80) {
      this.shape.x.target += ((b.x - a.x) / dt) * 0.12;
      this.shape.y.target += ((b.y - a.y) / dt) * 0.12;
    }
    this.keepInside();
  }

  update(f: FrameInfo): void {
    const s = this.shape;
    s.scale.target = this.ui.lens ? 1 : 0;
    if (this.ui.lens) s.visible = true;
    else if (s.scale.value < 0.02) s.visible = false;
    if (!this.dragging) this.keepInside();
    s.update(f.dt);
  }
}
