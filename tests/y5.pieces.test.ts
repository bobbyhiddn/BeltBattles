// Y5 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 41-47; REVIEW-STARD answer 2: the crit-free
// one-liners, no crit or ramp): one number each, with the star switch on (content.ts STAR_RULES, withStarRules). For each:
// its data; its sim change, read off a hook (Battle.applyHit, Battle.spallCharge) or a real battle (the capacitor's charge,
// the keg's blasts), against the same scene with the switch off where the base differs; its face (one ability line at
// every star, inside the 225 px band of font.ts textWidth, no caveat and no star clause, its perk's name never on the face:
// ruling R-1); and its ⓘ LEVELS ladder, every line inside the band.
import { describe, expect, it } from "vitest";
import { Battle, type SideState, type TurretState } from "../src/sim/battle";
import { withStarRules } from "../src/sim/content";
import { type Build } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { faceAt, hasFace } from "../src/ui/faces";
import { STARS, hitOnce, levels, lines, next, on, oneLine, px, rigBench } from "./y3.helpers";
import { SEED, barge, furnaceBench, withMod } from "./wave3.helpers";

/** The turrets' private SPALL CATCHER hook (Battle.spallCharge: damage side s takes, its hull's part and plating's). */
type SpallProbe = { spallCharge(s: SideState, hull: number, plate: number): void };

// -------------------------------------------------------------------------------------------- row 41: COUNTERWEIGHT
describe("Y5 row 41: COUNTERWEIGHT: +5/+11/+18 for each tile ridden, no cap", () => {
  const EACH = [5, 11, 18], MAX = [60, 130, 210];

  it("data: on, perTile { each } with no max (off: max 60/130/210)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("counterweight", s).gate), `★${s}`).toEqual({ perTile: { each: EACH[s - 1] } });
      expect(effectAt("counterweight", s).gate, `★${s} off`).toEqual({ perTile: { each: EACH[s - 1], max: MAX[s - 1] } });
    }
  });

  it("hook: a slug past 12 tiles (20 more on its journey) gains each x every tile (off: capped at 60/130/210)", () => {
    for (const s of STARS) {
      const b = rigBench([["counterweight", 4, 3, s]]);
      let tile = -1;
      const pOn = hitOnce(b, true, (p, h) => { p.journeyOffset = 20; tile = h.tile; });
      const pOff = hitOnce(b, false, (p) => { p.journeyOffset = 20; });
      expect(tile + 20, `★${s} tiles`).toBeGreaterThan(12);
      expect(pOn.flat, `★${s} on`).toBe((tile + 20) * EACH[s - 1]);
      expect(pOff.flat, `★${s} off`).toBe(MAX[s - 1]);
    }
  });

  it("hook: under the cap both are the same (each x the tiles ridden)", () => {
    const b = rigBench([["counterweight", 4, 3, 1]]);
    let tile = -1;
    const pOn = hitOnce(b, true, (p, h) => { tile = h.tile; });
    expect(pOn.flat).toBe(tile * 5);
    expect(hitOnce(b, false).flat).toBe(pOn.flat);
  });

  it("face: one line, HIT: +5 {DMG} FOR EACH TILE RIDDEN. (171 px at ★2/★3, DESIGN-Y's widest); ladder +5/+11/+18 {DMG} EACH", () => {
    oneLine("counterweight");
    expect(lines("counterweight")).toEqual(EACH.map((d) => [`HIT: +${d} {DMG} FOR EACH TILE RIDDEN.`]));
    expect(lines("counterweight").map((l) => px(l[0]))).toEqual([165, 171, 171]);
    expect(levels("counterweight", 1)).toEqual(["[+5]/+11/+18 {DMG} EACH", next(2, "+11 {DMG} EACH")]);
    expect(levels("counterweight", 3)).toEqual(["+5/+11/[+18] {DMG} EACH"]);
    // off: a RULES piece, no face (identity)
    expect([hasFace("counterweight"), on(() => hasFace("counterweight"))]).toEqual([false, true]);
  });
});

