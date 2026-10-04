// RUNES-1 M5 (REQ-BFG-058): the rune value bench. What a shipped rune is worth, in the BELTS truth table's unit
// (win-rate points against the par field, paired seeds, 95% interval over the members).
//
// WHERE IT CAME FROM: R1b-2's output-r1b/tools/runevalue.ts (read-only copy: R/ref/r1b/tools/runevalue.ts), which
// imported the sim from ../../BeltBattles-s049/src/... and applied every variant from OUTSIDE the sim (no rune system
// existed yet). Its numbers are R1b REPORT.md section 1.5 (runevalue.md; relicvalue.md for RIVET HOARD and SPARE HULL).
//
// WHAT CHANGED:
// - Imports come from this repo (../src/...), and each battle runs through the sim's own headless runner (simulate).
// - Every rune is applied the REAL way, from the shipped catalogue (src/sim/runes.ts RUNES; no amount is written here):
//   withRune() gives the member's build `runes: [{ id }]` and, for a HULL or BELT rune, adds its amount to hullBonus /
//   beltCap exactly as src/game/run.ts takeRune does. Every other kind acts in battle through Build.runes (runes.ts
//   runeMods, read by src/sim/battle.ts). Nothing patches the Battle instance: R1b-2 wrapped Battle.impact (+1 at impact
//   on every damaging side-0 projectile) and R1b's relicvalue.ts set the plating pool and hullBonus by hand.
// - The variants are 7 shipped runes in today's units (decision 1: N1's DMG, HULL and PLATE divided by 10): R1b 1.5's
//   RIVET HOARD, WAR EDGE and SPARE HULL, its inferred IRON SKIN and SHARP SCRAP (now "each turret's first shot +5 DMG";
//   R1b's "+5 DMG on every shot" would be +0.5 today, not whole), the unmeasured rare STOKED FIRES, and GUN OIL as an
//   extra. R1b-2's IRON MOSS (GROW) and HOARD FANG gear rows and its hoard-vs-spend section are dropped (no GROW and no
//   gear in RUNES-1).
// - The report sets each rune beside R1b-2's number in today's units and R1b-2's tier target (1.5).
// METHOD KEPT (R1b-2's): members are each hero's par decks (src/sim/harness/par parField), seeds 1..K, days 3-10; the
// field is the four heroes' par decks of the same day, seeds 1..KO; one seed per pairing, hashSeed(13, "r1b2-rune", h,
// d, i, foe, j), shared by the base and every rune; only the member's side gets the rune; score win 1, draw 0.5; gain =
// rune minus base in win-rate points; 95% t-interval over the hero x member values.
//
// No npm script (package files are frozen). Build and run:
//   npx vite build --ssr tools/runevalue.ts --outDir <tmp> --emptyOutDir --logLevel warn
//   node <tmp>/runevalue.js <outDir> [K=10] [KO=5]      ->  <outDir>/runevalue.md + runevalue.json
import { writeFileSync } from "node:fs";
import { simulate, type Battle } from "../src/sim/battle";
import { parField } from "../src/sim/harness/par";
import { hashSeed } from "../src/core/rng";
import { RULES_VERSION, type HeroId, type Rarity } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { RUNES, type RuneDef, type RuneUnit } from "../src/sim/runes";

const OUT = process.argv[2] ?? ".";
const K = Number(process.argv[3] ?? 10); // members per hero (par decks, seeds 1..K)
const KO = Number(process.argv[4] ?? 5); // opponents per hero in the field (seeds 1..KO)
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const DAYS = [3, 4, 5, 6, 7, 8, 9, 10];
const DAYS_R1B = [4, 5, 6, 7, 8, 9, 10]; // R1b's relicvalue.ts span (RIVET HOARD, SPARE HULL)

/** The benched runes, in R1b 1.5's order, then the extra. */
const IDS = ["rivet_hoard", "war_edge", "spare_hull", "iron_skin", "sharp_scrap", "stoked_fires", "gun_oil"];

