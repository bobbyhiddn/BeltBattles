// PANEL-FIT (REQ-BFG-100, REQ-BFG-093; BRIEF-PANELFIT, cap's rule 10-13; BRIEF-PANELFIT2, cap's addendum 10-13): nothing
// is ever drawn over the tag or the name on the battle HUD's panel, and a cut name never shows part of a number or ends on
// a gap. drawPlate (battleHud.ts) asks fitLead for the lead that fits:
//  1. plateRow with the full lead (tag and name): where its bar keeps LEAD_BAR (9 px, drawPlate's own `bw > 8`), as before;
//  2. else the tag drops, and plateRow runs with the name alone (its usual order uses the freed room);
//  3. else the name is cut: run 1's raw cut (the longest start of the name, CUT_KEEP characters at least, whose width with
//     CUT_MARK keeps LEAD_BAR in plateRow's last form); then (run 2) a part (the name split at spaces) the raw cut ends
//     inside goes whole if it holds a digit, then every space and "·" left at the end; then the mark. If fewer than
//     CUT_KEEP characters would stay, the raw cut stays (listed). plateRow runs once with the final lead;
//  4. else the bar takes what is left.
//  (a) tests/cntday3 (c)'s sweep (its inputs, its three views, both sides) on days 1, 5, 8 and 10, drawn by drawPlate, by
//      source (ONLINE ghost, OFFLINE stand-in, warlord, yours), and a census of real ONLINE ghosts (every hero, 0-10 wins,
//      1-10 hearts, plated or not, WARD or not, the day's hull): no negative bar; 9 px unless listed under rule 4; nothing
//      overlaps the lead; the tag drops before any cut; a cut keeps CUT_KEEP characters and ends with the mark; the raw cut
//      is the smallest; the drawn name is the raw cut, minus a partial part that holds a digit, minus the gap at the end,
//      plus the mark; no drawn cut has a space or "·" before the mark; none ends inside a part that holds a digit.
//  (b) every swept panel whose base bar (plateRow with the full lead: panelfit-base's drawPlate) is 9 px or more draws the
//      same drawText calls (text, x, y, colour) as panelfit-base's drawPlate expressions, on every view. (b2) every swept
//      panel that keeps its full lead or only drops its tag draws the same calls as panelfit-done's drawPlate (run 1's
//      fitLead, copied here as prevFit): only cut panels can differ from run 1, and only where run 1's cut ended on a gap
//      or inside a part that holds a digit.
//  (c) the real paths: battle.ts's foe panel for an ONLINE ghost (sourceLine, plateSource) and an OFFLINE stand-in on a
//      phone, and replay.ts's foe label: the drawn tag and name, and the panel's tap group.
// Everything is built here (start decks, set-up runs); never fights.json and never a par deck. Every day number is
// computed (sustShown, hullAt, platingMax); no day-5+ literal.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/** What the pass-through mock saw: every drawText call. */
const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; color: string; font: string; align?: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, color, font: opts?.font ?? "5", align: opts?.align });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { HULL_SLOTS, HEROES, RUN_DAYS, SHIELD_CAP, type HeroId } from "../src/sim/content";
import { PLATE_CAP } from "../src/sim/races/bastion";
import { hullAt, sustShown } from "../src/sim/hullScale";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { RUNES } from "../src/sim/runes";
import type { Side } from "../src/sim/battle";
import { C } from "../src/render/palette";
import { ICON, ICON_COLOUR, textWidth } from "../src/render/font";
import { fmtDmg } from "../src/ui/statFormat";
import { textDay } from "../src/ui/fightDay";
import { UI } from "../src/ui/ui";
import { tapPx } from "../src/ui/tap";
import { Arena } from "../src/game/arena";
import { PLATE_COLOUR, SHIELD_COLOUR } from "../src/game/arenaReact";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleLayout, battleScale, laneLayout, type BattleLayout } from "../src/game/battleLayout";
import { ghostName } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { SOURCE_OFFLINE, SOURCE_ONLINE, setSession, type Session } from "../src/game/session";
import type { Run } from "../src/game/run";
import type { Game } from "../src/game/game";
import { setupRun } from "../src/tooling";
import { RIVALS } from "../src/sim/rivals";
import { tabBelow } from "../src/game/counters";
import { BattleScreen } from "../src/screens/battle";
import { ReplayScreen } from "../src/screens/replay";
import { clipOut, plateTarget } from "../src/screens/battleCounters";
import {
  BAR_MIN, CUT_KEEP, CUT_MARK, ICON_GAP, LEAD_BAR, SHIELD_PIPS_W, drawPlate, fitLead, leadWidth, notePlace, plateRow, plateSource, plateTag, plated, platingMax,
  regenMax, regenNow, showsShield, type LeadFit, type PlateInfo, type PlateRow,
} from "../src/screens/battleHud";
import { fakeCanvas, fakeDom } from "./pair1.helpers";

let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => { restore(); setSession(null); });
afterEach(() => { vi.restoreAllMocks(); setSession(null); });

const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });
function layoutOf(w: number, h: number, dpr: number): BattleLayout {
  const pw = w * dpr, ph = h * dpr, portrait = h > w;
  const s = battleScale(pw, ph, portrait);
  return laneLayout(battleLayout(Math.floor(pw / s), Math.floor(ph / s), portrait));
}
const VIEWS: readonly (readonly [string, BattleLayout])[] = [["phone 402x690", layoutOf(402, 690, 3)], ["landscape 844x390", layoutOf(844, 390, 3)], ["desk 1920x1080", layoutOf(1920, 1080, 1)]];
const roomOf = (n: number): number => textWidth(`+${fmtDmg(n)}`, "3") + 3;
const DAYS = [1, 5, 8, 10].map((d) => Math.min(d, RUN_DAYS));
type Call = { s: string; x: number; y: number; color: string };
const strip = (c: Call): Call => ({ s: c.s, x: c.x, y: c.y, color: c.color });
type Src = "ONLINE ghost" | "OFFLINE stand-in" | "warlord" | "yours";
type Cand = { src: Src; hero: HeroId; name: string; note?: string; regen: number };
type RowIn = Omit<Parameters<typeof plateRow>[0], "lead">;

