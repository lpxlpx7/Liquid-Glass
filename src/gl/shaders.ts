export const MAX_SHAPES = 20;

/** Full-screen triangle, no vertex buffers. v_uv: (0,0) bottom-left. */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** 4-tap bilinear box downsample. */
export const DOWNSAMPLE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 outColor;
void main() {
  vec2 o = u_texel;
  outColor = 0.25 * (
    texture(u_src, v_uv + vec2(-o.x, -o.y)) + texture(u_src, v_uv + vec2(o.x, -o.y)) +
    texture(u_src, v_uv + vec2(-o.x,  o.y)) + texture(u_src, v_uv + vec2(o.x,  o.y)));
}`;

/** Separable gaussian. */
export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform float u_sigma;
out vec4 outColor;
void main() {
  if (u_sigma < 0.3) { outColor = texture(u_src, v_uv); return; }
  int r = int(min(ceil(u_sigma * 3.0), 48.0));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -48; i <= 48; i++) {
    if (i < -r || i > r) continue;
    float fi = float(i);
    float w = exp(-fi * fi / (2.0 * u_sigma * u_sigma));
    acc += texture(u_src, v_uv + u_dir * fi) * w;
    wsum += w;
  }
  outColor = acc / wsum;
}`;

/**
 * The Liquid Glass compositor.
 *
 * For every pixel:
 *  1. Evaluate a signed distance field of all glass shapes (rounded rects with
 *     circular or squircle corners) combined with a smooth-min -> pieces of glass
 *     that come close melt together like liquid, material params blend along.
 *  2. Inside the glass, derive a convex "squircle" height profile from the
 *     distance to the rim; its slope gives a 3D surface normal.
 *  3. Refraction: sample the backdrop displaced along the normal (strongest at
 *     the rim, zero in the flat center) + optional magnification.
 *     R/G/B use slightly different displacement = chromatic dispersion.
 *  4. Mix sharp vs. blurred backdrop (frost), vibrancy (saturation), tint.
 *  5. Lighting: Blinn-Phong sheen on the curved rim, thin directional rim light
 *     (bright on the lit side, dimmer on the opposite side), Fresnel, touch glow.
 *  6. Soft drop shadow outside, analytic anti-aliasing at the edge.
 */
export const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
#define MAX_SHAPES ${MAX_SHAPES}

uniform sampler2D u_tex;
uniform sampler2D u_blur;
uniform sampler2D u_overlay;
uniform int u_useOverlay;
uniform vec2 u_res;
uniform int u_count;
uniform int u_toTexture;

uniform vec4 u_geo[MAX_SHAPES]; // cx, cy, halfW, halfH
uniform vec4 u_m0[MAX_SHAPES];  // radius, merge, frost, refraction
uniform vec4 u_m1[MAX_SHAPES];  // tint rgba
uniform vec4 u_m2[MAX_SHAPES];  // dispersion, specular, magnify, cornerPower
uniform vec4 u_m3[MAX_SHAPES];  // bezel, saturation, brightness, shadow
uniform vec4 u_m4[MAX_SHAPES];  // glowX, glowY, glowIntensity, glowRadius

uniform vec2 u_lightDir;
uniform vec2 u_pointer;
uniform float u_follow;
uniform vec2 u_shadowOffset;
uniform float u_shadowBlur;
uniform float u_rimWidth;
uniform int u_debug;

out vec4 outColor;

struct Mat { vec4 geo; vec4 m0; vec4 m1; vec4 m2; vec4 m3; };

float sdShape(vec2 p, vec4 geo, float radius, float pw) {
  vec2 hs = geo.zw;
  float r = min(radius, min(hs.x, hs.y));
  vec2 q = abs(p - geo.xy) - hs + r;
  vec2 m = max(q, 0.0);
  float c;
  if (pw <= 2.001) {
    c = length(m);
  } else {
    // superellipse corner -> continuous curvature ("squircle") like Apple's shapes
    vec2 mn = m / max(r, 1e-3);
    c = pow(pow(mn.x, pw) + pow(mn.y, pw), 1.0 / pw) * r;
  }
  return c + min(max(q.x, q.y), 0.0) - r;
}

