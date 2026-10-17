// SHOPCARD-1c (REQ-BFG-081, REQ-BFG-115; BRIEF-SHOPCARD1C section 3; READ-10's fix list): the two shop-card marks, four face lines and one
// note. Display only: one group per fix, each pinning the words (or pixels), their rows in the 225 px op band, and the sim line that
// makes them true. The sim is untouched (git diff shopcard1b-accepted -- src/sim src/net src/core server is empty).
//   G1  HOW TO PLAY line 3 says what merging is (one clause), true by src/game/fuse.ts
//   G2  the merge mark: a solid up triangle, the game's own 5x6 star and the target's digit
//   G3  the sale mark: a solid down triangle against the price (candidate A); B: the price in lime, red wins when too dear
//   G5  STOKER: no HIT, the factories its arrows point at (two rows)
//   G6  GRAPNEL GUN: only a hit on a foe belt or rig rips, one verb (two rows)
//   G7  LIMPET WORKS: ITS DMG, no second number
//   G8  ASSEMBLY LINE: EACH FIGHT, START WORKING (two rows)
//   G9  TWIN LATCH: its own HIT note, the both-arrows-on-belts condition
//   G10 QUENCH TANK: whose BURN (the slug's)
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { UI } from "../src/ui/ui";
import { detailsPlan, panelFit, visibleLines } from "../src/screens/build/inspector";
import { panelArea } from "../src/screens/build/layout";
import type { Ctx } from "../src/screens/build/actions";
import { newRun } from "../src/game/run";
import { gainModule, mergePreview } from "../src/game/fuse";
import { ITEMS, buyableModules } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { C } from "../src/render/palette";
import { ICON, drawText, icons, stripIcons, textWidth, wrap } from "../src/render/font";
import { faceAt, faceLines } from "../src/ui/faces";
import { GLOSSARY_WRAP_W, glossaryEntry, glossaryText } from "../src/ui/glossary";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { levelLines, levelText } from "../src/screens/build/levels";
import { HELP, helpLine3, helpLines } from "../src/screens/title";
import { helpCard } from "../src/screens/titleLayout";
import { shapedPiece } from "../src/screens/build/shapeEdit";
import { shapeGridSize } from "../src/ui/shapePic"; // SC-0912: the piece's own cell (gridCell, 4 for PICKAXE) is shapeGridSize's default (was GRID_CELL)
import { CARD_H, CARD_W, WIDE_CARD_H, WIDE_CARD_MAX_W } from "../src/screens/build/layout";
import { OWNED_MARK_H, OWNED_MARK_W, DIGIT_H, DIGIT_ROWS, DIGIT_W, MERGE_H, MERGE_W, SALE_H, SALE_STYLE, SALE_W, STAR_H, STAR_ROWS, STAR_W, TRI_H, TRI_W,
  cardPriceBox, cardZones, drawCard, drawMergeMark, drawSaleMark, offerFace, ownedMarkAt, priceColour, tooltipLines, type CardState } from "../src/screens/build/shop";
import type { ShopBadge } from "../src/game/run";

installRaster();

const BAND = GLOSSARY_WRAP_W; // 225 px: the phone panel's text width, 5x7
const STARS = [1, 2, 3];
const DAYS: (number | undefined)[] = [undefined, 5, 10];
const rules = (def: string, s: number, day?: number): string[] => faceAt(def, s, { k: 1, hero: "furnace", day })!.rules.map((r) => r.text); // markup
const rows = (markup: string, width = BAND): number => wrap(icons(markup), width, "5").length;
type Box = { x: number; y: number; w: number; h: number };
const clear = (a: Box, b: Box): boolean => a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y;
const SIZES: [number, number][] = [[CARD_W, CARD_H], [69, WIDE_CARD_H], [WIDE_CARD_MAX_W, WIDE_CARD_H]];
const ink = (c: ReturnType<typeof fresh>, x0: number, y0: number, w: number, h: number): string[] => {
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) { const p = c.at(x0 + x, y0 + y); row += p === C.ink ? "." : p === C.lime ? "L" : p === C.amber ? "A" : p === C.yellow ? "Y" : p === null ? " " : "?"; }
    out.push(row);
  }
  return out;
};

