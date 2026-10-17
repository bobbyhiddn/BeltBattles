// GATES-1 (REQ-BFG-052, REQ-BFG-089, REQ-BFG-087; BRIEF-GATES1 G4; step 5): the three gates' faces, panels and NOTES.
// - the face: a stat row (`{SLUG}2>1 {DMG}+50% 1{SEC}`; `{SLUG}1>3 1{SEC}`; `{BURN}+3 1{SEC}`) and the gate's own line, always on
//   it, at every star; SMELTER's BURN reminder; NEXT★ and the ⓘ ladder read the same numbers;
// - the type line (`RARE GATE`, `COMMON GATE`) on the offer, cargo and placed panels; the place hint says where a gate goes;
// - the default rules text sits behind the hover or tap, in NOTES (`A GATE: DROP IT ON A BELT. THE BELT SPLITS AROUND IT.`,
//   `EACH SLUG WAITS 1 SEC INSIDE IT.`, and for the FUSER `RIGS BEFORE IT COUNT TWICE. RIGS AFTER IT COUNT ONCE.`), not on the
//   face; every hint a panel draws is in the tips table;
// - the placed gate's own panel (not a rig's, not a factory's): GATE · BELT 1, TO CARGO (and SELL on touch), no ROTATE;
// - with GATES off nothing of this exists.
import { afterEach, describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { ITEMS, sellValue } from "../src/sim/content";
import { key as K, type Placed } from "../src/sim/deck";
import { GATES, GATES_IDS, setGates, withGates } from "../src/sim/gates";
import { icons, textWidth, wrap } from "../src/render/font";
import { statRow } from "../src/ui/icons";
import { GATE_RULE, FUSER_ORDER, REMINDER, converterStats, faceAt, faceDiff, faceLines, faceNext, gateNotes, gateWait, hasFace } from "../src/ui/faces";
import { TIPS } from "../src/ui/tips";
import { describe as kindLine, panelKind } from "../src/screens/build/shop";
import { GATE_DRAG, GATE_MOVE, GATE_TAP, cargoPanel, explainPanel, gatePanel, itemPanel, offerPanel, rigPanel } from "../src/screens/build/inspector";

afterEach(() => setGates(GATES));

const BELT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
function run(items: Placed[] = [], cargo: string[] = []): Run {
  const r = newRun("furnace", 5, "gates1faces");
  r.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...BELT] }], mods: [], beltCap: 40, hullBonus: 0 };
  r.inventory = cargo.map((def, i) => ({ uid: 50 + i, def }));
  return r;
}
const on = <T,>(fn: () => T): T => withGates(fn);
const hintsOf = (): string[] => TIPS.flatMap((t) => t.hints);

