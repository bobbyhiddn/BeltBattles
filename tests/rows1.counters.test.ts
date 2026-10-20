// ROWS-1 (REQ-BFG-100; F11 of 0.9.13's STAGE, a counter badge taking a belt chip's tap): on the phone (402x690, the motion-c1 fight A at 10 s)
// POWDER KEG's C8 badge (`cnt:piece0:100`) was drawn on top of belt 0's second slug-count chip (`cnt:belt0:1`): the badge's box
// {148,252,15,9} covers the chip's {153,251,7,9} (the page dump of ROWS-1 run 1, art px), so a tap at the chip's centre was a tap on the
// badge's visible box and opened `+40 ON ITS NEXT HIT: 7 HITS SO FAR.` instead of `SLUGS ON THIS BELT: 5.`. The tap rule itself (pickGroup:
// the chip whose box is under the point, else the nearest box centre among the targets that hold it, ties to the one drawn on top) is
// cap's rule and was right; the layout was not: a badge kept off a gun's box (SCALE-2c) but not a belt's. Now a badge is never drawn on a
// belt chip (badgeOverChip): where its own place would sit on one it takes the first other place beside its piece (badgeSpots) that is clear,
// else it is left out as a gun's box has always left it out, so no chip's box is under another's top-drawn badge and the keg's count stays
// on screen (the page sweep of run 1: at the base the badge sat on a belt chip in 764 of motion-c1 fight A's 876 frames on the 402x690 phone).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UI, type Rect } from "../src/ui/ui";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import type { Game } from "../src/game/game";
import type { Run } from "../src/game/run";
import type { Arena } from "../src/game/arena";
import type { ArenaMotion } from "../src/game/arenaMotion";
import { setupRun } from "../src/tooling";
import { BattleCounters, badgeOverChip, badgeSpots, pickGroup, squareAt } from "../src/screens/battleCounters";
import { fakeCanvas, fakeDom } from "./pair1.helpers";
import { Battle } from "../src/sim/battle";
import { withScaleRigs } from "../src/sim/scale";
import { BOX_H, overlap } from "../src/game/counters";
import { tapPx } from "../src/ui/tap";
import { type Build } from "../src/sim/deck";
import { SEED, barge, furnaceBench, item, withItem } from "./wave3.helpers";

// ---- F11's own numbers: the page dump at rows1-base (O/logs/f11probe-base.log), op690: art 241x414, k 5/3, a finger 27 art px
const W = 241, H = 414, TP = 27;
const CHIP = { id: "cnt:belt0:1", box: { x: 153, y: 251, w: 7, h: 9 }, target: { x: 143, y: 242, w: 27, h: 27 } };
const BADGE = { id: "cnt:piece0:100", box: { x: 148, y: 252, w: 15, h: 9 }, target: { x: 142, y: 243, w: 27, h: 27 } };
const centre = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const grp = (g: { id: string; box: Rect; target: Rect }) => ({ id: g.id, anchor: g.box, target: g.target });

