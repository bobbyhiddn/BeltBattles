// GATES-1 (REQ-BFG-052; BRIEF-GATES1 G4): the three gates' pictures (FUSER, SCATTER MILL, SMELTER), drawn into tests/raster.helpers.ts's
// software raster, with the switch on (withGates) unless a test says it draws with it off.
// - each icon is its own 12x12 picture: none matches another, nor any other item's icon, nor its own board sprite; none reads ITEMS;
// - each board sprite is a 12x12 housing that covers its tile: the three differ from each other and from every rig's, idle holds
//   still, working moves; gateSil is its white silhouette; an arrowhead is a 6 px mark turned to its direction;
// - drawMachinery draws the gate ON its belt tile, on every facing: the housing and its arrowheads (IN on the edge the belt comes
//   in by, OUT on the edge it leaves by, at right angles on a corner, none while its belt is hidden), nothing outside the tile,
//   stars, the ★3 frame and the survivor ring as a rig's; a gate off every belt, a lifted one (hideItem) and a deck without gates
//   draw as before, and an arrow aimed at a gate's tile is idle;
// - in a battle (a Battle's SideState as `sim`): the slugs it holds sit in its bays (a FUSER's second bay lit while it waits for its
//   partner), working moves the sprite and fills a line across its top, a STUN stops it and crackles, a conversion flashes white
//   over the housing (a translucent overlay), and its output waits in a queue of beads behind the exit door.
import { afterEach, describe, expect, it } from "vitest";
import { R, diffPx, fresh, G, installRaster, region, sig, type RasterCanvas } from "./raster.helpers";
import { ITEMS } from "../src/sim/content";
import { Battle, type Payload } from "../src/sim/battle";
import { key as K, rotField, type Build, type Placed } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { GATES, GATES_IDS, setGates, withGates } from "../src/sim/gates";
import { frame, footX, footY, sdir, type DeckFrame, type Facing } from "../src/render/frame";
import { C } from "../src/render/palette";
import { converterBays, gateChevron, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { drawMachinery } from "../src/render/machinery";
import { cruiserModel, type CruiserView } from "../src/render/cruiser";
import { barge } from "./arsenal.bench";

installRaster();
afterEach(() => setGates(GATES)); // the shipped value (off); every test that needs the three on runs inside withGates

const THREE = ["fuser", "scattermill", "smelter"];
const FACINGS: Facing[] = [0, 1, 2, 3];
const dims = (c: HTMLCanvasElement): [number, number] => [c.width, c.height];
const opaque = (c: RasterCanvas): number => c.px.filter((p) => p !== null).length;
const count = (c: RasterCanvas, col: string): number => c.px.filter((p) => p === col).length;

/** The two pixels at the tip of an arrowhead of a belt going toward screen direction d, in tile pixels: OUT on the edge it
 *  leaves by (on the rim's outer row), IN on the edge it comes in by (on the rim's inner row). */
const APEX: Record<"in" | "out", [number, number][][]> = {
  out: [[[5, 0], [6, 0]], [[11, 5], [11, 6]], [[5, 11], [6, 11]], [[0, 5], [0, 6]]],
  in: [[[5, 10], [6, 10]], [[1, 5], [1, 6]], [[5, 1], [6, 1]], [[10, 5], [10, 6]]],
};

/** The route cells of a belt running up column x from y0 to y1 (the deck's bow is up). */
const up = (x: number, y0: number, y1: number): number[] => Array.from({ length: y0 - y1 + 1 }, (_, i) => K(x, y0 - i));

/** A deck of `items` (a KILN at (8, 8), uid 1, feeds every route, as tests/shapes2.render.test.ts's) and `routes`. */
function deck(items: Placed[], routes: number[][] = []): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 8, y: 8 }, ...items], routes: routes.map((cells) => ({ factory: 1, cells })), mods: [], beltCap: 99, hullBonus: 0 };
}
const BELT = up(8, 7, 3); // five tiles up column 8 from the KILN: the middle one is (8, 5)
const FUSER: Placed = { uid: 5, def: "fuser", x: 8, y: 5 };

