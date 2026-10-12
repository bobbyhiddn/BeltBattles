// Y-INT (release Y; REQ-BFG-070, REQ-BFG-046; BRIEF-YINT scope 5): the four runes the base revived (BAL-2, 0.9.1:
// DORMANT_RUNES empty; COAL CHUTE heatPct 15, HEAT SINK heatPct 25, SEARING searBurn 5, SHATTER SHOT shatterPct 14) were
// dormant at y1x, so no Y job met them in play. One switch-on test for each Y rule each one meets, against the same scene
// with the switch off where the base differs. Each meeting follows the rule the Y job built for the same kind of thing:
// - SEARING's start BURN is a stack from no hit: no VENOM burnPlus (Y6, as ASH KINDLE's); its no-HEAL rule reads any of
//   your BURN on the foe, a VENOM-lengthened stack too (Y6); its BURN's ticks charge a foe's SPALL CATCHER by Y5's rule.
// - SHATTER SHOT's +n% sits in runeMul's % sum, so every Y rule's shot meets it as the other % runes' (WARLORD'S DUE);
//   its broken SHIELD lets the hit land on PLATE, then HULL: a foe's SPALL CATCHER charges by Y5's rule, and the PLATE it
//   eats meets the foe's IRON WALL (120 PLATE or more; Y7b1, ruling Y7A-R3d: its own plating is back on, as off).
// - COAL CHUTE and HEAT SINK (+n% HEAT) read the slug's ride, never a factory's pace or a rig's start: Y3's STOKER (Y7b1,
//   ruling Y7A-R1: its cap holds on too) and ASSEMBLY LINE (no HOT START) change neither the rune's % nor what it multiplies; BELLOWS (Y3, the
//   seconds ridden, uncapped) reads the ride, which the rune does not lengthen.
// - Their texts with the switch on: as off (no STAR_RUNE_TEXT), no retired word, each drawn line in the 225 px band.
import { describe, expect, it } from "vitest";
import { Battle, simulate, type Payload, type SideState, type Target } from "../src/sim/battle";
import { BURN_TIME, CELL } from "../src/sim/content";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { RUNES } from "../src/sim/runes";
import { starField } from "../src/sim/stars";
import { RUNE_TEXT, runeLine, runeReminder, runeSentenceSpans, runeTextOf } from "../src/ui/runeText";
import { BAND, payload, probe, px, rigBench } from "./y3.helpers";
import { barge, bench } from "./arsenal.bench";
import { SEED, furnaceBench, item, withItem, withMod } from "./wave3.helpers";

const FOUR = ["coal_chute", "heat_sink", "searing", "shatter_shot"] as const;
/** The words the star switch retired (glossary.ts STAR_RETIRED until the flip, Y7b2, which deleted their rows). */
const RETIRED = ["HARASSMENT", "ONLINE", "POISON"];
const n = (id: string) => RUNES[id].amount.n;
const W = (b: Build, ...ids: string[]): Build => ({ ...cloneBuild(b), runes: [...(b.runes ?? []), ...ids.map((id) => ({ id }))] });
const HULL: Target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };

/** A hit of `dmg` from side `from` landing (Battle.impact, as sustain.runes' land). */
function land(bt: Battle, from: 0 | 1, dmg: number, extra: Partial<Payload> = {}): void {
  const p: Payload = { ...payload(1e6), ...extra };
  (bt as unknown as { impact(pr: unknown): void }).impact({ id: 1e6, from, turret: 0, payload: p, dmg, t: 0, flight: 0, target: HULL, tx: 60, ty: 60, heavy: false });
}

/** Side `side`'s first rig hits a fresh slug (every rig online); the slug after. */
function rigHit(bt: Battle, side: 0 | 1 = 0, uid?: number): Payload {
  const s = bt.sides[side];
  for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
  const g = uid === undefined ? s.gates[0] : s.gates.find((x) => x.uid === uid)!, h = g.hits[0], p = payload();
  probe(bt).applyHit(s, { p, s: h.tile * CELL + CELL / 2, processed: h.tile, blocked: false }, h);
  return p;
}

const end = (x: Battle) => [x.winner, x.ticks, x.sides[0].hull.hp, x.sides[1].hull.hp];
const finish = (bt: Battle): Battle => { while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; } return bt; };

