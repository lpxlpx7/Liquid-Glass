import { Spring, clamp } from '../core/Spring';
import { GlassShape } from '../glass/GlassShape';
import { material } from '../glass/Material';
import { ICONS, drawIcon } from '../scene/GlyphLayer';
import { FONT, art, ellipsize, rr, text, wrap } from './draw';
import { FrameInfo, Widget, WindowInfo } from './types';

type Kind = 'finder' | 'photos' | 'notes';
interface Rect { x: number; y: number; w: number; h: number }

interface Theme { bg: string; sidebar: string; text: string; sub: string; line: string; sel: string; page: string }
const LIGHT: Theme = { bg: '#ffffff', sidebar: '#ececf0', text: '#1d1d1f', sub: '#6e6e73', line: 'rgba(0,0,0,0.08)', sel: 'rgba(0,0,0,0.08)', page: '#fffdf5' };
const DARK: Theme = { bg: '#1e1e21', sidebar: '#2a2a2e', text: '#f5f5f7', sub: '#98989d', line: 'rgba(255,255,255,0.1)', sel: 'rgba(255,255,255,0.12)', page: '#232326' };

const PAD = 8;
const TOP = 56;
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'];

const SIDEBAR: Record<Kind, { t: string; s?: string }[]> = {
  finder: ['Recents', 'Applications', 'Desktop', 'Documents', 'Downloads', 'Pictures', 'iCloud Drive'].map((t) => ({ t })),
  photos: ['Library', 'Favorites', 'Recently Added', 'People', 'Places', 'Hidden'].map((t) => ({ t })),
  notes: [
    { t: 'Liquid Glass Notes', s: 'Today' },
    { t: 'Test Checklist', s: 'Today' },
    { t: 'Weekly Sync', s: 'Monday' },
    { t: 'Groceries', s: 'Yesterday' },
    { t: 'Trip Plan', s: '11/03' },
  ],
};

const NOTES: string[][] = [
  [
    'Every piece of glass is treated as a convex lens. The middle is flat, so content behind it is not distorted. The edge curves down and gets steeper toward the rim, so content near the rim is bent inward more strongly.',
    'Refraction at the rim is computed separately for R, G and B. Red bends a little less and blue a little more, so black and white stripes get a thin colored fringe at the edge. Switch the wallpaper to the test chart and turn on the lens from the menu bar to see it clearly.',
    'The highlight follows the pointer: the rim facing it is brightest and the opposite rim is dimmer. Hold a slider in Control Center and its knob swells, turns clear, and glows where you press.',
    'Menus and Control Center grow out of the menu bar. The signed distance fields of the glass shapes are combined with a smooth-min, so shapes closer than the merge radius join into one piece.',
  ],
  [
    '☐ Drag the Photos window and watch the sidebar glass refract the grid',
    '☐ Move the pointer along the Dock to magnify the icons',
    '☐ Switch debug views in the View menu: displacement, normals, SDF',
    '☐ Open the Test Panel and switch to the test chart, or upload your own image',
    '☐ Turn on Dark Mode in Control Center and check that text colors follow',
    '☐ Fling the lens; it keeps sliding a little after you let go',
  ],
  ['1. Make the Dock magnification spring a bit softer', '2. Merge radius between menus and the menu bar is slightly too large', '3. Secondary sidebar text needs more contrast in Dark Mode', '4. Default dispersion could be lower on the test chart'],
  ['☐ Milk', '☐ A dozen eggs', '☑ Coffee beans', '☐ 4 tomatoes', '☐ Laundry detergent'],
  ['Leave Friday evening, back Sunday afternoon', 'Hotel booked, breakfast included', 'Pack chargers and a plug adapter'],
];

const FILES: { n: string; k: 'folder' | 'doc' | 'image'; c?: string }[] = [
  { n: 'Documents', k: 'folder' }, { n: 'Downloads', k: 'folder' }, { n: 'Pictures', k: 'folder' }, { n: 'Projects', k: 'folder' },
  { n: 'Mockup.png', k: 'image' }, { n: 'Weekly Report.txt', k: 'doc', c: '#8e8e93' }, { n: 'Screenshot 1.png', k: 'image' },
  { n: 'Budget.xlsx', k: 'doc', c: '#28c840' }, { n: 'Photo 2026.jpg', k: 'image' }, { n: 'README.md', k: 'doc', c: '#0a84ff' },
  { n: 'Music', k: 'folder' }, { n: 'Slides.key', k: 'doc', c: '#ff9f0a' }, { n: 'Poster.png', k: 'image' }, { n: 'Archive', k: 'folder' },
];

