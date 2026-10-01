// SC-TOOL --survival (REQ-BFG-026 item 7; DONE-CHECK-40d2b2c finding 3): run survival. "With the early-loss refund, a
// player who wins 50-55% of dusk fights finishes all 10 days about 57-69% of the time": the genre study's arithmetic
// (targets.json early-stakes-first-loss-net: 56.8% at a 50% dusk win rate and 68.6% at 55%, with the refund).
//
// (a) Exact, from the game's own run rules. The rules audit reads, off the run code, everything that moves lives: a
//     dusk result (day.ts finishDay: a loss costs one, a win or a draw none; 0 lives ends the run, surviving day 10's
//     dusk completes it), the early-loss refund (day.ts REFUND_DAY, REFUND_LIVES, earlyLossRefund), every road-event
//     choice (events.ts EVENTS: only the DOCK's PATCH UP, +1 life for 4 gold, never above START_LIVES) and the
//     warlords (road.ts finishWarlord: lives never change). Then every one of the 2^10 dusk loss patterns is played
//     through the game's day loop (newRun, startDusk with no ghost pool, finishDay with the scripted result) and the
//     patterns that complete are summed at P(loss) = 1 - p per dusk. That is exact and has no model in between. A draw
//     is a non-loss for lives (checked on every pattern), so a draw rate q reads as p + q.
// (b) The DOCK's PATCH UP is the one player choice that moves lives. The day the DOCK comes is fixed by the run seed
//     (events.ts eventSequence: day 1-10 hold one shuffled bag of all 10 events, then HERALD or SAPPERS on day 10 swaps
//     with the latest earlier day holding neither). Its odds per day are exact (the 720 placements of DOCK, HERALD and
//     SAPPERS), checked on run seeds against eventSequence. For each DOCK day, every loss pattern is played through
//     the run code again, with PATCH UP bought on the road whenever the run code allows it (pickRoad "event",
//     choicesFor, pickChoice). That is the ceiling for a player who always buys it; a player who never does reads (a).
// (c) The smallest model (modelCompletes) restates those rules in a few lines. It is checked against the run code on
//     every loss pattern, with and without the DOCK, wins and draws; the tool stops if they ever disagree.
// (d) Measured: the par player's scripted runs (player.ts playerRun, typical policy: the driver SC-TOOL and parBench
//     use), seeds 1..N per playable hero. Each dusk is the game's own fight: the par deck at that dusk against the foe
//     the run meets with no ghost pool (startDusk: chooseFoe -> standInFoe(run.seed, day)), on the run's battle seed
//     (run.ts battleSeed), the player on side 0. run.seed is read off the par player's own Run (its onDecide hook).
//     All 10 dusks are fought (playerRun's decks never depend on the results: it pays a win's income every day and
//     takes no road stop), and lives follow finishDay on a run with that seed until it ends.

import { hashSeed, Rng } from "../../src/core/rng";
import { RUN_DAYS, START_GOLD, START_LIVES, type HeroId } from "../../src/sim/content";
import { simulate, type SideStats } from "../../src/sim/battle";
import { PLAYABLE_HEROES } from "../../src/sim/heroBuilds";
import { battleSeed, newRun, type Run } from "../../src/game/run";
import { REFUND_DAY, REFUND_LIVES, finishDay, startDusk } from "../../src/game/day";
import { finishWarlord, pickRoad } from "../../src/game/road";
import { BAG_IDS, EVENTS, EVENT_IDS, choicesFor, eventFor, eventSequence, makeEvent, pickChoice } from "../../src/game/events";
import { WARLORD_EVENT_IDS, type Delta, type EventId } from "../../src/game/eventDefs";
import { standInFoe } from "../../src/game/ghosts";
import { playerRun } from "../../src/sim/harness/player";
import { meanCI, wilson, type Rate } from "../../src/sim/harness/stats";
import { mdTable, type Row, type Section } from "./report";
import { fmt } from "./targets";
import { runJobs } from "./pool";

// ---------------------------------------------------------------- the model (pure: tests check it by hand)

/** What the exact model needs from the run rules (lifeAudit reads each value off the game). */
export interface LifeRules {
  startLives: number; // START_LIVES
  days: number; // RUN_DAYS
  lossLives: number; // lives a dusk loss costs; a win or a draw costs none
  refundDay: number; // the early-loss refund comes at this dawn, for a loss on an earlier day, once per run
  refundLives: number; // ... this many lives, never above startLives (0: no refund)
  dockLives: number; // the DOCK's PATCH UP: lives it gives, bought only while lives + dockLives <= startLives
}

/** REQ-BFG-026 item 7's band, in whole percent: survival at a 50% and a 55% dusk win rate rounds into 57-69%. */
export const SURVIVAL_BAND: readonly [number, number] = [57, 69];
/** The win rates the row reads, and the table's grid (0.40 to 0.65 in steps of 0.05). */
export const ROW_P: readonly number[] = [0.5, 0.55];
export const GRID_P: readonly number[] = [40, 45, 50, 55, 60, 65].map((x) => x / 100);
/** The genre study's arithmetic (targets.json, early-stakes-first-loss-net), with and without the refund. */
export const GENRE: Readonly<Record<string, { refund: number; none: number }>> = { "0.5": { refund: 0.568, none: 0.377 }, "0.55": { refund: 0.686, none: 0.504 } };

