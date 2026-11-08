// PRESENT-3 R (a) (REQ-BFG-087, REQ-BFG-113; backlog #498 (9)): the mark between the part a road card takes and the part it gives reads as one direction.
//  Before: the 3x5 face's `→` (`...|..#|###|..#|...`: 3 px wide, a 2 px shaft and a one-column head) in grey (slate4; dim slate2). PRESENT-2's read N-01: all six readers read takes and gives right and all six
//  called its direction unclear ("it may point left").
//  Now: the 5x7 face's `→` (font.ts F5: `..#..|...#.|#####|...#.|..#..` in rows 1-5: a 5 px shaft, a two-row head) in bone (dim slate3), on the same five rows as the 3x5 text, in the same 7 px slot the line
//  keeps for the arrow (5 px of ink, then the 2 px gap to the next chip: REQ-BFG-087's least gap); the ASH SHRINE's blocked card draws it too (slate3); the own row of a part's name (`→ PICKAXE`) draws the
//  same mark in the row's colour with the name 7 px in, as `→ ` put it. Every other pixel of a card is as it was.
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { C } from "../src/render/palette";
import { ITEMS } from "../src/sim/content";
import { UPGRADE, SWAP_TIER, smugglerPool, type Choice, type Delta } from "../src/game/eventDefs";
import { SHRINE_NO_PART } from "../src/game/shrine";
import { OWN_ROW_DY, chipPlan, exchange, exchangeForm, exchangePlan, exchangeRoom, ghostForm, ghostWidth } from "../src/screens/event/cards";
import { eventLayout } from "../src/screens/event/layout";
import { glyphRows, textWidth } from "../src/render/font";

installRaster();

const ARROW = ["..#..", "...#.", "#####", "...#.", "..#.."];
const VIEWS = [
  { name: "desk 1280x800", W: 640, H: 400, portrait: false }, { name: "narrowest desk", W: 440, H: 250, portrait: false },
  { name: "phone 402x690", W: 201, H: 345, portrait: true }, { name: "narrowest phone", W: 190, H: 330, portrait: true },
];
const item = (def: string): Delta => ({ k: "item", def });
const roadPart = (d: (typeof ITEMS)[string]) => d.kind !== "turret" && d.kind !== "supply" && !!d.merchant;
const parts = Object.values(ITEMS).filter(roadPart).map((d) => d.id);
function choices(): [string, Choice][] {
  const out: [string, Choice][] = [];
  const swap = (cost: string, gain: string): Choice => ({ label: "SWAP", cost: [{ k: "item", def: cost, uid: 1, from: "cargo" }], gain: [item(gain)] });
  for (const a of parts) for (const b of UPGRADE[SWAP_TIER[ITEMS[a].rarity]]) if (a !== b) out.push([`SWAP ${a} -> ${b}`, swap(a, b)]);
  for (const b of parts) out.push([`SALVAGE ${b}`, { label: "SALVAGE", cost: [], gain: [item(b)] }]);
  for (const kind of ["BURN", "SHOCK"] as const) for (const b of smugglerPool(kind)) out.push([`${kind} ${b}`, { label: kind, cost: [{ k: "gold", n: kind === "BURN" ? 2 : 3 }], gain: [item(b)] }]);
  out.push(["SELL", { label: "SELL", cost: [item("pickaxe")], gain: [{ k: "gold", n: 5 }] }], ["PATCH UP", { label: "PATCH UP", cost: [{ k: "gold", n: 4 }], gain: [{ k: "lives", n: 1 }] }]);
  out.push(["BOUNTY", { label: "BOUNTY", cost: [], gain: [{ k: "gold", n: 6 }] }]);
  return out;
}

/** The x (relative to the line's start) where exchange puts the arrow: after what the card takes (or FREE and 4 px). */
function arrowX(c: Choice, room: number): number {
  const form = exchangeForm(c, room), plan = exchangePlan(c, room);
  let x = c.cost.length ? 0 : textWidth("FREE", "3") + 4;
  for (const d of c.cost) x = chipPlan(x, d, true, room, undefined, form === "bare" || plan.costBare, form === "count").next;
  return x;
}
const X0 = 5, CY = 25;

