// Y3 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 20-32): THE 13 RIGS, one number each, with the star
// switch on (content.ts STAR_RULES, withStarRules). For each: its sim change, read off the hook it changes (Battle.applyHit
// on a payload set up for it) or a real battle, against the same scene with the switch off where the base differs; the
// walk (deck.ts walkRoute: the inspector's numbers and the bots' rating) where its numbers change; its face (one ability
// line at every star, inside the 225 px band of font.ts textWidth, no caveat and no star clause, its perk's name never on
// the face: ruling R-1); and its ⓘ LEVELS ladder, every line inside the band.
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type SideState } from "../src/sim/battle";
import { walkRoute, type Build } from "../src/sim/deck";
import { effectAt, starField } from "../src/sim/stars";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { faceAt, hasFace } from "../src/ui/faces";
import { statRow } from "../src/ui/icons";
import { STARS, barge, east, hitOnce, key as K, levels, lines, next, oneLine, rigBench } from "./y3.helpers";
import { SEED, item, latchDeck, withItem } from "./wave3.helpers";

/** The flat and BURN the walk's hit of `def` adds (its first timeline hit of that def). */
const walkHit = (b: Build, def: string) => {
  const th = walkRoute(b, 0).timeline.flatMap((r) => r.hits).find((h) => h.def === def)!;
  return { flat: th.flat ?? 0, burn: th.burn ?? 0 };
};

/** REAL BATTLE: the first slug past belt tile `tile` (its hits applied), every rig of side 0 online from the start. */
function slugPast(b: Build, tile: number): Payload {
  const bt = new Battle(b, barge(), 8), s = bt.sides[0];
  for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
  for (let i = 0; i < 60 * 30; i++) {
    bt.step();
    bt.events.length = 0;
    const a = s.routes[0].ammo.find((x) => x.processed >= tile);
    if (a) return a.p;
  }
  throw new Error(`no slug passed tile ${tile}`);
}

// ------------------------------------------------------------------------------------------------ row 20: PINCER
describe("Y3 row 20: PINCER: +20 for each other rig on its tile; no floor, no max", () => {
  it("data: on, flat 0 and no max at every star (off: the floor 10/22/35 and max 3)", () => {
    for (const s of STARS) {
      expect(effectAt("pincer", s).gate!.pincer, `★${s}`).toEqual({ flat: 0, each: [20, 44, 70][s - 1] });
    }
  });

  it("hook: on, a lone PINCER adds 0 (off 10) and one other working rig on its tile +20/+44/+70 (off +30/+66/+105); a STUNned one doesn't count", () => {
    for (const s of STARS) {
      const lone = rigBench([["pincer", 4, 3, s]]);
      expect(hitOnce(lone).flat, `lone ★${s}`).toBe(0);
      const pair = east(rigBench([["pincer", 4, 3, s]]), "whetstone", 4, 3);
      expect(hitOnce(pair).flat, `crossfire ★${s}`).toBe([20, 44, 70][s - 1]);
    }
    const pair = east(rigBench([["pincer", 4, 3, 1]]), "whetstone", 4, 3);
    expect(hitOnce(pair, (_p, _h, side) => { side.gates[1].disrupted = 2; }).flat).toBe(0);
  });

  it("battle: on, the first slug past a PINCER and a WHETSTONE on one tile carries 20 + 20 (off 20 + 30)", () => {
    const b = east(rigBench([["pincer", 4, 3, 1]]), "whetstone", 4, 3);
    expect(slugPast(b, 2).flat).toBe(40);
  });

  it("walk: on, a lone PINCER counts 0 (off 10)", () => {
    const b = rigBench([["pincer", 4, 3, 1]]);
    expect(walkHit(b, "pincer").flat).toBe(0);
  });

  it("face: HIT: +20/+44/+70 DMG FOR EACH OTHER RIG ON ITS TILE, one line in the band; ladder +20/+44/+70 DMG EACH", () => {
    expect(lines("pincer")).toEqual([20, 44, 70].map((d) => [`HIT: +${d} {DMG} FOR EACH OTHER RIG ON ITS TILE.`]));
    oneLine("pincer");
    expect(levels("pincer", 1)).toEqual(["[+20]/+44/+70 {DMG} EACH", next(2, "+44 {DMG} EACH")]);
    expect(levels("pincer", 3)).toEqual(["+20/+44/[+70] {DMG} EACH"]);
    expect(hasFace("pincer")).toBe(true);
  });
});

