// Y5 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 3, rows 41-47; REVIEW-STARD answer 2: the crit-free
// one-liners, no crit or ramp): one number each, with the star switch on (content.ts STAR_RULES, withStarRules). For each:
// its data; its sim change, read off a hook (Battle.applyHit, Battle.spallCharge) or a real battle (the capacitor's charge,
// the keg's blasts), against the same scene with the switch off where the base differs; its face (one ability line at
// every star, inside the 225 px band of font.ts textWidth, no caveat and no star clause, its perk's name never on the face:
// ruling R-1); and its ⓘ LEVELS ladder, every line inside the band.
import { describe, expect, it } from "vitest";
import { Battle, type GateState, type SideState, type TurretState } from "../src/sim/battle";
import { CELL, withStarRules } from "../src/sim/content";
import { type Build } from "../src/sim/deck";
import { effectAt, starText } from "../src/sim/stars";
import { faceAt, hasFace } from "../src/ui/faces";
import { gearIdle, gist } from "../src/ui/abilityText";
import { socketLines, type SocketRow } from "../src/screens/build/turretPanel";
import { STARS, hitOnce, levels, lines, next, on, oneLine, payload, probe, px, rigBench } from "./y3.helpers";
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

// -------------------------------------------------------------------------------------------- row 44: FINISHER RAM
describe("Y5 row 44: FINISHER RAM: the chamber's last slug +40%/+88%/+140%; no sim change; IDLE on a GATLING turret", () => {
  const PCT = ["40%", "88%", "140%"];
  /** FURNACE's heavy gun with a FINISHER RAM (★`stars`), and a GATLING SPOOL core if `gatling`. */
  const gun = (gatling: boolean, stars = 1): Build => {
    const b = withMod(furnaceBench(), 61, "ram", 0, stars);
    return gatling ? withMod(b, 60, "gatling", 0) : b;
  };
  const ramRow = (rows: SocketRow[]): SocketRow => rows.find((r) => r.def === "ram")!;

  it("data: the same on and off (finisher 0.4/0.88/1.4)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("ram", s).mod), `★${s}`).toEqual({ finisher: [0.4, 0.88, 1.4][s - 1] });
      expect(effectAt("ram", s).mod).toEqual(on(() => effectAt("ram", s).mod));
    }
  });

  it("face: one line, SHOT: THE CHAMBER'S LAST {SLUG} +40% {DMG}. (185 px at ★3); ladder {DMG} +40%/+88%/+140%", () => {
    oneLine("ram");
    expect(lines("ram")).toEqual(PCT.map((p) => [`SHOT: THE CHAMBER'S LAST {SLUG} +${p} {DMG}.`]));
    expect(lines("ram").map((l) => px(l[0]))).toEqual([179, 179, 185]);
    for (const s of STARS) expect(on(() => JSON.stringify(faceAt("ram", s)))).not.toMatch(/GATLING/);
    expect(levels("ram", 1)).toEqual(["{DMG} [+40%]/+88%/+140%", next(2, "+88% {DMG}")]);
    expect([hasFace("ram"), on(() => hasFace("ram"))]).toEqual([false, true]);
  });

  it("cue: on a GATLING SPOOL's turret its gear row says IDLE in every form, inside the band (off: as before)", () => {
    for (const s of STARS) {
      const b = gun(true, s), name = s > 1 ? `FINISHER RAM ${starText(s)}` : "FINISHER RAM";
      // the full form (its name, then its face line under it) and the gists' form (its name and gist)
      expect(ramRow(on(() => socketLines(b, 0, "GATLING SPOOL"))).text, `★${s}`).toBe(`${name}: IDLE.`);
      expect(ramRow(on(() => socketLines(b, 0, "GATLING SPOOL", (d, st) => gist(d, st)))).text).toBe(`${name}: IDLE.`);
      expect(on(() => socketLines(b, 0, "GATLING SPOOL", undefined, true))[1].text).toBe(`${name} (IDLE)`);
      // off: the base's rows (its name; its gist), byte for byte
      expect(ramRow(withStarRules(() => socketLines(b, 0, "GATLING SPOOL"), false)).text).toBe(name);
      expect(ramRow(withStarRules(() => socketLines(b, 0, "GATLING SPOOL", (d, st) => gist(d, st)), false)).text)
        .toBe(`${name}: ${PCT[s - 1]} MORE DAMAGE.`);
      // the cue's row, its label and text, fits the band
      const row = ramRow(on(() => socketLines(b, 0, "GATLING SPOOL")));
      expect(px(`${row.label} ${row.text}`)).toBeLessThanOrEqual(225);
    }
    // on any other core, no cue: its row as off
    const plain = gun(false);
    expect(ramRow(on(() => socketLines(plain, 0, "SCRAP CANNON", (d, st) => gist(d, st)))).text).toBe("FINISHER RAM: 40% MORE DAMAGE.");
    expect(gearIdle("ram", "gatling")).toBe(false);
    expect(on(() => [gearIdle("ram", "gatling"), gearIdle("ram", "identity"), gearIdle("hopper", "gatling")])).toEqual([true, false, false]);
  });
});

