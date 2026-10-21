// PRESENT-2 N (REQ-BFG-113 (1), REQ-BFG-087; backlog #492 (5)): a road card names the part it GIVES, on every view.
// Now: the TRADER's SWAP card (eventDefs.ts partChoice("SWAP", ...), drawn by event/cards.ts) takes a SPIKE RAIL and gives a PICKAXE; on the desk (1280x800: a 152 px card)
// PRESENT-1's S1 plates (a shaped part's grid at the card's right end, one for every shaped part it takes or gives) took 15-40 px of the 142 px line, and chip's own rule
// (the 0.6.1c comment: a part whose name does not fit shows its icon alone) left the PICKAXE without its name. The card's rule is that it never hides a gain. Now the parts the card
// TAKES go to icons alone first (the cost may stay an icon), and a gain's name that fits no line beside the plates goes on a row of its own under the line (cards.ts exchangePlan).
// The sweep: every road choice that gives a part (the TRADER's SWAP for every part a good of each rarity can be swapped for, SALVAGE's and the SMUGGLER's parts), on the card widths of
// the four views the text sheet prints (desk 1280x800, narrowest desk, phone 402x690, narrowest phone): before (chip's rule alone) the gain's name lost; after every gain named, on its line
// or on its own row; the cards that already named their gain are drawn exactly as before.
import { describe, expect, it, vi } from "vitest";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { ITEMS } from "../src/sim/content";
import { UPGRADE, SWAP_TIER, smugglerPool, type Choice, type Delta } from "../src/game/eventDefs";
import { OWN_ROW_DY, chipPlan, exchange, exchangeForm, exchangePlan, exchangeRoom, itemName, plateWidth } from "../src/screens/event/cards";
import { eventLayout } from "../src/screens/event/layout";
import { textWidth } from "../src/render/font";
import { GAP_MIN } from "../src/ui/spacing";

const drawn: string[] = [];
vi.mock("../src/render/font", async (orig) => {
  const m = await orig<typeof import("../src/render/font")>();
  return { ...m, drawText: (...a: Parameters<typeof m.drawText>) => { drawn.push(String(a[1])); return m.drawText(...a); } };
});

installRaster();

const VIEWS = [
  { name: "desk 1280x800", W: 640, H: 400, portrait: false }, { name: "narrowest desk", W: 440, H: 250, portrait: false },
  { name: "phone 402x690", W: 201, H: 345, portrait: true }, { name: "narrowest phone", W: 190, H: 330, portrait: true },
];
const roadPart = (d: (typeof ITEMS)[string]) => d.kind !== "turret" && d.kind !== "supply" && !!d.merchant;
const parts = Object.values(ITEMS).filter(roadPart).map((d) => d.id);
const item = (def: string): Delta => ({ k: "item", def });
const swap = (cost: string, gain: string): Choice => ({ label: "SWAP", cost: [{ k: "item", def: cost, uid: 1, from: "cargo" }], gain: [item(gain)] });
const salvage = (gain: string): Choice => ({ label: "SALVAGE", cost: [], gain: [item(gain)] });
const smuggle = (gold: number, gain: string): Choice => ({ label: "BURN", cost: [{ k: "gold", n: gold }], gain: [item(gain)] });

/** The counts of the sweep below per view: [choices, named before, lost its name before, fixed by the cost as an icon alone, fixed by an own row]. */
const PINS: Record<string, number[]> = {
  "desk 1280x800": [2652, 2088, 564, 564, 0], "narrowest desk": [2652, 1371, 1281, 1273, 8], "phone 402x690": [2652, 2643, 9, 9, 0], "narrowest phone": [2652, 2619, 33, 33, 0],
};

/** every road choice that gives a part: [what, the choice] */
function choices(): [string, Choice][] {
  const out: [string, Choice][] = [];
  for (const a of parts) for (const b of UPGRADE[SWAP_TIER[ITEMS[a].rarity]]) if (a !== b) out.push([`SWAP ${a} -> ${b}`, swap(a, b)]);
  for (const b of parts) out.push([`SALVAGE ${b}`, salvage(b)]);
  for (const kind of ["BURN", "SHOCK"] as const) for (const b of smugglerPool(kind)) out.push([`${kind} ${b}`, smuggle(kind === "BURN" ? 2 : 3, b)]);
  return out;
}

