import { BLUR_FS, COMPOSITE_FS, DOWNSAMPLE_FS, FULLSCREEN_VS, MAX_SHAPES } from '../gl/shaders';
import { Program, Target, createProgram, createTarget, createTexture, resizeTarget } from '../gl/glUtils';
import { GlassShape } from './GlassShape';
import { GlassSettings } from './settings';

const BLUR_SCALE = 0.25;

/**
 * WebGL2 renderer. Pipeline per frame:
 *   content canvas -> texture (only when it changed)
 *   -> downsample + separable gaussian (backdrop blur, only when needed)
 *   -> layer 0 glass composite (+ glyph overlay)  -> [texture]
 *   -> layer 1 glass composite refracting layer 0  -> screen
 */
export class LiquidGlassRenderer {
  readonly gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private composite: Program;
  private down: Program;
  private blur: Program;
  private contentTex: WebGLTexture;
  private overlayTex: WebGLTexture;
  private blurA: Target;
  private blurB: Target;
  private layerTarget: Target;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private blurDirty = true;
  private lastBlur = -1;

  private geo = new Float32Array(MAX_SHAPES * 4);
  private m0 = new Float32Array(MAX_SHAPES * 4);
  private m1 = new Float32Array(MAX_SHAPES * 4);
  private m2 = new Float32Array(MAX_SHAPES * 4);
  private m3 = new Float32Array(MAX_SHAPES * 4);
  private m4 = new Float32Array(MAX_SHAPES * 4);

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly content: HTMLCanvasElement,
    private readonly overlay: HTMLCanvasElement,
  ) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('This browser does not support WebGL2');
    this.gl = gl;
    this.vao = gl.createVertexArray()!;
    this.composite = createProgram(gl, FULLSCREEN_VS, COMPOSITE_FS);
    this.down = createProgram(gl, FULLSCREEN_VS, DOWNSAMPLE_FS);
    this.blur = createProgram(gl, FULLSCREEN_VS, BLUR_FS);
    this.contentTex = createTexture(gl);
    this.overlayTex = createTexture(gl);
    this.blurA = createTarget(gl);
    this.blurB = createTarget(gl);
    this.layerTarget = createTarget(gl);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.width = Math.max(1, Math.round(cssW * dpr));
    this.height = Math.max(1, Math.round(cssH * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    const bw = Math.max(1, Math.round(this.width * BLUR_SCALE));
    const bh = Math.max(1, Math.round(this.height * BLUR_SCALE));
    resizeTarget(this.gl, this.blurA, bw, bh);
    resizeTarget(this.gl, this.blurB, bw, bh);
    resizeTarget(this.gl, this.layerTarget, this.width, this.height);
    this.blurDirty = true;
  }

  private upload(tex: WebGLTexture, src: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  uploadContent(): void {
    this.upload(this.contentTex, this.content);
    this.blurDirty = true;
  }

  uploadOverlay(): void {
    this.upload(this.overlayTex, this.overlay);
  }

  private bindTarget(t: Target | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : this.width, t ? t.h : this.height);
  }

  private computeBlur(sigmaCss: number): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);

    this.bindTarget(this.blurA);
    gl.useProgram(this.down.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.contentTex);
    gl.uniform1i(this.down.u('u_src'), 0);
    gl.uniform2f(this.down.u('u_texel'), 1 / this.width, 1 / this.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const sigma = sigmaCss * this.dpr * BLUR_SCALE;
    gl.useProgram(this.blur.prog);
    gl.uniform1i(this.blur.u('u_src'), 0);
    gl.uniform1f(this.blur.u('u_sigma'), sigma);

    this.bindTarget(this.blurB);
    gl.bindTexture(gl.TEXTURE_2D, this.blurA.tex);
    gl.uniform2f(this.blur.u('u_dir'), 1 / this.blurA.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.bindTarget(this.blurA);
    gl.bindTexture(gl.TEXTURE_2D, this.blurB.tex);
    gl.uniform2f(this.blur.u('u_dir'), 0, 1 / this.blurA.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private pack(shapes: GlassShape[], s: GlassSettings): number {
    const d = this.dpr;
    const n = Math.min(shapes.length, MAX_SHAPES);
    for (let i = 0; i < n; i++) {
      const sh = shapes[i];
      const m = sh.mat;
      const o = i * 4;
      this.geo.set([sh.cx * d, sh.cy * d, sh.hw * d, sh.hh * d], o);
      this.m0.set([m.radius * d, m.merge * d * s.merge, Math.min(1, m.frost * s.frost), m.refraction * d * s.refraction], o);
      this.m1.set(m.tint, o);
      this.m2.set([Math.min(1.5, m.dispersion * s.dispersion), m.specular * s.specular, m.magnify, m.cornerPower], o);
      this.m3.set([m.bezel * d * s.bezel, 1 + (m.saturation - 1) * s.saturation, m.brightness, Math.min(1, m.shadow * s.shadow)], o);
      this.m4.set([sh.glowX * d, sh.glowY * d, sh.glow.value, sh.glowRadius * d], o);
    }
    return n;
  }

  private drawLayer(shapes: GlassShape[], s: GlassSettings, src: WebGLTexture, blur: WebGLTexture,
                    target: Target | null, useOverlay: boolean): void {
    const gl = this.gl;
    const p = this.composite;
    this.bindTarget(target);
    const n = this.pack(shapes, s);
    gl.uniform1i(p.u('u_count'), n);
    gl.uniform1i(p.u('u_toTexture'), target ? 1 : 0);
    gl.uniform1i(p.u('u_useOverlay'), useOverlay ? 1 : 0);
    gl.uniform4fv(p.u('u_geo'), this.geo);
    gl.uniform4fv(p.u('u_m0'), this.m0);
    gl.uniform4fv(p.u('u_m1'), this.m1);
    gl.uniform4fv(p.u('u_m2'), this.m2);
    gl.uniform4fv(p.u('u_m3'), this.m3);
    gl.uniform4fv(p.u('u_m4'), this.m4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blur);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(shapes: GlassShape[], s: GlassSettings, pointer: { x: number; y: number }): void {
    const gl = this.gl;
    if (this.blurDirty || s.blur !== this.lastBlur) {
      this.computeBlur(s.blur);
      this.blurDirty = false;
      this.lastBlur = s.blur;
    }

    const visible = shapes.filter((x) => x.visible && x.hw > 0.5 && x.hh > 0.5);
    const l0 = visible.filter((x) => x.layer === 0);
    const l1 = visible.filter((x) => x.layer === 1);

    gl.bindVertexArray(this.vao);
    const p = this.composite;
    gl.useProgram(p.prog);
    const d = this.dpr;
    const a = (s.lightAngle * Math.PI) / 180;
    gl.uniform1i(p.u('u_tex'), 0);
    gl.uniform1i(p.u('u_blur'), 1);
    gl.uniform1i(p.u('u_overlay'), 2);
    gl.uniform2f(p.u('u_res'), this.width, this.height);
    gl.uniform2f(p.u('u_lightDir'), Math.cos(a), Math.sin(a));
    gl.uniform2f(p.u('u_pointer'), pointer.x * d, pointer.y * d);
    gl.uniform1f(p.u('u_follow'), s.followPointer ? 0.85 : 0);
    gl.uniform2f(p.u('u_shadowOffset'), 0, 6 * d);
    gl.uniform1f(p.u('u_shadowBlur'), 16 * d);
    gl.uniform1f(p.u('u_rimWidth'), s.rimWidth * d);
    gl.uniform1i(p.u('u_debug'), s.debug);

    if (l1.length === 0) {
      this.drawLayer(l0, s, this.contentTex, this.blurA.tex, null, true);
    } else {
      this.drawLayer(l0, s, this.contentTex, this.blurA.tex, this.layerTarget, true);
      this.drawLayer(l1, s, this.layerTarget.tex, this.layerTarget.tex, null, false);
    }
  }
}