// -------------------------------------------------------------------------------------------- row 21: TWIN GAUGE
describe("Y3 row 21: TWIN GAUGE: +30 on a matched belt; nothing off one", () => {
  it("hook: on, +30/+66/+105 on a matched belt (off the same) and 0 off one (off the floor 10/22/35)", () => {
    for (const s of STARS) {
      const b = rigBench([["twingauge", 4, 3, s]]);
      const at = (matched: boolean) => hitOnce(b, (_p, h) => { h.matched = matched; }).flat;
      expect(at(true), `matched ★${s}`).toBe([30, 66, 105][s - 1]);
      expect(at(false), `unmatched ★${s}`).toBe(0);
    }
  });

  it("walk: on, the bench's lone belt (unmatched) counts 0 (off 10)", () => {
    const b = rigBench([["twingauge", 4, 3, 1]]);
    expect(walkHit(b, "twingauge").flat).toBe(0);
  });

  it("face: HIT: +30/+66/+105 DMG ON A MATCHED BELT; ladder DMG +30/+66/+105", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: MATCHED had no tap on this card): plain words, two lines of the op band
    expect(lines("twingauge")).toEqual([30, 66, 105].map((d) => [`HIT: +${d} {DMG} IF ANOTHER BELT INTO ITS TURRET IS AS LONG.`]));
    oneLine("twingauge", 2); // WORDS-1 (REQ-BFG-081): READ-1 6.1's plain words, two lines of the band (was one)
    expect(levels("twingauge", 1)).toEqual(["{DMG} [+30]/+66/+105", next(2, "+66 {DMG}")]);
    expect(hasFace("twingauge")).toBe(true);
  });
});

