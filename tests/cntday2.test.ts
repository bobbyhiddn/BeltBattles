// CNT-DAY2 (REQ-BFG-100, REQ-BFG-082; REQ-BFG-079; BRIEF-CNTDAY2 step 5): the last two day gaps, display only.
// With HULL_SCALE on, a fight on day d lands each heal x S(d) (Battle.heal) and the texts read the day's numbers (dayShown.ts).
//  (a) L1, the plate's REGEN badge (battleHud.ts drawPlate), STOPPED by the brief's fit rule (step 1) and reverted: the
//      badge and its room stay cntday2-base's on every fight (regenNow, regenMax, day-1 units), while the heal that lands
//      each second on a fight on the day's hull is Battle.sustainTick's one sum x S(d), rounded down (measured here, for the
//      REPORT). The drawn badge is read off drawText (a pass-through mock below).
//  (b) L2, a word tap with no piece (keywords.ts matches through glossaryText's `day`): a belt's panel and a turret with its
//      signature core, on the build screen (run.day 7), on VIEW BATTLEFIELD's face of a day-7 fight and on the scouted foe
//      (FoeView, run.day 7) read glossaryRows(7)'s rows (the counters' panels' keywordEntry(.., 7)); no day or the switch
//      off: today's text, byte for byte. The taps are read off glossaryText (a pass-through mock below) as the real draw
//      paths make them (drawDetails, BattleFaces.draw, FoeView.draw). Also the sweep's two fixes: runeWords (the ⓘ view's
//      rune keywords) and fittedPanel (a fitted core's or gear piece's touch panel) on the run's day.
//  (c) L1's fit, measured (why L1 stopped): the largest REGEN a real build holds (4 turret slots x a ★3 MENDING LOOM +
//      GREEN THREAD; each hero's own: its slots) on day 10, on the op phone (402x690), a landscape phone (844x390) and the
//      desk (1920x1080), both plates, with WARD's pips, SHIELD's number and the longest name and tag: the brief's worst case
//      drops the badge already at the base, and across real day-10 plates the day's wider badge would change some plates'
//      form (/max or the pips give way, or the badge drops), so its room can't come from the bar alone.
// Everything is built here (start decks, set-up runs, a scouted foe whose deck the test sets); never fights.json and never a
// par deck. Every day number is computed (sustShown, dmgShown, glossaryRows(day)); only day 1's are pinned.
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";

/** What the pass-through mocks saw: every drawText call (the badge), every glossaryText call (a tap's text). */
const rec = vi.hoisted(() => ({
  text: [] as { s: string; x: number; y: number; color: string; align?: string }[],
  gloss: [] as { word: string; def?: string; day?: number; out?: string }[],
}));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, color, align: opts?.align });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});
vi.mock("../src/ui/glossary", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/ui/glossary")>();
  const glossaryText: typeof m.glossaryText = (word, piece, day) => {
    const out = m.glossaryText(word, piece, day);
    rec.gloss.push({ word, def: piece?.def, day, out });
    return out;
  };
  return { ...m, glossaryText };
});

import { HULL_SLOTS, HEROES, ITEMS, SHIELD_CAP, type HeroId } from "../src/sim/content";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { dmgShown, hullScaleRules, sustMulTenths, sustShown, withHullScale } from "../src/sim/hullScale";
import { key as K, rotField, setTurretList, type Build } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { RUNES } from "../src/sim/runes";
import type { Side } from "../src/sim/battle";
import { ICON, ICON_COLOUR, textWidth } from "../src/render/font";
import { GLOSSARY, glossaryEntry, glossaryRows, glossaryText } from "../src/ui/glossary";
import { keywordEntry } from "../src/ui/counterText";
import { runeKeywords } from "../src/ui/runeText";
import { fmtDmg } from "../src/ui/statFormat";
import { textDay } from "../src/ui/fightDay";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { computeView, type View } from "../src/core/io";
import { Arena } from "../src/game/arena";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleLayout, battleScale, laneLayout, type BattleLayout } from "../src/game/battleLayout";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { makeEvent, pickChoice } from "../src/game/events";
import { ghostName } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { SOURCE_OFFLINE, SOURCE_ONLINE } from "../src/game/session";
import type { Game } from "../src/game/game";
import { setupRun } from "../src/tooling";
import { startDusk } from "../src/game/day";
import { battleSeed } from "../src/game/run";
import { maxGoldByDay } from "../src/net/validate";
import { RIVALS } from "../src/sim/rivals";
import { BAR_MIN, ICON_GAP, drawPlate, notePlace, plateRow, plateSource, plateTag, regenMax, regenNow, type PlateInfo } from "../src/screens/battleHud";
import { BattleFaces } from "../src/screens/battleScout";
import { detailsPlan, drawDetails, fittedPanel, fullText } from "../src/screens/build/inspector";
import { panelWords, runeWords } from "../src/screens/build/keywords";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { FoeView, foePartsOnScreen, scoutedFoe } from "../src/screens/build/foeView";
import type { BuildScreen } from "../src/screens/build/build";
import type { Ctx } from "../src/screens/build/actions";
import { DEFAULT_SKIN } from "../src/render/styles";