describe("SHOPCARD-1c G1 (READ-10 fix 1): HOW TO PLAY says what merging is, once", () => {
  const CLAUSE = "BUY A COPY OF A PIECE YOU OWN TO MERGE THEM INTO ★2 (TWO ★2 MERGE INTO ★3).";
  it("line 3 holds the clause right after TAP A CARD TO READ IT, before the belt sentences; lines 1, 2 and 4-6 are as they were", () => {
    for (const free of [true, false]) {
      const l3 = helpLine3(free);
      expect(l3, `free ${free}`).toContain(`TAP A CARD TO READ IT (ON A DESK, POINT AT IT). ${CLAUSE} DRAG OUT OF YOUR FACTORY`);
      expect(l3.split("MERGE").length - 1, "MERGE twice in the one clause: the verb and the ★2 pair").toBe(2);
    }
    expect(HELP[2]).toBe(helpLine3());
    expect(helpLines()[2]).toBe(helpLine3());
    // item 2's hearts line and items 1, 4, 5, 6 untouched (BUMP-1D rewrites 1-2; the release lane merges both)
    expect(HELP[0]).toBe("1  SURVIVE 10 DAYS. EACH DAY IS THE CARAVAN AT DAWN, THE ROAD, THEN A DUSK FIGHT AGAINST A GHOST: ANOTHER CAPTAIN'S SAVED CRUISER.");
    expect(HELP[3]).toBe("4  STAND RIGS BESIDE THE BELT, ARROWS AT IT (TAP TO TURN): BURN, STUN, SPLIT, SPEED UP OR SLOW DOWN. A SHAPE ON A CARD IS THE CELLS THAT PIECE FILLS, WITH A RIG'S ARROWS IN GREEN. MOST RIGS WORK ON EACH SLUG ON A TILE THEIR ARROWS POINT AT. LONGER CINDER ROUTES COOK HOTTER SLUGS.");
  });

  it("the ★ and the digits it uses are drawn in both faces the card takes (3x5 at k 1, 5x7 where the title steps down)", () => {
    for (const font of ["3", "5"] as const) {
      expect(textWidth("★2", font), font).toBeGreaterThan(textWidth("2", font));
      const c = fresh(30, 12);
      drawText(G(c), "★2", 1, 1, C.amber, { font });
      let on = 0;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 30; x++) if (c.at(x, y) === C.amber) on++;
      expect(on, `font ${font}: ★ and 2 are drawn`).toBeGreaterThan(14);
    }
  });

  it("the card still fits: helpCard's rows grow by the clause only, and the card stays on a 360 x 640 screen at the 5x7 face", () => {
    const old = HELP.map((ln, i) => (i === 2 ? ln.replace(` ${CLAUSE}`, "") : ln));
    for (const [W, H, k] of [[360, 640, 2], [402, 690, 2], [1366, 768, 1], [844, 390, 1]] as [number, number, number][]) {
      const a = helpCard(W, H, k, old), b = helpCard(W, H, k, HELP);
      expect(b.h - a.h, `${W}x${H} k${k}: at most 2 more rows`).toBeLessThanOrEqual(2 * b.row);
      expect(b.y >= 0 && b.y + b.h <= H, `${W}x${H} k${k}: ${b.y}+${b.h} of ${H}`).toBe(true);
    }
  });

  it("the clause is true by src/game/fuse.ts: a copy bought of a piece you own merges into ★2; a ★2 and a ★1 do not; two ★2 merge into ★3", () => {
    const run = newRun("furnace", 5, "shopcard1c-g1");
    const def = "whetstone";
    const a = gainModule(run, def); // the first copy: nothing to merge with
    expect([a.steps.length, a.stars], "first copy").toEqual([0, 1]);
    expect(mergePreview(run, def), "a second copy would merge").not.toBeNull();
    const b = gainModule(run, def); // a copy of a piece you own: merges, into ★2 (fuse.ts chain: same def, same stars, below FUSE_MAX)
    expect([b.steps.length, b.stars], "second copy").toEqual([1, 2]);
    const c = gainModule(run, def); // a ★2 is owned and a ★1 arrives: no twin at ★1, so no merge
    expect([c.steps.length, c.stars], "third copy: ★2 and ★1 stay apart").toEqual([0, 1]);
    const d = gainModule(run, def); // ★1 + ★1 -> ★2, then ★2 + ★2 -> ★3 (a chain), and 3 is the top
    expect([d.steps.length, d.stars], "fourth copy: ★1+★1, ★2+★2").toEqual([2, 3]);
    expect(mergePreview(run, def), "a ★3 is never merged further").toBeNull();
  });
});

