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
import { Battle, simulate } from "../src/sim/battle";
import { FRAY_BONUS, ITEMS, RUN_DAYS, WIND_START, type HeroId } from "../src/sim/content";
import { pct } from "../src/sim/pct";
import { canFitGear, cloneBuild, factoryPace, hitsOfRig, installedTurrets, joinCount, occupancy, routeInfo, setRot, type Build } from "../src/sim/deck";
import { bestRot } from "../src/sim/beltside"; // S1: a swapped rig turned as the bots turn one
import { starsOf, valueOf } from "../src/sim/stars";
import { parField, PAR_K } from "../src/sim/harness/par";
import { parRunSeed, playerRun, rateOn, type PlayerOpts } from "../src/sim/harness/player";
import { casualOpts, recordPick, type Grades } from "../src/sim/harness/casual";
import type { Job, Runner } from "../src/sim/harness/tournament";
import { buildCost, maxGoldByDay } from "../src/net/validate";
import { checkSnapshot, ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { eligible, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { standInPool } from "../src/sim/standInPool";
import { MATRIARCH_DAY, warlordPool, type RivalId } from "../src/sim/rivals";
import { forkFor, warlordDeck, warlordSeed } from "../src/game/road";
import { standInFoe } from "../src/game/ghosts";
import { battleSeed, newRun, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { serveJobs, workerRunner } from "./workers";
import { botLastChancePick } from "../src/sim/harness/lastChance"; // H1: the existing LAST CHANCE pick policy
import { lastChanceOffer, type Boon } from "../src/sim/lastChance";
import { openRunesRules } from "../src/sim/openRunes"; // OPEN-1 (REQ-BFG-109): the bots' LAST CHANCE card follows the switch
import { allOn } from "./loss1Switches";
import { HEARTS_RULE, HEARTS_START, heartCost as sharedHeartCost, heartsDusk, type HeartsRule } from "../src/sim/hearts"; // RETUNE-1: the shared rule
import { setGuard } from "../src/sim/guard"; // RETUNE-1 run 2: --guard (GUARD's content numbers in this process)
import { RUNES, type RuneDef } from "../src/sim/runes"; // RETUNE-1 run 2: --set rune.<id>=<n>

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

/** A pool file: the live route's entries ({ id, snapshot }), or (LOSS-1 run 2) a bare snapshot list as gen:ghosts writes it
 *  (samplePool.ts samplePoolJson: the built P2 pool, AZ-BUMP S8's regenerated pool) or { snapshot } entries, each id
 *  then the server's (ghostId, as server/seed.ts checkPool gives it). */
function loadPool(file: string): PoolEntry[] {
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown[];
  return raw.map((e) => {
    const o = e as { id?: string; snapshot?: unknown };
    const snapshot = checkSnapshot(o.snapshot ?? e);
    return { id: o.id ?? ghostId(snapshot), snapshot };
  });
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

// ---------------------------------------------------------------- the fight probe (LOSS-1 run 2: W1, W2, W3, S1, S2)

/**
 * One fight stepped as simulate() steps it (new Battle, step, clear the events), read as it goes: both max hulls, both
 * hulls at the first step at or past WIND_START and at the end, the end time, each side's wind taken and the wind that
 * landed in the last tick, and what each side's defence stopped: SHIELD (the whole hit it stopped, its damage after the
 * runes' hook, in hull units: x the fight's D on the hull release), IRON HIDE's cut (the same units), PLATE's soak
 * (plate.absorbed). `dmg` is each side's stats.damage (after the cut, SHIELD and D, before PLATE). The battle's code is
 * untouched: the probe wraps three of Battle's own methods (impact, runeHit, shieldHit) in this process only, with
 * identical results (the wrappers only read). Works on the 0.9.8 code too (the day argument is ignored there).
 */
export interface FightLog {
  winner: number; t: number; ticks: number; max: number[]; hpWind: number[] | null; hpEnd: number[];
  windTaken: number[]; windLast: number[]; windLastTick: boolean; dmg: number[]; shots: number[];
  shielded: number[]; cut: number[]; plate: number[]; blockedHits: number[]; dmgTenths: number;
  shieldSpent: number[]; shieldSmall: number[]; // RETUNE-1 run 2: SHIELDs spent, and spent on a small hit
}
/** RETUNE-1 run 2 (BRIEF-RETUNE1-R2 section 3): `hits`, each impact on a side (its total after the runes' hook, before D),
 *  and `shieldHits`, the ones a SHIELD stopped, so a fight's spent SHIELDs can be split by size (a "small" hit is under a
 *  quarter of that side's mean incoming hit in the fight). */
interface GuardTally { shielded: number[]; cut: number[]; hits: number[][]; shieldHits: number[][] }
let GUARD: GuardTally | null = null;
let hooked = false;
function hookBattle(): void {
  if (hooked) return;
  hooked = true;
  const P = Battle.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  const impact0 = P.impact, runeHit0 = P.runeHit, shieldHit0 = P.shieldHit;
  const pre: number[] = []; // the impact being resolved: its total after the runes' hook (what a SHIELD would stop)
  const stopped: boolean[] = []; // RETUNE-1 run 2: did a SHIELD stop the impact being resolved?
  type Side = { side: number; hull: { fray: number; frayMax: number }; rune?: { frayMul?: number; machineDmg?: number; fullFrayDmg?: number; hitCut?: number } };
  P.impact = function (this: { sides: Side[] }, pr: { from: number; share?: number; dmg: number }) {
    const atk = this.sides[pr.from], def = this.sides[pr.from === 0 ? 1 : 0];
    let bonus = pr.share !== undefined ? pct(def.hull.fray * FRAY_BONUS, 100 * pr.share) : def.hull.fray * FRAY_BONUS;
    if (atk.rune?.frayMul) bonus *= atk.rune.frayMul;
    pre.push(pr.dmg + bonus);
    stopped.push(false);
    try { return (impact0 as unknown as (p: unknown) => unknown).call(this, pr); } finally {
      const size = pre.pop()!, sh = stopped.pop()!;
      if (GUARD) { GUARD.hits[def.side].push(size); if (sh) GUARD.shieldHits[def.side].push(size); }
    }
  } as never;
  P.runeHit = function (this: unknown, atk: Side, def: Side, hit: { kind: string }, total: number) {
    const out = (runeHit0 as unknown as (...a: unknown[]) => number).call(this, atk, def, hit, total);
    const adds = (atk.rune?.machineDmg && hit.kind !== "hull" ? atk.rune.machineDmg : 0) + (atk.rune?.fullFrayDmg && def.hull.fray >= def.hull.frayMax ? atk.rune.fullFrayDmg : 0);
    if (GUARD && def.rune?.hitCut) GUARD.cut[def.side] += total + adds - out;
    if (pre.length) pre[pre.length - 1] = out;
    return out;
  } as never;
  P.shieldHit = function (this: unknown, def: Side) {
    if (GUARD && pre.length) GUARD.shielded[def.side] += pre[pre.length - 1];
    if (stopped.length) stopped[stopped.length - 1] = true;
    return (shieldHit0 as unknown as (d: unknown) => number).call(this, def);
  } as never;
}

/** RETUNE-1 run 2: the SHIELDs side i spent in a fight, and how many of them on a small hit (under a quarter of the mean
 *  hit coming in to side i in that fight). */
function shieldSplit(g: GuardTally, i: number): { spent: number; small: number } {
  const hs = g.hits[i], n = hs.length;
  if (!n) return { spent: 0, small: 0 };
  const mean = hs.reduce((s, x) => s + x, 0) / n;
  return { spent: g.shieldHits[i].length, small: g.shieldHits[i].filter((x) => x < mean / 4).length };
}

export function probeFight(a: Build, b: Build, seed: number, day: number): FightLog {
  hookBattle();
  const g: GuardTally = { shielded: [0, 0], cut: [0, 0], hits: [[], []], shieldHits: [[], []] };
  GUARD = g;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = new (Battle as any)(a, b, seed, undefined, day);
  const max = [bt.sides[0].hull.max, bt.sides[1].hull.max];
  let hpWind: number[] | null = null, lastWind = [0, 0], lastTick = -1;
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    for (const e of bt.events) if (e.type === "wind") { lastWind = e.dmgs ? [e.dmgs[0], e.dmgs[1]] : [e.dmg, e.dmg]; lastTick = bt.ticks; }
    bt.events.length = 0;
    if (!hpWind && bt.t >= WIND_START) hpWind = [bt.sides[0].hull.hp, bt.sides[1].hull.hp];
  }
  GUARD = null;
  const D = (bt.dmgTenths ?? 10) / 10;
  const two = (f: (i: number) => number) => [f(0), f(1)];
  return {
    winner: bt.winner ?? -2, t: r3(bt.t), ticks: bt.ticks, max, hpWind, hpEnd: two((i) => bt.sides[i].hull.hp),
    windTaken: two((i) => bt.sides[i].stats.windTaken), windLast: lastTick === bt.ticks ? lastWind : [0, 0], windLastTick: lastTick === bt.ticks,
    dmg: two((i) => bt.sides[i].stats.damage), shots: two((i) => bt.sides[i].stats.shots),
    shielded: two((i) => Math.round(g.shielded[i] * D)), cut: two((i) => Math.round(g.cut[i] * D)), plate: two((i) => bt.sides[i].plate?.absorbed ?? 0),
    blockedHits: two((i) => bt.sides[i].blocked ?? 0), dmgTenths: bt.dmgTenths ?? 10,
    shieldSpent: two((i) => shieldSplit(g, i).spent), shieldSmall: two((i) => shieldSplit(g, i).small),
  };
}

/** A probed fight from side `me`'s view: lost, ahead in percent when the wind began, the wind's last point, and the
 *  looser "wind-decided" test (fightBench's: dead, and its wind taken exceeds its overkill). */
export function fightView(f: FightLog, me: number): Record<string, unknown> {
  const foe = 1 - me;
  const pctAt = (hp: number[] | null, i: number) => (hp ? r3(hp[i] / f.max[i]) : null);
  const lost = f.winner === foe, dead = f.hpEnd[me] <= 0;
  return {
    lost, won: f.winner === me, draw: f.winner === -1, t: f.t, capped: f.hpEnd[0] > 0 && f.hpEnd[1] > 0,
    max: [f.max[me], f.max[foe]], windPct: [pctAt(f.hpWind, me), pctAt(f.hpWind, foe)], endPct: [pctAt(f.hpEnd, me), pctAt(f.hpEnd, foe)],
    windBegan: f.hpWind !== null, aheadAtWind: f.hpWind !== null && f.hpWind[me] / f.max[me] > f.hpWind[foe] / f.max[foe],
    aheadHpAtWind: f.hpWind !== null && f.hpWind[me] > f.hpWind[foe],
    windLast: dead && f.windLastTick && f.hpEnd[me] + f.windLast[me] > 0, windDecided: dead && f.windTaken[me] > -f.hpEnd[me],
    windTaken: [f.windTaken[me], f.windTaken[foe]],
    guard: { shielded: f.shielded[me], cut: f.cut[me], plate: f.plate[me], hits: f.blockedHits[me], incoming: f.dmg[foe] + f.shielded[me] + f.cut[me], foeShots: f.shots[foe], spent: f.shieldSpent?.[me] ?? 0, small: f.shieldSmall?.[me] ?? 0 },
  };
}

/** --mode wind --in decks.json --pool pool.json [--only tag] [--seeds 4] --json out.json [--all-on]: each deck against the
 *  seed ghosts of the best rank its bracket draws as a new player (D2; decks mode's seed draw), `seeds` x both sides, each
 *  fight probed (W1 on the 0.9.8 code, W2 with --all-on, W3 on windscratch; S2 reads the guard numbers). */
function modeWind(): unknown {
  const S = int("seeds", 4);
  const only = (flag("only") ?? "").split(",").filter(Boolean);
  const ins = (JSON.parse(readFileSync(flag("in")!, "utf8")) as DeckIn[]).filter((d) => !only.length || only.some((o) => d.tag.includes(o))).map((d) => ({ ...d, s: checkSnapshot(d.snapshot) }));
  const seedPool = loadPool(flag("pool")!).filter((e) => isSeed(e.snapshot));
  const out: unknown[] = [];
  const t0 = Date.now();
  ins.forEach((d, di) => {
    const s = d.s, day = s.day;
    const req: MatchRequest = { rules: s.rules, day, wins: s.wins, lives: s.lives, playerId: s.playerId, seen: [], runs: 0 };
    for (const e of bestRank(seedPool, req)) {
      for (let x = 0; x < S; x++) {
        const seed = hashSeed("loss1-ghost", day, di, e.id, x);
        out.push({ deck: d.id, tag: d.tag, hero: s.hero, day, rec: `${s.wins}W${s.lives}L`, foe: e.id, foeHero: e.snapshot.hero, foeVariant: e.snapshot.playerId.slice(-1), seed: x, side: 0, ...fightView(probeFight(s.build, e.snapshot.build, seed, day), 0) });
        out.push({ deck: d.id, tag: d.tag, hero: s.hero, day, rec: `${s.wins}W${s.lives}L`, foe: e.id, foeHero: e.snapshot.hero, foeVariant: e.snapshot.playerId.slice(-1), seed: x, side: 1, ...fightView(probeFight(e.snapshot.build, s.build, seed, day), 1) });
      }
    }
  });
  console.log(`wind: ${ins.length} decks, ${out.length} fights in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return out;
}

/** --mode standins --days 1-10 [--k 3] [--seeds 1] --json out.json [--all-on]: W3. Every par deck of the day (the four par
 *  fields, K members each) against every bundled stand-in pool entry of its day (FURNACE and WEAVER), `seeds` x both
 *  sides, each fight probed: the entry's result (its vsPar), the fight's length, whether the wind landed the last point
 *  or decided it (fightView), and whether the 120 s cap ended it. */
function modeStandins(): unknown {
  const S = int("seeds", 1), K = int("k", 3), days = range(flag("days") ?? "1-10");
  const out: unknown[] = [];
  const t0 = Date.now();
  for (const day of days) {
    const par = HEROES4.flatMap((h) => parField(h, day, K).map((b, m) => ({ h, m, b })));
    for (const sh of ["furnace", "weaver"] as HeroId[]) standInPool(sh, day).forEach((en, i) => {
      for (const { h, m, b } of par) for (let x = 0; x < S; x++) {
        const seed = hashSeed("loss1-standins", day, sh, i, h, m, x);
        for (const side of [0, 1]) {
          const f = side === 0 ? probeFight(en.build, b, seed, day) : probeFight(b, en.build, seed, day);
          const v = fightView(f, side) as { won: boolean; draw: boolean; lost: boolean; t: number; capped: boolean; windLast: boolean; windDecided: boolean };
          const pv = fightView(f, 1 - side) as { windLast: boolean; windDecided: boolean };
          out.push({ day, sh, i, h, m, side, pts: v.won ? 1 : v.draw ? 0.5 : 0, t: v.t, capped: v.capped, windLast: v.windLast || pv.windLast, windDecided: v.windDecided || pv.windDecided });
        }
      }
    });
    console.log(`standins: day ${day} done at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return out;
}

// ---------------------------------------------------------------- mode guard (LOSS-1 run 2: S1, S3)

/** S1: every item that gives SHIELD or PLATE, by its fields (content.ts: rig `plate`/`plated`, factory `plate`, gear
 *  `seam`, gear `shield`), and every such rune (runes.ts startPlate, halfPlate, pairPlate, plateOnHit, stampPlate,
 *  plateMul, startShield, shieldEvery, hitCut). The yardsticks: a damage piece of the same kind and price (WHETSTONE, the
 *  common 3 g rig, +20 damage, for PLATE ROLLER; OVERDRIVE for IRON WALL; CALIBRATION for the 5 g gear; STAMP PRESS for
 *  ARMOR PRESS). "none": the deck against itself (the control). */
export const GUARD_ITEMS = ["plateroller", "shieldwall", "armorpress", "seamwelder", "wardbell"];
export const GUARD_YARDSTICKS = ["whetstone", "overdrive", "calibrate", "press"];
export const GUARD_RUNES = ["rivet_hoard", "grave_plates", "last_wall", "seam_rivets", "scab_iron", "forge_ward", "bulwark_oath", "ward_stone", "bulwark_ward", "tick_guard", "iron_hide"];

/** S1: `b` with `def` at `stars` in place of its weakest piece of the same kind and size (a common one when it has one:
 *  the lowest valueOf, then uid), in its own slot: a rig on the same cell turned to work the most belt tiles (bestRot)
 *  and still working one; gear on the same turret (canFitGear); a factory on the same cells, feeding the same belts. A
 *  rune is added to its runes. The budget is not checked (the piece's effect is measured, not its price). null: none. */
export function swapIn(b: Build, def: string, stars: number): { build: Build; from: string } | null {
  if (def === "none") return { build: cloneBuild(b), from: "-" };
  const d = ITEMS[def];
  if (!d) { const nb = cloneBuild(b); nb.runes = [...(nb.runes ?? []), { id: def } as never]; return { build: nb, from: "+rune" }; }
  const own = (d.kind === "mod" ? b.mods : b.items).map((p) => ({ uid: p.uid, def: p.def, stars: starsOf(p) }));
  const same = own.filter((p) => p.def !== def && ITEMS[p.def]?.kind === d.kind && (ITEMS[p.def]?.size ?? 1) === (d.size ?? 1) && (ITEMS[p.def]?.price ?? 0) > 0);
  const common = same.filter((p) => ITEMS[p.def].rarity === "common");
  for (const p of (common.length ? common : same).sort((x, y) => valueOf(x.def, x.stars) - valueOf(y.def, y.stars) || x.uid - y.uid)) {
    const nb = cloneBuild(b);
    if (d.kind === "mod") {
      const m = nb.mods.find((x) => x.uid === p.uid)!;
      if (!canFitGear(nb, m.turret, def, m.uid).ok) continue;
      m.def = def;
      if (stars > 1) m.stars = stars; else delete m.stars;
    } else {
      const q = nb.items.find((x) => x.uid === p.uid)!;
      q.def = def;
      if (stars > 1) q.stars = stars; else delete q.stars;
      if (d.kind === "gate") {
        setRot(q, bestRot(nb, def, q.x, q.y).rot);
        if (!hitsOfRig(nb, q.uid).length) continue;
      }
    }
    return { build: nb, from: `${p.def}${p.stars > 1 ? `*${p.stars}` : ""}` };
  }
  return null;
}

/**
 * --mode guard --days 2,5,8 [--k 3] [--seeds 1] [--only def,..] --json out.json [--all-on]: S1. For each day, each piece
 * (GUARD_ITEMS and GUARD_YARDSTICKS at stars 1-3, GUARD_RUNES, "none") and each par deck of the day (the four par fields,
 * K members each): the deck with the piece swapped in (swapIn) against the same par deck, `seeds` x both sides, every fight
 * probed. Per piece and day: the win lift (the changed deck's points per fight - 0.5), the blocked share (SHIELD's
 * stopped hits + IRON HIDE's cut + PLATE's soak, over the damage coming in: the foe's damage + what SHIELD and the cut
 * stopped) of the changed deck, and the same share of the unchanged decks in those fights.
 */
function modeGuard(): unknown {
  const S = int("seeds", 1), K = int("k", 3), days = (flag("days") ?? "2,5,8").split(",").map(Number);
  const only = (flag("only") ?? "").split(",").filter(Boolean);
  const vars: { def: string; stars: number; kind: string }[] = [{ def: "none", stars: 1, kind: "control" }];
  for (const def of [...GUARD_ITEMS, ...GUARD_YARDSTICKS]) for (const st of [1, 2, 3]) vars.push({ def, stars: st, kind: GUARD_ITEMS.includes(def) ? "guard" : "yardstick" });
  for (const id of GUARD_RUNES) vars.push({ def: id, stars: 1, kind: "rune" });
  const out: unknown[] = [];
  const t0 = Date.now();
  for (const day of days) {
    const base = HEROES4.flatMap((h) => parField(h, day, K).map((b, m) => ({ h, m, b })));
    for (const v of vars) {
      if (only.length && !only.includes(v.def) && v.def !== "none") continue;
      let pts = 0, n = 0, decks = 0;
      const from: Record<string, number> = {};
      const mine = { shielded: 0, cut: 0, plate: 0, incoming: 0, hits: 0, foeShots: 0, spent: 0, small: 0 }, theirs = { ...mine };
      const add = (t: typeof mine, g: typeof mine) => { for (const k of Object.keys(t) as (keyof typeof mine)[]) t[k] += g[k]; };
      for (const { h, m, b } of base) {
        const sw = swapIn(b, v.def, v.stars);
        if (!sw) continue;
        decks++;
        from[sw.from] = (from[sw.from] ?? 0) + 1;
        for (let x = 0; x < S; x++) {
          const seed = hashSeed("loss1-guard", day, h, m, x); // the same seeds for every piece: paired
          for (const side of [0, 1]) {
            const f = side === 0 ? probeFight(sw.build, b, seed, day) : probeFight(b, sw.build, seed, day);
            const me = fightView(f, side) as { won: boolean; draw: boolean; guard: typeof mine };
            const them = fightView(f, 1 - side) as { guard: typeof mine };
            pts += me.won ? 1 : me.draw ? 0.5 : 0;
            n++;
            add(mine, me.guard);
            add(theirs, them.guard);
          }
        }
      }
      const share = (g: typeof mine) => (g.incoming ? r3((g.shielded + g.cut + g.plate) / g.incoming) : null);
      out.push({
        day, def: v.def, name: ITEMS[v.def]?.name ?? v.def, stars: v.stars, kind: v.kind, decks, fights: n, lift: n ? r3(pts / n - 0.5) : null,
        share: share(mine), parts: n ? { shield: r3(mine.shielded / mine.incoming), cut: r3(mine.cut / mine.incoming), plate: r3(mine.plate / mine.incoming), hits: r3(mine.hits / n), incoming: Math.round(mine.incoming / n), spent: r3(mine.spent / n), smallShare: mine.spent ? r3(mine.small / mine.spent) : null } : null,
        baseParts: n ? { shield: r3(theirs.shielded / theirs.incoming), plate: r3(theirs.plate / theirs.incoming), spent: r3(theirs.spent / n), smallShare: theirs.spent ? r3(theirs.small / theirs.spent) : null } : null,
        baseShare: share(theirs), from,
      });
    }
    console.log(`guard: day ${day} done at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  return out;
}

// ---------------------------------------------------------------- mode cands (LOSS-1 run 2, P2b)

/**
 * P2b (BRIEF-LOSS1-ADD2 C): the seed pool's day-d candidates graded against par: every stand-in pool entry of FURNACE and
 * WEAVER (standInPool(h, d), with its stored vsPar), every par field member of FOUNDRY and BASTION (parField(h, d): the
 * race decks' runs), and the --pool file's own seed ghosts of those days; each one's win rate against the four par fields
 * of its day (K members x seeds x both sides), as grade mode. A ghost's grade is par's loss rate against it (draws aside).
 *   --mode cands --days 1-2 --pool pool.json --json out.json [--seeds 2] [--k 12] [--workers 4] [--all-on]
 */
async function modeCands(run: Runner): Promise<unknown> {
  const S = int("seeds", 2), K = int("k", PAR_K), days = range(flag("days") ?? "1-2");
  const pool = flag("pool") ? loadPool(flag("pool")!).filter((e) => isSeed(e.snapshot) && days.includes(e.snapshot.day)) : [];
  const F = new Field();
  const plan: { kind: string; hero: HeroId; day: number; i: number; id: string; vsPar: number | null; jobs: number[] }[] = [];
  const grade = (key: string, b: Build, day: number, gi: number) => HEROES4.flatMap((h) => parField(h, day, K).map((p, m) => F.job(F.add(key, () => b), F.add(`par|${h}|${day}|${m}`, () => p), day, Array.from({ length: S }, (_, x) => hashSeed("loss1-cands", day, gi, h, m, x)))));
  let gi = 0;
  for (const day of days) {
    for (const h of ["furnace", "weaver"] as HeroId[]) standInPool(h, day).forEach((en, i) => plan.push({ kind: "standin", hero: h, day, i, id: `sip|${h}|${day}|${i}`, vsPar: en.vsPar, jobs: grade(`sip|${h}|${day}|${i}`, en.build, day, gi++) }));
    for (const h of ["foundry", "bastion"] as HeroId[]) parField(h, day, K).forEach((b, i) => plan.push({ kind: "field", hero: h, day, i, id: `fld|${h}|${day}|${i}`, vsPar: null, jobs: grade(`fld|${h}|${day}|${i}`, b, day, gi++) }));
  }
  for (const e of pool) plan.push({ kind: `pool:${e.snapshot.playerId}`, hero: e.snapshot.hero, day: e.snapshot.day, i: -1, id: e.id, vsPar: null, jobs: grade(`ghost|${e.id}`, e.snapshot.build, e.snapshot.day, gi++) });
  console.log(`cands: ${plan.length} decks (days ${days.join(",")}), ${F.jobs.length} pairings, seeds ${S}, k ${K}`);
  const pts = await run(F.decks, F.jobs);
  return plan.map((p) => ({ kind: p.kind, hero: p.hero, day: p.day, i: p.i, id: p.id, vsPar: p.vsPar, grade: r3(p.jobs.reduce((s, j) => s + rate(pts[j], S), 0) / p.jobs.length) }));
}

// ---------------------------------------------------------------- mode bench

/** H1 (REQ-BFG-096; BRIEF-LOSS1-ADD1 A.1): a run starts with 10 hearts. H3 (a proposal read only): --hearts-start n.
 *  RETUNE-1 (REQ-BFG-096): the game's rule now lives in src/sim/hearts.ts; this ledger takes its step (heartsDusk), so the
 *  bench and the game can't drift. The flags only change the rule's numbers (HeartsRule), never its shape. */
export const HEARTS_START_RULE = HEARTS_START;
const HEARTS_BENCH_RULE: HeartsRule = {
  start: flag("hearts-start") ? Number(flag("hearts-start")) : HEARTS_RULE.start,
  cost: (flag("hearts-cost") ? flag("hearts-cost")!.split(",").map(Number) : [...HEARTS_RULE.cost]) as unknown as HeartsRule["cost"],
};
/** H1: the hearts a lost dusk costs: 1 on days 1-3, 2 on days 4-6, 3 from day 7 (a road fight or a draw: none). H3:
 *  --hearts-cost a,b,c (days 1-3, 4-6, 7+). RETUNE-1: hearts.ts heartCost on the bench's rule. */
export const heartCost = (day: number): number => sharedHeartCost(day, HEARTS_BENCH_RULE);
/** H1: one dusk under the hearts rule (r: 0 win, 1 loss, -1 draw). LAST CHANCE fires once a run, at the first loss that
 *  would leave 1 heart or fewer: the player stays on 1 heart (and takes the card). As the game's LAST CHANCE, never on the
 *  last day (`lastDay`, RUN_DAYS; there is no dawn to play it). No day-3 refund (A.1 has none). RETUNE-1: hearts.ts
 *  heartsDusk, the game's own step. */
export function heartsLoss(hearts: number, day: number, r: number, used: boolean, lastDay: number = RUN_DAYS): { hearts: number; lastChance: boolean } {
  const s = heartsDusk(hearts, day, r === 0 ? "win" : r === 1 ? "loss" : "draw", used, { rule: HEARTS_BENCH_RULE, lastDay });
  return { hearts: s.hearts, lastChance: s.lastChance };
}

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
      // H1 (REQ-BFG-096; BRIEF-LOSS1-ADD1 C H1), --hearts only (absent: the ledgers above exactly as before): two more
      // ledgers a rule, both with the LAST CHANCE card (the existing pick policy: harness/lastChance.ts botLastChancePick on
      // lastChanceOffer, the deck replayed from the next dawn with it, as lastChanceBench does): `<rule>+card`, today's
      // lives (the game's ledger); `<rule>+hearts`, the hearts rule (heartsLoss)
      const heartsLedger = (kind: "card" | "hearts", rule: string): unknown => {
        // the matching reads today's lives (the pool's records are on the 5-life scale): a shadow of the game's ledger fed
        // the same results; under `card` it is the ledger itself
        const shadow = newRun(hero, runSeed, `loss1-${hero}-${seed}`);
        let decks = days, hearts = HEARTS_BENCH_RULE.start, wins = 0, lcDay = 0, reached = 0, over: null | "lost" | "complete" = null;
        let boon: string | null = null;
        const seen: string[] = [], res: number[] = [], foes: string[] = [], grade: (number | null)[] = [], recs: string[] = [];
        for (let day = 1; day <= RUN_DAYS && !over; day++) {
          const deck = decks[day - 1].build;
          recs.push(kind === "hearts" ? `${wins}W${hearts}H` : `${shadow.wins}W${shadow.lives}L`);
          const req: MatchRequest = { rules, day, wins, lives: Math.max(1, shadow.lives), playerId: "loss1-bench", seen, runs: 0 };
          const rng = new Rng(hashSeed("loss1-match", runSeed, day));
          const hit = fieldKind === "seed" ? (rule === "record" ? recordPick(pool, req, grades, rng) : pickGhost(pool, req, rng)) : null;
          let foe: Build, foeId: string;
          if (hit) { foe = hit.snapshot.build; foeId = hit.id; seen.push(hit.id); } else { const s = standInFoe(runSeed, day); foe = s.build; foeId = `captain:${s.id}`; }
          const r = fight(deck, foe, battleSeed({ seed: runSeed, day } as Run), day);
          res.push(r); foes.push(foeId); grade.push(grades.has(foeId) ? grades.get(foeId)! : null);
          if (r === 0) wins++;
          let fired = false;
          if (!shadow.over) {
            startDusk(shadow, []);
            const dr = finishDay(shadow, r === 0 ? 0 : r === 1 ? 1 : -1, 20, { ...ZERO }, { ...ZERO } as never);
            if (kind === "card" && dr.lastChance && !lcDay) { lcDay = day; fired = true; }
          }
          if (kind === "card") over = shadow.over === "lost" ? "lost" : shadow.over === "complete" || day >= RUN_DAYS ? "complete" : null;
          else {
            const h = heartsLoss(hearts, day, r, lcDay > 0);
            hearts = h.hearts;
            if (h.lastChance) { lcDay = day; fired = true; }
            over = hearts <= 0 ? "lost" : day >= RUN_DAYS ? "complete" : null;
          }
          reached = day;
          if (fired && day < RUN_DAYS) {
            const offer = lastChanceOffer(runSeed, day, hero, (deck.runes ?? []).map((q) => q.id), openRunesRules()); // OPEN-1: the switch
            boon = botLastChancePick(offer, hero, deck, day, { wins }).boon;
            decks = playerRun(hero, RUN_DAYS, seed, { ...opts, lastChance: { day, boon: boon as Boon } });
          }
        }
        return { res, foes, grade, recs, wins, reached, complete: over === "complete", endDay: over === "lost" ? reached : 0, lcDay, boon, hearts: kind === "hearts" ? hearts : shadow.lives };
      };
      if (has("hearts")) {
        for (const rule of ruleList) for (const kind of ["card", "hearts"] as const) ledgers[`${rule}+${kind}`] = heartsLedger(kind, rule);
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
    else if (mode === "cands") data = await modeCands(pool.run);
    else if (mode === "wind") data = modeWind();
    else if (mode === "guard") data = modeGuard();
    else if (mode === "standins") data = modeStandins();
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

/** S3 (a proposal read only, never committed to content): --set def.path=value,... changes ITEMS fields in this process
 *  before any battle (stars.ts effectAt caches a def's merged levels on first use), e.g. plateroller.gate.plate=15 or
 *  wardbell.levels.2.mod.shield.every=3. Each change is printed. */
function applySets(): void {
  for (const kv of (flag("set") ?? "").split(",").filter(Boolean)) {
    const [path, val] = kv.split("=");
    const keys = path.split(".");
    if (keys[0] === "rune") { // RETUNE-1 run 2: rune.<id>=<n>, a rune's amount (its def's amount object swapped, in this process)
      const d = RUNES[keys[1]] as RuneDef | undefined;
      if (!d) throw new Error(`--set ${path}: no rune ${keys[1]}`);
      const was = d.amount.n;
      (d as { amount: RuneDef["amount"] }).amount = { ...d.amount, n: Number(val) };
      if (isMainThread) console.log(`--set ${path}: ${was} -> ${val}`);
      continue;
    }
    let o = ITEMS as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
    const last = keys[keys.length - 1];
    const was = o[last];
    o[last] = Number(val);
    if (isMainThread) console.log(`--set ${path}: ${String(was)} -> ${val}`);
  }
}

const toolRun = !!process.argv[1]?.endsWith("loss1.js");
if (toolRun && has("all-on")) allOn(); // every thread (workers share argv) before any deck is built
if (toolRun && has("guard")) setGuard(true); // RETUNE-1 run 2: GUARD's numbers, before --set (which then edits the guarded defs)
if (toolRun && flag("set")) applySets();
if (toolRun && !isMainThread) serveJobs();
else if (toolRun) void main();
