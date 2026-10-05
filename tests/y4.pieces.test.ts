// Y4 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 33-40): THE 4 GEAR AND 4 CORES, one number each, with the
// star switch on (content.ts STAR_RULES, withStarRules). For each: its data; its sim change, read off the turret the battle
// builds (makeTurret: window, load time, store, no-jam, speed, the core's cadence) or a real battle (its shots, loads,
// plating, projectiles), against the same scene with the switch off where the base differs; its face (one ability line at
// every star, inside the 225 px band of font.ts textWidth, no caveat and no star clause, its perk's name never on the face:
// ruling R-1); and its ⓘ LEVELS ladder, every line inside the band. Two numbers follow cap's ruling e91c08dd12466357: TWIN
// TRIGGER ★3's pairBonus 95 (the ladder's) and ROTARY BREECH ★2's load time 0.525 s (exactly 65% sooner).
import { describe, expect, it } from "vitest";
import { Battle, LOAD_FLOOR, type SimEvent, type TurretState } from "../src/sim/battle";
import { ITEMS, WINDOW_TIME, secPer, withStarRules } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { steamInterval } from "../src/sim/cores";
import { faceAt, hasFace } from "../src/ui/faces";
import { STARS, levels, lines, next, on, oneLine, rigBench } from "./y3.helpers";
import { SEED, barge, furnaceBench, twoPress, withMod } from "./wave3.helpers";

/** Side 0's turret 0 as the battle builds it (makeTurret), with the switch on or off. */
const turret = (b: Build, star: boolean): TurretState => withStarRules(() => new Battle(b, barge(), SEED).sides[0].turrets[0], star);

/** A battle of `b` against the barge for `secs`, every rig of side 0 online from the start, with the switch on or off:
 *  each tick's events of side 0 with the tick's time, and the battle at its end. */
function fight(b: Build, star: boolean, secs = 20, setup: (bt: Battle) => void = () => {}): { ev: { t: number; e: SimEvent }[]; bt: Battle; maxStore: number } {
  return withStarRules(() => {
    const bt = new Battle(b, barge(), SEED), s = bt.sides[0];
    for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
    setup(bt);
    const ev: { t: number; e: SimEvent }[] = [];
    let maxStore = 0;
    while (bt.t < secs && !bt.over) {
      bt.step();
      for (const e of bt.drainEvents()) if ((e as { side?: number }).side === 0) ev.push({ t: bt.t, e });
      maxStore = Math.max(maxStore, s.turrets[0].store.length);
    }
    return { ev, bt, maxStore };
  }, star);
}
const typed = <T extends SimEvent["type"]>(ev: { t: number; e: SimEvent }[], type: T) =>
  ev.filter((x) => x.e.type === type) as { t: number; e: Extract<SimEvent, { type: T }> }[];
/** The seconds from side 0's first load to its first shot. */
const firstWait = (b: Build, star: boolean): number => {
  const { ev } = fight(b, star, 8);
  return typed(ev, "fire")[0].t - typed(ev, "load")[0].t;
};
/** The most loads side 0's turret fired on one tick (one shot). */
const mostPerShot = (b: Build, star: boolean): number => {
  const per = new Map<number, number>();
  for (const x of typed(fight(b, star, 20).ev, "fire")) per.set(x.t, (per.get(x.t) ?? 0) + 1);
  return Math.max(...per.values());
};
const TICK_S = 1 / 60;

