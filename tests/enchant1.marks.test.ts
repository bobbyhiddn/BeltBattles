// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7; REQ-BFG-050): THE MARKS, drawn into tests/raster.helpers.ts's software raster.
//  - the spark: a 3x3 mark in the word's colour on the top-right corner of an enchanted piece on the board (the build screen's deck, the
//    battle world's views, the scouted foe's view: all draw through machinery.ts drawMachinery and cruiser.ts drawTurrets), on every facing,
//    for a rig, a shaped rig, a factory, a shaped factory and a turret; on the cards that print no name (the cargo slot, the carried tile,
//    the LAST CHANCE PART card); never on a plain piece, never on the shop's cards, and with the switch off every frame is as it was;
//  - GROWING's counter: a number badge on a piece holding GROWING above 0, the number being its `grow`; ENCHANT-1b (N5): the badge is the
//    battle's count box at its own size (9 px tall, the numeral's width + 4), a white numeral with an ink outline on ink, its 1 px frame in
//    GROWING's green (it was a 5 x 7 green badge with an ink numeral: a small green glyph at phone size);
//  - the battle's line for a swallowed STUN (the `braced` event): the word first in its colour; the game keeps no text log, so it is the
//    word's ring and pop over the part;
//  - ENCHANT-1b (N1): MASSIVE goes on a TURRET only and SWIFT on a FACTORY only. A piece is marked with the words its kind takes (WORDS(kind));
//    a word on any other kind (a forged build the validators refuse) draws no mark, as the panels read none.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { G, diffPx, fresh, installRaster, sig, type RasterCanvas } from "./raster.helpers";
import { SEED, barge } from "./wave3.helpers";
import { ITEMS } from "../src/sim/content";
import { Arena } from "../src/game/arena";
import { react } from "../src/game/arenaReact";
import { BRACED_TAIL, bracedLine, bracedLineText } from "../src/game/enchantReact";
import { newRun, pendingLastChance } from "../src/game/run";
import { adjacentToFactory, cellsOf, hero as heroOf, key as K, setTurretList, type Build, type BuildTurret, type Placed } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, enchantKindOf, setEnchant, withEnchant, type EnchantId, type EnchantKind } from "../src/sim/enchant";
import { lastChanceWord } from "../src/sim/enchantSources";
import { boxRect, footX, footY, frameForHull, localRect, type DeckFrame } from "../src/render/frame";
import { RARITY_COLOR } from "../src/render/palette";
import { C } from "../src/render/palette";
import { drawText, glyphRows, textWidth } from "../src/render/font";
import { rect } from "../src/render/pixel";
import { levelMarks } from "../src/render/levelMark";
import { BOX_H, boxW } from "../src/game/counters";
import { BattleCounters } from "../src/screens/battleCounters";
import { drawMachinery } from "../src/render/machinery";
import { cruiserModel, drawTurrets, turretPivotX, turretPivotY, type CruiserView } from "../src/render/cruiser";
import { DEFAULT_SKIN } from "../src/render/styles";
import { ENCHANT_SPARK_ROWS } from "../src/render/enchantArt";
import { pipColumn } from "../src/render/raceArt";
import { COUNTER_H, SPARK_SIZE, carriedMark, counterSize, drawGrowCounter, markColour, pieceMarkAt, sparkColumn, turretMarkAt, wordMark } from "../src/render/enchantMarks";
import { UI, itemSlot } from "../src/ui/ui";
import { drawLifted } from "../src/screens/build/cues";
import { drawCard } from "../src/screens/build/shop";
import { LastChancePicker, lcWord, partInfo } from "../src/screens/lastChancePicker";
import { buildLayout, buildScale, phoneBarLift, phoneScreen } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { TAP_CSS } from "../src/ui/tap";
import { setTipsForTests } from "../src/ui/tips";
import type { Run } from "../src/game/run";

installRaster();
afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 lines 20-28): the shipped default is ENCHANT on (it was off here), so every "the switch off" half below runs under off()
const off = <T>(fn: () => T): T => withEnchant(fn, false);
/** The words that go on a kind of piece (ENCHANT-1b N1: MASSIVE goes on a turret only, SWIFT on a factory only; the marks ignore a word on any other kind). */
const WORDS = (kind: EnchantKind): EnchantId[] => ENCHANT_IDS.filter((id) => ENCHANT_DEFS[id].kinds.includes(kind));

/** The build screen's two facings, portrait (bow north) and landscape (bow east), and a battle's foe's two (bow south, bow west). */
const FRAMES: [string, DeckFrame][] = [
  ["north", frameForHull(0, 10, 40)], ["east", frameForHull(1, 10, 10)], ["south", frameForHull(2, 10, 10)], ["west", frameForHull(3, 40, 10)],
];
const SIDE = 220;

/** The deck as drawMachinery and drawTurrets draw it into a SIDE x SIDE raster. */
function draw(b: Build, f: DeckFrame, extra: Partial<CruiserView> = {}): RasterCanvas {
  const c = fresh(SIDE, SIDE);
  const v: CruiserView = { side: 0, build: b, model: cruiserModel(b), frame: f, t: 0, tread: 0, ...extra };
  drawMachinery(G(c), v);
  drawTurrets(G(c), v);
  return c;
}

