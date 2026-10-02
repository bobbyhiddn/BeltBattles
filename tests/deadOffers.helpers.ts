// 0.8.0 H1 M4 (REQ-BFG-021, ref/BRIEF-v080-H1.md section 5.3): the dead-offer audit's machinery (not a test file). For
// a hero's reference deck on a day (heroRefBuild), every buyable module is bought in, the way a player would use it,
// and the two decks fight the same foe on the same seed; the audit compares the battle's metrics. A module is inert on
// that deck when no sensible place for it changes any metric. The places, in the order tried:
//  - a copy the deck already holds at the same stars: the purchase merges into it, as the game does (the one place);
//  - a rig: beside each connected belt tile with a live arrow on it (the editor's spot), belt by belt, from the
//    factory end;
//  - a factory: its own belt into a free turret intake (the harness's path search); with none free, a belt that joins
//    a connected belt (0.6.2j); with neither, in place of the deck's last bought factory, else of the signature (which
//    stays owned, idle);
//  - a turret: each fed gun's slot whose belts it keeps (a copy of the gun there merges into it);
//  - gear and a core: each fed gun (a core replaces a bought core; gear takes a free gear slot, or where no fed gun
//    has one, replaces a gun's last gear);
//  - a part whose effect needs an armed foe (a shock or a mark to answer, a round to stop) fights the existing
//    sharedPool.effects.test.ts scenarios with the same proof that the part acted.
// Metrics: damage dealt, shots, the payload sum, the first shot, Burn dealt, the foe's hull, Fray and stalled
// machines, stall time, slugs made, jams, fusions (FOUNDRY), plating gained and spent (BASTION), and own hull lost.

import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { spotForTile } from "../src/sim/beltside";
import { HEROES, ITEMS, type HeroId, type ItemDef } from "../src/sim/content";
import {
  arrowCell, cloneBuild, commitRoute, deadEndsAt, footprint, installTurret, key, kx, ky, occupancy, rigHits, routeInfo,
  setTurretList, turretList, turretSlots, type Build, type Dir,
} from "../src/sim/deck";
import { Rng } from "../src/core/rng";
import { blockedCells, freeConnectors, randomPath, shortestTiles, startCells } from "../src/sim/harness/path";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";
import { starsOf } from "../src/sim/stars";
import { gainInto, previewMerge } from "../src/sim/harness/merge";
import type { GainAt } from "../src/game/fuse";