/** The REGEN bound (tests/cntday2 (c)): the most turret slots a hull has, one MENDING LOOM a turret at ★3, GREEN THREAD. */
const bound = (hero: HeroId): number => HULL_SLOTS[hero].length * effectAt("mendingloom", 3).mod!.regen! + RUNES.green_thread.amount.n;
/** tests/cntday3 (c)'s inputs: every name a panel draws, each with its own hero's REGEN bound. */
function candidates(): { yours: Cand[]; foes: Cand[] } {
  const yours: Cand[] = (Object.keys(HEROES) as HeroId[]).map((h) => ({ src: "yours", hero: h, name: HEROES[h].name, regen: bound(h) }));
  const foes: Cand[] = [];
  for (const hero of Object.keys(HEROES) as HeroId[]) for (let wins = 0; wins <= 10; wins++) for (let lives = 1; lives <= 10; lives++) foes.push({ src: "ONLINE ghost", hero, name: ghostName({ hero, wins, lives }), note: SOURCE_ONLINE, regen: bound(hero) });
  const seen = new Set<string>();
  for (let seed = 1; seed <= 300; seed++) for (let d = 1; d <= RUN_DAYS; d++) {
    const f = standInFoe(seed, d);
    if (!seen.has(f.name)) { seen.add(f.name); foes.push({ src: "OFFLINE stand-in", hero: f.hero, name: f.name, note: SOURCE_OFFLINE, regen: bound(f.hero) }); }
  }
  for (const rv of Object.values(RIVALS)) foes.push({ src: "warlord", hero: rv.hero, name: rv.name, regen: bound(rv.hero) });
  return { yours, foes };
}
/** The tag and name battle.ts:644 passes for this name on this view: plateSource's where the note goes in the panel. */
const sourceOf = (c: Cand, side: Side, L: BattleLayout): { name: string; tag?: string } =>
  side === 1 && c.note && notePlace(L) === "plate" ? plateSource(c.name, c.note) : { name: c.name };

/** run 1's fitLead (panelfit-done battleHud.ts :170-183), copied: panelfit-done's lead (b2), and the raw cut. */
function prevFit(o: RowIn, name: string, tag?: string): LeadFit {
  const full = leadWidth(name, tag), row = plateRow({ ...o, lead: full });
  if (row.bar.w >= LEAD_BAR) return { tag: tag || null, name, step: "full", lead: full, row };
  const alone = textWidth(name, "3"), bare = tag ? plateRow({ ...o, lead: alone }) : row;
  if (bare.bar.w >= LEAD_BAR) return { tag: null, name, step: "tag", lead: alone, row: bare };
  const chars = Array.from(name), most = alone + bare.bar.w - LEAD_BAR;
  if (chars.length <= CUT_KEEP) return { tag: null, name, step: tag ? "tag" : "full", lead: alone, row: bare };
  let k = chars.length - 1;
  while (k > CUT_KEEP && textWidth(chars.slice(0, k).join("") + CUT_MARK, "3") > most) k--;
  const cut = chars.slice(0, k).join("") + CUT_MARK, lead = textWidth(cut, "3");
  return { tag: null, name: cut, step: "cut", lead, row: plateRow({ ...o, lead }) };
}
type End = "gap" | "digit" | "word" | "letters";
/** How a cut `drawn` (its kept text, then the mark) of `name` ends: on a gap (a space or "·"); inside a part (the name
 *  split at spaces) that holds a digit; on a whole part; inside a part made only of letters. */
function endOf(name: string, drawn: string): End {
  const kept = drawn.slice(0, -CUT_MARK.length);
  if (/[ ·]$/.test(kept)) return "gap";
  const i = kept.split(" ").length - 1, part = name.split(" ")[i];
  if (kept.split(" ")[i] === part) return "word";
  return /\d/.test(part) ? "digit" : "letters";
}
/** The addendum on a raw cut of `k` characters (a reference, written apart from fitLead): the drawn name, and whether the
 *  raw cut stays because fewer than CUT_KEEP characters would. */
function addendum(name: string, k: number): { name: string; fallback: boolean } {
  const chars = Array.from(name), raw = chars.slice(0, k).join("");
  let kept = raw, at = 0;
  for (const part of name.split(" ")) {
    const n = Array.from(part).length;
    if (k > at && k < at + n && /\d/.test(part)) kept = chars.slice(0, at).join(""); // the raw cut ends inside this part
    at += n + 1;
  }
  kept = kept.replace(/[ ·]+$/, "");
  return Array.from(kept).length < CUT_KEEP ? { name: raw + CUT_MARK, fallback: true } : { name: kept + CUT_MARK, fallback: false };
}
/** plateRow's last form: no /max, WARD's count after one glyph, no badge. */
const lastForm = (q: PlateRow): boolean => q.max === null && !(q.shield && q.shield.pips) && q.regenX === null;
type Lists = { rule4: string[]; notLast: string[]; fallbacks: string[] };

/** The rule's checks on one fit (pure): the problems found (none: []). `lists` collects the panels under rule 4, the cut
 *  rows that are not plateRow's last form, and the raw cuts kept because fewer than CUT_KEEP characters would stay. */