installRaster();
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const nums = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);
/** glossaryRows(day)'s definition of the row named `word` (the build view's no-piece word tap on that day). */
const dayDef = (word: string, day?: number): string => glossaryRows(day).find((r) => r.word === word)!.def;
/** Today's no-piece taps (cntday2-base: glossaryText(word), day 1's row on every day), pinned byte for byte. */
const TODAY: Readonly<Record<string, string>> = {
  BURN: "EACH {*BURN}: 10 HULL DAMAGE A SEC FOR 3{SEC}. THEY ADD UP, AND {*PLATE} SOAKS THEM.",
  FRAY: "EACH {*FRAY}: EVERY LATER SHOT THAT HITS THE HULL +2 DAMAGE. MAX 15 {FRAY}.",
  SHIELD: "{*PLATE}: SOAKS HULL DAMAGE POINT FOR POINT. MAX 240 {PLATE}. A {*SHIELD} GOES FIRST.",
};
const WORDS = ["BURN", "FRAY", "SHIELD"] as const;

// ---------------------------------------------------------------------------------------------- (a) L1: the badge

const REGEN_COL = ICON_COLOUR[ICON.REGEN];
/** WEAVER's start deck with a MENDING LOOM on each of its three turrets (★1, ★2, ★3: REGEN 10 + 15 + 20) and GREEN THREAD
 *  (REGEN 10): 55 a second in day-1 units. */
function loomDeck(): Build {
  const b = heroStartBuild("weaver", 1);
  b.mods = [...b.mods, { uid: 951, def: "mendingloom", turret: 0 }, { uid: 952, def: "mendingloom", turret: 1, stars: 2 }, { uid: 953, def: "mendingloom", turret: 2, stars: 3 }];
  b.runes = [{ id: "green_thread" }];
  return b;
}
/** A start deck with its belts cut: no turret ever loads, so nothing hits the loom side (wind1's). */
const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });
/** The loom deck against a silent foe, on `day` (the battle screen's own constructor path: Arena(..., run.day)). */
const loomFight = (day?: number): Arena => new Arena(loomDeck(), silent("furnace", 101), 11, null, undefined, undefined, day);

/** wind1's: a view's battle layout (CSS px x DPR), as battle.ts lays it out. */
function layoutOf(w: number, h: number, dpr: number): BattleLayout {
  const pw = w * dpr, ph = h * dpr, portrait = h > w;
  const s = battleScale(pw, ph, portrait);
  return laneLayout(battleLayout(Math.floor(pw / s), Math.floor(ph / s), portrait));
}
const OP = layoutOf(402, 690, 3);
/** drawPlate on `side`'s plate of the op phone: the REGEN badge it drew (REGEN's colour, right-aligned) and what it returns. */
function plate(a: Arena, side: Side = 0): { badge: { s: string; x: number } | null; info: PlateInfo } {
  const r = OP.plates[side];
  rec.text.length = 0;
  const info = drawPlate(G(fresh(r.x + r.w + 4, r.y + r.h + 4)), { t: 0 } as unknown as Game, a, r, side, "WEAVER", "");
  const b = rec.text.filter((c) => c.color === REGEN_COL && c.align === "right");
  expect(b.length, "at most one badge").toBeLessThanOrEqual(1);
  return { badge: b[0] ? { s: b[0].s, x: b[0].x } : null, info };
}
/** Step the fight to its next whole second; the REGEN heal side `side` got in that second (Battle.heal's events). */
function nextSecond(a: Arena, side: Side): number {
  const to = Math.floor(a.b.t + 1e-6) + 1;
  let got = 0;
  while (a.b.t < to - 1e-6) {
    a.b.step();
    for (const e of a.b.drainEvents()) if (e.type === "heal" && e.side === side && e.source === "regen") got += e.amount;
  }
  return got;
}
/** The badge's room for a REGEN of `n` (drawPlate's: its widest number and 3 px). */
const roomOf = (n: number): number => textWidth(`+${fmtDmg(n)}`, "3") + 3;

