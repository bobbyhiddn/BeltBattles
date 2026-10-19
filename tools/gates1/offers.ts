// GATES-1 step 6 (G5; REQ-BFG-052; BRIEF-GATES1 G5): THE OFFERS BENCH. How many gate cards does a run's shops show?
//
// It drives the game's own run.ts (newRun, rollShop), not the harness's shop model, and is a copy of SHAPES-2's
// tools/shapes2/offers.ts for the three gates (FUSER, SCATTER MILL, SMELTER). For each hero and each run seed in
// --from .. --from + --seeds - 1, days 1..--days, the first roll of each day's shop (run.shop.rerolls 0), with the player
// buying nothing: the day's final caravan is yesterday's variety check (day.ts nextDawn's own three lines), the hero's starting
// deck is the only thing owned, and no reroll, discount or pack is used. That is a floor: a run that loses goes on past day 10
// (RUN-1's runs are longer), so it only adds shops. Every gate card shown counts, a card shown on two days counts on both. The
// bar (BRIEF-GATES1 G5), on every hero: the median run sees at least 3 gate cards, and at least 75% of runs see at least 1 by
// day 5. Gates are never in day 1's shop (wares.ts GATES_FIRST_DAY), so the count is of days 2-10 (days 2-5 for the share).
//
// Also (REQ-BFG-022): the per-run draw's size (the band 55-70) and day 1's pool (17+ buyable parts), and the gates among the
// run's wares. The worlds are set the way the ship loads them (PLAIN_RIGS, SHAPES, SHAPES2, then GATES last: the catalogue's
// order is part of the seeded draws), unless a switch says otherwise. Each hero's row also carries a digest of every run's
// wares and every shop it was shown, so two builds (GATES off against the base) can be compared to the digit. Pure reads of
// the game's seeded streams.
//
// Usage: npx vite build --ssr tools/gates1/offers.ts --outDir <dir> --emptyOutDir --logLevel warn
//        node <dir>/offers.js [--heroes furnace,weaver,foundry,bastion] [--seeds 300] [--from 1] [--days 10]
//             [--gates on|off] [--shapes2 on|off] [--plain on|off] [--shapes on|off] [--k N] [--merchants id=merchant,...]
//             [--label text] [--out file.json] [--md file.md]
//   --k N          the offer lever (gates.ts GATES_ODDS.minStock): the per-run draw keeps at least N of the three (b); absent: the shipped value
//   --merchants    lever (a)'s trials: the gates' merchants (e.g. smelter=tinker), patched before the switch goes on
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { ITEMS, RARITIES, buyableModules, type HeroId, type ItemDef, type MerchantId, type Rarity } from "../../src/sim/content";
import { newRun, rollShop, type Run } from "../../src/game/run";
import { setPlainRigs } from "../../src/sim/plainRigs";
import { setShapes } from "../../src/sim/shapes";
import { setShapes2 } from "../../src/sim/shapes2";
import { GATES_DEFS, GATES_IDS, GATES_ODDS, setGates } from "../../src/sim/gates";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const HEROES = arg("--heroes", "furnace,weaver,foundry,bastion").split(",").filter(Boolean) as HeroId[];
const N = Number(arg("--seeds", "300"));
const FROM = Number(arg("--from", "1"));
const DAYS = Number(arg("--days", "10"));
const ON = (k: string, d: string): boolean => arg(k, d) === "on";
const G = ON("--gates", "on"), S2 = ON("--shapes2", "on"), PLAIN = ON("--plain", "on"), SH = ON("--shapes", "on");
const LABEL_BASE = `GATES ${G ? "on" : "off"}, SHAPES2 ${S2 ? "on" : "off"}, PLAIN_RIGS ${PLAIN ? "on" : "off"}, SHAPES ${SH ? "on" : "off"}`;
// the offer lever (gates.ts GATES_ODDS): --k the per-run draw keeps at least K of the three gates (b); absent: the shipped value
if (process.argv.includes("--k")) GATES_ODDS.minStock = Number(arg("--k", "0"));
const OUT = arg("--out", "offers.json");
const LABEL = arg("--label", `${LABEL_BASE}, minStock ${GATES_ODDS.minStock}`);
const MD = arg("--md", "");