describe("GATES-1 G4: the face", () => {
  it("the stat row and the own line at ★1, ★2 and ★3 (the brief's table)", () => {
    on(() => {
      const rows = (id: string) => [1, 2, 3].map((s) => faceLines(id, s)!.stats);
      expect(rows("fuser")).toEqual([
        statRow([["SLUG", "2>1"], ["DMG", "+50%"], ["SEC", "1"]]), statRow([["SLUG", "2>1"], ["DMG", "+75%"], ["SEC", "1"]]), statRow([["SLUG", "2>1"], ["DMG", "+100%"], ["SEC", "1"]]),
      ]);
      expect(rows("scattermill")).toEqual([1, 2, 3].map((s) => statRow([["SLUG", s === 3 ? "1>4" : "1>3"], ["SEC", "1"]])));
      expect(rows("smelter")).toEqual([3, 5, 8].map((n) => statRow([["BURN", `+${n}`], ["SEC", "1"]])));
      const line = (id: string, s: number) => faceLines(id, s)!.rules.map((r) => r.text);
      expect([1, 2, 3].map((s) => line("fuser", s))).toEqual([50, 75, 100].map((n) => [icons(`2 SLUGS IN, 1 OUT: IT DEALS BOTH, +${n}%.`)]));
      expect([1, 2, 3].map((s) => line("scattermill", s))).toEqual([
        [icons("1 SLUG IN, 3 OUT, EACH AT HALF {DMG}.")], [icons("1 SLUG IN, 3 OUT, EACH AT 60% {DMG}.")], [icons("1 SLUG IN, 4 OUT, EACH AT HALF {DMG}.")],
      ]);
      expect([1, 2, 3].map((s) => line("smelter", s))).toEqual([3, 5, 8].map((n) => [icons(`THE {SLUG} GAINS +${n} {*BURN}.`)]));
      // the stat row is the data function's; a row holds at most three pairs
      for (const id of GATES_IDS) expect(converterStats(id).length).toBeLessThanOrEqual(3);
      expect(converterStats("scattermill", 1)).toEqual([["SLUG", "1>3"], ["SEC", "1"]]);
    });
  });

  it("SMELTER names BURN with its reminder; the other two name no keyword; no face has a label", () => {
    on(() => {
      expect(faceLines("smelter")!.reminders).toEqual([icons(REMINDER.BURN())]);
      expect(faceLines("fuser")!.reminders).toEqual([]);
      expect(faceLines("scattermill")!.reminders).toEqual([]);
      for (const id of GATES_IDS) expect(faceLines(id)!.rules.every((r) => r.label === undefined), id).toBe(true);
    });
  });

  it("NEXT★ and the ⓘ ladder read the same numbers: FUSER +75%, then +100%; SCATTER MILL 60%, then 4 pellets at HALF; SMELTER +5, then +8", () => {
    on(() => {
      expect(faceNext("fuser", 1)!.text).toBe(`NEXT ★2: ${faceDiff("fuser", 1, 2)}`);
      expect(faceDiff("fuser", 1, 2)).toBe(statRow([["DMG", "+75%"]])); // the stat row's number once, not the rule's again
      expect(faceDiff("fuser", 2, 3)).toBe(statRow([["DMG", "+100%"]]));
      expect(faceDiff("smelter", 1, 2)).toBe(statRow([["BURN", "+5"]]));
      expect(faceDiff("smelter", 2, 3)).toBe(statRow([["BURN", "+8"]]));
      expect(faceDiff("scattermill", 1, 2)).toBe("60%"); // the share, the rule's own number
      expect(faceDiff("scattermill", 2, 3)).toBe(`${statRow([["SLUG", "1>4"]])}, 50%`); // four pellets, the share back to half
      expect(faceNext("fuser", 3)).toBeNull();
    });
  });

  it("with GATES off there is no face to ask for; with it on, hasFace and faceAt know the three", () => {
    for (const id of GATES_IDS) expect(hasFace(id), id).toBe(false);
    on(() => { for (const id of GATES_IDS) { expect(hasFace(id), id).toBe(true); expect(faceAt(id, 1)!.stats.length, id).toBeGreaterThan(0); } });
    expect(gateNotes("fuser")).toEqual([]);
  });

  it("every line wraps to at most three lines at the narrowest desk column (102 px of the 5x7 face) and two on the op band (225 px); the stat rows fit the band", () => {
    on(() => {
      for (const id of GATES_IDS) for (const s of [1, 2, 3]) {
        const fl = faceLines(id, s)!;
        for (const r of fl.rules) {
          expect(wrap(r.text, 102, "5").length, `${id} ★${s} desk`).toBeLessThanOrEqual(3);
          expect(wrap(r.text, 225, "5").length, `${id} ★${s} op band`).toBeLessThanOrEqual(2);
        }
        expect(textWidth(fl.stats!, "5"), `${id} ★${s} stat row`).toBeLessThanOrEqual(225);
      }
    });
  });
});

