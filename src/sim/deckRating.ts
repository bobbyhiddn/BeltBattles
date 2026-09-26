// The deck rating the par player reads (FB-C, REQ-BFG-026): what the build screen shows about a deck, as one number.
// It lives beside deck.ts, not in src/sim/harness: like the build screen's inspector (screens/build/inspector.ts) it
// reads each placed part's effect at its stars through the game's own stars.ts, and the harness guard
// (tests/harness.mods.test.ts: no src/sim/harness file reads star values itself) keeps every harness file off that
// path. Nothing in the game imports it; the balance harness's par player (src/sim/harness/player.ts) does.

import { AMMO_SPACING, BELT_SPEED, BURN_TIME, HEROES, ITEMS } from "./content";
import {
  beltStateAt, connectorClaims, installedTurrets, itemByUid, joinOf, journeyTiles, occupancy, rigHits, routeInfo, walkRoute,
  type Build, type RigHit,
} from "./deck";
import { FURNACE_LONG_BELT, gearStats } from "./battle";
import { resolveCore } from "./cores";
import { effectAt, starsOf, valueOf } from "./stars";

/** Seconds in a typical dusk fight (the desk run's fights last 17-29 s): damage is weighed by how much of it lands. */
export const FIGHT_T = 25;

/**
 * Damage-equivalents per payload of the effects the route walk doesn't turn into damage, read off the cards:
 * Poison ticks 0.4/s per stack for up to 6 s (~3 per stack), a Fray stack adds 0.2 to each later hit (~3), a
 * shocked payload stalls a machine for 1.6 s, a static stall per second, LODESTONE's +1 per stalled machine, an
 * OVERCLOCKER doubling a rig every few seconds, TOLLBOOTH and SIFTER guards.
 */
export const EQ = { poison: 3, fray: 3, shock: 3, static: 4, perStalled: 1.5, overclock: 8, toll: 0.5, sift: 0.5 } as const;
/** A harassment round's damage-equivalent per payload (content.ts FactorySpec.round), from its card. */
export const ROUND_EQ: Readonly<Record<string, number>> = { sabot: 6, frost: 4, drag: 3, limpet: 8 };
/** Gear and cores whose effect the rating doesn't compute (HOPPER, MANTLET, FLAK, SPOTTER, every bought core): the
 *  turret's damage x (1 + NOMINAL x the part's value in gold), the typical player's "pricier is better". */
export const NOMINAL = 0.03;
/**
 * 0.6.2 CAND-A: the share of what reaches its intake a turret fires, by its load (arrivals / its nominal rate, perShot
 * / interval): all of it up to SAT_LO, falling in a straight line to SATURATED at SAT_HI and beyond. Jams (a backlog
 * of JAM_THRESHOLD skips a shot every JAM_COOLDOWN), the window it can't load while it fires, and joiners and
 * factories stalled behind the queue grow with the load. FB-C read a cliff (all below the rate, 0.85 of it above);
 * junction-062's bench decks fire 0.53-0.66 of the nominal rate when saturated (bench/joinbench.md), and with the
 * cliff the rating preferred its crowded layouts (F4 over F3L, W5 over W4 on day 7) that lose 1-13 points there.
 */
export const SATURATED = 0.7;
export const SAT_LO = 0.75, SAT_HI = 1.25;
/** The rating's saturation model: the load where firing starts to fall (satLo), where it bottoms out (satHi) and the
 *  share fired from there on (saturated). RATING_CURVE is the default; RATING_CLIFF is FB-C's rule (all of it up to
 *  the turret's rate, 0.85 of the rate above it), kept for bench comparisons (tools/parBench.ts --ablate). */
export interface RatingModel { satLo: number; satHi: number; saturated: number }
export const RATING_CURVE: Readonly<RatingModel> = { satLo: SAT_LO, satHi: SAT_HI, saturated: SATURATED };
export const RATING_CLIFF: Readonly<RatingModel> = { satLo: 1, satHi: 1, saturated: 0.85 };
/** The share a turret with load `rho` fires (1 for one that never jams). */
export const firedShare = (rho: number, noJam = false, m: Readonly<RatingModel> = RATING_CURVE): number =>
  noJam || rho <= m.satLo ? 1 : rho >= m.satHi ? m.saturated : 1 - ((1 - m.saturated) * (rho - m.satLo)) / (m.satHi - m.satLo);

interface Feed { route: number; arrival: number; eq: number; first: number; ride: number }

