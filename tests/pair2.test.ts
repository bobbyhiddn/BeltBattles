// PAIR-2 (REQ-BFG-100; BRIEF-PAIR2): the counters' follow-up, display and tests only.
//  (b) The wind's first tick (CNT-DAY3 finding 7.2). battleHud.ts regenNow tested the float clock, b.t >= WIND_START, and
//      b.t is a hair under WIND_START on the wind's first tick; the wind's rule in Battle.heal tests the integer tick count.
//      So for one frame the REGEN badge showed a heal the wind had already taken. regenNow now tests the tick count, as
//      Battle.heal does, and nothing else in it (or in regenMax) changes. On a fight with a heal (MENDING LOOMs and GREEN
//      THREAD; GREEN THREAD alone), the frames before, at and after the wind's first tick (computed from WIND_START and
//      TICK as battle.ts computes it, never pinned): the badge shows exactly when Battle.heal would land a heal (a twin
//      fight asked to heal on that very tick), and on every whole second exactly when the second's heal lands.
//  (c) Q2's sim-built connector test (PAIR-1c, cap's ruling: a connector opens no panel of its own, oracle
//      ea629b18bbdf25e4). A rig made by hand with SHAPES on: WEAVER's start deck and an ASSEMBLY LINE (I3 with SHAPES on)
//      placed by hand at (3,1), turned upright, whose one-tile belt (2,1) joins route 1 at (1,1). Its fight is run as
//      bb.openFight runs one (a stored record replayed in a ReplayScreen, on a phone and on the desk). A connector's slugs
//      are counted one tile later, on the belt they join (cap's answer, oracle 1acb3705a9843fd4, replaces the brief's
//      "the joined belt's count includes them": the sim moves a slug onto the joined belt only as it leaves the
//      connector). On every frame a slug rides the connector: C5 draws no box on it and gives it no tap group; the joined
//      belt's box prints exactly that belt's own slug count; a tap on the connector opens no panel of its own (the
//      joined belt's or none). And each slug that rides the connector, by identity, is in exactly one of the two lists on
//      every tick from its first tick on the connector through the tick it leaves: the connector's while it rides, the
//      joined belt's (so its count) from the tick it leaves. Not vacuous: the rig puts a slug on the connector and
//      carries slugs across (the counts are the REPORT's, not pinned here).
// Everything is built here (start decks, hand-built rigs); never fights.json and never a par deck.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { fakeCanvas, fakeDom } from "./pair1.helpers";

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

import { GRID, TICK, WIND_START } from "../src/sim/content";
import { sustShown } from "../src/sim/hullScale";
import { joinOf, kx, ky, type Build } from "../src/sim/deck";
import { shapesRules } from "../src/sim/shapes";
import { footprintCells } from "../src/sim/foot";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { RUNES } from "../src/sim/runes";
import { ITEMS } from "../src/sim/content";
import type { BeltAmmo, Side } from "../src/sim/battle";
import { validateBuild } from "../src/net/validate";
import { battleRecordFor } from "../src/net/replay";
import { ICON, ICON_COLOUR } from "../src/render/font";
import { fmtCount, fmtDmg } from "../src/ui/statFormat";
import { textDay } from "../src/ui/fightDay";
import { UI } from "../src/ui/ui";
import { Arena } from "../src/game/arena";
import { openReplay } from "../src/game/replays";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleLayout, battleScale, laneLayout, type BattleLayout } from "../src/game/battleLayout";
import type { Game, Screen } from "../src/game/game";
import { BELT_COUNTS, beltShows } from "../src/game/counters";
import { drawPlate, regenMax, regenNow } from "../src/screens/battleHud";
import { CNT_REGION } from "../src/screens/battleCounters";
import { ReplayScreen } from "../src/screens/replay";

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

// ------------------------------------------------------------------------------- (c) the sim-built connector (Q2)

const K = (x: number, y: number): number => y * GRID + x;
/** The connector: the rig's fourth belt (route index 3, after the LOOM's three). */
const CONNECTOR = 3;
/** The rig, made by hand with SHAPES on: WEAVER's start deck (its LOOM's three belts: route 0 up x 4, route 1 left then up
 *  x 1, route 2 right then up x 8) and an ASSEMBLY LINE, I3 with SHAPES on, placed by hand at (3,1) and turned upright
 *  (rot 1: cells (3,1), (3,2), (3,3)) between routes 1 and 0. Its one belt is the one tile (2,1), joining route 1 at
 *  (1,1). */