// ---------------------------------------------------------------------------------------------------- row 33: HOPPER
describe("Y4 row 33: HOPPER: its chamber holds +1/+2/+3; no load time, store or no-jam", () => {
  it("data: on, mod { window: 1/2/3 } only (off: +1 slot and +0.5 s at every star, ★2/★3 a store of 1/2, ★3 no-jam)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("hopper", s).mod), `★${s}`).toEqual({ window: s });
      expect(effectAt("hopper", s).mod).toEqual({ window: 1, windowTime: 0.5, ...(s > 1 ? { store: s - 1 } : {}), ...(s === 3 ? { noJam: true } : {}) });
    }
  });

  it("turret: on, a SCRAP CANNON (3 loads) holds 4/5/6 at WINDOW_TIME's load time, stores nothing, can jam (off: 4, 2 s, store 0/1/2, ★3 never jams)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "hopper", 0, s);
      const pick = (tu: TurretState) => [tu.window, tu.windowTime, tu.storeMax, tu.noJam];
      expect(pick(turret(b, true)), `on ★${s}`).toEqual([3 + s, WINDOW_TIME, 0, false]);
      expect(pick(turret(b, false)), `off ★${s}`).toEqual([4, WINDOW_TIME + 0.5, s - 1, s === 3]);
    }
  });

  it("battle: on, a sparse gun's first shot leaves WINDOW_TIME after its first load (off: 0.5 s later)", () => {
    // the KILN stamps every 1.25 s, so a 4-load chamber is never full before its load time ends
    const b = withMod(furnaceBench(), 60, "hopper", 0, 1);
    expect(Math.abs(firstWait(b, true) - WINDOW_TIME)).toBeLessThanOrEqual(2 * TICK_S);
    expect(Math.abs(firstWait(b, false) - (WINDOW_TIME + 0.5))).toBeLessThanOrEqual(2 * TICK_S);
  });

  it("battle: on, a busy ★3 gun (two STAMP PRESSes) stores no load and jams (off: it stores 2 and never jams)", () => {
    const b = withMod(twoPress(), 60, "hopper", 0, 3);
    const runOn = fight(b, true, 25), runOff = fight(b, false, 25);
    expect([runOn.maxStore, typed(runOn.ev, "jam").length > 0]).toEqual([0, true]);
    expect([runOff.maxStore, typed(runOff.ev, "jam").length]).toEqual([2, 0]);
  });

  it("face: ITS CHAMBER HOLDS +1/+2/+3 SLUG, one line in the band; ladder SLUG +1/+2/+3; BOTTOMLESS in the ⓘ view only", () => {
    expect(lines("hopper")).toEqual([1, 2, 3].map((n) => [`ITS CHAMBER HOLDS +${n} {SLUG}.`]));
    oneLine("hopper");
    expect(levels("hopper", 1)).toEqual(["{SLUG} [+1]/+2/+3", "★3 BOTTOMLESS", next(2, "+2 {SLUG}")]);
    expect(levels("hopper", 3)).toEqual(["{SLUG} +1/+2/[+3]", "★3 BOTTOMLESS"]);
    // off: a RULES piece, no face (identity)
    expect([hasFace("hopper"), on(() => hasFace("hopper"))]).toEqual([false, true]);
  });
});

