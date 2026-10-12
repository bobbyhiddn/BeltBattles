// SHAPES-1 (REQ-BFG-086.2, .4; BRIEF-SHAPES1 S2, S3, step 5): the editor with shaped pieces, without a browser
// (scripts/touchcheck.mjs drives the real page).
// - S2: a quarter turn turns the footprint around its anchor; a turn that doesn't fit falls through to the next; none fits:
//   the piece stays and the reason shows. A carried long rig aims itself at the turn with the most hits; R turns it by hand.
//   A click (or a tap, when selected) on a 2x3 or I3 factory turns it; a 2x2 never turns.
// - S3: a finger's carry of a shaped piece stands above the finger (fingerLift) and its drop snaps to the nearest legal
//   anchor within 1 cell; a mouse's doesn't. The floating ROTATE button is at least 44 CSS px, beside the ghost, away from
//   the finger, on screen.
// - The reasons: OFF THE DECK, OCCUPIED, BELT IN THE WAY and TURRET INTAKE; the ghost's tag: `2 HITS`,
//   `IDLE: NO BELT IN REACH`, `2 HITS · 1 ARROW IDLES`.
// - SHAPES off: no shaped piece exists, a 1-cell rig's and a 2x2's carry target is 0.9.9's, and no factory panel has ROTATE.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { canPlaceItem, isIntakeCell, itemByUid, key as K, rotField, rotOf, type Placed } from "../src/sim/deck";
import { withShapes } from "../src/sim/shapes";
import { frame as deckFrame } from "../src/render/frame";
import { computeView } from "../src/core/io";
import { Editor, type EditHost } from "../src/screens/build/edit";
import { buildScale, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { carryTarget, dropCell, fingerLift, rigRotAt, rotate, type Carry } from "../src/screens/build/actions";
import {
  canTurn, carryTurn, machineryArrows, shapedPiece, shapeTag, snapAnchor, turnFit, turnsOf,
  WHEEL_GAP_S, wheelPx, wheelTurn, type WheelState,
} from "../src/screens/build/shapeEdit";
import { rotateButtonRect } from "../src/screens/build/cues";
import { itemPanel, rigPanel } from "../src/screens/build/inspector";
import { tapPx } from "../src/ui/tap";

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const PHONE = computeView(390, 844, 3, buildScale);
const PHONE_K = PHONE.scale / PHONE.dpr; // 5 / 3

/** FURNACE: the KILN at (4,6) with its belt up column 4 (SHORT); `items` more parts; cargo `cargo`. */
function furnace(items: Placed[] = [], cargo: string[] = []): Run {
  const run = newRun("furnace", 5, "shapes1");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORT] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo.map((def, i) => ({ uid: 50 + i, def }));
  run.gold = 0;
  return run;
}

/** shoptap.edit.test.ts's host: the deck at (0, 0) facing north (cell (x, y) spans screen (12x, 12y)); cargo slots at y
 *  300-320 (20 px each). */
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
const CARGO0 = [10, 310] as const;
const L0 = (run: Run) => host(run).h.L as BuildLayout;

