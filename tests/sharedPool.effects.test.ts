import { describe, expect, it } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { bestSpot, spotForTile, stokeSpots } from "../src/sim/beltside";
import { HEROES, ITEMS, buyableModules, type HeroId, type ItemDef } from "../src/sim/content";
import { DORMANT_ITEMS } from "../src/sim/races/data"; // FLIP-X2: SIFTER dormant keeps its merchant and price, unsold
import {
  cloneBuild, deadEndsAt, hullSlots, installTurret, key, rigHits, routeInfo, setTurretList, turretList, turretSlots, type Build,
} from "../src/sim/deck";
import { Rng } from "../src/core/rng";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { blockedCells, randomPath, shortestTiles, startCells } from "../src/sim/harness/path";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";

const SEED = 20210924;
const SECONDS = 18;
const LONG = 32; // a fight long enough for an armed foe's hits, repairs and marks to reach the audited part
const SEEDS = [SEED, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const uid = 901;
const auditFile = process.env.BB_POOL_AUDIT_FILE;
if (auditFile) writeFileSync(auditFile, "");

/** A legal, unarmed opponent keeps each offensive comparison on the same 18-second clock. */
function quietFoe(): Build {
  const b = heroStartBuild("bastion", 500);
  b.routes = [];
  return b;
}

/** Stand a rig beside the first belt using the editor's placement search, with a live arrow. */
function rig(b: Build, id: string, idNum: number): void {
  const r = b.routes[0];
  const order = [2, 3, 1, 4, 0, ...r.cells.map((_, i) => i)];
  for (const ti of order) {
    const spot = spotForTile(b, id, 0, ti);
    if (!spot) continue;
    b.items.push({ uid: idNum, def: id, x: spot.x, y: spot.y, rot: spot.rot });
    if ((rigHits(b)[0] ?? []).some((tile) => tile.some((hit) => hit.uid === idNum))) return;
    b.items.pop();
  }
  throw new Error(`${b.hero}: no active spot for ${id}`);
}

/** Stand a rig whose live arrow hits the first fitting tile of `tiles` on the first belt; returns that tile. */
function rigAt(b: Build, id: string, idNum: number, tiles: number[]): number {
  for (const ti of tiles) {
    const spot = spotForTile(b, id, 0, ti);
    if (!spot) continue;
    b.items.push({ uid: idNum, def: id, x: spot.x, y: spot.y, rot: spot.rot });
    if ((rigHits(b)[0]?.[ti] ?? []).some((hit) => hit.uid === idNum)) return ti;
    b.items.pop();
  }
  throw new Error(`${b.hero}: no active spot for ${id} on tiles ${tiles.join(",")}`);
}

/** First-belt tiles downstream of `t`, the longest ride first. */
const later = (b: Build, t: number): number[] => b.routes[0].cells.map((_, i) => i).filter((i) => i > t).reverse();
/** First-belt tiles upstream of `t`, the first processed tile first. */
const earlier = (t: number): number[] => [1, 2, 0, ...Array.from({ length: t }, (_, i) => i)].filter((i, n, all) => i < t && all.indexOf(i) === n);

/** Swap the productive signature location for one sold factory; keep the signature owned. 0.6.2s: `route` names the
 *  start deck's belt it keeps (default the first). */
function boughtFactory(hero: HeroId, id: string, route = 0): Build {
  const b = heroStartBuild(hero, 1);
  b.routes = [b.routes[route]];
  const signature = b.items.find((p) => p.def === HEROES[hero].factory)!;
  const at = { x: signature.x, y: signature.y };
  signature.x = 0;
  signature.y = 8;
  b.items.push({ uid, def: id, ...at });
  b.routes[0].factory = uid;
  return b;
}

/**
 * 0.6.2s step 5 (REQ-BFG-031): the caravan sells turrets. A turret's numbers show where the belt brings more than a
 * start deck's factory does, so, as for the fire-rate mods, a SHOT TOWER feeds it: on the first belt whose column the
 * bought turret takes (S2 intakes). The bought turret replaces the starting turret in that belt's slot (which goes to
 * cargo); a copy of that slot's own def merges into it instead (2 stars, still the free starting copy), as buying one
 * does. TWIN NEEDLE's reason to buy is its second intake (it fires like a DART GUN): the column it takes and the
 * replaced turret didn't gets a belt from the idle signature factory, as a player would add one (without the TWIN
 * NEEDLE that belt is a dead end).
 */
function boughtTurret(hero: HeroId, id: string): [Build, Build] {
  for (let r = 0; r < heroStartBuild(hero, 1).routes.length; r++) {
    const before = boughtFactory(hero, "shottower", r);
    const slot = routeInfo(before, 0).turret;
    const after = cloneBuild(before);
    const list = turretList(after);
    if (list.find((t) => t.slot === slot)?.def === id) setTurretList(after, list.map((t) => (t.slot === slot ? { ...t, stars: 2 } : t)));
    else installTurret(after, { uid: 902, def: id }, slot);
    if (deadEndsAt(after, slot).length) continue;
    const taken = new Set(turretSlots(before)[slot].intakes);
    const col = id === "twinneedle" ? turretSlots(after)[slot].intakes.find((c) => !taken.has(c)) : undefined;
    if (col !== undefined) {
      const sig = after.items.find((p) => p.def === HEROES[hero].factory)!;
      const bl = blockedCells(after);
      const starts = startCells(sig.x, sig.y, ITEMS[sig.def].size, bl);
      const cells = randomPath(bl, starts, col, shortestTiles(bl, starts, col), new Rng(1));
      if (!cells) throw new Error(`${hero}: no belt from ${sig.def} to column ${col}`);
      after.routes.push({ factory: sig.uid, cells });
    }
    return [before, after];
  }
  throw new Error(`${hero}: no belt that a ${id} takes`);
}

/** Test the two pendulum peaks at routes that make their shifts helpful. */
function metroPeakRoute(b: Build, id: string): void {
  const K = key;
  b.routes[0].cells = id === "escapement"
    ? [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(5, 1), K(5, 0)]
    : [K(4, 5), K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(2, 2), K(3, 2), K(4, 2), K(5, 2), K(5, 1), K(5, 0)];
}

/**
 * Y7b2 (the flip; DESIGN-Y: no floors): the TWIN pieces' engine, two belts of equal tiles (a matched pair) into the two
 * intakes of one gun, with a free cell between them. The gun is the one in the slot at the hero's factory's columns:
 * FURNACE's, BASTION's and METRONOME's own, FOUNDRY's left gun; WEAVER's gun there takes one belt and SIPHON's slot there
 * is empty, so each buys a TWIN NEEDLE for it. Belt A leaves the factory's top-left corner, steps one column out, runs up
 * and steps back into the left intake at row 1; belt B leaves the factory's right side, steps up and back over its
 * top-right corner, then runs up into the right intake. A II rig in the cell between them at row 3 hits both (a TWIN
 * LATCH). Every other belt goes (the factory's belt slots), and a BELT PACK is bought where the belt runs short.
 * `pour`: the factory puts a slug on both belts at once, so the gun takes them as a PAIR (two loads by two intakes):
 * FOUNDRY's CRUCIBLE pours already; any other signature factory parks off the belts for a TWIN MOULD.
 */
function twinBelts(b: Build, pour = false): void {
  const sig = b.items.find((p) => p.def === HEROES[b.hero].factory)!;
  const { x, y } = sig;
  const up = (col: number, from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => key(col, from - i));
  const a = [key(x, y - 1), ...up(x - 1, y - 1, 1), key(x, 1), key(x, 0)];
  const c = [key(x + 2, y), key(x + 2, y - 1), ...up(x + 1, y - 1, 0)];
  let factory = sig.uid;
  if (pour && !ITEMS[sig.def].factory!.pour) {
    sig.x = 0;
    sig.y = 8;
    b.items.push({ uid: 906, def: "twinmould", x, y });
    factory = 906;
  }
  b.routes = [{ factory, cells: a }, { factory, cells: c }];
  const slot = hullSlots(b.hero).findIndex((s) => s.col0 === x);
  const gun = turretList(b).find((t) => t.slot === slot);
  if (!gun || ITEMS[gun.def].turret!.intake !== "both") installTurret(b, { uid: 905, def: "twinneedle" }, slot);
  while (b.beltCap < a.length + c.length) b.beltCap += ITEMS.beltcrate.supply!.belt!;
}

/**
 * Both decks are legal on day 10; only the named purchase differs. Parts whose effect needs something already on
 * the belt get it in both decks, the way a player would build them: LONG HAUL and OVERCLOCKER a WHETSTONE to count
 * or boost, QUENCH a TEMPER's Burn to spend, BELLOWS a slow belt (Metronome's tempo lock ignores BRAKE SHOE, so it
 * rides the long route instead), LODESTONE and SPOTTER a GALVANIC COIL whose stalls they price or aim.
 * Y7b2 (the flip; DESIGN-Y: no floors): so do the payoff pieces that lost their floor: VENOM DRIP a TEMPER's BURN to
 * lengthen, DRAKE NOZZLE a ★2 WHETSTONE's bonus to turn into BURN, PINCER a WHETSTONE on its tile, PLATE BREAKER and
 * STEAM BREECH a PLATE ROLLER's PLATE, and the TWIN pieces two matched belts into one gun (twinBelts).
 */
function decks(hero: HeroId, d: ItemDef): [Build, Build] {
  if (d.kind === "turret") return boughtTurret(hero, d.id);
  let before = heroStartBuild(hero, 1);
  if (d.kind === "factory") {
    before.routes = [before.routes[0]];
    return [before, boughtFactory(hero, d.id)];
  }
  let tiles: number[] | undefined; // where the audited rig stands, when its effect depends on the tile
  if (d.kind === "gate" && d.id === "longhaul") rig(before, "whetstone", 900);
  if (d.id === "overclocker") tiles = earlier(rigAt(before, "whetstone", 900, later(before, 1)));
  if (d.id === "quench") tiles = later(before, rigAt(before, "temper", 900, [1, 2, 0]));
  if (d.id === "bellows") {
    if (hero === "metronome") { metroPeakRoute(before, "longcase"); tiles = later(before, 6); }
    else tiles = later(before, rigAt(before, "brake", 900, [1, 0, 2]) + 1);
  }
  if (d.id === "sifter") tiles = later(before, 0); // marks picked up anywhere upstream reach it
  if (d.id === "lodestone" || d.id === "spotter") rig(before, "coil", 900);
  // NUM-2 (REQ-BFG-047; was `hero !== "metronome"` for all three): METRONOME's CALIBRATION is audited on the busy gun
  // too. Its starting gun waits for its loads (CLOCKWORKS 23 = a slug every 30 / 23 = 1.30 s; the gun 30 / 43 = 0.70 s,
  // 30 / 57 = 0.53 s with CALIBRATION ★1), so CALIBRATION only brings each two-slug volley's second shot 0.17 s sooner.
  // The base passed on the 18 s cutoff splitting the 6th volley (the bought gun's 12th shot at 17.983 s, the base's at
  // 18.150 s: shots 11 -> 12, payloadSum 704 -> 768); CLOCKWORKS's rounded speed with its carried stamp timer (a 79-tick
  // cycle every 4th slug, was 78 ticks every one) brings those shots 2 ticks later (18.017 / 18.183 s), so in 18 s
  // nothing changed (11 shots, 640 damage both). The equivalent check is the other heroes' (and STEAM BREECH's, oracle
  // f77882b58164404e): a SHOT TOWER keeps the gun busy (shots 17 -> 28 in 18 s)
  if (d.kind === "mod" && ["chamber", "calibrate", "escapement"].includes(d.id) && (hero !== "metronome" || d.id === "calibrate")) {
    before = boughtFactory(hero, "shottower");
  }
  if (d.kind === "mod" && d.id === "hopper") {
    before = boughtFactory(hero, "shottower");
    rig(before, "splitter", 903);
    before.mods.push({ uid: 904, def: "salvo", turret: routeInfo(before, 0).turret });
  }
  if (d.kind === "mod" && ["escapement", "longcase"].includes(d.id) && hero === "metronome") metroPeakRoute(before, d.id);
  // 0.8.0 I1 M2 (the brief's M2 list; tests/wave3.inert.test.ts's busy gun): STEAM BREECH is a fire-rate core, audited
  // beside CALIBRATION on a gun a SHOT TOWER keeps busy (every hero: a starting gun waits for its loads, oracle
  // f77882b58164404e)
  if (d.id === "steambreech") before = boughtFactory(hero, "shottower");
  // Y7b2 (the flip; DESIGN-Y: no floors): STEAM BREECH needs PLATE on the hull to act (it fires faster only while plated):
  // a PLATE ROLLER on the tower's belt; was audited on the bare deck (it had a floor: 10% faster without PLATE)
  if (d.id === "steambreech") rig(before, "plateroller", 903);
  // Y7b2 (the flip; DESIGN-Y: no floors): VENOM DRIP needs BURN on the slugs it hits to act (each of their BURN stacks
  // lasts 3 s longer): a TEMPER before it, as for QUENCH; was audited on the bare deck (it had poison)
  if (d.id === "venom") tiles = later(before, rigAt(before, "temper", 900, [1, 2, 0]));
  // Y7b2 (the flip; DESIGN-Y: no floors): DRAKE NOZZLE needs 25 bonus damage a shot to act (1 BURN for each 25): a ★2
  // WHETSTONE (+40) on the gun's belt; was audited on the bare deck (it had a floor: a free BURN a shot)
  if (d.id === "drake") {
    rig(before, "whetstone", 900);
    before.items.find((p) => p.uid === 900)!.stars = 2;
  }
  // Y7b2 (the flip; DESIGN-Y: no floors): PINCER needs another working rig hitting its tile to act: a WHETSTONE, the
  // PINCER on the tile's other free side (FOUNDRY's two belts run side by side, leaving each tile one free side, so they
  // are laid apart: twinBelts); was audited on the bare deck (it had a floor: +10)
  if (d.id === "pincer") {
    if (hero === "foundry") twinBelts(before);
    tiles = [rigAt(before, "whetstone", 900, [2, 3, 1])];
  }
  // Y7b2 (the flip; DESIGN-Y: no floors): PLATE BREAKER needs 10 PLATE on the hull to act: a PLATE ROLLER before it
  // (BASTION's slugs plate too); was audited on the bare deck (it had a floor: +10 without PLATE)
  if (d.id === "platebreaker") tiles = later(before, rigAt(before, "plateroller", 900, [1, 2, 0]));
  // Y7b2 (the flip; DESIGN-Y: no floors): TWIN GAUGE needs a matched belt to act (another belt of as many tiles into
  // its gun): twinBelts; was audited on the bare deck (it had a floor: +10 off a matched belt)
  if (d.id === "twingauge") twinBelts(before);
  // Y7b2 (the flip; DESIGN-Y: no floors): TWIN LATCH needs a second belt into its gun to act (it holds only with both
  // arrows on belts, to make a PAIR): twinBelts, the latch in the cell between them; was audited on the bare deck (it
  // had a flat: +10 on each payload it hits)
  if (d.id === "twinlatch") twinBelts(before);
  // Y7b2 (the flip; DESIGN-Y: no floors): TWIN TRIGGER and SEAM WELDER need PAIRs to act (two loads by two intakes at
  // once): twinBelts fed by a factory that pours both at once (FOUNDRY's CRUCIBLE, else a TWIN MOULD); were audited on
  // the bare deck (they had a floor: TWIN TRIGGER a shorter load time, SEAM WELDER 2 PLATE a lone load)
  if (d.id === "twintrigger" || d.id === "seamwelder") twinBelts(before, true);
  const after = cloneBuild(before);
  if (d.kind === "gate" && d.gate?.stoke) {
    // 0.8.0 I1 M2: a STOKER works factories, never belts (P1's E3): it stands at its best stokeSpots spot
    const s = stokeSpots(after, d.id)[0];
    if (!s) throw new Error(`${hero}: no stoke spot for ${d.id}`);
    after.items.push({ uid, def: d.id, x: s.x, y: s.y, rot: s.rot });
  } else if (d.kind === "gate") {
    if (tiles) rigAt(after, d.id, uid, tiles);
    else rig(after, d.id, uid);
  } else after.mods.push({ uid: 902, def: d.id, turret: routeInfo(before, 0).turret });
  return [before, after];
}

type Metrics = {
  shots: number; payloadSum: number; damage: number; firstShot: number;
  burnDealt: number; enemyHull: number; enemyFray: number; enemyDisrupt: number;
  ownDisrupt: number; ownHull: number;
  // the audited part's own action in this battle (evidence, never compared as an outcome)
  tolls: number; flaks: number; repairs: number; rips: number; sifted: number; machineShots: number;
  // 0.8.0 I1: BRACE FRAME's seconds off enemy stalls (brace events), SPALL CATCHER's largest charge, and the plating wave-3
  // parts added (P1's E1 `plate` events, which name no gun; BASTION's own slugs fire H1's CLANK, which does)
  braced: number; spall: number; plated: number;
  // FLIP-X2 (REQ-BFG-069, the sustain switch on): WARD BELL's foe hits its SHIELDs stopped (SideState.blocked, Battle.shieldHit)
  // and MENDING LOOM's REGEN, the hull its `heal` events (source "regen") gave back
  blocked: number; regen: number;
};

const marks = (p: Payload): number => Object.values(p.debuffs ?? {}).filter(Boolean).length;

/** Read only outcomes of the actual tick simulation, including applied Shock, and count the part's own acts. */
function run(b: Build, foe: Build, seed: number, seconds: number): Metrics {
  const battle = new Battle(b, foe, seed);
  let enemyDisrupt = 0, tolls = 0, flaks = 0, repairs = 0, rips = 0, sifted = 0, machineShots = 0, braced = 0, spall = 0, plated = 0;
  let regen = 0; // FLIP-X2
  // SIFTER leaves no event: count the payloads a rig of ours hits that lose a CHILL, SNAG or SAP mark on that hit
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
      if (e.type === "heal" && e.source === "riveter" && e.side === 0) repairs++; // SUS-A: RIVETER's "repair" event is a heal
      if (e.type === "rip" && e.side === 1) rips++;
      if (e.type === "brace" && e.side === 0) braced += e.saved; // 0.8.0 I1
      if (e.type === "plate" && e.side === 0 && !("turret" in e) && e.amount > 0) plated += e.amount; // 0.8.0 I1: E1 only
      if (e.type === "heal" && e.source === "regen" && e.side === 0) regen += e.amount; // FLIP-X2: MENDING LOOM's REGEN
    }
    for (const tu of battle.sides[0].turrets) spall = Math.max(spall, tu.spallCharge ?? 0); // 0.8.0 I1
    for (const pr of battle.projectiles) {
      if (pr.from !== 0 || aimed.has(pr.id)) continue;
      aimed.add(pr.id);
      if (pr.target.kind !== "hull") machineShots++;
    }
    battle.events.length = 0;
  }
  const own = battle.sides[0], enemy = battle.sides[1];
  return {
    shots: own.stats.shots, payloadSum: own.stats.payloadSum, damage: own.stats.damage,
    firstShot: own.stats.firstShot, burnDealt: own.stats.burnDealt,
    enemyHull: enemy.hull.hp, enemyFray: enemy.hull.fray, enemyDisrupt,
    ownDisrupt: own.stats.disrupted, ownHull: own.hull.hp,
    tolls, flaks, repairs, rips, sifted, machineShots, braced, spall, plated,
    blocked: own.blocked ?? 0, regen, // FLIP-X2
  };
}

