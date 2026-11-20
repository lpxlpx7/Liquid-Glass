# Liquid Glass

A WebGL2 + TypeScript take on Apple's Liquid Glass material, shown on a macOS-style test desktop.

- Desktop demo: https://liquidglass.jurina.org/
- Embedding example: https://liquidglass.jurina.org/examples/embed.html

Both need a browser with WebGL2. There are no runtime dependencies; Vite is only used for development and bundling.

## Use it in your own page

```html
<div id="stage">
  <nav data-glass="regular">...</nav>
  <button data-glass="clear" data-glass-interactive>Press me</button>
</div>
<script type="module">
  import { LiquidGlass } from 'https://liquidglass.jurina.org/lib/liquid-glass.js';
  LiquidGlass.mount(document.getElementById('stage'), { background: 'photo.jpg' });
</script>
```

Every `data-glass` element gets a piece of glass that follows its position, size and border-radius. The glass refracts the background you pass in (an image, video or canvas), not live HTML. See [docs/EMBEDDING.md](docs/EMBEDDING.md) for attributes, presets, materials, the JavaScript API and limits.

## Run

```
npm install
npm run dev
```

`npm run build` type-checks and writes the demo, the example page and the library (`dist/lib/liquid-glass.js`) to `dist/`. `npm run build:lib` builds only the library. Every push to `main` is built and deployed to GitHub Pages by `.github/workflows/pages.yml`.

## What the glass does

All of it happens per pixel in one fragment shader (`src/gl/shaders.ts`):

- **Refraction.** Each shape is a rounded rectangle (circular or continuous "squircle" corners) described by a signed distance field. A convex height profile across the rim gives a surface slope; the backdrop is sampled displaced inward along the normal, strongest at the edge and zero in the flat middle. Optional magnification.
- **Chromatic dispersion.** R, G and B are sampled with slightly different displacement, so edges pick up a thin colored fringe.
- **Frost and vibrancy.** The backdrop is downsampled and blurred with a separable Gaussian; each shape mixes sharp and blurred samples, then boosts saturation and applies a tint.
- **Lighting.** A thin rim light that is bright on the side facing the light and dimmer on the opposite side, a Blinn-Phong sheen on the curved bezel, and a Fresnel term. The light can follow the pointer.
- **Merging.** Shapes in the same group are combined with a smooth-min, so they melt together like droplets (menus growing out of the menu bar). Separate groups are composited in z order with their own soft shadows.
- **Two layers.** Layer 1 (the lens, slider knobs) refracts the finished layer-0 result, including the icons drawn on layer-0 glass.
- **Motion.** Geometry and material are driven by SwiftUI-style springs (`response` / `dampingFraction`): squash and stretch from velocity, press-to-lift with overshoot, and a glow that spreads from the touch point.
- **Adaptive appearance.** A low-resolution luminance probe of the backdrop switches glass tint and text color between light and dark.

## The test desktop

- Menu bar with working menus (View has debug views, lens, FPS and Dark Mode toggles).
- Finder, Photos and Notes windows: drag, focus, close, zoom, scroll. The focused window has a glass sidebar and toolbar; Photos scrolls under the sidebar.
- Dock with hover magnification, launch bounce and running indicators.
- Control Center with toggles and brightness/volume sliders whose knobs turn into lenses while held.
- Phone Demo window with the iOS 26 style floating tab bar: press or drag the selection and it lifts into a clear, magnifying lens that stretches as it moves and settles on the nearest tab. Content scrolls under the bar (wheel or drag).
- Clock and calendar widgets (they go flat when a window covers them).
- Test Panel (Dock icon) with every glass parameter, wallpaper switcher and FPS.
- Draggable liquid lens (menu bar icon), with throw momentum.

Keyboard: `D` cycles debug views, `Esc` closes menus.

### Wallpapers

Built-in wallpapers are drawn with flat colors: Island (default), Lake, Blocks and a Test Chart. "Random Photo" loads one from picsum.photos.

To use your own picture, drop it on the page, use "Upload Image" in the Test Panel, or save it as `public/wallpaper.jpg`; that file is loaded automatically on start and is ignored by git. For a macOS wallpaper, copy it from `/System/Library/Desktop Pictures/` on your Mac and export it as JPG (Chrome cannot decode HEIC). Apple's wallpapers are copyrighted, so they are not included here.

### URL parameters

Useful for screenshots and automated checks:

| Parameter | Effect |
|---|---|
| `empty=1` | Start with no windows |
| `notes=1` | Also open Notes |
| `cc=1` | Open Control Center |
| `panel=1` | Open the Test Panel |
| `menu=N` | Open menu N (4 = View) |
| `lens=1` | Show the lens |
| `dark=1` | Dark Mode |
| `wall=test` | Wallpaper id: `island`, `lake`, `bauhaus`, `test`, `photo`, `local` |
| `debug=N` | 0 normal, 1 displacement, 2 normals, 3 SDF |
| `ff=1` | Fast-forward opening animations |

## Layout

```
src/
  core/Spring.ts            spring physics
  gl/                       shaders and WebGL helpers
  glass/                    renderer, GlassShape, materials, global settings
  scene/                    glyph layer (icons on glass), luminance probe
  desktop/                  menu bar, windows, phone + tab bar, dock, control center, widgets, test panel, lens, wallpapers
  lib/                      embeddable LiquidGlass API (built to dist/lib/liquid-glass.js)
  main.ts                   wiring, input routing, frame loop
examples/                   embedding example page
docs/EMBEDDING.md           how to use the glass in other pages
```

This is an independent demo and is not affiliated with Apple. Icons and app content are drawn in code.

## License

GPL-3.0, see `LICENSE`.