/** Does survival round (half up, to a whole percent) into [lo, hi]? 0.565 rounds to 57 and 0.695 to 70 (the float a
 *  hair under a half, as 0.565 * 100 is, counts as the half). */
export const roundsInto = (s: number, band: readonly [number, number] = SURVIVAL_BAND): boolean => {
  const r = Math.round(100 * s + 1e-9);
  return r >= band[0] && r <= band[1];
};

/** A loss pattern: bit d - 1 of `mask` is "lost day d". */
export const lostOf = (mask: number, days: number): boolean[] => Array.from({ length: days }, (_, d) => ((mask >> d) & 1) === 1);

/**
 * The smallest model of the game's lives: does a run with these dusk losses finish every day? `dockDay`: the day the
 * player buys PATCH UP on the road, before that day's dusk (0: never).
 */
export function modelCompletes(r: LifeRules, lost: readonly boolean[], dockDay = 0): boolean {
  let lives = r.startLives, early = false;
  for (let d = 1; d <= r.days; d++) {
    if (d === dockDay && lives + r.dockLives <= r.startLives) lives += r.dockLives;
    if (lost[d - 1]) {
      lives = Math.max(0, lives - r.lossLives);
      if (d < r.refundDay) early = true;
    }
    if (lives <= 0) return false;
    if (d + 1 === r.refundDay && early) lives += Math.max(0, Math.min(r.refundLives, r.startLives - lives));
  }
  return true;
}

/** modelCompletes over every loss pattern (index = mask). */
export function modelTable(r: LifeRules, dockDay = 0): boolean[] {
  return Array.from({ length: 2 ** r.days }, (_, m) => modelCompletes(r, lostOf(m, r.days), dockDay));
}

/** P(alive after the last dusk): the completing patterns' probability; loss[d - 1] = P(lose day d's dusk). */
export function survivalFrom(complete: readonly boolean[], loss: readonly number[]): number {
  let s = 0;
  for (let m = 0; m < complete.length; m++) {
    if (!complete[m]) continue;
    let p = 1;
    for (let d = 0; d < loss.length; d++) p *= (m >> d) & 1 ? loss[d] : 1 - loss[d];
    s += p;
  }
  return s;
}

/** Every dusk lost with probability 1 - p (no draws). */
export const constLoss = (p: number, days: number = RUN_DAYS): number[] => Array.from({ length: days }, () => 1 - p);

/** keepDudsOffLastDay's rule on one order (in place): a dud on the last day swaps with the latest earlier non-dud. */
export function keepOffLast(order: string[], duds: readonly string[]): void {
  const last = order.length - 1;
  if (last < 0 || !duds.includes(order[last])) return;
  for (let j = last - 1; j >= 0; j--) {
    if (!duds.includes(order[j])) {
      [order[j], order[last]] = [order[last], order[j]];
      return;
    }
  }
}

/**
 * The day an event lands on (out[d - 1] = P(day d)) when one shuffled bag covers the run: every placement of `id` and
 * the duds is equally likely (a uniform shuffle), then keepOffLast. Only those events' places matter, so they are
 * enumerated: 10 x 9 x 8 = 720 placements for DOCK, HERALD and SAPPERS.
 */
export function eventDayOdds(bag: readonly string[], id: string, duds: readonly string[]): number[] {
  const n = bag.length;
  const marked = [id, ...duds.filter((d) => d !== id && bag.includes(d))];
  const count = Array.from({ length: n }, () => 0);
  let total = 0;
  const place = (used: number[]): void => {
    if (used.length === marked.length) {
      const order = Array.from({ length: n }, () => "");
      used.forEach((pos, i) => (order[pos] = marked[i]));
      keepOffLast(order, duds);
      count[order.indexOf(id)]++;
      total++;
      return;
    }
    for (let pos = 0; pos < n; pos++) if (!used.includes(pos)) place([...used, pos]);
  };
  place([]);
  return count.map((c) => c / total);
}

// ---------------------------------------------------------------- the run code

const ZERO: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
type Result = 0 | 1 | -1;
const WIN: Result = 0, LOSS: Result = 1, DRAW: Result = -1;
const resName = (r: number): string => (r === WIN ? "W" : r === LOSS ? "L" : "D");

/** One dusk through the day loop: startDusk (no ghost pool: the stand-in) and finishDay with the scripted result. */
function dusk(run: Run, r: Result): void {
  startDusk(run, []);
  finishDay(run, r, 20, { ...ZERO }, { ...ZERO });
}

const livesIn = (ds: readonly Delta[]): number => ds.reduce((s, d) => s + (d.k === "lives" ? d.n : 0), 0);
const goldIn = (ds: readonly Delta[]): number => ds.reduce((s, d) => s + (d.k === "gold" ? d.n : 0), 0);

