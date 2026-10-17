// SCALE-2c (REQ-BFG-100; BRIEF-SCALE2c section 4, M3): the counters C7 (hits on you), C8 (a reader's running bonus on the
// piece) and C9 (your run record on your plate), and the readers rule that lights the foe's BURN and POISON chips (KINDLING,
// CINDER MAIL, ROT GAUGE, LEECH COIL). Switch on through withScaleRigs; off, the row's list, every row and every plate are
// as at M0 (COUNT-1's four chips, no badge, no record).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UI } from "../src/ui/ui";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleScale, type BattleLayout } from "../src/game/battleLayout";
import type { Game } from "../src/game/game";
import type { Run } from "../src/game/run";
import type { Arena } from "../src/game/arena";
import type { ArenaMotion } from "../src/game/arenaMotion";
import { setupRun } from "../src/tooling";
import { BattleScreen } from "../src/screens/battle";
import { BattleCounters } from "../src/screens/battleCounters";
import { fakeCanvas, fakeDom, paints } from "./pair1.helpers";
import { Arena as ArenaReal } from "../src/game/arena";
import { POISON_POP_DY, react } from "../src/game/arenaReact";
import { captainKeywordColour } from "../src/ui/captainText";
import { Battle } from "../src/sim/battle";
import { withScaleRigs, scaleRules } from "../src/sim/scale";
import { HEARTS_START } from "../src/sim/hearts";
import { START_LIVES } from "../src/sim/content";
import { ICON, glyphRows } from "../src/render/font";
import { C } from "../src/render/palette";
import { contrast } from "../src/render/styleContrast";
import {
  HITS_CHIP, READ_CHIPS, STATUS_CHIPS, hitsShown, hitsText, rampBadges, readCount, recordTag, runRecord, shownChips,
} from "../src/game/counters";
import { rampText, recordText } from "../src/ui/counterText";
import { type Build } from "../src/sim/deck";
import { SEED, barge, furnaceBench, item, withItem, withMod } from "./wave3.helpers";

/** Deck b with rig `def` at (3, y), turned so it works the bench's tile 5 - y (scale2c.sim.test.ts's helper). */
function aimed(b: Build, uid: number, def: string, y: number, stars = 1): Build {
  for (let rot = 0; rot < 4; rot++) {
    const t = withItem(b, item(uid, def, 3, y, rot, stars));
    const g = new Battle(t, barge(), SEED).sides[0].gates.find((q) => q.uid === uid)!;
    if (g.hits.some((h) => h.route === 0 && h.tile === 5 - y)) return t;
  }
  throw new Error(`no turn aims ${def} at tile ${5 - y}`);
}
const GUN = new Battle(furnaceBench(), barge(), SEED).sides[0].routes[0].turret;
const KEYS0 = ["burn", "poison", "fray", "stun"];
const step = (bt: Battle, secs: number): Battle => { while (bt.t < secs && !bt.over) { bt.step(); bt.drainEvents(); } return bt; };

describe("SCALE-2c counters: with the switch off, everything is as at M0", () => {
  it("the row's list is COUNT-1's four; a SPALL CATCHER, a POWDER KEG or a GRUDGE ROD deck shows no hits chip, badge or record", () => {
    expect(scaleRules()).toBe(false);
    expect(STATUS_CHIPS.map((c) => c.key)).toEqual(KEYS0);
    const bt = new Battle(aimed(withMod(furnaceBench(), 40, "spallcatcher", GUN), 30, "keg", 2), barge(), SEED);
    step(bt, 6);
    expect(shownChips(bt, 0).map((c) => c.chip.key)).not.toContain("hits");
    expect([hitsShown(bt, 0), rampBadges(bt, 0), runRecord(bt, 0, { wins: 4, lives: 6, hearts: true })]).toEqual([null, [], null]);
    expect(readCount(bt, 1, "burn")).toBe(false);
    // a round trip leaves the list as it was
    withScaleRigs(() => expect(STATUS_CHIPS.map((c) => c.key)).toEqual([...KEYS0, "hits"]));
    expect(STATUS_CHIPS.map((c) => c.key)).toEqual(KEYS0);
    expect(Object.keys(ICON)).not.toContain("CRACK"); // not enumerable, as POISON's drop
  });
});

