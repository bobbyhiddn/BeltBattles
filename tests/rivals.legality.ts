// Shared test helper (not a test file): rebuild a deck from empty with the build screen's own
// checks. tests/rivals.test.ts runs it on every warlord deck, tests/rivals.honest.test.ts on every
// stand-in deck, so both decks pass the same legality replay.

import {
  canExtend, canPlaceItem, commitRoute, connectorClaims, hitsOfRig, placeItem, routeInfo,
  routesOf, turretHasFreeHardpoint, coreFor, beltUsed, type Build,
} from "../src/sim/deck";
import { HEROES, ITEMS } from "../src/sim/content";
import { unfusedPairs } from "../src/net/validate";

/** Every item a rival deck may carry: the two signature factories and shop stock. */
export const ALLOWED = new Set([
  "kiln", "loom", "press", "temper", "whetstone", "grease", "brake", "longhaul", "coil", "splitter",
  "overdrive", "calibrate", "hopper", "drake", "beltcrate", "plating",
]);

/** Rebuild a deck from empty with the build screen's own checks; returns every problem found. */
export function legalityProblems(b: Build): string[] {
  const bad: string[] = [];
  const h = HEROES[b.hero];
  const nb: Build = { hero: b.hero, items: [], routes: [], mods: [], beltCap: b.beltCap, hullBonus: b.hullBonus };
  const uids = [...b.items, ...b.mods].map((p) => p.uid);
  if (new Set(uids).size !== uids.length) bad.push("duplicate uids");
  bad.push(...unfusedPairs(b));
  for (const p of [...b.items, ...b.mods]) if (!ALLOWED.has(p.def)) bad.push(`stray item ${p.def}`);
  const facs = b.items.filter((p) => ITEMS[p.def]?.kind === "factory");
  const gates = b.items.filter((p) => ITEMS[p.def]?.kind === "gate");
  if (facs.length + gates.length !== b.items.length) bad.push("non-deck item on the deck");
  if (facs.filter((p) => p.def === h.factory).length !== 1) bad.push(`needs exactly one ${h.factory}`);
  for (const f of facs) if (f.def !== h.factory && f.def !== "press") bad.push(`foreign factory ${f.def}`);
  for (const f of facs) {
    const chk = canPlaceItem(nb, f.def, f.x, f.y);
    if (chk.ok) placeItem(nb, f);
    else bad.push(`factory ${f.def}@${f.x},${f.y}: ${chk.reason}`);
  }
  b.routes.forEach((r, i) => {
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
    if (n < 1 || n > ITEMS[f.def].factory!.outputs) bad.push(`${f.def} feeds ${n} belts`);
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
    if (m.turret < 0 || m.turret >= h.turrets.length) bad.push(`no turret ${m.turret}`);
    else if (kind === "mod" && !turretHasFreeHardpoint(nb, m.turret)) bad.push(`turret ${m.turret} already has gear`);
    else if (kind === "core" && coreFor(nb, m.turret)) bad.push(`turret ${m.turret} already has a core`);
    nb.mods.push(m);
  }
  b.routes.forEach((_, i) => { if (!routeInfo(b, i).connected) bad.push(`route ${i} not connected`); });
  if (connectorClaims(b).size !== b.routes.length) bad.push("two belts share an intake");
  if (beltUsed(b) > b.beltCap) bad.push(`belt ${beltUsed(b)}/${b.beltCap}`);
  return bad;
}