function ruleProblems(o: RowIn, name: string, tag: string | undefined, f: LeadFit, lists: Lists, at: string): string[] {
  const bad: string[] = [];
  const b0 = plateRow({ ...o, lead: leadWidth(name, tag) }), q = f.row;
  if (q.bar.w < 0) bad.push("negative bar");
  if (JSON.stringify(plateRow({ ...o, lead: f.lead })) !== JSON.stringify(q)) bad.push("row is not plateRow's for the drawn lead");
  if (f.lead !== leadWidth(f.name, f.tag)) bad.push("lead width");
  if (b0.bar.w >= LEAD_BAR) {
    // as before: the full lead, the same row
    if (f.step !== "full" || f.tag !== (tag || null) || f.name !== name || JSON.stringify(q) !== JSON.stringify(b0)) bad.push("a fitting panel changed");
    return bad;
  }
  if (f.tag !== null) bad.push("the tag stayed under 9 px");
  const alone = plateRow({ ...o, lead: textWidth(name, "3") });
  if (f.step === "tag") {
    if (!tag && Array.from(name).length > CUT_KEEP) bad.push("step tag without a tag");
    if (f.name !== name) bad.push("name changed without a cut");
    if (q.bar.w < LEAD_BAR && Array.from(name).length > CUT_KEEP) bad.push("no cut under 9 px");
  } else if (f.step === "cut") {
    // the tag drops before any cut: the name alone left the bar under 9 px
    if (alone.bar.w >= LEAD_BAR) bad.push("cut where dropping the tag was enough");
    const kept = Array.from(f.name.slice(0, -CUT_MARK.length)), chars = Array.from(name);
    if (!f.name.endsWith(CUT_MARK)) bad.push("no mark");
    if (kept.length < CUT_KEEP) bad.push("fewer than CUT_KEEP characters");
    if (!name.startsWith(kept.join("")) || kept.length >= chars.length) bad.push("not a cut of the name");
    // the forms are not tried again: plateRow runs once with the final lead, and its bar is then under BAR_MIN, so the cut
    // row is plateRow's last form. Run 2 allows another form only where plateRow's own rule gives it (its bar keeps
    // BAR_MIN), and lists it
    if (!lastForm(q)) {
      lists.notLast.push(`${at}: "${f.name}" bar ${q.bar.w}`);
      if (q.bar.w < BAR_MIN) bad.push("a form came back after the cut");
    }
    // the raw cut (run 1's) is the smallest: it keeps 9 px (else it has CUT_KEEP characters: rule 4), and one more
    // character pushes the bar under 9 px
    const p = prevFit(o, name, tag), rawK = Array.from(p.name).length - CUT_MARK.length, rawBar = p.row.bar.w;
    if (p.step !== "cut") bad.push("run 1 did not cut");
    if (rawBar < LEAD_BAR && rawK !== CUT_KEEP) bad.push("under 9 px with more than CUT_KEEP characters");
    const more = chars.slice(0, rawK + 1).join("") + CUT_MARK;
    if (rawBar >= LEAD_BAR && plateRow({ ...o, lead: textWidth(more, "3") }).bar.w >= LEAD_BAR) bad.push("the raw cut is more than needed");
    // the drawn name: the raw cut, minus a partial part that holds a digit, minus the gap at the end, plus the mark
    const want = addendum(name, rawK);
    if (f.name !== want.name) bad.push(`drawn "${f.name}", the addendum gives "${want.name}"`);
    if (want.fallback) lists.fallbacks.push(`${at}: "${f.name}"`);
    else {
      // no space or "·" before the mark, and never part of a number
      if (/[ ·]$/.test(kept.join(""))) bad.push("a gap before the mark");
      if (endOf(name, f.name) === "digit") bad.push("ends inside a part that holds a digit");
    }
    // the kept text only gets shorter, so the bar only grows
    if (q.bar.w < rawBar) bad.push("the bar shrank");
    if (q.bar.w < LEAD_BAR && kept.length !== CUT_KEEP) bad.push("under 9 px with more than CUT_KEEP characters drawn");
  } else if (q.bar.w < LEAD_BAR && (tag || Array.from(name).length > CUT_KEEP)) bad.push("step full under 9 px");
  if (q.bar.w < LEAD_BAR) lists.rule4.push(`${at}: "${f.name}" bar ${q.bar.w}`);
  // nothing overlaps the lead: the first figure (WARD's glyph, or else the bar) starts 3 px after it
  const first = q.shield ? q.shield.x : q.bar.x;
  if (o.x + 3 + f.lead + 3 > first) bad.push("the lead runs into the first figure");
  return bad;
}
/** plateRow's own checks (tests/wind1's and cntday3 (c)'s): the hull inside the panel, no figure over the next. */
function rowProblems(o: RowIn, q: PlateRow, badge: string): string[] {
  const bad: string[] = [], curW = textWidth(q.hull, "5"), maxW = q.max ? textWidth(q.max, "3") + 1 : 0;
  if (q.hullX + curW + maxW > o.x + o.w - 3) bad.push("hull clipped");
  if (q.hy < o.y || q.hy + 7 > o.y + o.h || q.ty < o.y || q.ty + 5 > o.y + o.h) bad.push("row clipped");
  if (q.bar.x + Math.max(0, q.bar.w) + 3 > (q.plate ? q.plate.x : q.regenX !== null ? q.regenX - textWidth(badge, "3") : q.hullX) + (q.bar.w < 0 ? -q.bar.w : 0)) bad.push("bar overlaps");
  if (q.plate && q.plate.x + textWidth(ICON.PLATE, "3") + ICON_GAP + textWidth(q.plate.text, "3") + 3 > (q.regenX !== null ? q.regenX - textWidth(badge, "3") : q.hullX)) bad.push("SHIELD overlaps");
  if (q.regenX !== null && q.regenX > q.hullX - 3) bad.push("badge overlaps the hull");
  if (q.shield && q.shield.x + (q.shield.pips ? SHIELD_PIPS_W : textWidth(ICON.SHIELD, "3")) + ICON_GAP + textWidth(q.shield.count, "3") + 3 > q.bar.x) bad.push("WARD overlaps");
  if (q.max && q.bar.w < BAR_MIN) bad.push("/max under BAR_MIN");
  return bad;
}

/** panelfit-base's drawPlate, as drawText calls (its own expressions, battleHud.ts at panelfit-base :164-206), for the base's
 *  row `b0`: the tag and the name at the panel's left text edge, then the hull, /max, WARD, the badge and SHIELD's number. */
function baseCalls(a: Arena, side: Side, r: { x: number; y: number; w: number; h: number }, name: string, tag: string | undefined, b0: PlateRow): Call[] {
  const out: Call[] = [], s = a.b.sides[side];
  let tx = r.x + 3;
  const ty0 = r.y + Math.floor((r.h - 5) / 2);
  if (tag) { const t = plateTag(tag); out.push({ s: t, x: tx, y: ty0, color: C.slate4 }); tx += textWidth(t, "3") + 4; }
  out.push({ s: name, x: tx, y: ty0, color: side === 0 ? C.white : C.red });
  const ty = b0.ty;
  out.push({ s: b0.hull, x: b0.hullX, y: b0.hy, color: C.white });
  if (b0.max) out.push({ s: b0.max, x: b0.hullX + textWidth(b0.hull, "5") + 1, y: b0.hy + 2, color: C.bone });
  if (b0.shield) {
    const n = s.shield ?? 0; // a fresh arena: no SHIELD break, so no flash
    if (b0.shield.pips) {
      for (let i = 0; i < SHIELD_CAP; i++) out.push({ s: ICON.SHIELD, x: b0.shield.x + i * 4, y: ty, color: i < n ? ICON_COLOUR[ICON.SHIELD] : C.slate2 });
      out.push({ s: b0.shield.count, x: b0.shield.x + SHIELD_PIPS_W + ICON_GAP, y: ty, color: SHIELD_COLOUR });
    } else {
      out.push({ s: ICON.SHIELD, x: b0.shield.x, y: ty, color: n > 0 ? SHIELD_COLOUR : C.slate2 });
      out.push({ s: b0.shield.count, x: b0.shield.x + textWidth(ICON.SHIELD, "3") + ICON_GAP, y: ty, color: SHIELD_COLOUR });
    }
  }
  if (b0.regenX !== null) {
    const now = sustShown(regenNow(a, side), textDay(a.b));
    if (now > 0) out.push({ s: `+${fmtDmg(now)}`, x: b0.regenX, y: ty, color: ICON_COLOUR[ICON.REGEN] });
  }
  if (b0.plate) {
    out.push({ s: ICON.PLATE, x: b0.plate.x, y: ty, color: PLATE_COLOUR });
    out.push({ s: b0.plate.text, x: b0.plate.x + textWidth(ICON.PLATE, "3") + ICON_GAP, y: ty, color: PLATE_COLOUR });
  }
  return out;
}

/** drawPlate on `side`'s panel `r` of the arena: its drawText calls and what it returns. */
function draw(a: Arena, side: Side, r: { x: number; y: number; w: number; h: number }, name: string, tag?: string): { calls: typeof rec.text; info: PlateInfo } {
  rec.text.length = 0;
  const info = drawPlate(fakeCanvas().getContext(), { t: 0 } as unknown as Game, a, r, side, name, "", tag);
  return { calls: rec.text.slice(), info };
}
/** A drawText call's left edge. */
const leftOf = (c: (typeof rec.text)[number]): number => (c.align === "right" ? c.x - textWidth(c.s, c.font as "3" | "5") : c.align === "center" ? c.x - textWidth(c.s, c.font as "3" | "5") / 2 : c.x);