/** A furnace deck: the hero's start (its KILN, its turrets) and `extra`; `turrets` replace the starting turrets. */
function deck(extra: Placed[], turrets?: BuildTurret[], hero: "furnace" | "weaver" | "foundry" | "bastion" = "furnace"): Build {
  const b0 = heroStartBuild(hero);
  const b: Build = { ...b0, items: [...b0.items, ...extra] };
  if (turrets) setTurretList(b, turrets);
  return b;
}
/** The same build with every word and counter taken off its pieces. */
function plain(b: Build): Build {
  const items = b.items.map((p) => { const q = { ...p }; delete q.ench; delete q.enchDir; delete q.grow; return q; });
  const out: Build = { ...b, items };
  if (b.turrets) out.turrets = b.turrets.map((t) => { const q = { ...t }; delete q.ench; delete q.grow; return q; });
  return out;
}
const withWord = (p: Placed, id: EnchantId, grow?: number): Placed => ({ ...p, ench: id, ...(grow !== undefined ? { grow } : {}) });
/** The screen box of a 1x1 rig or a 2x2 factory. */
const box = (f: DeckFrame, p: Placed) => boxRect(f, p.x, p.y, ITEMS[p.def].size, ITEMS[p.def].size);
/** The pixels of a diff outside the rect [x0, x1) x [y0, y1). */
const outside = (diff: [number, number][], x0: number, y0: number, x1: number, y1: number) => diff.filter(([x, y]) => !(x >= x0 && x < x1 && y >= y0 && y < y1));
/** The colour `col` appears in `c` inside [x, x + w) x [y, y + h). */
const hasColour = (c: RasterCanvas, x: number, y: number, w: number, h: number, col: string): boolean => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (c.at(x + i, y + j) === col) return true;
  return false;
};
const turretDef = (b: Build, slot: number) => heroOf(b).turrets[slot];
type Box = { x: number; y: number; w: number; h: number };
/** Two screen boxes share a pixel. */
const meets = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** A turret-local box (u across, v along the bow axis, forward = -v: w along u, h along v) on screen for pivot (px, py), written out as
 *  cruiser.ts trect maps it: the oracle for where the gun's own marks sit, on every facing. */
const turretLocal = (f: DeckFrame, px: number, py: number, u: number, v: number, w: number, h: number): Box =>
  f.facing === 0 ? { x: px + u, y: py + v, w, h } : f.facing === 2 ? { x: px + u, y: py - v - h, w, h } : f.facing === 1 ? { x: px - v - h, y: py + u, w: h, h: w } : { x: px + v, y: py + u, w: h, h: w };

// ---------------------------------------------------------------------------------------------------------- the board

describe("ENCHANT-1 E7: the board's marks: off, every frame is as it was", () => {
  const words: Placed[] = [
    withWord({ uid: 10, def: "whetstone", x: 3, y: 3 }, "fiery"),
    withWord({ uid: 11, def: "press", x: 6, y: 5 }, "braced"), // ENCHANT-1b (N1): MASSIVE was here; it goes on a turret only, so this deck's words are all legal ones
    withWord({ uid: 12, def: "temper", x: 1, y: 3 }, "growing", 6),
    withWord({ uid: 13, def: "pickaxe", x: 4, y: 0 }, "echoing"),
    withWord({ uid: 14, def: "gantry", x: 8, y: 5 }, "swift"),
  ];
  const turrets: BuildTurret[] = [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "growing", grow: 3 }];

  it("a deck holding words and counters draws exactly as the same deck without them, on every facing (the switch off)", () => {
    const b = deck(words, turrets);
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 20): was bare (ENCHANT off by default); the dressed deck and the mark run under off()
    for (const [name, f] of FRAMES) expect(off(() => sig(draw(b, f))), name).toBe(sig(draw(plain(b), f)));
    expect(off(() => wordMark(b.items.find((p) => p.uid === 10), "whetstone")), "off: no mark").toBeUndefined();
  });

  it("with the switch on, a deck with no word draws as it does with the switch off (the switch alone moves no pixel)", () => {
    const b = plain(deck(words, turrets));
    for (const [name, f] of FRAMES) expect(sig(on(() => draw(b, f))), name).toBe(sig(off(() => draw(b, f)))); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2); green for the wrong reason, not a TRIAGE line): was a bare draw(b, f) on the right (ENCHANT off by default), which is ON now and made this on-versus-on
  });

  it("with the switch on, the same deck's words DO draw (so the checks above are not vacuous)", () => {
    const b = deck(words, turrets);
    for (const [name, f] of FRAMES) expect(sig(on(() => draw(b, f))), name).not.toBe(sig(draw(plain(b), f)));
  });
});