function rig(): Build {
  const b = heroStartBuild("weaver", 1);
  b.items.push({ uid: 60, def: "assembly", x: 3, y: 1, rot: 1 });
  b.routes.push({ factory: 60, cells: [K(2, 1)], join: K(1, 1) });
  return b;
}
/** The foe: FURNACE's start deck. The seed: 7 (bb.openFight's default). */
const foeDeck = (): Build => heroStartBuild("furnace", 101);
const SEED = 7;
/** The fight as bb.openFight runs it (main.ts): the record of the two decks at the seed, replayed. */
function replayed(): ReturnType<typeof openReplay> & { ok: true } {
  const r = openReplay(battleRecordFor(rig(), foeDeck(), SEED));
  expect(r.ok, "the record replays").toBe(true);
  return r as ReturnType<typeof openReplay> & { ok: true };
}

/** tests/cntday's stand-in Game: a silent audio, a w x h view at DPR `dpr` (the battle's scale and grid), a UI and a
 *  recording canvas. */
const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
function fakeGame(w: number, h: number, dpr: number): Game {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silentAudio = new Proxy({}, { get: () => () => undefined });
  const g = { audio: silentAudio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: fakeCanvas() } as unknown as Game;
  (g as unknown as { go: (s: unknown) => void }).go = () => undefined;
  return g;
}
/** One frame as game.ts draws it: the screen's update (`dt` 0: none, a redraw in place), then the UI's regions rebuilt
 *  around the screen's draw, on a recording canvas. */
function frame(game: Game, sc: ReplayScreen, dt = 1 / 60): void {
  if (dt > 0) sc.update(dt);
  rec.text.length = 0;
  game.ui.begin();
  sc.draw(fakeCanvas().getContext());
  game.ui.end();
}
/** A tap at (x, y) routed as game.ts routes one (pointerDown: the screen's `pressed`, then the region pressed; pointerUp:
 *  its onTap), then the frame redrawn in place: the group the tap left open and the panel that frame shows (ids; null:
 *  none). The pointer then leaves the screen and the panel is closed again (test state), so each tap starts from none. */
function tapAt(game: Game, sc: ReplayScreen, x: number, y: number, kind: "touch" | "mouse"): { open: string | null; panel: string | null } {
  const ui = game.ui;
  Object.assign(ui.pointer, { x, y, down: true, kind });
  ui.pressed = null;
  const r = ui.hit(x, y);
  sc.pressed(x, y, r ? r.id : null);
  if (r) { if (r.onDown) r.onDown(x, y); else ui.pressed = r.id; }
  ui.pointer.down = false;
  const id = ui.pressed;
  ui.pressed = null;
  if (id) { const q = ui.hit(x, y); if (q && q.id === id && q.onTap) q.onTap(); }
  frame(game, sc, 0);
  const out = { open: sc.counters.open, panel: sc.counters.last.panel?.id ?? null };
  Object.assign(ui.pointer, { x: -1, y: -1 });
  sc.counters.open = null;
  return out;
}
/** A tile's centre on screen and its four corners 1 px in (logical px, through the camera: ArenaMotion.tileCentre, what a
 *  tap must hit), from its neighbours' centres, so a turned board turns them too. */
function tilePoints(sc: ReplayScreen, cell: number): [number, number][] {
  const m = sc.motion, a = sc.arena, x = kx(cell), y = ky(cell);
  const c = m.tileCentre(a, 0, x, y), cu = m.tileCentre(a, 0, x + 1, y), cv = m.tileCentre(a, 0, x, y + 1);
  const u = [cu[0] - c[0], cu[1] - c[1]], v = [cv[0] - c[0], cv[1] - c[1]];
  const k = Math.max(0, 0.5 - 1 / Math.max(2, Math.hypot(u[0], u[1])));
  return [c, ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => [c[0] + k * (i * u[0] + j * v[0]), c[1] + k * (i * u[1] + j * v[1])] as [number, number])];
}

