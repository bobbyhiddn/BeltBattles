// CNT-DAY (REQ-BFG-100, REQ-BFG-082; REQ-BFG-079; BRIEF-CNTDAY step 6): the battle view's tap texts on the fight's day.
// With HULL_SCALE on, a fight on day d deals damage x D(d) and caps the soak layer's pool at PLATE_CAP x S(d), so the
// counters' panels (COUNT-1, PAIR-CUE) and VIEW BATTLEFIELD's faces show that day's numbers: the day the Battle was built
// with on the day's hull (ui/fightDay.ts textDay), none on a fight without it. Everything is built here: the heroes' start
// decks (a SALVO RACK fitted for a turret with a damage number), set-up runs, a scouted foe; never fights.json and never a
// par deck (the release lane's S8 regeneration may move them).
//  (a) keywordEntry (BURN, FRAY, PLATE, SHIELD, STUN) and pairEntry, switch on, days 1-10: the body is the build view's
//      no-piece word tap on that day (glossaryRows(day)'s row); BURN's, FRAY's and PLATE's numbers are faces.ts REMINDER's
//      inside shownOn(day); no day, day 1 or the switch off: today's text, byte for byte (pinned).
//  (b) BattleCounters.entries on a dusk built on day 7 (and 10), switch on: the BURN, FRAY and SHIELD entries carry the
//      day's numbers (SHIELD's MAX is the plating strip's own max), the panel's box holds the day's lines; the same builds
//      without a day, or built with the switch off: day 1's.
//  (c) faceText for a turret (SALVO RACK fitted) and an item (KILN) on the day-7 fight's build: the build screen's own
//      panel's numbers for that build with run.day = 7; VIEW BATTLEFIELD's draw passes the fight's day; no day: today's
//      text, byte for byte.
//  (d) the scouted foe on the build screen (FoeView.draw) reads the run's day.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BURN_DPS, FRAY_BONUS, type HeroId } from "../src/sim/content";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { dmgShown, hullScaleRules, sustShown, withHullScale } from "../src/sim/hullScale";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { KeywordName } from "../src/render/font";
import { keywordEntry, keywordRow, pairEntry, type CounterEntry } from "../src/ui/counterText";
import { glossaryRows, glossaryText } from "../src/ui/glossary";
import { REMINDER } from "../src/ui/faces";
import { shownOn } from "../src/ui/dayShown";
import { fmtDmg } from "../src/ui/statFormat";
import { textDay } from "../src/ui/fightDay";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { Arena } from "../src/game/arena";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleLayout, battleScale, laneLayout } from "../src/game/battleLayout";
import { newRun, type Run } from "../src/game/run";
import { makeEvent, pickChoice } from "../src/game/events";
import type { Game } from "../src/game/game";
import { setupRun } from "../src/tooling";
import { BattleScreen } from "../src/screens/battle";
import { BattleCounters, PANEL_W } from "../src/screens/battleCounters";
import { platingMax, type PlateInfo } from "../src/screens/battleHud";
import { BattleFaces, faceRun, faceText, readOnlyBlock, type PartSel } from "../src/screens/battleScout";
import { explainPanel, itemPanel, turretPanel, type Block, type PanelText } from "../src/screens/build/inspector";
import { DEFAULT_SKIN } from "../src/render/styles";
import { definitionLines } from "../src/screens/build/keywords";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, type BuildLayout } from "../src/screens/build/layout";
import { FoeView, foePartsOnScreen, scoutedFoe } from "../src/screens/build/foeView";
import type { BuildScreen } from "../src/screens/build/build";
import { fakeCanvas, fakeDom } from "./pair1.helpers";

