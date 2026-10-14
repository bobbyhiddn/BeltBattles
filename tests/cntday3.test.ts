// CNT-DAY3 (REQ-BFG-100; REQ-BFG-079; BRIEF-CNTDAY3, cap's ruling 10-13: show the day's number): the hull panel's REGEN
// badge on the fight's day, display only. drawPlate (battleHud.ts) reads the fight's day (textDay: the day's hull only) and
// draws sustShown(regenNow, day), the heal Battle.heal lands each second, in a room of sustShown(regenMax, day)'s width, so
// the bar still never moves within a fight. plateRow's existing give-way order (/max, then WARD's pips, then the badge)
// decides what fits. regenNow and regenMax stay in day-1 units.
//  (a) scaled fights on day 7 and day 10 where one side holds MENDING LOOMs (★1-3) and GREEN THREAD (REGEN 55 in day-1
//      units), on the op phone, a landscape phone and the desk, either side: the badge's text is the heal that lands each
//      second (Battle.heal's events), its room holds it, and the bar's width never changes in the fight (a frozen loom, the
//      dark wind); and a real day-7 dusk (setupRun, its stand-in foe).
//  (b) no day, day 1, and the switch off (days 7 and 10): today's text and room, byte for byte (cntday3-base's own
//      expressions: `+${fmtDmg(regenNow)}`, the room from regenMax).
//  (c) the fit (BRIEF-CNTDAY3 step 2): CNT-DAY2's day-10 sweep (every name a panel draws, each with its hero's REGEN bound;
//      day-10 hulls; WARD's pips or none; SHIELD's number or none) on the three views, both sides, and days 8 and 9 the same
//      way: drawn by drawPlate (the day's room) and set against cntday3-base's room (plateRow with the day-1 room). Forms,
//      never pixel literals. PANEL-FIT (cap's rule 10-13): drawPlate draws fitLead's row (plateRow's with the full lead
//      where its bar keeps 9 px; else the tag drops or the name is cut: tests/panelfit); the rows compared here are plateRow's.
// Everything is built here (start decks, set-up runs); never fights.json and never a par deck. Every day number is
// computed (sustShown, hullAt); only day 1's are pinned.
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";

/** What the pass-through mock saw: every drawText call (the badge as drawn, WARD's glyphs). */
const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; color: string; align?: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, color, align: opts?.align });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { HULL_SLOTS, HEROES, ITEMS, SHIELD_CAP, WIND_START, type HeroId } from "../src/sim/content";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { hullAt, hullScaleRules, sustShown, withHullScale } from "../src/sim/hullScale";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { RUNES } from "../src/sim/runes";
import type { Side } from "../src/sim/battle";
import { ICON, ICON_COLOUR, textWidth } from "../src/render/font";
import { fmtDmg } from "../src/ui/statFormat";
import { textDay } from "../src/ui/fightDay";
import { Arena } from "../src/game/arena";
import { battleLayout, battleScale, laneLayout, type BattleLayout } from "../src/game/battleLayout";
import { ghostName, startDusk } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { SOURCE_OFFLINE, SOURCE_ONLINE } from "../src/game/session";
import { battleSeed } from "../src/game/run";
import type { Game } from "../src/game/game";
import { setupRun } from "../src/tooling";
import { RIVALS } from "../src/sim/rivals";
import { BAR_MIN, ICON_GAP, SHIELD_PIPS_W, drawPlate, notePlace, plateRow, plateSource, plateTag, regenMax, regenNow, type PlateInfo, type PlateRow } from "../src/screens/battleHud";
import { LEAD_BAR, fitLead } from "../src/screens/battleHud"; // PANEL-FIT (REQ-BFG-100): (c)'s panels are drawn with the lead that fits

installRaster();
afterEach(() => { vi.restoreAllMocks(); });

const REGEN_COL = ICON_COLOUR[ICON.REGEN];
/** WEAVER's start deck with a MENDING LOOM on each of its three turrets (★1, ★2, ★3: REGEN 10 + 15 + 20) and GREEN THREAD
 *  (REGEN 10): 55 a second in day-1 units (tests/cntday2's loom deck). */
