# Using Liquid Glass in your own page

The glass is packaged as a small ES module, `liquid-glass.js` (about 9 kB gzipped, no dependencies). You mark elements with `data-glass` and the library renders glass behind them; the elements themselves stay ordinary HTML, so layout, text, links and buttons work as usual.

Live example: [examples/embed.html](https://liquidglass.jurina.org/examples/embed.html) (source in [`examples/`](../examples)).

## How it works, and the one limit to know first

Browsers do not let WebGL read the pixels of rendered HTML, so the glass cannot refract arbitrary page content. Instead you give it a **background**: an image, a video or a canvas. The library inserts a WebGL canvas as the first child of a container you choose (the *stage*), draws the background into it to cover the stage, and renders a piece of glass behind every `data-glass` element in the stage.

So the glass refracts the background and other glass, and your HTML sits on top. If you need the glass to refract changing content (a chart, a game, a map), draw that content into a canvas and pass the canvas as the background.

## 1. Get the file

Pick one:

- **Use the hosted build:**
  ```js
  import { LiquidGlass } from 'https://liquidglass.jurina.org/lib/liquid-glass.js';
  ```
- **Build it yourself:** run `npm install` and `npm run build:lib` in this repository, then copy `dist/lib/liquid-glass.js` into your site.
- **Bundler projects (Vite, webpack, ...):** copy `src/` into your project and import from `src/lib/index.ts`.

## 2. Mark up a stage

```html
<div class="stage" id="stage">
  <nav data-glass="regular" style="border-radius: 999px">...</nav>

  <section data-glass="dark" data-glass-squircle style="border-radius: 32px">
    <h1>Hello</h1>
    <button data-glass="tinted" data-glass-interactive style="border-radius: 999px">Go</button>
  </section>
</div>

<script type="module">
  import { LiquidGlass } from './liquid-glass.js';

  LiquidGlass.mount(document.getElementById('stage'), {
    background: 'photo.jpg',
  });
</script>
```

The stage can be any element: a full-screen `position: fixed` layer, a hero section or a single card. The glass canvas matches the stage's size, so keep the stage about the size of what is on screen; a stage thousands of pixels tall makes a canvas that big.

The library makes the stage `position: relative` if it is static, and gives each glass element `position: relative; z-index: 1` if it has no position or z-index, so the element sits above the canvas.

## 3. Attributes

| Attribute | Meaning |
|---|---|
| `data-glass="regular"` | Turn the element into glass. Value is a preset: `regular`, `clear`, `lens`, `dark`, `tinted`. |
| `data-glass-interactive` | Press feedback: the glass swells, clears up and glows under the pointer. |
| `data-glass-merge="20"` | Melt into the **previous** glass element (in DOM order) when they are closer than this many px. Chain several to make a group. |
| `data-glass-layer="1"` | Put the glass on the upper layer, where it refracts the background **and** the glass below it. Use it for lenses and floating knobs. |
| `data-glass-radius="18"` | Corner radius in px. By default the element's CSS `border-radius` is used. |
| `data-glass-squircle` | Continuous ("squircle") corners, like Apple's, instead of circular ones. |

Position, size, `border-radius` and `visibility: hidden` are read from the element every frame, so CSS transitions, transforms and animations move the glass with the element.

## 4. JavaScript API

```ts
const glass = LiquidGlass.mount(stage, {
  background,          // string URL | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  settings,            // optional global multipliers, see below
  selector,            // default '[data-glass]'
  maxDpr,              // default 2; lower it for weak GPUs
  liveBackground,      // re-upload the background every frame (for canvases you keep drawing)
  onError,             // (message) => void, e.g. when an image fails to load
});

glass.add(el, { preset: 'clear', interactive: true, layer: 0, merge: 0, radius: 20, squircle: false,
                material: { refraction: 30, tint: [1, 0.8, 0.9, 0.2] } });  // returns the GlassShape
glass.remove(el);
glass.scan();                 // pick up data-glass elements added later
glass.setBackground(src);     // swap the background
glass.invalidate();           // you drew into the canvas background: upload it again
glass.settings.blur = 16;     // change global settings at any time
glass.destroy();
```

A video background is re-uploaded automatically while it plays. For a canvas that changes, call `invalidate()` after drawing, or mount with `liveBackground: true`.

### Materials

Each preset is a `Material`. Override any field with `material` in `add()`:

| Field | Meaning |
|---|---|
| `frost` | 0 clear, 1 fully blurred backdrop |
| `refraction` | Maximum displacement at the rim, in px |
| `bezel` | Width of the curved rim, in px; refraction happens inside it |
| `dispersion` | Colour fringing at the rim, 0 to 1 |
| `magnify` | Magnification of the whole shape (1 = none) |
| `specular` | Strength of rim light and sheen |
| `tint` | `[r, g, b, amount]`, each 0 to 1 |
| `saturation`, `brightness` | Applied to what is seen through the glass |
| `shadow` | Drop shadow opacity |
| `radius`, `cornerPower`, `merge` | Shape: corner radius, 2 = circular / 2.7 = squircle, smooth-union radius |

### Global settings

`glass.settings` multiplies every material, which is handy for a theme or a settings screen:

`blur` (backdrop blur sigma in px), `frost`, `refraction`, `bezel`, `dispersion`, `specular`, `saturation`, `shadow`, `merge`, `rimWidth`, `lightAngle` (degrees, -135 = light from the top left), `followPointer` (the highlight faces the pointer), `debug` (0 normal, 1 displacement, 2 normals, 3 SDF).

## Backgrounds from other domains

Images from another origin must be served with CORS headers (`Access-Control-Allow-Origin`), otherwise WebGL refuses to read them and `onError` fires. Images from your own site always work. The library sets `crossOrigin = 'anonymous'` on URLs it loads; if you pass an `<img>` element yourself, set `crossorigin="anonymous"` on it.

## Performance

- The shader runs for every pixel of the stage. A full-screen stage at 2x density on a 4K display is a lot of pixels; set `maxDpr: 1` if it gets slow.
- Up to 20 glass elements per layer are rendered. Glass elements in the same merge group are cheaper than separate ones.
- Static images and canvases are uploaded once; only videos and `liveBackground` canvases are uploaded every frame.

## Browser support

Any browser with WebGL2: current Chrome, Edge, Firefox and Safari (15+), on desktop and mobile. Without WebGL2, `mount` throws an error; catch it and keep a plain CSS fallback such as `backdrop-filter: blur()`.
