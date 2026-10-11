// LOSS-1 (REQ-BFG-092): why the operator can't win, and the casual player (BRIEF-LOSS1 sections 3-5). Opt-in: no bench,
// test or other tool imports it, so every pin holds. It runs on this branch and, copied into a live098 export with the
// no-op kit-loss1/loss1Switches.off.ts over tools/loss1Switches.ts, on the 0.9.8 code; it uses only APIs both have.
// Modes (build: npx vite build --ssr tools/loss1.ts --outDir <dir>; run node <dir>/loss1.js ...):
//   --mode decks --in decks.json --pool pool.json --json out.json [--seeds 4] [--workers 4]
//       each uploaded deck: its numbers (value, stars, parts, turrets, plating, joins, factories at JOIN_PACE) and par's
//       same-day field's; its win rate against the par field of its hero and of all four heroes (12 members x seeds x
//       both sides; 4 seeds = 96 battles a field); against every Easy, Medium and Hard warlord of its day; against the
//       seed ghosts its bracket (day, wins, lives) draws as a new player (D2) and the ghosts it drew from at its upload
//       time as an experienced one; and against the bundled stand-in pool's entries of its day, with their vsPar.
//   --mode calib --policy par|casual:<tune> --heroes h,.. --k 12 --json out.json [--seeds 2] [--workers 4] [--all-on]
//       the policy's decks (seeds 1..k, days 1-10): their numbers and their win rate against the same-day par fields.
//   --mode grade --pool pool.json --json grades.json [--seeds 2] [--workers 4] [--all-on]
//       each seed-pool ghost's vsPar (win rate against the four par fields of its day): the record rule's grades.
//   --mode bench --policy par|casual:<tune> --heroes h,.. --seeds a-b --pool pool.json --json out.json
//       [--rule now|record] [--grades grades.json] [--field seed|captain] [--all-on]
//       whole runs: the policy's deck each dusk against the dusk foe (field seed: the live seed pool as a new player meets
//       it, matched by record as the server does (D1, nearest record), else the stand-in captain; field captain: the
//       stand-in captain, standInFoe), the game's ledger (newRun, finishDay: lives, the day-3 refund, LAST CHANCE: the life
//       only, no card), and the day's Easy, Medium and Hard warlords on the road (forkFor; lives never move).

