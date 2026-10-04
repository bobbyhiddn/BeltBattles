// U2a (REQ-BFG-046, REQ-BFG-047; N1 REPORT section 6 item 1): one formatter per unit. Every number on a new piece face
// (src/ui/faces.ts: its stat row, its rule line, its reminder and its NEXT★ line) is printed by one of these, from the
// sim's own value in the sim's unit. A face template holds no digit of its own (tests/faceText.test.ts pins it).
//
// THE INTERIM (N1 section 2.6, option iii, "hold"): the new faces are built now, UI only, and ship with stage A's NUMBERS
// rules release. Until then each formatter prints TODAY's value with TODAY's display rounding, the helper today's text
// uses for that number (abilityText.ts n1, n2 and percent), so a number on a new face equals the number in the old text.
// NUMBERS changes only these bodies (whole numbers, x10 damage, SPEED per 30 s) and faces.ts speedPair, nothing else:
//   fmtDmg    the damage family (damage, HEAT, FRAY's step, plating): today at most one decimal (n1)
//   fmtSpeed  a repeating action (a turret's shot, a factory's stamp): today its interval in seconds, at most two
//             decimals (n2), drawn with SEC after it by statRow; NUMBERS: the speed, shots or slugs per 30 s, after RATE
//   fmtSec    a duration (STUN, a fuse, BURN's time, a period): today at most two decimals (n2); the face writes SEC after it
//   fmtPct    a percentage, from a share or a bonus (0.15 prints "15%"): today's percent(), whole
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

/** Today's one-decimal display (abilityText.ts n1). */
const oneDecimal = (x: number): string => String(+x.toFixed(1));
/** Today's two-decimal display (abilityText.ts n2). */
const twoDecimals = (x: number): string => String(+x.toFixed(2));

/** A damage-family amount: "4", "1.2", "3.5" (interim: n1). */
export const fmtDmg = (x: number): string => rec("dmg", x, oneDecimal(x));
/** A repeating action's cadence, the number of its speed pair (interim: the interval in seconds, n2: "0.55"). */
export const fmtSpeed = (interval: number): string => rec("speed", interval, twoDecimals(interval));
/** A duration in seconds: "3", "1.6" (interim: n2); the face writes the SEC glyph after it. */
export const fmtSec = (x: number): string => rec("sec", x, twoDecimals(x));
/** A percentage from a share or a bonus: 0.15 is "15%" (interim: today's percent(), whole). */
export const fmtPct = (x: number): string => rec("pct", x, `${Math.round(x * 100)}%`);
/** A count: "3". */
export const fmtCount = (n: number): string => rec("count", n, String(n));
/** A price in gold: "10". */
export const fmtGold = (n: number): string => rec("gold", n, String(n));

/** The registry's formatters by unit (tests and tools). */
export const FORMATTERS: Readonly<Record<Unit, (x: number) => string>> = {
  dmg: fmtDmg, speed: fmtSpeed, sec: fmtSec, pct: fmtPct, count: fmtCount, gold: fmtGold,
};
