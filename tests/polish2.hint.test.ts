// POLISH-2 (REQ-BFG-098; BRIEF-POLISH2 Q2, POLISH-1's follow-up F-b): THE READOUT SAYS WHAT IT LEAVES OUT.
// A reader's amount (IRON WALL and the nine other rigs of ROWS-1) is fight state, so the walk leaves it out; the words whose amount changes in the fight (RISING's climb, ECHOING's count)
// and the two that scale the DMG (SWIFT, MASSIVE) are not counted either (beltWords.ts WORD_TABLE). When a belt carries such a part, ONE short line under the readout names them:
// `NOT COUNTED: IRON WALL, RISING (BOTH CHANGE IN THE FIGHT).` No line on a belt with nothing left out. Pinned here:
//  (a) the line's presence: each of the ten readers, each fight-state word on a rig, a factory and a turret, SWIFT and MASSIVE, a gate on the belt (the words it hides), mixed belts;
//  (b) its absence: a plain belt, WHETSTONE only, FIERY / GROWING / WIDE / BRACED (counted or without an effect on a slug), a word on a rig that has no hit on this belt, the switch off;
//  (c) its words: the candidates from the fullest to the shortest (names, then `+n MORE`, then a count);
//  (d) its fit: ONE line on every view the belt-panel tests cover (the desk column, the two phones, the narrow desk, the landscape phone), never wider than its room, and it never costs the
//      panel's kept text its room (planIn's guest rule, reached through planPanel: where it cannot be drawn beside the panel as it is without it, the panel IS what it was without it).
//      POLISH-2 R1 (RULING-POLISH2-R1; the trail of what changed here): the line is a GUEST. Run 1 asserted it was IN the panel on every belt on the three main views; now it is in the panel OR the FIRST
//      item of the panel's ⓘ view (routePanel's `notes`) there (the fit test below; tests/polish2.guest.test.ts proves the rest over 75 belts, seven views and the scouted foes). Nothing else here moved.
import { afterEach, describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { ITEMS } from "../src/sim/content";
import { setTurretList, walkRoute, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, freeSides, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { effectAt } from "../src/sim/stars";
import { textWidth } from "../src/render/font";
import { lineText } from "../src/ui/richText";
import { newRun, type Run } from "../src/game/run";
import { isPhone, tapPx } from "../src/ui/tap";
import { buildLayout } from "../src/screens/build/layout";
import { keptWhole, planPanel, routePanel, visibleLines, type Block, type PanelText } from "../src/screens/build/inspector";
import { LEFT_LEAD, beltWordFx, leftOutCandidates, whyText, type LeftOut } from "../src/screens/build/beltWords";
import { bench, benchRigsCheck, factoryBench } from "./arsenal.bench";

afterEach(() => setEnchant(ENCHANT));

const READERS = ["quench", "shieldwall", "keg", "cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"];
const DAYS = [1, 6];
const runOf = (b: Build, day = 6): Run => {
  const run = newRun("furnace", 5, "polish2-hint");
  run.day = day;
  run.build = b;
  return run;
};
const lineOf = (run: Run, index = 0): Block | undefined => routePanel(run, index)!.body.find((b) => !!b.fit);
const textOf = (run: Run): string | undefined => lineOf(run)?.text;

/** A belt with one rig (any of ITEMS' rigs, ★`stars`) on tile 1; `ench` puts a word on it. */
function rigRun(id: string, stars: number, day: number, ench?: EnchantId): Run {
  const b = bench([[id, 4, 4, stars]]);
  benchRigsCheck(b, [[id, 4, 4, stars]]);
  if (ench) Object.assign(b.items.find((p) => p.def === id)!, { ench, ...(ench === "wide" ? { enchDir: freeSides(ITEMS[id])[0] } : {}) });
  return runOf(b, day);
}
const factoryRun = (stars: number, ench?: EnchantId): Run => {
  const b = factoryBench("press", stars, { only: true });
  if (ench) Object.assign(b.items.find((p) => p.def === "press")!, { ench });
  return runOf(b);
};
const turretRun = (ench?: EnchantId): Run => {
  const b = bench();
  setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, ...(ench ? { ench } : {}) }]);
  return runOf(b);
};