export const SEED = 20210924;
export const SECONDS = 18;
export const LONG = 32;
export const SEEDS = [SEED, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const UID = 9901;

/** Where the audited module went. */
export type Place =
  | { k: "rig"; route: number; tile: number }
  | { k: "intake"; col: number; tiles: number }
  | { k: "join"; route: number; tile: number; tiles: number }
  | { k: "swap"; replaced: string }
  | { k: "slot"; slot: number; merged: boolean }
  | { k: "gear" | "core"; turret: number; merged: boolean; replaced?: string }
  | { k: "merge"; where: string; toStars: number }
  | { k: "none"; why: string };

/** Every way to stand a rig beside a connected belt with a live arrow on it: each belt, each tile from the factory end
 *  (the editor's spot for that tile). */
function rigCandidates(before: Build, id: string): { after: Build; place: Place }[] {
  const out: { after: Build; place: Place }[] = [];
  for (let ri = 0; ri < before.routes.length; ri++) {
    if (!routeInfo(before, ri).connected) continue;
    for (let ti = 0; ti < before.routes[ri].cells.length; ti++) {
      const spot = spotForTile(before, id, ri, ti);
      if (!spot) continue;
      const b = cloneBuild(before);
      b.items.push({ uid: UID, def: id, x: spot.x, y: spot.y, rot: spot.rot });
      if ((rigHits(b)[ri]?.[ti] ?? []).some((h) => h.uid === UID)) out.push({ after: b, place: { k: "rig", route: ri, tile: ti } });
    }
  }
  return out;
}

/** Free spots for a factory of `def` (off the forward row, nothing under it). */
function factorySpots(b: Build, def: string): { x: number; y: number }[] {
  const d = ITEMS[def], occ = occupancy(b), out: { x: number; y: number }[] = [];
  for (let y = 1; y + d.size <= 10; y++) for (let x = 0; x + d.size <= 10; x++) {
    if (footprint(d, x, y).some((k) => k < 0 || k >= occ.length || occ[k].item >= 0 || occ[k].route >= 0)) continue;
    out.push({ x, y });
  }
  return out;
}

const beltFree = (b: Build): number => b.beltCap - b.routes.reduce((s, r) => s + r.cells.length, 0);

/** blockedCells with a factory's footprint added. */
function withFootprint(bl: Uint8Array, def: string, x: number, y: number): Uint8Array {
  const out = bl.slice();
  for (const k of footprint(ITEMS[def], x, y)) if (k >= 0 && k < out.length) out[k] = 1;
  return out;
}

/** A factory with its own belt into a free intake: the spot and intake with the shortest belt the spare belt covers. */
function factoryIntake(b: Build, def: string): Place | null {
  const cols = freeConnectors(b);
  if (!cols.length) return null;
  const bl0 = blockedCells(b), size = ITEMS[def].size;
  let best: { x: number; y: number; col: number; len: number } | null = null;
  for (const { x, y } of factorySpots(b, def)) {
    const bl = withFootprint(bl0, def, x, y), starts = startCells(x, y, size, bl);
    for (const col of cols) {
      const len = shortestTiles(bl, starts, col);
      if (Number.isFinite(len) && len <= beltFree(b) && (!best || len < best.len)) best = { x, y, col, len };
    }
  }
  if (!best) return null;
  b.items.push({ uid: UID, def, x: best.x, y: best.y });
  const bl = blockedCells(b), starts = startCells(best.x, best.y, size, bl);
  const cells = randomPath(bl, starts, best.col, best.len, new Rng(1));
  if (!cells) {
    b.items.pop();
    return null;
  }
  const ri = commitRoute(b, UID, cells, -1);
  if (!routeInfo(b, ri).connected) {
    b.routes.pop();
    b.items.pop();
    return null;
  }
  return { k: "intake", col: best.col, tiles: cells.length };
}

/** Breadth-first search through free cells from `starts` (a start is 1 tile). */
function bfs(bl: Uint8Array, starts: number[]): { dist: Int32Array; prev: Int32Array } {
  const dist = new Int32Array(100).fill(-1), prev = new Int32Array(100).fill(-1), q: number[] = [];
  for (const s of starts) if (!bl[s] && dist[s] < 0) { dist[s] = 1; q.push(s); }
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    for (const d of [0, 1, 2, 3] as Dir[]) {
      const n = arrowCell(kx(k), ky(k), d);
      if (n < 0 || dist[n] >= 0 || bl[n]) continue;
      dist[n] = dist[k] + 1;
      prev[n] = k;
      q.push(n);
    }
  }
  return { dist, prev };
}

