// PLAIN-1 run 2 (REQ-BFG-084.4, REQ-BFG-022; cap's run-2 ruling R2-2, BRIEF-PLAIN1 P7): THE POOL NUMBERS, with PLAIN_RIGS
// off and on. Measures and changes nothing (no draw size, rotation or dormancy change):
//  - the catalogue: content.ts buyableModules() (the draw's source) per rarity, and its rigs;
//  - the per-run draw (wares.ts drawWares, DRAW.active = 62 a run, from the run seed alone): wares a run (REQ-BFG-022's
//    active pool, its band 55-70) and per rarity, and the plain rigs among them;
//  - day 1's pool: the run's wares open on day 1 (unlock day 1: commons and rares of every merchant but the ARCANE
//    DEALER), per rarity, and the plain commons in it;
//  - day 1's shop (REQ-BFG-084.4): run.ts newRun rolls it (rollShop, the first roll, no reroll); how often it offers at
//    least one plain common (RASP, SPARK GAP, SCALE GUARD, BALLAST). Each of the four heroes plays its own --seeds run
//    seeds (hero i: i x seeds + 1 ..), pooled; and all four on seeds 1-500 check that the first shop is hero-blind.
//    The draw and day 1's pool read the run seed alone (REQ-BFG-021), over all 4 x seeds of them.
// --allon also measures it all with every switch on (HULL_SCALE, LADDER_FIX, NPC_DAY) plus PLAIN_RIGS.
// Usage: npx vite build --ssr tools/plain1/pool.ts --outDir <dir> --emptyOutDir --logLevel warn
//        node <dir>/pool.js --seeds 25000 [--allon] --out pool.json
// Pure reads of the game's seeded streams; writes only --out.
import { writeFileSync } from "node:fs";
import { ITEMS, RARITIES, buyableModules, type HeroId, type Rarity } from "../../src/sim/content";
import { DRAW, drawWares } from "../../src/game/wares";
import { newRun } from "../../src/game/run";
import { setHullScale } from "../../src/sim/hullScale";
import { setLadderFix } from "../../src/sim/ladderFix";
import { setNpcDay } from "../../src/sim/npcDay";
import { PLAIN_DEFS, PLAIN_RIG_IDS, setPlainRigs } from "../../src/sim/plainRigs";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg("--seeds", "25000"));
const OUT = arg("--out", "pool.json");
const ALLON = process.argv.includes("--allon");
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const PLAIN_COMMONS = PLAIN_RIG_IDS.filter((id) => PLAIN_DEFS[id].rarity === "common");
const block = (i: number): number[] => Array.from({ length: N }, (_, j) => i * N + j + 1); // hero i's run seeds
const seeds = HEROES.flatMap((_, i) => block(i)); // every run seed (the draw is hero-blind)
const NS = seeds.length;

const byRarity = (ids: string[]): Record<Rarity, number> => {
  const o = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  for (const id of ids) o[ITEMS[id].rarity]++;
  return o;
};
const meanOf = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const minOf = (xs: number[]): number => xs.reduce((m, x) => Math.min(m, x), Infinity);
const maxOf = (xs: number[]): number => xs.reduce((m, x) => Math.max(m, x), -Infinity);
const r1 = (x: number): number => Math.round(10 * x) / 10;