/** A road-event choice that moves lives. */
export interface LivesChoice { event: EventId; choice: string; costLives: number; gainLives: number; costGold: number; gamble: boolean }

export interface Audit {
  rules: LifeRules;
  dusk: { win: number; loss: number; draw: number }; // lives after one dusk of each result, minus START_LIVES (fresh run)
  refund: { day: number; lives: number; dawns: number[] }; // REFUND_DAY, REFUND_LIVES; lives at dawns 1-4 after L, W, W
  choices: LivesChoice[]; // every road-event choice that moves lives (scanned over all EVENT_IDS)
  dock: EventId | null; // the event whose choice gives a life
  warlords: { tier: string; outcome: string; delta: number }[]; // lives after the warlord fight, minus START_LIVES
  throwing: { script: string; lives: number; gold: number }[]; // lives and gold at dawn 3 after days 1-2 as scripted
}

/** Read every rule that moves lives off the run code (fresh runs of `hero`, run seed `seed`). Stops on a rule the
 *  model doesn't cover (a lives cost, a second lives event, a gamble for lives, a warlord or a non-loss moving lives). */
export function lifeAudit(hero: HeroId, seed: number): Audit {
  const fresh = () => newRun(hero, seed, `sc-surv-audit-${seed}`);
  const after = (r: Result) => {
    const run = fresh();
    dusk(run, r);
    return run.lives - START_LIVES;
  };
  const d = { win: after(WIN), loss: after(LOSS), draw: after(DRAW) };
  const lr = fresh();
  const dawns = [lr.lives];
  for (const r of [LOSS, WIN, WIN]) {
    dusk(lr, r);
    dawns.push(lr.lives);
  }
  const choices: LivesChoice[] = [];
  for (const id of EVENT_IDS) {
    const run = fresh();
    for (const c of EVENTS[id].choices(run, makeEvent(run.seed, run.day, id))) {
      const cost = livesIn(c.cost), gain = livesIn(c.gain);
      if (cost || gain) choices.push({ event: id, choice: c.label, costLives: cost, gainLives: gain, costGold: goldIn(c.cost), gamble: c.odds !== undefined });
    }
  }
  const warlords: Audit["warlords"] = [];
  for (const tier of ["easy", "medium", "hard"] as const) {
    for (const [o, name] of [[WIN, "win"], [LOSS, "loss"], [DRAW, "draw"]] as const) {
      const run = fresh();
      pickRoad(run, tier);
      finishWarlord(run, o, 20);
      warlords.push({ tier, outcome: name, delta: run.lives - START_LIVES });
    }
  }
  const throwing: Audit["throwing"] = [];
  for (const a of [WIN, DRAW, LOSS]) {
    for (const b of [WIN, DRAW, LOSS]) {
      const run = fresh();
      dusk(run, a);
      dusk(run, b);
      throwing.push({ script: resName(a) + resName(b), lives: run.lives, gold: run.gold });
    }
  }
  const gains = choices.filter((c) => c.gainLives > 0);
  const problems = [
    ...(d.win !== 0 || d.draw !== 0 ? [`a dusk win or draw moves lives (${d.win}, ${d.draw})`] : []),
    ...(d.loss >= 0 ? [`a dusk loss costs no life (${d.loss})`] : []),
    ...choices.filter((c) => c.costLives > 0).map((c) => `${c.event} ${c.choice} costs ${c.costLives} lives`),
    ...(gains.length > 1 ? [`more than one choice gives lives: ${gains.map((c) => `${c.event} ${c.choice}`).join(", ")}`] : []),
    ...gains.filter((c) => c.gamble).map((c) => `${c.event} ${c.choice} gives lives on a gamble`),
    ...warlords.filter((w) => w.delta !== 0).map((w) => `a ${w.tier} warlord ${w.outcome} moves lives by ${w.delta}`),
  ];
  if (problems.length) throw new Error(`--survival: the model doesn't cover these rules: ${problems.join("; ")}`);
  return {
    rules: { startLives: START_LIVES, days: RUN_DAYS, lossLives: -d.loss, refundDay: REFUND_DAY, refundLives: REFUND_LIVES, dockLives: gains[0]?.gainLives ?? 0 },
    dusk: d, refund: { day: REFUND_DAY, lives: REFUND_LIVES, dawns }, choices, dock: gains[0]?.event ?? null, warlords, throwing,
  };
}

/** One loss pattern through the game's day loop. On `dockDay` the player takes the road event (it must be `dock` on
 *  this seed) and buys its lives choice when the run code allows it (choicesFor's blocked reason is empty). */
export function runPattern(hero: HeroId, seed: number, mask: number, dockDay = 0, nonLoss: Result = WIN, dock: EventId = "dock"): { complete: boolean; lives: number[]; patched: boolean } {
  const run = newRun(hero, seed, `sc-surv-${seed}`);
  const lives: number[] = [];
  let patched = false;
  for (let day = 1; day <= RUN_DAYS && !run.over; day++) {
    if (day === dockDay) {
      if (eventFor(run.seed, day) !== dock) throw new Error(`run seed ${seed} has no ${dock} on day ${day}`);
      pickRoad(run, "event");
      const i = choicesFor(run).findIndex((c) => livesIn(c.gain) > 0 && !c.blocked);
      if (i >= 0) patched = pickChoice(run, i).ok;
    }
    dusk(run, (mask >> (day - 1)) & 1 ? LOSS : nonLoss);
    lives.push(run.lives);
  }
  return { complete: run.over === "complete", lives, patched };
}