describe("SHOPCARD-1c G2 (READ-10 fix 2): the merge mark is a solid up triangle over a real star and the target's digit", () => {
  it("the star sprite is the game's own ★ at 5x7 (render/font.ts:147) and the digits are the 3x5 face's own 2 and 3; both exceed the 3x5 ★ READ-10's readers took for blocks", () => {
    expect([STAR_W, STAR_H, DIGIT_W, DIGIT_H, TRI_W, TRI_H]).toEqual([5, 6, 3, 5, 7, 4]);
    expect(STAR_W, "at least 5x5").toBeGreaterThanOrEqual(5);
    expect(STAR_H, "at least 5x5").toBeGreaterThanOrEqual(5);
    const glyph = (s: string, font: "3" | "5", w: number, h: number): string[] => {
      const f = fresh(w + 2, h + 2);
      drawText(G(f), s, 1, 1, C.amber, { font });
      const out: string[] = [];
      for (let y = 0; y < h; y++) { let r = ""; for (let x = 0; x < w; x++) r += f.at(1 + x, 1 + y) === C.amber ? "#" : "."; out.push(r); }
      return out;
    };
    expect(glyph("★", "5", STAR_W, STAR_H)).toEqual([...STAR_ROWS]);
    expect(glyph("2", "3", DIGIT_W, DIGIT_H)).toEqual([...DIGIT_ROWS[2]]);
    expect(glyph("3", "3", DIGIT_W, DIGIT_H)).toEqual([...DIGIT_ROWS[3]]);
  });

  it("the plate: 11 x 13, ink round the art; the triangle is solid (1-3-5-7 px, no stem) over a clear row; no card draws a star of its own (the only text is the price, SHOPCARD-1)", () => {
    expect([MERGE_W, MERGE_H]).toEqual([11, 13]);
    for (const stars of [2, 3] as const) {
      const c = fresh(13, 15);
      drawMergeMark(G(c), 1, 1, stars, 0);
      const art = ink(c, 1, 1, MERGE_W, MERGE_H);
      expect(art.slice(0, 6), `★${stars}`).toEqual(["...........", ".....A.....", "....AAA....", "...AAAAA...", "..AAAAAAA..", "..........."]);
      expect(art[12], "the last row is ink").toBe("...........");
      // nothing outside the plate
      let outside = 0;
      for (let y = 0; y < 15; y++) for (let x = 0; x < 13; x++) if (c.at(x, y) !== null && (x < 1 || y < 1 || x >= 1 + MERGE_W || y >= 1 + MERGE_H)) outside++;
      expect(outside, `★${stars}`).toBe(0);
    }
    // a shop card shows no star level of its own: drawCard's only text is the price (tests/shopcard1), so the mark is the only star on it
  });

  it("★3 keeps its flash: amber at t 0, gold at t 0.3, the whole mark; ★2 stays amber at every t", () => {
    const tone = (stars: number, t: number): string => {
      const c = fresh(13, 15);
      drawMergeMark(G(c), 1, 1, stars, t);
      return ink(c, 1, 1, MERGE_W, MERGE_H).join("").replace(/[.]/g, "");
    };
    expect(new Set(tone(3, 0))).toEqual(new Set("A"));
    expect(new Set(tone(3, 0.3))).toEqual(new Set("Y"));
    expect(new Set(tone(2, 0)).size + new Set(tone(2, 0.3)).size).toBe(2);
    expect(tone(2, 0.3)).toBe(tone(2, 0));
  });

  it("the zone rules hold at every price 1-13 and every card width (46, 69, 70): a clear px round the merge plate and the owned marker, none over the price, the picture's centre, the gem, the sale plate or a shaped piece's grid plate; the plate's rect is given", () => {
    const shaped = buyableModules().filter((d) => shapedPiece(d.id)).map((d) => d.id);
    expect(shaped.length).toBe(11); // SC-0912: was 5 (SHOPCARD-1's NAIL STRIP, EMBER TROUGH, SPIKE RAIL, GANTRY PRESS, ASSEMBLY LINE); 0.9.11's SHAPES2 adds ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER and PICKAXE
    for (const [w, h] of SIZES) {
      const z0 = cardZones(w, h), icon = z0.icon, centre: Box = { x: icon.x + 9, y: icon.y + 9, w: 6, h: 6 };
      expect(z0.merge, `${w}x${h}: the merge plate's rect`).toEqual({ x: 2, y: h - 18, w: 11, h: 13 });
      const owned: Box = { ...ownedMarkAt(h), w: OWNED_MARK_W, h: OWNED_MARK_H };
      expect(owned.x >= z0.merge.x && owned.x + owned.w <= z0.merge.x + z0.merge.w && owned.y >= z0.merge.y && owned.y + owned.h <= z0.merge.y + z0.merge.h, `${w}x${h}: the owned marker lies in the plate`).toBe(true);
      for (let price = 1; price <= 13; price++) {
        const z = cardZones(w, h, price), pb = cardPriceBox(w, h, price);
        for (const [n, m] of [["merge", z.merge], ["owned", owned]] as [string, Box][]) {
          expect(clear(m, pb), `${w}x${h} price ${price}: ${n} clear of the price`).toBe(true);
          expect(clear(m, centre), `${w}x${h}: ${n} clear of the picture's centre`).toBe(true);
          expect(clear(m, z.gem), `${w}x${h}: ${n} clear of the gem`).toBe(true);
          expect(clear(m, z.sale), `${w}x${h} price ${price}: ${n} clear of the sale plate`).toBe(true);
        }
        for (const id of shaped) {
          const sz = shapeGridSize(id), plate: Box = { x: z.grid.x, y: z.grid.y, w: sz.w + 2, h: sz.h + 2 };
          expect(clear(plate, z.merge), `${w}x${h} ${id}: the grid's plate clear of the merge plate`).toBe(true);
          expect(clear(plate, owned), `${w}x${h} ${id}: the grid's plate clear of the owned marker`).toBe(true);
        }
        expect(z.merge.x >= 2 && z.merge.x + z.merge.w <= w - 2 && z.merge.y >= 5 && z.merge.y + z.merge.h <= h - 5, `${w}x${h}: inside the card`).toBe(true);
      }
    }
  });
});

