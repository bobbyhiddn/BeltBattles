// U2a (REQ-BFG-046, REQ-BFG-047; N1 REPORT section 6 item 1): one formatter per unit. Every number on a new piece face
// (src/ui/faces.ts: its stat row, its rule line, its reminder and its NEXT★ line) is printed by one of these, from the
// sim's own value in the sim's unit. A face template holds no digit of its own (tests/faceText.test.ts pins it).
//
// THE INTERIM (N1 section 2.6, option iii, "hold"): the new faces were built UI only and ship with release X's NUMBERS.
// Until NUM-4 each formatter printed TODAY's value with TODAY's display rounding (abilityText.ts n1, n2 and percent, both
// gone in NUM-4). NUMBERS changes only these bodies and faces.ts speedPair (["RATE", speed]), nothing else:
//   fmtDmg    the damage family (damage, HEAT, FRAY's step, plating, heals, hull): whole (NUM-1's x10)
//   fmtSpeed  a repeating action (a turret's shot, a factory's stamp): its SPEED, shots or slugs per 30 s, drawn after
//             RATE by statRow ({RATE}19; NUM-2)
//   fmtSec    a duration (STUN, a fuse, BURN's time, a period): whole seconds (NUM-3); the face writes SEC after it
//   fmtPct    a percentage, from a share or a bonus (0.15 prints "15%"): whole
//   fmtCount  a count (loads, belts, gear slots, slugs, BURN and FRAY stacks): an integer as it is
//   fmtGold   a price: an integer as it is (the shop keeps its coin sprite; the GOLD glyph is for text)
//
// THE REGISTRY (N1 section 2.5): captureFormats(fn, site) runs fn and returns every number printed meanwhile as
// { unit, value, printed, site }. Tests pin faces through it (value to string), not through literal strings, so
// re-pinning at NUMBERS is a regeneration; W/output-u2a/tools/numcheck traces every number on a face to its record.

/** The units: one formatter each. */
export type Unit = "dmg" | "speed" | "sec" | "pct" | "count" | "gold";

/** One printed number: its unit, the sim's value, the text printed, and where (the caller's site label). */
export interface FmtRecord {
  unit: Unit;
  value: number;
  printed: string;
  site: string;
}

let sink: FmtRecord[] | null = null;
let siteNow = "";

function rec(unit: Unit, value: number, printed: string): string {
  if (sink) sink.push({ unit, value, printed, site: siteNow });
  return printed;
}

/** Runs `fn` and returns its value with every number printed meanwhile (nested captures each see their own). */
export function captureFormats<T>(fn: () => T, site = ""): { value: T; records: FmtRecord[] } {
  const prevSink = sink, prevSite = siteNow;
  const records: FmtRecord[] = [];
  sink = records;
  siteNow = site;
  try {
    return { value: fn(), records };
  } finally {
    sink = prevSink;
    siteNow = prevSite;
    if (prevSink) prevSink.push(...records);
  }
}

// NUM-4 (REQ-BFG-047; N1 section 2.5, its job 4): THE BODIES. The sim's numbers are whole since NUM-1 (damage x10),
// NUM-2 (SPEED, shots or slugs per 30 s) and NUM-3 (whole-second durations), so each formatter prints its value as it is:
// none rounds. A value that is not whole is a FINDING, never rounded away: the formatter prints it as it is (so it shows,
// it doesn't hide) and records it in FRACTIONAL with its unit and site; tests/numbers.faces.test.ts sweeps every face,
// sentence, chip and ladder and fails on any record there (the source is named in NUM-4's report).
//   fmtDmg    the damage family: a whole number, "40"
//   fmtSpeed  a repeating action's SPEED (shots or slugs per 30 s, content.ts SPEED_K), drawn after RATE: "19"
//   fmtSec    a duration in whole seconds, "3"; the face writes SEC after it
//   fmtPct    a share or a bonus as a whole %, 0.15 is "15%" (x 100 is exact up to float noise, 1e-6)

/** NUM-4: the fractional values a whole formatter met (a finding each; at most FRACTIONAL_MAX kept, first ones first). */
export const FRACTIONAL: FmtRecord[] = [];
const FRACTIONAL_MAX = 200;

/** Records a finding: a value its whole formatter can't print whole. */
function finding(unit: Unit, x: number, printed: string): void {
  if (FRACTIONAL.length < FRACTIONAL_MAX) FRACTIONAL.push({ unit, value: x, printed, site: siteNow });
}

/** A whole value as it is; a fraction printed as it is and recorded (never rounded). */
function whole(unit: Unit, x: number): string {
  const printed = String(x);
  if (!Number.isInteger(x)) finding(unit, x, printed);
  return rec(unit, x, printed);
}

/** A damage-family amount: "40", "12", "250". */
export const fmtDmg = (x: number): string => whole("dmg", x);
/** A repeating action's SPEED, the number of its RATE pair: shots or slugs per 30 s, "19" (NUM-2's TurretSpec / FactorySpec
 *  `speed`, after gear, cores and BELTS levels as the battle rounds them). */
export const fmtSpeed = (speed: number): string => whole("speed", speed);
/** A duration in whole seconds: "3", "2"; the face writes the SEC glyph after it. */
export const fmtSec = (x: number): string => whole("sec", x);
/** A percentage from a share or a bonus: 0.15 is "15%". The x 100 is checked whole (up to float noise), not rounded. */
export function fmtPct(x: number): string {
  const p = x * 100, r = Math.round(p);
  if (Math.abs(p - r) > 1e-6) { finding("pct", x, `${p}%`); return rec("pct", x, `${p}%`); } // a finding: as it is
  return rec("pct", x, `${r === 0 ? 0 : r}%`);
}
/** NUM-4 (N1 2.2, "the clocks and logs"): a clock reading, whole elapsed seconds, floored like any clock (12.34 s reads
 *  "12"): the battle clock, the replay's, FIRST SHOT and a belt's ride time. The one place a time is floored; the record
 *  keeps the whole value it prints (unit sec). The face writes S or SEC after it. */
export const fmtClock = (t: number): string => {
  const s = Math.max(0, Math.floor(t + 1e-9));
  return rec("sec", s, String(s));
};
/** NUM-4: a measured share (the results' GUNS IDLE: idle time over turret time), a reading like a clock, so it is the one
 *  % that rounds (half up, to a whole %); every rule's % is fmtPct's, exact. */
export const fmtReadPct = (x: number): string => {
  const p = Math.max(0, Math.floor(x * 100 + 0.5));
  return rec("pct", p / 100, `${p}%`);
};
/** A count: "3". */
export const fmtCount = (n: number): string => rec("count", n, String(n));
/** A price in gold: "10". */
export const fmtGold = (n: number): string => rec("gold", n, String(n));

/** The registry's formatters by unit (tests and tools). */
export const FORMATTERS: Readonly<Record<Unit, (x: number) => string>> = {
  dmg: fmtDmg, speed: fmtSpeed, sec: fmtSec, pct: fmtPct, count: fmtCount, gold: fmtGold,
};
