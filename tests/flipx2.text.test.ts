// FLIP-X2 (REQ-BFG-069, REQ-BFG-047; REVIEW-FLIPX1.md section 5): step 1b's display pins, switch-independent.
// - Answer 2: KEYWORD_COLOUR.freeze and WORD_KEYWORDS' FREEZE / FREEZES / FROZEN / FROST are gone (freeze is no mechanic
//   since NUM-3). OVERDRIVE ★3's AFTERBURNER clause draws FROST and CHAIN in the text's bone and its {*STUN} in STUN's
//   colour (no test caught the FROST colour before: FLIP-X1 finding 3).
// - Answer 3: the rune bar's chips and the picker tray's chips are sized from their keyword word, as the card's chip is
//   (runeChipW = max(side, textWidth(word, 3x5) + 3)): SHIELD's 23 px word takes a 26 px chip on the desk's 22 px bar and
//   in the 22 px tray; the phone's bar chips (27) already hold it. Every other chip, and every layout without a SHIELD
//   rune, is exactly as before.
// - Answer 5: the three turret reasons write their counts as digits.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { C } from "../src/render/palette";
import { ICON, ICON_COLOUR, textWidth } from "../src/render/font";
import { ITEMS, withSustain } from "../src/sim/content";
import { RUNES, runeList, type RuneDef } from "../src/sim/runes";
import { KEYWORD_COLOUR, colourize } from "../src/ui/richText";
import { faceLines, ruleSpans } from "../src/ui/faces";
import { KEYWORD_WORD, RUNE_KEYWORD_COLOUR, runeKeyword } from "../src/ui/runeText";
import { RUNE_CHIP_MIN, drawRuneChip, runeBarLayout, runeChip, runeChipW, type RuneBarLayout } from "../src/ui/runeBar";
import { pickLayout } from "../src/screens/runePicker";
import { buildScale } from "../src/screens/build/layout";

/** A view as computeView frames the build screen (tests/runes.ui.test.ts's helper). */
function view(w: number, h: number, dpr: number) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const scale = buildScale(pw, ph, portrait, dpr);
  return { W: Math.floor(pw / scale), H: Math.floor(ph / scale), scale, dpr };
}
const OP = view(402, 690, 3);
/** The 1920x1080 desk with a rune held: pickScale steps it to x3 (640x360; FLIP-X1 finding 1). */
const DESK = { W: 640, H: 360, scale: 3, dpr: 1 };

/** The colour of each character of `word` in `spans`' text (the first place it appears). */
function colourOf(spans: readonly { t: string; c: string }[], word: string): string[] {
  const chars = spans.flatMap((s) => [...s.t].map((ch) => [ch, s.c] as const));
  const at = chars.map(([ch]) => ch).join("").indexOf(word);
  expect(at, word).toBeGreaterThanOrEqual(0);
  return [...new Set(chars.slice(at, at + word.length).map(([, c]) => c))];
}

describe("FLIP-X2 step 1b: FROST is a round's name, not a keyword (REVIEW-FLIPX1 answer 2)", () => {
  it("OVERDRIVE ★3's AFTERBURNER clause draws FROST and CHAIN in bone and STUN in STUN's colour", () => {
    const cl = faceLines("overdrive", 3)!.clause!;
    const spans = ruleSpans(cl.text, cl.label, C.bone);
    expect(colourOf(spans, "FROST")).toEqual([C.bone]);
    expect(colourOf(spans, "CHAIN")).toEqual([C.bone]);
    expect(colourOf(spans, "STUN")).toEqual([ICON_COLOUR[ICON.STUN]]);
    expect(C.bone).not.toBe(C.ice); // the colour FROST drew before
  });

  it("KEYWORD_COLOUR has no freeze, and FREEZE, FREEZES, FROZEN and FROST draw in the text's own colour", () => {
    expect(Object.keys(KEYWORD_COLOUR).sort()).toEqual(["burn", "faster", "poison", "shock", "slower"]);
    for (const w of ["FREEZE", "FREEZES", "FROZEN", "FROST"]) expect(colourize(w, C.bone), w).toEqual([{ t: w, c: C.bone }]);
    expect(colourize("SHOCK", C.bone)).toEqual([{ t: "SHOCK", c: KEYWORD_COLOUR.shock }]); // the others keep theirs
  });
});

