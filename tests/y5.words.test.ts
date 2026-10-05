// Y5 (release Y; REQ-BFG-070, REQ-BFG-046; DESIGN-Y 1.2, section 3 rows 41-47 and section 5 column g; BRIEF-Y5's words;
// cap's ruling 882ecc7750f6dd37): THE WORDS and THE BOTS' DECK RATING of the crit-free one-liners, with the star switch on
// (content.ts STAR_RULES, withStarRules).
// - ONLINE retires (glossary.ts STAR_RETIRED): with the switch on no text names it. Swept with a plain /\bONLINE\b/ (once
//   ONLINE is retired, glossaryWordsIn finds nothing by design, so it would prove nothing): every piece's face, ⓘ lines,
//   kept sentences, gists, cards and belt-timeline rows at ★1-★3; every rune line as drawn; the tap notes; the family
//   lines; the glossary's rows. The battle plate's ONLINE GHOST tag and content.ts's catalogue descs are not this word.
// - QUICK LATCH's line says START with the switch on (runeText.ts STAR_RUNE_TEXT), text only; off, the base's byte for byte.
// - No new keyword. The 7's kept sentences, gists, cards and timeline rows say the new rules.
// - The rating prices each new rule (deckRating.ts, behind the switch): COUNTERWEIGHT uncapped in the walk, CAPACITOR's
//   charge past 5 s, IRON WALL without its plating, POWDER KEG's repeating pulse without BURN, SPALL's single-count soak.
import { describe, expect, it } from "vitest";
import { ITEMS, withStarRules } from "../src/sim/content";
import { key as K, rotField, type Build, walkRoute } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { starField } from "../src/sim/stars";
import { capacitorTail, kegGain, rateDeck, STAR_EQ } from "../src/sim/deckRating";
import { RUNES } from "../src/sim/runes";
import { faceAt, Y5_PIECES } from "../src/ui/faces";
import { abilityText, cardText, gist, hasAbilityText, hitText } from "../src/ui/abilityText";
import { GLOSSARY, STAR_RETIRED, STAR_TAP_NOTES, TAP_NOTES, glossaryEntry, glossaryRows, glossaryText, glossaryWordsIn } from "../src/ui/glossary";
import { STAR_RUNE_TEXT, runeLine, runeReminder, runeTextOf } from "../src/ui/runeText";
import { FAMILY } from "../src/ui/families";
import { levelLines, levelText } from "../src/screens/build/levels";
import { fusible, effectAt } from "../src/sim/stars";
import { KEYWORDS, icons, textWidth } from "../src/render/font";
import type { TimelineHit } from "../src/sim/deck";
import { STARS, on, rigBench } from "./y3.helpers";
import { furnaceBench, withMod } from "./wave3.helpers";

const ONLINE = /\bONLINE\b/;
const k1 = (def: string) => (ITEMS[def].kind === "core" ? { k: 1 } : {});

/** Every text the game can show for piece `def` at ★`s` with the switch as it is: its face (rules, clause, caveats,
 *  reminders), its ⓘ LEVELS lines, its kept sentences, gist and card, and, for a rig, its belt-timeline rows. */
function pieceTexts(def: string, s: number): string[] {
  const out: string[] = [];
  const f = faceAt(def, s, k1(def));
  if (f) out.push(...f.rules.map((r) => r.text), ...(f.clause ? [f.clause.text] : []), ...(f.caveats ?? []), ...f.reminders);
  if (fusible(def)) for (const l of levelLines(def, s, k1(def)) ?? []) out.push(levelText(l));
  if (hasAbilityText(def)) out.push(...abilityText(def, s, k1(def)).sentences, gist(def, s, k1(def)), cardText(def, k1(def)));
  if (ITEMS[def].kind === "gate") for (const belt of ["free", "locked", "slag"] as const) out.push(hitText({ def, stars: s } as TimelineHit, belt));
  return out;
}