/** Per payload, the rig effects the walk leaves out (EQ), and the hull a RIVETER repairs per passing payload. */
function hitExtras(b: Build, hits: RigHit[][][], ri: number): { eq: number; repair: number } {
  let eq = 0, repair = 0;
  for (const tile of hits[ri] ?? []) {
    for (const h of tile) {
      const e = effectAt(h.def, starsOf(itemByUid(b, h.uid))).gate;
      if (!e) continue;
      if (e.poison) eq += EQ.poison * e.poison;
      if (e.fray) eq += EQ.fray * e.fray;
      if (e.staticTime) eq += EQ.static * e.staticTime;
      if (e.perStalled) eq += EQ.perStalled * e.perStalled.each;
      if (e.keg) eq += 0.5 * (e.keg.flat + BURN_TIME * e.keg.burn); // it blows at 8-12 s: about half the fight
      if (e.overclockCooldown) eq += EQ.overclock / e.overclockCooldown;
      if (e.toll) eq += EQ.toll * e.toll;
      if (e.sift) eq += EQ.sift;
      if (e.repair) repair += e.repair;
    }
  }
  return { eq, repair };
}

export interface DeckRating {
  offense: number; // damage-equivalent per second that lands in a FIGHT_T fight
  defense: number; // hull, plus what RIVETERs repair in half a fight
  value: number; // offense x defense: in a duel of steady damage, the side with the larger product wins
}

/**
 * What a player reads off the build screen, as one number. Per connected route: the walk's damage per payload
 * (deck.ts walkRoute, the inspector's DMG, BURN, SHOCK and TIME: Burn stacks count BURN_TIME each), plus EQ for the
 * effects the walk leaves out, times payloads per second (copies x batch / (the factory's interval x its routes,
 * which it feeds by turns)). Per turret: the payloads it can fire per second (perShot / interval, with E1's 0.72 s
 * FURNACE breech from an 8-tile belt, CALIBRATION and a core's cadence) cap the payloads that arrive (a backlog
 * jams: 85%), FINISHER RAM and LONGCASE add their share, gear and cores the rating can't compute add NOMINAL; the
 * whole is weighed by the share of a FIGHT_T fight left after the first payload arrives.
 * 0.6.2 CAND-A: the TURRET SLOTS as the battle fights them (deck.ts installedTurrets: a bought or replaced turret at
 * its stars, the extra slot's turret, every gear slot), E1's long belt on whatever turret it feeds (fireInterval x
 * FURNACE_LONG_BELT) counting a joining belt's whole journey (J14 (a)), and belt JOINS: a joining belt's walk goes on
 * through its main belt's rigs (walkRoute), its payloads load at the main belt's turret, and they enter the main belt
 * only into its gaps (J5: the main belt has right of way), so a main belt's join carries at most BELT_SPEED x its
 * speed there / AMMO_SPACING payloads a second, its own first.
 */
