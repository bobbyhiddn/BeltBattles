// SHAPES-2 step 3 (REQ-BFG-114 (2); BRIEF-SHAPES2 S3): THE OFFERS BENCH. How many shaped-rig cards does a run's shops show?
//
// It drives the game's own run.ts (newRun, rollShop), not the harness's shop model: for each hero and each run seed in
// --from .. --from + --seeds - 1, days 1..--days, the first roll of each day's shop (run.shop.rerolls 0), with the player
// buying nothing: the day's final caravan is yesterday's variety check (day.ts nextDawn's own three lines), the hero's starting
// deck is the only thing owned, and no reroll, discount or pack is used. That is a floor: RUN-1's runs are longer, so they
// only add shops. Every shaped-rig card shown counts (all nine: SHAPES-1's NAIL STRIP, EMBER TROUGH and SPIKE RAIL and
// SHAPES-2's six), a card shown on two days counts on both. The bar (BRIEF-SHAPES2 S3), on every hero: the median run sees at
// least 6, and at least 75% of runs see at least 5.
//
// Also (REQ-BFG-022): the per-run draw's size (the band 55-70) and day 1's pool (17+ buyable parts), and the shaped rigs among
// the run's wares. The worlds are set the way the 1D ship order loads them (PLAIN_RIGS, SHAPES, SHAPES2: the catalogue's
// order is part of the seeded draws), unless --order says otherwise. Pure reads of the game's seeded streams.
//
// Usage: npx vite build --ssr tools/shapes2/offers.ts --outDir <dir> --emptyOutDir --logLevel warn
//        node <dir>/offers.js [--heroes furnace,weaver,foundry,bastion] [--seeds 300] [--from 1] [--days 10]
//             [--shapes2 on|off] [--plain on|off] [--shapes on|off] [--label text] [--out file.json] [--md file.md]
import { writeFileSync } from "node:fs";
import { ITEMS, RARITIES, buyableModules, type HeroId, type Rarity } from "../../src/sim/content";
import { newRun, rollShop, type Run } from "../../src/game/run";
import { setPlainRigs } from "../../src/sim/plainRigs";
import { SHAPES_IDS, setShapes } from "../../src/sim/shapes";
import { SHAPES2_DEFS, SHAPES2_IDS, SHAPES2_ODDS, setShapes2 } from "../../src/sim/shapes2";
import type { ItemDef, MerchantId } from "../../src/sim/content";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const HEROES = arg("--heroes", "furnace,weaver,foundry,bastion").split(",").filter(Boolean) as HeroId[];
const N = Number(arg("--seeds", "300"));
const FROM = Number(arg("--from", "1"));
const DAYS = Number(arg("--days", "10"));
const ON = (k: string, d: string): boolean => arg(k, d) === "on";
const S2 = ON("--shapes2", "on"), PLAIN = ON("--plain", "on"), SH = ON("--shapes", "on");
const LABEL_BASE = `SHAPES2 ${S2 ? "on" : "off"}, PLAIN_RIGS ${PLAIN ? "on" : "off"}, SHAPES ${SH ? "on" : "off"}`;
// the offer lever (shapes2.ts SHAPES2_ODDS): --k the per-run draw keeps at least K shaped rigs (b); absent: the shipped value
// (lever c, a weight in the slot's pick, was tried on a build kept in bench/lever-trials.patch and not needed: REPORT section 5)
if (process.argv.includes("--k")) SHAPES2_ODDS.minStock = Number(arg("--k", "0"));
const OUT = arg("--out", "offers.json");
const LABEL = arg("--label", `${LABEL_BASE}, minStock ${SHAPES2_ODDS.minStock}`);
const MD = arg("--md", "");

// --merchants id=merchant,id=merchant: lever (a)'s trials (BRIEF-SHAPES2 S3): the six's merchants, before the switch goes on
for (const kv of arg("--merchants", "").split(",").filter(Boolean)) {
  const [id, m] = kv.split("=");
  (SHAPES2_DEFS as Record<string, ItemDef>)[id] = { ...SHAPES2_DEFS[id], merchant: m as MerchantId };
}
// the 1D load order: plainRigs.ts, then shapes.ts, then shapes2.ts (deck.ts's import order), so ITEMS' order is the ship's
setShapes2(false); setShapes(false); setPlainRigs(false);
setPlainRigs(PLAIN); setShapes(SH); setShapes2(S2);

