// PAIR-2 (REQ-BFG-100; BRIEF-PAIR2): the counters' follow-up, display and tests only.
//  (b) The wind's first tick (CNT-DAY3 finding 7.2). battleHud.ts regenNow tested the float clock, b.t >= WIND_START, and
//      b.t is a hair under WIND_START on the wind's first tick; the wind's rule in Battle.heal tests the integer tick count.
//      So for one frame the REGEN badge showed a heal the wind had already taken. regenNow now tests the tick count, as
//      Battle.heal does, and nothing else in it (or in regenMax) changes. On a fight with a heal (MENDING LOOMs and GREEN
//      THREAD; GREEN THREAD alone), the frames before, at and after the wind's first tick (computed from WIND_START and
//      TICK as battle.ts computes it, never pinned): the badge shows exactly when Battle.heal would land a heal (a twin
//      fight asked to heal on that very tick), and on every whole second exactly when the second's heal lands.
// Everything is built here (start decks, hand-built rigs); never fights.json and never a par deck.
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";

/** What the pass-through mock saw: every drawText call (the badge as drawn). tests/cntday3's. */
const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; color: string; align?: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, color, align: opts?.align });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { TICK, WIND_START } from "../src/sim/content";
import { sustShown } from "../src/sim/hullScale";
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { RUNES } from "../src/sim/runes";
import type { Side } from "../src/sim/battle";
import { ICON, ICON_COLOUR } from "../src/render/font";
import { fmtDmg } from "../src/ui/statFormat";
import { textDay } from "../src/ui/fightDay";
import { Arena } from "../src/game/arena";
import { battleLayout, battleScale, laneLayout, type BattleLayout } from "../src/game/battleLayout";
import type { Game } from "../src/game/game";
import { drawPlate, regenMax, regenNow } from "../src/screens/battleHud";

installRaster();
afterEach(() => { vi.restoreAllMocks(); });

// ------------------------------------------------------------------------------------------ (b) the wind's first tick

/** The wind's first tick on the integer tick count, computed as battle.ts computes WIND_TICKS (never pinned). */
const WIND_TICK = Math.round(WIND_START / TICK);
/** Ticks a second, as battle.ts TICKS_PER_SEC (REGEN heals on each whole second of the tick count). */
const PER_SEC = Math.round(1 / TICK);
const REGEN_COL = ICON_COLOUR[ICON.REGEN];

/** WEAVER's start deck with a MENDING LOOM on each turret (★1-3: REGEN 10 + 15 + 20) and GREEN THREAD (REGEN 10): 55 a
 *  second in day-1 units (tests/cntday2's and cntday3's loom deck). */
function loomDeck(): Build {
  const b = heroStartBuild("weaver", 1);
  b.mods = [...b.mods, { uid: 951, def: "mendingloom", turret: 0 }, { uid: 952, def: "mendingloom", turret: 1, stars: 2 }, { uid: 953, def: "mendingloom", turret: 2, stars: 3 }];
  b.runes = [{ id: "green_thread" }];
  return b;
}
/** WEAVER's start deck with GREEN THREAD and no loom (the rune's REGEN alone). */
const threadDeck = (): Build => ({ ...heroStartBuild("weaver", 1), runes: [{ id: "green_thread" }] });
/** A start deck with its belts cut: no turret ever loads, so nothing hits the other side (wind1's). */
const silent = (uid: number): Build => ({ ...heroStartBuild("furnace", uid), routes: [] });
/** `deck` on side 0 against a silent foe, on `day` (the battle screen's own constructor path: Arena(..., run.day)). */
const fightOf = (deck: () => Build, day: number | undefined): Arena => new Arena(deck(), silent(101), 11, null, undefined, undefined, day);

/** wind1's: a view's battle layout (CSS px x DPR), as battle.ts lays it out. */
function layoutOf(w: number, h: number, dpr: number): BattleLayout {
  const pw = w * dpr, ph = h * dpr, portrait = h > w;
  const s = battleScale(pw, ph, portrait);
  return laneLayout(battleLayout(Math.floor(pw / s), Math.floor(ph / s), portrait));
}
const VIEWS: readonly (readonly [string, BattleLayout])[] = [["phone 402x690", layoutOf(402, 690, 3)], ["desk 1920x1080", layoutOf(1920, 1080, 1)]];

/** The REGEN badge drawPlate draws on side 0's plate of `L` (REGEN's colour, right-aligned), or null. */
function badgeOf(a: Arena, L: BattleLayout): string | null {
  const r = L.plates[0];
  rec.text.length = 0;
  drawPlate(G(fresh(r.x + r.w + 4, r.y + r.h + 4)), { t: 0 } as unknown as Game, a, r, 0 as Side, "WEAVER", "");
  const b = rec.text.filter((c) => c.color === REGEN_COL && c.align === "right");
  expect(b.length, "at most one badge").toBeLessThanOrEqual(1);
  return b[0]?.s ?? null;
}

/** One step of side 0's fight with its hull held at half (room to heal: test state on the test's own Battle); what the
 *  step's REGEN did: the heal that landed (Battle.heal's events) and what the wind took (heals.windLost). */
function stepHurt(a: Arena): { landed: number; windLost: number } {
  const s = a.b.sides[0];
  s.hull.hp = Math.floor(s.hull.max / 2);
  const lost0 = s.heals?.windLost ?? 0;
  a.b.step();
  let landed = 0;
  for (const e of a.b.drainEvents()) if (e.type === "heal" && e.side === 0 && e.source === "regen") landed += e.amount;
  return { landed, windLost: (s.heals?.windLost ?? 0) - lost0 };
}