describe("SCALE-2c C7: the hits on you (switch on)", () => {
  it("the chip: key hits, order 50, the crack (5x7 and 3x5 glyphs), red; its number reads 4.5:1 on the box's navy", () => {
    withScaleRigs(() => {
      expect(STATUS_CHIPS.map((c) => c.key)).toEqual([...KEYS0, "hits"]);
      expect([HITS_CHIP.order, HITS_CHIP.icon, HITS_CHIP.colour, HITS_CHIP.reminder]).toEqual([50, ICON.CRACK, C.red, null]);
      expect(glyphRows(ICON.CRACK, "5")).toBeTruthy();
      expect(glyphRows(ICON.CRACK, "3")).toBeTruthy();
      expect(ICON.CRACK.charCodeAt(0)).toBe(0xe013);
      expect(contrast(HITS_CHIP.numColour, C.navy)).toBeGreaterThanOrEqual(4.5);
      expect(hitsText(14)).toBe("HITS ON YOU THIS FIGHT: 14.");
    });
  });

  it("only while you hold a hits-taken reader (SPALL CATCHER): 0 dimmed at the start, then the count; never on the foe's row", () => {
    withScaleRigs(() => {
      const bt = new Battle(withMod(furnaceBench(), 40, "spallcatcher", GUN), withMod(furnaceBench(), 40, "spallcatcher", GUN), SEED);
      const start = shownChips(bt, 0).find((c) => c.chip.key === "hits")!;
      expect([start.n, start.dim]).toEqual([0, true]);
      bt.sides[0].hitsTaken = 14;
      const now = shownChips(bt, 0).find((c) => c.chip.key === "hits")!;
      expect([now.n, now.dim, now.chip.sentence!(now.n)]).toEqual([14, false, "HITS ON YOU THIS FIGHT: 14."]);
      expect(shownChips(bt, 1).some((c) => c.chip.key === "hits")).toBe(false); // your row only
      const none = new Battle(furnaceBench(), barge(), SEED);
      none.sides[0].hitsTaken = 5;
      expect(hitsShown(none, 0)).toBeNull(); // no reader aboard: no chip
      expect(shownChips(none, 0).some((c) => c.chip.key === "hits")).toBe(false);
    });
  });
});

describe("SCALE-2c: the readers rule lights the foe's BURN and POISON chips (counters.ts readCount)", () => {
  it("KINDLING and CINDER MAIL light the foe's BURN chip at 0 (dimmed); ROT GAUGE and LEECH COIL its POISON chip", () => {
    expect(READ_CHIPS.map((r) => `${r.key}:${r.count}:${r.whose}`)).toEqual(["burn:foeBurn:foe", "poison:foePoison:foe", "hits:hitsTaken:own"]);
    withScaleRigs(() => {
      for (const [def, key] of [["quench", "burn"], ["cindermail", "burn"], ["rotgauge", "poison"], ["leechcoil", "poison"]] as const) {
        const bt = new Battle(aimed(furnaceBench(), 30, def, 2), barge(), SEED);
        expect([readCount(bt, 1, key), readCount(bt, 0, key)], def).toEqual([true, false]);
        const chip = shownChips(bt, 1).find((c) => c.chip.key === key);
        expect([chip?.n, chip?.dim], def).toEqual([0, true]);
      }
      expect(readCount(new Battle(furnaceBench(), barge(), SEED), 1, "burn")).toBe(false);
    });
  });
});

