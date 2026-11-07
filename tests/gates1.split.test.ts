// GATES-1 (REQ-BFG-057; BRIEF-GATES1 G3; step 4): placement and drop-to-split, without a browser (scripts/touchcheck.mjs, the
// drop-to-split section, drives the real page).
// - the preview: `SPLITS IT: 2 TILES IN, 3 TILES OUT` (GATES-1b B2; `1 TILE` when a count is 1), `1 ARROW IDLES` when rig arrows
//   aim at the tile, the refusal reasons;
// - the carried gate's target (actions.ts carryTarget): a mouse drops on the tile under it; a finger's ghost stands above the
//   finger and the drop snaps to the nearest legal belt tile within 1 cell (a catch of about 60 CSS px on a phone);
// - the drop itself (a card, cargo, a placed gate moved to another belt tile) and sell / remove: the belt is whole again;
// - a gate whose belt is gone goes back to cargo (run.ts releaseStranded);
// - the suggestion (cues.ts suggestCell): the second-last tile before a heavy gun for a FUSER;
// - GATES off: no gate exists, nothing of this is reachable.
import { afterEach, describe, expect, it } from "vitest";
import { newRun, releaseStranded, sellInventory, storePlaced, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { canExtend, canJoin, canPlaceItem, commitRoute, joinProblem, key as K, removeRoute, rotField, routeWellFormed, type Placed } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { SPLIT_NO_BELT, SPLIT_OFF_BELT, snapSplit, strandedConverters } from "../src/sim/split";
import { previewSplit, splitTag, suggestSplit } from "../src/sim/splitPreview";
import { frame as deckFrame } from "../src/render/frame";
import { computeView } from "../src/core/io";
import { Editor, type EditHost } from "../src/screens/build/edit";
import { buildScale, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { carryTarget, drop, fingerLift, type Carry } from "../src/screens/build/actions";
import { suggestCell } from "../src/screens/build/cues";
import { itemByUid } from "../src/sim/deck";

afterEach(() => setGates(GATES));

const BELT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const PHONE = computeView(390, 844, 3, buildScale);
const PHONE_K = PHONE.scale / PHONE.dpr; // CSS px per logical (art) px: 5 / 3

/** FURNACE: the KILN at (4,6) with its belt up column 4; `items` more parts; cargo `cargo`. */
function furnace(items: Placed[] = [], cargo: string[] = []): Run {
  const run = newRun("furnace", 5, "gates1");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...BELT] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo.map((def, i) => ({ uid: 50 + i, def }));
  run.gold = 0;
  return run;
}

/** tests/shapes1.ui.test.ts's host: the deck at (0, 0) facing north (cell (x, y) spans screen (12x, 12y)). */
function host(run: Run) {
  const log: string[] = [];
  const noop = () => undefined;
  const fx = { ring: noop, sparkle: noop, sparks: noop, dust: noop, popup: noop } as unknown as EditHost["wfx"];
  const h = {
    run, sel: { kind: "none" } as Sel,
    game: { audio: { play: (s: string) => log.push(`sound:${s}`) }, toast: (m: string) => log.push(`toast:${m}`), error: (m: string) => log.push(`error:${m}`) },
    L: { frame: deckFrame(0, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } },
    wfx: fx, ufx: fx,
    select(s: Sel) { h.sel = s; },
    turretAt: () => -1,
    coinPos: () => ({ x: 0, y: 0 }), touched: noop, placed: noop,
    invalid: (m: string) => log.push(`invalid:${m}`),
    offerAt: () => null,
    cargoAt: (x: number, y: number) => (y >= 300 && y < 320 ? run.inventory[Math.floor(x / 20)]?.uid ?? null : null),
    cssPerPx: () => PHONE_K,
  };
  return { h: h as unknown as EditHost & { sel: Sel }, log };
}
const at = (x: number, y: number) => [x * 12 + 6, y * 12 + 6] as const;
const L0 = (run: Run) => host(run).h.L as BuildLayout;
const carryOf = (def: string, extra: Partial<Carry> = {}): Carry => ({ src: { from: "cargo", uid: 50 }, def, uid: 50, ...extra });

describe("GATES-1 G3: the preview (previewSplit, splitTag)", () => {
  it("a tile with belt on both sides: how many tiles are its input and its output; the tag reads as the mock's", () => {
    withGates(() => {
      const run = furnace();
      const p = previewSplit(run.build, "fuser", K(4, 3)); // tile 2 of 6
      expect(p).toMatchObject({ ok: true, route: 0, tile: 2, tilesIn: 2, tilesOut: 3, idles: 0 });
      expect(p.outCells).toEqual([K(4, 2), K(4, 1), K(4, 0)]);
      expect(splitTag(p)).toBe("SPLITS IT: 2 TILES IN, 3 TILES OUT"); // GATES-1b B2: OUT says TILES too (was `3 OUT`)
      expect(splitTag(previewSplit(run.build, "fuser", K(4, 4)))).toBe("SPLITS IT: 1 TILE IN, 4 TILES OUT");
      expect(splitTag(previewSplit(run.build, "fuser", K(4, 1)))).toBe("SPLITS IT: 4 TILES IN, 1 TILE OUT"); // `1 TILE` when a count is 1
    });
  });

  it("GATES-1b B2: each count says TILE when it is 1 and TILES otherwise (a belt of 3 tiles, the middle one: 1 and 1)", () => {
    withGates(() => {
      const run = furnace();
      run.build.routes[0].cells = [K(4, 5), K(4, 4), K(4, 3)]; // three tiles: the gate on the middle one has one on each side
      expect(splitTag(previewSplit(run.build, "fuser", K(4, 4)))).toBe("SPLITS IT: 1 TILE IN, 1 TILE OUT");
      run.build.routes[0].cells = [K(4, 5), K(4, 4), K(4, 3), K(4, 2)];
      expect(splitTag(previewSplit(run.build, "fuser", K(4, 4)))).toBe("SPLITS IT: 1 TILE IN, 2 TILES OUT");
      expect(splitTag(previewSplit(run.build, "fuser", K(4, 3)))).toBe("SPLITS IT: 2 TILES IN, 1 TILE OUT");
    });
  });

  it("rig arrows aimed at the tile: `1 ARROW IDLES` (R5); two: `2 ARROWS IDLE`", () => {
    withGates(() => {
      const east = rotField("whetstone", rotFacing("whetstone", 1));
      const one = furnace([{ uid: 7, def: "whetstone", x: 3, y: 3, ...east }]);
      expect(previewSplit(one.build, "fuser", K(4, 3)).idles).toBe(1);
      expect(splitTag(previewSplit(one.build, "fuser", K(4, 3)))).toBe("SPLITS IT: 2 TILES IN, 3 TILES OUT · 1 ARROW IDLES");
      expect(previewSplit(one.build, "fuser", K(4, 2)).idles).toBe(0);
      // a second belt one tile east of the rig, so a LONG HAUL's two arrows both land on belt tiles beside it
      const two = furnace([{ uid: 7, def: "press", x: 6, y: 6 }, { uid: 8, def: "longhaul", x: 5, y: 3 }]);
      two.build.routes.push({ factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)] });
      expect(previewSplit(two.build, "fuser", K(4, 3)).idles).toBe(1); // the west arrow lands here; the east one stays on belt 2
      expect(previewSplit(two.build, "fuser", K(6, 3)).idles).toBe(1); // and from the other side
    });
  });

  it("a refused tile shows the reason alone: off a belt, the first and last tile, next to another gate", () => {
    withGates(() => {
      const run = furnace([{ uid: 30, def: "smelter", x: 4, y: 2 }]);
      const off = previewSplit(run.build, "fuser", K(1, 1));
      expect(off).toMatchObject({ ok: false, reason: SPLIT_OFF_BELT, route: -1 });
      expect(splitTag(off)).toBe("DROP IT ON A BELT");
      for (const k of [K(4, 5), K(4, 0), K(4, 3), K(4, 1)]) {
        const p = previewSplit(run.build, "fuser", k);
        expect(p.ok, String(k)).toBe(false);
        expect(splitTag(p), String(k)).toBe(SPLIT_NO_BELT);
      }
      expect(previewSplit(run.build, "fuser", K(4, 4)).ok).toBe(true);
      expect(previewSplit(run.build, "smelter", K(4, 2), 30).ok).toBe(true); // moving it: its own tile is fine
    });
  });
});

