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

export const BAND_LO = 0.35, BAND_HI = 0.65;

/** "ok" inside the 35-65% band, "edge" straddles a band edge, "out" wholly outside it. */
export function bandFlag(r: Rate): "ok" | "edge" | "out" {
  if (r.hi < BAND_LO || r.lo > BAND_HI) return "out";
  if (r.lo < BAND_LO || r.hi > BAND_HI) return "edge";
  return "ok";
}

export const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
export const fmtRate = (r: Rate) => (r.n ? `${pct(r.p)} [${pct(r.lo)}-${pct(r.hi)}] n=${r.n}` : "n/a");
