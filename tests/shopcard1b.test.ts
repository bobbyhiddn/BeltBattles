// SHOPCARD-1b (REQ-BFG-081, REQ-BFG-115; BRIEF-SHOPCARD1B section 3; READ-9's fix list): the tap panel's and the tooltip's words, and the
// two marks. Display only: one test per fix, each pinning the new words (or pixels), their width in the 225 px op band, and the
// sim line that makes them true. The sim is untouched (git diff shopcard1-accepted -- src/sim src/net src/core server is empty).
//   F1 a rig's HIT: the HIT label's tap note says when it fires; "HITS EACH SLUG UP TO n TIMES." (per slug); PINCER names the tile
//   F2 MIMIC FORGE: no TOO (its face and its card line say only the hero's slugs)
//   F3 whose SHIELD: ARMOR PRESS "HULL: +n", SEAM WELDER "YOUR HULL: +n", PLATE BREAKER "USES n OF YOUR SHIELD"
//   F4 the faces' missing clauses: STOKER (which factories), ASSEMBLY LINE (START ... SOONER), BRACE FRAME (BELT tiles)
//   F5 HULL in words: HEAL's and REGEN's notes, RIVETER's and MEND PRESS's lines
//   F6 LIMPET WORKS: the number is the blast's, 3 s after a hit
//   F7 MANTLET (which tile) and GRAPNEL GUN (whose slug, and gone)
//   F8 the sale mark (a down arrow with a stem) and the merge mark (the font's ★, two or three)
// SHOPCARD-1c (REQ-BFG-081, REQ-BFG-115) supersedes F4 (STOKER, ASSEMBLY LINE), F6 (LIMPET WORKS), F7 (GRAPNEL GUN) and F8 (both marks):
// those pins read the 1c words and pixels here, each with its comment; tests/shopcard1c.test.ts holds 1c's own, one group per fix.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { ITEMS, buyableModules } from "../src/sim/content";
import { rigArrowCells } from "../src/sim/deck";
import { effectAt } from "../src/sim/stars";
import { withShapes } from "../src/sim/shapes";
import { C } from "../src/render/palette";
import { ICON, drawText, icons, stripIcons, textWidth, wrap } from "../src/render/font";
import { REMINDER, factoryStats, faceAt, faceLines, shapeLines, shapeMaxHits } from "../src/ui/faces";
import { GLOSSARY_WRAP_W, glossaryEntry, glossaryText } from "../src/ui/glossary";
import { cardText } from "../src/ui/abilityText";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { MERGE_H, MERGE_W, SALE_H, SALE_W, STAR_H, STAR_ROWS, STAR_W, cardPriceBox, cardZones, drawMergeMark, drawSaleMark, offerFace } from "../src/screens/build/shop";
import { CARD_H, CARD_W, WIDE_CARD_H, WIDE_CARD_MAX_W } from "../src/screens/build/layout";

installRaster();

const BAND = GLOSSARY_WRAP_W; // 225 px: the phone panel's text width, 5x7
const STARS = [1, 2, 3];
const DAYS: (number | undefined)[] = [undefined, 5, 10];
/** A piece's rule lines (faceAt's markup: {*STUN}, {DMG}) at `s` on `day`, the run's hero FURNACE for MIMIC FORGE and k 1 for a core. */
const rules = (def: string, s: number, day?: number): string[] => faceAt(def, s, { k: 1, hero: "furnace", day })!.rules.map((r) => r.text); // markup, as the faces write it
const w5 = (markup: string): number => textWidth(icons(markup), "5");
const rows = (markup: string, width = BAND): number => wrap(icons(markup), width, "5").length;