import { isMainThread } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
import { Rng, hashSeed } from "../src/core/rng";
import { simulate } from "../src/sim/battle";
import { ITEMS, RUN_DAYS, type HeroId } from "../src/sim/content";
import { factoryPace, installedTurrets, joinCount, occupancy, routeInfo, type Build } from "../src/sim/deck";
import { parField, PAR_K } from "../src/sim/harness/par";
import { parRunSeed, playerRun, rateOn, type PlayerOpts } from "../src/sim/harness/player";
import { casualOpts, recordPick, type Grades } from "../src/sim/harness/casual";
import type { Job, Runner } from "../src/sim/harness/tournament";
import { buildCost, maxGoldByDay } from "../src/net/validate";
import { checkSnapshot, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { eligible, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { standInPool } from "../src/sim/standInPool";
import { MATRIARCH_DAY, warlordPool, type RivalId } from "../src/sim/rivals";
import { forkFor, warlordDeck, warlordSeed } from "../src/game/road";
import { standInFoe } from "../src/game/ghosts";
import { battleSeed, newRun, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { serveJobs, workerRunner } from "./workers";
import { allOn } from "./loss1Switches";

const HEROES4: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const TIERS = ["easy", "medium", "hard"] as const;
type Tier = (typeof TIERS)[number];
const ZERO = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const r3 = (x: number) => Math.round(x * 1000) / 1000;

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

/** The policy named on the command line: "par" (the typical policy) or "casual:<tune>" (casual.ts CASUAL_TUNES). */
function policyOpts(p: string): PlayerOpts {
  if (p === "par") return {};
  if (p.startsWith("casual")) return casualOpts(p.split(":")[1] || undefined);
  throw new Error(`--policy ${p}: par or casual:<tune>`);
}

// ---------------------------------------------------------------- deck numbers

export interface DeckNums {
  value: number; budget: number; spentPct: number; items: number; parts: number; starred: number; stars: number;
  turrets: number; turretDefs: string; gear: number; plating: number; crates: number; joins: number; factories: number;
  f70: number; runes: number; upgrades: number;
}

export function deckNums(b: Build, day: number): DeckNums {
  const cost = buildCost(b);
  const occ = occupancy(b);
  const facts = b.items.filter((p) => ITEMS[p.def]?.kind === "factory");
  const f70 = facts.filter((p) => factoryPace(b, p.uid, occ) < 1).length;
  const turrets = installedTurrets(b);
  const pieces: { stars?: number }[] = [...b.items.filter((p) => (ITEMS[p.def]?.price ?? 0) > 0), ...b.mods, ...turrets.map((t) => t.turret)];
  const starred = pieces.filter((p) => (p.stars ?? 1) >= 2).length;
  const stars = pieces.length ? pieces.reduce((s, p) => s + (p.stars ?? 1), 0) / pieces.length : 0;
  const up = b.upgrades ? Object.values(b.upgrades).reduce((s: number, v) => s + Math.max(0, Number(v) - 1), 0) : 0;
  const budget = maxGoldByDay(day);
  return {
    value: cost.total, budget, spentPct: r3(cost.total / budget), items: b.items.length,
    parts: pieces.length, starred, stars: r3(stars), turrets: turrets.length,
    turretDefs: turrets.map((t) => `${t.turret.def}${(t.turret.stars ?? 1) > 1 ? `*${t.turret.stars}` : ""}`).join("+"),
    gear: b.mods.length, plating: cost.plates, crates: cost.crates, joins: joinCount(b, occ), factories: facts.length, f70,
    runes: b.runes?.length ?? 0, upgrades: up,
  };
}

// ---------------------------------------------------------------- the battle field (decks + jobs for a Runner)

class Field {
  decks: Build[] = [];
  private at = new Map<string, number>();
  jobs: Job[] = [];
  add(key: string, b: () => Build): number {
    let i = this.at.get(key);
    if (i === undefined) {
      i = this.decks.length;
      this.decks.push(b());
      this.at.set(key, i);
    }
    return i;
  }
  /** One pairing, `seeds` from both sides; returns its job index. */
  job(a: number, b: number, day: number, seeds: number[]): number {
    this.jobs.push({ a, b, seeds, day });
    return this.jobs.length - 1;
  }
}

const rate = (pts: number, seeds: number) => pts / (2 * seeds);

function loadPool(file: string): PoolEntry[] {
  const raw = JSON.parse(readFileSync(file, "utf8")) as { id: string; snapshot: unknown }[];
  return raw.map((e) => ({ id: e.id, snapshot: checkSnapshot(e.snapshot) }));
}
const isSeed = (s: GhostSnapshot) => s.playerId.startsWith("sample-");

/** The best rank of eligible ghosts by |wins|, then |lives| (pickGhost's rank, before its draw). */
function bestRank(pool: readonly PoolEntry[], req: MatchRequest): PoolEntry[] {
  let best: PoolEntry[] = [];
  let bw = Infinity, bl = Infinity;
  for (const e of eligible(pool, req)) {
    const dw = Math.abs(e.snapshot.wins - req.wins), dl = Math.abs(e.snapshot.lives - req.lives);
    if (dw < bw || (dw === bw && dl < bl)) { best = [e]; bw = dw; bl = dl; } else if (dw === bw && dl === bl) best.push(e);
  }
  return best;
}

// ---------------------------------------------------------------- mode decks

interface DeckIn { id: string; tag: string; snapshot: unknown }

async function modeDecks(run: Runner): Promise<unknown> {
  const S = int("seeds", 4), SW = int("wseeds", 2), SF = int("fseeds", 4);
  const only = (flag("only") ?? "").split(",").filter(Boolean), SIPMAX = int("sipmax", 8);
  const ins = (JSON.parse(readFileSync(flag("in")!, "utf8")) as DeckIn[]).filter((d) => !only.length || only.some((o) => d.tag.includes(o))).map((d) => ({ ...d, s: checkSnapshot(d.snapshot) }));
  const pool = loadPool(flag("pool")!);
  const seedPool = pool.filter((e) => isSeed(e.snapshot));
  const F = new Field();
  const parNums = new Map<string, DeckNums[]>();
  const plan = ins.map((d, di) => {
    const { s } = d, day = s.day;
    const a = F.add(`deck|${d.id}`, () => s.build);
    const vsPar: Record<string, number[]> = {};
    const light = has("light"); // --light: the same hero's par field only (no warlords, ghosts or stand-ins)
    for (const h of light ? [s.hero] : HEROES4) {
      const field = parField(h, day);
      if (!parNums.has(`${h}|${day}`)) parNums.set(`${h}|${day}`, field.map((b) => deckNums(b, day)));
      vsPar[h] = field.map((b, m) => F.job(a, F.add(`par|${h}|${day}|${m}`, () => b), day, Array.from({ length: S }, (_, x) => hashSeed("loss1-vspar", day, di, h, m, x))));
    }
    if (light) return { d, vsPar, war: { easy: [], medium: [], hard: [] } as Record<Tier, { id: string; job: number }[]>, seedFoes: [] as { id: string; hero: HeroId; rec: string; best: boolean; job: number }[], allBest: [] as { id: string; who: string; rec: string; job: number }[], standIns: [] as { hero: HeroId; i: number; vsPar: number; job: number }[] };
    const war: Record<Tier, { id: string; job: number }[]> = { easy: [], medium: [], hard: [] };
    for (const t of TIERS) {
      const ids: RivalId[] = t === "hard" && day >= MATRIARCH_DAY ? ["matriarch" as RivalId] : warlordPool(t);
      war[t] = ids.map((id) => ({ id, job: F.job(a, F.add(`war|${id}|${day}`, () => warlordDeck(id, day)), day, Array.from({ length: SW }, (_, x) => hashSeed("loss1-war", day, di, id, x))) }));
    }
    const req: MatchRequest = { rules: s.rules, day, wins: s.wins, lives: s.lives, playerId: s.playerId, seen: [], runs: 0 };
    const elig = eligible(seedPool, req), best = new Set(bestRank(seedPool, req).map((e) => e.id));
    const seedFoes = elig.map((e) => ({ id: e.id, hero: e.snapshot.hero, rec: `${e.snapshot.wins}W${e.snapshot.lives}L`, best: best.has(e.id), job: F.job(a, F.add(`ghost|${e.id}`, () => e.snapshot.build), day, Array.from({ length: SF }, (_, x) => hashSeed("loss1-ghost", day, di, e.id, x))) }));
    // as an experienced player (runs >= 3) at its upload time: every ghost stored before it (seed pool + uploads)
    const before = pool.filter((e) => e.snapshot.day === day && (isSeed(e.snapshot) || e.snapshot.createdAt < s.createdAt));
    const allBest = bestRank(before, { ...req, runs: 3 }).map((e) => ({ id: e.id, who: isSeed(e.snapshot) ? "seed" : (e.snapshot.name ?? "?"), rec: `${e.snapshot.wins}W${e.snapshot.lives}L`, job: F.job(a, F.add(`ghost|${e.id}`, () => e.snapshot.build), day, Array.from({ length: SF }, (_, x) => hashSeed("loss1-ghost", day, di, e.id, x))) }));
    const standIns: { hero: HeroId; i: number; vsPar: number; job: number }[] = [];
    for (const h of ["furnace", "weaver"] as HeroId[]) {
      const ents = standInPool(h, day), step = Math.max(1, ents.length / SIPMAX); // at most SIPMAX entries, evenly spaced
      ents.forEach((en, i) => (Math.floor(i / step) !== Math.floor((i - 1) / step) || i === 0) && standIns.push({ hero: h, i, vsPar: en.vsPar, job: F.job(a, F.add(`sip|${h}|${day}|${i}`, () => en.build), day, Array.from({ length: SW }, (_, x) => hashSeed("loss1-sip", day, di, h, i, x))) }));
    }
    return { d, vsPar, war, seedFoes, allBest, standIns };
  });
  const battles = F.jobs.reduce((s, j) => s + 2 * j.seeds.length, 0);
  console.log(`decks: ${ins.length} decks, field ${F.decks.length} decks, ${F.jobs.length} pairings, ${battles} battles; seeds ${S} (par), ${SW} (warlords, stand-ins), ${SF} (ghosts); stand-in entries ${plan.reduce((s, p) => s + p.standIns.length, 0)}`);
  if (has("dry")) {
    const t1 = Date.now(), n = Math.min(40, F.jobs.length);
    for (let i = 0; i < n; i++) simulate(F.decks[F.jobs[i].a], F.decks[F.jobs[i].b], 7 + i, undefined, undefined, F.jobs[i].day);
    console.log(`dry: ${n} battles in ${Date.now() - t1} ms (${((Date.now() - t1) / n).toFixed(1)} ms each)`);
    return [];
  }
  const t0 = Date.now();
  const pts = await run(F.decks, F.jobs);
  console.log(`played in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
  return plan.map(({ d, vsPar, war, seedFoes, allBest, standIns }) => {
    const s = d.s, day = s.day;
    const vp: Record<string, number> = {};
    for (const h of HEROES4) vp[h] = vsPar[h] ? r3(mean(vsPar[h].map((j) => rate(pts[j], S)))) : NaN;
    const parSame = parNums.get(`${s.hero}|${day}`)!;
    const avg = (k: keyof DeckNums) => r3(mean(parSame.map((n) => Number(n[k]))));
    const w: Record<string, unknown> = {};
    for (const t of TIERS) w[t] = { rate: r3(mean(war[t].map((x) => rate(pts[x.job], SW)))), each: Object.fromEntries(war[t].map((x) => [x.id, r3(rate(pts[x.job], SW))])) };
    const sf = seedFoes.map((x) => ({ id: x.id, hero: x.hero, rec: x.rec, best: x.best, rate: r3(rate(pts[x.job], SF)) }));
    return {
      id: d.id, tag: d.tag, name: s.name ?? null, playerId: s.playerId, runId: s.runId, hero: s.hero, day, wins: s.wins, lives: s.lives,
      lastChance: s.lastChance ?? null, createdAt: new Date(s.createdAt).toISOString(),
      nums: deckNums(s.build, day),
      par: { value: avg("value"), spentPct: avg("spentPct"), items: avg("items"), parts: avg("parts"), starred: avg("starred"), stars: avg("stars"), turrets: avg("turrets"), gear: avg("gear"), plating: avg("plating"), crates: avg("crates"), joins: avg("joins"), factories: avg("factories"), f70: avg("f70"), runes: avg("runes"), upgrades: avg("upgrades") },
      vsParSame: vp[s.hero], vsParAll: r3(mean(HEROES4.map((h) => vp[h]))), vsPar: vp,
      warlords: w,
      seedDraw: { best: r3(mean(sf.filter((x) => x.best).map((x) => x.rate))), eligible: r3(mean(sf.map((x) => x.rate))), foes: sf },
      allDraw: { rate: r3(mean(allBest.map((x) => rate(pts[x.job], SF)))), foes: allBest.map((x) => ({ id: x.id, who: x.who, rec: x.rec, rate: r3(rate(pts[x.job], SF)) })) },
      standIn: { rate: r3(mean(standIns.map((x) => rate(pts[x.job], SW)))), vsPar: r3(mean(standIns.map((x) => x.vsPar))), n: standIns.length },
    };
  });
}

// ---------------------------------------------------------------- mode inspect (no battles)

/** A deck in words: its parts with stars and cells, its belts (factory, tiles, joined, the turret they reach), its gear,
 *  the bots' own rating (rateOn) and how many rigs sit beside a connected belt. */
function describe(b: Build, day: number): Record<string, unknown> {
  const occ = occupancy(b);
  const routes = b.routes.map((r, i) => {
    const info = routeInfo(b, i);
    const f = b.items.find((p) => p.uid === r.factory);
    return `${f?.def ?? "?"}: ${r.cells.length} tiles${r.join !== undefined ? " JOIN" : ""}${info.connected ? ` -> turret ${info.turret}` : " UNCONNECTED"}`;
  });
  const items = b.items.map((p) => `${p.def}${(p.stars ?? 1) > 1 ? `*${p.stars}` : ""}@${p.x},${p.y}`);
  const mods = b.mods.map((m) => `${m.def}${(m.stars ?? 1) > 1 ? `*${m.stars}` : ""}>t${m.turret}`);
  const turrets = installedTurrets(b).map((t) => `${t.turret.def}${(t.turret.stars ?? 1) > 1 ? `*${t.turret.stars}` : ""}#${t.turret.slot}`);
  return { rating: r3(rateOn(b, day)), items, routes, mods, turrets, hull: b.hullBonus, beltCap: b.beltCap, runes: (b.runes ?? []).map((r) => r.id), upgrades: b.upgrades ?? {}, joins: joinCount(b, occ) };
}

function modeInspect(): unknown {
  const only = (flag("only") ?? "").split(",").filter(Boolean);
  const ins = (JSON.parse(readFileSync(flag("in")!, "utf8")) as DeckIn[]).filter((d) => !only.length || only.some((o) => d.tag.includes(o))).map((d) => ({ ...d, s: checkSnapshot(d.snapshot) }));
  return ins.map((d) => {
    const day = d.s.day, field = parField(d.s.hero, day);
    const ratings = field.map((b) => rateOn(b, day)).sort((a, b) => a - b);
    const med = field.map((b) => ({ b, r: rateOn(b, day) })).sort((a, b) => a.r - b.r)[Math.floor((field.length - 1) / 2)].b;
    return { id: d.id, tag: d.tag, hero: d.s.hero, day, rec: `${d.s.wins}W${d.s.lives}L`, lastChance: d.s.lastChance ?? null, deck: describe(d.s.build, day), parRatings: ratings.map(r3), parMedian: describe(med, day) };
  });
}

// ---------------------------------------------------------------- mode calib

async function modeCalib(run: Runner): Promise<unknown> {
  const S = int("seeds", 2), K = int("k", PAR_K), KP = int("kpar", PAR_K), D = int("days", RUN_DAYS), pol = flag("policy") ?? "par";
  const heroes = (flag("heroes") ?? HEROES4.join(",")).split(",") as HeroId[];
  const opts = policyOpts(pol);
  const F = new Field();
  const plan: { hero: HeroId; seed: number; day: number; nums: DeckNums; rerolls: number; jobs: number[] }[] = [];
  const t0 = Date.now();
  for (const hero of heroes) {
    for (let seed = 1; seed <= K; seed++) {
      const days = playerRun(hero, RUN_DAYS, seed, opts).slice(0, D);
      days.forEach((pd, i) => {
        const day = i + 1;
        const a = F.add(`deck|${hero}|${seed}|${day}`, () => pd.build);
        const jobs = parField(hero, day, KP).map((b, m) => F.job(a, F.add(`par|${hero}|${day}|${m}`, () => b), day, Array.from({ length: S }, (_, x) => hashSeed("loss1-calib", day, hero, seed, m, x))));
        plan.push({ hero, seed, day, nums: deckNums(pd.build, day), rerolls: pd.rerolls, jobs });
      });
    }
  }
  console.log(`calib ${pol}: ${plan.length} decks built in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${F.jobs.length} pairings, seeds ${S}`);
  const pts = await run(F.decks, F.jobs);
  return plan.map((p) => ({ hero: p.hero, seed: p.seed, day: p.day, rerolls: p.rerolls, nums: p.nums, vsParSame: r3(p.jobs.reduce((s, j) => s + rate(pts[j], S), 0) / p.jobs.length) }));
}

// ---------------------------------------------------------------- mode grade

async function modeGrade(run: Runner): Promise<unknown> {
  const S = int("seeds", 2), K = int("k", PAR_K);
  const seeds = loadPool(flag("pool")!).filter((e) => isSeed(e.snapshot));
  const F = new Field();
  const plan = seeds.map((e, gi) => {
    const day = e.snapshot.day, a = F.add(`ghost|${e.id}`, () => e.snapshot.build);
    const jobs = HEROES4.flatMap((h) => parField(h, day, K).map((b, m) => F.job(a, F.add(`par|${h}|${day}|${m}`, () => b), day, Array.from({ length: S }, (_, x) => hashSeed("loss1-grade", day, gi, h, m, x)))));
    return { e, jobs };
  });
  console.log(`grade: ${plan.length} seed ghosts, ${F.jobs.length} pairings, seeds ${S}`);
  const pts = await run(F.decks, F.jobs);
  return plan.map(({ e, jobs }) => ({ id: e.id, hero: e.snapshot.hero, day: e.snapshot.day, wins: e.snapshot.wins, lives: e.snapshot.lives, playerId: e.snapshot.playerId, vsPar: r3(jobs.reduce((s, j) => s + rate(pts[j], S), 0) / jobs.length) }));
}

// ---------------------------------------------------------------- mode bench

function fight(a: Build, b: Build, seed: number, day: number): 0 | 1 | -1 {
  const w = simulate(a, b, seed, undefined, undefined, day).winner;
  return w === 0 ? 0 : w === 1 ? 1 : -1;
}

function modeBench(): unknown {
  const pol = flag("policy") ?? "par", fieldKind = flag("field") ?? "seed";
  const ruleList = (flag("rule") ?? "now").split(","); // --rule now,record: both on the same decks
  const heroes = (flag("heroes") ?? HEROES4.join(",")).split(",") as HeroId[];
  const seeds = range(flag("seeds") ?? "1-96");
  const roadSeeds = int("road-seeds", 9999); // road fights only for seeds up to this
  const opts = policyOpts(pol);
  let pool = fieldKind === "seed" ? loadPool(flag("pool")!).filter((e) => isSeed(e.snapshot)) : [];
  // --casual-floor <tune>: proposal P2, the seed pool's floor ghosts (variant 2: no wins, the fewest lives) carry the casual
  // player's deck of their hero and day (casual.ts casualRun on seed 9001, outside every bench's seeds) instead of a
  // stand-in pool or par deck; their records unchanged, so today's matching sends a losing record to them
  const cf = flag("casual-floor");
  if (cf) {
    const decks = new Map<HeroId, Build[]>();
    pool = pool.map((e) => {
      if (!e.snapshot.playerId.endsWith("-2")) return e;
      const h = e.snapshot.hero;
      if (!decks.has(h)) decks.set(h, playerRun(h, RUN_DAYS, 9001, casualOpts(cf)).map((d) => d.build));
      return { id: e.id, snapshot: { ...e.snapshot, build: decks.get(h)![e.snapshot.day - 1] } };
    });
  }
  const gj = flag("grades") ? JSON.parse(readFileSync(flag("grades")!, "utf8")) : null; // grade mode's file ({ data }) or a bare list
  const grades: Grades = new Map(gj ? ((gj.data ?? gj) as { id: string; vsPar: number }[]).map((g) => [g.id, g.vsPar]) : []);
  if (ruleList.includes("record") && !grades.size) throw new Error("--rule record needs --grades");
  const rules = pool[0]?.snapshot.rules ?? "";
  const out: unknown[] = [];
  const t0 = Date.now();
  for (const hero of heroes) {
    for (const seed of seeds) {
      const days = playerRun(hero, RUN_DAYS, seed, opts);
      const runSeed = parRunSeed(hero, seed);
      const ledgers: Record<string, unknown> = {};
      const road: Record<Tier, number[]> = { easy: [], medium: [], hard: [] };
      for (const rule of ruleList) {
        const run = newRun(hero, runSeed, `loss1-${hero}-${seed}`);
        const seen: string[] = [];
        const res: number[] = [], foes: string[] = [], grade: (number | null)[] = [], recs: string[] = [];
        let lcDay = 0, reached = 0;
        for (let day = 1; day <= RUN_DAYS && !run.over; day++) {
          const deck = days[day - 1].build;
          recs.push(`${run.wins}W${run.lives}L`);
          let foe: Build, foeId: string;
          const hit = fieldKind === "seed" ? (() => {
            const req: MatchRequest = { rules, day, wins: run.wins, lives: Math.max(1, run.lives), playerId: "loss1-bench", seen, runs: 0 };
            const rng = new Rng(hashSeed("loss1-match", runSeed, day));
            return rule === "record" ? recordPick(pool, req, grades, rng) : pickGhost(pool, req, rng);
          })() : null;
          if (hit) {
            foe = hit.snapshot.build;
            foeId = hit.id;
            seen.push(hit.id);
          } else {
            const s = standInFoe(runSeed, day);
            foe = s.build;
            foeId = `captain:${s.id}`;
          }
          const r = fight(deck, foe, battleSeed({ seed: runSeed, day } as Run), day);
          res.push(r);
          foes.push(foeId);
          grade.push(grades.has(foeId) ? grades.get(foeId)! : null);
          if (rule === ruleList[0] && seed <= roadSeeds) {
            const fork = forkFor({ seed: runSeed, day } as Run);
            for (const t of TIERS) road[t].push(fight(deck, warlordDeck(fork.warlords[t], day), warlordSeed({ seed: runSeed, day } as Run), day));
          }
          startDusk(run, []);
          const dr = finishDay(run, r === 0 ? 0 : r === 1 ? 1 : -1, 20, { ...ZERO }, { ...ZERO } as never);
          if (dr.lastChance && !lcDay) lcDay = day;
          reached = day;
        }
        ledgers[rule] = {
          res, foes, grade, recs, wins: res.filter((r) => r === 0).length, reached,
          complete: run.over === "complete" || (reached === RUN_DAYS && run.lives > 0), endDay: run.over === "lost" ? reached : 0, lcDay,
        };
      }
      out.push({ hero, seed, ledgers, road, value: days.map((d) => d.value), budget: days.map((d) => d.budget) });
    }
    console.log(`bench ${pol} ${ruleList.join("+")} ${fieldKind}: ${hero} done at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  const mode = flag("mode") ?? "";
  const label = has("all-on") ? `${allOn()}` : "switches as built";
  const started = new Date().toISOString();
  const nw = Math.min(4, int("workers", 4)); // LOSS-1's house rule: at most 4 workers
  const pool = workerRunner(mode === "bench" ? 1 : nw, import.meta.url);
  let data: unknown;
  try {
    if (mode === "decks") data = await modeDecks(pool.run);
    else if (mode === "calib") data = await modeCalib(pool.run);
    else if (mode === "grade") data = await modeGrade(pool.run);
    else if (mode === "bench") data = modeBench();
    else if (mode === "inspect") data = modeInspect();
    else throw new Error("--mode decks | calib | grade | bench");
  } finally {
    await pool.close();
  }
  const jf = flag("json");
  if (jf) writeFileSync(jf, JSON.stringify({ mode, args: argv, switches: label, started, finished: new Date().toISOString(), data }, null, 1) + "\n");
  console.log(`${mode} done (${label}) -> ${jf}`);
}

const toolRun = !!process.argv[1]?.endsWith("loss1.js");
if (toolRun && has("all-on")) allOn(); // every thread (workers share argv) before any deck is built
if (toolRun && !isMainThread) serveJobs();
else if (toolRun) void main();