const TOOLBAR_R: Record<Kind, string[]> = {
  finder: [ICONS.grid, ICONS.share, ICONS.search],
  photos: [ICONS.heart, ICONS.share, ICONS.search],
  notes: [ICONS.compose, ICONS.share, ICONS.search],
};

function glassMat(tint: [number, number, number, number], radius: number) {
  return material({
    radius, cornerPower: radius < 100 ? 2.6 : 2, frost: 1, refraction: 16, bezel: 16, dispersion: 0.25,
    specular: 0.85, tint, saturation: 1.4, shadow: 0.14,
  });
}

export class AppWindow {
  open = false;
  readonly appear = new Spring(0, 0.32, 0.82);
  x = 0;
  y = 0;
  w = 700;
  h = 460;
  scroll = 0;
  scrollT = 0;
  maxScroll = 0;
  selected = 0;
  focused = false;
  dark = false;
  saved: Rect | null = null;
  placed = false;
  readonly sidebar: GlassShape;
  readonly tbL: GlassShape;
  readonly tbR: GlassShape;
  readonly shapes: GlassShape[];

  constructor(readonly kind: Kind, readonly title: string) {
    this.sidebar = new GlassShape({ rest: glassMat([1, 1, 1, 0.4], 14) });
    const cap = () => {
      const s = new GlassShape({ rest: glassMat([1, 1, 1, 0.35], 999) });
      s.lifted = material({ ...s.rest, frost: 0.35, refraction: 22, specular: 1.25, magnify: 1.06 });
      s.activeScaleX = s.activeScaleY = 1.08;
      return s;
    };
    this.tbL = cap();
    this.tbR = cap();
    this.shapes = [this.sidebar, this.tbL, this.tbR];
  }

  get theme(): Theme {
    return this.dark ? DARK : LIGHT;
  }

  get sbw(): number {
    return Math.round(Math.min(200, this.w * 0.3));
  }