/** Battle.heal's own answer on tick `tick`: a twin of the fight, stepped the same way to that tick, asked to heal side 0
 *  by REGEN `n` (day-1 units, as sustainTick passes it). The heal it lands (0: none lands on that frame). */
function healsAt(deck: () => Build, day: number | undefined, tick: number, n: number): number {
  const t = fightOf(deck, day);
  while (t.b.ticks < tick) stepHurt(t);
  const s = t.b.sides[0];
  s.hull.hp = Math.floor(s.hull.max / 2);
  return t.b.heal(s, n, "regen");
}

describe("PAIR-2 (b) the REGEN badge on the wind's first tick", () => {
  it("the tick is computed: a whole second, where the float clock is still a hair under WIND_START", () => {
    expect(WIND_TICK).toBe(Math.round(WIND_START * PER_SEC));
    expect(WIND_TICK % PER_SEC, "a REGEN heal falls due on the wind's first tick").toBe(0);
    const a = fightOf(loomDeck, 7);
    while (a.b.ticks < WIND_TICK) a.b.step();
    expect(a.b.t, "the float clock on the wind's first tick (CNT-DAY3 7.2)").toBeLessThan(WIND_START);
    a.b.step();
    expect(a.b.t).toBeGreaterThanOrEqual(WIND_START);
  });

  for (const [label, deck, day] of [
    ["MENDING LOOMs + GREEN THREAD, day 7", loomDeck, 7],
    ["MENDING LOOMs + GREEN THREAD, no day", loomDeck, undefined],
    ["GREEN THREAD alone, day 10", threadDeck, 10],
  ] as const) {
    it(`${label}: before, at and after the wind's first tick the badge shows exactly when a heal lands`, () => {
      const a = fightOf(deck, day), s = a.b.sides[0];
      expect(textDay(a.b)).toBe(day);
      const n = regenNow(a, 0); // day-1 units, as Battle.sustainTick sums them
      expect(n).toBe(deck === loomDeck ? 10 + 15 + 20 + RUNES.green_thread.amount.n : RUNES.green_thread.amount.n);
      expect(regenMax(a, 0)).toBe(n);
      const shown = `+${fmtDmg(sustShown(n, day))}`; // the badge drawPlate prints (CNT-DAY2: the day's heal)
      const table: string[] = [];
      let lastLanded = 0, lostAtWind = 0, wholeSeconds = 0, clockOnly = 0;
      for (let k = 1; k <= WIND_TICK + PER_SEC; k++) {
        const got = stepHurt(a);
        expect(a.b.ticks).toBe(k);
        const inWind = a.b.ticks >= WIND_TICK, now = regenNow(a, 0);
        // regenNow agrees with the wind's own rule on every frame; the badge, drawn on each whole second and on every frame
        // from a second before the wind to a second into it, on both views, too
        expect(now, `tick ${k}`).toBe(inWind ? 0 : n);
        const drawn = k % PER_SEC === 0 || Math.abs(k - WIND_TICK) <= PER_SEC;
        const badges = drawn ? VIEWS.map(([, L]) => badgeOf(a, L)) : [];
        for (const b of badges) expect(b, `tick ${k}`).toBe(inWind ? null : shown);
        // the float clock and the tick count disagree on one frame only: the wind's first tick
        if ((a.b.t >= WIND_START) !== inWind) { clockOnly++; expect(k).toBe(WIND_TICK); }
        // each whole second: the badge shows exactly when that second's heal lands
        if (k % PER_SEC === 0) {
          wholeSeconds++;
          expect(got.landed > 0, `tick ${k}: a heal lands`).toBe(badges[0] !== null);
          if (got.landed > 0) { expect(`+${fmtDmg(got.landed)}`, `tick ${k}: the badge is the heal`).toBe(badges[0]); lastLanded = k; }
          if (k === WIND_TICK) lostAtWind = got.windLost;
        } else expect(got.landed + got.windLost, `tick ${k}: no heal falls due`).toBe(0);
        if (k === WIND_TICK - PER_SEC || (k >= WIND_TICK - 1 && k <= WIND_TICK + 1)) {
          const twin = healsAt(deck, day, k, n);
          expect(twin > 0, `tick ${k}: Battle.heal lands a heal exactly when the badge shows`).toBe(badges[0] !== null);
          const at = k === WIND_TICK - PER_SEC ? "last heal" : k < WIND_TICK ? "before" : k === WIND_TICK ? "AT" : "after";
          table.push(`${at.padEnd(9)} tick ${k} t ${a.b.t} | heal landed ${got.landed} windLost +${got.windLost} | Battle.heal now ${twin} | regenNow ${now} | badge ${badges.map((b) => b ?? "none").join("/")}`);
        }
      }
      expect(lastLanded, "the last heal lands a second before the wind").toBe(WIND_TICK - PER_SEC);
      expect(lostAtWind, "the wind takes the second's heal on its first tick").toBe(sustShown(n, day));
      expect(clockOnly, "the old float-clock test missed exactly one frame").toBe(1);
      expect(wholeSeconds).toBe(WIND_TICK / PER_SEC + 1);
      expect(s.hull.hp).toBeGreaterThan(0);
      console.log(`PAIR2 (b) ${label} (badge ${shown}; phone/desk):\n${table.join("\n")}`);
    });
  }
});