export function rateDeck(b: Build, model: Readonly<RatingModel> = RATING_CURVE): DeckRating {
  const h = HEROES[b.hero];
  const hits = rigHits(b), claims = connectorClaims(b), occ = occupancy(b);
  const outs = new Map<number, number>();
  for (const r of b.routes) outs.set(r.factory, (outs.get(r.factory) ?? 0) + 1);
  const feeds = new Map<number, Feed[]>(), longest = new Map<number, number>();
  const extras: number[] = [];
  b.routes.forEach((r, ri) => {
    const info = routeInfo(b, ri, claims, occ, hits);
    if (!info.connected || info.turret < 0) return;
    const f = itemByUid(b, r.factory);
    const spec = f && ITEMS[f.def]?.kind === "factory" ? effectAt(f.def, starsOf(f)).factory : undefined;
    if (!f || !spec) return;
    const interval = f.def === "mimic" ? (ITEMS[h.factory].factory?.interval ?? 1) * (spec.intervalMul ?? 1) : spec.interval;
    const est = walkRoute(b, ri, hits).estimate;
    const x = hitExtras(b, hits, ri);
    const arrival = (est.copies * (spec.batch ?? 1)) / (Math.max(0.1, interval) * (outs.get(r.factory) ?? 1));
    const eq = est.dmg + (spec.scrapFlat ?? 0) + BURN_TIME * est.burn + (est.shock ? EQ.shock : 0) + x.eq + (spec.round ? ROUND_EQ[spec.round.kind] ?? 0 : 0);
    const list = feeds.get(info.turret) ?? [];
    list.push({ route: ri, arrival, eq, first: est.time, ride: est.ride });
    feeds.set(info.turret, list);
    const tiles = info.join ? journeyTiles(b, ri, occ) : r.cells.length; // E1 (battle.ts makeTurret): its journey
    longest.set(info.turret, Math.max(longest.get(info.turret) ?? 0, tiles));
    extras[ri] = x.repair;
  });
  // J5: a main belt takes its joiners' payloads into its gaps, its own first; along the belt, joiners in tile order
  // (ties: the battle's order, the lower last-cell key first). A joiner gets what is left of the belt's flow at its join
  // tile, BELT_SPEED x the speed there / AMMO_SPACING payloads a second. (A chain's upstream joiners are not carried on.)
  const byRoute = new Map<number, Feed>();
  for (const list of feeds.values()) for (const f of list) byRoute.set(f.route, f);
  const byMain = new Map<number, { i: number; tile: number; last: number }[]>();
  b.routes.forEach((r, i) => {
    if (r.join === undefined || !byRoute.has(i)) return;
    const link = joinOf(b, i, occ);
    if (!link) return;
    const list = byMain.get(link.route) ?? [];
    list.push({ i, tile: link.tile, last: r.cells[r.cells.length - 1] });
    byMain.set(link.route, list);
  });
  for (const [m, list] of byMain) {
    list.sort((x, y) => x.tile - y.tile || x.last - y.last);
    let flow = byRoute.get(m)?.arrival ?? 0;
    for (const j of list) {
      const f = byRoute.get(j.i)!;
      const room = (BELT_SPEED * beltStateAt(b, m, j.tile, hits).speed) / AMMO_SPACING - flow;
      f.arrival = Math.max(0, Math.min(f.arrival, room));
      flow += f.arrival;
    }
  }
  let repair = 0;
  b.routes.forEach((_, ri) => { const f = byRoute.get(ri); if (f) repair += f.arrival * (extras[ri] ?? 0); });
  let offense = 0;
  for (const s of installedTurrets(b)) {
    const t = s.slot, td = s.td, fs = (feeds.get(t) ?? []).filter((f) => f.arrival > 0);
    if (!fs.length) continue;
    const g = gearStats(b, t), core = resolveCore(b, t, td);
    // battle.ts makeTurret: E1's long belt scales whatever turret it feeds, at that turret's stars
    let interval = td.fireInterval * (b.hero === "furnace" && (longest.get(t) ?? 0) >= 8 ? FURNACE_LONG_BELT : 1) * g.fireMul;
    if (core.spec.intervalMul) interval *= core.spec.intervalMul;
    const cap = g.perShot / interval;
    const arrival = fs.reduce((s, f) => s + f.arrival, 0);
    const noJam = g.noJam || !!core.spec.noJam;
    const thr = Math.min(arrival, cap) * firedShare(arrival / cap, noJam, model);
    // what each belt gets through the intake: all of it under the cap; over it, the belts that end at the intake fill
    // it first (a saturated main belt is dense, so its joiners find no gap, J5) and the joiners share what is left
    let flows = fs.map((f) => f.arrival);
    if (arrival > cap && fs.some((f) => b.routes[f.route].join !== undefined)) {
      const own = fs.reduce((s, f) => s + (b.routes[f.route].join === undefined ? f.arrival : 0), 0), joined = arrival - own;
      const so = own > cap ? cap / own : 1, sj = joined > 0 ? Math.max(0, Math.min(1, (cap - own * so) / joined)) : 0;
      flows = fs.map((f) => f.arrival * (b.routes[f.route].join === undefined ? so : sj));
    }
    const inflow = flows.reduce((s, v) => s + v, 0);
    let eq = fs.reduce((s, f, i) => s + flows[i] * f.eq, 0) / inflow;
    if (g.longRideFlat) eq += g.longRideFlat * fs.reduce((s, f, i) => s + (f.ride >= g.longRideMin ? flows[i] : 0), 0) / inflow;
    let mult = 1 + (g.finisher ? g.finisher / (td.window + g.window) : 0);
    if (core.bought) mult *= 1 + NOMINAL * valueOf(core.def, core.stars);
    for (const m of b.mods) {
      if (m.turret !== t || ITEMS[m.def]?.kind !== "mod") continue;
      const md = effectAt(m.def, starsOf(m)).mod ?? {};
      if (!md.fireMul && !md.perShot && !md.finisher && !md.longRideFlat) mult *= 1 + NOMINAL * valueOf(m.def, starsOf(m));
    }
    const first = Math.min(...fs.map((f) => f.first));
    offense += thr * eq * mult * Math.max(0.1, (FIGHT_T - first) / FIGHT_T);
  }
  const defense = h.hull + b.hullBonus + repair * FIGHT_T * 0.5;
  return { offense, defense, value: offense * defense };
}