describe("ENCHANT-1 E7: the spark: the top-right corner of the piece, in its word's colour, covering nothing else", () => {
  const kinds: { name: string; piece: Placed; words: readonly EnchantId[] }[] = [
    { name: "a rig", piece: { uid: 10, def: "whetstone", x: 3, y: 3 }, words: WORDS("rig") },
    { name: "a factory", piece: { uid: 11, def: "press", x: 6, y: 4 }, words: WORDS("factory") }, // every word but MASSIVE (a turret's word, ENCHANT-1b N1)
  ];
  for (const k of kinds) it(`${k.name}: each word's spark sits on its top-right corner on every facing`, () => {
    for (const [name, f] of FRAMES) for (const id of k.words) {
      const base = draw(deck([k.piece]), f);
      const c = on(() => draw(deck([withWord(k.piece, id)]), f));
      const r = box(f, k.piece), sx = r.x + r.w - SPARK_SIZE, sy = r.y; // the spark's top-left: the box's top-right corner, 3x3
      const at = `${k.name} ${id} ${name}`;
      expect(pieceMarkAt(f, k.piece).spark, at).toEqual({ x: sx, y: sy });
      const diff = diffPx(c, base);
      expect(diff.length, at).toBeGreaterThan(0);
      expect(outside(diff, sx - 1, sy - 1, sx + SPARK_SIZE + 1, sy + SPARK_SIZE + 1), `${at}: nothing changes outside the mark's plate`).toEqual([]);
      expect(hasColour(c, sx, sy, SPARK_SIZE, SPARK_SIZE, ENCHANT_DEFS[id].color), `${at}: in the word's colour`).toBe(true);
      // the spark's own pixels are the art's (enchantArt.ts): its arms in the colour
      ENCHANT_SPARK_ROWS.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#" && (i !== 1 || j !== 1)) expect(c.at(sx + i, sy + j), `${at} (${i}, ${j})`).toBe(ENCHANT_DEFS[id].color); }));
    }
  });

  it("it covers neither a rig's arrows (the nozzles' zones), nor its star pips, nor a factory's chute mouth, spark or counter", () => {
    const rig: Placed = { uid: 10, def: "whetstone", x: 3, y: 3, stars: 3 };
    for (const [name, f] of FRAMES) for (const gr of [5, 55]) { // ENCHANT-1b (N5): the 9 px badge with one digit (7 wide) and with two (11 wide)
      const base = draw(deck([rig]), f), c = on(() => draw(deck([withWord(rig, "growing", gr)]), f));
      const cx = Math.round(footX(f, rig.x, rig.y)), cy = Math.round(footY(f, rig.x, rig.y));
      const zones: [number, number, number, number][] = [ // the 4-wide spouts on the middle of each side (3 deep), the ★3 pips' row, and the arrowhead past the right edge
        [cx + 4, cy, 4, 3], [cx + 4, cy + 9, 4, 3], [cx, cy + 4, 3, 4], [cx + 9, cy + 4, 3, 4], [cx + 2, cy + 10, 8, 1], [cx + 12, cy + 3, 3, 6],
      ];
      for (const [x, y, w, h] of zones) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) expect(c.at(x + i, y + j), `${name} grow ${gr}: (${x + i}, ${y + j})`).toBe(base.at(x + i, y + j));
    }
    // a press with a belt leaving through each of its top-right and bottom-right neighbours: the chute's mouth line is never changed
    const press: Placed = { uid: 11, def: "press", x: 5, y: 4 };
    const belts: [string, number][] = [["above its right column", K(6, 3)], ["right of its top row", K(7, 4)], ["below its right column", K(6, 6)], ["right of its bottom row", K(7, 5)]];
    for (const [what, cell] of belts) for (const [name, f] of FRAMES) for (const gr of [4, 44]) {
      const b: Build = { ...deck([press]), routes: [{ factory: 11, cells: [cell] }] };
      const bw: Build = { ...b, items: b.items.map((p) => (p.uid === 11 ? withWord(p, "growing", gr) : p)) };
      const base = draw(b, f), c = on(() => draw(bw, f));
      const d0 = adjacentToFactory(b, 11, cell), lx = (cell % 10) * 12, ly = Math.floor(cell / 10) * 12, o = { x: 0, y: 0, w: 0, h: 0 };
      const ch = d0 === 0 ? localRect(f, lx + 2, ly + 9, 8, 5, o) : d0 === 2 ? localRect(f, lx + 2, ly - 2, 8, 5, o) : d0 === 1 ? localRect(f, lx - 2, ly + 2, 5, 8, o) : localRect(f, lx + 9, ly + 2, 5, 8, o);
      const mouth = ch.w > ch.h ? { x: ch.x + 2, y: ch.y + 2, w: ch.w - 4, h: 1 } : { x: ch.x + 2, y: ch.y + 2, w: 1, h: ch.h - 4 };
      expect(d0, `${what}: the belt's side`).toBeGreaterThanOrEqual(0);
      for (let j = 0; j < mouth.h; j++) for (let i = 0; i < mouth.w; i++) expect(c.at(mouth.x + i, mouth.y + j), `${what} ${name} grow ${gr}: the mouth (${i}, ${j})`).toBe(base.at(mouth.x + i, mouth.y + j));
    }
  });

  it("a shaped piece takes the top-right cell of its top row: the mark is always on the piece, on every facing and turn", () => {
    const shaped: Placed[] = [
      { uid: 10, def: "pickaxe", x: 3, y: 2 }, { uid: 11, def: "elbowguard", x: 3, y: 2 }, { uid: 12, def: "sawbar", x: 3, y: 2 },
      { uid: 13, def: "nailstrip", x: 3, y: 2 }, { uid: 14, def: "gantry", x: 3, y: 2 }, { uid: 15, def: "assembly", x: 3, y: 2 },
    ];
    for (const proto of shaped) for (const rot of [0, 1, 2, 3]) for (const [name, f] of FRAMES) {
      const p: Placed = { ...proto, ...(rot ? { rot } : {}) }, at = `${p.def} rot ${rot} ${name}`;
      const cells = cellsOf(p).map((k) => ({ x: Math.round(footX(f, k % 10, Math.floor(k / 10))), y: Math.round(footY(f, k % 10, Math.floor(k / 10))) }));
      const m = pieceMarkAt(f, p);
      const home = cells.find((q) => q.x + 12 - SPARK_SIZE === m.spark.x && q.y === m.spark.y);
      expect(home, `${at}: the spark is on a cell's top-right corner`).toBeDefined();
      expect(cells.filter((q) => q.y < m.spark.y), `${at}: no cell above it`).toEqual([]);
      expect(cells.filter((q) => q.y === m.spark.y && q.x > home!.x), `${at}: none further right in its row`).toEqual([]);
      const base = draw(deck([p]), f), c = on(() => draw(deck([withWord(p, "fiery")]), f));
      expect(outside(diffPx(c, base), m.spark.x - 1, m.spark.y - 1, m.spark.x + 4, m.spark.y + 4), at).toEqual([]);
      expect(hasColour(c, m.spark.x, m.spark.y, 3, 3, ENCHANT_DEFS.fiery.color), at).toBe(true);
    }
  });

  it("a turret: the spark ahead of its chamber pips, forward-right of the barrel, on every facing, on a pixel the plain gun leaves clear", () => {
    const guns = Object.values(ITEMS).filter((d) => d.kind === "turret").map((d) => d.id);
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) for (const def of guns) for (const [name, f] of FRAMES) {
      const b = deck([], [{ slot: 0, def, uid: 700 }], hero), at = `${hero} ${def} ${name}`;
      const base = draw(b, f), td = turretDef(b, 0);
      const c = on(() => draw({ ...b, turrets: [{ slot: 0, def, uid: 700, ench: "fiery" }] }, f));
      const diff = diffPx(c, base);
      // the changed pixels are the spark and its plate (a 5x5 without its corners: 21) and each lay on a pixel the plain gun left clear
      expect(diff.length, `${at}: the spark and its plate`).toBe(21);
      for (const [x, y] of diff) expect(base.at(x, y), `${at}: (${x}, ${y}) was clear`).toBeNull();
      // forward-right in turret-local terms: the spark's column + 1.5 across, 12.5 ahead of the pivot (its centre), the column left of the pips
      const px = Math.round(turretPivotX(f, td.col0, td.width)), py = Math.round(turretPivotY(f, td.col0, td.width));
      const xs = diff.map((d) => d[0]), ys = diff.map((d) => d[1]), pu = pipColumn(td.kind, heroOf(b).faction);
      const dx = (Math.min(...xs) + Math.max(...xs)) / 2 + 0.5 - px, dy = (Math.min(...ys) + Math.max(...ys)) / 2 + 0.5 - py;
      const [u, v] = f.facing === 0 ? [dx, dy] : f.facing === 2 ? [dx, -dy] : f.facing === 1 ? [dy, -dx] : [dy, dx];
      expect([u, v], at).toEqual([sparkColumn(td.kind, pu) + 1.5, -12.5]);
      expect(u + 2.5 <= pu || td.kind === "adaptable", `${at}: the plate ends before the pip column`).toBe(true);
      expect(hasColour(c, Math.min(...xs), Math.min(...ys), 5, 5, ENCHANT_DEFS.fiery.color), at).toBe(true);
    }
  });

  it("ENCHANT-1b N1: MASSIVE marks a turret only and SWIFT a factory only: on any other kind the word draws nothing, on a turret MASSIVE's spark is in its colour, on every facing", () => {
    const rig: Placed = { uid: 10, def: "whetstone", x: 3, y: 3 }, press: Placed = { uid: 11, def: "press", x: 6, y: 4 };
    const gun = (ench?: string): BuildTurret[] => [{ slot: 0, def: "scrapcannon", uid: 700, ...(ench ? { ench } : {}) }];
    const live = (b: Build, f: DeckFrame): string => sig(on(() => draw(b, f)));
    for (const [name, f] of FRAMES) {
      // a stray word on a kind it does not go on is the forged build the validators refuse (a SIM-ONLY FIXTURE here): with the switch on the picture is the plain piece's
      for (const [id, piece] of [["massive", rig], ["massive", press], ["swift", rig]] as const) {
        expect(live(deck([withWord(piece, id)]), f), `${id} on ${piece.def} ${name}`).toBe(live(deck([piece]), f));
      }
      expect(live(deck([], gun("swift")), f), `swift on a turret ${name}`).toBe(live(deck([], gun()), f));
      // MASSIVE on a turret: the spark and its plate (the 21 px of the turret test above), in MASSIVE's colour
      const base = on(() => draw(deck([], gun()), f)), c = on(() => draw(deck([], gun("massive")), f)), diff = diffPx(c, base);
      expect(diff.length, `massive on a turret ${name}: the spark and its plate`).toBe(21);
      expect(hasColour(c, Math.min(...diff.map((d) => d[0])), Math.min(...diff.map((d) => d[1])), 5, 5, ENCHANT_DEFS.massive.color), `massive on a turret ${name}: in its colour`).toBe(true);
    }
  });

  it("the shop's own cards never show it: the same card with the switch on and off is the same picture, and shop.ts does not import the marks", () => {
    const card = (): RasterCanvas => {
      const c = fresh(80, 60);
      drawCard(G(c), { x: 2, y: 2, w: 64, h: 52 }, ITEMS.whetstone, 3, "ironmonger", { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0, badge: null }, 0);
      return c;
    };
    expect(sig(on(card))).toBe(sig(off(card))); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2); green for the wrong reason, not a TRIAGE line): was `sig(card())` bare (ENCHANT off by default), which is ON now and made this on-versus-on
    expect(readFileSync("src/screens/build/shop.ts", "utf8")).not.toMatch(/enchantMarks|enchantArt|drawEnchantSpark|drawSparkAt/);
  });
});