// ---------------------------------------------------------------------------------------------- row 34: TWIN TRIGGER
describe("Y4 row 34: TWIN TRIGGER: PAIR +30/+60/+95% damage; no shorter load time, no LOAD_FLOOR", () => {
  it("data: on, pairBonus 0.3/0.6/0.95 and no windowTime (off: 0.25/0.55/0.88 and -0.25/-0.4/-0.55 s)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("twintrigger", s).mod), `★${s}`).toEqual({ pairBonus: [0.3, 0.6, 0.95][s - 1] });
      expect(effectAt("twintrigger", s).mod).toEqual({ pairBonus: [0.25, 0.55, 0.88][s - 1], windowTime: [-0.25, -0.4, -0.55][s - 1] });
    }
  });

  it("turret: on, the load time is WINDOW_TIME at every star (off: 1.25 / 1.1 / 0.95 s, never under LOAD_FLOOR)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "twintrigger", 0, s);
      expect([turret(b, true).windowTime, turret(b, true).pairBonus], `on ★${s}`).toEqual([WINDOW_TIME, [0.3, 0.6, 0.95][s - 1]]);
      expect(turret(b, false).windowTime, `off ★${s}`).toBeCloseTo(Math.max(LOAD_FLOOR, WINDOW_TIME + [-0.25, -0.4, -0.55][s - 1]), 9);
    }
  });

  it("LOAD_FLOOR goes: on, no gear holds a load time at any star, so makeTurret never reaches the floor (off: HOPPER and TWIN TRIGGER do)", () => {
    const timed = (star: boolean) => withStarRules(() => Object.values(ITEMS).filter((d) => d.kind === "mod")
      .filter((d) => STARS.some((s) => effectAt(d.id, s).mod?.windowTime)).map((d) => d.id), star);
    expect(timed(true)).toEqual([]);
    expect(timed(false).sort()).toEqual(["hopper", "twintrigger"]);
  });

  it("battle: on, paired STAMP PRESS slugs (30) hit for 39 / 48 / 59 (off 38 / 47 / 56); lone ones for 30", () => {
    // two equal belts into one gun, CALIBRATION ★3 so nothing waits at the intakes: their loads pair (wave3.engine's E2 scene)
    for (const s of STARS) {
      const b = withMod(withMod(twoPress(), 60, "twintrigger", 0, s), 61, "calibrate", 0, 3);
      const dmgs = (star: boolean) => [...new Set(typed(fight(b, star, 20).ev, "fire").map((x) => x.e.dmg))].sort((x, y) => x - y);
      // every shot is a lone 30 or a paired load at the star's bonus (off ★3's shorter load time pairs every load)
      const shots = (star: boolean, paired: number) => {
        const d = dmgs(star);
        expect(d[d.length - 1], `${star ? "on" : "off"} ★${s}`).toBe(paired);
        expect(d.every((v) => v === 30 || v === paired), `${star ? "on" : "off"} ★${s}: ${d}`).toBe(true);
      };
      shots(true, [39, 48, 59][s - 1]);
      shots(false, [38, 47, 56][s - 1]);
    }
  });

  it("face: PAIR: +30/+60/+95% DMG, one line in the band; ladder DMG +30%/+60%/+95%", () => {
    expect(lines("twintrigger")).toEqual([30, 60, 95].map((p) => [`{*PAIR}: +${p}% {DMG}.`]));
    oneLine("twintrigger");
    expect(levels("twintrigger", 1)).toEqual(["{DMG} [+30%]/+60%/+95%", next(2, "+60% {DMG}")]);
    expect([hasFace("twintrigger"), on(() => hasFace("twintrigger"))]).toEqual([false, true]);
  });
});

// ---------------------------------------------------------------------------------------------- row 35: SEAM WELDER
describe("Y4 row 35: SEAM WELDER: PAIR +10/+22/+35 PLATE; a lone load's plating goes", () => {
  it("data: on, seam { pair: 10/22/35, lone: 0 } (off: lone 2/4/7)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("seamwelder", s).mod!.seam), `★${s}`).toEqual({ pair: [10, 22, 35][s - 1], lone: 0 });
      expect(effectAt("seamwelder", s).mod!.seam).toEqual({ pair: [10, 22, 35][s - 1], lone: [2, 4, 7][s - 1] });
    }
  });

  it("battle: on, a one-belt gun (no pairs) rolls no plating in 15 s (off: a lone load's 2/4/7 each)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "seamwelder", 0, s);
      const off = fight(b, false, 15), loads = typed(off.ev, "load").length;
      expect(fight(b, true, 15).bt.sides[0].plate.gained, `on ★${s}`).toBe(0);
      expect(off.bt.sides[0].plate.gained, `off ★${s}`).toBe([2, 4, 7][s - 1] * loads);
    }
  });

  it("battle: on, two equal belts' pairs roll exactly 10 PLATE each (off: 10 a pair plus 2 for every other load)", () => {
    const b = withMod(withMod(twoPress(), 60, "seamwelder", 0, 1), 61, "calibrate", 0, 3);
    const runOn = fight(b, true, 20), pairs = typed(runOn.ev, "pair").length;
    expect(pairs).toBeGreaterThan(5);
    expect(runOn.bt.sides[0].plate.gained).toBe(10 * pairs);
    const runOff = fight(b, false, 20), pairsOff = typed(runOff.ev, "pair").length, loadsOff = typed(runOff.ev, "load").length;
    expect(runOff.bt.sides[0].plate.gained).toBe(10 * pairsOff + 2 * (loadsOff - pairsOff));
  });

  it("face: PAIR: +10/+22/+35 PLATE, one line in the band; ladder PLATE +10/+22/+35", () => {
    expect(lines("seamwelder")).toEqual([10, 22, 35].map((d) => [`{*PAIR}: +${d} {*PLATE}.`]));
    oneLine("seamwelder");
    expect(levels("seamwelder", 1)).toEqual(["{PLATE} [+10]/+22/+35", next(2, "+22 {PLATE}")]);
    expect([hasFace("seamwelder"), on(() => hasFace("seamwelder"))]).toEqual([false, true]);
  });
});

