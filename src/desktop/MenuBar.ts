import { Spring, clamp } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { DEBUG_MODES } from '../glass/settings';
import { ICONS, drawIcon } from '../scene/GlyphLayer';
import { eraseShape, ink, rr, text, tw } from './draw';
import { Desktop, FrameInfo, Widget, hysteresis } from './types';

interface MenuItem {
  label: string;
  action?: () => void;
  checked?: boolean;
  disabled?: boolean;
  sep?: boolean;
}
interface Menu { title: string; icon?: string; bold?: boolean; items: () => MenuItem[]; x: number; w: number }
interface RightItem { id: string; w: number; x: number }

const BAR_H = 28;
const BAR_Y = 0;
const ROW = 24;
const SEP_H = 9;
const MERGE = 14;

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Floating glass menu bar; drop-down menus grow out of it and stay merged with it. */
export class MenuBar implements Widget {
  readonly bar: GlassShape;
  readonly drop: GlassShape;
  readonly shapes: GlassShape[];
  private menus: Menu[];
  private right: RightItem[] = [];
  private openIdx = -1;
  private items: MenuItem[] = [];
  private hoverItem = -1;
  private pressedItem = -1;
  private dropRect = { x: 0, y: 0, w: 0, h: 0 };
  private vw = 1;
  private adapt = new Spring(0, 0.4, 1);
  private dropAdapt = 0;
  private lastKey = '';

  constructor(private readonly desk: Desktop) {
    this.bar = new GlassShape({
      rest: material({
        radius: 0, cornerPower: 2, frost: 0.85, refraction: 10, bezel: 9, dispersion: 0.3,
        specular: 0.9, tint: [1, 1, 1, 0.1], saturation: 1.5, shadow: 0.2,
      }),
    });
    this.drop = new GlassShape({
      rest: material({
        radius: 12, cornerPower: 2.6, merge: MERGE, frost: 1, refraction: 18, bezel: 16, dispersion: 0.3,
        specular: 0.9, tint: [1, 1, 1, 0.5], saturation: 1.5, shadow: 0.3,
      }),
      posResponse: 0.3,
      posDamping: 0.8,
      sizeResponse: 0.3,
      sizeDamping: 0.78,
    });
    this.drop.visible = false;
    this.shapes = [this.bar, this.drop];
    const d = desk;
    const s = d.settings;
    this.menus = [
      {
        title: '', icon: ICONS.drop, x: 0, w: 0,
        items: () => [
          { label: 'About This Test Desktop', action: () => d.toast('Liquid Glass test desktop · TypeScript + WebGL2') },
          { label: '', sep: true },
          { label: 'Test Panel…', action: () => d.toggleTestPanel() },
          { label: 'Arrange Windows', action: () => d.arrangeWindows() },
        ],
      },
      {
        title: '', bold: true, x: 0, w: 0,
        items: () => [
          { label: `About ${d.focusedAppName()}`, action: () => d.toast(`${d.focusedAppName()}: demo window, content is drawn locally`) },
          { label: '', sep: true },
          { label: 'Close Window', action: () => d.closeFocused() },
        ],
      },
      {
        title: 'File', x: 0, w: 0,
        items: () => [
          { label: 'Open Finder', action: () => d.openApp('finder') },
          { label: 'Open Photos', action: () => d.openApp('photos') },
          { label: 'Open Notes', action: () => d.openApp('notes') },
          { label: '', sep: true },
          { label: 'Close Window', action: () => d.closeFocused() },
        ],
      },
      {
        title: 'Edit', x: 0, w: 0,
        items: () => [
          { label: 'Undo', disabled: true },
          { label: 'Redo', disabled: true },
          { label: '', sep: true },
          { label: 'Copy', disabled: true },
          { label: 'Paste', disabled: true },
        ],
      },
      {
        title: 'View', x: 0, w: 0,
        items: () => [
          ...DEBUG_MODES.map((m, i) => ({ label: `Debug View: ${m}`, checked: s.debug === i, action: () => (s.debug = i) })),
          { label: '', sep: true },
          { label: 'Light Follows Pointer', checked: s.followPointer, action: () => (s.followPointer = !s.followPointer) },
          { label: 'Liquid Lens', checked: d.ui.lens, action: () => (d.ui.lens = !d.ui.lens) },
          { label: 'Show FPS', checked: d.ui.showFps, action: () => (d.ui.showFps = !d.ui.showFps) },
          { label: 'Dark Mode', checked: d.ui.dark, action: () => (d.ui.dark = !d.ui.dark) },
        ],
      },
      {
        title: 'Window', x: 0, w: 0,
        items: () => [
          ...d.windowList().map((w) => ({ label: w.title + (w.open ? '' : ' (closed)'), checked: w.focused, action: () => d.focusWindow(w.id) })),
          { label: '', sep: true },
          { label: 'Arrange Windows', action: () => d.arrangeWindows() },
        ],
      },
      {
        title: 'Help', x: 0, w: 0,
        items: () => [
          { label: 'Drag a window by its top edge to move it', disabled: true },
          { label: 'Move the pointer over the Dock to magnify icons', disabled: true },
          { label: 'Switch debug views from the View menu', disabled: true },
          { label: 'Drop an image on the page to set the wallpaper', disabled: true },
        ],
      },
    ];
  }

