// Y4 (release Y; REQ-BFG-070, REQ-BFG-046, REQ-BFG-047; DESIGN-Y section 3 rows 33-40, section 5 column g; BRIEF-Y4 S2, S3,
// the words and the bots' deck rating): with the star switch on (content.ts withStarRules), against the switch off.
// - The words: no keyword joins; LOAD TIME stays (SALVO RACK's kept sentence and the TEMPO family's line still name it);
//   BONUS DAMAGE stays (DRAKE NOZZLE's face names it); no switch-on text of the 8 names a rule that left.
//   Y7b2 (the words): LOAD TIME retired since: its row is gone and neither SALVO RACK's sentence nor TEMPO's line names it.
// - S2: TESLA ARC's SHOT tap says its arc's share of the shot's damage, read from its data (25 / 25 / 30%), in the band.
// - S3: the SMUGGLER card's NONE ON OFFER line leaves (cards.ts cardNote); the guard stays (the choice is still blocked).
// - The rating (deckRating.ts, STAR_EQ's note): SEAM WELDER on pairs only, EXT. CHAMBER's shot capped by its chamber, DRAKE
//   NOZZLE's BURN for bonus damage; HOPPER, TWIN TRIGGER, ROTARY, ANVIL and STEAM from the switch's data.
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { KEYWORDS, icons, textWidth } from "../src/render/font";
import { effectAt } from "../src/sim/stars";
import { type Build } from "../src/sim/deck";
import { drakeGain, rateDeck } from "../src/sim/deckRating";
import { faceAt, faceMerge, Y4_PIECES } from "../src/ui/faces";
import { levelLines, levelText } from "../src/screens/build/levels";
import { abilityText, cardText, clashShortText, gatlingClashText, gist } from "../src/ui/abilityText";
import { GLOSSARY, glossaryEntry, glossaryText, glossaryWordsIn, tapNote } from "../src/ui/glossary";
import { FAMILY } from "../src/ui/families";
import { fmtPct } from "../src/ui/statFormat";
import { EVENTS, type EventState } from "../src/game/eventDefs";
import { cardNote } from "../src/screens/event/cards";
import type { Run } from "../src/game/run";
import { BAND, STARS } from "./y3.helpers";
import { furnaceBench, twoPress, withMod } from "./wave3.helpers";
import { rigBench } from "./y3.helpers";

const k1 = (def: string) => (ITEMS[def].kind === "core" ? { k: 1 } : {});
/** The rows the star switch retired (glossary.ts STAR_RETIRED until the flip, Y7b2, which deleted them from the table). */
const RETIRED = ["HARASSMENT", "ONLINE", "POISON"];

