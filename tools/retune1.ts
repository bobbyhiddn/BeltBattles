// RETUNE-1 (REQ-BFG-092, REQ-BFG-096, REQ-BFG-097): the bench (BRIEF-RETUNE1 sections 8 and 9). Opt-in: no bench, test or
// other tool imports it, so no pin moves.
// Build: npx vite build --ssr tools/retune1.ts --outDir <dir>; run: node <dir>/retune1.js --mode ... (every thread sets the
// set's switches through their setters before any deck is built).
//
// THE SETS (--set; --also adds switches on top, for cell 4's reads):
//   today: the hull release as it ships: NPC_DAY, HULL_SCALE, LADDER_FIX on (P2's casual floors ride NPC_DAY); HEARTS,
//          GUARD and PICK off;
//   allon: today + HEARTS + GUARD + PICK.
//   PICK is the bench's record-following pick (casual.ts recordPick, R1) on the set's graded seed pool until T5 builds it
//   into the game; its numbers: --rule losing,deep,deepAt (default casual.ts RECORD_RULE 0.5, 1/3, 2).
//
// MODES:
//   --mode pool --set S --out pool.json [--grade-k 6] [--grade-seeds 1] [--workers 2]
//       the set's seed pool (tools/samplePool.ts generateSamplePool, as the seed step makes it) as { id, snapshot } entries
//       (ids: ghostId, the server's); with PICK in the set, each seed ghost's grade too: vsPar, its win rate against the four
//       par fields' first K members of its day, S seeds from both sides (LOSS-1's --mode grade, cut to K and S).
//   --mode bench --set S --policy par|casual:<tune> --heroes h,.. --seeds a-b --pool pool.json --out cell.json
//       [--models 10,059] [--hearts-start n] [--refund] [--rule a,b,c]
//       whole runs, one row per hero, seed and run model: the policy's deck each dusk (player.ts playerRun; casual.ts
//       casualOpts) against the dusk foe a new player meets (the set's seed pool, D1 and D2; the record pick with PICK; no
//       ghost left: the day's stand-in captain, ghosts.ts standInFoe), the set's life rule (HEARTS: hearts.ts heartsDusk; off:
//       5 lives, the day-3 refund and LAST CHANCE as day.ts finishDay plays them), LAST CHANCE's card from the bots' own pick
//       (harness/lastChance.ts botLastChancePick on lastChanceOffer), the deck replayed from the next dawn with it.
//
// THE RUN MODELS (--models):
//   10:  the game as it is: the run ends after day 10 (RUN_DAYS) or at 0 lives; LAST CHANCE before day 10.
//   059: REQ-BFG-059 as a bench model only (RUN-1 builds the rule): the run goes on past day 10 until 10 wins or 0 lives,
//        with a backstop after day BACKSTOP (20); LAST CHANCE before the backstop's day. APPROXIMATIONS (flagged in every
//        table): days 11+ play day 10's content: the deck stays the day-10 deck (playerRun plays 10 days, so no shop or
//        income after day 10), the foe is drawn from the day-10 pool bucket (never a ghost seen this run, as the server)
//        and the day-10 captain when none is left, and the fight is fought at day 10's D(d) and S(d). A LAST CHANCE on day
//        10 or later takes the HULL card (no dawn is played to place a rune or a part).
//
// Rows hold every dusk's result (0 win, 1 loss, -1 draw), the foe, the record going in, the end (lost, complete, won,
// backstop), its day, LAST CHANCE's day and card, and the lives or hearts left; kit-retune1/cells.mjs makes the tables.

