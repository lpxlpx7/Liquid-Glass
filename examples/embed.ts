// In your own project import from the built file instead:
//   import { LiquidGlass } from './liquid-glass.js';
import { LiquidGlass } from '../src/lib';

/** A flat-colour pattern with lots of edges, so refraction is easy to see. */
function pattern(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 1000;
  const g = c.getContext('2d')!;
  const pal = ['#f2e8d5', '#e63946', '#1d3557', '#f4a261', '#2a9d8f', '#e9c46a', '#264653'];
  const s = 125;
  let k = 7;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < c.height; y += s)
    for (let x = 0; x < c.width; x += s) {
      g.fillStyle = pal[Math.floor(rnd() * pal.length)];
      g.fillRect(x, y, s, s);
      g.fillStyle = pal[Math.floor(rnd() * pal.length)];
      g.beginPath();
      const t = Math.floor(rnd() * 3);
      if (t === 0) g.arc(x, y, s, 0, Math.PI / 2);
      else if (t === 1) g.arc(x + s / 2, y + s / 2, s * 0.32, 0, Math.PI * 2);
      else for (let i = 0; i < 4; i++) g.rect(x, y + (i * s) / 4, s, s / 8);
      g.fill();
    }
  return c;
}

const stage = document.getElementById('stage')!;
const bgPattern = pattern();
const glass = LiquidGlass.mount(stage, {
  background: bgPattern,
  onError: (msg) => console.warn(msg),
});

document.getElementById('bg-pattern')!.addEventListener('click', () => glass.setBackground(bgPattern));
document.getElementById('bg-photo')!.addEventListener('click', () =>
  glass.setBackground('https://picsum.photos/id/1015/1920/1200'),
);

// Draggable lens: move the element; the glass follows it automatically.
const lens = document.getElementById('lens')!;
let lx = innerWidth * 0.68;
let ly = innerHeight * 0.3;
const placeLens = () => (lens.style.transform = `translate(${lx - 60}px, ${ly - 60}px)`);
placeLens();
let drag: { dx: number; dy: number } | null = null;
lens.addEventListener('pointerdown', (e) => {
  lens.setPointerCapture(e.pointerId);
  drag = { dx: e.clientX - lx, dy: e.clientY - ly };
});
lens.addEventListener('pointermove', (e) => {
  if (!drag) return;
  lx = e.clientX - drag.dx;
  ly = e.clientY - drag.dy;
  placeLens();
});
lens.addEventListener('pointerup', () => (drag = null));
document.getElementById('toggle-lens')!.addEventListener('click', () => {
  lens.style.visibility = lens.style.visibility === 'hidden' ? '' : 'hidden';
});