describe("POLISH-2 Q2: the line is there when the numbers leave something out", () => {
  it("each of the ten readers at ★1-3 on days 1 and 6: `NOT COUNTED: <NAME> (CHANGES IN THE FIGHT).` is the line's fullest form", () => {
    let n = 0;
    for (const id of READERS) {
      for (const stars of [1, 2, 3]) for (const day of DAYS) {
        const t = textOf(rigRun(id, stars, day));
        expect(t, `${id} ★${stars} day ${day}`).toBe(`${LEFT_LEAD} ${ITEMS[id].name} (${whyText("fight", 1)}).`);
        n++;
      }
    }
    expect(n).toBe(60);
    expect(textOf(rigRun("shieldwall", 3, 6))).toBe("NOT COUNTED: IRON WALL (CHANGES IN THE FIGHT).");
  });

  it("RISING and ECHOING on a rig, a factory and a turret; MASSIVE on a turret; SWIFT on a factory: the line names the word", () => {
    for (const id of ["rising", "echoing"] as const) {
      const name = ENCHANT_DEFS[id].name;
      expect(textOf(rigRun("whetstone", 1, 1, id)), `${id} on a rig`).toBe(`${LEFT_LEAD} ${name} (${whyText("fight", 1)}).`);
      expect(textOf(factoryRun(1, id)), `${id} on a factory`).toBe(`${LEFT_LEAD} ${name} (${whyText("fight", 1)}).`);
      expect(textOf(turretRun(id)), `${id} on a turret`).toBe(`${LEFT_LEAD} ${name} (${whyText("fight", 1)}).`);
    }
    expect(textOf(turretRun("massive"))).toBe("NOT COUNTED: MASSIVE (SCALES THE DMG).");
    expect(textOf(factoryRun(1, "swift"))).toBe("NOT COUNTED: SWIFT (SCALES THE DMG).");
  });

  it("a belt with several: the things in the order the slug meets them (factory, tiles, turret), the reasons said once each, a reader's word named after the reader", () => {
    const b = bench([["shieldwall", 4, 4, 3], ["crowdpress", 4, 2, 2]]);
    benchRigsCheck(b, [["shieldwall", 4, 4, 3], ["crowdpress", 4, 2, 2]]);
    Object.assign(b.items.find((p) => p.def === "kiln")!, { ench: "echoing" });
    Object.assign(b.items.find((p) => p.def === "crowdpress")!, { ench: "rising" });
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, ench: "massive" }]);
    const run = runOf(b), w = walkRoute(b, 0, undefined, { gates: true });
    const fx = beltWordFx(b, 0, w, 0);
    expect(fx.left.map((l) => l.name)).toEqual(["ECHOING", "IRON WALL", "CROWD PRESS", "RISING", "MASSIVE"]);
    // POLISH-2 R1 (PQ-05's one words-only fix round; was `RISING (CHANGE IN THE FIGHT)`): with several names the reason says it is for each of them
    expect(textOf(run)).toBe("NOT COUNTED: ECHOING, IRON WALL, CROWD PRESS, RISING (ALL CHANGE IN THE FIGHT); MASSIVE (SCALES THE DMG).");
    // a thing is named once however often it is on the belt (two IRON WALLs are one name)
    const two = bench([["shieldwall", 4, 4, 1], ["shieldwall", 4, 2, 1]]);
    benchRigsCheck(two, [["shieldwall", 4, 4, 1], ["shieldwall", 4, 2, 1]]);
    expect(textOf(runOf(two))).toBe("NOT COUNTED: IRON WALL (CHANGES IN THE FIGHT).");
  });
});

