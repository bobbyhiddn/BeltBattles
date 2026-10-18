// SCALE-2a (REQ-BFG-100, C11; BRIEF-SCALE2a step 8 (i); REPORT-COUNT1 section 3): a reader's add as a number. The sim's
// optional `add` on process and fire events (set with SCALE_RIGS on or off: display data), the battle view's `+n` pop
// (Fx.readerPop and its yield rule) and its anchor: a rig's pop at the event's (route, tile) through
// ArenaMotion.tileCentre, a shaped rig's too (never its anchor cell or pieceMid), a gun part's at its gun's pivot.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CELL, ITEMS, type ItemDef } from "../src/sim/content";
import { Battle, type SimEvent } from "../src/sim/battle";
import { kx, ky, turretSlots, type Build } from "../src/sim/deck";
import { clearStarCache, effectAt } from "../src/sim/stars";
import { pressureBonus } from "../src/sim/cores";
import { shapesRules } from "../src/sim/shapes";
import { withScaleRigs } from "../src/sim/scale";
import { ADD_BIG, ADD_MIN } from "../src/game/counters";
import { Arena } from "../src/game/arena";
import { ArenaMotion } from "../src/game/arenaMotion";
import {
  HEAL_COLOUR, PLATE_COLOUR, pieceMid, react, readerGunPoint, readerStyle, readerTilePoint,
} from "../src/game/arenaReact";
import { Fx, type Popup } from "../src/render/fx";
import { C } from "../src/render/palette";
import { TILE, TURRET_LY, sx, sy } from "../src/render/frame";
import { applyAffine } from "../src/render/motion";
import { SEED, barge, furnaceBench, item, withItem, withMod } from "./wave3.helpers";

// a SHAPED test rig with a count term (no shipped shaped rig has one): an I2 COUNTERWEIGHT, one arrow a cell
const SHAPED: ItemDef = {
  id: "s2ashaped", name: "S2A SHAPED", kind: "gate", rarity: "common", price: 4, size: 1, foot: "I2", merchant: "alchemist",
  desc: [], tags: ["FORGE"], gate: { perTile: { each: 10 } },
};
const ITEMS_RW = ITEMS as Record<string, ItemDef>;
beforeAll(() => { ITEMS_RW.s2ashaped = SHAPED; clearStarCache(); });
afterAll(() => { delete ITEMS_RW.s2ashaped; clearStarCache(); });

const east = (uid: number, def: string, y: number, stars = 1) => item(uid, def, 3, y, 1, stars);
const twin = (uid: number, def: string, y: number, stars = 1) => item(uid, def, 3, y, 0, stars);
/** Every event of a battle on `b` (made under the switch as it is when called), tick by tick, for `secs`. */
function events(b: Build, secs: number): SimEvent[] {
  const bt = new Battle(b, barge(), SEED), out: SimEvent[] = [];
  while (bt.t < secs && !bt.over) { bt.step(); out.push(...bt.drainEvents()); }
  return out;
}
const procs = (ev: SimEvent[], uid: number) =>
  ev.filter((e): e is Extract<SimEvent, { type: "process" }> => e.type === "process" && e.side === 0 && e.gate === uid);
/** The live pops of an Fx (its first popCount). */
const live = (fx: Fx): Popup[] => fx.popList.slice(0, fx.popCount);

// ---------------------------------------------------------------------------------------------- the event (step 6)