/** A factory whose belt joins a connected belt at a tile up to that belt's first worked tile (0.6.2j), shortest first. */
function factoryJoin(b: Build, def: string): Place | null {
  const hits = rigHits(b), size = ITEMS[def].size;
  const targets: { route: number; tile: number }[] = [];
  b.routes.forEach((r, m) => {
    if (!routeInfo(b, m).connected || r.join !== undefined) return;
    const worked = (hits[m] ?? []).findIndex((t) => t.length > 0);
    const last = worked < 0 ? r.cells.length - 1 : worked;
    for (let t = 0; t <= last; t++) targets.push({ route: m, tile: t });
  });
  let best: { x: number; y: number; cells: number[]; join: number; route: number; tile: number } | null = null;
  const bl0 = blockedCells(b);
  for (const { x, y } of factorySpots(b, def)) {
    const bl = withFootprint(bl0, def, x, y);
    const { dist, prev } = bfs(bl, startCells(x, y, size, bl));
    for (const t of targets) {
      const k0 = b.routes[t.route].cells[t.tile];
      let end = -1;
      for (const d of [0, 1, 2, 3] as Dir[]) {
        const n = arrowCell(kx(k0), ky(k0), d);
        if (n >= 0 && dist[n] >= 1 && (end < 0 || dist[n] < dist[end])) end = n;
      }
      if (end < 0 || dist[end] > beltFree(b)) continue;
      if (best && dist[end] >= best.cells.length) continue;
      const cells: number[] = [];
      for (let c = end; c >= 0; c = prev[c]) cells.push(c);
      best = { x, y, cells: cells.reverse(), join: k0, route: t.route, tile: t.tile };
    }
  }
  if (!best) return null;
  b.items.push({ uid: UID, def, x: best.x, y: best.y });
  const ri = commitRoute(b, UID, best.cells, -1, best.join);
  const info = routeInfo(b, ri);
  if (!info.connected || !info.join) {
    b.routes.pop();
    b.items.pop();
    return null;
  }
  return { k: "join", route: best.route, tile: best.tile, tiles: best.cells.length };
}

/** A factory in place of the deck's last bought factory, else of the signature (which stays owned, idle). */
function factorySwap(b: Build, def: string): Place {
  const sig = HEROES[b.hero].factory;
  const fed = [...new Set(b.routes.map((r) => r.factory))];
  const bought = fed.map((u) => b.items.find((p) => p.uid === u)!).filter((p) => p && p.def !== sig);
  const old = bought.length ? bought[bought.length - 1] : b.items.find((p) => p.def === sig)!;
  const at = { x: old.x, y: old.y };
  if (old.def === sig) {
    const spot = factorySpots(b, sig).find(() => true);
    old.x = spot ? spot.x : 0;
    old.y = spot ? spot.y : 8;
  } else b.items.splice(b.items.indexOf(old), 1);
  b.items.push({ uid: UID, def, ...at });
  for (const r of b.routes) if (r.factory === old.uid) r.factory = UID;
  return { k: "swap", replaced: old.def };
}

/** The turret slots some connected belt feeds, belt order. */
const fedSlots = (b: Build): number[] => [...new Set(b.routes.map((_, ri) => routeInfo(b, ri).turret).filter((t) => t >= 0))];

/** Every fed gun's slot a turret can take and keep its belts (a copy of the gun there merges into it). */
function turretCandidates(before: Build, def: string): { after: Build; place: Place }[] {
  const out: { after: Build; place: Place }[] = [];
  for (const slot of fedSlots(before)) {
    const trial = cloneBuild(before);
    const list = turretList(trial);
    const here = list.find((t) => t.slot === slot);
    const merged = here?.def === def;
    if (merged) {
      if (starsOf(here!) >= 3) continue;
      setTurretList(trial, list.map((t) => (t.slot === slot ? { ...t, stars: starsOf(t) + 1 } : t)));
    } else installTurret(trial, { uid: UID, def }, slot);
    if (deadEndsAt(trial, slot).length) continue;
    out.push({ after: trial, place: { k: "slot", slot, merged } });
  }
  return out;
}

/** Every fed gun that takes gear or a core: a core replaces a bought one; gear takes a free gear slot, and only where
 *  no fed gun has one, replaces a gun's last gear (that piece goes to cargo, as REMOVE GEAR does). A replacement is
 *  judged against the deck with that piece already off (`base`), so only the new part's effect counts. */