describe("PRESENT-3 R (a): the road card's arrow", () => {
  it("the glyph is the 5x7 face's arrow, five rows of ink (the 3x5 face's arrow was three columns)", () => {
    expect(glyphRows("→", "5")!.join("|")).toBe(`.....|${ARROW.join("|")}|.....`);
    expect(glyphRows("→", "3")!.join("|")).toBe("...|..#|###|..#|..."); // untouched (the text's own arrows)
  });

  it("every road choice x the four views' card widths: the arrow's ink is the 5x5 arrow in bone at the slot after what the card takes, on the 3x5 text's rows, and the 2 px after it are clear", () => {
    const all = choices();
    let n = 0;
    for (const v of VIEWS) {
      const cw = eventLayout(v.W, v.H, v.portrait, 3).cards[0].w;
      for (const [what, c] of all) {
        const room = exchangeRoom(c, cw), cx = X0 + arrowX(c, room);
        for (const dim of [false, true]) {
          if (dim && n % 5) continue;
          const cv = fresh(cw, 50);
          exchange(gOf(cv), X0, CY, room, c, dim);
          const want = dim ? C.slate3 : C.bone;
          for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) expect(cv.at(cx + k, CY - 2 + r), `${what} on ${v.name}${dim ? " dim" : ""}: arrow pixel ${k},${r}`).toBe(ARROW[r][k] === "#" ? want : null);
          // the slot: 7 px, the 5 of ink and 2 clear (the next chip starts after them); no ink above or below the arrow's rows inside the slot
          for (let k = 0; k < 7; k++) for (const r of [-3, -2 - 1, 3, 4, 5].map((q) => CY + q).concat([CY - 4, CY + 4])) if (k < 5 || r !== CY - 2) expect(cv.at(cx + k, r), `${what} on ${v.name}: nothing but the arrow in the slot (${k}, row ${r})`).toBeNull();
          for (const q of [5, 6]) for (let y = CY - 6; y <= CY + 6; y++) expect(cv.at(cx + q, y), `${what} on ${v.name}: the gap after the arrow (${q}, ${y})`).toBeNull();
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(10000);
  });

  it("the ASH SHRINE's blocked card draws the same arrow in slate3 after the would-be cost, and the word B chip 7 px after it", () => {
    const c: Choice = { label: "OFFER A PART", cost: [], gain: [], blocked: SHRINE_NO_PART };
    for (const v of VIEWS) {
      const cw = eventLayout(v.W, v.H, v.portrait, 3).cards[0].w, room = exchangeRoom(c, cw);
      const cv = fresh(cw, 50);
      exchange(gOf(cv), X0, CY, room, c, true, undefined, "temper");
      const cx = X0 + ghostWidth(ghostForm("temper", room, undefined));
      for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) expect(cv.at(cx + k, CY - 2 + r), `${v.name}: arrow pixel ${k},${r}`).toBe(ARROW[r][k] === "#" ? C.slate3 : null);
      for (const q of [5, 6]) for (let y = CY - 6; y <= CY + 6; y++) expect(cv.at(cx + q, y), `${v.name}: the gap after the arrow`).toBeNull();
    }
  });

  it("a part's name on its own row: the same arrow at the card's left, in the row's colour, on the row's five lines, the name from 7 px in", () => {
    let rows = 0;
    for (const v of VIEWS) {
      const cw = eventLayout(v.W, v.H, v.portrait, 3).cards[0].w;
      for (const [what, c] of choices()) {
        const room = exchangeRoom(c, cw), plan = exchangePlan(c, room);
        if (!plan.ownRow.length) continue;
        rows++;
        for (const dim of [false, true]) {
          const cv = fresh(cw, 60);
          exchange(gOf(cv), X0, CY, room, c, dim);
          const col = dim ? C.slate3 : C.lime, top = CY + OWN_ROW_DY;
          for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) expect(cv.at(X0 + k, top + r), `${what} on ${v.name}: own-row arrow pixel ${k},${r}`).toBe(ARROW[r][k] === "#" ? col : null);
          for (let y = top - 1; y <= top + 5; y++) for (const q of [5, 6]) expect(cv.at(X0 + q, y), `${what} on ${v.name}: the gap between the own row's arrow and its name`).toBeNull();
          let first = -1;
          for (let k = 7; k < 40 && first < 0; k++) for (let y = top; y < top + 5; y++) if (cv.at(X0 + k, y) === col) { first = k; break; }
          expect(first, `${what} on ${v.name}: the name starts 7 px in`).toBeGreaterThanOrEqual(7);
        }
      }
    }
    expect(rows).toBe(8); // the narrowest desk: 8 own rows (tests/present2.roadnames.test.ts PINS)
  });
});