  get menuOpen(): boolean {
    return this.openIdx >= 0;
  }

  /** Where the control-center icon sits (for the morph origin). */
  ccAnchor(): { x: number; y: number } {
    const r = this.right.find((i) => i.id === 'cc');
    return { x: r ? r.x + r.w / 2 : this.vw - 60, y: BAR_Y + BAR_H / 2 };
  }

  layout(vw: number): void {
    this.vw = vw;
    this.bar.place(vw / 2, BAR_Y + BAR_H / 2, vw + 40, BAR_H);
  }

  private clockText(): string {
    const d = new Date();
    const hm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${WEEK[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}  ${hm}`;
  }

  private layoutItems(): void {
    let x = 18;
    this.menus[1].title = this.desk.focusedAppName();
    for (const m of this.menus) {
      m.w = m.icon ? 30 : tw(m.title, 13, m.bold ? 700 : 500) + 20;
      m.x = x;
      x += m.w;
    }
    const ui = this.desk.ui;
    const r: { id: string; w: number }[] = [
      { id: 'clock', w: tw(this.clockText(), 13, 500) + 16 },
      { id: 'cc', w: 32 },
      { id: 'battery', w: 40 },
      { id: 'wifi', w: 30 },
      { id: 'lens', w: 30 },
    ];
    if (ui.showFps) r.push({ id: 'fps', w: tw(`${Math.round(ui.fps)} fps`, 12, 600) + 16 });
    let rx = this.vw - 14;
    this.right = r.map((i) => {
      rx -= i.w;
      return { ...i, x: rx };
    });
  }

  private openMenu(i: number): void {
    const m = this.menus[i];
    this.openIdx = i;
    this.items = m.items();
    this.hoverItem = -1;
    const w = Math.max(200, ...this.items.map((it) => tw(it.label, 13, 500) + 56));
    const h = this.items.reduce((s, it) => s + (it.sep ? SEP_H : ROW), 0) + 12;
    const x = clamp(m.x - 4, 8, this.vw - w - 8);
    this.dropRect = { x, y: BAR_Y + BAR_H + 4, w, h };
    if (!this.drop.visible) this.drop.place(m.x + m.w / 2, BAR_Y + BAR_H / 2, m.w, BAR_H - 6);
    this.drop.visible = true;
    this.desk.toggleControlCenter(false);
  }

  closeMenu(): void {
    if (this.openIdx < 0) return;
    const m = this.menus[this.openIdx];
    this.openIdx = -1;
    this.dropRect = { x: m.x + m.w / 2 - m.w * 0.3, y: BAR_Y + 4, w: m.w * 0.6, h: 16 };
  }

  private menuAt(x: number, y: number): number {
    if (y < BAR_Y || y > BAR_Y + BAR_H) return -1;
    return this.menus.findIndex((m) => x >= m.x && x < m.x + m.w);
  }

  private itemAt(x: number, y: number): number {
    const r = this.dropRect;
    if (this.openIdx < 0 || x < r.x || x > r.x + r.w || y < r.y + 6 || y > r.y + r.h - 6) return -1;
    let yy = r.y + 6;
    for (let i = 0; i < this.items.length; i++) {
      const h = this.items[i].sep ? SEP_H : ROW;
      if (y >= yy && y < yy + h) return this.items[i].sep || this.items[i].disabled ? -1 : i;
      yy += h;
    }
    return -1;
  }

  hit(x: number, y: number): boolean {
    return this.bar.contains(x, y) || (this.openIdx >= 0 && this.drop.contains(x, y));
  }

  hover(x: number, y: number): void {
    if (this.openIdx < 0) return;
    const m = this.menuAt(x, y);
    if (m >= 0 && m !== this.openIdx) this.openMenu(m);
    this.hoverItem = this.itemAt(x, y);
  }

  down(x: number, y: number): void {
    const m = this.menuAt(x, y);
    if (m >= 0) {
      if (this.openIdx === m) this.closeMenu();
      else this.openMenu(m);
      return;
    }
    this.pressedItem = this.itemAt(x, y);
    if (this.pressedItem >= 0) return;
    const r = this.right.find((i) => x >= i.x && x < i.x + i.w && y <= BAR_Y + BAR_H);
    if (!r) return;
    this.bar.touch(x, y, 0.18);
    if (r.id === 'cc' || r.id === 'wifi') {
      this.closeMenu();
      this.desk.toggleControlCenter();
    } else if (r.id === 'lens') {
      this.desk.ui.lens = !this.desk.ui.lens;
    } else if (r.id === 'fps') {
      this.desk.toggleTestPanel();
    }
  }

  move(x: number, y: number): void {
    this.hover(x, y);
  }

  up(x: number, y: number): void {
    this.bar.release();
    if (this.pressedItem >= 0 && this.itemAt(x, y) === this.pressedItem) {
      const it = this.items[this.pressedItem];
      this.closeMenu();
      it.action?.();
    }
    this.pressedItem = -1;
  }

  update(f: FrameInfo): void {
    this.layoutItems();
    const r = this.dropRect;
    this.drop.x.target = r.x + r.w / 2;
    this.drop.y.target = r.y + r.h / 2;
    this.drop.w.target = r.w;
    this.drop.h.target = r.h;
    if (this.openIdx < 0 && this.drop.visible && this.drop.h.value < 24 && this.drop.isSettled()) this.drop.visible = false;
    if (this.openIdx >= 0) this.items = this.menus[this.openIdx].items();

    const lum = f.lum.at(0, 0, this.vw, BAR_Y + BAR_H);
    this.adapt.target = hysteresis(this.adapt.target, lum);
    this.adapt.step(f.dt);
    const a = this.adapt.value;
    this.bar.rest.tint[3] = 0.1 + a * 0.15;
    const dl = f.lum.at(r.x, r.y, r.w, r.h);
    this.dropAdapt = dl > 0.45 || f.ui.dark === false ? 1 : 0;
    const dt = this.dropAdapt ? [0.98, 0.98, 0.99, 0.55] : [0.12, 0.12, 0.14, 0.5];
    for (let i = 0; i < 4; i++) this.drop.rest.tint[i] = dt[i];
    this.bar.update(f.dt);
    this.drop.update(f.dt);

    const key = `${this.clockText()}|${a.toFixed(3)}|${this.openIdx}|${this.hoverItem}|${Math.round(f.ui.fps)}|${f.ui.showFps}|${f.ui.lens}|${this.menus[1].title}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      f.flags.glyphs = true;
    }
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    eraseShape(ctx, this.bar);
    const a = this.adapt.value;
    const c = ink(a, 0.95);
    const cy = BAR_Y + BAR_H / 2;
    for (const [i, m] of this.menus.entries()) {
      if (i === this.openIdx) {
        ctx.fillStyle = ink(a, 0.14);
        rr(ctx, m.x + 2, BAR_Y + 3, m.w - 4, BAR_H - 6, 6);
        ctx.fill();
      }
      if (m.icon) drawIcon(ctx, m.icon, m.x + m.w / 2, cy, 17, c, 0, 2);
      else text(ctx, m.title, m.x + 10, cy, 13, c, m.bold ? 700 : 500);
    }
    const ui = this.desk.ui;
    for (const r of this.right) {
      const mx = r.x + r.w / 2;
      if (r.id === 'clock') text(ctx, this.clockText(), r.x + 8, cy, 13, c, 500);
      else if (r.id === 'cc') drawIcon(ctx, ICONS.sliders, mx, cy, 17, c, 0, 1.9);
      else if (r.id === 'wifi') drawIcon(ctx, ICONS.wifi, mx, cy, 17, ui.wifi ? c : ink(a, 0.35), 0, 1.9);
      else if (r.id === 'lens') drawIcon(ctx, ICONS.lens, mx, cy, 17, ui.lens ? '#0a84ff' : c, 0, 2);
      else if (r.id === 'fps') text(ctx, `${Math.round(ui.fps)} fps`, r.x + 8, cy, 12, c, 600);
      else if (r.id === 'battery') {
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.2;
        rr(ctx, mx - 13, cy - 6, 24, 12, 3.5);
        ctx.stroke();
        ctx.fillStyle = c;
        rr(ctx, mx - 11, cy - 4, 20 * 0.8, 8, 2);
        ctx.fill();
        ctx.fillRect(mx + 12, cy - 2.5, 1.8, 5);
      }
    }

    // drop-down menu
    const d = this.drop;
    if (!d.visible) return;
    eraseShape(ctx, d);
    const r = this.dropRect;
    const p = this.openIdx >= 0 ? clamp((d.h.value / Math.max(r.h, 1) - 0.6) / 0.4, 0, 1) : 0;
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = p;
    const ia = this.dropAdapt;
    let yy = r.y + 6;
    this.items.forEach((it, i) => {
      if (it.sep) {
        ctx.fillStyle = ink(ia, 0.15);
        ctx.fillRect(r.x + 12, yy + SEP_H / 2, r.w - 24, 1);
        yy += SEP_H;
        return;
      }
      const hl = i === this.hoverItem;
      if (hl) {
        ctx.fillStyle = '#0a84ff';
        rr(ctx, r.x + 6, yy, r.w - 12, ROW, 6);
        ctx.fill();
      }
      const col = hl ? '#ffffff' : ink(ia, it.disabled ? 0.4 : 0.95);
      if (it.checked) text(ctx, '✓', r.x + 14, yy + ROW / 2, 13, col, 700);
      text(ctx, it.label, r.x + 32, yy + ROW / 2, 13, col, 500);
      yy += ROW;
    });
    ctx.restore();
  }
}