function modCandidates(before: Build, d: ItemDef): Candidate[] {
  const out: Candidate[] = [];
  for (const swap of d.kind === "core" ? [false] : [false, true]) {
    for (const t of fedSlots(before)) {
      const trial = cloneBuild(before);
      let replaced: string | undefined, base: Build | undefined;
      if (d.kind === "core") trial.mods = trial.mods.filter((m) => !(m.turret === t && ITEMS[m.def]?.kind === "core"));
      else if (swap) {
        const gear = trial.mods.filter((m) => m.turret === t && ITEMS[m.def]?.kind !== "core");
        if (!gear.length) continue;
        replaced = gear[gear.length - 1].def;
        trial.mods.splice(trial.mods.indexOf(gear[gear.length - 1]), 1);
        base = cloneBuild(trial);
      }
      trial.mods.push({ uid: UID, def: d.id, turret: t });
      if (structural(trial, 10).length) continue;
      out.push({ after: trial, place: { k: d.kind === "core" ? "core" : "gear", turret: t, merged: false, ...(replaced ? { replaced } : {}) }, ...(base ? { base } : {}) });
    }
    if (out.length) break;
  }
  return out;
}

/** A sensible place: the deck with the part, where it went, and (a replacement) the deck it is judged against. */
export interface Candidate {
  after: Build;
  place: Place;
  base?: Build;
}

/** validateBuild's errors but the gold budget (the audit adds a part to a deck that spent its purse). */
export function structural(b: Build, day: number): string[] {
  return validateBuild(b, day).errors.filter((e) => !e.startsWith("budget:"));
}

/**
 * The decks with `d` bought into `before` (copies), one for each sensible place, in the order a player would try them.
 * As in the game, a bought copy that can merge with a same-star copy the deck holds does (fuse.ts gainModule, through
 * the harness's gainInto): that is the one candidate. [] where no place takes it.
 */
export function candidates(before: Build, d: ItemDef): Candidate[] {
  const pv = previewMerge(before, UID, d.id);
  if (pv && pv.where !== "cargo") {
    const after = cloneBuild(before);
    gainInto({ uid: UID }, after, d.id, undefined as unknown as GainAt);
    return [{ after, place: { k: "merge", where: pv.where, toStars: pv.toStars } }];
  }
  if (d.kind === "gate") return rigCandidates(before, d.id);
  if (d.kind === "turret") return turretCandidates(before, d.id);
  if (d.kind === "factory") {
    const after = cloneBuild(before);
    const place = factoryIntake(after, d.id) ?? factoryJoin(after, d.id) ?? factorySwap(after, d.id);
    return [{ after, place }];
  }
  return modCandidates(before, d);
}

/** Why nothing takes a part of this kind on this deck (the audit's `none`). */
const NOWHERE: Record<string, string> = {
  gate: "no free cell beside a connected belt tile",
  turret: "no fed gun's slot takes it without leaving a belt dead-ended",
  mod: "no fed gun takes it",
  core: "no fed gun takes it",
};

export type Metrics = {
  shots: number; payloadSum: number; damage: number; firstShot: number; burnDealt: number;
  enemyHull: number; enemyFray: number; enemyDisrupt: number; stalled: number; produced: number; jams: number;
  fusions: number; platingGained: number; platingSpent: number; ownDisrupt: number; hullLost: number;
  // the part's own acts (evidence, never compared as an outcome)
  tolls: number; flaks: number; repairs: number; rips: number; sifted: number; machineShots: number;
};

const marks = (p: Payload): number => Object.values(p.debuffs ?? {}).filter(Boolean).length;

