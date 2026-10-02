// 0.8.0 I1 M4 (REPORT-A1 5.2; VERIFIED-A1 section G, item 1): A1's twelve battle moments, each read from P1's sim state
// and handed to A1's art (wave3Art.ts) as its state argument. State the sim keeps is read straight off it (a TWIN GAUGE
// hit's E6 mark, the working rigs on PINCER's tile, a TWIN LATCH's hold, a STOKER's factories, the plating pool, the
// turret's plated flag and SPALL CATCHER's charge, ARMOR PRESS's plating timer); a moment that is an event (an E2 pair,
// BRACE FRAME's cut, TWIN LATCH's release, PLATE BREAKER's blow, an ANVIL BREECH shot) keeps a display timer here, which
// the arena sets from that event (arenaReact.ts) and runs down (arena.ts). Read only: nothing here writes the sim, so a
// battle played on screen ends exactly as simulate() (tests/arena.test.ts). In the build view (no sim) TWIN GAUGE and
// PINCER show what the deck gives them (cruiser.ts cruiserModel: a matched belt; the other rigs on PINCER's tiles, every
// rig online there), every other wave-3 part its plain look; a STOKER's factories flare there too.
import type { FactoryState, GateState, SideState, TurretState } from "../sim/battle";
import type { Build } from "../sim/deck";
import { ITEMS } from "../sim/content";
import type { Wave3FactoryState, Wave3GearState, Wave3RigState } from "./wave3Art";

/** The arena's display timers for wave 3's event moments, per side (arena.ts SideFx.w3). The sim never reads them. */
export interface Wave3Fx {
  /** Per turret slot: seconds since its last E2 `pair` event (TWIN TRIGGER's lamp, SEAM WELDER's seam); Infinity before. */
  pairAge: Float32Array;
  /** Per turret slot: seconds since its last shot from an ANVIL BREECH (`fire` with core "anvil"); Infinity before. */
  anvilAge: Float32Array;
  /** BRACE FRAME uid -> seconds left on its shrug, from its `brace` event (it cut an enemy stall, freeze or slow). */
  shrug: Map<number, number>;
  /** TWIN LATCH uid -> seconds left on its release pose, from its `release` event. */
  release: Map<number, number>;
  /** PLATE BREAKER uid -> whether its last blow took a plating (its `process` right after a -1 E1 `plate` event). */
  spent: Map<number, boolean>;
  /** ARMOR PRESS uid -> seconds since its last plating press (its plateTimer wrapped round), and the timer last seen. */
  pressAge: Map<number, number>;
  pressTimer: Map<number, number>;
}

/** How long BRACE FRAME's bolts glow after a cut, and TWIN LATCH's fingers stay down after a release (s). */
export const SHRUG_TIME = 0.3;
export const RELEASE_TIME = 0.25;
/** ANVIL BREECH's spark burst: 3 frames of 0.1 s (wave3Art.ts anvilSparks). */
export const ANVIL_TIME = 0.3;

export function newWave3Fx(slots: number): Wave3Fx {
  return {
    pairAge: new Float32Array(slots).fill(Infinity), anvilAge: new Float32Array(slots).fill(Infinity),
    shrug: new Map(), release: new Map(), spent: new Map(), pressAge: new Map(), pressTimer: new Map(),
  };
}

/** Run the timers on by `dt` (the arena's render seconds) and read ARMOR PRESS's presses off the sim: its plateTimer
 *  counts down to 0, then grows by `every` as the press plates the hull (Battle.pressPlate), so a timer that grew since
 *  the last frame pressed. */
export function tickWave3Fx(w: Wave3Fx, s: SideState, dt: number): void {
  for (let i = 0; i < w.pairAge.length; i++) {
    w.pairAge[i] += dt;
    w.anvilAge[i] += dt;
  }
  for (const m of [w.shrug, w.release]) {
    for (const [k, t] of m) {
      if (t - dt > 0) m.set(k, t - dt);
      else m.delete(k);
    }
  }
  for (const [k, t] of w.pressAge) w.pressAge.set(k, t + dt);
  for (const f of s.factories) {
    if (f.plateTimer === undefined) continue;
    const last = w.pressTimer.get(f.uid);
    if (last !== undefined && f.plateTimer > last + 1e-9) w.pressAge.set(f.uid, 0);
    w.pressTimer.set(f.uid, f.plateTimer);
  }
}

/** A rig, factory or turret at work: online, not stalled, frozen or wrecked (the sim's own test, Battle.latchWorks). */
const works = (g: GateState): boolean => g.online && !g.wrecked && g.disrupted <= 0 && g.frozen <= 0;