describe("SHOPCARD-1b F1 (READ-9 fix 1): a rig's HIT, once per slug and per arrow", () => {
  it("(a) the HIT label's tap note says when it fires: each time THIS RIG hits a slug (RIVETER, HEAT JACKET, COUNTERWEIGHT: the HIT row; LONG HAUL: its own note)", () => {
    const row = glossaryEntry("HIT")!;
    expect(row.def).toBe("HIT: EACH TIME THIS RIG HITS A SLUG ON A TILE ITS ARROWS POINT AT.");
    expect(row.scope).toBe("label");
    for (const def of ["riveter", "heatjacket", "counterweight", "pincer", "platebreaker"]) {
      expect(glossaryText("HIT", { def, stars: 1 }), def).toBe(row.def);
    }
    const lh = glossaryText("HIT", { def: "longhaul", stars: 1 })!;
    expect(lh).toBe("HIT: WHEN IT HITS A SLUG, EVERY EARLIER HIT ON THAT SLUG COUNTS, SPEED RIGS TOO.");
    for (const t of [row.def, lh]) {
      expect(t.startsWith("HIT: "), t).toBe(true);
      expect(rows(t), `a tap note is at most 2 rows of the 5x7 band: ${t}`).toBeLessThanOrEqual(2);
      expect(t.includes("♥") || t.includes("{HULL}"), t).toBe(false);
    }
    // the label is still HIT (a name change is out of scope): every rig that had it still draws it
    for (const def of ["riveter", "heatjacket", "counterweight", "longhaul", "pincer"]) {
      expect(faceLines(def, 1, {})!.rules.every((r) => r.label === "HIT:"), def).toBe(true);
    }
  });

  it("(b) the shaped rigs' line reads per slug: HITS EACH SLUG UP TO n TIMES., n = its arrows (one hit an arrow: battle.ts:1295-1301, 1661-1669)", () => {
    withShapes(() => {
      const want: [string, number][] = [["nailstrip", 2], ["embertrough", 2], ["spikerail", 6]];
      for (const [def, n] of want) {
        expect(rigArrowCells(def, 0, 0, 0).length, def).toBe(n);
        expect(shapeMaxHits(def), def).toBe(n);
        expect(shapeLines(def, 1).map((r) => r.text), def).toEqual([`HITS EACH SLUG UP TO ${n} TIMES.`]);
        // it reaches the tap panel's face and the tooltip's lines
        expect(faceBlocks(def, 1, {})!.map((b) => b.text), def).toContain(`HITS EACH SLUG UP TO ${n} TIMES.`);
        expect(offerFace(def, {}), def).toContain(`HITS EACH SLUG UP TO ${n} TIMES.`);
        expect(w5(`HITS EACH SLUG UP TO ${n} TIMES.`), def).toBeLessThanOrEqual(BAND);
      }
    });
  });

  it("(c) PINCER names its thing: the other rigs ON THE TILE (battle.ts:1350-1357 crossfire counts the working rigs in the hit's own tile list), no pronoun; one row at ★1-★3 on day 1", () => {
    for (const s of STARS) {
      const d = effectAt("pincer", s).gate!.pincer!.each;
      const [line] = rules("pincer", s);
      expect(line, `★${s}`).toBe(`HIT: +${d} {DMG} FOR EACH OTHER RIG ON THE TILE.`);
      expect(/\bIT\b/.test(stripIcons(line)), `★${s}: no "IT" left between the slug and the rig`).toBe(false);
      expect(w5(line), `★${s}`).toBeLessThanOrEqual(BAND);
    }
  });
});

describe("SHOPCARD-1b F2 (READ-9 fix 2): MIMIC FORGE makes only the hero's slugs", () => {
  it("no TOO on its face or its card line; no line on it says slugs of its own (battle.ts:929-938 factoryDef swaps its ammo for the hero's)", () => {
    for (const s of STARS) for (const day of DAYS) {
      expect(rules("mimic", s, day), `★${s}`).toEqual(["MAKES YOUR HERO'S SLUGS."]);
    }
    expect(cardText("mimic", { hero: "furnace" })).toBe("MAKES YOUR HERO'S SLUGS.");
    // every text the panel and the tooltip draw for it
    const all = [...offerFace("mimic", { hero: "furnace" }), ...faceBlocks("mimic", 1, { hero: "furnace" })!.map((b) => b.text)].join(" ");
    expect(/\bTOO\b/.test(all) || /\bOWN\b/.test(all) || /ITS SLUGS/.test(all), all).toBe(false);
    // its stats are the hero's slugs': FURNACE's CINDER SLUG damage and the hero factory's speed (factoryStats; battle.ts:929-938)
    expect(factoryStats("mimic", 1, "furnace")[1][0]).toBe("DMG");
  });
});