/** the line as exchange draws it with `plan`: each chip's text ("" a part's icon alone), shown or not; the gain items must be named on it, or on the own row */
function chips(c: Choice, room: number, plan: ReturnType<typeof exchangePlan>) {
  let x = c.cost.length ? 0 : textWidth("FREE", "3") + 4; // a card that takes nothing starts with the word FREE and 4 px
  const out: { cost: boolean; d: Delta; text: string; shown: boolean }[] = [];
  for (const d of c.cost) { const p = chipPlan(x, d, true, room, undefined, plan.costBare, false); out.push({ cost: true, d, text: p.text, shown: p.shown }); x = p.next; }
  x += 7;
  for (const d of c.gain) { const p = chipPlan(x, d, false, room, undefined, plan.ownRow.length > 0, false); out.push({ cost: false, d, text: p.text, shown: p.shown }); x = p.next; }
  return out;
}
/** chip's rule alone, as the card drew it before this change: is every gain part named on the line? */
function namedBefore(c: Choice, room: number): boolean {
  let x = c.cost.length ? 0 : textWidth("FREE", "3") + 4;
  for (const d of c.cost) x = chipPlan(x, d, true, room, undefined, false, false).next;
  x += 7;
  for (const d of c.gain) { const p = chipPlan(x, d, false, room, undefined, false, false); if (d.k === "item" && !(p.shown && p.text)) return false; x = p.next; }
  return true;
}

