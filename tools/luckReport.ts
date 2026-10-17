// LUCK-062 (REQ-BFG-033 acceptance 3; REQ-BFG-023 parts 1-2): the luck report and the family table.
//
// The operator's rule: "No one should be able to assemble 'the perfect deck' except if the stars align." This tool
// measures how often a caravan-bound buyer completes each synergy family's full set by day 10 (target: at most 10%).
// - Buyable module: every module the caravan can offer, read from the merchants' stock (content.ts itemsSoldBy over
//   every merchant, as run.ts rollShop draws it): rigs (kind "gate"), factories, cores, mods and turrets; no supplies
//   and no hero signature modules.
// - Family: a synergy tag in a module's `tags` (content.ts), read from the data. Members: the buyable modules with it.
// - Full set: at the end of day 10 the buyer owns at least one copy of every member, at any star, placed or in cargo.
// - Two caravan-bound buyers per hero, both on the game's own run and caravan code and the par player's gold model
//   (player.ts: newRun, then each dusk day.ts finishDay with a win's income; road stops are left out, so no road income):
//   - TYPICAL: the par player unchanged (player.ts playerRun, the typical policy); what it owns after each day.
//   - CHASER (an upper bound), one run per family: each dawn it buys every offered member it doesn't own yet, cheapest
//     first, while gold allows (run.ts buyOffer, into cargo). With no missing member on offer it rerolls (run.ts reroll,
//     2 g each) while its gold covers the reroll plus the cheapest missing member's price. It buys nothing else, sells
//     nothing and skips the fights (a win's income, as the par player). One clarification of the brief's rule: it never
//     rerolls for a member the caravan can't offer that day (a legendary before day 4, the ARCANE DEALER's stock on
//     days 1-2; see `offerable`), which only keeps its gold, so it stays an upper bound. --literal drops that.
// - Both buyers of (hero, seed) play the par player's run seed (player.ts startRun), so they meet the same first caravan.
//
// Run (as tools/parBench.ts, without a package.json script):
//   npx vite build --ssr tools/luckReport.ts --outDir tools/dist/luckreport --emptyOutDir --logLevel warn
//   node tools/dist/luckreport/luckReport.js [--runs 2000] [--seed 1] [--heroes furnace,weaver] [--json path]
//     [--md path] [--workers N] [--whatif 1000] [--literal] [--no-typical] [--wave3]
// 0.8.0 P1: --wave3 measures with wave 3 on (content.ts's switch, WAVE3_LIVE): the family table reads the v2 tags of the
// 86 modules, and the caravan offers wave 3. Every job carries the flag, so each worker thread turns its own switch on.
// 0.8.0 I1 (oracle 64485b535a06683c): the `wave3` option has three states: true on, false off, absent the live game
// (WAVE3_LIVE, on since I1 M2). The CLI sets it only with --wave3; without the flag it measures the live game.
// Seeds are seed..seed+runs-1. Runs fan out to worker threads; results are keyed by job, so the output never depends
// on --workers, and the same seeds give the same output (the run time is printed apart from it).
// --whatif N (default 1000; 0: off): for each flagged family, estimates of fixes on the first hero's N runs, never
// applied to the game: each single-member change (rarity one step up, or the ARCANE DEALER as merchant), applied in
// memory for its own runs only (withPatch), and a daily reroll cap of 4 or 2 on the CHASER.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { hashSeed } from "../src/core/rng";
import {
  HEROES, ITEMS, MERCHANTS, RARITIES, REROLL_COST, RUN_DAYS, itemsSoldBy, setWave3, wave3Live, withWave3,
  type HeroId, type ItemKind, type MerchantId, type ModuleTag, type Rarity,
} from "../src/sim/content";
import { turretList } from "../src/sim/deck";
import { buyOffer, newRun, reroll, type Run } from "../src/game/run";
import { unlocked } from "../src/game/wares"; // 0.8.0 I1 M3: the per-run draw
import { finishDay } from "../src/game/day";
import type { SideStats } from "../src/sim/battle";
import { FIGHT_T } from "../src/sim/deckRating";
import { playerRun } from "../src/sim/harness/player";
import { wilson, type Rate } from "../src/sim/harness/stats";

// ---------------------------------------------------------------- the family table

export type Kind = "rig" | "factory" | "core" | "mod" | "turret";
export const KINDS: readonly Kind[] = ["rig", "factory", "core", "mod", "turret"];
const KIND_OF: Partial<Record<ItemKind, Kind>> = { gate: "rig", converter: "rig", factory: "factory", core: "core", mod: "mod", turret: "turret" }; // GATES-1 (REQ-BFG-052): a GATE (GATES on only) is reported with the rigs

/** A buyable module's kind as the report names it (a rig is code kind "gate"). */
export const kindOf = (def: string): Kind => {
  const k = KIND_OF[ITEMS[def].kind];
  if (!k) throw new Error(`luck report: ${def} is not a module kind`);
  return k;
};