/** Every loss pattern through runPattern: does it complete (index = mask)? `patched`: patterns that bought PATCH UP. */
export function patternTable(hero: HeroId, seed: number, dockDay = 0, nonLoss: Result = WIN, dock: EventId = "dock"): { complete: boolean[]; patched: number } {
  const complete: boolean[] = [];
  let patched = 0;
  for (let m = 0; m < 2 ** RUN_DAYS; m++) {
    const r = runPattern(hero, seed, m, dockDay, nonLoss, dock);
    complete.push(r.complete);
    if (r.patched) patched++;
  }
  return { complete, patched };
}

/** The first run seed >= `from` whose road event on `day` is `id`. */
export function seedWithEvent(id: EventId, day: number, from = 1): number {
  for (let s = from; s < from + 1_000_000; s++) if (eventFor(s, day) === id) return s;
  throw new Error(`no run seed in ${from}..${from + 999_999} has ${id} on day ${day}`);
}

/** The bag model against the run code: on run seeds 1..n, the first bag re-shuffled the way eventSequence draws it
 *  (Rng(hashSeed(seed, "event-bag", 0)).shuffle) and put through keepOffLast must equal eventSequence(seed, RUN_DAYS);
 *  and the event's day frequencies over those seeds. */
export function checkBag(n: number, id: EventId): { seeds: number; mismatches: number[]; freq: number[] } {
  const mismatches: number[] = [];
  const freq = Array.from({ length: RUN_DAYS }, () => 0);
  for (let s = 1; s <= n; s++) {
    const seq = eventSequence(s, RUN_DAYS);
    const bag = new Rng(hashSeed(s, "event-bag", 0)).shuffle([...BAG_IDS]) as string[];
    keepOffLast(bag, WARLORD_EVENT_IDS);
    if (bag.slice(0, RUN_DAYS).join() !== seq.join()) mismatches.push(s);
    freq[seq.indexOf(id)]++;
  }
  return { seeds: n, mismatches, freq: freq.map((c) => c / n) };
}

// ---------------------------------------------------------------- measured: the par player's runs

export interface SurvJob { hero: HeroId; seed: number }
export interface SurvRun {
  hero: HeroId; seed: number; runSeed: number;
  res: number[]; // each day's dusk result for the player: 0 win, 1 loss, -1 draw (all 10 days)
  t: number[]; // each fight's length (game seconds)
  foes: string[]; // the stand-in captain met each day
  lives: number[]; // lives after each dusk while the run lasts (finishDay)
  complete: boolean; // alive after day 10's dusk
  endDay: number; // the day the run was lost (0: it completed)
}

/** One par run (worker-safe: plain data in and out). */
export function survJob(j: SurvJob): SurvRun {
  const seen: { seed?: number } = {};
  const days = playerRun(j.hero, RUN_DAYS, j.seed, { onDecide: (run) => { if (seen.seed === undefined) seen.seed = run.seed; } });
  const runSeed = seen.seed;
  if (runSeed === undefined) throw new Error(`par run ${j.hero} ${j.seed}: no shopping step, so no run seed`);
  const run = newRun(j.hero, runSeed, `sc-surv-par-${j.hero}-${j.seed}`);
  const out: SurvRun = { hero: j.hero, seed: j.seed, runSeed, res: [], t: [], foes: [], lives: [], complete: false, endDay: 0 };
  for (let day = 1; day <= RUN_DAYS; day++) {
    const alive = !run.over;
    const foe = alive ? startDusk(run, []) : standInFoe(runSeed, day);
    const seed = battleSeed(alive ? run : { ...run, day });
    const b = simulate(days[day - 1].build, foe.build, seed);
    const w = b.winner ?? -1;
    out.res.push(w);
    out.t.push(Math.round(b.t * 100) / 100);
    out.foes.push(foe.name);
    if (alive) {
      finishDay(run, w, b.t, b.sides[0].stats, b.sides[1].stats);
      out.lives.push(run.lives);
      if (run.over === "lost") out.endDay = day;
    }
  }
  out.complete = run.over === "complete";
  return out;
}

export interface Measure {
  hero: string; runs: number; fights: number; wins: number; draws: number; losses: number;
  win: Rate; // dusk wins over all fights (Wilson)
  winCI: [number, number] | null; // per-run win shares, t-interval (each run's 10 fights are one cluster)
  nonLoss: number; nonLossCI: [number, number] | null; // wins + draws, the rate that keeps lives
  perDay: { day: number; n: number; win: number; draw: number; loss: number }[];
  played: { fights: number; wins: number; draws: number }; // only the dusks the run lived to fight
  complete: Rate; // runs alive after day 10's dusk (Wilson)
  pred: number; predLo: number; predHi: number; // the exact model at the measured non-loss rate (and its CI ends)
  predDay: number; // the exact model at each day's measured loss rate
  endDays: number[]; // runs lost on day 1..10
  losses10: { mean: number; variance: number; binomial: number; dispersion: number; hist: number[] }; // each run's losses over all 10 dusks
  ownPattern: number; // runs whose finish differs from the run-code table at their own loss pattern (must be 0)
}