/** The FURNACE bench (tests/gates1.engine.test.ts's): the KILN at (4, 6) and a straight six-tile belt up column 4 into the gun,
 *  gates [def, tile, stars] on it (tile t is cell (4, 5 - t)). */
function bench(conv: [string, number, number?][] = []): Build {
  return {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...conv.map(([def, t, s], i): Placed => ({ uid: 20 + i, def, x: 4, y: 5 - t, ...((s ?? 1) > 1 ? { stars: s } : {}) }))],
    routes: [{ factory: 1, cells: up(4, 5, 0) }], mods: [], beltCap: 30, hullBonus: 5000,
  };
}

/** Two FURNACE belts, three gates (the FUSER ★3 and the mill on the first, a ★2 SMELTER on the second's corner): the whole set at work. */
function pair(): Build {
  return {
    hero: "furnace",
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 },
      { uid: 20, def: "fuser", x: 4, y: 4, stars: 3 }, { uid: 21, def: "scattermill", x: 4, y: 2 }, { uid: 22, def: "smelter", x: 5, y: 5, stars: 2 },
    ],
    routes: [{ factory: 1, cells: up(4, 5, 0) }, { factory: 7, cells: [K(6, 5), ...up(5, 5, 0)] }], mods: [], beltCap: 30, hullBonus: 5000,
  };
}

const slug = (id: number, o: Partial<Payload> = {}): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false, ...o });

/** Draw build `b` as drawMachinery draws it on facing `fc` (a 150x150 raster, the deck's corner at (10, 10)); nothing falls off it. */
function paint(b: Build, fc: Facing, o: Partial<CruiserView> = {}, opaqueOnly = false): RasterCanvas {
  const c = fresh(150, 150);
  c.opaqueOnly = opaqueOnly;
  drawMachinery(G(c), { side: 0, build: b, model: cruiserModel(b), frame: frame(fc, 10, 10), t: 0, tread: 0, ...o } as CruiserView);
  // a battle's own paints are not held to the canvas: the embers that rise off a burning slug (drawAmmo, base code) leave it at the deck's far
  // row; the gates' own paints are held to their tiles by the hideItem comparisons below
  if (!o.sim) expect(c.oob, `facing ${fc}`).toBe(0);
  return c;
}
const F = (fc: Facing): DeckFrame => frame(fc, 10, 10);
/** The screen top-left of deck cell (cx, cy) on facing fc. */
const tileAt = (fc: Facing, cx: number, cy: number): [number, number] => [Math.round(footX(F(fc), cx, cy)), Math.round(footY(F(fc), cx, cy))];
/** Is every pixel of `diff` inside the w x h rect at (x0, y0)? */
const allInside = (diff: [number, number][], x0: number, y0: number, w: number, h: number): boolean => diff.every(([x, y]) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h);
const tile = (c: RasterCanvas, x: number, y: number): string => region(c, x, y, 12, 12);

describe("GATES-1 G4: the three icons", () => {
  it("draw with the switch off, as nothing but ITEMS' absence differs: an icon never reads ITEMS (this runs before anything caches them)", () => {
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): was `expect(GATES).toBe(false)` and the loop bare (the shipped world had GATES off); GATES ships on, so the switch-off world is asked for outright (withGates(fn, false), synchronously)
    expect(GATES).toBe(true);
    withGates(() => {
      for (const id of THREE) {
        expect(ITEMS[id], id).toBeUndefined();
        expect(dims(itemIcon(id)), id).toEqual([12, 12]);
        expect(opaque(R(itemIcon(id))), id).toBeGreaterThan(40);
        expect(dims(gateSprite(id, 0, false)), id).toEqual([12, 12]);
      }
    }, false);
  });

  it("each is its own 12x12 picture: none matches another, nor any other item's icon, nor its own board sprite", () => {
    withGates(() => {
      expect(GATES_IDS).toEqual(THREE);
      const pics = THREE.map((id) => R(itemIcon(id)));
      THREE.forEach((id, i) => {
        expect(dims(itemIcon(id)), id).toEqual([12, 12]);
        expect(opaque(pics[i]), id).toBeGreaterThan(40);
        expect(sig(pics[i]), `${id}'s icon is its board sprite`).not.toBe(sig(R(gateSprite(id, 0, false))));
      });
      const sigs = pics.map(sig);
      expect(new Set(sigs).size).toBe(3);
      const others = Object.keys(ITEMS).filter((id) => !THREE.includes(id));
      for (const must of ["whetstone", "splitter", "riveter", "kiln", "scatter", "temper", "nailstrip", "sparkgap"]) expect(others).toContain(must);
      for (const id of others) {
        const s = sig(R(itemIcon(id)));
        sigs.forEach((mine, i) => expect(s === mine, `${THREE[i]} draws as ${id}`).toBe(false));
      }
    });
  });
});