const offense: (keyof Metrics)[] = ["shots", "payloadSum", "damage", "firstShot", "burnDealt", "enemyHull", "enemyFray", "enemyDisrupt"];
const defense: (keyof Metrics)[] = ["ownDisrupt", "ownHull"];
const delta = (a: Metrics, b: Metrics, keys: (keyof Metrics)[]) => keys.filter((k) => Math.abs(a[k] - b[k]) > 1e-7);

/** A legal shock attacker, with enough armor to keep a defensive test running. */
function shockFoe(): Build {
  const b = heroStartBuild("weaver", 500);
  b.hullBonus = 250;
  rig(b, "coil", 800);
  return b;
}

/**
 * A legal marking attacker. DRAG CHAIN's telegraphed rounds slow belt segments and SNAG the payloads riding them;
 * Metronome's tempo lock ignores slows (no SNAG), so against it FROSTBITE's frozen cells CHILL the payloads instead.
 */
function markFoe(hero: HeroId): Build {
  const b = boughtFactory("weaver", hero === "metronome" ? "frostbite" : "dragchain");
  b.hullBonus = 250;
  return b;
}

/**
 * 0.8.0 I1 M2: the harassing foe for BRACE FRAME (tests/wave3.inert.test.ts's, legal on day 10 with 1000 extra hull (NUM-1: x10, was 100), 115 g):
 * a WEAVER whose guns always aim at a machine (SPOTTER ★3 on each) firing shocked thread (a GALVANIC COIL on each belt,
 * at 3, 2 and 1 stars), so its shots stall the machines they hit.
 */
