// 0.8.0 P1 (wave 3 built): shared decks and battle helpers for the wave-3 tests (not a test file itself): the engine
// pieces (tests/wave3.engine.test.ts), the 15 modules (tests/wave3.modules.test.ts) and the six heroes
// (tests/wave3.inert.test.ts). Wave-3 parts resolve in ITEMS whatever the switch, so battles need no withWave3; only
// legality (validateBuild) and catalogue listings do.
import { Battle, type SimEvent } from "../src/sim/battle";
import { key, rotField, type Build, type Placed } from "../src/sim/deck";

export const K = key;
export const SEED = 12345;
const starField = (s: number) => (s > 1 ? { stars: s } : {});

/** A placed item (a rig takes `rot`, written only when it isn't 0). */
export function item(uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed {
  return { uid, def, x, y, ...rotField(def, rot), ...starField(stars) };
}

/** The target barge: a WEAVER with hull + 5000 and no belts, so it never fires. */
export const barge = (): Build => ({ hero: "weaver", items: [{ uid: 1, def: "loom", x: 4, y: 5 }], routes: [], mods: [], beltCap: 24, hullBonus: 5000 });

/** The FURNACE bench (tests/arsenal.bench.ts): the Kiln at (4,6) on a straight 6-tile belt up column 4 into the heavy
 *  gun's connector 4; hull + 5000 so a fight runs its full length. */
export function furnaceBench(hullBonus = 5000): Build {
  return {
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }],
    routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    mods: [], beltCap: 30, hullBonus,
  };
}

/**
 * Two STAMP PRESSes into FURNACE's heavy gun: press A (uid 2) at (2,6) on a 7-tile belt, (3,5) then up column 4 into
 * connector 4; press B (uid 3) at (6,6) on (6,5), (5,5) then up column 5 into connector 5 (7 tiles). The Kiln (uid 1) is
 * parked off any belt at (0,8). Both presses stamp on the same ticks, so the equal belts bring their slugs to the gun
 * together. `longB`: press B stands at (7,6) and its belt starts at (7,5), one tile longer (8: its slugs 0.4 s later).
 */
export function twoPress(longB = false, hullBonus = 5000): Build {
  const a = [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
  const b = [...(longB ? [K(7, 5)] : []), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)];
  return {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 0, y: 8 }, { uid: 2, def: "press", x: 2, y: 6 }, { uid: 3, def: "press", x: longB ? 7 : 6, y: 6 }],
    routes: [{ factory: 2, cells: a }, { factory: 3, cells: b }],
    mods: [], beltCap: 30, hullBonus,
  };
}

/**
 * The latch deck: press A (uid 2) at (2,6) on a 7-tile belt up column 3, then into connector 4 at row 1
 * ((3,5)..(3,1), (4,1), (4,0)); press B (uid 3) at (6,6) on (6,5), (5,5) and up column 5 into connector 5 (7 tiles).
 * The cell (4,3) between columns 3 and 5 is free: a II rig there at rot 0 hits A's tile 2 ((3,3), its west arrow) and
 * B's tile 3 ((5,3), its east arrow). `onlyA` leaves press B off its belt (nothing ever reaches B).
 */
export function latchDeck(onlyA = false, hullBonus = 5000): Build {
  const b: Build = {
    hero: "furnace",
    items: [{ uid: 1, def: "kiln", x: 0, y: 8 }, { uid: 2, def: "press", x: 2, y: 6 }, { uid: 3, def: "press", x: 6, y: 6 }],
    routes: [
      { factory: 2, cells: [K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 3, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ],
    mods: [], beltCap: 30, hullBonus,
  };
  if (onlyA) b.routes.pop();
  return b;
}

/** Step a battle until `secs` (or its end), handing every tick's events to `on`. */
export function run(b: Build, secs = 30, foe: Build = barge(), seed = SEED, on?: (ev: SimEvent[], bt: Battle) => void): Battle {
  const bt = new Battle(b, foe, seed);
  while (bt.t < secs && !bt.over) {
    bt.step();
    const ev = bt.drainEvents();
    if (on) on(ev, bt);
  }
  return bt;
}

/** Every event of side `side` (or of either side when undefined) of a battle, with the tick time. */
export function events(b: Build, secs = 30, foe: Build = barge(), seed = SEED): { t: number; e: SimEvent }[] {
  const out: { t: number; e: SimEvent }[] = [];
  run(b, secs, foe, seed, (ev, bt) => { for (const e of ev) out.push({ t: bt.t, e }); });
  return out;
}

/** Each payload's flat bonus (and ride) once it has passed tile `tile` of route `route` on side 0, after `from` s: one
 *  entry per payload, read the tick it first shows past that tile. */
export function pastTile(b: Build, route: number, tile: number, secs = 10, from = 4, foe: Build = barge(), seed = SEED): { flat: number; ride: number; id: number; factory: number }[] {
  const seen = new Set<number>();
  const out: { flat: number; ride: number; id: number; factory: number }[] = [];
  run(b, secs, foe, seed, (_ev, bt) => {
    if (bt.t <= from) return;
    for (const a of bt.sides[0].routes[route].ammo) {
      if (a.processed < tile || seen.has(a.p.id)) continue;
      seen.add(a.p.id);
      out.push({ flat: a.p.flat, ride: a.p.ride, id: a.p.id, factory: a.p.factory });
    }
  });
  return out;
}

/** A deck with one more item. */
export function withItem(b: Build, p: Placed): Build {
  return { ...b, items: [...b.items, p] };
}

/** A deck with one more turret module (gear or core) on turret slot `turret`. */
export function withMod(b: Build, uid: number, def: string, turret = 0, stars = 1): Build {
  return { ...b, mods: [...b.mods, { uid, def, turret, ...starField(stars) }] };
}
