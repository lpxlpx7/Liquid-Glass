import { FONT, mulberry32 } from './draw';

export const WALLPAPERS: { id: string; name: string }[] = [
  { id: 'island', name: 'Island' },
  { id: 'local', name: 'Local File' },
  { id: 'lake', name: 'Lake' },
  { id: 'bauhaus', name: 'Blocks' },
  { id: 'test', name: 'Test Chart' },
  { id: 'photo', name: 'Random Photo' },
];

/** Desktop wallpapers. Built-ins use flat colours only (no gradients). */
export class Wallpaper {
  readonly canvas = document.createElement('canvas');
  current = 'island';
  private triedLocal = false;
  private image: HTMLImageElement | null = null;
  private w = 1;
  private h = 1;
  private dpr = 1;
  onChange: () => void = () => {};
  onError: (msg: string) => void = () => {};

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.render();
    if (!this.triedLocal) {
      this.triedLocal = true;
      this.loadLocal(true);
    }
  }

  /** public/wallpaper.jpg, if the user put one there (e.g. their own copy of a macOS wallpaper). */
  private loadLocal(silent: boolean): void {
    const url = `${import.meta.env.BASE_URL}wallpaper.jpg?t=${Date.now()}`;
    const img = new Image();
    img.onload = () => {
      this.image = img;
      this.current = 'image';
      this.render();
    };
    img.onerror = () => {
      if (!silent) this.onError('public/wallpaper.jpg not found');
    };
    img.src = url;
  }

  set(id: string): void {
    if (id === 'photo') {
      this.loadRandomPhoto();
      return;
    }
    if (id === 'local') {
      this.loadLocal(false);
      return;
    }
    this.current = id;
    this.image = null;
    this.render();
  }

  loadFile(file: File): void {
    if (!file.type.startsWith('image/')) {
      this.onError('Not an image file');
      return;
    }
    this.loadUrl(URL.createObjectURL(file), 'Could not read the image');
  }

  private loadRandomPhoto(): void {
    const pw = Math.min(3000, Math.round(this.w * this.dpr));
    const ph = Math.min(2000, Math.round(this.h * this.dpr));
    this.loadUrl(`https://picsum.photos/${pw}/${ph}?random=${Date.now()}`, 'Random photo failed to load (needs internet)');
  }

  private loadUrl(url: string, err: string): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.image = img;
      this.current = 'image';
      this.render();
    };
    img.onerror = () => this.onError(err);
    img.src = url;
  }

  private render(): void {
    const c = this.canvas;
    c.width = Math.round(this.w * this.dpr);
    c.height = Math.round(this.h * this.dpr);
    const g = c.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { w, h } = this;
    if (this.current === 'image' && this.image) {
      const iw = this.image.naturalWidth;
      const ih = this.image.naturalHeight;
      const s = Math.max(w / iw, h / ih);
      g.drawImage(this.image, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
    } else if (this.current === 'bauhaus') bauhaus(g, w, h);
    else if (this.current === 'test') testChart(g, w, h);
    else if (this.current === 'lake') lake(g, w, h);
    else island(g, w, h);
    this.onChange();
  }
}

function ridge(g: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, seed: number, color: string): number[] {
  const rnd = mulberry32(seed);
  const n = 64;
  const pts = new Array(n + 1).fill(0);
  // midpoint displacement
  const step = (a: number, b: number, d: number) => {
    if (b - a < 2) return;
    const m = (a + b) >> 1;
    pts[m] = (pts[a] + pts[b]) / 2 + (rnd() - 0.5) * d;
    step(a, m, d * 0.55);
    step(m, b, d * 0.55);
  };
  pts[0] = rnd() * amp;
  pts[n] = rnd() * amp;
  step(0, n, amp * 1.6);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, h);
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const y = base - Math.abs(pts[i]);
    ys.push(y);
    g.lineTo((i / n) * w, y);
  }
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  return ys;
}

