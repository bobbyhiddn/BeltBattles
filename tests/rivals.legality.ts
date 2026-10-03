// Shared test helper (not a test file): rebuild a deck from empty with the build screen's own
// checks. tests/rivals.test.ts runs it on every warlord deck, tests/rivals.honest.test.ts on every
// stand-in deck, so both decks pass the same legality replay.
// 0.6.2 TUNE-C: captain plans may use any part the caravan sells (the 58 modules and 13 turrets, REQ-BFG-033) and the
// hull's extra TURRET SLOT (REQ-BFG-031): the replay installs the deck's turrets first (their intakes take the belts),
// then checks every piece of gear and every core against the turret it sits on (deck.ts canFitGear, coreFor). Captain
// plans never join belts (TUNE-C: joins wait for TUNE-M's join pace).

import {
  canExtend, canFitGear, canPlaceItem, commitRoute, connectorClaims, hitsOfRig, hullSlots, isTurretDef, placeItem,
  routeInfo, routesOf, coreFor, beltUsed, turretList, turretSlots, type Build,
} from "../src/sim/deck";
import { HEROES, ITEMS, MERCHANTS, itemsSoldBy, type MerchantId } from "../src/sim/content";
import { unfusedPairs } from "../src/net/validate";
import { outputsAt, starsOf } from "../src/sim/stars"; // bb-0.8.3 (REQ-BFG-042): belt slots by stars

/** Every def the caravan sells (merchant stock: the 58 modules, 13 turrets and the two supplies). */
export const SOLD = new Set(Object.keys(MERCHANTS).flatMap((m) => itemsSoldBy(m as MerchantId).map((d) => d.id)));
/** The signature factories (a deck holds its own hero's, never sold). */
const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

/** Rebuild a deck from empty with the build screen's own checks; returns every problem found. */
export function legalityProblems(b: Build): string[] {
  const bad: string[] = [];
  const h = HEROES[b.hero];
  const turrets = turretList(b);
  const nb: Build = { hero: b.hero, items: [], routes: [], mods: [], beltCap: b.beltCap, hullBonus: b.hullBonus, ...(b.turrets ? { turrets: turrets.map((t) => ({ ...t })) } : {}) };
  const uids = [...b.items, ...b.mods, ...turrets].map((p) => p.uid);
  if (new Set(uids).size !== uids.length) bad.push("duplicate uids");
  bad.push(...unfusedPairs(b));
  for (const t of turrets) {
    if (!isTurretDef(t.def)) bad.push(`slot ${t.slot} holds ${t.def}, not a turret`);
    else if (t.free && hullSlots(b.hero)[t.slot]?.start !== t.def) bad.push(`slot ${t.slot}: a free ${t.def} is not the slot's starting turret`);
    else if (!t.free && !SOLD.has(t.def)) bad.push(`stray turret ${t.def}`);
  }
  for (const p of [...b.items, ...b.mods]) if (!SOLD.has(p.def) && p.def !== h.factory) bad.push(`stray item ${p.def}`);
  const facs = b.items.filter((p) => ITEMS[p.def]?.kind === "factory");
  const gates = b.items.filter((p) => ITEMS[p.def]?.kind === "gate");
  if (facs.length + gates.length !== b.items.length) bad.push("non-deck item on the deck");
  if (facs.filter((p) => p.def === h.factory).length !== 1) bad.push(`needs exactly one ${h.factory}`);
  for (const f of facs) if (f.def !== h.factory && SIGNATURES.has(f.def)) bad.push(`foreign factory ${f.def}`);
  for (const f of facs) {
    const chk = canPlaceItem(nb, f.def, f.x, f.y);
    if (chk.ok) placeItem(nb, f);
    else bad.push(`factory ${f.def}@${f.x},${f.y}: ${chk.reason}`);
  }
  b.routes.forEach((r, i) => {
    if (r.join !== undefined) bad.push(`route ${i} joins a belt (captain plans never join)`);
    const pending: number[] = [];
    let completes = false;
    for (const k of r.cells) {
      const chk = canExtend(nb, r.factory, pending, k, -1);
      if (!chk.ok) return bad.push(`route ${i} at ${k}: ${chk.reason}`);
      pending.push(k);
      completes = !!chk.completes;
    }
    if (!completes) bad.push(`route ${i} does not end at a free intake`);
    commitRoute(nb, r.factory, pending, -1);
  });
  for (const f of facs) {
    const n = routesOf(nb, f.uid).length;
    if (n < 1 || n > outputsAt(f.def, starsOf(f))) bad.push(`${f.def} feeds ${n} belts`); // bb-0.8.3: slots by stars
  }
  // 0.6.2 BELTSIDE: a rig stands beside the belt (canPlaceItem refuses a belt tile) and, in a preset deck,
  // must work one: an IDLE rig (no arrow reaches a belt) is a wasted purchase
  for (const g of gates) {
    const chk = canPlaceItem(nb, g.def, g.x, g.y);
    if (!chk.ok) bad.push(`rig ${g.def}@${g.x},${g.y}: ${chk.reason}`);
    else placeItem(nb, g);
  }
  for (const g of gates) if (!hitsOfRig(nb, g.uid).length) bad.push(`rig ${g.def}@${g.x},${g.y} is IDLE`);
  for (const m of b.mods) {
    const kind = ITEMS[m.def]?.kind;
    if (kind !== "mod" && kind !== "core") bad.push(`${m.def} is not turret equipment`);
    else if (!turretSlots(nb)[m.turret]?.turret) bad.push(`no turret in slot ${m.turret}`);
    else if (kind === "mod") {
      const chk = canFitGear(nb, m.turret, m.def);
      if (!chk.ok) bad.push(`${m.def} on turret ${m.turret}: ${chk.reason}`);
    } else if (coreFor(nb, m.turret)) bad.push(`turret ${m.turret} already has a core`);
    nb.mods.push(m);
  }
  b.routes.forEach((_, i) => { if (!routeInfo(b, i).connected) bad.push(`route ${i} not connected`); });
  if (connectorClaims(b).size !== b.routes.length) bad.push("two belts share an intake");
  if (beltUsed(b) > b.beltCap) bad.push(`belt ${beltUsed(b)}/${b.beltCap}`);
  return bad;
}