// --merchants id=merchant,id=merchant: lever (a)'s trials (BRIEF-GATES1 G5): the gates' merchants, before the switch goes on
const MERCHANTS_ARG = arg("--merchants", "");
for (const kv of MERCHANTS_ARG.split(",").filter(Boolean)) {
  const [id, m] = kv.split("=");
  (GATES_DEFS as Record<string, ItemDef>)[id] = { ...GATES_DEFS[id], merchant: m as MerchantId };
}
// the ship's load order: plainRigs.ts, then shapes.ts, then shapes2.ts, then gates.ts (deck.ts's import order), so ITEMS' order is the
// ship's; the reset below puts every switch off first and sets them on in that order
const LOADED = Object.keys(ITEMS);
setGates(false); setShapes2(false); setShapes(false); setPlainRigs(false);
setPlainRigs(PLAIN); setShapes(SH); setShapes2(S2); setGates(G);
// with the shipped worlds the reset must give back the load order (plus the three at the end with GATES on)
const ORDER_OK: boolean | null = PLAIN && SH && S2 ? JSON.stringify(Object.keys(ITEMS)) === JSON.stringify([...LOADED.filter((id) => !GATES_IDS.includes(id)), ...(G ? GATES_IDS : [])]) : null;

const GATES: readonly string[] = G ? GATES_IDS : [];
const isGate = (def: string): boolean => GATES.includes(def);

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
  shareBy5: number; shareBy10: number; shareGe3: number; passMedian3: boolean; passShare75: boolean; pass: boolean;
  shareByDay: number[]; // % of runs that have seen a gate card by the end of day d
  hist: Record<string, number>; // runs by their total gate cards (the last bucket: that many or more)
  perDay: number[]; // mean gate cards in day d's shop
  perDayShopsWith: number[]; // % of day d's shops showing at least one
  perGate: Record<string, number>; // % of all gate cards shown
  perGatePerRun: Record<string, number>; // mean cards of this gate a run
  perGatePerRunHeld: Record<string, number>; // mean cards of this gate a run that holds it among its wares
  cardsPerShop: number; // mean offers a shop (all pieces)
  gateWares: number; // mean gates among a run's wares
  gateWaresPct: Record<string, number>; // % of runs holding this gate among the wares
  day1Gates: number; // gates among day 1's pool, and gate cards in day 1's shops (both must be 0)
  day1Cards: number;
  firstDay: { median: number; never: number }; // the day of a run's first gate card (median of the runs that see one), and the % that never do
  wares: { mean: number; min: number; max: number };
  day1Pool: { mean: number; min: number; max: number };
  digest: string; // sha256 (first 16) of every run's wares and every shop it was shown
}

