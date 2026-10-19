// PAIR-CUE (REQ-BFG-100; REQ-BFG-081 for PAIR's read): the PAIR on the board, on real fights (tools/pair1/pickPairs.ts's
// picks): fight A, day 8 BRASSWICK v VOSS, seed 1 (pairs on both sides, half of them FOUNDRY fusions); fight B, day 8
// BRASSWICK v LOCKJAW, seed 1 (pairs on both sides, a near miss on LOCKJAW's). Tests only: the sim is wrapped to record
// what it did, never changed.
//  - the event mapping: each `pair` event's two intakes as the view finds them equal the sim's own (loaded's two loads'
//    routes; a fusion's alloy route and the belt its partner came by);
//  - the marks: exactly the first-hand impacts of shots carrying a paired load;
//  - the flash and bracket last FLASH_S of effect time; the glyph pops over the gun;
//  - the near-miss glow: only unpaired loads inside their window, fading; no pulse under Reduce Motion; the flash replaces it;
//  - nothing drawn while the cue is off (outside the fight phase, VIEW BATTLEFIELD); the C6 panel's PAIR line; the words.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Arena } from "../src/game/arena";
import { FLASH_S, GLOW_A, GLYPH_UP, PairWatch, intakesOf, pairLoads, pairedImpacts } from "../src/game/pairCue";
import type { Payload, Projectile, Side, SideState, SimEvent, TurretState } from "../src/sim/battle";
import { CELL, TICK } from "../src/sim/content";
import { turretSlots } from "../src/sim/deck";
import { rivalBuild } from "../src/sim/rivals";
import { SYNC_WINDOW } from "../src/sim/races/foundry";
import { TURRET_LY, sx, sy } from "../src/render/frame";
import { PAIR_COLOUR } from "../src/render/fx";
import { ICON } from "../src/render/font";
import { BattleCounters, intakeCue } from "../src/screens/battleCounters";
import { keywordRow, pairEntry } from "../src/ui/counterText";
import { fakeCanvas, fakeDom } from "./pair1.helpers";

const ROOT = join(new URL("..", import.meta.url).pathname);
let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());

type Truth = { tick: number; side: Side; turret: number; routes: number[]; fusion: boolean };
type Priv = { loaded: (...a: unknown[]) => boolean; fusionPair: (...a: unknown[]) => void; impact: (pr: Projectile) => void; events: SimEvent[] };

/** A fight played in an arena with the PAIR watch (as the battle and the replay attach it), the sim wrapped to record. */
function play(foe: "voss" | "lockjaw", each?: (a: Arena, cue: PairWatch, ev: readonly SimEvent[]) => void) {
  const a = new Arena(rivalBuild("brasswick", 8), rivalBuild(foe, 8), 1, null);
  a.quiet = true;
  const cue = new PairWatch();
  cue.on = true;
  a.cue = cue;
  const b = a.b, pv = b as unknown as Priv;
  const truth: Truth[] = [], paidImpacts = new Set<SimEvent>();
  const loaded = pv.loaded.bind(b), fusionPair = pv.fusionPair.bind(b), impact = pv.impact.bind(b);
  pv.loaded = (s: unknown, tu: unknown, route: unknown, p: unknown) => {
    const side = s as SideState, t = tu as TurretState;
    const before = t.stack.filter((q) => q !== p && !q.paired);
    const r = loaded(s, tu, route, p);
    if (r) {
      const q = before.find((x) => x.paired)!;
      truth.push({ tick: b.ticks, side: side.side, turret: t.index, routes: [side.pairs!.get(q)!.route, route as number], fusion: false });
    }
    return r;
  };
  // a fusion: the alloy's own route (its recorded entry), and the belt whose front load left it this step and was fused
  // away (in neither the chamber, the store nor the belt): found here from whole belts, apart from the watch's own way
  let belts: Payload[][][] = [[], []];
  pv.fusionPair = (s: unknown, tu: unknown, alloy: unknown) => {
    const side = s as SideState, t = tu as TurretState;
    const ra = side.pairs!.get(alloy as Payload)!.route;
    const came = intakesOf(side, t.index).filter((ri) => ri !== ra && belts[side.side][ri].some((p) => !side.routes[ri].ammo.some((am) => am.p === p) && !t.stack.includes(p) && !t.store.some((it) => it.p === p)));
    truth.push({ tick: b.ticks, side: side.side, turret: t.index, routes: [ra, ...came], fusion: true });
    return fusionPair(s, tu, alloy);
  };
  pv.impact = (pr: Projectile) => {
    const n0 = pv.events.length;
    impact(pr);
    const first = pv.events.slice(n0).find((e) => e.type === "impact");
    if (first && (pr.payload.paired || pr.payload.compound?.paired)) paidImpacts.add(first);
  };
  let steps = 0;
  while (!b.over && steps < 60 * 120) {
    belts = [0, 1].map((s) => b.sides[s].routes.map((r) => r.ammo.map((am) => am.p)));
    const t0 = b.ticks;
    const ev = a.update(TICK);
    expect(b.ticks - t0, "one step a frame").toBeLessThanOrEqual(1);
    steps++;
    each?.(a, cue, ev);
  }
  return { a, b, cue, truth, paidImpacts };
}