describe("SHAPES-1 S2: turning a shaped piece around its anchor", () => {
  it("turnsOf: a rig 4, a 2x3 or I3 factory 2, a 2x2 1 (it never turns); every rig and factory 1-cell/2x2 with SHAPES off", () => {
    withShapes(() => {
      expect(["nailstrip", "embertrough", "spikerail", "whetstone", "gantry", "assembly", "kiln", "press"].map(turnsOf)).toEqual([4, 4, 4, 4, 2, 2, 1, 1]);
      expect(["nailstrip", "spikerail", "gantry", "assembly"].map(shapedPiece)).toEqual([true, true, true, true]);
      expect(["whetstone", "kiln", "press"].map(shapedPiece)).toEqual([false, false, false]);
    });
    // off: nothing is shaped, GANTRY PRESS and ASSEMBLY LINE are 2x2 and don't turn (SHAPES-1 flip: set off; it ships on)
    withShapes(() => {
      expect(Object.keys(ITEMS).filter(shapedPiece)).toEqual([]);
      expect([canTurn("gantry"), canTurn("assembly"), canTurn("whetstone")]).toEqual([false, false, true]);
    }, false);
  });

  it("turnFit: a NAIL STRIP beside the belt turns to the next turn that fits (rot 2 would cover the belt: it goes to 3)", () => {
    withShapes(() => {
      const run = furnace([{ uid: 7, def: "nailstrip", x: 3, y: 2, ...rotField("nailstrip", 1) }]);
      expect(canPlaceItem(run.build, "nailstrip", 3, 2, 7, 2).reason).toBe("BELT IN THE WAY");
      expect(turnFit(run.build, 7)).toEqual({ ok: true, rot: 3 });
      const { h } = host(run);
      rotate(h, 7);
      expect(rotOf(itemByUid(run.build, 7)!)).toBe(3);
      rotate(h, 7); // from 3: rot 0 at (3,2) covers (4,2), the belt: falls through to rot 1
      expect(rotOf(itemByUid(run.build, 7)!)).toBe(1);
    });
  });

  it("turnFit: a 2x3 GANTRY PRESS whose other turn is blocked stays put and says why; a 1-cell rig always turns", () => {
    withShapes(() => {
      const run = furnace([{ uid: 9, def: "gantry", x: 0, y: 7 }, { uid: 8, def: "whetstone", x: 0, y: 9 }]);
      expect(turnFit(run.build, 9)).toEqual({ ok: false, reason: "OCCUPIED" });
      const { h, log } = host(run);
      rotate(h, 9);
      expect(rotOf(itemByUid(run.build, 9)!)).toBe(0);
      expect(log).toContain("invalid:OCCUPIED");
      expect(turnFit(run.build, 8)).toEqual({ ok: true, rot: 1 });
      run.build.items = run.build.items.filter((p) => p.uid !== 8);
      expect(turnFit(run.build, 9)).toEqual({ ok: true, rot: 1 });
      rotate(h, 9);
      expect(itemByUid(run.build, 9)!.rot).toBe(1);
      rotate(h, 9); // back to rot 0: stored absent
      expect(itemByUid(run.build, 9)!.rot).toBeUndefined();
    });
  });

  it("a 2x2 factory never turns (turnFit refuses; the click selects it and nothing moves)", () => {
    withShapes(() => {
      const run = furnace();
      expect(turnFit(run.build, 1).ok).toBe(false);
      const { h } = host(run);
      const ed = new Editor(h);
      for (let i = 0; i < 2; i++) { ed.down(...at(4, 6), "mouse"); ed.up(...at(4, 6)); }
      expect(itemByUid(run.build, 1)!.rot).toBeUndefined();
      expect(h.sel).toEqual({ kind: "item", uid: 1 });
    });
  });

  it("a click on the selected 2x3 turns it (the first click selects); a finger's tap on it selected turns it back", () => {
    withShapes(() => {
      const run = furnace([{ uid: 9, def: "gantry", x: 0, y: 7 }]);
      const { h } = host(run);
      const ed = new Editor(h);
      ed.down(...at(1, 7), "mouse"); ed.up(...at(1, 7));
      expect(h.sel).toEqual({ kind: "item", uid: 9 });
      expect(itemByUid(run.build, 9)!.rot).toBeUndefined();
      ed.down(...at(1, 7), "mouse"); ed.up(...at(1, 7));
      expect(itemByUid(run.build, 9)!.rot).toBe(1);
      ed.down(...at(0, 8), "touch"); ed.up(...at(0, 8));
      expect(itemByUid(run.build, 9)!.rot).toBeUndefined();
    });
  });
});

