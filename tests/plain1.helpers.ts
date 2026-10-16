// PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1 step 2): shared helpers for the plain stat rigs' tests (not a test file itself).
// poolDigest reads only what the base already has (no plainRigs import), so the same function run at plain1-base gives
// the digest the switch-off tip must equal (BASE_POOL_DIGEST, measured there: tests/plain1.rules.test.ts).
import { createHash } from "node:crypto";
import { ITEMS, MERCHANTS, buyableModules, itemsSoldBy, type MerchantId } from "../src/sim/content";
import type { HeroId } from "../src/sim/content";
import { drawWares } from "../src/game/wares";
import { newRun } from "../src/game/run";
import { Battle } from "../src/sim/battle";
import type { Build } from "../src/sim/deck";
import { barge, SEED } from "./wave3.helpers";

/** A digest (sha256, 16 hex) of the catalogue, the shared pool, each merchant's stock, the per-run draw (seeds 1-40) and
 *  the first caravan of 40 runs (4 heroes x seeds 1-10): every pool and offer a switch could move. */
export function poolDigest(): string {
  const merchants = Object.keys(MERCHANTS) as MerchantId[];
  const heroes: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
  const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
  const body = {
    items: Object.keys(ITEMS),
    pool: buyableModules().map((d) => d.id),
    stock: merchants.map((m) => itemsSoldBy(m).map((d) => d.id)),
    wares: seeds.map((s) => drawWares(s)),
    shops: heroes.flatMap((h) => seeds.slice(0, 10).map((s) => newRun(h, s).shop)),
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
}

/** One snapshot of a payload past a tile: the numbers its rig hits wrote on it. */
export interface Past { id: number; flat: number; burn: number; shock: boolean; shockTime?: number; plate?: number }

/** Each side-0 payload once it has passed tile `tile` of route `route` (after `from` s), read the tick it first shows past
 *  that tile (wave3.helpers pastTile's rule, with the plain rigs' numbers). */
export function pastTilePlain(b: Build, route: number, tile: number, secs = 14, from = 6): Past[] {
  const bt = new Battle(b, barge(), SEED);
  const seen = new Set<number>();
  const out: Past[] = [];
  while (bt.t < secs && !bt.over) {
    bt.step();
    bt.drainEvents();
    if (bt.t <= from) continue;
    for (const a of bt.sides[0].routes[route].ammo) {
      // Battle: `processed`, the last tile whose hits applied; read while it sits between this tile and the next (each tile
      // takes many ticks), so a payload already further on is not read with the later tiles' hits
      if (a.processed !== tile || seen.has(a.p.id)) continue;
      seen.add(a.p.id);
      out.push({ id: a.p.id, flat: a.p.flat, burn: a.p.burn, shock: a.p.shock, shockTime: a.p.shockTime, plate: a.p.plate });
    }
  }
  return out;
}