describe("SHOPCARD-1b F3 (READ-9 fix 3): whose SHIELD", () => {
  it("ARMOR PRESS says HULL: (the shield goes on your hull: battle.ts:1455-1461 pressPlate -> addPlate on the side's own plating), one row at every star on days 1, 5 and 10", () => {
    for (const s of STARS) for (const day of DAYS) {
      const p = effectAt("armorpress", s).factory!.plate!;
      const [line] = rules("armorpress", s, day);
      expect(line, `★${s} day ${day}`).toMatch(new RegExp(`^FEEDS A GUN: EVERY ${p.every}\\{SEC\\}: HULL: \\+\\d+ \\{\\*PLATE\\}\\.$`));
      expect(rows(line), `★${s} day ${day}: ${line}`).toBe(1);
    }
  });
  it("SEAM WELDER says YOUR HULL: (battle.ts:1629 loaded() and 1649 fusionPair add the plating to the side), MENDING LOOM's form", () => {
    for (const s of STARS) for (const day of DAYS) {
      const [line] = rules("seamwelder", s, day);
      expect(line, `★${s}`).toMatch(/^\{\*PAIR\}: YOUR HULL: \+\d+ \{\*PLATE\}\.$/);
      expect(rows(line), line).toBe(1);
    }
  });
  it("PLATE BREAKER says USES n OF YOUR SHIELD (battle.ts:1710-1715 spendPlate off the side's own plating), one row at every star on days 1, 5 and 10", () => {
    for (const s of STARS) for (const day of DAYS) {
      const [line] = rules("platebreaker", s, day);
      expect(line, `★${s}`).toMatch(/^HIT: USES \d+ OF YOUR \{\*PLATE\} FOR \+\d+ \{DMG\}\.$/);
      expect(rows(line), `★${s} day ${day}: ${line}`).toBe(1);
    }
  });
});

describe("SHOPCARD-1b F4 (READ-9 fix 4): the faces carry their one missing clause", () => {
  it("STOKER: FACTORIES ITS ARROWS POINT AT (deck.ts:432-447 stokeHits: an arrow counts only where it points at a factory's cell; battle.ts:808-818); SHOPCARD-1c G5: was FACTORIES IT HITS, one row", () => {
    for (const s of STARS) {
      const up = ["20%", "44%", "85%"][s - 1];
      expect(rules("stoker", s), `★${s}`).toEqual([`FACTORIES ITS ARROWS POINT AT WORK UP TO ${up} FASTER.`]);
      expect(rows(rules("stoker", s)[0])).toBe(2); // 1c: two rows of the band (289 px)
    }
  });
  it("ASSEMBLY LINE: YOUR RIGS START n% SOONER / AT ONCE (battle.ts:714-736 and 979-981: each rig comes online at the fight's start at a delay x the line's factor); SHOPCARD-1c G8: EACH FIGHT, START WORKING, two rows", () => {
    expect([1, 2, 3].map((s) => rules("assembly", s)[0])).toEqual([
      "FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 50% SOONER.", "FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 75% SOONER.", "FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING AT ONCE.", // SHOPCARD-1e (E2; READ-12 fix 1): ALL YOUR RIGS (was YOUR RIGS): 3 of 5 answers below R hedged all or some rigs; battle.ts:714-736 scales every rig's commissionAt
    ]);
    for (const s of STARS) expect(rows(rules("assembly", s)[0])).toBe(2);
  });
  it("BRACE FRAME: STUN ON BELT TILES IT HITS (battle.ts:765-769 remembers a brace on belt tiles only; 2277-2296 braceCut)", () => {
    expect([1, 2, 3].map((s) => rules("braceframe", s)[0])).toEqual(["50%", "70%", "85%"].map((p) => `{*STUN} ON BELT TILES IT HITS: ${p} SHORTER.`));
    for (const s of STARS) expect(rows(rules("braceframe", s)[0])).toBe(1);
  });
});

