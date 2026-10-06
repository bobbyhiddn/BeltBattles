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

// -------------------------------------------------------------------------------------------- row 37: ROTARY BREECH
describe("Y4 row 37: ROTARY BREECH: part-full chambers fire 50/65/80% sooner; no fire rate, no no-jam", () => {
  it("data: on, core { routine rotary, FIFO, windowTime 0.75 / 0.525 / 0.3 } (off: 0.75 at every star, fireRate 18/43, ★3 noJam)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("rotary", s).core), `★${s}`).toEqual({ routine: "rotary", order: "FIFO", windowTime: [0.75, 0.525, 0.3][s - 1] });
      expect(effectAt("rotary", s).core).toEqual({ routine: "rotary", order: "FIFO", windowTime: 0.75, ...(s > 1 ? { fireRate: [18, 43][s - 2] } : {}), ...(s === 3 ? { noJam: true } : {}) });
    }
    // 0.525 s is exactly 65% sooner than WINDOW_TIME (cap's ruling e91c08dd12466357; DESIGN-Y's 0.53, rounded)
    expect(WINDOW_TIME * (1 - 0.65)).toBeCloseTo(0.525, 12);
  });

  it("turret: on, a SCRAP CANNON keeps its SPEED 30 and loads for 0.75 / 0.525 / 0.3 s, and can jam (off: SPEED 30/35/43, 0.75 s, ★3 never jams)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "rotary", 0, s);
      const pick = (tu: TurretState) => [tu.speed, tu.windowTime, tu.core.spec.noJam === true];
      expect(pick(turret(b, true)), `on ★${s}`).toEqual([30, [0.75, 0.525, 0.3][s - 1], false]);
      expect(pick(turret(b, false)), `off ★${s}`).toEqual([[30, 35, 43][s - 1], 0.75, s === 3]);
    }
  });

  it("battle: on, a sparse gun's first shot leaves its load time after its first load: ★2 0.525 s, ★3 0.3 s (off 0.75 s)", () => {
    for (const s of [2, 3]) {
      const b = withMod(furnaceBench(), 60, "rotary", 0, s);
      expect(Math.abs(firstWait(b, true) - [0.525, 0.3][s - 2]), `on ★${s}`).toBeLessThanOrEqual(2 * TICK_S);
      expect(Math.abs(firstWait(b, false) - 0.75), `off ★${s}`).toBeLessThanOrEqual(2 * TICK_S);
    }
  });

  it("face: FIRES PART-FULL CHAMBERS 50/65/80% SOONER, no clause; ladder 50%/65%/80% SOONER; GREASED RACE and CLEAN FEED in the ⓘ view only", () => {
    expect(lines("rotary")).toEqual([50, 65, 80].map((p) => [`FIRES PART-FULL CHAMBERS ${p}% SOONER.`]));
    oneLine("rotary");
    expect(levels("rotary", 1)).toEqual(["[50%]/65%/80% SOONER", "★2 GREASED RACE", "★3 CLEAN FEED", `${next(2, "65% SOONER")} ★2 GREASED RACE`]);
  });
});