describe("ROWS-1 F11: the tap rule, on F11's boxes and targets", () => {
  it("each target is the finger's square on its box (squareAt: 27 art px = 45 CSS px on this view, a lone chip keeps it)", () => {
    expect(squareAt(CHIP.box, TP, W, H)).toEqual(CHIP.target);
    expect(squareAt(BADGE.box, TP, W, H)).toEqual(BADGE.target);
    expect(tapPx({ scale: 5, dpr: 3 })).toBe(TP);
    for (const r of [CHIP.target, BADGE.target]) expect(Math.min(r.w, r.h) * (5 / 3)).toBeGreaterThanOrEqual(44);
    // a chip on its own: its square is its full 44 CSS px, a tap anywhere in it (and only there) is its own
    const lone = [grp(CHIP)];
    for (const [x, y] of [centre(CHIP.target), [CHIP.target.x, CHIP.target.y], [CHIP.target.x + 26, CHIP.target.y + 26]] as [number, number][]) expect(pickGroup(lone, x, y)!.id).toBe(CHIP.id);
    expect(pickGroup(lone, CHIP.target.x - 1, CHIP.target.y)).toBeNull();
  });

  it("the cause: the badge's box covers the chip's (the chip's centre is under the badge), so the layout, not the rule, put the tap on the badge", () => {
    expect(overlap(BADGE.box, CHIP.box)).toBe(true);
    const [cx, cy] = centre(CHIP.box);
    expect(cx >= BADGE.box.x && cx < BADGE.box.x + BADGE.box.w && cy >= BADGE.box.y && cy < BADGE.box.y + BADGE.box.h).toBe(true);
    // both boxes hold the point: the one drawn on top (the badge: C8 is drawn after C5) is the visible one and wins, as the rule says
    expect(pickGroup([grp(CHIP), grp(BADGE)], cx, cy)!.id).toBe(BADGE.id);
    expect(pickGroup([grp(BADGE), grp(CHIP)], cx, cy)!.id).toBe(CHIP.id); // (order is what "on top" means)
    // the rule the layout now serves: a badge that would cover a belt chip's box is not drawn there (as one that would cover a gun's never was)
    expect(badgeOverChip(BADGE.box, [], [{ r: CHIP.box }])).toBe(true);
    expect(badgeOverChip(BADGE.box, [{ r: CHIP.box }], [])).toBe(true);
    expect(badgeOverChip(BADGE.box, [], [])).toBe(false);
    expect(badgeOverChip({ ...BADGE.box, x: CHIP.box.x + CHIP.box.w }, [], [{ r: CHIP.box }])).toBe(false); // touching is not overlapping
    expect(badgeOverChip({ ...BADGE.box, y: CHIP.box.y + CHIP.box.h + 1 }, [{ r: CHIP.box }], [{ r: CHIP.box }])).toBe(false);
  });

  it("badgeSpots on F11's own frame: the tile's centre (146, 251), the badge 15 wide: the upper right is clear of the chip and of the frame's other boxes, the lower left is not", () => {
    // the page dump's other boxes at that moment (O/logs/f11probe-base.log): SPALL CATCHER's badge, and the two gun chips of your side
    const OTHERS: Rect[] = [{ x: 129, y: 245, w: 15, h: 9 }, { x: 129, y: 235, w: 11, h: 9 }, { x: 168, y: 235, w: 26, h: 9 }];
    expect(BADGE.box).toEqual({ x: 146 + 2, y: 251 + 1, w: 15, h: 9 }); // its own place: the centre +2, +1
    const spots = badgeSpots("rig", 146, 251, 15);
    expect(spots).toEqual([[148, 241], [129, 252], [129, 241]]); // upper right, lower left, upper left (2 px off the centre)
    const at = (s: [number, number]): Rect => ({ x: s[0], y: s[1], w: 15, h: BOX_H });
    expect(overlap(at(spots[0]), CHIP.box)).toBe(false);
    for (const o of OTHERS) expect(overlap(at(spots[0]), o), "the upper right is clear").toBe(false);
    expect(overlap(at(spots[1]), OTHERS[0]), "the lower left would sit on SPALL CATCHER's badge").toBe(true);
    expect(overlap(at(spots[2]), OTHERS[0]), "so would the upper left").toBe(true);
    // a gun part's badge (under its gun's box): the other place is above the box
    expect(badgeSpots("gun", 100, 100, 15, { x: 90, y: 60 })).toEqual([[90, 60 - 1 - BOX_H]]);
  });

  it("with the badge drawn clear of the chip (boxes apart, targets still overlapping): the chip's centre opens the chip, the badge's centre the badge, a point in both targets and neither box the nearer centre", () => {
    // the badge's box a few px right of the chip's (the targets overlap by about 13 px): the layout the rule must serve
    const box = { x: CHIP.box.x + CHIP.box.w + 2, y: BADGE.box.y, w: BADGE.box.w, h: BADGE.box.h };
    const badge = { id: BADGE.id, box, target: squareAt(box, TP, W, H) };
    expect(overlap(box, CHIP.box)).toBe(false);
    expect(overlap(CHIP.target, badge.target)).toBe(true);
    const gs = [grp(CHIP), grp(badge)];
    expect(pickGroup(gs, ...centre(CHIP.box))!.id).toBe(CHIP.id);
    expect(pickGroup(gs, ...centre(box))!.id).toBe(badge.id);
    // between the boxes (x = 161, the 2 px gap), in both targets: the nearer box centre
    const gapX = CHIP.box.x + CHIP.box.w + 1; // 161
    expect(pickGroup(gs, gapX, 256)!.id).toBe(CHIP.id); // 4.5 px from the chip's centre, 8.5 from the badge's
    expect(pickGroup(gs, gapX + 1, 256)!.id).toBe(badge.id); // the badge's box starts at 162: this point is inside it
    // a point in both targets, below both boxes, nearer the badge's centre than the chip's
    const below = pickGroup(gs, centre(box)[0] + 3, 264)!;
    expect(below.id).toBe(badge.id);
    // a point in the chip's target alone (left of the badge's target) is the chip's, whoever's centre is near
    expect(pickGroup(gs, CHIP.target.x + 1, 256)!.id).toBe(CHIP.id);
    // a point in the badge's target alone is the badge's
    expect(pickGroup(gs, badge.target.x + badge.target.w - 1, 256)!.id).toBe(badge.id);
    // a point outside both targets: nothing
    expect(pickGroup(gs, 0, 0)).toBeNull();
  });

  it("two boxes equally near a point in neither box: the one drawn on top (the later group) takes it", () => {
    const a = { id: "a", anchor: { x: 100, y: 100, w: 8, h: 9 }, target: squareAt({ x: 100, y: 100, w: 8, h: 9 }, TP, W, H) };
    const b = { id: "b", anchor: { x: 116, y: 100, w: 8, h: 9 }, target: squareAt({ x: 116, y: 100, w: 8, h: 9 }, TP, W, H) };
    // centres 104 and 120: the point at x = 112 is 8 from each, in neither box
    expect(pickGroup([a, b], 112, 104.5)!.id).toBe("b");
    expect(pickGroup([b, a], 112, 104.5)!.id).toBe("a");
  });
});