describe("SHOPCARD-1b F5 (READ-9 fix 5): HULL in words, not the heart", () => {
  it("HEAL's and REGEN's notes say GIVES BACK HULL; no {HULL} icon, no heart (battle.ts:1479-1501 heal() gives back s.hull.hp)", () => {
    expect(REMINDER.HEAL()).toBe("{*HEAL}: GIVES BACK HULL, NEVER PAST FULL.");
    expect(REMINDER.REGEN()).toBe("{*REGEN}: GIVES BACK THIS MUCH HULL EACH SEC.");
    for (const key of ["HEAL", "REGEN"] as const) {
      expect(REMINDER[key]().includes("{HULL}"), key).toBe(false);
      expect(icons(REMINDER[key]()).includes(ICON.HULL), key).toBe(false);
    }
    // the tap on HEAL, on the pieces that print it (RIVETER, MEND PRESS, MENDING LOOM): the row's own words
    for (const def of ["riveter", "mendpress", "mendingloom"]) {
      const t = glossaryText("HEAL", { def, stars: 1 })!;
      expect(t.startsWith("{*HEAL}: GIVES BACK HULL, NEVER PAST FULL."), def).toBe(true);
      expect(icons(t).includes(ICON.HULL), def).toBe(false);
    }
  });
  it("RIVETER says YOUR HULL: and MEND PRESS HULL: before the HEAL (battle.ts:1759 applyHit heal; 1465-1471 pressHeal), one row each at every star on days 1, 5, 10", () => {
    for (const s of STARS) for (const day of DAYS) {
      expect(rules("riveter", s, day)[0], `★${s}`).toMatch(/^HIT: YOUR HULL: \{\*HEAL\} \d+\.$/);
      expect(rules("mendpress", s, day)[0], `★${s}`).toMatch(/^FEEDS A GUN: EVERY 3\{SEC\}: HULL: \{\*HEAL\} \d+\.$/);
      expect(rows(rules("riveter", s, day)[0])).toBe(1);
      expect(rows(rules("mendpress", s, day)[0])).toBe(1);
    }
    expect(rules("mendingloom", 1)[0]).toMatch(/^YOUR HULL: \{\*HEAL\} \d+ EACH SEC\.$/); // MENDING LOOM's form, unchanged
  });
});

describe("SHOPCARD-1b F6 (READ-9 fix 6): LIMPET WORKS' number is the blast's", () => {
  it("THE DMG LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3 SEC AFTER A HIT, at every star on days 1, 5 and 10; its charge's own damage is 0 (content.ts limpet base 0); SHOPCARD-1c G7: no number in the line (was <its DMG stat>); SHOPCARD-1d H2: ITS DMG became THE DMG LANDS ONCE, AS A BLAST", () => {
    expect(ITEMS.limpet.factory!.base).toBe(0);
    for (const s of STARS) for (const day of DAYS) {
      const dmg = (faceLines("limpet", s, { day })!.stats ?? "");
      const [line] = rules("limpet", s, day);
      // SHOPCARD-1d (H2; READ-11 fix list 2): the DMG lands once, as a blast (was "THE FOE'S HULL TAKES ITS {DMG} 3{SEC} AFTER A HIT.", 1c)
      expect(line, `★${s} day ${day}`).toBe("THE {DMG} LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3{SEC} AFTER A HIT.");
      // 1c: the only number the line holds is the delay; the blast is the stat row's DMG alone (factoryStats: base 0 + the blast, x D(day))
      expect(stripIcons(line).replace(/3/, "").match(/\d/), `★${s} day ${day}: no second number`).toBeNull();
      expect(stripIcons(dmg).length, `★${s} day ${day}: the stat row holds the DMG`).toBeGreaterThan(0);
      expect(rows(line), `★${s} day ${day}: ${line}`).toBe(2); // 1d: two rows (335 px; was one row, 1c's 225 px)
    }
  });
});

