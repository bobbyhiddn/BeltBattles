// Y3 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y 1.2, section 3 rows 20-32 and section 5 column g): THE WORDS and THE
// BOTS' DECK RATING of the 13 rigs with the star switch on (content.ts STAR_RULES, withStarRules).
// - No new keyword. ONLINE stays (Y5: it retires): ASSEMBLY LINE's texts say START, but POWDER KEG's kept sentence (Y5's piece)
//   and the QUICK LATCH rune still name ONLINE with the switch on (Y5: no more). MATCHED (TWIN GAUGE's face) is a row already.
// - No switch-on text of the 13 (faces, ⓘ lines, kept sentences, gists, cards, the belt timeline, SURGE's tap) names a
//   floor, cap, caveat or clause that left; the new kept sentences and cards say the new rules.
// - The rating prices each new rule (deckRating.ts, behind the switch): the OVERCLOCKER by the rig it charges, STOKER with
//   no cap, and the walk's floors, caps and pulses; off, every rating as before.
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { rigHits, type Build } from "../src/sim/deck";
import { chargeGains, rateDeck, stokeKeep } from "../src/sim/deckRating";
import { doubles } from "../src/sim/overclock";
import { effectAt } from "../src/sim/stars";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { RUNES } from "../src/sim/runes";
import { GLOSSARY, glossaryEntry, glossaryRows, glossaryText, glossaryWordsIn, GLOSSARY_WRAP_W } from "../src/ui/glossary";
import { abilityText, cardText, gist, hitText, mergesWithText } from "../src/ui/abilityText";
import { faceAt, Y3_PIECES } from "../src/ui/faces";
import { levelLines, levelText } from "../src/screens/build/levels";
import { KEYWORDS, icons, textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { colourize, wrapRich } from "../src/ui/richText";
import { STARS, rigBench } from "./y3.helpers";
import { item, withItem } from "./wave3.helpers";
import { withLadderFix } from "../src/sim/ladderFix"; // AZ-BUMP (the flip, LADDER_FIX): bb-0.9.7's QUENCH ★1 beside the shipped one
import { SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling rules ship on (POISON is a keyword again; `quench` is KINDLING)

/** The words a switch-on text of the 13 may never say: each names a floor, cap, caveat, clause or rule that left. */
const GONE = /UP TO \d+ BURN|UP TO \d+ HITS|MAX \d+ RIGS|MAX \d+ \{?FRAY|HOLD \d+ FRAY|ELSE|NEVER OUTRUN|CAN'T DOUBLE|THAT CAN BE DOUBLED|SIFTER|SURGE \d|TIMES AS FAST|PULSES ITS BELTS|SPEEDS UP|LETS GO GAINS|TWICE AS HARD|ONLINE|TO EACH PAYLOAD IT HITS, (OR|AND)|UP TO \d+ OF ITS BURN|ANY MORE BURN STAYS|NO PLATING TO TAKE|RAZOR WIRE:|HOT SHOE:|HOT START:|FOR \d+\{SEC\}, \+/;
/** The rows the star switch retired (glossary.ts STAR_RETIRED until the flip, Y7b2, which deleted them from the table). */
const RETIRED = ["HARASSMENT", "ONLINE", "POISON"];

describe("Y3 words: no new keyword; ONLINE stays (KEG, QUICK LATCH; Y5: it retires); MATCHED is a row", () => {
  it("on, the glossary is Y2's: only HARASSMENT retires (Y5: and ONLINE; Y6: and POISON); MATCHED stays, and no keyword joins", () => {
    // BUMP-1E: the scaling rules ship on (SCALE_RIGS, bb-0.12.0), where POISON is a keyword again (SCALE-2b: VENOM DRIP's POISON; its
    // glossary row and its KEYWORDS entry, the 10th, join while the switch is on). The checks below hold the 0.9.11 world's POISON
    // retired and the keywords the 9, so they are read with the switch off (withScaleRigs(fn, false), synchronously); the shipped
    // world's is the second half
    withScaleRigs(() => {
      // Y7b2 (the flip): was expect(STAR_RETIRED).toEqual(["HARASSMENT", "ONLINE", "POISON"]); the table holds none of them
      expect(GLOSSARY.map((r) => r.word).filter((w) => RETIRED.includes(w))).toEqual([]);
      for (const w of RETIRED) expect(glossaryEntry(w), w).toBeUndefined();
      expect(glossaryRows().map((r) => r.word)).toEqual(GLOSSARY.map((r) => r.word).filter((w) => w !== "HARASSMENT" && w !== "ONLINE" && w !== "POISON")); // Y6 (BRIEF-Y6): was .filter((w) => w !== "HARASSMENT" && w !== "ONLINE"); Y5 (ruling 882ecc77): was .filter((w) => w !== "HARASSMENT")
      expect(glossaryEntry("ONLINE")).toBeUndefined(); // Y5 (ruling 882ecc77): was ?.word).toBe("ONLINE")
      expect(glossaryEntry("MATCHED BELT")?.word).toBe("MATCHED");
      expect(glossaryRows().filter((r) => r.kw).map((r) => r.word)).toEqual(GLOSSARY.filter((r) => r.kw).map((r) => r.word));
      expect([...KEYWORDS]).toEqual(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN"]); // the 9, as before
    }, false);
    // BUMP-1E: the shipped world: HARASSMENT and ONLINE stay retired; POISON is a glossary row and a keyword (the 10th, after REGEN)
    expect(SCALE_RIGS).toBe(true);
    expect(GLOSSARY.map((r) => r.word).filter((w) => RETIRED.includes(w))).toEqual(["POISON"]); // BUMP-1E: was []
    for (const w of ["HARASSMENT", "ONLINE"]) expect(glossaryEntry(w), w).toBeUndefined();
    expect(glossaryEntry("POISON")?.kw).toBe("POISON"); // BUMP-1E: was toBeUndefined()
    expect(glossaryRows().map((r) => r.word)).toEqual(GLOSSARY.map((r) => r.word).filter((w) => w !== "HARASSMENT" && w !== "ONLINE"));
    expect(glossaryEntry("MATCHED BELT")?.word).toBe("MATCHED");
    expect(glossaryRows().filter((r) => r.kw).map((r) => r.word)).toEqual(GLOSSARY.filter((r) => r.kw).map((r) => r.word));
    expect([...KEYWORDS]).toEqual(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN", "POISON"]); // BUMP-1E: the 9 and POISON
  });

  it("why ONLINE stayed (Y5: it retires): with the switch on neither POWDER KEG's kept sentence nor the QUICK LATCH rune's line names it (Y5; the rune's def text still does); none of the 13's texts do", () => {
    expect(abilityText("keg", 1).sentences.some((t) => glossaryWordsIn(t).some((r) => r.word === "ONLINE"))).toBe(false); // Y5 (ruling 882ecc77): was toBe(true)
    expect(JSON.stringify(RUNES.quick_latch)).toMatch(/ONLINE/); // its text: "YOUR {BELT} RIGS: ONLINE {N} SOONER."
    for (const def of Y3_PIECES) for (const s of STARS) {
      const texts = [...abilityText(def, s).sentences, gist(def, s), cardText(def), ...faceAt(def, s)!.rules.map((r) => r.text)];
      for (const t of texts) expect(glossaryWordsIn(t).map((r) => r.word), `${def} ★${s}: ${t}`).not.toContain("ONLINE");
    }
  });

  it("TWIN GAUGE's face taps MATCHED; the faces' keywords are the existing ones", () => {
    // WORDS-1 (REQ-BFG-081; READ-1 6.1, round D: the call is to reword, not to tap): TWIN GAUGE's face says it in plain words
    // and names no MATCHED (was toContain("MATCHED")); the MATCHED row stays for the belt panel's notice and kept sentences
    expect(glossaryWordsIn(faceAt("twingauge", 1)!.rules[0].text).map((r) => r.word)).not.toContain("MATCHED");
    expect(glossaryEntry("MATCHED")?.word).toBe("MATCHED");
    for (const def of Y3_PIECES) for (const s of STARS) {
      for (const r of faceAt(def, s)!.rules) for (const m of r.text.matchAll(/\{\*([A-Z]+)\}/g)) expect(KEYWORDS as readonly string[], `${def}: ${m[1]}`).toContain(m[1]);
    }
  });
});

describe("Y3 words: the 13's texts say the new rules with the switch on", () => {
  it("on, no face, ⓘ line, kept sentence, gist, merge line or card of the 13 names a rule that left", () => {
    for (const def of Y3_PIECES) for (const s of STARS) {
      const texts = [...faceAt(def, s)!.rules.map((r) => r.text), ...levelLines(def, s)!.map((l) => levelText(l)), ...abilityText(def, s).sentences,
        gist(def, s), cardText(def), ...(s > 1 ? [mergesWithText(def, s)] : [])];
      for (const t of texts) expect(t, `${def} ★${s}`).not.toMatch(GONE);
    }
  });

  it("on, the new kept sentences, gists and cards", () => {
    expect(abilityText("pincer", 1).sentences[0]).toBe("ADDS 20 DAMAGE TO EACH PAYLOAD IT HITS FOR EACH OTHER RIG HITTING THAT TILE.");
    expect(abilityText("twingauge", 2).sentences[0]).toBe("ADDS 66 DAMAGE TO EACH PAYLOAD IT HITS ON A MATCHED BELT.");
    expect(abilityText("bellows", 3).sentences[0]).toBe("ADDS 3 BURN FOR EACH 2 SECONDS THE PAYLOAD HAS RIDDEN.");
    // AZ-BUMP (the flip, LADDER_FIX): 30 -> 40, the star-ladder pass's QUENCH ★1 (40 a BURN); off, 30
    // BUMP-1E: QUENCH TANK's sentence is the scaling rules' switch-off world's (the shipped `quench` is KINDLING, below)
    withScaleRigs(() => {
      expect(abilityText("quench", 1).sentences[0]).toBe("TURNS EACH BURN ON THE PAYLOADS IT HITS INTO 40 DAMAGE.");
      expect(withLadderFix(() => abilityText("quench", 1).sentences[0], false)).toBe("TURNS EACH BURN ON THE PAYLOADS IT HITS INTO 30 DAMAGE.");
    }, false);
    expect(abilityText("quench", 1).sentences[0]).toBe("EACH PAYLOAD IT HITS GAINS 3 DAMAGE FOR EACH FOE BURN."); // BUMP-1E: KINDLING's (was "TURNS EACH BURN ON THE PAYLOADS IT HITS INTO 40 DAMAGE.")
    expect(abilityText("longhaul", 3).sentences[0]).toBe("ADDS 35 DAMAGE FOR EACH EARLIER RIG HIT.");
    expect(abilityText("barbed", 3).sentences[0]).toBe("ADDS 3 FRAY TO EACH PAYLOAD IT HITS.");
    expect(abilityText("platebreaker", 1).sentences).toEqual(["EACH PAYLOAD IT HITS TAKES 10 SHIELD FROM YOUR HULL AND GAINS 40 DAMAGE.", "WITH LESS SHIELD THAN THAT, IT ADDS NOTHING."]);
    expect(abilityText("brake", 2).sentences[0]).toBe("SLOWS THE BELT PAST IT TO 40% SPEED.");
    expect(abilityText("surge", 3).sentences).toEqual(["EVERY 2 SECONDS, EACH PAYLOAD ON THE BELTS IT HITS GAINS 30 DAMAGE.", "PAYLOADS BEFORE ITS TILE GET IT TOO."]);
    expect(abilityText("overclocker", 1).sentences.slice(1)).toEqual(["THE NEXT RIG IS THE FIRST LATER RIG ON ITS BELT, WHATEVER IT IS.", "A RIG WITH NOTHING TO DOUBLE USES UP THE CHARGE."]);
    expect(abilityText("twinlatch", 2).sentences).toHaveLength(3);
    // TXT-096 (REVIEW-TXT095 Q2): the hold limit opens the first sentence (UP TO 2 SECONDS), so the second no longer repeats it
    // (was "IT HOLDS A PAYLOAD AT THE TILE IT HITS, AT MOST 2 SECONDS, AND ONLY WHEN BOTH ITS ARROWS HIT BELTS.")
    expect(abilityText("twinlatch", 2).sentences.slice(0, 2)).toEqual([
      "HOLDS EACH PAYLOAD UP TO 2 SECONDS UNTIL ITS OTHER BELT BRINGS ONE, THEN LETS THEM GO SO THEY REACH THE GUN TOGETHER.",
      "IT HOLDS A PAYLOAD AT THE TILE IT HITS, AND ONLY WHEN BOTH ITS ARROWS HIT BELTS."]);
    expect(abilityText("stoker", 1).sentences[1]).toBe("IT NEVER MAKES A FACTORY OUTRUN ITS GUN."); // Y7b1 (Y7A-R1): was "A FACTORY IT STOKES MAY FEED ITS GUN MORE THAN IT TAKES, AND JAM IT."
    expect(abilityText("assembly", 1).sentences[0]).toBe("WHILE IT FEEDS A TURRET, YOUR RIGS START WORKING 50% SOONER, THOSE ON ITS OWN BELT TOO.");
    expect(abilityText("assembly", 3).sentences[0]).toBe("WHILE IT FEEDS A TURRET, ALL YOUR RIGS START WORKING AT ONCE, THOSE ON ITS OWN BELT TOO.");
    expect(abilityText("assembly", 3).perk).toEqual(undefined); // Y7b2 (the words): was .toEqual({ name: "HOT START", stars: 3, after: 0 }) (the name stayed: R-1, the ⓘ view and the desk's); it left with its rule
    expect(["pincer", "twingauge", "bellows", "surge", "assembly"].map((d) => cardText(d))).toEqual([
      // WORDS-1 (REQ-BFG-081): TWIN GAUGE's card in plain words (was "DAMAGE ON A MATCHED BELT.")
      // CARD-3 (REQ-BFG-081, D3): PINCER's and ASSEMBLY LINE's desk lines say their faces' words
      "DAMAGE FOR OTHER RIGS HITTING IT.", "DAMAGE IF ANOTHER BELT IS AS LONG.", "BURN FOR RIDE TIME.", "PULSES 10 DAMAGE ONTO ITS BELTS.", "FEEDS A GUN: ALL RIGS START 50% SOONER."]);
    expect(["quench", "brake", "twinlatch", "platebreaker", "surge"].map((d) => gist(d, 2))).toEqual([
      "5 DAMAGE FOR EACH FOE BURN", // BUMP-1E: KINDLING's (the shipped `quench`, ★2 +5 a BURN on the foe); was "50 DAMAGE FOR EACH BURN", QUENCH TANK's
      "40% SPEED", "HOLDS UP TO 2 SECONDS", "88 DAMAGE FOR 10 SHIELD", "20 DAMAGE EVERY 3 SECONDS"]);
    expect(withScaleRigs(() => gist("quench", 2), false)).toBe("50 DAMAGE FOR EACH BURN"); // BUMP-1E: QUENCH TANK's, the switch-off world's
  });

  it("on, the belt timeline says the new rules (hitText)", () => {
    const row = (def: string, stars: number, extra: object = {}) => ({ uid: 1, def, dir: 1, stars, tier: 1, ...extra }) as never;
    expect(hitText(row("surge", 1, { flat: 8.7 }), "free")).toBe("SURGE VALVE +10 DAMAGE EVERY 3 SEC");
    expect(hitText(row("surge", 3), "slag")).toBe("SURGE VALVE +30 DAMAGE EVERY 2 SEC");
    expect(hitText(row("surge", 1), "locked")).toBe("SURGE VALVE +10 DAMAGE EVERY 3 SEC");
    expect(hitText(row("twingauge", 1, { flat: 0, matched: false }), "free")).toBe("TWIN GAUGE: NO EFFECT ON AN UNMATCHED BELT");
    expect(hitText(row("twingauge", 1, { flat: 30, matched: true }), "free")).toBe("TWIN GAUGE +30 DAMAGE ON A MATCHED BELT");
    expect(hitText(row("pincer", 1, { flat: 0, others: 0 }), "free")).toBe("PINCER: NO OTHER RIG ON ITS TILE");
    expect(hitText(row("pincer", 2, { flat: 44, others: 1 }), "free")).toBe("PINCER +44 DAMAGE, CROSSFIRE WITH 1 RIG");
    expect(hitText(row("twinlatch", 3, { flat: 0 }), "free")).toBe("TWIN LATCH HOLDS UP TO 3 SEC");
    expect(hitText(row("platebreaker", 1, { flat: 0 }), "free")).toBe("SHIELD FUEL +40 DAMAGE FOR 10 SHIELD"); // PLAIN-1F (M6, M8): the name (was PLATE BREAKER)
    expect(hitText(row("brake", 3), "free")).toBe("BRAKE SHOE AT 30% SPEED"); // Y7b2 (the words): was "BRAKE SHOE 70% SLOWER"
    expect(hitText(row("longhaul", 2, { flat: 160, prior: 8 }), "free")).toBe("LONG HAUL +160 DAMAGE (8 HITS BEFORE)");
    for (const def of Y3_PIECES.filter((d) => ITEMS[d].kind === "gate")) for (const s of STARS) {
      expect(hitText(row(def, s, { flat: 1, others: 1, matched: true }), "free"), `${def} ★${s}`).not.toMatch(GONE);
    }
  });

  it("on, SURGE VALVE's tap on EVERY says the damage pulse, in 2 lines of 5x7 at 225 px (off: the speed pulse)", () => {
    const tap = () => glossaryText("EVERY", { def: "surge", stars: 1 })!;
    expect(tap()).toBe("EVERY 3{SEC}: EACH SLUG ON ITS BELTS GETS IT, BEFORE ITS TILE TOO.");
    expect(wrapRich(colourize(icons(tap()), C.bone), GLOSSARY_WRAP_W, "5").length).toBeLessThanOrEqual(2);
    expect(textWidth(icons(tap()))).toBeLessThanOrEqual(2 * GLOSSARY_WRAP_W);
  });
});

describe("Y3 the bots' deck rating prices each new rule (switch on; off as before)", () => {
  const offense = (b: Build) => rateDeck(b).offense;

  it("OVERCLOCKER: on, worth its EQ only when the rig it charges (the next, whatever it is) doubles something", () => {
    const greaseNext = rigBench([["overclocker", 4, 4, 1], ["grease", 4, 3, 1], ["whetstone", 4, 2, 1]]);
    const whetNext = rigBench([["overclocker", 4, 4, 1], ["whetstone", 4, 3, 1]]);
    const hit0 = (b: Build) => { const h = rigHits(b); return { tiles: h[0], oc: h[0].flat().find((x) => x.def === "overclocker")! }; };
    const g = hit0(greaseNext), w = hit0(whetNext);
    expect([chargeGains(greaseNext, g.tiles, g.oc), chargeGains(whetNext, w.tiles, w.oc)]).toEqual([false, true]);
    expect(doubles(effectAt("twinlatch", 1).gate!)).toBe(false); // the flat-less latch has nothing to double
    expect(doubles(effectAt("pincer", 1).gate!)).toBe(true);
    // the charge spent on the GREASE WORKS is worth nothing on: the deck rates as without the OVERCLOCKER (off: more)
    const noOc = rigBench([["grease", 4, 3, 1], ["whetstone", 4, 2, 1]]);
    expect(offense(greaseNext)).toBeCloseTo(offense(noOc), 9);
  });

  // Y7b1 (ruling Y7A-R1): was "STOKER: on, no cap: the inspector's capped line (stokeKeep) is gone and the stoked feed arrives
  // in full (off: held to its gun)", with on stokeKeep size 0 and the on offense not close to off's
  it("STOKER: on, the cap holds as off (Y7A-R1): the inspector's capped line (stokeKeep) is there and the stoked feed is held to its gun", () => {
    const stoked = (s: number) => withItem(heroStartBuild("furnace", 1), item(70, "stoker", 6, 6, 0, s));
    for (const s of [2, 3]) {
      expect(stokeKeep(stoked(s)).size, `★${s}`).toBe(1);
    }
  });
});