// ---------------------------------------------------------------------------------------------- the words
describe("Y5 words: ONLINE retires; QUICK LATCH says START; no new keyword", () => {
  it("STAR_RETIRED is HARASSMENT and ONLINE (Y6: and POISON); on, no ONLINE row, entry, alias or tap (off: the row and its aliases as before)", () => {
    expect(STAR_RETIRED).toEqual(["HARASSMENT", "ONLINE", "POISON"]); // Y6 (BRIEF-Y6): was ["HARASSMENT", "ONLINE"]
    on(() => {
      expect(glossaryRows().map((r) => r.word)).not.toContain("ONLINE");
      for (const w of ["ONLINE", "COME ONLINE", "COMES ONLINE"]) expect(glossaryEntry(w), w).toBeUndefined();
      expect(glossaryWordsIn("YOUR RIGS COME ONLINE SOONER.")).toEqual([]);
      expect(glossaryText("ONLINE")).toBeUndefined();
    });
    // off: as before
    expect(glossaryRows().map((r) => r.word)).toContain("ONLINE");
    for (const w of ["ONLINE", "COME ONLINE", "COMES ONLINE"]) expect(glossaryEntry(w)?.word, w).toBe("ONLINE");
    expect(glossaryText("ONLINE")).toBe("ONLINE: A RIG WORKS SOON AFTER THE START, LATER FOR EACH EARLIER RIG ON ITS BELT.");
    expect(GLOSSARY.map((r) => r.word)).toContain("ONLINE");
    // no keyword joins: the 9, as before
    expect([...KEYWORDS]).toEqual(["BURN", "STUN", "HEAT", "FRAY", "PLATE", "PAIR", "SHIELD", "HEAL", "REGEN"]);
  });

  it("the sweep: on, no text names ONLINE (every piece's face, ⓘ, kept sentences, gist, card and timeline rows at ★1-★3; every rune line as drawn and its reminder; the tap notes; the family lines; the glossary's rows)", () => {
    const hits: string[] = [];
    let n = 0;
    on(() => {
      for (const def of Object.keys(ITEMS)) for (const s of STARS) for (const t of pieceTexts(def, s)) { n++; if (ONLINE.test(t)) hits.push(`${def} ★${s}: ${t}`); }
      for (const r of Object.values(RUNES)) for (const t of [runeLine(r), runeTextOf(r), runeReminder(r)]) { n++; if (ONLINE.test(t)) hits.push(`rune ${r.id}: ${t}`); }
      for (const [def, note] of [...Object.entries(TAP_NOTES), ...Object.entries(STAR_TAP_NOTES)]) for (const s of STARS) {
        const t = note.text(effectAt(def, s), { stars: s, k: 1 });
        n++;
        if (ONLINE.test(t)) hits.push(`tap ${def} ★${s}: ${t}`);
      }
      for (const fam of Object.values(FAMILY)) { n++; if (ONLINE.test(fam.glossary)) hits.push(`family ${fam.tag}: ${fam.glossary}`); }
      for (const r of glossaryRows()) for (const t of [r.def, r.extra ?? ""]) { n++; if (ONLINE.test(t)) hits.push(`row ${r.word}: ${t}`); }
    });
    expect(hits).toEqual([]);
    expect(n).toBeGreaterThan(2000);
    // the same sweep finds it with the switch off (POWDER KEG's sentence, ASSEMBLY LINE's, QUICK LATCH's line, its row)
    const off: string[] = [];
    for (const def of ["keg", "assembly"]) for (const t of pieceTexts(def, 1)) if (ONLINE.test(t)) off.push(def);
    if (ONLINE.test(runeLine(RUNES.quick_latch))) off.push("quick_latch");
    expect([...new Set(off)]).toEqual(["keg", "assembly", "quick_latch"]);
  });

  it("QUICK LATCH: on, its line says START (text only: its rule, id and amount unchanged); off, the base's byte for byte", () => {
    const r = RUNES.quick_latch;
    expect(STAR_RUNE_TEXT).toEqual({ quick_latch: "YOUR {BELT} RIGS: START {N} SOONER." });
    expect(on(() => runeTextOf(r))).toBe("YOUR {BELT} RIGS: START {N} SOONER.");
    expect(on(() => runeLine(r))).toBe("YOUR BELT RIGS: START 50% SOONER.");
    expect(runeTextOf(r)).toBe("YOUR {BELT} RIGS: ONLINE {N} SOONER.");
    expect(runeLine(r)).toBe("YOUR BELT RIGS: ONLINE 50% SOONER.");
    expect(r.text).toBe("YOUR {BELT} RIGS: ONLINE {N} SOONER."); // the def, whatever the switch
    expect(on(() => JSON.stringify(RUNES.quick_latch))).toBe(JSON.stringify(r));
    expect(on(() => textWidth(icons(runeLine(r))))).toBeLessThanOrEqual(225);
    // every other rune's line is the same on and off
    for (const d of Object.values(RUNES)) if (d.id !== "quick_latch") expect(on(() => runeLine(d)), d.id).toBe(runeLine(d));
  });

  it("S.online stays switch-off only: on, ASSEMBLY LINE says START (Y3), and every Y5 piece's texts name no ONLINE", () => {
    on(() => {
      for (const s of STARS) for (const t of pieceTexts("assembly", s)) expect(t).not.toMatch(ONLINE);
      for (const def of Y5_PIECES) for (const s of STARS) for (const t of pieceTexts(def, s)) expect(t, `${def} ★${s}`).not.toMatch(ONLINE);
    });
  });
});