describe("SHOPCARD-1b F7 (READ-9 fix 7): MANTLET's tile and GRAPNEL GUN's slug", () => {
  it("MANTLET: ITS GUN AND LAST BELT TILE IGNORE STUN (★1; ★2/★3 LAST n BELT TILES): battle.ts:852-853 GUARD_SKIRT on the last intakeGuard cells, 2402-2405 skirted", () => {
    expect(rules("mantlet", 1)).toEqual(["ITS GUN AND LAST BELT TILE IGNORE {*STUN}."]);
    expect(rules("mantlet", 2)).toEqual(["ITS GUN, LAST 2 BELT TILES IGNORE {*STUN}."]);
    expect(rules("mantlet", 3)).toEqual(["ITS GUN, LAST 3 BELT TILES IGNORE {*STUN}."]);
    for (const s of STARS) {
      expect(effectAt("mantlet", s).mod!.intakeGuard, `★${s}`).toBe(s);
      expect(rows(rules("mantlet", s)[0]), `★${s}`).toBe(1);
      expect(/\bLAST \d+ TILE\b/.test(stripIcons(rules("mantlet", s)[0])), "no 'LAST 1 TILE' left to read as a stun's length").toBe(false);
    }
  });
  it("GRAPNEL GUN: SHOT: A HIT ON A FOE BELT OR RIG RIPS n SLUG(S) (battle.ts:2355-2386 rip() splices the foe's slugs off its belts; nothing goes to the shooter); SHOPCARD-1c G6: only a hit, one verb, two rows (was LOSES, one row)", () => {
    for (const s of STARS) {
      const n = effectAt("grapnel", s).core!.rip!;
      expect(rules("grapnel", s), `★${s}`).toEqual([`SHOT: A HIT ON A FOE BELT OR RIG RIPS ${n} SLUG${n === 1 ? "" : "S"}.`]);
      expect(rows(rules("grapnel", s)[0]), `★${s}`).toBe(2);
    }
  });
});