/** Every module the caravan can offer: the stock of every merchant (content.ts itemsSoldBy, the pool run.ts rollShop
 *  draws from), without supplies and hero signature modules (each hero's own factory), in ITEMS order. */
export function buyableDefs(): string[] {
  const signature = new Set(Object.values(HEROES).map((h) => h.factory));
  const sold = new Set((Object.keys(MERCHANTS) as MerchantId[]).flatMap((m) => itemsSoldBy(m).map((d) => d.id)));
  return Object.keys(ITEMS).filter((id) => sold.has(id) && !signature.has(id) && KIND_OF[ITEMS[id].kind] !== undefined);
}

export interface FamilyRow {
  tag: ModuleTag;
  members: string[]; // buyable modules carrying the tag, in ITEMS order
  kinds: Kind[]; // kinds covered, in KINDS order
  flag: string | null; // fewer than 5 members or fewer than 2 kinds
}

export interface FamilyTable {
  buyable: string[];
  families: FamilyRow[]; // most members first (ties: the order the tags first appear in ITEMS)
  generalists: string[]; // buyable modules with no tag
}

/** The family table, read from content.ts: every tag on any module, its buyable members and the kinds they cover. */
export function familyTable(): FamilyTable {
  const buyable = buyableDefs();
  const tags: ModuleTag[] = [];
  for (const d of Object.values(ITEMS)) for (const t of d.tags ?? []) if (!tags.includes(t)) tags.push(t);
  const families = tags.map((tag): FamilyRow => {
    const members = buyable.filter((id) => (ITEMS[id].tags ?? []).includes(tag));
    const kinds = KINDS.filter((k) => members.some((m) => kindOf(m) === k));
    const why = [
      members.length < 5 ? `${members.length} member${members.length === 1 ? "" : "s"} (< 5)` : "",
      kinds.length < 2 ? `${kinds.length} kind${kinds.length === 1 ? "" : "s"} (< 2)` : "",
    ].filter(Boolean).join(", ");
    return { tag, members, kinds, flag: why || null };
  });
  families.sort((a, b) => b.members.length - a.members.length); // stable: ties keep the tags' first-met order
  const generalists = buyable.filter((id) => !(ITEMS[id].tags ?? []).length);
  return { buyable, families, generalists };
}

// ---------------------------------------------------------------- the two buyers

const SIDE0: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** The run seed the par player plays for (hero, seed) (player.ts startRun). */
export const runSeed = (hero: HeroId, seed: number): number => hashSeed("par-player-run", hero, seed);

/** Dusk won, next dawn: the par player's gold model (player.ts nextDawn: finishDay with a win's income; no road). */
function nextDawn(run: Run): void {
  finishDay(run, 0, FIGHT_T, { ...SIDE0 }, { ...SIDE0 });
}

/** Every def the run holds a copy of, at any star: cargo, the deck's machinery, gear and cores, and the turrets. */
export function ownedDefs(run: Run): Set<string> {
  const s = new Set<string>();
  for (const i of run.inventory) s.add(i.def);
  for (const p of run.build.items) s.add(p.def);
  for (const m of run.build.mods) s.add(m.def);
  for (const t of turretList(run.build)) s.add(t.def);
  return s;
}

/** Whether the caravan can offer `def` on `day` at all: run.ts's day gates, legendaries from day 4 (dayPool) and the
 *  ARCANE DEALER from day 3 (baseMerchantWeight is 0 on days 1-2). tests/luckReport.test.ts pins both on real caravans. */
export function offerable(def: string, day: number): boolean {
  const d = ITEMS[def];
  return (d.rarity !== "legendary" || day >= 4) && (d.merchant !== "arcane" || day >= 3);
}

/** One entry of the CHASER's daily ledger: gold before and after each dawn, purchase and reroll. */
export interface ChaserStep {
  day: number;
  act: "dawn" | "buy" | "reroll";
  roll: number; // the caravan's reroll count before the act
  before: number; // gold before
  after: number; // gold after
  def?: string; // a purchase: the offer bought (its wagon, slot and price)
  wagon?: number;
  slot?: number;
  price?: number;
}

export interface ChaserOut {
  owned: number; // members owned at the end of day 10
  day: number | null; // the day the set completed (null: not by day 10)
  rerolls: number;
  memberGold: number; // gold spent on members
  gold: number; // gold left at the end of day 10
  seen: number[]; // per member: caravans (dawn or reroll) the chaser met while the member was missing
  shown: number[]; // ... of those, the caravans offering it
  ever: number[]; // per member: 1 when some caravan offered it while it was missing
  missing: number[]; // per member: 1 when still missing at the end of day 10
}