let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const KWS: readonly KeywordName[] = ["BURN", "FRAY", "PLATE", "SHIELD", "STUN"];
/** Today's bodies (cntday-base: keywordEntry read glossaryText(row.word), day 1's row), pinned byte for byte. */
const TODAY: Readonly<Record<string, string>> = {
  BURN: "EACH {*BURN}: 10 HULL DAMAGE A SEC FOR 3{SEC}. THEY ADD UP, AND {*PLATE} SOAKS THEM.",
  FRAY: "EACH {*FRAY}: EVERY LATER SHOT THAT HITS THE HULL +2 DAMAGE. MAX 15 {FRAY}.",
  PLATE: "{*PLATE}: SOAKS HULL DAMAGE POINT FOR POINT. MAX 240 {PLATE}. A {*SHIELD} GOES FIRST.",
  SHIELD: "{*SHIELD}: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS. MAX 3 {SHIELD}. {*BURN} GOES PAST IT.",
  STUN: "{*STUN}: THE ENEMY PART IT HITS STOPS FOR A WHILE. THE HULL ITSELF NEVER STOPS.",
  PAIR: "{*PAIR}: TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE.",
};
/** The build view's no-piece word tap for face keyword `kw` on `day`: that day's glossary row (glossaryRows(day)). */
const dayRow = (kw: KeywordName, day?: number): string => glossaryRows(day).find((r) => r.kw === kw)!.def;
/** The number a keyword's reminder prints on `day` (faces.ts REMINDER's own expression, inside shownOn). */
const dayNumber: Partial<Record<KeywordName, (day?: number) => string>> = {
  BURN: (d) => `EACH {*BURN}: ${fmtDmg(dmgShown(BURN_DPS, d))} HULL DAMAGE A SEC`,
  FRAY: (d) => `HULL +${fmtDmg(dmgShown(FRAY_BONUS, d))} DAMAGE.`,
  PLATE: (d) => `MAX ${fmtDmg(sustShown(PLATE_CAP, d))} {PLATE}.`,
};
const nums = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);

describe("CNT-DAY (a): the counters' reminders on the fight's day", () => {
  it("switch on, days 1-10: each body is the build view's no-piece word tap on that day, with REMINDER's numbers", () => {
    expect(hullScaleRules(), "0.9.9 ships HULL_SCALE on").toBe(true);
    const rows: string[] = [];
    withHullScale(() => {
      for (const day of DAYS) {
        for (const kw of KWS) {
          const e = keywordEntry(kw, "5", day)!, row = keywordRow(kw)!;
          expect({ word: e.word, colour: e.colour, count: e.count }, `${kw} d${day}: the head`).toEqual({ word: row.word, colour: row.colour, count: "5" });
          expect(e.body, `${kw} d${day}`).toBe(dayRow(kw, day));
          // REMINDER's own text inside shownOn(day) leads the row (its extra sentence after it): BURN, FRAY, the soak
          // layer and the block (STUN's row is the glossary's own number-free sentence)
          if (kw !== "STUN") expect(e.body.startsWith(shownOn(day, () => REMINDER[kw]())), `${kw} d${day}: REMINDER inside shownOn`).toBe(true);
          const n = dayNumber[kw];
          if (n) expect(e.body, `${kw} d${day}: its number`).toContain(n(day));
        }
        expect(pairEntry(day)!.body, `PAIR d${day}`).toBe(dayRow("PAIR", day));
        rows.push(`d${day}: BURN ${nums(keywordEntry("BURN", "", day)!.body)[0]}, FRAY +${nums(keywordEntry("FRAY", "", day)!.body)[0]}, SHIELD MAX ${nums(keywordEntry("PLATE", "", day)!.body)[0]}`);
      }
    }, true);
    // not vacuous: day 10's numbers are above day 1's
    expect(nums(keywordEntry("BURN", "", 10)!.body)[0]).toBeGreaterThan(nums(TODAY.BURN)[0]);
    expect(nums(keywordEntry("FRAY", "", 10)!.body)[0]).toBeGreaterThan(nums(TODAY.FRAY)[0]);
    expect(nums(keywordEntry("PLATE", "", 10)!.body)[0]).toBeGreaterThan(nums(TODAY.PLATE)[0]);
    console.log(`CNTDAY (a) the panels' numbers, switch on:\n${rows.join("\n")}`);
  });

  it("no day, day 1, or the switch off on any day: today's text, byte for byte", () => {
    for (const kw of [...KWS, "PAIR"] as KeywordName[]) {
      const today = TODAY[kw];
      expect(keywordEntry(kw, "7")!.body, `${kw}: no day`).toBe(today);
      expect(keywordEntry(kw, "7", undefined)!.body, `${kw}: undefined`).toBe(today);
      expect(keywordEntry(kw, "7", 1)!.body, `${kw}: day 1`).toBe(today);
      // the build view's no-piece tap as it reads today (glossaryText, day 1's row)
      expect(glossaryText(keywordRow(kw)!.word), `${kw}: glossaryText`).toBe(today);
      for (const day of DAYS) expect(withHullScale(() => keywordEntry(kw, "7", day)!.body, false), `${kw}: switch off, d${day}`).toBe(today);
    }
    expect(pairEntry()!.body).toBe(TODAY.PAIR);
    expect(pairEntry(9)!.body).toBe(TODAY.PAIR); // PAIR's reminder holds no number
    // the entry's other fields never move with the day
    for (const kw of KWS) for (const day of DAYS) {
      const a = keywordEntry(kw, "3/15", day)!, b = keywordEntry(kw, "3/15")!;
      expect({ ...a, body: "" }, `${kw} d${day}`).toEqual({ ...b, body: "" });
    }
  });
});