// A "group" is a run of consecutive shapes where each follower has merge > 0.5px:
// members melt together with smooth-min. Separate groups are composited in z order.
float groupD(vec2 p, int s, int e) {
  float d = 1e5;
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i < s) continue;
    if (i >= e) break;
    float di = sdShape(p, u_geo[i], u_m0[i].x, u_m2[i].w);
    if (i == s) { d = di; continue; }
    float k = max(u_m0[i].y, 1e-4);
    float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0);
    d = mix(di, d, h) - k * h * (1.0 - h);
  }
  return d;
}

float groupFull(vec2 p, int s, int e, out Mat M) {
  float d = 1e5;
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i < s) continue;
    if (i >= e) break;
    float di = sdShape(p, u_geo[i], u_m0[i].x, u_m2[i].w);
    if (i == s) {
      d = di;
      M.geo = u_geo[i]; M.m0 = u_m0[i]; M.m1 = u_m1[i]; M.m2 = u_m2[i]; M.m3 = u_m3[i];
      continue;
    }
    float k = max(u_m0[i].y, 1e-4);
    float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0);
    d = mix(di, d, h) - k * h * (1.0 - h);
    M.geo = mix(u_geo[i], M.geo, h);
    M.m0 = mix(u_m0[i], M.m0, h);
    M.m1 = mix(u_m1[i], M.m1, h);
    M.m2 = mix(u_m2[i], M.m2, h);
    M.m3 = mix(u_m3[i], M.m3, h);
  }
  return d;
}

vec3 sampleRGB(sampler2D t, vec2 pr, vec2 pg, vec2 pb) {
  return vec3(texture(t, pr / u_res).r, texture(t, pg / u_res).g, texture(t, pb / u_res).b);
}

vec3 applyOverlay(vec3 c, vec2 uv) {
  if (u_useOverlay == 0) return c;
  vec4 o = texture(u_overlay, uv);
  return mix(c, o.rgb, o.a);
}