function lake(g: CanvasRenderingContext2D, w: number, h: number): void {
  const m = Math.min(w, h);
  g.fillStyle = '#9fcbe8';
  g.fillRect(0, 0, w, h);
  // sun
  g.fillStyle = '#fff1bf';
  g.beginPath();
  g.arc(w * 0.72, h * 0.2, m * 0.07, 0, Math.PI * 2);
  g.fill();
  // clouds
  const rnd = mulberry32(7);
  g.fillStyle = '#ffffff';
  for (let c = 0; c < 6; c++) {
    const cx = rnd() * w;
    const cy = h * (0.08 + rnd() * 0.25);
    const s = m * (0.03 + rnd() * 0.03);
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(cx + (k - 2) * s * 0.9, cy - Math.sin((k / 4) * Math.PI) * s * 0.7, s * (0.8 + rnd() * 0.4), 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(cx - s * 2.6, cy - s * 0.2, s * 5.2, s * 1.0);
  }
  // mountains
  const far = ridge(g, w, h, h * 0.52, h * 0.22, 3, '#7d9cc0');
  g.fillStyle = '#eef4fb';
  for (let i = 1; i < far.length - 1; i++) {
    if (far[i] < far[i - 1] && far[i] < far[i + 1] && far[i] < h * 0.42) {
      const x = (i / (far.length - 1)) * w;
      const s = w / 64;
      g.beginPath();
      g.moveTo(x, far[i]);
      g.lineTo(x - s * 1.6, far[i] + s * 1.6);
      g.lineTo(x - s * 0.5, far[i] + s * 1.2);
      g.lineTo(x + s * 0.3, far[i] + s * 1.7);
      g.lineTo(x + s * 1.6, far[i] + s * 1.6);
      g.closePath();
      g.fill();
    }
  }
  ridge(g, w, h, h * 0.6, h * 0.14, 11, '#58789e');
  ridge(g, w, h, h * 0.66, h * 0.08, 21, '#3c5a7c');
  // lake
  const ly = h * 0.68;
  g.fillStyle = '#4f8fbf';
  g.fillRect(0, ly, w, h - ly);
  const r2 = mulberry32(99);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r2() > 0.5 ? '#6aa6d2' : '#3f7cab';
    const y = ly + r2() * (h - ly);
    g.fillRect(r2() * w, y, w * (0.04 + r2() * 0.16), 2 + r2() * 2);
  }
  g.fillStyle = '#fbe7a1';
  for (let i = 0; i < 12; i++) {
    const y = ly + 10 + i * ((h - ly) / 16);
    const ww = m * 0.12 * (1 - i / 14) * (0.6 + r2() * 0.5);
    g.fillRect(w * 0.72 - ww / 2, y, ww, 3);
  }
  // shores with pines
  const shore = (fromLeft: boolean, seed: number) => {
    const r = mulberry32(seed);
    const sw = w * (0.22 + r() * 0.08);
    const x0 = fromLeft ? 0 : w - sw;
    g.fillStyle = '#28503a';
    g.beginPath();
    g.moveTo(fromLeft ? 0 : w, h);
    g.lineTo(fromLeft ? 0 : w, h * 0.8);
    g.lineTo(fromLeft ? sw : w - sw, h);
    g.closePath();
    g.fill();
    g.fillStyle = '#1d3d2b';
    for (let i = 0; i < 9; i++) {
      const t = r();
      const tx = x0 + t * sw * 0.8 + (fromLeft ? 0 : sw * 0.2);
      const edge = fromLeft ? 1 - t : t;
      const th = h * (0.1 + r() * 0.1) * (0.5 + edge * 0.6);
      const by = h * 0.86 + r() * h * 0.06;
      for (let k = 0; k < 3; k++) {
        const yy = by - (k * th) / 3;
        const ww = (th / 3) * (1 - k * 0.22);
        g.beginPath();
        g.moveTo(tx, yy - th / 2.2);
        g.lineTo(tx - ww / 1.6, yy);
        g.lineTo(tx + ww / 1.6, yy);
        g.closePath();
        g.fill();
      }
    }
  };
  shore(true, 5);
  shore(false, 8);
}