describe("GATES-1 G4: the board sprites", () => {
  it("each is a 12x12 housing that covers its tile; idle holds still, working moves and differs from idle", () => {
    withGates(() => {
      for (const id of THREE) {
        expect(dims(gateSprite(id, 0, false)), id).toEqual([12, 12]);
        const idle = R(gateSprite(id, 0, false));
        expect(opaque(idle), `${id} covers its whole tile`).toBe(144);
        for (const f of [1, 2, 3, 4, 5, 6, 7]) expect(sig(R(gateSprite(id, f, false))), `${id} idle frame ${f}`).toBe(sig(idle));
        const work = Array.from({ length: 8 }, (_, f) => sig(R(gateSprite(id, f, true))));
        expect(work[0], `${id}: working differs from idle`).not.toBe(sig(idle));
        expect(work[0], `${id}: working, frame 0 and frame 1`).not.toBe(work[1]);
        expect(new Set(work).size, `${id}: frames while working`).toBeGreaterThan(2);
        expect(sig(R(gateSprite(id, 8, true))), `${id}: frame 8 is frame 0`).toBe(work[0]);
        expect(sig(R(gateSprite(id, -1, true))), `${id}: frame -1 is frame 7`).toBe(work[7]);
      }
    });
  });

  it("the three differ from each other and from every rig's sprite, and gateSil is a white silhouette of each", () => {
    withGates(() => {
      const mine = THREE.map((id) => sig(R(gateSprite(id, 0, false))));
      expect(new Set(mine).size).toBe(3);
      const rigs = Object.keys(ITEMS).filter((id) => ITEMS[id].kind === "gate");
      expect(rigs.length).toBeGreaterThan(20);
      for (const id of rigs) mine.forEach((m, i) => expect(sig(R(gateSprite(id, 0, false))) === m, `${THREE[i]} draws as ${id}`).toBe(false));
      for (const id of THREE) {
        const sil = R(gateSil(id));
        expect(dims(gateSil(id)), id).toEqual([12, 12]);
        expect(sil.px.every((p) => p === C.white), `${id}: all white`).toBe(true);
        expect(opaque(sil), id).toBe(opaque(R(gateSprite(id, 0, false))));
      }
    });
  });

  it("the bays: a FUSER's two on the diagonal, the others' one in the middle, dark where converterBays says; a SMELTER's middle is its molten metal", () => {
    withGates(() => {
      expect(converterBays(1)).toEqual([[4, 4]]);
      expect(converterBays(2)).toEqual([[2, 2], [6, 6]]);
      for (const [id, slots] of [["fuser", 2], ["scattermill", 1]] as const) {
        const s = R(gateSprite(id, 0, false));
        for (const [bx, by] of converterBays(slots)) {
          expect([s.at(bx, by), s.at(bx + 3, by + 3)], `${id} bay corners`).toEqual([C.ink, C.ink]);
          expect([s.at(bx + 1, by + 1), s.at(bx + 2, by + 2)], `${id} bay`).toEqual([C.slate1, C.slate1]);
        }
      }
      expect(R(gateSprite("smelter", 0, false)).at(5, 5), "embers while it waits").toBe(C.fire0);
      expect(R(gateSprite("smelter", 0, true)).at(5, 5), "boiling while it works").toBe(C.fire2);
    });
  });

  it("an arrowhead is 6 bright pixels across the rim with 2 of ink beside it, turned to its direction; a belt's IN and OUT never overlap", () => {
    for (const kind of ["in", "out"] as const) {
      for (const d of [0, 1, 2, 3]) {
        const c = R(gateChevron(kind, d, C.cyan));
        expect(dims(gateChevron(kind, d, C.cyan)), `${kind} ${d}`).toEqual([12, 12]);
        expect([count(c, C.cyan), count(c, C.ink), opaque(c)], `${kind} ${d}`).toEqual([6, 2, 8]);
        for (const [x, y] of APEX[kind][d]) expect(c.at(x, y), `${kind} ${d} tip`).toBe(C.cyan);
      }
    }
    // a belt goes straight through a tile or turns a quarter: IN heading din, OUT heading din, din + 1 or din - 1
    for (const din of [0, 1, 2, 3]) for (const turn of [0, 1, 3]) {
      const a = R(gateChevron("in", din, C.ice)), b = R(gateChevron("out", (din + turn) % 4, C.ice));
      expect(a.px.some((p, i) => p !== null && b.px[i] !== null), `IN ${din}, OUT ${(din + turn) % 4}`).toBe(false);
    }
  });
});

