import { GlassShape } from '../glass/GlassShape';
import { GlassSettings } from '../glass/settings';
import { LuminanceSampler } from '../scene/Luminance';

export interface UIState {
  dark: boolean;
  brightness: number;
  volume: number;
  wifi: boolean;
  bluetooth: boolean;
  hotspot: boolean;
  lens: boolean;
  showFps: boolean;
  fps: number;
}

export interface Flags {
  /** Backdrop (wallpaper + windows) must be redrawn and re-uploaded. */
  scene: boolean;
  /** Glyph layer (text/icons on glass) must be redrawn. */
  glyphs: boolean;
}

export interface FrameInfo {
  dt: number;
  now: number;
  vw: number;
  vh: number;
  lum: LuminanceSampler;
  settings: GlassSettings;
  ui: UIState;
  flags: Flags;
}

/**
 * Everything on the desktop is a Widget. Pointer events are routed centrally:
 * the topmost widget whose `hit` returns true receives down/move/up.
 */
export interface Widget {
  readonly shapes: GlassShape[];
  layout(vw: number, vh: number): void;
  update(f: FrameInfo): void;
  /** Draw into the backdrop (refracted by glass). */
  drawScene?(ctx: CanvasRenderingContext2D): void;
  /** Draw text/icons sitting on the glass. */
  drawGlyphs?(ctx: CanvasRenderingContext2D): void;
  hit?(x: number, y: number): boolean;
  down?(x: number, y: number): void;
  move?(x: number, y: number): void;
  up?(x: number, y: number): void;
  /** Pointer hover (no button pressed). Called on every widget. */
  hover?(x: number, y: number): void;
  wheel?(x: number, y: number, dy: number): boolean;
}

export interface WindowInfo {
  id: string;
  title: string;
  open: boolean;
  focused: boolean;
}

/** Cross-widget actions, wired up in main.ts. */
export interface Desktop {
  ui: UIState;
  settings: GlassSettings;
  openApp(id: string): void;
  focusedAppName(): string;
  toggleControlCenter(force?: boolean): void;
  toggleTestPanel(from?: { x: number; y: number }): void;
  closeMenus(): void;
  toast(text: string): void;
  setWallpaper(id: string): void;
  windowList(): WindowInfo[];
  focusWindow(id: string): void;
  arrangeWindows(): void;
  closeFocused(): void;
}

/** Light/dark appearance switch with hysteresis so it doesn't flicker near the threshold. */
export function hysteresis(current: number, lum: number): number {
  if (lum > 0.6) return 1;
  if (lum < 0.42) return 0;
  return current;
}
