import './style.css';
import { ControlCenter } from './desktop/ControlCenter';
import { DesktopWidgets } from './desktop/DesktopWidgets';
import { Dock } from './desktop/Dock';
import { Lens } from './desktop/Lens';
import { MenuBar } from './desktop/MenuBar';
import { TestPanel } from './desktop/TestPanel';
import { Desktop, Flags, FrameInfo, UIState, Widget } from './desktop/types';
import { Wallpaper } from './desktop/Wallpaper';
import { WindowManager } from './desktop/Windows';
import { GlassShape } from './glass/GlassShape';
import { LiquidGlassRenderer } from './glass/LiquidGlassRenderer';
import { DEBUG_MODES, defaultSettings } from './glass/settings';
import { GlyphLayer } from './scene/GlyphLayer';
import { LuminanceSampler } from './scene/Luminance';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLDivElement;

const settings = defaultSettings();
const ui: UIState = {
  dark: false, brightness: 1, volume: 0.6, wifi: true, bluetooth: true, hotspot: false,
  lens: false, showFps: true, fps: 60,
};
const flags: Flags = { scene: true, glyphs: true };

// Backdrop canvas: wallpaper + windows (everything the glass refracts)
const scene = document.createElement('canvas');
const sctx = scene.getContext('2d')!;
const glyphs = new GlyphLayer();
const lum = new LuminanceSampler();
const wallpaper = new Wallpaper();
const pointer = { x: innerWidth * 0.4, y: innerHeight * 0.3 };

let renderer: LiquidGlassRenderer;
try {
  renderer = new LiquidGlassRenderer(canvas, scene, glyphs.canvas);
} catch (e) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.textContent = String((e as Error).message ?? e);
  document.body.appendChild(d);
  throw e;
}

const toastEl = document.createElement('div');
toastEl.className = 'toast';
overlay.appendChild(toastEl);
let toastTimer = 0;
function toast(t: string): void {
  toastEl.textContent = t;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1800);
}

const desk: Desktop = {
  ui,
  settings,
  openApp: (id) => {
    if (id === 'finder' || id === 'photos' || id === 'notes') wm.open(id);
    else if (id === 'trash') toast('The Trash is empty');
    else toast('This icon only demonstrates the Dock');
  },
  focusedAppName: () => wm.focused?.title ?? 'Finder',
  toggleControlCenter: (force) => cc.toggle(force),
  toggleTestPanel: (from) => panel.toggle(undefined, from),
  closeMenus: () => {
    menubar.closeMenu();
    cc.toggle(false);
  },
  toast,
  setWallpaper: (id) => wallpaper.set(id),
  windowList: () => wm.list(),
  focusWindow: (id) => wm.open(id),
  arrangeWindows: () => wm.arrange(),
  closeFocused: () => wm.closeFocused(),
};

const wm = new WindowManager();
const widgetsOnDesk = new DesktopWidgets(wm);
const dock = new Dock(desk, wm);
const menubar = new MenuBar(desk);
const cc = new ControlCenter(desk, () => menubar.ccAnchor());
const panel = new TestPanel(overlay, settings, ui, wallpaper);
const lens = new Lens(ui);

/** Bottom -> top. Drawing, glass order and hit testing all follow this list. */
const widgets: Widget[] = [widgetsOnDesk, wm, dock, menubar, cc, panel, lens];
// Glass order: layer-0 shapes in z order, then layer-1 (lens, slider knobs).
const allShapes = (): GlassShape[] => [
  ...wm.shapes, ...widgetsOnDesk.shapes, ...dock.shapes, ...menubar.shapes, cc.shape, ...panel.shapes,
  ...lens.shapes, ...cc.knobs,
];

if (!new URLSearchParams(location.search).has('empty')) {
  wm.open('finder');
  wm.open('photos');
}

wallpaper.onChange = () => (flags.scene = true);
wallpaper.onError = toast;

function resize(): void {
  const vw = innerWidth;
  const vh = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.resize(vw, vh, dpr);
  scene.width = Math.round(vw * dpr);
  scene.height = Math.round(vh * dpr);
  glyphs.resize(vw, vh, dpr);
  wallpaper.resize(vw, vh, dpr);
  for (const w of widgets) w.layout(vw, vh);
  flags.scene = flags.glyphs = true;
}
addEventListener('resize', resize);
resize();

// ---------- input routing ----------
let active: Widget | null = null;
const topHit = (x: number, y: number): Widget | null => {
  for (let i = widgets.length - 1; i >= 0; i--) if (widgets[i].hit?.(x, y)) return widgets[i];
  return null;
};

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
}, { passive: true });

