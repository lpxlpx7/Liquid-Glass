/**
 * Low-resolution luminance probe of the backdrop. Used for Apple's adaptive
 * behaviour: glass and its glyphs flip between light and dark appearance
 * depending on what is underneath.
 */
export class LuminanceSampler {
  private c = document.createElement('canvas');
  private ctx = this.c.getContext('2d', { willReadFrequently: true })!;
  private data: Uint8ClampedArray | null = null;
  private sw = 64;
  private sh = 36;
  private vw = 1;
  private vh = 1;

  sample(src: HTMLCanvasElement, vw: number, vh: number): void {
    this.vw = vw;
    this.vh = vh;
    this.sw = 64;
    this.sh = Math.max(1, Math.round((64 * vh) / vw));
    if (this.c.width !== this.sw || this.c.height !== this.sh) {
      this.c.width = this.sw;
      this.c.height = this.sh;
    }
    this.ctx.drawImage(src, 0, 0, this.sw, this.sh);
    this.data = this.ctx.getImageData(0, 0, this.sw, this.sh).data;
  }

  /** Average relative luminance (0..1) of a CSS-px rect. */
  at(x: number, y: number, w: number, h: number): number {
    const d = this.data;
    if (!d) return 0.3;
    const x0 = Math.max(0, Math.floor((x / this.vw) * this.sw));
    const x1 = Math.min(this.sw - 1, Math.ceil(((x + w) / this.vw) * this.sw));
    const y0 = Math.max(0, Math.floor((y / this.vh) * this.sh));
    const y1 = Math.min(this.sh - 1, Math.ceil(((y + h) / this.vh) * this.sh));
    let sum = 0;
    let n = 0;
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const i = (yy * this.sw + xx) * 4;
        sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        n++;
      }
    return n ? sum / n : 0.3;
  }
}