describe("SHOPCARD-1c G3 (READ-10 fix 3): the sale mark is a solid down triangle against the price (A); the price in lime is B", () => {
  it("A: a solid down triangle, 7-5-3-1 px, lime on a 9 x 6 ink plate, no stem (a stem read as a plus to Haiku in READ-9 and READ-10)", () => {
    expect([SALE_W, SALE_H, TRI_W, TRI_H]).toEqual([9, 6, 7, 4]);
    const c = fresh(11, 8);
    drawSaleMark(G(c), 1, 1);
    expect(ink(c, 1, 1, SALE_W, SALE_H)).toEqual([".........", ".LLLLLLL.", "..LLLLL..", "...LLL...", "....L....", "........."]);
  });

  it("the plate sits against the price: 1 clear px right of its box, on the digits' rows, at every price 1-13 and width; clear of the gem, the centre and the merge plate; inside the card", () => {
    for (const [w, h] of SIZES) {
      for (let price = 1; price <= 13; price++) {
        const z = cardZones(w, h, price), pb = cardPriceBox(w, h, price), icon = z.icon;
        expect(z.sale, `${w}x${h} price ${price}`).toEqual({ x: pb.x + pb.w + 1, y: h - 11, w: 9, h: 6 });
        expect(z.sale.x - (pb.x + pb.w), `${w}x${h} price ${price}: one clear px`).toBe(1);
        expect(clear(z.sale, pb) && clear(z.sale, z.gem) && clear(z.sale, z.merge), `${w}x${h} price ${price}`).toBe(true);
        expect(clear(z.sale, { x: icon.x + 9, y: icon.y + 9, w: 6, h: 6 }), `${w}x${h}: clear of the picture's centre`).toBe(true);
        expect(z.sale.x + z.sale.w <= w - 2 && z.sale.y >= 5 && z.sale.y + z.sale.h <= h - 5, `${w}x${h} price ${price}: inside the card`).toBe(true);
        expect(z.sale.y >= pb.y && z.sale.y + z.sale.h <= pb.y + pb.h, `${w}x${h}: on the digits' rows`).toBe(true);
      }
    }
  });

  it("B: the sale price in lime, but a too-dear card keeps its RED price (red = you can't afford it, which outranks a cheaper price); the triangle stays lime either way", () => {
    expect(SALE_STYLE.priceLime, "the shipped candidate").toBe(false);
    expect([priceColour(true, true, false), priceColour(true, false, false), priceColour(false, true, false)]).toEqual([C.yellow, C.yellow, C.red]);
    expect([priceColour(true, true, true), priceColour(true, false, true), priceColour(false, true, true), priceColour(false, false, true)]).toEqual([C.lime, C.yellow, C.red, C.red]);
    const priceColours = (affordable: boolean, sale: boolean): Set<string | null> => {
      const w = CARD_W, h = CARD_H, c = fresh(w + 8, h + 8), pb = cardPriceBox(w, h, 7);
      const st: CardState = { sold: false, affordable, selected: false, hover: false, pulse: false, hidden: false, shake: 0, sale };
      drawCard(G(c), { x: 4, y: 4, w, h }, ITEMS.whetstone, 7, "alchemist", st, 0);
      const seen = new Set<string | null>();
      for (let y = 0; y < pb.h; y++) for (let x = 7; x < pb.w - 1; x++) seen.add(c.at(4 + pb.x + x, 4 + pb.y + y));
      return seen;
    };
    try {
      for (const lime of [false, true]) {
        SALE_STYLE.priceLime = lime;
        expect(priceColours(true, true).has(lime ? C.lime : C.yellow), `lime ${lime}: sale, affordable`).toBe(true);
        expect(priceColours(true, true).has(lime ? C.yellow : C.lime), `lime ${lime}: the other colour is absent`).toBe(false);
        expect(priceColours(true, false).has(C.yellow), `lime ${lime}: no sale`).toBe(true);
        expect(priceColours(false, true).has(C.red) && !priceColours(false, true).has(C.lime), `lime ${lime}: too dear and on sale: red`).toBe(true);
      }
    } finally { SALE_STYLE.priceLime = false; }
  });
});