function hero(h: HeroId): HeroRow {
  const totals: number[] = [];
  const firsts: number[] = [];
  const perDay = new Array<number>(DAYS).fill(0), perDayWith = new Array<number>(DAYS).fill(0);
  const seenBy = new Array<number>(DAYS).fill(0); // runs that have seen a gate card by the end of day d
  const perGate: Record<string, number> = Object.fromEntries(GATES.map((id) => [id, 0]));
  const inWares: Record<string, number> = Object.fromEntries(GATES.map((id) => [id, 0]));
  const cardsWhenHeld: Record<string, number> = Object.fromEntries(GATES.map((id) => [id, 0]));
  const waresN: number[] = [], day1N: number[] = [], gateWares: number[] = [];
  let offersTotal = 0, shopsTotal = 0, day1Gates = 0, day1Cards = 0;
  const digest = createHash("sha256");
  for (let s = FROM; s < FROM + N; s++) {
    const run: Run = newRun(h, s, `offers-${h}-${s}`);
    let total = 0, first = 0;
    const wares = (run.wares ?? {}) as Record<string, number>;
    const ids = Object.keys(wares);
    waresN.push(ids.length);
    day1N.push(ids.filter((id) => wares[id] <= 1).length);
    gateWares.push(ids.filter(isGate).length);
    day1Gates += ids.filter((id) => isGate(id) && wares[id] <= 1).length;
    for (const id of ids) if (id in inWares) inWares[id]++;
    const shops: string[][] = [];
    const runCards: Record<string, number> = Object.fromEntries(GATES.map((id) => [id, 0]));
    for (let d = 1; d <= DAYS; d++) {
      if (d > 1) { // day.ts nextDawn's three lines: yesterday's final caravan is today's variety check, then a fresh roll
        run.day = d;
        run.lastMerchants = run.shop.wagons.map((w) => w.merchant);
        run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
        rollShop(run);
      }
      let here = 0;
      const shop: string[] = [];
      for (const w of run.shop.wagons) for (const o of w.offers) {
        offersTotal++;
        shop.push(`${w.merchant}:${o.def}:${o.price}`);
        if (isGate(o.def)) { here++; perGate[o.def]++; runCards[o.def]++; if (d === 1) day1Cards++; }
      }
      shops.push(shop);
      shopsTotal++;
      perDay[d - 1] += here;
      if (here > 0) perDayWith[d - 1]++;
      total += here;
      if (total > 0) { seenBy[d - 1]++; if (!first) first = d; }
    }
    for (const id of GATES) if (id in wares) cardsWhenHeld[id] += runCards[id];
    totals.push(total);
    if (first) firsts.push(first);
    digest.update(JSON.stringify([s, run.wares, shops]));
  }
  const all = Object.values(perGate).reduce((a, b) => a + b, 0);
  const share = (k: number): number => totals.filter((t) => t >= k).length / N;
  const median = pct(totals, 0.5), p25 = pct(totals, 0.25);
  const by5 = seenBy[Math.min(5, DAYS) - 1] / N, passMedian3 = median >= 3, passShare75 = by5 >= 0.75;
  const hist: Record<string, number> = {};
  for (const t of totals) { const k = t >= 8 ? "8+" : String(t); hist[k] = (hist[k] ?? 0) + 1; }
  return {
    hero: h, runs: N, seeds: `${FROM}-${FROM + N - 1}`,
    median, p25, p75: pct(totals, 0.75), min: Math.min(...totals), max: Math.max(...totals), mean: r2(mean(totals)),
    shareBy5: r1(100 * by5), shareBy10: r1((100 * seenBy[DAYS - 1]) / N), shareGe3: r1(100 * share(3)), passMedian3, passShare75, pass: passMedian3 && passShare75,
    shareByDay: seenBy.map((x) => r1((100 * x) / N)), hist,
    perDay: perDay.map((x) => r2(x / N)), perDayShopsWith: perDayWith.map((x) => r1((100 * x) / N)),
    perGate: Object.fromEntries(GATES.map((id) => [id, r1(all ? (100 * perGate[id]) / all : 0)])),
    perGatePerRun: Object.fromEntries(GATES.map((id) => [id, r2(perGate[id] / N)])),
    perGatePerRunHeld: Object.fromEntries(GATES.map((id) => [id, r2(inWares[id] ? cardsWhenHeld[id] / inWares[id] : 0)])),
    cardsPerShop: r2(offersTotal / shopsTotal),
    gateWares: r2(mean(gateWares)), gateWaresPct: Object.fromEntries(GATES.map((id) => [id, r1((100 * inWares[id]) / N)])),
    day1Gates, day1Cards,
    firstDay: { median: firsts.length ? pct(firsts, 0.5) : 0, never: r1((100 * (N - firsts.length)) / N) },
    wares: { mean: r2(mean(waresN)), min: Math.min(...waresN), max: Math.max(...waresN) },
    day1Pool: { mean: r2(mean(day1N)), min: Math.min(...day1N), max: Math.max(...day1N) },
    digest: digest.digest("hex").slice(0, 16),
  };
}

const t0 = Date.now();
const rows = HEROES.map(hero);
const byRarity = (ids: readonly string[]): Record<Rarity, number> => {
  const o = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  for (const id of ids) o[ITEMS[id].rarity]++;
  return o;
};
const out = {
  label: LABEL, switches: { GATES: G, SHAPES: SH, SHAPES2: S2, PLAIN_RIGS: PLAIN }, minStock: GATES_ODDS.minStock, merchants: MERCHANTS_ARG || null,
  gates: GATES.map((id) => ({ id, rarity: ITEMS[id].rarity, merchant: ITEMS[id].merchant, price: ITEMS[id].price })),
  order: "PLAIN_RIGS, SHAPES, SHAPES2, GATES (the ship's load order)", orderOk: ORDER_OK,
  days: DAYS, seeds: `${FROM}-${FROM + N - 1}`, buys: "nothing", rerolls: 0, catalogue: buyableModules().length, gatesByRarity: byRarity(GATES),
  seconds: Math.round((Date.now() - t0) / 1000), rows,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));

