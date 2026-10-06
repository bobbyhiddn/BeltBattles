// LC-1 (REQ-BFG-073): the LAST CHANCE bench (BRIEF-LC1 section 5), switch on v off. The game's own pieces only:
//  - the player: the par player (player.ts playerRun, typical policy), seeds fixed and printed, per playable hero;
//  - the field: today's stand-in pool, as tools/scorecard/survival.ts (d) fights it: each dusk the par deck of that day
//    against standInFoe(run seed, day) on the run's battle seed (run.ts battleSeed), the player on side 0, all 10 dusks;
//  - lives: the game's finishDay on a run with that seed, fed each dusk's result (survival.ts's ledger), with the switch
//    off (today) and on (LAST CHANCE). When it fires on day d, the bots pick a card (harness/lastChance.ts
//    botLastChancePick on the deck that lost dusk d) and the rest of the run is the par run with that card
//    (playerRun's opts.lastChance: taken at the dawn of day d + 1), fought against the same field;
//  - each card's worth: in the states of the --forced seeds, each card is forced in turn and the rest of the run played;
//  - the exact model: every 2^10 loss pattern through the run code (newRun, finishDay), off and on, at flat loss rates.
// Usage (from the repo root; build once, then shards under nice -n 19):
//   npx vite build --ssr tools/lastChanceBench.ts --outDir <L>/tmp/lcbench --emptyOutDir --logLevel warn
//   nice -n 19 node <L>/tmp/lcbench/lastChanceBench.js --heroes furnace --seeds 1-48 --forced 1-24 --hull 1000 --json out.json
//   node <L>/tmp/lcbench/lastChanceBench.js --merge a.json,b.json,... --md tables.md --exact