describe("SHOPCARD-1b F8 (READ-9 fix 8): the sale mark and the merge mark (SHOPCARD-1c G2, G3 redrew both: these pins read 1c's pixels)", () => {
  const ink = (c: ReturnType<typeof fresh>, x0: number, y0: number, w: number, h: number): string[] => {
    const out: string[] = [];
    for (let y = 0; y < h; y++) {
      let row = "";
      for (let x = 0; x < w; x++) { const p = c.at(x0 + x, y0 + y); row += p === C.ink ? "." : p === C.lime ? "L" : p === C.amber ? "A" : p === C.yellow ? "Y" : p === null ? " " : "?"; }
      out.push(row);
    }
    return out;
  };

  it("(a) the sale mark is a SOLID down triangle (7-5-3-1 px, rows 1-4), no stem, lime on a 9 x 6 ink plate (1b's stemmed arrow read as a plus to Haiku again in READ-10)", () => {
    expect([SALE_W, SALE_H]).toEqual([9, 6]);
    const c = fresh(11, 8);
    drawSaleMark(G(c), 1, 1);
    expect(ink(c, 1, 1, SALE_W, SALE_H)).toEqual([
      ".........",
      ".LLLLLLL.",
      "..LLLLL..",
      "...LLL...",
      "....L....",
      ".........",
    ]);
  });

  it("(b) the merge mark is a SOLID up triangle over the game's own 5x6 star and its digit (2 or 3), amber, on an 11 x 13 ink plate; ★3 flashes gold at 2 Hz", () => {
    expect([MERGE_W, MERGE_H, STAR_W, STAR_H]).toEqual([11, 13, 5, 6]);
    // the star is render/font.ts:147's ★ at the 5x7 size: drawText("★", font 5) puts exactly its px
    const f = fresh(8, 9);
    drawText(G(f), "★", 1, 1, C.amber, { font: "5" });
    const glyph: string[] = [];
    for (let y = 0; y < STAR_H; y++) { let r = ""; for (let x = 0; x < STAR_W; x++) r += f.at(1 + x, 1 + y) === C.amber ? "#" : "."; glyph.push(r); }
    expect(glyph).toEqual([...STAR_ROWS]);
    const c2 = fresh(13, 15);
    drawMergeMark(G(c2), 1, 1, 2, 0);
    expect(ink(c2, 1, 1, MERGE_W, MERGE_H)).toEqual([
      "...........",
      ".....A.....",
      "....AAA....",
      "...AAAAA...",
      "..AAAAAAA..",
      "...........",
      "...A.......",
      "...A...AAA.",
      ".AAAAA...A.",
      "..AAA..AAA.",
      "..A.A..A...",
      ".A...A.AAA.",
      "...........",
    ]);
    const c3 = fresh(13, 15), c3b = fresh(13, 15);
    drawMergeMark(G(c3), 1, 1, 3, 0);
    drawMergeMark(G(c3b), 1, 1, 3, 0.3);
    expect(ink(c3, 1, 1, MERGE_W, MERGE_H).slice(6)).toEqual([
      "...A.......",
      "...A...AAA.",
      ".AAAAA...A.",
      "..AAA..AAA.",
      "..A.A....A.",
      ".A...A.AAA.",
      "...........",
    ]);
    // at t 0.3 the whole mark is gold (the flash): the triangle, the star and the 3
    expect(ink(c3b, 1, 1, MERGE_W, MERGE_H).join("").replace(/[.]/g, "")).toBe(ink(c3, 1, 1, MERGE_W, MERGE_H).join("").replace(/[.]/g, "").replace(/A/g, "Y"));
  });

  it("both marks keep SHOPCARD-1's rules: a clear px round each, none over the price, the picture's centre or each other, at every price, on every card width", () => {
    const clear = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
      a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;
    for (const [w, h] of [[CARD_W, CARD_H], [WIDE_CARD_MAX_W, WIDE_CARD_H], [69, WIDE_CARD_H]]) {
      const z0 = cardZones(w, h), icon = z0.icon, centre = { x: icon.x + 9, y: icon.y + 9, w: 6, h: 6 };
      expect([z0.merge.w, z0.merge.h, z0.sale.w, z0.sale.h]).toEqual([MERGE_W, MERGE_H, SALE_W, SALE_H]);
      for (const price of buyableModules().map((d) => d.price)) {
        const z = cardZones(w, h, price), pb = cardPriceBox(w, h, price); // 1c: the sale plate sits against this price
        expect(clear(z.merge, pb), `${w}x${h} price ${price}: the merge plate clear of the price`).toBe(true);
        expect(clear(z.sale, pb), `${w}x${h} price ${price}: the sale plate clear of the price`).toBe(true);
      }
      expect(clear(z0.merge, centre) && clear(z0.sale, centre), `${w}x${h}: clear of the picture's centre`).toBe(true);
      expect(clear(z0.merge, z0.sale) && clear(z0.merge, z0.gem) && clear(z0.sale, z0.gem), `${w}x${h}: clear of each other and the gem`).toBe(true);
      // the plates stay inside the card's inner area (x 2 .. w - 3, y 5 .. h - 6)
      for (const m of [z0.merge, z0.sale]) expect([m.x >= 2, m.x + m.w <= w - 2, m.y >= 5, m.y + m.h <= h - 5], `${w}x${h}`).toEqual([true, true, true, true]);
    }
  });
});