describe("PAIR-CUE: the event mapping on real fights", () => {
  for (const foe of ["voss", "lockjaw"] as const) {
    it(`brasswick v ${foe}: each pair's two intakes as the view finds them are the sim's own`, () => {
      const seen: { tick: number; side: Side; turret: number; routes: number[]; how: string }[] = [];
      let last = 0;
      const { b, cue, truth } = play(foe, (a, w) => {
        for (let i = last; i < w.tally.pairs; i++) {
          const c = w.shown[w.shown.length - (w.tally.pairs - i)];
          seen.push({ tick: a.b.ticks, side: c.side, turret: c.turret, routes: [...c.routes], how: c.how });
        }
        last = w.tally.pairs;
      });
      expect(truth.length, "pairs in the fight").toBeGreaterThan(0);
      expect(seen.length).toBe(truth.length);
      expect(new Set(truth.map((t) => t.side)).size, "pairs on both sides").toBe(2);
      for (let i = 0; i < truth.length; i++) {
        const t = truth[i], v = seen[i];
        const at = `pair ${i} tick ${t.tick} side ${t.side} turret ${t.turret}${t.fusion ? " (fusion)" : ""}`;
        expect([v.tick, v.side, v.turret], at).toEqual([t.tick, t.side, t.turret]);
        expect(t.routes.length, `${at}: the test found both`).toBe(2);
        expect([...v.routes].sort(), at).toEqual([...t.routes].sort());
        expect(v.how, at).toBe(t.fusion ? "fusion" : "loads");
        const ins = intakesOf(b.sides[t.side], t.turret);
        for (const r of v.routes) expect(ins, at).toContain(r);
      }
      expect(cue.tally.none, "no pair left without its intakes").toBe(0);
      expect(cue.tally.glyphs, "a glyph for every pair (the pool had room)").toBe(truth.length);
      console.log(`PAIR1 MAP | brasswick v ${foe} | pairs ${truth.length} (side 0 ${truth.filter((t) => t.side === 0).length}, side 1 ${truth.filter((t) => t.side === 1).length}) | loads ${cue.tally.loads} fusion ${cue.tally.fusion} two ${cue.tally.two} none ${cue.tally.none} | marks ${cue.tally.marks} dropped ${cue.tally.marksDropped}`);
    });
  }

  it("pairLoads follows the sim's sync rule: another route, entered no more than SYNC_WINDOW before; taken loads skipped", () => {
    const P = (paired = true) => ({ paired } as unknown as Payload);
    const [q, p, far, same, old] = [P(), P(), P(), P(), P(false)];
    const s = { pairs: new WeakMap<Payload, { at: number; route: number }>([[q, { at: 1.0, route: 2 }], [p, { at: 1.2, route: 3 }], [far, { at: 0.9, route: 4 }], [same, { at: 1.1, route: 3 }], [old, { at: 1.15, route: 5 }]]) };
    expect(pairLoads(s, [far, q, same, old, p], new WeakSet())).toEqual([q, p]); // same route and unpaired are passed over
    expect(pairLoads(s, [far, same, p], new WeakSet()), "0.3 s apart: out of the window").toBeNull();
    expect(pairLoads(s, [q, p], new WeakSet([p]))).toBeNull();
    expect(SYNC_WINDOW).toBe(0.25);
  });
});