/** One fight's metrics, read off the tick simulation (as sharedPool.effects.test.ts's run, with the race counters). */
export function fight(b: Build, foe: Build, seed: number, seconds: number): Metrics {
  const battle = new Battle(cloneBuild(b), cloneBuild(foe), seed);
  let enemyDisrupt = 0, tolls = 0, flaks = 0, repairs = 0, rips = 0, sifted = 0, machineShots = 0;
  const sim = battle as unknown as { applyHit: (s: { side: number }, a: BeltAmmo, h: { g: { def: ItemDef } }) => BeltAmmo[] };
  const applyHit = sim.applyHit.bind(battle);
  sim.applyHit = (s, a, h) => {
    const had = marks(a.p);
    const made = applyHit(s, a, h);
    if (s.side === 0 && h.g.def.gate?.sift && marks(a.p) < had) sifted++;
    return made;
  };
  const aimed = new Set<number>();
  while (!battle.over && battle.t < seconds) {
    battle.step();
    for (const e of battle.events) {
      if (e.type === "disrupt" && e.side === 1) enemyDisrupt++;
      if (e.type === "toll" && e.side === 0) tolls++;
      if (e.type === "flak" && e.side === 0) flaks++;
      if (e.type === "repair" && e.side === 0) repairs++;
      if (e.type === "rip" && e.side === 1) rips++;
    }
    for (const pr of battle.projectiles) {
      if (pr.from !== 0 || aimed.has(pr.id)) continue;
      aimed.add(pr.id);
      if (pr.target.kind !== "hull") machineShots++;
    }
    battle.events.length = 0;
  }
  const own = battle.sides[0], enemy = battle.sides[1];
  return {
    shots: own.stats.shots, payloadSum: own.stats.payloadSum, damage: own.stats.damage, firstShot: own.stats.firstShot,
    burnDealt: own.stats.burnDealt, enemyHull: enemy.hull.hp, enemyFray: enemy.hull.fray, enemyDisrupt,
    stalled: own.stats.stalled, produced: own.stats.produced, jams: own.stats.jams,
    fusions: own.race?.foundry.fusions ?? 0, platingGained: own.race?.plating.gained ?? 0, platingSpent: own.race?.plating.absorbed ?? 0,
    ownDisrupt: own.stats.disrupted, hullLost: own.hull.max - own.hull.hp,
    tolls, flaks, repairs, rips, sifted, machineShots,
  };
}

export const OFFENSE: (keyof Metrics)[] = [
  "shots", "payloadSum", "damage", "firstShot", "burnDealt", "enemyHull", "enemyFray", "enemyDisrupt", "stalled", "produced", "jams",
  "fusions", "platingGained", "platingSpent",
];
export const DEFENSE: (keyof Metrics)[] = ["ownDisrupt", "hullLost", "platingSpent"];
export const changedKeys = (a: Metrics, b: Metrics, keys: (keyof Metrics)[]): (keyof Metrics)[] => keys.filter((k) => Math.abs(a[k] - b[k]) > 1e-7);

/** An unarmed legal foe: offensive comparisons on one clock. */
export function quietFoe(): Build {
  const b = heroStartBuild("bastion", 500);
  b.routes = [];
  return b;
}

/** A legal shock attacker with armor to keep a defensive fight running (sharedPool.effects.test.ts's). */
function shockFoe(): Build {
  const b = heroStartBuild("weaver", 500);
  b.hullBonus = 250;
  const r = b.routes[0];
  for (const ti of [2, 3, 1, 4, 0, ...r.cells.map((_, i) => i)]) {
    const spot = spotForTile(b, "coil", 0, ti);
    if (!spot) continue;
    b.items.push({ uid: 800, def: "coil", x: spot.x, y: spot.y, rot: spot.rot });
    if ((rigHits(b)[0] ?? []).some((tile) => tile.some((h) => h.uid === 800))) return b;
    b.items.pop();
  }
  throw new Error("shockFoe: no spot for the coil");
}

/** A legal marking attacker (DRAG CHAIN; FROSTBITE against Metronome's tempo lock), sharedPool.effects.test.ts's. */
function markFoe(hero: HeroId): Build {
  const b = heroStartBuild("weaver", 1);
  b.routes = [b.routes[0]];
  const sig = b.items.find((p) => p.def === HEROES.weaver.factory)!;
  const at = { x: sig.x, y: sig.y };
  sig.x = 0;
  sig.y = 8;
  b.items.push({ uid: 901, def: hero === "metronome" ? "frostbite" : "dragchain", ...at });
  b.routes[0].factory = 901;
  b.hullBonus = 250;
  return b;
}