const SHAPED = [...(SH ? SHAPES_IDS : []), ...(S2 ? SHAPES2_IDS : [])];
const isShaped = (def: string): boolean => SHAPED.includes(def);

const pct = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
};
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const r2 = (x: number): number => Math.round(100 * x) / 100;
const r1 = (x: number): number => Math.round(10 * x) / 10;

interface HeroRow {
  hero: string; runs: number; seeds: string;
  median: number; p25: number; p75: number; min: number; max: number; mean: number;
  shareGe5: number; shareGe6: number; shareGe3: number; passMedian6: boolean; passShare75: boolean; pass: boolean;
  perDay: number[]; // mean shaped cards in day d's shop
  perDayShopsWith: number[]; // % of day d's shops showing at least one
  perRig: Record<string, number>; // % of all shaped cards shown
  perRigPerRun: Record<string, number>; // mean cards of this rig a run
  cardsPerShop: number; // mean offers a shop (all pieces)
  shapedWares: number; // mean shaped rigs among a run's wares
  shapedWaresPct: Record<string, number>; // % of runs holding this rig among the wares
  wares: { mean: number; min: number; max: number };
  day1Pool: { mean: number; min: number; max: number };
}

function hero(h: HeroId): HeroRow {
  const totals: number[] = [];
  const perDay = new Array<number>(DAYS).fill(0), perDayWith = new Array<number>(DAYS).fill(0);
  const perRig: Record<string, number> = Object.fromEntries(SHAPED.map((id) => [id, 0]));
  const inWares: Record<string, number> = Object.fromEntries(SHAPED.map((id) => [id, 0]));
  const waresN: number[] = [], day1N: number[] = [], shapedWares: number[] = [];
  let offersTotal = 0, shopsTotal = 0;
  for (let s = FROM; s < FROM + N; s++) {
    const run: Run = newRun(h, s, `offers-${h}-${s}`);
    let total = 0;
    const ids = Object.keys(run.wares ?? {});
    waresN.push(ids.length);
    day1N.push(ids.filter((id) => (run.wares as Record<string, number>)[id] <= 1).length);
    shapedWares.push(ids.filter(isShaped).length);
    for (const id of ids) if (id in inWares) inWares[id]++;
    for (let d = 1; d <= DAYS; d++) {
      if (d > 1) { // day.ts nextDawn's three lines: yesterday's final caravan is today's variety check, then a fresh roll
        run.day = d;
        run.lastMerchants = run.shop.wagons.map((w) => w.merchant);
        run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
        rollShop(run);
      }
      let here = 0;
      for (const w of run.shop.wagons) for (const o of w.offers) {
        offersTotal++;
        if (isShaped(o.def)) { here++; perRig[o.def]++; }
      }
      shopsTotal++;
      perDay[d - 1] += here;
      if (here > 0) perDayWith[d - 1]++;
      total += here;
    }
    totals.push(total);
  }
  const all = Object.values(perRig).reduce((a, b) => a + b, 0);
  const share = (k: number): number => totals.filter((t) => t >= k).length / N;
  const median = pct(totals, 0.5), p25 = pct(totals, 0.25);
  const g5 = share(5), passMedian6 = median >= 6, passShare75 = g5 >= 0.75;
  return {
    hero: h, runs: N, seeds: `${FROM}-${FROM + N - 1}`,
    median, p25, p75: pct(totals, 0.75), min: Math.min(...totals), max: Math.max(...totals), mean: r2(mean(totals)),
    shareGe5: r1(100 * g5), shareGe6: r1(100 * share(6)), shareGe3: r1(100 * share(3)), passMedian6, passShare75, pass: passMedian6 && passShare75,
    perDay: perDay.map((x) => r2(x / N)), perDayShopsWith: perDayWith.map((x) => r1((100 * x) / N)),
    perRig: Object.fromEntries(SHAPED.map((id) => [id, r1(all ? (100 * perRig[id]) / all : 0)])),
    perRigPerRun: Object.fromEntries(SHAPED.map((id) => [id, r2(perRig[id] / N)])),
    cardsPerShop: r2(offersTotal / shopsTotal),
    shapedWares: r2(mean(shapedWares)), shapedWaresPct: Object.fromEntries(SHAPED.map((id) => [id, r1((100 * inWares[id]) / N)])),
    wares: { mean: r2(mean(waresN)), min: Math.min(...waresN), max: Math.max(...waresN) },
    day1Pool: { mean: r2(mean(day1N)), min: Math.min(...day1N), max: Math.max(...day1N) },
  };
}