// ---------------------------------------------------------------------------------------------- row 45: IRON WALL
// Y7b1 (ruling Y7A-R3d): IRON WALL's STAR_DIFF row is deleted, so with the switch on it reads its base def (0.9.2's rule: its
// own plating 10/22/35 a slug, then +30/+66/+105 at 120 PLATE or more). Was "Y5 row 45: IRON WALL: +30/+66/+105 at 120 PLATE
// or more; its own plating goes", with on no plate, a bare hull's hit [0, 0], 110 PLATE [0, 110], 0 plating gained in 15 s
// and the face "HIT: +30 {DMG} AT 120 {*PLATE} OR MORE." (181 px; ladder {DMG} +30/+66/+105)
describe("Y5 row 45: IRON WALL: Y7b1 (Y7A-R3d): +10/+22/+35 PLATE a slug, +30/+66/+105 at 120 PLATE or more, on as off", () => {
  const FLAT = [30, 66, 105];
  /** IRON WALL's hit on a slug with `plate` PLATE on side 0's hull: the slug's flat, and the hull's PLATE after. */
  const wallHit = (star: boolean, stars: number, plate: number): [number, number] => withStarRules(() => {
    const bt = new Battle(rigBench([["shieldwall", 4, 3, stars]]), barge(), 8), s = bt.sides[0];
    for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
    s.plate.plate = plate;
    const h = s.gates[0].hits[0], p = payload();
    probe(bt).applyHit(s, { p, s: h.tile * CELL + CELL / 2, processed: h.tile, blocked: false }, h);
    return [p.flat, s.plate.plate] as [number, number];
  }, star);

  it("data: on, the base def: plate 10/22/35 and plated { min 120, flat 30/66/105 }, as off", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("shieldwall", s).gate), `★${s}`).toEqual({ plate: [10, 22, 35][s - 1], plated: { min: 120, flat: FLAT[s - 1] } });
      expect(effectAt("shieldwall", s).gate, `★${s} off`).toEqual({ plate: [10, 22, 35][s - 1], plated: { min: 120, flat: FLAT[s - 1] } });
    }
  });

  it("hook: it rolls 10/22/35 PLATE a slug and pays at 120 PLATE or more, on as off (Y7A-R3d; Y5: no PLATE of its own)", () => {
    for (const s of STARS) {
      expect(wallHit(true, s, 0), `★${s} on, bare`).toEqual([0, [10, 22, 35][s - 1]]); // Y7b1 (Y7A-R3d): was [0, 0]
      expect(wallHit(false, s, 0), `★${s} off, bare`).toEqual([0, [10, 22, 35][s - 1]]);
      expect(wallHit(true, s, 150), `★${s} on, plated`).toEqual([FLAT[s - 1], 150 + [10, 22, 35][s - 1]]); // Y7b1 (Y7A-R3d): was [FLAT, 150]
      expect(wallHit(true, s, 100)[0], `★${s} on, 100`).toBe(s === 1 ? 0 : FLAT[s - 1]); // 100 + 22 / 35 reaches 120 (★1: 110)
    }
    // its own plating takes a hull at 110 PLATE past 120 before its bonus is read (Battle.applyHit's order), on as off
    expect(wallHit(false, 1, 110)).toEqual([30, 120]);
    expect(wallHit(true, 1, 110)).toEqual([30, 120]); // Y7b1 (Y7A-R3d): was [0, 110]
  });

  it("battle: 15 s on the bench, its side plates the hull, on as off (Y7A-R3d; Y5: no PLATE)", () => {
    const plated = (star: boolean): number => withStarRules(() => {
      const bt = new Battle(rigBench([["shieldwall", 4, 3, 1]]), barge(), SEED);
      while (bt.t < 15 && !bt.over) bt.step();
      return bt.sides[0].plate.gained;
    }, star);
    expect(plated(true)).toBeGreaterThan(0); // Y7b1 (Y7A-R3d): was toBe(0)
    expect(plated(true)).toBe(plated(false));
  });

  it("face: one line, HIT: +10 {*PLATE}, +30 {DMG} AT 120+ {*PLATE}. (both parts; 208 px at ★3); ladders {PLATE} +10/+22/+35 and {DMG} +30/+66/+105", () => {
    oneLine("shieldwall");
    expect(lines("shieldwall")).toEqual(FLAT.map((d, i) => [`HIT: +${[10, 22, 35][i]} {*PLATE}, +${d} {DMG} AT 120+ {*PLATE}.`]));
    expect(Math.max(...lines("shieldwall").map((l) => px(l[0])))).toBe(208);
    expect(levels("shieldwall", 1)).toEqual(["{PLATE} [+10]/+22/+35", "{DMG} [+30]/+66/+105", next(2, "+22 {PLATE}, +66 {DMG}")]);
    expect([hasFace("shieldwall"), on(() => hasFace("shieldwall"))]).toEqual([false, true]); // off: the RULES text, as before
  });
});