function bauhaus(g: CanvasRenderingContext2D, w: number, h: number): void {
  const pal = ['#f2e8d5', '#e63946', '#1d3557', '#f4a261', '#2a9d8f', '#e9c46a', '#264653', '#fefae0'];
  const rnd = mulberry32(42);
  const s = Math.max(90, Math.min(w, h) / 6);
  for (let y = 0; y < h; y += s)
    for (let x = 0; x < w; x += s) {
      const bg = pal[Math.floor(rnd() * pal.length)];
      let fg = pal[Math.floor(rnd() * pal.length)];
      if (fg === bg) fg = pal[(pal.indexOf(bg) + 3) % pal.length];
      g.fillStyle = bg;
      g.fillRect(x, y, s + 1, s + 1);
      g.fillStyle = fg;
      g.save();
      g.beginPath();
      g.rect(x, y, s, s);
      g.clip();
      const k = Math.floor(rnd() * 6);
      g.beginPath();
      if (k === 0) g.arc(x, y, s, 0, Math.PI * 2);
      else if (k === 1) g.arc(x + s / 2, y + s / 2, s * 0.32, 0, Math.PI * 2);
      else if (k === 2) g.arc(x + s / 2, y + s, s / 2, 0, Math.PI * 2);
      else if (k === 3) {
        g.moveTo(x, y);
        g.lineTo(x + s, y + s);
        g.lineTo(x, y + s);
      } else if (k === 4) {
        for (let i = 0; i < 4; i++) g.rect(x, y + (i * s) / 4, s, s / 8);
      } else {
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++) {
            g.moveTo(x + s * (0.2 + i * 0.3) + s * 0.07, y + s * (0.2 + j * 0.3));
            g.arc(x + s * (0.2 + i * 0.3), y + s * (0.2 + j * 0.3), s * 0.07, 0, Math.PI * 2);
          }
      }
      g.fill();
      g.restore();
    }
}