const t0 = Date.now();
const rows = HEROES.map(hero);
const byRarity = (ids: string[]): Record<Rarity, number> => {
  const o = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  for (const id of ids) o[ITEMS[id].rarity]++;
  return o;
};
const out = {
  label: LABEL, switches: { SHAPES: SH, SHAPES2: S2, PLAIN_RIGS: PLAIN }, shaped: SHAPED, order: "PLAIN_RIGS, SHAPES, SHAPES2 (the 1D load order)",
  days: DAYS, seeds: `${FROM}-${FROM + N - 1}`, buys: "nothing", rerolls: 0, catalogue: buyableModules().length, shapedByRarity: byRarity(SHAPED),
  seconds: Math.round((Date.now() - t0) / 1000), rows,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));

const L: string[] = [];
L.push(`### ${LABEL} (seeds ${out.seeds} a hero, days 1-${DAYS}, first roll of each shop, buying nothing)`, "");
L.push("| hero | median | 25th pct | 75th pct | min-max | mean | share with 5+ | share with 6+ | bar (median 6+, 75% with 5+) |", "|---|---|---|---|---|---|---|---|---|");
for (const r of rows) L.push(`| ${r.hero} | ${r.median} | ${r.p25} | ${r.p75} | ${r.min}-${r.max} | ${r.mean} | ${r.shareGe5}% | ${r.shareGe6}% | ${r.pass ? "PASS" : "UNDER"} |`);
L.push("", `Per-day rate (mean shaped cards in day d's shop; % of shops showing at least one):`, "", `| hero | ${Array.from({ length: DAYS }, (_, i) => `d${i + 1}`).join(" | ")} |`, `|---|${"---|".repeat(DAYS)}`);
for (const r of rows) L.push(`| ${r.hero} | ${r.perDay.map((x, i) => `${x} (${r.perDayShopsWith[i]}%)`).join(" | ")} |`);
L.push("", "Each rig's share of the shaped cards shown (%), and its mean cards a run:", "", `| hero | ${SHAPED.join(" | ")} |`, `|---|${"---|".repeat(SHAPED.length)}`);
for (const r of rows) L.push(`| ${r.hero} | ${SHAPED.map((id) => `${r.perRig[id]}% (${r.perRigPerRun[id]})`).join(" | ")} |`);
L.push("", "The run's wares (REQ-BFG-022): wares a run (band 55-70), day 1's pool (17+), shaped rigs among the wares, and the % of runs holding each:", "", `| hero | wares mean (min-max) | day 1 pool mean (min-max) | shaped wares | ${SHAPED.join(" | ")} |`, `|---|---|---|---|${"---|".repeat(SHAPED.length)}`);
for (const r of rows) L.push(`| ${r.hero} | ${r.wares.mean} (${r.wares.min}-${r.wares.max}) | ${r.day1Pool.mean} (${r.day1Pool.min}-${r.day1Pool.max}) | ${r.shapedWares} | ${SHAPED.map((id) => `${r.shapedWaresPct[id]}%`).join(" | ")} |`);
L.push("", `Catalogue ${out.catalogue} buyable pieces; shaped rigs by rarity ${JSON.stringify(out.shapedByRarity)}; ${rows.reduce((a, r) => a + r.runs, 0)} runs in ${out.seconds} s.`, "");
const md = L.join("\n");
console.log(md);
if (MD) writeFileSync(MD, md);