function loomDeck(): Build {
  const b = heroStartBuild("weaver", 1);
  b.mods = [...b.mods, { uid: 951, def: "mendingloom", turret: 0 }, { uid: 952, def: "mendingloom", turret: 1, stars: 2 }, { uid: 953, def: "mendingloom", turret: 2, stars: 3 }];
  b.runes = [{ id: "green_thread" }];
  return b;
}
/** A start deck with its belts cut: no turret ever loads, so nothing hits the other side (wind1's). */
const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });
/** The loom deck on `side` against a silent foe, on `day` (the battle screen's own constructor path: Arena(..., run.day)). */
const loomFight = (day: number | undefined, side: Side = 0): Arena =>
  side === 0 ? new Arena(loomDeck(), silent("furnace", 101), 11, null, undefined, undefined, day) : new Arena(silent("furnace", 101), loomDeck(), 11, null, undefined, undefined, day);

/** wind1's: a view's battle layout (CSS px x DPR), as battle.ts lays it out. */
function layoutOf(w: number, h: number, dpr: number): BattleLayout {
  const pw = w * dpr, ph = h * dpr, portrait = h > w;
  const s = battleScale(pw, ph, portrait);
  return laneLayout(battleLayout(Math.floor(pw / s), Math.floor(ph / s), portrait));
}
const VIEWS: readonly (readonly [string, BattleLayout])[] = [["phone 402x690", layoutOf(402, 690, 3)], ["landscape 844x390", layoutOf(844, 390, 3)], ["desk 1920x1080", layoutOf(1920, 1080, 1)]];

/** drawPlate on `side`'s panel of `L`: the REGEN badge it drew (REGEN's colour, right-aligned), how many WARD glyphs it drew
 *  (SHIELD_CAP: the pips; 1: one glyph), every drawText call (JSON) and what it returns. */