describe("GATES-1 G4: NOTES, the type line and the panels", () => {
  it("gateNotes: the gate rule, the wait, and for the FUSER its order; the words are the brief's", () => {
    on(() => {
      expect(GATE_RULE).toBe("A GATE: DROP IT ON A BELT. THE BELT SPLITS AROUND IT.");
      expect(gateWait(1)).toBe("EACH SLUG WAITS 1 SEC INSIDE IT.");
      expect(FUSER_ORDER).toBe("RIGS BEFORE IT COUNT TWICE. RIGS AFTER IT COUNT ONCE.");
      expect(gateNotes("fuser")).toEqual([GATE_RULE, gateWait(1), FUSER_ORDER]);
      expect(gateNotes("scattermill")).toEqual([GATE_RULE, gateWait(1)]);
      expect(gateNotes("smelter")).toEqual([GATE_RULE, gateWait(1)]);
      expect(gateNotes("whetstone")).toEqual([]);
    });
  });

  it("the type line: RARE GATE, COMMON GATE, RARE GATE (as rigs read COMMON RIG)", () => {
    on(() => {
      expect(["fuser", "scattermill", "smelter"].map((id) => kindLine(ITEMS[id]))).toEqual(["RARE GATE", "COMMON GATE", "RARE GATE"]);
      expect(panelKind(ITEMS.fuser)).toBe("RARE GATE");
      const r = run([], ["fuser"]);
      expect(cargoPanel(r, 50)!.sub).toBe("RARE GATE · IN CARGO");
    });
  });

  it("the default rules text is behind the hover or tap: the face (body) holds the own line and not the NOTES; the NOTES hold all three sentences", () => {
    on(() => {
      const r = run([{ uid: 30, def: "fuser", x: 4, y: 3 }]);
      const raw = gatePanel(r, 30)!;
      const t = explainPanel(raw, "fuser");
      const drawn = t.body.map((b) => b.text);
      expect(drawn).toContain(icons("2 SLUGS IN, 1 OUT: IT DEALS BOTH, +50%.")); // always visible
      for (const n of [GATE_RULE, gateWait(1), FUSER_ORDER]) {
        expect(drawn, n).not.toContain(n);
        expect(t.notes!.map((b) => b.text), n).toContain(n);
      }
      // the SMELTER: its own line, and a BURN reminder that is a KEYWORD, not a NOTE
      const s = explainPanel(gatePanel(run([{ uid: 31, def: "smelter", x: 4, y: 3 }]), 31)!, "smelter");
      expect(s.body.map((b) => b.text)).toContain(icons("THE {SLUG} GAINS +3 {*BURN}."));
      expect(s.notes!.map((b) => b.text)).toEqual(expect.arrayContaining([GATE_RULE, gateWait(1)]));
      expect(s.notes!.map((b) => b.text)).not.toContain(FUSER_ORDER);
    });
  });

  it("the place hints say where a gate goes, and every hint a panel draws is in the tips table", () => {
    on(() => {
      const r = run([], ["scattermill"]);
      r.shop.wagons = [{ merchant: "scrapper", offers: [{ def: "scattermill", price: 4, sold: false }] }] as unknown as Run["shop"]["wagons"];
      const cargoHint = cargoPanel(r, 50)!.body.find((b) => b.role === "hint")!.text;
      const offerHint = offerPanel(r, 0, 0)!.body.find((b) => b.role === "hint")!.text;
      const touchHint = offerPanel(r, 0, 0, true)!.body.find((b) => b.role === "hint")!.text;
      expect(cargoHint).toBe(`${GATE_TAP}.`);
      expect(offerHint).toBe(`${GATE_TAP}, OR DRAG IT THERE.`);
      expect(touchHint).toBe(GATE_DRAG);
      const placed = gatePanel(run([{ uid: 30, def: "scattermill", x: 4, y: 3 }]), 30)!.body.find((b) => b.role === "hint")!.text;
      expect(placed).toBe(GATE_MOVE);
      for (const h of [cargoHint, offerHint, touchHint, placed]) expect(hintsOf(), h).toContain(h);
    });
  });

  it("the placed gate's panel: GATE · BELT 1, TO CARGO (SELL +3G on touch), no ROTATE; itemPanel routes to it; a rig's panel is not it", () => {
    on(() => {
      const r = run([{ uid: 30, def: "fuser", x: 4, y: 3 }]);
      const p = itemPanel(r, 30)!;
      expect(p).toEqual(gatePanel(r, 30));
      expect([p.title, p.sub, p.labels]).toEqual(["FUSER", "GATE · BELT 1", ["TO CARGO"]]);
      expect(itemPanel(r, 30, true)!.labels).toEqual(["TO CARGO", `SELL +${sellValue("fuser", 1)}G`]);
      expect(rigPanel(r, 30)).toBeNull();
      const merged = run([{ uid: 30, def: "fuser", x: 4, y: 3, stars: 2 }]);
      expect(itemPanel(merged, 30)!.title).toContain("FUSER");
      expect(itemPanel(merged, 30, true)!.labels).toEqual(["TO CARGO", "SELL +6G"]);
      // off every belt (a stranded one the editor has not released yet): the panel says so
      const off = run([{ uid: 31, def: "smelter", x: 1, y: 1 }]);
      expect(gatePanel(off, 31)!.sub).toBe("GATE · NO BELT");
    });
  });

  it("the offer panel of a gate: the face's own line and BUY; the merge badge machinery sees it as a fusible piece", () => {
    on(() => {
      const r = run();
      r.shop.wagons = [{ merchant: "tinker", offers: [{ def: "fuser", price: 6, sold: false }] }] as unknown as Run["shop"]["wagons"];
      const o = offerPanel(r, 0, 0)!;
      expect(o.title).toBe("FUSER");
      expect(o.sub).toBe("RARE GATE");
      expect(o.labels).toEqual(["BUY 6G"]);
      expect(o.body.map((b) => b.text)).toContain(icons("2 SLUGS IN, 1 OUT: IT DEALS BOTH, +50%."));
    });
  });
});
