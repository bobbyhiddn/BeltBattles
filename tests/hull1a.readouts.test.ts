// HULL-1a (REQ-BFG-079): every hull read-out shows the day's number with HULL_SCALE on, and 0.9.7's with it off. Each
// read-out's text function at day 1 and day 10: the run bar's hull, the hero card's HULL, NEXT BATTLE's foe hull, the scout
// report's foe hull, the ARMOR PACK (its pack slot, its face, its ability text, the toast), HULL rune text (IRON SKIN, SPARE
// HULL, BULKHEADS, SCRAP HALO; a HEAL or REGEN rune doesn't scale), LAST CHANCE's HULL card (its name, its YOUR HULL line,
// the toast) and the road event's hull amounts. The battle HUD's bars and numbers read the battle's own max hull
// (tests/hull1a.scale.test.ts). Then the widest read-out on day 10, measured in the game's fonts (HULL1A-WIDEST, for the
// REPORT). The switch is turned on only through withHullScale.
import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";
import { RUNES } from "../src/sim/runes";
import { refHull } from "../src/sim/races/refBuilds";
import { LAST_CHANCE_HULL, type LastChanceOffer } from "../src/sim/lastChance";
import { withHullScale } from "../src/sim/hullScale";
import { runBarHull } from "../src/ui/runbar";
import { foeClass, heroHullText, textOpts } from "../src/screens/build/inspector";
import { revealLine } from "../src/screens/event/reveal";
import { packAmount } from "../src/screens/build/shop";
import { supplyToast } from "../src/screens/build/actions";
import { faceLines } from "../src/ui/faces";
import { abilityText, cardText } from "../src/ui/abilityText";
import { runeAmountText, runeLine } from "../src/ui/runeText";
import { runeTextLines } from "../src/ui/runeBar";
import { lcHullName, lcHullNow, lcToast } from "../src/screens/lastChancePicker";
import { deltaText } from "../src/screens/event/cards";
import { outcomeText } from "../src/screens/event/event";
import { textWidth } from "../src/render/font";
import type { DuskFoe, Run } from "../src/game/run";
import type { Choice } from "../src/game/eventDefs";

const runOf = (hero: HeroId, day: number, hullBonus = 0): Pick<Run, "hero" | "build" | "day"> =>
  ({ hero, day, build: { ...heroStartBuild(hero, 1), hullBonus } as Build });
const foeOf = (hero: HeroId, day: number, hullBonus = 0): DuskFoe =>
  ({ day, kind: "standin", name: "FOE", hero, build: { ...heroStartBuild(hero, 101), hullBonus } as Build });
const on = <T>(fn: () => T): T => withHullScale(fn);
const offer: LastChanceOffer = { day: 5, rune: null, part: null, hull: LAST_CHANCE_HULL };