// ------------------------------------------------------------------------------------------- row 42: CAPACITOR BANK
describe("Y5 row 42: CAPACITOR BANK: +20/+44/+70 for each second its chamber sat empty, no cap", () => {
  /** Side 0's turret (a CAPACITOR BANK at `stars` on FURNACE's heavy gun, its KILN STUNned for the first 10 s, so no load
   *  comes): its charge when its first load reaches the chamber, and after its first shot. */
  function starved(star: boolean, stars = 1): { atLoad: number; loadT: number; afterShot: number } {
    return withStarRules(() => {
      const bt = new Battle(withMod(furnaceBench(), 60, "capacitor", 0, stars), barge(), SEED);
      bt.sides[0].factories[0].disrupted = 10;
      const tu = bt.sides[0].turrets[0];
      let atLoad = -1, loadT = -1, afterShot = -1, fired = false;
      while (bt.t < 25 && !bt.over && afterShot < 0) {
        const before = tu.charge;
        bt.step();
        for (const e of bt.drainEvents()) {
          if ((e as { side?: number }).side !== 0) continue;
          if (e.type === "load" && atLoad < 0) { atLoad = before; loadT = bt.t; }
          if (e.type === "fire") fired = true;
        }
        if (fired && afterShot < 0) afterShot = tu.charge;
      }
      return { atLoad, loadT, afterShot };
    }, star);
  }

  it("data: on, no maxSeconds (off: 5 s at every star); perSecond 20/44/70 either way", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("capacitor", s).core), `★${s}`).toEqual({ routine: "capacitor", perSecond: [20, 44, 70][s - 1] });
      expect(effectAt("capacitor", s).core, `★${s} off`).toEqual({ routine: "capacitor", perSecond: [20, 44, 70][s - 1], maxSeconds: 5 });
    }
  });

  it("battle: a gun starved past 5 s charges for every second its chamber sat empty (off: 5 s); the shot spends it", () => {
    const onR = starved(true), offR = starved(false);
    expect(onR.loadT).toBeGreaterThan(10);
    // the chamber sat empty from the start to its first load, one tick short of it (the load's own tick adds none)
    expect(Math.abs(onR.atLoad - (onR.loadT - 1 / 60))).toBeLessThanOrEqual(2 / 60);
    expect(onR.atLoad).toBeGreaterThan(10);
    expect(offR.atLoad).toBe(5);
    expect([onR.afterShot, offR.afterShot]).toEqual([0, 0]);
  });

  it("face: one line, SHOT: +20 {DMG} FOR EACH SEC IT SAT EMPTY. (203 px); ladder {DMG} +20/+44/+70", () => {
    oneLine("capacitor");
    expect(lines("capacitor")).toEqual([20, 44, 70].map((d) => [`SHOT: +${d} {DMG} FOR EACH SEC IT SAT EMPTY.`]));
    expect(px(lines("capacitor")[0][0])).toBe(203);
    expect(levels("capacitor", 1)).toEqual(["{DMG} [+20]/+44/+70", next(2, "+44 {DMG}")]);
    expect([hasFace("capacitor"), on(() => hasFace("capacitor"))]).toEqual([false, true]);
  });
});

// ------------------------------------------------------------------------------------------------ row 43: LONGCASE
describe("Y5 row 43: LONGCASE: +15/+25/+40 if its slug rode 2 s; no sim change", () => {
  it("data: the same on and off (longRideFlat 15/25/40, longRideMin 2)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("longcase", s).mod), `★${s}`).toEqual({ longRideFlat: [15, 25, 40][s - 1], longRideMin: 2 });
      expect(effectAt("longcase", s).mod).toEqual(on(() => effectAt("longcase", s).mod));
    }
  });

  it("face: one line, SHOT: +15 {DMG} IF ITS {SLUG} RODE 2{SEC}. (151 px), no METRONOME sentence; ladder {DMG} +15/+25/+40", () => {
    oneLine("longcase");
    expect(lines("longcase")).toEqual([15, 25, 40].map((d) => [`SHOT: +${d} {DMG} IF ITS {SLUG} RODE 2{SEC}.`]));
    expect(px(lines("longcase")[0][0])).toBe(151);
    for (const s of STARS) expect(on(() => JSON.stringify(faceAt("longcase", s)))).not.toMatch(/METRONOME|PENDULUM/);
    // its perks' names (DEEP WIND, FULL WIND) in the ⓘ view only (R-1)
    expect(levels("longcase", 1)).toEqual(["{DMG} [+15]/+25/+40", "★2 DEEP WIND", "★3 FULL WIND", `${next(2, "+25 {DMG}")} ★2 DEEP WIND`]);
    expect([hasFace("longcase"), on(() => hasFace("longcase"))]).toEqual([false, true]);
  });
});

