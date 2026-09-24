// beltside-062 (ref/BRIEF-beltside-merge-061.md "Measure"; ref/DESIGN-beltside.md §11 P2): the SPLITTER wrap bench.
// OBSERVE ONLY: no retune, and no balance assertion (the balance pass decides). One factory (the Kiln) and one belt
// wrapped round a T SPLITTER at (5,3), so its three arrows hit tiles 3, 5 and 7 of the same belt (R8: three splits),
// at 1, 2 and 3 stars, against the same deck with the SPLITTER placed for one hit ((5,1), rot 1: tile 5 only). A
// TEMPER (tile 1) and a GALVANIC COIL (tile 2), both 1 star, stand upstream so every copy's burn and shock show.
// The Kiln is held until every rig has commissioned, then 60 s are measured (steady state, no commissioning bias).
// BB_TABLES=1 prints the table (output-beltside/MERGE-061.md). The asserts below only pin the bench's geometry and the
// family size per stamp (what the P2 rule itself says), never a balance number.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { estimateRoute, hitsOfRig, key as K, rotField, type Build } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { barge, SEED } from "./arsenal.bench";

const WRAP = [K(6, 6), K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(5, 2), K(4, 2), K(4, 3), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)];
const SECS = 60;

/** The bench deck: the wrap (3 hits) or the 1-hit control, SPLITTER at `stars`; `mods` go on turret 0. */
export function wrapDeck(stars: number, wrap: boolean, mods: [string, number][] = []): Build {
  const st = stars > 1 ? { stars } : {};
  return {
    hero: "furnace", beltCap: 30, hullBonus: 5000,
    mods: mods.map(([def, s], i) => ({ uid: 20 + i, def, turret: 0, ...(s > 1 ? { stars: s } : {}) })),
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 },
      { uid: 10, def: "temper", x: 7, y: 5, ...rotField("temper", rotFacing("temper", 3)) }, // tile 1, from the east
      { uid: 11, def: "coil", x: 7, y: 4, ...rotField("coil", rotFacing("coil", 3)) }, // tile 2 (its other arrow idle)
      wrap ? { uid: 12, def: "splitter", x: 5, y: 3, ...st } : { uid: 12, def: "splitter", x: 5, y: 1, rot: 1, ...st },
    ],
    routes: [{ factory: 1, cells: WRAP }],
  };
}

export interface WrapRow {
  label: string;
  hits: number;
  family: number; // copies per stamp (estimateRoute)
  stamps: number; // per second
  split: number; // payloads leaving the last split tile per second
  loads: number; // payloads into the turret per second
  dps: number; // damage per second (hits and burn)
  hitDps: number; // damage per second from hits alone
  burnDps: number;
  pressure: number; // mean blocked payloads on the belt
  pressureMax: number;
  onBelt: number; // most payloads on the belt at once
  stall: number; // factory seconds unable to stamp in the 60 s
  jams: number;
  burnPerCopy: number; // mean burn stacks carried by a payload leaving the last split tile
  shockPerCopy: number; // share of those payloads that carry shock
  stallsDealt: number; // disrupt events on the foe per second (shock landing on its machines)
  msPerStep: number; // wall time per Battle.step (both sides), min of 3 runs
}

