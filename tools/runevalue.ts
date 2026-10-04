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
//   R1b's "+5 DMG on every shot" would be +0.5 today, not whole), the unmeasured rare STOKED FIRES, and as extras GUN OIL,
//   HAIR TRIGGER and OILED COGS (the RATE runes, re-amounted after the first run: STOKED FIRES +25% -> +15%, GUN OIL
//   +10% -> +15%, HAIR TRIGGER +20% -> +25% -> +50%, OILED COGS +10% -> +5%; the earlier runs are kept as
//   R/output-runes1/runevalue-first.md and runevalue-second.md). R1b-2's IRON MOSS (GROW) and HOARD FANG gear rows and its hoard-vs-spend section are dropped (no GROW and no
//   gear in RUNES-1).
// - The report sets each rune beside R1b-2's number in today's units and R1b-2's tier target (1.5).
// METHOD KEPT (R1b-2's): members are each hero's par decks (src/sim/harness/par parField), seeds 1..K, days 3-10; the
// field is the four heroes' par decks of the same day, seeds 1..KO; one seed per pairing, hashSeed(13, "r1b2-rune", h,
// d, i, foe, j), shared by the base and every rune; only the member's side gets the rune; score win 1, draw 0.5; gain =
// rune minus base in win-rate points; 95% t-interval over the hero x member values.
//
// RUNES-2a M5: the same method on any list of runes, an amount override per variant, shards and a merge.
// - --ids a,b@n,...  the variants, in this order (default: IDS below). `id@n` benches rune `id` at amount n (its own
//   unit, a whole number): RUNES[id].amount.n is n while that variant's builds are made and its battles run, and is
//   restored after each. The gold kinds (dawnGold, runeTithe, victorGold) are refused: their gold never reaches a battle.
// - --out <dir>, --k K, --ko KO (or the positional <outDir> [K] [KO]); --days 3,4,... (default 3-10).
// - --shard i/n (1 <= i <= n): this process benches only the variants at places i, i+n, i+2n, ... of --ids, but always
//   plays the shared base itself, so each shard's gains are paired exactly as one process's would be.
// - --merge dir1,dir2,... --out <dir>: reads the shards' runevalue.json (one run's shards, or several runs') and writes
//   one runevalue.md + runevalue.json. It refuses two shards of one run whose bases differ.
// - WARLORD'S DUE (winDmgPct) reads the battle's wins (simulate's 5th parameter): in every battle (the base and every
//   rune) the member side carries Math.floor((day - 1) / 2) wins and the field 0. A side without winDmgPct ignores them.
// - The report gives each rune's gain against R1b-2 1.5's band for its tier, "in", "under" or "over", and for one outside
//   its band a whole-number re-amount in the same unit, linear from the measured gain toward the band's middle (on n - 1
//   for a "x n" kind), to re-bench as id@n.
//
// No npm script (package files are frozen). Build and run:
//   npx vite build --ssr tools/runevalue.ts --outDir <tmp> --emptyOutDir --logLevel warn
//   node <tmp>/runevalue.js <outDir> [K=10] [KO=5]      ->  <outDir>/runevalue.md + runevalue.json
//   node <tmp>/runevalue.js --ids hair_trigger@6,twin_suns --shard 1/4 --out <dir1>   (and 2/4 .. 4/4, in parallel)
//   node <tmp>/runevalue.js --merge <dir1>,<dir2>,<dir3>,<dir4> --out <dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { simulate, type Battle } from "../src/sim/battle";
import { parField } from "../src/sim/harness/par";
import { hashSeed } from "../src/core/rng";
import { RULES_VERSION, type HeroId, type Rarity } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { RUNES, STYLE_THEMES, type RuneKind, type RuneUnit } from "../src/sim/runes";