describe("SHAPES-1 S2: the carried long rig (auto-aim, R, the drop lands where the preview showed)", () => {
  it("a mouse drag from cargo aims a NAIL STRIP along the belt (rot 1: 2 hits) and drops it there", () => {
    withShapes(() => {
      const run = furnace([], ["nailstrip"]);
      const { h } = host(run);
      const ed = new Editor(h);
      ed.down(...CARGO0, "mouse");
      ed.move(CARGO0[0] + 10, CARGO0[1]);
      ed.move(...at(3, 2));
      expect(ed.carry?.rot).toBe(1);
      const tg = carryTarget(h.L, run.build, ed.carry!, ...at(3, 2))!;
      expect(tg).toMatchObject({ x: 3, y: 2, rot: 1, ok: true });
      ed.up(...at(3, 2));
      const p = run.build.items.find((q) => q.def === "nailstrip")!;
      expect([p.x, p.y, p.rot]).toEqual([3, 2, 1]);
      expect(run.inventory).toEqual([]);
    });
  });

  it("R while carrying turns it by hand, skipping a turn that doesn't fit there (1 -> 3), and it lands at that turn", () => {
    withShapes(() => {
      const run = furnace([], ["nailstrip"]);
      const { h } = host(run);
      const ed = new Editor(h);
      ed.down(...CARGO0, "mouse");
      ed.move(CARGO0[0] + 10, CARGO0[1]);
      ed.move(...at(3, 2));
      expect(ed.rotateCarry()).toBe(true);
      expect([ed.carry?.rot, ed.carry?.manual]).toEqual([3, true]);
      ed.move(...at(3, 2)); // hand-turned: the aim leaves it
      expect(ed.carry?.rot).toBe(3);
      ed.up(...at(3, 2));
      const p = run.build.items.find((q) => q.def === "nailstrip")!;
      expect([p.x, p.y, p.rot]).toEqual([3, 2, 3]);
    });
  });

  it("carryTurn: none fits where it would land: the turn stays and the reason comes back; off the deck any turn goes", () => {
    withShapes(() => {
      const run = furnace([{ uid: 9, def: "gantry", x: 0, y: 7 }, { uid: 8, def: "whetstone", x: 0, y: 9 }]);
      expect(carryTurn(run.build, "gantry", 0, () => ({ x: 0, y: 7 }), 9)).toEqual({ rot: 0, reason: "OCCUPIED" });
      expect(carryTurn(run.build, "gantry", 0, () => null, 9)).toEqual({ rot: 1 });
    });
  });
});

describe("SHAPES-1 S3, cap's wheel guard (RUN3-SHAPES1 1.5): one quarter turn per wheel notch, never a spin", () => {
  it("a mouse notch (100 px, or 3 lines) turns once; a trackpad's swipe of small deltas turns once per 100 px and at most once per 0.15 s", () => {
    const fresh = (): WheelState => ({ sum: 0, last: -1 });
    // a mouse: one notch of 100 px, or 3 lines (deltaMode 1), or one page, is one turn
    expect(wheelTurn(fresh(), wheelPx(100), 0)).toBe(true);
    expect(wheelTurn(fresh(), wheelPx(3, 1), 0)).toBe(true);
    expect(wheelTurn(fresh(), wheelPx(1, 2), 0)).toBe(true);
    expect(wheelTurn(fresh(), wheelPx(-100), 0)).toBe(true); // either way
    expect(wheelTurn(fresh(), wheelPx(1, 1), 0)).toBe(false); // one line is a third of a notch
    // two notches 0.05 s apart: one turn (the second inside 0.15 s is dropped); 0.2 s apart: two
    const s = fresh();
    expect([wheelTurn(s, 100, 1), wheelTurn(s, 100, 1.05), wheelTurn(s, 100, 1.25)]).toEqual([true, false, true]);
    // a trackpad: 4 px every 16 ms for 2 s (500 px in 125 events): turns only at each 100 px, never two within 0.15 s
    const t = fresh();
    const turns: number[] = [];
    for (let i = 0; i < 125; i++) if (wheelTurn(t, 4, i * 0.016)) turns.push(i * 0.016);
    expect(turns.length).toBe(5);
    for (let i = 1; i < turns.length; i++) expect(turns[i] - turns[i - 1]).toBeGreaterThanOrEqual(WHEEL_GAP_S);
    // a swipe back and forth never reaches a notch: no turn
    const u = fresh();
    expect(Array.from({ length: 60 }, (_, i) => wheelTurn(u, i % 2 ? -40 : 40, i * 0.016)).some(Boolean)).toBe(false);
  });
});