describe("GATES-1 G3: where a carried gate lands (carryTarget) and the finger's snap", () => {
  it("a mouse drops on the cell under it: a belt tile is legal, the cell beside the belt is `DROP IT ON A BELT`, no snap", () => {
    withGates(() => {
      const run = furnace([], ["fuser"]), L = L0(run);
      const c = carryOf("fuser");
      const [x, y] = at(4, 3);
      expect(carryTarget(L, run.build, c, x, y)).toMatchObject({ x: 4, y: 3, ok: true });
      const [bx, by] = at(5, 3); // beside the belt
      expect(carryTarget(L, run.build, c, bx, by)).toMatchObject({ x: 5, y: 3, ok: false, reason: SPLIT_OFF_BELT });
      const [fx, fy] = at(4, 5); // the first tile
      expect(carryTarget(L, run.build, c, fx, fy)).toMatchObject({ ok: false, reason: SPLIT_NO_BELT });
    });
  });

  it("a finger: the ghost stands above the finger (fingerLift) and the drop snaps to the nearest legal belt tile within 1 cell", () => {
    withGates(() => {
      const run = furnace([], ["fuser"]), L = L0(run);
      const c = carryOf("fuser", { touch: true });
      const lift = fingerLift(L, "fuser", 0);
      expect(lift).toBeCloseTo((0.5 + 1.5) * 12, 6); // a 1x1: half its height plus 1.5 cells
      const point = (cx: number, cy: number) => [at(cx, cy)[0], at(cx, cy)[1] + lift] as const; // the finger under cell (cx, cy)'s lifted ghost
      // right on a legal tile
      expect(carryTarget(L, run.build, c, ...point(4, 3))).toMatchObject({ x: 4, y: 3, ok: true });
      // one cell beside the belt: snaps onto it (the belt tile to its west)
      expect(carryTarget(L, run.build, c, ...point(5, 3))).toMatchObject({ x: 4, y: 3, ok: true });
      expect(carryTarget(L, run.build, c, ...point(3, 3))).toMatchObject({ x: 4, y: 3, ok: true });
      // two cells off: nothing in reach, the cell it is on is refused with its reason
      expect(carryTarget(L, run.build, c, ...point(6, 3))).toMatchObject({ x: 6, y: 3, ok: false, reason: SPLIT_OFF_BELT });
      // on the first tile (refused): the nearest legal one is the next along
      expect(carryTarget(L, run.build, c, ...point(4, 5))).toMatchObject({ x: 4, y: 4, ok: true });
      // a mouse carry does not snap
      expect(carryTarget(L, run.build, carryOf("fuser"), ...at(5, 3))).toMatchObject({ x: 5, y: 3, ok: false });
    });
  });

  it("the catch: the 3x3 block round the cell: three cells across, 60 CSS px at 20 px cells (the brief's figure), 72 at the phone's 24", () => {
    withGates(() => {
      const run = furnace();
      const cellCss = 12 * PHONE_K; // a cell before the build carrier's zoom (ZOOM-1: 1.2x on the phone)
      expect(cellCss).toBeCloseTo(20, 6);
      expect(3 * cellCss).toBeGreaterThanOrEqual(60 - 1e-9);
      // scripts/touchcheck.mjs gatesplit measures it on the real page: 24 CSS px cells, a catch of 72 (over a finger's 44)
      expect(3 * cellCss * 1.2).toBeCloseTo(72, 6);
      // every cell within 1 of a legal belt tile snaps to it; none two cells away does
      const snapped = [];
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (snapSplit(run.build, "fuser", x, y)) snapped.push(`${x},${y}`);
      expect(snapped.every((s) => { const [x, y] = s.split(",").map(Number); return x >= 3 && x <= 5 && y >= 0 && y <= 6; })).toBe(true);
      expect(snapSplit(run.build, "fuser", 6, 3)).toBeNull();
      expect(snapSplit(run.build, "fuser", 2, 3)).toBeNull();
      expect(snapSplit(run.build, "fuser", 5, 3)).toEqual({ x: 4, y: 3 });
      expect(snapSplit(run.build, "fuser", 4, 0)).toEqual({ x: 4, y: 1 }); // the last tile is refused: the tile before it
    });
  });
});

