// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T4): A RIVAL'S ENCHANTED PIECE SHOWS ITS WORD, wherever the game names that piece. Rivals carry hand-picked words
// from day 5 (src/sim/npcWords.ts NPC_WORDS, T1) in the decks they field: the road warlord (rivals.ts rivalBuild) and the dusk stand-in (standInBuild).
// WHERE A FOE'S PIECE IS NAMED, and what carries its word (the audit of run 4):
//   - VIEW BATTLEFIELD after a fight, and the build screen's SCOUTED foe (build/foeView.ts): a tap on a part opens its face, battleScout.ts faceText, which
//     builds the build screen's own panel (itemPanel, turretPanel) from THAT SIDE'S build. So a foe's enchanted piece already reads like the player's: the word
//     first in its colour (titleSpans), its line, its numbers changed in its colour, the NOTES behind the hover or the tap. No face code needed a change;
//     what T4 adds is this proof on the real rival decks, in the layouts those faces open in (the battle's floor / column, the scouted foe's area).
//   - the board's SPARKS (render/enchantMarks.ts): drawn by machinery.ts drawMachinery and cruiser.ts drawTurrets for any side's build on any facing (the
//     marks test pins the four facings, the foe's bow south and bow west among them): they ALREADY showed on a foe's side; here it is shown on rival decks.
//   - the road fork names a rival's pieces only in its DROP surfaces (the inspect panel's drop row and ⓘ list, the victory screen's drop card): T2's.
// With ENCHANT off a rival's deck holds no word, so none of this draws or reads one (tests/enchant2.npcwords.test.ts pins the deck byte for byte).
import { afterEach, describe, expect, it } from "vitest";
import { G, diffPx, fresh, installRaster, type RasterCanvas } from "./raster.helpers";
import { battleLayout, battleScale, laneLayout } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid } from "../src/game/battleLayout";
import { frameForHull, type DeckFrame } from "../src/render/frame";
import { cruiserModel, drawTurrets, type CruiserView } from "../src/render/cruiser";
import { drawMachinery } from "../src/render/machinery";
import { faceArea, faceRun, faceText, type PartSel } from "../src/screens/battleScout";
import { keptWhole, planPanel, selFamilies, titleSpans, type PanelText } from "../src/screens/build/inspector";
import { ITEMS } from "../src/sim/content";
import { setTurretList, turretList, turretSlots, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_DEFS, enchantKindOf, setEnchant, withEnchant, type EnchantId } from "../src/sim/enchant";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import { RARITY_COLOR } from "../src/render/palette";
import { tapPx } from "../src/ui/tap";
import { icons } from "../src/render/font";
import { enchantNotes } from "../src/ui/faces";
import { pieceLine, wordColour } from "../src/ui/enchantFaces";
import { gradeOf, starsOf } from "../src/sim/stars";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const DAYS = [5, 8, 12, 16];
type Maker = "rivalBuild" | "standInBuild";
const MAKERS: Record<Maker, (id: RivalId, day: number) => Build> = { rivalBuild, standInBuild };

/** A piece of a rival's deck that holds a word: where it is, what it is. */
interface Worded {
  sel: PartSel;
  def: string;
  word: EnchantId;
  stars: number;
}

/** Every piece of `b` holding a word: rigs and factories (items), then installed turrets (by slot index in turretSlots). */
function worded(b: Build): Worded[] {
  const out: Worded[] = [];
  // a hero's signature factory (the KILN) reads at its FACTORY level, stars.ts gradeOf, as its panel does (inspector.ts itemPanel); every other piece at its stars
  for (const p of b.items) if (p.ench !== undefined) out.push({ sel: { kind: "item", uid: p.uid }, def: p.def, word: p.ench as EnchantId, stars: gradeOf(b, p) });
  turretSlots(b).forEach((s, i) => { if (s.turret?.ench !== undefined) out.push({ sel: { kind: "turret", index: i }, def: s.turret.def, word: s.turret.ench as EnchantId, stars: starsOf(s.turret) }); });
  return out;
}

/** The same build with ONE piece's word taken off. */
function without(b: Build, w: Worded): Build {
  const out: Build = { ...b, items: b.items.map((p) => ({ ...p })) };
  if (w.sel.kind === "item") {
    const uid = w.sel.uid;
    const p = out.items.find((q) => q.uid === uid)!;
    delete p.ench;
    delete p.enchDir;
    delete p.grow;
  } else {
    const slot = turretSlots(b)[w.sel.index].slot;
    setTurretList(out, turretList(b).map((t) => { if (t.slot !== slot) return t; const q = { ...t }; delete q.ench; delete q.grow; return q; }));
  }
  return out;
}

