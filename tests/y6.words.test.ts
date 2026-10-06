// Y6 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y section 4.1 and section 5's Y6 row; REVIEW-STARD rule 6; BRIEF-Y6
// words and rating): THE WORDS and THE BOTS' DECK RATING of VENOM DRIP's BURN length, with the star switch on (content.ts
// STAR_RULES, withStarRules).
// - POISON retires (glossary.ts STAR_RETIRED): with the switch on no text names it. Swept with a plain /\bPOISON\b/ (once
//   POISON is retired, glossaryWordsIn finds nothing by design, so it would prove nothing): every piece's face, ⓘ lines,
//   kept sentences, gists, cards, clashes and belt-timeline rows at ★1-★3; every rune line as drawn, its text and its
//   reminder; the tap notes as tapNote gives them; the family lines; the glossary's rows. Not swept: VENOM's catalogue desc
//   (content.ts; no panel draws it: flavour.ts KEPT_FLAVOUR venom []) and richText.ts's POISON colour, both the off path's.
// - No new keyword. VENOM's kept sentences, gist, card and timeline row say BURN's seconds; the PLATE sentence drops "AND
//   POISON" (abilityText.ts S_PLATING); SPLITTER's, COMPOUND BREECH's and WARD BELL's sentences, SPLITTER's tap
//   (STAR_TAP_NOTES) and the FORGE family line (families.ts) drop it. Off, every text the base's byte for byte.
// - The rating (deckRating.ts, behind the switch): EQ.poison's term becomes burnPlusGain, its seconds x BURN_DPS x the BURN
//   stacks the belt's slugs carry (the walk's estimate.burn); with no BURN, VENOM rates as nothing.
import { describe, expect, it } from "vitest";
import { BURN_DPS, ITEMS } from "../src/sim/content";
import type { Build, TimelineHit } from "../src/sim/deck";
import { burnPlusGain, chargeGains, rateDeck, type RateOut } from "../src/sim/deckRating";
import { rigHits } from "../src/sim/deck";
import { effectAt, fusible } from "../src/sim/stars";
import { RUNES } from "../src/sim/runes";
import { faceAt } from "../src/ui/faces";
import { abilityText, cardText, clashShortText, gatlingClashText, gist, hasAbilityText, hitText, S } from "../src/ui/abilityText";
import { GLOSSARY, GLOSSARY_WRAP_W, TAP_NOTES, glossaryEntry, glossaryRows, glossaryText, glossaryWordsIn, tapNote } from "../src/ui/glossary";
import { FAMILY } from "../src/ui/families";
import { runeLine, runeReminder, runeTextOf } from "../src/ui/runeText";
import { colourize, wrapRich } from "../src/ui/richText";
import { levelLines, levelText } from "../src/screens/build/levels";
import { KEYWORDS, icons, textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { STARS, rigBench } from "./y3.helpers";

const POISON = /\bPOISON\b/;
const k1 = (def: string) => (ITEMS[def].kind === "core" ? { k: 1 } : {});
/** The rows the star switch retired (glossary.ts STAR_RETIRED until the flip, Y7b2, which deleted them from the table). */
const RETIRED = ["HARASSMENT", "ONLINE", "POISON"];

/** Every text the game can show for piece `def` at ★`s` with the switch as it is: its face (rules, clause, caveats,
 *  reminders), its ⓘ LEVELS lines, its kept sentences, gist and card, its GATLING/COMPOUND clashes, and, for a rig, its
 *  belt-timeline rows. */
function pieceTexts(def: string, s: number): string[] {
  const out: string[] = [];
  const f = faceAt(def, s, k1(def));
  if (f) out.push(...f.rules.map((r) => r.text), ...(f.clause ? [f.clause.text] : []), ...(f.caveats ?? []), ...f.reminders);
  if (fusible(def)) for (const l of levelLines(def, s, k1(def)) ?? []) out.push(levelText(l));
  if (hasAbilityText(def)) out.push(...abilityText(def, s, k1(def)).sentences, gist(def, s, k1(def)), cardText(def, k1(def)));
  if (ITEMS[def].kind === "mod" || ITEMS[def].kind === "core") for (const r of ["gatling", "compound"]) out.push(gatlingClashText(def, s, r) ?? "", clashShortText(def, r) ?? "");
  if (ITEMS[def].kind === "gate") for (const belt of ["free", "locked", "slag"] as const) out.push(hitText({ def, stars: s } as TimelineHit, belt));
  return out;
}

/** Every tap note as tapNote hands it out, for each piece and word TAP_NOTES holds (STAR_TAP_NOTES folded in at the flip,
 *  Y7b2), at ★`s`. */
function tapTexts(s: number): [string, string][] {
  const out: [string, string][] = [];
  for (const def of Object.keys(TAP_NOTES)) {
    const n = tapNote(def, TAP_NOTES[def].word);
    if (n) out.push([def, n.text(effectAt(def, s), { stars: s, k: 1 })]);
  }
  return out;
}

/** The sweep: every text above, every rune's, every tap's, the family lines and the glossary's rows, with the switch as it
 *  is; returns the ones naming POISON and how many texts it read. */
function sweep(): { hits: string[]; n: number } {
  const hits: string[] = [];
  let n = 0;
  const look = (where: string, t: string) => { n++; if (POISON.test(t)) hits.push(`${where}: ${t}`); };
  for (const def of Object.keys(ITEMS)) for (const s of STARS) for (const t of pieceTexts(def, s)) look(`${def} ★${s}`, t);
  for (const r of Object.values(RUNES)) for (const t of [runeLine(r), runeTextOf(r), runeReminder(r)]) look(`rune ${r.id}`, t);
  for (const s of STARS) for (const [def, t] of tapTexts(s)) look(`tap ${def} ★${s}`, t);
  for (const fam of Object.values(FAMILY)) look(`family ${fam.tag}`, fam.glossary);
  for (const r of glossaryRows()) for (const t of [r.def, r.extra ?? ""]) look(`row ${r.word}`, t);
  return { hits, n };
}

// ---------------------------------------------------------------------------------------------- the words
describe("Y6 words: POISON retires; no new keyword", () => {
  it("RETIRED holds POISON (after HARASSMENT and ONLINE); on, no POISON row, entry, alias or tap (off: as before)", () => {
    // Y7b2 (the flip): was expect(STAR_RETIRED).toEqual(["HARASSMENT", "ONLINE", "POISON"]); the table holds none of them
    expect(GLOSSARY.map((r) => r.word).filter((w) => RETIRED.includes(w))).toEqual([]);
    for (const w of RETIRED) expect(glossaryEntry(w), w).toBeUndefined();
    expect(glossaryRows().map((r) => r.word)).not.toContain("POISON");
    for (const w of ["POISON", "POISONED"]) expect(glossaryEntry(w), w).toBeUndefined();
    expect(glossaryWordsIn("THE POISON CLEARS AFTER THE LAST POISONED HIT.")).toEqual([]);
    expect(glossaryText("POISON")).toBeUndefined();
    // every other row stays, in order
    expect(glossaryRows().map((r) => r.word)).toEqual(GLOSSARY.map((r) => r.word).filter((w) => !RETIRED.includes(w)));
    // no keyword joins: the 9, as before
    expect([...KEYWORDS]).toEqual(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN"]);
  });

  it("the sweep: on, no text names POISON (faces, ⓘ, kept sentences, gists, cards, clashes, timeline rows at ★1-★3; runes; taps; family lines; rows)", () => {
    const onS = sweep();
    expect(onS.hits).toEqual([]);
    expect(onS.n).toBeGreaterThan(2000);
  });
});

// ------------------------------------------------------------------------------- the texts with the switch on
describe("Y6 texts: VENOM says BURN's seconds; the lines that named POISON drop it (off: byte for byte as before)", () => {
  it("VENOM: its kept sentences, gist, card and belt-timeline row (off: its POISON texts)", () => {
    for (const s of STARS) {
      const n = [3, 6, 9][s - 1];
      expect(abilityText("venom", s).sentences).toEqual([
        `EACH BURN ON THE PAYLOADS IT HITS LASTS ${n} SECONDS LONGER.`, "IT ADDS NO BURN OF ITS OWN.", S.burn,
      ]);
      expect(gist("venom", s)).toBe(`BURN LASTS ${n} SECONDS LONGER`);
      expect([hitText({ def: "venom", stars: s } as TimelineHit, "free"), hitText({ def: "venom", stars: s } as TimelineHit, "locked")])
        .toEqual([`VENOM DRIP +${n} SEC TO EACH BURN`, `VENOM DRIP +${n} SEC TO EACH BURN`]); // Y7b2 (the words): was [`VENOM DRIP: ITS BURN LASTS +${n} SEC`, `VENOM DRIP: ITS BURN LASTS +${n} SEC`]
    }
    expect(cardText("venom")).toBe("BURN LASTS 3 SECONDS LONGER.");
    expect(S.burn).toBe("EACH BURN DEALS THE ENEMY HULL 10 DAMAGE A SECOND FOR 3 SECONDS.");
  });

  it("the PLATE sentence drops AND POISON (S.plating) in all five pieces that say it", () => {
    expect(S.plating).toBe("PLATING TAKES DAMAGE AND BURN BEFORE YOUR HULL, UP TO 240 PLATING; THE DARK WIND GOES STRAIGHT THROUGH IT."); // Y7b2 (the flip): was S_PLATING
    for (const def of ["plateroller", "shieldwall", "armorpress", "seamwelder", "anvil"]) for (const s of STARS) {
      const onT = abilityText(def, s, k1(def)).sentences;
      expect(onT, `${def} ★${s}`).toContain(S.plating);
    }
  });

  it("SPLITTER, COMPOUND BREECH and WARD BELL drop POISON from their sentences (off: as before)", () => {
    expect(abilityText("splitter", 1).sentences[1]).toBe("EACH COPY KEEPS ALL OF THE BURN AND SHOCK.");
    expect(abilityText("compound", 1, { k: 1 }).sentences[1]).toBe("BOTH LOADS' BURN AND SHOCK RIDE ALONG.");
    expect(abilityText("wardbell", 1).sentences.slice(1, 3)).toEqual([
      "EACH SHIELD BLOCKS ONE HIT'S DAMAGE, THEN BREAKS; THAT HIT'S BURN, FRAY AND STUN STILL LAND.",
      "BURN AND THE DARK WIND DEAL THEIR DAMAGE PAST IT.",
    ]);
  });

  it("SPLITTER's tap: TAP_NOTES' HIT: note, no POISON, 2 lines at the band, each line inside 225 px", () => {
    const tap = () => glossaryText("HIT", { def: "splitter", stars: 1 });
    expect(tap()).toBe("HIT: EACH COPY KEEPS THE SLUG'S {*BURN} AND {*STUN}.");
    expect(GLOSSARY_WRAP_W).toBe(225);
    const wrapped = wrapRich(colourize(icons(tap()!), C.bone), GLOSSARY_WRAP_W, "5");
    expect(wrapped.length).toBe(2);
    for (const l of wrapped) expect(textWidth(l.map((sp) => sp.t).join(""))).toBeLessThanOrEqual(225);
    expect(textWidth(icons(tap()!))).toBe(259);
    // every other piece's tap is as before, on and off (TESLA's switch-on note is Y4's)
    for (const def of Object.keys(TAP_NOTES)) if (def !== "splitter") {
      const w = TAP_NOTES[def].word;
      expect(tapNote(def, w), def).toBe(TAP_NOTES[def]);
    }
    expect(tapNote("tesla", "SHOT")).toEqual(TAP_NOTES.tesla); // Y7b2 (the flip): was STAR_TAP_NOTES.tesla
  });

  it("the FORGE family's line drops POISON (on); off, the base's line byte for byte; every other family's line as before", () => {
    expect(FAMILY.FORGE.glossary).toBe("ADDS DAMAGE, BURN OR FRAY TO EACH PAYLOAD ON THE BELT, OR BUILDS DAMAGE THE LONGER THE PAYLOAD RIDES.");
  });
});

// ------------------------------------------------------------------------------------------- the deck rating
describe("Y6 rating: VENOM's burnPlus priced by the belt's BURN, behind the switch", () => {
  /** Turret 0's rated damage a second (rateDeck's turretDmg: its throughput x the payload's damage-equivalent). */
  const dmg = (b: Build) => {
    const out: RateOut = { stokeKeep: new Map(), turretDmg: new Map() };
    rateDeck(b, undefined, undefined, out);
    return out.turretDmg!.get(0)!;
  };

  it("burnPlusGain: its seconds x BURN_DPS x the BURN stacks (DESIGN-Y's TEMPER ★3: 4 BURN, +3 s = 120 more); no BURN, nothing", () => {
    expect(burnPlusGain(3, 4)).toBe(3 * BURN_DPS * 4);
    expect(burnPlusGain(3, 4)).toBe(120);
    expect(burnPlusGain(9, 0)).toBe(0);
  });

  it("on a BURN belt it adds +3/+6/+9 s x the belt's BURN: linear in its seconds and in the stacks (off: EQ.poison's 30 a poison)", () => {
    const belt = (temper: number, venom?: number) => rigBench([["temper", 4, 4, temper], ...(venom ? [["venom", 4, 3, venom] as [string, number, number, number]] : [])]);
    // the gain over the same belt without it, at each star: 1 : 2 : 3, the seconds 3 : 6 : 9
    const none = dmg(belt(3)), gain = STARS.map((s) => dmg(belt(3, s)) - none);
    expect(gain[0]).toBeGreaterThan(0);
    expect(gain[1] / gain[0]).toBeCloseTo(2, 9);
    expect(gain[2] / gain[0]).toBeCloseTo(3, 9);
    // the BURN stacks: TEMPER ★3 (4 BURN) against ★1 (1 BURN): 4 times the gain
    expect(gain[0] / (dmg(belt(1, 1)) - dmg(belt(1)))).toBeCloseTo(4, 9);
  });

  it("with no BURN on the belt VENOM rates as nothing (off: its poison rates)", () => {
    const venom = rigBench([["venom", 4, 3, 3]]), bare = rigBench([]);
    expect(dmg(venom)).toBe(dmg(bare));
    expect(rateDeck(venom).value).toBe(rateDeck(bare).value);
  });

  it("an OVERCLOCKER before it: its charge doubles VENOM's seconds, so it counts (chargeGains; overclock.ts doubles burnPlus)", () => {
    const b = rigBench([["overclocker", 4, 4, 1], ["venom", 4, 3, 1]]);
    const hits = rigHits(b), h = hits[0].flat().find((x) => x.def === "overclocker")!;
    expect(chargeGains(b, hits[0], h)).toBe(true);
  });
});