export interface ChaserOpts {
  ledger?: ChaserStep[]; // every step, in order
  observe?: (run: Run, step: ChaserStep) => void; // called just before each purchase and reroll (tests)
  end?: (run: Run) => void; // called with the run at the end of day 10 (tests)
  literal?: boolean; // the brief's reroll rule read literally: reroll for missing members the caravan can't offer today
  cap?: number; // what-if only: at most this many rerolls a day (a daily reroll cap); absent: none, as in the game
  // D1 (tools/wave3.ts, the per-run draw), both optional and absent everywhere else, so every run above is unchanged:
  start?: (run: Run) => void; // called once with the fresh run right after newRun (a draw reads the live run's day)
  offerable?: (def: string, day: number) => boolean; // the reroll gate instead of `offerable` (a draw narrows it)
}

/**
 * The CHASER's run of (hero, seed) for one family: the game's newRun, each dawn's caravan (rollShop through newRun,
 * finishDay and reroll), buyOffer for each purchase and finishDay's win income each dusk. Throws if the game ever
 * charges other than the offer price or the reroll cost.
 */
export function chaserRun(hero: HeroId, members: readonly string[], seed: number, opts: ChaserOpts = {}): ChaserOut {
  const run = newRun(hero, runSeed(hero, seed), `luck-${hero}-${seed}`);
  opts.start?.(run);
  const seen = members.map(() => 0), shown = members.map(() => 0), ever = members.map(() => 0);
  let rerolls = 0, memberGold = 0, done: number | null = null;
  const missing = (): string[] => {
    const o = ownedDefs(run);
    return members.filter((m) => !o.has(m));
  };
  const look = (): void => {
    const o = ownedDefs(run);
    const on = new Set(run.shop.wagons.flatMap((w) => w.offers.filter((x) => !x.sold).map((x) => x.def)));
    members.forEach((m, i) => {
      if (o.has(m)) return;
      seen[i]++;
      if (on.has(m)) {
        shown[i]++;
        ever[i] = 1;
      }
    });
  };
  for (let d = 1; d <= RUN_DAYS; d++) {
    const before = run.gold;
    if (d > 1) nextDawn(run);
    if (run.day !== d) throw new Error(`luck chaser: expected day ${d}, the run is on day ${run.day}`);
    opts.ledger?.push({ day: d, act: "dawn", roll: run.shop.rerolls, before, after: run.gold });
    look();
    for (let guard = 0; guard < 10000; guard++) {
      const miss = missing();
      if (!miss.length) break;
      // every offered member it doesn't own yet, cheapest first (ties: wagon, then slot), while gold allows
      const offers: { wagon: number; slot: number; def: string; price: number }[] = [];
      run.shop.wagons.forEach((w, wagon) => w.offers.forEach((o, slot) => {
        if (!o.sold && miss.includes(o.def)) offers.push({ wagon, slot, def: o.def, price: o.price });
      }));
      offers.sort((a, b) => a.price - b.price || a.wagon - b.wagon || a.slot - b.slot);
      let beyond = false;
      for (const o of offers) {
        if (!missing().includes(o.def)) continue; // the same part from another wagon, bought a moment ago
        if (run.gold < o.price) {
          beyond = true; // offers are sorted by price: none after it is affordable either
          break;
        }
        const s: ChaserStep = { day: d, act: "buy", roll: run.shop.rerolls, before: run.gold, after: run.gold - o.price, ...o };
        opts.observe?.(run, s);
        const r = buyOffer(run, o.wagon, o.slot);
        if (!r.ok) throw new Error(`luck chaser: buyOffer ${o.def} failed: ${r.reason}`);
        if (run.gold !== s.after) throw new Error(`luck chaser: ${o.def} cost ${s.before - run.gold}, offered at ${o.price}`);
        memberGold += o.price;
        opts.ledger?.push(s);
      }
      if (beyond) break; // a missing member is on offer beyond the purse: no reroll, the gold waits
      const left = missing();
      if (!left.length) break;
      // 0.8.0 I1 M3: under the per-run draw a member the run's wares don't hold (or hold for a later day) can't be
      // offered today, so the CHASER rerolls only for one it can meet (it stays an upper bound, as D1's chaseOne had it)
      const gate = opts.offerable ?? (run.wares ? (m: string, day: number) => offerable(m, day) && unlocked(run, m, day) : offerable);
      const findable = opts.literal ? left : left.filter((m) => gate(m, d));
      if (!findable.length) break;
      const cheapest = Math.min(...findable.map((m) => ITEMS[m].price));
      if (run.gold < REROLL_COST + cheapest) break;
      if (opts.cap !== undefined && run.shop.rerolls >= opts.cap) break;
      const s: ChaserStep = { day: d, act: "reroll", roll: run.shop.rerolls, before: run.gold, after: run.gold - REROLL_COST };
      opts.observe?.(run, s);
      if (!reroll(run)) throw new Error("luck chaser: reroll refused");
      if (run.gold !== s.after) throw new Error(`luck chaser: a reroll cost ${s.before - run.gold}, not ${REROLL_COST}`);
      rerolls++;
      opts.ledger?.push(s);
      look();
    }
    if (done === null && !missing().length) done = d;
  }
  opts.end?.(run);
  const o = ownedDefs(run);
  return {
    owned: members.filter((m) => o.has(m)).length, day: done, rerolls, memberGold, gold: run.gold,
    seen, shown, ever, missing: members.map((m) => (o.has(m) ? 0 : 1)),
  };
}