describe("ENCHANT-2 T4: a rival's enchanted piece, in the faces the battle and the scouted foe open", () => {
  it("every rival x day 5-16 x (warlord deck, dusk stand-in): each enchanted piece's face puts its word first in its colour, then its name in its rarity colour; the word's line is on the face, in the word's colour; the NOTES behind the tap are the part's own (partNotes)", () => {
    withEnchant(() => {
      let faces = 0;
      for (const id of RIVAL_IDS) for (const day of rivalDays(id, 16).filter((d) => d >= 5)) for (const maker of Object.keys(MAKERS) as Maker[]) {
        const b = MAKERS[maker](id, day), list = worded(b);
        for (const w of list) {
          const tag = `${id} d${day} ${maker}: ${w.word} on ${w.def} ★${w.stars}`;
          const t: PanelText = faceText(b, w.sel, null, day)!;
          expect(t, tag).not.toBeNull();
          const d = ITEMS[w.def], name = ENCHANT_DEFS[w.word].name;
          expect(t.ench, tag).toBe(w.word);
          expect(t.title.startsWith(`${name} ${d.name}`), `${tag}: title ${t.title}`).toBe(true);
          expect(t.color, `${tag}: the name keeps its rarity colour`).toBe(RARITY_COLOR[d.rarity]);
          const spans = titleSpans(t);
          expect(spans[0], tag).toEqual({ t: name, c: ENCHANT_DEFS[w.word].color });
          expect(spans.length, tag).toBe(2);
          expect(spans[1].c, tag).toBe(RARITY_COLOR[d.rarity]);
          // the word's line is on the face, kept, in its colour
          const kind = enchantKindOf(d)!, line = icons(pieceLine(w.word, kind, w.stars, day)!); // ENCHANT-2 (T6 fix round): RISING's amount is the fight's day's
          const mine = t.body.filter((x) => x.text === line && x.colour === wordColour(w.word));
          expect(mine.length, `${tag}: the word's line`).toBe(1);
          expect(mine[0].keep, tag).toBe(true);
          // the NOTES behind the hover or the tap: the part's own, line 1 by word
          expect((t.notes ?? []).map((n) => n.text), tag).toEqual(expect.arrayContaining(enchantNotes(w.word)));
          // the same piece without its word reads as a plain piece (the word came from the foe's build)
          const plain = faceText(without(b, w), w.sel, null, day)!;
          expect(plain.ench, `${tag}: plain`).toBeUndefined();
          expect(plain.title.startsWith(d.name), `${tag}: plain title ${plain.title}`).toBe(true); // a signature factory's title carries no stars
          expect(t.title, tag).toBe(`${name} ${plain.title}`);
          expect((plain.notes ?? []).map((n) => n.text).some((n) => enchantNotes(w.word).includes(n)), `${tag}: a plain piece has no enchant NOTES`).toBe(false);
          faces++;
        }
      }
      console.log(`ENCHANT-2 T4: ${faces} rival faces audited (every rival x day 5-16 x warlord deck and dusk stand-in x each enchanted piece)`);
      expect(faces, "rival faces audited").toBeGreaterThan(900);
    });
  });

  it("with ENCHANT off a rival's deck carries no word, so its faces are the plain pieces' (no word in any title, no enchant NOTES)", () => {
    for (const id of RIVAL_IDS) for (const day of rivalDays(id, 16).filter((d) => d >= 5)) for (const maker of Object.keys(MAKERS) as Maker[]) {
      const b = MAKERS[maker](id, day);
      expect(worded(b), `${id} d${day} ${maker}`).toEqual([]);
    }
    const b = withEnchant(() => standInBuild("sootjaw", 12));
    expect(worded(b).length, "the same captain with the switch on").toBeGreaterThan(0);
    for (const w of worded(b)) {
      const t = faceText(b, w.sel, null, 12)!; // the deck carries a word, the switch is off now: the panels read none
      expect(t.ench).toBeUndefined();
      expect(t.title.startsWith(ENCHANT_DEFS[w.word].name)).toBe(false);
    }
  });
});