// ------------------------------------------------------------------------------------------- row 47: SPALL CATCHER
describe("Y5 row 47: SPALL CATCHER: a PLATE soak counts once, and no cap", () => {
  /** A SPALL CATCHER at `stars` on side 0's gun; the damage (its hull's part, plating's part) handed to its hook; the turret
   *  after. */
  function charged(star: boolean, stars: number, hull: number, plate: number): TurretState {
    return withStarRules(() => {
      const b: Build = withMod(furnaceBench(), 60, "spallcatcher", 0, stars);
      const bt = new Battle(b, barge(), SEED), s = bt.sides[0];
      (bt as unknown as SpallProbe).spallCharge(s, hull, plate);
      return s.turrets[0];
    }, star);
  }
  const ADD = [10, 22, 35], MAX = [80, 176, 280];

  it("data: on, spall { every 40, add 10/22/35 } with no max (off: max 80/176/280)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("spallcatcher", s).mod), `★${s}`).toEqual({ spall: { every: 40, add: ADD[s - 1] } });
      expect(effectAt("spallcatcher", s).mod, `★${s} off`).toEqual({ spall: { every: 40, add: ADD[s - 1], max: MAX[s - 1] } });
    }
  });

  it("hook: 40 damage plating soaks charges add once (off: twice)", () => {
    for (const s of STARS) {
      expect(charged(true, s, 0, 40).spallCharge, `★${s} on`).toBe(ADD[s - 1]);
      expect(charged(false, s, 0, 40).spallCharge, `★${s} off`).toBe(2 * ADD[s - 1]);
      // hull damage counts as before
      expect(charged(true, s, 40, 0).spallCharge).toBe(charged(false, s, 40, 0).spallCharge);
    }
  });

  it("hook: 2,000 damage charges add x 50, past the old cap (off: the cap 80/176/280)", () => {
    for (const s of STARS) {
      expect(charged(true, s, 2000, 0).spallCharge, `★${s} on`).toBe(50 * ADD[s - 1]);
      expect(charged(false, s, 2000, 0).spallCharge, `★${s} off`).toBe(MAX[s - 1]);
    }
  });

  it("face: today's line (197 px), its caveat and its cap's number gone; ladder {DMG} +10/+22/+35", () => {
    oneLine("spallcatcher");
    expect(lines("spallcatcher")).toEqual(ADD.map((d) => [`EVERY 40 {DMG} YOU TAKE: NEXT SHOT +${d} {DMG}.`]));
    expect(lines("spallcatcher")).toEqual(lines("spallcatcher", false));
    expect(Math.max(...lines("spallcatcher").map((l) => px(l[0])))).toBe(197);
    expect(levels("spallcatcher", 1)).toEqual(["{DMG} [+10]/+22/+35", next(2, "+22 {DMG}")]);
    // off: the caveat and the cap's MAX on the ladder, as before
    expect(withStarRules(() => faceAt("spallcatcher", 1)!.caveats, false)).toEqual(["{*PLATE} SOAKS COUNT TWICE. MAX 80 {DMG}."]);
    expect(levels("spallcatcher", 1, false)).toEqual(["{DMG} [+10]/+22/+35", "MAX [80]/176/280 {DMG}", next(2, "+22 {DMG}, MAX 176 {DMG}")]);
  });
});
