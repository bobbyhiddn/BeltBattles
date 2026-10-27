// PRESENT-2 G (REQ-BFG-057; backlog #492 (1); PRESENT-1 Question 4 (b), the lead's answer YES): every finger carry onto the deck's top rows lands.
// PRESENT-1 C clamped a finger's lifted point onto the deck on the SHAPED path only (actions.ts carryTarget: dropAnchor's `clampOut`, tests/present1.carry.test.ts).
// A GATE's path (kind "converter": FUSER, SCATTER MILL, SMELTER) has the same lift (fingerLift: half its height plus 1.5 cells = 2 cells for a 1x1) and had no
// clamp: a finger on the deck's top rows put the lifted point off the deck, dropCell answered null and the drop was refused with no word. Now, while the finger is
// over the deck, the gate's lifted point is clamped onto it (dropCell's `clampOut`), and GATES-1's snap (within 1 cell, split.ts snapSplit) runs on that cell as
// before. Off the deck, for the mouse, and wherever the lifted point was on the deck already, nothing changes (tests/gates1.split.test.ts and
// tests/present1.carry.test.ts stand unchanged).
// The other paths a finger can carry something onto the deck by (edit.ts begin): the editor flags a carry `touch` for a shaped piece (C, above) and a converter (G)
// only; a plain piece (a 1-cell rig, a 2x2 factory) has NO lift (its drop point is the finger's), a belt is drawn at the finger's own cell (edit.ts extendTo),
// a core, gear or turret goes to a turret slot (turretAt), a supply is bought over the hull, and a touch TAP never places (edit.ts tap: "tap-to-place is the
// mouse's"). The sweep proves the plain kinds have no silent refusal with the finger on any deck cell (0 before, 0 after: nothing to clamp).
// The sweep: every converter, every facing of the carrier, the finger on every cell of the deck, on four builds (the belts end in the deck's top row; a gate
// stands next to the belt; two belts; the crowded edges). Counts: the refusals with no word before (the old rule: dropCell null) and after, and the refusals
// with a reason after (no legal tile within the clamp and the snap).
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { GRID, ITEMS } from "../src/sim/content";
import { canPlaceItem, key as K, type Placed } from "../src/sim/deck";
import { withGates } from "../src/sim/gates";
import { splitProblem, snapSplit } from "../src/sim/split";
import { withShapes } from "../src/sim/shapes";
import { withShapes2 } from "../src/sim/shapes2";
import { DECK, frame as deckFrame, type Facing } from "../src/render/frame";
import { carryTarget, dropCell, fingerLift, overDeck, type Carry } from "../src/screens/build/actions";
import { shapedPiece } from "../src/screens/build/shapeEdit";
import { screenRect, type BuildLayout } from "../src/screens/build/layout";

const BELT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const BELT2 = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(6, 0)];

/** FURNACE: the KILN at (4,6) with its belt up column 4 (gates1.split.test.ts's furnace); `items` more parts, `more` more belts. */
function furnace(items: Placed[] = [], more: { factory: number; cells: number[] }[] = []): Run {
  const run = newRun("furnace", 5, "present2-carry");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...BELT] }, ...more], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 0;
  return run;
}
/** The four builds: the starting deck (one belt up column 4, its last tile in row 0); a SMELTER standing on the belt (a neighbour tile is refused);
 *  two belts (columns 4 and 6, both ending in row 0); and the edges crowded (parts along rows 0 and 9, off the belt). */
const BUILDS: [string, () => Run][] = [
  ["start", () => furnace()],
  ["smelter", () => furnace([{ uid: 30, def: "smelter", x: 4, y: 2 }])],
  ["two belts", () => furnace([{ uid: 7, def: "press", x: 6, y: 6 }], [{ factory: 7, cells: [...BELT2] }])],
  ["edges", () => furnace(Array.from({ length: 10 }, (_, i) => ({ uid: 40 + i, def: "whetstone", x: i, y: i % 2 === 0 ? 0 : 9 })).filter((p) => p.x !== 4 && p.x !== 6))],
];

