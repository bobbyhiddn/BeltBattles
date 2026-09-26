// SC-TOOL (0.6.2 scorecard, REQ-BFG-026, done-list B12): the genre-study targets and the PASS/MISS rule. Pure: no
// game state, so tests/scorecard.test.ts can check it in milliseconds. The targets come from the --targets file
// (ref/targets.json); nothing here restates a target value.

/** One row of ref/targets.json (the fields the tool reads; the rest ride along untouched). */
export interface Target {
  id: string;
  area: string;
  value: number | [number, number];
  unit: string;
  confidence?: string;
}

/** How a target is compared: a band [lo, hi], a floor (at least), a ceiling (at most), or an exact value. */
export type Cmp =
  | { kind: "band"; lo: number; hi: number }
  | { kind: "min"; v: number }
  | { kind: "max"; v: number }
  | { kind: "eq"; v: number };

/**
 * The comparison a target asks for, read from its value and its unit text (never from its id):
 * - an array value is a band [min, max];
 * - a unit starting "min" is a floor, one starting "max" a ceiling;
 * - a unit that flags anything "under" (or "below") the value is a floor too (fight-length-floor);
 * - anything else is an exact value (net lives, part picks, gating steps, the dark wind's onset).
 */
export function cmpOf(t: Pick<Target, "value" | "unit">): Cmp {
  if (Array.isArray(t.value)) return { kind: "band", lo: t.value[0], hi: t.value[1] };
  const u = t.unit.trim().toLowerCase();
  if (/^min\b/.test(u)) return { kind: "min", v: t.value };
  if (/^max\b/.test(u)) return { kind: "max", v: t.value };
  if (/\b(under|below)\b/.test(u)) return { kind: "min", v: t.value };
  return { kind: "eq", v: t.value };
}

/** A measured value: one number, or the lowest and highest of a set (per hero, per day, per part...). */
export type Measured = number | { min: number; max: number };

export type Verdict = "PASS" | "MISS" | "N/A";

const EPS = 1e-9;
const lowOf = (m: Measured): number => (typeof m === "number" ? m : m.min);
const highOf = (m: Measured): number => (typeof m === "number" ? m : m.max);

/**
 * PASS when every measured value meets the target: a range must sit inside a band, its lowest at or above a floor,
 * its highest at or below a ceiling, and both ends equal an exact value. null (not measured) is N/A.
 */
export function judge(cmp: Cmp, m: Measured | null): Verdict {
  if (m === null) return "N/A";
  const lo = lowOf(m), hi = highOf(m);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return "N/A";
  switch (cmp.kind) {
    case "band": return lo >= cmp.lo - EPS && hi <= cmp.hi + EPS ? "PASS" : "MISS";
    case "min": return lo >= cmp.v - EPS ? "PASS" : "MISS";
    case "max": return hi <= cmp.v + EPS ? "PASS" : "MISS";
    case "eq": return Math.abs(lo - cmp.v) <= EPS && Math.abs(hi - cmp.v) <= EPS ? "PASS" : "MISS";
  }
}

/** Does one value meet the target (the per-entry test behind "every part outside the band")? */
export const meets = (cmp: Cmp, v: number): boolean => judge(cmp, v) === "PASS";

/** The target as a reader sees it: "[0.35, 0.65]", ">= 17", "<= 0.1", "= 5". */
export function cmpText(c: Cmp): string {
  switch (c.kind) {
    case "band": return `[${c.lo}, ${c.hi}]`;
    case "min": return `>= ${c.v}`;
    case "max": return `<= ${c.v}`;
    case "eq": return `= ${c.v}`;
  }
}

/** Parse the targets file's text: an array of rows, each with an id, a value and a unit. */
export function parseTargets(text: string): Target[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error("targets: expected a JSON array");
  return raw.map((r, i) => {
    const t = r as Target;
    const okValue = typeof t.value === "number" || (Array.isArray(t.value) && t.value.length === 2 && t.value.every((x) => typeof x === "number"));
    if (typeof t.id !== "string" || typeof t.unit !== "string" || !okValue) throw new Error(`targets: row ${i} needs id, unit and a number or [min, max] value`);
    return t;
  });
}

// ---------------------------------------------------------------- merge ratios (tools/scorecard/merge.ts reads them)

/**
 * How a star-scaled number turns into an effect before two star levels are divided:
 * - "amount": the value itself (damage, Burn, stall seconds, counts);
 * - "rate": a time between events (interval, cooldown, seconds per stack): the rate 1 / value;
 * - "mult": a multiplier on something else (belt speed, hull damage): the bonus above x1, value - 1;
 * - "imult": a multiplier on an interval (fire interval, gatling floor): the rate bonus, 1 / value - 1;
 * - "cut": a share taken off (commission time, a slow's belt speed): 1 - value.
 */
export type EffectKind = "amount" | "rate" | "mult" | "imult" | "cut";

/** A value's effect under its kind (Infinity for a rate or rate bonus of a zero time). */
export function effectOf(kind: EffectKind, v: number): number {
  switch (kind) {
    case "amount": return v;
    case "rate": return v === 0 ? Infinity : 1 / v;
    case "mult": return v - 1;
    case "imult": return v === 0 ? Infinity : 1 / v - 1;
    case "cut": return 1 - v;
  }
}

/** effect(n) / effect(1): null when the 1-star effect is 0 or not finite (a new effect has no ratio). */
export function effectRatio(kind: EffectKind, v1: number, vn: number): number | null {
  const e1 = effectOf(kind, v1), en = effectOf(kind, vn);
  if (!Number.isFinite(e1) || Math.abs(e1) < 1e-12) return null;
  return en / e1;
}

/** The plain value ratio vn / v1, with a time between events read as a rate (v1 / vn), as the brief asks. */
export function valueRatio(kind: EffectKind, v1: number, vn: number): number | null {
  const time = kind === "rate" || kind === "imult";
  if (time) return vn === 0 ? Infinity : v1 / vn;
  return v1 === 0 ? null : vn / v1;
}

// ---------------------------------------------------------------- small statistics (pure)

/** Quantile q (0..1) of a sorted copy, linear between neighbours; NaN for an empty list. */
export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, i = Math.floor(pos), f = pos - i;
  return i + 1 < s.length ? s[i] + f * (s[i + 1] - s[i]) : s[i];
}

/** Weighted quantile: the smallest value whose cumulative weight reaches q of the total (a step function). */
export function weightedQuantile(xs: readonly { v: number; w: number }[], q: number): number {
  const s = xs.filter((x) => x.w > 0).sort((a, b) => a.v - b.v);
  if (!s.length) return NaN;
  const total = s.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc >= q * total - 1e-12) return x.v;
  }
  return s[s.length - 1].v;
}

export const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Lowest and highest of a list (null when empty). */
export function rangeOf(xs: readonly number[]): { min: number; max: number } | null {
  const f = xs.filter((x) => !Number.isNaN(x));
  if (!f.length) return null;
  return { min: Math.min(...f), max: Math.max(...f) };
}

/** A number for a table: fixed decimals, "inf" for Infinity, "-" for null or NaN. */
export function fmt(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  if (v === Infinity) return "inf";
  if (v === -Infinity) return "-inf";
  return v.toFixed(d);
}

/** A measured value for a table: "0.42" or "0.31-0.58". */
export function fmtMeasured(m: Measured | null, d = 2): string {
  if (m === null) return "not measured";
  if (typeof m === "number") return fmt(m, d);
  return m.min === m.max ? fmt(m.min, d) : `${fmt(m.min, d)} to ${fmt(m.max, d)}`;
}