// ---- the command line ------------------------------------------------------------------------------------------------
const FLAGS = ["ids", "out", "k", "ko", "shard", "merge", "days"] as const;
type Flag = (typeof FLAGS)[number];
const flags: Partial<Record<Flag, string>> = {};
const pos: string[] = [];
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const eq = a.indexOf("=");
    const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (!(FLAGS as readonly string[]).includes(name)) throw new Error(`runevalue: unknown flag ${a} (${FLAGS.map((f) => `--${f}`).join(" ")})`);
    const value = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (value === undefined || value === "") throw new Error(`runevalue: ${a} needs a value`);
    flags[name as Flag] = value;
  }
}
const OUT = flags.out ?? pos[0] ?? ".";
const K = Number(flags.k ?? pos[1] ?? 10); // members per hero (par decks, seeds 1..K)
const KO = Number(flags.ko ?? pos[2] ?? 5); // opponents per hero in the field (seeds 1..KO)
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const DAYS = flags.days ? flags.days.split(",").map(Number) : [3, 4, 5, 6, 7, 8, 9, 10];
const DAYS_R1B = [4, 5, 6, 7, 8, 9, 10].filter((d) => DAYS.includes(d)); // R1b's relicvalue.ts span (RIVET HOARD, SPARE HULL)
if (!Number.isInteger(K) || K < 1 || !Number.isInteger(KO) || KO < 1) throw new Error(`runevalue: K and KO must be whole and >= 1 (K ${K}, KO ${KO})`);
if (!DAYS.length || DAYS.some((d) => !Number.isInteger(d) || d < 1)) throw new Error(`runevalue: --days wants whole days >= 1, not ${flags.days}`);
const [SHARD_I, SHARD_N] = (flags.shard ?? "1/1").split("/").map(Number);
if (!(Number.isInteger(SHARD_I) && Number.isInteger(SHARD_N) && SHARD_N >= 1 && SHARD_I >= 1 && SHARD_I <= SHARD_N))
  throw new Error(`runevalue: --shard wants i/n with 1 <= i <= n, not ${flags.shard}`);

/** The benched runes, in R1b 1.5's order, then the extras (the other RATE runes). */
const IDS = ["rivet_hoard", "war_edge", "spare_hull", "iron_skin", "sharp_scrap", "stoked_fires", "gun_oil", "hair_trigger", "oiled_cogs"];

/** R1b-2's number for each rune, in today's units (R1b REPORT.md 1.4 and 1.5; relicvalue.md; runevalue.md). */
const R1B: Record<string, { value: number | null; text: string }> = {
  rivet_hoard: { value: 3.0, text: "+3.0 (R1b relicvalue plate6: 6 PLATE = 60 N1, set on the plating pool by hand; days 4-10, K 12, KO 6; per hero 2.2 to 3.7)" },
  war_edge: { value: 8.4, text: "+8.4, 6.9 to 10.0 (R1b-2 dmg10: +1 = +10 N1 added at impact to every damaging projectile, a SCATTER pellet its share)" },
  spare_hull: { value: 10.0, text: "+10.0 (R1b relicvalue hull30: +30 HULL = +300 N1 in hullBonus; days 4-10, K 12, KO 6; per hero 7.0 to 13.4)" },
  iron_skin: { value: 5, text: "about +5 (R1b inferred from +25 HULL = +8.7 and +30 = +10.0; +15 HULL = +150 N1)" },
  sharp_scrap: { value: 4.5, text: "about +4.5 (R1b inferred, half of WAR EDGE, for its OLD form: +5 N1 = +0.5 today on every shot)" },
  stoked_fires: { value: null, text: "none (not measured)" },
  gun_oil: { value: null, text: "none (not measured)" },
  hair_trigger: { value: null, text: "none (not measured)" },
  oiled_cogs: { value: null, text: "none (not measured)" },
};
const NO_R1B = { value: null, text: "none" };
/** R1b-2 1.5: what a pick should be worth, in points. */
const TARGET: Record<Rarity, [number, number]> = { common: [3, 5], rare: [6, 10], epic: [10, 16], legendary: [16, 25] };
/** The units NUM-1 multiplies by 10 (runes.ts header); the others stay. For the N1 column only. */
const N1_X10: readonly RuneUnit[] = ["dmg", "hull", "plate"];
/** The run's gold kinds: the bench can't see them (their gold never reaches a battle). */
const GOLD_KINDS: readonly RuneKind[] = ["dawnGold", "runeTithe", "victorGold"];
/** The kinds whose amount is a multiplier ("x n", "fires n times"): their gain scales with n - 1. */
const MUL_KINDS: readonly RuneKind[] = ["pairTwice", "pairMul", "volleyFirst", "rideMul", "frayMul"];

/** One benched variant: a rune at its catalogue amount, or at `n` (id@n). */
interface Variant { key: string; index: number; id: string; n: number; override: boolean }