/** A hand-made build layout (the editor's tests' host): the deck at (0, 0) on `facing`, 12 px a cell, no zoom. */
const layout = (facing: Facing) => ({ frame: deckFrame(facing, 0, 0), hull: { x: -30, y: -30, w: 200, h: 200 }, cargo: { x: 0, y: 300, w: 100, h: 20 } }) as unknown as BuildLayout;
const FACINGS: Facing[] = [0, 1, 2, 3];

const cargoCarry = (def: string, touch: boolean): Carry => ({ src: { from: "cargo", uid: 50 }, def, uid: 50, ...(touch ? { touch: true } : {}) });
const deckCarry = (def: string, uid: number, touch: boolean): Carry => ({ src: { from: "deck", uid }, def, uid, ...(touch ? { touch: true } : {}) });

/** Run fn with the shipped switches (GATES, SHAPES and SHAPES2 on). */
const shipped = <T>(fn: () => T): T => withGates(() => withShapes2(() => withShapes(fn)));

describe("PRESENT-2 G: a finger on the deck lifts a gate onto the deck, never off it", () => {
  it("a FUSER, the finger on the deck's top row over the belt: it was refused with no word (the lifted point off the deck), now it lands on the tile below the belt's end", () => {
    shipped(() => {
      const L = layout(0), run = furnace();
      const lift = fingerLift(L, "fuser", 0);
      expect(lift).toBe(24); // fingerLift: (1 / 2 + 1.5) cells x 12 px, two cells above the finger
      const fx = 4 * 12 + 6, fy = 6; // column 4 (the belt's), the top row's middle
      expect(overDeck(L, fx, fy)).toBe(true);
      // before: dropCell (no clamp) at the lifted point is off the deck, so the drop was refused with no word
      expect(dropCell(L, fx, fy - lift, 1)).toBeNull();
      // after: the lifted point is clamped onto the deck (row 0 of column 4: the belt's last tile, refused), the snap finds the tile below it
      expect(carryTarget(L, run.build, cargoCarry("fuser", true), fx, fy)).toMatchObject({ x: 4, y: 1, ok: true });
      // the same finger one row down (row 1): its lifted point is 6 px above the deck, inside dropCell's 8 px slack: today's rule, unchanged
      expect(dropCell(L, fx, 18 - lift, 1)).toEqual({ x: 4, y: 0 });
      expect(carryTarget(L, run.build, cargoCarry("fuser", true), fx, 18)).toMatchObject({ x: 4, y: 1, ok: true });
      // two columns off the belt, on row 0: nothing within the snap's reach, so a refusal WITH its reason
      expect(carryTarget(L, run.build, cargoCarry("fuser", true), 6 * 12 + 6, fy)).toMatchObject({ x: 6, y: 0, ok: false, reason: "DROP IT ON A BELT" });
      // the mouse's drop is as it was: the tile under the pointer (the belt's last tile, refused), no snap, no lift, no clamp
      expect(carryTarget(L, run.build, cargoCarry("fuser", false), fx, fy)).toMatchObject({ x: 4, y: 0, ok: false, reason: "NEEDS BELT ON BOTH SIDES" });
      // and a finger above the deck is off it: no clamp
      expect(carryTarget(L, run.build, cargoCarry("fuser", true), fx, -40)).toBeNull();
      expect(overDeck(L, fx, -40)).toBe(false);
    });
  });

  it("every converter, every facing, the finger on every cell of the deck, on four builds: the drop lands on a tile, and is refused only where no legal tile is within the clamp and the snap", () => {
    shipped(() => {
      const defs = Object.keys(ITEMS).filter((d) => ITEMS[d].kind === "converter");
      expect(defs.sort()).toEqual(["fuser", "scattermill", "smelter"]);
      let n = 0, nullBefore = 0, nullAfter = 0, unchanged = 0, landed = 0, refused = 0, moved = 0, nCentre = 0, nullBeforeCentre = 0;
      const why: Record<string, number> = {};
      const refusedBefore: Record<string, number> = {};
      const rows: Record<number, number> = {};
      const OFFS = [0.1, 0.5, 0.9]; // the finger at three places across and down each cell (a fingertip is not a cell's centre): 900 points a deck
      for (const [bname, mk] of BUILDS) {
        for (const facing of FACINGS) {
          const L = layout(facing);
          const deck = screenRect(L, { x: 0, y: 0, w: DECK, h: DECK });
          for (const def of defs) {
            const run = mk();
            const lift = fingerLift(L, def, 0);
            // the carries: from cargo, and (the SMELTER build) the placed SMELTER lifted off the belt and moved by the finger
            const carries: [string, Carry, number][] = [["cargo", cargoCarry(def, true), -1]];
            if (run.build.items.some((p) => p.uid === 30)) carries.push(["placed", deckCarry("smelter", 30, true), 30]);
            for (const [from, c, ignore] of carries) {
              const cdef = c.def;
              for (let j = 0; j < GRID; j++) {
                for (let i = 0; i < GRID; i++) {
                 for (const oy of OFFS) for (const ox of OFFS) {
                  const fx = deck.x + (i + ox) * (DECK / GRID), fy = deck.y + (j + oy) * (DECK / GRID), centre = ox === 0.5 && oy === 0.5;
                  expect(overDeck(L, fx, fy)).toBe(true);
                  n++;
                  if (centre) nCentre++;
                  // before (0.9.14): the lifted point, unclamped: null off the deck (a refusal with no word)
                  const old = dropCell(L, fx, fy - lift, 1);
                  if (old === null) { nullBefore++; if (centre) nullBeforeCentre++; refusedBefore[`${cdef} ${from}`] = (refusedBefore[`${cdef} ${from}`] ?? 0) + 1; }
                  const tg = carryTarget(L, run.build, c, fx, fy);
                  // after: never null with the finger on the deck
                  expect(tg, `${bname} f${facing} ${cdef} ${from} finger (${i},${j})`).not.toBeNull();
                  if (!tg) { nullAfter++; continue; }
                  expect(tg.x).toBeGreaterThanOrEqual(0);
                  expect(tg.y).toBeGreaterThanOrEqual(0);
                  expect(tg.x).toBeLessThan(GRID);
                  expect(tg.y).toBeLessThan(GRID);
                  const clamped = dropCell(L, fx, fy - lift, 1, true)!;
                  expect(clamped, "the clamp always answers with the finger on the deck").not.toBeNull();
                  if (old) {
                    // a lift that was on the deck is today's: the same cell and the same snap as before
                    expect(clamped).toEqual(old);
                    expect({ x: tg.x, y: tg.y }).toEqual(snapSplit(run.build, cdef, old.x, old.y, ignore) ?? old);
                    unchanged++;
                  } else {
                    // newly reached: the clamped cell, then the snap, as a lift on the deck would run
                    expect({ x: tg.x, y: tg.y }).toEqual(snapSplit(run.build, cdef, clamped.x, clamped.y, ignore) ?? clamped);
                    if (tg.ok) moved++;
                    rows[j] = (rows[j] ?? 0) + 1;
                  }
                  // the clamp and the snap: legal wherever one tile of the clamped cell's 3 x 3 neighbourhood is, refused only where none is
                  const legal: [number, number][] = [];
                  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const x = clamped.x + dx, y = clamped.y + dy;
                    if (x >= 0 && y >= 0 && x < GRID && y < GRID && splitProblem(run.build, cdef, y * GRID + x, ignore) === null) legal.push([x, y]);
                  }
                  if (tg.ok) {
                    landed++;
                    expect(canPlaceItem(run.build, cdef, tg.x, tg.y, ignore).ok).toBe(true);
                    expect(legal.some(([x, y]) => x === tg.x && y === tg.y), "lands within the clamp's neighbourhood").toBe(true);
                  } else {
                    refused++;
                    expect(legal, `${bname} f${facing} ${cdef} ${from} (${i},${j}): refused with a legal tile within reach`).toEqual([]);
                    expect(tg.reason, "a refusal says why").toBeTruthy();
                    why[tg.reason!] = (why[tg.reason!] ?? 0) + 1;
                  }
                 }
                }
              }
            }
          }
        }
      }
      // the counts (4 builds x 4 facings x 3 converters (+ the placed SMELTER's move) x 100 finger cells x 9 places in a cell); the refusals with no word before and after
      // eslint-disable-next-line no-console
      console.log(`PRESENT-2 G sweep: ${n} carries (${nCentre} at the cell centres); refused with no word (null) before ${nullBefore} (${nullBeforeCentre} at the centres), after ${nullAfter}; unchanged where the lift was on the deck ${unchanged}; newly reached ${n - unchanged} (landed ${moved}); landed ${landed}; refused with a reason after ${refused}; no word before by piece ${JSON.stringify(refusedBefore)}; reasons ${JSON.stringify(why)}; newly reached by finger row ${JSON.stringify(rows)}`);
      expect(nullAfter).toBe(0);
      expect(nullBefore).toBeGreaterThan(0);
      expect(landed + refused).toBe(n);
      expect(unchanged).toBe(n - nullBefore);
    });
  });

  it("a mouse's carry and a finger off the deck are as before: no clamp", () => {
    shipped(() => {
      for (const facing of FACINGS) {
        const L = layout(facing), run = furnace();
        const deck = screenRect(L, { x: 0, y: 0, w: DECK, h: DECK });
        const lift = fingerLift(L, "fuser", 0);
        for (const [px, py] of [[deck.x + 60, deck.y - 40], [deck.x + 60, deck.y + DECK + 40], [deck.x - 40, deck.y + 60], [deck.x + DECK + 40, deck.y + 60]] as const) {
          expect(overDeck(L, px, py)).toBe(false);
          // a mouse: no lift, the cell under the pointer: off the deck (40 px beyond an edge, past the 8 px slack) is null
          expect(carryTarget(L, run.build, cargoCarry("fuser", false), px, py), `mouse at ${px},${py}`).toBeNull();
          // a finger off the deck: today's rule exactly (the lifted point unclamped: null off the deck, else the cell and its snap)
          const old = dropCell(L, px, py - lift, 1);
          const tg = carryTarget(L, run.build, cargoCarry("fuser", true), px, py);
          if (old === null) expect(tg, `finger at ${px},${py} (off the deck)`).toBeNull();
          else expect({ x: tg!.x, y: tg!.y }, `finger at ${px},${py}`).toEqual(snapSplit(run.build, "fuser", old.x, old.y) ?? old);
        }
        // a mouse over the deck: the cell under the pointer, as dropCell says
        for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
          const fx = deck.x + (i + 0.5) * 12, fy = deck.y + (j + 0.5) * 12;
          const tg = carryTarget(L, run.build, cargoCarry("fuser", false), fx, fy)!;
          expect({ x: tg.x, y: tg.y }).toEqual(dropCell(L, fx, fy, 1));
        }
      }
    });
  });

  it("the other kinds a finger carries onto the deck have no silent refusal: a plain piece (a 1-cell rig, a 2x2 factory) has no lift, so with the finger on any deck cell it is never refused with no word", () => {
    shipped(() => {
      const defs = Object.keys(ITEMS).filter((d) => (ITEMS[d].kind === "gate" || ITEMS[d].kind === "factory") && !shapedPiece(d));
      expect(defs.length).toBeGreaterThan(10);
      let n = 0, nullAfter = 0, landed = 0, refused = 0;
      for (const [bname, mk] of BUILDS) {
        for (const facing of FACINGS) {
          const L = layout(facing);
          const deck = screenRect(L, { x: 0, y: 0, w: DECK, h: DECK });
          for (const def of defs) {
            const run = mk();
            for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
              const fx = deck.x + (i + 0.5) * (DECK / GRID), fy = deck.y + (j + 0.5) * (DECK / GRID);
              n++;
              // the editor's flag for a plain piece: none (edit.ts begin's touch(): shapedPiece or converter only); a touch flag on one changes nothing
              const a = carryTarget(L, run.build, cargoCarry(def, false), fx, fy);
              const b = carryTarget(L, run.build, cargoCarry(def, true), fx, fy);
              expect(a, `${bname} f${facing} ${def} finger (${i},${j})`).not.toBeNull();
              expect(b).toEqual(a);
              if (!a) { nullAfter++; continue; }
              if (a.ok) landed++;
              else { refused++; expect(a.reason, "a refusal says why").toBeTruthy(); }
            }
          }
        }
      }
      // eslint-disable-next-line no-console
      console.log(`PRESENT-2 G plain pieces: ${defs.length} kinds, ${n} carries; refused with no word (null) before 0, after ${nullAfter}; landed ${landed}; refused with a reason ${refused}`);
      expect(nullAfter).toBe(0);
      expect(landed + refused).toBe(n);
    });
  });
});