describe("PRESENT-2 N: a road card names the part it gives", () => {
  it("the TRADER's SWAP card, a SPIKE RAIL for a PICKAXE: before, the desk's line gave the PICKAXE no name; now every view names it", () => {
    const c = swap("spikerail", "pickaxe");
    const rows: string[] = [];
    for (const v of VIEWS) {
      const cw = eventLayout(v.W, v.H, v.portrait, 3).cards[0].w, room = exchangeRoom(c, cw);
      const before = namedBefore(c, room), plan = exchangePlan(c, room);
      rows.push(`${v.name}: card ${cw}, plates ${plateWidth(c)}, line room ${room}: named before ${before}; cost as an icon ${plan.costBare}; own row ${JSON.stringify(plan.ownRow)}`);
      // after: the gain's name is on the line or on its own row
      const gain = chips(c, room, plan).find((q) => !q.cost)!;
      expect(gain.shown && gain.text === itemName("pickaxe") || plan.ownRow.includes(itemName("pickaxe")), `${v.name}: the PICKAXE is named`).toBe(true);
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-2 N SWAP SPIKE RAIL -> PICKAXE:\n${rows.join("\n")}`);
  });

  it("every road choice that gives a part, on the four views' card widths: the gain is named (on its line, or on a row of its own); a card that named it before is drawn as before", () => {
    const all = choices();
    expect(all.length).toBeGreaterThan(2000);
    const per: string[] = [];
    for (const v of VIEWS) {
      const L = eventLayout(v.W, v.H, v.portrait, 3), cw = L.cards[0].w, ch = L.cards[0].h;
      let n = 0, namedAsBefore = 0, costIcon = 0, ownRow = 0, lostBefore = 0, unnamed = 0, notShown = 0;
      const rows: string[] = [];
      for (const [what, c] of all) {
        const room = exchangeRoom(c, cw), plan = exchangePlan(c, room), before = namedBefore(c, room);
        n++;
        if (!before) lostBefore++;
        if (before) {
          expect(plan, `${what} on ${v.name}: named before, so drawn as before`).toEqual({ costBare: false, ownRow: [] });
          namedAsBefore++;
          continue;
        }
        if (plan.costBare && !plan.ownRow.length) costIcon++;
        if (plan.ownRow.length) { ownRow++; rows.push(`${what}: own row \`→ ${plan.ownRow.join(", ")}\` (${textWidth(`→ ${plan.ownRow.join(", ")}`, "3")} of ${cw - 10} px)`); }
        // every gain part: named on the line, or on the own row
        for (const g of chips(c, room, plan).filter((q) => !q.cost && q.d.k === "item")) {
          const def = (g.d as Extract<Delta, { k: "item" }>).def;
          const ok = (g.shown && g.text === itemName(def)) || plan.ownRow.includes(itemName(def));
          if (!ok) { unnamed++; if (rows.length < 6) rows.push(`UNNAMED ${what} room ${room}: gain chip shown ${g.shown} text ${JSON.stringify(g.text)}; plan ${JSON.stringify(plan)}`); }
          if (!g.shown) notShown++;
          if (plan.ownRow.length) {
            // the own row: whole in the card, and the card has the room for it under the line (the 5 px row 9 px under the line's middle, clear of the note 16 px under it)
            expect(textWidth(`→ ${plan.ownRow.join(", ")}`, "3"), `${what} on ${v.name}: the own row fits the card`).toBeLessThanOrEqual(cw - 10);
            // the row is 3x5 at the line's middle (25 px down) + OWN_ROW_DY; the note's row starts 9 px up from the card's foot: REQ-BFG-087's least gap between them (GAP_MIN, 2 px)
            expect(ch - 9 - (25 + OWN_ROW_DY + 5), `${what} on ${v.name}: the own row keeps GAP_MIN clear of the note's row (card ${ch} tall)`).toBeGreaterThanOrEqual(GAP_MIN["3"]);
          }
        }
      }
      per.push(`${v.name} (card ${cw} x ${ch}): ${n} choices; named before ${namedAsBefore}, the gain lost its name before ${lostBefore}; fixed by the cost as an icon ${costIcon}, by an own row ${ownRow}; still unnamed ${unnamed} (not drawn ${notShown})${rows.length ? `; own rows: ${rows.slice(0, 12).join("; ")}` : ""}`);
      expect(unnamed, `${v.name}: every gain named: ${rows.slice(0, 6).join(" | ")}`).toBe(0);
      // the pins: [choices, named before, lost its name before, fixed by the cost as an icon, fixed by an own row] (the phones need no own row: their cards have no room under the line)
      expect([n, namedAsBefore, lostBefore, costIcon, ownRow], v.name).toEqual(PINS[v.name]);
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-2 N sweep:\n${per.join("\n")}`);
  });

  it("what exchange draws is what the plan says: the drawn text names the gain (the PRESENT-1 example on every view; the worst long names)", () => {
    const cases: [string, Choice][] = [["SPIKE RAIL -> PICKAXE", swap("spikerail", "pickaxe")], ["PICKAXE -> FROSTBITE FOUNDRY", swap("pickaxe", "frostbite")], ["ASSEMBLY -> FROSTBITE FOUNDRY", swap("assembly", "frostbite")], ["SALVAGE DRAG CHAIN FOUNDRY", salvage("dragchain")]];
    for (const v of VIEWS) {
      const cw = eventLayout(v.W, v.H, v.portrait, 3).cards[0].w;
      for (const [what, c] of cases) {
        if (!ITEMS[(c.gain[0] as Extract<Delta, { k: "item" }>).def] || (c.cost[0] && !ITEMS[(c.cost[0] as Extract<Delta, { k: "item" }>).def])) continue;
        const room = exchangeRoom(c, cw);
        drawn.length = 0;
        exchange(gOf(fresh(cw, 50)), 5, 25, room, c, false);
        const gain = itemName((c.gain[0] as Extract<Delta, { k: "item" }>).def);
        expect(drawn.some((t) => t === gain || t === `→ ${gain}`), `${what} on ${v.name}: the drawn texts ${JSON.stringify(drawn)} name ${gain}`).toBe(true);
      }
    }
  });

  it("a card that gives no part, a word card and the shrine's cards keep their form: no plan", () => {
    for (const c of [{ label: "SELL", cost: [item("pickaxe")], gain: [{ k: "gold", n: 5 }] }, { label: "PATCH UP", cost: [{ k: "gold", n: 4 }], gain: [{ k: "lives", n: 1 }] },
      { label: "OFFER A PART", cost: [item("pickaxe")], gain: [{ k: "ench", word: "temper" }] }] as Choice[]) {
      for (const v of VIEWS) expect(exchangePlan(c, exchangeRoom(c, eventLayout(v.W, v.H, v.portrait, 3).cards[0].w))).toEqual({ costBare: false, ownRow: [] });
    }
    expect(exchangeForm({ label: "OFFER A PART", cost: [item("pickaxe")], gain: [{ k: "ench", word: "temper" }] }, 142)).not.toBeNull();
  });
});