describe("PAIR-CUE: a PAIR shot's hit number is marked", () => {
  it("the marked impacts are exactly the first-hand impacts of shots carrying a paired load (both fights)", () => {
    for (const foe of ["voss", "lockjaw"] as const) {
      const marked: SimEvent[] = [];
      const { paidImpacts, cue } = play(foe, (_a, w, ev) => { for (const e of ev) if (e.type === "impact" && w.marks(e)) marked.push(e); });
      expect(paidImpacts.size, `${foe}: PAIR shots landed`).toBeGreaterThan(0);
      expect(marked.length, foe).toBe(paidImpacts.size);
      for (const e of marked) expect(paidImpacts.has(e), foe).toBe(true);
      expect(cue.tally.marks + cue.tally.marksDropped, `${foe}: a mark tried for each`).toBeGreaterThan(0);
    }
  });

  it("pairedImpacts: landed shots in id order take the first-hand impacts; a splash's impact follows its shot's; a downed shot none", () => {
    const imp = (): SimEvent => ({ type: "impact", side: 1, x: 0, y: 0, dmg: 1, heavy: false, kind: "hull", shock: false, burn: 0, big: false });
    const [a, b, c, d] = [imp(), imp(), imp(), imp()];
    const before = new Map([[5, false], [7, true], [9, true], [11, false]]);
    const ev: SimEvent[] = [a, { type: "splash", side: 1, x: 0, y: 0 }, b, c, { type: "flak", side: 1, proj: 9 }, d];
    // 5 lands (a, then its splash's b), 7 lands (c), 9 downed, 11 lands (d); 7 carried a PAIR
    expect(pairedImpacts(before, new Set<number>(), ev)).toEqual([c]);
    expect(pairedImpacts(before, new Set([5, 7, 9, 11]), ev)).toEqual([]);
  });
});