export interface TypicalOut {
  owned: number[]; // per family (table order): members owned at the end of day 10
  day: (number | null)[]; // per family: the day from which it owns the full set through day 10 (null: not at day 10)
}

/** What the par player (unchanged: playerRun, the typical policy) owns at the end of each day, read from its live run
 *  (onDecide hands it over; a traced run plays exactly as the cached one). */
export function typicalOwned(hero: HeroId, seed: number): Set<string>[] {
  const box: { run?: Run; last: number } = { last: 0 };
  const byDay: Set<string>[] = [];
  playerRun(hero, RUN_DAYS, seed, {
    onDecide: (run) => {
      // the first look of a dawn: what the run owns is what it owned at the end of the day before (finishDay and the
      // dawn's free edits move parts, never buy or sell)
      if (run.day !== box.last) {
        if (box.last) byDay[box.last - 1] = ownedDefs(run);
        box.last = run.day;
      }
      box.run = run;
    },
  });
  if (!box.run || box.last !== RUN_DAYS) throw new Error(`luck typical: ${hero} seed ${seed} stopped on day ${box.last}`);
  byDay[RUN_DAYS - 1] = ownedDefs(box.run);
  for (let d = 0; d < RUN_DAYS; d++) if (!byDay[d]) throw new Error(`luck typical: ${hero} seed ${seed} has no day ${d + 1}`);
  return byDay;
}

export function typicalRun(hero: HeroId, seed: number, families: readonly FamilyRow[]): TypicalOut {
  const byDay = typicalOwned(hero, seed);
  const owned: number[] = [], day: (number | null)[] = [];
  for (const f of families) {
    const full = byDay.map((s) => f.members.every((m) => s.has(m)));
    owned.push(f.members.filter((m) => byDay[RUN_DAYS - 1].has(m)).length);
    let from: number | null = null;
    for (let d = RUN_DAYS - 1; d >= 0 && full[d]; d--) from = d + 1;
    day.push(from);
  }
  return { owned, day };
}

// ---------------------------------------------------------------- jobs (in process or on worker threads)

/** A what-if content change of one member, applied in memory for one job and undone after it (never to the game). */
export interface Patch {
  def: string;
  rarity?: Rarity;
  merchant?: MerchantId;
}

/** Run `fn` with `p` applied to ITEMS in this process only, then restore the def exactly. */
export function withPatch<T>(p: Patch | undefined, fn: () => T): T {
  if (!p) return fn();
  const d = ITEMS[p.def], old = { rarity: d.rarity, merchant: d.merchant };
  try {
    if (p.rarity) d.rarity = p.rarity;
    if (p.merchant) d.merchant = p.merchant;
    return fn();
  } finally {
    d.rarity = old.rarity;
    d.merchant = old.merchant;
  }
}

export interface Job {
  id: number;
  kind: "typical" | "chaser";
  hero: HeroId;
  seeds: number[];
  family?: number; // chaser: the family's index in the table
  literal?: boolean;
  patch?: Patch; // what-if: a member's rarity or merchant
  cap?: number; // what-if: a daily reroll cap
  // 0.8.0 P1: the job runs with wave 3 on (content.ts withWave3; a worker thread has its own copy of the switch).
  // 0.8.0 I1 (oracle 64485b535a06683c): present only when the report's `wave3` is set, and then on or off; absent: the
  // job reads the switch as it finds it (in a worker thread, the live game's WAVE3_LIVE).
  wave3?: boolean;
}

/** One job, as a worker thread runs it (exported for tests: a job's own switch must hold where the switch starts live). */
export function runJob(job: Job): TypicalOut[] | ChaserOut[] {
  const go = (): TypicalOut[] | ChaserOut[] => {
    const fams = familyTable().families;
    if (job.kind === "typical") return job.seeds.map((s) => typicalRun(job.hero, s, fams));
    const f = fams[job.family!];
    return withPatch(job.patch, () => job.seeds.map((s) => chaserRun(job.hero, f.members, s, { literal: job.literal, cap: job.cap })));
  };
  return job.wave3 !== undefined ? withWave3(go, job.wave3) : go();
}

/** Worker side: run each job posted and post its results back. */
function serve(): void {
  parentPort!.on("message", (job: Job) => parentPort!.postMessage({ id: job.id, out: runJob(job) }));
}