describe("SCALE-2c C8: a reader's running bonus on the piece (switch on, your side)", () => {
  it("POWDER KEG: +step x (its hits so far + 1), what its next hit adds; it climbs with its hits", () => {
    withScaleRigs(() => {
      for (const s of [1, 2, 3]) {
        const each = [2, 5, 11][s - 1]; // SCALE-2e E4: POWDER KEG 2 / 5 / 11 (was 3 / 7 / 11)
        const bt = new Battle(aimed(furnaceBench(), 30, "keg", 2, s), barge(), SEED);
        expect(rampBadges(bt, 0)).toEqual([{ kind: "rig", ref: 30, bonus: each, count: 0 }]);
        step(bt, 8);
        const hits = bt.sides[0].gates.find((g) => g.uid === 30)!.ownHits!;
        expect(hits).toBeGreaterThan(3);
        expect(rampBadges(bt, 0)).toEqual([{ kind: "rig", ref: 30, bonus: each * (hits + 1), count: hits }]);
        expect(rampBadges(bt, 1)).toEqual([]); // your side only
      }
      expect(rampText(39, 12, "rig", true)).toBe("+39 {DMG} ON ITS NEXT HIT: 12 HITS SO FAR.");
    });
  });

  it("SPALL CATCHER: +step x the hits on you now, on its gun; the tap says its gun's next shot", () => {
    withScaleRigs(() => {
      const bt = new Battle(withMod(furnaceBench(), 40, "spallcatcher", GUN, 2), barge(), SEED);
      bt.sides[0].hitsTaken = 12;
      expect(rampBadges(bt, 0)).toEqual([{ kind: "gun", ref: GUN, bonus: 3 * 12, count: 12 }]); // SCALE-2e E4: SPALL CATCHER ★2 is 3 (was 7)
      expect(rampText(36, 12, "gun", false)).toBe("+36 {DMG} ON ITS NEXT SHOT: 12 HITS ON YOU SO FAR.");
      expect(rampBadges(new Battle(aimed(furnaceBench(), 30, "quench", 2), barge(), SEED), 0)).toEqual([]); // KINDLING: C1 shows its count
    });
  });
});

// ------------------------------------------------------------------------------------------------- drawn (a stand-in canvas)