describe("CNT-DAY2 (a) L1 (stopped, reverted): the plate's REGEN badge stays cntday2-base's", () => {
  it("days 1, 5, 7 and 10, switch on: the badge and its room are today's (regenNow, regenMax); the heal that lands is n x S(d)", () => {
    expect(hullScaleRules(), "0.9.9 ships HULL_SCALE on").toBe(true);
    const out: string[] = [];
    for (const day of [1, 5, 7, 10]) {
      const a = loomFight(day), s0 = a.b.sides[0];
      expect(a.b.scaled, `d${day}: on the day's hull`).toBe(true);
      expect(textDay(a.b)).toBe(day);
      const n = regenNow(a, 0); // day-1 units, as Battle.sustainTick sums them
      expect(n).toBe(10 + 15 + 20 + RUNES.green_thread.amount.n);
      expect(regenMax(a, 0)).toBe(n);
      s0.hull.hp = Math.floor(s0.hull.max / 2); // room to heal: test state on the test's own Battle
      const first = plate(a);
      const seen: number[] = [];
      for (let k = 0; k < 3; k++) {
        const landed = nextSecond(a, 0), p = plate(a);
        seen.push(landed);
        // the heal that lands: the one sum x S(d), rounded down (REGEN sums are multiples of 5 and S(d)'s tenths are even,
        // so the hull's carried remainder never adds a point)
        expect(landed, `d${day}: n x S(d), rounded down`).toBe(sustShown(n, day));
        expect(landed).toBe(Math.floor((n * sustMulTenths(day)) / 10));
        // the badge: cntday2-base's, today's text and room (L1 reverted)
        expect(p.badge?.s, `d${day} second ${k + 1}: today's badge`).toBe(`+${fmtDmg(n)}`);
        expect(p.badge!.x).toBe(p.info.hullBox.x - 3);
        expect(p.info.bar.x + p.info.bar.w, `d${day}: today's room`).toBe(p.badge!.x - roomOf(regenMax(a, 0)));
        expect(p.info.bar, `d${day}: the bar never moves`).toEqual(first.info.bar);
      }
      // a frozen loom pauses (sustainTick): the badge and the heal drop by its share; the bar stays
      const tu = s0.turrets.find((t) => t.regen === 20)!;
      tu.frozen = 5;
      const p = plate(a);
      expect(p.badge?.s, `d${day}: a frozen loom`).toBe(`+${fmtDmg(n - 20)}`);
      expect(nextSecond(a, 0)).toBe(sustShown(n - 20, day));
      expect(p.info.bar).toEqual(first.info.bar);
      tu.frozen = 0;
      out.push(`d${day}: badge ${first.badge?.s} (unchanged); heals landed ${seen.join(", ")} a second (n ${n} x S ${sustMulTenths(day) / 10}); room ${roomOf(n)} px, bar ${first.info.bar.w} px`);
    }
    console.log(`CNTDAY2 (a) the badge beside the heal that lands:\n${out.join("\n")}`);
  });

  it("a real dusk on day 7 (setupRun, its stand-in foe): the badge is today's regenNow", () => {
    const run = setupRun({ hero: "weaver", day: 7, seed: 7 });
    run.build = loomDeck();
    const foe = startDusk(run, []);
    const a = new Arena(run.build, foe.build, battleSeed(run), null, undefined, undefined, run.day);
    expect(textDay(a.b)).toBe(7);
    expect(plate(a).badge?.s).toBe(`+${fmtDmg(regenNow(a, 0))}`);
  });

  it("no day, day 1, or the switch off on day 7: today's text and room, byte for byte", () => {
    const out: string[] = [];
    for (const [label, a] of [["no day", loomFight()], ["day 1", loomFight(1)], ["switch off d7", withHullScale(() => loomFight(7), false)], ["switch off d10", withHullScale(() => loomFight(10), false)]] as const) {
      expect(textDay(a.b) ?? 1, label).toBe(1);
      a.b.sides[0].hull.hp = Math.floor(a.b.sides[0].hull.max / 2);
      const p = plate(a);
      expect(p.badge?.s, `${label}: today's badge`).toBe("+55");
      expect(p.badge?.s).toBe(`+${fmtDmg(regenNow(a, 0))}`); // the base's own expression
      expect(p.info.bar.x + p.info.bar.w, `${label}: today's room`).toBe(p.badge!.x - roomOf(regenMax(a, 0)));
      expect(roomOf(regenMax(a, 0))).toBe(textWidth("+55", "3") + 3);
      expect(nextSecond(a, 0), `${label}: the heal that lands`).toBe(55);
      out.push(`${label}: ${p.badge?.s}, bar ${p.info.bar.w} px`);
    }
    console.log(`CNTDAY2 (a) no day / day 1 / switch off: ${out.join("; ")}`);
  });
});

// ------------------------------------------------------------------------------- (b) L2: the word tap with no piece

/** keywords.tap's FURNACE run (its KILN up column 4) on `day`, a TEMPER (BURN), a BARBED SPOOL (FRAY) and a PLATE BREAKER
 *  (SHIELD) beside the KILN's belt, a SEAM WELDER on turret 0 (its signature core: no bought core) and a DART GUN with a
 *  DRAKE NOZZLE (a bought core) in slot 1. */
function rigged(day: number | undefined): Run {
  const run = newRun("furnace", 5, "cntday2");
  run.day = day as number;
  run.inventory = [];
  const rigs = ["temper", "barbed", "platebreaker"];
  run.build = {
    hero: "furnace", mods: [{ uid: 960, def: "seamwelder", turret: 0 }], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...rigs.map((def, i) => ({ uid: 10 + i, def, x: 3, y: 5 - 2 * i, ...rotField(def, rotFacing(def, 1)) }))],
    routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
  } as Build;
  setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: "dartgun", uid: 700 }]);
  run.build.mods.push({ uid: 961, def: "drake", turret: 1 });
  return run;
}
const BELT: Sel = { kind: "route", index: 0 };
const SIG: Sel = { kind: "turret", index: 0 };
const DRAKE: Sel = { kind: "turret", index: 1 };
/** The no-piece taps glossaryText made for BURN, FRAY and SHIELD since `from`: word -> what a tap shows (each the same). */
function taps(from: number, piece?: string): Map<string, string | undefined> {
  const m = new Map<string, string | undefined>();
  for (const c of rec.gloss.slice(from)) {
    if (!(WORDS as readonly string[]).includes(c.word) || c.def !== piece) continue;
    if (m.has(c.word)) expect(c.out, `${c.word}: one text`).toBe(m.get(c.word));
    m.set(c.word, c.out);
  }
  return m;
}

