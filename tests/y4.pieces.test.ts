// Y4 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 33-40): THE 4 GEAR AND 4 CORES, one number each, with the
// star switch on (content.ts STAR_RULES, withStarRules). For each: its data; its sim change, read off the turret the battle
// builds (makeTurret: window, load time, store, no-jam, speed, the core's cadence) or a real battle (its shots, loads,
// plating, projectiles), against the same scene with the switch off where the base differs; its face (one ability line at
// every star, inside the 225 px band of font.ts textWidth, no caveat and no star clause, its perk's name never on the face:
// ruling R-1); and its ⓘ LEVELS ladder, every line inside the band. Two numbers follow cap's ruling e91c08dd12466357: TWIN
// TRIGGER ★3's pairBonus 95 (the ladder's) and ROTARY BREECH ★2's load time 0.525 s (exactly 65% sooner).
import { describe, expect, it } from "vitest";
import { Battle, type SimEvent, type TurretState } from "../src/sim/battle";
import { ITEMS, WINDOW_TIME, secPer } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { steamInterval } from "../src/sim/cores";
import { faceAt, hasFace } from "../src/ui/faces";
import { STARS, levels, lines, next, oneLine, rigBench } from "./y3.helpers";
import { SEED, barge, furnaceBench, twoPress, withMod } from "./wave3.helpers";

/** Side 0's turret 0 as the battle builds it (makeTurret). */
const turret = (b: Build): TurretState => new Battle(b, barge(), SEED).sides[0].turrets[0];

/** A battle of `b` against the barge for `secs`, every rig of side 0 online from the start: each tick's events of side 0
 *  with the tick's time, and the battle at its end. */
function fight(b: Build, secs = 20, setup: (bt: Battle) => void = () => {}): { ev: { t: number; e: SimEvent }[]; bt: Battle; maxStore: number } {
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
}
const typed = <T extends SimEvent["type"]>(ev: { t: number; e: SimEvent }[], type: T) =>
  ev.filter((x) => x.e.type === type) as { t: number; e: Extract<SimEvent, { type: T }> }[];
/** The seconds from side 0's first load to its first shot. */
const firstWait = (b: Build): number => {
  const { ev } = fight(b, 8);
  return typed(ev, "fire")[0].t - typed(ev, "load")[0].t;
};
/** The most loads side 0's turret fired on one tick (one shot). */
const mostPerShot = (b: Build): number => {
  const per = new Map<number, number>();
  for (const x of typed(fight(b, 20).ev, "fire")) per.set(x.t, (per.get(x.t) ?? 0) + 1);
  return Math.max(...per.values());
};
const TICK_S = 1 / 60;