describe("ENCHANT-1 E7 (REQ-BFG-050): GROWING's counter", () => {
  it("the badge (ENCHANT-1b N5): a 1 px frame in the word's colour round an ink box, the number in the 3x5 face in white 2 px in and 2 px down (one digit 7 x 9, two digits 11 x 9), nothing outside the box, at most two digits", () => {
    const col = ENCHANT_DEFS.growing.color;
    for (const n of [1, 4, 9, 12, 37, 99]) {
      const c = fresh(30, 20);
      drawGrowCounter(G(c), 3, 4, n, col);
      const { w, h } = counterSize(n), t = String(n);
      expect([w, h], `${n}`).toEqual([textWidth(t, "3") + 4, COUNTER_H]);
      for (let j = 0; j < 20; j++) for (let i = 0; i < 30; i++) {
        const bi = i - 3, bj = j - 4, got = c.at(i, j);
        if (bi < 0 || bj < 0 || bi >= w || bj >= h) { expect(got, `${n} outside the box (${i}, ${j})`).toBeNull(); continue; }
        const edge = bi === 0 || bj === 0 || bi === w - 1 || bj === h - 1;
        if (edge) { expect(got, `${n} frame (${bi}, ${bj})`).toBe(col); continue; }
        let lit = false, x = 0; // the number's pixels are white; the rest inside (the number's 1 px ink outline too) is ink
        for (const ch of t) {
          const rows = glyphRows(ch, "3")!, gw = rows[0].length;
          if (bi - 2 >= x && bi - 2 < x + gw && rows[bj - 2]?.[bi - 2 - x] === "#") lit = true;
          x += gw + 1;
        }
        expect(got, `${n} (${bi}, ${bj})`).toBe(lit ? C.white : C.ink);
      }
    }
    const a = fresh(30, 20), b = fresh(30, 20); // three digits are never printed: 150 shows 99
    drawGrowCounter(G(a), 3, 4, 150, col);
    drawGrowCounter(G(b), 3, 4, 99, col);
    expect(sig(a)).toBe(sig(b));
  });

  it("ENCHANT-1b N5: the badge is the battle's count box at its own size (BOX_H tall, boxW wide), its numeral the battle's: white with a 1 px ink outline on ink", () => {
    const col = ENCHANT_DEFS.growing.color;
    const battle = new BattleCounters() as unknown as { boxImage(icon: string, text: string, col: string): RasterCanvas };
    expect(COUNTER_H, "the battle's BOX_H").toBe(BOX_H);
    for (const n of [1, 3, 8, 10, 27, 99]) {
      const t = String(n), { w, h } = counterSize(n);
      expect([w, h], `${n}: boxW(numeral) x BOX_H`).toEqual([boxW(textWidth(t, "3")), BOX_H]);
      // the battle's own count box for the same numeral in white (screens/battleCounters.ts boxImage, a belt's count): the same size,
      // and the badge's white pixels are exactly the box's white pixels (its numeral, 2 px in and 2 px down)
      const box = battle.boxImage("", t, C.white);
      expect([box.width, box.height], `${n}: the battle's box`).toEqual([w, h]);
      const c = fresh(w, h), ref = fresh(w, h);
      drawGrowCounter(G(c), 0, 0, n, col);
      rect(G(ref), 0, 0, w, h, C.ink); // badgeImage's drawing: the numeral as the battle draws it, in white with an ink outline, over ink
      drawText(G(ref), t, 2, 2, C.white, { font: "3", outline: C.ink });
      let white = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const inside = i > 0 && j > 0 && i < w - 1 && j < h - 1;
        expect(c.at(i, j), `${n} (${i}, ${j})`).toBe(inside ? ref.at(i, j) : col);
        expect(c.at(i, j) === C.white, `${n} (${i}, ${j}): white where the battle's box is white`).toBe(box.at(i, j) === C.white);
        if (c.at(i, j) === C.white) white++;
      }
      expect(white, `${n}: a white numeral`).toBeGreaterThan(0);
    }
  });

  const rig: Placed = { uid: 10, def: "whetstone", x: 3, y: 3 };
  it("on a piece holding GROWING above 0 the number is its `grow`, hanging off the bottom-right of its bottom-right cell; at 0, none; on another word, none", () => {
    for (const [name, f] of FRAMES) for (const g of [1, 2, 7, 12]) {
      const at = pieceMarkAt(f, rig).counter, cell = { x: Math.round(footX(f, rig.x, rig.y)), y: Math.round(footY(f, rig.x, rig.y)) };
      expect(at, `${name}`).toEqual({ x: cell.x + 10, y: cell.y + 9 });
      const c = on(() => draw(deck([withWord(rig, "growing", g)]), f));
      const iso = fresh(40, 20);
      drawGrowCounter(G(iso), 4, 4, g, ENCHANT_DEFS.growing.color);
      const { w, h } = counterSize(g);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) expect(c.at(at.x + i, at.y + j), `${name} grow ${g} (${i}, ${j})`).toBe(iso.at(4 + i, 4 + j));
    }
    const f = FRAMES[0][1], badge = pieceMarkAt(f, rig).counter;
    const below = (p: Placed): number => diffPx(on(() => draw(deck([p]), f)), draw(deck([rig]), f)).filter(([x, y]) => x >= badge.x && y >= badge.y).length;
    expect(below(withWord(rig, "growing")), "grow absent: the spark only").toBe(0);
    expect(below(withWord(rig, "growing", 0)), "grow 0: the spark only").toBe(0);
    expect(below(withWord(rig, "fiery", 5)), "a stray grow on another word: none").toBe(0);
    expect(off(() => wordMark({ ench: "growing", grow: 4 }, "whetstone")), "the switch off: nothing at all").toBeUndefined(); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 21): was bare (ENCHANT off by default)
    expect(on(() => wordMark({ ench: "growing", grow: 4 }, "whetstone"))).toEqual({ id: "growing", color: ENCHANT_DEFS.growing.color, grow: 4 });
  });

  it("on a turret holding GROWING: the number right behind the spark, forward-right of the gun, on every facing; it never covers the spark, its plate, a chamber or store pip or the TURRET SPEED plate", () => {
    const guns = ["scrapcannon", ...Object.values(ITEMS).filter((d) => d.kind === "turret").map((d) => d.id)];
    let naiveHits = 0; // how often a badge simply centred on the spark would have met the pips (so the check below is not vacuous)
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) for (const def of guns) for (const [name, f] of FRAMES) for (const g of [3, 11]) {
      const b = deck([], [{ slot: 0, def, uid: 90, free: true, ench: "growing", grow: g }], hero), at = `${hero} ${def} ${name} ${g}`;
      const c = on(() => draw(b, f)), td = turretDef(b, 0);
      const px = Math.round(turretPivotX(f, td.col0, td.width)), py = Math.round(turretPivotY(f, td.col0, td.width)), pu = pipColumn(td.kind, heroOf(b).faction);
      const m = turretMarkAt(f, px, py, pu, g, td.kind), { w, h } = counterSize(g), bd = { x: m.counter.x, y: m.counter.y, w, h };
      const iso = fresh(40, 20);
      drawGrowCounter(G(iso), 4, 4, g, ENCHANT_DEFS.growing.color);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) expect(c.at(m.counter.x + i, m.counter.y + j), `${at}: the badge (${i}, ${j})`).toBe(iso.at(4 + i, 4 + j));
      // the badge is the spark's neighbour: it never meets the spark itself, nor (ENCHANT-1b N5: its frame is no longer ink) the spark's plate, the plus of ink round it
      const apart = m.counter.y + h <= m.spark.y || m.spark.y + 3 <= m.counter.y || m.counter.x + w <= m.spark.x || m.spark.x + 3 <= m.counter.x;
      expect(apart, `${at}: spark and badge apart`).toBe(true);
      expect(meets(bd, { x: m.spark.x, y: m.spark.y - 1, w: 3, h: 5 }) || meets(bd, { x: m.spark.x - 1, y: m.spark.y, w: 5, h: 3 }), `${at}: the spark's plate is whole`).toBe(false);
      expect(hasColour(c, m.spark.x, m.spark.y, 3, 3, ENCHANT_DEFS.growing.color), `${at}: the spark is still there`).toBe(true);
      // the chamber pips and the hopper's store pips (turret-local u = pip column .. +8, from v = -4 down: the zone is generous) are not covered
      expect(meets(bd, turretLocal(f, px, py, pu, -4, 9, 24)), `${at}: off the chamber and store pips`).toBe(false);
      // nor is the TURRET SPEED plate of a free starting turret at level 2 (levelMark.ts: the numeral on ink at the head of the pip column)
      const plates = levelMarks({ ...b, upgrades: { turret: 2 } }, f).filter((q) => q.track === "turret");
      expect(plates.length, `${at}: the level plate exists`).toBe(1);
      expect(meets(bd, plates[0]), `${at}: off the TURRET SPEED plate`).toBe(false);
      const naive = f.facing === 0 || f.facing === 2 ? { ...bd, x: m.spark.x + 1 - Math.floor(w / 2) } : { ...bd, y: m.spark.y + 1 - Math.floor(h / 2) };
      if (meets(naive, turretLocal(f, px, py, pu, -4, 9, 24))) naiveHits++;
    }
    expect(naiveHits, "centred on the spark with no care, the badge would meet the pips in some cases").toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------------------------------------------ the cards