// --------------------------------------------------------------------------------------------- row 38: ANVIL BREECH
// Y7b1 (ruling Y7A-R3c): ANVIL's STAR_DIFF row is deleted, so with the switch on it reads its base def (0.9.2's two parts).
// Was "Y4 row 38: ANVIL BREECH: +125/+275/+438% of your PLATE as damage; the flat folds in", with on perPlate 1.25 / 2.75 /
// 4.38 and no anvilFlat, the shot pct(PLATE, 125/275/438%) and the face "SHOT: +125% OF YOUR {*PLATE} AS {DMG}."
describe("Y4 row 38: ANVIL BREECH: Y7b1 (Y7A-R3c): +25/+55/+88 and +100/+220/+350% of your PLATE, on as off", () => {
  it("data: on, the base def: anvilFlat 25/55/88 + perPlate 1 / 2.2 / 3.5, the same object as off", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("anvil", s).core), `★${s}`).toEqual({ routine: "anvil", anvilFlat: [25, 55, 88][s - 1], perPlate: [1, 2.2, 3.5][s - 1] });
      expect(on(() => effectAt("anvil", s).core), `★${s}`).toEqual(effectAt("anvil", s).core);
    }
    expect(on(() => ITEMS.anvil)).toBe(ITEMS.anvil);
  });

  it("battle: on, the first shot gains 25/55/88 + pct(PLATE, 100/220/350%), as off (Y4's fold: 125/275/438% and no flat)", () => {
    // the shot's gain over the same shot without a core (the barge never fires, so the hull keeps the plating it starts with)
    const gain = (s: number, plate: number, star: boolean): number => {
      const first = (b: Build) => typed(fight(b, star, 6, (bt) => { bt.sides[0].plate.plate = plate; }).ev, "fire")[0].e.dmg;
      return first(withMod(furnaceBench(), 60, "anvil", 0, s)) - first(furnaceBench());
    };
    // Y7b1 (Y7A-R3c): on was [[125, 125], [275, 275], [438, 438]] / [[0, 25], [0, 55], [0, 88]] / [50, 65] / [250, 225]
    expect(STARS.map((s) => [gain(s, 100, true), gain(s, 100, false)])).toEqual([[125, 125], [275, 275], [438, 438]]);
    expect(STARS.map((s) => [gain(s, 0, true), gain(s, 0, false)])).toEqual([[25, 25], [55, 55], [88, 88]]);
    expect([gain(1, 40, true), gain(1, 40, false)]).toEqual([65, 65]);
    expect([gain(1, 200, true), gain(1, 200, false)]).toEqual([225, 225]);
  });

  // Y7b1 (Y7A-R3c): was "face: SHOT: +125/+275/+438% OF YOUR PLATE AS DMG; ladder +125%/+275%/+438% OF PLATE"
  it("face: SHOT: +25 DMG, +100% OF YOUR PLATE (both parts, one line, as off); ladders {DMG} +25/+55/+88 and +100%/+220%/+350% OF PLATE", () => {
    expect(lines("anvil")).toEqual([[25, 100], [55, 220], [88, 350]].map(([d, p]) => [`SHOT: +${d} {DMG}, +${p}% OF YOUR {*PLATE}.`]));
    expect(lines("anvil")).toEqual(lines("anvil", false));
    oneLine("anvil");
    expect(levels("anvil", 1)).toEqual(["{DMG} [+25]/+55/+88", "[+100%]/+220%/+350% OF {PLATE}", next(2, "+55 {DMG}, +220% OF {PLATE}")]);
    expect(levels("anvil", 2)).toEqual(levels("anvil", 2, false));
  });
});

// --------------------------------------------------------------------------------------------- row 39: STEAM BREECH
describe("Y4 row 39: STEAM BREECH: 40/80/120% faster if you have PLATE; nothing bare", () => {
  it("data: on, steamPlated 40/80/120 and no steamBare (off: 35/70/110 and 10/20/30); it stays common", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("steambreech", s).core), `★${s}`).toEqual({ routine: "steam", steamPlated: [40, 80, 120][s - 1] });
      expect(effectAt("steambreech", s).core).toEqual({ routine: "steam", steamPlated: [35, 70, 110][s - 1], steamBare: [10, 20, 30][s - 1] });
    }
    expect(on(() => ITEMS.steambreech.rarity)).toBe("common");
  });

  it("cadence: on, a SCRAP CANNON (30) fires at SPEED 42/54/66 plated and 30 bare (off: 41/51/63 plated, 33/36/39 bare)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "steambreech", 0, s);
      const at = (star: boolean, plated: boolean) => withStarRules(() => steamInterval({ ...turret(b, star), plated }), star);
      expect([at(true, true), at(true, false)], `on ★${s}`).toEqual([secPer([42, 54, 66][s - 1]), secPer(30)]);
      expect([at(false, true), at(false, false)], `off ★${s}`).toEqual([secPer([41, 51, 63][s - 1]), secPer([33, 36, 39][s - 1])]);
    }
  });

  it("battle: on, a bare busy gun fires as one without the core (off: 10% faster)", () => {
    const shots = (b: Build, star: boolean) => typed(fight(b, star, 20).ev, "fire").length;
    const steam = withMod(twoPress(), 60, "steambreech", 0, 1);
    expect(shots(steam, true)).toBe(shots(twoPress(), true));
    expect(shots(steam, false)).toBeGreaterThan(shots(twoPress(), false));
  });

  it("face: FIRES 40/80/120% FASTER IF YOU HAVE PLATE; ladder 40%/80%/120% FASTER", () => {
    expect(lines("steambreech")).toEqual([40, 80, 120].map((p) => [`FIRES ${p}% FASTER IF YOU HAVE {*PLATE}.`]));
    oneLine("steambreech");
    expect(levels("steambreech", 1)).toEqual(["[40%]/80%/120% FASTER", next(2, "80% FASTER")]);
    expect([hasFace("steambreech"), on(() => hasFace("steambreech"))]).toEqual([false, true]);
  });
});