// --------------------------------------------------------------------------------------------- row 36: EXT. CHAMBER
describe("Y4 row 36: EXT. CHAMBER: it fires 2/3/4 loads a shot; the +1 slot goes", () => {
  it("data: on, mod { perShot: 2/3/4 } (off: 2/2/3, ★2/★3 + 1 slot); WIDE BREECH and TRIPLE BREECH stay names", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("chamber", s).mod), `★${s}`).toEqual({ perShot: s + 1 });
      expect(effectAt("chamber", s).mod).toEqual({ perShot: [2, 2, 3][s - 1], ...(s > 1 ? { window: 1 } : {}) });
    }
    expect(on(() => [2, 3].map((s) => ITEMS.chamber.levels![s as 2 | 3]!.perk))).toEqual(["WIDE BREECH", "TRIPLE BREECH"]);
  });

  it("turret: on, a SCRAP CANNON fires 2/3/4 a shot from its own 3 loads (off: 2/2/3 from 3/4/4)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "chamber", 0, s);
      expect([turret(b, true).perShot, turret(b, true).window], `on ★${s}`).toEqual([s + 1, 3]);
      expect([turret(b, false).perShot, turret(b, false).window], `off ★${s}`).toEqual([[2, 2, 3][s - 1], s > 1 ? 4 : 3]);
    }
  });

  it("battle: on, a busy gun's shot fires 3 at ★2 (off 2), and 4 at ★3 where a HOPPER gives the chamber 4 (off 3)", () => {
    const two = withMod(twoPress(), 60, "chamber", 0, 2);
    expect([mostPerShot(two, true), mostPerShot(two, false)]).toEqual([3, 2]);
    const three = withMod(withMod(twoPress(), 60, "chamber", 0, 3), 61, "hopper", 0, 1);
    expect([mostPerShot(three, true), mostPerShot(three, false)]).toEqual([4, 3]);
  });

  it("face: EACH SHOT FIRES 2/3/4 SLUG (today's line), no WIDE BREECH clause; ladder FIRES 2/3/4 SLUG; the perk names in the ⓘ view only", () => {
    expect(lines("chamber")).toEqual([2, 3, 4].map((n) => [`EACH SHOT FIRES ${n} {SLUG}.`]));
    oneLine("chamber");
    expect(levels("chamber", 1)).toEqual(["FIRES [2]/3/4 {SLUG}", "★2 WIDE BREECH", "★3 TRIPLE BREECH", `${next(2, "FIRES 3 {SLUG}")} ★2 WIDE BREECH`]);
    // off: ★2's clause (identity); on: none
    expect([withStarRules(() => faceAt("chamber", 2)!.clause?.text, false), on(() => faceAt("chamber", 2)!.clause)])
      .toEqual(["★2 WIDE BREECH: HOLDS +1 {SLUG}.", undefined]);
  });
});