describe("ENCHANT-1 E7: the cards that print no name: the spark at the top-right corner", () => {
  const col = ENCHANT_DEFS.fiery.color;

  it("the cargo slot: the spark at the face's top-right corner; absent, the slot as before; the call site passes markColour", () => {
    for (const [def, stars] of [["whetstone", 1], ["pickaxe", 3], ["press", 2], ["scrapcannon", 1]] as const) {
      const a = fresh(24, 24), b = fresh(24, 24);
      itemSlot(G(a), 2, 2, def, false, 0, stars, false);
      itemSlot(G(b), 2, 2, def, false, 0, stars, false, col);
      const diff = diffPx(b, a);
      expect(diff.length, def).toBeGreaterThan(0);
      expect(outside(diff, 2 + 14, 2 + 1, 2 + 17, 2 + 4), `${def}: only the 3x3 corner`).toEqual([]);
      expect(hasColour(b, 16, 3, 3, 3, col), def).toBe(true);
    }
    const chrome = readFileSync("src/screens/build/chrome.ts", "utf8");
    expect(chrome).toContain("markColour(it, it.def)");
    expect(chrome).toMatch(/hidden \? undefined : markColour/); // a piece lifted out of its slot shows none
  });

  it("markColour: the word's colour while the switch is on, for a rig, a factory and a turret that the word goes on; none for the other kinds, gear, a plain piece or the switch off", () => {
    on(() => {
      const PIECES: [string, EnchantKind][] = [["whetstone", "rig"], ["press", "factory"], ["scrapcannon", "turret"]];
      for (const id of ENCHANT_IDS) for (const [def, kind] of PIECES) {
        expect(markColour({ ench: id }, def), `${id} on ${def}`).toBe(ENCHANT_DEFS[id].kinds.includes(kind) ? ENCHANT_DEFS[id].color : undefined);
      }
      // ENCHANT-1b (N1): MASSIVE marks a turret only and SWIFT a factory only (the exact cases, so the table above is not read in a circle)
      expect(markColour({ ench: "massive" }, "scrapcannon"), "massive on a turret").toBe(ENCHANT_DEFS.massive.color);
      expect(markColour({ ench: "massive" }, "press"), "massive on a factory").toBeUndefined();
      expect(markColour({ ench: "massive" }, "whetstone"), "massive on a rig").toBeUndefined();
      expect(markColour({ ench: "swift" }, "press"), "swift on a factory").toBe(ENCHANT_DEFS.swift.color);
      expect(markColour({ ench: "swift" }, "scrapcannon"), "swift on a turret").toBeUndefined();
      expect(markColour({ ench: "swift" }, "whetstone"), "swift on a rig").toBeUndefined();
      expect(markColour({}, "whetstone")).toBeUndefined();
      expect(markColour({ ench: "nonsense" }, "whetstone")).toBeUndefined();
      const gear = Object.values(ITEMS).find((d) => d.kind === "mod")!;
      expect(enchantKindOf(gear)).toBeUndefined();
      expect(markColour({ ench: "fiery" }, gear), "a stray word on gear").toBeUndefined();
    });
    expect(off(() => markColour({ ench: "fiery" }, "press")), "switch off").toBeUndefined(); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 22): was bare (ENCHANT off by default)
  });

  it("no drop card, drop list, warlord pick or road-event card can show a word in this job: a drop, a pick and an event's item arrive plain (only LAST CHANCE's part carries one)", () => {
    for (const p of ["src/game/events.ts", "src/game/road.ts"]) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/gainModule\([^;]*;/g)) expect(m[0], `${p}: ${m[0]}`).not.toMatch(/\bword\b|choose/);
    }
    expect(readFileSync("src/game/run.ts", "utf8")).toMatch(/gainModule\(run, id, undefined, offer\.partStars \?\? 1, word \? \{ word \} : undefined\)/); // LAST CHANCE's part: the one source that hands over a word
    // so the cards that list them draw the plain icon: none imports the marks
    for (const p of ["src/screens/warlordHud.ts", "src/screens/fork/drops.ts", "src/screens/fork/cards.ts", "src/screens/fork/fork.ts"]) {
      expect(readFileSync(p, "utf8"), p).not.toMatch(/enchantMarks|enchantArt|drawEnchantSpark|drawSparkAt/);
    }
    // ENCHANT-2 (REQ-BFG-085, T3): the road-event cards now draw ONE word, the ASH SHRINE's gain chip (the word's icon, enchantIcon), and never a piece's spark or marks
    expect(readFileSync("src/screens/event/cards.ts", "utf8")).not.toMatch(/enchantMarks|drawEnchantSpark|drawSparkAt/);
  });

  it("the carried piece: the tile's top-right corner shows the spark; the carry reads its piece from the deck, cargo or turret slot", () => {
    const a = fresh(60, 50), b = fresh(60, 50);
    drawLifted(G(a), "whetstone", 30, 44, 4, 1);
    drawLifted(G(b), "whetstone", 30, 44, 4, 1, undefined, col);
    const diff = diffPx(b, a), ix = Math.round(30 - 28 / 2), iy = Math.round(44 - 4 - 30);
    expect(diff.length).toBeGreaterThan(0);
    expect(outside(diff, ix + 28 - 5, iy + 1, ix + 28 - 2, iy + 4), "only the corner").toEqual([]);
    expect(hasColour(b, ix + 28 - 5, iy + 1, 3, 3, col)).toBe(true);
    const run = {
      build: { items: [withWord({ uid: 10, def: "whetstone", x: 1, y: 1 }, "fiery"), { uid: 11, def: "press", x: 4, y: 4 }], turrets: [{ slot: 1, def: "scrapcannon", ench: "braced" }] },
      inventory: [{ uid: 20, def: "temper", ench: "growing", grow: 2 }, { uid: 21, def: "temper" }],
    };
    on(() => {
      expect(carriedMark(run, { src: { from: "deck" }, def: "whetstone", uid: 10 })).toBe(ENCHANT_DEFS.fiery.color);
      expect(carriedMark(run, { src: { from: "deck" }, def: "press", uid: 11 })).toBeUndefined();
      expect(carriedMark(run, { src: { from: "cargo" }, def: "temper", uid: 20 })).toBe(ENCHANT_DEFS.growing.color);
      expect(carriedMark(run, { src: { from: "cargo" }, def: "temper", uid: 21 })).toBeUndefined();
      expect(carriedMark(run, { src: { from: "mount", index: 1 }, def: "scrapcannon", uid: 90 })).toBe(ENCHANT_DEFS.braced.color);
      expect(carriedMark(run, { src: { from: "offer" }, def: "whetstone", uid: -1 }), "a shop card is never enchanted").toBeUndefined();
    });
    expect(off(() => carriedMark(run, { src: { from: "deck" }, def: "whetstone", uid: 10 })), "switch off").toBeUndefined(); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 23): was bare (ENCHANT off by default)
  });
});