function measure(label: string) {
  const t0 = Date.now();
  const buyable = buyableModules().map((d) => d.id);
  const catalogue = { total: buyable.length, byRarity: byRarity(buyable), rigs: buyable.filter((id) => ITEMS[id].kind === "gate").length, plain: buyable.filter((id) => PLAIN_RIG_IDS.includes(id)) };
  // the per-run draw and day 1's pool, seeds 1..N (hero-blind: REQ-BFG-021)
  const size: number[] = [], day1: number[] = [], plainDrawn: number[] = [], plainCommonsDay1: number[] = [];
  const rar: Record<Rarity, number[]> = Object.fromEntries(RARITIES.map((r) => [r, []])) as unknown as Record<Rarity, number[]>;
  const rar1: Record<Rarity, number[]> = Object.fromEntries(RARITIES.map((r) => [r, []])) as unknown as Record<Rarity, number[]>;
  const plainIn = Object.fromEntries(PLAIN_RIG_IDS.map((id) => [id, 0])) as Record<string, number>;
  let day1HasPlainCommon = 0;
  for (const s of seeds) {
    const w = drawWares(s);
    const ids = Object.keys(w), open1 = ids.filter((id) => w[id] <= 1);
    size.push(ids.length); day1.push(open1.length);
    const br = byRarity(ids), br1 = byRarity(open1);
    for (const r of RARITIES) { rar[r].push(br[r]); rar1[r].push(br1[r]); }
    plainDrawn.push(ids.filter((id) => PLAIN_RIG_IDS.includes(id)).length);
    for (const id of ids) if (id in plainIn) plainIn[id]++;
    const pc1 = open1.filter((id) => PLAIN_COMMONS.includes(id)).length;
    plainCommonsDay1.push(pc1);
    if (pc1 > 0) day1HasPlainCommon++;
  }
  const draw = {
    active: DRAW.active, runs: NS, waresMean: r1(meanOf(size)), waresMin: minOf(size), waresMax: maxOf(size),
    byRarityMean: Object.fromEntries(RARITIES.map((r) => [r, r1(meanOf(rar[r]))])),
    plainRigsMean: r1(meanOf(plainDrawn)), plainDrawRate: Object.fromEntries(PLAIN_RIG_IDS.map((id) => [id, r1((100 * plainIn[id]) / NS)])),
  };
  const pool1 = {
    runs: NS, mean: r1(meanOf(day1)), min: minOf(day1), max: maxOf(day1),
    byRarityMean: Object.fromEntries(RARITIES.map((r) => [r, r1(meanOf(rar1[r]))])),
    plainCommonsMean: r1(meanOf(plainCommonsDay1)), hasPlainCommonPct: r1((100 * day1HasPlainCommon) / NS),
  };
  // day 1's shop: each hero on its own block of run seeds, then pooled
  const offersOf = (h: HeroId, s: number): string[] => newRun(h, s, `pool-${s}`).shop.wagons.flatMap((wg) => wg.offers.map((o) => o.def));
  const shop: Record<string, unknown> = {};
  let hitAll = 0, anyAll = 0;
  for (const [i, h] of HEROES.entries()) {
    let hit = 0, anyPlain = 0, offers = 0, plainOffers = 0;
    const perRig = Object.fromEntries(PLAIN_RIG_IDS.map((id) => [id, 0])) as Record<string, number>;
    for (const s of block(i)) {
      const defs = offersOf(h, s);
      offers += defs.length;
      if (defs.some((d) => PLAIN_COMMONS.includes(d))) hit++;
      if (defs.some((d) => PLAIN_RIG_IDS.includes(d))) anyPlain++;
      for (const d of defs) if (d in perRig) { perRig[d]++; plainOffers++; }
    }
    hitAll += hit; anyAll += anyPlain;
    const p = hit / N;
    shop[h] = {
      runs: N, seeds: `${i * N + 1}-${(i + 1) * N}`, offersMean: r1(offers / N), plainCommonPct: r1(100 * p), se: r1(100 * Math.sqrt((p * (1 - p)) / N)),
      anyPlainPct: r1((100 * anyPlain) / N), plainOffersMean: Math.round((1000 * plainOffers) / N) / 1000,
      perRigPct: Object.fromEntries(PLAIN_RIG_IDS.map((id) => [id, r1((100 * perRig[id]) / N)])),
    };
  }
  const pAll = hitAll / NS;
  shop.pooled = { runs: NS, plainCommonPct: Math.round(1000 * pAll) / 10, se: Math.round(1000 * Math.sqrt((pAll * (1 - pAll)) / NS)) / 10, anyPlainPct: Math.round((1000 * anyAll) / NS) / 10 };
  // hero-blind check: the four heroes' first shops on seeds 1-500
  const sig = (h: HeroId): string => Array.from({ length: 500 }, (_, j) => offersOf(h, j + 1).join(",")).join("|");
  const heroBlind = HEROES.every((h) => sig(h) === sig("furnace"));
  const res = { label, catalogue, draw, pool1, shop, heroBlindFirst500: heroBlind, seconds: Math.round((Date.now() - t0) / 1000) };
  console.log(JSON.stringify(res));
  return res;
}

const out: Record<string, unknown> = { seeds: N, plainCommons: PLAIN_COMMONS };
setPlainRigs(false);
out.off = measure("PLAIN_RIGS off");
setPlainRigs(true);
out.on = measure("PLAIN_RIGS on");
if (ALLON) {
  setHullScale(true); setLadderFix(true); setNpcDay(true);
  out.allon = measure("every switch on + PLAIN_RIGS");
  setHullScale(false); setLadderFix(false); setNpcDay(false);
}
setPlainRigs(false);
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`pool: ${N} seeds -> ${OUT}`);