let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());
const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
/** cntday.test.ts's stand-in Game: the run, a silent audio, a 402x690 phone's view at DPR 3, a UI and a recording canvas. */
function fakeGame(run: Run): Game {
  const view = viewWithSub(402, 690, 3, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silent = new Proxy({}, { get: () => () => undefined });
  const g = { run, audio: silent, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fakeCanvas() } as unknown as Game;
  (g as unknown as { go: (s: unknown) => void }).go = () => undefined;
  return g;
}
/** A stand-in arena and motion for drawBoard: both boards shown, a fixed screen mapping (tiles 12 px apart). */
const stubArena = (b: Battle) => ({ b, show: [true, true], drawn: [{ facing: 0 }, { facing: 2 }], cue: null }) as unknown as Arena;
const stubMotion = {
  tileCentre: (_a: unknown, _s: number, x: number, y: number) => [40 + x * 12, 250 + y * 12],
  localToScreen: (_a: unknown, _s: number, lx: number, ly: number) => [20 + lx / 2, 240 + ly / 2],
  windDrawn: [],
} as unknown as ArenaMotion;
const PLATES = [{ x: 54, y: 386, w: 132, h: 10 }, { x: 54, y: 0, w: 132, h: 10 }];
const LAYOUT = { plates: PLATES, hulls: [{ x: 0, y: 200, w: 240, h: 180 }, { x: 0, y: 12, w: 240, h: 180 }] } as unknown as BattleLayout;

describe("SCALE-2c C7 and C8 drawn; C9 on the battle screen (switch on)", () => {
  it("C7: your status tab draws the hits chip (0 dimmed at the start); off, the tab is as before", () => {
    const run = setupRun({ hero: "furnace", day: 6, seed: 7 }), game = fakeGame(run);
    const deck = withMod(furnaceBench(), 40, "spallcatcher", GUN);
    const on = withScaleRigs(() => {
      const bc = new BattleCounters(), b = new Battle(deck, barge(), SEED);
      bc.drawRows(fakeCanvas().getContext(), game, stubArena(b), LAYOUT, PLATES, [null, null], [], true);
      b.sides[0].hitsTaken = 14;
      const first = bc.last.tabs[0]!.chips.map((c) => `${c.key}:${c.text}:${c.dim}`);
      bc.drawRows(fakeCanvas().getContext(), game, stubArena(b), LAYOUT, PLATES, [null, null], [], true);
      return [first, bc.last.tabs[0]!.chips.map((c) => `${c.key}:${c.text}:${c.dim}`)];
    });
    expect(on).toEqual([["hits:0:true"], ["hits:14:false"]]);
    const bc = new BattleCounters();
    bc.drawRows(fakeCanvas().getContext(), game, stubArena(new Battle(deck, barge(), SEED)), LAYOUT, PLATES, [null, null], [], true);
    expect(bc.last.tabs[0]).toBeNull(); // off: no chip at all, so no tab
  });

  it("C8: POWDER KEG's badge on its tile's lower right (its centre +2, +1), white on red; its tap; off, none", () => {
    const run = setupRun({ hero: "furnace", day: 6, seed: 7 }), game = fakeGame(run);
    const deck = aimed(furnaceBench(), 30, "keg", 2);
    withScaleRigs(() => {
      const bc = new BattleCounters(), b = new Battle(deck, barge(), SEED), cv = fakeCanvas();
      bc.begin();
      bc.drawBoard(cv.getContext(), game, stubArena(b), stubMotion, [], [], true);
      const g0 = b.sides[0].gates.find((g) => g.uid === 30)!;
      expect(bc.last.badges).toEqual([{ kind: "rig", ref: 30, r: { x: 40 + g0.x * 12 + 2, y: 250 + g0.y * 12 + 1, w: bc.last.badges[0].r.w, h: 9 }, text: "+2" }]); // SCALE-2e E4: POWDER KEG ★1 is 2 (was 3)
      const img = cv.imgs.find((d) => d.x === bc.last.badges[0].r.x && d.y === bc.last.badges[0].r.y)!;
      expect(paints(img, C.red)).toBe(true);
      type Priv = { entries: (g: unknown, a: Arena, rows: readonly unknown[]) => { body: string }[]; groups: { id: string }[] };
      const pv = bc as unknown as Priv, grp = pv.groups.find((q) => q.id === "cnt:piece0:30")!;
      expect(pv.entries(grp, stubArena(b), [null, null]).map((e) => e.body)).toEqual(["+2 {DMG} ON ITS NEXT HIT: 0 HITS SO FAR."]);
    });
    const bc = new BattleCounters();
    bc.drawBoard(fakeCanvas().getContext(), game, stubArena(new Battle(deck, barge(), SEED)), stubMotion, [], [], true);
    expect(bc.last.badges).toEqual([]);
  });

  it("C9: the battle screen writes `· 4W 6♥` after your hero's name with a GRUDGE ROD aboard; your plate's tap says it; off, as before", () => {
    const make = (def = "grudgerod"): BattleScreen => {
      const run = setupRun({ hero: "furnace", day: 6, seed: 7, wins: 4, lives: 6 });
      run.build = aimed(furnaceBench(), 30, def, 2);
      return new BattleScreen(fakeGame(run));
    };
    const name = (s: BattleScreen): string => (s as unknown as { plateName: string }).plateName;
    withScaleRigs(() => {
      const s = make();
      expect(s.counters.record).toEqual({ wins: 4, left: 6, of: HEARTS_START, lost: HEARTS_START - 6 });
      expect(name(s)).toBe(`FURNACE · 4W 6♥`);
      type Priv = { entries: (g: unknown, a: Arena, rows: readonly unknown[]) => { body: string }[] };
      const grp = { id: "cnt:plate0", kind: "plate", side: 0, ref: 0, anchor: PLATES[0], target: PLATES[0] };
      expect((s.counters as unknown as Priv).entries(grp, s.arena, [null, null]).map((e) => e.body)).toContain(`WINS 4. HEARTS LEFT 6 OF ${HEARTS_START} (${HEARTS_START - 6} LOST).`);
    });
    // off: no GRUDGE ROD or TROPHY CHAIN exists (the ids are in ITEMS only with the switch on): a POWDER KEG deck's plate
    expect([make("keg").counters.record, name(make("keg"))]).toEqual([null, "FURNACE"]);
    expect(withScaleRigs(() => [make("keg").counters.record, name(make("keg"))])).toEqual([null, "FURNACE"]); // no reader: none
  });
});

describe("SCALE-2c: the two carried items (REVIEW-SCALE2b section 3)", () => {
  it("the venom tick's number has its own band under BURN's: a same-second pair never overlaps; BURN's spot as before", () => {
    withScaleRigs(() => {
      const cy = (b: { y: number }) => b.y;
      const burns: number[] = [], venom: number[] = [];
      for (let i = 0; i < 40; i++) {
        const a = new ArenaReal(furnaceBench(), barge(), SEED + i, null); // a fresh pool (and random stream) each pair
        react(a, { type: "burn", side: 1, dmg: 10 });
        burns.push(cy(a.fx.popList[a.fx.popCount - 1]));
        react(a, { type: "poison", side: 1, dmg: 12 });
        venom.push(cy(a.fx.popList[a.fx.popCount - 1]));
      }
      // BURN's spot: within 20 px of the hull's centre; the venom one 28-36 px below it: at least a 5x7 number's 7 px apart
      expect(Math.max(...burns) - Math.min(...venom)).toBeLessThanOrEqual(-7);
      expect(POISON_POP_DY).toBe(32);
    });
  });

  it("captainText: a captain line's POISON takes its venom while the switch is on; off, the shipped 9's map (no colour)", () => {
    expect(captainKeywordColour("POISON")).toBeUndefined();
    expect(withScaleRigs(() => captainKeywordColour("POISON,"))).toBe(C.venom);
    expect(captainKeywordColour("POISON")).toBeUndefined();
    expect(captainKeywordColour("BURNS")).toBe(C.fire3);
  });
});

describe("SCALE-2c C9: your run record on your plate (switch on, a GRUDGE ROD or TROPHY CHAIN aboard)", () => {
  it("`4W 6♥` after your name; its tap WINS 4. HEARTS LEFT 6 OF 10 (4 LOST).; none without the readers", () => {
    withScaleRigs(() => {
      for (const def of ["grudgerod", "trophychain"]) {
        const bt = new Battle(aimed(furnaceBench(), 30, def, 2), barge(), SEED);
        const r = runRecord(bt, 0, { wins: 4, lives: 6, hearts: true })!;
        expect(r, def).toEqual({ wins: 4, left: 6, of: HEARTS_START, lost: HEARTS_START - 6 });
        expect(recordTag(r)).toBe("4W 6♥");
        expect(recordText(r)).toBe(`WINS 4. HEARTS LEFT 6 OF ${HEARTS_START} (${HEARTS_START - 6} LOST).`);
        expect(runRecord(bt, 1, { wins: 4, lives: 6, hearts: true })).toBeNull(); // your plate only
      }
      // a run on the old scale (no hearts mark) counts from its own START_LIVES
      const old = runRecord(new Battle(aimed(furnaceBench(), 30, "grudgerod", 2), barge(), SEED), 0, { wins: 1, lives: 3 })!;
      expect(old).toEqual({ wins: 1, left: 3, of: START_LIVES, lost: START_LIVES - 3 });
      expect(runRecord(new Battle(aimed(furnaceBench(), 30, "keg", 2), barge(), SEED), 0, { wins: 4, lives: 6, hearts: true })).toBeNull();
      expect(runRecord(new Battle(aimed(furnaceBench(), 30, "grudgerod", 2), barge(), SEED), 0, null)).toBeNull();
    });
  });
});