describe("GATES-1 G3: the drop, and sell or remove rejoin the belt", () => {
  it("a gate in cargo dropped on a belt tile splits the belt in place: the same ONE route, no tile lost, no cell taken", () => {
    withGates(() => {
      const run = furnace([], ["fuser"]);
      const { h } = host(run);
      const before = JSON.stringify(run.build.routes);
      const ed = new Editor(h);
      ed.down(10, 310); // the cargo slot
      ed.move(30, 200);
      expect(ed.carry?.def).toBe("fuser");
      ed.move(...at(4, 3));
      ed.up(...at(4, 3));
      expect(run.inventory.length).toBe(0);
      const p = run.build.items.find((q) => q.def === "fuser")!;
      expect([p.x, p.y]).toEqual([4, 3]);
      expect(JSON.stringify(run.build.routes)).toBe(before); // the route is untouched: one RouteDef, its cells as they were
      expect(run.build.routes.length).toBe(1);
      expect(canPlaceItem(run.build, "fuser", 4, 3, p.uid).ok).toBe(true);
    });
  });

  it("a drop on a refused tile places nothing and says why; the gate stays in cargo", () => {
    withGates(() => {
      const run = furnace([], ["fuser"]);
      const { h, log } = host(run);
      const ed = new Editor(h);
      ed.down(10, 310);
      ed.move(30, 200);
      ed.move(...at(5, 3));
      ed.up(...at(5, 3));
      expect(run.inventory.length).toBe(1);
      expect(run.build.items.some((q) => q.def === "fuser")).toBe(false);
      expect(log).toContain(`invalid:${SPLIT_OFF_BELT}`);
    });
  });

  it("carrying a placed gate to another belt tile moves the split there; sell and remove put the belt whole again", () => {
    withGates(() => {
      const run = furnace([{ uid: 30, def: "fuser", x: 4, y: 3 }]);
      const { h } = host(run);
      const cells = JSON.stringify(run.build.routes[0].cells);
      const ed = new Editor(h);
      ed.down(...at(4, 3)); // press the gate itself
      ed.move(...at(4, 2));
      expect(ed.carry?.def).toBe("fuser");
      ed.move(...at(4, 1));
      ed.up(...at(4, 1));
      const p = itemByUid(run.build, 30)!;
      expect([p.x, p.y]).toEqual([4, 1]);
      expect(JSON.stringify(run.build.routes[0].cells)).toBe(cells);
      // remove (TO CARGO) and sell: no merge code, the belt is the same whole route
      expect(storePlaced(run, 30)).toBe(true);
      expect(run.inventory.some((i) => i.def === "fuser")).toBe(true);
      expect(JSON.stringify(run.build.routes)).toBe(JSON.stringify([{ factory: 1, cells: BELT }]));
      expect(sellInventory(run, 30)).toBe(3); // sellValue(FUSER ★1) = floor(6 / 2)
    });
  });

  it("a second gate next to a placed one is refused (NEEDS BELT ON BOTH SIDES); one tile further along is fine", () => {
    withGates(() => {
      const run = furnace([{ uid: 30, def: "smelter", x: 4, y: 3 }], ["fuser"]);
      expect(canPlaceItem(run.build, "fuser", 4, 2).reason).toBe(SPLIT_NO_BELT);
      expect(canPlaceItem(run.build, "fuser", 4, 4).reason).toBe(SPLIT_NO_BELT);
      expect(canPlaceItem(run.build, "fuser", 4, 1)).toEqual({ ok: true });
    });
  });
});