describe("POLISH-2 Q2: and not there when nothing is left out", () => {
  it("a plain belt, a WHETSTONE-only belt (what the readout counts is all of it), and FIERY, GROWING, WIDE or BRACED on any kind", () => {
    expect(lineOf(runOf(bench()))).toBeUndefined();
    for (const day of DAYS) expect(lineOf(rigRun("whetstone", 1, day)), "WHETSTONE only").toBeUndefined();
    for (const id of ["fiery", "growing", "wide", "braced"] as const) {
      expect(lineOf(rigRun("whetstone", 1, 6, id)), `${id} on a rig`).toBeUndefined();
      if (ENCHANT_DEFS[id].kinds.includes("factory")) expect(lineOf(factoryRun(1, id)), `${id} on a factory`).toBeUndefined();
      if (ENCHANT_DEFS[id].kinds.includes("turret")) expect(lineOf(turretRun(id)), `${id} on a turret`).toBeUndefined();
    }
  });

  it("a RISING rig with no hit on this belt (idle), a word on a part of another belt, and the switch off: no line", () => {
    const b = bench([["whetstone", 4, 4, 1]]);
    benchRigsCheck(b, [["whetstone", 4, 4, 1]]);
    Object.assign(b.items.find((p) => p.def === "whetstone")!, { ench: "rising", x: 0, y: 0 }); // moved off the belt: no hit
    expect(lineOf(runOf(b))).toBeUndefined();
    const on = rigRun("whetstone", 1, 1, "rising");
    withEnchant(() => expect(lineOf(on)).toBeDefined(), true);
    withEnchant(() => expect(lineOf(on)).toBeUndefined(), false);
  });

  it("every word x kind the table does not call left-out gives no line; every one it does gives one", () => {
    const decks: Record<string, (id: EnchantId) => Run> = { rig: (id) => rigRun("whetstone", 1, 1, id), factory: (id) => factoryRun(1, id), turret: (id) => turretRun(id) };
    let n = 0;
    for (const id of ENCHANT_IDS) {
      for (const kind of ENCHANT_DEFS[id].kinds) {
        const want = id === "rising" || id === "echoing" || id === "massive" || id === "swift";
        expect(!!lineOf(decks[kind](id)), `${id} on a ${kind}`).toBe(want);
        n++;
      }
    }
    expect(n).toBe(20); // 8 words: six on three kinds, MASSIVE on a turret, SWIFT on a factory
  });
});

describe("POLISH-2 Q2: the line's words, fullest first", () => {
  const L = (...a: [string, LeftOut["why"]][]): LeftOut[] => a.map(([name, why]) => ({ key: name, name, why }));
  it("candidates: the reasons said once per group, the names, the first and `+n MORE`, a count; none when nothing is left out", () => {
    expect(leftOutCandidates([])).toEqual([]);
    expect(leftOutCandidates(L(["IRON WALL", "fight"]))).toEqual(["NOT COUNTED: IRON WALL (CHANGES IN THE FIGHT).", "NOT COUNTED: IRON WALL.", "NOT COUNTED: 1 THING."]);
    expect(leftOutCandidates(L(["IRON WALL", "fight"], ["RISING", "fight"], ["MASSIVE", "scale"]))).toEqual([
      "NOT COUNTED: IRON WALL, RISING (BOTH CHANGE IN THE FIGHT); MASSIVE (SCALES THE DMG).", // POLISH-2 R1: was `(CHANGE IN THE FIGHT)`
      "NOT COUNTED: IRON WALL, RISING, MASSIVE.",
      "NOT COUNTED: IRON WALL +2 MORE.",
      "NOT COUNTED: 3 THINGS.",
    ]);
    expect([whyText("fight", 1), whyText("fight", 2), whyText("fight", 4)]).toEqual(["CHANGES IN THE FIGHT", "BOTH CHANGE IN THE FIGHT", "ALL CHANGE IN THE FIGHT"]); // POLISH-2 R1
    expect([whyText("scale", 1), whyText("scale", 2), whyText("scale", 3)]).toEqual(["SCALES THE DMG", "BOTH SCALE THE DMG", "ALL SCALE THE DMG"]);
    expect(whyText("gate", 1)).toBe("A GATE CHANGES IT");
    expect(whyText("gate", 2)).toBe("A GATE CHANGES THEM");
  });
});

