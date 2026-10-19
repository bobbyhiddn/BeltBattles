// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7; run 3, the faces worker): THE PANEL FACES of an enchanted piece, with the switch on and off.
//   - the NAME: the word first in its colour, the name in its rarity colour (titleSpans, fitTitle): `FIERY` WHETSTONE, in every panel that prints it
//     (a placed rig and factory, a cargo piece, an installed turret, the battle's inspect face);
//   - the ROWS: every word adds ONE line under the piece's own line, in its colour, always shown, at THIS piece's stars (RISING's and GROWING's
//     step, FIERY's BURN and BRACED's stuns x the stars). ENCHANT-1c (C1): FIERY is a line word like the other seven; its number shows ONCE, in
//     its line, and no word adds a stat of its own to a row;
//   - the numbers a word CHANGES are shown changed in its colour and agree with the battle: MASSIVE's turret rate, SWIFT's factory rate and DMG,
//     GROWING's DMG with the grown amount, WIDE's belt and gear slots;
//   - the NOTES (ENCHANT_NOTES) behind the hover or the tap; the word card's own face (wordFace); the panel text form ({BURN}, {DMG});
//   - every enchanted panel fits its box on the phone (402x690 @3) and the desk (1280x800), the ⓘ view pages stay few;
//   - with the switch OFF every panel, note and title is the plain piece's, deep-equal, though the piece carries a stray `ench`;
//   - ENCHANT-1b (N1): MASSIVE goes on a TURRET only and SWIFT on a FACTORY only. A test shows a word only on the kinds it goes on (WORDS(kind));
//     on any other kind enchantProblem refuses it (`ONLY ON A TURRET` / `ONLY ON A FACTORY`), wordLine writes nothing and the panels read none.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import {
  cargoPanel, detailsPlan, drawDetails, explainPanel, fitTitle, fullText, itemPanel, keptWhole, panelFit, planPanel, titleSpans, turretPanel, type Block, type PanelText,
} from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import type { DuskFoe } from "../src/game/run";
import { faceBlocks, turretRow, wordOnSentences } from "../src/screens/build/faceBlocks";
import { faceText } from "../src/screens/battleScout";
import { explainWords, infoFree, infoItems, infoLevels, infoView, panelPiece } from "../src/screens/build/keywords";
import { AMMO, ITEMS } from "../src/sim/content";
import { gearSlotsOf, payloadDamage, setTurretList, shotFloor, turretSlots, type Build } from "../src/sim/deck";
import { Battle, type Payload } from "../src/sim/battle";
import { effectAt, fusible, gradeOf, outputsAt } from "../src/sim/stars";
import {
  ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, ENCHANT_NUM, enchantKindOf, enchantProblem, enchantRate, freeSides, replacesText, sellAskText, setEnchant, withEnchant,
  type EnchantId, type EnchantKind,
} from "../src/sim/enchant";
import { makeEnchantState, slugMadeFx } from "../src/sim/enchantFx";
import {
  ENCHANT_NOTES, enchantedTitle, nameSpans, panelText, pieceLine, slugDmg, wordFace, wordLine, wordOn,
} from "../src/ui/enchantFaces";
import { carryStats, enchantNotes, factoryStats, plainRigStats, turretStats, wordRows } from "../src/ui/faces";
import { statRow } from "../src/ui/icons";
import { fmtCount, fmtDmg } from "../src/ui/statFormat";
import { ICON, icons, textWidth } from "../src/render/font";
import { RARITY_COLOR, C } from "../src/render/palette";
import { lineText } from "../src/ui/richText";
import { setTipsForTests } from "../src/ui/tips";
import { banned } from "./textRules";
import { SEED, barge, furnaceBench } from "./wave3.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);
const off = <T>(fn: () => T): T => withEnchant(fn, false);
const KINDS: EnchantKind[] = ["rig", "factory", "turret"];
/** The piece each kind is shown on: WHETSTONE (a plain rig with a stat row), STAMP PRESS (a factory), SCRAP CANNON (a turret). */
const PIECE: Record<EnchantKind, string> = { rig: "whetstone", factory: "press", turret: "scrapcannon" };
const WORDS = (kind: EnchantKind): EnchantId[] => ENCHANT_IDS.filter((id) => ENCHANT_DEFS[id].kinds.includes(kind));
const starsOn = (def: string): number[] => (fusible(def) ? [1, 3] : [1]);
const texts = (bs: readonly { text: string }[]): string[] => bs.map((b) => b.text);
const wc = (id: EnchantId): string => ENCHANT_DEFS[id].color;

// ------------------------------------------------------------------------------------------------------------ the fixtures

/** A furnace run whose deck holds `items` (the KILN first), cargo `cargo` and installed turrets `turrets` (slot, def, ...). */
function runWith(items: Build["items"] = [], cargo: Run["inventory"] = [], turrets: Parameters<typeof setTurretList>[1] = []): Run {
  const run = newRun("furnace", 5, "enchant1-faces");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo;
  if (turrets.length) setTurretList(run.build, turrets);
  return run;
}
const word = (id: EnchantId, def: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ench: id, ...(id === "wide" && enchantKindOf(ITEMS[def]) === "rig" ? { enchDir: freeSides(ITEMS[def])[0] } : {}), ...(id === "growing" ? { grow: 2 } : {}), ...extra,
});

/** The panel of a piece holding `id` (or none), as the game builds it: [panel, the selection]. */
function panelOf(kind: EnchantKind, how: "placed" | "cargo" | "installed", id: EnchantId | null, stars = 1, grow = 2): [PanelText, Run, Sel] {
  const def = PIECE[kind], star = stars > 1 ? { stars } : {};
  const w = id ? { ...word(id, def), ...(id === "growing" ? { grow } : {}) } : {};
  if (kind === "turret" && how === "installed") {
    const run = runWith([], [], [{ slot: 0, def, uid: 90, ...star, ...w }]);
    return [turretPanel(run, 0)!, run, { kind: "turret", index: 0 }];
  }
  if (how === "cargo" || kind === "turret") {
    const run = runWith([], [{ uid: 900, def, ...star, ...w }]);
    return [cargoPanel(run, 900)!, run, { kind: "cargo", uid: 900 }];
  }
  const run = runWith([{ uid: 9, def, x: kind === "rig" ? 3 : 0, y: kind === "rig" ? 3 : 0, ...star, ...w } as Build["items"][number]]);
  return [itemPanel(run, 9)!, run, { kind: "item", uid: 9 }];
}
const SHOWS: [EnchantKind, "placed" | "cargo" | "installed"][] = [["rig", "placed"], ["rig", "cargo"], ["factory", "placed"], ["factory", "cargo"], ["turret", "cargo"], ["turret", "installed"]];

// ------------------------------------------------------------------------------------------------------------ the views

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/card2.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
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
const VIEWS = [["phone 402x690", framed(402, 690, 3, 1), true], ["desk 1280x800", framed(1280, 800, 1, 1), false]] as const;
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  return { ctx, area, d: () => detailsPlan(ctx, sel, null, area)! };
}

// ------------------------------------------------------------------------------------------------------------ the name

