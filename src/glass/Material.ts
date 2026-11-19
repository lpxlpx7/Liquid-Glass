import { lerp } from '../core/Spring';

export type RGBA = [number, number, number, number];

/** Optical description of one piece of glass. All lengths are CSS pixels. */
export interface Material {
  /** Corner radius. Anything >= half the short side gives a capsule. */
  radius: number;
  /** Smooth-union radius: glass pieces closer than this melt together. */
  merge: number;
  /** 0 = crystal clear, 1 = fully frosted (backdrop blur). */
  frost: number;
  /** Maximum refraction displacement at the rim. */
  refraction: number;
  /** Width of the curved rim (the "lens" zone) in px. */
  bezel: number;
  /** Chromatic dispersion: per-channel refraction spread (0..1). */
  dispersion: number;
  /** Specular / rim highlight intensity. */
  specular: number;
  /** Magnification of the whole lens (1 = none). */
  magnify: number;
  /** Corner exponent: 2 = circular corners, >2 = Apple-style continuous squircle corners. */
  cornerPower: number;
  /** Tint color with alpha as mix amount. */
  tint: RGBA;
  /** Vibrancy: saturation boost of what is seen through the glass. */
  saturation: number;
  brightness: number;
  /** Drop shadow opacity. */
  shadow: number;
}

export const DEFAULT_MATERIAL: Material = {
  radius: 999,
  merge: 0,
  frost: 1,
  refraction: 18,
  bezel: 18,
  dispersion: 0.3,
  specular: 1,
  magnify: 1,
  cornerPower: 2,
  tint: [1, 1, 1, 0.08],
  saturation: 1.6,
  brightness: 1,
  shadow: 0.25,
};

export function material(p: Partial<Material>): Material {
  return {
    ...DEFAULT_MATERIAL,
    ...p,
    tint: [...(p.tint ?? DEFAULT_MATERIAL.tint)] as RGBA,
  };
}

export function mixMaterial(a: Material, b: Material, t: number, out?: Material): Material {
  const o = out ?? material({});
  o.radius = lerp(a.radius, b.radius, t);
  o.merge = lerp(a.merge, b.merge, t);
  o.frost = lerp(a.frost, b.frost, t);
  o.refraction = lerp(a.refraction, b.refraction, t);
  o.bezel = lerp(a.bezel, b.bezel, t);
  o.dispersion = lerp(a.dispersion, b.dispersion, t);
  o.specular = lerp(a.specular, b.specular, t);
  o.magnify = lerp(a.magnify, b.magnify, t);
  o.cornerPower = lerp(a.cornerPower, b.cornerPower, t);
  for (let i = 0; i < 4; i++) o.tint[i] = lerp(a.tint[i], b.tint[i], t);
  o.saturation = lerp(a.saturation, b.saturation, t);
  o.brightness = lerp(a.brightness, b.brightness, t);
  o.shadow = lerp(a.shadow, b.shadow, t);
  return o;
}