// ------------------------------------------------------------------------------------------- a dusk on the day's hull

const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
/** scout1.flow's stand-in Game: the run, a silent audio, a 402x690 phone's view at DPR 3, a UI and a recording canvas. */
function fakeGame(run: Run, w = 402, h = 690, dpr = 3): Game {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silent = new Proxy({}, { get: () => () => undefined });
  const g = { run, audio: silent, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fakeCanvas() } as unknown as Game;
  (g as unknown as { go: (s: unknown) => void }).go = () => undefined;
  return g;
}
/** A dusk set up on `day` (the battle screen's own arena: Arena(..., run.day)), your `hero`'s start deck with `fit`. */
function dusk(day: number, hero: HeroId = "furnace", fit?: (b: Build) => void, seed = 7): { game: Game; s: BattleScreen; run: Run } {
  const run = setupRun({ hero, day, seed });
  fit?.(run.build);
  const game = fakeGame(run);
  return { game, s: new BattleScreen(game), run };
}
/** The same two builds (the record's), fought with no day; or on `day` with the switch off. */
const noDay = (a: Arena): Arena => new Arena(a.b.record.builds[0], a.b.record.builds[1], a.b.record.seed, null);
const switchOff = (a: Arena, day: number): Arena => withHullScale(() => new Arena(a.b.record.builds[0], a.b.record.builds[1], a.b.record.seed, null, undefined, undefined, day), false);

type Grp = { id: string; kind: "plate" | "gun" | "belt"; side: 0 | 1; ref: number; anchor: { x: number; y: number; w: number; h: number }; target: { x: number; y: number; w: number; h: number } };
type Priv = { entries: (g: Grp, a: Arena, rows: readonly (PlateInfo | null)[]) => CounterEntry[]; groups: Grp[] };
const plateGroup = (side: 0 | 1): Grp => ({ id: `cnt:plate${side}`, kind: "plate", side, ref: side, anchor: { x: 60, y: 20, w: 90, h: 14 }, target: { x: 60, y: 20, w: 90, h: 44 } });
/** The foe's hull with BURN and FRAY on it and a part stunned (test state on a test's own Battle), and a plate row with
 *  the soak layer's and the block's counts (C3, C4), as drawPlate returns them. */
function loadFoe(a: Arena): (PlateInfo | null)[] {
  const s = a.b.sides[1];
  s.hull.burns.push({ dps: 3, t: 2 });
  s.hull.fray = 6;
  if (s.turrets[0]) s.turrets[0].disrupted = 1;
  return [null, { plate: "120", shield: "2" } as PlateInfo];
}
const entriesOf = (a: Arena, rows: readonly (PlateInfo | null)[]): CounterEntry[] => (new BattleCounters() as unknown as Priv).entries(plateGroup(1), a, rows);
const byKw = (es: CounterEntry[]) => Object.fromEntries(es.map((e) => [KWS.find((k) => keywordRow(k)!.word === e.word)!, e]));