// --------------------------------------------------------------------------------------------- row 46: POWDER KEG
describe("Y5 row 46: POWDER KEG: every 12/10/8 s from the start, +60/+130/+210 to the slugs on its belts; no BURN", () => {
  const FUSE = [12, 10, 8], FLAT = [60, 130, 210];
  const TICK = 1 / 60;
  type Blast = { t: number; gains: number[]; burns: number[] };
  /** A battle of the bench with a POWDER KEG (★`stars`, west of belt tile (4,3), uid 10) for `secs`, with the switch on or
   *  off: each blast of side 0's keg (a `keg` event) with its time and what it gave the slugs on its belt then (each one's
   *  flat and BURN gained that tick). `at(bt)`: a setup on each tick before it is stepped (STUN, wreck, rip). */
  function blasts(star: boolean, stars = 1, secs = 30, at: (bt: Battle, keg: GateState) => void = () => {}): { list: Blast[]; bt: Battle } {
    return withStarRules(() => {
      const bt = new Battle(rigBench([["keg", 4, 3, stars]]), barge(), SEED), s = bt.sides[0];
      const keg = s.gates.find((g) => g.def.id === "keg")!;
      const list: Blast[] = [];
      while (bt.t < secs && !bt.over) {
        at(bt, keg);
        const before = new Map(s.routes[0].ammo.map((a) => [a.p.id, [a.p.flat, a.p.burn]] as const));
        bt.step();
        const ev = bt.drainEvents().filter((e) => e.type === "keg" && e.side === 0);
        if (!ev.length) continue;
        const after = s.routes[0].ammo.filter((a) => before.has(a.p.id));
        list.push({ t: bt.t, gains: after.map((a) => a.p.flat - before.get(a.p.id)![0]), burns: after.map((a) => a.p.burn - before.get(a.p.id)![1]) });
      }
      return { list, bt };
    }, star);
  }
  const near = (t: number, want: number): boolean => Math.abs(t - want) <= TICK + 1e-9;

  it("data: on, keg { fuse 12/10/8, flat 60/130/210 }: no burn, no wide (off: burn 1/2/3, ★3 wide)", () => {
    for (const s of STARS) {
      expect(on(() => effectAt("keg", s).gate), `★${s}`).toEqual({ keg: { fuse: FUSE[s - 1], flat: FLAT[s - 1] } });
      expect(effectAt("keg", s).gate, `★${s} off`).toEqual({ keg: { fuse: FUSE[s - 1], flat: FLAT[s - 1], burn: s, ...(s === 3 ? { wide: true } : {}) } });
    }
  });

  it("battle: it blasts at 12 and 24 s from the battle's start, each +60 to every slug on its belt, no BURN (off: once, 12 s after it comes online, +60 and 1 BURN)", () => {
    const onR = blasts(true).list, offR = blasts(false).list;
    expect(onR.map((b) => b.t).every((t, i) => near(t, 12 * (i + 1))), JSON.stringify(onR.map((b) => b.t))).toBe(true);
    expect(onR).toHaveLength(2);
    for (const b of onR) {
      expect(b.gains.length).toBeGreaterThan(0);
      expect(new Set(b.gains)).toEqual(new Set([60]));
      expect(new Set(b.burns)).toEqual(new Set([0]));
    }
    expect(offR).toHaveLength(1);
    expect(offR[0].t).toBeGreaterThan(12.5); // its fuse waited for it to come online (COMMISSION_BASE 1.2 s)
    expect(new Set(offR[0].gains)).toEqual(new Set([60]));
    expect(new Set(offR[0].burns)).toEqual(new Set([1]));
  });

  it("battle: every 10 s at ★2 and every 8 s at ★3, +130 / +210", () => {
    for (const s of [2, 3]) {
      const list = blasts(true, s, 25).list;
      expect(list.map((b) => b.t).every((t, i) => near(t, FUSE[s - 1] * (i + 1))), `★${s}: ${JSON.stringify(list.map((b) => b.t))}`).toBe(true);
      expect(list).toHaveLength(Math.floor(25 / FUSE[s - 1]));
      for (const b of list) expect(new Set(b.gains)).toEqual(new Set([FLAT[s - 1]]));
    }
  });

  it("battle: a 3 s STUN at 5 s pauses the fuse: the blasts come at 15 and 27 s", () => {
    const stun = (bt: Battle, keg: GateState) => { if (bt.ticks === 300) keg.disrupted = 3; };
    const list = blasts(true, 1, 30, stun).list;
    expect(list.map((b) => b.t).every((t, i) => near(t, 15 + 12 * i)), JSON.stringify(list.map((b) => b.t))).toBe(true);
    expect(list).toHaveLength(2);
  });

  it("battle: a wreck at 5 s stops it for the fight: no blast", () => {
    const wreck = (bt: Battle, keg: GateState) => { if (bt.ticks === 300) keg.wrecked = true; };
    expect(blasts(true, 1, 30, wreck).list).toEqual([]);
  });

  it("battle: a GRAPNEL rip on it at 5 s doesn't disarm it: it still blasts at 12 and 24 s (off: disarmed, no blast)", () => {
    type Ripper = { rip(s: SideState, t: unknown, count: number, reach: number): number };
    const rip = (bt: Battle, keg: GateState) => {
      if (bt.ticks !== 300) return;
      const s = bt.sides[0], t = s.targets.find((x) => x.kind === "gate" && x.ref === keg.uid);
      (bt as unknown as Ripper).rip(s, t, 1, 1);
    };
    const onR = blasts(true, 1, 30, rip);
    expect(onR.list.map((b) => b.t).every((t, i) => near(t, 12 * (i + 1)))).toBe(true);
    expect(onR.list).toHaveLength(2);
    expect(onR.bt.sides[0].gates.find((g) => g.def.id === "keg")!.consumed).toBe(false);
    expect(blasts(false, 1, 30, rip).list).toEqual([]);
  });

  it("face: one line, EVERY 12{SEC}: +60 {DMG} TO SLUGS ON ITS BELTS. (209 px at ★1, 215 at ★2); ladders EVERY 12/10/8{SEC}, {DMG} +60/+130/+210", () => {
    oneLine("keg");
    expect(lines("keg")).toEqual(STARS.map((s) => [`EVERY ${FUSE[s - 1]}{SEC}: +${FLAT[s - 1]} {DMG} TO SLUGS ON ITS BELTS.`]));
    expect(lines("keg").map((l) => px(l[0]))).toEqual([209, 215, 209]);
    for (const s of STARS) expect(on(() => JSON.stringify(faceAt("keg", s)))).not.toMatch(/BURN|ONLINE|WIDE/);
    // ★3 WIDE BLAST's name stays, in the ⓘ view only (R-1); its rule is gone
    expect(levels("keg", 1)).toEqual(["EVERY [12]/10/8{SEC}", "{DMG} [+60]/+130/+210", "★3 WIDE BLAST", next(2, "EVERY 10{SEC}, +130 {DMG}")]);
    expect([hasFace("keg"), on(() => hasFace("keg"))]).toEqual([false, true]);
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