function testChart(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, w, h);
  const cols = w > h ? 4 : 2;
  const rows = 3;
  const cw = w / cols;
  const ch = h / rows;
  const cells: ((x: number, y: number, cw: number, ch: number) => void)[] = [
    (x, y, cw, ch) => {
      g.fillStyle = '#111';
      for (let i = 0; i < cw; i += 14) g.fillRect(x + i, y, 7, ch);
    },
    (x, y, cw, ch) => {
      const bars = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#111111'];
      bars.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(x + (i * cw) / bars.length, y, cw / bars.length + 1, ch);
      });
    },
    (x, y, cw, ch) => {
      const s = 22;
      for (let yy = 0; yy < ch; yy += s)
        for (let xx = 0; xx < cw; xx += s) {
          g.fillStyle = (Math.floor(xx / s) + Math.floor(yy / s)) % 2 ? '#111' : '#fff';
          g.fillRect(x + xx, y + yy, s, s);
        }
    },
    (x, y, cw, ch) => {
      // Siemens star
      const cx = x + cw / 2;
      const cy = y + ch / 2;
      const r = Math.min(cw, ch) * 0.45;
      g.fillStyle = '#fff';
      g.fillRect(x, y, cw, ch);
      g.fillStyle = '#111';
      const n = 36;
      for (let i = 0; i < n; i += 2) {
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
        g.closePath();
        g.fill();
      }
    },
    (x, y, cw, ch) => {
      g.fillStyle = '#0a84ff';
      g.fillRect(x, y, cw, ch);
      g.lineWidth = 5;
      for (let r = 8; r < Math.max(cw, ch); r += 16) {
        g.strokeStyle = (r / 16) % 2 < 1 ? '#fff' : '#ffd60a';
        g.beginPath();
        g.arc(x + cw / 2, y + ch / 2, r, 0, Math.PI * 2);
        g.stroke();
      }
    },
    (x, y, cw, ch) => {
      g.fillStyle = '#fff';
      g.fillRect(x, y, cw, ch);
      g.fillStyle = '#222';
      g.textBaseline = 'top';
      let yy = y + 14;
      for (let size = 30; size >= 9 && yy < y + ch - size; size -= 3) {
        g.font = `600 ${size}px ${FONT}`;
        g.fillText('Liquid Glass Aa Bb 0123', x + 12, yy);
        yy += size * 1.35;
      }
    },
    (x, y, cw, ch) => {
      g.fillStyle = '#111';
      for (let i = 0; i < ch; i += 12) g.fillRect(x, y + i, cw, 6);
    },
    (x, y, cw, ch) => {
      g.fillStyle = '#fff';
      g.fillRect(x, y, cw, ch);
      g.strokeStyle = '#e63946';
      g.lineWidth = 3;
      for (let i = -ch; i < cw; i += 16) {
        g.beginPath();
        g.moveTo(x + i, y + ch);
        g.lineTo(x + i + ch, y);
        g.stroke();
      }
    },
    (x, y, cw, ch) => {
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `hsl(${i * 30},90%,55%)`;
        g.fillRect(x + (i % 4) * (cw / 4), y + Math.floor(i / 4) * (ch / 3), cw / 4 + 1, ch / 3 + 1);
      }
    },
    (x, y, cw, ch) => {
      g.fillStyle = '#1d1d1f';
      g.fillRect(x, y, cw, ch);
      g.fillStyle = '#fff';
      for (let i = 0; i < 40; i++)
        for (let j = 0; j < 30; j++) {
          g.beginPath();
          g.arc(x + 10 + i * 18, y + 10 + j * 18, 3, 0, Math.PI * 2);
          g.fill();
        }
    },
    (x, y, cw, ch) => {
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const v = Math.round((i / (steps - 1)) * 255);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x + (i * cw) / steps, y, cw / steps + 1, ch);
      }
    },
    (x, y, cw, ch) => {
      g.fillStyle = '#ff9f0a';
      g.fillRect(x, y, cw, ch);
      g.strokeStyle = '#111';
      g.lineWidth = 1;
      for (let i = 0; i < cw; i += 10) {
        g.beginPath();
        g.moveTo(x + i + 0.5, y);
        g.lineTo(x + i + 0.5, y + ch);
        g.stroke();
      }
      for (let i = 0; i < ch; i += 10) {
        g.beginPath();
        g.moveTo(x, y + i + 0.5);
        g.lineTo(x + cw, y + i + 0.5);
        g.stroke();
      }
    },
  ];
  let k = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      g.save();
      g.beginPath();
      g.rect(c * cw, r * ch, cw, ch);
      g.clip();
      cells[k++ % cells.length](c * cw, r * ch, cw, ch);
      g.restore();
    }
  g.textBaseline = 'alphabetic';
}