// ---------------------------------------------------------------------------------------------------- row 33: HOPPER
describe("Y4 row 33: HOPPER: its chamber holds +1/+2/+3; no load time, store or no-jam", () => {
  it("data: on, mod { window: 1/2/3 } only (off: +1 slot and +0.5 s at every star, ★2/★3 a store of 1/2, ★3 no-jam)", () => {
    for (const s of STARS) {
      expect(effectAt("hopper", s).mod, `★${s}`).toEqual({ window: s });
    }
  });

  it("turret: on, a SCRAP CANNON (3 loads) holds 4/5/6 at WINDOW_TIME's load time, stores nothing, can jam (off: 4, 2 s, store 0/1/2, ★3 never jams)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "hopper", 0, s);
      const pick = (tu: TurretState) => [tu.window, tu.windowTime, tu.storeMax, tu.noJam];
      expect(pick(turret(b)), `★${s}`).toEqual([3 + s, WINDOW_TIME, 0, false]);
    }
  });

  it("battle: on, a sparse gun's first shot leaves WINDOW_TIME after its first load (off: 0.5 s later)", () => {
    // the KILN stamps every 1.25 s, so a 4-load chamber is never full before its load time ends
    const b = withMod(furnaceBench(), 60, "hopper", 0, 1);
    expect(Math.abs(firstWait(b) - WINDOW_TIME)).toBeLessThanOrEqual(2 * TICK_S);
  });

  it("battle: on, a busy ★3 gun (two STAMP PRESSes) stores no load and jams (off: it stores 2 and never jams)", () => {
    const b = withMod(twoPress(), 60, "hopper", 0, 3);
    const runOn = fight(b, 25);
    expect([runOn.maxStore, typed(runOn.ev, "jam").length > 0]).toEqual([0, true]);
  });

  // Y7b2 (the words): was "face: ...; ladder SLUG +1/+2/+3; BOTTOMLESS in the ⓘ view only"
  it("face: ITS CHAMBER HOLDS +1/+2/+3 SLUG, one line in the band; ladder SLUG +1/+2/+3; no BOTTOMLESS name, the ⓘ view's too (Y7b2: it left with the no-jam)", () => {
    expect(lines("hopper")).toEqual([1, 2, 3].map((n) => [`ITS CHAMBER HOLDS +${n} {SLUG}.`]));
    oneLine("hopper");
    expect(levels("hopper", 1)).toEqual(["{SLUG} [+1]/+2/+3", next(2, "+2 {SLUG}")]); // Y7b2 (the words): was ["{SLUG} [+1]/+2/+3", "★3 BOTTOMLESS", next(2, "+2 {SLUG}")]
    expect(levels("hopper", 3)).toEqual(["{SLUG} +1/+2/[+3]"]); // Y7b2 (the words): was ["{SLUG} +1/+2/[+3]", "★3 BOTTOMLESS"]
    expect(hasFace("hopper")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------- row 34: TWIN TRIGGER
describe("Y4 row 34: TWIN TRIGGER: PAIR +30/+60/+95% damage; no shorter load time, no LOAD_FLOOR", () => {
  it("data: on, pairBonus 0.3/0.6/0.95 and no windowTime (off: 0.25/0.55/0.88 and -0.25/-0.4/-0.55 s)", () => {
    for (const s of STARS) {
      expect(effectAt("twintrigger", s).mod, `★${s}`).toEqual({ pairBonus: [0.3, 0.6, 0.95][s - 1] });
    }
  });

  it("turret: on, the load time is WINDOW_TIME at every star (off: 1.25 / 1.1 / 0.95 s, never under LOAD_FLOOR)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "twintrigger", 0, s);
      expect([turret(b).windowTime, turret(b).pairBonus], `★${s}`).toEqual([WINDOW_TIME, [0.3, 0.6, 0.95][s - 1]]);
    }
  });

  it("LOAD_FLOOR goes: on, no gear holds a load time at any star, so makeTurret never reaches the floor (off: HOPPER and TWIN TRIGGER do)", () => {
    const timed = Object.values(ITEMS).filter((d) => d.kind === "mod")
      .filter((d) => STARS.some((s) => effectAt(d.id, s).mod?.windowTime)).map((d) => d.id);
    expect(timed).toEqual([]);
  });

  it("battle: on, paired STAMP PRESS slugs (30) hit for 39 / 48 / 59 (off 38 / 47 / 56); lone ones for 30", () => {
    // two equal belts into one gun, CALIBRATION ★3 so nothing waits at the intakes: their loads pair (wave3.engine's E2 scene)
    for (const s of STARS) {
      const b = withMod(withMod(twoPress(), 60, "twintrigger", 0, s), 61, "calibrate", 0, 3);
      const dmgs = () => [...new Set(typed(fight(b, 20).ev, "fire").map((x) => x.e.dmg))].sort((x, y) => x - y);
      // every shot is a lone 30 or a paired load at the star's bonus (off ★3's shorter load time pairs every load)
      const shots = (paired: number) => {
        const d = dmgs();
        expect(d[d.length - 1], `★${s}`).toBe(paired);
        expect(d.every((v) => v === 30 || v === paired), `★${s}: ${d}`).toBe(true);
      };
      shots([39, 48, 59][s - 1]);
    }
  });

  it("face: PAIR: +30/+60/+95% DMG, one line in the band; ladder DMG +30%/+60%/+95%", () => {
    expect(lines("twintrigger")).toEqual([30, 60, 95].map((p) => [`{*PAIR}: +${p}% {DMG}.`]));
    oneLine("twintrigger");
    expect(levels("twintrigger", 1)).toEqual(["{DMG} [+30%]/+60%/+95%", next(2, "+60% {DMG}")]);
    expect(hasFace("twintrigger")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------- row 35: SEAM WELDER
describe("Y4 row 35: SEAM WELDER: PAIR +10/+22/+35 PLATE; a lone load's plating goes", () => {
  it("data: on, seam { pair: 10/22/35, lone: 0 } (off: lone 2/4/7)", () => {
    for (const s of STARS) {
      expect(effectAt("seamwelder", s).mod!.seam, `★${s}`).toEqual({ pair: [10, 22, 35][s - 1], lone: 0 });
    }
  });

  it("battle: on, a one-belt gun (no pairs) rolls no plating in 15 s (off: a lone load's 2/4/7 each)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "seamwelder", 0, s);
      expect(fight(b, 15).bt.sides[0].plate.gained, `★${s}`).toBe(0);
    }
  });

  it("battle: on, two equal belts' pairs roll exactly 10 PLATE each (off: 10 a pair plus 2 for every other load)", () => {
    const b = withMod(withMod(twoPress(), 60, "seamwelder", 0, 1), 61, "calibrate", 0, 3);
    const runOn = fight(b, 20), pairs = typed(runOn.ev, "pair").length;
    expect(pairs).toBeGreaterThan(5);
    expect(runOn.bt.sides[0].plate.gained).toBe(10 * pairs);
  });

  it("face: PAIR: +10/+22/+35 PLATE, one line in the band; ladder PLATE +10/+22/+35", () => {
    expect(lines("seamwelder")).toEqual([10, 22, 35].map((d) => [`{*PAIR}: +${d} {*PLATE}.`]));
    oneLine("seamwelder");
    expect(levels("seamwelder", 1)).toEqual(["{PLATE} [+10]/+22/+35", next(2, "+22 {PLATE}")]);
    expect(hasFace("seamwelder")).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------- row 36: EXT. CHAMBER
describe("Y4 row 36: EXT. CHAMBER: it fires 2/3/4 loads a shot; the +1 slot goes", () => {
  // Y7b2 (the words): was "data: ...; WIDE BREECH and TRIPLE BREECH stay names"
  it("data: on, mod { perShot: 2/3/4 } (off: 2/2/3, ★2/★3 + 1 slot); WIDE BREECH and TRIPLE BREECH left with the slot (Y7b2: no perk name)", () => {
    for (const s of STARS) {
      expect(effectAt("chamber", s).mod, `★${s}`).toEqual({ perShot: s + 1 });
    }
    expect([2, 3].map((s) => ITEMS.chamber.levels![s as 2 | 3]!.perk)).toEqual([undefined, undefined]); // Y7b2 (the words): was ["WIDE BREECH", "TRIPLE BREECH"]
  });

  it("turret: on, a SCRAP CANNON fires 2/3/4 a shot from its own 3 loads (off: 2/2/3 from 3/4/4)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "chamber", 0, s);
      expect([turret(b).perShot, turret(b).window], `★${s}`).toEqual([s + 1, 3]);
    }
  });

  it("battle: on, a busy gun's shot fires 3 at ★2 (off 2), and 4 at ★3 where a HOPPER gives the chamber 4 (off 3)", () => {
    const two = withMod(twoPress(), 60, "chamber", 0, 2);
    expect(mostPerShot(two)).toBe(3);
    const three = withMod(withMod(twoPress(), 60, "chamber", 0, 3), 61, "hopper", 0, 1);
    expect(mostPerShot(three)).toBe(4);
  });

  // Y7b1 (ruling Y7A-R2): was "face: EACH SHOT FIRES 2/3/4 SLUG (today's line), ...; ladder FIRES 2/3/4 SLUG", with the lines
  // EACH SHOT FIRES 2/3/4 {SLUG}. and the ladder FIRES [2]/3/4 {SLUG} (NEXT ★2: FIRES 3 {SLUG})
  // Y7b2 (the words): was "face: ...; ladder FIRES UP TO 2/3/4 SLUG; the perk names in the ⓘ view only"
  it("face: EACH SHOT FIRES 2 / UP TO 3 / UP TO 4 SLUG (Y7A-R2: true on every gun), no WIDE BREECH clause; ladder FIRES UP TO 2/3/4 SLUG; no perk names, the ⓘ view's too (Y7b2)", () => {
    expect(lines("chamber")).toEqual([["EACH SHOT FIRES 2 {SLUG}."], ["EACH SHOT FIRES UP TO 3 {SLUG}."], ["EACH SHOT FIRES UP TO 4 {SLUG}."]]);
    oneLine("chamber");
    // Y7b2 (the words): was ["FIRES UP TO [2]/3/4 {SLUG}", "★2 WIDE BREECH", "★3 TRIPLE BREECH", `${next(2, "FIRES UP TO 3 {SLUG}")} ★2 WIDE BREECH`]
    expect(levels("chamber", 1)).toEqual(["FIRES UP TO [2]/3/4 {SLUG}", next(2, "FIRES UP TO 3 {SLUG}")]);
    expect(faceAt("chamber", 2)!.clause).toBeUndefined(); // ★2: no clause
  });
});

// -------------------------------------------------------------------------------------------- row 37: ROTARY BREECH
describe("Y4 row 37: ROTARY BREECH: part-full chambers fire 50/65/80% sooner; no fire rate, no no-jam", () => {
  it("data: on, core { routine rotary, FIFO, windowTime 0.75 / 0.525 / 0.3 } (off: 0.75 at every star, fireRate 18/43, ★3 noJam)", () => {
    for (const s of STARS) {
      expect(effectAt("rotary", s).core, `★${s}`).toEqual({ routine: "rotary", order: "FIFO", windowTime: [0.75, 0.525, 0.3][s - 1] });
    }
    // 0.525 s is exactly 65% sooner than WINDOW_TIME (cap's ruling e91c08dd12466357; DESIGN-Y's 0.53, rounded)
    expect(WINDOW_TIME * (1 - 0.65)).toBeCloseTo(0.525, 12);
  });

  it("turret: on, a SCRAP CANNON keeps its SPEED 30 and loads for 0.75 / 0.525 / 0.3 s, and can jam (off: SPEED 30/35/43, 0.75 s, ★3 never jams)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "rotary", 0, s);
      const pick = (tu: TurretState) => [tu.speed, tu.windowTime, tu.core.spec.noJam === true];
      expect(pick(turret(b)), `★${s}`).toEqual([30, [0.75, 0.525, 0.3][s - 1], false]);
    }
  });

  it("battle: on, a sparse gun's first shot leaves its load time after its first load: ★2 0.525 s, ★3 0.3 s (off 0.75 s)", () => {
    for (const s of [2, 3]) {
      const b = withMod(furnaceBench(), 60, "rotary", 0, s);
      expect(Math.abs(firstWait(b) - [0.525, 0.3][s - 2]), `★${s}`).toBeLessThanOrEqual(2 * TICK_S);
    }
  });

  // Y7b2 (the words): was "face: ...; ladder 50%/65%/80% SOONER; GREASED RACE and CLEAN FEED in the ⓘ view only"
  it("face: FIRES PART-FULL CHAMBERS 50/65/80% SOONER, no clause; ladder 50%/65%/80% SOONER; no GREASED RACE or CLEAN FEED name, the ⓘ view's too (Y7b2)", () => {
    expect(lines("rotary")).toEqual([50, 65, 80].map((p) => [`FIRES PART-FULL CHAMBERS ${p}% SOONER.`]));
    oneLine("rotary");
    // Y7b2 (the words): was ["[50%]/65%/80% SOONER", "★2 GREASED RACE", "★3 CLEAN FEED", `${next(2, "65% SOONER")} ★2 GREASED RACE`]
    expect(levels("rotary", 1)).toEqual(["[50%]/65%/80% SOONER", next(2, "65% SOONER")]);
  });
});

// --------------------------------------------------------------------------------------------- row 38: ANVIL BREECH
// Y7b1 (ruling Y7A-R3c): ANVIL's STAR_DIFF row is deleted, so with the switch on it reads its base def (0.9.2's two parts).
// Was "Y4 row 38: ANVIL BREECH: +125/+275/+438% of your PLATE as damage; the flat folds in", with on perPlate 1.25 / 2.75 /
// 4.38 and no anvilFlat, the shot pct(PLATE, 125/275/438%) and the face "SHOT: +125% OF YOUR {*PLATE} AS {DMG}."
describe("Y4 row 38: ANVIL BREECH: Y7b1 (Y7A-R3c): +25/+55/+88 and +100/+220/+350% of your PLATE, on as off", () => {
  it("data: on, the base def: anvilFlat 25/55/88 + perPlate 1 / 2.2 / 3.5, the same object as off", () => {
    for (const s of STARS) {
      expect(effectAt("anvil", s).core, `★${s}`).toEqual({ routine: "anvil", anvilFlat: [25, 55, 88][s - 1], perPlate: [1, 2.2, 3.5][s - 1] });
    }
  });

  it("battle: on, the first shot gains 25/55/88 + pct(PLATE, 100/220/350%), as off (Y4's fold: 125/275/438% and no flat)", () => {
    // the shot's gain over the same shot without a core (the barge never fires, so the hull keeps the plating it starts with)
    const gain = (s: number, plate: number): number => {
      const first = (b: Build) => typed(fight(b, 6, (bt) => { bt.sides[0].plate.plate = plate; }).ev, "fire")[0].e.dmg;
      return first(withMod(furnaceBench(), 60, "anvil", 0, s)) - first(furnaceBench());
    };
    // Y7b1 (Y7A-R3c): on was [[125, 125], [275, 275], [438, 438]] / [[0, 25], [0, 55], [0, 88]] / [50, 65] / [250, 225]
    expect(STARS.map((s) => gain(s, 100))).toEqual([125, 275, 438]);
    expect(STARS.map((s) => gain(s, 0))).toEqual([25, 55, 88]);
    expect(gain(1, 40)).toBe(65);
    expect(gain(1, 200)).toBe(225);
  });

  // Y7b1 (Y7A-R3c): was "face: SHOT: +125/+275/+438% OF YOUR PLATE AS DMG; ladder +125%/+275%/+438% OF PLATE"
  it("face: SHOT: +25 DMG, +100% OF YOUR PLATE (both parts, one line, as off); ladders {DMG} +25/+55/+88 and +100%/+220%/+350% OF PLATE", () => {
    expect(lines("anvil")).toEqual([[25, 100], [55, 220], [88, 350]].map(([d, p]) => [`SHOT: +${d} {DMG}, +${p}% OF YOUR {*PLATE}.`]));
    oneLine("anvil");
    expect(levels("anvil", 1)).toEqual(["{DMG} [+25]/+55/+88", "[+100%]/+220%/+350% OF {PLATE}", next(2, "+55 {DMG}, +220% OF {PLATE}")]);
  });
});

// --------------------------------------------------------------------------------------------- row 39: STEAM BREECH
describe("Y4 row 39: STEAM BREECH: 40/80/120% faster if you have PLATE; nothing bare", () => {
  it("data: on, steamPlated 40/80/120 and no steamBare (off: 35/70/110 and 10/20/30); it stays common", () => {
    for (const s of STARS) {
      expect(effectAt("steambreech", s).core, `★${s}`).toEqual({ routine: "steam", steamPlated: [40, 80, 120][s - 1] });
    }
    expect(ITEMS.steambreech.rarity).toBe("common");
  });

  it("cadence: on, a SCRAP CANNON (30) fires at SPEED 42/54/66 plated and 30 bare (off: 41/51/63 plated, 33/36/39 bare)", () => {
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "steambreech", 0, s);
      const at = (plated: boolean) => steamInterval({ ...turret(b), plated });
      expect([at(true), at(false)], `★${s}`).toEqual([secPer([42, 54, 66][s - 1]), secPer(30)]);
    }
  });

  it("battle: on, a bare busy gun fires as one without the core (off: 10% faster)", () => {
    const shots = (b: Build) => typed(fight(b, 20).ev, "fire").length;
    const steam = withMod(twoPress(), 60, "steambreech", 0, 1);
    expect(shots(steam)).toBe(shots(twoPress()));
  });

  it("face: FIRES 40/80/120% FASTER IF YOU HAVE PLATE; ladder 40%/80%/120% FASTER", () => {
    expect(lines("steambreech")).toEqual([40, 80, 120].map((p) => [`FIRES ${p}% FASTER IF YOU HAVE {*PLATE}.`]));
    oneLine("steambreech");
    expect(levels("steambreech", 1)).toEqual(["[40%]/80%/120% FASTER", next(2, "80% FASTER")]);
    expect(hasFace("steambreech")).toBe(true);
  });
});

// --------------------------------------------------------------------------------------------- row 40: DRAKE NOZZLE
// Y7b1 (ruling Y7A-R4, its fallback): flatPerBurn 10/7/5 -> 25/18/13 with the switch on (linear first, 38/27/19, drew no
// par deck: BRIEF-Y7B1 B1). Was "Y4 row 40: DRAKE NOZZLE: each 10/7/5 bonus damage is 1 BURN; ...", the data 10/7/5, the
// battle's BURN past a WHETSTONE (+20) 2 / 2 / 4 and the face's EACH 10/7/5
describe("Y4 row 40: DRAKE NOZZLE: each 25/18/13 bonus damage is 1 BURN (Y7A-R4's fallback); no free BURN, longer BURN or quicker shot", () => {
  it("data: on, flatPerBurn 25/18/13 only (off: 20/15/10, addBurn 1/2/3, burnTime 4/5/6 s, flightMul 0.7)", () => {
    for (const s of STARS) {
      expect(effectAt("drake", s).core, `★${s}`).toEqual({ routine: "drake", flatPerBurn: [25, 18, 13][s - 1] });
    }
  });

  it("battle: on, a slug past a WHETSTONE (+20) shoots 0 / 1 / 1 BURN of BURN_TIME (Y7A-R4's fallback: 20 < 25; 20 >= 18, 13) (off: 1 + 1, 1 + 2, 2 + 3 BURN lasting 4/5/6 s)", () => {
    const first = (b: Build) => {
      const bt = new Battle(b, barge(), SEED), s = bt.sides[0];
      for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
      for (let i = 0; i < 60 * 10; i++) {
        bt.step();
        bt.events.length = 0;
        const p = bt.projectiles.find((q) => q.from === 0);
        if (p) return { burn: p.burn ?? 0, burnTime: p.burnTime, flight: p.flight };
      }
      throw new Error("no shot");
    };
    const plain = () => first(rigBench([["whetstone", 4, 3, 1]]));
    for (const s of STARS) {
      const b = withMod(rigBench([["whetstone", 4, 3, 1]]), 60, "drake", 0, s);
      const a = first(b);
      expect([a.burn, a.burnTime], `★${s}`).toEqual([[0, 1, 1][s - 1], undefined]); // Y7b1 (Y7A-R4's fallback): was [2, 2, 4]
      expect(a.flight, `★${s}: no quicker shot`).toBeCloseTo(plain().flight, 9);
    }
    // no bonus damage: no BURN at all (off: the free 1/2/3)
    for (const s of STARS) {
      const b = withMod(furnaceBench(), 60, "drake", 0, s);
      expect(first(b).burn, `bare ★${s}`).toBe(0);
    }
  });

  it("face: SHOT: EACH 25/18/13 BONUS DAMAGE IS 1 BURN; ladder EACH 25/18/13 (Y7A-R4's fallback; was 10/7/5)", () => {
    expect(lines("drake")).toEqual([25, 18, 13].map((d) => [`SHOT: EACH ${d} BONUS DAMAGE IS 1 {*BURN}.`]));
    oneLine("drake");
    expect(levels("drake", 1)).toEqual(["EACH [25]/18/13", next(2, "EACH 18")]);
    expect(hasFace("drake")).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------- the 8 together (R-1, R-2)
describe("Y4: the 8 together", () => {
  it("a FURNACE long belt and K: the 8 cores' and gear's switch-on numbers don't depend on the turret's cells", () => {
    // the long belt (8 tiles, tests/furnace.cadence's) changes only the SPEED; ROTARY's load time stays its own
    const long = withMod(furnaceBench(), 60, "rotary", 0, 3);
    long.routes[0].cells = [key(4, 5), key(3, 5), key(3, 4), key(3, 3), key(3, 2), key(4, 2), key(4, 1), key(4, 0)];
    expect([turret(long).speed, turret(long).windowTime]).toEqual([42, 0.3]);
  });
});