  geom() {
    const { x, y, w, h } = this;
    const sbw = this.sbw;
    return {
      sidebar: { x: x + PAD, y: y + PAD, w: sbw, h: h - PAD * 2 },
      tbL: { x: x + PAD + sbw + 10, y: y + 12, w: 76, h: 34 },
      tbR: { x: x + w - 12 - 112, y: y + 12, w: 112, h: 34 },
      rowY: y + PAD + 44,
      rowH: this.kind === 'notes' ? 54 : 30,
    };
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

  private placeShape(s: GlassShape, r: Rect): void {
    const k = this.scale;
    s.x.snap(this.tx(r.x + r.w / 2));
    s.y.snap(this.ty(r.y + r.h / 2));
    s.w.snap(r.w * k);
    s.h.snap(r.h * k);
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

  update(f: FrameInfo): void {
    this.dark = f.ui.dark;
    const was = this.appear.value;
    this.appear.step(f.dt);
    if (this.appear.target === 0 && this.appear.value < 0.02) {
      this.open = false;
      this.appear.snap(0);
    }
    const ds = this.scrollT - this.scroll;
    if (Math.abs(ds) > 0.1) {
      this.scroll += ds * (1 - Math.exp(-f.dt * 18));
      f.flags.scene = true;
    } else this.scroll = this.scrollT;
    if (was !== this.appear.value) f.flags.scene = true;

    const g = this.geom();
    this.placeShape(this.sidebar, g.sidebar);
    this.placeShape(this.tbL, g.tbL);
    this.placeShape(this.tbR, g.tbR);
    const vis = this.open && this.focused && this.appear.value > 0.05;
    const dark = this.dark;
    for (const s of this.shapes) {
      s.visible = vis;
      const t = s === this.sidebar ? (dark ? [0.13, 0.13, 0.15, 0.6] : [0.97, 0.97, 0.98, 0.6]) : dark ? [0.22, 0.22, 0.24, 0.4] : [1, 1, 1, 0.38];
      for (let i = 0; i < 4; i++) s.rest.tint[i] = s.lifted.tint[i] = t[i];
      s.update(f.dt);
    }
  }

  // ---------- backdrop drawing ----------

  drawBody(ctx: CanvasRenderingContext2D): void {
    if (!this.open) return;
    this.withTransform(ctx, () => {
      const th = this.theme;
      const { x, y, w, h } = this;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = this.focused ? 48 : 24;
      ctx.shadowOffsetY = this.focused ? 18 : 8;
      ctx.fillStyle = th.bg;
      rr(ctx, x, y, w, h, 16);
      ctx.fill();
      ctx.restore();

      ctx.save();
      rr(ctx, x, y, w, h, 16);
      ctx.clip();
      if (this.kind === 'photos') this.drawPhotos(ctx, th);
      else if (this.kind === 'finder') this.drawFinder(ctx, th);
      else this.drawNotes(ctx, th);

      // scroll-edge effect so the title stays readable over scrolled content
      if (this.kind === 'photos' && this.scroll > 1) {
        const lg = ctx.createLinearGradient(0, y, 0, y + TOP + 18);
        lg.addColorStop(0, th.bg);
        lg.addColorStop(1, this.dark ? 'rgba(30,30,33,0)' : 'rgba(255,255,255,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(x, y, w, TOP + 18);
      }
      const g = this.geom();
      ctx.font = `700 15px ${FONT}`;
      const tx = g.tbL.x + g.tbL.w + 14;
      text(ctx, ellipsize(ctx, this.headline(), g.tbR.x - tx - 12), tx, y + 29, 15, th.text, 700);

      if (!this.focused) {
        // inactive windows: flat chrome instead of glass
        ctx.fillStyle = th.sidebar;
        rr(ctx, g.sidebar.x, g.sidebar.y, g.sidebar.w, g.sidebar.h, 14);
        ctx.fill();
        ctx.fillStyle = th.sel;
        rr(ctx, g.tbL.x, g.tbL.y, g.tbL.w, g.tbL.h, 17);
        ctx.fill();
        rr(ctx, g.tbR.x, g.tbR.y, g.tbR.w, g.tbR.h, 17);
        ctx.fill();
        this.drawChrome(ctx, false);
      }
      ctx.restore();

      ctx.strokeStyle = this.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 16);
      ctx.stroke();
    });
  }

  private headline(): string {
    const item = SIDEBAR[this.kind][this.selected]?.t ?? '';
    return this.kind === 'notes' ? this.title : item;
  }

  private contentRect(): Rect {
    const sb = this.sbw + PAD;
    return { x: this.x + sb + 16, y: this.y + TOP + 6, w: this.w - sb - 32, h: this.h - TOP - 6 };
  }

  private drawPhotos(ctx: CanvasRenderingContext2D, th: Theme): void {
    // Content runs under the floating sidebar and toolbar, as in macOS 26.
    const { x, y, w, h } = this;
    ctx.fillStyle = th.bg;
    ctx.fillRect(x, y, w, h);
    const cols = Math.max(3, Math.round(w / 150));
    const gap = 2;
    const cell = (w - gap * (cols - 1)) / cols;
    const rows = 16;
    const top = y + TOP + 4 - this.scroll;
    this.maxScroll = Math.max(0, rows * (cell + gap) - (h - TOP - 4));
    for (let r = 0; r < rows; r++) {
      const cy = top + r * (cell + gap);
      if (cy > y + h || cy + cell < y) continue;
      for (let c = 0; c < cols; c++) art(ctx, x + c * (cell + gap), cy, cell, cell, this.selected * 200 + r * cols + c);
    }
  }

  private drawFinder(ctx: CanvasRenderingContext2D, th: Theme): void {
    const cr = this.contentRect();
    const cw = 104;
    const chh = 108;
    const cols = Math.max(1, Math.floor(cr.w / cw));
    const items = FILES.slice(this.selected % FILES.length).concat(FILES.slice(0, this.selected % FILES.length));
    const rows = Math.ceil(items.length / cols);
    this.maxScroll = Math.max(0, rows * chh + 20 - cr.h);
    items.forEach((it, i) => {
      const cx = cr.x + (i % cols) * cw + cw / 2;
      const cy = cr.y + 10 + Math.floor(i / cols) * chh - this.scroll;
      if (cy > this.y + this.h || cy + chh < this.y) return;
      if (it.k === 'folder') {
        ctx.fillStyle = '#4a9ff5';
        rr(ctx, cx - 30, cy + 6, 26, 12, 4);
        ctx.fill();
        ctx.fillStyle = '#6cb4ff';
        rr(ctx, cx - 32, cy + 12, 64, 46, 7);
        ctx.fill();
        ctx.fillStyle = '#5aa9ff';
        ctx.fillRect(cx - 32, cy + 20, 64, 2);
      } else if (it.k === 'doc') {
        ctx.fillStyle = this.dark ? '#3a3a3e' : '#ffffff';
        ctx.strokeStyle = th.line;
        rr(ctx, cx - 22, cy + 2, 44, 58, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = it.c ?? '#8e8e93';
        rr(ctx, cx - 14, cy + 40, 28, 12, 3);
        ctx.fill();
        ctx.fillStyle = th.line;
        for (let l = 0; l < 4; l++) ctx.fillRect(cx - 14, cy + 12 + l * 6, 28 - (l % 2) * 8, 2);
      } else {
        art(ctx, cx - 30, cy + 8, 60, 46, i * 31 + 5, 4);
      }
      ctx.font = `500 12px ${FONT}`;
      text(ctx, ellipsize(ctx, it.n, cw - 10), cx, cy + 76, 12, th.text, 500, 'center');
    });
    ctx.textAlign = 'left';
  }

  private drawNotes(ctx: CanvasRenderingContext2D, th: Theme): void {
    const cr = this.contentRect();
    ctx.fillStyle = th.page;
    ctx.fillRect(cr.x - 16, this.y, cr.w + 32 + 16, this.h);
    const note = SIDEBAR.notes[this.selected];
    let yy = cr.y + 22 - this.scroll;
    text(ctx, note.t, cr.x, yy, 24, th.text, 700);
    yy += 30;
    const d = new Date();
    text(ctx, d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), cr.x, yy, 12, th.sub, 500);
    yy += 30;
    ctx.font = `400 15px ${FONT}`;
    for (const p of NOTES[this.selected] ?? []) {
      for (const line of wrap(ctx, p, cr.w)) {
        text(ctx, line, cr.x, yy, 15, th.text, 400);
        yy += 25;
      }
      yy += 10;
    }
    this.maxScroll = Math.max(0, yy + this.scroll - (this.y + this.h) + 30);
  }

  /** Traffic lights, sidebar rows and toolbar icons. On glass when focused, flat otherwise. */
  drawChrome(ctx: CanvasRenderingContext2D, onGlass: boolean): void {
    const th = this.theme;
    const g = this.geom();
    LIGHTS.forEach((c, i) => {
      ctx.fillStyle = onGlass ? c : this.dark ? '#4a4a4e' : '#c9c9ce';
      ctx.beginPath();
      ctx.arc(g.sidebar.x + 18 + i * 20, g.sidebar.y + 18, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    const rows = SIDEBAR[this.kind];
    rows.forEach((r, i) => {
      const ry = g.rowY + i * g.rowH;
      if (ry + g.rowH > g.sidebar.y + g.sidebar.h) return;
      if (i === this.selected) {
        ctx.fillStyle = this.kind === 'notes' ? (this.dark ? 'rgba(255,214,10,0.28)' : 'rgba(255,204,0,0.32)') : th.sel;
        rr(ctx, g.sidebar.x + 8, ry, g.sidebar.w - 16, g.rowH - 2, 8);
        ctx.fill();
      }
      const lx = g.sidebar.x + 18;
      if (this.kind === 'notes') {
        ctx.font = `600 13px ${FONT}`;
        text(ctx, ellipsize(ctx, r.t, g.sidebar.w - 36), lx, ry + 17, 13, th.text, 600);
        text(ctx, r.s ?? '', lx, ry + 36, 11, th.sub, 500);
      } else {
        drawIcon(ctx, this.kind === 'finder' ? ICONS.folder : ICONS.photo, lx + 7, ry + 14, 16, '#0a84ff', 0, 1.8);
        ctx.font = `500 13px ${FONT}`;
        text(ctx, ellipsize(ctx, r.t, g.sidebar.w - 56), lx + 24, ry + 14, 13, th.text, 500);
      }
    });
    const ic = th.text;
    drawIcon(ctx, ICONS.back, g.tbL.x + 20, g.tbL.y + 17, 18, ic, 0, 2);
    drawIcon(ctx, ICONS.forward, g.tbL.x + 56, g.tbL.y + 17, 18, ic, 0, 2);
    TOOLBAR_R[this.kind].forEach((d, i) => drawIcon(ctx, d, g.tbR.x + 20 + i * 36, g.tbR.y + 17, 17, ic, 0, 1.9));
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    if (!this.open || !this.focused) return;
    this.withTransform(ctx, () => this.drawChrome(ctx, true));
  }
}

/** Manages z-order, focus, dragging, scrolling and traffic-light actions. */
export class WindowManager implements Widget {
  readonly windows: AppWindow[];
  readonly shapes: GlassShape[];
  private z: AppWindow[];
  private vw = 1;
  private vh = 1;
  private active: AppWindow | null = null;
  private mode: 'none' | 'drag' | 'light' | 'button' = 'none';
  private offX = 0;
  private offY = 0;
  private light = -1;
  private pressed: GlassShape | null = null;
  private dirty = true;

  constructor() {
    this.windows = [new AppWindow('finder', 'Finder'), new AppWindow('photos', 'Photos'), new AppWindow('notes', 'Notes')];
    this.z = [...this.windows];
    this.shapes = this.windows.flatMap((w) => w.shapes);
  }

  get focused(): AppWindow | null {
    for (let i = this.z.length - 1; i >= 0; i--) if (this.z[i].open && this.z[i].appear.target > 0) return this.z[i];
    return null;
  }

  openRects(): Rect[] {
    return this.windows.filter((w) => w.open && w.appear.value > 0.3).map((w) => ({ x: w.x, y: w.y, w: w.w, h: w.h }));
  }

  list(): WindowInfo[] {
    const f = this.focused;
    return this.windows.map((w) => ({ id: w.kind, title: w.title, open: w.open && w.appear.target > 0, focused: w === f }));
  }

  focus(w: AppWindow): void {
    this.z = this.z.filter((x) => x !== w).concat(w);
    this.dirty = true;
  }

  open(id: string): void {
    const w = this.windows.find((x) => x.kind === id);
    if (!w) return;
    if (!w.open || w.appear.target === 0) {
      w.open = true;
      w.appear.target = 1;
    }
    this.focus(w);
  }

  close(w: AppWindow): void {
    w.appear.target = 0;
    this.dirty = true;
  }

  closeFocused(): void {
    const f = this.focused;
    if (f) this.close(f);
  }

  arrange(): void {
    for (const w of this.windows) {
      w.placed = false;
      w.saved = null;
    }
    this.layout(this.vw, this.vh);
    this.dirty = true;
  }

  layout(vw: number, vh: number): void {
    this.vw = vw;
    this.vh = vh;
    const defs: Record<Kind, [number, number, number, number]> = {
      finder: [Math.min(760, vw - 60), Math.min(470, vh - 210), 40, 64],
      photos: [Math.min(880, vw - 40), Math.min(560, vh - 180), vw * 0.2, 104],
      notes: [Math.min(700, vw - 60), Math.min(470, vh - 210), vw * 0.1, 150],
    };
    for (const w of this.windows) {
      const [ww, hh, x, y] = defs[w.kind];
      if (!w.placed) {
        w.placed = true;
        w.w = Math.max(320, ww);
        w.h = Math.max(280, hh);
        w.x = x;
        w.y = y;
      }
      w.x = clamp(w.x, -w.w + 120, vw - 120);
      w.y = clamp(w.y, 34, vh - 80);
      if (w.x + w.w > vw - 10 && w.w < vw - 20) w.x = Math.max(10, vw - 10 - w.w);
    }
    this.dirty = true;
  }

  update(f: FrameInfo): void {
    const foc = this.focused;
    for (const w of this.windows) {
      const was = w.focused;
      w.focused = w === foc;
      if (was !== w.focused) this.dirty = true;
      w.update(f);
    }
    if (this.dirty || this.mode === 'drag') {
      f.flags.scene = true;
      f.flags.glyphs = true;
      this.dirty = false;
    }
  }

  drawScene(ctx: CanvasRenderingContext2D): void {
    for (const w of this.z) w.drawBody(ctx);
  }

  drawGlyphs(ctx: CanvasRenderingContext2D): void {
    this.focused?.drawGlyphs(ctx);
  }

  private topAt(x: number, y: number): AppWindow | null {
    for (let i = this.z.length - 1; i >= 0; i--) if (this.z[i].contains(x, y)) return this.z[i];
    return null;
  }

  hit(x: number, y: number): boolean {
    return this.topAt(x, y) !== null;
  }

  down(x: number, y: number): void {
    const w = this.topAt(x, y);
    this.active = w;
    this.mode = 'none';
    if (!w) return;
    this.focus(w);
    const g = w.geom();
    for (let i = 0; i < 3; i++) {
      if (Math.hypot(x - (g.sidebar.x + 18 + i * 20), y - (g.sidebar.y + 18)) < 9) {
        this.mode = 'light';
        this.light = i;
        return;
      }
    }
    for (const s of [w.tbL, w.tbR]) {
      if (s.contains(x, y)) {
        this.mode = 'button';
        this.pressed = s;
        s.active.target = 1;
        s.touch(x, y, 0.25);
        return;
      }
    }
    const rows = SIDEBAR[w.kind].length;
    if (x >= g.sidebar.x && x <= g.sidebar.x + g.sidebar.w && y >= g.rowY && y < g.rowY + rows * g.rowH) {
      w.selected = Math.floor((y - g.rowY) / g.rowH);
      w.scroll = w.scrollT = 0;
      this.dirty = true;
      return;
    }
    if (y < w.y + TOP || (x < g.sidebar.x + g.sidebar.w && y < g.rowY)) {
      this.mode = 'drag';
      this.offX = x - w.x;
      this.offY = y - w.y;
    }
  }

  move(x: number, y: number): void {
    const w = this.active;
    if (!w) return;
    if (this.mode === 'drag') {
      w.saved = null;
      w.x = clamp(x - this.offX, -w.w + 120, this.vw - 120);
      w.y = clamp(y - this.offY, 34, this.vh - 60);
    } else if (this.mode === 'button' && this.pressed) this.pressed.moveTouch(x, y);
  }

  up(x: number, y: number): void {
    const w = this.active;
    if (w && this.mode === 'light') {
      const g = w.geom();
      if (Math.hypot(x - (g.sidebar.x + 18 + this.light * 20), y - (g.sidebar.y + 18)) < 12) {
        if (this.light < 2) this.close(w);
        else this.toggleZoom(w);
      }
    }
    if (w && this.mode === 'button' && this.pressed) {
      const s = this.pressed;
      s.active.target = 0;
      s.release();
      if (s === w.tbL && s.contains(x, y)) {
        const n = SIDEBAR[w.kind].length;
        w.selected = (w.selected + (x < s.cx ? n - 1 : 1)) % n;
        w.scroll = w.scrollT = 0;
        this.dirty = true;
      }
      this.pressed = null;
    }
    this.mode = 'none';
    this.active = null;
  }

  private toggleZoom(w: AppWindow): void {
    if (w.saved) {
      Object.assign(w, w.saved);
      w.saved = null;
    } else {
      w.saved = { x: w.x, y: w.y, w: w.w, h: w.h };
      w.x = 8;
      w.y = 34;
      w.w = this.vw - 16;
      w.h = this.vh - 34 - 96;
    }
    w.scrollT = clamp(w.scrollT, 0, w.maxScroll);
    this.dirty = true;
  }

  wheel(x: number, y: number, dy: number): boolean {
    const w = this.topAt(x, y);
    if (!w) return false;
    w.scrollT = clamp(w.scrollT + dy, 0, w.maxScroll);
    return true;
  }
}
