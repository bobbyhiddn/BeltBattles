// HULL-1c (REQ-BFG-079; REVIEW-HULL1A N3): the battle bar's wind read-out and the wind's info text with HULL_SCALE on. On
// the day's hull the bar says the SHARE of its own max hull both hulls lose a second (hullScale.ts windShareBp, as a percent
// with at most one decimal: "WIND 1%/S"; each hull's own amount stays on its pop), not the player's own amount, and the
// glossary's DARK WIND row (what a tap on the words shows) says each hull loses a share of its max every second. With the
// switch off, or a day-less battle (the title's attract fight, the hero preview), both read exactly as before. The switch is
// turned on only through withHullScale / setHullScale, and put back after each test.
import { afterEach, describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { WIND_START, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { hullScaleRules, setHullScale, windShareBp, withHullScale } from "../src/sim/hullScale";
import { windReadout, windShareText } from "../src/screens/battleHud";
import { GLOSSARY_WRAP_W, glossaryRows, glossaryText } from "../src/ui/glossary";
import { captureFormats, fmtSec } from "../src/ui/statFormat";
import { C } from "../src/render/palette";
import { ICON, KEYWORDS, PLAYER_WORD, icons, stripIcons, textWidth } from "../src/render/font"; // MERGE-099D: PLAYER_WORD (CARD-3)
import { colourize, wrapRich } from "../src/ui/richText";

afterEach(() => setHullScale(true)); // the shipped value (AZ-BUMP's flip; was false): a test that reads the switch off sets it off itself

/** A hero's starting deck with its belts cut: nothing fires, so only the wind moves a hull (tests/hull1a.scale.test.ts). */
const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });
/** Step a battle to `t` seconds (or its end) and return it. */
const to = (bt: Battle, t: number): Battle => {
  while (!bt.over && bt.t < t) {
    bt.step();
    bt.events.length = 0;
  }
  return bt;
};
const fight = (day?: number): Battle => new Battle(silent("furnace", 1), silent("weaver", 101), 7, undefined, day);
/** The times read: before the wind, its first second, and on into its steps. */
const TIMES = [WIND_START - 1, WIND_START + 0.5, WIND_START + 6, WIND_START + 12.5, WIND_START + 31];

describe("HULL-1c: the bar's wind read-out (REVIEW-HULL1A N3)", () => {
  it("windShareText: basis points as a percent with at most one decimal", () => {
    expect([50, 100, 150, 200, 450, 1000].map(windShareText)).toEqual(["0.5%", "1%", "1.5%", "2%", "4.5%", "10%"]);
    for (let bp = 0; bp <= 2000; bp += 5) expect(windShareText(bp), String(bp)).toMatch(/^\d+(\.\d)?%$/);
  });

  it("switch on, a day: the share both hulls lose a second (windShareBp at the battle's time), whatever the two max hulls", () => {
    const seen: string[] = [];
    for (const day of [1, 5, 10]) {
      const bt = withHullScale(() => fight(day));
      expect(bt.scaled).toBe(true);
      expect(bt.sides[0].hull.max).not.toBe(bt.sides[1].hull.max); // two hulls, two amounts, one share
      for (const t of TIMES.filter((x) => x >= WIND_START)) {
        to(bt, t);
        const r = windReadout(bt);
        expect(r, `day ${day} t ${bt.t}`).toBe(`WIND ${windShareText(windShareBp(bt.t - WIND_START))}/S`);
        expect(r).toMatch(/^WIND \d+(\.\d)?%\/S$/);
        if (day === 10) seen.push(`${bt.t.toFixed(2)} s: ${r} (each hull: ${bt.windDps(0)} / ${bt.windDps(1)} a second)`);
      }
    }
    console.log(`HULL1C-WINDHUD day 10: ${seen.join("; ")}`);
  });

  it("the switch off, or a day-less battle with it on: 0.9.7's read-out, the player's damage a second (windDps), as before", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): the switch-off battles (it ships on; the afterEach puts it back)
    for (const make of [() => fight(10), () => fight(), () => withHullScale(() => fight())]) {
      const bt = make();
      expect(bt.scaled).toBe(false);
      for (const t of TIMES) {
        to(bt, t);
        expect(windReadout(bt)).toBe(`WIND ${bt.windDps()}/S`);
      }
    }
  });

  it("the bar's room: 0.9.7's read-outs are 38 px at most, so drawBar's max(38, the read-out's width) is its 38, as before", () => {
    const flat = Array.from({ length: 40 }, (_, i) => `WIND ${10 * (i + 1)}/S`); // the flat wind: 10 a second, +10 every 5 s
    expect(Math.max(...flat.map((s) => textWidth(s, "3")))).toBeLessThanOrEqual(38);
    // a share read-out is drawn only where it fits whole (the widest, 25 s to 120 s, for the shots)
    const shares = Array.from({ length: 20 }, (_, i) => `WIND ${windShareText(windShareBp(5 * i))}/S`);
    const widest = shares.reduce((a, s) => (textWidth(s, "3") > textWidth(a, "3") ? s : a));
    console.log(`HULL1C-WINDHUD widest share read-out to 120 s: ${widest} (${textWidth(widest, "3")} px; drawBar keeps 40 px for it)`);
  });
});