// ----------------------------------------------------------------------------------------------- row 22: BELLOWS
describe("Y3 row 22: BELLOWS: +1/+2/+3 BURN for each whole 2 s ridden, no cap", () => {
  it("hook: on, + burn x floor(ride / 2): 13 s ridden gives 6/12/18 (off: capped 4/9/14); 4 s 2/4/6 (off 1/3/5); 1.9 s none", () => {
    const at = (s: number, ride: number) => hitOnce(rigBench([["bellows", 4, 3, s]]), (p) => { p.ride = ride; }).burn;
    expect(STARS.map((s) => at(s, 13))).toEqual([6, 12, 18]);
    expect(STARS.map((s) => at(s, 4))).toEqual([2, 4, 6]);
    expect(STARS.map((s) => at(s, 1.9))).toEqual([0, 0, 0]);
  });

  it("walk: on, a ★3 BELLOWS on the last tile behind a ★1 BRAKE SHOE (4.2 s ridden at its centre) counts 3 x 2 = 6 (off floor(5.88) = 5)", () => {
    // the ride at tile 5's centre: tile 0's first half cell at speed 1 (0.2 s), then 5 half cells... at half speed (4 s)
    const b = rigBench([["brake", 4, 5, 1], ["bellows", 4, 0, 3]]);
    expect(walkHit(b, "bellows").burn).toBe(6);
  });

  it("face: HIT: +1/+2/+3 BURN FOR EACH 2 SEC RIDDEN; ladder BURN +1/+2/+3", () => {
    expect(lines("bellows")).toEqual([1, 2, 3].map((n) => [`HIT: +${n} {*BURN} FOR EACH 2{SEC} RIDDEN.`]));
    oneLine("bellows");
    expect(levels("bellows", 1)).toEqual(["{BURN} [+1]/+2/+3", next(2, "+2 {*BURN}")]);
    expect(hasFace("bellows")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------- row 23: QUENCH TANK
describe("Y3 row 23: QUENCH TANK turns each BURN into +30/+50/+70; no floor, no stack cap", () => {
  it("hook: on, 7 BURN turn into 210/350/490 and none stays (off: the floor + 4/5/6 stacks, 3/2/1 BURN left); no BURN, 0 (off 10/20/30)", () => {
    const at = (s: number, burn: number) => {
      const p = hitOnce(rigBench([["quench", 4, 3, s]]), (q) => { q.burn = burn; });
      return [p.flat, p.burn];
    };
    expect(STARS.map((s) => at(s, 7))).toEqual([[210, 0], [350, 0], [490, 0]]);
    expect(STARS.map((s) => at(s, 0)[0])).toEqual([0, 0, 0]);
  });

  it("battle: on, a slug with a ★3 TEMPER's 4 BURN past a QUENCH TANK carries 120 and no BURN (off 10 + 120, none left)", () => {
    const b = rigBench([["temper", 4, 4, 3], ["quench", 4, 3, 1]]);
    const a = slugPast(b, 2);
    expect([a.flat, a.burn]).toEqual([120, 0]);
  });

  it("face: HIT: TURNS EACH BURN INTO +30/+50/+70 DMG; ladder DMG +30/+50/+70", () => {
    expect(lines("quench")).toEqual([30, 50, 70].map((d) => [`HIT: TURNS EACH {*BURN} INTO +${d} {DMG}.`]));
    oneLine("quench");
    expect(levels("quench", 1)).toEqual(["{DMG} [+30]/+50/+70", next(2, "+50 {DMG}")]);
    expect(hasFace("quench")).toBe(true);
  });
});

/** REAL BATTLE: `b` against the barge for `secs` seconds (rigs come online as they do in play). */
function runFor(b: Build, secs: number): Battle {
  const bt = new Battle(b, barge(), 8);
  while (bt.t < secs && !bt.over) { bt.step(); bt.events.length = 0; }
  return bt;
}

// --------------------------------------------------------------------------------------------- row 24: LONG HAUL
describe("Y3 row 24: LONG HAUL counts every earlier hit (no MAX 6 at ★2/★3)", () => {
  it("hook: on, 8 earlier hits pay 80/160/280 (off ★2/★3 count 6: 120/210)", () => {
    const at = (s: number) => hitOnce(rigBench([["longhaul", 4, 3, s]]), (p) => { p.prior = 8; }).flat;
    expect(STARS.map((s) => at(s))).toEqual([80, 160, 280]);
  });

  it("face: today's line HIT: +10/+20/+35 DMG FOR EACH RIG BEFORE IT, no MAX 6 RIGS clause; ladder +10/+20/+35 DMG EACH", () => {
    expect(lines("longhaul")).toEqual([10, 20, 35].map((d) => [`HIT: +${d} {DMG} FOR EACH RIG BEFORE IT.`]));
    oneLine("longhaul");
    expect(levels("longhaul", 1)).toEqual(["[+10]/+20/+35 {DMG} EACH", next(2, "+20 {DMG} EACH")]);
  });
});

// ------------------------------------------------------------------------------------------ row 25: BARBED SPOOL
describe("Y3 row 25: BARBED SPOOL: +1/+2/+3 FRAY; the hull keeps FRAY's own MAX 15 (no RAZOR WIRE cap)", () => {
  it("hook: on, a ★3 hit adds 3 FRAY and no cap raise (off: frayCap 6)", () => {
    const p = hitOnce(rigBench([["barbed", 4, 3, 3]]));
    expect([p.fray, p.frayCap]).toEqual([3, 0]);
  });

  it("battle: on, 20 s of a ★3 BARBED SPOOL's slugs leave the enemy hull at MAX 15 FRAY (off: RAZOR WIRE's 21)", () => {
    const b = rigBench([["barbed", 4, 3, 3]]);
    const a = runFor(b, 20).sides[1].hull;
    expect(a.frayMax).toBe(15);
    expect(a.fray).toBeLessThanOrEqual(15);
  });

  // Y7b2 (the words): was "face: ...; ladder FRAY +1/+2/+3; RAZOR WIRE in the ⓘ view only"
  it("face: today's line HIT: +1/+2/+3 FRAY, no RAZOR WIRE clause; ladder FRAY +1/+2/+3; no RAZOR WIRE name, the ⓘ view's too (Y7b2: it left with its cap)", () => {
    expect(lines("barbed")).toEqual([1, 2, 3].map((n) => [`HIT: +${n} {*FRAY}.`]));
    oneLine("barbed");
    expect(levels("barbed", 1)).toEqual(["{FRAY} [+1]/+2/+3", next(2, "+2 {*FRAY}")]); // Y7b2 (the words): was ["{FRAY} [+1]/+2/+3", "★2 RAZOR WIRE", `${next(2, "+2 {*FRAY}")} ★2 RAZOR WIRE`]
  });
});

// ----------------------------------------------------------------------------------------- row 26: PLATE BREAKER
describe("Y3 row 26: PLATE BREAKER spends 10 PLATE for +40/+88/+140; no ELSE floor", () => {
  it("hook: on, with no PLATE it adds 0 (off the floor 10/22/35); with 20 PLATE it spends 10 for +40/+88/+140, as off", () => {
    for (const s of STARS) {
      const b = rigBench([["platebreaker", 4, 3, s]]);
      expect(hitOnce(b).flat, `bare ★${s}`).toBe(0);
      let side: SideState | undefined;
      const p = hitOnce(b, (_p, _h, sd) => { sd.plate.plate = 20; side = sd; });
      expect([p.flat, side!.plate.plate], `plated ★${s}`).toEqual([[40, 88, 140][s - 1], 10]);
    }
  });

  it("walk: on, an unplated deck's PLATE BREAKER counts 0 (off its floor 10)", () => {
    const b = rigBench([["platebreaker", 4, 3, 1]]);
    expect(walkHit(b, "platebreaker").flat).toBe(0);
  });

  it("face: HIT: SPENDS 10 PLATE FOR +40/+88/+140 DMG, one line (no ELSE line); ladder DMG +40/+88/+140", () => {
    expect(lines("platebreaker")).toEqual([40, 88, 140].map((d) => [`HIT: SPENDS 10 {*PLATE} FOR +${d} {DMG}.`]));
    oneLine("platebreaker");
    expect(levels("platebreaker", 1)).toEqual(["{DMG} [+40]/+88/+140", next(2, "+88 {DMG}")]);
  });
});

// ------------------------------------------------------------------------------------------- row 27: BRAKE SHOE
describe("Y3 row 27: BRAKE SHOE ★2/★3 slow the belt to 40% / 30% and lose their flats", () => {
  it("hook: on, ★2/★3 add no damage (off HOT SHOE's 20, RED-HOT SHOE's 50)", () => {
    const at = (s: number) => hitOnce(rigBench([["brake", 4, 3, s]])).flat;
    expect(STARS.map((s) => at(s))).toEqual([0, 0, 0]);
  });

  it("battle: on, the belt runs at 50% / 40% / 30% from its tile on (off 50% at every star)", () => {
    for (const s of STARS) {
      const b = rigBench([["brake", 4, 3, s]]);
      const speed = () => { const r = runFor(b, 3).sides[0].routes[0]; return [r.speedAt[1], r.speedAt[2], r.speedAt[5]]; };
      expect(speed(), `★${s}`).toEqual([1, [0.5, 0.4, 0.3][s - 1], [0.5, 0.4, 0.3][s - 1]]);
    }
  });

  it("walk: on, a ★3 BRAKE SHOE's belt takes longer and its hit adds nothing (off +50)", () => {
    const b = rigBench([["brake", 4, 3, 3]]);
    expect(walkHit(b, "brake").flat).toBe(0);
  });

  // Y7b2 (the words): was "face: ...; ladder 50%/40%/30% SPEED; perks in the ⓘ view only"
  it("face: today's line ITS BELT RUNS AT 50%/40%/30% SPEED, no HOT SHOE clause; ladder 50%/40%/30% SPEED; no perk names, the ⓘ view's too (Y7b2: they left with the flats)", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: read as the whole belt): FROM THIS TILE ON
    expect(lines("brake")).toEqual(["50%", "40%", "30%"].map((p) => [`ITS BELT RUNS AT ${p} SPEED FROM THIS TILE ON.`]));
    oneLine("brake", 2); // WORDS-1 (REQ-BFG-081): READ-1 6.1's plain words, two lines of the band (was one)
    expect(levels("brake", 1)).toEqual(["[50%]/40%/30% SPEED", next(2, "40% SPEED")]); // Y7b2 (the words): was ["[50%]/40%/30% SPEED", "★2 HOT SHOE", "★3 RED-HOT SHOE", `${next(2, "40% SPEED")} ★2 HOT SHOE`]
  });
});

// ------------------------------------------------------------------------------------------- row 28: SURGE VALVE
describe("Y3 row 28: SURGE VALVE: every 3/3/2 s, +10/+20/+30 to every slug on its belts; no speed pulse", () => {
  /** The bench with a ★`s` SURGE VALVE on tile 2 ((4,3)), every rig online from the start: each slug's flat just before
   *  and just after the pulse of 3 s (ticks 170 and 190), for the slugs on the belt both times, with where it was. */
  const aroundPulse = (s: number, stun = false) => {
    const bt = new Battle(rigBench([["surge", 4, 3, s]]), barge(), 8), side = bt.sides[0], r = side.routes[0];
    for (const g of side.gates) { g.online = true; g.commissionAt = 0; }
    side.factories[0].pace = 4; // the KILN stamps 4 times as often, so several slugs ride the short belt at once
    const snap = () => new Map(r.ammo.map((a) => [a.p.id, { flat: a.p.flat, tile: a.processed }]));
    while (bt.ticks < 170) { bt.step(); bt.events.length = 0; }
    if (stun) side.gates[0].disrupted = 2;
    const before = snap();
    while (bt.ticks < 190) { bt.step(); bt.events.length = 0; }
    const after = snap();
    return [...before].filter(([id]) => after.has(id)).map(([id, b]) => ({ tile: b.tile, gained: after.get(id)!.flat - b.flat }));
  };

  it("battle: on, at the 3 s pulse every slug on its belt gains +10 once, before its tile too (off: only those it speeds past it)", () => {
    const a = aroundPulse(1);
    expect(a.length).toBeGreaterThan(1);
    expect(a.map((x) => x.gained)).toEqual(a.map(() => 10));
    expect(a.some((x) => x.tile < 2)).toBe(true); // a slug before the valve's tile gained it
  });

  it("battle: on, a STUNned valve misses that pulse", () => {
    expect(aroundPulse(1, true).map((x) => x.gained).every((g) => g === 0)).toBe(true);
  });

  it("battle: on, its belt never speeds up (off: 3 times as fast for 1 s of every 3)", () => {
    const top = () => {
      const bt = new Battle(rigBench([["surge", 4, 3, 1]]), barge(), 8);
      let m = 0;
      while (bt.t < 8) { bt.step(); bt.events.length = 0; m = Math.max(m, ...bt.sides[0].routes[0].speedAt); }
      return m;
    };
    expect(top()).toBe(1);
  });

  it("walk: on, no speed, and +10 x the seconds the slug rides its belt / 3 (off: +10 once, 1 + 2/3 speed)", () => {
    const b = rigBench([["surge", 4, 3, 1]]);
    const w = walkRoute(b, 0), th = w.timeline.flatMap((r) => r.hits).find((h) => h.def === "surge")!;
    expect(th.speed).toBeUndefined();
    expect(th.flat!).toBeCloseTo((10 * w.estimate.time) / 3, 9);
  });

  it("data: on, no lockedFlat (the damage pulse lands on a locked belt too; off 30/60/100)", () => {
    expect(STARS.map((s) => effectAt("surge", s).gate!.lockedFlat)).toEqual([undefined, undefined, undefined]);
  });

  it("face: EVERY 3/3/2 SEC: +10/+20/+30 DMG TO SLUGS ON ITS BELTS, one line (was 2 effects, 300 px at ★2); ladders EVERY 3/3/2 SEC, DMG +10/+20/+30", () => {
    expect(lines("surge")).toEqual([[3, 10], [3, 20], [2, 30]].map(([t, d]) => [`EVERY ${t}{SEC}: +${d} {DMG} TO SLUGS ON ITS BELTS.`]));
    oneLine("surge");
    expect(levels("surge", 1)).toEqual(["EVERY [3]/3/2{SEC}", "{DMG} [+10]/+20/+30", "★2 OVERPRESSURE", "★3 HAMMER VALVE",
      `${next(2, "+20 {DMG}")} ★2 OVERPRESSURE`]);
  });
});

// ------------------------------------------------------------------------------------------- row 29: OVERCLOCKER
describe("Y3 row 29: OVERCLOCKER charges the next rig, whatever it is", () => {
  // the bench: an OVERCLOCKER on tile 1, a GREASE WORKS (a speed rig) on tile 2, a WHETSTONE (+20) on tile 3
  const b = () => rigBench([["overclocker", 4, 4, 1], ["grease", 4, 3, 1], ["whetstone", 4, 2, 1]]);

  it("sim: on, its target is the GREASE WORKS, the first later rig (off: the WHETSTONE, the first it can double)", () => {
    expect(new Battle(b(), barge(), 8).sides[0].gates.map((g) => g.boostedBy.length)).toEqual([0, 1, 0]);
  });

  it("battle: on, the charge is spent on the GREASE WORKS and the WHETSTONE adds 20 (off: doubled, 40); before a damage rig, doubled either way", () => {
    expect(slugPast(b(), 3).flat).toBe(20);
    const d = rigBench([["overclocker", 4, 4, 1], ["whetstone", 4, 3, 1]]);
    expect(slugPast(d, 2).flat).toBe(40);
  });

  it("face: EVERY 4/2/1 SEC: DOUBLES THE NEXT RIG'S HIT, no caveat; ladder EVERY 4/2/1 SEC", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: NEXT RIG'S read as the next in time): which rig, in plain words
    expect(lines("overclocker")).toEqual([4, 2, 1].map((t) => [`EVERY ${t}{SEC}: THE NEXT RIG DOWN ITS BELT HITS TWICE.`]));
    oneLine("overclocker", 2); // WORDS-1 (REQ-BFG-081): READ-1 6.1's plain words, two lines of the band (was one)
    expect(levels("overclocker", 1)).toEqual(["EVERY [4]/2/1{SEC}", next(2, "EVERY 2{SEC}")]);
  });
});

// -------------------------------------------------------------------------------------------- row 30: TWIN LATCH
describe("Y3 row 30: TWIN LATCH holds a slug up to 1/2/3 s to make a PAIR; no flat", () => {
  it("data: on, hold 1/2/3 s and flat 0 (off 1 s at every star, +10/+22/+35)", () => {
    expect(STARS.map((s) => effectAt("twinlatch", s).gate!.latch)).toEqual([{ hold: 1, flat: 0 }, { hold: 2, flat: 0 }, { hold: 3, flat: 0 }]);
  });

  it("hook: on, its hit adds nothing (off +10/+22/+35)", () => {
    const at = (s: number) => hitOnce(rigBench([["twinlatch", 4, 3, s]])).flat;
    expect(STARS.map((s) => at(s))).toEqual([0, 0, 0]);
  });

  it("battle: on, with nothing on its other belt each slug goes alone after 1/2/3 s (off 1 s at every star)", () => {
    /** The latch deck (tests/wave3.helpers.ts) with a ★`s` latch between its belts; belt B's press held STUNned. */
    const gaps = (s: number): number[] => {
      const bt = new Battle(withItem(latchDeck(), item(40, "twinlatch", 4, 3, 0, s)), barge(), SEED), holds: number[] = [], rel: number[] = [];
      while (bt.t < 14) {
        bt.sides[0].factories.find((f) => f.uid === 3)!.disrupted = 1;
        bt.step();
        for (const e of bt.drainEvents()) { if (e.type === "hold") holds.push(bt.t); if (e.type === "release") rel.push(bt.t); }
      }
      expect(holds.length, `★${s}`).toBeGreaterThan(2);
      return rel.map((t, i) => Math.round((t - holds[i]) * 1000) / 1000);
    };
    for (const s of STARS) {
      expect(new Set(gaps(s)), `★${s}`).toEqual(new Set([s]));
    }
  });

  it("face: HIT: HOLDS A SLUG UP TO 1/2/3 SEC TO MAKE A PAIR, one line; ladder UP TO 1/2/3 SEC", () => {
    expect(lines("twinlatch")).toEqual([1, 2, 3].map((t) => [`HIT: HOLDS A {SLUG} UP TO ${t}{SEC} TO MAKE A {*PAIR}.`]));
    oneLine("twinlatch");
    expect(levels("twinlatch", 1)).toEqual(["UP TO [1]/2/3{SEC}", next(2, "UP TO 2{SEC}")]);
    expect(hasFace("twinlatch")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ row 31: STOKER
describe("Y3 row 31: STOKER's factories work 20%/44%/70% faster; Y7b1 (ruling Y7A-R1): the cap holds on too", () => { // Y7b1 (Y7A-R1): was "...faster; no cap"
  /** FURNACE's start deck with a ★`s` STOKER at (6,6) on its Kiln (tests/stokerCap.test.ts): the Kiln's stamp pace over
   *  its own after 3 s (the stoker online). */
  const paceUp = (s: number): number => {
    const bt = new Battle(withItem(heroStartBuild("furnace", 1), item(70, "stoker", 6, 6, 0, s)), barge(), 1), f = bt.sides[0].factories[0];
    while (bt.t < 3) { bt.step(); bt.events.length = 0; }
    return f.curPace! / f.pace;
  };

  // Y7b1 (ruling Y7A-R1): was "on, a ★2/★3 STOKER's Kiln stamps at the full +44% / +70% though its gun takes only +25%",
  // with paceUp(2, true) 1.44 and paceUp(3, true) 1.7 (the overfeed trap)
  it("battle: on, a ★2/★3 STOKER's Kiln is held to the +25% its gun takes, as off (Y7A-R1)", () => {
    expect(paceUp(2)).toBeCloseTo(1.25, 2);
    expect(paceUp(3)).toBeCloseTo(1.25, 2);
    expect(Math.round(paceUp(1) * 100) / 100).toBe(1.2); // ★1 fits under the gun
  });

  it("face: ITS FACTORIES WORK UP TO 20%/44%/70% FASTER (Y7A-R1: the cap in its line), no caveat; ladder 20%/44%/70% FASTER", () => {
    expect(lines("stoker")).toEqual(["20%", "44%", "70%"].map((p) => [`ITS FACTORIES WORK UP TO ${p} FASTER.`])); // Y7b1 (Y7A-R1): was `ITS FACTORIES WORK ${p} FASTER.`
    oneLine("stoker");
    expect(levels("stoker", 1)).toEqual(["[20%]/44%/70% FASTER", next(2, "44% FASTER")]);
  });
});

// ----------------------------------------------------------------------------------------- row 32: ASSEMBLY LINE
describe("Y3 row 32: ASSEMBLY LINE: your rigs start 50%/75%/100% sooner, its own belt's too; no HOT START", () => {
  /** The bench with an ASSEMBLY LINE (★`s`) in the Kiln's place: WHETSTONEs on its belt's tiles 2 and 4 (ranks 0, 1), and a
   *  STAMP PRESS (uid 7) on a second belt into the same gun with a WHETSTONE (rank 0 there). */
  const asm = (s: number): Build => {
    const b = rigBench([["whetstone", 4, 3, 1], ["whetstone", 4, 1, 1]]);
    b.items[0] = { uid: 1, def: "assembly", x: 4, y: 6, ...starField(s) };
    b.items.push({ uid: 7, def: "press", x: 6, y: 6 });
    b.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
    return east(b, "whetstone", 5, 3);
  };
  const online = (s: number) => new Battle(asm(s), barge(), 8).sides[0].gates.map((g) => Math.round(g.commissionAt * 1000) / 1000);

  it("sim: on, its own belt's rigs come online at x0.5 / x0.25 / x0 of their time like every rig (off: at once); the other belt's as before", () => {
    expect(online(1)).toEqual([0.6, 0.9, 0.6]);
    expect(online(2)).toEqual([0.3, 0.45, 0.3]);
    expect(online(3)).toEqual([0, 0, 0]);
  });

  it("sim: on, ★3 HOT START is gone: no rig of its belt is overclocked, and the first slug past a WHETSTONE gains 20 (off: doubled, 40)", () => {
    expect(new Battle(asm(3), barge(), 8).sides[0].gates.map((g) => g.hotUntil)).toEqual([undefined, undefined, undefined]);
    expect(slugPast(asm(3), 2).flat).toBe(20);
  });

  // Y7b2 (the words): was "face: ...; ladders DMG 30/45/60, 50%/75%/100% SOONER; HOT START in the ⓘ view only"
  // TXT-096 (REVIEW-TXT095 Q2): the line says its condition, FEEDS A GUN, and ★3 says AT ONCE (commission 0: the sim test
  // above, online(3) [0, 0, 0]; tests/txt096.faces.test.ts pins both); was "YOUR RIGS START 50%/75%/100% SOONER." with the
  // ladder "[50%]/75%/100% SOONER" (★3's AT ONCE has no number, so the ladder lists the three forms)
  it("face: RATE 17, DMG 30/45/60, BELT 2/3/4; FEEDS A GUN: YOUR RIGS START 50% SOONER/75% SOONER/AT ONCE; ladders DMG 30/45/60, 50% SOONER/75% SOONER/AT ONCE; no HOT START name, the ⓘ view's too (Y7b2, TXT-096)", () => {
    expect(lines("assembly")).toEqual(["50% SOONER", "75% SOONER", "AT ONCE"].map((p) => [`FEEDS A GUN: YOUR RIGS START ${p}.`]));
    expect(faceAt("assembly", 1)!.stats).toEqual([["RATE", "17"], ["DMG", "30"], ["BELT", "2"]]);
    oneLine("assembly");
    // Y7b2 (the words): was [..., "[50%]/75%/100% SOONER", "★3 HOT START", `NEXT ★2: ...`] (the name left with its rule)
    expect(levels("assembly", 1)).toEqual(["{DMG} [30]/45/60", "{BELT} [2]/3/4", "[50% SOONER]/75% SOONER/AT ONCE",
      `NEXT ★2: ${statRow([["DMG", "45"], ["BELT", "3"]])}, 75% SOONER`]);
    expect(hasFace("assembly")).toBe(true);
  });
});