describe("SCALE-2a C11: the sim's `add` on process and fire (no new event type)", () => {
  it("a live count term carries what it gave, with the switch off as on; none at 0; an overclock's doubling counts", () => {
    // WHETSTONE at tile 0, LONG HAUL ★1 at tile 2: +10 for its one earlier hit; alone it has none and adds nothing
    const deck = withItem(withItem(furnaceBench(), east(30, "whetstone", 5)), twin(31, "longhaul", 3));
    const off = procs(events(deck, 10), 31), on = procs(withScaleRigs(() => events(deck, 10)), 31);
    expect(off.length).toBeGreaterThan(3);
    for (const e of off) expect(e.add).toEqual({ amount: 10, kind: "dmg" });
    expect(on.map((e) => e.add)).toEqual(off.map((e) => e.add));
    for (const e of procs(events(deck, 10), 30)) expect(e.add).toBeUndefined(); // a stat row is no count term
    const alone = procs(events(withItem(furnaceBench(), twin(31, "longhaul", 3)), 10), 31);
    expect(alone.length).toBeGreaterThan(3);
    for (const e of alone) expect("add" in e).toBe(false);
    // ASSEMBLY LINE's HOT START overclock (the rig's hotUntil): LONG HAUL's 10 doubles to 20, and so does its add
    const bt = new Battle(deck, barge(), SEED), hot: number[] = [];
    bt.sides[0].gates.find((g) => g.uid === 31)!.hotUntil = 1e9;
    while (bt.t < 10) { bt.step(); for (const e of procs(bt.drainEvents(), 31)) hot.push(e.add!.amount); }
    expect(hot.length).toBeGreaterThan(3);
    for (const a of hot) expect(a).toBe(20);
  });

  it("PRESSURE BREECH's perQueued rides its fire event (switch off)", () => {
    const gun = new Battle(furnaceBench(), barge(), SEED).sides[0].routes[0].turret;
    const b = withMod(furnaceBench(), 40, "pressure", gun);
    const bt = new Battle(b, barge(), SEED);
    let fires = 0;
    while (bt.t < 12) {
      bt.step();
      const c = bt.sides[0].turrets.find((tu) => tu.index === gun)!.core.spec;
      for (const e of bt.drainEvents()) if (e.type === "fire" && e.side === 0) {
        expect(e.add?.kind).toBe("dmg");
        expect([1, 2, 3, 4, 5].map((n) => pressureBonus(c, n))).toContain(e.add!.amount);
        fires++;
      }
    }
    expect(fires).toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------------------------------------- the pop's style

describe("SCALE-2a C11: +n at ADD_MIN, big at ADD_BIG, in its effect's colour", () => {
  it("9 no pop, 10 a pop, 139 small, 140 big (scale 2, yellow for DMG); DMG bone, PLATE plate3, HEAL green", () => {
    expect([ADD_MIN, ADD_BIG]).toEqual([10, 140]);
    expect(readerStyle({ amount: 9, kind: "dmg" })).toBeNull();
    expect(readerStyle({ amount: 10, kind: "dmg" })).toEqual({ text: "+10", color: C.bone, big: false });
    expect(readerStyle({ amount: 139, kind: "dmg" })).toEqual({ text: "+139", color: C.bone, big: false });
    expect(readerStyle({ amount: 140, kind: "dmg" })).toEqual({ text: "+140", color: C.yellow, big: true });
    expect(readerStyle({ amount: 24, kind: "plate" })).toEqual({ text: "+24", color: PLATE_COLOUR, big: false });
    expect(readerStyle({ amount: 30, kind: "heal" })).toEqual({ text: "+30", color: HEAL_COLOUR, big: false });
    expect(readerStyle({ amount: 150, kind: "plate" })).toEqual({ text: "+150", color: PLATE_COLOUR, big: true });
    expect([C.bone, PLATE_COLOUR, HEAL_COLOUR]).toEqual(["#D0CEB7", "#C6D0EA", "#59DF67"]);
  });
});

// ---------------------------------------------------------------------------------------------- the yield rule

describe("SCALE-2a C11: Fx.readerPop's yield rule", () => {
  const fill = (fx: Fx, n: number) => { for (let i = 0; i < n; i++) fx.popup(0, 0, `${i}`, C.white); };

  it("a reader pop takes a free slot, else the oldest reader pop's, else it is dropped", () => {
    const fx = new Fx();
    fill(fx, 46);
    expect(fx.readerPop(1, 1, "+11", C.bone)).toBe(true); // free slots
    fx.update(0.1);
    expect(fx.readerPop(2, 2, "+22", C.bone)).toBe(true);
    expect([fx.popCount, fx.readerCount]).toEqual([48, 2]);
    expect(fx.readerPop(3, 3, "+33", C.bone)).toBe(true); // full: the oldest reader pop's slot (+11)
    expect([fx.popCount, fx.readerCount]).toEqual([48, 2]);
    expect(live(fx).filter((p) => p.reader).map((p) => p.text).sort()).toEqual(["+22", "+33"]);
    const none = new Fx();
    fill(none, 48);
    expect(none.readerPop(1, 1, "+11", C.bone)).toBe(false); // no reader pop to take: dropped, no number lost
    expect([none.popCount, none.readerCount]).toEqual([48, 0]);
  });

  it("popup() and windPop() take a reader pop's slot first when the pool is full; with none, as before", () => {
    const fx = new Fx();
    fill(fx, 45);
    fx.readerPop(1, 1, "+11", C.bone);
    fx.update(0.05);
    fx.readerPop(2, 2, "+22", C.bone);
    fx.readerPop(3, 3, "+33", C.bone);
    expect([fx.popCount, fx.readerCount]).toEqual([48, 3]);
    fx.popup(5, 5, "77", C.white); // a damage number never waits for a reader pop: it takes the oldest's slot (+11)
    expect([fx.popCount, fx.readerCount]).toEqual([48, 2]);
    expect(live(fx).some((p) => p.text === "77" && !p.reader)).toBe(true);
    expect(live(fx).some((p) => p.text === "+11")).toBe(false);
    fx.windPop(6, 6, "40", C.windHit); // the wind's number too
    expect([fx.popCount, fx.readerCount]).toEqual([48, 1]);
    expect(live(fx).filter((p) => !p.reader && !p.wind).length).toBe(46); // every damage number kept
    const full = new Fx();
    fill(full, 48);
    full.popup(5, 5, "77", C.white); // no reader pop: dropped, as before
    expect(live(full).some((p) => p.text === "77")).toBe(false);
  });

  it("PAIR pops yield to a reader pop as to any number (pairPop unchanged)", () => {
    const fx = new Fx();
    fill(fx, 40);
    for (let i = 0; i < 8; i++) expect(fx.pairPop(0, 0)).toBe(true); // the room is full: 40 + 8
    expect(fx.readerPop(1, 1, "+11", C.bone)).toBe(true); // a free number slot
    fx.update(0.01);
    expect([fx.popCount, fx.pairCount]).toEqual([41, 7]);
  });
});

// ---------------------------------------------------------------------------------------------- the anchor

describe("SCALE-2a C11: the anchor (the motion lane's rule)", () => {
  /** The pop a process event makes in arena `a` (react), or undefined. */
  const popFor = (a: Arena, e: SimEvent): Popup | undefined => {
    const n = a.fx.popCount;
    react(a, e);
    return live(a.fx).slice(n).find((p) => p.reader);
  };
  const moving = (a: Arena): ArenaMotion => {
    const am = new ArenaMotion(7, "desert", { sway: 1, sea: null, perf: false }, false);
    am.model.t = 3.7;
    am.frame(a);
    return am;
  };

  it("a 1-cell rig's pop sits at the event's tile, through tileCentre: not on the rig's own cell", () => {
    const deck = withItem(withItem(furnaceBench(), east(30, "whetstone", 5)), twin(31, "longhaul", 3));
    const a = new Arena(deck, barge(), SEED, null);
    a.quiet = true;
    const e = procs(events(deck, 10), 31).find((x) => x.add)!;
    expect(e.tile).toBe(2);
    const tk = deck.routes[0].cells[e.tile]; // (4,3)
    const pop = popFor(a, e)!;
    expect(pop.text).toBe("+10");
    expect(pop.color).toBe(C.bone);
    expect([pop.x, pop.y]).toEqual(readerTilePoint(a, 0, e.route, e.tile));
    expect([pop.x, pop.y]).toEqual([sx(a.drawn[0], (kx(tk) + 0.5) * CELL, (ky(tk) + 0.5) * CELL), sy(a.drawn[0], (kx(tk) + 0.5) * CELL, (ky(tk) + 0.5) * CELL)]);
    const [rx, ry] = pieceMid(a, 0, a.b.sides[0].gates.find((g) => g.uid === 31)!); // the rig's cell, (3,3)
    expect([pop.x, pop.y]).not.toEqual([sx(a.drawn[0], rx, ry), sy(a.drawn[0], rx, ry)]);
    // drawn through its board's transform, it lands on ArenaMotion.tileCentre of that tile while the board moves
    expect(TILE).toBe(CELL);
    const am = moving(a), out: number[] = [];
    applyAffine(am.hitAff[0], pop.x, pop.y, out);
    const [tx, ty] = am.tileCentre(a, 0, kx(tk), ky(tk));
    expect(out[0]).toBeCloseTo(tx, 9);
    expect(out[1]).toBeCloseTo(ty, 9);
  });

  it("a shaped rig (SHAPES on): each hit's pop at the tile it worked, not its anchor cell's centre nor pieceMid", () => {
    expect(shapesRules()).toBe(true);
    // the I2 rig at (3,2), turned so both its cells' arrows work the bench's belt: tiles 3 (4,2) and 2 (4,3)
    let deck: Build | undefined;
    for (let rot = 0; rot < 4 && !deck; rot++) {
      const t = withItem(furnaceBench(), item(33, "s2ashaped", 3, 2, rot));
      if (new Battle(t, barge(), SEED).sides[0].gates.find((g) => g.uid === 33)!.hits.length === 2) deck = t;
    }
    expect(deck, "an I2 turn with two hits on the belt").toBeDefined();
    const a = new Arena(deck!, barge(), SEED, null);
    a.quiet = true;
    const g = a.b.sides[0].gates.find((q) => q.uid === 33)!;
    const ev = procs(events(deck!, 10), 33).filter((e) => e.add && e.add.amount >= ADD_MIN);
    const tiles = [...new Set(ev.map((e) => e.tile))].sort();
    expect(tiles).toEqual([...new Set(g.hits.map((h) => h.tile))].sort()); // both cells' hits pop (perTile: the tiles ridden x 10)
    const [mx, my] = pieceMid(a, 0, g), anchor = [(g.x + 0.5) * CELL, (g.y + 0.5) * CELL];
    const am = moving(a);
    for (const t of tiles) {
      const e = ev.find((x) => x.tile === t)!;
      const pop = popFor(a, e)!;
      expect(pop.text).toBe(`+${e.add!.amount}`);
      const tk = deck!.routes[0].cells[t], cx = (kx(tk) + 0.5) * CELL, cy = (ky(tk) + 0.5) * CELL;
      expect([pop.x, pop.y]).toEqual([sx(a.drawn[0], cx, cy), sy(a.drawn[0], cx, cy)]);
      expect([pop.x, pop.y]).not.toEqual([sx(a.drawn[0], mx, my), sy(a.drawn[0], mx, my)]); // not pieceMid
      expect([pop.x, pop.y]).not.toEqual([sx(a.drawn[0], anchor[0], anchor[1]), sy(a.drawn[0], anchor[0], anchor[1])]); // not its anchor cell
      const out: number[] = [];
      applyAffine(am.hitAff[0], pop.x, pop.y, out);
      const [tx, ty] = am.tileCentre(a, 0, kx(tk), ky(tk));
      expect(out[0]).toBeCloseTo(tx, 9);
      expect(out[1]).toBeCloseTo(ty, 9);
    }
  });

  it("a gun part's pop sits at its gun's pivot (C6's anchor), and a pop below ADD_MIN shows nothing", () => {
    const a = new Arena(furnaceBench(), barge(), SEED, null);
    a.quiet = true;
    const gun = a.b.sides[0].routes[0].turret, sl = turretSlots(a.b.sides[0].build)[gun];
    const fire: SimEvent = { type: "fire", side: 0, turret: gun, heavy: true, dmg: 100, proj: 1, add: { amount: 36, kind: "dmg" } };
    const n = a.fx.popCount;
    react(a, fire);
    const pop = live(a.fx).slice(n).find((p) => p.reader)!;
    expect([pop.x, pop.y]).toEqual(readerGunPoint(a, 0, gun));
    const lx = (sl.col0 + sl.width / 2) * CELL;
    expect([pop.x, pop.y]).toEqual([sx(a.drawn[0], lx, TURRET_LY), sy(a.drawn[0], lx, TURRET_LY)]);
    const before = a.fx.readerCount;
    react(a, { ...fire, add: { amount: 9, kind: "dmg" } });
    expect(a.fx.readerCount).toBe(before);
    expect(effectAt("pressure", 1).core!.routine).toBe("pressure");
  });
});
