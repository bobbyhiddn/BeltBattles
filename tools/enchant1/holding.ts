// ENCHANT-1 step 9c (REQ-BFG-085 (6); BRIEF-ENCHANT1 E9c): HOLDING. How many words par's and casual's runs hold at dusk of day 4 and of day 10
// (mean and median), by source, and the gold they spent on words, over seeds 1..--seeds and every hero, on the game's own caravan and road.
// Target for par (E5): about 1 word by day 4 and 3-4 by day 10; if par misses it, pull the levers in E5's order (the ENCHANTER's days: every
// third day or from day 2; its price: 3 or 5 G; then drop warlord pick 1), each behind ENCHANT, and log each with its bench line.
// Sources: ENCHANTER = the words par bought (PlayerDay.buys with `word`); LAST CHANCE = a modeled run (--lc day: the par player takes LAST
// CHANCE's PART card at the dawn after that day, playerRun opts.lastChance; the part arrives with its seeded word); the WARLORD PICK has no
// par input (par's NPC day fights the Medium captain and a pick opens on a Hard win only): it is bounded by the server's check, not measured.
// Usage: node <built>/holding.js --seeds 300 --lc 5 --out holding.json [--hero furnace]   (K/e1bench.sh builds and runs it; PERHERO=1: four processes)
// Pure harness reads; writes only --out.
import { writeFileSync } from "node:fs";
import type { HeroId } from "../../src/sim/content";
import { setEnchant } from "../../src/sim/enchant";
import { casualRun } from "../../src/sim/harness/casual";
import { playerRun } from "../../src/sim/harness/player";
import { wordCount } from "../../src/sim/harness/enchantBot";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SEEDS = Number(arg("--seeds", "300"));
const LC = Number(arg("--lc", "5")); // the modeled LAST CHANCE: the dawn after this day (0: none)
const OUT = arg("--out", "holding.json");
const ALL: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const HEROES = (process.argv.includes("--hero") ? arg("--hero", "furnace") : arg("--heroes", ALL.join(","))).split(",").filter(Boolean) as HeroId[];

setEnchant(true);

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

interface Read { d4: number[]; d10: number[]; gold: number[]; bought: number[]; }
const fresh = (): Read => ({ d4: [], d10: [], gold: [], bought: [] });
const t0 = Date.now();
const rows: Record<string, unknown>[] = [];
const label = "ENCHANT on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before BUMP-1E's scaling flip";
for (const hero of HEROES) {
  const par = fresh(), cas = fresh(), lc = fresh();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const p = playerRun(hero, 10, seed);
    par.d4.push(wordCount(p[3].build)); par.d10.push(wordCount(p[9].build)); par.gold.push(p[9].wordGold ?? 0);
    par.bought.push(p.reduce((n, d) => n + d.buys.filter((b) => b.word).length, 0));
    const c = casualRun(hero, 10, seed);
    cas.d4.push(wordCount(c[3].build)); cas.d10.push(wordCount(c[9].build)); cas.gold.push(c[9].wordGold ?? 0);
    cas.bought.push(c.reduce((n, d) => n + d.buys.filter((b) => b.word).length, 0));
    if (LC > 0) {
      const q = playerRun(hero, 10, seed, { lastChance: { day: LC, boon: "part" } });
      lc.d4.push(wordCount(q[3].build)); lc.d10.push(wordCount(q[9].build)); lc.gold.push(q[9].wordGold ?? 0);
      lc.bought.push(q.reduce((n, d) => n + d.buys.filter((b) => b.word).length, 0));
    }
  }
  const row = (r: Read) => ({ day4: { mean: mean(r.d4), median: median(r.d4) }, day10: { mean: mean(r.d10), median: median(r.d10) }, goldByDay10: mean(r.gold), enchanterBoughtARun: mean(r.bought), n: r.d4.length });
  rows.push({ hero, par: row(par), casual: row(cas), ...(LC > 0 ? { parWithModeledLastChance: row(lc), lastChanceDay: LC } : {}) });
  const f = (r: Read) => `day 4 ${mean(r.d4).toFixed(2)}/${median(r.d4)} | day 10 ${mean(r.d10).toFixed(2)}/${median(r.d10)} | gold ${mean(r.gold).toFixed(1)} | bought ${mean(r.bought).toFixed(2)}`;
  console.log(`holding ${hero.padEnd(8)} par ${f(par)} || casual ${f(cas)}${LC > 0 ? ` || par+LC(d${LC}) ${f(lc)}` : ""} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
writeFileSync(OUT, JSON.stringify({ label, seeds: SEEDS, lc: LC, rows, seconds: Math.round((Date.now() - t0) / 1000), note: "mean/median of the words held at dusk (the deck the dusk fight uses); warlord pick: not measurable by par (Medium road), bounded by the server's check" }, null, 1));
console.log(`holding: done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${OUT} (${sum(rows.map(() => 1))} heroes)`);