/** R1b-2's number for each rune, in today's units (R1b REPORT.md 1.4 and 1.5; relicvalue.md; runevalue.md). */
const R1B: Record<string, { value: number | null; text: string }> = {
  rivet_hoard: { value: 3.0, text: "+3.0 (R1b relicvalue plate6: 6 PLATE = 60 N1, set on the plating pool by hand; days 4-10, K 12, KO 6; per hero 2.2 to 3.7)" },
  war_edge: { value: 8.4, text: "+8.4, 6.9 to 10.0 (R1b-2 dmg10: +1 = +10 N1 added at impact to every damaging projectile, a SCATTER pellet its share)" },
  spare_hull: { value: 10.0, text: "+10.0 (R1b relicvalue hull30: +30 HULL = +300 N1 in hullBonus; days 4-10, K 12, KO 6; per hero 7.0 to 13.4)" },
  iron_skin: { value: 5, text: "about +5 (R1b inferred from +25 HULL = +8.7 and +30 = +10.0; +15 HULL = +150 N1)" },
  sharp_scrap: { value: 4.5, text: "about +4.5 (R1b inferred, half of WAR EDGE, for its OLD form: +5 N1 = +0.5 today on every shot)" },
  stoked_fires: { value: null, text: "none (not measured)" },
  gun_oil: { value: null, text: "none (not measured)" },
};
/** R1b-2 1.5: what a pick should be worth, in points. */
const TARGET: Record<Rarity, [number, number]> = { common: [3, 5], rare: [6, 10], epic: [10, 16], legendary: [16, 25] };
/** The units NUM-1 multiplies by 10 (runes.ts header); the others stay. For the N1 column only. */
const N1_X10: readonly RuneUnit[] = ["dmg", "hull", "plate"];

/**
 * The member's build after taking rune `id` the way src/game/run.ts takeRune does: the id joins Build.runes (pick
 * order), and a HULL or BELT rune adds its amount to hullBonus / beltCap at once. Every other kind acts in battle
 * through Build.runes (runes.ts runeMods). A dawn-gold rune's gold never reaches a battle. The par decks hold no runes.
 */
function withRune(b: Build, id: string): Build {
  const d = RUNES[id];
  if (!d) throw new Error(`runevalue: unknown rune ${id}`);
  if (b.runes?.some((q) => q.id === id)) throw new Error(`runevalue: ${d.name} is held already`);
  const out = cloneBuild(b);
  out.runes = [...(b.runes ?? []), { id }];
  if (d.kind === "hull") out.hullBonus += d.amount.n;
  else if (d.kind === "belt") out.beltCap += d.amount.n;
  return out;
}

const DEFS: RuneDef[] = IDS.map((id) => {
  if (!RUNES[id]) throw new Error(`runevalue: ${id} is not in this rules version's catalogue`);
  return RUNES[id];
});
/** The effect line as plain text (src/ui/runeText.ts runeLine's words, without its render imports). */
const effect = (d: RuneDef) =>
  d.text.replace(/\{N\}/g, `${d.amount.n}${d.amount.unit === "pct" ? "%" : ""}`).replace(/\{\*?([A-Z]+)\}/g, "$1");
const amountText = (d: RuneDef) =>
  `${d.amount.n} ${d.amount.unit}${N1_X10.includes(d.amount.unit) ? ` (N1 ${d.amount.n * 10})` : ""}`;

const t0 = Date.now();
const field: Record<string, Build[]> = {};
for (const h of HEROES) for (const d of DAYS) field[`${h}:${d}`] = parField(h, d, Math.max(K, KO));
const tField = (Date.now() - t0) / 1000;
for (const k of Object.keys(field)) if (field[k].some((b) => b.runes?.length)) throw new Error(`runevalue: a par deck of ${k} holds runes`);

let battles = 0;
const score = (bt: Battle) => (bt.winner === 0 ? 1 : bt.winner === -1 ? 0.5 : 0);
function play(mine: Build, theirs: Build, seed: number): number {
  const bt = simulate(mine, theirs, seed);
  if (!bt.over) throw new Error("runevalue: a battle ran past simulate's tick cap");
  battles++;
  return score(bt);
}