vec3 shadeGlass(vec2 p, int s, int e, float d, Mat M) {
  // ---- surface normal from SDF gradient ----
  const float eps = 1.0;
  vec2 grad = vec2(groupD(p + vec2(eps, 0.0), s, e) - groupD(p - vec2(eps, 0.0), s, e),
                   groupD(p + vec2(0.0, eps), s, e) - groupD(p - vec2(0.0, eps), s, e));
  vec2 n = dot(grad, grad) > 1e-8 ? normalize(grad) : vec2(0.0);

  // ---- convex squircle height profile across the bezel ----
  float t = max(-d, 0.0);
  float bezel = max(M.m3.x, 1.0);
  float x = clamp(t / bezel, 0.0, 1.0);
  float omx = 1.0 - x;
  float o4 = omx * omx * omx * omx;
  float hgt = pow(max(1.0 - o4, 0.0), 0.25);
  float slope = omx * omx * omx * pow(max(1.0 - o4, 1e-3), -0.75);

  // ---- refraction + dispersion + magnification ----
  float mag = M.m0.w * (1.0 - hgt);
  vec2 dir = -n; // convex lens bends light inwards
  float disp = M.m2.x;
  vec2 center = M.geo.xy;
  vec2 sc = center + (p - center) / max(M.m2.z, 0.05);
  vec2 pr = sc + dir * mag * (1.0 - disp);
  vec2 pg = sc + dir * mag;
  vec2 pb = sc + dir * mag * (1.0 + disp);

  float frost = M.m0.z;
  vec3 c = frost < 0.999 ? sampleRGB(u_tex, pr, pg, pb) : vec3(0.0);
  if (frost > 0.001) c = mix(c, sampleRGB(u_blur, pr, pg, pb), frost);

  // ---- vibrancy, brightness, tint ----
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lum), c, M.m3.y);
  c *= M.m3.z;
  c = mix(c, M.m1.rgb, M.m1.a);

  // ---- lighting ----
  vec2 toPtr = u_pointer - center;
  vec2 ptrDir = dot(toPtr, toPtr) > 1.0 ? normalize(toPtr) : u_lightDir;
  vec2 lxy = normalize(mix(u_lightDir, ptrDir, u_follow) + 1e-5);
  vec3 L = normalize(vec3(lxy, 0.75));
  float tilt = min(slope, 8.0) * 0.2;
  vec3 N = normalize(vec3(n * tilt, 1.0));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 48.0) * step(0.02, tilt);
  float side = dot(n, lxy);
  float rimMask = 1.0 - smoothstep(0.0, u_rimWidth, t);
  float rim = rimMask * (0.16 + 0.95 * pow(max(side, 0.0), 1.4) + 0.55 * pow(max(-side, 0.0), 1.4));
  float fres = pow(1.0 - N.z, 1.6) * (0.55 + 0.45 * side);
  c += vec3(1.0) * M.m2.y * (spec * 0.55 + rim * 0.9 + fres * 0.45);

  // ---- interactive touch glow ----
  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i < s) continue;
    if (i >= e) break;
    vec4 g4 = u_m4[i];
    if (g4.z > 0.001) {
      vec2 dv = p - g4.xy;
      float r = max(g4.w, 1.0);
      c += vec3(g4.z * exp(-dot(dv, dv) / (r * r)));
    }
  }

  if (u_debug == 1) c = vec3(0.5 + 0.5 * dir * (mag / max(M.m0.w, 1.0)), 0.5 + 0.5 * x);
  if (u_debug == 2) c = N * 0.5 + 0.5;
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_toTexture == 1 ? gl_FragCoord.y : u_res.y - gl_FragCoord.y);
  vec2 uv = p / u_res;
  vec3 col = texture(u_tex, uv).rgb;

  if (u_count == 0) { outColor = vec4(applyOverlay(col, uv), 1.0); return; }

  if (u_debug == 3) {
    float dd = 1e5;
    int gs = 0;
    for (int g = 0; g < MAX_SHAPES; g++) {
      if (gs >= u_count) break;
      int ge = gs + 1;
      for (int j = 0; j < MAX_SHAPES; j++) { if (ge >= u_count || u_m0[ge].y < 0.5) break; ge++; }
      dd = min(dd, groupD(p, gs, ge));
      gs = ge;
    }
    vec3 dc = dd < 0.0 ? vec3(1.0, 0.6, 0.25) : vec3(0.3, 0.6, 1.0);
    dc *= 0.75 + 0.25 * cos(dd * 0.3);
    dc = mix(dc, vec3(1.0), 1.0 - smoothstep(0.0, 2.5, abs(dd)));
    outColor = vec4(mix(col * 0.25, dc, 0.85), 1.0);
    return;
  }

  // Composite each group in z order over the result so far.
  int s = 0;
  for (int g = 0; g < MAX_SHAPES; g++) {
    if (s >= u_count) break;
    int e = s + 1;
    for (int j = 0; j < MAX_SHAPES; j++) { if (e >= u_count || u_m0[e].y < 0.5) break; e++; }
    Mat M;
    float d = groupFull(p, s, e, M);
    float alpha = clamp(0.5 - d, 0.0, 1.0);
    // soft drop shadow, cast onto whatever lies below (backdrop or lower glass)
    float ds = groupD(p - u_shadowOffset, s, e);
    float sh = (1.0 - smoothstep(-u_shadowBlur * 0.6, u_shadowBlur, ds)) * M.m3.w;
    col *= 1.0 - sh * (1.0 - alpha);
    if (alpha > 0.0) col = mix(col, shadeGlass(p, s, e, d, M), alpha);
    s = e;
  }
  outColor = vec4(applyOverlay(col, uv), 1.0);
}`;

