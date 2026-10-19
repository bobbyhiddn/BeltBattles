// 0.8.0 P1 M5 (BRIEF-wave3-P1 section 6; REQ-BFG-021 part 3, no dead offers): each of the 15 wave-3 modules with each of
// the six heroes the sim knows (FURNACE, WEAVER, FOUNDRY, BASTION, METRONOME, SIPHON). The module goes where DESIGN-wave3.md
// 3.3's six-hero line puts it, in that hero's starting deck (heroStartBuild) or the smallest deck the line needs, and a
// real battle shows it doing something: a stat or a sim event it causes is nonzero, or the battle moves against the same
// deck without it. Each pair names its evidence; none is inert. BB_TABLES=1 prints the table (REPORT.md).
// Y7b2 (the flip; DESIGN-Y: no floors): a payoff piece that lost its floor gets its engine in both decks (MODULES), as
// tests/sharedPool.effects.test.ts's decks() gives it; only the audited piece differs.
// BUMP-1E (the flip; rules bb-0.12.0): the scaling rules ship on (SCALE_RIGS) and rework two of the 15: IRON WALL (a reader now: +n
// DMG for each whole 10 PLATE you have, no plating of its own) and SPALL CATCHER (a reader now: +n DMG for each enemy hit on your
// ship this fight, no charge); scale.ts SCALE_DEFS. Their rows below audit the OLD effects ("it rolls plating onto the hull",
// "hits the ship takes charge its next shot"), so those two modules (`off: true` in MODULES) are read under the scaling rules' off
// switch (withScaleRigs(fn, false), synchronously); the other 13 modules are pieces the flip does not touch and stay on, as does
// the fire-rate record. The shipped readers are pinned in tests/scale2c.sim (a fight each, at every star).
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { HEROES as HERO_DEFS, ITEMS, withWave3, type HeroId } from "../src/sim/content";
import { SCALE_RIGS, scaleRules, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the switch ships on; the 2 reworked modules' rows read it off
import { validateBuild } from "../src/net/validate";
import { cloneBuild, hullSlots, installTurret, rigHits, routeInfo, turretList, type Build } from "../src/sim/deck";
import { bestSpot, spotForTile, stokeSpots } from "../src/sim/beltside";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { K, SEED, barge, item, withItem, withMod } from "./wave3.helpers";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const SECS = 40;
const UID = 60; // the module's uid (no start deck uses it)

/** What a battle shows on side 0. */
interface Tally {
  plate: number; // plating added (plate events: wave-3 sources only; BASTION's own slugs fire none)
  spent: number; // plating spent (PLATE BREAKER)
  braced: number; // seconds BRACE FRAME took off enemy stalls, freezes and slows
  holds: number; // TWIN LATCH holds
  pairs: number; // pairs marked (E2)
  process: number; // hits by the module (uid UID)
  produce: Map<number, number>; // stamps by factory uid
  fires: { t: number; dmg: number; factory: number; paired: boolean }[];
  spallMax: number; // the most charge a SPALL CATCHER held
  window: number; // the load time of the module's turret (or turret 0)
  dealt: number; // damage dealt to the foe's hull and plating
  held?: number; // NUM-2 (REQ-BFG-047): loads in the turret's chamber at the end, not yet fired (`turret`'s stack)
}

function tally(b: Build, foe: Build, turret: number, secs = SECS, plate = 0): Tally {
  const t: Tally = { plate: 0, spent: 0, braced: 0, holds: 0, pairs: 0, process: 0, produce: new Map(), fires: [], spallMax: 0, window: 0, dealt: 0 };
  const bt = new Battle(b, foe, SEED);
  if (plate) bt.addPlate(bt.sides[0], plate); // `plate` plating on the hull from the start (an unarmed foe never takes it)
  t.window = bt.sides[0].turrets.find((tu) => tu.index === turret)?.windowTime ?? 0;
  const hull0 = bt.sides[1].hull.hp;
  while (bt.t < secs && !bt.over) {
    bt.step();
    for (const tu of bt.sides[0].turrets) t.spallMax = Math.max(t.spallMax, tu.spallCharge ?? 0);
    for (const e of bt.drainEvents()) {
      if (!("side" in e) || e.side !== 0) continue;
      // 0.8.0 I1 (oracle c38b1df9f2e9c338): H1's bulwark-slug CLANK names its gun and is not a wave-3 source; skip it
      if (e.type === "plate" && "turret" in e) continue;
      if (e.type === "plate") { if (e.amount > 0) t.plate += e.amount; else t.spent -= e.amount; }
      else if (e.type === "brace") t.braced += e.saved;
      else if (e.type === "hold") t.holds++;
      else if (e.type === "pair") t.pairs++;
      else if (e.type === "process" && e.gate === UID) t.process++;
      else if (e.type === "produce") t.produce.set(e.factory, (t.produce.get(e.factory) ?? 0) + 1);
      else if (e.type === "fire") {
        const pr = bt.projectiles.find((p) => p.id === e.proj);
        t.fires.push({ t: bt.t, dmg: e.dmg, factory: pr?.payload.factory ?? -1, paired: !!pr?.payload.paired });
      }
    }
  }
  t.dealt = hull0 - bt.sides[1].hull.hp;
  t.held = bt.sides[0].turrets.find((tu) => tu.index === turret)?.stack.length ?? 0; // NUM-2: loads in its chamber, unfired
  return t;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanDmg = (t: Tally) => mean(t.fires.map((f) => f.dmg));

/** The hero's starting deck, hull + 5000 so a fight runs its full length. */
const start = (hero: HeroId): Build => ({ ...heroStartBuild(hero), hullBonus: 5000 });
/** The turret slot the hero's first belt feeds (WEAVER: slot 1). */
const gun = (b: Build): number => routeInfo(b, 0).turret;

/** A rig where the par player would put it (beltside.ts bestSpot; a STOKER beside the most factories, stokeSpots). */
function withRig(b: Build, def: string, uid = UID): Build {
  const s = def === "stoker" ? stokeSpots(b, def)[0] : bestSpot(b, def);
  if (!s) throw new Error(`no spot for ${def} on ${b.hero}`);
  return withItem(b, item(uid, def, s.x, s.y, s.rot));
}

/** Y7b2: the uid of an engine piece both decks own (no start deck uses it). */
const ENGINE = 61;

/** Y7b2: stand a rig whose live arrow hits the first fitting tile of `tiles` on the first belt (the editor's placement
 *  search, as tests/sharedPool.effects.test.ts's rigAt); returns that tile. */
function rigAt(b: Build, def: string, uid: number, tiles: number[]): number {
  for (const ti of tiles) {
    const s = spotForTile(b, def, 0, ti);
    if (!s) continue;
    b.items.push(item(uid, def, s.x, s.y, s.rot));
    if ((rigHits(b)[0]?.[ti] ?? []).some((hit) => hit.uid === uid)) return ti;
    b.items.pop();
  }
  throw new Error(`${b.hero}: no active spot for ${def} on tiles ${tiles.join(",")}`);
}
/** Y7b2: first-belt tiles downstream of `t`, the longest ride first. */
const later = (b: Build, t: number): number[] => b.routes[0].cells.map((_, i) => i).filter((i) => i > t).reverse();

/**
 * Y7b2 (the flip; DESIGN-Y: no floors): the TWIN pieces' engine (tests/sharedPool.effects.test.ts's twinBelts), two belts
 * of equal tiles (a matched pair) into the two intakes of one gun, with a free cell between them. The gun is the one in
 * the slot at the hero's factory's columns: FURNACE's, BASTION's and METRONOME's own, FOUNDRY's left gun; WEAVER's gun
 * there takes one belt and SIPHON's slot there is empty, so each buys a TWIN NEEDLE for it. Belt A leaves the factory's
 * top-left corner, steps one column out, runs up and steps back into the left intake at row 1; belt B leaves the
 * factory's right side, steps up and back over its top-right corner, then runs up into the right intake. A II rig in the
 * cell between them hits both (a TWIN LATCH). Every other belt goes (the factory's belt slots), and a BELT CRATE is
 * bought where the belt runs short. `pour`: the factory puts a slug on both belts at once, so the gun takes them as a
 * PAIR (two loads by two intakes): FOUNDRY's CRUCIBLE pours already; any other signature factory parks off the belts for
 * a TWIN MOULD. `late`: belt B leaves the factory's side one cell lower, one tile longer, so a pour's two slugs reach
 * the gun 0.4 s apart (no PAIR) unless something holds the first for the second.
 */
function twinBelts(b: Build, pour = false, late = false): void {
  const sig = b.items.find((p) => p.def === HERO_DEFS[b.hero].factory)!;
  const { x, y } = sig;
  const up = (col: number, from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => K(col, from - i));
  const a = [K(x, y - 1), ...up(x - 1, y - 1, 1), K(x, 1), K(x, 0)];
  const c = [...(late ? [K(x + 2, y + 1)] : []), K(x + 2, y), K(x + 2, y - 1), ...up(x + 1, y - 1, 0)];
  let factory = sig.uid;
  if (pour && !ITEMS[sig.def].factory!.pour) {
    sig.x = 0;
    sig.y = 8;
    b.items.push(item(906, "twinmould", x, y));
    factory = 906;
  }
  b.routes = [{ factory, cells: a }, { factory, cells: c }];
  const slot = hullSlots(b.hero).findIndex((s) => s.col0 === x);
  const g = turretList(b).find((t) => t.slot === slot);
  if (!g || ITEMS[g.def].turret!.intake !== "both") installTurret(b, { uid: 905, def: "twinneedle" }, slot);
  while (b.beltCap < a.length + c.length) b.beltCap += ITEMS.beltcrate.supply!.belt!;
}

/**
 * A factory (TWIN MOULD, ARMOR PRESS) with a belt into a turret, as DESIGN 3.3's lines say: FURNACE, BASTION and
 * METRONOME on the heavy or adaptable gun's free connector 5; FOUNDRY on gun 2's connectors 6 and 7 (the mould both, two
 * BELT CRATEs for the tiles); WEAVER and SIPHON in place of one signature belt (the drop lever), into that light gun.
 */
function withFactory(hero: HeroId, def: string): Build {
  const b = start(hero);
  const up = (x: number, from = 5) => Array.from({ length: from + 1 }, (_, i) => K(x, from - i));
  b.items = [...b.items, item(UID, def, 6, 6)];
  if (hero === "furnace" || hero === "bastion" || hero === "metronome") b.routes = [...b.routes, { factory: UID, cells: [K(6, 5), ...up(5)] }];
  else if (hero === "foundry") {
    b.routes = [...b.routes, { factory: UID, cells: up(6) }, ...(def === "twinmould" ? [{ factory: UID, cells: up(7) }] : [])];
    b.beltCap += 8;
  } else if (hero === "weaver") b.routes = [...b.routes.slice(0, 2), { factory: UID, cells: [K(7, 5), ...up(8)] }];
  else b.routes = [b.routes[0], { factory: UID, cells: up(7) }];
  return b;
}

/**
 * The busy gun fire-rate parts need (tests/sharedPool.effects.test.ts, REQ-BFG-021's audit of CALIBRATION, EXT. CHAMBER
 * and ESCAPEMENT): a start deck's factory never gives a gun more loads than it fires, so a faster gun changes nothing
 * there. A SHOT TOWER (3 buckshot a stamp) takes the signature factory's place on the first belt; the signature factory
 * stays owned, parked off the belts.
 */
function towerFed(hero: HeroId): Build {
  const b = start(hero);
  b.routes = [b.routes[0]];
  const sig = b.items.find((p) => p.uid === b.routes[0].factory)!;
  b.items = [...b.items.filter((p) => p !== sig), { ...sig, x: 0, y: 8 }, item(70, "shottower", sig.x, sig.y)];
  b.routes = [{ ...b.routes[0], factory: 70 }];
  return b;
}

/** The harasser for BRACE FRAME (legal on day 10): a WEAVER whose guns always aim at a machine (SPOTTER ★3) firing
 *  shocked thread (a COIL on each belt, at 3, 2 and 1 stars: each shock stalls the machine it hits, and from 2 stars the
 *  nearest others). */
function harasser(): Build {
  let b: Build = { ...heroStartBuild("weaver"), hullBonus: 5000 };
  for (let i = 0; i < 3; i++) {
    const s = bestSpot(b, "coil", (ri) => ri === i)!;
    b = withItem(b, item(80 + i, "coil", s.x, s.y, s.rot, 3 - i));
  }
  for (const slot of [0, 1, 2]) b = withMod(b, 90 + slot, "spotter", slot, 3);
  return b;
}
/** The shooter for SPALL CATCHER: FURNACE's starting deck, firing at us. */
const shooter = (): Build => start("furnace");

interface Pair { deck: Build; base: Build; foe: Build; turret: number }
interface Check { what: string; ok: (w: Tally, o: Tally, p: Pair) => boolean; show: (w: Tally, o: Tally) => string }

/** Y7b2: `engine`, when given, builds the payoff piece's engine into the starting deck first (both decks own it). */
const rig = (hero: HeroId, def: string, foe = barge(), engine?: (b: Build) => void): Pair => {
  const base = start(hero);
  engine?.(base);
  return { deck: withRig(base, def), base, foe, turret: gun(base) };
};
const fitted = (hero: HeroId, def: string, foe = barge(), engine?: (b: Build) => void): Pair => {
  const base = start(hero);
  engine?.(base);
  return { deck: withMod(base, UID, def, gun(base)), base, foe, turret: gun(base) };
};
/** Y7b2: a rig on the first-belt tiles `engine` returns (rigAt) once it has built the engine into the starting deck. */
const rigOnTiles = (hero: HeroId, def: string, engine: (b: Build) => number[]): Pair => {
  const base = start(hero);
  const tiles = engine(base);
  const deck = cloneBuild(base);
  rigAt(deck, def, UID, tiles);
  return { deck, base, foe: barge(), turret: gun(base) };
};
const placed = (hero: HeroId, def: string): Pair => {
  const deck = withFactory(hero, def);
  return { deck, base: start(hero), foe: barge(), turret: gun(deck) };
};
/** A turret part on the gun a SHOT TOWER keeps busy (towerFed); Y7b2: `engine` adds what both decks need around it. */
const busy = (hero: HeroId, def: string, engine: (b: Build) => Build = (b) => b): Pair => {
  const base = engine(towerFed(hero));
  return { deck: withMod(base, UID, def, gun(base)), base, foe: barge(), turret: gun(base) };
};
const firstShot = (t: Tally) => t.fires[0]?.t ?? Infinity;

/** More damage on the module's payloads: it hit some, and the mean shot deals more than without it. */
const hitsHarder: Check = {
  what: "its hits add damage: it hits payloads, and the mean shot deals more than without it",
  ok: (w, o) => w.process > 0 && meanDmg(w) > meanDmg(o) + 0.1,
  show: (w, o) => `${w.process} hits; mean shot ${meanDmg(o).toFixed(2)} -> ${meanDmg(w).toFixed(2)}`,
};
const plates: Check = {
  what: "it rolls plating onto the hull (plate events)",
  ok: (w) => w.plate > 0,
  show: (w) => `+${w.plate.toFixed(1)} plating`,
};

/** BUMP-1E: `off`: the module is one of the scaling rules' five reworks (IRON WALL, SPALL CATCHER here), and its check audits the
 *  0.9.11 effect, so its row runs with the scaling rules' switch off. */
const MODULES: { id: string; pair: (hero: HeroId) => Pair; check: Check; off?: true }[] = [
  { id: "plateroller", pair: (h) => rig(h, "plateroller"), check: plates },
  // Y7b2 (the flip; DESIGN-Y: no floors): TWIN GAUGE needs a matched belt to act (another belt of as many tiles into its
  // gun): twinBelts; was audited on the bare deck (it had a floor: +10 off a matched belt)
  { id: "twingauge", pair: (h) => rig(h, "twingauge", barge(), (b) => twinBelts(b)), check: hitsHarder },
  {
    // Y7b2 (the flip; DESIGN-Y: no floors): PINCER needs another working rig hitting its tile to act: a WHETSTONE, the
    // PINCER on the tile's other free side (FOUNDRY's two belts run side by side, leaving each tile one free side, so they
    // are laid apart: twinBelts); was audited on the bare deck (it had a floor: +10)
    id: "pincer",
    pair: (h) => rigOnTiles(h, "pincer", (b) => {
      if (h === "foundry") twinBelts(b);
      return [rigAt(b, "whetstone", ENGINE, [2, 3, 1])];
    }),
    check: hitsHarder,
  },
  {
    id: "braceframe", pair: (h) => rig(h, "braceframe", harasser()),
    check: { what: "it shortens the enemy's stalls on its tiles (brace events, seconds saved)", ok: (w) => w.braced > 0, show: (w) => `${w.braced.toFixed(1)} s of stalls saved` },
  },
  {
    // Y7b2 (the flip; DESIGN-Y: no floors): TWIN LATCH needs a second belt into its gun to act (it holds only with both
    // arrows on belts, to make a PAIR), and a pair reader for that PAIR to hit harder: twinBelts fed by a pour (a TWIN
    // MOULD; FOUNDRY's CRUCIBLE) with belt B one tile late, so each pour's two slugs reach the gun 0.4 s apart until the
    // latch, in the cell between the belts, holds the first for the second, and a TWIN TRIGGER on the gun; was audited on
    // the bare deck (it had a flat: +10 on each payload it hits)
    id: "twinlatch",
    pair: (h) => rig(h, "twinlatch", barge(), (b) => {
      twinBelts(b, true, true);
      b.mods = [...b.mods, { uid: ENGINE, def: "twintrigger", turret: gun(b) }];
    }),
    check: hitsHarder,
  },
  {
    id: "stoker", pair: (h) => rig(h, "stoker"),
    check: {
      what: "the hero's factory stamps more often than without it",
      ok: (w, o, p) => (w.produce.get(p.base.items[0].uid) ?? 0) > (o.produce.get(p.base.items[0].uid) ?? 0),
      show: (w, o) => `${[...o.produce.values()][0]} -> ${[...w.produce.values()][0]} stamps`,
    },
  },
  {
    // Y7b2 (the flip; DESIGN-Y: no floors): PLATE BREAKER needs 10 PLATE on the hull to act: a PLATE ROLLER before it
    // (BASTION's slugs plate too); was audited on the bare deck (it had a floor: +10 without PLATE)
    id: "platebreaker", pair: (h) => rigOnTiles(h, "platebreaker", (b) => later(b, rigAt(b, "plateroller", ENGINE, [1, 2, 0]))),
    check: { ...hitsHarder, show: (w, o) => `${hitsHarder.show(w, o)}; ${w.spent.toFixed(0)} plating spent` },
  },
  { id: "shieldwall", pair: (h) => rig(h, "shieldwall"), check: plates, off: true }, // BUMP-1E: IRON WALL's plating is the switch-off piece's
  {
    id: "twinmould", pair: (h) => placed(h, "twinmould"),
    check: {
      what: "it casts, and a turret fires its slugs",
      ok: (w) => (w.produce.get(UID) ?? 0) > 0 && w.fires.some((f) => f.factory === UID),
      show: (w) => `${w.produce.get(UID) ?? 0} casts, ${w.fires.filter((f) => f.factory === UID).length} shots of its slugs`,
    },
  },
  { id: "armorpress", pair: (h) => placed(h, "armorpress"), check: plates },
  { id: "anvil", pair: (h) => fitted(h, "anvil"), check: { ...hitsHarder, ok: (w, o) => meanDmg(w) > meanDmg(o) + 0.1, what: "every shot deals more" } },
  {
    // a fire-rate core, audited as REQ-BFG-021 audits CALIBRATION: on a gun with more loads than it fires (towerFed).
    // Y7b2 (the flip; DESIGN-Y: no floors): STEAM BREECH needs PLATE on the hull to act (it fires faster only while
    // plated): a PLATE ROLLER on the tower's belt; was audited on the bare deck (it had a floor: 10% faster without PLATE)
    id: "steambreech", pair: (h) => busy(h, "steambreech", (b) => withRig(b, "plateroller", ENGINE)),
    check: {
      what: "on a busy gun (a SHOT TOWER feeds it, as REQ-BFG-021's audit feeds CALIBRATION) it fires more shots and deals more damage",
      ok: (w, o) => w.fires.length > o.fires.length && w.dealt > o.dealt,
      show: (w, o) => `${o.fires.length} -> ${w.fires.length} shots; dealt ${o.dealt.toFixed(0)} -> ${w.dealt.toFixed(0)}`,
    },
  },
  {
    // Y7b2 (the flip; DESIGN-Y: no floors): TWIN TRIGGER needs PAIRs to act (two loads by two intakes at once): twinBelts
    // fed by a factory that pours both at once (FOUNDRY's CRUCIBLE, else a TWIN MOULD); was audited on the bare deck (it
    // had a floor: a shorter load time). That load-time cut is gone (switch-off only), so the evidence is its live rule:
    // was "its load time is shorter, so the gun's first shot comes sooner (and FOUNDRY's fusions are pairs that hit
    // harder)", ok: w.window < o.window && firstShot(w) < firstShot(o) - 0.1
    id: "twintrigger", pair: (h) => fitted(h, "twintrigger", barge(), (b) => twinBelts(b, true)),
    check: {
      what: "its paired loads hit harder: the gun fires paired shots, and the mean shot deals more than without it",
      ok: (w, o) => w.fires.some((f) => f.paired) && meanDmg(w) > meanDmg(o) + 0.1,
      show: (w, o) => `load time ${o.window} -> ${w.window} s; first shot at ${firstShot(o).toFixed(2)} -> ${firstShot(w).toFixed(2)} s; ${w.fires.filter((f) => f.paired).length} paired shots; mean shot ${meanDmg(o).toFixed(2)} -> ${meanDmg(w).toFixed(2)}`,
    },
  },
  {
    id: "spallcatcher", pair: (h) => fitted(h, "spallcatcher", shooter()),
    check: {
      what: "hits the ship takes charge its next shot, so the mean shot deals more",
      ok: (w, o) => w.spallMax > 0 && meanDmg(w) > meanDmg(o),
      show: (w, o) => `charge up to ${w.spallMax.toFixed(1)}; mean shot ${meanDmg(o).toFixed(2)} -> ${meanDmg(w).toFixed(2)}`,
    },
    off: true, // BUMP-1E: SPALL CATCHER's charge is the switch-off piece's (spallCharge: the shipped reader keeps none)
  },
  // Y7b2 (the flip; DESIGN-Y: no floors): SEAM WELDER needs PAIRs to act (two loads by two intakes at once): twinBelts fed
  // by a factory that pours both at once (FOUNDRY's CRUCIBLE, else a TWIN MOULD); was audited on the bare deck (it had a
  // floor: 2 PLATE a lone load)
  { id: "seamwelder", pair: (h) => fitted(h, "seamwelder", barge(), (b) => twinBelts(b, true)), check: plates },
];

const TABLE: string[] = [];

describe("wave 3, no dead offers: each module does something for each of the six heroes", () => {
  // BUMP-1E: the scaling rules ship on; the rows of the two reworked modules (`off`) are read with the switch off, the rest as they were
  it("BUMP-1E: the scaling rules ship on; IRON WALL and SPALL CATCHER are the reworked modules, audited as the 0.9.11 pieces", () => {
    expect(SCALE_RIGS).toBe(true);
    expect(MODULES.filter((m) => m.off).map((m) => m.id)).toEqual(["shieldwall", "spallcatcher"]);
    // shipped: readers (no plating, no charge); the switch off: the 0.9.11 pieces the rows below audit
    expect(withScaleRigs(() => [ITEMS.shieldwall.gate?.reads?.count, ITEMS.spallcatcher.mod?.reads?.count], true)).toEqual(["ownPlate", "hitsTaken"]);
    expect(withScaleRigs(() => [ITEMS.shieldwall.gate?.reads, ITEMS.spallcatcher.mod?.reads], false)).toEqual([undefined, undefined]);
    // the 13 other modules are not in SCALE_DEFS: the very same defs with the switch off
    for (const m of MODULES) if (!m.off) expect(withScaleRigs(() => ITEMS[m.id], false), m.id).toBe(ITEMS[m.id]);
  });
  for (const m of MODULES) for (const hero of HEROES) {
    it(`${m.id} x ${hero}: ${m.check.what}`, () => {
      const audit = () => {
        const p = m.pair(hero);
        // every deck is one a player could own on day 10 (with wave 3 in the game), the test's + 5000 hull aside
        withWave3(() => {
          for (const [what, b] of [["with", p.deck], ["without", p.base], ["foe", p.foe]] as [string, Build][]) {
            expect(validateBuild({ ...b, hullBonus: 0 }, 10).errors, `${m.id} x ${hero}: ${what}`).toEqual([]);
          }
        });
        const w = tally(p.deck, p.foe, p.turret), o = tally(p.base, p.foe, p.turret);
        const line = `| ${m.id} | ${hero} | ${m.check.show(w, o)} |`;
        TABLE.push(line);
        expect(m.check.ok(w, o, p), line).toBe(true);
      };
      if (m.off) {
        expect(scaleRules(), `${m.id} x ${hero}: the shipped switch is on`).toBe(true); // BUMP-1E: read with it off here, put back on after
        withScaleRigs(audit, false);
      } else audit();
    });
  }
  it("the table (BB_TABLES=1 prints it)", () => {
    expect(TABLE.length).toBe(15 * 6);
    if (process.env.BB_TABLES) console.log(["| module | hero | evidence |", "|---|---|---|", ...TABLE].join("\n"));
  });
});

// BUMP-1E: the audit above reads IRON WALL and SPALL CATCHER as the 0.9.11 pieces (plating, charge). This is the same audit of them as
// the scaling rules ship them (the switch on, as it is): readers, so IRON WALL, like the file's other payoff pieces, gets its engine in
// both decks (a PLATE ROLLER ahead of it on the first belt, as PLATE BREAKER's row does: bare it reads no PLATE on 5 of the 6 start
// decks), and SPALL CATCHER the shooter that gives it hits to count (as its row above). Evidence that each does something, with no old
// number ported: the shipped numbers are tests/scale2c.sim's. Not in the table above (15 x 6).
const READERS: { id: string; pair: (hero: HeroId) => Pair; check: Check }[] = [
  {
    id: "shieldwall", pair: (h) => rigOnTiles(h, "shieldwall", (b) => later(b, rigAt(b, "plateroller", ENGINE, [1, 2, 0]))),
    check: { ...hitsHarder, what: "a reader: its hits add damage for the PLATE a PLATE ROLLER rolled: it hits payloads, and the mean shot deals more than without it" },
  },
  {
    id: "spallcatcher", pair: (h) => fitted(h, "spallcatcher", shooter()),
    check: {
      what: "a reader: each hit the ship takes adds damage to its shots, so the mean shot deals more than without it",
      ok: (w, o) => meanDmg(w) > meanDmg(o),
      show: (w, o) => `mean shot ${meanDmg(o).toFixed(2)} -> ${meanDmg(w).toFixed(2)}`,
    },
  },
];

describe("BUMP-1E: wave 3, no dead offers: IRON WALL and SPALL CATCHER as the scaling rules ship them", () => {
  for (const m of READERS) for (const hero of HEROES) {
    it(`${m.id} x ${hero}: ${m.check.what}`, () => {
      expect(scaleRules(), "the shipped switch is on").toBe(true);
      const p = m.pair(hero);
      withWave3(() => {
        for (const [what, b] of [["with", p.deck], ["without", p.base], ["foe", p.foe]] as [string, Build][]) {
          expect(validateBuild({ ...b, hullBonus: 0 }, 10).errors, `${m.id} x ${hero}: ${what}`).toEqual([]);
        }
      });
      const w = tally(p.deck, p.foe, p.turret), o = tally(p.base, p.foe, p.turret);
      expect(m.check.ok(w, o, p), `| ${m.id} | ${hero} | ${m.check.show(w, o)} |`).toBe(true);
    });
  }
});

/**
 * The Prime's call (oracle f77882b58164404e): STEAM BREECH's smallest deck is the busy-gun deck, the standard REQ-BFG-021
 * uses for CALIBRATION, EXT. CHAMBER and ESCAPEMENT. On a starting deck a fire-rate part meets a "starved" gun, H1's reason
 * key (tests/deadOffers.inert.ts in H1's workspace): "The gun it would work on is starved: its belt brings a load less
 * often than the gun can fire. Firing faster, a wider chamber or another turret on the same belts changes no shot."
 */
const STARVED = "starved";
/** How a part changes the starting deck's shots against the same deck without it: none at all (starved), the same
 *  shots sooner, or more shots. */
function shotChange(w: Tally, o: Tally): string {
  if (w.fires.length > o.fires.length) return "more shots";
  const same = w.fires.length === o.fires.length && w.fires.every((f, i) => Math.abs(f.t - o.fires[i].t) < 1e-9);
  return same ? STARVED : "sooner";
}

describe("fire-rate parts on a starting deck: STEAM BREECH as CALIBRATION (the existing fire-rate gear)", () => {
  it("each hero's starting gun waits for loads, so neither adds a shot there; on a busy gun both do (the record)", () => {
    const rows: string[] = [];
    for (const hero of HEROES) {
      const b = start(hero), t = gun(b);
      const none = tally(b, barge(), t), steam = tally(withMod(b, UID, "steambreech", t), barge(), t), cal = tally(withMod(b, UID, "calibrate", t), barge(), t);
      const tb = towerFed(hero), tt = gun(tb);
      const tNone = tally(tb, barge(), tt), tSteam = tally(withMod(tb, UID, "steambreech", tt), barge(), tt), tCal = tally(withMod(tb, UID, "calibrate", tt), barge(), tt);
      // the card sells the plated rate: the same busy deck with 24 plating on the hull from the start
      const tPlated = tally(withMod(tb, UID, "steambreech", tt), barge(), tt, SECS, 24), tPlatedNone = tally(tb, barge(), tt, SECS, 24);
      const why = [shotChange(steam, none), shotChange(cal, none)];
      rows.push(`| ${hero} | ${none.fires.length} / ${steam.fires.length} / ${cal.fires.length} | ${why.join(" / ")} | ${tNone.fires.length} / ${tSteam.fires.length} / ${tCal.fires.length} | ${tPlatedNone.fires.length} / ${tPlated.fires.length} | ${tNone.dealt.toFixed(0)} / ${tSteam.dealt.toFixed(0)} / ${tCal.dealt.toFixed(0)} |`);
      // on the starting deck the gun is never the bottleneck: STEAM BREECH adds no shot (nor does CALIBRATION); on
      // WEAVER, FOUNDRY and SIPHON the battle is the same shot for shot (starved)
      // NUM-2 (REQ-BFG-047), an equivalent check (was: the same shot count in SECS, [steam, cal] = [none, none]): the part
      // fires the bare gun's loads, never one more: its shots plus the loads still in its chamber at the cut-off are the
      // bare deck's, and none of its shots comes later than the bare one's. With the remainder carried and WARDWORKS at
      // 27 (1.11 s; was 1.1 s), BASTION's volleys moved: the faster gun's 33rd shot (the same load) lands at 40.00 s,
      // inside the cut-off, and the bare one's at 40.72 s, past it: 33 shots + 1 held = 32 + 2 (the base: 33 / 33 / 33)
      for (const [w, part] of [[steam, "STEAM"], [cal, "CALIBRATION"]] as const) {
        expect(w.fires.length + w.held!, `${hero} ${part}: shots + held`).toBe(none.fires.length + none.held!);
        expect(w.fires.length, `${hero} ${part}: shots`).toBeGreaterThanOrEqual(none.fires.length);
        expect(w.fires.slice(0, none.fires.length).every((f, i) => f.t <= none.fires[i].t + 1e-9), `${hero} ${part}: never later`).toBe(true);
      }
      if (hero === "weaver" || hero === "foundry" || hero === "siphon") expect(why, hero).toEqual([STARVED, STARVED]);
      // on the busy gun both add shots, and plated STEAM BREECH more than bare
      // Y7b2 (the flip; DESIGN-Y: no floors): STEAM BREECH needs PLATE on the hull to act (it fires faster only while
      // plated): it is measured on the busy deck with 24 plating, against that plated deck without it (tPlatedNone); was
      // audited bare (tSteam > tNone: it had a floor, 10% faster without PLATE). Bare it now adds no shot (tSteam fires
      // tNone's), so below every hero takes the first branch: plated fires more shots than bare
      expect(tPlated.fires.length > tPlatedNone.fires.length && tCal.fires.length > tNone.fires.length, hero).toBe(true);
      // NUM-2 (REQ-BFG-047), an equivalent check (was: plated fires more shots than bare on every hero): the shot timer
      // carries its remainder and the speed is whole, so bare STEAM ★1 on WEAVER's tower-fed light gun (55 x 1.1 = 60.5
      // -> 61, 0.49 s; was 0.5 s, its timer reset each shot: 64 shots) already fires every load the tower brings: 74, as
      // many as CALIBRATION ★1 (and plated) fire. Plated can add no shot there; it fires the same 74 sooner (61 earlier,
      // none later). Wherever bare is below that feed cap, plated still fires more shots
      if (tSteam.fires.length < tCal.fires.length) expect(tPlated.fires.length, hero).toBeGreaterThan(tSteam.fires.length);
      else {
        expect(tPlated.fires.length, `${hero}: the feed's cap`).toBe(tSteam.fires.length);
        expect(tPlated.fires.every((f, i) => f.t <= tSteam.fires[i].t + 1e-9), `${hero}: plated never later`).toBe(true);
        expect(tPlated.fires.some((f, i) => f.t < tSteam.fires[i].t - 1e-9), `${hero}: plated sooner`).toBe(true);
      }
    }
    if (process.env.BB_TABLES) {
      console.log(["| hero | start deck: shots none / STEAM ★1 / CALIBRATION ★1 | why (STEAM / CALIBRATION) | busy gun: shots none / STEAM bare / CALIBRATION | busy gun, 24 plating: none / STEAM plated | busy gun: dealt |",
        "|---|---|---|---|---|---|", ...rows].join("\n"));
    }
  });
});