export function measureOf(label: string, runs: readonly SurvRun[], table: readonly boolean[]): Measure {
  const fights = runs.length * RUN_DAYS;
  const count = (rs: readonly SurvRun[], r: number) => rs.reduce((s, x) => s + x.res.filter((y) => y === r).length, 0);
  const wins = count(runs, WIN), draws = count(runs, DRAW), losses = count(runs, LOSS);
  const per = (f: (x: SurvRun) => number): [number, number] | null => {
    const c = meanCI(runs.map(f)).ci;
    return c ? [Math.max(0, c[0]), Math.min(1, c[1])] : null;
  };
  const winCI = per((x) => x.res.filter((y) => y === WIN).length / RUN_DAYS);
  const nonLossCI = per((x) => x.res.filter((y) => y !== LOSS).length / RUN_DAYS);
  const perDay = Array.from({ length: RUN_DAYS }, (_, i) => {
    const rs = runs.map((x) => x.res[i]);
    const n = rs.length || 1;
    return { day: i + 1, n: rs.length, win: rs.filter((y) => y === WIN).length / n, draw: rs.filter((y) => y === DRAW).length / n, loss: rs.filter((y) => y === LOSS).length / n };
  });
  const played = { fights: 0, wins: 0, draws: 0 };
  for (const x of runs) {
    const k = x.complete ? RUN_DAYS : x.endDay;
    played.fights += k;
    played.wins += x.res.slice(0, k).filter((y) => y === WIN).length;
    played.draws += x.res.slice(0, k).filter((y) => y === DRAW).length;
  }
  const nonLoss = fights ? (wins + draws) / fights : NaN;
  const at = (q: number) => survivalFrom(table, constLoss(q));
  const lo = nonLossCI ? Math.max(0, nonLossCI[0]) : NaN, hi = nonLossCI ? Math.min(1, nonLossCI[1]) : NaN;
  // a run's dusks are not independent draws: its losses over all 10 dusks against a binomial's spread at the same rate
  const lc = runs.map((x) => x.res.filter((y) => y === LOSS).length);
  const lm = lc.reduce((a, b) => a + b, 0) / (lc.length || 1);
  const lv = lc.length > 1 ? lc.reduce((s, x) => s + (x - lm) ** 2, 0) / (lc.length - 1) : NaN;
  const bv = RUN_DAYS * (lm / RUN_DAYS) * (1 - lm / RUN_DAYS);
  const maskOf = (x: SurvRun) => x.res.reduce((m, y, i) => m | (y === LOSS ? 1 << i : 0), 0);
  return {
    hero: label, runs: runs.length, fights, wins, draws, losses, win: wilson(wins, fights), winCI, nonLoss, nonLossCI, perDay, played,
    complete: wilson(runs.filter((x) => x.complete).length, runs.length),
    pred: at(nonLoss), predLo: at(lo), predHi: at(hi), predDay: survivalFrom(table, perDay.map((d) => d.loss)),
    endDays: Array.from({ length: RUN_DAYS }, (_, i) => runs.filter((x) => !x.complete && x.endDay === i + 1).length),
    losses10: { mean: lm, variance: lv, binomial: bv, dispersion: lv / bv, hist: Array.from({ length: RUN_DAYS + 1 }, (_, k) => lc.filter((x) => x === k).length) },
    ownPattern: runs.filter((x) => x.complete !== table[maskOf(x)]).length,
  };
}

// ---------------------------------------------------------------- the mode

export interface SurvOpts { seeds: number; workers: number; script: string; checkSeeds: number }

const pc = (x: number, d = 1) => (Number.isFinite(x) ? `${(100 * x).toFixed(d)}%` : "-");
const choose = (n: number, k: number): number => (k < 0 || k > n ? 0 : k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k);
const binom = (n: number, k: number, q: number): number => choose(n, k) * q ** k * (1 - q) ** (n - k);
const ci = (lo: number, hi: number, d = 1) => `[${(100 * lo).toFixed(d)}-${(100 * hi).toFixed(d)}]`;

