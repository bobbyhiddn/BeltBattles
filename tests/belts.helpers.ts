// bb-0.8.3 (REQ-BFG-042, job BELTS): helpers for tests/belts.*.test.ts. wideDeck: a deck with many intakes and a factory
// feeding n belts, laid by the harness's own path search (each the shortest path into the next free intake); tally: what a
// factory sends down each belt in a battle, its casts, the loads each turret takes and the fusions.
import { Rng } from "../src/core/rng";
import { HEROES, ITEMS, TICK, type HeroId } from "../src/sim/content";
import { cellsOf, type Build, type BuildTurret } from "../src/sim/deck";
import { isSignatureFactory, signatureOf, starField } from "../src/sim/stars";
import { blockedCells, freeConnectors, randomPath, shortestTiles, startCellsFor } from "../src/sim/harness/path";
import type { Battle } from "../src/sim/battle";
import { SEED, barge, run } from "./arsenal.bench";

export const K = (x: number, y: number): number => y * 10 + x;

/** Each playable hero's turrets with every slot filled by a turret that takes belts on both columns (on the WEAVER four
 *  different ones: two ★1 copies of one def would be an unfused pair), so a deck has 4 (FURNACE, BASTION), 6 (FOUNDRY)
 *  or 8 (WEAVER) intakes. */
export const WIDE_TURRETS: Record<"furnace" | "weaver" | "foundry" | "bastion", BuildTurret[]> = {
  weaver: ["twinneedle", "carronade", "deckgun", "swivel"].map((def, slot) => ({ slot, def, uid: 90 + slot })),
  furnace: [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 91 }],
  foundry: [{ slot: 0, def: "carronade", uid: 90, free: true }, { slot: 1, def: "carronade", uid: 91, free: true }, { slot: 2, def: "deckgun", uid: 92 }],
  bastion: [{ slot: 0, def: "rampart", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 91 }],
};

/**
 * `hero`'s wide deck (WIDE_TURRETS) with factory `def` (uid 7, at grade `stars`) at (4,6) and `n` belts out of it, each
 * the shortest path into the next free intake (harness path.ts; ties: the lower column; a seeded walk among the shortest
 * paths). A belt past the free intakes is a 1-tile stub beside the factory. The hero's signature factory (unless `def` is
 * a signature factory) is parked at (0,8) without belts. beltCap: the hero's belt + 14 crates; hullBonus `hull` (0: an
 * honest deck). METRONOME and SIPHON keep their starting layout. bb-0.8.3 (REQ-BFG-043 D10): a signature `def`'s grade is
 * the build's FACTORY level (build.upgrades.factory), never stars.
 */
export function wideDeck(hero: HeroId, def: string, stars: number, n: number, hull = 0): Build {
  const sig = isSignatureFactory(def); // the deck's own signature is `def` itself
  const wide = WIDE_TURRETS[hero as keyof typeof WIDE_TURRETS]; // METRONOME, SIPHON: their starting layout
  const b: Build = {
    hero, items: [...(sig ? [] : [{ uid: 1, def: signatureOf(hero), x: 0, y: 8 }]), { uid: 7, def, x: 4, y: 6, ...(sig ? {} : starField(stars)) }],
    routes: [], mods: [], beltCap: HEROES[hero].belt + 56, hullBonus: hull, ...(wide ? { turrets: wide.map((t) => ({ ...t })) } : {}),
    ...(sig && stars > 1 ? { upgrades: { factory: stars } } : {}),
  };
  const rng = new Rng(1234 + n);
  // SHAPES-1 flip: the start cells round the factory's own footprint (path.ts startCellsFor, deck.ts cellsOf; was
  // startCells(4, 6, 2, bl), a 2x2's): the same cells in the same order for a 2x2, and round the 2x3 GANTRY PRESS's six
  // cells (room for its 6 belts at ★3 and one more) and the I3 ASSEMBLY LINE's three
  const fp = cellsOf(b.items.find((p) => p.uid === 7)!);
  for (let i = 0; i < n; i++) {
    const bl = blockedCells(b), starts = startCellsFor(fp, bl);
    const cols = freeConnectors(b).map((c) => ({ c, len: shortestTiles(bl, starts, c) })).filter((x) => Number.isFinite(x.len)).sort((x, y) => x.len - y.len || x.c - y.c);
    let cells: number[] | null = null;
    for (const { c, len } of cols) if ((cells = randomPath(bl, starts, c, len, rng))) break;
    b.routes.push({ factory: 7, cells: cells ?? [starts[0]] });
  }
  return b;
}

export interface Tally {
  casts: number; // the factory's produce events (one a stamp, one a pour)
  produced: number; // payloads it put on its belts
  perRoute: number[]; // of those, on each route
  maxPerTick: number; // the most it put down on one tick
  stalled: number; // seconds it stood stalled (no room at any belt mouth)
  loads: Map<number, number>; // payloads each turret's chamber took (a fused pair once: load events minus fusions)
  fused: Map<number, number>; // FOUNDRY fusions at each turret (fuse events)
  fusions: number; // FOUNDRY fusions on side 0
  blanks: number; // blanks loaded on side 0 (races/foundry.ts FoundryState.blanksLoaded)
  bt: Battle;
}

/** Factory `uid`'s output on side 0 of `b` over `secs` against `foe` (the barge by default). */
export function tally(b: Build, uid = 7, secs = 30, foe: Build = barge(), seed = SEED): Tally {
  const perRoute = b.routes.map(() => 0), seen = new Set<number>(), loads = new Map<number, number>(), fused = new Map<number, number>();
  let casts = 0, produced = 0, maxPerTick = 0, stalled = 0;
  const bt = run(b, secs, foe, seed, (ev, battle) => {
    for (const e of ev) {
      if (e.side !== 0) continue;
      if (e.type === "produce" && e.factory === uid) casts++;
      if (e.type === "load") loads.set(e.turret, (loads.get(e.turret) ?? 0) + 1);
      if (e.type === "fuse") {
        loads.set(e.turret, (loads.get(e.turret) ?? 0) - 1);
        fused.set(e.turret, (fused.get(e.turret) ?? 0) + 1);
      }
    }
    let now = 0;
    for (const r of battle.sides[0].routes) for (const a of r.ammo) {
      if (a.p.factory !== uid || seen.has(a.p.id) || a.p.copy) continue;
      seen.add(a.p.id);
      perRoute[r.index]++;
      produced++;
      now++;
    }
    maxPerTick = Math.max(maxPerTick, now);
    if (battle.sides[0].factories.find((f) => f.uid === uid)?.stalled) stalled += TICK;
  });
  const fs = bt.sides[0].race?.foundry;
  return { casts, produced, perRoute, maxPerTick, stalled, loads, fused, fusions: fs?.fusions ?? 0, blanks: fs?.blanksLoaded ?? 0, bt };
}