/** Run `f` with RUNES[v.id].amount.n = v.n, then restore the catalogue's amount. */
function withAmount<T>(v: Variant, f: () => T): T {
  const a = RUNES[v.id].amount, keep = a.n;
  a.n = v.n;
  try { return f(); } finally { a.n = keep; }
}

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

// ---- statistics and the report ---------------------------------------------------------------------------------------
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

type Where = "in" | "under" | "over";
interface Row {
  key: string; index: number; id: string; name: string; tier: Rarity; theme: string; kind: RuneKind;
  amount: { unit: RuneUnit; n: number }; catalogueN: number; override: boolean; text: string; n1: number;
  all: CI; days4to10: CI | null; byDay: Record<number, CI>; byHero: Record<string, CI>;
  r1b: { value: number | null; text: string }; target: [number, number]; where: Where; verdict: string;
  proposal: { n: number | null; text: string } | null;
}

function verdict(c: CI, tier: Rarity): { where: Where; text: string } {
  const [lo, hi] = TARGET[tier];
  const where: Where = c.mean < lo ? "under" : c.mean > hi ? "over" : "in";
  const band = c.hi < lo ? "interval wholly below" : c.lo > hi ? "interval wholly above" : "interval overlaps the band";
  return { where, text: `${where}; ${band}` };
}

/** A whole-number re-amount in the same unit for a rune outside its band: linear from the measured gain toward the
 *  band's middle (on n - 1 for a "x n" kind); a rounding back to n takes one whole step toward the band. */
function propose(kind: RuneKind, n: number, gain: number, tier: Rarity): Row["proposal"] {
  const [lo, hi] = TARGET[tier];
  if (gain >= lo && gain <= hi) return null;
  const mid = (lo + hi) / 2;
  if (gain < 0.5) return { n: null, text: `none: the gain (${sg(gain)}) is about 0, so no amount scales it linearly` };
  const mul = MUL_KINDS.includes(kind), base = mul ? 1 : 0;
  let m = base + Math.round(((n - base) * mid) / gain);
  if (m === n) m = gain < lo ? n + 1 : n - 1;
  if (m <= base) return { n: null, text: `none in whole numbers: ${mul ? "x" : ""}${n} is the least amount that does anything` };
  return { n: m, text: `${mul ? "x" : ""}${m} (linear${mul ? " on n - 1" : ""} from ${sg(gain)} at ${n}, toward +${mid})` };
}

const effectText = (text: string, n: number, unit: RuneUnit) =>
  text.replace(/\{N\}/g, `${n}${unit === "pct" ? "%" : ""}`).replace(/\{\*?([A-Z]+)\}/g, "$1");
const amountText = (r: Row) =>
  `${r.amount.n} ${r.amount.unit}${N1_X10.includes(r.amount.unit) ? ` (N1 ${r.amount.n * 10})` : ""}${r.override ? ` [catalogue ${r.catalogueN}]` : ""}`;
const label = (r: Row) => (r.override ? `${r.name} @${r.amount.n}` : r.name);

interface Meta { rules: string; K: number; KO: number; days: number[]; head: string; bases: { label: string; baseWr: Record<string, number> }[] }