overlay.addEventListener('pointerdown', (e) => {
  if (e.target !== overlay) return;
  overlay.setPointerCapture(e.pointerId);
  const t = topHit(e.clientX, e.clientY);
  if ((menubar.menuOpen || cc.open) && t !== menubar && t !== cc) {
    desk.closeMenus();
    return;
  }
  active = t;
  t?.down?.(e.clientX, e.clientY);
});
overlay.addEventListener('pointermove', (e) => {
  if (active) active.move?.(e.clientX, e.clientY);
  else for (const w of widgets) w.hover?.(e.clientX, e.clientY);
});
const end = (e: PointerEvent) => {
  active?.up?.(e.clientX, e.clientY);
  active = null;
};
overlay.addEventListener('pointerup', end);
overlay.addEventListener('pointercancel', end);
overlay.addEventListener('pointerleave', () => {
  if (!active) for (const w of widgets) w.hover?.(-1, -1);
});
addEventListener('wheel', (e) => {
  e.preventDefault();
  const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
  for (let i = widgets.length - 1; i >= 0; i--) if (widgets[i].wheel?.(e.clientX, e.clientY, dy)) break;
}, { passive: false });

// Drop an image anywhere to use it as wallpaper
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) wallpaper.loadFile(f);
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') desk.closeMenus();
  if (e.key === 'd' && !(e.target instanceof HTMLInputElement)) {
    settings.debug = (settings.debug + 1) % DEBUG_MODES.length;
    toast('Debug view: ' + DEBUG_MODES[settings.debug]);
  }
});

// URL params for automated checks: ?wall=test&lens=1&cc=1&panel=1&menu=4&dark=1&debug=2
const qs = new URLSearchParams(location.search);
if (qs.has('wall')) wallpaper.set(qs.get('wall')!);
if (qs.has('lens')) ui.lens = true;
if (qs.has('dark')) ui.dark = true;
if (qs.has('debug')) settings.debug = Number(qs.get('debug')) || 0;
if (qs.has('notes')) wm.open('notes');

// ---------- frame loop ----------
let last = performance.now();
let lastLum = 0;
let fpsFrames = 0;
let fpsT = last;
let lastDark = ui.dark;
let lastBright = -1;
const frame: FrameInfo = { dt: 0, now: 0, vw: 0, vh: 0, lum, settings, ui, flags };
let startupDone = false;

function tick(now: number): void {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  fpsFrames++;
  if (now - fpsT > 500) {
    ui.fps = (fpsFrames * 1000) / (now - fpsT);
    fpsFrames = 0;
    fpsT = now;
  }
  if (ui.dark !== lastDark) {
    lastDark = ui.dark;
    flags.scene = flags.glyphs = true;
  }
  if (ui.brightness !== lastBright) {
    lastBright = ui.brightness;
    canvas.style.filter = ui.brightness < 0.999 ? `brightness(${ui.brightness.toFixed(3)})` : '';
  }

  frame.dt = dt;
  frame.now = now;
  frame.vw = innerWidth;
  frame.vh = innerHeight;
  for (const w of widgets) w.update(frame);

  const shapes = allShapes();
  if (shapes.some((s) => s.visible && !s.isSettled())) flags.glyphs = true;

  if (flags.scene) {
    flags.scene = false;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.drawImage(wallpaper.canvas, 0, 0);
    const dpr = scene.width / innerWidth;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const w of widgets) w.drawScene?.(sctx);
    renderer.uploadContent();
    if (now - lastLum > 100) {
      lastLum = now;
      lum.sample(scene, innerWidth, innerHeight);
    }
    flags.glyphs = true;
  }
  if (flags.glyphs) {
    flags.glyphs = false;
    const g = glyphs.begin();
    for (const w of widgets) w.drawGlyphs?.(g);
    renderer.uploadOverlay();
  }
  renderer.render(shapes, settings, pointer);

  if (!startupDone && now > 400) {
    startupDone = true;
    if (qs.has('cc')) cc.toggle(true);
    if (qs.has('panel')) panel.toggle(true);
    if (qs.has('menu')) (menubar as unknown as { openMenu(i: number): void }).openMenu(Number(qs.get('menu')));
    // ?ff=1 fast-forwards animations (for screenshots on slow software renderers)
    if (qs.has('ff')) {
      for (let i = 0; i < 180; i++) {
        frame.dt = 1 / 60;
        for (const w of widgets) w.update(frame);
      }
      flags.scene = flags.glyphs = true;
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