describe("GATES-1 G4: drawMachinery draws a gate ON its belt tile", () => {
  it("on every facing: the housing on the tile, its arrowheads on the edges the belt comes in and leaves by, and nothing outside the tile", () => {
    withGates(() => {
      const b = deck([FUSER], [BELT]), b0 = deck([], [BELT]);
      for (const fc of FACINGS) {
        const [x, y] = tileAt(fc, 8, 5);
        const c = paint(b, fc), c0 = paint(b0, fc);
        expect(tile(c, x, y), `facing ${fc}: the tile`).not.toBe(tile(c0, x, y));
        expect(allInside(diffPx(c, c0), x, y, 12, 12), `facing ${fc}: only the tile changes`).toBe(true);
        // the belt runs up the deck (local N): IN on the edge behind it, OUT on the edge ahead of it, on whichever side the facing puts them
        const d = sdir(F(fc), 0);
        for (const [ax, ay] of APEX.in[d]) expect(c.at(x + ax, y + ay), `facing ${fc}: IN`).toBe(C.ice);
        for (const [ax, ay] of APEX.out[d]) expect(c.at(x + ax, y + ay), `facing ${fc}: OUT`).toBe(C.cyan); // a rare gate's colour
        // the housing is the sprite's, whichever way the belt goes: its two bays (the face never turns)
        expect([c.at(x + 3, y + 3), c.at(x + 8, y + 8)], `facing ${fc}: its bays`).toEqual([C.slate1, C.slate1]);
      }
      // facing 0 by hand: a belt going up the screen comes in at the bottom and leaves at the top
      const [x0, y0] = tileAt(0, 8, 5), c = paint(b, 0);
      expect([c.at(x0 + 5, y0 + 10), c.at(x0 + 6, y0 + 10), c.at(x0 + 5, y0), c.at(x0 + 6, y0)]).toEqual([C.ice, C.ice, C.cyan, C.cyan]);
    });
  });

  it("a corner gate has its arrowheads at right angles, IN along the belt coming in and OUT along the belt going on, on every facing", () => {
    withGates(() => {
      const bend = [K(8, 7), K(8, 6), K(8, 5), K(7, 5), K(6, 5)]; // up column 8, then left along row 5: (8, 5) is the corner
      for (const [def, out] of [["fuser", C.cyan], ["scattermill", C.bone]] as const) {
        const b = deck([{ uid: 5, def, x: 8, y: 5 }], [bend]);
        for (const fc of FACINGS) {
          const [x, y] = tileAt(fc, 8, 5), c = paint(b, fc);
          const din = sdir(F(fc), 0), dout = sdir(F(fc), 3); // local N in, local W out
          expect((din + 1) % 4 === dout || (din + 3) % 4 === dout, `${def} facing ${fc}: a right angle`).toBe(true);
          for (const [ax, ay] of APEX.in[din]) expect(c.at(x + ax, y + ay), `${def} facing ${fc}: IN`).toBe(C.ice);
          for (const [ax, ay] of APEX.out[dout]) expect(c.at(x + ax, y + ay), `${def} facing ${fc}: OUT`).toBe(out); // its rarity: cyan rare, bone common
        }
      }
    });
  });

  it("a belt hidden for redrawing keeps the gate but loses its arrowheads; a lifted gate (hideItem) is not drawn; one off every belt draws nothing", () => {
    withGates(() => {
      const b = deck([FUSER], [BELT]), b0 = deck([], [BELT]);
      const [x, y] = tileAt(0, 8, 5);
      const hid = paint(b, 0, { hideRoute: 0 });
      expect(hid.at(x + 3, y + 3), "the housing stays").toBe(C.slate1);
      expect(hid.at(x + 5, y), "no OUT").toBe(C.ink);
      expect(hid.at(x + 5, y + 10), "no IN").not.toBe(C.ice);
      expect(tile(paint(b, 0, { hideItem: 5 }), x, y)).toBe(tile(paint(b0, 0), x, y));
      expect(diffPx(paint(deck([{ uid: 5, def: "fuser", x: 3, y: 3 }], [BELT]), 0), paint(b0, 0)), "off every belt").toEqual([]);
      // it stands on whichever belt holds its tile: here the second
      const two = [up(9, 7, 3), BELT];
      expect(tile(paint(deck([FUSER], two), 0), x, y)).not.toBe(tile(paint(deck([], two), 0), x, y));
    });
  });

  it("stars as a rig's: two pips at ★2, three and the brass frame at ★3, the survivor ring, and the merge animation's pip override", () => {
    withGates(() => {
      const [x, y] = tileAt(0, 8, 5);
      const at = (stars: number, o: Partial<CruiserView> = {}) => paint(deck([{ ...FUSER, ...(stars > 1 ? { stars } : {}) }], [BELT]), 0, o);
      const one = at(1), two = at(2), three = at(3);
      expect(count(two, C.yellow) - count(one, C.yellow), "★2: two pips").toBe(4);
      expect(count(three, C.yellow) - count(one, C.yellow), "★3: three pips").toBe(6);
      for (const [px, py] of [[4, 9], [5, 9], [7, 9], [8, 9]]) expect(two.at(x + px, y + py), `★2 pip at ${px}`).toBe(C.yellow);
      expect([one.at(x, y), two.at(x, y), three.at(x, y)], "the brass frame, at ★3 only").toEqual([C.ink, C.ink, C.brass3]);
      expect([three.at(x + 11, y + 11), three.at(x + 11, y), three.at(x, y + 11)]).toEqual([C.brass3, C.brass3, C.brass3]);
      // the survivor ring sits one pixel outside the tile (it pulses: the raster keeps its paint whatever the alpha)
      expect(at(1, { survivorUid: 5 }).at(x - 1, y - 1)).toBe(C.yellow);
      expect(at(1, { survivorUid: 99 }).at(x - 1, y - 1)).toBe(one.at(x - 1, y - 1));
      // the merge animation shows the pips of the star it is on, whatever the piece holds
      const anim = at(3, { fuseAnimUid: 5, fuseAnimStars: 1 });
      expect([count(anim, C.yellow), anim.at(x, y)]).toEqual([count(one, C.yellow), C.ink]);
      expect(count(at(1, { fuseAnimUid: 5, fuseAnimStars: 2 }), C.yellow) - count(one, C.yellow)).toBe(4);
    });
  });

  it("a SCATTER MILL and a SMELTER stand on their tiles too; a deck without gates draws the same with the switch on and off; an arrow aimed at a gate idles", () => {
    const plain = deck([{ uid: 6, def: "whetstone", x: 6, y: 5 }], [BELT]);
    expect(sig(withGates(() => paint(plain, 0)))).toBe(sig(paint(plain, 0)));
    withGates(() => {
      const b0 = deck([], [BELT]);
      for (const def of ["scattermill", "smelter"]) for (const fc of FACINGS) {
        const [x, y] = tileAt(fc, 8, 5), c = paint(deck([{ uid: 5, def, x: 8, y: 5 }], [BELT]), fc), c0 = paint(b0, fc);
        expect(allInside(diffPx(c, c0), x, y, 12, 12), `${def} facing ${fc}`).toBe(true);
        expect(c.at(x + 5, y + 5) === c0.at(x + 5, y + 5), `${def} facing ${fc}: the tile is covered`).toBe(false);
      }
      // a WHETSTONE at (7, 5) facing east aims its arrow at (8, 5): live on a bare belt tile, idle once a gate stands there
      const rig: Placed = { uid: 6, def: "whetstone", x: 7, y: 5, ...rotField("whetstone", rotFacing("whetstone", 1)) };
      const live = cruiserModel(deck([rig], [BELT])).rigs.get(6)!, idle = cruiserModel(deck([rig, FUSER], [BELT])).rigs.get(6)!;
      expect(live.hit.some(Boolean), "a rig aims at the belt").toBe(true);
      expect(idle.hit.some(Boolean), "and idles at a gate").toBe(false);
      const [x, y] = tileAt(0, 8, 5);
      expect(tile(paint(deck([rig, FUSER], [BELT]), 0), x, y), "no tip drawn on the gate's tile").toBe(tile(paint(deck([FUSER], [BELT]), 0), x, y));
      expect(tile(paint(deck([rig], [BELT]), 0), x, y), "a live one is drawn on a bare tile").not.toBe(tile(paint(deck([], [BELT]), 0), x, y));
    });
  });
});