function harasser(): Build {
  const b = heroStartBuild("weaver", 500);
  b.hullBonus = 10 * 100; // NUM-1: hull x10 (was 100: four ARMOR PACKs, now 250 hull each)
  for (let i = 0; i < 3; i++) {
    const s = bestSpot(b, "coil", (ri) => ri === i);
    if (!s) throw new Error("harasser: no spot for a coil");
    b.items.push({ uid: 810 + i, def: "coil", x: s.x, y: s.y, rot: s.rot, ...(i < 2 ? { stars: 3 - i } : {}) });
  }
  for (const slot of [0, 1, 2]) b.mods.push({ uid: 820 + slot, def: "spotter", turret: slot, stars: 3 });
  return b;
}

/**
 * How a part is audited when an unarmed foe can't show its effect. An armed foe also aims at the new rig, so the two
 * fights part ways even where the part does nothing: `proof` must count the part's own act in the bought fight.
 * `more` must rise summed over every seed, for a part whose act is a shift in odds (SPOTTER's rerolls).
 */
type Scenario = {
  foe?: (hero: HeroId) => Build; seconds?: number; seeds?: number[]; metrics?: (keyof Metrics)[];
  proof?: keyof Metrics; more?: keyof Metrics;
};
const both = [...offense, ...defense];
const SCENARIOS: Record<string, Scenario> = {
  mantlet: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: defense },
  tollbooth: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: both, proof: "tolls" },
  flak: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: both, proof: "flaks" },
  riveter: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: defense, proof: "repairs" },
  grapnel: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: both, proof: "rips" },
  sifter: { foe: markFoe, seconds: LONG, seeds: SEEDS, metrics: both, proof: "sifted" },
  spotter: { seeds: SEEDS, metrics: ["enemyDisrupt"], more: "enemyDisrupt" },
  railgun: { seconds: LONG, seeds: SEEDS },
  // 0.8.0 I1 M2 (the brief's M2 list; tests/wave3.inert.test.ts's scenarios): BRACE FRAME against a harassing foe (the
  // seconds it saves); the plating parts against an armed foe, judged on the defence numbers (the E1 plating they add);
  // SPALL CATCHER against an armed foe (the charge it stores)
  braceframe: { foe: harasser, seconds: LONG, seeds: SEEDS, metrics: both, proof: "braced" },
  plateroller: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: defense, proof: "plated" },
  seamwelder: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: defense, proof: "plated" },
  shieldwall: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: defense, proof: "plated" },
  spallcatcher: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: both, proof: "spall" },
  // FLIP-X2 (REQ-BFG-069, the sustain switch on): the 3 sustain pieces join the audit. MEND PRESS stamps plain slugs down
  // its belt, so the default fight's offence shows it. WARD BELL and MENDING LOOM change nothing the deck deals: as RIVETER,
  // each is judged on the hull the deck keeps against an armed foe (the hull damage it takes), with its own act as the
  // proof: the foe hits its SHIELDs stopped (`blocked`), the hull its REGEN gave back (`regen`)
  wardbell: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: defense, proof: "blocked" },
  mendingloom: { foe: shockFoe, seconds: LONG, seeds: SEEDS, metrics: defense, proof: "regen" },
  // BUMP-1D (PLAIN_RIGS on): BALLAST raises your ship's max hull (GateEffect.maxHullPct) and hits no slug, so the deck deals the
  // same in the default fight: it is judged on the hull the deck has (ownHull, the quiet foe leaves it whole), as the plating parts
  // are judged on the defence numbers. The other eleven plain stat rigs (PLAIN_RIGS' other five, SHAPES2's six) give their stats to
  // the slugs, so the default fight's offence shows them
  ballast: { metrics: defense },
};