/** Run `jobs` on `n` worker threads (1: in process), fed on demand; results by job id. */
async function runJobs(jobs: Job[], n: number, script?: string): Promise<(TypicalOut[] | ChaserOut[])[]> {
  if (n <= 1 || !script || jobs.length <= 1) return jobs.map(runJob);
  process.env.LUCK_REPORT_WORKER = "1"; // a worker thread copies the environment when it starts
  const workers = Array.from({ length: Math.min(n, jobs.length) }, () => new Worker(new URL(script)));
  try {
    return await new Promise<(TypicalOut[] | ChaserOut[])[]>((done, fail) => {
      const out = new Array<TypicalOut[] | ChaserOut[]>(jobs.length);
      let next = 0, pending = jobs.length;
      const feed = (w: Worker) => {
        if (next < jobs.length) w.postMessage(jobs[next++]);
      };
      for (const w of workers) {
        w.on("error", fail);
        w.on("message", (m: { id: number; out: TypicalOut[] | ChaserOut[] }) => {
          out[m.id] = m.out;
          if (--pending === 0) done(out);
          else feed(w);
        });
        feed(w);
      }
    });
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

// ---------------------------------------------------------------- the report

export interface MemberLuck {
  def: string;
  offerRate: number; // caravans offering it / caravans met while it was missing (all runs)
  everShown: number; // share of runs in which some caravan offered it while it was missing
  missingAtEnd: number; // share of runs still missing it at the end of day 10
}

export interface FamilyLuck {
  tag: ModuleTag;
  size: number;
  typical: { rate: Rate; medianOwned: number; medianDay: number | null } | null;
  chaser: { rate: Rate; medianOwned: number; medianDay: number | null; meanRerolls: number; meanMemberGold: number; members: MemberLuck[] };
  flagged: boolean; // CHASER full-set rate above the target
}

export interface HeroLuck {
  hero: HeroId;
  families: FamilyLuck[];
}

export interface LuckOpts {
  runs: number;
  seed: number;
  heroes: HeroId[];
  workers?: number;
  script?: string; // the worker script (the built bundle); absent: in process
  literal?: boolean;
  typical?: boolean; // default true
  families?: ModuleTag[]; // only these families' CHASER (tests); default every family
  whatif?: number; // runs per what-if of each flagged family (first hero, seeds seed..); 0 or absent: none
  // 0.8.0 P1: measure with wave 3 on (content.ts WAVE3_LIVE's switch), in this process and every job. 0.8.0 I1 (oracle
  // 64485b535a06683c): three states, true on, false off, absent the live game (the switch untouched, no job carries it)
  wave3?: boolean;
}

/** What-ifs for one flagged family, never applied to the game: each single-member change (its rarity one step up, or
 *  its merchant the ARCANE DEALER), applied in memory for its own runs; and a daily reroll cap on the CHASER. */
export interface WhatIfRow {
  tag: ModuleTag;
  base: Rate; // the family's CHASER rate on the what-if seeds, nothing changed
  changes: { change: string; patch: Patch; rate: Rate }[]; // lowest rate first
  caps: { cap: number; rate: Rate }[];
}

export interface WhatIf {
  hero: HeroId;
  runs: number;
  seeds: [number, number];
  rows: WhatIfRow[];
}

export interface LuckResult {
  runs: number;
  seed: number;
  seeds: [number, number];
  heroes: HeroId[];
  literal: boolean;
  target: number;
  table: FamilyTable;
  luck: HeroLuck[];
  whatif?: WhatIf;
}

export const WHATIF_CAPS: readonly number[] = [4, 2];

/** The single-member changes tried for a family: each member's rarity one step up, and each member not already sold
 *  by the ARCANE DEALER moved to it (the rarest merchant: absent on days 1-2, half weight on days 3-4). */
function memberChanges(members: readonly string[]): { change: string; patch: Patch }[] {
  const out: { change: string; patch: Patch }[] = [];
  for (const m of members) {
    const d = ITEMS[m], up = RARITIES[RARITIES.indexOf(d.rarity) + 1];
    if (up) out.push({ change: `${d.name} ${d.rarity} to ${up}`, patch: { def: m, rarity: up } });
    if (d.merchant !== "arcane") out.push({ change: `${d.name} ${MERCHANTS[d.merchant!].name} to ARCANE DEALER`, patch: { def: m, merchant: "arcane" } });
  }
  return out;
}

async function whatIfs(o: LuckOpts, table: FamilyTable, tags: ModuleTag[]): Promise<WhatIf> {
  const hero = o.heroes[0], runs = o.whatif!;
  const seeds = Array.from({ length: runs }, (_, i) => o.seed + i);
  const jobs: Job[] = [];
  const index: { row: number; what: "base" | "change" | "cap"; k: number }[] = [];
  const plan = tags.map((tag) => {
    const family = table.families.findIndex((f) => f.tag === tag);
    return { tag, family, changes: memberChanges(table.families[family].members) };
  });
  plan.forEach((p, row) => {
    const add = (what: "base" | "change" | "cap", k: number, extra: Partial<Job>) => {
      for (const s of chunks(seeds, 250)) {
        jobs.push({ id: jobs.length, kind: "chaser", hero, seeds: s, family: p.family, ...(o.literal ? { literal: true } : {}), ...(o.wave3 !== undefined ? { wave3: o.wave3 } : {}), ...extra });
        index.push({ row, what, k });
      }
    };
    add("base", 0, {});
    p.changes.forEach((c, k) => add("change", k, { patch: c.patch }));
    WHATIF_CAPS.forEach((cap, k) => add("cap", k, { cap }));
  });
  const outs = await runJobs(jobs, o.workers ?? 1, o.script);
  const rateOf = (row: number, what: string, k: number): Rate => {
    const ch = outs.filter((_, j) => index[j].row === row && index[j].what === what && index[j].k === k).flat() as ChaserOut[];
    return wilson(ch.filter((c) => c.day !== null).length, ch.length);
  };
  const rows = plan.map((p, row): WhatIfRow => ({
    tag: p.tag,
    base: rateOf(row, "base", 0),
    changes: p.changes.map((c, k) => ({ ...c, rate: rateOf(row, "change", k) })).sort((a, b) => a.rate.p - b.rate.p || a.change.localeCompare(b.change)),
    caps: WHATIF_CAPS.map((cap, k) => ({ cap, rate: rateOf(row, "cap", k) })),
  }));
  return { hero, runs, seeds: [seeds[0], seeds[seeds.length - 1]], rows };
}

export const TARGET = 0.1;

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

const chunks = (seeds: number[], size: number): number[][] => {
  const out: number[][] = [];
  for (let i = 0; i < seeds.length; i += size) out.push(seeds.slice(i, i + size));
  return out;
};

/** The whole report's numbers. Deterministic: the same options give the same result, whatever `workers`. 0.8.0 P1:
 *  with `wave3`, the family table and every job read the catalogue with wave 3 on; the switch is put back after.
 *  0.8.0 I1 (oracle 64485b535a06683c): `wave3: false` reads it with wave 3 off the same way; absent, the live game. */
export async function luckReport(o: LuckOpts): Promise<LuckResult> {
  const was = wave3Live();
  if (o.wave3 !== undefined) setWave3(o.wave3);
  try {
    return await luckReportNow(o);
  } finally {
    setWave3(was);
  }
}

async function luckReportNow(o: LuckOpts): Promise<LuckResult> {
  const table = familyTable();
  const seeds = Array.from({ length: o.runs }, (_, i) => o.seed + i);
  const typical = o.typical ?? true;
  const fams = table.families.map((f, i) => ({ f, i })).filter(({ f }) => f.members.length && (!o.families || o.families.includes(f.tag)));
  const jobs: Job[] = [];
  const index: { hero: HeroId; kind: "typical" | "chaser"; family?: number }[] = [];
  // the slow par player first, so its jobs start early; chasers are cheap
  const w3 = o.wave3 !== undefined ? { wave3: o.wave3 } : {}; // 0.8.0 I1: a job carries the switch only when it is set
  if (typical) for (const hero of o.heroes) for (const s of chunks(seeds, 4)) {
    jobs.push({ id: jobs.length, kind: "typical", hero, seeds: s, ...w3 });
    index.push({ hero, kind: "typical" });
  }
  for (const hero of o.heroes) for (const { i } of fams) for (const s of chunks(seeds, 200)) {
    jobs.push({ id: jobs.length, kind: "chaser", hero, seeds: s, family: i, ...(o.literal ? { literal: true } : {}), ...w3 });
    index.push({ hero, kind: "chaser", family: i });
  }
  const outs = await runJobs(jobs, o.workers ?? 1, o.script);
  const luck: HeroLuck[] = o.heroes.map((hero) => {
    const typ = typical ? outs.filter((_, j) => index[j].hero === hero && index[j].kind === "typical").flat() as TypicalOut[] : [];
    return {
      hero,
      families: fams.map(({ f, i }): FamilyLuck => {
        const ch = outs.filter((_, j) => index[j].hero === hero && index[j].kind === "chaser" && index[j].family === i).flat() as ChaserOut[];
        const n = ch.length;
        const days = ch.map((c) => c.day).filter((d): d is number => d !== null);
        const rate = wilson(days.length, n);
        const members = f.members.map((def, m): MemberLuck => {
          const seen = ch.reduce((s, c) => s + c.seen[m], 0), shown = ch.reduce((s, c) => s + c.shown[m], 0);
          return {
            def, offerRate: seen ? shown / seen : 0,
            everShown: ch.reduce((s, c) => s + c.ever[m], 0) / n,
            missingAtEnd: ch.reduce((s, c) => s + c.missing[m], 0) / n,
          };
        });
        const tDays = typ.map((t) => t.day[i]).filter((d): d is number => d !== null);
        return {
          tag: f.tag, size: f.members.length,
          typical: typical ? { rate: wilson(tDays.length, typ.length), medianOwned: median(typ.map((t) => t.owned[i])), medianDay: tDays.length ? median(tDays) : null } : null,
          chaser: {
            rate, medianOwned: median(ch.map((c) => c.owned)), medianDay: days.length ? median(days) : null,
            meanRerolls: ch.reduce((s, c) => s + c.rerolls, 0) / n, meanMemberGold: ch.reduce((s, c) => s + c.memberGold, 0) / n, members,
          },
          flagged: rate.p > TARGET,
        };
      }),
    };
  });
  const flagged = [...new Set(luck.flatMap((h) => h.families.filter((f) => f.flagged).map((f) => f.tag)))];
  const whatif = o.whatif && flagged.length ? await whatIfs(o, table, flagged) : undefined;
  return {
    runs: o.runs, seed: o.seed, seeds: [o.seed, o.seed + o.runs - 1], heroes: o.heroes, literal: !!o.literal, target: TARGET, table, luck,
    ...(whatif ? { whatif } : {}),
  };
}

const pc = (x: number, dp = 1): string => `${(100 * x).toFixed(dp)}%`;
const rateCI = (r: Rate): string => `${pc(r.p)} [${pc(r.lo)}-${pc(r.hi)}]`;
const nameOf = (def: string): string => ITEMS[def].name;
const fmtMed = (x: number | null): string => (x === null || Number.isNaN(x) ? "-" : Number.isInteger(x) ? String(x) : x.toFixed(1));
const cap = (h: string): string => h.toUpperCase();

/** The verdict line of one hero. */
export function verdictLine(h: HeroLuck): string {
  const over = h.families.filter((f) => f.flagged);
  return `${cap(h.hero)}: CHASER full-set rate at most 10% for every family: ${over.length ? `NO (${over.map((f) => `${f.tag} ${pc(f.chaser.rate.p)}`).join(", ")})` : "YES"}`;
}

/** The REQ-BFG-023 line. */
export function familyLine(t: FamilyTable): string {
  const ok = t.families.filter((f) => !f.flag);
  return `families with at least 5 members across at least 2 kinds: ${ok.length} of ${t.families.length}` +
    `${t.families.length - ok.length ? ` (short: ${t.families.filter((f) => f.flag).map((f) => `${f.tag}, ${f.flag}`).join("; ")})` : ""}` +
    `; generalists: ${t.generalists.length ? t.generalists.map(nameOf).join(", ") : "none"}`;
}

/** The report's tables as markdown (deterministic: no run time in it). */
export function renderMarkdown(r: LuckResult): string {
  const L: string[] = [];
  L.push("## Verdicts", "");
  for (const h of r.luck) L.push(`- ${verdictLine(h)}`);
  L.push(`- REQ-BFG-023: ${familyLine(r.table)}`, "");
  L.push(`Runs: ${r.runs} seeded runs per hero and buyer (per family for the CHASER), seeds ${r.seeds[0]}..${r.seeds[1]}; ` +
    `heroes ${r.heroes.map(cap).join(", ")}; rates with 95% Wilson intervals; a family is flagged when its CHASER rate is above ${pc(r.target, 0)}` +
    `${r.literal ? "; CHASER reroll rule read literally (--literal)" : ""}.`, "");
  L.push("## Family table", "");
  L.push("| family | members | kinds covered | members (kind) | flag |", "|---|---:|---|---|---|");
  for (const f of r.table.families) {
    L.push(`| ${f.tag} | ${f.members.length} | ${f.kinds.join(", ")} | ${f.members.map((m) => `${nameOf(m)} (${kindOf(m)})`).join(", ")} | ${f.flag ? `FLAG: ${f.flag}` : ""} |`);
  }
  const plural = (k: Kind): string => (k === "factory" ? "factories" : `${k}s`);
  L.push("", `Buyable modules: ${r.table.buyable.length} (${KINDS.map((k) => `${r.table.buyable.filter((d) => kindOf(d) === k).length} ${plural(k)}`).join(", ")}).`);
  L.push(`Generalists (buyable, no tag): ${r.table.generalists.length}: ${r.table.generalists.map((d) => `${nameOf(d)} (${kindOf(d)})`).join(", ")}.`, "");
  for (const h of r.luck) {
    L.push(`## Luck table: ${cap(h.hero)}`, "");
    L.push("| family | size | TYPICAL full set [95% CI] | TYPICAL median owned | CHASER full set [95% CI] | CHASER median owned | CHASER median day | CHASER rerolls (mean) | flag |",
      "|---|---:|---|---:|---|---:|---:|---:|---|");
    for (const f of h.families) {
      const t = f.typical;
      L.push(`| ${f.tag} | ${f.size} | ${t ? rateCI(t.rate) : "-"} | ${t ? `${fmtMed(t.medianOwned)}/${f.size}` : "-"} | ${rateCI(f.chaser.rate)} | ` +
        `${fmtMed(f.chaser.medianOwned)}/${f.size} | ${fmtMed(f.chaser.medianDay)} | ${f.chaser.meanRerolls.toFixed(1)} | ${f.flagged ? "FLAG: above 10%" : f.chaser.rate.hi > r.target ? "ok (CI reaches 10%)" : ""} |`);
    }
    L.push("");
  }
  const flagged = [...new Set(r.luck.flatMap((h) => h.families.filter((f) => f.flagged).map((f) => f.tag)))];
  if (flagged.length) {
    L.push("## Flagged families: bottleneck members", "");
    L.push("Per member, over every hero's CHASER runs of the family: the share of caravans (dawn or reroll) offering it while it was missing, " +
      "the share of runs in which some caravan offered it while missing, and the share of runs still missing it at the end of day 10. " +
      "The bottlenecks are the members offered least.", "");
    for (const tag of flagged) {
      const rows = r.luck.map((h) => h.families.find((f) => f.tag === tag)!);
      const mem = rows[0].chaser.members.map((m, i) => ({
        def: m.def,
        offerRate: rows.reduce((s, f) => s + f.chaser.members[i].offerRate, 0) / rows.length,
        everShown: rows.reduce((s, f) => s + f.chaser.members[i].everShown, 0) / rows.length,
        missingAtEnd: rows.reduce((s, f) => s + f.chaser.members[i].missingAtEnd, 0) / rows.length,
      })).sort((a, b) => a.offerRate - b.offerRate || a.def.localeCompare(b.def));
      L.push(`### ${tag} (CHASER ${r.luck.map((h, i) => `${cap(h.hero)} ${pc(rows[i].chaser.rate.p)}`).join(", ")})`, "");
      L.push("| member | kind | rarity | merchant | price | offered per caravan while missing | ever offered while missing | missing at day 10 |", "|---|---|---|---|---:|---:|---:|---:|");
      for (const m of mem) {
        const d = ITEMS[m.def];
        L.push(`| ${d.name} | ${kindOf(m.def)} | ${d.rarity} | ${MERCHANTS[d.merchant!].name} | ${d.price} | ${pc(m.offerRate)} | ${pc(m.everShown)} | ${pc(m.missingAtEnd)} |`);
      }
      L.push("", `Bottleneck: ${mem.slice(0, Math.min(2, mem.length)).map((m) => nameOf(m.def)).join(" and ")}.`, "");
      const w = r.whatif?.rows.find((x) => x.tag === tag);
      if (w && r.whatif) {
        const best = w.changes.slice(0, 3).map((c) => `${c.change}: ${rateCI(c.rate)}`).join("; ");
        L.push(`What-if (estimates only, nothing applied to the game; ${cap(r.whatif.hero)}, seeds ${r.whatif.seeds[0]}..${r.whatif.seeds[1]}): ` +
          `unchanged ${rateCI(w.base)}. Best single member changes: ${best || "none possible"}. ` +
          `A daily reroll cap: ${w.caps.map((c) => `${c.cap} a day ${rateCI(c.rate)}`).join(", ")}.`, "");
      }
    }
  }
  return L.join("\n");
}

// ---------------------------------------------------------------- the CLI

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function intArg(name: string, dflt: number): number {
  const v = arg(name);
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a whole number, got ${v}`);
  return n;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const runs = intArg("runs", 2000), seed = intArg("seed", 1);
  if (runs < 1) throw new Error("--runs must be at least 1");
  const heroes = (arg("heroes") ?? "furnace,weaver").split(",").filter(Boolean) as HeroId[];
  for (const h of heroes) if (!HEROES[h]) throw new Error(`--heroes: unknown hero ${h}`);
  const workers = intArg("workers", Math.max(1, availableParallelism() - 2));
  const r = await luckReport({
    runs, seed, heroes, workers, script: import.meta.url, whatif: intArg("whatif", 1000),
    literal: process.argv.includes("--literal"), typical: !process.argv.includes("--no-typical"),
    // 0.8.0 P1: --wave3 measures with wave 3 on. 0.8.0 I1 (oracle 64485b535a06683c): without the flag the field stays
    // absent, so the report measures the live game (false would turn wave 3 off for every CLI run)
    ...(process.argv.includes("--wave3") ? { wave3: true } : {}),
  });
  const md = renderMarkdown(r);
  const secs = (performance.now() - t0) / 1000;
  const time = `Run time: ${secs.toFixed(0)} s on ${workers} worker thread(s).`;
  console.log(md);
  console.log(time);
  const json = arg("json"), mdOut = arg("md");
  if (json) {
    mkdirSync(dirname(resolve(json)), { recursive: true });
    writeFileSync(resolve(json), JSON.stringify(r, null, 1));
  }
  if (mdOut) {
    mkdirSync(dirname(resolve(mdOut)), { recursive: true });
    writeFileSync(resolve(mdOut), `${md}\n${time}\n`);
  }
}

// the entry comes last, so every module-level constant above is initialised first. A worker thread of this tool serves
// jobs; the built script runs main(); an import (tests) does neither.
if (!isMainThread && process.env.LUCK_REPORT_WORKER === "1") serve();
else if (isMainThread && /luckReport\.(js|mjs)$/.test(process.argv[1] ?? "")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