describe("FLIP-X2 step 1b: the bar's and the tray's chips sized from the word (REVIEW-FLIPX1 answer 3)", () => {
  installRaster();
  /** The rune bar before FLIP-X2 (every chip `chip` wide), for the identity check. */
  function oldBar(W: number, top: number, n: number, chip: number): RuneBarLayout {
    const bar = { x: 0, y: top, w: W, h: chip + 6 };
    const pitch = chip + 3, x0 = 28;
    const fit = Math.max(1, Math.floor((W - 3 - x0 + 3) / pitch));
    const shown = n <= fit ? n : fit - 1;
    const at = (i: number) => ({ x: x0 + i * pitch, y: top + 3, w: chip, h: chip });
    return { bar, chip, chips: Array.from({ length: shown }, (_, i) => at(i)), shown, more: n > shown ? at(shown) : null };
  }
  const SHIELD_IDS = ["ward_stone", "bulwark_ward", "tick_guard", "shatter_shot"];
  const shields = () => SHIELD_IDS.map((id) => RUNES[id]);
  const others = () => withSustain(() => runeList().filter((d) => runeKeyword(d) !== "SHIELD"));

  it("only a SHIELD chip widens: 26 on the desk's bar and in the tray, 27 (unchanged) on the phone's bar", () => {
    expect([runeChip(OP), runeChip(DESK), RUNE_CHIP_MIN]).toEqual([27, 22, 22]);
    // the SHIELD runes: the three the dawn offers (runeList) and SHATTER SHOT, dormant since step 3b (its card still draws)
    // BAL-2 (the lines: DORMANT_RUNES empty): SHATTER SHOT is offered again, so the dawn offers all four (was the first three)
    expect(withSustain(() => runeList().filter((d) => runeKeyword(d) === "SHIELD").map((d) => d.id))).toEqual(SHIELD_IDS);
    expect(runeKeyword(RUNES.shatter_shot)).toBe("SHIELD");
    for (const d of shields()) expect([runeChipW(d, runeChip(DESK)), runeChipW(d, RUNE_CHIP_MIN), runeChipW(d, runeChip(OP))], d.id).toEqual([26, 26, 27]);
    for (const d of others()) expect([runeChipW(d, 22), runeChipW(d, 27)], d.id).toEqual([22, 27]);
  });

  it("every chip word sits inside its box at the bar's and the tray's sizes (the desk's 22 was SHIELD's 1 px clip)", () => {
    for (const side of [runeChip(DESK), RUNE_CHIP_MIN, runeChip(OP)]) {
      for (const d of withSustain(() => runeList())) {
        const k = runeKeyword(d)!, col = RUNE_KEYWORD_COLOUR[k];
        const r = { x: 4, y: 4, w: runeChipW(d, side), h: side };
        const c = fresh(r.w + 8, r.h + 8);
        drawRuneChip(G(c), r, d);
        const top = r.y + Math.floor((r.h - 3 - 13) / 2) + 8;
        let inside = 0, outside = 0;
        for (let y = top; y < top + 5; y++) for (let x = 0; x < r.w + 8; x++) {
          if (c.at(x, y) !== col) continue;
          if (x >= r.x + 1 && x < r.x + r.w - 1) inside++;
          else outside++;
        }
        expect([inside > 0, outside], `${side} ${d.id} ${KEYWORD_WORD[k]}`).toEqual([true, 0]);
      }
    }
  });

  it("without a SHIELD rune the bar and the tray are exactly as before, on the phone and the desk", () => {
    for (const v of [OP, DESK]) {
      const chip = runeChip(v);
      for (let n = 1; n <= 10; n++) {
        const ids = others().slice(0, n).map((d) => d.id);
        expect(runeBarLayout(v.W, 14, n, chip, ids.map((id) => runeChipW(RUNES[id], chip))), `${v.W} ${n}`).toEqual(oldBar(v.W, 14, n, chip));
        expect(runeBarLayout(v.W, 14, n, chip), `${v.W} ${n}`).toEqual(oldBar(v.W, 14, n, chip));
        if (n <= 9) expect(pickLayout(v.W, v.H, ["iron_skin"], -1, n, ids)).toEqual(pickLayout(v.W, v.H, ["iron_skin"], -1, n));
      }
    }
  });

  it("measured with every SHIELD rune held: the desk's bar pitch 25 -> 29 for a SHIELD chip, all 10 still shown; the tray holds them", () => {
    const held: RuneDef[] = [...shields(), ...others().slice(0, 6)];
    const ws = (side: number) => held.map((d) => runeChipW(d, side));
    // the desk (640 wide at x3): SHIELD chips 26 at a 29 pitch (was 22 at 25), the rest 22 at 25; the row ends at 291 (was 275)
    const B = runeBarLayout(DESK.W, 14, 10, runeChip(DESK), ws(runeChip(DESK)));
    const O = oldBar(DESK.W, 14, 10, runeChip(DESK));
    expect([B.shown, !!B.more, O.shown]).toEqual([10, false, 10]);
    expect(B.chips.map((r) => r.x)).toEqual([28, 57, 86, 115, 144, 169, 194, 219, 244, 269]);
    expect(O.chips.map((r) => r.x)).toEqual([28, 53, 78, 103, 128, 153, 178, 203, 228, 253]);
    expect([B.chips[9].x + B.chips[9].w, O.chips[9].x + O.chips[9].w]).toEqual([291, 275]);
    for (let i = 1; i < 10; i++) expect(B.chips[i].x).toBeGreaterThanOrEqual(B.chips[i - 1].x + B.chips[i - 1].w);
    // the phone (241 wide at x5): every chip is 27 already, so the row is unchanged (7 shown of 7; 6 and "+4" of 10)
    const P = runeBarLayout(OP.W, 14, 10, runeChip(OP), ws(runeChip(OP)));
    expect(P).toEqual(oldBar(OP.W, 14, 10, runeChip(OP)));
    expect([P.shown, !!P.more]).toEqual([6, true]);
    // the row's height is unchanged (chips stay `chip` tall), so runeRowFits and the build screen's scale don't move
    expect([B.bar.h, P.bar.h]).toEqual([O.bar.h, oldBar(OP.W, 14, 10, runeChip(OP)).bar.h]);
    // the tray, 9 held (4 SHIELD first): on the phone the first row holds 6 chips (4 at 26, 2 at 22; was 6 at 22) and the
    // second 3, so 2 rows as before. On the desk (the 300 px card) the row of 9 ends 3 px past the tray's edge, so the 9th
    // chip takes a second row: the tray 30 -> 55 tall, and the picker's block moves up 8 px (tray y 249 -> 241). With 3
    // SHIELD runes (all the dawn offers once SHATTER SHOT is dormant, FLIP-X2 step 3b) the desk keeps one row, unchanged.
    const cards = ["iron_skin", "tar_barrel", "coin_purse"];
    for (const v of [OP, DESK]) {
      const ids = held.slice(0, 9).map((d) => d.id);
      const L = pickLayout(v.W, v.H, cards, 0, 9, ids);
      const was = pickLayout(v.W, v.H, cards, 0, 9);
      if (v === OP) expect(L.tray, `${v.W}`).toEqual(was.tray);
      else expect([L.tray, was.tray]).toEqual([{ x: 170, y: 241, w: 300, h: 55 }, { x: 170, y: 249, w: 300, h: 30 }]);
      const three = [...held.slice(0, 3), ...held.slice(4, 10)].map((d) => d.id);
      expect(pickLayout(v.W, v.H, cards, 0, 9, three).tray, `${v.W}: 3 SHIELD runes`).toEqual(was.tray);
      expect(L.trayChips.map((r) => r.w)).toEqual([26, 26, 26, 26, 22, 22, 22, 22, 22]);
      for (const r of L.trayChips) {
        expect(r.x + r.w, `${v.W} tray`).toBeLessThanOrEqual(L.tray!.x + L.tray!.w - 4);
        expect(r.y + r.h).toBeLessThanOrEqual(L.tray!.y + L.tray!.h);
      }
      for (let i = 1; i < 9; i++) if (L.trayChips[i].y === L.trayChips[i - 1].y) expect(L.trayChips[i].x).toBeGreaterThanOrEqual(L.trayChips[i - 1].x + L.trayChips[i - 1].w);
      expect(L.bottom).toBeLessThanOrEqual(v.H);
    }
    const phoneRows = (L: ReturnType<typeof pickLayout>) => new Set(L.trayChips.map((r) => r.y)).size;
    const P9 = pickLayout(OP.W, OP.H, ["iron_skin"], -1, 9, held.slice(0, 9).map((d) => d.id));
    expect([phoneRows(P9), P9.trayChips.filter((r) => r.y === P9.trayChips[0].y).length]).toEqual([2, 6]);
  });
});

describe("FLIP-X2 step 1b: the turret reasons write counts as digits (REVIEW-FLIPX1 answer 5)", () => {
  it("HAIL GUN 3 loads, SIEGE GUN 4 loads, THUNDERER 4 gear slots; the counts match the data", () => {
    expect(ITEMS.hailgun.reason).toBe("The fastest gun, with 3 loads.");
    expect(ITEMS.siegegun.reason).toBe("A heavy gun that holds 4 loads and fires faster than BOMBARD.");
    expect(ITEMS.thunderer.reason).toBe("A quick heavy gun, with 4 gear slots.");
    expect([ITEMS.hailgun.turret!.window, ITEMS.siegegun.turret!.window]).toEqual([3, 4]);
    for (const id of ["hailgun", "siegegun", "thunderer"]) expect(ITEMS[id].reason, id).not.toMatch(/\b(three|four)\b/i);
  });
});