// ------------------------------------------------------------------------------- the 7's texts with the switch on
describe("Y5 words: the 7's kept sentences, gists, cards and timeline rows say the new rules", () => {
  /** What leaves each piece's switch-on texts (its gone rule's words). */
  const GONE: Record<string, RegExp> = {
    counterweight: /UP TO/,
    capacitor: /UP TO/,
    spallcatcher: /UP TO|TWICE|MAX/,
    shieldwall: /ROLLS|ONTO YOUR HULL/,
    keg: /BURN|ONLINE|ONCE|BESIDE|WIDE BLAST:/,
    ram: /^$/, // no rule change
    longcase: /^$/,
  };

  it("on, no text of the 7 names a rule that left (faces, ⓘ lines, kept sentences, gists, cards, timeline rows)", () => {
    on(() => {
      for (const def of Y5_PIECES) for (const s of STARS) for (const t of pieceTexts(def, s)) expect(t, `${def} ★${s}: ${t}`).not.toMatch(GONE[def]);
    });
  });

  it("on, the exact new sentences, gists and cards (off: as before)", () => {
    on(() => {
      expect(abilityText("counterweight", 3).sentences).toEqual(["ADDS 18 DAMAGE FOR EACH BELT TILE THE PAYLOAD HAS RIDDEN."]);
      expect(gist("counterweight", 3)).toBe("18 DAMAGE FOR EACH TILE");
      expect(abilityText("capacitor", 1, { k: 1 }).sentences).toEqual(["CHARGES ITS NEXT SHOT 20 DAMAGE FOR EACH SECOND ITS CHAMBER SITS EMPTY."]);
      expect(abilityText("spallcatcher", 1).sentences).toEqual([
        "EVERY 40 DAMAGE YOUR SHIP TAKES ADDS 10 DAMAGE TO THIS TURRET'S NEXT SHOT.",
        "DAMAGE YOUR PLATING SOAKS COUNTS TOO; THE DARK WIND DOESN'T COUNT.",
      ]);
      expect(gist("spallcatcher", 2)).toBe("22 DAMAGE FOR EVERY 40");
      expect(abilityText("shieldwall", 1).sentences.slice(0, 1)).toEqual(["WHILE YOUR HULL HOLDS 120 PLATING OR MORE, EACH PAYLOAD IT HITS GAINS 30 DAMAGE."]);
      expect([gist("shieldwall", 2), cardText("shieldwall")]).toEqual(["66 DAMAGE AT 120 PLATING", "HITS HARDER WHILE PLATED."]);
      expect(abilityText("keg", 1).sentences).toEqual([
        "EVERY 12 SECONDS IT BLOWS UP, ADDING 60 DAMAGE TO EVERY PAYLOAD ON ITS BELTS.",
        "ITS FUSE RUNS FROM THE START OF THE BATTLE; A STUN PAUSES IT.",
      ]);
      expect([gist("keg", 3), cardText("keg")]).toEqual(["210 DAMAGE EVERY 8 SECONDS", "BLOWS UP EVERY 12 SECONDS."]);
      expect(hitText({ def: "keg", stars: 2 } as TimelineHit, "free")).toBe("POWDER KEG +130 DAMAGE EVERY 10 SEC");
      expect(hitText({ def: "shieldwall", stars: 3 } as TimelineHit, "free")).toBe("IRON WALL +105 DAMAGE AT 120 PLATING");
    });
    // off: the base's texts
    expect(abilityText("counterweight", 1).sentences).toEqual(["ADDS 5 DAMAGE FOR EACH BELT TILE THE PAYLOAD HAS RIDDEN, UP TO 60 DAMAGE."]);
    expect(abilityText("capacitor", 1, { k: 1 }).sentences[1]).toBe("IT CHARGES FOR UP TO 5 SECONDS.");
    expect(abilityText("keg", 1).sentences[1]).toBe("IT BLOWS ONCE, 12 SECONDS AFTER IT COMES ONLINE; A STUN PAUSES THE FUSE.");
    expect(abilityText("shieldwall", 1).sentences[0]).toBe("ROLLS 10 PLATING ONTO YOUR HULL FOR EACH PAYLOAD IT HITS.");
    expect(hitText({ def: "keg", stars: 1 } as TimelineHit, "free")).toBe("POWDER KEG +60 DAMAGE AND 1 BURN AFTER 12 SEC");
  });

  it("the faces' keywords are the existing ones (no new keyword); IRON WALL's taps PLATE", () => {
    on(() => {
      for (const def of Y5_PIECES) for (const s of STARS) {
        for (const r of faceAt(def, s, k1(def))!.rules) for (const m of r.text.matchAll(/\{\*([A-Z]+)\}/g)) expect(KEYWORDS as readonly string[], `${def}: ${m[1]}`).toContain(m[1]);
      }
      expect(glossaryWordsIn(faceAt("shieldwall", 1)!.rules[0].text).map((r) => r.word)).toContain("PLATE");
    });
  });
});