describe("SHAPES-1 S3: a finger's carry (above the finger, the snap) and the floating ROTATE button", () => {
  it("fingerLift: half the ghost's height plus 1.5 cells (a NAIL STRIP lying across: 24 px at 12 px a cell)", () => {
    withShapes(() => {
      const L = L0(furnace());
      expect(fingerLift(L, "nailstrip", 0)).toBe(24);
      expect(fingerLift(L, "nailstrip", 1)).toBe(30);
      expect(fingerLift(L, "gantry", 0)).toBe(30);
    });
  });

  it("the touch drop snaps to the nearest legal anchor within 1 cell; the mouse's doesn't snap or lift", () => {
    withShapes(() => {
      const run = furnace([], ["nailstrip"]);
      const L = L0(run);
      const c: Carry = { src: { from: "cargo", uid: 50 }, def: "nailstrip", uid: 50, rot: 0, manual: true, touch: true };
      // the finger at (60, 66): 24 px above it the anchor is (4,3), on the belt; the nearest legal one is (5,3)
      expect(snapAnchor(run.build, "nailstrip", 4, 3, 0)).toEqual({ x: 5, y: 3 });
      expect(carryTarget(L, run.build, c, 60, 66)).toMatchObject({ x: 5, y: 3, rot: 0, ok: true, py: 42 });
      const m = { ...c, touch: undefined };
      expect(carryTarget(L, run.build, m, 60, 66)).toMatchObject({ x: 4, y: 5, ok: false, reason: "BELT IN THE WAY", py: 66 });
      // nothing legal within 1 cell: no snap, (x, y)'s reason
      const full = furnace([3, 5].flatMap((x) => [1, 2, 3, 4].map((y, i) => ({ uid: 100 + x * 10 + i, def: "whetstone", x, y }))));
      expect(snapAnchor(full.build, "nailstrip", 4, 3, 0)).toBeNull();
    });
  });

  it("a finger's drag drops the piece where its lifted ghost was", () => {
    withShapes(() => {
      const run = furnace([], ["nailstrip"]);
      const { h } = host(run);
      const ed = new Editor(h);
      ed.down(...CARGO0, "touch");
      ed.move(CARGO0[0] + 10, CARGO0[1]);
      expect(ed.carry?.touch).toBe(true);
      ed.move(60, 66);
      const tg = carryTarget(h.L, run.build, ed.carry!, 60, 66)!;
      expect(tg.ok).toBe(true);
      ed.up(60, 66);
      const p = run.build.items.find((q) => q.def === "nailstrip")!;
      expect([p.x, p.y, rotOf(p)]).toEqual([tg.x, tg.y, tg.rot]);
    });
  });

  it("rotateButtonRect: at least 44 CSS px, beside the ghost on the side away from the finger, on screen", () => {
    const tap = tapPx(PHONE);
    const box = { x: 100, y: 100, w: 24, h: 12 };
    const mid = rotateButtonRect(box, 112, PHONE.W, tap);
    expect(mid.w * PHONE_K).toBeGreaterThanOrEqual(44);
    expect(mid.w).toBe(mid.h);
    expect(mid.x).toBe(128); // a finger under the middle, the ghost in the screen's left half: the right side
    expect(mid.y).toBe(99); // never above the box's top: the tag over the box stays clear of it
    const right = rotateButtonRect(box, 130, PHONE.W, tap); // the finger right of the middle: the left side
    expect(right.x + right.w).toBe(96);
    const edge = rotateButtonRect({ x: 2, y: 100, w: 24, h: 12 }, 30, PHONE.W, tap);
    expect(edge.x).toBe(0); // kept on screen
  });
});

describe("SHAPES-1 S2: the reasons and the ghost's tag", () => {
  it("OFF THE DECK, OCCUPIED, BELT IN THE WAY and TURRET INTAKE refuse a mouse drop, and nothing changes", () => {
    withShapes(() => {
      const base = () => furnace([{ uid: 7, def: "whetstone", x: 7, y: 4 }], ["spikerail"]);
      // an intake cell in row 0 that no belt covers
      const run0 = base();
      const ix = [0, 1, 2, 3, 5, 6, 7, 8, 9].find((x) => isIntakeCell(run0.build, K(x, 0)));
      expect(ix).toBeDefined();
      const cases: [string, number, number, number][] = [
        ["OFF THE DECK", 9, 0, 1], // an I3 lying along x from column 9
        ["OCCUPIED", 7, 3, 0], // its cells (7,3)-(7,5) cover the WHETSTONE
        ["BELT IN THE WAY", 4, 1, 0],
        ["TURRET INTAKE", ix!, 0, 0],
      ];
      for (const [reason, x, y, rot] of cases) {
        const run = base();
        expect(canPlaceItem(run.build, "spikerail", x, y, -1, rot).reason).toBe(reason);
        const { h, log } = host(run);
        const before = JSON.stringify(run.build);
        const c: Carry = { src: { from: "cargo", uid: 50 }, def: "spikerail", uid: 50, rot, manual: true };
        const ed = new Editor(h);
        ed.carry = c;
        // the pointer over the anchor: the box's middle
        const tg = carryTarget(h.L, run.build, c, x * 12 + (rot === 1 ? 18 : 6), y * 12 + (rot === 1 ? 6 : 18));
        if (reason === "OFF THE DECK") expect(tg?.x).toBe(7); // dropAnchor keeps a box on the deck, as dropCell does
        else {
          expect(tg).toMatchObject({ x, y, ok: false, reason });
          ed.up(x * 12 + 6, y * 12 + 18);
          expect(log).toContain(`invalid:${reason}`);
          expect(JSON.stringify(run.build)).toBe(before);
        }
      }
    });
  });

  it("shapeTag and machineryArrows: 2 HITS, IDLE: NO BELT IN REACH, an arrow at machinery idles", () => {
    expect(shapeTag(2, 0)).toBe("2 HITS");
    expect(shapeTag(1, 0)).toBe("1 HIT");
    expect(shapeTag(0, 0)).toBe("IDLE: NO BELT IN REACH");
    expect(shapeTag(0, 1)).toBe("IDLE: NO BELT IN REACH");
    expect(shapeTag(2, 1)).toBe("2 HITS · 1 ARROW IDLES");
    expect(shapeTag(1, 2)).toBe("1 HIT · 2 ARROWS IDLE");
    withShapes(() => {
      // a NAIL STRIP standing up at (5,4)-(5,5), arrows -x: (4,4) is a belt tile, (4,5) too; the KILN's top is (4,6)
      const run = furnace([{ uid: 7, def: "whetstone", x: 6, y: 3 }]);
      expect(machineryArrows(run.build, "nailstrip", 5, 4, 3)).toBe(0);
      // lying along x at (5,4)-(6,4), arrow forward: (5,3) free deck, (6,3) the WHETSTONE: one arrow idles at machinery
      expect(machineryArrows(run.build, "nailstrip", 5, 4, 0)).toBe(1);
      expect(machineryArrows(run.build, "nailstrip", 5, 4, 0, 7)).toBe(0); // the piece being moved isn't machinery
    });
  });
});

