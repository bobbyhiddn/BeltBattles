// TXT-096 (a) (REQ-BFG-070, REQ-BFG-046; text only, rules bb-0.9.7 unchanged): the words pass on REVIEW-TXT095 Q2's faces.
// Each face line that changed says a real sim rule its sentence said and its face had dropped; each test here reads that
// rule from the sim side (a sim run, a chamber hook, the rip, the copies), never from the text, so a change to the rule
// turns it red:
//   ASSEMBLY LINE    "FEEDS A GUN: YOUR RIGS START 50% SOONER." (★3 "AT ONCE"): battle.ts assemblyLines / makeSide
//   HULLBREAKER      "SHOT: HITS ONLY THE HULL, FOR +30% {DMG}.": Battle.fireCore aims it at hullTarget()
//   GATLING SPOOL    "FIRES AT ONCE, SPINS UP TO 67% FASTER.": cores.ts gatlingReady against the default ready
//   GRAPNEL GUN      "SHOT: ON A BELT OR RIG, RIPS 1 SLUG.": Battle.rip on a belt tile or a rig
//   PRESSURE BREECH  "SHOT: +12 {DMG} FOR EACH {SLUG} WAITING, MAX 5 {SLUG}.": cores.ts pressureBonus's cap
//   SORTING ARM      "HIT: OF EVERY 3 {SLUG}, ONE BECOMES 2, FULL {DMG}.": Battle.applyHit's copy against a SPLITTER's
// Every changed line stays one line of 5x7 inside the op band (225 px) at every star and class factor.
import { describe, expect, it } from "vitest";
import { assemblyLines, Battle, makeTurret, type Payload, type SideState, type TileHit, type TurretState } from "../src/sim/battle";
import { CELL, COMMISSION_BASE, ITEMS, classFactor } from "../src/sim/content";
import { pressureBonus, ROUTINES, scaleCore } from "../src/sim/cores";
import { setTurretList, turretSlots, type Build } from "../src/sim/deck";
import { effectAt, starField } from "../src/sim/stars";
import { newRun } from "../src/game/run";
import { icons, textWidth } from "../src/render/font";
import { faceAt, NEXT_LINE_W } from "../src/ui/faces";
import { startIn } from "../src/ui/abilityText";
import { fmtCount, fmtDmg, fmtPct } from "../src/ui/statFormat";
import { barge, bench, run } from "./arsenal.bench";
import { east, key as K, payload, probe, rigBench } from "./y3.helpers";

const STARS = [1, 2, 3];
/** Every class factor a gun gives at ★1-★3, and 1 (a core's numbers scale with it). */
const KS = [...new Set([1, ...Object.values(ITEMS).filter((d) => d.kind === "turret").flatMap((d) => STARS.map((s) => classFactor(effectAt(d.id, s).turret!)))])];
/** The face's one rule line (markup) of `def` at `s` on a gun of class factor `k`. */
const rule = (def: string, s: number, k = 1): string => {
  const rs = faceAt(def, s, { k })!.rules;
  expect(rs, `${def} ★${s}`).toHaveLength(1);
  return rs[0].text;
};
const core = (def: string, s: number, k = 1) => scaleCore(effectAt(def, s).core!, k)!;
/** CARD-2 (REQ-BFG-081, K3 g): the face's rule lines (GATLING SPOOL's are two now: FIRES EACH LOAD AS IT COMES., then its spin). */
const rules = (def: string, s: number, k = 1): string[] => faceAt(def, s, { k })!.rules.map((r) => r.text);