describe("SHOPCARD-1c G5 (READ-10 fix 5): STOKER names the factories its arrows point at, with no HIT", () => {
  it("FACTORIES ITS ARROWS POINT AT WORK UP TO n% FASTER. at every star on days 1, 5 and 10: two rows of the band; no HIT or HITS in any text the panel or tooltip draws for it (deck.ts:432-447 stokeHits, battle.ts:808-818)", () => {
    for (const s of STARS) for (const day of DAYS) {
      const up = ["20%", "44%", "85%"][s - 1];
      expect(rules("stoker", s, day), `★${s} day ${day}`).toEqual([`FACTORIES ITS ARROWS POINT AT WORK UP TO ${up} FASTER.`]);
      expect(rows(rules("stoker", s, day)[0]), `★${s}`).toBe(2);
    }
    const all = [...offerFace("stoker", { hero: "furnace" }), ...faceBlocks("stoker", 1, { hero: "furnace" })!.map((b) => b.text)].join(" ");
    expect(/\bHITS?\b/.test(stripIcons(icons(all))), all).toBe(false);
    expect(effectAt("stoker", 1).gate!.stoke).toBe(0.2); // the number is the sim's (the ladder's 20% / 44% / 85%)
  });
});

describe("SHOPCARD-1c G6 (READ-10 fix 6): GRAPNEL GUN rips only on a hit, with one verb", () => {
  it("SHOT: A HIT ON A FOE BELT OR RIG RIPS n SLUG(S). at every star: two rows; the ladder and the SHOT note use RIPS too (battle.ts:2190 impact -> 2355-2386 rip(); the shot's damage lands first, 2142-2151)", () => {
    for (const s of STARS) {
      const n = effectAt("grapnel", s).core!.rip!;
      const line = `SHOT: A HIT ON A FOE BELT OR RIG RIPS ${n} SLUG${n === 1 ? "" : "S"}.`;
      expect(rules("grapnel", s), `★${s}`).toEqual([line]);
      expect(rows(line), `★${s}`).toBe(2);
      expect(levelLines("grapnel", s)!.map((l) => levelText(l)).some((l) => l.startsWith("RIPS ")), `★${s}: the ⓘ ladder says RIPS`).toBe(true);
      expect(/LOSES|TAKES/.test(line), "one verb: no LOSES, no TAKES").toBe(false);
    }
    expect(glossaryText("SHOT", { def: "grapnel", stars: 1 })).toBe("SHOT: IT RIPS THE NEAREST SLUGS WITHIN 1 TILE OF A HIT.");
    expect(faceLines("grapnel", 1, { k: 1 })!.rules.map((r) => r.text.includes("RIPS"))).toEqual([true]);
  });
});

