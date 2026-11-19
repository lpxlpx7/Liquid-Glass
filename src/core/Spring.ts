/**
 * Damped harmonic spring, configured the SwiftUI way (response / dampingFraction).
 * Apple's Liquid Glass motion is driven almost entirely by such springs:
 * slight under-damping gives the "jelly" overshoot of the glass.
 */
export class Spring {
  value: number;
  target: number;
  velocity = 0;
  stiffness = 0;
  damping = 0;

  constructor(value: number, response = 0.4, dampingFraction = 0.8) {
    this.value = value;
    this.target = value;
    this.configure(response, dampingFraction);
  }

  configure(response: number, dampingFraction: number): this {
    const omega = (2 * Math.PI) / Math.max(response, 1e-3);
    this.stiffness = omega * omega;
    this.damping = 2 * dampingFraction * omega;
    return this;
  }

  step(dt: number): void {
    if (this.isSettled()) {
      this.value = this.target;
      this.velocity = 0;
      return;
    }
    // Semi-implicit Euler with fixed sub-steps for stability at high stiffness.
    const steps = Math.max(1, Math.ceil(dt / (1 / 300)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
  }

  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }

  isSettled(eps = 1e-3): boolean {
    return Math.abs(this.value - this.target) < eps && Math.abs(this.velocity) < eps;
  }
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