// ---- paired gains by rune, hero and day ------------------------------------------------------------------------------
const gains: Record<string, Record<string, number[]>> = {}; // [rune][hero][member] mean over days 3-10 and opponents
const gainsR1b: Record<string, Record<string, number[]>> = {}; // the same over days 4-10 (R1b's relicvalue span)
const byDay: Record<string, Record<number, number[]>> = {}; // [rune][day][hero*K + member] mean over opponents
const baseWr: Record<string, number> = {};
for (const id of IDS) {
  gains[id] = {}; gainsR1b[id] = {}; byDay[id] = {};
  for (const h of HEROES) { gains[id][h] = new Array(K).fill(0); gainsR1b[id][h] = new Array(K).fill(0); }
  for (const d of DAYS) byDay[id][d] = [];
}
for (const h of HEROES) {
  let baseSum = 0, baseN = 0;
  for (let i = 0; i < K; i++) {
    const sum: Record<string, number> = {}, sumR1b: Record<string, number> = {};
    let n = 0, nR1b = 0;
    for (const d of DAYS) {
      const mine = field[`${h}:${d}`][i];
      const variants = IDS.map((id) => ({ id, build: withRune(mine, id) }));
      const perDay: Record<string, number> = {};
      let nd = 0;
      for (const foe of HEROES) for (let j = 0; j < KO; j++) {
        const theirs = field[`${foe}:${d}`][j];
        const seed = hashSeed(13, "r1b2-rune", h, d, i, foe, j);
        const base = play(mine, theirs, seed);
        baseSum += base; baseN++;
        for (const v of variants) perDay[v.id] = (perDay[v.id] ?? 0) + (play(v.build, theirs, seed) - base);
        nd++;
      }
      for (const id of IDS) {
        byDay[id][d].push((100 * perDay[id]) / nd);
        sum[id] = (sum[id] ?? 0) + perDay[id];
        if (DAYS_R1B.includes(d)) sumR1b[id] = (sumR1b[id] ?? 0) + perDay[id];
      }
      n += nd;
      if (DAYS_R1B.includes(d)) nR1b += nd;
    }
    for (const id of IDS) { gains[id][h][i] = (100 * sum[id]) / n; gainsR1b[id][h][i] = (100 * sumR1b[id]) / nR1b; }
  }
  baseWr[h] = (100 * baseSum) / baseN;
  console.log(`runevalue: ${h} done, ${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---- report ----------------------------------------------------------------------------------------------------------
/** Student's t, 97.5% quantile: exact to 3 places for df <= 30, then the Cornish-Fisher series (error < 0.001). */
const T975 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const t975 = (df: number) => {
  if (df < T975.length) return T975[Math.max(1, df)];
  const z = 1.959964;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
};
type CI = { mean: number; lo: number; hi: number };
const r1 = (x: number) => Math.round(x * 10) / 10;
const ci = (xs: number[]): CI => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
  const half = n > 1 ? (t975(n - 1) * sd) / Math.sqrt(n) : 0;
  return { mean: r1(m), lo: r1(m - half), hi: r1(m + half) };
};
const sg = (x: number) => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(1)}`;
const iv = (c: CI) => `${c.lo.toFixed(1)} to ${c.hi.toFixed(1)}`;
const cell = (c: CI) => `${sg(c.mean)} (${iv(c)})`;
function verdict(c: CI, tier: Rarity): string {
  const [lo, hi] = TARGET[tier];
  const where = c.mean < lo ? "BELOW" : c.mean > hi ? "ABOVE" : "IN";
  const band = c.hi < lo ? "interval wholly below" : c.lo > hi ? "interval wholly above" : "interval overlaps it";
  return `${where} the ${tier} target (+${lo} to +${hi}); ${band}`;
}

const rows = DEFS.map((d) => {
  const all = ci(HEROES.flatMap((h) => gains[d.id][h]));
  const r1bSpan = ci(HEROES.flatMap((h) => gainsR1b[d.id][h]));
  return {
    id: d.id, name: d.name, tier: d.tier, theme: d.theme, kind: d.kind, amount: d.amount, text: effect(d),
    n1: N1_X10.includes(d.amount.unit) ? d.amount.n * 10 : d.amount.n,
    all, days4to10: r1bSpan,
    byDay: Object.fromEntries(DAYS.map((day) => [day, ci(byDay[d.id][day])])) as Record<number, CI>,
    byHero: Object.fromEntries(HEROES.map((h) => [h, ci(gains[d.id][h])])) as Record<string, CI>,
    r1b: R1B[d.id], target: TARGET[d.tier], verdict: verdict(all, d.tier),
  };
});
const seconds = (Date.now() - t0) / 1000;
const md = [
  `# RUNES-1 M5: the shipped runes' value, applied the real way (rules ${RULES_VERSION})`, "",
  `Generated ${new Date().toISOString()} by tools/runevalue.ts (R1b-2's bench moved into tools/). Members: each hero's par decks, seeds 1-${K}, days ${DAYS[0]}-${DAYS[DAYS.length - 1]}. Field: the four heroes' par decks of the same day, seeds 1-${KO}. Paired: one seed per pairing (R1b-2's hashSeed(13, "r1b2-rune", ...)) for the base and every rune; only the member's side gets the rune. Score: win 1, draw 0.5. Gain = rune minus base, in win-rate points. ${battles} battles; par fields ${tField.toFixed(0)} s; total ${seconds.toFixed(0)} s.`, "",
  "Each rune is applied as run.ts takeRune applies it (withRune): the member's build gets `runes: [{ id }]`, and a HULL or BELT rune also adds its amount to hullBonus / beltCap; every other kind acts in battle through Build.runes (runes.ts runeMods, read by battle.ts). Amounts come from src/sim/runes.ts. Nothing patches the Battle instance.", "",
  `## 1. Gain by rune (all heroes, days ${DAYS[0]}-${DAYS[DAYS.length - 1]}; 95% interval over the ${HEROES.length * K} hero x member values)`, "",
  "| rune | tier | amount today (N1) | effect | gain (points) | 95% interval | days 4-10 (R1b's relicvalue span) | R1b-2's number, today's units | verdict vs R1b-2's tier target |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.name} | ${r.tier} | ${amountText(DEFS.find((d) => d.id === r.id)!)} | ${r.text} | ${sg(r.all.mean)} | ${iv(r.all)} | ${cell(r.days4to10)} | ${r.r1b.text} | ${r.verdict} |`), "",
  "R1b-2's tier targets (1.5): common +3 to +5, rare +6 to +10, epic +10 to +16, legendary +16 to +25.", "",
  "## 2. Gain by day (all heroes)", "",
  `| rune | ${DAYS.map((d) => `day ${d}`).join(" | ")} |`, `|---|${DAYS.map(() => "---").join("|")}|`,
  ...rows.map((r) => `| ${r.name} | ${DAYS.map((d) => cell(r.byDay[d])).join(" | ")} |`), "",
  `## 3. Gain by hero (days ${DAYS[0]}-${DAYS[DAYS.length - 1]}; 95% interval over the ${K} members)`, "",
  `| rune | ${HEROES.join(" | ")} |`, `|---|${HEROES.map(() => "---").join("|")}|`,
  ...rows.map((r) => `| ${r.name} | ${HEROES.map((h) => cell(r.byHero[h])).join(" | ")} |`),
  `| (base win % vs the field) | ${HEROES.map((h) => r1(baseWr[h]).toFixed(1)).join(" | ")} |`, "",
  "## 4. Reading it against R1b", "",
  "- R1b's numbers were measured under bb-0.8.3 on that rules version's par decks; this table runs on today's. RIVET HOARD and SPARE HULL come from R1b's relicvalue.md (days 4-10, K 12, KO 6, its own seeds): compare them with the days 4-10 column.",
  "- WAR EDGE: R1b-2 added its +1 at impact to every damaging side-0 projectile (after the foe's debuffs); the shipped rune adds +1 to each shot when it is fired (battle.ts runeShot, before the debuffs, like the gear's flat bonuses), and a SCATTER pellet still gets its share.",
  "- RIVET HOARD: R1b set the plating pool (plate and peak) to 6 before the first tick; the shipped rune adds 6 through addPlate at the battle's start (PLATE_CAP holds).",
  "- SHARP SCRAP changed form: R1b's +5 N1 on every shot (+0.5 today, not whole) became +5 on each turret's first shot of a battle, so R1b's inferred +4.5 is for a different rune.",
  "- STOKED FIRES and GUN OIL had no R1b number; only the tier target applies.", "",
  "For scale (BELTS run 5 truth table, the same unit, K 16): a level-2 upgrade (10 gold) gains FURNACE T +3.3 / F +7.2, WEAVER T +1.3 / F +11.7, FOUNDRY T +1.9 / F +9.5, BASTION T +5.7 / F +5.3 (mean of the 8: +5.7).",
];
writeFileSync(`${OUT}/runevalue.md`, md.join("\n") + "\n");
writeFileSync(`${OUT}/runevalue.json`, JSON.stringify({ rules: RULES_VERSION, K, KO, days: DAYS, battles, seconds: Math.round(seconds), tField: Math.round(tField), runes: rows, baseWr, gains, gainsDays4to10: gainsR1b, byDay }, null, 1));
console.log(md.join("\n"));
