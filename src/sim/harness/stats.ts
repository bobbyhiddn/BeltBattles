// Balance harness statistics: win rates with Wilson score intervals (95%).
// Draws count half a win, so `pts` may be a half-integer; the interval treats pts/n as the
// observed proportion over n battles (slightly conservative with draws).

export interface Rate {
  p: number; // observed win rate (pts / n), 0 when n = 0
  lo: number; // Wilson 95% lower bound
  hi: number; // Wilson 95% upper bound
  n: number; // battles
  pts: number; // wins + draws / 2
}

export const Z95 = 1.959964;

export function wilson(pts: number, n: number, z = Z95): Rate {
  if (n <= 0) return { p: 0, lo: 0, hi: 1, n: 0, pts: 0 };
  const p = pts / n, z2 = z * z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  // clamp around p: at p = 1 (or 0) float rounding can leave hi a hair below p (lo above it)
  return { p, lo: Math.min(p, Math.max(0, mid - half)), hi: Math.max(p, Math.min(1, mid + half)), n, pts };
}

/** Two-sided 95% Student-t critical value for `df` degrees of freedom (df >= 1): the table up to
 *  30, then the Cornish-Fisher expansion (within 1e-4 of the exact value there). */
const T975 = [
  12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.306, 2.2622, 2.2281, 2.201, 2.1788, 2.1604, 2.1448, 2.1314,
  2.1199, 2.1098, 2.1009, 2.093, 2.086, 2.0796, 2.0739, 2.0687, 2.0639, 2.0595, 2.0555, 2.0518, 2.0484, 2.0452, 2.0423,
];
export function tCrit95(df: number): number {
  if (!(df >= 1)) return Infinity;
  if (df <= T975.length) return T975[Math.floor(df) - 1];
  const z = Z95, v = df;
  return z + (z ** 3 + z) / (4 * v) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * v * v) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * v ** 3);
}

/** Mean of `xs` and its 95% t-interval (null below 2 values). */
export function meanCI(xs: number[]): { mean: number; ci: [number, number] | null } {
  const n = xs.length;
  const mean = n ? xs.reduce((s, x) => s + x, 0) / n : 0;
  if (n < 2) return { mean, ci: null };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const half = (tCrit95(n - 1) * sd) / Math.sqrt(n);
  return { mean, ci: [mean - half, mean + half] };
}

export const BAND_LO = 0.35, BAND_HI = 0.65;

/** "ok" inside the 35-65% band, "edge" straddles a band edge, "out" wholly outside it. */
export function bandFlag(r: Rate): "ok" | "edge" | "out" {
  if (r.hi < BAND_LO || r.lo > BAND_HI) return "out";
  if (r.lo < BAND_LO || r.hi > BAND_HI) return "edge";
  return "ok";
}

export const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
export const fmtRate = (r: Rate) => (r.n ? `${pct(r.p)} [${pct(r.lo)}-${pct(r.hi)}] n=${r.n}` : "n/a");
