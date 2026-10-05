// Y4 (release Y; REQ-BFG-070, REQ-BFG-046, REQ-BFG-047; DESIGN-Y section 3 rows 33-40, section 5 column g; BRIEF-Y4 S2, S3,
// the words and the bots' deck rating): with the star switch on (content.ts withStarRules), against the switch off.
// - The words: no keyword joins; LOAD TIME stays (SALVO RACK's kept sentence and the TEMPO family's line still name it);
//   BONUS DAMAGE stays (DRAKE NOZZLE's face names it); no switch-on text of the 8 names a rule that left.
// - S2: TESLA ARC's SHOT tap says its arc's share of the shot's damage, read from its data (25 / 25 / 30%), in the band.
// - S3: the SMUGGLER card's NONE ON OFFER line leaves (cards.ts cardNote); the guard stays (the choice is still blocked).
// - The rating (deckRating.ts, STAR_EQ's note): SEAM WELDER on pairs only, EXT. CHAMBER's shot capped by its chamber, DRAKE
//   NOZZLE's BURN for bonus damage; HOPPER, TWIN TRIGGER, ROTARY, ANVIL and STEAM from the switch's data.
import { describe, expect, it } from "vitest";
import { ITEMS, withStarRules } from "../src/sim/content";
import { KEYWORDS, icons, textWidth } from "../src/render/font";
import { effectAt } from "../src/sim/stars";
import { type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { drakeGain, rateDeck } from "../src/sim/deckRating";
import { faceAt, faceMerge, Y4_PIECES } from "../src/ui/faces";
import { levelLines, levelText } from "../src/screens/build/levels";
import { abilityText, cardText, clashShortText, gatlingClashText, gist } from "../src/ui/abilityText";
import { STAR_RETIRED, glossaryEntry, glossaryText, glossaryWordsIn, tapNote } from "../src/ui/glossary";
import { FAMILY } from "../src/ui/families";
import { fmtPct } from "../src/ui/statFormat";
import { EVENTS, type EventState } from "../src/game/eventDefs";
import { cardNote } from "../src/screens/event/cards";
import type { Run } from "../src/game/run";
import { BAND, STARS, on } from "./y3.helpers";
import { furnaceBench, twoPress, withMod } from "./wave3.helpers";
import { rigBench } from "./y3.helpers";

const k1 = (def: string) => (ITEMS[def].kind === "core" ? { k: 1 } : {});

describe("Y4 words: no new keyword; LOAD TIME and BONUS DAMAGE stay", () => {
  it("on, the glossary is Y3's: only HARASSMENT retires (Y5: and ONLINE); LOAD TIME and BONUS DAMAGE stay; the 9 keywords", () => {
    expect(STAR_RETIRED).toEqual(["HARASSMENT", "ONLINE"]); // Y5 (ruling 882ecc77): was ["HARASSMENT"]
    expect(on(() => [glossaryEntry("LOAD TIME")?.word, glossaryEntry("BONUS DAMAGE")?.word])).toEqual(["LOAD TIME", "BONUS DAMAGE"]);
    expect(KEYWORDS).toEqual(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN"]);
  });

  it("why LOAD TIME stays: SALVO RACK's kept sentence and the TEMPO family's line still name it with the switch on", () => {
    expect(on(() => abilityText("salvo", 1, { k: 1 }).sentences.some((t) => t.includes("LOAD TIME")))).toBe(true);
    expect(FAMILY.TEMPO.glossary).toContain("LOAD TIME");
  });

  it("DRAKE NOZZLE's face names BONUS DAMAGE (its glossary tap); the faces' keywords are the existing ones", () => {
    expect(on(() => glossaryWordsIn(faceAt("drake", 1)!.rules[0].text).map((r) => r.word))).toContain("BONUS DAMAGE");
    for (const def of Y4_PIECES) for (const s of STARS) {
      for (const m of on(() => faceAt(def, s, k1(def))!.rules[0].text).matchAll(/\{\*?([A-Z]+)\}/g)) {
        expect(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SLUG", "DMG"], `${def} ★${s}`).toContain(m[1]);
      }
    }
  });

  it("on, no text of the 8 names a rule that left: faces, ⓘ lines, kept sentences, gists, cards, merge lines, GATLING clashes", () => {
    // (EXT. CHAMBER's slot was its clause "★2 WIDE BREECH: HOLDS +1 {SLUG}.": the clause labels below)
    const GONE = /LOAD TIME|STORES?\b|NEVER JAMS|FLOOR|ANY OTHER LOAD|WITHOUT IT|, \d+% WITHOUT|MORE BURN|LASTS|LAND \d+% SOONER|SHORTER|\bPLUS\b|GREASED RACE:|CLEAN FEED:|WIDE BREECH:|TRIPLE BREECH:|BOTTOMLESS:/;
    const texts: string[] = [];
    on(() => {
      for (const def of Y4_PIECES) {
        const o = k1(def);
        texts.push(cardText(def, o));
        for (const s of STARS) {
          const f = faceAt(def, s, o)!;
          texts.push(...f.rules.map((r) => r.text), ...(f.clause ? [f.clause.text] : []), ...(f.caveats ?? []));
          texts.push(...levelLines(def, s, o)!.map((l) => levelText(l, (v) => v)));
          texts.push(...abilityText(def, s, o).sentences, gist(def, s, o));
          if (s > 1) texts.push(faceMerge(def, s, o) ?? "");
          for (const r of ["gatling", "compound"]) texts.push(gatlingClashText(def, s, r) ?? "", clashShortText(def, r) ?? "");
        }
      }
    });
    expect(texts.length).toBeGreaterThan(150);
    expect(texts.filter((t) => GONE.test(t))).toEqual([]);
    // off: the clashes and the rules that left are there (identity)
    expect(gatlingClashText("hopper", 1)).toBe("GATLING SPOOL: THE HOPPER'S LONGER LOAD TIME DOES NOTHING HERE.");
    expect(clashShortText("twintrigger", "compound")).toBe("TWIN TRIGGER: ITS SHORTER LOAD TIME DOES NOTHING HERE.");
    expect(on(() => [gatlingClashText("hopper", 1), gatlingClashText("twintrigger", 2, "compound"), clashShortText("hopper")])).toEqual([null, null, null]);
  });

  it("on, the 8's kept sentences, gists and cards say the new rules", () => {
    on(() => {
      expect(abilityText("hopper", 2).sentences).toEqual(["THE TURRET'S CHAMBER HOLDS 2 MORE LOADS."]);
      expect([gist("hopper", 3), cardText("hopper")]).toEqual(["HOLDS 3 MORE LOADS", "CHAMBER HOLDS 1 MORE LOAD."]);
      expect(abilityText("twintrigger", 3).sentences[0]).toBe("PAIRED LOADS IN THIS TURRET DEAL 95% MORE DAMAGE.");
      expect(abilityText("twintrigger", 1).sentences).toHaveLength(2); // + PAIR's definition
      expect(gist("twintrigger", 2)).toBe("PAIRS DEAL 60% MORE");
      expect(abilityText("seamwelder", 1).sentences[0]).toBe("EACH PAIR THIS TURRET TAKES ROLLS 10 PLATING ONTO YOUR HULL.");
      expect(gist("seamwelder", 3)).toBe("35 PLATING A PAIR");
      expect([abilityText("chamber", 3).sentences, gist("chamber", 2)]).toEqual([["THE TURRET FIRES 4 LOADS EACH SHOT."], "FIRES 3 LOADS A SHOT"]);
      expect(abilityText("rotary", 2, { k: 1 }).sentences).toEqual(["IT FIRES A PART-FULL CHAMBER 65% SOONER, THE OLDEST LOAD FIRST."]);
      expect([gist("rotary", 3, { k: 1 }), cardText("rotary", { k: 1 })]).toEqual(["PART-FULL CHAMBERS 80% SOONER", "PART-FULL CHAMBERS 50% SOONER."]);
      expect(abilityText("anvil", 3, { k: 1 }).sentences[0]).toBe("EACH SHOT DEALS 438% OF THE PLATING ON YOUR HULL AS MORE DAMAGE.");
      expect(gist("anvil", 1, { k: 1 })).toBe("125% OF YOUR PLATING AS DAMAGE");
      expect(abilityText("steambreech", 1, { k: 1 }).sentences).toEqual(["THE TURRET FIRES 40% FASTER WHILE YOUR HULL HOLDS PLATING."]);
      expect(gist("steambreech", 3, { k: 1 })).toBe("120% FASTER PLATED");
      expect(abilityText("drake", 2, { k: 1 }).sentences).toEqual([
        "TURNS EACH SHOT'S BONUS DAMAGE INTO BURN: 1 BURN FOR EVERY 7 DAMAGE.", "BONUS DAMAGE IS WHAT RIGS AND SCRAP ADD TO A PAYLOAD."]);
    });
    // off: as before
    expect(abilityText("drake", 1, { k: 1 }).sentences).toHaveLength(4);
    expect(gist("steambreech", 1, { k: 1 })).toBe("35% FASTER PLATED, 10% WITHOUT");
  });
});

describe("Y4 S2: TESLA ARC's tap note (REVIEW-Y1 ruling 3)", () => {
  it("on, its SHOT tap says each arc deals its share of the shot's damage, 25 / 25 / 30%, from its data, in one line of the band", () => {
    for (const s of STARS) {
      const share = fmtPct(effectAt("tesla", s).core!.share!);
      const t = on(() => glossaryText("SHOT", { def: "tesla", stars: s, o: { k: 1 } }))!;
      expect(t, `★${s}`).toBe(`SHOT: EACH ARC DEALS ${share} OF THE SHOT'S {DMG}.`);
      expect(share).toBe(["25%", "25%", "30%"][s - 1]);
      expect(textWidth(icons(t)), t).toBeLessThanOrEqual(BAND);
    }
    // the face keeps its lone {DMG}25% stat and its line (Y1)
    expect(on(() => faceAt("tesla", 1, { k: 1 })!.stats)).toEqual([["DMG", "25%"]]);
  });

  it("off, no note: the SHOT row's text, as before", () => {
    expect(tapNote("tesla", "SHOT")).toBeUndefined();
    expect(on(() => tapNote("tesla", "SHOT"))?.word).toBe("SHOT");
    expect(glossaryText("SHOT", { def: "tesla", stars: 1, o: { k: 1 } })).toBe("SHOT: EACH SHOT THIS TURRET FIRES.");
  });
});

describe("Y4 S3: the SMUGGLER card's NONE ON OFFER line leaves; the guard stays", () => {
  // an old save's run that drew no BURN or SHOCK ware (since FIX-ABE no real run does): both choices are empty
  const ev: EventState = { day: 3, id: "smuggler", roll: 0.5, pick: 0.5, picked: -1 };
  const oldSave = { wares: {}, day: 3 } as unknown as Run;
  const choices = (star: boolean) => withStarRules(() => EVENTS.smuggler.choices(oldSave, ev), star);

  it("on, a SMUGGLER choice with none on offer is still blocked (the guard) but its card draws no line (off: NONE ON OFFER)", () => {
    const [burnOn, shockOn] = choices(true), [burnOff, shockOff] = choices(false);
    for (const c of [burnOn, shockOn]) expect([c.blocked, c.quiet, cardNote(c)]).toEqual(["NONE ON OFFER", true, undefined]);
    for (const c of [burnOff, shockOff]) expect([c.blocked, c.quiet, cardNote(c)]).toEqual(["NONE ON OFFER", undefined, "NONE ON OFFER"]);
  });

  it("on, a run with wares of both effects offers both, unblocked, as before; the pools are untouched", () => {
    const run = { day: 3 } as unknown as Run; // a run without wares keeps the whole pool (eventDefs.ts inWares)
    const [b, s] = on(() => EVENTS.smuggler.choices(run, ev));
    expect([b.blocked, s.blocked, b.quiet, s.quiet]).toEqual([undefined, undefined, undefined, undefined]);
    expect(on(() => EVENTS.smuggler.choices(run, ev).map((c) => c.gain))).toEqual(EVENTS.smuggler.choices(run, ev).map((c) => c.gain));
  });
});

describe("Y4: the bots' deck rating prices each new rule (behind the switch)", () => {
  const rate = (b: Build, star: boolean) => withStarRules(() => rateDeck(b).offense, star);

  it("SEAM WELDER: on, pairs only: on one belt it rates as no SEAM (off: its NOMINAL credit); on two equal belts it pays", () => {
    const one = withMod(furnaceBench(), 60, "seamwelder");
    expect(rate(one, true)).toBe(rate(furnaceBench(), true));
    expect(rate(one, false)).toBeGreaterThan(rate(furnaceBench(), false));
    const two = withMod(withMod(twoPress(), 60, "seamwelder"), 61, "calibrate", 0, 3), bare = withMod(twoPress(), 61, "calibrate", 0, 3);
    expect(rate(two, true)).toBeGreaterThan(rate(bare, true));
  });

  it("EXT. CHAMBER: on, a shot fires at most the chamber: ★2 (3) and ★3 (4) rate alike on a saturated 3-load gun (off they differ)", () => {
    // two SHOT TOWERs' buckshot into the SCRAP CANNON: more loads arrive than 3 a second, so its shot size is its cap
    const at = (s: number, hopper = false) => {
      const b = withMod(twoPress(), 60, "chamber", 0, s);
      b.items = b.items.map((p) => (p.uid === 2 || p.uid === 3 ? { ...p, def: "shottower" } : p));
      return hopper ? withMod(b, 61, "hopper", 0, 1) : b;
    };
    expect(rate(at(3), true)).toBe(rate(at(2), true));
    expect(rate(at(3), false)).toBeGreaterThan(rate(at(2), false));
    // with a HOPPER the chamber holds 4, and ★3's 4 a shot counts
    expect(rate(at(3, true), true)).toBeGreaterThan(rate(at(2, true), true));
  });

  it("DRAKE NOZZLE: on, its BURN for each flatPerBurn of bonus damage (drakeGain), no NOMINAL: nothing without bonus damage", () => {
    const spec = (s: number) => on(() => effectAt("drake", s).core!);
    expect(STARS.map((s) => drakeGain(spec(s), 20))).toEqual([2 * 30 - 20, 2 * 30 - 14, 4 * 30 - 20]);
    const bare = (core: boolean) => (core ? withMod(furnaceBench(), 60, "drake") : furnaceBench());
    expect(rate(bare(true), true)).toBe(rate(bare(false), true));
    expect(rate(bare(true), false)).toBeGreaterThan(rate(bare(false), false)); // off: NOMINAL
    const whet = (core: boolean) => (core ? withMod(rigBench([["whetstone", 4, 3, 1]]), 60, "drake") : rigBench([["whetstone", 4, 3, 1]]));
    expect(rate(whet(true), true)).toBeGreaterThan(rate(whet(false), true));
  });

  it("HOPPER, ROTARY, ANVIL and STEAM from the switch's data: no no-jam, no fire rate, the folded flat, no bare speed", () => {
    // HOPPER ★3 on a busy gun: it can jam now (firedShare), off it never did
    const hop = withMod(twoPress(), 60, "hopper", 0, 3);
    expect(rate(hop, true)).toBeLessThan(rate(hop, false));
    // ROTARY ★3: no 43% fire rate, no no-jam
    const rot = withMod(twoPress(), 60, "rotary", 0, 3);
    expect(rate(rot, true)).toBeLessThan(rate(rot, false));
    // ANVIL ★1 on BASTION (its mean plate 15): 125% of it (18.75) against 25 + 15 = 40 off
    const anv = withMod(heroStartBuild("bastion", 1), 70, "anvil", 0, 1);
    expect(rate(anv, true)).toBeLessThan(rate(anv, false));
    // STEAM ★1 on an unplated deck: its own rate (no bare 10%) and no NOMINAL: as no core
    const steam = withMod(furnaceBench(), 60, "steambreech");
    expect(rate(steam, true)).toBe(rate(furnaceBench(), true));
    expect(rate(steam, false)).toBeGreaterThan(rate(furnaceBench(), false));
  });

  it("TWIN TRIGGER: on, pairBonus 30% (off 25%) on two equal belts' pairs", () => {
    const b = withMod(withMod(twoPress(), 60, "twintrigger"), 61, "calibrate", 0, 3), bare = withMod(twoPress(), 61, "calibrate", 0, 3);
    const lift = (star: boolean) => rate(b, star) / rate(bare, star);
    expect(lift(true)).toBeGreaterThan(1);
    expect(lift(true)).not.toBe(lift(false));
  });
});