/** keywords.tap's phone view and its finger's panel (zoom's opened), and drawDetails on a raster: the real build path. */
function screen(w: number, h: number, dpr: number): { v: View; L: BuildLayout } {
  const v = computeView(w, h, dpr, buildScale);
  return { v, L: buildLayout(v.W, v.H, v.portrait, 5, true) };
}
const TOUCH = { touch: true, hover: false, busy: false };
function drawn(run: Run, sel: Sel): void {
  const { v, L } = screen(402, 690, 3);
  const ctx = { game: { ui: new UI(), t: 0, view: v }, run, touch: true, L } as unknown as Ctx;
  const area = panelArea(L, sel, TOUCH, (r) => { const d = detailsPlan(ctx, sel, null, r); return d ? fullText(d.plan) : null; });
  const ui = (ctx.game as unknown as { ui: UI }).ui;
  ui.begin();
  drawDetails(G(fresh(v.W, v.H)), ctx, sel, null, area, {} as DuskFoe);
  ui.end();
}

describe("CNT-DAY2 (b) L2: a word tap with no piece reads the panel's day", () => {
  it("the build screen, run.day 7: BURN, FRAY and SHIELD on a belt's panel, SHIELD on a signature-core turret, read glossaryRows(7)", () => {
    const run = rigged(7);
    let at = rec.gloss.length;
    drawn(run, BELT);
    const belt = taps(at);
    expect([...belt.keys()].sort(), "the belt's panel names all three").toEqual(["BURN", "FRAY", "SHIELD"]);
    for (const w of WORDS) {
      expect(belt.get(w), `belt ${w}`).toBe(dayDef(w, 7));
      expect(belt.get(w), `belt ${w}: not day 1's`).not.toBe(TODAY[w]);
    }
    expect(rec.gloss.slice(at).filter((c) => c.def === undefined).every((c) => c.day === 7), "every no-piece tap gets run.day").toBe(true);
    at = rec.gloss.length;
    drawn(run, SIG);
    const sig = taps(at);
    // a turret with its signature core names SHIELD (SEAM WELDER's line); no turret, core or gear names BURN or FRAY there
    expect(sig.get("SHIELD"), "signature-core turret SHIELD").toBe(dayDef("SHIELD", 7));
    expect(nums(sig.get("SHIELD")!)).toContain(sustShown(PLATE_CAP, 7));
    // the pure path: the same planned targets with the day (keywordTargets' `day`), and panelWords
    const words = panelWords(fittedOrBody(run, BELT), null, 7);
    for (const w of WORDS) expect(words.find((q) => q.word === w)?.text, `panelWords ${w}`).toBe(dayDef(w, 7));
  });

  it("VIEW BATTLEFIELD's face of a day-7 fight: the belt's and the signature-core turret's taps read day 7; no day or the switch off: today's", () => {
    const b = rigged(7).build;
    const game = fakeGame(402, 690, 3);
    const L = laneLayout(battleLayout(game.W, game.H, game.portrait));
    const read = (a: Arena, sel: Sel): Map<string, string | undefined> => {
      const faces = new BattleFaces();
      faces.open = { side: 0, sel: sel as never };
      const at = rec.gloss.length;
      faces.draw(G(fresh(game.W, game.H)), game, a, L, true);
      expect(faces.last, "the face drew").toBeTruthy();
      return taps(at);
    };
    const a7 = new Arena(b, silent("bastion", 101), 9, null, undefined, undefined, 7);
    expect(textDay(a7.b)).toBe(7);
    const belt = read(a7, BELT), sig = read(a7, SIG);
    for (const w of WORDS) expect(belt.get(w), `face belt ${w}`).toBe(dayDef(w, 7));
    expect(sig.get("SHIELD")).toBe(dayDef("SHIELD", 7));
    // the counters' panels in the same fight say the same (CNT-DAY's keywordEntry on the fight's day)
    expect(belt.get("BURN")).toBe(keywordEntry("BURN", "", textDay(a7.b))!.body);
    expect(belt.get("FRAY")).toBe(keywordEntry("FRAY", "", textDay(a7.b))!.body);
    expect(belt.get("SHIELD")).toBe(keywordEntry("PLATE", "", textDay(a7.b))!.body);
    for (const [label, a] of [["no day", new Arena(b, silent("bastion", 101), 9, null)], ["switch off", withHullScale(() => new Arena(b, silent("bastion", 101), 9, null, undefined, undefined, 7), false)]] as const) {
      expect(textDay(a.b), label).toBeUndefined();
      const t = read(a, BELT);
      for (const w of WORDS) expect(t.get(w), `${label} ${w}`).toBe(TODAY[w]);
      expect(read(a, SIG).get("SHIELD"), `${label} SHIELD`).toBe(TODAY.SHIELD);
    }
  });

  it("the scouted foe (FoeView, run.day 7): a signature-core turret's SHIELD and a belt's BURN equal the counters' panels on day 7", () => {
    vi.stubGlobal("localStorage", new MapStore());
    const run = scoutRun(7);
    const foe = scoutedFoe(run)!;
    expect(foe, "the SCOUT stop's SPY revealed tonight's foe").not.toBeNull();
    foe.build = rigged(7).build; // the test's own deck for tonight's foe (the stand-in pool may be regenerated)
    const { L, view } = framed(402, 690, 3);
    const game = { view, ui: new UI(), canvas: fresh(L.W, L.H), t: 0, W: L.W, H: L.H } as unknown as Game;
    const s = { run, L, game, t: 0, foe, note: () => null, modalUp: () => false } as unknown as BuildScreen;
    const v = new FoeView();
    v.show();
    const seen = new Map<string, Map<string, string | undefined>>();
    for (const p of foePartsOnScreen(L, foe)) {
      v.faces.open = { side: 1, sel: p.sel };
      const at = rec.gloss.length;
      v.draw(G(fresh(L.W, L.H)), s);
      seen.set(JSON.stringify(p.sel), taps(at));
      // the bought core's taps (DRAKE NOZZLE's BURN) read the day through the piece, as before this fix
      if (p.sel.kind === "turret" && p.sel.index === 1) expect(taps(at, "drake").get("BURN"), "DRAKE NOZZLE's BURN").toBe(keywordEntry("BURN", "", 7)!.body);
    }
    const sig = seen.get(JSON.stringify(SIG))!, belt = seen.get(JSON.stringify(BELT))!;
    expect(sig.get("SHIELD"), "the scouted signature-core turret's SHIELD").toBe(keywordEntry("PLATE", "", 7)!.body);
    expect(belt.get("BURN"), "the scouted belt's BURN").toBe(keywordEntry("BURN", "", 7)!.body);
    expect(belt.get("FRAY")).toBe(keywordEntry("FRAY", "", 7)!.body);
    expect(belt.get("SHIELD")).toBe(keywordEntry("PLATE", "", 7)!.body);
  });

  it("no day, day 1, or the switch off: glossaryText and the panels' no-piece taps are today's, byte for byte", () => {
    for (const r of GLOSSARY) {
      const today = glossaryText(r.word);
      expect(glossaryText(r.word, undefined, undefined), r.word).toBe(today);
      expect(glossaryText(r.word, undefined, 1), `${r.word} d1`).toBe(today);
      // the switch off: today's text with the switch off (DARK WIND's row has its own switch-off words)
      for (const day of [5, 7, 10]) withHullScale(() => expect(glossaryText(r.word, undefined, day), `${r.word} off d${day}`).toBe(glossaryText(r.word)), false);
    }
    for (const w of WORDS) expect(glossaryText(w), w).toBe(TODAY[w]);
    // the build screen's belt panel on a run with no day: the taps are today's
    const at = rec.gloss.length;
    drawn(rigged(undefined), BELT);
    const t = taps(at);
    for (const w of WORDS) expect(t.get(w), `no day ${w}`).toBe(TODAY[w]);
    // a piece's own day still comes first (panelPiece's o.day); a piece with no day takes the panel's
    const piece = { def: "temper", stars: 1, o: { day: 5 } };
    expect(glossaryText("BURN", piece, 7)).toBe(glossaryText("BURN", piece));
    expect(glossaryText("BURN", { def: "temper", stars: 1 }, 7)).toBe(glossaryText("BURN", { def: "temper", stars: 1, o: { day: 7 } }));
    expect(glossaryText("BURN", { def: "temper", stars: 1 })).toBe(glossaryText("BURN", { def: "temper", stars: 1 }, undefined));
    // keywordTargets and panelWords with no day: today's (the same JSON as before the parameter)
    const body = fittedOrBody(rigged(7), BELT);
    expect(JSON.stringify(panelWords(body, null, undefined))).toBe(JSON.stringify(panelWords(body, null)));
    const words = panelWords(body, null);
    for (const w of WORDS) expect(words.find((q) => q.word === w)?.text, `panelWords ${w}`).toBe(TODAY[w]);
  });

  it("the sweep: runeWords (the ⓘ view's rune keywords) and fittedPanel read the run's day; no day or the switch off: as before", () => {
    const kw = (k: string) => Object.values(RUNES).find((d) => (runeKeywords(d) as string[]).includes(k))!;
    const burn = kw("BURN"), fray = kw("FRAY");
    expect(burn && fray, "runes with BURN and FRAY").toBeTruthy();
    const run = rigged(7);
    run.build.runes = [{ id: burn.id }, { id: fray.id }];
    const w7 = runeWords(run);
    for (const w of ["BURN", "FRAY"]) expect(w7.find((q) => q.word === w)?.text, `runeWords d7 ${w}`).toBe(dayDef(w, 7));
    const plainRun = { ...run, day: undefined } as unknown as Run;
    for (const [label, ws] of [["no day", runeWords(plainRun)], ["switch off", withHullScale(() => runeWords(run), false)]] as const) {
      for (const q of ws) expect(q.text, `${label} ${q.word}`).toBe(glossaryEntry(q.word)!.def);
      expect(ws.find((q) => q.word === "BURN")?.text, `${label} BURN`).toBe(TODAY.BURN);
    }
    // fittedPanel: a fitted SALVO RACK's line on run.day 7 is x D(7); with no day, today's
    const fr = rigged(7);
    fr.build.mods.push({ uid: 970, def: "salvo", turret: 0 });
    const plus = (r: Run): number => Number(/AT \+(\d+)/.exec(fittedPanel(r, 970)!.body.map((b) => b.text).join(" "))![1]);
    const none = { ...fr, day: undefined } as unknown as Run;
    expect(plus(none), "today's SALVO RACK").toBe(20);
    expect(plus(fr)).toBe(dmgShown(20, 7));
    expect(withHullScale(() => plus(fr), false)).toBe(20);
  });
});