describe("TXT-096 (a): the changed faces say the sim's rules (REQ-BFG-070, REQ-BFG-046)", () => {
  // ------------------------------------------------------------------------------------------------- ASSEMBLY LINE
  /** tests/y3.pieces.test.ts's bench: an ASSEMBLY LINE (★s) on the Kiln's belt into gun 0 with WHETSTONEs on its tiles 2 and 4,
   *  a STAMP PRESS (uid 7) on a second belt into the same gun with a WHETSTONE (uid 50) on it. `feeds` false: its belt is cut
   *  to its first 2 tiles, so it reaches no gun (its own WHETSTONEs then work no belt). */
  const asm = (s: number, feeds = true): Build => {
    const b = rigBench([["whetstone", 4, 3, 1], ["whetstone", 4, 1, 1]]);
    b.items[0] = { uid: 1, def: "assembly", x: 4, y: 6, ...starField(s) };
    if (!feeds) b.routes[0] = { factory: 1, cells: [K(4, 5), K(4, 4)] };
    b.items.push({ uid: 7, def: "press", x: 6, y: 6 });
    b.routes.push({ factory: 7, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
    return east(b, "whetstone", 5, 3);
  };
  /** The press belt's WHETSTONE (first on its belt): when makeSide brings it online. */
  const pressRigAt = (b: Build): number => new Battle(b, barge(), 8).sides[0].gates.find((g) => g.uid === 50)!.commissionAt;

  it("ASSEMBLY LINE: FEEDS A GUN is its condition: fed, every rig of yours (the other belt's too) starts at x commission; cut off, nothing changes", () => {
    for (const s of STARS) {
      const commission = effectAt("assembly", s).factory!.commission!;
      // the sim: the factor counts only while its belt reaches a gun (routeInfo connected)
      expect(assemblyLines(asm(s)).factor, `★${s} fed`).toBe(commission);
      expect(assemblyLines(asm(s, false)).factor, `★${s} cut`).toBe(1);
      expect(pressRigAt(asm(s)), `★${s} fed`).toBeCloseTo(COMMISSION_BASE * commission, 9);
      expect(pressRigAt(asm(s, false)), `★${s} cut`).toBeCloseTo(COMMISSION_BASE, 9);
      // the face says the condition and the sim's factor, in its sentence's words
      // CARD-2 (REQ-BFG-081, K3 g; READ-3 6: START, run or fight): WORK (was "FEEDS A GUN: YOUR RIGS START ...")
      expect(rule("assembly", s), `★${s}`).toBe(`FEEDS A GUN: YOUR RIGS START ${startIn(assemblyLines(asm(s)).factor)}.`);
    }
  });

  it("ASSEMBLY LINE ★3 says AT ONCE: every rig it speeds is online on the battle's first tick (commissionAt 0), so 100% SOONER was the same rule in other words", () => {
    const bt = new Battle(asm(3), barge(), 8), working = bt.sides[0].gates.filter((g) => g.hits.length > 0);
    expect(working.length).toBe(3);
    expect(working.map((g) => g.commissionAt)).toEqual([0, 0, 0]);
    bt.step();
    expect(working.map((g) => g.online)).toEqual([true, true, true]);
    expect(rule("assembly", 3)).toBe("FEEDS A GUN: YOUR RIGS START AT ONCE."); // CARD-2 (K3 g): WORK (was START)
    // ★1 and ★2 come online later (their % is the sim's: 1 - commissionAt / its time without one)
    for (const s of [1, 2]) expect(rule("assembly", s)).toBe(`FEEDS A GUN: YOUR RIGS START ${fmtPct(1 - pressRigAt(asm(s)) / pressRigAt(asm(s, false)))} SOONER.`);
  });

  // --------------------------------------------------------------------------------------------------- HULLBREAKER
  /** The kinds of target side 0's gun 0 shoots at in 40 s against the barge (its Loom and 3 guns: 4 parts), its core `mods`. */
  const targetKinds = (mods: [string, number][]): Set<string> => {
    const kinds = new Set<string>(), seen = new Set<number>();
    run(bench([], mods), 40, barge(), 12345, (_ev, bt) => {
      for (const p of bt.projectiles) if (p.from === 0 && p.turret === 0 && !seen.has(p.id)) { seen.add(p.id); kinds.add(p.target.kind); }
    });
    expect(seen.size, `${JSON.stringify(mods)}: shots`).toBeGreaterThan(20);
    return kinds;
  };

  it("HULLBREAKER: HITS ONLY THE HULL: every shot of its gun is aimed at the hull; the same gun without it hits parts too", () => {
    expect([...targetKinds([])].some((k) => k !== "hull")).toBe(true);
    for (const s of STARS) {
      expect([...targetKinds([["hullbreaker", s]])], `★${s}`).toEqual(["hull"]);
      for (const k of KS) expect(rule("hullbreaker", s, k), `★${s} k${k}`).toBe(`SHOT: HITS ONLY THE HULL, FOR +${fmtPct(core("hullbreaker", s, k).hullMul! - 1)} {DMG}.`);
    }
  });

  // ------------------------------------------------------------------------------------------------- GATLING SPOOL
  /** makeTurret's gun 0 of a FURNACE with `gun` and, if any, a GATLING SPOOL (★cs) as its core. */
  const gun = (def: string, cs?: number): TurretState => {
    const r = newRun("furnace", 5, "txt096");
    setTurretList(r.build, [{ slot: 0, def, uid: 700 }]);
    if (cs) r.build.mods.push({ uid: 730, def: "gatling", turret: 0, ...starField(cs) } as Build["mods"][number]);
    return makeTurret(r.build, 0, turretSlots(r.build)[0].td!);
  };
  /** Is gun `tu` ready to fire with one load in its chamber, `t` s after it came in, its barrel ready (cores.ts ROUTINES)? */
  const readyWithOne = (tu: TurretState, t: number): boolean =>
    ROUTINES[tu.core.routine].ready({ ...tu, stack: [{} as TurretState["stack"][number]], loadTimer: t, fireCd: 0 });

  it("GATLING SPOOL: FIRES AT ONCE: one load on a ready barrel fires with no wait; the default gun waits for a full chamber or its window", () => {
    for (const def of ["scrapcannon", "dartgun", "thunderer"]) {
      const plain = gun(def);
      expect(plain.core.routine, def).toBe("identity");
      expect([plain.window > 1, readyWithOne(plain, 0), readyWithOne(plain, plain.windowTime)], def).toEqual([true, false, true]);
      for (const s of STARS) {
        const g = gun(def, s);
        expect(g.core.routine, `${def} ★${s}`).toBe("gatling");
        expect(readyWithOne(g, 0), `${def} ★${s}`).toBe(true);
      }
    }
    // CARD-2 (REQ-BFG-081, K3 g; READ-3 6: FIRES AT ONCE): FINAL NAIL's note's words, a line of their own, then the spin (was
    // one line, "FIRES AT ONCE, SPINS UP TO 67% FASTER.")
    for (const s of STARS) for (const k of KS) {
      expect(rules("gatling", s, k), `★${s} k${k}`).toEqual(["FIRES EACH LOAD AS IT COMES.", `SPINS UP TO ${fmtPct(core("gatling", s, k).top! / 100)} FASTER.`]);
    }
  });

  // --------------------------------------------------------------------------------------------------- GRAPNEL GUN
  it("GRAPNEL GUN: ON A BELT OR RIG: Battle.rip takes the slug by a rig it hits, as by a belt tile; a hit on a factory or a gun rips nothing", () => {
    /** Side 1 (the bench: the Kiln's belt with a WHETSTONE working tile 2) with one slug on that tile; rip from a hit on `kind`. */
    const ripFrom = (kind: string): number => {
      const bt = new Battle(barge(), bench([["whetstone", 4, 3, 1]]), 8), s = bt.sides[1] as SideState;
      const rig = s.gates[0], h = rig.hits[0] as TileHit;
      s.routes[h.route].ammo.push({ p: payload(901), s: h.tile * CELL + CELL / 2, processed: h.tile, blocked: false } as SideState["routes"][number]["ammo"][number]);
      const t = kind === "gate" ? s.targets.find((x) => x.kind === "gate" && x.ref === rig.uid)
        : kind === "belt" ? s.targets.find((x) => x.kind === "belt" && x.ref === h.route && x.cell === h.tile)
          : s.targets.find((x) => x.kind === kind);
      expect(t, kind).toBeDefined();
      const n = (bt as unknown as { rip(s: SideState, t: unknown, count: number, reach: number): number }).rip(s, t, 1, 1);
      expect(s.routes[h.route].ammo.length, kind).toBe(1 - n);
      return n;
    };
    expect(["gate", "belt", "factory", "turret"].map(ripFrom)).toEqual([1, 1, 0, 0]);
    for (const s of STARS) for (const k of KS) {
      const n = core("grapnel", s, k).rip!;
      expect(rule("grapnel", s, k), `★${s} k${k}`).toBe(`SHOT: A FOE BELT OR RIG LOSES ${fmtCount(n)} SLUG${n === 1 ? "" : "S"}.`);
    }
  });

  // ----------------------------------------------------------------------------------------------- PRESSURE BREECH
  it("PRESSURE BREECH: MAX n is pressureBonus's own cap, the waiting loads it counts at most (its SHOT tap's UP TO n)", () => {
    for (const s of STARS) for (const k of KS) {
      const c = core("pressure", s, k);
      const counts = Array.from({ length: 30 }, (_, q) => pressureBonus(c, q) / c.perQueued!);
      const cap = Math.max(...counts);
      expect(counts.indexOf(cap), `★${s} k${k}`).toBe(cap); // it grows by one load at a time up to the cap, then stays
      expect(rule("pressure", s, k), `★${s} k${k}`).toBe(`SHOT: +${fmtDmg(c.perQueued!)} {DMG} FOR EACH {SLUG} WAITING, MAX ${fmtCount(cap)} {SLUG}.`);
    }
  });

  // --------------------------------------------------------------------------------------------------- SORTING ARM
  /** The copies one rig (the bench's first, ★s) makes of `hits` slugs (each a plain slug with 20 bonus damage and 1 BURN),
   *  with the slug each was copied from, after its hit. */
  const copiesOf = (def: string, s: number, hits: number): { copy: Payload; from: Payload }[] => {
    const bt = new Battle(rigBench([[def, 4, 3, s]]), barge(), 8), side = bt.sides[0];
    for (const g of side.gates) { g.online = true; g.commissionAt = 0; }
    const g = side.gates[0], h = g.hits[0], out: { copy: Payload; from: Payload }[] = [];
    for (let i = 0; i < hits; i++) {
      const p = { ...payload(900 + i), flat: 20, burn: 1 };
      const made = probe(bt).applyHit(side, { p, s: h.tile * CELL + CELL / 2, processed: h.tile, blocked: false }, h) as { p: Payload }[];
      for (const c of made) out.push({ copy: c.p, from: p });
    }
    return out;
  };

  it("SORTING ARM: FULL {DMG}: its copy is the slug as it is (its damage share and bonus damage whole); a SPLITTER's copies are cut", () => {
    for (const s of STARS) {
      const so = effectAt("sorting", s).gate!.sort!;
      const made = copiesOf("sorting", s, so.every);
      expect(made.length, `★${s}`).toBe(so.copies - 1);
      for (const { copy, from } of made) expect([copy.mult, copy.flat, copy.burn], `★${s}`).toEqual([from.mult, from.flat, from.burn]);
      expect(made.every(({ copy }) => copy.mult === 1 && copy.flat === 20), `★${s}`).toBe(true);
      const split = copiesOf("splitter", s, 1);
      expect(split.length, `splitter ★${s}`).toBeGreaterThan(0);
      for (const { copy } of split) expect(copy.mult, `splitter ★${s}`).toBeLessThan(1);
      expect(rule("sorting", s), `★${s}`).toBe(`HIT: OF EVERY ${fmtCount(so.every)} {SLUG}, ONE BECOMES ${fmtCount(so.copies)}, FULL {DMG}.`);
    }
  });

  // ------------------------------------------------------------------------------------------------------------ fit
  it("every changed line is one line of 5x7 inside the op band (225 px) at every star and class factor", () => {
    let widest = 0, at = "";
    // CARD-2 (REQ-BFG-081, K3 g): each rule line (GATLING SPOOL's two; was rule(): one line each piece)
    for (const def of ["assembly", "hullbreaker", "gatling", "grapnel", "pressure", "sorting"]) for (const s of STARS) for (const k of KS) for (const line of rules(def, s, k)) {
      const w = textWidth(icons(line));
      if (w > widest) { widest = w; at = `${def} ★${s} k${k}`; }
      expect(w, `${def} ★${s} k${k}: ${line}`).toBeLessThanOrEqual(NEXT_LINE_W);
    }
    expect(NEXT_LINE_W).toBe(225);
    console.log(`TXT-096 faces: the widest changed line ${widest} px of ${NEXT_LINE_W} (${at})`);
  });
});