export function wrapRow(stars: number, wrap: boolean, mods: [string, number][] = []): WrapRow {
  const b = wrapDeck(stars, wrap, mods);
  const last = wrap ? 7 : 5; // the last split tile
  let best = Infinity;
  let row: WrapRow | undefined;
  for (let rep = 0; rep < 3; rep++) {
    const bt = new Battle(b, barge(), SEED);
    const s = bt.sides[0];
    const f = s.factories[0];
    f.timer = 1e9; // held until every rig is online
    while (!s.gates.every((g) => g.online || !g.hits.length)) {
      bt.step();
      bt.drainEvents();
    }
    f.timer = 0;
    const t0 = bt.t, stalled0 = s.stats.stalled, dmg0 = s.stats.damage, burn0 = s.stats.burnDealt, jams0 = s.stats.jams;
    const seen = new Set<number>();
    let loads = 0, burnSum = 0, shocked = 0, stallsDealt = 0, pressureSum = 0, pressureMax = 0, onBelt = 0, ticks = 0, ms = 0;
    while (bt.t < t0 + SECS && !bt.over) {
      const c0 = performance.now();
      bt.step();
      ms += performance.now() - c0;
      ticks++;
      for (const e of bt.drainEvents()) {
        if (e.type === "load" && e.side === 0) loads++;
        if (e.type === "disrupt" && e.side === 1) stallsDealt++;
      }
      const r = s.routes[0];
      for (const a of r.ammo) {
        if (a.processed < last || seen.has(a.p.id)) continue;
        seen.add(a.p.id);
        burnSum += a.p.burn;
        if (a.p.shock) shocked++;
      }
      pressureSum += r.pressure;
      pressureMax = Math.max(pressureMax, r.pressure);
      onBelt = Math.max(onBelt, r.ammo.length);
    }
    const secs = bt.t - t0;
    best = Math.min(best, ms / ticks);
    const dmg = s.stats.damage - dmg0, burn = s.stats.burnDealt - burn0;
    row = {
      label: `★${stars} ${wrap ? "wrap" : "1-hit"}${mods.length ? ` + ${mods.map(([d, n]) => `${d} ★${n}`).join(", ")}` : ""}`,
      hits: hitsOfRig(b, 12).length, family: estimateRoute(b, 0).copies,
      stamps: f.produced / secs, split: seen.size / secs, loads: loads / secs,
      dps: dmg / secs, hitDps: (dmg - burn) / secs, burnDps: burn / secs,
      pressure: pressureSum / ticks, pressureMax, onBelt, stall: s.stats.stalled - stalled0, jams: s.stats.jams - jams0,
      burnPerCopy: seen.size ? burnSum / seen.size : 0, shockPerCopy: seen.size ? shocked / seen.size : 0,
      stallsDealt: stallsDealt / secs, msPerStep: 0,
    };
  }
  row!.msPerStep = best;
  return row!;
}

const f = (x: number, d = 2) => x.toFixed(d);
/** One markdown table row (the header is WRAP_HEAD). */
export const wrapLine = (r: WrapRow): string =>
  `| ${r.label} | ${r.hits} | ${r.family} | ${f(r.stamps)} | ${f(r.split)} | ${f(r.loads)} | ${f(r.dps, 1)} | ${f(r.hitDps, 1)} | ${f(r.burnDps, 1)} | ` +
  `${f(r.pressure, 1)} (${r.pressureMax}) | ${r.onBelt} | ${f(r.stall, 1)} | ${r.jams} | ${f(r.burnPerCopy)} | ${f(r.shockPerCopy)} | ${f(r.stallsDealt)} | ${f(r.msPerStep, 4)} |`;
export const WRAP_HEAD =
  "| deck | hits | payloads/stamp | stamps/s | past last split /s | into turret /s | dps | hit dps | burn dps | belt pressure mean (max) | " +
  "on belt max | factory stall s | jams | burn/copy | shock/copy | foe stalls /s | ms/step |";

describe("P2 SPLITTER wrap bench (report only; BB_TABLES=1 prints)", () => {
  it("the wrap lands 3 hits and the control 1; a stamp becomes 8 / 8 / 27 payloads against 2 / 2 / 3", () => {
    for (const s of [1, 2, 3]) {
      expect(hitsOfRig(wrapDeck(s, true), 12).map((h) => h.tile)).toEqual([3, 5, 7]);
      expect(hitsOfRig(wrapDeck(s, false), 12).map((h) => h.tile)).toEqual([5]);
      expect(hitsOfRig(wrapDeck(s, true), 10).map((h) => h.tile)).toEqual([1]);
      expect(hitsOfRig(wrapDeck(s, true), 11).map((h) => h.tile)).toEqual([2]);
      expect(estimateRoute(wrapDeck(s, true), 0).copies).toBe(s === 3 ? 27 : 8);
      expect(estimateRoute(wrapDeck(s, false), 0).copies).toBe(s === 3 ? 3 : 2);
    }
  });

  it("the table (60 s against the target barge, seed 12345, after the rigs commission)", () => {
    if (!process.env.BB_TABLES) return;
    console.log(`WRAPTABLE ${WRAP_HEAD}`);
    for (const s of [1, 2, 3]) for (const w of [false, true]) console.log(`WRAPTABLE ${wrapLine(wrapRow(s, w))}`);
    for (const w of [false, true]) console.log(`WRAPTABLE ${wrapLine(wrapRow(3, w, [["chamber", 3]]))}`);
  });
});