describe("CNT-DAY (b): the counters' panels on a fight on the day's hull", () => {
  it("a dusk on day 7 and day 10: BURN, FRAY and SHIELD carry the day's numbers (SHIELD's MAX is the strip's own); no day: day 1's", () => {
    const out: string[] = [];
    for (const day of [7, 10]) {
      const { s } = dusk(day, "bastion");
      const a = s.arena;
      expect(a.b.scaled, `d${day}: the dusk is on the day's hull`).toBe(true);
      expect(textDay(a.b)).toBe(day);
      const rows = loadFoe(a);
      const got = byKw(entriesOf(a, rows));
      expect(Object.keys(got).sort(), `d${day}: the panel's keywords`).toEqual(["BURN", "FRAY", "PLATE", "SHIELD", "STUN"]);
      for (const kw of KWS) expect(got[kw].body, `d${day} ${kw}`).toBe(dayRow(kw, day));
      expect(got.BURN.body).toContain(dayNumber.BURN!(day));
      expect(got.FRAY.body).toContain(dayNumber.FRAY!(day));
      expect(got.PLATE.body).toContain(dayNumber.PLATE!(day));
      // the panel's MAX is the plating strip's own full width (battleHud.ts platingMax: the pool's cap on the day)
      expect(nums(got.PLATE.body)[0], `d${day}: SHIELD's MAX = the strip's`).toBe(platingMax(a.b.sides[1]));
      expect(got.BURN.body).not.toBe(TODAY.BURN);
      expect(got.FRAY.body).not.toBe(TODAY.FRAY);
      expect(got.PLATE.body).not.toBe(TODAY.PLATE);
      // the heads are the counts, as before
      expect([got.BURN.count, got.FRAY.count, got.PLATE.count, got.SHIELD.count]).toEqual(["3", "6/15", "120", "2"]);
      // the same builds without a day, and on that day with the switch off: today's text
      for (const [label, b] of [["no day", noDay(a)], ["switch off", switchOff(a, day)]] as const) {
        expect(textDay(b.b), `d${day} ${label}`).toBeUndefined();
        const old = byKw(entriesOf(b, loadFoe(b)));
        for (const kw of KWS) expect(old[kw].body, `d${day} ${label} ${kw}`).toBe(TODAY[kw]);
        expect(nums(old.PLATE.body)[0], `d${day} ${label}: SHIELD's MAX = the strip's`).toBe(platingMax(b.b.sides[1]));
      }
      out.push(`d${day}: BURN "${got.BURN.body}" | FRAY "${got.FRAY.body}" | SHIELD "${got.PLATE.body}" (strip max ${platingMax(a.b.sides[1])})`);
    }
    console.log(`CNTDAY (b) the foe's panel on a dusk:\n${out.join("\n")}`);
  });

  it("a gun's PAIR line takes the fight's day too (PAIR's reminder holds no number: the same text)", () => {
    // a SEAM WELDER fitted makes its turret a pair reader (battle.ts makeTurret: g.seam, `pairing`)
    const { s } = dusk(8, "foundry", (b) => { b.mods.push({ uid: 901, def: "seamwelder", turret: 0 }); });
    const a = s.arena, bc = new BattleCounters() as unknown as Priv;
    expect(textDay(a.b)).toBe(8);
    let n = 0;
    for (const side of [0, 1] as const) for (const tu of a.b.sides[side].turrets) {
      if (!tu.pairing) continue;
      const got = bc.entries({ ...plateGroup(side), id: "g", kind: "gun", ref: tu.index }, a, [null, null]);
      expect(got.length).toBe(2);
      expect(got[1].word).toBe(keywordRow("PAIR")!.word);
      expect(got[1].body).toBe(dayRow("PAIR", 8));
      expect(got[1].body).toBe(TODAY.PAIR);
      n++;
    }
    expect(n, "the SEAM WELDER's turret reads pairs").toBeGreaterThan(0);
  });

  it("the panel's box is planned from the day's lines (drawPanel), on day 1, 7 and 10", () => {
    const out: string[] = [];
    for (const day of [1, 7, 10]) {
      const { s, game } = dusk(day, "bastion");
      const a = s.arena, rows = loadFoe(a);
      const bc = new BattleCounters(), pv = bc as unknown as Priv;
      pv.groups.push(plateGroup(1));
      bc.open = "cnt:plate1";
      bc.drawPanel(fakeCanvas().getContext(), game, a, rows);
      const p = bc.last.panel!;
      expect(p, `d${day}: the panel`).toBeTruthy();
      const w = Math.min(game.W - 4, PANEL_W), es = pv.entries(plateGroup(1), a, rows);
      const lines = es.map((e) => definitionLines(e.body, w - 10));
      let h = 3;
      es.forEach((e, i) => { h += (e.word ? 9 : 0) + lines[i].length * 9 + 2; });
      expect(p.r.h, `d${day}: the box holds the day's lines`).toBe(h);
      expect(p.lines, `d${day}: the drawn lines`).toEqual(lines.flat().map((ln) => ln.map((sp) => sp.t).join("")));
      const shieldAt = es.findIndex((e) => e.word === keywordRow("PLATE")!.word);
      expect(lines[shieldAt].map((ln) => ln.map((sp) => sp.t).join("")).join(" "), `d${day}: SHIELD's drawn MAX`).toContain(`MAX ${fmtDmg(sustShown(PLATE_CAP, day))}`);
      out.push(`d${day}: box ${p.r.w}x${p.r.h}, ${lines.map((l) => l.length).join("+")} lines`);
    }
    console.log(`CNTDAY (b) the panel's box:\n${out.join("\n")}`);
  });
});

// -------------------------------------------------------------------------------------------------------- the faces