// --------------------------------------------------------------------------------------------- row 40: DRAKE NOZZLE
describe("Y4 row 40: DRAKE NOZZLE: each 10/7/5 bonus damage is 1 BURN; no free BURN, longer BURN or quicker shot", () => {
  it("data: on, flatPerBurn 10/7/5 only (off: 20/15/10, addBurn 1/2/3, burnTime 4/5/6 s, flightMul 0.7)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("drake", s).core), `★${s}`).toEqual({ routine: "drake", flatPerBurn: [10, 7, 5][s - 1] });
      expect(effectAt("drake", s).core).toEqual({ routine: "drake", flatPerBurn: [20, 15, 10][s - 1], addBurn: s, burnTime: 3 + s, flightMul: 0.7 });
    }
  });

  it("battle: on, a slug past a WHETSTONE (+20) shoots 2 / 2 / 4 BURN of BURN_TIME (off: 1 + 1, 1 + 2, 2 + 3 BURN lasting 4/5/6 s)", () => {
    const first = (b: Build, star: boolean) => withStarRules(() => {
      const bt = new Battle(b, barge(), SEED), s = bt.sides[0];
      for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
      for (let i = 0; i < 60 * 10; i++) {
        bt.step();
        bt.events.length = 0;
        const p = bt.projectiles.find((q) => q.from === 0);
        if (p) return { burn: p.burn ?? 0, burnTime: p.burnTime, flight: p.flight };
      }
      throw new Error("no shot");
    }, star);
    const plain = (star: boolean) => first(rigBench([["whetstone", 4, 3, 1]]), star);
    for (const s of STARS) {
      const b = withMod(rigBench([["whetstone", 4, 3, 1]]), 60, "drake", 0, s);
      const a = first(b, true), o = first(b, false);
      expect([a.burn, a.burnTime], `on ★${s}`).toEqual([[2, 2, 4][s - 1], undefined]);
      expect([o.burn, o.burnTime], `off ★${s}`).toEqual([[2, 3, 5][s - 1], 3 + s]);
      expect(a.flight, `on ★${s}: no quicker shot`).toBeCloseTo(plain(true).flight, 9);
      expect(o.flight, `off ★${s}: x0.7`).toBeLessThan(plain(false).flight);
    }
    // no bonus damage: no BURN at all (off: the free 1/2/3)
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "drake", 0, s);
      expect([first(b, true).burn, first(b, false).burn], `bare ★${s}`).toEqual([0, s]);
    }
  });

  it("face: SHOT: EACH 10/7/5 BONUS DAMAGE IS 1 BURN; ladder EACH 10/7/5", () => {
    expect(lines("drake")).toEqual([10, 7, 5].map((d) => [`SHOT: EACH ${d} BONUS DAMAGE IS 1 {*BURN}.`]));
    oneLine("drake");
    expect(levels("drake", 1)).toEqual(["EACH [10]/7/5", next(2, "EACH 7")]);
    expect([hasFace("drake"), on(() => hasFace("drake"))]).toEqual([false, true]);
  });
});

// ------------------------------------------------------------------------------------------- the 8 together (R-1, R-2)
describe("Y4: the 8 with the switch on and off", () => {
  it("off: every def is the base's object (STAR_DIFF puts it back), and the 8 that have no face keep none", () => {
    const ids = ["hopper", "twintrigger", "seamwelder", "chamber", "rotary", "anvil", "steambreech", "drake"];
    const before = ids.map((id) => ITEMS[id]);
    on(() => expect(ids.map((id) => ITEMS[id])).not.toEqual(before));
    expect(ids.map((id) => ITEMS[id])).toEqual(before);
    for (const [i, id] of ids.entries()) expect(ITEMS[id], id).toBe(before[i]);
    expect(["hopper", "twintrigger", "seamwelder", "steambreech", "drake"].map(hasFace)).toEqual([false, false, false, false, false]);
  });

  it("a FURNACE long belt and K: the 8 cores' and gear's switch-on numbers don't depend on the turret's cells", () => {
    // the long belt (8 tiles, tests/furnace.cadence's) changes only the SPEED; ROTARY's load time stays its own
    const long = withMod(furnaceBench(), 60, "rotary", 0, 3);
    long.routes[0].cells = [key(4, 5), key(3, 5), key(3, 4), key(3, 3), key(3, 2), key(4, 2), key(4, 1), key(4, 0)];
    expect([turret(long, true).speed, turret(long, true).windowTime]).toEqual([42, 0.3]);
  });
});