function report(rows: Row[], m: Meta): string {
  const first = m.days[0], last = m.days[m.days.length - 1];
  const shown = [3, 6, 10].filter((d) => m.days.includes(d));
  const days = shown.length ? shown : [first, last];
  const ids = new Set(rows.map((r) => r.id));
  const style = rows.filter((r) => (STYLE_THEMES as readonly string[]).includes(r.theme) && r.byHero[r.theme]);
  const notes = [
    ids.has("warlords_due") ? "- WARLORD'S DUE: every battle passes simulate's `wins`, the member side Math.floor((day - 1) / 2) (day 3: 1, day 6: 2, day 10: 4) and the field 0; only a side holding winDmgPct reads them, so the base and every other rune play as before." : "",
    rows.some((r) => R1B[r.id]?.value != null) ? "- R1b's numbers were measured under bb-0.8.3 on that rules version's par decks; this table runs on today's. RIVET HOARD and SPARE HULL come from R1b's relicvalue.md (days 4-10, K 12, KO 6, its own seeds): compare them with the days 4-10 column (section 2)." : "",
    ids.has("war_edge") ? "- WAR EDGE: R1b-2 added its +1 at impact to every damaging side-0 projectile (after the foe's debuffs); the shipped rune adds +1 to each shot when it is fired (battle.ts runeShot, before the debuffs, like the gear's flat bonuses), and a SCATTER pellet still gets its share." : "",
    ids.has("rivet_hoard") ? "- RIVET HOARD: R1b set the plating pool (plate and peak) to 6 before the first tick; the shipped rune adds 6 through addPlate at the battle's start (PLATE_CAP holds)." : "",
    ids.has("sharp_scrap") ? "- SHARP SCRAP changed form: R1b's +5 N1 on every shot (+0.5 today, not whole) became +5 on each turret's first shot of a battle, so R1b's inferred +4.5 is for a different rune." : "",
    ids.has("hair_trigger") ? "- HAIR TRIGGER (RUNES-2a, Q6) is now turrets AND factories (allRate); RUNES-1's +50% turret-only RATE measured +5.6." : "",
  ].filter(Boolean);
  const lines = [
    `# Rune value bench (tools/runevalue.ts, rules ${m.rules})`, "",
    `${m.head} Members: each hero's par decks, seeds 1-${m.K}, days ${first}-${last}. Field: the four heroes' par decks of the same day, seeds 1-${m.KO}. Paired: one seed per pairing (R1b-2's hashSeed(13, "r1b2-rune", ...)) for the base and every rune; only the member's side gets the rune. Score: win 1, draw 0.5. Gain = rune minus base, in win-rate points.`, "",
    "Each rune is applied as run.ts takeRune applies it (withRune): the member's build gets `runes: [{ id }]`, and a HULL or BELT rune also adds its amount to hullBonus / beltCap; every other kind acts in battle through Build.runes (runes.ts runeMods, read by battle.ts). Amounts come from src/sim/runes.ts, except a variant `id@n` (marked @n), which sets that rune's amount to n for its own builds and battles only. Nothing patches the Battle instance.", "",
    `## 1. Gain by rune (all heroes, days ${first}-${last}; 95% interval over the ${HEROES.length * m.K} hero x member values)`, "",
    `| rune | tier | theme | amount (unit) | effect | gain (95% interval) | ${days.map((d) => `day ${d}`).join(" | ")} | band | in/under/over | proposed re-amount | R1b-2's number, today's units |`,
    `|---|---|---|---|---|---|${days.map(() => "---").join("|")}|---|---|---|---|`,
    ...rows.map((r) => `| ${label(r)} | ${r.tier} | ${r.theme} | ${amountText(r)} | ${r.text} | ${cell(r.all)} | ${days.map((d) => (r.byDay[d] ? sg(r.byDay[d].mean) : "-")).join(" | ")} | +${r.target[0]} to +${r.target[1]} | ${r.verdict} | ${r.proposal ? r.proposal.text : "-"} | ${r.r1b.text} |`), "",
    "R1b-2's tier bands (1.5): common +3 to +5, rare +6 to +10, epic +10 to +16, legendary +16 to +25 (or a rule that defines the run). in/under/over reads the mean; the proposal is linear from the measured gain (an estimate: re-bench it as id@n).", "",
    ...(style.length ? [
      `## 1b. The style runes on their own hero (runeWeight: the hero's own style x3, another hero's x1; 95% interval over its ${m.K} members)`, "",
      "| rune | tier | amount (unit) | own hero | own hero's gain | band | in/under/over | proposed re-amount (from the own hero's gain) | all heroes |",
      "|---|---|---|---|---|---|---|---|---|",
      ...style.map((r) => {
        const c = r.byHero[r.theme], v = verdict(c, r.tier), p = propose(r.kind, r.amount.n, c.mean, r.tier);
        return `| ${label(r)} | ${r.tier} | ${amountText(r)} | ${r.theme} | ${cell(c)} | +${r.target[0]} to +${r.target[1]} | ${v.text} | ${p ? p.text : "-"} | ${cell(r.all)} |`;
      }), ""] : []),
    "## 2. Gain by day (all heroes; 95% interval over the hero x member values)", "",
    `| rune | ${m.days.map((d) => `day ${d}`).join(" | ")} | days 4-10 (R1b's relicvalue span) |`, `|---|${m.days.map(() => "---").join("|")}|---|`,
    ...rows.map((r) => `| ${label(r)} | ${m.days.map((d) => cell(r.byDay[d])).join(" | ")} | ${r.days4to10 ? cell(r.days4to10) : "-"} |`), "",
    `## 3. Gain by hero (days ${first}-${last}; 95% interval over the ${m.K} members)`, "",
    `| rune | ${HEROES.join(" | ")} |`, `|---|${HEROES.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${label(r)} | ${HEROES.map((h) => cell(r.byHero[h])).join(" | ")} |`),
    ...m.bases.map((b) => `| (base win % vs the field${b.label}) | ${HEROES.map((h) => r1(b.baseWr[h]).toFixed(1)).join(" | ")} |`), "",
    ...(notes.length ? ["## 4. Notes", "", ...notes, ""] : []),
    "For scale (BELTS run 5 truth table, the same unit, K 16): a level-2 upgrade (10 gold) gains FURNACE T +3.3 / F +7.2, WEAVER T +1.3 / F +11.7, FOUNDRY T +1.9 / F +9.5, BASTION T +5.7 / F +5.3 (mean of the 8: +5.7).",
  ];
  return lines.join("\n") + "\n";
}