export type Scenario = { foe?: (hero: HeroId) => Build; seconds?: number; seeds?: number[]; metrics?: (keyof Metrics)[]; proof?: keyof Metrics; more?: keyof Metrics };
const BOTH = [...OFFENSE, ...DEFENSE];
/** sharedPool.effects.test.ts's scenarios: the parts an unarmed foe can't show. */
export const SCENARIOS: Record<string, Scenario> = {
  mantlet: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: DEFENSE },
  tollbooth: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: BOTH, proof: "tolls" },
  flak: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: BOTH, proof: "flaks" },
  riveter: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: DEFENSE, proof: "repairs" },
  grapnel: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: BOTH, proof: "rips" },
  sifter: { foe: markFoe, seconds: LONG, seeds: SEEDS, metrics: BOTH, proof: "sifted" },
  spotter: { seeds: SEEDS, metrics: ["enemyDisrupt"], more: "enemyDisrupt" },
  railgun: { seconds: LONG, seeds: SEEDS },
};

export interface AuditRow {
  hero: HeroId;
  day: number;
  id: string;
  kind: string;
  /** Where it changed the fight (or, inert, the first place tried). */
  place: Place;
  /** The places tried. */
  tried: number;
  changed: (keyof Metrics)[];
  seed?: number;
  base?: Metrics;
  bought?: Metrics;
  sum?: { base: number; bought: number };
}

/** Does buying `d` into `before` change the fight (the scenario's metrics, the proof that the part acted)? */
export function judge(hero: HeroId, before: Build, after: Build, d: ItemDef): Pick<AuditRow, "changed" | "seed" | "base" | "bought" | "sum"> {
  const sc = SCENARIOS[d.id] ?? {};
  const foe = (sc.foe ?? quietFoe)(hero);
  const seconds = sc.seconds ?? SECONDS;
  const sum = { base: 0, bought: 0 };
  let found: Pick<AuditRow, "changed" | "seed" | "base" | "bought"> | null = null;
  let last: Pick<AuditRow, "changed" | "seed" | "base" | "bought"> = { changed: [] };
  for (const seed of sc.seeds ?? [SEED]) {
    const base = fight(before, foe, seed, seconds), bought = fight(after, foe, seed, seconds);
    if (sc.more) { sum.base += base[sc.more]; sum.bought += bought[sc.more]; }
    const changed = changedKeys(base, bought, sc.metrics ?? OFFENSE);
    last = { changed: [], seed, base, bought };
    if (!found && changed.length && (!sc.proof || (bought[sc.proof] > 0 && base[sc.proof] === 0))) found = { changed, seed, base, bought };
    if (found && !sc.more) break;
  }
  if (sc.more && found && !(sum.bought > sum.base)) found = null;
  return { ...(found ?? last), ...(sc.more ? { sum } : {}) };
}

/** The audit of one hero's reference deck on one day, for module `d`: each sensible place in turn, until one changes
 *  the fight. Inert: no place did (its row keeps the first place tried, and the last fight's metrics). */
export function audit(hero: HeroId, day: number, before: Build, d: ItemDef): AuditRow {
  const cands = candidates(before, d);
  if (!cands.length) return { hero, day, id: d.id, kind: d.kind, place: { k: "none", why: NOWHERE[d.kind] ?? "nowhere" }, tried: 0, changed: [] };
  let last: Pick<AuditRow, "changed" | "seed" | "base" | "bought" | "sum"> = { changed: [] };
  for (const c of cands) {
    const res = judge(hero, c.base ?? before, c.after, d);
    if (res.changed.length) return { hero, day, id: d.id, kind: d.kind, place: c.place, tried: cands.indexOf(c) + 1, ...res };
    last = res;
  }
  return { hero, day, id: d.id, kind: d.kind, place: cands[0].place, tried: cands.length, ...last };
}

export { key };