export async function survivalMode(o: SurvOpts): Promise<{ rows: (Row & { digits?: number })[]; sections: Section[]; meta: Record<string, unknown> }> {
  const t0 = performance.now();
  const hero = PLAYABLE_HEROES[0], seed = 20260926;
  const audit = lifeAudit(hero, seed);
  const R = audit.rules;
  // (a) every loss pattern through the day loop, wins and draws as the non-loss; every playable hero
  const base = patternTable(hero, seed);
  const drawn = patternTable(hero, seed, 0, DRAW);
  const heroes = PLAYABLE_HEROES.map((h) => ({ hero: h, same: h === hero || patternTable(h, seed).complete.join() === base.complete.join() }));
  const model = modelTable(R);
  const noRefund = modelTable({ ...R, refundLives: 0 });
  // (b) the DOCK, on every day it can come
  const dockId = audit.dock;
  const odds = dockId ? eventDayOdds(BAG_IDS, dockId, WARLORD_EVENT_IDS) : [];
  if (dockId && BAG_IDS.length !== RUN_DAYS) throw new Error(`--survival: the DOCK odds assume one bag covers the run (bag ${BAG_IDS.length}, run ${RUN_DAYS} days)`);
  const docks = odds.map((p, i) => {
    const day = i + 1, s = seedWithEvent(dockId!, day);
    const t = patternTable(hero, s, day, WIN, dockId!);
    return { day, p, seed: s, ...t, model: modelTable(R, day) };
  });
  const bag = dockId ? checkBag(o.checkSeeds, dockId) : null;
  if (bag?.mismatches.length) throw new Error(`--survival: the event-bag model and eventSequence disagree on run seeds ${bag.mismatches.slice(0, 10).join(", ")}`);
  // (c) the model against the run code
  const diff = (a: readonly boolean[], b: readonly boolean[]) => a.reduce((s, x, i) => s + (x !== b[i] ? 1 : 0), 0);
  const checks = [
    { what: "no DOCK, a win as the non-loss", n: base.complete.length, diff: diff(model, base.complete) },
    { what: "no DOCK, a draw as the non-loss", n: drawn.complete.length, diff: diff(model, drawn.complete) },
    ...docks.map((d) => ({ what: `PATCH UP on day ${d.day} (run seed ${d.seed})`, n: d.complete.length, diff: diff(d.model, d.complete) })),
  ];
  const bad = checks.filter((c) => c.diff > 0);
  if (bad.length) throw new Error(`--survival: the model and the run code disagree: ${bad.map((c) => `${c.what}: ${c.diff} of ${c.n}`).join("; ")}`);
  const exactSeconds = (performance.now() - t0) / 1000;
  const S = (p: number) => survivalFrom(base.complete, constLoss(p));
  const dockS = (p: number) => docks.reduce((s, d) => s + d.p * survivalFrom(d.complete, constLoss(p)), 0);
  const grid = GRID_P.map((p) => ({ p, dusk: S(p), model: survivalFrom(model, constLoss(p)), none: survivalFrom(noRefund, constLoss(p)), dock: dockS(p) }));
  // (d) measured
  const jobs: SurvJob[] = PLAYABLE_HEROES.flatMap((h) => Array.from({ length: o.seeds }, (_, i) => ({ hero: h, seed: i + 1 })));
  const m0 = performance.now();
  const runs = await runJobs("surv", jobs, o.workers, o.script, survJob);
  const runSeconds = (performance.now() - m0) / 1000;
  const measures = [...PLAYABLE_HEROES.map((h) => measureOf(h, runs.filter((r) => r.hero === h), base.complete)), measureOf("both", runs, base.complete)];
  const off = measures.filter((m) => m.ownPattern > 0);
  if (off.length) throw new Error(`--survival: par runs whose finish differs from the run-code table at their own loss pattern: ${off.map((m) => `${m.hero} ${m.ownPattern}`).join(", ")}`);

  const [s50, s55] = ROW_P.map(S);
  const pass = ROW_P.every((p) => roundsInto(S(p)));
  const both = measures[measures.length - 1];
  const half = (r: Rate) => (r.hi - r.lo) / 2;
  const rows: (Row & { digits?: number })[] = [{
    id: "run-survival",
    target: `${SURVIVAL_BAND[0]}-${SURVIVAL_BAND[1]}% at p = ${ROW_P.map((p) => p.toFixed(2)).join(" and ")} (rounded)`,
    measured: { min: s50, max: s55 },
    unit: "P(alive after day 10's dusk) at p = 0.50 / 0.55, the dusk rules (exact: every loss pattern through finishDay)",
    verdict: pass ? "PASS" : "MISS",
    digits: 3,
    notes: [
      `p = 0.50: ${pc(s50)}, p = 0.55: ${pc(s55)} (the genre study: 56.8%, 68.6%; without the refund the model gives ${pc(survivalFrom(noRefund, constLoss(0.5)))} and ${pc(survivalFrom(noRefund, constLoss(0.55)))}, the study's 37.7% and 50.4%).`,
      dockId ? `A player who also buys the DOCK's PATCH UP whenever it comes and is allowed: ${pc(dockS(0.5))} and ${pc(dockS(0.55))} (the ceiling; the par player takes no road stop).` : "No road event gives a life.",
      `Measured, the par player's runs (${o.seeds} seeds per hero): dusk win rate ${pc(both.win.p)}${both.winCI ? ` [${pc(both.winCI[0])}-${pc(both.winCI[1])}]` : ""}, draws ${pc(both.draws / both.fights)}; ${pc(both.complete.p)} [${pc(both.complete.lo)}-${pc(both.complete.hi)}] finish all 10 days; the exact model at that rate predicts ${pc(both.pred)} [${pc(both.predLo)}-${pc(both.predHi)}], higher because a run's dusks are correlated (its losses vary x${fmt(both.losses10.dispersion)} a binomial's: weak decks stay weak).`,
      `Per hero: ${measures.slice(0, -1).map((m) => `${m.hero.toUpperCase()} wins ${pc(m.win.p)}, ${pc(m.complete.p)} [${pc(m.complete.lo)}-${pc(m.complete.hi)}] finish (model ${pc(m.pred)})`).join("; ")}.`,
      "No build gains from losing days 1-2 on purpose: every day 1-2 script reaches dawn 3 with no more lives and no more gold than winning both (rules audit).",
    ],
    detail: { grid, measures: measures.map((m) => ({ ...m })), audit, checks, docks: docks.map((d) => ({ day: d.day, p: d.p, seed: d.seed, patched: d.patched })) },
  }];

  const sections: Section[] = [];
  sections.push({
    title: "Every rule that moves lives, read off the run code",
    lines: mdTable(["rule", "where", "effect on lives (read off the run code)"], [
      ["START_LIVES, RUN_DAYS", "content.ts", `${R.startLives} lives, ${R.days} days; 0 lives loses the run, surviving day ${R.days}'s dusk completes it`],
      ["a dusk result", "day.ts finishDay", `win ${audit.dusk.win >= 0 ? "+" : ""}${audit.dusk.win}, loss ${audit.dusk.loss}, draw ${audit.dusk.draw >= 0 ? "+" : ""}${audit.dusk.draw} (a fresh run after one dusk)`],
      ["the early-loss refund", "day.ts REFUND_DAY, REFUND_LIVES, earlyLossRefund", `+${R.refundLives} at the dawn of day ${R.refundDay} for a loss on day 1 or 2, once per run, never above ${R.startLives}; lives at dawns 1-4 after L, W, W: ${audit.refund.dawns.join(", ")}`],
      ...audit.choices.map((c) => [`road event ${c.event.toUpperCase()}: ${c.choice}`, "eventDefs.ts EVENTS, events.ts pickChoice / blockReason", `${c.gainLives ? `+${c.gainLives}` : ""}${c.costLives ? `-${c.costLives}` : ""} life for ${c.costGold} gold${c.gamble ? " (a gamble)" : ""}; blocked at ${R.startLives} lives (LIVES FULL)`]),
      [`the other ${EVENT_IDS.length - new Set(audit.choices.map((c) => c.event)).size} road events`, "eventDefs.ts EVENTS (every choice scanned)", "none of their choices costs or gives a life"],
      ["warlords (Easy, Medium, Hard; win, loss, draw)", "road.ts finishWarlord", audit.warlords.every((w) => w.delta === 0) ? "no change in any of the 9 cases" : audit.warlords.map((w) => `${w.tier} ${w.outcome} ${w.delta}`).join(", ")],
    ]),
  });
  sections.push({
    title: "Survival at a fixed dusk win rate p (P(alive after day 10's dusk); no draws)",
    lines: [
      "Dusk rules: every one of the 1024 loss patterns played through newRun + startDusk + finishDay, summed at P(loss) = 1 - p. A draw keeps lives like a win (checked on every pattern), so with a draw rate q read the row at p + q.",
      `With PATCH UP: the same, with the player buying PATCH UP whenever the DOCK comes and the run code allows it, weighted by the DOCK's day odds (below). The par player takes no road stop, so its runs read the dusk rules.`,
      "",
      ...mdTable(["p", "dusk rules (run code, exact)", "the model", "without the refund (model)", "with PATCH UP (run code; the ceiling)", "the genre study"],
        grid.map((g) => [fmt(g.p), pc(g.dusk, 2), pc(g.model, 2), pc(g.none, 2), pc(g.dock, 2), GENRE[String(g.p)] ? `${pc(GENRE[String(g.p)].refund)} (none: ${pc(GENRE[String(g.p)].none)})` : "-"])),
      "",
      `Row: p = 0.50 rounds to ${Math.round(100 * s50)}%, p = 0.55 to ${Math.round(100 * s55)}%; band ${SURVIVAL_BAND[0]}-${SURVIVAL_BAND[1]}%: ${pass ? "PASS" : "MISS"}.`,
      `Every playable hero gives the same table (${heroes.map((h) => `${h.hero} ${h.same ? "same" : "DIFFERS"}`).join(", ")}); lives never read the deck.`,
    ],
  });
  if (dockId) {
    sections.push({
      title: `The DOCK's day (events.ts eventSequence) and PATCH UP`,
      lines: [
        `Exact odds: the 720 placements of ${[dockId, ...WARLORD_EVENT_IDS].map((x) => x.toUpperCase()).join(", ")} in the first bag (a uniform shuffle of all ${BAG_IDS.length} events), then keepDudsOffLastDay. Checked on run seeds 1-${bag!.seeds}: the bag re-drawn as eventSequence draws it and put through that rule equals eventSequence on ${bag!.seeds - bag!.mismatches.length} of ${bag!.seeds} seeds${bag!.mismatches.length ? ` (MISMATCH on ${bag!.mismatches.slice(0, 10).join(", ")})` : ""}.`,
        "",
        ...mdTable(["DOCK on day", "exact odds", `share of run seeds 1-${bag!.seeds}`, "run seed used", "patterns that bought PATCH UP (of 1024)", "survival at p = 0.50 / 0.55, that DOCK day"],
          docks.map((d) => [d.day, fmt(d.p, 4), fmt(bag!.freq[d.day - 1], 4), d.seed, d.patched, `${pc(survivalFrom(d.complete, constLoss(0.5)))} / ${pc(survivalFrom(d.complete, constLoss(0.55)))}`])),
      ],
    });
  }
  sections.push({
    title: "The model (modelCompletes) against the run code, pattern by pattern",
    lines: mdTable(["case", "patterns", "disagree"], checks.map((c) => [c.what, c.n, c.diff])),
  });
  sections.push({
    title: "Losing days 1-2 on purpose (REQ-BFG-026 item 7, second half): lives and gold at the dawn of day 3",
    lines: [
      ...mdTable(["days 1-2", "lives", "gold (no shopping)"], audit.throwing.map((x) => [x.script, x.lives, x.gold])),
      "",
      `Winning both days gives ${audit.throwing[0].lives} lives and ${audit.throwing[0].gold} gold (START_GOLD ${START_GOLD} plus two wins' income); no other script reaches dawn 3 with more of either. tests/refund.test.ts checks the same rule on the build.`,
    ],
  });
  sections.push({
    title: `Measured: the par player's runs (playerRun, typical policy; seeds 1-${o.seeds} per hero; every dusk the game's own fight)`,
    lines: [
      "Each run's 10 dusks: the par deck at that dusk against standInFoe(run.seed, day) (startDusk with no ghost pool) on battleSeed(run), the player on side 0. Lives follow finishDay until the run ends. The win rate's CI counts each run's 10 fights as one cluster (t-interval over the runs); the finish share's is Wilson's.",
      "",
      ...mdTable(["hero", "runs", "dusk fights", "dusk win rate [95% CI]", "draws", "non-loss rate [95% CI]", "win rate while alive", "finish all 10 days [95% CI]", "CI half-width", "exact model at the non-loss rate [CI]", "exact model at each day's rate"],
        measures.map((m) => [m.hero, m.runs, m.fights, `${pc(m.win.p)} ${m.winCI ? ci(m.winCI[0], m.winCI[1]) : "-"}`, `${m.draws} (${pc(m.draws / m.fights)})`,
          `${pc(m.nonLoss)} ${m.nonLossCI ? ci(m.nonLossCI[0], m.nonLossCI[1]) : "-"}`, pc(m.played.wins / m.played.fights),
          `${pc(m.complete.p)} ${ci(m.complete.lo, m.complete.hi)}`, `${(100 * half(m.complete)).toFixed(1)} pts`, `${pc(m.pred)} ${ci(m.predLo, m.predHi)}`, pc(m.predDay)])),
      "",
      ...mdTable(["hero", ...Array.from({ length: RUN_DAYS }, (_, i) => `d${i + 1} win`), "runs lost on d1..d10"],
        measures.map((m) => [m.hero, ...m.perDay.map((d) => pc(d.win, 0)), m.endDays.join(" ")])),
      "",
      `Every run's finish equals the run-code table at its own loss pattern (${measures.reduce((s, m) => s + m.ownPattern, 0)} differ). Why the model at the measured rate reads higher than the runs: a run's dusks are not independent draws. Each run's losses over all 10 dusks against a binomial at the same rate:`,
      "",
      ...mdTable(["hero", "mean losses of 10", "variance", "binomial variance", "variance / binomial", "runs with 5+ losses: measured / binomial", "6+ losses: measured / binomial", "runs with 0..10 losses"],
        measures.map((m) => {
          const q = m.losses10.mean / RUN_DAYS;
          const tail = (k: number) => [m.losses10.hist.slice(k).reduce((a, b) => a + b, 0) / m.runs, Array.from({ length: RUN_DAYS + 1 - k }, (_, i) => binom(RUN_DAYS, k + i, q)).reduce((a, b) => a + b, 0)];
          const [m5, b5] = tail(5), [m6, b6] = tail(6);
          return [m.hero, fmt(m.losses10.mean), fmt(m.losses10.variance), fmt(m.losses10.binomial), fmt(m.losses10.dispersion), `${pc(m5)} / ${pc(b5)}`, `${pc(m6)} / ${pc(b6)}`, m.losses10.hist.join(" ")];
        })),
      "",
      "A variance above the binomial's means some par decks stay weak (or strong) all run: the weak ones collect the losses that end runs, so fewer runs finish than independent fights at the same rate would give. The exact model is exact for a player whose every dusk is an independent p; the par runs are the field as it plays.",
      "",
      "Caveat: playerRun builds every deck on a win's income (+2 gold a day over a loss) and takes no road stop, so after a loss its deck is a little richer than the run's would be.",
    ],
  });
  return { rows, sections, meta: { seeds: o.seeds, checkSeeds: o.checkSeeds, exactSeconds, runSeconds, rules: R, policy: "typical" } };
}