describe("SHOPCARD-1c G7 (READ-10 fix 7): LIMPET WORKS says ITS DMG, with no second number", () => {
  it("THE FOE'S HULL TAKES ITS DMG 3 SEC AFTER A HIT., one row at every star on days 1, 5 and 10; the stat row's DMG is the blast (content.ts:532-539 base 0 + blast; battle.ts:2350, 2431-2441); SHOPCARD-1d H2 changed the line to THE DMG LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3 SEC AFTER A HIT. (two rows): 1c's words and row pin retire", () => {
    expect(ITEMS.limpet.factory!.base).toBe(0);
    for (const s of STARS) for (const day of DAYS) {
      const [line] = rules("limpet", s, day);
      // SHOPCARD-1d (H2; READ-11 fix list 2: 2 of 6 readers still read ITS DMG as a second dose or "again"): the DMG lands once, as a blast
      // (was "THE FOE'S HULL TAKES ITS {DMG} 3{SEC} AFTER A HIT.", one row, 225 px); two rows now (335 px, no digit but the delay)
      expect(line, `★${s} day ${day}`).toBe("THE {DMG} LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3{SEC} AFTER A HIT.");
      expect(stripIcons(icons(line)).replace(/3/, "").match(/\d/), `★${s} day ${day}: the delay is the only number`).toBeNull();
      expect(rows(line), `★${s} day ${day}`).toBe(2);
      expect(textWidth(icons(line), "5"), `★${s} day ${day}`).toBeLessThanOrEqual(2 * BAND);
      // the blast is the one DMG a reader sees: the stat row's (day 1: 100 / 230 / 360)
      expect(faceLines("limpet", s, { day })!.stats, `★${s} day ${day}`).toBeDefined();
    }
    expect(faceAt("limpet", 1, { day: undefined })!.stats).toEqual([["RATE", "13"], ["DMG", "100"], ["BELT", "2"]]);
    // READ-9's round A miss stays fixed: no "SLUG BLAST" (an impact hit plus a second blast); SHOPCARD-1d: BLAST is the line's own word now
    // (the DMG IS the blast), but no SLUG on it
    expect(rules("limpet", 1)[0]).not.toMatch(/SLUG/);
    expect(rules("limpet", 1)[0]).not.toMatch(/SLUG BLAST/);
  });
});

