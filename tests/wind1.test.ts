// WIND-1 (REQ-BFG-093; REQ-BFG-097 display half): the dark wind on BOTH carriers. Tests only: no sim change.
//  - the sim: past 40 s, both hulls lose exactly each tick's wind and their windTaken stay equal (silent decks, where nothing
//    else lands), and in a real seeded dusk both sides' windTaken stay equal at every step and sum the wind events;
//  - the display: the wind case spawns a number for side 0 AND side 1 on every wind event (anchors 0 and 1, the wind's own
//    colour, each hull's windDmg), also when the pool is full; both bars' wind flash is set; the DARK WIND callout starts once;
//  - where the numbers and the callout go: inside the screen, clear of both plates and the bar; the callout in the open floor,
//    over neither carrier, on the brief's views at CLOSE and at WIDE's zoom.
import { describe, expect, it } from "vitest";
import { Battle, type Side, type SimEvent } from "../src/sim/battle";
import { WIND_START, type HeroId } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";
import { setupRun } from "../src/tooling";
import { startDusk } from "../src/game/day";
import { battleSeed } from "../src/game/run";
import { Arena } from "../src/game/arena";
import { WIND_COLOUR, WIND_FLASH_TIME, react, windDmg, windLife } from "../src/game/arenaReact";
import { placeWindNumber } from "../src/game/arenaMotion";
import { battleLayout, battleScale, cameraFocus, laneLayout, type BattleLayout } from "../src/game/battleLayout";
import { WIND_CALL, WIND_CALL_SUB, floorOnScreen, windCallLayout } from "../src/screens/battleHud";
import { WIND_POP_MAX, type Popup } from "../src/render/fx";
import { C } from "../src/render/palette";
import { fmtDmg } from "../src/ui/statFormat";

type Box = { x: number; y: number; w: number; h: number };
const hits = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box, b: Box): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** A hero's starting deck with its belts cut: no turret ever loads, so only the wind moves a hull. */
const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });

/** A seeded dusk as bb.openDusk plays it: the set-up run's starting deck against its day's stand-in. BASTION day 1, seed
 *  12345 lasts 44.6 s (19 wind ticks); FURNACE's 38.9 s (13): scripts/wind1shots.mjs plays FURNACE's. */
function dusk(hero: HeroId, day: number, seed: number): { player: Build; enemy: Build; seed: number } {
  const run = setupRun({ hero, day, seed });
  const foe = startDusk(run, []);
  return { player: run.build, enemy: foe.build, seed: battleSeed(run) };
}

/** The pool's wind numbers spawned since `before` (the live ones then). */
function freshWind(a: Arena, before: Set<Popup>): Popup[] {
  const out: Popup[] = [];
  for (let i = 0; i < a.fx.popCount; i++) {
    const p = a.fx.popList[i];
    if (p.wind && !before.has(p)) out.push(p);
  }
  return out;
}

function live(a: Arena): Set<Popup> {
  const s = new Set<Popup>();
  for (let i = 0; i < a.fx.popCount; i++) s.add(a.fx.popList[i]);
  return s;
}

describe("WIND-1: the sim takes the wind from both hulls (tests only)", () => {
  it("silent decks past 40 s: each tick's dmg off both hulls, exactly, and both windTaken equal", () => {
    const bt = new Battle(silent("bastion", 1), silent("foundry", 101), 11);
    const [p, e] = bt.sides;
    expect(p.hull.max).not.toBe(e.hull.max); // two different hulls
    bt.events.length = 0;
    let ticks = 0;
    while (!bt.over && bt.t < 46) {
      const hp = [p.hull.hp, e.hull.hp];
      bt.step();
      for (const ev of bt.events) {
        if (ev.type !== "wind") continue;
        expect([hp[0] - p.hull.hp, hp[1] - e.hull.hp]).toEqual([ev.dmg, ev.dmg]);
        ticks++;
      }
      expect(e.stats.windTaken).toBe(p.stats.windTaken);
      bt.events.length = 0;
    }
    expect(bt.t).toBeGreaterThan(40);
    expect(ticks).toBeGreaterThanOrEqual(15);
    expect(p.hull.max - p.hull.hp).toBe(p.stats.windTaken);
    expect(e.hull.max - e.hull.hp).toBe(e.stats.windTaken);
  });

  it("a real seeded dusk past 40 s (BASTION day 1, seed 12345): both windTaken equal at every step and sum the wind events", () => {
    const d = dusk("bastion", 1, 12345);
    const bt = new Battle(d.player, d.enemy, d.seed, [0, 0]);
    let blown = 0, ticks = 0;
    while (!bt.over) {
      bt.step();
      for (const ev of bt.drainEvents()) if (ev.type === "wind") { blown += ev.dmg; ticks++; }
      expect(bt.sides[1].stats.windTaken).toBe(bt.sides[0].stats.windTaken);
    }
    expect(bt.t).toBeGreaterThan(40);
    expect(ticks).toBeGreaterThanOrEqual(15);
    expect(bt.sides[0].stats.windTaken).toBe(blown);
  });
});