import { readFileSync, writeFileSync } from "node:fs";
import { Battle, simulate } from "../src/sim/battle";
import { HEROES, RUN_DAYS, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { BOONS, LAST_CHANCE_HULL, lastChanceOffer, type Boon } from "../src/sim/lastChance";
import { RUNES } from "../src/sim/runes";
import { ITEMS } from "../src/sim/content";
import { parRunSeed, playerRun, rateOn } from "../src/sim/harness/player";
import { botLastChancePick } from "../src/sim/harness/lastChance";
import { battleSeed, newRun, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import type { SideStats } from "../src/sim/battle";

const ZERO: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** One run's outcome on the ledger. */
export interface Outcome {
  complete: boolean;
  endDay: number; // the day the run was lost (0: completed)
  reached: number; // the last day whose dusk was fought (10 when complete)
  wins: number; // dusk wins over the dusks fought while alive
  lcDay: number; // the day LAST CHANCE fired (0: never)
}

export interface Rest {
  res: number[]; // results of days d+1..10 (all fought)
  winsAll: number; // wins over those dusks (all fought)
  out: Outcome; // the ledger on with this rest
}

export interface JobOut {
  hero: HeroId;
  seed: number;
  runSeed: number;
  res: number[]; // the plain run's results, days 1..10 (0 win, 1 loss, -1 draw)
  off: Outcome;
  onNoCard: Outcome; // the switch on, the plain decks after LAST CHANCE (no card: the life only)
  on: Outcome; // the switch on, the bots' card
  hull: { par: number[]; field: number[] }; // max hull at dusk, days 1..10: the par deck's and the foe's
  lc: null | {
    day: number;
    rune: string | null; runeTier: string | null; part: string | null;
    pick: Boon;
    rating: { base: number; rune: number; part: number; hull: number; factor?: number; placed?: boolean };
    sweep: number[]; // the HULL card's rating at each SWEEP amount (the pick rate by amount)
    forced?: Record<Boon, Rest>;
  };
}

const maxHull = (b: Build): number => new Battle(b, b, 1).sides[0].hull.max;
/** The HULL amounts whose pick rate the bench reads from the bots' rating (the verdict's search). */
export const SWEEP: readonly number[] = [100, 200, 250, 300, 350, 400, 500, 600, 700, 800, 1000, 1500];

function fight(build: Build, runSeed: number, day: number): number {
  const foe = standInFoe(runSeed, day);
  const seed = battleSeed({ seed: runSeed, day } as Run);
  const b = simulate(build, foe.build, seed);
  return b.winner ?? -1;
}

/** The ledger: the game's finishDay on a run with this seed, fed `res` (all 10 days), LAST CHANCE on or off. On,
 *  `after(d)` gives the results of days d+1..10 once LAST CHANCE fires on day d (else the plain ones go on).
 *  Z-BUMP (REQ-BFG-073): the game's switch is gone, so "off" (the game before LAST CHANCE: section 3's off columns and the
 *  exact model's) is a bench-only path: when finishDay fires LAST CHANCE, the bench takes its life straight back
 *  (res.lastChance.lives) and leaves the run's one LAST CHANCE spent, so it never fires again. A LAST CHANCE fires only on
 *  a loss that leaves 1 life before day 10 (never on days 1-3, so never across the day-3 refund), and only lives decide
 *  the ledger, so every "off" outcome is the switch-off game's (pre500 v flip500, line for line). */
function ledger(hero: HeroId, runSeed: number, res: readonly number[], on: boolean, after?: (d: number) => readonly number[]): Outcome {
  const run = newRun(hero, runSeed, `lcb-${hero}-${runSeed}`);
  let cur = res.slice(), wins = 0, reached = 0, lcDay = 0;
  for (let day = 1; day <= RUN_DAYS && !run.over; day++) {
    startDusk(run, []);
    const r = cur[day - 1];
    const dr = finishDay(run, r as 0 | 1 | -1, 20, { ...ZERO }, { ...ZERO });
    if (!on && dr.lastChance) run.lives -= dr.lastChance.lives; // Z-BUMP: the bench-only off path (above)
    reached = day;
    if (r === 0) wins++;
    if (on && !lcDay && run.lastChance) {
      lcDay = run.lastChance.day;
      if (after) cur = [...cur.slice(0, day), ...after(day)];
      delete run.runeDay;
    }
  }
  return { complete: run.over === "complete", endDay: run.over === "lost" ? reached : 0, reached, wins, lcDay };
}

function job(hero: HeroId, seed: number, hull: number, forced: boolean): JobOut {
  const plain = playerRun(hero, RUN_DAYS, seed);
  const runSeed = parRunSeed(hero, seed);
  const res = plain.map((d, i) => fight(d.build, runSeed, i + 1));
  const hulls = { par: plain.map((d) => maxHull(d.build)), field: plain.map((_, i) => maxHull(standInFoe(runSeed, i + 1).build)) };
  const off = ledger(hero, runSeed, res, false);
  const onNoCard = ledger(hero, runSeed, res, true);
  const out: JobOut = { hero, seed, runSeed, res, off, onNoCard, on: onNoCard, hull: hulls, lc: null };
  const d = onNoCard.lcDay;
  if (!d) return out;
  const board = plain[d - 1].build;
  const offer = { ...lastChanceOffer(runSeed, d, hero, (board.runes ?? []).map((q) => q.id)), hull };
  const pick = botLastChancePick(offer, hero, board, d, { wins: res.slice(0, d - 1).filter((r) => r === 0).length });
  const restOf = (boon: Boon): Rest => {
    const lcRun = playerRun(hero, RUN_DAYS, seed, { lastChance: { day: d, boon, ...(hull !== LAST_CHANCE_HULL ? { hull } : {}) } });
    const rest = lcRun.slice(d).map((x, i) => fight(x.build, runSeed, d + 1 + i));
    return { res: rest, winsAll: rest.filter((r) => r === 0).length, out: ledger(hero, runSeed, res, true, () => rest) };
  };
  const mine = restOf(pick.boon);
  out.on = mine.out;
  out.lc = {
    day: d, rune: offer.rune?.id ?? null, runeTier: offer.rune?.tier ?? null, part: offer.part, pick: pick.boon,
    rating: pick.rating,
    sweep: SWEEP.map((x) => { const b = { ...board, hullBonus: board.hullBonus + x }; return rateOn(b, d); }),
  };
  if (forced) {
    const f = {} as Record<Boon, Rest>;
    for (const b of BOONS) f[b] = b === pick.boon ? mine : restOf(b);
    out.lc.forced = f;
  }
  return out;
}

// ---------------------------------------------------------------- the exact model (survival.ts's way)

interface Exact { q: number; off: { complete: number; reached: number; wins: number[] }; on: { complete: number; reached: number; wins: number[]; fired: number } }

function exactModel(qs: readonly number[]): Exact[] {
  // every 2^10 loss pattern through the run code; a non-loss is a win (a draw keeps lives as a win does)
  const pats: { k: number; off: Outcome; on: Outcome }[] = [];
  for (let mask = 0; mask < 1 << RUN_DAYS; mask++) {
    const res = Array.from({ length: RUN_DAYS }, (_, d) => ((mask >> d) & 1 ? 1 : 0));
    const k = res.filter((r) => r === 1).length;
    pats.push({ k, off: ledger("furnace", 12345, res, false), on: ledger("furnace", 12345, res, true) });
  }
  return qs.map((q) => {
    const e: Exact = { q, off: { complete: 0, reached: 0, wins: Array(11).fill(0) }, on: { complete: 0, reached: 0, wins: Array(11).fill(0), fired: 0 } };
    for (const p of pats) {
      const pr = q ** p.k * (1 - q) ** (RUN_DAYS - p.k);
      for (const [o, side] of [[p.off, e.off], [p.on, e.on]] as const) {
        if (o.complete) side.complete += pr;
        side.reached += pr * o.reached;
        side.wins[o.wins] += pr;
      }
      if (p.on.lcDay) e.on.fired += pr;
    }
    return e;
  });
}

// ---------------------------------------------------------------- the tables

const pc = (x: number, d = 1): string => (Number.isFinite(x) ? `${(100 * x).toFixed(d)}%` : "-");
const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function quant(xs: readonly number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
const table = (head: string[], rows: (string | number)[][]): string =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function report(all: JobOut[], hullAmt: number, exact?: Exact[]): string {
  const heroes = [...new Set(all.map((j) => j.hero))];
  const groups: [string, JobOut[]][] = [...heroes.map((h) => [h.toUpperCase(), all.filter((j) => j.hero === h)] as [string, JobOut[]]), ["POOLED", all]];
  const out: string[] = [];
  const lcs = all.filter((j) => j.lc);
  const seeds = heroes.map((h) => { const s = all.filter((j) => j.hero === h).map((j) => j.seed); return `${h} ${Math.min(...s)}-${Math.max(...s)} (${s.length})`; });
  out.push(`HULL card: +${hullAmt}. Runs: ${all.length} (${seeds.join("; ")}). LAST CHANCE fired in ${lcs.length} (${pc(lcs.length / all.length)}).`);
  // 1. pick rates
  out.push("\n### 1. Pick rates (the bots' pick, every state where LAST CHANCE fires)\n");
  const pickRow = (label: string, js: JobOut[]): (string | number)[] => {
    const n = js.length, c = (b: Boon) => js.filter((j) => j.lc!.pick === b).length;
    return [label, n, ...BOONS.map((b) => (n ? `${pc(c(b) / n)} (${c(b)})` : "-"))];
  };
  out.push(table(["group", "states", "rune", "part", "hull"], groups.map(([g, js]) => pickRow(g, js.filter((j) => j.lc)))));
  out.push("\nBy day (pooled):\n");
  out.push(table(["day", "states", "rune", "part", "hull"], [5, 6, 7, 8, 9].map((d) => pickRow(`day ${d}`, lcs.filter((j) => j.lc!.day === d)))));
  out.push("\nBy hero and day (states; rune/part/hull picks):\n");
  out.push(table(["hero", ...[5, 6, 7, 8, 9].map((d) => `day ${d}`)], heroes.map((h) => [h.toUpperCase(), ...[5, 6, 7, 8, 9].map((d) => {
    const js = lcs.filter((j) => j.hero === h && j.lc!.day === d);
    return js.length ? `${js.length}: ${BOONS.map((b) => js.filter((j) => j.lc!.pick === b).length).join("/")}` : "-";
  })])));
  const top = (key: (j: JobOut) => string | null, filt: (j: JobOut) => boolean = () => true, n = 6): string => {
    const m = new Map<string, number>();
    for (const j of lcs.filter(filt)) { const k = key(j); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, v]) => `${RUNES[k]?.name ?? ITEMS[k]?.name ?? k} ${v}`).join(", ") || "-";
  };
  out.push(`\nRunes offered most: ${top((j) => j.lc!.rune)}.`);
  out.push(`Runes picked most: ${top((j) => j.lc!.rune, (j) => j.lc!.pick === "rune")}.`);
  out.push(`Parts offered most: ${top((j) => j.lc!.part)}.`);
  out.push(`Parts picked most: ${top((j) => j.lc!.part, (j) => j.lc!.pick === "part")}.`);
  const tiers = new Map<string, number>();
  for (const j of lcs) tiers.set(j.lc!.runeTier ?? "none", (tiers.get(j.lc!.runeTier ?? "none") ?? 0) + 1);
  out.push(`Rune card tiers: ${[...tiers.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}. Parts the bots found no spot for (cargo): ${lcs.filter((j) => j.lc!.rating.placed === false).length} of ${lcs.length}.`);
  // the PART card by kind: how often the bots found a spot, took it, and what it was worth forced
  const kinds = [...new Set(lcs.map((j) => (j.lc!.part ? ITEMS[j.lc!.part].kind : "none")))].sort();
  out.push("\nThe PART card by kind (placed: the bots found a spot with a rating gain; else it goes to cargo):\n");
  out.push(table(["kind", "offered", "placed", "picked", "forced part: wins", "forced part: complete", "forced hull: wins", "parts"], kinds.map((k) => {
    const js = lcs.filter((j) => (j.lc!.part ? ITEMS[j.lc!.part].kind : "none") === k);
    const f = js.filter((j) => j.lc!.forced);
    const ids = [...new Set(js.map((j) => j.lc!.part!))].map((id) => ITEMS[id]?.name ?? id).sort().join(", ");
    return [k, js.length, js.filter((j) => j.lc!.rating.placed).length, js.filter((j) => j.lc!.pick === "part").length,
      f.length ? mean(f.map((j) => j.lc!.forced!.part.winsAll)).toFixed(2) : "-", f.length ? pc(f.filter((j) => j.lc!.forced!.part.out.complete).length / f.length) : "-",
      f.length ? mean(f.map((j) => j.lc!.forced!.hull.winsAll)).toFixed(2) : "-", ids];
  })));
  out.push(`\nRating gains (median over states, x of the board's value): rune ${mean([quant(lcs.map((j) => j.lc!.rating.rune / j.lc!.rating.base), 0.5)]).toFixed(3)}, part ${quant(lcs.map((j) => j.lc!.rating.part / j.lc!.rating.base), 0.5).toFixed(3)}, hull ${quant(lcs.map((j) => j.lc!.rating.hull / j.lc!.rating.base), 0.5).toFixed(3)}.`);
  // 2. each card's worth
  const forced = lcs.filter((j) => j.lc!.forced);
  if (forced.length) {
    out.push(`\n### 2. What each card is worth (forced, ${forced.length} states of the --forced seeds; the rest of the run played)\n`);
    const fr = (label: string, js: JobOut[]): (string | number)[] => [label, js.length, ...BOONS.flatMap((b) => {
      const w = mean(js.map((j) => j.lc!.forced![b].winsAll)), c = js.filter((j) => j.lc!.forced![b].out.complete).length;
      return [`${w.toFixed(2)}`, js.length ? pc(c / js.length) : "-"];
    })];
    out.push(table(["group", "states", "rune wins", "rune complete", "part wins", "part complete", "hull wins", "hull complete"],
      groups.map(([g, js]) => fr(g, js.filter((j) => j.lc?.forced)))));
    // the best card by the rest's wins (ties: completion), and whether the bots took it
    let match = 0, ties = 0;
    const best = new Map<Boon, number>();
    for (const j of forced) {
      const f = j.lc!.forced!;
      const score = (b: Boon) => f[b].winsAll + (f[b].out.complete ? 0.5 : 0);
      const top = Math.max(...BOONS.map(score));
      const bs = BOONS.filter((b) => score(b) === top);
      if (bs.length > 1) ties++;
      for (const b of bs) best.set(b, (best.get(b) ?? 0) + 1 / bs.length);
      if (bs.includes(j.lc!.pick)) match++;
    }
    out.push(`\nThe best card (most wins over the rest; a completed run +0.5): rune ${(best.get("rune") ?? 0).toFixed(1)}, part ${(best.get("part") ?? 0).toFixed(1)}, hull ${(best.get("hull") ?? 0).toFixed(1)} of ${forced.length} states (${ties} with a tie). The bots' pick was a best card in ${match} of ${forced.length} (${pc(match / forced.length)}).`);
  }
  // 3. run length and wins
  out.push("\n### 3. Run length and wins, with and without LAST CHANCE (the bots' card)\n");
  const rl = (label: string, js: JobOut[]): (string | number)[] => {
    const f = (o: (j: JobOut) => Outcome) => [pc(js.filter((j) => o(j).complete).length / js.length), mean(js.map((j) => o(j).reached)).toFixed(2), mean(js.map((j) => o(j).wins)).toFixed(2)];
    return [label, js.length, ...f((j) => j.off), ...f((j) => j.onNoCard), ...f((j) => j.on)];
  };
  out.push(table(["group", "runs", "off: complete", "off: days", "off: wins", "on, life only: complete", "days", "wins", "on, life + card: complete", "days", "wins"], groups.map(([g, js]) => rl(g, js))));
  out.push("\nWins (0-10) over the dusks fought, pooled (runs):\n");
  out.push(table(["wins", ...Array.from({ length: 11 }, (_, i) => String(i))], [
    ["off", ...Array.from({ length: 11 }, (_, i) => all.filter((j) => j.off.wins === i).length)],
    ["on", ...Array.from({ length: 11 }, (_, i) => all.filter((j) => j.on.wins === i).length)],
  ]));
  if (exact) {
    out.push("\nThe exact model (every 2^10 loss pattern through newRun/finishDay, no DOCK; a draw counts as a win):\n");
    out.push(table(["flat loss", "off: complete", "off: days", "off: E[wins]", "on: complete", "on: days", "on: E[wins]", "on: fires"], exact.map((e) => [
      pc(e.q, 0), pc(e.off.complete), e.off.reached.toFixed(2), e.off.wins.reduce((s, p, i) => s + p * i, 0).toFixed(2),
      pc(e.on.complete), e.on.reached.toFixed(2), e.on.wins.reduce((s, p, i) => s + p * i, 0).toFixed(2), pc(e.on.fired),
    ])));
  }
  // 4. hull by day
  out.push(`\n### 4. +${hullAmt} against the hull by day (max hull at dusk; par decks and the field they meet)\n`);
  const hrows: (string | number)[][] = [];
  for (const h of heroes) {
    for (const d of [5, 6, 7, 8, 9]) {
      const js = all.filter((j) => j.hero === h);
      const par = js.map((j) => j.hull.par[d - 1]), field = js.map((j) => j.hull.field[d - 1]);
      const med = quant(par, 0.5), grow = mean(js.map((j) => j.hull.par[d - 1] - j.hull.par[d - 2]));
      hrows.push([h.toUpperCase(), d, `${med} (${quant(par, 0.1)}-${quant(par, 0.9)})`, `${quant(field, 0.5)} (${quant(field, 0.1)}-${quant(field, 0.9)})`, grow.toFixed(0), pc(hullAmt / med), grow > 0 ? (hullAmt / grow).toFixed(1) : "-"]);
    }
  }
  out.push(table(["hero", "day", "par median (p10-p90)", "field median (p10-p90)", "par growth since d-1 (mean)", `+${hullAmt} / par hull`, `+${hullAmt} in days of growth`], hrows));
  const g19 = heroes.map((h) => { const js = all.filter((j) => j.hero === h); return `${h.toUpperCase()} ${mean(js.map((j) => (j.hull.par[8] - j.hull.par[0]) / 8)).toFixed(0)}`; });
  out.push(`\nMean par hull growth a day, day 1 to day 9: ${g19.join(", ")}.`);
  out.push("\n### 4b. The HULL card's pick rate by its amount (the bots' rating; rune and part cards as offered)\n");
  const sweepRow = (label: string, js: JobOut[]): (string | number)[] => [label, js.length, ...SWEEP.map((_, k) => {
    const n = js.filter((j) => j.lc!.sweep[k] > Math.max(j.lc!.rating.rune, j.lc!.rating.part)).length;
    return js.length ? pc(n / js.length, 0) : "-";
  })];
  out.push(table(["group", "states", ...SWEEP.map((x) => `+${x}`)], groups.map(([g, js]) => sweepRow(g, js.filter((j) => j.lc)))));
  const pooled = lcs.length ? lcs.filter((j) => j.lc!.pick === "hull").length / lcs.length : NaN;
  out.push(`\n### 5. Verdict input: pooled HULL pick rate ${pc(pooled)} (band 15%-60%; target if outside: 25%-45%).`);
  return out.join("\n");
}

// ---------------------------------------------------------------- the command line

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const range = (s: string): number[] => { const [a, b] = s.split("-").map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i); };