/** The planned body of a selection's panel on the op phone (for the pure panelWords checks). */
function fittedOrBody(run: Run, sel: Sel) {
  const { v, L } = screen(402, 690, 3);
  const ctx = { game: { ui: new UI(), t: 0, view: v }, run, touch: true, L } as unknown as Ctx;
  return detailsPlan(ctx, sel, null, L.info)!.t.body;
}

// ------------------------------------------------------------------------------------------- the stand-ins (CNT-DAY's)

const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
/** scout1.flow's stand-in Game: a view at DPR, a UI and a raster canvas. */
function fakeGame(w: number, h: number, dpr: number): Game {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  return { audio: new Proxy({}, { get: () => () => undefined }), view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fresh(view.W, view.H) } as unknown as Game;
}
/** localStorage as a Map (scout1c.foe's). */
class MapStore {
  m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}
/** scout1c.foe's: a run on `day` at its road's SCOUT stop with SPY picked (tonight's deck revealed), then in REFIT. */
function scoutRun(day: number, seed = 4242): Run {
  const run = newRun("furnace", seed);
  run.day = day;
  run.gold = 9;
  run.event = makeEvent(run.seed, run.day, "scout");
  run.stage = "event";
  expect(pickChoice(run, 2).ok).toBe(true);
  run.stage = "refit";
  return run;
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** scout1c.foe's framed(): the build screen's layout on a w x h view at dpr. */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5): { L: BuildLayout; view: { scale: number; dpr: number } } {
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
  const Z = lay(1).cam.z;
  return { L: lay(gcd(S, Z)), view: v };
}