// ------------------------------------------------------------------------------------- (a) and (b): the sweep

describe("PANEL-FIT (a) and (b): the sweep at the tip, days 1, 5, 8 and 10, three views, both panels", () => {
  it("(a) no negative bar; 9 px unless under rule 4; nothing over the lead; the tag drops first; the raw cut is the smallest; a cut ends on a whole part. (b) a fitting panel draws as the base did. (b2) only cuts differ from run 1", () => {
    const { yours, foes } = candidates();
    const widest = (font: "3" | "5"): string => [..."9876543210"].sort((p, q) => textWidth(q, font) - textWidth(p, font))[0];
    const hp5 = Number(widest("5").repeat(5)), max5 = Number(widest("3").repeat(5));
    const table: string[] = [], census: string[] = [], cutsSeen: string[] = [], lists: Lists = { rule4: [], notLast: [], fallbacks: [] };
    let shortest: string | null = null, kept = 0, cuts = 0, drops = 0, tip0 = 0;
    // run 2: how the cuts end, at the tip and in run 1 (prevFit); the cut panels drawn anew against panelfit-done
    const zero = (): Record<End, number> => ({ gap: 0, digit: 0, word: 0, letters: 0 });
    const ends = { tip: zero(), run1: zero(), censusTip: zero(), censusRun1: zero() };
    const fmtEnds = (e: Record<End, number>): string => `on a gap ${e.gap}, inside a part with a digit ${e.digit}, clean ${e.word + e.letters} (a whole part ${e.word}, inside a letters part ${e.letters})`;
    let anew = 0, sameAsRun1 = 0, censusAnew = 0;
    const lastDay = DAYS[DAYS.length - 1], namesTip = new Map<string, number>(), namesRun1 = new Map<string, number>();
    for (const day of DAYS) {
      const plateNum = sustShown(PLATE_CAP, day);
      for (const [nm, L] of VIEWS) {
        for (const side of [0, 1] as Side[]) {
          const r = L.plates[side];
          const a = new Arena(silent("weaver", 1), silent("weaver", 2), 11, null, undefined, undefined, day), s = a.b.sides[side];
          expect(textDay(a.b) ?? 1).toBe(day);
          const by = new Map<Src, { panels: number; b9: number; b0: number; t9: number; t0: number; tag: number; cut: number }>();
          const seen = new Set<string>();
          for (const c of side === 0 ? yours : foes) {
            const src = sourceOf(c, side, L), key = `${c.src}:${leadWidth(src.name, src.tag)}:${c.regen}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const T = by.get(c.src) ?? { panels: 0, b9: 0, b0: 0, t9: 0, t0: 0, tag: 0, cut: 0 };
            by.set(c.src, T);
            const bare = hullAt(HEROES[c.hero].hull, day);
            for (const [hpN, maxN] of [[bare, bare], [hp5, max5], [9999, max5], [999, max5]]) for (const sh of [null, SHIELD_CAP]) for (const pl of [null, plateNum]) {
              const o: RowIn = { x: r.x, y: r.y, w: r.w, h: r.h, hp: hpN, max: maxN, shield: sh, regenRoom: roomOf(sustShown(c.regen, day)), plate: pl };
              s.hull.max = maxN;
              s.hull.hp = hpN;
              s.shield = sh === null ? undefined : sh;
              s.plate.plate = pl ?? 0;
              s.turrets.forEach((tu, i) => { tu.regen = i === 0 ? c.regen : 0; });
              const at = `d${day} ${nm} ${side ? "foe" : "you"} ${c.src} "${src.tag ? `${plateTag(src.tag)} ` : ""}${src.name}" hull ${hpN}/${maxN} WARD ${sh ?? "-"} SHIELD ${pl ?? "-"}`;
              const b0 = plateRow({ ...o, lead: leadWidth(src.name, src.tag) }), f = fitLead(o, src.name, src.tag);
              const { calls, info } = draw(a, side, r, src.name, src.tag);
              // drawPlate draws fitLead's lead and row
              expect([info.lead.tag, info.lead.name, info.lead.box.w, info.bar.x, info.bar.w, info.hullBox.x], at).toEqual([f.tag, f.name, f.lead, f.row.bar.x, Math.max(0, f.row.bar.w), f.row.hullX]);
              const ty0 = r.y + Math.floor((r.h - 5) / 2);
              const leadCalls = f.tag ? [{ s: plateTag(f.tag), x: r.x + 3, y: ty0, color: C.slate4 }] : [];
              leadCalls.push({ s: f.name, x: r.x + 3 + (f.tag ? textWidth(plateTag(f.tag), "3") + 4 : 0), y: ty0, color: side ? C.red : C.white });
              expect(calls.slice(0, leadCalls.length).map(strip), `${at}: the lead drawn first`).toEqual(leadCalls);
              // (a) the rule, and nothing drawn over the lead: every other call starts 3 px after it
              expect(ruleProblems(o, src.name, src.tag, f, lists, at), at).toEqual([]);
              expect(rowProblems(o, f.row, calls.find((q) => q.color === ICON_COLOUR[ICON.REGEN])?.s ?? `+${fmtDmg(sustShown(c.regen, day))}`), at).toEqual([]);
              const leadEnd = r.x + 3 + f.lead;
              const over = calls.slice(leadCalls.length).filter((q) => leftOf(q) < leadEnd + 3);
              expect(over.map((q) => `${q.s}@${leftOf(q)}`), `${at}: nothing over the lead (its end ${leadEnd})`).toEqual([]);
              if (info.bar.w > 8) expect(info.bar.x, at).toBeGreaterThanOrEqual(leadEnd + 3);
              // (b) a panel whose base bar keeps 9 px draws as panelfit-base drew it, call for call
              if (b0.bar.w >= LEAD_BAR) expect(calls.map(strip), `${at}: byte for byte`).toEqual(baseCalls(a, side, r, src.name, src.tag, b0));
              // (b2) a panel that keeps its full lead or only drops its tag draws as panelfit-done drew it (run 1's fitLead,
              // through panelfit-done's drawPlate expressions, which are the base's), call for call; a cut panel is drawn
              // anew only where run 1's cut ended on a gap or inside a part that holds a digit
              const p = prevFit(o, src.name, src.tag), prevCalls = baseCalls(a, side, r, p.name, p.tag ?? undefined, p.row);
              if (f.step !== "cut") {
                expect(f, `${at}: (b2) fitLead as run 1's`).toEqual(p);
                expect(calls.map(strip), `${at}: (b2) as panelfit-done drew it`).toEqual(prevCalls);
              } else {
                const differs = JSON.stringify(calls.map(strip)) !== JSON.stringify(prevCalls), e1 = endOf(src.name, p.name);
                const fallback = addendum(src.name, Array.from(p.name).length - CUT_MARK.length).fallback;
                expect(differs, `${at}: (b2) run 1 drew "${p.name}" (${e1}), now "${f.name}"`).toBe((e1 === "gap" || e1 === "digit") && !fallback);
                if (differs) anew++;
                else sameAsRun1++;
                ends.run1[e1]++;
                ends.tip[endOf(src.name, f.name)]++;
              }
              T.panels++;
              if (b0.bar.w < LEAD_BAR) T.b9++;
              if (b0.bar.w < 0) T.b0++;
              if (f.row.bar.w < LEAD_BAR) T.t9++;
              if (f.row.bar.w < 0) { T.t0++; tip0++; }
              if (f.step === "tag") { T.tag++; drops++; }
              if (f.step === "cut") {
                T.cut++;
                cuts++;
                if (shortest === null || Array.from(f.name).length < Array.from(shortest).length) shortest = f.name;
                if (cutsSeen.length < 8 && day === lastDay && nm === VIEWS[0][0]) cutsSeen.push(`${at}: bar ${b0.bar.w} -> run 1 "${p.name}" bar ${p.row.bar.w} -> "${f.name}" bar ${f.row.bar.w}`);
              }
              if (b0.bar.w >= LEAD_BAR) kept++;
            }
          }
          for (const [k, T] of by) table.push(`d${day} ${nm} ${side ? "foe" : "you"} ${k}: ${T.panels} panels; bar <9 / <0: base ${T.b9} / ${T.b0}, tip ${T.t9} / ${T.t0}; tag dropped ${T.tag}, name cut ${T.cut}`);
        }
        // the census: every real ONLINE ghost on the day's bare hull at full, plated or not, WARD or not (pure: fitLead's
        // row is what drawPlate draws, checked above)
        const r = L.plates[1], K = { n: 0, b9: 0, b0: 0, t9: 0, t0: 0, tag: 0, cut: 0 };
        for (const hero of Object.keys(HEROES) as HeroId[]) for (let wins = 0; wins <= 10; wins++) for (let lives = 1; lives <= 10; lives++) for (const sh of [null, SHIELD_CAP]) for (const pl of [null, plateNum]) {
          const src = sourceOf({ src: "ONLINE ghost", hero, name: ghostName({ hero, wins, lives }), note: SOURCE_ONLINE, regen: bound(hero) }, 1, L);
          const bare = hullAt(HEROES[hero].hull, day);
          const o: RowIn = { x: r.x, y: r.y, w: r.w, h: r.h, hp: bare, max: bare, shield: sh, regenRoom: roomOf(sustShown(bound(hero), day)), plate: pl };
          const b0 = plateRow({ ...o, lead: leadWidth(src.name, src.tag) }), f = fitLead(o, src.name, src.tag);
          const at = `census d${day} ${nm} "${src.name}" WARD ${sh ?? "-"} SHIELD ${pl ?? "-"}`;
          expect(ruleProblems(o, src.name, src.tag, f, lists, at), at).toEqual([]);
          expect(rowProblems(o, f.row, `+${fmtDmg(sustShown(bound(hero), day))}`), at).toEqual([]);
          K.n++;
          if (b0.bar.w < LEAD_BAR) K.b9++;
          if (b0.bar.w < 0) K.b0++;
          if (f.row.bar.w < LEAD_BAR) K.t9++;
          if (f.row.bar.w < 0) K.t0++;
          if (f.step === "tag") K.tag++;
          if (f.step === "cut") {
            K.cut++;
            const p = prevFit(o, src.name, src.tag);
            ends.censusRun1[endOf(src.name, p.name)]++;
            ends.censusTip[endOf(src.name, f.name)]++;
            if (f.name !== p.name) censusAnew++;
            if (day === lastDay && nm === VIEWS[0][0]) {
              namesTip.set(f.name, (namesTip.get(f.name) ?? 0) + 1);
              namesRun1.set(p.name, (namesRun1.get(p.name) ?? 0) + 1);
            }
          }
        }
        census.push(`d${day} ${nm} (the note ${notePlace(L) === "plate" ? "in the panel" : "above it"}): ${K.n} ONLINE ghosts; bar <9 / <0: base ${K.b9} / ${K.b0}, tip ${K.t9} / ${K.t0}; tag dropped ${K.tag}, name cut ${K.cut}`);
        expect(K.t0, `census d${day} ${nm}: no negative bar`).toBe(0);
      }
    }
    const top = (m: Map<string, number>): string => [...m].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1)).slice(0, 10).map(([k, v], i) => `  ${i + 1}. "${k}" x ${v}`).join("\n");
    console.log(`PANELFIT (a) the sweep, by day, view, side and source:\n${table.join("\n")}\nthe census:\n${census.join("\n")}
sweep: ${kept} panels keep their row (base bar 9 px or more), ${drops} drop the tag, ${cuts} cut the name; the shortest name kept: "${shortest}"
sweep cuts, how they end: run 1 (panelfit-done): ${fmtEnds(ends.run1)}; the tip: ${fmtEnds(ends.tip)}
(b2) sweep cut panels drawn anew against panelfit-done: ${anew} (the same calls: ${sameAsRun1}); every other panel draws as panelfit-done drew it
census cuts (${DAYS.length} days x ${VIEWS.length} views), how they end: run 1: ${fmtEnds(ends.censusRun1)}; the tip: ${fmtEnds(ends.censusTip)}; drawn anew: ${censusAnew}
day ${lastDay} ${VIEWS[0][0]} census, the 10 most common cut names: run 1 (${namesRun1.size} names):\n${top(namesRun1)}\nthe tip (${namesTip.size} names):\n${top(namesTip)}
day ${lastDay} phone cuts (first ${cutsSeen.length}):\n${cutsSeen.join("\n")}
rule 4 (bar under 9 px after the rule): ${lists.rule4.length}${lists.rule4.length ? `\n${lists.rule4.join("\n")}` : ""}
raw cuts kept (steps 1-2 would leave fewer than CUT_KEEP characters): ${lists.fallbacks.length}${lists.fallbacks.length ? `\n${lists.fallbacks.join("\n")}` : ""}
cut rows that are not plateRow's last form: ${lists.notLast.length}${lists.notLast.length ? `\n${lists.notLast.join("\n")}` : ""}`);
    expect(tip0, "no negative bar at the tip").toBe(0);
    // not vacuous: the rule acts (the base has negative bars; the tip drops tags and cuts names), and most panels keep
    expect(drops, "some panels drop the tag").toBeGreaterThan(0);
    expect(cuts, "some panels cut the name").toBeGreaterThan(0);
    expect(kept, "most panels keep their row").toBeGreaterThan(drops + cuts);
    expect(Array.from(shortest!.slice(0, -CUT_MARK.length)).length).toBeGreaterThanOrEqual(CUT_KEEP);
    // run 2: no cut ends on a gap or inside a part that holds a digit (but a raw cut kept and listed); run 1 had both, so
    // the addendum acts (not vacuous)
    expect(ends.tip.gap + ends.tip.digit + ends.censusTip.gap + ends.censusTip.digit, "cuts that end on a gap or inside a number: only raw cuts kept (listed)").toBe(lists.fallbacks.length);
    expect(ends.run1.gap * ends.run1.digit * anew, "run 1's sweep had both kinds, and the tip draws them anew").toBeGreaterThan(0);
    expect(anew + sameAsRun1).toBe(cuts);
  });

  it("the helper on its own: a short lead keeps its row; the tag drops first; the raw cut is the smallest and the cut ends on a whole part; a name of CUT_KEEP characters is never cut; the brief's names on every panel width", () => {
    const L = VIEWS[0][1], r = L.plates[1], day = DAYS[DAYS.length - 1];
    const hull = hullAt(HEROES.weaver.hull, day);
    const o: RowIn = { x: r.x, y: r.y, w: r.w, h: r.h, hp: hull, max: hull, shield: SHIELD_CAP, regenRoom: 0, plate: sustShown(PLATE_CAP, day) };
    // a short name: as before
    const short = fitLead(o, "ABC");
    expect([short.step, short.tag, short.name]).toEqual(["full", null, "ABC"]);
    expect(short.row).toEqual(plateRow({ ...o, lead: textWidth("ABC", "3") }));
    // the longest ghost lead: the tag drops, then the name is cut: the raw cut is the smallest, and the drawn cut is the raw
    // cut without a partial part that holds a digit and without the gap at its end, then the mark
    const heroes = Object.keys(HEROES) as HeroId[];
    const longest = heroes.map((h) => plateSource(ghostName({ hero: h, wins: 10, lives: 10 }), SOURCE_ONLINE)).sort((p, q) => textWidth(q.name, "3") - textWidth(p.name, "3"))[0];
    const f = fitLead(o, longest.name, longest.tag);
    expect(plateRow({ ...o, lead: leadWidth(longest.name, longest.tag) }).bar.w, "the base: under 9 px").toBeLessThan(LEAD_BAR);
    expect(f.tag).toBeNull();
    if (f.step === "cut") {
      expect(f.name.endsWith(CUT_MARK)).toBe(true);
      expect(f.row.bar.w).toBeGreaterThanOrEqual(LEAD_BAR);
      const raw = prevFit(o, longest.name, longest.tag), k = Array.from(raw.name).length - 1;
      expect(raw.row.bar.w, "the raw cut keeps 9 px").toBeGreaterThanOrEqual(LEAD_BAR);
      expect(plateRow({ ...o, lead: textWidth(Array.from(longest.name).slice(0, k + 1).join("") + CUT_MARK, "3") }).bar.w, "one more character").toBeLessThan(LEAD_BAR);
      expect(f.name).toBe(addendum(longest.name, k).name);
      expect(["word", "letters"]).toContain(endOf(longest.name, f.name));
      expect(f.row.bar.w).toBeGreaterThanOrEqual(raw.row.bar.w);
    } else expect(f.row.bar.w).toBeGreaterThanOrEqual(LEAD_BAR);
    // the brief's names ("METRONOME · 10W 10♥", "FURNACE · 10W 10♥", after the ONLINE tag drops) on every panel width from
    // 40 px to twice the phone's: a cut reads "NAME · 10W." or "NAME." (or, on a panel too narrow for the hero's name, a
    // cut of that name, letters only), never "NAME · 1." or "NAME · ."; both whole forms are met
    const brief: string[] = [];
    for (const hero of ["metronome", "furnace"] as HeroId[]) {
      const wins = 10, src = plateSource(ghostName({ hero, wins, lives: 10 }), SOURCE_ONLINE), hn = HEROES[hero].name;
      const whole = [`${hn} · ${wins}W${CUT_MARK}`, `${hn}${CUT_MARK}`], met = new Set<string>();
      for (let w = 40; w <= 2 * r.w; w++) {
        const fw = fitLead({ ...o, w }, src.name, src.tag);
        if (fw.step !== "cut") continue;
        const kept = fw.name.slice(0, -CUT_MARK.length);
        const lettersCut = Array.from(kept).length >= CUT_KEEP && kept.length < hn.length && hn.startsWith(kept);
        expect(whole.includes(fw.name) || lettersCut, `${hero} w ${w}: "${fw.name}"`).toBe(true);
        expect([`${hn} · 1${CUT_MARK}`, `${hn} · ${CUT_MARK}`, `${hn} ·${CUT_MARK}`]).not.toContain(fw.name);
        met.add(fw.name);
      }
      for (const s of whole) expect(met.has(s), `${hero}: "${s}" is met`).toBe(true);
      brief.push(`"${plateTag(src.tag)} ${src.name}": ${[...met].map((s) => `"${s}"`).join(", ")}`);
    }
    // the CUT_KEEP floor: where steps 1-2 would leave fewer than CUT_KEEP characters, the raw cut stays, as run 1 drew it
    let floors = 0;
    for (let w = 40; w <= r.w; w++) {
      const ow = { ...o, w }, fw = fitLead(ow, "AB 123456789"), raw = prevFit(ow, "AB 123456789");
      if (fw.step !== "cut") continue;
      const want = addendum("AB 123456789", Array.from(raw.name).length - CUT_MARK.length);
      expect(fw.name, `w ${w}`).toBe(want.name);
      if (want.fallback) { floors++; expect(fw.name).toBe(raw.name); }
    }
    expect(floors, "the floor is met on narrow panels").toBeGreaterThan(0);
    // a panel too narrow for anything: a name of CUT_KEEP characters is kept whole, the bar takes what is left (rule 4)
    const tight: RowIn = { ...o, w: 70 };
    const t3 = fitLead(tight, "ABC", "ONLINE");
    expect([t3.tag, t3.name]).toEqual([null, "ABC"]);
    const t9 = fitLead(tight, "ABCDEFGHIJ", "ONLINE");
    expect([t9.tag, t9.step, Array.from(t9.name).length]).toEqual([null, "cut", CUT_KEEP + 1]);
    expect(t9.name).toBe(`ABC${CUT_MARK}`);
    console.log(`PANELFIT the helper: "${plateTag(longest.tag)} ${longest.name}" -> ${f.step} "${f.name}" bar ${f.row.bar.w} (run 1: "${prevFit(o, longest.name, longest.tag).name}"); a 70 px panel: "ABC" bar ${t3.row.bar.w}, "ABCDEFGHIJ" -> "${t9.name}" bar ${t9.row.bar.w}
the brief's names, the cuts met on panels 40-${2 * r.w} px wide:\n${brief.join("\n")}\nthe CUT_KEEP floor ("AB 123456789"): the raw cut kept on ${floors} widths`);
  });
});