function main(): void {
  const merge = arg("merge");
  if (merge) {
    const all: JobOut[] = merge.split(",").flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as { jobs: JobOut[] }).jobs);
    const hullAmt = Number(arg("hull") ?? LAST_CHANCE_HULL);
    const exact = process.argv.includes("--exact") ? exactModel([0.3, 0.4, 0.5, 0.6]) : undefined;
    const md = report(all, hullAmt, exact);
    const to = arg("md");
    if (to) writeFileSync(to, md + "\n");
    if (exact && arg("exact-json")) writeFileSync(arg("exact-json")!, JSON.stringify(exact, null, 1));
    console.log(md);
    return;
  }
  // Z-BUMP: no switch to set (the player's runs and the bots' pick are the game's own; the ledger's off path is bench-only)
  const heroes = (arg("heroes") ?? PLAYABLE_HEROES.join(",")).split(",") as HeroId[];
  const seeds = range(arg("seeds") ?? "1-24");
  const forced = new Set(range(arg("forced") ?? "1-24"));
  const hull = Number(arg("hull") ?? LAST_CHANCE_HULL);
  const t0 = Date.now();
  const jobs: JobOut[] = [];
  for (const hero of heroes) {
    if (!HEROES[hero]) throw new Error(`unknown hero ${hero}`);
    for (const seed of seeds) jobs.push(job(hero, seed, hull, forced.has(seed)));
  }
  const meta = { heroes, seeds: [seeds[0], seeds[seeds.length - 1]], forced: [...forced], hull, ms: Date.now() - t0, at: new Date().toISOString() };
  const to = arg("json");
  if (to) writeFileSync(to, JSON.stringify({ meta, jobs }));
  console.log(`${heroes.join(",")} seeds ${meta.seeds.join("-")}: ${jobs.length} runs, ${jobs.filter((j) => j.lc).length} LAST CHANCE, ${(meta.ms / 1000).toFixed(1)} s`);
}

main();