describe("ENCHANT-1 E7: THE NAME: the word first in its colour, the name in its rarity colour", () => {
  it("every word on every kind it takes, ★1 and ★3, in every panel that prints the name: title `WORD NAME ★★★`, ench set, the rarity colour kept, two spans in that order", () => {
    on(() => {
      let n = 0;
      for (const [kind, how] of SHOWS) for (const id of WORDS(kind)) for (const stars of starsOn(PIECE[kind])) {
        const [t] = panelOf(kind, how, id, stars), d = ITEMS[PIECE[kind]], plain = panelOf(kind, how, null, stars)[0];
        const tag = `${id} on ${kind} ${how} ★${stars}`;
        expect(t.ench, tag).toBe(id);
        expect(t.title, tag).toBe(enchantedTitle(id, plain.title));
        expect(t.title.startsWith(`${ENCHANT_DEFS[id].name} ${d.name}`), tag).toBe(true);
        expect(t.color, `${tag}: the name keeps its rarity colour`).toBe(RARITY_COLOR[d.rarity]);
        expect(t.color, tag).toBe(plain.color);
        const spans = titleSpans(t);
        expect(spans.map((s) => s.t), tag).toEqual([ENCHANT_DEFS[id].name, t.title.slice(ENCHANT_DEFS[id].name.length)]);
        expect(spans.map((s) => s.c), tag).toEqual([wc(id), RARITY_COLOR[d.rarity]]);
        expect(spans.map((s) => s.t).join(""), `${tag}: the spans are the title`).toBe(t.title);
        n++;
      }
      expect(n).toBe(SHOWS.reduce((a, [k]) => a + WORDS(k).reduce((b, id) => b + starsOn(PIECE[k]).length, 0), 0));
    });
  });

  it("a plain piece is one span in its rarity colour and carries no `ench`; nameSpans never prints the word twice", () => {
    on(() => {
      for (const [kind, how] of SHOWS) {
        const [t] = panelOf(kind, how, null);
        expect(t.ench).toBeUndefined();
        expect("ench" in t).toBe(false);
        expect(titleSpans(t)).toEqual([{ t: t.title, c: t.color }]);
      }
      expect(nameSpans("fiery", "WHETSTONE", C.steel3)).toEqual([{ t: "FIERY", c: wc("fiery") }, { t: " WHETSTONE", c: C.steel3 }]);
      expect(nameSpans("fiery", "FIERY WHETSTONE ★★", C.steel3).map((s) => s.t)).toEqual(["FIERY", " WHETSTONE ★★"]);
    });
  });

  it("fitTitle draws the word in its colour and the name in the rarity colour (5x7 where it fits); a plain title is fitHead's, one colour", () => {
    on(() => {
      const [t] = panelOf("rig", "cargo", "fiery"), d = ITEMS.whetstone;
      const a = fresh(150, 12);
      fitTitle(gOf(a), t, 2, 2, 140);
      const wordW = textWidth(ENCHANT_DEFS.fiery.name) + 2, total = textWidth(t.title) + 4;
      const col = (x0: number, x1: number): Set<string> => {
        const s = new Set<string>();
        for (let x = x0; x < x1; x++) for (let y = 0; y < 12; y++) { const p = a.at(x, y); if (p) s.add(p); }
        return s;
      };
      expect(col(0, wordW).has(wc("fiery")), "the word's own colour on the word").toBe(true);
      expect(col(wordW + 1, total).has(wc("fiery")), "none of it on the name").toBe(false);
      expect(col(wordW + 1, total).has(RARITY_COLOR[d.rarity]), "the name in its rarity colour").toBe(true);
      expect(col(0, wordW).has(RARITY_COLOR[d.rarity]), "none of the rarity colour on the word").toBe(false);
      const b = fresh(150, 12);
      fitTitle(gOf(b), { title: "WHETSTONE", color: RARITY_COLOR.common }, 2, 2, 140);
      const seen = new Set<string>();
      for (let x = 0; x < 150; x++) for (let y = 0; y < 12; y++) { const p = b.at(x, y); if (p) seen.add(p); }
      expect(seen.has(wc("fiery"))).toBe(false);
    });
  });

  it("the title steps down to the 3x5 face and is cut with a dot only as fitHead cuts: the word is kept whole in its colour", () => {
    on(() => {
      // the longest factory name at ★3 with every word a factory takes (ENCHANT-1b N1: MASSIVE, the 7-letter word this test used, is a turret's now)
      for (const id of WORDS("factory")) {
        const [t] = panelOf("factory", "cargo", id, 3), title = enchantedTitle(id, "DRAG CHAIN FOUNDRY ★★★");
        expect(t.ench, `${id}: the panel holds the word`).toBe(id);
        expect(textWidth(title), `${id}: too long for the 5x7 face in 101 px, so it steps down`).toBeGreaterThan(101);
        const a = fresh(120, 12);
        fitTitle(gOf(a), { ...t, title }, 2, 2, 101);
        const colours = new Set<string>();
        for (let x = 0; x < 120; x++) for (let y = 0; y < 12; y++) { const p = a.at(x, y); if (p) colours.add(p); }
        expect(colours.has(wc(id)), `${id}: the word in its colour`).toBe(true);
        expect(a.oob, `${id}: nothing painted off the canvas`).toBe(0);
      }
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ the rows

describe("ENCHANT-1 E7: THE ROWS: the piece's own numbers, then every word's one line under the piece's own line, at THIS piece's stars (ENCHANT-1c C1: FIERY's number once)", () => {
  const rowText = (bs: Block[]): string[] => bs.filter((b) => b.role === "ability" && !b.note).map((b) => b.text);
  const o = { hero: "furnace" as const };

  it("FIERY on a rig (ENCHANT-1c C1): WHETSTONE's row is its own `[DMG]+20` as it is, with no orange +n [BURN]; FIERY's number shows ONCE, in its line `ADDS +n [BURN] TO EACH HIT.`, n = ENCHANT_NUM.burn x stars; on TEMPER the row keeps its own BURN, unchanged and not coloured", () => {
    on(() => {
      for (const stars of [1, 2, 3]) {
        const w = wordOn({ ench: "fiery" }, "whetstone", stars)!, plain = plainRigStats("whetstone", stars)!;
        const bs = faceBlocks("whetstone", stars, o, w)!, burn = ENCHANT_NUM.burn * stars;
        expect(bs).toHaveLength(2); // the stat row, then FIERY's own line (N2: a piece's own abilities are always visible, REQ-BFG-089)
        expect(bs[0].text, `★${stars}`).toBe(statRow(plain));
        expect(bs[0].hue, `★${stars}: no coloured number in the row`).toBeUndefined();
        expect(bs[0].keep).toBe(true);
        expect(pieceLine("fiery", "rig", stars), `★${stars}`).toBe(`ADDS +${burn} {BURN} TO EACH HIT.`);
        expect(bs[1], `★${stars}: FIERY's line`).toMatchObject({ role: "ability", text: icons(`ADDS +${burn} {BURN} TO EACH HIT.`), colour: wc("fiery"), keep: true });
        const t = wordOn({ ench: "fiery" }, "temper", stars)!, tp = plainRigStats("temper", stars)!;
        const tb = faceBlocks("temper", stars, o, t)!;
        expect(tb[0].text, `TEMPER ★${stars}: its own BURN, not +${burn} more`).toBe(statRow([["BURN", `+${fmtCount(effectAt("temper", stars).gate!.burn!)}`]]));
        expect(tb[0].text).toBe(statRow(tp));
        expect(tb[0].hue, `TEMPER ★${stars}: its own BURN is not coloured`).toBeUndefined();
        expect(tb[tb.length - 1], `TEMPER ★${stars}: FIERY's line`).toMatchObject({ colour: wc("fiery"), text: icons(`ADDS +${burn} {BURN} TO EACH HIT.`) });
        expect(tp).toHaveLength(1);
      }
    });
  });

  it("FIERY on a factory: the rows are the factory's own (the second row holds only what its slugs carry: KILN's HEAT), tied, none coloured, then its line `ADDS +n [BURN] TO ITS SLUGS.`; on a turret: the row's three pairs as they are, then `ADDS +n [BURN] TO EACH SHOT.` (ENCHANT-1c C1 and the words-only fix)", () => {
    on(() => {
      for (const stars of [1, 3]) {
        const burn = ENCHANT_NUM.burn * stars;
        const w = wordOn({ ench: "fiery" }, "press", stars)!, bs = faceBlocks("press", stars, o, w)!;
        const rows = bs.filter((b) => !b.note);
        expect(rows[0].text).toBe(statRow(factoryStats("press", stars, "furnace")));
        expect(rows[0].hue).toBeUndefined();
        expect(rows, "STAMP PRESS has no second row of its own: the stat row, then FIERY's line").toHaveLength(2);
        expect(rows[1], `press ★${stars}: FIERY's line`).toMatchObject({ role: "ability", text: icons(`ADDS +${burn} {BURN} TO ITS SLUGS.`), colour: wc("fiery"), keep: true });
        const k = wordOn({ ench: "fiery" }, "kiln", 1)!, kb = faceBlocks("kiln", 1, o, k)!.filter((b) => !b.note);
        expect(kb[1].text, "KILN's slugs carry HEAT, and FIERY adds nothing to that row").toBe(statRow(carryStats("kiln", 1, "furnace")!));
        expect(kb[1].hue).toBeUndefined();
        expect(kb[kb.length - 1], "KILN: FIERY's line").toMatchObject({ colour: wc("fiery"), text: icons("ADDS +1 {BURN} TO ITS SLUGS.") });
        const t = wordOn({ ench: "fiery" }, "scrapcannon", stars)!, all = faceBlocks("scrapcannon", stars, o, t)!, tb = all.filter((b) => b.pairs);
        expect(tb[0].text).toBe(turretRow(turretStats("scrapcannon", stars)));
        expect(tb[0].hue).toBeUndefined();
        expect(all[all.length - 1], `scrapcannon ★${stars}: FIERY's line`).toMatchObject({ role: "ability", text: icons(`ADDS +${burn} {BURN} TO EACH SHOT.`), colour: wc("fiery"), keep: true });
      }
    });
  });

  it("FIERY's number shows ONCE on every rig, factory and turret at every star (ENCHANT-1c C1): the blocks without its line are the plain piece's, no number in a row is coloured, and the one line is in FIERY's colour; a piece with no face of its own gets the line alone", () => {
    on(() => {
      let faced = 0, faceless = 0, own = 0;
      for (const d of Object.values(ITEMS)) {
        const kind = enchantKindOf(d);
        if (!kind || !d.price) continue;
        for (const stars of starsOn(d.id)) {
          const w = wordOn({ ench: "fiery" }, d, stars)!, line = icons(pieceLine("fiery", kind, stars)!);
          const plain = faceBlocks(d.id, stars, o), fiery = faceBlocks(d.id, stars, o, w);
          const tag = `${d.id} ★${stars}`;
          if (plain) {
            faced++;
            expect(fiery, tag).not.toBeNull();
            const mine = fiery!.filter((b) => b.colour === wc("fiery"));
            expect(mine, `${tag}: one line in FIERY's colour`).toHaveLength(1);
            expect(mine[0].text, tag).toBe(line);
            expect(fiery!.filter((b) => b !== mine[0]), `${tag}: the piece's own blocks, unchanged`).toEqual(plain);
            expect(fiery!.some((b) => b.hue !== undefined), `${tag}: no coloured number in a row`).toBe(false);
          } else {
            faceless++;
            expect(fiery, tag).toBeNull();
            const sentences = wordOnSentences([], d.id, stars, o, w);
            expect(sentences.map((b) => b.text), `${tag}: the line alone`).toEqual([line]);
            expect(sentences[0].colour, tag).toBe(wc("fiery"));
          }
          if (kind === "rig" && effectAt(d.id, stars).gate?.burn) own++;
        }
      }
      expect(faced, "pieces with a face were read").toBeGreaterThan(40);
      expect(own, "rigs with a BURN of their own were read (their row keeps that number as it is)").toBeGreaterThan(0);
      expect(faced + faceless, "every rig, factory and turret that is sold").toBeGreaterThan(60);
    });
  });

  it("every word adds ONE kept line, in its colour, after the piece's own lines, at this piece's stars (ENCHANT-1b N2: FIERY too; ENCHANT-1c C1: its row is the piece's own); a plain piece adds none", () => {
    on(() => {
      let n = 0;
      for (const kind of KINDS) for (const id of WORDS(kind)) for (const stars of starsOn(PIECE[kind])) {
        const def = PIECE[kind], w = wordOn({ ench: id, grow: 2 }, def, stars)!;
        const plain = faceBlocks(def, stars, o)!, enchanted = faceBlocks(def, stars, o, w)!;
        const line = pieceLine(id, kind, stars);
        const extra = enchanted.filter((b) => b.colour === wc(id) && b.role === "ability" && b.text === icons(line!));
        expect(line, `${id} on ${kind}`).toBe(id === "fiery" ? `ADDS +${ENCHANT_NUM.burn * stars} {BURN} ${{ rig: "TO EACH HIT", factory: "TO ITS SLUGS", turret: "TO EACH SHOT" }[kind]}.` : wordLine(id, kind, stars)); // the words-only fix: FIERY's PIECE line says ADDS; the word card's own line is wordLine's
        expect(extra, `${id} on ${kind} ★${stars}: one line`).toHaveLength(1);
        expect(extra[0], `${id} on ${kind}`).toMatchObject({ role: "ability", text: icons(line!), colour: wc(id), keep: true });
        expect(enchanted.indexOf(extra[0]), "after the piece's own rule lines").toBeGreaterThan(plain.filter((b) => !b.note).length - 1);
        expect(enchanted[enchanted.length - 1], "the last block: the line").toBe(extra[0]);
        expect(plain.every((b) => b.colour !== wc(id))).toBe(true);
        n++;
      }
      expect(n).toBeGreaterThan(14);
    });
  });

  it("the numbers that scale print at THIS piece's stars: RISING's and GROWING's +5 x stars, BRACED's 2 x stars stuns; the generic line is star 1's", () => {
    on(() => {
      for (const kind of KINDS) for (const stars of [1, 2, 3]) {
        expect(wordLine("rising", kind, stars), `RISING ${kind} ★${stars}`).toContain(`+${ENCHANT_NUM.risingStep * stars} {DMG} MORE THAN THE LAST`);
        expect(wordLine("growing", kind, stars), `GROWING ${kind} ★${stars}`).toContain(`+${ENCHANT_NUM.growingStep * stars} {DMG}, FOR THE RUN`);
        expect(wordLine("braced", kind, stars), `BRACED ${kind} ★${stars}`).toContain(`THE FIRST ${ENCHANT_NUM.bracedStuns * stars} {STUN}STUNS`);
        expect(wordLine("fiery", kind, stars), `FIERY ${kind} ★${stars}`).toContain(`{BURN}+${ENCHANT_NUM.burn * stars}.`);
      }
      expect(wordLine("rising", "rig", 1)).toBe(panelText("EACH SLUG IT HITS: +5 DMG MORE THAN THE LAST.".replace("+5", `+${ENCHANT_NUM.risingStep}`)));
      for (const id of ["echoing", "massive", "swift", "wide"] as const) for (const kind of KINDS) {
        if (wordLine(id, kind, 1) !== null) expect(wordLine(id, kind, 3), `${id}: no number scales`).toBe(wordLine(id, kind, 1));
      }
      // a piece's panel shows it: a ★3 rig holding RISING says +15, GROWING +15, BRACED 6 stuns
      for (const [id, want] of [["rising", `+${ENCHANT_NUM.risingStep * 3}`], ["growing", `+${ENCHANT_NUM.growingStep * 3}`], ["braced", `THE FIRST ${ENCHANT_NUM.bracedStuns * 3}`]] as const) {
        const [t] = panelOf("rig", "placed", id, 3);
        expect(texts(t.body).filter((x) => x.includes(want)), `${id} ★3 on the placed rig's panel`).toHaveLength(1);
        const [c] = panelOf("factory", "cargo", id, 3);
        expect(texts(c.body).filter((x) => x.includes(want)), `${id} ★3 on the cargo factory's panel`).toHaveLength(1);
      }
    });
  });

  it("FIERY's PIECE line says ADDS (ADDS +n [BURN] TO EACH HIT / TO ITS SLUGS / TO EACH SHOT) at every star, and the word's OWN card keeps `ITS HIT: [BURN]+n.` on its three rows (the brief's ruling: the word's card does not change)", () => {
    on(() => {
      for (const stars of [1, 2, 3]) {
        const n = ENCHANT_NUM.burn * stars;
        expect(pieceLine("fiery", "rig", stars)).toBe(`ADDS +${n} {BURN} TO EACH HIT.`);
        expect(pieceLine("fiery", "factory", stars)).toBe(`ADDS +${n} {BURN} TO ITS SLUGS.`);
        expect(pieceLine("fiery", "turret", stars)).toBe(`ADDS +${n} {BURN} TO EACH SHOT.`);
        expect(wordLine("fiery", "rig", stars)).toBe(`ITS HIT: {BURN}+${n}.`);
        expect(wordLine("fiery", "factory", stars)).toBe(`ITS SLUGS: {BURN}+${n}.`);
        expect(wordLine("fiery", "turret", stars)).toBe(`ITS SHOTS: {BURN}+${n}.`);
      }
      expect(wordFace("fiery").lines.map((l) => `${l.label}: ${l.text}`)).toEqual(["ON A RIG: ITS HIT: {BURN}+1.", "ON A FACTORY: ITS SLUGS: {BURN}+1.", "ON A TURRET: ITS SHOTS: {BURN}+1."]);
      // docs/TEXT-STYLE.md's lint (tests/textRules.ts) on the piece's line
      for (const kind of KINDS) for (const stars of [1, 2, 3]) expect(banned(pieceLine("fiery", kind, stars)!), `${kind} ★${stars}`).toEqual([]);
    });
  });

  it("a stat row never holds more than three pairs: a word's pairs go on a tied row (every rig, factory and turret, every word)", () => {
    on(() => {
      for (const d of Object.values(ITEMS)) {
        const kind = enchantKindOf(d);
        if (!kind || !d.price) continue;
        for (const id of WORDS(kind)) for (const stars of starsOn(d.id)) {
          const w = wordOn({ ench: id, grow: 3 }, d, stars)!;
          expect(() => faceBlocks(d.id, stars, o, w), `${id} on ${d.id} ★${stars}`).not.toThrow();
          expect(() => wordRows(d.id, stars, o, w), `${id} on ${d.id} ★${stars}`).not.toThrow();
        }
      }
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ the changed numbers

describe("ENCHANT-1 E7: A NUMBER THE WORD CHANGES is shown changed, in the word's colour, and agrees with the battle", () => {
  const FACTORIES = Object.values(ITEMS).filter((d) => d.kind === "factory" && d.price > 0 && d.id !== "mimic");

  /** The damage of the slug a factory makes under `ench` (the battle's way): enchantFx's slugMadeFx on a fresh payload, then deck.ts payloadDamage. */
  const battleDmg = (def: string, stars: number, ench: string, grow = 0): number => {
    const fs = effectAt(def, stars).factory!, ammo = AMMO[fs.ammo];
    const p = { mult: 1, flat: fs.scrapFlat ?? 0, burn: 0 } as Parameters<typeof slugMadeFx>[1];
    slugMadeFx(makeEnchantState({ ench, grow }, stars)!, p);
    return payloadDamage(fs.base ?? ammo.base, 0, 0, p.mult, p.flat, shotFloor(fs.ammo)) + (fs.round?.kind === "limpet" ? fs.round.blast : 0);
  };

  it("SWIFT on every factory at every star: the row's RATE is enchantRate of the plain RATE and its DMG the battle's slug damage (slugMadeFx, payloadDamage); both in the word's colour; MASSIVE on a factory is refused (ONLY ON A TURRET) and no panel reads it", () => {
    on(() => {
      let n = 0;
      // ENCHANT-1b (N1): SWIFT is a factory's word and MASSIVE a turret's (the installed turret's test below reads the battle for it)
      for (const d of FACTORIES) for (const stars of fusible(d.id) ? [1, 2, 3] : [1]) {
        const id = "swift" as const;
        const w = wordOn({ ench: id }, d, stars)!, plain = factoryStats(d.id, stars, "furnace"), row = factoryStats(d.id, stars, "furnace", w);
        const tag = `${id} on ${d.id} ★${stars}`;
        const speed = effectAt(d.id, stars).factory!.speed;
        expect(row[0], tag).toEqual(["RATE", fmtCount(enchantRate(id, speed))]);
        expect(row[1][1], `${tag}: DMG`).toBe(fmtDmg(battleDmg(d.id, stars, id)));
        expect(row.length, tag).toBe(plain.length);
        const rows = wordRows(d.id, stars, {}, w);
        expect(rows.hue[0], tag).toEqual(row[1][1] === plain[1][1] ? [0] : [0, 1]); // LIMPET WORKS' DMG is its charge's blast: the word does not move it
        // the other word that used to change a factory's row is refused here with its exact reason, and the panels read no word from it
        expect(enchantProblem(d, "massive"), `massive on ${d.id}`).toBe("ONLY ON A TURRET");
        expect(wordOn({ ench: "massive" }, d, stars), `massive on ${d.id} ★${stars}: no word`).toBeUndefined();
        n++;
      }
      expect(n).toBeGreaterThan(15);
    });
  });

  it("the KILN on the bench: the panel's RATE and DMG are what a fight makes (the factory's rate on its battle def, the first slug's payload)", () => {
    on(() => {
      // the KILN is a factory: SWIFT changes its rate and slug (ENCHANT-1b N1: MASSIVE is a turret's word and is read from the battle in the turret's test)
      for (const id of ["swift", "growing"] as const) {
        const b = furnaceBench();
        const deck: Build = { ...b, items: b.items.map((p) => (p.uid === 1 ? { ...p, ench: id, ...(id === "growing" ? { grow: 2 } : {}) } : p)) };
        const bt = new Battle(deck, barge(), SEED);
        let slug: Payload | undefined;
        while (!slug && bt.t < 8) { bt.step(); slug = bt.sides[0].routes[0].ammo[0]?.p; }
        expect(slug, id).toBeDefined();
        const spec = bt.sides[0].factories[0].def.factory!, a = AMMO[spec.ammo], p = slug!;
        const w = wordOn(deck.items[0], "kiln", gradeOf(deck, deck.items[0]))!;
        const row = factoryStats("kiln", gradeOf(deck, deck.items[0]), "furnace", w);
        expect(row[0], `${id}: RATE is the battle's`).toEqual(["RATE", fmtCount(spec.speed)]);
        expect(row[1][1], `${id}: DMG is the first slug's`).toBe(fmtDmg(payloadDamage(p.base ?? a.base, 0, 0, p.mult, p.flat, shotFloor(p.ammo))));
      }
    });
  });

  it("an installed turret's RATE is the battle's (MASSIVE halves, rounded as enchantRate: down, at least 1) and in the word's colour; the cargo copy's row agrees; SWIFT on a turret is refused (ONLY ON A FACTORY) and the panel reads no word", () => {
    on(() => {
      // ENCHANT-1b (N1): MASSIVE is a turret's word. SWIFT, which doubled a turret's rate here, is a factory's now (its rate is read in the factory's test above)
      for (const stars of [1, 3]) {
        const id = "massive" as const;
        const run = runWith([], [], [{ slot: 0, def: "scrapcannon", uid: 90, ...(stars > 1 ? { stars } : {}), ench: id }]);
        const bt = new Battle(run.build, barge(), SEED), speed = bt.sides[0].turrets[0].speed;
        const t = turretPanel(run, 0)!, row = t.body.find((b) => b.pairs)!;
        expect(row.text, `${id} ★${stars}`).toContain(`${ICON.RATE}RATE ${speed} `);
        expect(row.hue, `${id} ★${stars}`).toEqual({ colour: wc(id), nums: [0] });
        const plain = effectAt("scrapcannon", stars).turret!.speed;
        expect(turretSlots(run.build)[0].td!.speed, "deck.ts resolveSlots patches the def").toBe(enchantRate(id, plain));
        const cargo = turretStats("scrapcannon", stars, wordOn({ ench: id }, "scrapcannon", stars)!);
        expect(cargo[0]).toEqual(["RATE", fmtCount(enchantRate(id, plain))]);
      }
      // SWIFT on a turret is refused with its exact reason. A build that holds it anyway is a SIM-ONLY FIXTURE (deck.ts, the sim, is unchanged and would
      // still double the rate; the validators refuse such a build): the panels read no word from it, so no word is in the title and no colour on the row
      const run = runWith([], [], [{ slot: 0, def: "scrapcannon", uid: 90, ench: "swift" }]);
      const t = turretPanel(run, 0)!, plain = turretPanel(runWith([], [], [{ slot: 0, def: "scrapcannon", uid: 90 }]), 0)!;
      expect(enchantProblem("scrapcannon", "swift")).toBe("ONLY ON A FACTORY");
      expect(wordOn({ ench: "swift" }, "scrapcannon", 1)).toBeUndefined();
      expect(t.ench, "no word on the panel").toBeUndefined();
      expect(t.title).toBe(plain.title);
      expect(t.body.find((b) => b.pairs)!.hue, "no colour on the row").toBeUndefined();
      expect(t.body.some((b) => b.colour === wc("swift")), "no line in SWIFT's colour").toBe(false);
    });
  });

  it("GROWING: the DMG carries the grown amount, +5 x grow x stars, in its colour, the battle's: a factory's DMG, a rig's hit, a turret's added pair; none before the first dusk fight", () => {
    on(() => {
      for (const stars of [1, 3]) for (const grow of [0, 2]) {
        const g = (def: string) => wordOn({ ench: "growing", grow }, def, stars)!;
        const step = ENCHANT_NUM.growingStep * grow * stars;
        // a factory: the DMG is the battle's slug damage
        expect(factoryStats("press", stars, "furnace", g("press"))[1][1], `press ★${stars} grow ${grow}`).toBe(fmtDmg(battleDmg2("press", stars, grow)));
        expect(Number(factoryStats("press", stars, "furnace", g("press"))[1][1]) - Number(factoryStats("press", stars, "furnace")[1][1])).toBe(step);
        // a rig with a DMG stat: its +DMG grows; a rig without one gets a DMG pair once it has grown
        const wr = plainRigStats("whetstone", stars)!, flat = effectAt("whetstone", stars).gate!.flat!;
        const grown = wordRows("whetstone", stars, {}, g("whetstone"));
        expect(grown.rows[0], `whetstone ★${stars} grow ${grow}`).toEqual([["DMG", `+${fmtDmg(flat + step)}`]]);
        expect(grown.hue[0]).toEqual(grow ? [0] : []);
        expect(wr).toHaveLength(1);
        const temper = wordRows("temper", stars, {}, g("temper"));
        expect(temper.rows[0].map(([k]) => k), `temper ★${stars} grow ${grow}`).toEqual(grow ? ["BURN", "DMG"] : ["BURN"]);
        // a turret: the row ends with {DMG}+n once it has grown
        const tr = wordRows("scrapcannon", stars, {}, g("scrapcannon"));
        expect(tr.rows[0].length, `turret ★${stars} grow ${grow}`).toBe(grow ? 4 : 3);
        if (grow) expect(tr.rows[0][3]).toEqual(["DMG", `+${fmtDmg(step)}`]);
      }
    });
    function battleDmg2(def: string, stars: number, grow: number): number {
      const fs = effectAt(def, stars).factory!, ammo = AMMO[fs.ammo];
      const p = { mult: 1, flat: fs.scrapFlat ?? 0, burn: 0 } as Parameters<typeof slugMadeFx>[1];
      slugMadeFx(makeEnchantState({ ench: "growing", grow }, stars)!, p);
      return payloadDamage(fs.base ?? ammo.base, 0, 0, p.mult, p.flat, shotFloor(fs.ammo));
    }
  });

  it("WIDE: a factory's {BELT} is outputsAt + 1 and agrees with its sub line BELTS n/m; a turret's {GEAR} is gearSlotsOf + 1 and is the slot's own; both in WIDE's colour", () => {
    on(() => {
      for (const stars of [1, 3]) {
        const star = stars > 1 ? { stars } : {};
        const run = runWith([{ uid: 9, def: "press", x: 0, y: 0, ench: "wide", ...star }]);
        const t = itemPanel(run, 9)!, row = t.body.find((b) => b.hue)!;
        const belts = outputsAt("press", stars) + 1;
        expect(row.text).toContain(`${ICON.BELT}${belts}`);
        expect(row.hue).toEqual({ colour: wc("wide"), nums: [2] });
        expect(t.sub, "the sub line counts the same belts").toBe(`FACTORY · BELTS 0/${belts}`);
        // a factory that shows no belts (one slot at every star) shows them once WIDE gives it a second
        const w = wordOn({ ench: "wide" }, "gantry", stars)!;
        expect(factoryStats("gantry", stars, "furnace", w).some(([k]) => k === "BELT")).toBe(true);
        const tr = runWith([], [], [{ slot: 0, def: "scrapcannon", uid: 90, ...star, ench: "wide" }]);
        const tp = turretPanel(tr, 0)!, trow = tp.body.find((b) => b.pairs)!;
        expect(trow.text).toContain(`${ICON.GEAR}GEAR SLOTS ${gearSlotsOf("scrapcannon", stars) + 1}`);
        expect(turretSlots(tr.build)[0].gearSlots, "deck.ts resolveSlots").toBe(gearSlotsOf("scrapcannon", stars) + 1);
        expect(trow.hue).toEqual({ colour: wc("wide"), nums: [2] });
      }
    });
  });

  it("slugDmg is payloadDamage's rule: MASSIVE xENCHANT_NUM.massiveShare and SWIFT x1/2 of the die and its flat, rounded half up once, never under the floor; every other word and no word: base + flat", () => {
    // slugDmg is the pure rule: since ENCHANT-1b (N1) the factory's row asks it for SWIFT (MASSIVE is a turret's word), and the rule for both stays whole
    expect(slugDmg(undefined, 30, 4)).toBe(34);
    expect(slugDmg({ id: "massive", stars: 1, grow: 0 }, 30, 4)).toBe(34 * ENCHANT_NUM.massiveShare);
    expect(slugDmg({ id: "swift", stars: 1, grow: 0 }, 75)).toBe(38);
    expect(slugDmg({ id: "swift", stars: 1, grow: 0 }, 15, 0, 10)).toBe(10); // the floor a slug deals (deck.ts shotFloor): 15 / 2 is 8, so 10
    expect(slugDmg({ id: "swift", stars: 1, grow: 0 }, 15)).toBe(8); // with no floor given: rounded half up, as payloadDamage rounds before its max
    expect(slugDmg({ id: "swift", stars: 1, grow: 0 }, 0, 0, 0)).toBe(0);
    expect(slugDmg({ id: "growing", stars: 2, grow: 3 }, 30)).toBe(30 + ENCHANT_NUM.growingStep * 3 * 2);
    for (const id of ["fiery", "rising", "echoing", "wide", "braced"] as const) expect(slugDmg({ id, stars: 3, grow: 0 }, 30, 4), id).toBe(34);
  });

  it("ENCHANT-1b N1: MASSIVE is a turret's word and SWIFT a factory's: on any other piece enchantProblem refuses them with the exact reason, wordLine writes nothing and no panel shows the word", () => {
    on(() => {
      const ONLY: [EnchantId, EnchantKind, string][] = [["massive", "turret", "ONLY ON A TURRET"], ["swift", "factory", "ONLY ON A FACTORY"]];
      let shown = 0, refused = 0;
      for (const [id, home, why] of ONLY) {
        expect(ENCHANT_DEFS[id].kinds, `${id} goes on one kind`).toEqual([home]);
        for (const d of Object.values(ITEMS)) {
          const kind = enchantKindOf(d);
          if (!kind) continue;
          expect(enchantProblem(d, id), `${id} on ${d.id}`).toBe(kind === home ? null : why);
          expect(wordOn({ ench: id }, d, 1) !== undefined, `${id} on ${d.id}: the panels read it only on a ${home}`).toBe(kind === home);
          expect(wordLine(id, kind, 1) !== null, `${id} on ${kind}: a line only on a ${home}`).toBe(kind === home);
        }
        for (const [kind, how] of SHOWS) {
          const [t] = panelOf(kind, how, id), [plain] = panelOf(kind, how, null), tag = `${id} on ${kind} ${how}`;
          if (kind === home) { expect(t.ench, tag).toBe(id); shown++; continue; }
          expect(t.ench, `${tag}: the panel reads no word`).toBeUndefined();
          expect(t.title, tag).toBe(plain.title);
          expect(titleSpans(t), tag).toEqual([{ t: plain.title, c: plain.color }]);
          expect(texts(explainPanel(t, PIECE[kind]).notes ?? []).some((x) => ENCHANT_NOTES.includes(x)), `${tag}: no NOTES line`).toBe(false);
          // a SIM-ONLY FIXTURE: an installed turret's row is deck.ts's own numbers, and the sim (unchanged) still doubles a SWIFT turret's rate, so only the word is
          // checked there; every other panel is the plain piece's, deep-equal
          if (how !== "installed") expect(t, tag).toEqual(plain);
          refused++;
        }
      }
      expect([shown, refused], "MASSIVE: 2 turret panels shown, 4 refused; SWIFT: 2 factory panels shown, 4 refused").toEqual([4, 8]);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ the notes and the word card

describe("ENCHANT-1 E7: THE NOTES (behind the hover or the tap) and the word card's own face", () => {
  it("an enchanted piece's NOTES carry both default lines (ENCHANTED..., ONE PER PART...); a plain piece's carry neither; the face never draws them", () => {
    on(() => {
      for (const [kind, how] of SHOWS) for (const id of WORDS(kind)) {
        const [t] = panelOf(kind, how, id), face = explainPanel(t, PIECE[kind]);
        const tag = `${id} on ${kind} ${how}`;
        expect(texts(face.notes ?? []), tag).toEqual(expect.arrayContaining([...ENCHANT_NOTES]));
        expect(texts(face.body).some((x) => ENCHANT_NOTES.includes(x)), `${tag}: not on the face`).toBe(false);
        expect(face.notes!.filter((b) => ENCHANT_NOTES.includes(b.text)).every((b) => b.note === "kind" && b.role === "ability"), tag).toBe(true);
        expect(face.words!.some((b) => ENCHANT_NOTES.includes(b.text)), `${tag}: KEYWORDS reads them`).toBe(true);
        expect(face.ench).toBe(id);
        const [p] = panelOf(kind, how, null), pf = explainPanel(p, PIECE[kind]);
        expect(texts(pf.notes ?? []).some((x) => ENCHANT_NOTES.includes(x)), `${tag}: a plain piece's`).toBe(false);
      }
    });
  });

  it("enchantNotes(word): the four lines for one of the eight words with the switch on (ENCHANT-1c C4: the fourth says what a merge does when only one part holds a word); [] for no word, a stray id, and every word with the switch off", () => {
    on(() => {
      for (const id of ENCHANT_IDS) expect(enchantNotes(id)).toEqual([...ENCHANT_NOTES]);
      expect(enchantNotes(undefined)).toEqual([]);
      expect(enchantNotes("keen")).toEqual([]);
    });
    off(() => { for (const id of ENCHANT_IDS) expect(enchantNotes(id)).toEqual([]); });
    expect(ENCHANT_NOTES).toEqual([
      "ENCHANTED: ONE EXTRA EFFECT ON THIS PART, SHOWN IN ITS COLOUR. IT STAYS WHEN YOU MOVE THE PART AND IS LOST IF YOU SELL IT.",
      "A PART HOLDS ONE: A NEW ONE REPLACES IT.",
      "A MERGE KEEPS ONE: IF BOTH PARTS HAVE ONE, YOU PICK.",
      "IF ONLY ONE PART HAS ONE, A MERGE KEEPS IT.",
    ]);
  });

  it("the battle's inspect face (battleScout faceText) of an enchanted piece carries the word and the NOTES as the build screen's does", () => {
    on(() => {
      const run = runWith([{ uid: 9, def: "whetstone", x: 3, y: 3, ench: "fiery" } as Build["items"][number]], [], [{ slot: 0, def: "scrapcannon", uid: 90, ench: "massive" }]);
      const rig = faceText(run.build, { kind: "item", uid: 9 })!, gun = faceText(run.build, { kind: "turret", index: 0 })!;
      expect(rig.ench).toBe("fiery");
      expect(rig.title).toBe("FIERY WHETSTONE");
      expect(texts(rig.notes ?? [])).toEqual(expect.arrayContaining([...ENCHANT_NOTES]));
      expect(gun.ench).toBe("massive");
      expect(gun.title).toBe("MASSIVE SCRAP CANNON");
      expect(gun.body.some((b) => b.colour === wc("massive"))).toBe(true);
    });
  });

  it("the word card's face (wordFace): its name and colour, a row for each kind the word goes on (no `NOT ON` row; a word with one kind says ONLY ON A ...), the NOTES; each line is the panels' markup at star 1", () => {
    for (const id of ENCHANT_IDS) {
      const f = wordFace(id), goes = KINDS.filter((k) => ENCHANT_DEFS[id].kinds.includes(k));
      expect(f.name).toBe(ENCHANT_DEFS[id].name);
      expect(f.color).toBe(ENCHANT_DEFS[id].color);
      expect(f.notes).toEqual(ENCHANT_NOTES);
      expect(f.lines.map((l) => l.kind), `${id}: a row for each kind it goes on, in the order rig, factory, turret, and for no other`).toEqual(goes);
      for (const l of f.lines) {
        expect(l.legal, `${id} ${l.kind}`).toBe(true);
        expect(l.label, `${id} ${l.kind}`).toBe(`${goes.length === 1 ? "ONLY " : ""}ON A ${l.kind.toUpperCase()}`);
        expect(l.label, `${id} ${l.kind}: no NOT ON row any more`).not.toMatch(/^NOT ON/);
        expect(l.text, `${id} ${l.kind}`).toBe(wordLine(id, l.kind, 1));
        expect(l.text).not.toMatch(/[[\]]/);
        expect(l.text).not.toMatch(/(?<!\{)\bDMG\b(?!\})/);
      }
    }
    expect(wordFace("massive").lines).toHaveLength(1);
    expect(wordFace("swift").lines).toHaveLength(1);
    expect(wordFace("wide").lines.map((l) => l.text)).toEqual(["+1 ARROW", "+1 {BELT} SLOT", "+1 {GEAR} SLOT"]);
  });

  it("ENCHANT-1b N1: the card of a word with ONE kind has ONE row: MASSIVE `ONLY ON A TURRET`, SWIFT `ONLY ON A FACTORY`; the other six words keep ON A RIG, ON A FACTORY, ON A TURRET", () => {
    expect(wordFace("massive").lines).toEqual([{ kind: "turret", legal: true, label: "ONLY ON A TURRET", text: panelText(`FIRES HALF AS OFTEN. ${ENCHANT_NUM.massiveShare}x DMG A SHOT.`) }]);
    expect(wordFace("swift").lines).toEqual([{ kind: "factory", legal: true, label: "ONLY ON A FACTORY", text: panelText("WORKS TWICE AS OFTEN. ITS SLUGS DEAL HALF DMG.") }]);
    const six = ENCHANT_IDS.filter((id) => id !== "massive" && id !== "swift");
    expect(six).toHaveLength(6);
    for (const id of six) expect(wordFace(id).lines.map((l) => l.label), id).toEqual(["ON A RIG", "ON A FACTORY", "ON A TURRET"]);
    for (const id of ENCHANT_IDS) expect(wordFace(id).lines.filter((l) => !l.legal || l.text === "" || /^NOT ON/.test(l.label)), `${id}: no refused row`).toEqual([]);
  });

  it("a word card's panel text, as the APPLY screen builds it from wordFace (apply.ts wordSpec: the label in brass, the line in the panels' markup, the NOTES behind the ⓘ), fits the phone band and the desk column whole", () => {
    on(() => {
      for (const id of ENCHANT_IDS) {
        const f = wordFace(id);
        const body: Block[] = f.lines.map((l): Block => (l.legal ? { role: "ability", text: icons(`${l.label}: ${l.text}`), brass: `${l.label}:`, keep: true } : { role: "ability", text: l.label, keep: true }));
        const t: PanelText = { title: f.name, color: f.color, sub: "ENCHANTMENT", body, variants: [{ body, tight: true }], labels: ["APPLY"], notes: f.notes.map((text): Block => ({ role: "note", text })) };
        for (const [view, fr, touch] of VIEWS) {
          const area = fr.L.phone ? fr.L.info : { x: 4, y: 4, w: 128, h: 500 };
          const plan = planPanel(explainPanel(t), area, [], { tap: touch ? fr.tap : 0, band: !!fr.portrait, inBand: !!fr.L.phone && touch });
          expect(keptWhole(plan), `${view} ${id}: kept text whole`).toBe(true);
          expect(plan.body.dropped.filter((b) => b.role === "ability"), `${view} ${id}: every line shown`).toEqual([]);
        }
      }
    });
  });

  it("panelText: [NAME] is the {NAME} markup, DMG as a word is the {DMG} icon, markup already in it stays; every line of every word has no bracket and no bare DMG", () => {
    expect(panelText("ITS HIT: [BURN]+1.")).toBe("ITS HIT: {BURN}+1.");
    expect(panelText("+5 DMG MORE")).toBe("+5 {DMG} MORE");
    expect(panelText("+5 {DMG} MORE [DMG]")).toBe("+5 {DMG} MORE {DMG}");
    for (const id of ENCHANT_IDS) for (const kind of KINDS) for (const stars of [1, 3]) {
      const t = wordLine(id, kind, stars);
      if (t === null) { expect(ENCHANT_DEFS[id].kinds.includes(kind)).toBe(false); continue; }
      expect(t, `${id} ${kind}`).not.toMatch(/[[\]]/);
      expect(t, `${id} ${kind}`).not.toMatch(/(?<!\{)\bDMG\b(?!\})/);
      expect(icons(t), `${id} ${kind}: every {NAME} is an icon`).not.toMatch(/[{}]/);
    }
  });

  it("TEXT-STYLE (T2's bans, tests/textRules.ts): no word line, NOTE, REPLACES or SELL? text breaks a rule (the brief's `3RD` and `ONE PER PART` were reworded in run 3: THIRD, A PART HOLDS ONE), and no refusal reason does", () => {
    const found: string[] = [];
    for (const id of ENCHANT_IDS) for (const kind of KINDS) for (const stars of [1, 3]) {
      const t = wordLine(id, kind, stars);
      if (t) for (const why of banned(t)) found.push(`${id} ${kind}: ${why}`);
    }
    ENCHANT_NOTES.forEach((note, i) => { for (const why of banned(note)) found.push(`note ${i + 1}: ${why.split(" (")[0]}`); });
    expect([...new Set(found)].sort()).toEqual([]); // run 3 reworded the brief's `3RD` (THIRD) and `ONE PER PART` (A PART HOLDS ONE) to pass TEXT-STYLE
    for (const id of ENCHANT_IDS) {
      expect(banned(replacesText(id)), replacesText(id)).toEqual([]);
      expect(banned(sellAskText(id)), sellAskText(id)).toEqual([]);
    }
    for (const d of Object.values(ITEMS)) for (const id of ENCHANT_IDS) {
      const why = enchantProblem(d, id);
      if (why) expect(banned(why), `${id} on ${d.id}: ${why}`).toEqual([]);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ the fit

describe("ENCHANT-1 E7: every enchanted panel fits its box on the phone (402x690 @3) and the desk (1280x800)", () => {
  setTipsForTests("done");

  it("every rig, factory and turret in the catalogue as a cargo piece, every word it takes, ★1 and ★3: the kept text whole and the full text shown, on both views", () => {
    on(() => {
      let n = 0;
      for (const [view, f, touch] of VIEWS) for (const d of Object.values(ITEMS)) {
        const kind = enchantKindOf(d);
        if (!kind || !d.price) continue;
        for (const id of WORDS(kind)) for (const stars of starsOn(d.id)) {
          const run = runWith([], [{ uid: 900, def: d.id, ...(stars > 1 ? { stars } : {}), ench: id, ...(id === "wide" && kind === "rig" ? { enchDir: freeSides(d)[0] } : {}), ...(id === "growing" ? { grow: 3 } : {}) } as Run["inventory"][number]]);
          const dd = panelCtx(run, { kind: "cargo", uid: 900 }, f, touch).d();
          const tag = `${view} ${id} ${d.id} ★${stars}`;
          expect(keptWhole(dd.plan), `${tag}: kept text whole`).toBe(true);
          expect(fullText(dd.plan), `${tag}: full text`).toBe(true);
          n++;
        }
      }
      expect(n).toBeGreaterThan(1900);
    });
  });

  it("every placed rig and factory and every installed turret, every word, ★3: an enchanted panel fits whenever the plain piece's does (the word never makes a panel worse), on both views", () => {
    on(() => {
      let n = 0, worse = 0;
      for (const [view, f, touch] of VIEWS) for (const d of Object.values(ITEMS)) {
        const kind = enchantKindOf(d);
        if (!kind || !d.price) continue;
        const stars = starsOn(d.id).slice(-1)[0], star = stars > 1 ? { stars } : {};
        const make = (id: EnchantId | null): [Run, Sel] => {
          const w = id ? word(id, d.id, id === "growing" ? { grow: 3 } : {}) : {};
          if (kind === "turret") return [runWith([], [], [{ slot: 0, def: d.id, uid: 90, ...star, ...w }]), { kind: "turret", index: 0 }];
          return [runWith([{ uid: 9, def: d.id, x: kind === "rig" ? 3 : 0, y: kind === "rig" ? 3 : 0, ...star, ...w } as Build["items"][number]]), { kind: "item", uid: 9 }];
        };
        const [pr, ps] = make(null), plain = panelCtx(pr, ps, f, touch).d();
        for (const id of WORDS(kind)) {
          const [er, es] = make(id), dd = panelCtx(er, es, f, touch).d();
          const tag = `${view} ${id} on ${d.id} ★${stars}`;
          if (keptWhole(plain.plan)) expect(keptWhole(dd.plan), `${tag}: kept text whole`).toBe(true);
          if (fullText(plain.plan) && !fullText(dd.plan)) worse++;
          n++;
        }
      }
      expect(n).toBeGreaterThan(600);
      expect(worse, "panels that showed their full text plain and lose some with the word").toBe(0);
    });
  });

  it("the title: on the phone the word and the name fit the room beside the icon (5x7 or 3x5) for every piece and word; on the desk only the two longest factory names at ★3 (DRAG CHAIN FOUNDRY, FROSTBITE FOUNDRY) are cut with a dot (the text sheet lists them)", () => {
    on(() => {
      const cut: string[] = [];
      for (const [view, f, touch] of VIEWS) for (const d of Object.values(ITEMS)) {
        const kind = enchantKindOf(d);
        if (!kind || !d.price) continue;
        for (const id of WORDS(kind)) for (const stars of starsOn(d.id)) {
          const run = runWith([], [{ uid: 900, def: d.id, ...(stars > 1 ? { stars } : {}), ench: id, ...(id === "wide" && kind === "rig" ? { enchDir: freeSides(d)[0] } : {}) } as Run["inventory"][number]]);
          const dd = panelCtx(run, { kind: "cargo", uid: 900 }, f, touch).d();
          if (textWidth(dd.t.title) > dd.plan.subMax && textWidth(dd.t.title, "3") > dd.plan.subMax) cut.push(`${view}: ${dd.t.title}`);
        }
      }
      expect(cut.filter((c) => c.startsWith("phone"))).toEqual([]);
      // 13 = the 7 words a factory takes on DRAG CHAIN FOUNDRY + 6 on FROSTBITE FOUNDRY (WIDE is short enough to fit there); it was 15 before ENCHANT-1b (N1),
      // when MASSIVE was a factory's word too and was cut on both
      expect(cut.length).toBe(13);
      for (const c of cut) expect(c, c).toMatch(/^desk 1280x800: \S+ (DRAG CHAIN|FROSTBITE) FOUNDRY ★★★$/);
    });
  });

  it("the ⓘ view of an enchanted piece (its NOTES, LEVELS, KEYWORDS): at most 3 pages on the op view and on the desk, every NOTES line in it", () => {
    on(() => {
      const op = framed(402, 690, 3, 1), desk = framed(1280, 800, 1, 1);
      let worstOp = 0, worstDesk = 0, n = 0;
      for (const [view, f, touch] of [["op", op, true], ["desk", desk, false]] as const) for (const [kind, how] of SHOWS) for (const id of WORDS(kind)) for (const stars of starsOn(PIECE[kind])) {
        const [, run, sel] = panelOf(kind, how, id, stars);
        const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
        const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
        const d = detailsPlan(ctx, sel, null, area)!, p = d.plan;
        const words = explainWords(d.t, panelPiece(run, d.show)), notes = (d.t.notes ?? []).map((b) => b.text);
        const items = infoItems(infoLevels(run, sel), words, p.r.w - 10, notes);
        const pages = infoView(items, p.r, p.y - 1, p.maxY + 2, infoFree(f.L, p.r, p.column)).pages;
        expect(pages.flat(2).map((it) => it.note).filter(Boolean), `${view} ${id} on ${kind} ${how}`).toEqual(expect.arrayContaining([...ENCHANT_NOTES]));
        if (view === "op") worstOp = Math.max(worstOp, pages.length); else worstDesk = Math.max(worstDesk, pages.length);
        n++;
      }
      expect(n).toBeGreaterThan(100);
      console.log(`ENCHANT-1 E7 ⓘ pages of ${n} enchanted panel views: op worst ${worstOp}, desk worst ${worstDesk}`);
      expect(worstOp, "op view").toBeLessThanOrEqual(3);
      expect(worstDesk, "desk").toBeLessThanOrEqual(3);
    });
  });

  it("drawDetails draws an enchanted piece's panel on both views without painting off the canvas: the word's colour is on the title, and the line's colour in the body", () => {
    on(() => {
      for (const [view, f, touch] of VIEWS) for (const [kind, how] of SHOWS) {
        // a word each kind takes (ENCHANT-1b N1: MASSIVE is a turret's, SWIFT a factory's)
        const id: EnchantId = kind === "rig" ? "echoing" : kind === "factory" ? "swift" : "massive", [t, run, sel] = panelOf(kind, how, id);
        expect(t.ench, `${view} ${kind} ${how}: the panel holds ${id}`).toBe(id);
        const p = panelCtx(run, sel, f, touch), ui = (p.ctx.game as unknown as { ui: UI }).ui;
        ui.pointer.kind = touch ? "touch" : "mouse";
        Object.assign(ui.pointer, { x: -1, y: -1, down: false });
        const a = fresh(f.W, f.H);
        ui.begin();
        drawDetails(gOf(a), p.ctx, sel, null, p.area, {} as DuskFoe);
        ui.end();
        const seen = new Set<string>();
        for (let x = p.area.x; x < p.area.x + p.area.w; x++) for (let y = p.area.y; y < p.area.y + p.area.h; y++) { const px = a.at(x, y); if (px) seen.add(px); }
        expect(a.oob, `${view} ${kind} ${how}`).toBe(0);
        expect(seen.has(wc(id)), `${view} ${kind} ${how}: the word's colour is drawn (${t.title})`).toBe(true);
      }
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ the switch off

describe("ENCHANT-1 E7: with the switch OFF every panel is the plain piece's, deep-equal, though the piece carries a stray `ench`", () => {
  it("itemPanel, cargoPanel, turretPanel and their explainPanel faces: toEqual the same piece without a word, for every word on every kind, ★1 and ★3", () => {
    off(() => {
      let n = 0;
      for (const [kind, how] of SHOWS) for (const id of WORDS(kind)) for (const stars of starsOn(PIECE[kind])) {
        const [t] = panelOf(kind, how, id, stars), [p] = panelOf(kind, how, null, stars);
        const tag = `${id} on ${kind} ${how} ★${stars}`;
        expect(t, tag).toEqual(p);
        expect("ench" in t, `${tag}: no ench key`).toBe(false);
        expect(explainPanel(t, PIECE[kind]), tag).toEqual(explainPanel(p, PIECE[kind]));
        expect(titleSpans(t), tag).toEqual([{ t: p.title, c: p.color }]);
        expect(texts(explainPanel(t).notes ?? []).some((x) => ENCHANT_NOTES.includes(x)), tag).toBe(false);
        n++;
      }
      expect(n).toBeGreaterThan(40);
    });
  });

  it("the data functions: faceBlocks with no word, wordOn, the stat rows, enchantNotes are the plain ones; the detailsPlan of a stray-word piece equals the plain piece's on both views", () => {
    off(() => {
      for (const id of ENCHANT_IDS) {
        expect(wordOn({ ench: id, grow: 3 }, "whetstone", 3)).toBeUndefined();
        expect(wordOn({ ench: id }, "scrapcannon", 1)).toBeUndefined();
        expect(enchantNotes(id)).toEqual([]);
      }
      for (const [view, f, touch] of VIEWS) for (const [kind, how] of SHOWS) for (const id of WORDS(kind)) {
        const [, r1, s1] = panelOf(kind, how, id, 1), [, r2, s2] = panelOf(kind, how, null, 1);
        const a = panelCtx(r1, s1, f, touch).d(), b = panelCtx(r2, s2, f, touch).d();
        expect(a.t, `${view} ${id} ${kind} ${how}`).toEqual(b.t);
        expect(a.plan.body.lines.map((l) => (l === "rule" ? "-" : lineText(l.spans))), `${view} ${id} ${kind} ${how}`).toEqual(b.plan.body.lines.map((l) => (l === "rule" ? "-" : lineText(l.spans))));
        expect(a.plan.r).toEqual(b.plan.r);
      }
    });
  });

  it("the shipped state is off: no panel of any piece carries a word (ENCHANT false, setEnchant never called here)", () => {
    expect(ENCHANT).toBe(false);
    const [t] = panelOf("rig", "cargo", "fiery");
    expect(t.ench).toBeUndefined();
    expect(texts(t.body).join(" ")).not.toContain("BURN");
  });

  it("a plain piece's panel with the switch ON is the plain panel too (the word's code touches only a piece that holds one)", () => {
    for (const [kind, how] of SHOWS) {
      const a = off(() => panelOf(kind, how, null)[0]), b = on(() => panelOf(kind, how, null)[0]);
      expect(b).toEqual(a);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------ the sim agrees on the one thing the faces pin

describe("ENCHANT-1 E7: the faces read the sim's numbers, never their own", () => {
  it("every number a word's line prints is ENCHANT_NUM's x the stars; changing a number moves the text (the line is built from the table)", () => {
    const was = { ...ENCHANT_NUM };
    try {
      ENCHANT_NUM.risingStep = 7;
      expect(wordLine("rising", "rig", 2)).toContain("+14 {DMG}");
      ENCHANT_NUM.bracedStuns = 3;
      expect(wordLine("braced", "turret", 3)).toContain("THE FIRST 9 ");
      ENCHANT_NUM.burn = 2;
      expect(wordLine("fiery", "factory", 3)).toContain("{BURN}+6.");
    } finally {
      Object.assign(ENCHANT_NUM, was);
    }
    expect(ENCHANT_NUM).toEqual(was);
  });

  it("ENCHANT_DEFS' colours are the ones the panels draw; no two words share one", () => {
    const colours = ENCHANT_IDS.map((id) => ENCHANT_DEFS[id].color);
    expect(new Set(colours).size).toBe(colours.length);
    for (const id of ENCHANT_IDS) expect(wordFace(id).color).toBe(wc(id));
  });
});