// the views the belt-panel tests plan on (tests/rows1.merged.test.ts's three, enchant2w.owner's phones and desks)
const VIEWS: [string, number, number, number][] = [
  ["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2],
  ["phone 390x844 @3", 390, 844, 3], ["desk 1920x1080", 1920, 1080, 1], ["land 844x390 @3", 844, 390, 3],
];
const MAIN = new Set(["desk 1280x800", "op690 402x690 @3", "small 360x640 @2"]);

describe("POLISH-2 Q2: the line is one line on every view and never costs the kept text its room", () => {
  it("every reader (alone, with a word on it, with a second thing left out) on each view: one line, within its room, the panel's kept text as whole as without the line", () => {
    const tally: Record<string, { plans: number; shown: number; behind: number }> = {};
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr), phone = isPhone(v), tap = phone ? tapPx(v) : 0;
      const L = buildLayout(v.W, v.H, v.portrait, 5, phone && v.portrait, tap);
      const o = phone ? { tap, band: true, inBand: true } : {};
      tally[name] = { plans: 0, shown: 0, behind: 0 };
      const runs: [string, Run][] = [];
      for (const id of READERS) {
        runs.push([`${id}`, rigRun(id, 3, 6)]);
        runs.push([`${id}+rising`, rigRun(id, 3, 6, "rising")]);
      }
      runs.push(["whetstone+rising", rigRun("whetstone", 1, 6, "rising")], ["factory echoing", factoryRun(2, "echoing")], ["turret massive", turretRun("massive")]);
      for (const [label, run] of runs) {
        const t: PanelText = routePanel(run, 0)!;
        const withLine = planPanel(t, L.info, [], o), without = planPanel({ ...t, body: t.body.filter((b) => !b.hold) }, L.info, [], o);
        tally[name].plans++;
        const shown = withLine.body.shown.find((l) => !!l.b.fit);
        // the line never costs the kept text its room: whole with the line wherever it is whole without it
        if (keptWhole(without)) expect(keptWhole(withLine), `${name} ${label}: kept text whole without the line, so with it`).toBe(true);
        if (!shown) {
          // given way: the panel is exactly what it was without the line
          expect(withLine.body.shown.map((l) => l.b), `${name} ${label}: no line, the panel as before`).toEqual(without.body.shown.map((l) => l.b));
          // POLISH-2 R1 (was `expect(MAIN.has(name), ...the line is missing on a main view).toBe(false)`): the line is a guest; where the panel cannot draw it, it is the FIRST item of the panel's ⓘ view
          expect(t.notes?.[0]?.text, `${name} ${label}: behind the ?, first`).toBe(t.body.find((b) => !!b.hold)!.text);
          tally[name].behind++;
          continue;
        }
        tally[name].shown++;
        expect(shown.lines, `${name} ${label}: one line`).toHaveLength(1);
        const ln = shown.lines[0];
        expect(textWidth(lineText(ln.spans), ln.font), `${name} ${label}: within its room`).toBeLessThanOrEqual(L.info.w - 10);
        expect(ln.font, `${name} ${label}: the small face`).toBe("3");
        expect(withLine.body.fits, `${name} ${label}`).toBe(true);
        const drawn = new Set(visibleLines(withLine).map((q) => q.line));
        expect(drawn.has(ln), `${name} ${label}: drawn`).toBe(true);
        expect(lineText(ln.spans).startsWith(LEFT_LEAD), `${name} ${label}`).toBe(true);
      }
    }
    // POLISH-2 R1 (was `expect(tally[name].shown).toBe(tally[name].plans)`): on the main views the line is in the panel OR first in the ⓘ view on every belt
    for (const name of MAIN) expect(tally[name].shown + tally[name].behind, `${name}: the line is in the panel or first behind the ⓘ on every belt`).toBe(tally[name].plans);
    console.log(`POLISH-2 Q2 fit: ${JSON.stringify(tally)}`);
  });

  it("the narrowest column says it in the shortest forms that still name the thing: IRON WALL fits the desk column whole (names), a long list becomes `+n MORE` or a count", () => {
    const v = computeView(1280, 800, 1), L = buildLayout(v.W, v.H, v.portrait, 5, false, 0);
    const room = L.info.w - 10;
    expect(room).toBeLessThan(textWidth("NOT COUNTED: IRON WALL (CHANGES IN THE FIGHT).", "3"));
    const planOf = (run: Run) => planPanel(routePanel(run, 0)!, L.info, [], {});
    const text = (run: Run): string => lineText(planOf(run).body.shown.find((l) => !!l.b.fit)!.lines[0].spans);
    expect(text(rigRun("shieldwall", 3, 6))).toBe("NOT COUNTED: IRON WALL.");
    const b = bench([["shieldwall", 4, 4, 3], ["crowdpress", 4, 2, 2]]);
    benchRigsCheck(b, [["shieldwall", 4, 4, 3], ["crowdpress", 4, 2, 2]]);
    const long = text(runOf(b));
    expect(long === "NOT COUNTED: IRON WALL +1 MORE." || long === "NOT COUNTED: 2 THINGS.", long).toBe(true);
    expect(textWidth(long, "3")).toBeLessThanOrEqual(room);
  });

  it("the effect numbers still read what the gate/word logic says: a reader's belt has the same DMG and BURN as the walk (its amount is the thing left out)", () => {
    for (const id of READERS) {
      const run = rigRun(id, 3, 1), t = routePanel(run, 0)!;
      const e = walkRoute(run.build, 0, undefined, { gates: true }).estimate;
      const cells = Object.fromEntries(t.body.filter((b) => b.role === "grid").flatMap((b) => b.cells!));
      expect(cells.BURN, id).toBe(String(e.burn));
      expect(effectAt(id, 3).gate?.reads, id).toBeTruthy();
    }
  });
});