describe("GATES-1 G2/G3: a belt drawn into a gate's tile joins it (review finding 2: either order gives the same deck)", () => {
  // a STAMP PRESS at (6,6) with a belt (6,5), (6,4), (6,3), (5,3) that steps into (4,3), where a FUSER stands on the KILN's belt
  const PRESS = { uid: 7, def: "press", x: 6, y: 6 } as const;
  const PENDING = [K(6, 5), K(6, 4), K(6, 3), K(5, 3)];

  it("the editor meets BELTS CAN'T CROSS at a gate on another belt, so canJoin may join it there", () => {
    withGates(() => {
      const run = furnace([{ uid: 30, def: "fuser", x: 4, y: 3 }, { ...PRESS }]);
      const b = run.build;
      expect(canExtend(b, 7, PENDING, K(4, 3), -1)).toEqual({ ok: false, reason: "BELTS CAN'T CROSS" });
      expect(canJoin(b, 7, PENDING, K(4, 3), -1)).toMatchObject({ ok: true, route: 0, tile: 2 });
      commitRoute(b, 7, PENDING, -1, K(4, 3));
      expect(b.routes[1]).toMatchObject({ factory: 7, join: K(4, 3) });
      expect(joinProblem(b, 1)).toBeNull();
      expect(routeWellFormed(b, b.routes[0])).toBe(true); // the KILN's belt still runs through its gate
      // the same deck the other way round: the join first, the gate dropped on the join tile afterwards
      const other = furnace([{ ...PRESS }], ["fuser"]);
      commitRoute(other.build, 7, PENDING, -1, K(4, 3));
      expect(canPlaceItem(other.build, "fuser", 4, 3)).toEqual({ ok: true });
    });
  });

  it("anything else on a belt stays in the way: a rig, and a belt redrawn through its OWN gate's tile", () => {
    withGates(() => {
      const run = furnace([{ uid: 30, def: "fuser", x: 4, y: 3 }, { ...PRESS }, { uid: 31, def: "temper", x: 5, y: 3 }]);
      const b = run.build;
      expect(canExtend(b, 7, [K(6, 5), K(6, 4), K(6, 3)], K(5, 3), -1)).toEqual({ ok: false, reason: "MACHINE IN THE WAY" }); // the TEMPER's cell
      // the KILN's own belt, redrawn: it may not step onto its own gate's tile (it is replacing route 0)
      expect(canExtend(b, 1, [K(4, 5), K(4, 4)], K(4, 3), 0)).toEqual({ ok: false, reason: "MACHINE IN THE WAY" });
    });
  });
});