describe("GATES-1 G4: a gate in a battle", () => {
  it("draws on every facing against a battle's SideState without throwing or leaving the canvas, alone and with all three gates standing on their belts", () => {
    withGates(() => {
      const b = deck([FUSER], [BELT]);
      const bt = new Battle(b, barge(), 4242);
      for (let i = 0; i < 200 && !bt.over; i++) { bt.step(); bt.drainEvents(); }
      expect(bt.sides[0].converters?.length).toBe(1);
      for (const fc of FACINGS) {
        const [x, y] = tileAt(fc, 8, 5);
        const c = paint(b, fc, { sim: bt.sides[0], t: bt.t });
        expect(tile(c, x, y)).not.toBe(tile(paint(deck([], [BELT]), fc, { t: bt.t }), x, y));
      }
      const all = pair(), fight = new Battle(all, barge(), 4242);
      for (let i = 0; i < 700 && !fight.over; i++) { fight.step(); fight.drainEvents(); }
      expect(fight.sides[0].converters?.map((q) => q.def.id)).toEqual(["fuser", "scattermill", "smelter"]);
      for (const fc of FACINGS) paint(all, fc, { sim: fight.sides[0], t: fight.t });
    });
  });

  it("the slugs a gate holds sit in its bays: a FUSER's first bay filled and its second lit while it waits for its partner, both filled while it works", () => {
    withGates(() => {
      const b = bench([["fuser", 2]]);
      const bt = new Battle(b, barge(), 4242);
      const c = bt.sides[0].converters![0], sim = bt.sides[0];
      for (let i = 0; i < 900 && c.buf.length < 1; i++) { bt.step(); bt.drainEvents(); } // the first slug has come in
      expect(c.buf.length).toBe(1);
      const [x, y] = tileAt(0, 4, 3), held = c.buf;
      const drawn = (buf: Payload[]) => { c.buf = buf; return paint(b, 0, { sim, t: 0 }); };
      const empty = drawn([]), one = drawn(held), two = drawn([held[0], slug(901, { ammo: "shot" })]);
      expect(allInside(diffPx(one, empty), x + 2, y + 2, 8, 8), "a slug in the first bay changes the bays").toBe(true);
      expect(region(one, x + 2, y + 2, 4, 4), "bay one holds it").not.toBe(region(empty, x + 2, y + 2, 4, 4));
      expect([one.at(x + 6, y + 6), one.at(x + 9, y + 9)].every((p) => p === C.slate3 || p === C.slate4), "bay two's rim is lit").toBe(true);
      expect(empty.at(x + 6, y + 6), "an empty gate lights nothing").toBe(C.ink);
      expect(region(two, x + 6, y + 6, 4, 4), "a second slug fills bay two").not.toBe(region(one, x + 6, y + 6, 4, 4));
      expect([two.at(x + 6, y + 6) === C.slate3, two.at(x + 6, y + 6) === C.slate4], "no rim once it holds both").toEqual([false, false]);
      // the slug in the bay is the slug's own colour: a white-hot one is not a plain one
      const hot = drawn([slug(902, { ammo: "cinder", flat: 400 })]), plain = drawn([slug(903)]);
      expect(region(hot, x + 2, y + 2, 4, 4)).not.toBe(region(plain, x + 2, y + 2, 4, 4));
      c.buf = held;
    });
  });

  it("a one-slug gate holds its slug in the middle bay; working moves its sprite and fills a line across its top; a STUN stops it and crackles", () => {
    withGates(() => {
      for (const def of ["scattermill", "smelter"]) {
        const b = bench([[def, 2]]);
        const bt = new Battle(b, barge(), 4242);
        for (let i = 0; i < 30; i++) { bt.step(); bt.drainEvents(); }
        const sim = bt.sides[0], c = sim.converters![0], [x, y] = tileAt(0, 4, 3);
        const at = (t = 0) => paint(b, 0, { sim, t });
        const state = (buf: Payload[], left: number, disrupted: number, t = 0) => { c.buf = buf; c.left = left; c.disrupted = disrupted; return at(t); };
        const line = (cc: RasterCanvas) => Array.from({ length: 8 }, (_, i) => cc.at(x + 2 + i, y + 2) === C.fire4).filter(Boolean).length;
        c.out = []; c.flash = 0;
        const idle = state([], 0, 0), held = state([slug(910)], 0, 0);
        expect(allInside(diffPx(held, idle), x + 4, y + 4, 4, 4), `${def}: the slug sits in the middle bay`).toBe(true);
        expect(region(held, x + 4, y + 4, 4, 4)).not.toBe(region(idle, x + 4, y + 4, 4, 4));
        // working: the sprite works, moves with the frame, and a line fills across the top of the face from the left with the time
        const w0 = state([slug(910)], 59, 0, 0), w1 = state([slug(910)], 59, 0, 1 / 8);
        expect(tile(w0, x, y), `${def}: working looks unlike waiting`).not.toBe(tile(held, x, y));
        expect(tile(w0, x, y), `${def}: and moves with the frame`).not.toBe(tile(w1, x, y));
        expect([line(held), line(w0), line(state([slug(910)], 30, 0)), line(state([slug(910)], 1, 0))], `${def}: the line at 0, 1/60, half, the end`).toEqual([0, 1, 4, 8]);
        // a STUN: the timer holds (left > 0) but the sprite stops, the line goes and the tile crackles
        const stunned = state([slug(910)], 30, 1.5), idleStunned = state([slug(910)], 0, 1.5);
        expect(tile(stunned, x, y), `${def}: a stunned gate is idle (its timer holds), crackling`).toBe(tile(idleStunned, x, y));
        expect(tile(stunned, x, y), `${def}: the crackle shows`).not.toBe(tile(held, x, y));
        expect(line(stunned)).toBe(0);
        state([], 0, 0);
      }
    });
  });

  it("a conversion flashes white over the housing, a translucent overlay (it paints nothing where translucent paints are skipped)", () => {
    withGates(() => {
      const b = bench([["smelter", 2]]);
      const bt = new Battle(b, barge(), 4242);
      for (let i = 0; i < 30; i++) { bt.step(); bt.drainEvents(); }
      const sim = bt.sides[0], c = sim.converters![0], [x, y] = tileAt(0, 4, 3);
      c.buf = []; c.out = []; c.left = 0; c.disrupted = 0; c.flash = 0;
      const calm = paint(b, 0, { sim }), calmOpaque = paint(b, 0, { sim }, true);
      c.flash = 0.2;
      const flash = paint(b, 0, { sim }), flashOpaque = paint(b, 0, { sim }, true);
      expect(flash.at(x + 3, y + 8), "white over the face").toBe(C.white);
      expect(tile(flash, x, y)).not.toBe(tile(calm, x, y));
      expect(allInside(diffPx(flash, calm), x, y, 12, 12)).toBe(true);
      expect(tile(flashOpaque, x, y), "translucent: skipped where only opaque paints count").toBe(tile(calmOpaque, x, y));
      c.flash = -0.02; // the sim lets it run a hair below 0
      expect(tile(paint(b, 0, { sim }), x, y)).toBe(tile(calm, x, y));
    });
  });

  it("a gate's output waits in a queue of beads behind its exit door: the first to leave in front, at most three shown, turned with the belt", () => {
    withGates(() => {
      const b = bench([["scattermill", 2]]);
      const bt = new Battle(b, barge(), 4242);
      for (let i = 0; i < 30; i++) { bt.step(); bt.drainEvents(); }
      const sim = bt.sides[0], c = sim.converters![0], [x, y] = tileAt(0, 4, 3);
      c.buf = []; c.left = 0; c.flash = 0; c.disrupted = 0; c.out = [];
      const queue = (n: number, fc: Facing = 0) => { c.out = Array.from({ length: n }, (_, i) => slug(920 + i)); const p = paint(b, fc, { sim }); c.out = []; return p; };
      const none = paint(b, 0, { sim }), q1 = queue(1), q2 = queue(2), q3 = queue(3), q4 = queue(4);
      // the belt goes up: the exit is the top, so the first bead is just under the door (rows 2-5, middle columns) and the others below it
      expect(allInside(diffPx(q1, none), x + 4, y + 2, 4, 4), "one bead").toBe(true);
      expect(allInside(diffPx(q2, none), x + 4, y + 2, 4, 7), "two beads").toBe(true);
      expect(allInside(diffPx(q3, none), x + 4, y + 2, 4, 10), "three beads").toBe(true);
      expect(diffPx(q1, none).length).toBeGreaterThan(0);
      expect(tile(q2, x, y)).not.toBe(tile(q1, x, y));
      expect(tile(q3, x, y)).not.toBe(tile(q2, x, y));
      expect(tile(q4, x, y), "a fourth waits unseen").toBe(tile(q3, x, y));
      // facing 2 (the enemy's side, the bow down) leaves by the bottom: its bead stands in rows 6-9
      const [x2, y2] = tileAt(2, 4, 3), bare2 = paint(b, 2, { sim }), one2 = queue(1, 2);
      expect(allInside(diffPx(one2, bare2), x2 + 4, y2 + 6, 4, 4), "one bead on facing 2").toBe(true);
      expect(diffPx(one2, bare2).length).toBeGreaterThan(0);
    });
  });

  it("the real thing: a battle's own slugs through a whole fight; the gates are drawn in their own tiles and nowhere else, on every state they pass through", () => {
    withGates(() => {
      const b = pair(), bt = new Battle(b, barge(), 4242);
      const gates: [number, number, number][] = [[20, 4, 4], [21, 4, 2], [22, 5, 5]]; // uid, cell
      let sawBuf = 0, sawWork = 0, sawQueue = 0, sawFlash = 0;
      for (let i = 0; i < 1800 && !bt.over; i++) {
        bt.step();
        bt.drainEvents();
        if (i % 7) continue;
        const sim = bt.sides[0], full = paint(b, 0, { sim, t: bt.t });
        for (const [uid, cx, cy] of gates) {
          const [x, y] = tileAt(0, cx, cy);
          // the same moment with this one gate lifted off: the difference is the gate and what it holds, inside its tile
          expect(allInside(diffPx(full, paint(b, 0, { sim, t: bt.t, hideItem: uid })), x, y, 12, 12), `gate ${uid} at tick ${i}`).toBe(true);
        }
        for (const cv of sim.converters!) {
          if (cv.buf.length) sawBuf++;
          if (cv.left > 0) sawWork++;
          if (cv.out.length) sawQueue++;
          if (cv.flash > 0) sawFlash++;
        }
      }
      expect(sawBuf, "slugs were held").toBeGreaterThan(5);
      expect(sawWork, "conversions ran").toBeGreaterThan(5);
      expect(sawQueue, "output waited").toBeGreaterThan(0);
      expect(sawFlash, "conversions flashed").toBeGreaterThan(0);
    });
  });
});