// ------------------------------------------------------------------------------------------------------- SEARING
describe("Y-INT: SEARING (searBurn 5) under the star switch", () => {
  it("its start BURN comes from no hit: no VENOM burnPlus, as ASH KINDLE's (Y6); SLOW EMBERS' % still applies", () => {
    const start = (b: Build) => new Battle(b, barge(), 8).sides[1].hull.burns.map((x) => [x.dps, x.t]);
    const venomBelt = () => bench([["venom", 4, 3, 3]]); // a VENOM ★3 (burnPlus 9 on) on the SEARING side's belt
    expect(start(W(venomBelt(), "searing"))).toEqual([[n("searing"), BURN_TIME]]);
    expect(start(W(venomBelt(), "searing", "slow_embers"))).toEqual([[n("searing"), BURN_TIME * 1.75]]);
    expect(n("searing")).toBe(5);
  });

  it("its no-HEAL rule holds while any of your BURN is on the foe: a VENOM-lengthened stack (BURN_TIME + burnPlus, Y6) too", () => {
    const bt = new Battle(W(bench([["venom", 4, 3, 1]]), "searing"), barge(), 8), foe = bt.sides[1];
    foe.hull.burns = [];
    const p = rigHit(bt); // the VENOM ★1's hit: burnPlus 3
    expect(p.burnPlus).toBe(3);
    land(bt, 0, 10, { burn: 2, burnPlus: p.burnPlus });
    expect(foe.hull.burns.map((x) => x.t)).toEqual([BURN_TIME + 3]); // the hit's stack lasts 6 s
    foe.hull.hp = foe.hull.max - 100;
    foe.hull.burns[0].t = 0.5; // 5.5 s on: past BURN_TIME, inside BURN_TIME + 3
    expect(bt.heal(foe, 40, "rune")).toBe(0);
    expect(foe.heals!.burnLost).toBe(40);
    foe.hull.burns = []; // the stack gone: it heals again
    expect(bt.heal(foe, 40, "rune")).toBe(40);
  });

  it("its BURN's ticks charge a foe's SPALL CATCHER by Y5's rule: a PLATE soak counts once (off: twice)", () => {
    const charge = () => {
      const bt = new Battle(W(barge(), "searing"), withMod(furnaceBench(), 60, "spallcatcher", 0, 1), SEED), foe = bt.sides[1];
      foe.plate.plate = 1000; // the plating soaks the whole tick
      while (bt.t < 1.05) { bt.step(); bt.events.length = 0; } // SEARING's first tick at 1 s; no shot has landed yet
      return [foe.hull.hp === foe.hull.max, bt.sides[0].stats.burnDealt, foe.turrets[0].spallCharge];
    };
    // 5 BURN x 10 a second = 50 soaked: on, 10 x 50 / 40 = 12.5; off, 10 x (2 x 50) / 40 = 25
    expect(charge()).toEqual([true, 50, 12.5]);
  });
});