// ---- the LAST CHANCE PART card ------------------------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it on the op phone (tests/card4.test.ts's framed and screenOf, trimmed to the picker). */
function lcScreen(run: Run) {
  const [w, h, dpr] = [402, 690, 3];
  const pw = w * dpr, ph = h * dpr, portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: [] as unknown[] } }, refit: false, offers: () => Array.from({ length: 5 }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH({ scale: S, dpr }, 0), lift = phone ? phoneBarLift(W, H, 5, tap, runeRowH({ scale: S, dpr }, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, 5, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  const ui = new UI();
  ui.pointer.kind = "touch";
  const s = {
    run, refit: false, touch: true, L: lay(unit), t: 0,
    game: { W, H, ui, view: { W, H, scale: S, dpr, portrait, sub }, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
    touched: () => {}, lcHeartT: Infinity,
  };
  const frame = (lc: LastChancePicker) => {
    const c = fresh(W, H);
    ui.begin();
    lc.draw(G(c), s as never);
    ui.end();
    return { c, ui };
  };
  return { s, frame, W, H };
}

describe("ENCHANT-1 E5c, E7: the LAST CHANCE PART card that arrives enchanted: the spark on its corner, the word in its details", () => {
  /** A run whose LAST CHANCE (fired on day 3) offers a part that takes a word, and the word it will carry (never FIERY: it keeps the head's word apart from the spark). */
  function enchantedOffer(): { run: Run; part: string; word: EnchantId } {
    for (let seed = 1; seed < 400; seed++) {
      const run = newRun("furnace", seed, `marks-lc-${seed}`);
      (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
      const offer = pendingLastChance(run);
      const w = offer?.part ? lastChanceWord(seed, 3, offer.part) : null;
      if (offer?.part && w) return { run, part: offer.part, word: w.ench };
    }
    throw new Error("no seed offers an enchanted part");
  }

  it("with the switch on: its spark sits on the PART card's top-right corner in the word's colour, the card's regions are unchanged, and only the head and the corner differ", () => {
    setTipsForTests("done");
    const { run, word } = enchantedOffer();
    const sc = lcScreen(run);
    const off = withEnchant(() => sc.frame(new LastChancePicker()), false); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 24): was bare (ENCHANT off by default); this local `off` is the frame, so the switch is set with withEnchant here
    const onF = on(() => sc.frame(new LastChancePicker()));
    const card = onF.ui.regions.find((r) => r.id === "lcpick-part")!.r;
    expect(off.ui.regions.find((r) => r.id === "lcpick-part")!.r, "the card's box").toEqual(card);
    expect(onF.ui.regions.map((r) => [r.id, r.r]), "every region").toEqual(off.ui.regions.map((r) => [r.id, r.r]));
    const col = ENCHANT_DEFS[word].color, sx = card.x + card.w - 5, sy = card.y - 1;
    expect(hasColour(onF.c, sx, sy, SPARK_SIZE, SPARK_SIZE, col), "the spark").toBe(true);
    expect(hasColour(off.c, sx, sy, SPARK_SIZE, SPARK_SIZE, col), "none with the switch off").toBe(false);
    const diff = diffPx(onF.c, off.c); // the word before the part's name: the head row's name changed, in the word's colour; under the head only the corner changed
    expect(outside(diff, sx, sy, sx + 3, sy + 3).filter(([, y]) => y > card.y + 17), "nothing under the head").toEqual([]);
    expect(diff.some(([x, y]) => x >= card.x + 31 && y >= card.y + 6 && y <= card.y + 16 && onF.c.at(x, y) === col), "the word first, in its colour").toBe(true);
    expect(withEnchant(() => lcWord(run, pendingLastChance(run)!), false), "the switch off: no word").toBeNull(); // BUMP-1F (TRIAGE-R34 line 24): was bare
    expect(on(() => lcWord(run, pendingLastChance(run)!))?.ench).toBe(word);
  });

  it("its details (the ⓘ) name the word in its colour and say what it does on this kind of piece; with the switch off, the details are as they were", () => {
    const { run, part, word } = enchantedOffer();
    const tw = 200, plainInfo = off(() => partInfo(part, tw, run)); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 25): was bare (ENCHANT off by default); the "as they were" details are the switch-off ones
    expect(off(() => partInfo(part, tw, run, 1, { ench: word })), "off").toEqual(plainInfo); // BUMP-1F (TRIAGE-R34 line 25): was bare
    const items = on(() => partInfo(part, tw, run, 1, { ench: word }));
    expect(items.length).toBe(plainInfo.length + 1);
    const first = items[0].flat();
    expect(first[0].t).toBe("ENCHANTED: ");
    expect(first[1]).toEqual({ t: ENCHANT_DEFS[word].name, c: ENCHANT_DEFS[word].color });
    expect(items[0].map((l) => l.map((s) => s.t).join("")).join(" ")).toMatch(/^ENCHANTED: [A-Z]+\. /);
    expect(items.slice(1), "the rest unchanged").toEqual(plainInfo);
    const gear = Object.values(ITEMS).find((d) => d.kind === "mod" && d.rarity === "epic")!.id; // gear arrives plain: no word, no extra item
    expect(on(() => partInfo(gear, tw, run, 1, lastChanceWord(1, 3, gear)))).toEqual(partInfo(gear, tw, run));
  });
});

// ---- the battle ----------------------------------------------------------------------------------------------------

describe("ENCHANT-1 E7: the battle world and the scouted foe draw the same marks", () => {
  const rig: Placed = withWord({ uid: 10, def: "whetstone", x: 3, y: 3 }, "growing", 5);

  it("a battle's views (Arena: the side's build, the sim's state) draw the spark and the counter; the switch off draws neither", () => {
    const b = deck([rig], [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "braced" }]);
    const a = on(() => new Arena(b, barge(), SEED, null));
    for (const s of [0, 1] as const) { a.drawn[s].dx = 40; a.drawn[s].dy = 70; }
    const v = a.views[0], f = a.drawn[0];
    const render = (): RasterCanvas => { const c = fresh(SIDE, SIDE); drawMachinery(G(c), v); drawTurrets(G(c), v); return c; };
    const live = on(render), off = withEnchant(render, false); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 26): was `off = render()` bare (ENCHANT off by default); this local `off` is the picture, so the switch is set with withEnchant here
    const m = pieceMarkAt(f, rig), col = ENCHANT_DEFS.growing.color;
    expect(hasColour(live, m.spark.x, m.spark.y, 3, 3, col), "the rig's spark in the battle world").toBe(true);
    expect(live.at(m.counter.x, m.counter.y), "its counter's frame, in the word's colour").toBe(col); // ENCHANT-1b (N5): the frame is the word's colour, the number inside white on ink
    expect(hasColour(live, m.counter.x + 2, m.counter.y + 2, 3, 5, C.white), "its counter's numeral").toBe(true);
    expect(off.at(m.counter.x, m.counter.y), "the switch off: no counter").not.toBe(col);
    const td = turretDef(b, 0), px = Math.round(turretPivotX(f, td.col0, td.width)), py = Math.round(turretPivotY(f, td.col0, td.width));
    const t = turretMarkAt(f, px, py, pipColumn(td.kind, heroOf(b).faction), 0, td.kind);
    expect(hasColour(live, t.spark.x, t.spark.y, 3, 3, ENCHANT_DEFS.braced.color), "the turret's spark").toBe(true);
    expect(hasColour(off, m.spark.x, m.spark.y, 3, 3, col), "the switch off: nothing").toBe(false);
    expect(hasColour(off, t.spark.x, t.spark.y, 3, 3, ENCHANT_DEFS.braced.color)).toBe(false);
  });

  it("the build screen, the battle and the scouted foe all draw their pieces through drawMachinery and drawTurrets (the one hook)", () => {
    for (const p of ["src/screens/build/build.ts", "src/screens/build/foeView.ts", "src/game/arenaMotion.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).toMatch(/drawMachinery\(\w+, \w+\)/);
      expect(src, p).toMatch(/drawTurrets\(\w+, \w+\)/);
    }
    expect(readFileSync("src/render/machinery.ts", "utf8")).toMatch(/drawEnchantMachinery\(g, v\);[^\n]*\n\}/);
    expect(readFileSync("src/render/cruiser.ts", "utf8")).toMatch(/drawEnchantTurrets\(g, v\);[^\n]*\n\}/);
  });

  it("the scouted foe's build, drawn as foeView.ts draws it (DEFAULT_SKIN, no sim), carries its words and its counters", () => {
    const foe = deck([withWord({ uid: 10, def: "temper", x: 3, y: 3 }, "growing", 2), withWord({ uid: 11, def: "press", x: 6, y: 5 }, "swift")]);
    const last = foe.items[foe.items.length - 1];
    for (const [name, f] of FRAMES) {
      const c = on(() => draw(foe, f, { skin: DEFAULT_SKIN })), m = pieceMarkAt(f, last);
      expect(sig(c), name).not.toBe(sig(draw(plain(foe), f, { skin: DEFAULT_SKIN })));
      expect(hasColour(c, m.spark.x, m.spark.y, 3, 3, ENCHANT_DEFS.swift.color), name).toBe(true);
      expect(off(() => sig(draw(foe, f, { skin: DEFAULT_SKIN }))), `${name}: off`).toBe(sig(draw(plain(foe), f, { skin: DEFAULT_SKIN }))); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 27): was bare (ENCHANT off by default)
    }
  });
});