// ---- the same, through drawBoard and the UI's own hit test (scale2c.counters.test.ts's stand-in arena and canvas)
let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());
const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
function fakeGame(run: Run): Game {
  const view = viewWithSub(402, 690, 3, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silent = new Proxy({}, { get: () => () => undefined });
  const g = { run, audio: silent, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fakeCanvas() } as unknown as Game;
  (g as unknown as { go: (s: unknown) => void }).go = () => undefined;
  return g;
}
const stubArena = (b: Battle) => ({ b, show: [true, true], drawn: [{ facing: 0 }, { facing: 2 }], cue: null }) as unknown as Arena;
/** The stand-in motion (tiles 12 px apart), except that `at` moves one tile (the keg's) to a chosen centre; `wind`: boxes of wind numbers drawn this frame
 *  (no counter box is drawn over one). */
const motion = (at?: { x: number; y: number; to: [number, number] }, wind: Rect[] = []): ArenaMotion => ({
  tileCentre: (_a: unknown, _s: number, x: number, y: number) => (at && x === at.x && y === at.y ? at.to : [40 + x * 12, 250 + y * 12]),
  localToScreen: (_a: unknown, _s: number, lx: number, ly: number) => [20 + lx / 2, 240 + ly / 2],
  windDrawn: wind,
}) as unknown as ArenaMotion;
const step = (bt: Battle, secs: number): Battle => { while (bt.t < secs && !bt.over) { bt.step(); bt.drainEvents(); } return bt; };
/** Deck b with rig `def` at (3, y), turned so it works the bench's tile 5 - y (scale2c.counters.test.ts's helper). */
function aimed(b: Build, uid: number, def: string, y: number, stars = 1): Build {
  for (let rot = 0; rot < 4; rot++) {
    const t = withItem(b, item(uid, def, 3, y, rot, stars));
    const g = new Battle(t, barge(), SEED).sides[0].gates.find((q) => q.uid === uid)!;
    if (g.hits.some((h) => h.route === 0 && h.tile === 5 - y)) return t;
  }
  throw new Error(`no turn aims ${def} at tile ${5 - y}`);
}

describe("ROWS-1 F11: drawBoard and the tap, on a built scene (POWDER KEG beside a belt chip)", () => {
  const run = setupRun({ hero: "furnace", day: 6, seed: 7 }), game = fakeGame(run);
  const KEG = 30, deck = aimed(furnaceBench(), KEG, "keg", 2);
  /** Draw one frame; the keg's tile at `to` (undefined: as the stand-in places it). Returns the counters and the UI. */
  function frame(to?: [number, number], wind: Rect[] = []) {
    const g = fakeGame(run), bc = new BattleCounters(), bt = step(new Battle(deck, barge(), SEED), 8);
    bc.mode = "all"; // every belt shows its count (c1stills' "all")
    const rig = bt.sides[0].gates.find((q) => q.uid === KEG)!;
    g.ui.begin();
    bc.begin();
    bc.drawBoard(fakeCanvas().getContext(), g, stubArena(bt), motion(to ? { x: rig.x, y: rig.y, to } : undefined, wind), [], [], true);
    g.ui.end();
    return { bc, g, bt, rig };
  }
  const tap = (f: ReturnType<typeof frame>, x: number, y: number): string | null => {
    f.g.ui.pointer.x = x; f.g.ui.pointer.y = y; f.g.ui.pointer.kind = "touch";
    const r = f.g.ui.hit(x, y);
    if (r?.onTap) r.onTap();
    return f.bc.open;
  };

  it("the stand-in scene: a belt chip is drawn and the badge keeps its place (the lower right of its tile: centre +2, +1) when no chip is under it", () => {
    withScaleRigs(() => {
      const f = frame();
      expect(f.bc.last.belts.length).toBeGreaterThan(0);
      expect(f.bc.last.badges).toHaveLength(1);
      const b = f.bc.last.badges[0].r, g0 = f.rig;
      expect([b.x, b.y]).toEqual([40 + g0.x * 12 + 2, 250 + g0.y * 12 + 1]);
      for (const q of f.bc.last.belts) expect(overlap(b, q.r), "the badge is not over a belt chip").toBe(false);
    });
  });

  it("F11: the keg's tile beside belt 0's chip so its own place would sit on the chip: the badge takes the tile's upper right, clear of the chip; the chip's centre opens the chip, the badge's the badge", () => {
    withScaleRigs(() => {
      const f0 = frame();
      const chip = f0.bc.last.belts.find((q) => q.side === 0)!, cr = chip.r;
      // put the keg's tile so that its own place's top-left lands 4 px left of and 1 px under the chip's top-left: the box covers the chip's centre
      const tile: [number, number] = [cr.x - 4 - 2, cr.y];
      const f = frame(tile);
      expect(f.bc.last.badges, "the count is still on screen").toHaveLength(1);
      const b = f.bc.last.badges[0].r, c2 = f.bc.last.belts.find((q) => q.side === 0 && q.route === chip.route)!.r;
      expect([b.x, b.y], "the upper right of its tile").toEqual([tile[0] + 2, tile[1] - 1 - BOX_H]);
      expect(overlap(b, c2)).toBe(false);
      for (const q of f.bc.last.guns) expect(overlap(b, q.r)).toBe(false);
      expect(tap(f, ...centre(c2)), "the chip's centre").toBe(`cnt:belt0:${chip.route}`);
      f.bc.open = null;
      expect(tap(f, ...centre(b)), "the badge's centre").toBe(`cnt:piece0:${KEG}`);
    });
  });

  it("with no place clear (wind numbers over its other places) the badge is left out as a gun's box leaves it out, and the chip's centre still opens the chip", () => {
    withScaleRigs(() => {
      const f0 = frame();
      const chip = f0.bc.last.belts.find((q) => q.side === 0)!, cr = chip.r;
      const tile: [number, number] = [cr.x - 4 - 2, cr.y];
      const base = frame(tile).bc.last.badges[0].r; // (the badge's width at this frame)
      const wind: Rect[] = badgeSpots("rig", tile[0], tile[1], base.w).map(([x, y]) => ({ x, y, w: base.w, h: BOX_H }));
      const f = frame(tile, wind);
      expect(f.bc.last.badges, "none of its places is free").toEqual([]);
      expect(f.bc.last.skipped).toBeGreaterThan(0);
      type Priv = { groups: { id: string }[] };
      expect((f.bc as unknown as Priv).groups.some((q) => q.id.startsWith("cnt:piece0:"))).toBe(false);
      expect(tap(f, ...centre(f.bc.last.belts.find((q) => q.side === 0 && q.route === chip.route)!.r))).toBe(`cnt:belt0:${chip.route}`);
    });
  });

  it("the keg's tile a little further off, so the badge is drawn clear of the chip with the targets still overlapping: the chip's centre opens the chip, the badge's the badge", () => {
    withScaleRigs(() => {
      const f0 = frame();
      const chip = f0.bc.last.belts.find((q) => q.side === 0)!, cr = chip.r;
      // the badge's left edge 2 px right of the chip's right edge, its top level with the chip's
      const f = frame([cr.x + cr.w + 2 - 2, cr.y - 1]);
      expect(f.bc.last.badges).toHaveLength(1);
      const b = f.bc.last.badges[0].r, c2 = f.bc.last.belts.find((q) => q.side === 0 && q.route === chip.route)!.r;
      expect(overlap(b, c2)).toBe(false);
      type Priv = { groups: { id: string; anchor: Rect; target: Rect }[] };
      const gs = (f.bc as unknown as Priv).groups;
      const gChip = gs.find((q) => q.id === `cnt:belt0:${chip.route}`)!, gBadge = gs.find((q) => q.id === `cnt:piece0:${KEG}`)!;
      expect(overlap(gChip.target, gBadge.target), "the targets overlap (a finger's squares 12 px apart)").toBe(true);
      expect(tap(f, ...centre(c2))).toBe(gChip.id);
      f.bc.open = null;
      expect(tap(f, ...centre(b))).toBe(gBadge.id);
      f.bc.open = null;
      // between the boxes, in both targets, nearer the badge's centre: the badge; nearer the chip's: the chip
      const midX = c2.x + c2.w + 1; // the 2 px gap's first column
      expect(tap(f, midX, centre(c2)[1])).toBe(Math.abs(midX - centre(c2)[0]) < Math.abs(midX - centre(b)[0]) ? gChip.id : gBadge.id);
    });
  });

  it("a sweep of the keg's tile around the chip: a badge is never on a chip; it stays exactly where it was wherever its own place is clear; where it was not, it is at one of its places", () => {
    withScaleRigs(() => {
      const f0 = frame();
      const chip = f0.bc.last.belts.find((q) => q.side === 0)!.r;
      let drawn = 0, kept = 0, moved = 0, skipped = 0;
      for (let dx = -24; dx <= 24; dx += 2) {
        for (let dy = -14; dy <= 14; dy += 2) {
          const tile: [number, number] = [chip.x + dx, chip.y + dy];
          const f = frame(tile);
          if (!f.bc.last.badges.length) { skipped++; continue; }
          drawn++;
          const b = f.bc.last.badges[0].r;
          for (const q of f.bc.last.belts) expect(overlap(b, q.r), `keg tile at ${dx},${dy}: the badge over a belt chip`).toBe(false);
          for (const q of f.bc.last.guns) expect(overlap(b, q.r), `keg tile at ${dx},${dy}: the badge over a gun chip`).toBe(false);
          const own = { x: tile[0] + 2, y: tile[1] + 1, w: b.w, h: b.h };
          if (!f.bc.last.belts.some((q) => overlap(own, q.r))) {
            expect([b.x, b.y], `keg tile at ${dx},${dy}: its own place is clear, so it stays there`).toEqual([own.x, own.y]);
            kept++;
          } else {
            expect(badgeSpots("rig", tile[0], tile[1], b.w).some(([x, y]) => x === b.x && y === b.y), `keg tile at ${dx},${dy}: one of its other places`).toBe(true);
            moved++;
          }
        }
      }
      expect(drawn).toBeGreaterThan(100);
      expect(kept).toBeGreaterThan(50);
      expect(moved).toBeGreaterThan(10);
      expect(skipped + drawn).toBe(25 * 15);
    });
  });
});
