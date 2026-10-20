// GATES-1b (REQ-BFG-052; BRIEF-GATES1B B3, review risk 7): the belt panel's DMG, BURN, TIME and COPIES through a gate on the belt.
// The panel's walk (deck.ts walkRoute with WalkOpts.gates, which inspector.ts beltPanel turns on) carries one slug through each gate
// with ONE pure function (convert.ts convertWalk), which hands it to the engine's own payload rules (fusePayload, pelletPayload,
// smeltPayload). For each gate at ★1 and ★3 on a belt with rigs before and after it (TEMPER's BURN, WHETSTONEs' flat), the numbers equal
// what a short battle measures at the gun's intake: the damage of the slug that reaches the gun, its BURN, the ticks from the stamp
// to the load (a FUSER's: from the stamp of the slug that completes the pair), and the slugs that reach the gun for each stamped.
// Off (the walk's default: the bots' rating and estimates) the walk is blind to a gate as before, and with no gate on the deck (GATES off)
// the panel's walk is the plain walk exactly.
import { afterEach, describe, expect, it } from "vitest";
import { Battle, type Payload } from "../src/sim/battle";
import { AMMO, BELT_SPEED, CELL, ITEMS, TICK } from "../src/sim/content";
import { estimateRoute, payloadDamage, shotFloor, walkRoute, type Build } from "../src/sim/deck";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { withLadderFix } from "../src/sim/ladderFix";
import { dmgShown } from "../src/sim/hullScale";
import { beltPanel } from "../src/screens/build/inspector";
import { newRun } from "../src/game/run";
import { fmtClock, fmtCount, fmtDmg } from "../src/ui/statFormat";
import { barge, bench, SEED } from "./arsenal.bench";

afterEach(() => setGates(GATES));

/** The Furnace bench (tests/arsenal.bench.ts: the KILN at (4,6), a 6-tile belt up column 4 into the gun, tile t = (4, 5 - t)) with a
 *  TEMPER on tile 0 and a WHETSTONE on tile 1 (before the gate) and another on tile 4 (after it), and the gate on tile 3. */
function deck(def?: string, stars = 1): Build {
  const b = bench([["temper", 4, 5, 1], ["whetstone", 4, 4, 1], ["whetstone", 4, 1, 1]]);
  if (def) b.items.push({ uid: 40, def, x: 4, y: 2, ...(stars > 1 ? { stars } : {}) });
  return b;
}

interface Measured { loads: { p: Payload; tick: number }[]; stampTick: number }

/** A short battle: every rig online, then `stamps` stamps of the KILN 60 ticks apart (the factory held otherwise); every payload that
 *  enters the gun's chamber, with its tick, and the tick of the last stamp. */
function measure(b: Build, stamps: number): Measured {
  const bt = new Battle(b, barge(), SEED);
  const side = bt.sides[0], f = side.factories.find((x) => x.uid === 1)!, tu = side.turrets[0];
  const loads: Measured["loads"] = [];
  const push = tu.stack.push.bind(tu.stack);
  tu.stack.push = (...ps: Payload[]): number => { for (const p of ps) loads.push({ p: { ...p }, tick: bt.ticks }); return push(...ps); };
  f.timer = 1e9;
  while (!side.gates.every((g) => g.online || !g.hits.length) && bt.t < 60) { bt.step(); bt.drainEvents(); }
  let made = 0, stampTick = -1;
  for (let i = 0; i < 25 * 60 && !bt.over; i++) {
    if (made < stamps && (made === 0 || bt.ticks - stampTick >= 60)) f.timer = 0;
    const before = f.produced;
    bt.step();
    bt.drainEvents();
    if (f.produced > before) { made++; stampTick = bt.ticks; f.timer = 1e9; }
  }
  return { loads, stampTick };
}

/** A payload's damage at the gun's intake: the walk's own formula (deck.ts payloadDamage). */
const dmgAt = (p: Payload): number => { const a = AMMO[p.ammo]; return payloadDamage(p.base ?? a.base, a.rideScale, p.ride, p.mult, p.flat + (p.heatBonus ?? 0), shotFloor(p.ammo)); };

const CASES: [string, number][] = [["fuser", 1], ["fuser", 3], ["scattermill", 1], ["scattermill", 3], ["smelter", 1], ["smelter", 3]];