describe("GATES-1 G3: a gate whose belt is gone goes back to cargo", () => {
  it("deleting the belt strands the gate on it; releaseStranded stores it (stars kept) and names it", () => {
    withGates(() => {
      const run = furnace([{ uid: 30, def: "fuser", x: 4, y: 3, stars: 2 }]);
      removeRoute(run.build, 0);
      expect(strandedConverters(run.build).map((p) => p.uid)).toEqual([30]);
      expect(releaseStranded(run)).toEqual(["FUSER"]);
      expect(run.build.items.some((p) => p.def === "fuser")).toBe(false);
      expect(run.inventory.find((i) => i.def === "fuser")).toMatchObject({ uid: 30, stars: 2 });
      expect(releaseStranded(run)).toEqual([]); // idempotent
    });
  });

  it("a rerouted belt that no longer passes a gate (or leaves it on its end) releases it; two neighbours release only one", () => {
    withGates(() => {
      const run = furnace([{ uid: 30, def: "smelter", x: 4, y: 2 }]);
      run.build.routes[0].cells = [K(4, 5), K(4, 4), K(4, 3), K(5, 3), K(5, 2), K(5, 1), K(5, 0)]; // goes round
      expect(releaseStranded(run)).toEqual(["SMELTER"]);
      // the gate left on a belt's last tile (a redraw that stops short)
      const run2 = furnace([{ uid: 31, def: "smelter", x: 4, y: 3 }]);
      run2.build.routes[0].cells = BELT.slice(0, 3);
      expect(releaseStranded(run2)).toEqual(["SMELTER"]);
      // two adjacent gates (a forged or legacy deck): the first in item order goes, the second then stands legally
      const run3 = furnace([{ uid: 32, def: "smelter", x: 4, y: 3 }, { uid: 33, def: "fuser", x: 4, y: 2 }]);
      expect(releaseStranded(run3)).toEqual(["SMELTER"]);
      expect(run3.build.items.map((p) => p.uid)).toEqual([1, 33]);
    });
  });

  it("a deck without a gate is left exactly as it is", () => {
    const run = furnace([{ uid: 30, def: "whetstone", x: 3, y: 3 }]);
    const snap = JSON.stringify(run);
    expect(releaseStranded(run)).toEqual([]);
    expect(JSON.stringify(run)).toBe(snap);
  });
});

describe("GATES-1 G3: the suggestion", () => {
  it("a FUSER: the second-last tile of the longest belt into a heavy gun (r1d variant J); the others: a tile with room", () => {
    withGates(() => {
      const run = furnace();
      expect(suggestSplit(run.build, "fuser")).toEqual({ x: 4, y: 1 }); // tile 4 of 0-5
      expect(suggestCell(run.build, "fuser")).toEqual({ x: 4, y: 1 });
      expect(suggestSplit(run.build, "scattermill")).toEqual({ x: 4, y: 3 }); // the middle (the FURNACE's gun is heavy: no light gun to prefer)
      expect(suggestSplit(run.build, "smelter")).toEqual({ x: 4, y: 3 });
      // the second-last tile is taken by a gate: the next tile toward the start
      const taken = furnace([{ uid: 30, def: "smelter", x: 4, y: 1 }]);
      expect(suggestSplit(taken.build, "fuser")).toEqual({ x: 4, y: 3 }); // (4,2) is next to the smelter; (4,3) is the nearest legal
      // no belt, no suggestion
      const bare = furnace();
      bare.build.routes = [];
      expect(suggestSplit(bare.build, "fuser")).toBeNull();
    });
  });
});

describe("GATES-1 G3: GATES off", () => {
  it("no gate exists: nothing to carry, preview or suggest; a deck without gates is never touched by the sweep", () => {
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): was the body bare (the shipped world had GATES off); GATES ships on, so the switch-off world is asked for outright (withGates(fn, false), synchronously)
    withGates(() => {
      expect(ITEMS.fuser).toBeUndefined();
      const run = furnace();
      expect(releaseStranded(run)).toEqual([]);
      expect(strandedConverters(run.build)).toEqual([]);
    }, false);
  });
});