describe("HULL-1c: the wind's info text, the glossary's DARK WIND row (REVIEW-HULL1A N3)", () => {
  // MERGE-099D (BRIEF-MERGE-099D 1f; cap's ruling, oracle 19ddc7af83f1dba3): CARD-3 (REQ-BFG-107) moved THE DARK WIND GOES
  // PAST IT from the soak row (SHIELD) to this row, so both forms say PAST SHIELD; the ON form keeps 2 lines as HULLS LOSE
  // A GROWING % OF MAX EACH SEC (was EACH HULL LOSES A GROWING % OF ITS MAX EACH SEC.)
  const OFF = `DARK WIND: FROM ${fmtSec(WIND_START)}{SEC}, HULL DAMAGE THAT GROWS, PAST {*PLATE}. NO {*HEAL} IN IT.`;

  it("switch on: each hull loses a share of its own max every second; 2 lines of 5x7 at the band's width; its one number the sim's", () => {
    setHullScale(true);
    expect(hullScaleRules()).toBe(true);
    const def = glossaryText("DARK WIND")!;
    expect(def).not.toBe(OFF);
    expect(stripIcons(icons(def))).toMatch(/^DARK WIND: FROM \d+, HULLS LOSE A GROWING % OF MAX EACH SEC, PAST .?SHIELD\. NO .?HEAL\.$/);
    const lines = wrapRich(colourize(icons(def), C.bone), GLOSSARY_WRAP_W, "5");
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) expect(textWidth(l.map((s) => s.t).join(""), "5")).toBeLessThanOrEqual(GLOSSARY_WRAP_W);
    // its number is WIND_START through fmtSec (the glossary's rule), and HEAL reads in panel style (its icon before it)
    const { value: rows, records } = captureFormats(() => glossaryRows());
    expect(rows.find((r) => r.word === "DARK WIND")!.def).toBe(def);
    expect(records.some((r) => r.unit === "sec" && r.value === WIND_START)).toBe(true);
    // MERGE-099D (BRIEF-MERGE-099D 1f): each keyword is found by the word it draws (CARD-3's font.ts PLAYER_WORD: {*PLATE}
    // draws ICON.PLATE then SHIELD), its icon before it (was the internal name: PAST SHIELD is the PLATE token's word)
    for (const k of KEYWORDS) for (const m of icons(def).matchAll(new RegExp(PLAYER_WORD[k], "g"))) expect(icons(def)[m.index! - 1], k).toBe(ICON[k]);
    console.log(`HULL1C-WINDHUD info: ${stripIcons(icons(def))} (${lines.map((l) => textWidth(l.map((s) => s.t).join(""), "5")).join(" + ")} px)`);
  });

  it("switch off: SUS-B's words, as before (tests/glossary.test.ts pins them too)", () => {
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): the switch-off words (it ships on; the afterEach puts it back)
    expect(glossaryText("DARK WIND")).toBe(OFF);
    expect(withHullScale(() => glossaryText("DARK WIND"))).not.toBe(OFF);
    expect(glossaryText("DARK WIND")).toBe(OFF);
  });
});