describe("WIND-1: the wind's number on both carriers, every tick", () => {
  it("every wind event spawns a number for side 0 AND side 1 (anchors 0 and 1, the wind's colour, windDmg), both bars flash, the callout starts once", () => {
    const d = dusk("bastion", 1, 12345);
    const a = new Arena(d.player, d.enemy, d.seed, null, undefined, [0, 0]);
    let winds = 0, warned = false;
    for (let f = 0; f < 60 * 60 && !a.b.over; f++) {
      const before = live(a);
      const ev = a.update(1 / 60);
      if (ev.some((x) => x.type === "windwarn")) warned = true;
      if (warned) expect(a.windCallT).toBeGreaterThanOrEqual(0);
      const w = ev.filter((x): x is Extract<SimEvent, { type: "wind" }> => x.type === "wind");
      if (!w.length) continue;
      winds += w.length;
      const got = freshWind(a, before);
      expect(got.length).toBe(2 * w.length);
      for (const side of [0, 1] as Side[]) {
        const mine = got.filter((p) => p.side === side);
        expect(mine.length).toBe(w.length);
        for (const p of mine) {
          expect(p.color).toBe(WIND_COLOUR);
          expect(p.text).toBe(fmtDmg(windDmg(w[0], side)));
          expect(p.big).toBe(true);
        }
        // the bar's flash: set by the tick, then counted down by this frame's real time at most
        expect(a.sfx[side].windFlash).toBeGreaterThan(WIND_FLASH_TIME - 1 / 60 - 1e-9);
      }
    }
    expect(warned).toBe(true);
    expect(winds).toBeGreaterThanOrEqual(15);
    expect(WIND_COLOUR).toBe(C.windHit); // one source: palette.ts
  });

  it("a full pool never loses a wind number: each takes an ordinary number's slot", () => {
    const d = dusk("furnace", 1, 12345);
    const a = new Arena(d.player, d.enemy, d.seed, null, undefined, [0, 0]);
    for (let i = 0; i < 48; i++) {
      a.fx.anchor = i % 2;
      a.fx.popup(10 + i, 20, String(i), C.white);
    }
    expect(a.fx.popCount).toBe(48);
    a.fx.popup(0, 0, "X", C.white); // an ordinary number on a full pool is dropped, as before
    expect(a.fx.popCount).toBe(48);
    react(a, { type: "wind", dmg: 30 });
    expect(a.fx.popCount).toBe(48);
    const wind = a.fx.popList.slice(0, a.fx.popCount).filter((p) => p.wind);
    expect(wind.map((p) => p.side).sort()).toEqual([0, 1]);
    expect(wind.every((p) => p.text === "30" && p.color === WIND_COLOUR)).toBe(true);
    expect([a.sfx[0].windFlash, a.sfx[1].windFlash]).toEqual([WIND_FLASH_TIME, WIND_FLASH_TIME]);
    // the next tick takes ordinary slots again: the last tick's wind numbers stay
    react(a, { type: "wind", dmg: 40 });
    const wind2 = a.fx.popList.slice(0, a.fx.popCount).filter((p) => p.wind);
    expect(wind2.map((p) => p.text).sort()).toEqual(["30", "30", "40", "40"]);
  });

  it("windDmg is the event's dmg for both hulls; a wind number never outlives the next tick's at 0.5X-4X", () => {
    const e = { type: "wind" as const, dmg: 70 };
    expect([windDmg(e, 0), windDmg(e, 1)]).toEqual([70, 70]);
    for (const speed of [0.5, 1, 2, 4]) {
      const fxPerSim = (speed < 1 ? speed : Math.min(2, Math.max(1, speed * 0.75))) / speed; // Arena.update's effect clock
      expect(windLife(speed)).toBeLessThan(fxPerSim);
      expect(windLife(speed)).toBeLessThanOrEqual(WIND_POP_MAX);
      expect(windLife(speed)).toBeGreaterThan(0.45);
    }
  });
});