// ------------------------------------------------------------------------------------------ (c) the real paths

const DT = 1 / 60;
const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
/** tests/cntday's stand-in Game: the run, a silent audio, a 402x690 phone's view at DPR 3, a UI and a recording canvas. */
function fakeGame(run: Run, w = 402, h = 690, dpr = 3): Game {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silentAudio = new Proxy({}, { get: () => () => undefined });
  const g = { run, audio: silentAudio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fakeCanvas() } as unknown as Game;
  (g as unknown as { go: (s: unknown) => void }).go = () => undefined;
  return g;
}
/** An online session that answers nothing (the stored foe stands): onlineMode() is on. */
const quietSession = (): Session => ({ url: "test", active: true, failed: false, tick() {}, settle() {}, submitDusk() {}, countRun() {} });
type Hud = { drawHud(g: unknown): void; plateR: { x: number; y: number; w: number; h: number }[] };

/** A dusk on `day` against a stored foe (`source`), on a phone, stepped into the fight; the foe's panel then holds WARD
 *  (SHIELD_CAP) and a full plating pool (test state on the screen's own Battle), and the HUD is drawn once. */
function duskAgainst(day: number, foe: { name: string; hero: HeroId; source: "online" | "offline" }): { s: BattleScreen; game: Game; calls: typeof rec.text } {
  setSession(quietSession());
  const run = setupRun({ hero: "furnace", day, seed: 7 });
  run.dusk = { day: run.day, kind: foe.source === "online" ? "ghost" : "standin", name: foe.name, hero: foe.hero, build: heroStartBuild(foe.hero, 77), source: foe.source };
  const game = fakeGame(run), s = new BattleScreen(game);
  for (let i = 0; i < 60 * 4 && s.phase !== "fight"; i++) s.update(DT);
  expect(s.phase).toBe("fight");
  const f = s.arena.b.sides[1];
  f.shield = SHIELD_CAP;
  f.plate.plate = platingMax(f);
  s.counters.begin();
  rec.text.length = 0;
  (s as unknown as Hud).drawHud(fakeCanvas().getContext());
  return { s, game, calls: rec.text.slice() };
}
/** The foe panel's tap group as battleCounters.ts drawRows makes it: the panel and its status tab, a finger tall, grown
 *  towards the hull, clear of the bar. */