// ------------------------------------------------------------------------------------------- the deck rating
describe("Y5 rating: each new rule priced behind the switch", () => {
  const rate = (b: Build, star: boolean) => withStarRules(() => rateDeck(b), star);

  it("POWDER KEG: kegGain, a blast at every multiple of its fuse, no BURN (off: one blast with BURN)", () => {
    expect(kegGain({ fuse: 12, flat: 60 }, 30, 3)).toBeCloseTo((60 * (3 + 3)) / 27, 12);
    expect(kegGain({ fuse: 12, flat: 60 }, 13, 3)).toBeCloseTo((60 * 1) / 10, 12);
    expect(kegGain({ fuse: 12, flat: 60 }, 12, 3)).toBe(0);
    // a belt longer than the fuse: two blasts reach its slugs
    expect(kegGain({ fuse: 12, flat: 60 }, 30, 15)).toBeCloseTo((60 * (15 + 6)) / 15, 12);
    // a keg deck rates its repeating pulse (on) above none once the fight outlasts a fuse; in a 10 s fight, as none
    const b = rigBench([["keg", 4, 3, 1]]), none = rigBench([]);
    const onAt = (x: Build, fight: number) => withStarRules(() => rateDeck(x, undefined, fight).offense);
    for (const fight of [20, 30]) expect(onAt(b, fight), `fight ${fight}`).toBeGreaterThan(onAt(none, fight));
    expect(onAt(b, 10)).toBe(onAt(none, 10));
    expect(withStarRules(() => rateDeck(b, undefined, 30).offense, false)).not.toBe(onAt(b, 30));
  });

  it("CAPACITOR BANK: capacitorTail, the charge past the old 5 s cap on top of its NOMINAL credit; a fed gun rates as off", () => {
    const spec = { routine: "capacitor" as const, perSecond: 20 };
    expect(STAR_EQ.capacitorPaid).toBe(5);
    expect(capacitorTail(spec, 10, 1.5, 3, 20)).toBeCloseTo(20 * 3.5, 12); // a load every 10 s: 8.5 s empty a shot, 3.5 past 5
    expect(capacitorTail(spec, 4, 1.5, 3, 20)).toBe(0); // fed: never empty past 5 s
    expect(capacitorTail(spec, 4, 1.5, 12, 10)).toBeCloseTo((20 * 7) / 10, 12); // a first load at 12 s, once in 10 loads
    const fed = withMod(furnaceBench(), 60, "capacitor", 0);
    expect(rate(fed, true).offense).toBe(rate(fed, false).offense);
  });

  it("IRON WALL: no plating (no repair), and its bonus only on a deck that plates its hull (off: plating and the bonus)", () => {
    const bare = rigBench([]), wall = rigBench([["shieldwall", 4, 3, 1]]);
    expect(rate(wall, true).value).toBe(rate(bare, true).value); // on a deck that doesn't plate its hull it adds nothing
    expect(rate(wall, false).value).toBeGreaterThan(rate(bare, false).value);
    const roller = rigBench([["plateroller", 4, 1, 1]]), both = rigBench([["plateroller", 4, 1, 1], ["shieldwall", 4, 3, 1]]);
    expect(rate(both, true).offense).toBeGreaterThan(rate(roller, true).offense); // fed by a PLATE ROLLER, its bonus counts
    expect(rate(both, true).defense).toBe(rate(roller, true).defense); // and it rolls no plating of its own
  });

  it("SPALL CATCHER: on a deck that plates its hull its credit counts spallPlated of it; elsewhere as off", () => {
    expect(STAR_EQ.spallPlated).toBe(0.8);
    const plain = withMod(furnaceBench(), 60, "spallcatcher", 0);
    expect(rate(plain, true).offense).toBe(rate(plain, false).offense);
    const plated = withMod(rigBench([["plateroller", 4, 1, 1]]), 60, "spallcatcher", 0), noSpall = rigBench([["plateroller", 4, 1, 1]]);
    const gainOn = rate(plated, true).offense / rate(noSpall, true).offense - 1, gainOff = rate(plated, false).offense / rate(noSpall, false).offense - 1;
    expect(gainOn).toBeCloseTo(gainOff * STAR_EQ.spallPlated, 9);
  });

  it("COUNTERWEIGHT: the walk counts every tile ridden past 12 (off: capped at 60/130/210)", () => {
    // the KILN at (6,5) on a 14-tile belt into the heavy gun (belts.breech's LONG, 4 tiles longer); the rig east of tile 12
    const LONG14 = [K(5, 6), K(4, 6), K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(2, 2), K(3, 2), K(4, 2), K(4, 1), K(4, 0)];
    for (const s of [2, 3]) {
      const b: Build = {
        hero: "furnace", mods: [], beltCap: 30, hullBonus: 5000,
        items: [{ uid: 1, def: "kiln", x: 6, y: 5 }, { uid: 50, def: "counterweight", x: 5, y: 1, ...rotField("counterweight", rotFacing("counterweight", 3)), ...starField(s) }],
        routes: [{ factory: 1, cells: LONG14 }],
      };
      const th = (star: boolean) => withStarRules(() => walkRoute(b, 0).timeline.flatMap((r) => r.hits.map((h) => ({ tile: r.tile, h }))).find((x) => x.h.def === "counterweight")!, star);
      const onT = th(true), offT = th(false);
      expect(onT.tile, `★${s}`).toBe(12);
      expect(onT.h.flat, `★${s} on`).toBe(12 * [5, 11, 18][s - 1]);
      expect(offT.h.flat, `★${s} off`).toBe([60, 130, 210][s - 1]);
    }
  });
});
