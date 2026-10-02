// 0.8.0 P1 M5 (BRIEF-wave3-P1 section 6; REQ-BFG-021 part 3, no dead offers): each of the 15 wave-3 modules with each of
// the six heroes the sim knows (FURNACE, WEAVER, FOUNDRY, BASTION, METRONOME, SIPHON). The module goes where DESIGN-wave3.md
// 3.3's six-hero line puts it, in that hero's starting deck (heroStartBuild) or the smallest deck the line needs, and a
// real battle shows it doing something: a stat or a sim event it causes is nonzero, or the battle moves against the same
// deck without it. Each pair names its evidence; none is inert. BB_TABLES=1 prints the table (REPORT.md).
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { withWave3, type HeroId } from "../src/sim/content";
import { validateBuild } from "../src/net/validate";
import { routeInfo, type Build } from "../src/sim/deck";
import { bestSpot, stokeSpots } from "../src/sim/beltside";
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
  return t;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const meanDmg = (t: Tally) => mean(t.fires.map((f) => f.dmg));

/** The hero's starting deck, hull + 5000 so a fight runs its full length. */
const start = (hero: HeroId): Build => ({ ...heroStartBuild(hero), hullBonus: 5000 });
/** The turret slot the hero's first belt feeds (WEAVER: slot 1). */
const gun = (b: Build): number => routeInfo(b, 0).turret;

/** A rig where the par player would put it (beltside.ts bestSpot; a STOKER beside the most factories, stokeSpots). */
function withRig(b: Build, def: string): Build {
  const s = def === "stoker" ? stokeSpots(b, def)[0] : bestSpot(b, def);
  if (!s) throw new Error(`no spot for ${def} on ${b.hero}`);
  return withItem(b, item(UID, def, s.x, s.y, s.rot));
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

const rig = (hero: HeroId, def: string, foe = barge()): Pair => {
  const base = start(hero);
  return { deck: withRig(base, def), base, foe, turret: gun(base) };
};
const fitted = (hero: HeroId, def: string, foe = barge()): Pair => {
  const base = start(hero);
  return { deck: withMod(base, UID, def, gun(base)), base, foe, turret: gun(base) };
};
const placed = (hero: HeroId, def: string): Pair => {
  const deck = withFactory(hero, def);
  return { deck, base: start(hero), foe: barge(), turret: gun(deck) };
};
/** A turret part on the gun a SHOT TOWER keeps busy (towerFed). */
const busy = (hero: HeroId, def: string): Pair => {
  const base = towerFed(hero);
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

const MODULES: { id: string; pair: (hero: HeroId) => Pair; check: Check }[] = [
  { id: "plateroller", pair: (h) => rig(h, "plateroller"), check: plates },
  { id: "twingauge", pair: (h) => rig(h, "twingauge"), check: hitsHarder },
  { id: "pincer", pair: (h) => rig(h, "pincer"), check: hitsHarder },
  {
    id: "braceframe", pair: (h) => rig(h, "braceframe", harasser()),
    check: { what: "it shortens the enemy's stalls on its tiles (brace events, seconds saved)", ok: (w) => w.braced > 0, show: (w) => `${w.braced.toFixed(1)} s of stalls saved` },
  },
  { id: "twinlatch", pair: (h) => rig(h, "twinlatch"), check: hitsHarder },
  {
    id: "stoker", pair: (h) => rig(h, "stoker"),
    check: {
      what: "the hero's factory stamps more often than without it",
      ok: (w, o, p) => (w.produce.get(p.base.items[0].uid) ?? 0) > (o.produce.get(p.base.items[0].uid) ?? 0),
      show: (w, o) => `${[...o.produce.values()][0]} -> ${[...w.produce.values()][0]} stamps`,
    },
  },
  {
    id: "platebreaker", pair: (h) => rig(h, "platebreaker"),
    check: { ...hitsHarder, show: (w, o) => `${hitsHarder.show(w, o)}; ${w.spent.toFixed(0)} plating spent` },
  },
  { id: "shieldwall", pair: (h) => rig(h, "shieldwall"), check: plates },
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
    // a fire-rate core, audited as REQ-BFG-021 audits CALIBRATION: on a gun with more loads than it fires (towerFed)
    id: "steambreech", pair: (h) => busy(h, "steambreech"),
    check: {
      what: "on a busy gun (a SHOT TOWER feeds it, as REQ-BFG-021's audit feeds CALIBRATION) it fires more shots and deals more damage",
      ok: (w, o) => w.fires.length > o.fires.length && w.dealt > o.dealt,
      show: (w, o) => `${o.fires.length} -> ${w.fires.length} shots; dealt ${o.dealt.toFixed(0)} -> ${w.dealt.toFixed(0)}`,
    },
  },
  {
    id: "twintrigger", pair: (h) => fitted(h, "twintrigger"),
    check: {
      what: "its load time is shorter, so the gun's first shot comes sooner (and FOUNDRY's fusions are pairs that hit harder)",
      ok: (w, o) => w.window < o.window && firstShot(w) < firstShot(o) - 0.1,
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
  },
  { id: "seamwelder", pair: (h) => fitted(h, "seamwelder"), check: plates },
];

const TABLE: string[] = [];

describe("wave 3, no dead offers: each module does something for each of the six heroes", () => {
  for (const m of MODULES) for (const hero of HEROES) {
    it(`${m.id} x ${hero}: ${m.check.what}`, () => {
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
    });
  }
  it("the table (BB_TABLES=1 prints it)", () => {
    expect(TABLE.length).toBe(15 * 6);
    if (process.env.BB_TABLES) console.log(["| module | hero | evidence |", "|---|---|---|", ...TABLE].join("\n"));
  });
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
      expect([steam.fires.length, cal.fires.length], hero).toEqual([none.fires.length, none.fires.length]);
      if (hero === "weaver" || hero === "foundry" || hero === "siphon") expect(why, hero).toEqual([STARVED, STARVED]);
      // on the busy gun both add shots, and plated STEAM BREECH more than bare
      expect(tSteam.fires.length > tNone.fires.length && tCal.fires.length > tNone.fires.length, hero).toBe(true);
      expect(tPlated.fires.length, hero).toBeGreaterThan(tSteam.fires.length);
    }
    if (process.env.BB_TABLES) {
      console.log(["| hero | start deck: shots none / STEAM ★1 / CALIBRATION ★1 | why (STEAM / CALIBRATION) | busy gun: shots none / STEAM bare / CALIBRATION | busy gun, 24 plating: none / STEAM plated | busy gun: dealt |",
        "|---|---|---|---|---|---|", ...rows].join("\n"));
    }
  });
});
