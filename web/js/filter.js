// One Euro filter (Casiez et al., CHI 2012). Mirrors rtc/filters.py.
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);

export class OneEuroFilter {
  constructor(minCutoff = 1.5, beta = 0.05, dCutoff = 1.0) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.t = null; this.x = 0; this.dx = 0; }
  /** Filter sample x taken at time t (seconds). */
  filter(x, t) {
    if (this.t === null) { this.t = t; this.x = x; this.dx = 0; return x; }
    const dt = t - this.t;
    if (dt <= 0) return this.x;
    const ad = alpha(this.dCutoff, dt);
    this.dx = ad * ((x - this.x) / dt) + (1 - ad) * this.dx;
    const a = alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt);
    this.x = a * x + (1 - a) * this.x;
    this.t = t;
    return this.x;
  }
}

/** Independent filters for a 3D point. */
export class PointFilter {
  constructor(...params) { this.f = [0, 1, 2].map(() => new OneEuroFilter(...params)); }
  reset() { this.f.forEach((f) => f.reset()); }
  filter(p, t) { return p.map((v, i) => this.f[i].filter(v, t)); }
}