describe("Y4 words: no new keyword; BONUS DAMAGE stays; Y7b2: LOAD TIME retires", () => { // Y7b2 (the words): was "...; LOAD TIME and BONUS DAMAGE stay"
  // Y7b2 (the words): was "on, ...; LOAD TIME and BONUS DAMAGE stay; the 9 keywords"
  it("on, the glossary is Y3's: only HARASSMENT retires (Y5: and ONLINE; Y6: and POISON); BONUS DAMAGE stays; Y7b2: LOAD TIME's row is gone; the 9 keywords", () => {
    // Y7b2 (the flip): was expect(STAR_RETIRED).toEqual(["HARASSMENT", "ONLINE", "POISON"]); the table holds none of them
    expect(GLOSSARY.map((r) => r.word).filter((w) => RETIRED.includes(w))).toEqual([]);
    for (const w of RETIRED) expect(glossaryEntry(w), w).toBeUndefined();
    expect([glossaryEntry("LOAD TIME")?.word, glossaryEntry("BONUS DAMAGE")?.word]).toEqual([undefined, "BONUS DAMAGE"]); // Y7b2 (the words): was ["LOAD TIME", "BONUS DAMAGE"]
    expect(KEYWORDS).toEqual(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN"]);
  });

  // Y7b2 (the words): was "why LOAD TIME stays: SALVO RACK's kept sentence and the TEMPO family's line still name it with the switch on"
  it("why LOAD TIME retires (Y7b2): neither SALVO RACK's kept sentence nor the TEMPO family's line names it; each says the wait itself", () => {
    expect(abilityText("salvo", 1, { k: 1 }).sentences.some((t) => t.includes("LOAD TIME"))).toBe(false); // Y7b2 (the words): was toBe(true)
    expect(abilityText("salvo", 1, { k: 1 }).sentences[1]).toBe("IT WAITS FOR A FULL CHAMBER, OR 3 SECONDS AFTER ITS FIRST LOAD."); // Y7b2 (the words): was "..., OR TWICE ITS LOAD TIME."
    // Y7b2 (the words): was toContain("LOAD TIME") ("WHEN THINGS HAPPEN: BELT SPEED, FIRE RATE, LOAD TIME, COMMISSIONING, PULSES AND FUSES.")
    expect(FAMILY.TEMPO.glossary).toBe("WHEN THINGS HAPPEN: BELT SPEED, FIRE RATE, HOW LONG A GUN WAITS TO FIRE, WHEN RIGS START, PULSES AND FUSES.");
  });

  it("DRAKE NOZZLE's face names BONUS DAMAGE (its glossary tap); the faces' keywords are the existing ones", () => {
    expect(glossaryWordsIn(faceAt("drake", 1)!.rules[0].text).map((r) => r.word)).toContain("BONUS DAMAGE");
    for (const def of Y4_PIECES) for (const s of STARS) {
      for (const m of faceAt(def, s, k1(def))!.rules[0].text.matchAll(/\{\*?([A-Z]+)\}/g)) {
        expect(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SLUG", "DMG"], `${def} ★${s}`).toContain(m[1]);
      }
    }
  });

  it("on, no text of the 8 names a rule that left: faces, ⓘ lines, kept sentences, gists, cards, merge lines, GATLING clashes", () => {
    // (EXT. CHAMBER's slot was its clause "★2 WIDE BREECH: HOLDS +1 {SLUG}.": the clause labels below)
    const GONE = /LOAD TIME|STORES?\b|NEVER JAMS|FLOOR|ANY OTHER LOAD|WITHOUT IT|, \d+% WITHOUT|MORE BURN|LASTS|LAND \d+% SOONER|SHORTER|\bPLUS\b|GREASED RACE:|CLEAN FEED:|WIDE BREECH:|TRIPLE BREECH:|BOTTOMLESS:/;
    // Y7b1 (ruling Y7A-R3c): ANVIL's flat is back with the switch on (its base def), so its "..., PLUS n% OF ..." names its
    // rule again: ANVIL's texts are read against GONE without \bPLUS\b (every other piece's against GONE, as before)
    const GONE_ANVIL = new RegExp(GONE.source.replace("|\\bPLUS\\b", ""));
    const texts: string[] = [], anvil: string[] = [];
    for (const def of Y4_PIECES) {
      const o = k1(def), out = def === "anvil" ? anvil : texts;
      out.push(cardText(def, o));
      for (const s of STARS) {
        const f = faceAt(def, s, o)!;
        out.push(...f.rules.map((r) => r.text), ...(f.clause ? [f.clause.text] : []), ...(f.caveats ?? []));
        out.push(...levelLines(def, s, o)!.map((l) => levelText(l, (v) => v)));
        out.push(...abilityText(def, s, o).sentences, gist(def, s, o));
        if (s > 1) out.push(faceMerge(def, s, o) ?? "");
        for (const r of ["gatling", "compound"]) out.push(gatlingClashText(def, s, r) ?? "", clashShortText(def, r) ?? "");
      }
    }
    expect(texts.length + anvil.length).toBeGreaterThan(150);
    expect(texts.filter((t) => GONE.test(t))).toEqual([]);
    expect(GONE_ANVIL.source).not.toMatch(/PLUS/);
    expect(anvil.filter((t) => GONE_ANVIL.test(t))).toEqual([]);
    expect([gatlingClashText("hopper", 1), gatlingClashText("twintrigger", 2, "compound"), clashShortText("hopper")]).toEqual([null, null, null]);
  });

  it("on, the 8's kept sentences, gists and cards say the new rules", () => {
    expect(abilityText("hopper", 2).sentences).toEqual(["THE TURRET'S CHAMBER HOLDS 2 MORE LOADS."]);
    expect([gist("hopper", 3), cardText("hopper")]).toEqual(["HOLDS 3 MORE LOADS", "CHAMBER HOLDS 1 MORE LOAD."]);
    expect(abilityText("twintrigger", 3).sentences[0]).toBe("PAIRED LOADS IN THIS TURRET DEAL 95% MORE DAMAGE.");
    expect(abilityText("twintrigger", 1).sentences).toHaveLength(2); // + PAIR's definition
    expect(gist("twintrigger", 2)).toBe("PAIRS DEAL 60% MORE");
    expect(abilityText("seamwelder", 1).sentences[0]).toBe("EACH PAIR THIS TURRET TAKES ROLLS 10 PLATING ONTO YOUR HULL.");
    expect(gist("seamwelder", 3)).toBe("35 PLATING A PAIR");
    // Y7b1 (Y7A-R2): was [["THE TURRET FIRES 4 LOADS EACH SHOT."], "FIRES 3 LOADS A SHOT"] (false on a 2-load gun)
    expect([abilityText("chamber", 3).sentences, gist("chamber", 2)]).toEqual([["THE TURRET FIRES UP TO 4 LOADS EACH SHOT.", "A SHOT NEVER FIRES MORE THAN ITS GUN'S CHAMBER HOLDS."], "FIRES UP TO 3 LOADS A SHOT"]);
    expect(abilityText("rotary", 2, { k: 1 }).sentences).toEqual(["IT FIRES A PART-FULL CHAMBER 65% SOONER, THE OLDEST LOAD FIRST."]);
    expect([gist("rotary", 3, { k: 1 }), cardText("rotary", { k: 1 })]).toEqual(["PART-FULL CHAMBERS 80% SOONER", "PART-FULL CHAMBERS 50% SOONER."]);
    // Y7b1 (Y7A-R3c): was "EACH SHOT DEALS 438% OF THE PLATING ON YOUR HULL AS MORE DAMAGE." and "125% OF YOUR PLATING AS DAMAGE"
    expect(abilityText("anvil", 3, { k: 1 }).sentences[0]).toBe("EACH SHOT DEALS 88 MORE DAMAGE, PLUS 350% OF THE PLATING ON YOUR HULL.");
    expect(gist("anvil", 1, { k: 1 })).toBe("25 MORE DAMAGE, PLUS 100% OF YOUR PLATING");
    expect(abilityText("steambreech", 1, { k: 1 }).sentences).toEqual(["THE TURRET FIRES 40% FASTER WHILE YOUR HULL HOLDS PLATING."]);
    expect(gist("steambreech", 3, { k: 1 })).toBe("120% FASTER PLATED");
    expect(abilityText("drake", 2, { k: 1 }).sentences).toEqual([
      "TURNS EACH SHOT'S BONUS DAMAGE INTO BURN: 1 BURN FOR EVERY 18 DAMAGE.", "BONUS DAMAGE IS WHAT RIGS AND SCRAP ADD TO A PAYLOAD."]); // Y7b1 (Y7A-R4's fallback): was EVERY 7 DAMAGE
  });
});

describe("Y4 S2: TESLA ARC's tap note (REVIEW-Y1 ruling 3)", () => {
  it("on, its SHOT tap says each arc deals its share of the shot's damage, 25 / 25 / 30%, from its data, in one line of the band", () => {
    for (const s of STARS) {
      const share = fmtPct(effectAt("tesla", s).core!.share!);
      const t = glossaryText("SHOT", { def: "tesla", stars: s, o: { k: 1 } })!;
      expect(t, `★${s}`).toBe(`SHOT: EACH ARC DEALS ${share} OF THE SHOT'S {DMG}.`);
      expect(share).toBe(["25%", "25%", "30%"][s - 1]);
      expect(textWidth(icons(t)), t).toBeLessThanOrEqual(BAND);
    }
    // the face keeps its lone {DMG}25% stat and its line (Y1)
    expect(faceAt("tesla", 1, { k: 1 })!.stats).toEqual([["DMG", "25%"]]);
  });

  it("its note sits on SHOT (tapNote)", () => { // Y7b2 (the flip): was "off, no note: the SHOT row's text, as before"
    expect(tapNote("tesla", "SHOT")?.word).toBe("SHOT");
  });
});

describe("Y4 S3: the SMUGGLER card's NONE ON OFFER line leaves; the guard stays", () => {
  // an old save's run that drew no BURN or SHOCK ware (since FIX-ABE no real run does): both choices are empty
  const ev: EventState = { day: 3, id: "smuggler", roll: 0.5, pick: 0.5, picked: -1 };
  const oldSave = { wares: {}, day: 3 } as unknown as Run;
  const choices = () => EVENTS.smuggler.choices(oldSave, ev);

  it("on, a SMUGGLER choice with none on offer is still blocked (the guard) but its card draws no line (off: NONE ON OFFER)", () => {
    const [burnOn, shockOn] = choices();
    for (const c of [burnOn, shockOn]) expect([c.blocked, c.quiet, cardNote(c)]).toEqual(["NONE ON OFFER", true, undefined]);
  });

  it("on, a run with wares of both effects offers both, unblocked, as before; the pools are untouched", () => {
    const run = { day: 3 } as unknown as Run; // a run without wares keeps the whole pool (eventDefs.ts inWares)
    const [b, s] = EVENTS.smuggler.choices(run, ev);
    expect([b.blocked, s.blocked, b.quiet, s.quiet]).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe("Y4: the bots' deck rating prices each new rule (behind the switch)", () => {
  const rate = (b: Build) => rateDeck(b).offense;

  it("SEAM WELDER: on, pairs only: on one belt it rates as no SEAM (off: its NOMINAL credit); on two equal belts it pays", () => {
    const one = withMod(furnaceBench(), 60, "seamwelder");
    expect(rate(one)).toBe(rate(furnaceBench()));
    const two = withMod(withMod(twoPress(), 60, "seamwelder"), 61, "calibrate", 0, 3), bare = withMod(twoPress(), 61, "calibrate", 0, 3);
    expect(rate(two)).toBeGreaterThan(rate(bare));
  });

  it("EXT. CHAMBER: on, a shot fires at most the chamber: ★2 (3) and ★3 (4) rate alike on a saturated 3-load gun (off they differ)", () => {
    // two SHOT TOWERs' buckshot into the SCRAP CANNON: more loads arrive than 3 a second, so its shot size is its cap
    const at = (s: number, hopper = false) => {
      const b = withMod(twoPress(), 60, "chamber", 0, s);
      b.items = b.items.map((p) => (p.uid === 2 || p.uid === 3 ? { ...p, def: "shottower" } : p));
      return hopper ? withMod(b, 61, "hopper", 0, 1) : b;
    };
    expect(rate(at(3))).toBe(rate(at(2)));
    // with a HOPPER the chamber holds 4, and ★3's 4 a shot counts
    expect(rate(at(3, true))).toBeGreaterThan(rate(at(2, true)));
  });

  it("DRAKE NOZZLE: on, its BURN for each flatPerBurn of bonus damage (drakeGain), no NOMINAL: nothing without bonus damage", () => {
    const spec = (s: number) => effectAt("drake", s).core!;
    // Y7b1 (Y7A-R4's fallback: 25/18/13): was [2 * 30 - 20, 2 * 30 - 14, 4 * 30 - 20] at 10/7/5. A BURN stack is worth
    // BURN_TIME x BURN_DPS = 30, so each stack gains 30 - 25 / 30 - 18 / 30 - 13 (at 38/27/19, tried first, ★1 lost 8 a stack)
    expect(STARS.map((s) => drakeGain(spec(s), 20))).toEqual([0, 30 - 18, 30 - 13]);
    expect(STARS.map((s) => drakeGain(spec(s), 76))).toEqual([3 * 30 - 75, 4 * 30 - 72, 5 * 30 - 65]);
    const bare = (core: boolean) => (core ? withMod(furnaceBench(), 60, "drake") : furnaceBench());
    expect(rate(bare(true))).toBe(rate(bare(false)));
    // Y7b1 (Y7A-R4's fallback): a ★3 DRAKE (13) past the +20 WHETSTONE (was ★1 at 10, whose 25 now turns none of the 20 into BURN)
    const whet = (core: boolean, s = 3) => (core ? withMod(rigBench([["whetstone", 4, 3, 1]]), 60, "drake", 0, s) : rigBench([["whetstone", 4, 3, 1]]));
    expect(rate(whet(true))).toBeGreaterThan(rate(whet(false)));
    expect(rate(whet(true, 1))).toBe(rate(whet(false)));
  });

  it("HOPPER, ROTARY, ANVIL and STEAM from the switch's data: no no-jam, no fire rate, the folded flat, no bare speed", () => {
    // STEAM ★1 on an unplated deck: its own rate (no bare 10%) and no NOMINAL: as no core
    const steam = withMod(furnaceBench(), 60, "steambreech");
    expect(rate(steam)).toBe(rate(furnaceBench()));
  });

  it("TWIN TRIGGER: on, pairBonus 30% (off 25%) on two equal belts' pairs", () => {
    const b = withMod(withMod(twoPress(), 60, "twintrigger"), 61, "calibrate", 0, 3), bare = withMod(twoPress(), 61, "calibrate", 0, 3);
    const lift = () => rate(b) / rate(bare);
    expect(lift()).toBeGreaterThan(1);
  });
});