describe("SHOPCARD-1c G8 (READ-10 fix 8): ASSEMBLY LINE says when and what", () => {
  it("FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING n% SOONER. (★3: AT ONCE.), two rows at every star on days 1, 5 and 10 (battle.ts:714-736 commissionAt at each fight's start, 979-981 online at t >= commissionAt)", () => {
    expect([1, 2, 3].map((s) => rules("assembly", s)[0])).toEqual([
      "FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 50% SOONER.", "FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 75% SOONER.", "FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING AT ONCE.", // SHOPCARD-1e (E2; READ-12 fix 1): ALL YOUR RIGS (was YOUR RIGS): 3 of 5 answers below R hedged all or some rigs; battle.ts:714-736 scales every rig's commissionAt
    ]);
    for (const s of STARS) for (const day of DAYS) expect(rows(rules("assembly", s, day)[0]), `★${s} day ${day}`).toBe(2);
    expect(effectAt("assembly", 1).factory!.commission).toBe(0.5);
    expect(effectAt("assembly", 3).factory!.commission).toBe(0);
  });
});

describe("SHOPCARD-1c G9 (READ-10 fix 9): TWIN LATCH's own HIT note says when it holds", () => {
  it("HIT on TWIN LATCH says it holds only when both its arrows point at belts (battle.ts:757-764: a latch needs g.hits.length === 2; tests/wave3.engine.test.ts 'a latch with one arrow on a belt never holds'); 2 rows; the HIT row and LONG HAUL's note stand", () => {
    const note = glossaryText("HIT", { def: "twinlatch", stars: 1 })!;
    expect(note).toBe("HIT: IT HOLDS A SLUG IT HITS, BUT ONLY WHEN BOTH ITS ARROWS POINT AT BELTS.");
    expect(note.startsWith("HIT: ")).toBe(true);
    expect(rows(note, BAND), note).toBeLessThanOrEqual(2);
    expect(rows(note, BAND)).toBe(2);
    expect(glossaryText("HIT", { def: "riveter", stars: 1 })).toBe(glossaryEntry("HIT")!.def);
    expect(glossaryText("HIT", { def: "longhaul", stars: 1 })).toBe("HIT: WHEN IT HITS A SLUG, EVERY EARLIER HIT ON THAT SLUG COUNTS, SPEED RIGS TOO.");
    // a note only in 1c: the face line was as it was; SHOPCARD-1d (H1) adds the condition to the face too (the note's words), one rule, two rows
    expect(rules("twinlatch", 1)[0]).toBe("HIT: HOLDS A {SLUG} UP TO 1{SEC} TO MAKE A {*PAIR}. BOTH ITS ARROWS MUST POINT AT BELTS.");
  });
});

describe("SHOPCARD-1c G10 (READ-10 fix 10, optional): QUENCH TANK says whose BURN", () => {
  it("HIT: TURNS EACH BURN ON A SLUG INTO +n DMG., one row at every star on days 1, 5 and 10 (battle.ts applyHit: the BURN the slug carries turns into damage on that slug)", () => {
    for (const s of STARS) for (const day of DAYS) {
      const [line] = rules("quench", s, day);
      expect(line, `★${s} day ${day}`).toMatch(/^HIT: TURNS EACH \{\*BURN\} ON A \{SLUG\} INTO \+\d+ \{DMG\}\.$/);
      expect(rows(line), `★${s} day ${day}: ${line}`).toBe(1);
    }
  });
});