const SALVO = (b: Build): void => { b.mods.push({ uid: 900, def: "salvo", turret: 0 }); };
const TURRET: PartSel = { kind: "turret", index: 0 };
const texts = (bs: readonly Block[]): string[] => bs.map((b) => b.text);
const abil = (bs: readonly Block[]): string[] => bs.filter((b) => b.role === "ability").map((b) => readOnlyBlock(b)?.text ?? "").filter(Boolean);
/** The build screen's own run for `build` on `day` (a set-up run holding that build). */
function runOn(build: Build, day: number): Run {
  const run = setupRun({ hero: build.hero, day, seed: 7 });
  run.build = build;
  return run;
}

describe("CNT-DAY (c): VIEW BATTLEFIELD's faces on the fight's day", () => {
  it("a turret (SALVO RACK) and an item (KILN) on the day-7 fight's build: the build screen's own panel's numbers on run.day 7", () => {
    const { s } = dusk(7, "furnace", SALVO);
    const a = s.arena, b = a.b.sides[0].build, day = textDay(a.b);
    expect(day).toBe(7);
    const kiln = b.items.find((p) => p.def === "kiln")!;
    const ITEM: PartSel = { kind: "item", uid: kiln.uid };
    const run7 = runOn(b, 7);
    // the build screen's own panel on run.day 7, as it shows it (explainPanel), read only (readOnlyBlock)
    const own = (t: PanelText, def?: string): PanelText => explainPanel({ ...t, body: t.body.flatMap((x) => { const r = readOnlyBlock(x); return r ? [r] : []; }) }, def);
    for (const [sel, panel] of [[TURRET, own(turretPanel(run7, 0)!)], [ITEM, own(itemPanel(run7, kiln.uid)!, "kiln")]] as const) {
      const t = faceText(b, sel, null, day)!, t0 = faceText(b, sel)!;
      expect(abil(t.body), `${sel.kind}: the face's lines are the panel's on day 7`).toEqual(abil(panel.body));
      expect(nums(abil(t.body).join(" ")), `${sel.kind}: its numbers`).toEqual(nums(abil(panel.body).join(" ")));
      expect(abil(t.body), `${sel.kind}: day 7 differs from day 1`).not.toEqual(abil(t0.body));
    }
    // the damage numbers themselves: SALVO RACK's +n each, KILN's slug damage, x D(7) rounded down
    const salvo = (t: readonly Block[]) => Number(/FIRES THE CHAMBER AT \+(\d+)/.exec(texts(t).join(" "))![1]);
    const t7 = faceText(b, TURRET, null, 7)!, t0 = faceText(b, TURRET)!;
    expect(salvo(t7.body)).toBe(dmgShown(salvo(t0.body), 7));
    expect(salvo(t7.body)).toBeGreaterThan(salvo(t0.body));
    const k7 = faceText(b, ITEM, null, 7)!, k0 = faceText(b, ITEM)!;
    const kd = (t: readonly Block[]) => nums(abil(t)[0]);
    expect(kd(k7.body).some((n, i) => n !== kd(k0.body)[i]), "KILN's stat row moves with the day").toBe(true);
    expect(kd(k7.body)).toEqual(kd(k0.body).map((n, i) => (n === kd(k7.body)[i] ? n : dmgShown(n, 7))));
    console.log(`CNTDAY (c) SALVO RACK: no day +${salvo(t0.body)}, day 7 +${salvo(t7.body)}; KILN: no day ${kd(k0.body).join(" ")}, day 7 ${kd(k7.body).join(" ")}`);
  });

  it("no day: today's text byte for byte (faceRun keeps no day); day 1 and the switch off read the same", () => {
    const b = heroStartBuild("furnace", 1);
    SALVO(b);
    expect(faceRun(b).day).toBeUndefined();
    expect(faceRun(b, 7).day).toBe(7);
    const sels: PartSel[] = [TURRET, { kind: "item", uid: b.items.find((p) => p.def === "kiln")!.uid }, { kind: "route", index: 0 }];
    for (const sel of sels) {
      const today = JSON.stringify(faceText(b, sel));
      expect(JSON.stringify(faceText(b, sel, null, undefined)), `${sel.kind}: undefined`).toBe(today);
      expect(JSON.stringify(faceText(b, sel, "THIS FIGHT: NO SHOTS.", undefined)), `${sel.kind}: with a fight line`).toBe(JSON.stringify(faceText(b, sel, "THIS FIGHT: NO SHOTS.")));
      expect(JSON.stringify(faceText(b, sel, null, 1)), `${sel.kind}: day 1`).toBe(today);
      for (const day of [5, 7, 10]) expect(JSON.stringify(withHullScale(() => faceText(b, sel, null, day), false)), `${sel.kind}: switch off d${day}`).toBe(today);
    }
    // today's SALVO RACK line, pinned
    expect(texts(faceText(b, TURRET)!.body).join(" ")).toMatch(/SHOT: FIRES THE CHAMBER AT \+20 \S+ EACH\./);
  });

  it("VIEW BATTLEFIELD's draw passes the fight's day (textDay) to the one face path; a fight without it passes none", () => {
    const calls: unknown[][] = [];
    vi.spyOn(BattleFaces.prototype, "drawOn").mockImplementation(function (this: BattleFaces, ...args: unknown[]) { calls.push(args); });
    const { s, game } = dusk(7, "furnace", SALVO);
    const L = laneLayout(battleLayout(game.W, game.H, game.portrait));
    const faces = new BattleFaces();
    faces.open = { side: 1, sel: TURRET };
    faces.draw(fakeCanvas().getContext(), game, s.arena, L, true);
    faces.draw(fakeCanvas().getContext(), game, noDay(s.arena), L, true);
    faces.draw(fakeCanvas().getContext(), game, switchOff(s.arena, 7), L, false);
    expect(calls.map((c) => c[7])).toEqual([7, undefined, undefined]);
    expect(calls[0][2]).toBe(s.arena.b.sides[1].build);
  });
});

