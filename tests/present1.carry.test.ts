// PRESENT-1 C (REQ-BFG-086; backlog #463; ref carry/STAGE-REPORT-0911.md section 6, REVIEW-STAGE0911.md B.3): a finger's carry of a tall
// shaped piece lands on the deck. SHAPES-1 S3 lifts a finger's carry of a shaped piece (tall / 2 + 1.5) cells above the finger
// (actions.ts fingerLift: 3 cells for a SPIKE RAIL lying along the deck), so a finger on the deck's top rows put the drop point off the
// deck, dropAnchor answered null and the drop was refused with no word. Now, while the finger is over the deck, the lifted anchor is
// clamped onto it (the whole footprint, both axes) and GATES-1's snap (within 1 cell) runs on it as before. Off the deck, for the mouse,
// and wherever the lifted point was on the deck already, nothing changes (tests/shapes1.ui.test.ts's pins stand).
// The sweep: every shaped piece at every turn, on every facing of the carrier, with the finger on every cell of the deck, on three
// builds. Counts: the refusals with no word before (carryTarget null: dropAnchor's) and after, and the refusals with a reason after.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { GRID, ITEMS } from "../src/sim/content";
import { canPlaceItem, key as K, type Placed } from "../src/sim/deck";
import { footBox } from "../src/sim/foot";
import { withShapes } from "../src/sim/shapes";
import { withShapes2 } from "../src/sim/shapes2";
import { DECK, frame as deckFrame, type Facing } from "../src/render/frame";
import { carryTarget, dropAnchor, fingerLift, overDeck, type Carry } from "../src/screens/build/actions";
import { shapedPiece, snapAnchor, turnsOf } from "../src/screens/build/shapeEdit";
import { screenRect, type BuildLayout } from "../src/screens/build/layout";

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];

/** FURNACE: the KILN at (4,6) with its belt up column 4 (shapes1.ui.test.ts's furnace); `items` more parts. */
function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "present1-carry");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORT] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 0;
  return run;
}
/** The three builds: the starting deck; the middle busy (WHETSTONEs make machinery that refuses); and the edges crowded. */
const BUILDS: [string, () => Run][] = [
  ["start", () => furnace()],
  ["busy", () => furnace([{ uid: 20, def: "whetstone", x: 2, y: 2 }, { uid: 21, def: "whetstone", x: 7, y: 2 }, { uid: 22, def: "whetstone", x: 2, y: 7 }, { uid: 23, def: "whetstone", x: 7, y: 7 }, { uid: 24, def: "whetstone", x: 6, y: 4 }, { uid: 25, def: "whetstone", x: 3, y: 4 }])],
  ["edges", () => furnace(Array.from({ length: 10 }, (_, i) => ({ uid: 30 + i, def: "whetstone", x: i, y: i % 2 === 0 ? 0 : 9 })).filter((p) => p.x !== 4))],
];

/** A hand-made build layout (the editor's tests' host): the deck at (0, 0) on `facing`, 12 px a cell, no zoom. */
const layout = (facing: Facing) => ({ frame: deckFrame(facing, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } }) as unknown as BuildLayout;

const carry = (def: string, rot: number, touch: boolean): Carry => ({ src: { from: "cargo", uid: 50 }, def, uid: 50, rot, manual: true, ...(touch ? { touch: true } : {}) });

/** Run fn with the shipped switches (SHAPES and SHAPES2 on). */
const shipped = <T>(fn: () => T): T => withShapes2(() => withShapes(fn));