function plateGroupBox(s: BattleScreen | ReplayScreen, game: Game, r: { x: number; y: number; w: number; h: number }, avoid: { x: number; y: number; w: number; h: number }[]): { x: number; y: number; w: number; h: number } | null {
  const tab = s.counters.last.tabs[1]?.r, below = tabBelow(s.L.plates[1], s.L.hulls[1]);
  const base = tab ? { x: Math.min(r.x, tab.x), y: Math.min(r.y, tab.y), w: Math.max(r.x + r.w, tab.x + tab.w) - Math.min(r.x, tab.x), h: Math.max(r.y + r.h, tab.y + tab.h) - Math.min(r.y, tab.y) } : { ...r };
  let t: { x: number; y: number; w: number; h: number } | null = plateTarget(base, below, tapPx(game.view), game.H);
  for (const b of avoid) if (t) t = clipOut(t, b);
  return t;
}
const holds = (t: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
/** drawPlate's own inputs to its row for `side`'s panel `r` (battleHud.ts: the day's REGEN room, WARD, plating). */
function rowIn(a: Arena, side: Side, r: { x: number; y: number; w: number; h: number }): RowIn {
  const s = a.b.sides[side], n = sustShown(regenMax(a, side), textDay(a.b));
  return { x: r.x, y: r.y, w: r.w, h: r.h, hp: s.hull.hp, max: s.hull.max, shield: showsShield(a, side) ? s.shield ?? 0 : null, regenRoom: n > 0 ? roomOf(n) : 0, plate: plated(a, side) || s.plate.plate > 0 ? s.plate.plate : null };
}

describe("PANEL-FIT (c) the real paths: battle.ts's foe panel and replay.ts's foe label", () => {
  it("an ONLINE ghost on a phone (sourceLine, plateSource): the tag drops and the name is cut as fitLead says; the tap group covers the panel's counters", () => {
    const day = RUN_DAYS; // the longest hulls and plating
    const heroes = Object.keys(HEROES) as HeroId[];
    const hero = heroes.sort((p, q) => textWidth(ghostName({ hero: q, wins: 10, lives: 10 }), "3") - textWidth(ghostName({ hero: p, wins: 10, lives: 10 }), "3"))[0];
    const name = ghostName({ hero, wins: 10, lives: 10 });
    const { s, game, calls } = duskAgainst(day, { name, hero, source: "online" });
    const src = s.sourceLine();
    expect(src, "the note goes in the panel on a phone").toMatchObject({ place: "plate", tag: "ONLINE", name: plateSource(name, SOURCE_ONLINE).name });
    const r = (s as unknown as Hud).plateR[1], o = rowIn(s.arena, 1, r);
    expect([o.shield, o.plate], "the foe's panel holds WARD and SHIELD").toEqual([SHIELD_CAP, platingMax(s.arena.b.sides[1])]);
    const fit = fitLead(o, src!.place === "plate" ? src!.name : name, src!.place === "plate" ? src!.tag : undefined);
    const info = s.plateRows[1]!;
    expect(plateRow({ ...o, lead: leadWidth(src!.place === "plate" ? src!.name : name, "ONLINE") }).bar.w, "the base drew this panel under 9 px").toBeLessThan(LEAD_BAR);
    expect(info.lead.tag, "the tag drops").toBeNull();
    expect([info.lead.name, info.bar.x, info.bar.w]).toEqual([fit.name, fit.row.bar.x, Math.max(0, fit.row.bar.w)]);
    // the texts drawn at the panel's text row: no "ONLINE ·", the name as fitLead gives it
    const ty0 = r.y + Math.floor((r.h - 5) / 2);
    const rowTexts = calls.filter((q) => q.y === ty0 && q.x >= r.x && q.x < r.x + r.w);
    expect(rowTexts.some((q) => q.s === plateTag("ONLINE")), "no ONLINE tag drawn").toBe(false);
    expect(rowTexts.find((q) => q.color === C.red)?.s, "the drawn name").toBe(fit.name);
    // run 2: the expected strings: the name ends on a whole part, then the mark: "METRONOME · 10W." or "METRONOME.", never
    // part of a number ("METRONOME · 1.") or a gap ("METRONOME · ."); run 1 drew its raw cut
    const hn = HEROES[hero].name, run1 = prevFit(o, plateSource(name, SOURCE_ONLINE).name, "ONLINE");
    expect([`${hn} · 10W${CUT_MARK}`, `${hn}${CUT_MARK}`], "the drawn name").toContain(info.lead.name);
    expect(endOf(plateSource(name, SOURCE_ONLINE).name, info.lead.name)).toBe("word");
    expect(info.lead.name).toBe(addendum(plateSource(name, SOURCE_ONLINE).name, Array.from(run1.name).length - CUT_MARK.length).name);
    expect(info.bar.w, "the bar keeps 9 px").toBeGreaterThanOrEqual(LEAD_BAR);
    expect(info.bar.w, "and only grows from run 1's").toBeGreaterThanOrEqual(Math.max(0, run1.row.bar.w));
    expect(info.lead.box.x + info.lead.box.w + 3).toBeLessThanOrEqual(info.bar.x);
    // the tap group: one target for the panel, a finger tall, over the drawn counters (the status row, WARD, SHIELD's number)
    const targets = s.counters.last.targets.filter((t) => t.id === "cnt:plate1");
    expect(targets.length, "one target for the foe's panel").toBe(1);
    const want = plateGroupBox(s, game, r, [s.L.bar]);
    expect(targets[0].r).toEqual(want);
    expect(targets[0].r.h).toBeGreaterThanOrEqual(tapPx(game.view));
    const ward = rowTexts.find((q) => q.s === ICON.SHIELD)!, shield = rowTexts.find((q) => q.s === ICON.PLATE)!;
    expect(holds(targets[0].r, ward.x + 1, ward.y + 2), "WARD's glyph is under the target").toBe(true);
    expect(holds(targets[0].r, shield.x + 1, shield.y + 2), "SHIELD's number is under the target").toBe(true);
    const tab = s.counters.last.tabs[1];
    if (tab) expect(holds(targets[0].r, tab.r.x + 1, tab.r.y + 1), "the status row is under the target").toBe(true);
    console.log(`PANELFIT (c) ONLINE ghost on a day-${day} phone: "${plateTag("ONLINE")} ${src!.place === "plate" ? src!.name : name}" -> "${info.lead.name}" (tag ${info.lead.tag}), bar ${info.bar.w} px at x ${info.bar.x} (run 1: "${run1.name}", bar ${run1.row.bar.w}); tap target ${JSON.stringify(targets[0].r)}`);
  });

  it("an OFFLINE stand-in with the longest captain name on a phone: the tag and the name as fitLead says", () => {
    const day = RUN_DAYS - 3; // day 7 on a 10-day run
    const names = new Map<string, HeroId>();
    for (let seed = 1; seed <= 300; seed++) for (let d = 1; d <= RUN_DAYS; d++) { const f = standInFoe(seed, d); names.set(f.name, f.hero); }
    const [name, hero] = [...names].sort((p, q) => textWidth(q[0], "3") - textWidth(p[0], "3"))[0];
    const { s, calls } = duskAgainst(day, { name, hero, source: "offline" });
    const src = s.sourceLine();
    expect(src).toMatchObject({ place: "plate", tag: "OFFLINE", name });
    const r = (s as unknown as Hud).plateR[1], info = s.plateRows[1]!;
    const fit = fitLead(rowIn(s.arena, 1, r), name, "OFFLINE");
    expect([info.lead.tag, info.lead.name, info.bar.x, info.bar.w]).toEqual([fit.tag, fit.name, fit.row.bar.x, Math.max(0, fit.row.bar.w)]);
    // the expected strings: the tag drops and the name stays whole (not a cut), as run 1 drew it
    expect([fit.step, info.lead.tag, info.lead.name], "the tag drops, the name is whole").toEqual(["tag", null, name]);
    expect(fit, "as run 1").toEqual(prevFit(rowIn(s.arena, 1, r), name, "OFFLINE"));
    const ty0 = r.y + Math.floor((r.h - 5) / 2);
    const rowTexts = calls.filter((q) => q.y === ty0 && q.x >= r.x && q.x < r.x + r.w);
    expect(rowTexts.some((q) => q.s === plateTag("OFFLINE"))).toBe(fit.tag !== null);
    expect(rowTexts.find((q) => q.color === C.red)?.s).toBe(fit.name);
    expect(info.bar.w).toBeGreaterThanOrEqual(LEAD_BAR);
    console.log(`PANELFIT (c) OFFLINE stand-in on a day-${day} phone: "${plateTag("OFFLINE")} ${name}" -> ${fit.step}: tag ${info.lead.tag}, "${info.lead.name}", bar ${info.bar.w} px`);
  });

  it("replay.ts's foe label (a ghost's whole name, no tag): the name is cut as fitLead says; the tap group covers the panel", () => {
    const day = RUN_DAYS;
    const heroes = Object.keys(HEROES) as HeroId[];
    const hero = heroes.sort((p, q) => textWidth(ghostName({ hero: q, wins: 10, lives: 10 }), "3") - textWidth(ghostName({ hero: p, wins: 10, lives: 10 }), "3"))[0];
    const name = ghostName({ hero, wins: 10, lives: 10 });
    const { s, game } = duskAgainst(day, { name, hero, source: "online" });
    setSession(null);
    const rp = new ReplayScreen(game, s, s.arena.b, { day, foe: name });
    for (let i = 0; i < 30; i++) rp.update(DT);
    const f = rp.arena.b.sides[1];
    f.shield = SHIELD_CAP;
    f.plate.plate = platingMax(f);
    rec.text.length = 0;
    rp.draw(fakeCanvas().getContext());
    const calls = rec.text.slice(), r = rp.L.plates[1], info = rp.plateRows[1]!, o = rowIn(rp.arena, 1, r);
    const fit = fitLead(o, name);
    expect(plateRow({ ...o, lead: textWidth(name, "3") }).bar.w, "the base drew it under 9 px").toBeLessThan(LEAD_BAR);
    expect([info.lead.tag, info.lead.name, info.bar.x, info.bar.w]).toEqual([null, fit.name, fit.row.bar.x, Math.max(0, fit.row.bar.w)]);
    expect(fit.step).toBe("cut");
    // the expected string: a cut inside a part made only of letters ("GHOST · METR.") stays as run 1 drew it
    const run1 = prevFit(o, name);
    expect(info.lead.name, "as run 1 drew it").toBe(run1.name);
    expect(endOf(name, info.lead.name), "a letters cut").toBe("letters");
    expect(info.lead.name.startsWith(`GHOST · ${HEROES[hero].name.slice(0, CUT_KEEP)}`)).toBe(true);
    const ty0 = r.y + Math.floor((r.h - 5) / 2);
    expect(calls.filter((q) => q.y === ty0 && q.x >= r.x && q.x < r.x + r.w).find((q) => q.color === C.red)?.s).toBe(fit.name);
    expect(info.bar.w).toBeGreaterThanOrEqual(LEAD_BAR);
    const targets = rp.counters.last.targets.filter((t) => t.id === "cnt:plate1");
    expect(targets.length).toBe(1);
    expect(targets[0].r.h).toBeGreaterThanOrEqual(tapPx(game.view));
    expect(holds(targets[0].r, info.bar.x, info.bar.y + 1)).toBe(true);
    console.log(`PANELFIT (c) the replay's foe label on a day-${day} phone: "${name}" -> "${info.lead.name}", bar ${info.bar.w} px; tap target ${JSON.stringify(targets[0].r)}`);
  });
});