// -------------------------------------------------------------------------------------------------- SHATTER SHOT
describe("Y-INT: SHATTER SHOT (shatterPct 14) under the star switch", () => {
  it("its +14% sits in runeMul's % sum: on, every Y rule's shot meets it as WARLORD'S DUE's (the same battle at 14 / its n wins)", () => {
    for (const [a, b, day, seed] of [["furnace", "weaver", 9, 5], ["bastion", "foundry", 9, 1], ["foundry", "furnace", 3, 7]] as const) {
      const A = heroRefBuild(a, day), B = heroRefBuild(b, day);
      const due = new Battle(W(A, "warlords_due"), B, seed);
      due.sides[0].wins = n("shatter_shot") / n("warlords_due");
      const shatter = new Battle(W(A, "shatter_shot"), B, seed);
      let shields = 0;
      while (!shatter.over && shatter.ticks < 60 * 200) { shatter.step(); shields += shatter.drainEvents().filter((e) => e.type === "shield").length; }
      expect(shields, `${a} v ${b}: no SHIELD met`).toBe(0);
      expect(end(shatter), `${a} v ${b} day ${day}`).toEqual(end(finish(due)));
      expect(end(shatter), `${a} v ${b}: not the plain battle`).not.toEqual(end(simulate(A, B, seed)));
    }
  });

  it("its broken SHIELD meets Y5's SPALL CATCHER: on, the hit lands on PLATE, then HULL, and charges the foe's SPALL, PLATE's soak once (off twice); a stopped hit charges nothing", () => {
    const hit = (rune: boolean) => {
      const bt = new Battle(rune ? W(barge(), "shatter_shot") : barge(), withMod(furnaceBench(), 60, "spallcatcher", 0, 1), SEED), foe = bt.sides[1];
      bt.gainShield(foe, 1);
      foe.plate.plate = 30;
      const hp = foe.hull.hp;
      land(bt, 0, 70);
      return [foe.shield, foe.blocked ?? 0, foe.plate.plate, hp - foe.hull.hp, foe.turrets[0].spallCharge ?? 0];
    };
    // 70 breaks the SHIELD, 30 on PLATE, 40 on HULL: on, 10 x (40 + 30) / 40 = 17.5; off, 10 x (40 + 2 x 30) / 40 = 25
    expect(hit(true)).toEqual([0, 0, 0, 40, 17.5]);
    // without the rune the SHIELD stops it whole: no PLATE, HULL or SPALL charge, on and off
    expect(hit(false)).toEqual([0, 1, 30, 0, 0]);
  });

  // Y7b1 (ruling Y7A-R3d): IRON WALL reads its base def on too, so its own +10 lifts the PLATE back first and it pays, as
  // off. Was "on, the hit eats the foe's PLATE below 120, so its IRON WALL stops paying and rolls no PLATE back (off: its +10
  // first, so it pays)", with on [0, 110, 0, 110] (the rune) and [0, 130, 30, 130] (no rune)
  it("its broken SHIELD meets IRON WALL: the hit eats the foe's PLATE below 120, but its own +10 first lifts it back, so it pays, on as off (Y7A-R3d)", () => {
    const after = (rune: boolean) => {
      const bt = new Battle(rigBench([["shieldwall", 4, 3, 1]]), rune ? W(barge(), "shatter_shot") : barge(), 8), wall = bt.sides[0];
      bt.gainShield(wall, 1);
      wall.plate.plate = 130;
      land(bt, 1, 20); // the SHATTER SHOT side's hit on the IRON WALL side
      const plate = wall.plate.plate, p = rigHit(bt, 0); // then the IRON WALL hits a slug
      return [wall.shield, plate, p.flat, wall.plate.plate];
    };
    expect(after(true)).toEqual([0, 110, 30, 120]); // on: its own plating (+10) first lifts 110 to 120, so it pays (Y7b1, Y7A-R3d: was [0, 110, 0, 110])
    expect(after(false)).toEqual([0, 130, 30, 140]); // on, no rune: the SHIELD stops it, 130 PLATE, +10, +30 (Y7b1, Y7A-R3d: was [0, 130, 30, 130])
  });
});