describe("PRESENT-1 C: a finger on the deck lifts a shaped piece onto the deck, never off it", () => {
  const FACINGS: Facing[] = [0, 1, 2, 3];

  it("SPIKE RAIL (3 cells, rot 0), the finger on the deck's top row: it was refused with no word (the anchor off the deck), now it lands on row 0", () => {
    shipped(() => {
      const L = layout(0), run = furnace();
      const lift = fingerLift(L, "spikerail", 0);
      expect(lift).toBe(36); // fingerLift: (tall / 2 + 1.5) cells = (3 / 2 + 1.5) x 12 px, three cells above the finger
      // a column where a SPIKE RAIL (cells (c, 0)-(c, 2)) may stand at the top: not the belt's (4), no turret intake in row 0
      const col = [0, 1, 2, 3, 5, 6, 7, 8, 9].find((c) => canPlaceItem(run.build, "spikerail", c, 0, -1, 0).ok)!;
      expect(col).toBeDefined();
      const fx = col * 12 + 6, fy = 6; // that column, the top row's middle
      // before: dropAnchor (no clamp) at the lifted point is off the deck
      expect(dropAnchor(L, fx, fy - lift, "spikerail", 0)).toBeNull();
      // after: the finger is over the deck, the anchor is clamped on it: the box's top at row 0, its column the finger's
      const tg = carryTarget(L, run.build, carry("spikerail", 0, true), fx, fy);
      expect(tg).toMatchObject({ x: col, y: 0, rot: 0, ok: true });
      // the mouse's drop is as it was (the box centred under the pointer: row 1 is its middle, so its top is row 0 as well)
      expect(carryTarget(L, run.build, carry("spikerail", 0, false), fx, 18)).toMatchObject({ x: col, y: 0, ok: true });
      // and a finger above the deck is off it: no clamp
      expect(carryTarget(L, run.build, carry("spikerail", 0, true), fx, -40)).toBeNull();
      expect(overDeck(L, fx, fy)).toBe(true);
      expect(overDeck(L, fx, -40)).toBe(false);
    });
  });

  it("every shaped piece, every turn, every facing, the finger on every cell of the deck: the drop lands on the deck, and is refused only where no legal anchor is within the clamp and the snap", () => {
    shipped(() => {
      const defs = Object.keys(ITEMS).filter(shapedPiece);
      expect(defs.length).toBeGreaterThan(8);
      let n = 0, nullBefore = 0, nullAfter = 0, unchanged = 0, landed = 0, refused = 0;
      const why: Record<string, Record<string, number>> = {};
      const refusedBefore: Record<string, number> = {};
      for (const [bname, mk] of BUILDS) {
        for (const facing of FACINGS) {
          const L = layout(facing);
          const deck = screenRect(L, { x: 0, y: 0, w: DECK, h: DECK });
          for (const def of defs) {
            const { w: bw0 } = footBox(ITEMS[def], 0);
            expect(bw0).toBeGreaterThan(0);
            for (let rot = 0; rot < turnsOf(def); rot++) {
              const { w, h } = footBox(ITEMS[def], rot);
              const run = mk();
              const lift = fingerLift(L, def, rot);
              for (let j = 0; j < GRID; j++) {
                for (let i = 0; i < GRID; i++) {
                  const fx = deck.x + (i + 0.5) * (DECK / GRID), fy = deck.y + (j + 0.5) * (DECK / GRID);
                  expect(overDeck(L, fx, fy)).toBe(true);
                  n++;
                  // before (0.9.14): the lifted anchor, unclamped: null off the deck (a refusal with no word)
                  const old = dropAnchor(L, fx, fy - lift, def, rot);
                  if (old === null) { nullBefore++; refusedBefore[def] = (refusedBefore[def] ?? 0) + 1; }
                  const tg = carryTarget(L, run.build, carry(def, rot, true), fx, fy);
                  // after: never null with the finger on the deck, the whole footprint on the deck on both axes
                  expect(tg, `${bname} f${facing} ${def} rot ${rot} finger (${i},${j})`).not.toBeNull();
                  if (!tg) { nullAfter++; continue; }
                  expect(tg.x).toBeGreaterThanOrEqual(0);
                  expect(tg.y).toBeGreaterThanOrEqual(0);
                  expect(tg.x + w).toBeLessThanOrEqual(GRID);
                  expect(tg.y + h).toBeLessThanOrEqual(GRID);
                  // a lift that was on the deck is today's: the same anchor and snap as before
                  const clamped = dropAnchor(L, fx, fy - lift, def, rot, true)!;
                  if (old) {
                    expect(clamped).toEqual(old);
                    const snap = snapAnchor(run.build, def, old.x, old.y, rot);
                    expect({ x: tg.x, y: tg.y }).toEqual(snap ?? old);
                    unchanged++;
                  }
                  // the clamp and the snap: legal wherever one anchor of the clamped anchor's 3 x 3 neighbourhood is, refused only where none is
                  const near: [number, number][] = [];
                  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push([clamped.x + dx, clamped.y + dy]);
                  const legal = near.filter(([x, y]) => canPlaceItem(run.build, def, x, y, -1, rot).ok);
                  if (tg.ok) {
                    landed++;
                    expect(canPlaceItem(run.build, def, tg.x, tg.y, -1, rot).ok).toBe(true);
                    expect(legal.some(([x, y]) => x === tg.x && y === tg.y), "lands within the clamp's neighbourhood").toBe(true);
                  } else {
                    refused++;
                    expect(legal, `${bname} f${facing} ${def} rot ${rot} (${i},${j}): refused with a legal anchor within reach`).toEqual([]);
                    expect(tg.reason, "a refusal says why").toBeTruthy();
                    (why[def] ??= {})[tg.reason!] = ((why[def] ??= {})[tg.reason!] ?? 0) + 1;
                  }
                }
              }
            }
          }
        }
      }
      // the counts (3 builds x 4 facings x every shaped piece's turns x 100 finger cells); the refusals with no word before and after
      // eslint-disable-next-line no-console
      console.log(`PRESENT-1 C sweep: ${n} carries; refused with no word (null) before ${nullBefore}, after ${nullAfter}; unchanged mid-deck ${unchanged}; landed ${landed}; refused with a reason after ${refused}; no word before by piece ${JSON.stringify(refusedBefore)}; reasons ${JSON.stringify(why)}`);
      expect(nullAfter).toBe(0);
      expect(nullBefore).toBeGreaterThan(0);
      expect(landed + refused).toBe(n);
      expect(unchanged).toBe(n - nullBefore);
    });
  });

  it("a mouse's carry and a finger off the deck are as before: no clamp (a finger below the deck still reaches the deck through its lift, as today)", () => {
    shipped(() => {
      for (const facing of FACINGS) {
        const L = layout(facing), run = furnace();
        const deck = screenRect(L, { x: 0, y: 0, w: DECK, h: DECK });
        for (const def of ["spikerail", "nailstrip"]) {
          for (const rot of [0, 1]) {
            const lift = fingerLift(L, def, rot);
            for (const [px, py] of [[deck.x + 60, deck.y - 40], [deck.x + 60, deck.y + DECK + 40], [deck.x - 40, deck.y + 60], [deck.x + DECK + 40, deck.y + 60]] as const) {
              expect(overDeck(L, px, py)).toBe(false);
              // a mouse: no lift, the box is centred under the pointer: off the deck (40 px beyond an edge: the 8 px slack and half a long piece's box are less) is null
              expect(carryTarget(L, run.build, carry(def, rot, false), px, py), `mouse ${def} ${rot} at ${px},${py}`).toBeNull();
              // a finger off the deck: today's rule exactly (the lifted anchor unclamped: null off the deck, else its snap)
              const old = dropAnchor(L, px, py - lift, def, rot);
              const tg = carryTarget(L, run.build, carry(def, rot, true), px, py);
              if (old === null) expect(tg, `finger ${def} ${rot} at ${px},${py} (off the deck)`).toBeNull();
              else expect({ x: tg!.x, y: tg!.y }, `finger ${def} ${rot} at ${px},${py}`).toEqual(snapAnchor(run.build, def, old.x, old.y, rot) ?? old);
            }
            // a mouse over the deck: the anchor under the pointer, as dropAnchor says
            for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
              const fx = deck.x + (i + 0.5) * 12, fy = deck.y + (j + 0.5) * 12;
              const tg = carryTarget(L, run.build, carry(def, rot, false), fx, fy)!;
              const a = dropAnchor(L, fx, fy, def, rot)!;
              expect({ x: tg.x, y: tg.y }).toEqual(a);
            }
          }
        }
      }
    });
  });
});