function panel(a: Arena, side: Side, L: BattleLayout, name = "WEAVER", tag?: string): { badge: { s: string; x: number } | null; ward: number; drawn: string; info: PlateInfo } {
  const r = L.plates[side];
  rec.text.length = 0;
  const info = drawPlate(G(fresh(r.x + r.w + 4, r.y + r.h + 4)), { t: 0 } as unknown as Game, a, r, side, name, "", tag);
  const b = rec.text.filter((c) => c.color === REGEN_COL && c.align === "right");
  expect(b.length, "at most one badge").toBeLessThanOrEqual(1);
  return { badge: b[0] ? { s: b[0].s, x: b[0].x } : null, ward: rec.text.filter((c) => c.s === ICON.SHIELD).length, drawn: JSON.stringify(rec.text), info };
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

// ------------------------------------------------------------------------------------------ (a) the day's badge

describe("CNT-DAY3 (a) a scaled fight's REGEN badge is the heal that lands each second", () => {
  it("days 7 and 10, the loom deck on either side, three views: the badge is each second's heal; the room holds it; the bar never moves", () => {
    expect(hullScaleRules(), "0.9.9 ships HULL_SCALE on").toBe(true);
    const out: string[] = [];
    for (const day of [7, 10]) for (const side of [0, 1] as Side[]) {
      const a = loomFight(day, side), s = a.b.sides[side];
      expect(a.b.scaled, `d${day}: on the day's hull`).toBe(true);
      expect(textDay(a.b)).toBe(day);
      const n = regenNow(a, side); // day-1 units, as Battle.sustainTick sums them
      expect(n).toBe(10 + 15 + 20 + RUNES.green_thread.amount.n);
      expect(regenMax(a, side)).toBe(n);
      const room = roomOf(sustShown(regenMax(a, side), day));
      const half = Math.floor(s.hull.max / 2);
      s.hull.hp = half; // room to heal: test state on the test's own Battle
      const first = VIEWS.map(([, L]) => panel(a, side, L));
      const loom3 = s.turrets.find((t) => t.regen === 20)!;
      const seen: string[] = [];
      for (let k = 1; k <= WIND_START + 2; k++) {
        if (k === 10) loom3.frozen = 5; // a frozen loom pauses (sustainTick) in seconds 10-12; cleared before second 13
        if (k === 13) loom3.frozen = 0;
        s.hull.hp = half; // the max-hull cap never trims a heal here
        const landed = nextSecond(a, side), now = regenNow(a, side), inWind = k >= WIND_START;
        if (!inWind) {
          // the heal that lands: the one sum x S(d), rounded down (exact: REGEN sums are multiples of 5, S(d)'s tenths even)
          expect(landed, `d${day} side ${side} second ${k}`).toBe(sustShown(k >= 10 && k <= 12 ? n - 20 : n, day));
        } else expect(landed, "the dark wind: nothing heals").toBe(0);
        // PAIR-2 (REQ-BFG-100; CNT-DAY3 finding 7.2, now fixed): regenNow reads the tick count, as the wind's rule in
        // Battle.heal does, so the badge is gone on the wind's first tick itself (b.t a hair under WIND_START there), where
        // that second's heal is lost. Until PAIR-2 it read the float clock, and on that one frame still showed the heal
        // (cntday3-base's regenNow: "+55" at the base); a frame later it was gone (tests/pair2 (b) has the frame table)
        if (k >= WIND_START) expect(now, "the dark wind, from its first tick: no badge").toBe(0);
        if (k === 1 || k === 10 || k === WIND_START) seen.push(`s${k} +${landed}${k === WIND_START ? ` (regenNow ${now} at t ${a.b.t})` : ""}`);
        VIEWS.forEach(([nm, L], i) => {
          const p = panel(a, side, L), at = `${nm} d${day} side ${side} second ${k}`;
          expect(p.info.bar, `${at}: the bar never moves`).toEqual(first[i].info.bar);
          if (now > 0) {
            if (!inWind) expect(p.badge?.s, `${at}: the badge is the heal that landed`).toBe(`+${fmtDmg(landed)}`);
            expect(p.badge?.s, `${at}: sustShown(regenNow, day)`).toBe(`+${fmtDmg(sustShown(now, day))}`);
            expect(p.badge!.x).toBe(p.info.hullBox.x - 3);
            expect(p.info.bar.x + p.info.bar.w, `${at}: the day's room`).toBe(p.badge!.x - room);
            expect(p.badge!.x - textWidth(p.badge!.s, "3"), `${at}: the room holds the badge`).toBeGreaterThanOrEqual(p.info.bar.x + p.info.bar.w + 3);
          } else expect(p.badge, `${at}: no badge in the wind`).toBeNull();
        });
      }
      out.push(`d${day} side ${side}: badge ${first[0].badge?.s} (day 1's +${n}); heals ${seen.join(", ")}; room ${roomOf(n)} -> ${room} px; bars ${first.map((p) => p.info.bar.w).join("/")} px (phone/landscape/desk), kept all fight`);
    }
    console.log(`CNTDAY3 (a) the badge beside the heal that lands:\n${out.join("\n")}`);
  });

  it("a real dusk on day 7 (setupRun, its stand-in foe): the badge is the day's, and the heal that lands in its first second", () => {
    const run = setupRun({ hero: "weaver", day: 7, seed: 7 });
    run.build = loomDeck();
    const foe = startDusk(run, []);
    const a = new Arena(run.build, foe.build, battleSeed(run), null, undefined, undefined, run.day);
    expect(textDay(a.b)).toBe(7);
    a.b.sides[0].hull.hp = Math.floor(a.b.sides[0].hull.max / 2);
    const n = regenNow(a, 0), p = panel(a, 0, VIEWS[0][1]);
    expect(p.badge?.s).toBe(`+${fmtDmg(sustShown(n, 7))}`);
    expect(`+${fmtDmg(nextSecond(a, 0))}`, "the heal that lands").toBe(p.badge?.s);
  });
});

// --------------------------------------------------------------------------- (b) no day, the switch off: today's

describe("CNT-DAY3 (b) no day, day 1, or the switch off: today's badge and room, byte for byte", () => {
  it("the badge is +55 (regenNow), the room regenMax's, the row plateRow's with today's room, and the draws are identical", () => {
    const cases: [string, () => Arena, boolean][] = [
      ["no day", () => loomFight(undefined), true],
      ["day 1", () => loomFight(1), true],
      ["switch off d7", () => withHullScale(() => loomFight(7), false), true],
      ["switch off d10", () => withHullScale(() => loomFight(10), false), true],
      ["switch off d7, drawn off", () => withHullScale(() => loomFight(7), false), false],
      ["switch off d10, drawn off", () => withHullScale(() => loomFight(10), false), false],
    ];
    const out: string[] = [];
    const drawnBy = new Map<string, string>();
    for (const [label, mk, drawnOn] of cases) {
      const a = mk(), s = a.b.sides[0];
      expect(textDay(a.b) ?? 1, label).toBe(1);
      s.hull.hp = Math.floor(s.hull.max / 2);
      for (const [nm, L] of VIEWS) {
        const p = drawnOn ? panel(a, 0, L) : withHullScale(() => panel(a, 0, L), false);
        const r = L.plates[0], at = `${label} ${nm}`;
        expect(p.badge?.s, `${at}: today's badge`).toBe("+55");
        expect(p.badge?.s).toBe(`+${fmtDmg(regenNow(a, 0))}`); // cntday3-base's own expression
        expect(roomOf(regenMax(a, 0))).toBe(textWidth("+55", "3") + 3);
        // cntday3-base's row: plateRow with today's room (regenMax's width)
        const row = plateRow({ x: r.x, y: r.y, w: r.w, h: r.h, lead: textWidth("WEAVER", "3"), hp: s.hull.hp, max: s.hull.max, shield: null, regenRoom: roomOf(regenMax(a, 0)), plate: null });
        expect([p.info.bar.x, p.info.bar.w, p.info.hullBox.x, p.badge!.x], `${at}: today's row`).toEqual([row.bar.x, Math.max(0, row.bar.w), row.hullX, row.regenX]);
        // every draw is the same in every case (the same hull, badge and room): byte for byte
        if (!drawnBy.has(nm)) drawnBy.set(nm, p.drawn);
        expect(p.drawn, `${at}: the same draws as no day's`).toBe(drawnBy.get(nm));
        if (nm === VIEWS[0][0]) out.push(`${label}: ${p.badge?.s}, bar ${p.info.bar.w} px`);
      }
      expect(nextSecond(a, 0), `${label}: the heal that lands`).toBe(55);
    }
    console.log(`CNTDAY3 (b) no day / day 1 / switch off: ${out.join("; ")}`);
  });
});

// ------------------------------------------------------------------------------------------------- (c) the fit

type Cand = { who: string; hero: HeroId; name: string; note?: string; regen: number };
type Form = { max: boolean; pips: boolean | null; badge: boolean };
const formOf = (q: PlateRow): Form => ({ max: !!q.max, pips: q.shield ? q.shield.pips : null, badge: q.regenX !== null });
const formText = (f: Form): string => `/max ${f.max ? "yes" : "no"} pips ${f.pips === null ? "-" : f.pips ? "yes" : "no"} badge ${f.badge ? "yes" : "no"}`;

describe("CNT-DAY3 (c) the fit: the day's badge on days 8, 9 and 10, three views, both panels", () => {
  it("drawPlate takes the day's room; plateRow's give-way order decides; no new negative bar, overlap or clipped glyph", () => {
    // the REGEN bound (tests/cntday2 (c)): the most turret slots a hull has, one MENDING LOOM a turret at ★3, GREEN THREAD
    const loom3 = effectAt("mendingloom", 3).mod!.regen!;
    expect(Object.values(ITEMS).filter((d) => d.mod?.regen).map((d) => d.id), "the one REGEN gear").toEqual(["mendingloom"]);
    expect(Object.values(RUNES).filter((d) => d.kind === "regen").map((d) => d.id), "the one REGEN rune").toEqual(["green_thread"]);
    const bound = (hero: HeroId): number => HULL_SLOTS[hero].length * loom3 + RUNES.green_thread.amount.n;
    const most = Math.max(...(Object.keys(HEROES) as HeroId[]).map(bound));
    // the widest figures a panel draws: a 5-digit hull in each face's widest digit (a day-10 hull stays under 100000:
    // tests/cntday2 (c)), the day's SHIELD cap's digits in the widest
    const widest = (font: "3" | "5"): string => [..."9876543210"].sort((p, q) => textWidth(q, font) - textWidth(p, font))[0];
    const hp5 = Number(widest("5").repeat(5)), max5 = Number(widest("3").repeat(5));
    // every name a panel draws (tests/cntday2 (c)): yours, your hero's name; the foe's, a ghost's (ONLINE), a stand-in's
    // (OFFLINE), a warlord's; each with its own hero's REGEN bound
    const yours: Cand[] = (Object.keys(HEROES) as HeroId[]).map((h) => ({ who: h, hero: h, name: HEROES[h].name, regen: bound(h) }));
    const foes: Cand[] = [];
    for (const hero of Object.keys(HEROES) as HeroId[]) for (let wins = 0; wins <= 10; wins++) for (let lives = 1; lives <= 10; lives++) foes.push({ who: `ghost ${hero}`, hero, name: ghostName({ hero, wins, lives }), note: SOURCE_ONLINE, regen: bound(hero) });
    const seenIns = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) for (let d = 1; d <= 10; d++) {
      const f = standInFoe(seed, d);
      if (!seenIns.has(f.name)) { seenIns.add(f.name); foes.push({ who: `stand-in ${f.hero}`, hero: f.hero, name: f.name, note: SOURCE_OFFLINE, regen: bound(f.hero) }); }
    }
    for (const rv of Object.values(RIVALS)) foes.push({ who: `warlord ${rv.hero}`, hero: rv.hero, name: rv.name, regen: bound(rv.hero) });
    const lead = (name: string, tag?: string): number => (tag ? textWidth(plateTag(tag), "3") + 4 : 0) + textWidth(name, "3");

    const table: string[] = [], worst: string[] = [], changedAt10: string[] = [], negBy = new Map<string, number>();
    const totals = new Map<number, { cases: number; kept: number; keptNoBadge: number; changed: number; badge: number; max: number; pips: number; negBase: number; negTip: number }>();
    for (const day of [1, 8, 9, 10]) {
      const T = { cases: 0, kept: 0, keptNoBadge: 0, changed: 0, badge: 0, max: 0, pips: 0, negBase: 0, negTip: 0 };
      const plateNum = sustShown(PLATE_CAP, day);
      for (const [nm, L] of VIEWS) {
        const inPlate = notePlace(L) === "plate";
        for (const side of [0, 1] as Side[]) {
          const r = L.plates[side], tagOf = `${nm} ${side ? "foe" : "you"}`;
          const C = { cases: 0, kept: 0, keptNoBadge: 0, changed: 0, badge: 0, max: 0, pips: 0 };
          // one Arena on the day's hull per panel: the side's state set to each case (test state on the test's own Battle)
          const a = new Arena(silent("weaver", 1), silent("weaver", 2), 11, null, undefined, undefined, day), s = a.b.sides[side];
          expect(textDay(a.b) ?? 1).toBe(day);
          const seenLead = new Set<string>();
          for (const c of side === 0 ? yours : foes) {
            const src = side === 1 && c.note && inPlate ? plateSource(c.name, c.note) : { name: c.name, tag: undefined as string | undefined };
            const ld = lead(src.name, src.tag), key = `${ld}:${c.regen}`;
            if (seenLead.has(key)) continue;
            seenLead.add(key);
            const bare = hullAt(HEROES[c.hero].hull, day);
            const rb = roomOf(c.regen), ra = roomOf(sustShown(c.regen, day)), dayBadge = `+${fmtDmg(sustShown(c.regen, day))}`;
            for (const [hpN, maxN] of [[bare, bare], [hp5, max5], [9999, max5], [999, max5]]) for (const sh of [null, SHIELD_CAP]) for (const pl of [null, plateNum]) {
              const rowAt = (room: number): PlateRow => plateRow({ x: r.x, y: r.y, w: r.w, h: r.h, lead: ld, hp: hpN, max: maxN, shield: sh, regenRoom: room, plate: pl });
              const b0 = rowAt(rb), b1 = rowAt(ra), f0 = formOf(b0), f1 = formOf(b1);
              // drawn by drawPlate at this tree (the day's room): the same form and row as plateRow with the day's room
              s.hull.max = maxN;
              s.hull.hp = hpN;
              s.shield = sh === null ? undefined : sh;
              s.plate.plate = pl ?? 0;
              s.turrets.forEach((tu, i) => { tu.regen = i === 0 ? c.regen : 0; });
              expect(regenMax(a, side)).toBe(c.regen);
              const p = panel(a, side, L, src.name, src.tag), at = `d${day} ${tagOf} ${c.who} "${src.tag ? `${src.tag} · ` : ""}${src.name}" hull ${hpN}/${maxN} WARD ${sh ?? "-"} SHIELD ${pl ?? "-"} REGEN +${c.regen} -> ${dayBadge}`;
              // PANEL-FIT (REQ-BFG-100, REQ-BFG-093; cap's rule 10-13): drawPlate draws fitLead's row with the day's room: plateRow's
              // with the full lead where its bar keeps LEAD_BAR (b1 itself), else the row for the lead that fits (the tag dropped,
              // or the name cut), so nothing is drawn over the lead
              const d1 = fitLead({ x: r.x, y: r.y, w: r.w, h: r.h, hp: hpN, max: maxN, shield: sh, regenRoom: ra, plate: pl }, src.name, src.tag).row;
              if (b1.bar.w >= LEAD_BAR) expect(JSON.stringify(d1), `${at}: a fitting panel keeps plateRow's row`).toBe(JSON.stringify(b1));
              const drawnForm: Form = { max: p.info.hull.includes("/"), pips: sh === null ? null : p.ward === SHIELD_CAP, badge: p.badge !== null };
              expect(formText(drawnForm), `${at}: drawn as plateRow with the day's room`).toBe(formText(formOf(d1)));
              expect([p.info.bar.x, p.info.bar.w, p.info.hullBox.x], at).toEqual([d1.bar.x, Math.max(0, d1.bar.w), d1.hullX]);
              if (p.badge) expect([p.badge.s, p.badge.x], at).toEqual([dayBadge, d1.regenX]);
              // plateRow's order: a part gives way, never comes back (the day's room is never smaller than day 1's)
              expect(ra, at).toBeGreaterThanOrEqual(rb);
              expect([!f0.max && f1.max, f0.pips === false && f1.pips === true, !f0.badge && f1.badge], `${at}: nothing comes back`).toEqual([false, false, false]);
              // plateRow's checks (tests/wind1's, with the badge): the hull in the 5x7 face inside the panel; nothing
              // overlaps; /max only where the bar keeps BAR_MIN; the badge's room holds the day's badge
              const fit = (q: PlateRow, badge: string): string[] => {
                const bad: string[] = [], curW = textWidth(q.hull, "5"), maxW = q.max ? textWidth(q.max, "3") + 1 : 0;
                if (q.hull !== fmtDmg(hpN)) bad.push("hull text");
                if (q.hullX + curW + maxW > r.x + r.w - 3) bad.push("hull clipped");
                if (q.hy < r.y || q.hy + 7 > r.y + r.h || q.ty < r.y || q.ty + 5 > r.y + r.h) bad.push("row clipped");
                if (q.bar.x + q.bar.w + 3 > (q.plate ? q.plate.x : q.regenX !== null ? q.regenX - textWidth(badge, "3") : q.hullX)) bad.push("bar overlaps");
                if (q.plate && q.plate.x + textWidth(ICON.PLATE, "3") + ICON_GAP + textWidth(q.plate.text, "3") + 3 > (q.regenX !== null ? q.regenX - textWidth(badge, "3") : q.hullX)) bad.push("SHIELD overlaps");
                if (q.regenX !== null && q.regenX > q.hullX - 3) bad.push("badge overlaps the hull");
                if (q.shield && q.shield.x + (q.shield.pips ? SHIELD_PIPS_W : textWidth(ICON.SHIELD, "3")) + ICON_GAP + textWidth(q.shield.count, "3") + 3 > q.bar.x) bad.push("WARD overlaps");
                if (q.max && q.bar.w < BAR_MIN) bad.push("/max under BAR_MIN");
                if (q.bar.w < 0) bad.push("negative bar");
                return bad;
              };
              const bad0 = fit(b0, `+${fmtDmg(c.regen)}`), bad1 = fit(b1, dayBadge);
              // tests/wind1's checks (all but the bar's sign) hold on every panel, at the base and at the tip
              expect([bad0.filter((q) => q !== "negative bar"), bad1.filter((q) => q !== "negative bar")], `${at}: plateRow's checks`).toEqual([[], []]);
              if (bad0.includes("negative bar")) {
                T.negBase++;
                const hk = hpN === bare ? "bare" : hpN === hp5 ? "5 digits" : hpN === 9999 ? "4 digits" : "3 digits";
                if (day === 10) negBy.set(`${tagOf} hull ${hk}`, (negBy.get(`${tagOf} hull ${hk}`) ?? 0) + 1);
              }
              if (bad1.includes("negative bar")) {
                T.negTip++;
                // a negative bar (the name's lead and the hull leave no room: cntday3-base's already) only where the base
                // draws the very same row: the last form (no /max, no pips, no badge), which holds no badge room
                expect(JSON.stringify(b1), `${at}: a negative bar at the tip only where the base draws the same row`).toBe(JSON.stringify(b0));
                expect(formText(f1), at).toBe(formText({ max: false, pips: sh === null ? null : false, badge: false }));
              }
              C.cases++;
              if (formText(f0) === formText(f1)) {
                if (f1.badge) C.kept++;
                else C.keptNoBadge++;
                if (!f1.badge) expect(JSON.stringify(b1), `${at}: no badge at the base: the same row`).toBe(JSON.stringify(b0));
              } else {
                C.changed++;
                const kind = f0.badge && !f1.badge ? "badge" : f0.pips && !f1.pips ? "pips" : "max";
                C[kind]++;
                if (day === 10) changedAt10.push(`${at}: ${formText(f0)} (bar ${b0.bar.w}) -> ${formText(f1)} (bar ${b1.bar.w})`);
              }
            }
          }
          table.push(`d${day} ${tagOf}: ${C.cases} panels; ${C.kept} keep their form with the badge, ${C.keptNoBadge} drop it at the base already; ${C.changed} change form (${C.badge} badge dropped, ${C.max} /max dropped, ${C.pips} pips dropped)`);
          for (const k of ["cases", "kept", "keptNoBadge", "changed", "badge", "max", "pips"] as const) T[k] += C[k];
          // the brief's worst case (CNT-DAY2): the longest lead with the most REGEN any build holds, a 5-digit hull, WARD's
          // pips, SHIELD's number: the badge drops at the base (the day-1 room) and at the tip (the day's)
          const ldMax = Math.max(...(side === 0 ? yours : foes).map((c) => { const q = side === 1 && c.note && inPlate ? plateSource(c.name, c.note) : { name: c.name, tag: undefined }; return lead(q.name, q.tag); }));
          const w0 = plateRow({ x: r.x, y: r.y, w: r.w, h: r.h, lead: ldMax, hp: hp5, max: max5, shield: SHIELD_CAP, regenRoom: roomOf(most), plate: plateNum });
          const w1 = plateRow({ x: r.x, y: r.y, w: r.w, h: r.h, lead: ldMax, hp: hp5, max: max5, shield: SHIELD_CAP, regenRoom: roomOf(sustShown(most, day)), plate: plateNum });
          expect([w0.regenX, w1.regenX], `d${day} ${tagOf}: the worst case drops the badge at the base and at the tip`).toEqual([null, null]);
          worst.push(`d${day} ${tagOf}: lead ${ldMax} px, REGEN +${most} -> +${sustShown(most, day)}: base ${formText(formOf(w0))} bar ${w0.bar.w}; tip ${formText(formOf(w1))} bar ${w1.bar.w}`);
        }
      }
      totals.set(day, T);
    }
    // where the day's badge first gets wider than day 1's, for each REGEN a build can hold (5 to the bound, in 5s)
    const widens: string[] = [];
    for (let n = 5; n <= most; n += 5) {
      const d = [2, 3, 4, 5, 6, 7, 8, 9, 10].find((q) => textWidth(`+${fmtDmg(sustShown(n, q))}`, "3") > textWidth(`+${fmtDmg(n)}`, "3"));
      widens.push(`${n}: ${d === undefined ? "never by day 10" : `day ${d} (+${sustShown(n, d)})`}`);
    }
    const sum = [...totals].map(([d, t]) => `d${d}: ${t.cases} panels, ${t.kept} keep their form with the badge, ${t.keptNoBadge} drop it at the base already, ${t.changed} change form (${t.badge} badge, ${t.max} /max, ${t.pips} pips); negative bars: base ${t.negBase}, tip ${t.negTip}`);
    console.log(`CNTDAY3 (c) the fit, by day, view and side:\n${table.join("\n")}\ntotals:\n${sum.join("\n")}\nthe worst case:\n${worst.join("\n")}\nthe badge first gets wider than day 1's (REGEN: day):\n${widens.join("; ")}\nday 10's negative bars at the base (the same rows at the tip), by panel and hull: ${[...negBy].map(([k, v]) => `${k}: ${v}`).join("; ")}\nday 10's changed panels:\n${changedAt10.join("\n")}`);
    // day 1: the day's badge is today's, so nothing changes
    expect(totals.get(1)!.changed, "day 1: no panel changes form").toBe(0);
    for (const day of [8, 9, 10]) {
      const t = totals.get(day)!;
      expect(t.cases, `d${day}: the same panels as day 1`).toBe(totals.get(1)!.cases);
      expect(t.changed, `d${day}: the day's wider badge changes some forms, each by plateRow's order`).toBeGreaterThan(0);
      expect(t.badge + t.max + t.pips).toBe(t.changed);
      expect(t.kept + t.keptNoBadge + t.changed).toBe(t.cases);
      expect(t.negTip, `d${day}: no new negative bar`).toBe(t.negBase);
    }
  });
});
