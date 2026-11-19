/** Global, user-tweakable multipliers applied on top of each shape's material. */
export interface GlassSettings {
  blur: number; // backdrop blur sigma, CSS px
  refraction: number;
  bezel: number;
  dispersion: number;
  specular: number;
  frost: number;
  saturation: number;
  shadow: number;
  merge: number;
  lightAngle: number; // degrees, screen space (y down); -135 = top-left
  followPointer: boolean;
  rimWidth: number; // CSS px
  debug: number; // 0 normal, 1 displacement, 2 normals, 3 SDF
}

export const DEBUG_MODES = ['Normal', 'Displacement', 'Normals', 'SDF'];

export function defaultSettings(): GlassSettings {
  return {
    blur: 10,
    refraction: 1,
    bezel: 1,
    dispersion: 1,
    specular: 1,
    frost: 1,
    saturation: 1,
    shadow: 1,
    merge: 1,
    lightAngle: -125,
    followPointer: true,
    rimWidth: 1.4,
    debug: 0,
  };
}