describe("SHOPCARD-1c: the tooltip and the panel carry the changed lines whole (two rows lay out with no clip)", () => {
  it("the desk tooltip's wrapped rows hold every word of each changed line, in order, at every star on days 1, 5 and 10", () => {
    for (const def of ["stoker", "grapnel", "limpet", "assembly", "quench"]) for (const day of DAYS) {
      const faceTexts = offerFace(def, { hero: "furnace", day });
      const joined = faceTexts.flatMap((t) => tooltipLines(t)).map((l) => l.map((sp) => sp.t).join("")).join(" ").replace(/\s+/g, " ");
      const want = stripIcons(icons(rules(def, 1, day)[0])).replace(/\s+/g, " ");
      // every word of the face line, in order (icons aside)
      let at = 0;
      for (const word of want.split(" ").filter(Boolean)) {
        const i = joined.indexOf(word, at);
        expect(i, `${def} day ${day}: "${word}" in the tooltip's rows`).toBeGreaterThanOrEqual(0);
        at = i + word.length;
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------ the panel's second rows
/** The build screen as the game frames it (tests/card2.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}

describe("SHOPCARD-1c (BRIEF rule 4): a second row lays out whole: no overlap, no clip, at every star on days 1, 5 and 10, on the finger's panel and the desk's column", () => {
  const VIEWS: [string, number, number, number, boolean][] = [["phone 402x690", 402, 690, 3, true], ["phone 360x640", 360, 640, 2, true], ["desk 1920x1080", 1920, 1080, 1, false]];
  it("STOKER, GRAPNEL GUN and ASSEMBLY LINE (two rows) and LIMPET WORKS, QUENCH TANK (one): every row of the face's rule is among the panel's visible lines, one under the other, each inside the panel's reach", () => {
    let panels = 0;
    for (const [vn, w, h, dpr, touch] of VIEWS) for (const day of [1, 5, 10]) for (const s of STARS) for (const def of ["stoker", "grapnel", "limpet", "assembly", "quench"]) {
      const run = newRun("furnace", day, `shopcard1c-${def}-${s}`);
      run.inventory = [{ uid: 900, def, ...(s > 1 ? { stars: s } : {}) }];
      const sel: Sel = { kind: "cargo", uid: 900 }, f = framed(w, h, dpr);
      const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
      const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
      const plan = detailsPlan(ctx, sel, null, area)!.plan;
      const vis = visibleLines(plan).flatMap((v) => (v.line === "rule" ? [] : [{ y: v.y, line: v.line }]));
      const rule = rules(def, s, day)[0], want = rows(rule); // the rows the face's line takes at the panel's 225 px text width
      const text = (l: { line: { spans: { t: string }[] } }): string => l.line.spans.map((sp) => sp.t).join("");
      const joined = vis.map(text).join(" ").replace(/\s+/g, " ");
      // the words (a number is the day's: the panel's own day sets it, this test is about the rows)
      const words = stripIcons(icons(rule)).replace(/\s+/g, " ").split(" ").filter((x) => x && !/\d/.test(x));
      let at = 0;
      for (const word of words) {
        const i = joined.indexOf(word, at);
        expect(i, `${vn} day ${day} ★${s} ${def}: "${word}" among the visible lines (${want} row(s) of the rule)`).toBeGreaterThanOrEqual(0);
        at = i + word.length;
      }
      // no overlap: every visible line starts a full pitch under the one before; no clip: its glyphs end by the panel's last y
      vis.forEach((l, i) => {
        if (i) expect(l.y - vis[i - 1].y, `${vn} day ${day} ★${s} ${def}: line ${i} under line ${i - 1}`).toBeGreaterThanOrEqual((vis[i - 1].line as unknown as { pitch: number }).pitch);
        expect(l.y + ((l.line as unknown as { font: string }).font === "5" ? 7 : 5), `${vn} day ${day} ★${s} ${def}: line ${i} inside the panel`).toBeLessThanOrEqual(plan.maxY);
      });
      panels++;
    }
    expect(panels).toBe(VIEWS.length * 3 * STARS.length * 5);
  });
});