describe("HULL-1a: every hull read-out, at day 1 and day 10", () => {
  it("the run bar's hull and the hero card's HULL: base + hullBonus, x M(d) with the switch on", () => {
    for (const f of [runBarHull, heroHullText]) {
      expect(f(runOf("furnace", 10, 750))).toBe("2850"); // off: 0.9.7's
      expect(on(() => f(runOf("furnace", 1, 750)))).toBe("2850");
      expect(on(() => f(runOf("furnace", 10, 750)))).toBe("17100");
      expect(on(() => f(runOf("foundry", 10)))).toBe("13500");
      expect(on(() => f(runOf("weaver", 5, 250)))).toBe("5460"); // 1950 x 2.8
    }
  });

  it("NEXT BATTLE's foe hull and the scout report's: on the fight's day", () => {
    expect(foeClass(foeOf("weaver", 10, 250))).toBe("WEAVER · HULL 1950");
    expect(on(() => foeClass(foeOf("weaver", 1, 250)))).toBe("WEAVER · HULL 1950");
    expect(on(() => foeClass(foeOf("weaver", 10, 250)))).toBe("WEAVER · HULL 11700");
    const belt = heroStartBuild("bastion", 101).beltCap;
    expect(revealLine(foeOf("bastion", 10))).toBe(`BASTION · HULL 2150 · BELT ${belt}`);
    expect(on(() => revealLine(foeOf("bastion", 10)))).toBe(`BASTION · HULL 12900 · BELT ${belt}`);
  });

  it("the ARMOR PACK: its slot, its face, its ability text and the toast read M(d) x 250", () => {
    expect(ITEMS.plating.supply!.hull).toBe(250);
    expect(packAmount("armor", 10)).toBe(packAmount("armor"));
    expect(on(() => packAmount("armor", 1))).toBe(packAmount("armor"));
    expect(on(() => packAmount("armor", 10))).toMatch(/^\+1500 /);
    expect(packAmount("belt", 10)).toBe(on(() => packAmount("belt", 10))); // belt capacity doesn't scale
    const face = (day?: number) => faceLines("plating", 1, { day })!.rules[0].text;
    expect(face(10)).toBe(face());
    expect(face(10)).toMatch(/^\+250 /);
    expect(on(() => face(1))).toBe(face());
    expect(on(() => face(10))).toMatch(/^\+1500 /);
    expect(abilityText("plating", 1, { day: 10 }).sentences[0]).toBe("ADDS 250 TO YOUR HULL FOR THE REST OF THE RUN.");
    expect(on(() => abilityText("plating", 1, { day: 10 }).sentences[0])).toBe("ADDS 1500 TO YOUR HULL FOR THE REST OF THE RUN.");
    expect(on(() => cardText("plating", { day: 10 }))).toBe("ADDS 1500 HULL.");
    expect(supplyToast(ITEMS.plating, 10)).toBe("+250 MAX HULL");
    expect(on(() => supplyToast(ITEMS.plating, 1))).toBe("+250 MAX HULL");
    expect(on(() => supplyToast(ITEMS.plating, 10))).toBe("+1500 MAX HULL");
    expect(on(() => supplyToast(ITEMS.beltcrate, 10))).toBe(supplyToast(ITEMS.beltcrate));
    // the panels' opts carry the run's day (inspector.ts textOpts)
    expect(textOpts({ ...runOf("furnace", 7), seed: 1 } as unknown as Run).day).toBe(7);
  });

  it("HULL rune text: IRON SKIN, SPARE HULL, BULKHEADS and SCRAP HALO read M(d) x N; a REGEN rune doesn't scale", () => {
    const want: Record<string, [string, string]> = {
      iron_skin: ["+150 HULL.", "+900 HULL."],
      spare_hull: ["+300 HULL.", "+1800 HULL."],
      bulkheads: ["+50 HULL PER TURRET YOU HAVE.", "+300 HULL PER TURRET YOU HAVE."],
      scrap_halo: ["+60 HULL PER MERGED PIECE.", "+360 HULL PER MERGED PIECE."],
    };
    for (const [id, [d1, d10]] of Object.entries(want)) {
      expect(runeLine(RUNES[id], 10)).toBe(d1); // off
      expect(on(() => runeLine(RUNES[id], 1))).toBe(d1);
      expect(on(() => runeLine(RUNES[id], 10))).toBe(d10);
      expect(on(() => runeLine(RUNES[id]))).toBe(d1); // no day: M = 1
    }
    expect(on(() => runeAmountText(RUNES.scrap_halo, 2))).toBe("80"); // 60 x 1.4 = 84 -> 80, what the battle adds a piece
    const regen = RUNES.green_thread;
    expect(on(() => runeLine(regen, 10))).toBe(runeLine(regen));
    // the cards' lines (runeBar.ts runeTextLines) carry the day too
    const flat = (day?: number) => runeTextLines(RUNES.spare_hull, 200, day).map((l) => l.map((s) => s.t).join("")).join(" ");
    expect(on(() => flat(10))).toBe("+1800 HULL.");
    expect(flat(10)).toBe("+300 HULL.");
  });

  it("LAST CHANCE's HULL card: +500 becomes M(d) x 500 (its name, YOUR HULL line and toast)", () => {
    expect(lcHullName(offer, 5)).toBe(lcHullName(offer));
    expect(on(() => lcHullName(offer, 1))).toBe(lcHullName(offer));
    expect(on(() => lcHullName(offer, 5))).toMatch(/^\+1400 /);
    expect(on(() => lcHullName(offer, 10))).toMatch(/^\+3000 /);
    expect(lcHullNow(runOf("furnace", 5), 500, 5)).toEqual([2100, 2600]);
    expect(on(() => lcHullNow(runOf("furnace", 5), 500, 5))).toEqual([5880, 7280]);
    expect(lcToast("hull", offer, 5)).toBe(lcToast("hull", offer));
    expect(on(() => lcToast("hull", offer, 5))).toMatch(/^MAX HULL \+1400 /);
  });

  it("the road event's hull amounts (PLATING, RIDE THROUGH and the hull costs): the card chips and the outcome line", () => {
    const d = { k: "hull" as const, n: 250 };
    expect(deltaText(d, false, 10)).toBe("+250 HULL");
    expect(on(() => deltaText(d, false, 1))).toBe("+250 HULL");
    expect(on(() => deltaText(d, false, 10))).toBe("+1500 HULL");
    expect(on(() => deltaText(d, true, 10))).toBe("-1500 HULL");
    const c = { cost: [], gain: [d] } as unknown as Choice;
    expect(outcomeText(c, true, 10)[0]).toBe("+250 MAX HULL");
    expect(on(() => outcomeText(c, true, 10)[0])).toBe("+1500 MAX HULL");
  });

  it("the widest read-out on day 10: the biggest hero (FOUNDRY 2,250) bare, with the par player's plating, and a heavy deck (HULL1A-WIDEST)", () => {
    const rows: string[] = [];
    for (const [label, bonus] of [["bare", 0], ["par plating", refHull(10)], ["10 packs", 2500]] as [string, number][]) {
      const bar0 = runBarHull(runOf("foundry", 10, bonus)), bar = on(() => runBarHull(runOf("foundry", 10, bonus)));
      const card = on(() => heroHullText(runOf("foundry", 10, bonus))), foe = on(() => foeClass(foeOf("foundry", 10, bonus)));
      rows.push(`${label}: run bar ${bar0} -> ${bar} (font 3: ${textWidth(bar0, "3")} -> ${textWidth(bar, "3")} px); hero card HULL ${card} (font 5: ${textWidth(card)} px, font 3: ${textWidth(card, "3")} px); NEXT foe "${foe}" (font 3: ${textWidth(foe, "3")} px)`);
      expect(bar.length).toBeLessThanOrEqual(5);
    }
    for (const hero of PLAYABLE_HEROES) rows.push(`${hero} day 10 bare ${on(() => runBarHull(runOf(hero, 10)))}, par ${on(() => runBarHull(runOf(hero, 10, refHull(10))))}`);
    rows.push(`ARMOR PACK slot ${on(() => packAmount("armor", 10))} (font 3: ${textWidth(on(() => packAmount("armor", 10)), "3")} px; day 1 ${textWidth(packAmount("armor"), "3")} px)`);
    rows.push(`LAST CHANCE name ${on(() => lcHullName(offer, 9))} (day 9, font 5: ${textWidth(on(() => lcHullName(offer, 9)))} px; day 1 ${textWidth(lcHullName(offer))} px)`);
    console.log(`HULL1A-WIDEST\n${rows.join("\n")}`);
    expect(HEROES.foundry.hull).toBe(Math.max(...PLAYABLE_HEROES.map((h) => HEROES[h].hull)));
  });
});