/** The brief's views (CSS px x DPR) and a few more, as battle.ts lays them out: logical W x H at the battle's scale. */
const VIEWS: [string, number, number, number][] = [
  ["p390", 390, 844, 3], ["p402", 402, 690, 3], ["l844", 844, 390, 3], ["d1920", 1920, 1080, 1],
  ["p360", 360, 640, 3], ["l667", 667, 375, 2], ["d1366", 1366, 768, 1], ["d1280", 1280, 720, 1],
];
function layoutOf(w: number, h: number, dpr: number): BattleLayout {
  const pw = w * dpr, ph = h * dpr, portrait = h > w;
  const s = battleScale(pw, ph, portrait);
  return laneLayout(battleLayout(Math.floor(pw / s), Math.floor(ph / s), portrait));
}

describe("WIND-1: where the numbers and the callout go", () => {
  it("a wind number is inside the screen and clear of both plates and the bar, on its hull or beside its plate", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const L = layoutOf(w, h, dpr), keep = { plates: L.plates, bar: L.bar };
      const pts: [number, number][] = [];
      for (const hb of L.hulls) for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0, 0.1, 0.5, 0.9, 1]) pts.push([hb.x + hb.w * fx, hb.y + hb.h * fy]);
      for (const r of [...L.plates, L.bar]) pts.push([r.x + r.w / 2, r.y + r.h / 2], [r.x + 2, r.y + 1]);
      pts.push([-40, L.H / 2], [L.W + 40, L.H / 2], [L.W / 2, -40], [L.W / 2, L.H + 40]);
      for (const side of [0, 1] as Side[]) {
        for (const [cx, cy] of pts) {
          for (const rise of [0, 16]) {
            const bw = 2 * 17 + 4, bh = 18; // "200" x2 with its outline
            const at = placeWindNumber(cx, cy, rise, bw, bh, L.W, L.H, keep, side);
            const box = { x: at.x, y: at.y, w: bw, h: bh };
            expect(inside(box, { x: 0, y: 0, w: L.W, h: L.H }), `${name} side ${side} at ${cx},${cy}`).toBe(true);
            for (const r of [...L.plates, L.bar]) expect(hits(box, r), `${name} side ${side} at ${cx},${cy} hits ${JSON.stringify(r)}`).toBe(false);
            if (at.beside) expect(Math.abs(box.x + bw / 2 - (L.plates[side].x + L.plates[side].w / 2))).toBeLessThanOrEqual(L.W);
          }
        }
        // on its own hull: a point on the hull's middle row keeps the number there (no plate or bar in the way)
        const hb = L.hulls[side], at = placeWindNumber(hb.x + hb.w / 2, hb.y + hb.h / 2, 0, 38, 18, L.W, L.H, keep, side);
        expect(at.beside).toBe(false);
        expect(hits({ x: at.x, y: at.y, w: 38, h: 18 }, hb)).toBe(true);
      }
    }
  });

  it("the DARK WIND callout sits in the open floor, over neither carrier, at CLOSE and at WIDE's zoom", () => {
    expect([WIND_CALL, WIND_CALL_SUB]).toEqual(["DARK WIND", "HITS BOTH HULLS"]);
    for (const [name, w, h, dpr] of VIEWS) {
      const L = layoutOf(w, h, dpr), [fx, fy] = cameraFocus(L);
      for (const z of [1, 0.75, 0.667, 0.6, 0.5]) {
        // a zoom about the focus: the camera's screen map at WIDE (FIELD-1 render/camera.ts), a scale and a shift
        const scr = { a: z, b: 0, c: 0, d: z, e: fx * (1 - z), f: fy * (1 - z) };
        const m = { camera: z === 1 ? null : ({} as never), scr };
        const floor = floorOnScreen(L, m);
        const { r } = windCallLayout(floor);
        expect(inside(r, floor), `${name} zoom ${z}`).toBe(true);
        expect(inside(r, { x: 0, y: 0, w: L.W, h: L.H })).toBe(true);
        for (const hb of L.hulls) {
          const on = { x: z * hb.x + scr.e, y: z * hb.y + scr.f, w: z * hb.w, h: z * hb.h };
          expect(hits(r, on), `${name} zoom ${z}: the callout over a carrier`).toBe(false);
        }
        for (const p of L.plates) expect(hits(r, p), `${name} zoom ${z}: over a plate`).toBe(false);
        expect(hits(r, L.bar)).toBe(false);
      }
    }
  });
});