describe("GATES-1b B3: the belt panel's numbers through a gate equal what a battle measures at the gun's intake", () => {
  for (const [def, stars] of CASES) {
    it(`${def} ★${stars}: DMG, BURN, TIME and COPIES as the panel reads them`, () => {
      withGates(() => {
        const b = deck(def, stars);
        const est = walkRoute(b, 0, undefined, { gates: true }).estimate;
        const stamps = def === "fuser" ? 2 : 1;
        const m = measure(b, stamps);
        expect(m.loads.length, "payloads that reached the gun").toBeGreaterThan(0);
        const first = m.loads[0];
        expect(est.dmg, `${def} ★${stars} DMG`).toBe(dmgAt(first.p));
        for (const l of m.loads) expect(dmgAt(l.p), "every payload of the stamp is alike").toBe(est.dmg);
        expect(est.burn, "BURN").toBe(first.p.burn);
        expect((first.tick - m.stampTick) * TICK, "TIME: ticks from the stamp to the gun").toBeCloseTo(est.time, 9);
        expect(m.loads.length / stamps, "COPIES: slugs at the gun for each stamped").toBe(est.copies);
        // and the panel itself prints them (the real panel for this deck, day 1): DMG and BURN, TIME, COPIES only above 1
        const run = newRun("furnace", 5, "gates1");
        run.build = b;
        const foot = beltPanel(run, 0)!.foot.flatMap((blk) => blk.cells ?? []);
        const cell = (k: string): string | undefined => foot.find(([n]) => n === k)?.[1];
        expect(cell("DMG"), "panel DMG").toBe(fmtDmg(dmgShown(dmgAt(first.p), run.day)));
        expect(cell("BURN"), "panel BURN").toBe(String(first.p.burn));
        expect(cell("TIME"), "panel TIME").toBe(`${fmtClock((first.tick - m.stampTick) * TICK)} SEC`);
        expect(cell("COPIES"), "panel COPIES").toBe(m.loads.length / stamps > 1 ? fmtCount(m.loads.length / stamps) : undefined);
      });
    });
  }

  it("what each gate does to the numbers, in words: the FUSER's slug is worth more than the plain belt's, the MILL's pellets are shares, the SMELTER adds BURN", () => {
    withGates(() => {
      const plain = walkRoute(deck(), 0, undefined, { gates: true }).estimate;
      const fuser = walkRoute(deck("fuser"), 0, undefined, { gates: true }).estimate;
      const mill = walkRoute(deck("scattermill"), 0, undefined, { gates: true }).estimate;
      const smelter = walkRoute(deck("smelter"), 0, undefined, { gates: true }).estimate;
      expect(fuser.dmg).toBeGreaterThan(plain.dmg); // two slugs' damage, +50%
      expect(fuser.copies).toBe(0.5); // one slug for each two
      expect(mill.dmg).toBeLessThan(plain.dmg); // a pellet is a share of the slug
      expect(mill.copies).toBe(3);
      expect(smelter.burn).toBe(plain.burn + 2); // ★1: +2 BURN
      for (const e of [fuser, mill, smelter]) expect(e.time, "a second inside the gate, less the tile it skips").toBeCloseTo(plain.time + 1 - CELL / BELT_SPEED, 9);
    });
  });
});

describe("GATES-1b B3: only the panel's walk sees a gate; with none on the deck every walk is the plain one", () => {
  it("the walk's default (the bots' rating and estimates) is blind to a gate exactly as before: estimateRoute and the timeline equal the deck without it", () => {
    withGates(() => {
      for (const [def] of CASES) {
        expect(estimateRoute(deck(def), 0)).toEqual(estimateRoute(deck(), 0));
        expect(walkRoute(deck(def), 0)).toEqual(walkRoute(deck(), 0));
      }
    });
  });

  it("a deck with no gate (every deck with GATES off): the panel's walk is the plain walk, field for field", () => {
    for (const b of [deck(), bench([["whetstone", 4, 3, 1]])]) {
      expect(walkRoute(b, 0, undefined, { gates: true })).toEqual(walkRoute(b, 0)); // what beltPanel reads
      expect(walkRoute(b, 0, undefined, { gates: true, unplated: true })).toEqual(walkRoute(b, 0, undefined, { unplated: true }));
    }
    // and with GATES off the three gates are no pieces at all: no deck can hold one
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default): was bare (the shipped world had GATES off); asked for outright now (withGates(fn, false))
    withGates(() => expect(Object.keys(ITEMS).filter((id) => ITEMS[id].kind === "converter")).toEqual([]), false);
  });

  it("the continuous walk (LADDER_FIX off) puts a second inside the gate and leaves its tile out", () => {
    withGates(() => withLadderFix(() => {
      const plain = walkRoute(deck(), 0, undefined, { gates: true }).estimate;
      const smelter = walkRoute(deck("smelter"), 0, undefined, { gates: true }).estimate;
      expect(smelter.time).toBeCloseTo(plain.time + 1 - CELL / BELT_SPEED, 9);
      expect(smelter.ride).toBeCloseTo(plain.ride - CELL / BELT_SPEED, 9); // no ride on the tile it stands on, none while it waits
      expect(smelter.burn).toBe(plain.burn + 2);
    }, false));
  });
});