// ------------------------------------------------------------------------------------------------- (c) L1's fit

describe("CNT-DAY2 (c) L1's fit: day 10's largest REGEN on the phone, a landscape phone and the desk", () => {
  it("the badge's room takes its width from the bar only: every other part keeps its place and form, the badge shows", () => {
    // the bound: the most turret slots a hull has (HULL_SLOTS), one MENDING LOOM a turret (validate.ts: never two copies of
    // one gear def on a turret; gearStats keeps one), at ★3; plus GREEN THREAD (no rune is held twice; the one REGEN rune)
    const slots = Math.max(...Object.values(HULL_SLOTS).map((s) => s.length));
    const loom3 = effectAt("mendingloom", 3).mod!.regen!;
    expect(Object.values(ITEMS).filter((d) => d.mod?.regen).map((d) => d.id), "the one REGEN gear").toEqual(["mendingloom"]);
    expect(Object.values(RUNES).filter((d) => d.kind === "regen").map((d) => d.id), "the one REGEN rune").toEqual(["green_thread"]);
    const most = slots * loom3 + RUNES.green_thread.amount.n, day = 10;
    const dayMost = sustShown(most, day);
    expect([slots, loom3, most], "4 slots x 20 + 10").toEqual([4, 20, 90]);
    const roomBefore = roomOf(most), roomAfter = roomOf(dayMost);
    // the widest figures the plate draws: a 5-digit hull (a day-10 hull stays under 100000: below) in each face's widest
    // digit, SHIELD's number at its day-10 cap's digits in the widest, WARD's 3 pips with their count
    const widest = (font: "3" | "5"): string => [..."9876543210"].sort((p, q) => textWidth(q, font) - textWidth(p, font))[0];
    const maxBase = Math.max(...Object.values(HEROES).map((h) => h.hull));
    const hullRunes = Object.values(RUNES).filter((d) => d.kind === "hull").reduce((n, d) => n + d.amount.n, 0);
    const pack = ITEMS.plating.supply!.hull!, packPrice = ITEMS.plating.price;
    const hullBound = sustMulTenths(day) * (maxBase + pack * Math.floor((maxGoldByDay(day) + 100) / packPrice) + hullRunes) / 10;
    expect(hullBound, "a day-10 hull has at most 5 digits").toBeLessThan(100000);
    const hp = Number(widest("5").repeat(5)), max = Number(widest("3").repeat(5));
    const plateNum = Number(widest("3").repeat(String(sustShown(PLATE_CAP, day)).length));
    // each name a plate draws, with its tag, and the REGEN its own hero's build can hold (any hero may hold GREEN THREAD:
    // runeFits only weighs a dawn's redraw): yours, your hero's name; the foe's, a ghost's (ONLINE, its hero's), a stand-in's
    // (OFFLINE, its hero's), a warlord's (its hero's); in the plate (phones) as plateSource makes it, or the whole name (the
    // desk's row above the plate)
    const bound = (hero: HeroId): number => HULL_SLOTS[hero].length * loom3 + RUNES.green_thread.amount.n;
    const lead = (name: string, tag?: string): number => (tag ? textWidth(plateTag(tag), "3") + 4 : 0) + textWidth(name, "3");
    type Cand = { who: string; name: string; note?: string; regen: number };
    const yours: Cand[] = (Object.keys(HEROES) as HeroId[]).map((h) => ({ who: h, name: HEROES[h].name, regen: bound(h) }));
    const foes: Cand[] = [];
    for (const hero of Object.keys(HEROES) as HeroId[]) for (let wins = 0; wins <= 10; wins++) for (let lives = 1; lives <= 10; lives++) foes.push({ who: `ghost ${hero}`, name: ghostName({ hero, wins, lives }), note: SOURCE_ONLINE, regen: bound(hero) });
    const seenIns = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) for (let d = 1; d <= 10; d++) {
      const f = standInFoe(seed, d);
      if (!seenIns.has(f.name)) { seenIns.add(f.name); foes.push({ who: `stand-in ${f.hero}`, name: f.name, note: SOURCE_OFFLINE, regen: bound(f.hero) }); }
    }
    for (const rv of Object.values(RIVALS)) foes.push({ who: `warlord ${rv.hero}`, name: rv.name, regen: bound(rv.hero) });
    const plateW = textWidth(ICON.PLATE, "3") + ICON_GAP + textWidth(fmtDmg(plateNum), "3");
    const table: string[] = [], fails: string[] = [], worst: string[] = [];
    for (const [nm, w, h, dpr] of [["phone 402x690", 402, 690, 3], ["landscape 844x390", 844, 390, 3], ["desk 1920x1080", 1920, 1080, 1]] as const) {
      const L = layoutOf(w, h, dpr), inPlate = notePlace(L) === "plate";
      for (const side of [0, 1] as Side[]) {
        const r = L.plates[side], tag = `${nm} ${side ? "foe" : "you"}`;
        const row = (ld: number, regenRoom: number) => plateRow({ x: r.x, y: r.y, w: r.w, h: r.h, lead: ld, hp, max, shield: SHIELD_CAP, regenRoom, plate: plateNum });
        const leadOf = (c: Cand): number => { if (side === 0) return lead(c.name); const s = c.note ? plateSource(c.name, c.note) : { name: c.name, tag: undefined }; return inPlate ? lead(s.name, s.tag) : lead(c.name); };
        let least: { c: Cand; ld: number; bar: number; before: number; form: string } | null = null;
        for (const c of side === 0 ? yours : foes) {
          const ld = leadOf(c), rb = roomOf(c.regen), ra = roomOf(sustShown(c.regen, day));
          const before = row(ld, rb), after = row(ld, ra), d = ra - rb, badge = `+${fmtDmg(sustShown(c.regen, day))}`;
          const form = `/max ${after.max ? "yes" : "no"}, pips ${after.shield?.pips ? "yes" : "no"}`;
          const ok = after.regenX !== null && before.regenX !== null
            && JSON.stringify([after.max, after.shield?.pips, after.hullX, after.regenX, after.bar.x]) === JSON.stringify([before.max, before.shield?.pips, before.hullX, before.regenX, before.bar.x])
            && after.bar.w === before.bar.w - d && after.plate!.x === before.plate!.x - d && after.bar.w >= BAR_MIN
            && after.bar.x + after.bar.w + 3 <= after.plate!.x && after.plate!.x + plateW + 3 <= after.regenX! - textWidth(badge, "3") && after.regenX! <= after.hullX - 3;
          if (!ok) fails.push(`${tag} ${c.who} "${c.name}" (lead ${ld}, REGEN ${c.regen} -> ${sustShown(c.regen, day)}): before /max ${before.max ? "yes" : "no"} pips ${before.shield?.pips ? "yes" : "no"} bar ${before.bar.w}; after ${form} bar ${after.bar.w} badge ${after.regenX === null ? "DROPPED" : "shown"}`);
          if (!least || after.bar.w < least.bar) least = { c, ld, bar: after.bar.w, before: before.bar.w, form };
        }
        if (least) table.push(`${tag}: plate ${r.w}x${r.h}; least bar: ${least.c.who} "${least.c.name}" lead ${least.ld} px, REGEN ${least.c.regen} -> ${sustShown(least.c.regen, day)} (room ${roomOf(least.c.regen)} -> ${roomOf(sustShown(least.c.regen, day))} px), ${least.form}, bar ${least.before} -> ${least.bar} px (BAR_MIN ${BAR_MIN})`);
        // the brief's independent worst (the longest name with the most REGEN any build holds), reported, not a real build
        const ldMax = Math.max(...(side === 0 ? yours : foes).map(leadOf)), b0 = row(ldMax, roomBefore), b1 = row(ldMax, roomAfter);
        worst.push(`${tag}: lead ${ldMax} px with REGEN ${most} -> ${dayMost}: before /max ${b0.max ? "yes" : "no"} pips ${b0.shield?.pips ? "yes" : "no"} bar ${b0.bar.w}; after /max ${b1.max ? "yes" : "no"} pips ${b1.shield?.pips ? "yes" : "no"} bar ${b1.bar.w} badge ${b1.regenX === null ? "DROPPED" : "shown"}`);
      }
    }
    // the sweep: every name above with its own REGEN, a day-10 hull (its hero's bare max hullAt(base, 10) at full, the
    // widest 5 digits, a hurt hull of 4 and 3 digits under the widest max), WARD's pips or none, SHIELD's number at the
    // day-10 cap or none: where does the day's badge change the plate's form (the day-1 badge's form kept, or not)?
    const changed: string[] = [];
    let cases = 0, shownBoth = 0;
    for (const [nm, w, h, dpr] of [["phone 402x690", 402, 690, 3], ["landscape 844x390", 844, 390, 3], ["desk 1920x1080", 1920, 1080, 1]] as const) {
      const L = layoutOf(w, h, dpr), inPlate = notePlace(L) === "plate";
      for (const side of [0, 1] as Side[]) {
        const r = L.plates[side];
        const seenLead = new Set<string>();
        for (const c of side === 0 ? yours : foes) {
          const s = side === 1 && c.note && inPlate ? plateSource(c.name, c.note) : { name: c.name, tag: undefined as string | undefined };
          const ld = lead(s.name, s.tag), key = `${ld}:${c.regen}`;
          if (seenLead.has(key)) continue;
          seenLead.add(key);
          const heroOf = (c.who.split(" ").pop() as HeroId) in HEROES ? (c.who.split(" ").pop() as HeroId) : "weaver";
          const bare = sustMulTenths(day) * HEROES[heroOf].hull / 10;
          for (const [hpN, maxN] of [[bare, bare], [hp, max], [9999, max], [999, max]]) for (const sh of [null, SHIELD_CAP]) for (const pl of [null, sustShown(PLATE_CAP, day)]) {
            const rowAt = (room: number) => plateRow({ x: r.x, y: r.y, w: r.w, h: r.h, lead: ld, hp: hpN, max: maxN, shield: sh, regenRoom: room, plate: pl });
            const b0 = rowAt(roomOf(c.regen)), b1 = rowAt(roomOf(sustShown(c.regen, day)));
            cases++;
            const form = (q: typeof b0) => `/max ${q.max ? "yes" : "no"} pips ${q.shield ? (q.shield.pips ? "yes" : "no") : "-"} badge ${q.regenX === null ? "no" : "yes"}`;
            if (b0.regenX !== null && b1.regenX !== null && form(b0) === form(b1)) shownBoth++;
            if (form(b0) !== form(b1)) changed.push(`${nm} ${side ? "foe" : "you"} ${c.who} "${s.tag ? `${s.tag} · ` : ""}${s.name}" hull ${hpN}/${maxN} WARD ${sh ?? "-"} SHIELD ${pl ?? "-"} REGEN +${c.regen} -> +${sustShown(c.regen, day)}: ${form(b0)} (bar ${b0.bar.w}) -> ${form(b1)} (bar ${b1.bar.w})`);
          }
        }
      }
    }
    console.log(`CNTDAY2 (c) the fit, day 10 (hull ${hp}/${max}, bound ${hullBound}; SHIELD ${plateNum}; WARD ${SHIELD_CAP} pips), each build's own REGEN:\n${table.join("\n")}\nthe independent worst (not one build):\n${worst.join("\n")}\nthe worst case's plates that don't keep the badge in its form (${fails.length}; e.g.):\n${fails.slice(0, 12).join("\n")}\nthe sweep: ${cases} plates, ${shownBoth} keep their form with the badge shown, ${changed.length} change form:\n${changed.join("\n")}`);
    // why L1 stopped (BRIEF-CNTDAY2 step 1): the brief's worst case can't hold a badge even at the base (every view, both
    // plates: a 5-digit hull, WARD's pips, SHIELD's number), and on real day-10 plates the day's wider badge would take its
    // room from /max, the pips or the badge itself, not from the bar alone
    expect(worst.every((s) => s.endsWith("badge DROPPED")), "the brief's worst case drops the badge at the base").toBe(true);
    expect(changed.length, "real day-10 plates whose form the day's badge would change").toBeGreaterThan(0);
    expect(changed.some((s) => / badge yes \(bar \d+\) -> .* badge no /.test(s)), "a badge that shows at the base would drop").toBe(true);
  });
});