describe("ENCHANT-2 T4: the faces fit where they open", () => {
  /** The battle's views (the scout test's list: phones, a landscape phone, desks, laptops) and the scouted foe's: faceArea(L, side 1) is the battle's own. */
  const VIEWS: [string, number, number, number][] = [["phone-390x844", 390, 844, 3], ["op-402x690", 402, 690, 3], ["land-844x390", 844, 390, 3], ["desk-1920x1080", 1920, 1080, 1], ["desk-1280x800", 1280, 800, 1], ["laptop-1366x768", 1366, 768, 1]];
  const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

  it("on every view, each rival's enchanted piece's face (the word's line, the changed numbers) is KEPT WHOLE in the battle's face area, the foe's side: the word's line is a kept block, so it is always drawn; only optional lines may give way, as they do for a plain piece", () => {
    withEnchant(() => {
      let n = 0, lost = 0, lostPlain = 0;
      const where: Record<string, string> = {};
      for (const [name, w, h, dpr] of VIEWS) {
        const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
        const L = laneLayout(battleLayout(v.W, v.H, v.portrait)), fa = faceArea(L, 1), tp = tapPx(v);
        for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS) as Maker[]) {
          const day = 12; // all three words are live (T1: 1 from day 5, 2 from 8, 3 from 12)
          const b = MAKERS[maker](id, day);
          for (const wd of worded(b)) {
            const t = faceText(b, wd.sel, null, day)!;
            const plan = planPanel(t, fa.area, selFamilies(faceRun(b, day), wd.sel), { tap: tp, band: fa.band });
            const tag = `${name} ${id} ${maker}: ${wd.word} on ${wd.def}`;
            expect(keptWhole(plan), `${tag}: kept whole`).toBe(true);
            // informational: optional lines (no `keep`) give way when room is short; how many more than for the same piece plain
            const pb = without(b, wd), pt = faceText(pb, wd.sel, null, day)!;
            const pplan = planPanel(pt, fa.area, selFamilies(faceRun(pb, day), wd.sel), { tap: tp, band: fa.band });
            expect(keptWhole(pplan), `${tag}: the plain piece too`).toBe(true);
            const d1 = plan.body.dropped.filter((x) => x.role === "ability").length, d0 = pplan.body.dropped.filter((x) => x.role === "ability").length;
            if (d1 > d0) { lost++; where[name] = `${(Number(where[name]?.split(" ")[0] ?? 0) + 1)} faces`; }
            if (d0 > 0) lostPlain++;
            n++;
          }
        }
      }
      expect(n).toBeGreaterThan(500);
      console.log(`ENCHANT-2 T4: ${n} rival faces (day 12, ${VIEWS.length} views) kept whole; optional ability lines given way: ${lost} faces lose more than the same piece plain (${Object.entries(where).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}); ${lostPlain} plain ones lose some too`);
    });
  });
});

describe("ENCHANT-2 T4: the board's sparks show on the rival's side (they already did: the one draw path serves both sides)", () => {
  const SIDE = 220;
  /** The foe's two facings in a battle (bow south, bow west) and the build screen's two (north, east). */
  const FRAMES: [string, DeckFrame][] = [["south", frameForHull(2, 10, 10)], ["west", frameForHull(3, 40, 10)], ["north", frameForHull(0, 10, 40)], ["east", frameForHull(1, 10, 10)]];
  function draw(b: Build, f: DeckFrame): RasterCanvas {
    const c = fresh(SIDE, SIDE);
    const v: CruiserView = { side: 1, build: b, model: cruiserModel(b), frame: f, t: 0, tread: 0 };
    drawMachinery(G(c), v);
    drawTurrets(G(c), v);
    return c;
  }

  it("each word on a rival's deck draws its spark in the word's colour on every facing, the foe's two included: the deck drawn with that one word taken off differs, and the difference holds the word's colour", () => {
    withEnchant(() => {
      let n = 0;
      for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS) as Maker[]) {
        const b = MAKERS[maker](id, 12);
        for (const w of worded(b)) for (const [fname, f] of FRAMES.slice(0, 2)) {
          const tag = `${id} ${maker} ${fname}: ${w.word} on ${w.def}`;
          const diff = diffPx(draw(b, f), draw(without(b, w), f));
          expect(diff.length, `${tag}: the spark is drawn`).toBeGreaterThan(0);
          const c = draw(b, f);
          expect(diff.some(([x, y]) => c.at(x, y) === ENCHANT_DEFS[w.word].color), `${tag}: in the word's colour`).toBe(true);
          n++;
        }
      }
      expect(n).toBeGreaterThan(200);
    });
  });

  it("with the switch off the same decks (which carry no word then) draw exactly as plain decks on every facing: the sparks are the words', never the deck's", () => {
    for (const id of RIVAL_IDS) {
      const b = standInBuild(id, 12);
      expect(worded(b)).toEqual([]);
    }
  });
});