import { isMainThread } from "node:worker_threads";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { Rng, hashSeed } from "../src/core/rng";
import { simulate } from "../src/sim/battle";
import { RULES_VERSION, RUN_DAYS, START_LIVES, type HeroId } from "../src/sim/content";
import { type Build } from "../src/sim/deck";
import { parField } from "../src/sim/harness/par";
import { parRunSeed, playerRun, rateOn, type PlayerOpts } from "../src/sim/harness/player";
import { casualOpts, recordPick, RECORD_RULE, type Grades, type RecordRule } from "../src/sim/harness/casual";
import { botLastChancePick } from "../src/sim/harness/lastChance";
import { LAST_CHANCE_AT, LAST_CHANCE_HULL, LAST_CHANCE_LIVES, lastChanceOffer, type Boon } from "../src/sim/lastChance";
import { HEARTS_RULE, heartsDusk, type HeartsRule } from "../src/sim/hearts";
import { setHearts } from "../src/sim/hearts";
import { setGuard } from "../src/sim/guard";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { setNpcDay } from "../src/sim/npcDay";
import { openRunesRules, setOpenRunes } from "../src/sim/openRunes"; // OPEN-1 (REQ-BFG-109): --also open
import { REFUND_DAY, REFUND_LIVES } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { checkSnapshot, ghostId, type PoolEntry } from "../src/net/snapshot";
import { pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { generateSamplePool } from "./samplePool";
import { serveJobs, workerRunner } from "./workers";
import type { Job } from "../src/sim/harness/tournament";

const HEROES4: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
/** REQ-BFG-059's backstop (R1e): the run's last day in the 059 model. */
export const BACKSTOP = 20;
/** REQ-BFG-059's goal: a run is won at 10 wins. */
export const WIN_GOAL = 10;

const argv = process.argv.slice(2);
const has = (n: string) => argv.includes(`--${n}`);
function flag(n: string): string | undefined {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const int = (n: string, d: number) => (flag(n) === undefined ? d : Number(flag(n)));
function range(s: string): number[] {
  const [a, b] = s.split("-").map(Number);
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i);
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------- the sets

// OPEN-1 (REQ-BFG-109): `--also open` adds OPEN_RUNES (the open rune pool and its rewrites, src/sim/openRunes.ts): BRIEF-OPEN1
// section 5's "open" set is `--set today --also open`.
export interface SetSwitches { npcDay: boolean; hullScale: boolean; ladderFix: boolean; hearts: boolean; guard: boolean; pick: boolean; open: boolean }
export function setOf(name: string, also: string[] = []): SetSwitches {
  const today: SetSwitches = { npcDay: true, hullScale: true, ladderFix: true, hearts: false, guard: false, pick: false, open: false };
  const s = name === "allon" ? { ...today, hearts: true, guard: true, pick: true } : name === "today" ? today : null;
  if (!s) throw new Error(`--set ${name}: today or allon`);
  for (const a of also) {
    if (a === "hearts" || a === "guard" || a === "pick" || a === "open") s[a] = true;
    else if (a) throw new Error(`--also ${a}: hearts, guard, pick or open`);
  }
  return s;
}
/** The set's switches on in this thread, through each switch's setter. */
export function applySet(s: SetSwitches): string {
  setNpcDay(s.npcDay);
  setHullScale(s.hullScale);
  setLadderFix(s.ladderFix);
  setHearts(s.hearts);
  setGuard(s.guard);
  setOpenRunes(s.open); // OPEN-1
  return Object.entries(s).filter(([, v]) => v).map(([k]) => k).join("+");
}
const SET = setOf(flag("set") ?? "today", (flag("also") ?? "").split(",").filter(Boolean));

// ---------------------------------------------------------------- mode pool

async function modePool(): Promise<unknown> {
  const t0 = Date.now();
  const pool = generateSamplePool().map((snapshot) => ({ id: ghostId(snapshot), snapshot }));
  console.log(`pool: ${pool.length} seed ghosts in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!SET.pick) return { pool, grades: [] };
  const K = int("grade-k", 6), S = int("grade-seeds", 1);
  const decks: Build[] = [];
  const at = new Map<string, number>();
  const add = (key: string, b: () => Build) => { let i = at.get(key); if (i === undefined) { i = decks.length; decks.push(b()); at.set(key, i); } return i; };
  const jobs: Job[] = [];
  const plan = pool.map((e, gi) => {
    const day = e.snapshot.day, a = add(`ghost|${e.id}`, () => e.snapshot.build);
    const js = HEROES4.flatMap((h) => parField(h, day, K).map((b, m) => {
      jobs.push({ a, b: add(`par|${h}|${day}|${m}`, () => b), seeds: Array.from({ length: S }, (_, x) => hashSeed("rt1-grade", day, gi, h, m, x)), day });
      return jobs.length - 1;
    }));
    return { e, js };
  });
  console.log(`grade: ${plan.length} seed ghosts, ${jobs.length} pairings, k ${K}, seeds ${S}, ${decks.length} decks built at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const runner = workerRunner(Math.min(2, int("workers", 2)), import.meta.url);
  try {
    const pts = await runner.run(decks, jobs);
    const grades = plan.map(({ e, js }) => ({ id: e.id, hero: e.snapshot.hero, day: e.snapshot.day, wins: e.snapshot.wins, lives: e.snapshot.lives, playerId: e.snapshot.playerId, vsPar: r3(js.reduce((s, j) => s + pts[j] / (2 * S), 0) / js.length) }));
    return { pool, grades, gradeK: K, gradeSeeds: S };
  } finally {
    await runner.close();
  }
}

// ---------------------------------------------------------------- mode bench

/** The fight: deck a (side 0) against b on `day`'s scales; 0 a wins, 1 b wins, -1 a draw. */
function fight(a: Build, b: Build, seed: number, day: number): 0 | 1 | -1 {
  const w = simulate(a, b, seed, undefined, undefined, day).winner;
  return w === 0 ? 0 : w === 1 ? 1 : -1;
}

export interface Row {
  hero: HeroId; seed: number; model: string; res: number[]; foes: string[]; recs: string[]; wins: number;
  end: "lost" | "complete" | "won" | "backstop"; endDay: number; lcDay: number; boon: string | null; left: number; captains: number;
}

function policyOpts(p: string): PlayerOpts {
  if (p === "par") return {};
  if (p.startsWith("casual")) return casualOpts(p.split(":")[1] || undefined);
  throw new Error(`--policy ${p}: par or casual:<tune>`);
}

interface BenchCtx {
  pool: PoolEntry[]; grades: Grades; rule: RecordRule; opts: PlayerOpts; hearts: HeartsRule; refund: boolean;
}

/** One run of `hero` (field seed `seed`) on run model `model`. */
function runLedger(hero: HeroId, seed: number, model: "10" | "059", ctx: BenchCtx): Row {
  const runSeed = parRunSeed(hero, seed);
  const lastDay = model === "10" ? RUN_DAYS : BACKSTOP;
  let decks = playerRun(hero, RUN_DAYS, seed, ctx.opts).map((d) => d.build);
  const heartsOn = SET.hearts, cap = heartsOn ? ctx.hearts.start : START_LIVES;
  let left = cap, wins = 0, lcUsed = false, lcDay = 0, boon: string | null = null, early = false, refunded = false, captains = 0;
  let end: Row["end"] = "complete", endDay = 0;
  const seen: string[] = [], res: number[] = [], foes: string[] = [], recs: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const cd = Math.min(day, RUN_DAYS); // days 11+: day 10's content
    // the dawn of REFUND_DAY: the early-loss refund (lives: the game's rule; hearts: only with --refund, cell 4's read)
    if (day === REFUND_DAY && early && !refunded && (!heartsOn || ctx.refund)) {
      left = Math.min(cap, left + REFUND_LIVES);
      refunded = true;
    }
    const deck = decks[cd - 1];
    recs.push(`${wins}W${left}`);
    const req: MatchRequest = { rules: RULES_VERSION, day: cd, wins, lives: Math.max(1, left), playerId: "rt1-bench", seen, runs: 0 };
    const rng = new Rng(hashSeed("rt1-match", runSeed, day));
    const hit = SET.pick ? recordPick(ctx.pool, req, ctx.grades, rng, ctx.rule) : pickGhost(ctx.pool, req, rng);
    let foe: Build;
    if (hit) {
      foe = hit.snapshot.build;
      foes.push(hit.id);
      seen.push(hit.id);
    } else {
      const s = standInFoe(runSeed, cd);
      foe = s.build;
      foes.push(`captain:${s.id}`);
      captains++;
    }
    const r = fight(deck, foe, hashSeed(runSeed, "battle", day), cd);
    res.push(r);
    const outcome = r === 0 ? "win" : r === 1 ? "loss" : "draw";
    if (r === 0) wins++;
    let fired = false;
    if (heartsOn) {
      const s = heartsDusk(left, day, outcome, lcUsed, { rule: ctx.hearts, lastDay });
      left = s.hearts;
      fired = s.lastChance;
    } else if (outcome === "loss") {
      left = Math.max(0, left - 1);
      if (day < REFUND_DAY) early = true;
      // day.ts finishDay's LAST CHANCE (lastChance.ts lastChanceFires), before the run's last day
      if (!lcUsed && left === LAST_CHANCE_AT && day < lastDay) { left += LAST_CHANCE_LIVES; fired = true; }
    }
    if (heartsOn && outcome === "loss" && day < REFUND_DAY) early = true;
    if (fired) {
      lcUsed = true;
      lcDay = day;
      if (day < RUN_DAYS) {
        const offer = lastChanceOffer(runSeed, day, hero, (deck.runes ?? []).map((q) => q.id), openRunesRules()); // OPEN-1: the switch
        boon = botLastChancePick(offer, hero, deck, day, { wins }).boon;
        decks = playerRun(hero, RUN_DAYS, seed, { ...ctx.opts, lastChance: { day, boon: boon as Boon } }).map((d) => d.build);
      } else {
        boon = "hull"; // 059 model: no dawn after day 10 is played, so the HULL card (flagged)
        decks = decks.map((b, i) => (i === RUN_DAYS - 1 ? { ...b, hullBonus: b.hullBonus + LAST_CHANCE_HULL } : b));
      }
    }
    if (left <= 0) { end = "lost"; endDay = day; break; }
    if (model === "059" && wins >= WIN_GOAL) { end = "won"; endDay = day; break; }
    if (day >= lastDay) { end = model === "10" ? "complete" : "backstop"; endDay = day; break; }
  }
  return { hero, seed, model, res, foes, recs, wins, end, endDay, lcDay, boon, left, captains };
}

function loadPoolFile(file: string): { pool: PoolEntry[]; grades: Grades } {
  const raw = JSON.parse(readFileSync(file, "utf8")) as { data?: { pool: { id: string; snapshot: unknown }[]; grades: { id: string; vsPar: number }[] } };
  const d = raw.data!;
  const pool = d.pool.map((e) => ({ id: e.id, snapshot: checkSnapshot(e.snapshot) }));
  for (const e of pool) if (ghostId(e.snapshot) !== e.id) throw new Error(`pool ${file}: ${e.id} is not its snapshot's id`);
  return { pool, grades: new Map(d.grades.map((g) => [g.id, g.vsPar])) };
}

function modeBench(): unknown {
  const pol = flag("policy") ?? "casual:c5";
  const heroes = (flag("heroes") ?? HEROES4.join(",")).split(",") as HeroId[];
  const seeds = range(flag("seeds") ?? "1-48");
  const models = (flag("models") ?? "10,059").split(",") as ("10" | "059")[];
  const { pool, grades } = loadPoolFile(flag("pool")!);
  if (SET.pick && !grades.size) throw new Error("PICK in the set needs a graded pool (--mode pool with PICK)");
  const rv = flag("rule")?.split(",").map(Number);
  const rule: RecordRule = rv ? { losing: rv[0], deep: rv[1], deepAt: rv[2] } : { ...RECORD_RULE };
  const hearts: HeartsRule = { ...HEARTS_RULE, ...(flag("hearts-start") ? { start: Number(flag("hearts-start")) } : {}) };
  const ctx: BenchCtx = { pool, grades, rule, opts: policyOpts(pol), hearts, refund: has("refund") };
  const rows: Row[] = [];
  const t0 = Date.now();
  for (const hero of heroes) {
    for (const seed of seeds) for (const m of models) rows.push(runLedger(hero, seed, m, ctx));
    console.log(`bench ${pol} ${flag("set")}${flag("also") ? `+${flag("also")}` : ""}: ${hero} done at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return { policy: pol, heroes, seeds: [seeds[0], seeds[seeds.length - 1]], models, rule, hearts, refund: ctx.refund, rows };
}

// ---------------------------------------------------------------- mode corr (T5's upload grade)

/** Spearman's rank correlation of two equal-length lists (average ranks on ties). */
export function spearman(x: readonly number[], y: readonly number[]): number {
  const rank = (v: readonly number[]) => {
    const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
      for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** --mode corr --pool pool.json: the upload grade's candidate, the bots' deck rating (player.ts rateOn = deckRating.ts
 *  rateDeck(...).value on the day's fight time), against the pool's vsPar grades: Spearman per day (12 ghosts a day), and
 *  pooled over the 120 on each ghost's rank within its day. */
function modeCorr(): unknown {
  const { pool, grades } = loadPoolFile(flag("pool")!);
  const rows = pool.filter((e) => grades.has(e.id)).map((e) => ({ id: e.id, day: e.snapshot.day, hero: e.snapshot.hero, vsPar: grades.get(e.id)!, rating: rateOn(e.snapshot.build, e.snapshot.day) }));
  const perDay: { day: number; n: number; rho: number }[] = [];
  const pooledX: number[] = [], pooledY: number[] = [];
  for (let day = 1; day <= RUN_DAYS; day++) {
    const at = rows.filter((r) => r.day === day);
    if (at.length < 3) continue;
    perDay.push({ day, n: at.length, rho: r3(spearman(at.map((r) => r.rating), at.map((r) => r.vsPar))) });
    const pr = (v: number[], x: number) => v.filter((q) => q < x).length / v.length;
    for (const r of at) { pooledX.push(pr(at.map((q) => q.rating), r.rating)); pooledY.push(pr(at.map((q) => q.vsPar), r.vsPar)); }
  }
  const pooled = r3(spearman(pooledX, pooledY));
  const mean = r3(perDay.reduce((s, d) => s + d.rho, 0) / perDay.length);
  console.log(`corr: Spearman(rateOn, vsPar) per day ${perDay.map((d) => `d${d.day} ${d.rho}`).join(", ")}; mean ${mean}; pooled within-day ranks ${pooled} (n ${pooledX.length})`);
  return { perDay, mean, pooled, rows };
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  const mode = flag("mode") ?? "";
  const started = new Date().toISOString();
  const label = applySet(SET);
  let data: unknown;
  if (mode === "pool") data = await modePool();
  else if (mode === "bench") data = modeBench();
  else if (mode === "corr") data = modeCorr();
  else throw new Error("--mode pool | bench | corr");
  const out = flag("out")!;
  // kept only when whole: written to a temp name, then renamed
  writeFileSync(`${out}.part`, JSON.stringify({ mode, args: argv, set: flag("set"), also: flag("also") ?? "", switches: label, started, finished: new Date().toISOString(), data }) + "\n");
  renameSync(`${out}.part`, out);
  console.log(`${mode} done (${label}) -> ${out} at ${new Date().toISOString()}`);
}

const toolRun = !!process.argv[1]?.endsWith("retune1.js");
if (toolRun) applySet(SET); // every thread (workers share argv) before any deck is built
if (toolRun && !isMainThread) serveJobs();
else if (toolRun) void main();