// ------------------------------------------------------------------------------------------- the build screen's scout

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
/** scout1c.foe's framed(): the build screen's layout on a w x h view at dpr. */
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
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

describe("CNT-DAY (d): the build screen's scouted foe reads the run's day", () => {
  it("FoeView.draw opens each face on run.day: its drawn lines are the face on that day, not day 1's", () => {
    vi.stubGlobal("localStorage", new MapStore());
    const run = scoutRun(7);
    const foe = scoutedFoe(run)!;
    expect(foe, "the SCOUT stop's SPY revealed tonight's foe").not.toBeNull();
    const { L, view } = framed(402, 690, 3);
    const game = { view, ui: new UI(), canvas: fakeCanvas(), t: 0, W: L.W, H: L.H } as unknown as Game;
    const s = { run, L, game, t: 0, foe, note: () => null, modalUp: () => false } as unknown as BuildScreen;
    const days: unknown[] = [];
    const real = BattleFaces.prototype.drawOn;
    vi.spyOn(BattleFaces.prototype, "drawOn").mockImplementation(function (this: BattleFaces, ...args: Parameters<BattleFaces["drawOn"]>) { days.push(args[7]); return real.apply(this, args); });
    const v = new FoeView();
    v.show();
    expect(L.portrait, "the op phone frames the build screen in portrait (no ⓘ room: free is null)").toBe(true);
    const lines = (day: number | undefined): string[] => {
      v.faces.drawOn(fakeCanvas().getContext(), game, foe.build, { area: v.last!.area, band: L.portrait }, () => null, DEFAULT_SKIN.panel, null, day);
      return [v.faces.last!.title, ...v.faces.last!.lines];
    };
    let moved = 0, parts = 0, example = "";
    for (const p of foePartsOnScreen(L, foe)) {
      v.faces.open = { side: 1, sel: p.sel };
      v.draw(fakeCanvas().getContext(), s);
      expect(v.faces.last, `${p.name}: its face drew`).toBeTruthy();
      const drawn = [v.faces.last!.title, ...v.faces.last!.lines];
      // what the view drew is the face on the run's day, line for line
      expect(drawn, `${p.name}: the face on run.day`).toEqual(lines(run.day));
      const none = lines(undefined);
      if (JSON.stringify(drawn) !== JSON.stringify(none)) {
        moved++;
        if (!example) example = `${p.name} (${p.sel.kind}):\n  run day 7: ${drawn.join(" | ")}\n  no day:    ${none.join(" | ")}`;
      }
      parts++;
    }
    expect(parts).toBeGreaterThan(3);
    expect(new Set(days.slice(0, parts * 3).filter((_, i) => i % 3 === 0)), "every face FoeView.draw opens gets the run's day").toEqual(new Set([7]));
    expect(moved, "some part of a day-7 foe has a number that moves with the day").toBeGreaterThan(0);
    console.log(`CNTDAY (d) the scouted foe, ${parts} parts, ${moved} with a day number; e.g. ${example}`);
  });
});
