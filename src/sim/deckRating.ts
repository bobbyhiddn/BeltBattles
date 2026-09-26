// The deck rating the par player reads (FB-C, REQ-BFG-026): what the build screen shows about a deck, as one number.
// It lives beside deck.ts, not in src/sim/harness: like the build screen's inspector (screens/build/inspector.ts) it
// reads each placed part's effect at its stars through the game's own stars.ts, and the harness guard
// (tests/harness.mods.test.ts: no src/sim/harness file reads star values itself) keeps every harness file off that
// path. Nothing in the game imports it; the balance harness's par player (src/sim/harness/player.ts) does.

import { BURN_TIME, HEROES, ITEMS } from "./content";
import { connectorClaims, itemByUid, occupancy, rigHits, routeInfo, walkRoute, type Build, type RigHit } from "./deck";
import { gearStats } from "./battle";
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

interface Feed { arrival: number; eq: number; first: number; ride: number }

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
 */
export function rateDeck(b: Build): DeckRating {
  const h = HEROES[b.hero];
  const hits = rigHits(b), claims = connectorClaims(b), occ = occupancy(b);
  const outs = new Map<number, number>();
  for (const r of b.routes) outs.set(r.factory, (outs.get(r.factory) ?? 0) + 1);
  const feeds: Feed[][] = h.turrets.map(() => []);
  const longest = h.turrets.map(() => 0);
  let repair = 0;
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
    feeds[info.turret].push({ arrival, eq, first: est.time, ride: est.ride });
    longest[info.turret] = Math.max(longest[info.turret], r.cells.length);
    repair += arrival * x.repair;
  });
  let offense = 0;
  h.turrets.forEach((td, t) => {
    const fs = feeds[t];
    if (!fs.length) return;
    const g = gearStats(b, t), core = resolveCore(b, t, td);
    let interval = (b.hero === "furnace" && longest[t] >= 8 ? 0.72 : td.fireInterval) * g.fireMul; // battle.ts makeTurret
    if (core.spec.intervalMul) interval *= core.spec.intervalMul;
    const cap = g.perShot / interval;
    const arrival = fs.reduce((s, f) => s + f.arrival, 0);
    const noJam = g.noJam || !!core.spec.noJam;
    const thr = arrival <= cap ? arrival : cap * (noJam ? 1 : 0.85);
    let eq = fs.reduce((s, f) => s + f.arrival * f.eq, 0) / arrival;
    if (g.longRideFlat) eq += g.longRideFlat * fs.filter((f) => f.ride >= g.longRideMin).reduce((s, f) => s + f.arrival, 0) / arrival;
    let mult = 1 + (g.finisher ? g.finisher / (td.window + g.window) : 0);
    if (core.bought) mult *= 1 + NOMINAL * valueOf(core.def, core.stars);
    for (const m of b.mods) {
      if (m.turret !== t || ITEMS[m.def]?.kind !== "mod") continue;
      const md = effectAt(m.def, starsOf(m)).mod ?? {};
      if (!md.fireMul && !md.perShot && !md.finisher && !md.longRideFlat) mult *= 1 + NOMINAL * valueOf(m.def, starsOf(m));
    }
    const first = Math.min(...fs.map((f) => f.first));
    offense += thr * eq * mult * Math.max(0.1, (FIGHT_T - first) / FIGHT_T);
  });
  const defense = h.hull + b.hullBonus + repair * FIGHT_T * 0.5;
  return { offense, defense, value: offense * defense };
}