describe("ENCHANT-1 E3, E7: the battle's line for a swallowed STUN", () => {
  it("the line: BRACED first in the word's colour, the part's name in its rarity colour, then what happened", () => {
    const def = ITEMS.whetstone, spans = bracedLine(def);
    expect(spans[0]).toEqual({ t: "BRACED", c: ENCHANT_DEFS.braced.color });
    expect(spans[1]).toEqual({ t: ` ${def.name}`, c: RARITY_COLOR[def.rarity] });
    expect(spans[spans.length - 1].t).toBe(BRACED_TAIL);
    expect(bracedLineText(def)).toBe(`BRACED ${def.name}: THE STUN DID NOTHING`);
    expect(bracedLineText(undefined)).toBe("BRACED PART: THE STUN DID NOTHING");
  });

  type Disrupt = (s: unknown, t: unknown, secs?: number, cause?: string) => boolean;
  it("a BRACED rig, factory and turret that swallow a STUN pop BRACED over the part in the word's colour; the switch off pops nothing", () => {
    const b = deck(
      [withWord({ uid: 10, def: "whetstone", x: 3, y: 3 }, "braced"), withWord({ uid: 11, def: "press", x: 6, y: 5 }, "braced")],
      [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "braced" }],
    );
    const pops = (a: Arena) => a.fx.popList.slice(0, a.fx.popCount);
    for (const [kind, ref] of [["gate", 10], ["factory", 11], ["turret", 0]] as const) {
      const a = on(() => new Arena(b, barge(), SEED, null));
      const stun = (a.b as unknown as { disrupt: Disrupt }).disrupt.bind(a.b), side = a.b.sides[0];
      const t = side.targets.find((q) => q.kind === kind && q.ref === ref)!;
      expect(stun(side, t, 2, "shock"), `${kind}: swallowed`).toBe(false);
      const ev = a.b.drainEvents().filter((e) => e.type === "braced");
      expect(ev.length, kind).toBe(1);
      on(() => react(a, ev[0]));
      const p = pops(a).filter((q) => q.text === "BRACED");
      expect(p.length, `${kind}: one pop`).toBe(1);
      expect(p[0].color, kind).toBe(ENCHANT_DEFS.braced.color);
      const quiet = on(() => new Arena(b, barge(), SEED, null)); // off: the same event handed to react draws nothing new
      off(() => react(quiet, ev[0])); // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 28): was a bare react(quiet, ev[0]) (ENCHANT off by default)
      expect(pops(quiet).filter((q) => q.text === "BRACED"), `${kind}: switch off`).toEqual([]);
    }
  });
});