const L: string[] = [];
const BY = Math.min(5, DAYS);
L.push(`### ${LABEL} (seeds ${out.seeds} a hero, days 1-${DAYS}, first roll of each shop, buying nothing)`, "");
if (!GATES.length) L.push("GATES is off: no gate is in the game, so every gate count below is 0; the wares and day-1 pool columns and the digest are the read.", "");
L.push(`| hero | median | 25th pct | 75th pct | min-max | mean | share with 1+ by day ${BY} | share with 1+ by day ${DAYS} | share with 3+ | bar (median 3+, 75% with 1+ by day 5) |`, "|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) L.push(`| ${r.hero} | ${r.median} | ${r.p25} | ${r.p75} | ${r.min}-${r.max} | ${r.mean} | ${r.shareByDay[BY - 1]}% | ${r.shareBy10}% | ${r.shareGe3}% | ${GATES.length ? (r.pass ? "PASS" : "UNDER") : "n/a"} |`);
L.push("", `Per-day rate (mean gate cards in day d's shop; % of shops showing at least one):`, "", `| hero | ${Array.from({ length: DAYS }, (_, i) => `d${i + 1}`).join(" | ")} |`, `|---|${"---|".repeat(DAYS)}`);
for (const r of rows) L.push(`| ${r.hero} | ${r.perDay.map((x, i) => `${x} (${r.perDayShopsWith[i]}%)`).join(" | ")} |`);
L.push("", "Share of runs that have seen a gate card by the end of day d (%):", "", `| hero | ${Array.from({ length: DAYS }, (_, i) => `d${i + 1}`).join(" | ")} |`, `|---|${"---|".repeat(DAYS)}`);
for (const r of rows) L.push(`| ${r.hero} | ${r.shareByDay.map((x) => `${x}%`).join(" | ")} |`);
L.push("", "Each gate's share of the gate cards shown (%), its mean cards a run, and its mean cards a run that holds it among the wares:", "", `| hero | ${GATES.join(" | ")} |`, `|---|${"---|".repeat(GATES.length)}`);
for (const r of rows) L.push(`| ${r.hero} | ${GATES.map((id) => `${r.perGate[id]}% (${r.perGatePerRun[id]}; ${r.perGatePerRunHeld[id]} held)`).join(" | ")} |`);
L.push("", "The run's wares (REQ-BFG-022): wares a run (band 55-70), day 1's pool (17+), gates among the wares (and in day 1's pool and day 1's shops: both 0), the % of runs holding each, and the cards:", "", `| hero | wares mean (min-max) | day 1 pool mean (min-max) | gate wares | day-1 gate wares / cards | ${GATES.join(" | ")} |`, `|---|---|---|---|---|${"---|".repeat(GATES.length)}`);
for (const r of rows) L.push(`| ${r.hero} | ${r.wares.mean} (${r.wares.min}-${r.wares.max}) | ${r.day1Pool.mean} (${r.day1Pool.min}-${r.day1Pool.max}) | ${r.gateWares} | ${r.day1Gates} / ${r.day1Cards} | ${GATES.map((id) => `${r.gateWaresPct[id]}%`).join(" | ")} |`);
L.push("", "Runs by total gate cards, the first day a run sees one, and the digest of every run's wares and shops (equal digests: equal wares and shops to the digit):", "", "| hero | histogram (cards: runs) | first card: median day; never | digest |", "|---|---|---|---|");
for (const r of rows) L.push(`| ${r.hero} | ${Object.entries(r.hist).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([k, v]) => `${k}: ${v}`).join(", ")} | d${r.firstDay.median}; ${r.firstDay.never}% | ${r.digest} |`);
L.push("", `Catalogue ${out.catalogue} buyable pieces; gates by rarity ${JSON.stringify(out.gatesByRarity)}${MERCHANTS_ARG ? `; merchants patched: ${MERCHANTS_ARG}` : ""}; load order ${ORDER_OK === null ? "not checked" : ORDER_OK ? "as the ship's" : "NOT the ship's"}; ${rows.reduce((a, r) => a + r.runs, 0)} runs in ${out.seconds} s.`, "");
const md = L.join("\n");
console.log(md);
if (MD) writeFileSync(MD, md);