/** Rocky island rising out of the sea, flat colour layers only. */
function island(g: CanvasRenderingContext2D, w: number, h: number): void {
  const m = Math.min(w, h);
  const hz = h * 0.6; // horizon
  // sky in flat bands
  const sky = ['#a7c8e2', '#b3d0e6', '#bfd7ea', '#cbdeed'];
  sky.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, (hz * i) / sky.length, w, hz / sky.length + 1);
  });
  // low clouds
  const rc = mulberry32(31);
  g.fillStyle = '#e8f0f6';
  for (let i = 0; i < 9; i++) {
    const cx = rc() * w;
    const cy = hz * (0.55 + rc() * 0.38);
    const s = m * (0.02 + rc() * 0.03);
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.ellipse(cx + (k - 2.5) * s * 1.1, cy - Math.sin((k / 5) * Math.PI) * s * 0.6, s * 1.4, s * 0.8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // distant hills on the horizon
  g.fillStyle = '#8fa9be';
  g.beginPath();
  g.moveTo(0, hz);
  for (let i = 0; i <= 20; i++) g.lineTo((i / 20) * w * 0.45, hz - Math.abs(Math.sin(i * 0.9)) * h * 0.015 - h * 0.006);
  g.lineTo(w * 0.45, hz);
  g.fill();
  // sea in flat bands + wave strokes
  const sea = ['#5f93b8', '#4f86ae', '#427aa3', '#376e98', '#2d628c'];
  sea.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, hz + ((h - hz) * i) / sea.length, w, (h - hz) / sea.length + 1);
  });
  const rw = mulberry32(77);
  for (let i = 0; i < 160; i++) {
    const y = hz + Math.pow(rw(), 1.4) * (h - hz);
    const depth = (y - hz) / (h - hz);
    g.fillStyle = rw() > 0.45 ? 'rgba(170,205,228,0.55)' : 'rgba(25,70,105,0.45)';
    g.fillRect(rw() * w, y, w * (0.01 + rw() * 0.05) * (0.4 + depth), 1 + depth * 2.5);
  }
  // island massif: layered rock polygons
  const ix = w * 0.56;
  const iw = w * 0.62;
  const peak = h * 0.2;
  const rr2 = mulberry32(5);
  const outline: [number, number][] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const prof = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9); // asymmetric dome
    const y = hz - (hz - peak) * prof * (0.86 + rr2() * 0.14) - (t > 0.55 && t < 0.62 ? h * 0.03 : 0);
    outline.push([ix - iw / 2 + t * iw, y]);
  }
  const poly = (pts: [number, number][], color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(pts[0][0], hz + 2);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(pts[pts.length - 1][0], hz + 2);
    g.closePath();
    g.fill();
  };
  poly(outline, '#3f4a55');
  // lit face (left side catches the light)
  poly(outline.slice(1, 26).map(([x, y], i) => [x + 2, Math.min(hz, y + (i / 26) * h * 0.02 + h * 0.012)]), '#5b6672');
  poly(outline.slice(2, 18).map(([x, y]) => [x + 6, Math.min(hz, y + h * 0.05)]), '#77828d');
  // vegetation on the upper slopes
  g.fillStyle = '#5e7752';
  for (let i = 3; i < n - 6; i++) {
    const [x, y] = outline[i];
    if (rr2() > 0.45) {
      g.beginPath();
      g.ellipse(x, y + h * 0.012, iw / n * 1.3, h * 0.01, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // cliff streaks
  for (let i = 0; i < 70; i++) {
    const t = 0.05 + rr2() * 0.9;
    const idx = Math.floor(t * n);
    const [x, y] = outline[idx];
    const top = y + h * 0.02;
    const len = (hz - top) * (0.3 + rr2() * 0.6);
    g.fillStyle = rr2() > 0.5 ? 'rgba(30,36,44,0.55)' : 'rgba(150,158,166,0.35)';
    g.fillRect(x, hz - len, 1.5 + rr2() * 3, len);
  }
  // small rock stack on the left
  g.fillStyle = '#3c4650';
  g.beginPath();
  g.moveTo(w * 0.12, hz + 2);
  g.lineTo(w * 0.135, hz - h * 0.06);
  g.lineTo(w * 0.15, hz - h * 0.075);
  g.lineTo(w * 0.17, hz - h * 0.04);
  g.lineTo(w * 0.19, hz + 2);
  g.fill();
  // surf where rock meets water
  g.fillStyle = '#e9f2f7';
  const rs = mulberry32(13);
  for (let i = 0; i < 60; i++) {
    const x = ix - iw / 2 + rs() * iw;
    g.fillRect(x, hz - 1 + rs() * 4, w * (0.004 + rs() * 0.02), 2);
  }
  for (let i = 0; i < 8; i++) g.fillRect(w * 0.12 + rs() * w * 0.07, hz + rs() * 3, w * 0.01, 2);
  // reflection of the island
  g.fillStyle = 'rgba(30,50,70,0.35)';
  for (let i = 0; i < 26; i++) {
    const y = hz + 4 + i * 5;
    const ww = iw * (0.8 - i * 0.025) * (0.7 + rs() * 0.3);
    g.fillRect(ix - ww / 2 + (rs() - 0.5) * 20, y, ww, 2);
  }
}