// ----------------------------------------------------------------------------------------- COAL CHUTE, HEAT SINK
describe("Y-INT: COAL CHUTE (heatPct 15) and HEAT SINK (heatPct 25) under the star switch", () => {
  type RideProbe = { rideOf(s: SideState, p: Payload): number };

  // Y7b1 (ruling Y7A-R1): was "on, a ★3 STOKER's KILN stamps at the full +70% with either rune as without", with the pace
  // 1.7 in each row (Y3's lifted cap); the cap holds on too now, so the KILN is held to the +25% its gun takes, as off
  it("they meet Y3's STOKER: on, a ★3 STOKER's KILN is held to its gun's pace with either rune as without, as off (Y7A-R1); the KILN slug's damage ride is +15% / +25% (rideOf), the stoke not in it", () => {
    const stoked = (runes: string[]) => {
      const bt = new Battle(W(withItem(heroStartBuild("furnace", 1), item(70, "stoker", 6, 6, 0, 3)), ...runes), barge(), 1), s = bt.sides[0], f = s.factories[0];
      while (bt.t < 3) { bt.step(); bt.events.length = 0; }
      return [Math.round((f.curPace! / f.pace) * 1000) / 1000, (bt as unknown as RideProbe).rideOf(s, { ...payload(), ammo: "cinder", ride: 2 })];
    };
    for (const [runes, mul] of [[[], 1], [["coal_chute"], 1.15], [["heat_sink"], 1.25]] as [string[], number][]) {
      const [pace, ride] = stoked(runes);
      expect(pace, runes.join()).toBeCloseTo(1.25, 2);
      expect(ride, runes.join()).toBe(2 * mul);
    }
    expect([n("coal_chute"), n("heat_sink")]).toEqual([15, 25]);
  });

  it("they meet Y3's ASSEMBLY LINE: on, ★3's HOT START is gone, so a HEAT JACKET on its belt gives its own HEAT (off: doubled till 4 s), and COAL CHUTE adds 15% to the HEAT each slug gains as it rides", () => {
    const asm = (): Build => {
      const b = rigBench([["heatjacket", 4, 4, 1]]);
      b.items[0] = { uid: 1, def: "assembly", x: 4, y: 6, ...starField(3) };
      return W(b, "coal_chute");
    };
    const slugs = () => {
      const bt = new Battle(asm(), barge(), 8), s = bt.sides[0];
      while (bt.t < 3) { bt.step(); bt.events.length = 0; }
      return s.routes.flatMap((r) => r.ammo.map((a) => a.p)).filter((p) => p.heat);
    };
    const onS = slugs();
    expect(onS.length).toBeGreaterThan(0);
    expect([...new Set(onS.map((p) => p.heat))]).toEqual([4]);
    for (const p of onS) expect(p.heatBonus! / p.heatRide!).toBeCloseTo(p.heat! * 1.15, 9);
  });

  it("they meet Y3's BELLOWS: on, BELLOWS counts the seconds ridden (uncapped), which neither rune lengthens: the same BURN with or without", () => {
    const bellows = (runes: string[]) => {
      const bt = new Battle(W(rigBench([["bellows", 4, 3, 3]]), ...runes), barge(), 8), s = bt.sides[0];
      for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
      const g = s.gates[0], h = g.hits[0], p = { ...payload(), ride: 9 };
      probe(bt).applyHit(s, { p, s: h.tile * CELL + CELL / 2, processed: h.tile, blocked: false }, h);
      return p.burn;
    };
    expect(bellows([])).toBe(3 * Math.floor(9 / 2)); // Y3: burn x floor(ride / per), uncapped
    expect(bellows(["coal_chute"])).toBe(bellows([]));
    expect(bellows(["heat_sink"])).toBe(bellows([]));
  });
});

// ---------------------------------------------------------------------------------------------------- the texts
describe("Y-INT: the four revived runes' texts with the switch on", () => {
  it("no RUNE_TEXT line, naming no retired word; each drawn line (one sentence) in the 225 px band", () => { // Y7b2 (the flip): was "as off (no STAR_RUNE_TEXT line), ..."
    const retired = new RegExp(`\\b(${RETIRED.join("|")})\\b`);
    for (const id of FOUR) {
      const r = RUNES[id];
      // CARD-2 (REQ-BFG-081, K3 a): SEARING's START: line says FIGHT START: on the card (runeText.ts RUNE_TEXT; RuneDef.text
      // stays), as every START: rune's does; the other three read RuneDef.text (was toBeUndefined for all four)
      if (id === "searing") expect(RUNE_TEXT[id], id).toBe(r.text.replace(/^START: /, "FIGHT START: "));
      else expect(RUNE_TEXT[id], id).toBeUndefined();
      const onT = [runeLine(r), runeTextOf(r), runeReminder(r)];
      for (const t of onT) expect(t, id).not.toMatch(retired);
      const drawn = runeSentenceSpans(r).map((l) => l.map((sp) => sp.t).join(""));
      for (const l of drawn) expect(px(l), `${id}: ${l}`).toBeLessThanOrEqual(BAND);
    }
    // SHATTER SHOT's reminder is its own (glossary.ts RUNE_NOTE), not SHIELD's row, on as off
    expect(runeReminder(RUNES.shatter_shot)).toBe("WARD: IT BREAKS; THE HIT STILL LANDS.");
    // CARD-2 (REQ-BFG-081, K3 a): the fight's start (was "START: THE FOE HAS 5 BURN.")
    expect(runeSentenceSpans(RUNES.searing).map((l) => l.map((sp) => sp.t).join(""))).toEqual(["FIGHT START: THE FOE HAS 5 BURN.", "FOE WITH YOUR BURN: NO HEAL."]);
    expect(runeSentenceSpans(RUNES.shatter_shot).map((l) => l.map((sp) => sp.t).join(""))).toEqual(["YOUR SHOTS: +14% DMG.", "YOUR HITS SHATTER WARD."]);
  });
});
