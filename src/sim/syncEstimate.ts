// 0.8.0 H1 M3 (REQ-BFG-011): FOUNDRY's SYNC estimate, for the route inspector's SYNC mark and the deck's. Display only:
// no battle code calls it, and it reads the build as walkRoute does (docs/RACES.md section 1, "Getting synchronized
// blanks legitimately"). The CRUCIBLE pours a blank onto each of its belts on the same tick (races/foundry.ts
// crucibleProduce), so two of its belts that end at one turret through different intakes deliver their blanks the
// difference of their stamp-to-chamber times apart (walkRoute's estimate: nothing backed up, every rig online). The
// sync rule (inSync) fuses two blanks that load within SYNC_WINDOW of each other through different intakes. A delay
// line counts too: a belt longer by a whole pour meets the next pour's blank, so the gap is measured to the nearest
// whole number of pours (loadEvery: the pour, at the factory's JOIN PACE). A belt that joins another loads through
// the intake at the end of its chain, as the sim loads it, so it never fuses with a blank on that belt.

import { itemByUid, loadEvery, routeInfo, walkRoute, type Build } from "./deck";
import { effectAt, starsOf } from "./stars";
import { SYNC_WINDOW } from "./races/foundry";

const EPS = 1e-6;

/** Another CRUCIBLE belt into the same turret through a different intake. */
export interface SyncPartner {
  route: number;
  /** Seconds between the two blanks of one pour reaching the chamber (both stamp-to-chamber times apart). */
  gap: number;
  /** The whole pours the gap is closest to: 0 the same pour, 1 or more a delay line meeting a later pour's blank. */
  pours: number;
  /** Seconds from that whole number of pours: the arrival gap the sync rule sees. */
  offset: number;
  /** offset is within SYNC_WINDOW: their blanks fuse. */
  sync: boolean;
}

export interface SyncInfo {
  route: number;
  turret: number;
  /** Stamp-to-chamber seconds of this belt's blank. */
  time: number;
  partners: SyncPartner[];
}

interface Arrival {
  factory: number;
  turret: number;
  intake: number;
  time: number;
}

/** A belt's blank arrival: null unless a twin-pour factory (a CRUCIBLE: its ammo is the blank) feeds it and it reaches
 *  a turret. */
function arrival(b: Build, i: number): Arrival | null {
  const r = b.routes[i];
  const f = r ? itemByUid(b, r.factory) : undefined;
  if (!r || !f || f.def === "mimic" || effectAt(f.def, starsOf(f)).factory?.ammo !== "blank") return null;
  const info = routeInfo(b, i);
  if (!info.connected || info.turret < 0) return null;
  const w = walkRoute(b, i);
  const intake = w.joins?.length ? w.joins[w.joins.length - 1].route : i;
  return { factory: r.factory, turret: info.turret, intake, time: w.estimate.time };
}

/** Belt `index`'s SYNC estimate, or null unless a CRUCIBLE feeds it and it reaches a turret. */
export function syncOf(b: Build, index: number): SyncInfo | null {
  const me = arrival(b, index);
  if (!me) return null;
  const pour = loadEvery(b, index);
  const partners: SyncPartner[] = [];
  for (let j = 0; j < b.routes.length; j++) {
    if (j === index) continue;
    const o = arrival(b, j);
    if (!o || o.factory !== me.factory || o.turret !== me.turret || o.intake === me.intake) continue;
    const gap = Math.abs(o.time - me.time);
    const pours = Number.isFinite(pour) && pour > 0 ? Math.round(gap / pour) : 0;
    const offset = Math.abs(gap - pours * (Number.isFinite(pour) ? pour : 0));
    partners.push({ route: j, gap, pours, offset, sync: offset <= SYNC_WINDOW + EPS });
  }
  return { route: index, turret: me.turret, time: me.time, partners };
}

/** The turret slots that two CRUCIBLE belts reach in sync (the deck's SYNC mark), ascending. [] for every build
 *  without a CRUCIBLE. */
export function syncedTurrets(b: Build): number[] {
  const out = new Set<number>();
  for (let i = 0; i < b.routes.length; i++) {
    const s = syncOf(b, i);
    if (s && s.partners.some((p) => p.sync)) out.add(s.turret);
  }
  return [...out].sort((x, y) => x - y);
}