// ---- a bench run (one shard, or all of it) ---------------------------------------------------------------------------
interface RunJson {
  tool: "runevalue"; rules: string; K: number; KO: number; days: number[]; variants: string[]; shard: string;
  battles: number; seconds: number; tField: number; started: string; baseWr: Record<string, number>; runes: Row[];
  gains: Record<string, Record<string, number[]>>; gainsDays4to10: Record<string, Record<string, number[]>>;
  byDay: Record<string, Record<number, number[]>>;
}

function bench(): void {
  const all: Variant[] = (flags.ids ? flags.ids.split(",") : IDS).map((s, index) => {
    const key = s.trim();
    const [id, at, extra] = key.split("@");
    const d = RUNES[id];
    if (!d || extra !== undefined) throw new Error(`runevalue: ${key} is not a rune of this rules version's catalogue (id or id@n)`);
    if (GOLD_KINDS.includes(d.kind)) throw new Error(`runevalue: ${d.name} is a gold rune: its gold never reaches a battle, so the bench can't see it`);
    const n = at === undefined ? d.amount.n : Number(at);
    if (!Number.isInteger(n) || n < 0) throw new Error(`runevalue: ${key}: the amount must be a whole number`);
    return { key, index, id, n, override: at !== undefined };
  });
  if (new Set(all.map((v) => v.key)).size !== all.length) throw new Error("runevalue: a variant is given twice");
  const MINE = all.filter((v) => v.index % SHARD_N === SHARD_I - 1);
  const shard = `${SHARD_I}/${SHARD_N}`;

  const t0 = Date.now();
  const field: Record<string, Build[]> = {};
  for (const h of HEROES) for (const d of DAYS) field[`${h}:${d}`] = parField(h, d, Math.max(K, KO));
  const tField = (Date.now() - t0) / 1000;
  for (const k of Object.keys(field)) if (field[k].some((b) => b.runes?.length)) throw new Error(`runevalue: a par deck of ${k} holds runes`);

  let battles = 0;
  const score = (bt: Battle) => (bt.winner === 0 ? 1 : bt.winner === -1 ? 0.5 : 0);
  function play(mine: Build, theirs: Build, seed: number, wins: readonly [number, number]): number {
    const bt = simulate(mine, theirs, seed, undefined, wins);
    if (!bt.over) throw new Error("runevalue: a battle ran past simulate's tick cap");
    battles++;
    return score(bt);
  }

  // ---- paired gains by rune, hero and day ----------------------------------------------------------------------------
  const gains: Record<string, Record<string, number[]>> = {}; // [variant][hero][member] mean over the days and opponents
  const gainsR1b: Record<string, Record<string, number[]>> = {}; // the same over days 4-10 (R1b's relicvalue span)
  const byDay: Record<string, Record<number, number[]>> = {}; // [variant][day][hero*K + member] mean over opponents
  const baseWr: Record<string, number> = {};
  for (const v of MINE) {
    gains[v.key] = {}; gainsR1b[v.key] = {}; byDay[v.key] = {};
    for (const h of HEROES) { gains[v.key][h] = new Array(K).fill(0); gainsR1b[v.key][h] = new Array(K).fill(0); }
    for (const d of DAYS) byDay[v.key][d] = [];
  }
  for (const h of HEROES) {
    let baseSum = 0, baseN = 0;
    for (let i = 0; i < K; i++) {
      const sum: Record<string, number> = {}, sumR1b: Record<string, number> = {};
      let n = 0, nR1b = 0;
      for (const d of DAYS) {
        const mine = field[`${h}:${d}`][i];
        const wins: readonly [number, number] = [Math.floor((d - 1) / 2), 0]; // WARLORD'S DUE: the member's wins, the field's
        const builds = MINE.map((v) => withAmount(v, () => withRune(mine, v.id)));
        const perDay: Record<string, number> = {};
        let nd = 0;
        for (const foe of HEROES) for (let j = 0; j < KO; j++) {
          const theirs = field[`${foe}:${d}`][j];
          const seed = hashSeed(13, "r1b2-rune", h, d, i, foe, j);
          const base = play(mine, theirs, seed, wins);
          baseSum += base; baseN++;
          MINE.forEach((v, vi) => {
            perDay[v.key] = (perDay[v.key] ?? 0) + (withAmount(v, () => play(builds[vi], theirs, seed, wins)) - base);
          });
          nd++;
        }
        for (const v of MINE) {
          byDay[v.key][d].push((100 * perDay[v.key]) / nd);
          sum[v.key] = (sum[v.key] ?? 0) + perDay[v.key];
          if (DAYS_R1B.includes(d)) sumR1b[v.key] = (sumR1b[v.key] ?? 0) + perDay[v.key];
        }
        n += nd;
        if (DAYS_R1B.includes(d)) nR1b += nd;
      }
      for (const v of MINE) {
        gains[v.key][h][i] = (100 * sum[v.key]) / n;
        gainsR1b[v.key][h][i] = nR1b ? (100 * sumR1b[v.key]) / nR1b : NaN;
      }
    }
    baseWr[h] = (100 * baseSum) / baseN;
    console.log(`runevalue ${shard}: ${h} done, ${battles} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  const rows: Row[] = MINE.map((v) => {
    const d = RUNES[v.id];
    const allCi = ci(HEROES.flatMap((h) => gains[v.key][h]));
    const vd = verdict(allCi, d.tier);
    return {
      key: v.key, index: v.index, id: v.id, name: d.name, tier: d.tier, theme: d.theme, kind: d.kind,
      amount: { unit: d.amount.unit, n: v.n }, catalogueN: d.amount.n, override: v.override,
      text: effectText(d.text, v.n, d.amount.unit), n1: N1_X10.includes(d.amount.unit) ? v.n * 10 : v.n,
      all: allCi, days4to10: DAYS_R1B.length ? ci(HEROES.flatMap((h) => gainsR1b[v.key][h])) : null,
      byDay: Object.fromEntries(DAYS.map((day) => [day, ci(byDay[v.key][day])])) as Record<number, CI>,
      byHero: Object.fromEntries(HEROES.map((h) => [h, ci(gains[v.key][h])])) as Record<string, CI>,
      r1b: R1B[v.id] ?? NO_R1B, target: TARGET[d.tier], where: vd.where, verdict: vd.text,
      proposal: propose(d.kind, v.n, allCi.mean, d.tier),
    };
  });
  const seconds = (Date.now() - t0) / 1000;
  const head = `Generated ${new Date().toISOString()} by tools/runevalue.ts, shard ${shard} of --ids ${all.map((v) => v.key).join(",")}. ${battles} battles; par fields ${tField.toFixed(0)} s; total ${seconds.toFixed(0)} s.`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/runevalue.md`, report(rows, { rules: RULES_VERSION, K, KO, days: DAYS, head, bases: [{ label: "", baseWr }] }));
  const json: RunJson = {
    tool: "runevalue", rules: RULES_VERSION, K, KO, days: DAYS, variants: all.map((v) => v.key), shard, battles,
    seconds: Math.round(seconds), tField: Math.round(tField), started: new Date(t0).toISOString(), baseWr, runes: rows,
    gains, gainsDays4to10: gainsR1b, byDay,
  };
  writeFileSync(`${OUT}/runevalue.json`, JSON.stringify(json, null, 1));
  console.log(`runevalue ${shard}: wrote ${OUT}/runevalue.md and .json (${rows.length} variants, ${battles} battles, ${seconds.toFixed(0)} s)`);
}

// ---- the merge -------------------------------------------------------------------------------------------------------
function merge(dirs: string[]): void {
  const shards = dirs.map((dir) => ({ dir, j: JSON.parse(readFileSync(`${dir}/runevalue.json`, "utf8")) as RunJson }));
  const f = shards[0].j;
  for (const s of shards)
    if (s.j.rules !== f.rules || s.j.K !== f.K || s.j.KO !== f.KO || s.j.days.join() !== f.days.join())
      throw new Error(`runevalue --merge: ${s.dir} ran rules ${s.j.rules}, K ${s.j.K}, KO ${s.j.KO}, days ${s.j.days.join()}; ${shards[0].dir} ran ${f.rules}, K ${f.K}, KO ${f.KO}, days ${f.days.join()}`);
  // a run: the shards of one --ids list (each paired with its own base)
  const runs: { variants: string[]; shards: typeof shards; baseWr: Record<string, number> }[] = [];
  for (const s of shards) {
    const run = runs.find((r) => r.variants.join() === s.j.variants.join());
    if (!run) { runs.push({ variants: s.j.variants, shards: [s], baseWr: s.j.baseWr }); continue; }
    if (run.shards.some((q) => q.j.shard === s.j.shard)) throw new Error(`runevalue --merge: shard ${s.j.shard} of one run is given twice (${s.dir})`);
    if (JSON.stringify(run.baseWr) !== JSON.stringify(s.j.baseWr))
      throw new Error(`runevalue --merge: ${s.dir}'s base differs from ${run.shards[0].dir}'s; one run's shards must play the same base (did the code change between them?)`);
    run.shards.push(s);
  }
  const rows: Row[] = [], missing: string[] = [];
  for (const run of runs) {
    const got = run.shards.flatMap((s) => s.j.runes).sort((a, b) => a.index - b.index);
    for (const k of run.variants) if (!got.some((r) => r.key === k)) missing.push(k);
    for (const r of got) {
      if (rows.some((q) => q.key === r.key)) throw new Error(`runevalue --merge: ${r.key} is in two runs`);
      rows.push(r);
    }
  }
  const battles = shards.reduce((a, s) => a + s.j.battles, 0), cpu = shards.reduce((a, s) => a + s.j.seconds, 0);
  const sameBase = runs.every((r) => JSON.stringify(r.baseWr) === JSON.stringify(runs[0].baseWr));
  const runText = runs.map((r, i) => `run ${i + 1} (${r.shards.length} shard${r.shards.length > 1 ? "s" : ""}: ${r.shards.map((s) => `${s.j.shard} ${s.j.battles} battles ${s.j.seconds} s`).join(", ")})`).join("; ");
  const head = `Merged ${new Date().toISOString()} by tools/runevalue.ts --merge from ${shards.length} shard${shards.length > 1 ? "s" : ""}: ${runText}. ${battles} battles in all (every shard plays the shared base itself); ${cpu} s of process time.${missing.length ? ` NOT merged (shard missing): ${missing.join(", ")}.` : ""}${runs.length > 1 ? (sameBase ? " Every run played the same base." : " The runs' bases differ (the code changed between them); each gain is paired with its own run's base.") : ""}`;
  const bases = sameBase ? [{ label: "", baseWr: runs[0].baseWr }] : runs.map((r, i) => ({ label: `, run ${i + 1}`, baseWr: r.baseWr }));
  const md = report(rows, { rules: f.rules, K: f.K, KO: f.KO, days: f.days, head, bases });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/runevalue.md`, md);
  const pick = <T>(get: (j: RunJson) => Record<string, T>) => Object.assign({}, ...shards.map((s) => get(s.j))) as Record<string, T>;
  writeFileSync(`${OUT}/runevalue.json`, JSON.stringify({
    tool: "runevalue", merged: true, rules: f.rules, K: f.K, KO: f.KO, days: f.days, battles, cpuSeconds: cpu, missing,
    runs: runs.map((r) => ({ variants: r.variants, baseWr: r.baseWr, shards: r.shards.map((s) => ({ dir: s.dir, shard: s.j.shard, battles: s.j.battles, seconds: s.j.seconds, tField: s.j.tField, started: s.j.started })) })),
    runes: rows, gains: pick((j) => j.gains), gainsDays4to10: pick((j) => j.gainsDays4to10), byDay: pick((j) => j.byDay),
  }, null, 1));
  console.log(md);
}

if (flags.merge) merge(flags.merge.split(",").map((s) => s.trim()).filter(Boolean));
else bench();