/**
 * The damage a flat or timing part must raise in its chosen fight (stats.damage includes Burn ticks): QUENCH trades
 * Burn for hits, BELLOWS adds Burn, and SURGE's locked-belt damage is Metronome's (other belts get speed).
 */
function useful(id: string, hero: HeroId): ((m: Metrics) => number) | undefined {
  if (id === "quench") return (m) => m.damage - m.burnDealt;
  if (id === "bellows") return (m) => m.burnDealt;
  if (id === "surge") return hero === "metronome" ? (m) => m.damage : undefined;
  return ["escapement", "longcase", "heatjacket", "overclocker", "lodestone"].includes(id) ? (m) => m.damage : undefined;
}

// FLIP-X2 (REVIEW-NUM3 answer 2): NUM-3's NUM3_INERT {sifter} and its tripwire are gone: SIFTER is dormant
// (races/data.ts DORMANT_ITEMS), so it left buyableModules, and its row with it.

describe("REQ-BFG-021: every buyable module changes a battle metric for every hero", () => {
  const rows = buyableModules();
  it("audits exactly the sold, priced, non-supply catalogue", () => {
    // FLIP-X2 (REVIEW-NUM3 answer 2): the dormant SIFTER keeps its merchant and price (validate.ts refuses a part no merchant
    // sells) but is not sold, so the merchant-and-price entries are the audit's rows and DORMANT_ITEMS exactly (was the rows
    // alone); the 3 sustain pieces are rows (the sustain switch on)
    const priced = Object.values(ITEMS).filter((d) => !!d.merchant && d.price > 0 && d.kind !== "supply").map((d) => d.id);
    expect(priced.filter((id) => !rows.some((d) => d.id === id))).toEqual([...DORMANT_ITEMS]);
    expect(rows.map((d) => d.id).sort()).toEqual(priced.filter((id) => !DORMANT_ITEMS.has(id)).sort());
    expect(rows.length).toBeGreaterThanOrEqual(58); // 0.6.2: wave 2 and the nine missing wave-1 rigs joined the audit
  });
  for (const d of rows) for (const hero of HARNESS_HEROES) {
    it(`${d.id} changes ${hero}'s battle`, () => {
      const [before, after] = decks(hero, d);
      expect(validateBuild(before, 10).errors, `${hero} ${d.id} before`).toEqual([]);
      expect(validateBuild(after, 10).errors, `${hero} ${d.id} after`).toEqual([]);
      const sc = SCENARIOS[d.id] ?? {};
      const foe = (sc.foe ?? quietFoe)(hero);
      expect(validateBuild(foe, 10).errors, `${hero} ${d.id} foe`).toEqual([]);
      const seconds = sc.seconds ?? SECONDS;
      let chosen: { seed: number; base: Metrics; bought: Metrics; changed: (keyof Metrics)[] } | undefined;
      let last: { base: Metrics; bought: Metrics } | undefined;
      const sum = { base: 0, bought: 0 };
      for (const seed of sc.seeds ?? [SEED]) {
        const base = run(before, foe, seed, seconds), bought = run(after, foe, seed, seconds);
        last = { base, bought };
        if (sc.more) { sum.base += base[sc.more]; sum.bought += bought[sc.more]; }
        const changed = delta(base, bought, sc.metrics ?? offense);
        if (!chosen && changed.length && (!sc.proof || bought[sc.proof] > 0)) chosen = { seed, base, bought, changed };
        if (chosen && !sc.more) break;
      }
      expect(chosen, `${hero} ${d.id}: no battle metric changed ${JSON.stringify(last)}`).toBeDefined();
      if (sc.proof) expect(chosen!.base[sc.proof], `${hero} ${d.id}: ${sc.proof} without the part`).toBe(0);
      if (sc.more) expect(sum.bought, `${hero} ${d.id}: ${sc.more} over ${sc.seeds!.length} seeds`).toBeGreaterThan(sum.base);
      const gain = useful(d.id, hero);
      if (gain) expect(gain(chosen!.bought), `${hero} ${d.id}: useful damage`).toBeGreaterThan(gain(chosen!.base));
      if (auditFile) appendFileSync(auditFile, `${JSON.stringify({ id: d.id, hero, ...chosen, ...(sc.more ? { sum } : {}) })}\n`);
      if (process.env.BB_POOL_AUDIT) console.log(`AUDIT ${d.id} ${hero} ${JSON.stringify(chosen)}`);
    });
  }
});