describe("PAIR-CUE: timing, the glyph, the glow and the phase", () => {
  it("each pair's flash and bracket last FLASH_S (0.3 s) of effect time, then go", () => {
    const w = new PairWatch();
    w.shown.push({ side: 0, turret: 1, routes: [0, 2], how: "loads", age: 0 });
    w.tick(0.1); w.tick(0.199);
    expect(w.shown.length).toBe(1);
    w.tick(0.002);
    expect(w.shown.length).toBe(0);
    expect(FLASH_S).toBe(0.3);
  });

  it("the glyph pops over the pair's gun (GLYPH_UP above its pivot, on its board), both intakes flash with a bracket, their belt boxes framed blue", () => {
    let checked = 0;
    play("voss", (a, w, ev) => {
      if (checked >= 6 || !ev.some((e) => e.type === "pair")) return;
      const c = w.shown[w.shown.length - 1];
      const fx = a.fx, glyphs = fx.pairList.slice(0, fx.pairCount).filter((p) => !p.mark), g = glyphs[glyphs.length - 1];
      const sl = turretSlots(a.b.sides[c.side].build)[c.turret], fr = a.drawn[c.side], lx = (sl.col0 + sl.width / 2) * CELL;
      expect({ x: g.x, y: g.y, side: g.side, mark: g.mark }).toEqual({ x: sx(fr, lx, TURRET_LY), y: sy(fr, lx, TURRET_LY) - GLYPH_UP, side: c.side, mark: false });
      const cv = fakeCanvas();
      w.drawBoard(cv.getContext(), a, c.side, false);
      // the belt boxes on both intakes take PAIR's blue frame while they flash (intakeCue: 1)
      for (const r of c.routes) expect(intakeCue(w.drawn, c.side, r)).toBe(1);
      const flashed = w.drawn.flashes[c.side].map((f) => f.route);
      for (const r of c.routes) expect(flashed, "both of its intakes flash (with any other pair still showing)").toContain(r);
      expect(new Set(flashed)).toEqual(new Set(w.shown.filter((q) => q.side === c.side).flatMap((q) => q.routes)));
      expect(w.drawn.brackets[c.side]).toBeGreaterThan(0);
      expect(cv.fills.filter((f) => f.fill === PAIR_COLOUR).length).toBeGreaterThan(0);
      checked++;
    });
    expect(checked).toBe(6);
  });

  it("the near miss: a glow only on unpaired loads inside their window, fading with age; none where a flash shows; no pulse under Reduce Motion", () => {
    let glows = 0, faded = 0, pulsed = 0;
    play("lockjaw", (a, w) => {
      for (const side of [0, 1] as Side[]) {
        const cv = fakeCanvas();
        w.drawBoard(cv.getContext(), a, side, true);
        const reduced = w.drawn.glows[side].map((q) => ({ ...q }));
        const s = a.b.sides[side];
        for (const g of reduced) {
          glows++;
          expect(g.age).toBeLessThanOrEqual(SYNC_WINDOW + 1e-6);
          expect(g.alpha).toBeCloseTo(GLOW_A * (1 - g.age / SYNC_WINDOW), 9);
          if (g.age > 0.1) faded++;
          expect(w.shown.some((c) => c.side === side && c.routes.includes(g.route)), "the flash replaces the glow").toBe(false);
          const tu = s.turrets.find((q) => q.index === g.turret)!;
          expect(tu.stack.some((q) => !q.paired && s.pairs!.get(q)?.route === g.route)).toBe(true);
        }
        // every unpaired load in a pair reader's chamber inside its window glows (unless its intake flashes)
        let due = 0;
        for (const tu of s.turrets) if (tu.pairing) for (const q of tu.stack) {
          const m = s.pairs?.get(q);
          if (m && !q.paired && a.b.t - m.at <= SYNC_WINDOW + 1e-6 && !w.shown.some((c) => c.side === side && c.routes.includes(m.route))) due++;
        }
        // BUMP-1E: was `expect(reduced.length).toBe(due)`. The view draws no cue once the battle is over (pairCue.ts drawBoard: `a.b.over`), so
        // on the last frame there are no glows whatever the chamber holds. With the scaling rules on BRASSWICK's day-8 deck (it holds a
        // PRESSURE BREECH and a VENOM DRIP, two of the five reworks) fights 810 ticks (was 799), and the fight ends on a frame where an
        // unpaired load is still inside its window (age 0.017 s): the recount (`due`) counted it, the view rightly drew nothing. Both are
        // pinned: while the fight is on the glows are exactly the recount, and once it is over there are none
        expect(reduced.length).toBe(a.b.over ? 0 : due);
        // motion on: the same glows, pulsing with the arena's clock (Reduce Motion: none)
        if (reduced.length) {
          const clock = a.clock;
          const alphas = [0, 1 / 24].map((dt) => { a.clock = clock + dt; w.drawBoard(fakeCanvas().getContext(), a, side, false); return w.drawn.glows[side][0].alpha; });
          a.clock = clock;
          if (Math.abs(alphas[0] - alphas[1]) > 1e-9) pulsed++;
          const rm = [0, 1 / 24].map((dt) => { a.clock = clock + dt; w.drawBoard(fakeCanvas().getContext(), a, side, true); return w.drawn.glows[side][0].alpha; });
          a.clock = clock;
          expect(rm[0]).toBe(rm[1]);
        }
      }
    });
    expect(glows, "glows drawn in fight B").toBeGreaterThan(0);
    expect(faded, "glows seen fading").toBeGreaterThan(0);
    expect(pulsed, "motion on pulses").toBeGreaterThan(0);
  });

  it("off (outside the fight phase, VIEW BATTLEFIELD): no glow, flash or bracket, and the motion draws no PAIR pop", () => {
    let tried = 0;
    play("voss", (a, w, ev) => {
      if (tried >= 3 || !ev.some((e) => e.type === "pair")) return;
      w.on = false;
      for (const side of [0, 1] as Side[]) {
        const cv = fakeCanvas();
        w.drawBoard(cv.getContext(), a, side, false);
        expect(cv.fills.length).toBe(0);
        expect(w.drawn.flashes[side].length + w.drawn.glows[side].length + w.drawn.brackets[side]).toBe(0);
      }
      w.on = true;
      tried++;
    });
    expect(tried).toBe(3);
    const motion = readFileSync(join(ROOT, "src/game/arenaMotion.ts"), "utf8");
    expect(motion).toMatch(/if \(a\.cue\?\.on\) a\.fx\.drawPairPops\(g, 0, 0, s\);/);
    expect(readFileSync(join(ROOT, "src/screens/battle.ts"), "utf8")).toMatch(/a\.cue\.on = this\.phase === "fight";/);
    expect(readFileSync(join(ROOT, "src/screens/replay.ts"), "utf8")).toMatch(/a\.cue\.on = !this\.over;/);
  });
});