describe("SHAPES-1 R2: a placed long rig's panel counts its arrows per cell", () => {
  it("a NAIL STRIP along the belt: RIG · 2/2 ARROWS ON BELTS; turned away: IDLE", () => {
    withShapes(() => {
      const run = furnace([{ uid: 7, def: "nailstrip", x: 3, y: 2, ...rotField("nailstrip", 1) }]);
      expect(rigPanel(run, 7)!.sub).toBe("RIG · 2/2 ARROWS ON BELTS");
      run.build.items[1] = { uid: 7, def: "nailstrip", x: 3, y: 2, ...rotField("nailstrip", 3) };
      expect(rigPanel(run, 7)!.idle).toBe(true);
    });
  });
});

describe("SHAPES-1 S1: with SHAPES off the editor is 0.9.9's", () => {
  it("a 1-cell rig's and a 2x2's carry target is dropCell's cell at rigRotAt's rot (no lift, no snap)", () => {
    const run = furnace([], ["whetstone", "press"]);
    const L = L0(run);
    for (const touch of [false, true]) {
      const rig: Carry = { src: { from: "cargo", uid: 50 }, def: "whetstone", uid: 50, ...(touch ? { touch } : {}) };
      const cell = dropCell(L, ...at(3, 2), 1)!;
      expect(carryTarget(L, run.build, rig, ...at(3, 2))).toMatchObject({ ...cell, rot: rigRotAt(run.build, rig, cell), ok: true });
      const fac: Carry = { src: { from: "cargo", uid: 51 }, def: "press", uid: 51, ...(touch ? { touch } : {}) };
      const fcell = dropCell(L, ...at(1, 8), 2)!;
      expect(carryTarget(L, run.build, fac, ...at(1, 8))).toMatchObject({ ...fcell, rot: 0, ok: true });
    }
  });

  it("no factory panel has ROTATE with SHAPES off; a 2x3 GANTRY PRESS's has it first with SHAPES on", () => {
    withShapes(() => { // SHAPES-1 flip: the off world set off (it ships on)
      const off = furnace([{ uid: 9, def: "gantry", x: 0, y: 7 }]);
      expect(itemPanel(off, 9)!.labels).toEqual(["TO CARGO"]);
    }, false);
    withShapes(() => {
      const on = furnace([{ uid: 9, def: "gantry", x: 0, y: 7 }, { uid: 10, def: "assembly", x: 0, y: 4 }]);
      expect(itemPanel(on, 9)!.labels).toEqual(["ROTATE", "TO CARGO"]);
      expect(itemPanel(on, 9, true)!.labels[0]).toBe("ROTATE");
      expect(itemPanel(on, 10)!.labels).toEqual(["ROTATE", "TO CARGO"]);
      expect(itemPanel(on, 1)!.labels).not.toContain("ROTATE"); // the KILN, 2x2
    });
  });
});