/** E5 in battle: the other working rigs on the tile of each of PINCER `g`'s hits, the most of them (Battle.crossfire). */
export function crowdOf(s: SideState, g: GateState): number {
  let most = 0;
  for (const h of g.hits) {
    let n = 0;
    for (const o of s.routes[h.route]?.gateAt[h.tile] ?? []) if (o.g !== g && works(o.g)) n++;
    most = Math.max(most, n);
  }
  return most;
}

/**
 * The state A1's art takes for wave-3 rig `def` (uid) in battle (`gs` and `s`, with the arena's timers `w3`); in the
 * build view (no gs) what the deck gives it (`built`: cruiserModel's matched and crowd). {} for every other rig and for
 * a wave-3 rig with nothing to show, which then draws exactly as gateSprite.
 */
export function rigMoment(def: string, uid: number, gs: GateState | null, s: SideState | undefined, w3: Wave3Fx | undefined,
  built: Wave3RigState = {}): Wave3RigState {
  const st: Wave3RigState = {};
  if (!gs || !s) {
    if (def === "twingauge" && built.matched) st.matched = true;
    if (def === "pincer" && built.crowd) st.crowd = built.crowd;
    return st;
  }
  switch (def) {
    case "twingauge": // E6: a hit on a matched belt (Battle.makeSide's per-hit mark)
      if (gs.hits.some((h) => h.matched)) st.matched = true;
      break;
    case "pincer": { // E5: the other working rigs on its tile
      const n = crowdOf(s, gs);
      if (n > 0) st.crowd = Math.min(3, n);
      break;
    }
    case "braceframe": // its `brace` event: it just shortened an enemy stall, freeze or slow
      if (w3?.shrug.has(uid)) st.shrug = true;
      break;
    case "twinlatch": // E4: a release just now (its event), else a payload held (LatchState.held)
      if (w3?.release.has(uid)) st.latch = "release";
      else if (gs.latch?.held.some((x) => x)) st.latch = "hold";
      break;
    case "platebreaker": { // its last blow: a plating taken, or none to take (a plain blow)
      const spent = w3?.spent.get(uid);
      if (spent === false) st.spent = false;
      break;
    }
    case "shieldwall": // E1: the hull holds its threshold of plating (12)
      if (s.plate.plate >= (gs.def.gate?.plated?.min ?? 12)) st.plated = true;
      break;
  }
  return st;
}

/** STOKER's flare: factory `fs` has a working STOKER on it (E3: FactoryState.stokers, set only on a stoked factory). */
export function stokedNow(fs: FactoryState): boolean {
  return !!fs.stokers?.some((x) => works(x.g));
}

/** ARMOR PRESS's state: seconds since it last pressed plating (absent before its first press, or for any other id). */
export function factoryMoment(def: string, fs: FactoryState | null, w3: Wave3Fx | undefined): Wave3FactoryState {
  if (def !== "armorpress" || !fs || !w3) return {};
  const t = w3.pressAge.get(fs.uid);
  return t === undefined ? {} : { plateT: t };
}

/** A wave-3 gear piece's state on turret slot `slot` (TWIN TRIGGER and SEAM WELDER: seconds since its gun's last pair;
 *  SPALL CATCHER: its charge over its cap); {} for anything else, or in the build view. */
export function gearMoment(def: string, slot: number, ts: TurretState | undefined, w3: Wave3Fx | undefined): Wave3GearState {
  if (!ts) return {};
  if ((def === "twintrigger" || def === "seamwelder") && w3 && Number.isFinite(w3.pairAge[slot])) return { pair: w3.pairAge[slot] };
  if (def === "spallcatcher" && ts.spall) return { charge: (ts.spallCharge ?? 0) / ts.spall.max };
  return {};
}

/** STEAM BREECH's gauge: in the red while the turret's hull is plated (TurretState.plated, Battle.chambers). */
export const steamPlated = (ts: TurretState | undefined): boolean => !!ts?.plated;

/** 0.8.0 I1 M4: a hull that holds a source of plating besides BASTION's slugs (P1's E1: PLATE ROLLER and SHIELD WALL by
 *  their hits, ARMOR PRESS by its timer, SEAM WELDER by its gun's loads), so its plating strip shows (battleHud.ts). */
export function holdsPlating(b: Build): boolean {
  return b.items.some((p) => !!(ITEMS[p.def]?.gate?.plate || ITEMS[p.def]?.factory?.plate)) || b.mods.some((m) => !!ITEMS[m.def]?.mod?.seam);
}