describe("PAIR-CUE: taps and words", () => {
  it("a gun with a pair reader adds PAIR's reminder to its C6 panel, by its keyword key; a gun without one does not", () => {
    const row = keywordRow("PAIR")!, e = pairEntry()!;
    expect(row.kw).toBe("PAIR");
    expect({ icon: e.icon, word: e.word, body: e.body }).toEqual({ icon: ICON.PAIR, word: row.word, body: row.def });
    const a = new Arena(rivalBuild("brasswick", 8), rivalBuild("lockjaw", 8), 1, null);
    const bc = new BattleCounters() as unknown as { entries: (g: unknown, a: unknown, rows: unknown) => { word: string; body: string }[] };
    let withPair = 0, without = 0;
    for (const side of [0, 1] as Side[]) for (const tu of a.b.sides[side].turrets) {
      const got = bc.entries({ id: "g", kind: "gun", side, ref: tu.index, anchor: { x: 0, y: 0, w: 1, h: 1 }, target: { x: 0, y: 0, w: 1, h: 1 } }, a, [null, null]);
      if (tu.pairing) { expect(got.length).toBe(2); expect(got[1].word).toBe(row.word); expect(got[1].body).toBe(row.def); withPair++; } else { expect(got.length).toBe(1); without++; }
    }
    expect(withPair).toBeGreaterThan(0);
    console.log(`PAIR1 PANEL | guns with a pair reader ${withPair}, without ${without}`);
  });

  it("no new string names PLATE, PLATING or SHIELD (REQ-BFG-107); the cue adds no player string outside counterText.ts", () => {
    const strings = (f: string) => readFileSync(join(ROOT, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n").match(/"[^"\n]*"|`[^`\n]*`/g) ?? [];
    for (const f of ["src/game/pairCue.ts", "src/ui/counterText.ts"]) for (const s of strings(f)) {
      if (f.endsWith("counterText.ts") && /^"(PLATE|SHIELD)"$/.test(s)) continue;
      expect(s, `${f}: ${s}`).not.toMatch(/\b(PLATE|PLATES|PLATED|PLATING|SHIELD|SHIELDS)\b/);
    }
    // pairCue.ts's strings are type tags and the how names, none drawn
    for (const s of strings("src/game/pairCue.ts")) expect(s, s).toMatch(/^"(loads|fusion|two|none|pair|fuse|fire|impact|splash|arc|lance|flak|alloy|routes|pairs|\.\.?\/[a-z/A-Z.]+)"$/);
  });
});