describe("PAIR-2 (c) a sim-built connector: no box and no panel of its own; its slugs counted one tile later, on the belt they join", () => {
  let restore: () => void = () => undefined;
  beforeAll(() => { restore = fakeDom(); }); // the replay's canvases record (tests/cntday's); (b)'s raster comes back after
  afterAll(() => restore());

  it("the rig: SHAPES on, the I3 placed by hand, its one-tile belt joining route 1; a legal deck; in battle, a connector", () => {
    expect(shapesRules(), "0.9.9 ships SHAPES on").toBe(true);
    expect(ITEMS.assembly.foot, "ASSEMBLY LINE is I3 with SHAPES on").toBe("I3");
    const b = rig();
    expect(footprintCells(ITEMS.assembly, 3, 1, 1)).toEqual([K(3, 1), K(3, 2), K(3, 3)]);
    for (const day of [1, 7, 8]) expect(validateBuild(b, day), `a legal deck on day ${day}`).toEqual({ ok: true, errors: [] });
    const link = joinOf(b, CONNECTOR)!;
    expect(link, "a legal join").toBeTruthy();
    expect(link.route).toBe(b.routes.findIndex((r) => r.cells.includes(K(1, 1))));
    expect(link.tile).toBe(b.routes[link.route].cells.indexOf(K(1, 1)));
    const s = replayed().battle.sides[0], con = s.routes[CONNECTOR];
    expect(con.cells, "one tile").toEqual([K(2, 1)]);
    expect([con.join?.route, con.join?.tile, con.connected, con.turret]).toEqual([link.route, link.tile, false, -1]);
    expect(s.routes[link.route].join, "the belt it joins is no connector").toBeUndefined();
    expect(s.joiners?.map((r) => r.index)).toEqual([CONNECTOR]);
    console.log(`PAIR2 (c) the rig: WEAVER start + ASSEMBLY LINE (I3) at (3,1) rot 1 -> cells ${footprintCells(ITEMS.assembly, 3, 1, 1)}; route ${CONNECTOR} cells ${JSON.stringify(con.cells)} joins route ${link.route} at tile ${link.tile} (cell ${K(1, 1)}); join ${JSON.stringify(con.join)}, L ${con.L}`);
  });

  it("each slug that rides the connector is in exactly one of the two lists on every tick, the joined belt's from the tick it leaves", () => {
    const b = replayed().battle, s = b.sides[0], con = s.routes[CONNECTOR], main = s.routes[con.join!.route];
    const state = new Map<BeltAmmo, "riding" | "joined" | "gone">();
    let carried = 0, ridingTicks = 0, appear = 0, prev = 0, first = -1;
    while (!b.over && b.ticks < 120 * 60) {
      b.step();
      for (const q of con.ammo) if (!state.has(q)) state.set(q, "riding");
      for (const [q, st] of state) {
        const inC = con.ammo.includes(q), inM = main.ammo.includes(q), at = `tick ${b.ticks}`;
        expect(inC && inM, `${at}: never in both lists`).toBe(false);
        if (st === "riding") {
          if (inC) continue;
          expect(inM, `${at}: off the connector, straight into the joined belt's list (never in neither)`).toBe(true);
          state.set(q, "joined");
          carried++;
        } else if (st === "joined") {
          expect(inC, `${at}: never back on the connector`).toBe(false);
          if (!inM) state.set(q, "gone"); // on into its turret: counted on the joined belt while it rode it
        } else expect(inC || inM, `${at}: gone for good`).toBe(false);
      }
      const n = con.ammo.length;
      if (n > 0) { ridingTicks++; if (prev === 0) appear++; if (first < 0) first = b.ticks; }
      prev = n;
    }
    // not vacuous: the rig puts a slug on the connector and carries slugs across (the counts are the REPORT's)
    expect(ridingTicks, "ticks with a slug on the connector").toBeGreaterThan(0);
    expect(carried, "slugs carried across").toBeGreaterThan(0);
    console.log(`PAIR2 (c) per tick: the fight ends at tick ${b.ticks} (t ${b.t.toFixed(2)} s, winner ${b.winner}); a slug rides the connector on ${ridingTicks} ticks (${appear} appearances, the first at tick ${first}); ${state.size} slugs rode it, ${carried} carried across, each into route ${main.index}'s list on the tick it left`);
  });

  for (const [view, w, h, dpr, kind] of [["phone 402x690", 402, 690, 3, "touch"], ["desk 1920x1080", 1920, 1080, 1, "mouse"]] as const) {
    it(`${view}: on every frame a slug rides the connector, no box and no group on it, the joined belt's box is its own count, and a ${kind === "touch" ? "tap" : "click"} on it opens no panel of its own`, () => {
      const game = fakeGame(w, h, dpr), sc = new ReplayScreen(game, null as unknown as Screen, replayed().battle, { day: 8, foe: "FURNACE" });
      const a = sc.arena, s = a.b.sides[0], con = s.routes[CONNECTOR], main = s.routes[con.join!.route];
      const own = `${CNT_REGION}belt0:${CONNECTOR}`, joined = `${CNT_REGION}belt0:${main.index}`;
      expect(BELT_COUNTS, "C5's rule as shipped").toBe("all");
      let riding = 0, boxesDrawn = 0, joinedShown = 0, appear = 0, prev = 0, taps = 0;
      const opened = new Map<string, number>();
      for (let f = 0; f < 120 * 60 && !a.b.over; f++) {
        frame(game, sc);
        const n = con.ammo.length, d = sc.counters.last;
        if (n > 0 && !a.b.over) {
          riding++;
          expect(beltShows(s, con, BELT_COUNTS), "PAIR-1c's rule: no count on a one-tile joining belt").toBe(false);
          expect(d.belts.some((q) => q.side === 0 && q.route === CONNECTOR), `frame ${f}: no box on the connector`).toBe(false);
          expect(d.targets.some((t) => t.id === own), `frame ${f}: no tap group on the connector`).toBe(false);
          expect(game.ui.regions.some((q) => q.id === own), `frame ${f}: no region of its own`).toBe(false);
          if (d.belts.length) boxesDrawn++;
          const jb = d.belts.find((q) => q.side === 0 && q.route === main.index);
          if (jb) {
            joinedShown++;
            expect(jb.n, `frame ${f}: the joined belt's box prints exactly its own list`).toBe(main.ammo.length);
            expect(main.ammo.some((q) => con.ammo.includes(q)), "the riding slug is not on the joined belt yet").toBe(false);
          }
          if (prev === 0) { // each time a slug comes onto the connector: a tap on its centre and its four corners
            appear++;
            for (const [x, y] of tilePoints(sc, con.cells[0])) {
              const t = tapAt(game, sc, x, y, kind);
              taps++;
              const key = `${t.open ?? "none"}/${t.panel ?? "none"}`;
              opened.set(key, (opened.get(key) ?? 0) + 1);
              expect(t.open, `frame ${f} (${x.toFixed(1)}, ${y.toFixed(1)}): never the connector's own group`).not.toBe(own);
              expect(t.panel, `frame ${f} (${x.toFixed(1)}, ${y.toFixed(1)}): never a panel of its own`).not.toBe(own);
              // cap's ruling: the joined belt's panel, or none; any other group's would be a finding
              expect([null, joined], "the joined belt's panel or none").toContain(t.open);
              expect([null, joined], "the joined belt's panel or none").toContain(t.panel);
            }
          }
        }
        prev = n;
      }
      // not vacuous: slugs rode the connector while the board's boxes were drawn, the joined belt's among them, and taps ran
      expect(riding, "frames with a slug on the connector").toBeGreaterThan(0);
      expect(boxesDrawn, "frames with board boxes drawn while it rides").toBeGreaterThan(0);
      expect(joinedShown, "frames with the joined belt's box drawn while it rides").toBeGreaterThan(0);
      expect(taps).toBeGreaterThan(0);
      console.log(`PAIR2 (c) ${view}: a slug rides the connector on ${riding} frames (${appear} appearances); board boxes drawn on ${boxesDrawn} of them, the joined belt's (route ${main.index}, ${fmtCount(main.ammo.length)} now) on ${joinedShown}; ${taps} ${kind === "touch" ? "taps" : "clicks"} on its tile: ${[...opened].map(([k, v]) => `${k} x${v}`).join(", ")} (open/panel)`);
    });
  }
});
