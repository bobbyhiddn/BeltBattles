// 0.6.2 BELTSIDE H1 (ref/DESIGN-beltside.md §7): the harness measures value per arrow that actually hits.
// Before the pivot a gate processed exactly one tile; a rig lands 0 to 4 arrows, so the same price buys
// a varying number of applications. For every rig in a set of builds this counts its landed arrows and
// what they add to the payloads, from the deck's route estimates (estimateRoute: one payload, no
// congestion, rigs online) with and without the rig:
//   dmg  = the sum over connected routes of damage per payload x copies (so a SPLITTER counts its copies),
//   burn = the same for Burn stacks, time = seconds from stamp to chamber saved.
// Observation only (H1): prices and strengths are retuned in the balance pass, not here.

import { ITEMS } from "../content";
import { connectorClaims, estimateRoute, hitsOfRig, rigArrows, rigHits, routeInfo, type Build } from "../deck";

export interface RigValue {
  def: string;
  n: number; // rigs of this def
  arrows: number; // arrows per rig (its shape)
  hits: number; // landed arrows, summed
  multi: number; // rigs landing two or more arrows
  belts2: number; // rigs working two or more different belts
  gold: number; // price, summed
  dmg: number; // marginal damage per payload x copies over the connected routes, summed
  burn: number; // marginal Burn stacks x copies, summed
  time: number; // seconds to the turret saved, summed over the connected routes
}

interface Totals { dmg: number; burn: number; time: number }

function totals(b: Build): Totals {
  const claims = connectorClaims(b), hits = rigHits(b);
  const t: Totals = { dmg: 0, burn: 0, time: 0 };
  b.routes.forEach((_, ri) => {
    if (!routeInfo(b, ri, claims, undefined, hits).connected) return;
    const e = estimateRoute(b, ri, hits);
    t.dmg += e.dmg * e.copies;
    t.burn += e.burn * e.copies;
    t.time += e.time;
  });
  return t;
}

/** Per rig def, over every rig of every build (keyed by def id, in ITEMS order). */
export function rigValues(builds: Build[]): Record<string, RigValue> {
  const out: Record<string, RigValue> = {};
  for (const d of Object.values(ITEMS)) {
    if (d.kind === "gate") out[d.id] = { def: d.id, n: 0, arrows: rigArrows(d.id).length, hits: 0, multi: 0, belts2: 0, gold: 0, dmg: 0, burn: 0, time: 0 };
  }
  for (const b of builds) {
    const hits = rigHits(b);
    const base = totals(b);
    for (const p of b.items) {
      const v = out[p.def];
      if (!v) continue;
      const hs = hitsOfRig(b, p.uid, hits);
      const without = totals({ ...b, items: b.items.filter((q) => q.uid !== p.uid) });
      v.n++;
      v.hits += hs.length;
      if (hs.length >= 2) v.multi++;
      if (new Set(hs.map((h) => h.route)).size >= 2) v.belts2++;
      v.gold += ITEMS[p.def].price;
      v.dmg += base.dmg - without.dmg;
      v.burn += base.burn - without.burn;
      v.time += without.time - base.time;
    }
  }
  return out;
}
