// v070-validate M1/M3: a seeded, headless validation fuzzer. It plays random legal actions through the real
// game functions (run.ts, events.ts, road.ts, fuse.ts, day.ts) for all 10 days of a run and records each
// day's dusk deck exactly as it would fight (and upload). It is a validation fuzzer, not a par builder: it
// never reads the harness buyers or playerBuild, and it leans on the risky paths (take road events, win
// warlord fights, gamble and win, spend down the purse, discounted caravans) so its decks sit at the edge of
// what an honest run can afford. Battles are not simulated: a fight's outcome is an input of finishWarlord and
// finishDay, so the driver picks it (mostly wins), which covers every outcome an honest player can reach.
//
// It mirrors the build screen's guards (src/screens/build/actions.ts): gear goes only to a free hardpoint, a
// placed item only where canPlaceItem allows, the signature factory stays aboard, moving never fuses; and, as
// the FIGHT button does (routeCheck.ts fightBlock), a deck with a broken belt is refitted before dusk.
//
// v070-validate-062m (M5, 7bcde98): it also plays the 0.6.2 mechanics through the real functions. TURRETS
// (REQ-BFG-031): it buys them from the caravan (buyOffer, into cargo, as turretActions.ts buyTurret does), installs
// them in any slot, an occupied one as a swap (run.ts installFromCargo), moves, swaps, stores and sells installed
// ones (moveInstalled, storeTurret, sellInstalled; sellInventory in cargo), and puts gear only where canFitGear
// allows (actions.ts), cores only on an installed turret (fitCore). BELT JOINS (REQ-BFG-027): some belts are drawn
// to end by joining another belt (canJoin, then commitRoute with the join, as the editor does), and some existing
// belts are rejoined (joinTiles, setJoin). Each run counts what it did (DriverRun.ops).
//
// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): every dawn starts with the day's rune pick, as the rune picker takes it
// (run.ts pendingRune, takeRune; the first card, as src/tooling.ts playOut does), so each dusk deck holds one rune a dawn,
// exactly what an upload needs (validateUpload's exact count). Before, the driver skipped the pick and its decks held none.
//
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule, so a run that loses to 1 life before day 10 has a pending
// LAST CHANCE pick at the next dawn, which comes before that dawn's rune (pendingRune waits; run.ts fightRefusal refuses a
// fight while it is pending). The driver takes it first, as the picker does (run.ts takeLastChance): by default the HULL
// card (always offered; src/tooling.ts playOut's card, as the driver skips the picker too), or with `card` "drawn" one of
// the cards the offer holds, drawn from the driver's own stream (only when a pick is pending, so a run that never fires it
// draws exactly what it drew before). Each dusk records the taken card as the upload carries it (Dusk.lastChance, as
// day.ts ghostOf writes snapshot.lastChance). Before, the driver never took it: the pending pick held back every later
// dawn's rune, so those decks missed runes.
//
// SHAPES-1 (REQ-BFG-086, step 8's flip): with SHAPES on the caravan sells shaped pieces (NAIL STRIP, EMBER TROUGH, SPIKE
// RAIL, a 2x3 GANTRY PRESS, an I3 ASSEMBLY LINE), so the driver places, moves and turns them as the editor does: checked
// at the turn they land with (randomCell), turned by the editor's turnFit, belts drawn from a factory's turned cells. With
// SHAPES off no shaped piece exists and every draw is as before.

import { Rng, hashSeed } from "../src/core/rng";
import { GRID, HEROES, ITEMS, REROLL_COST, RUN_DAYS, type HeroId } from "../src/sim/content";
import {
  canExtend, canFitGear, canJoin, canPlaceItem, cloneBuild, commitRoute, connectorFree, hullSlots, isRig, joinTiles, key, kx, ky,
  moveItem, occupancy, placeItem, removeRoute, rotField, routesOf, setJoin, setRot, turretSlots, type Build,
  cellsOf, isShaped, // SHAPES-1 (REQ-BFG-086 R1): a placed piece's turned cells; a shaped piece
} from "../src/sim/deck";
import { footBox } from "../src/sim/foot"; // SHAPES-1: a turned footprint's box
import { canTurn, turnFit, turnsOf } from "../src/screens/build/shapeEdit"; // SHAPES-1 (S2): the editor's turn rules
import { outputsAt, starField, starsOf } from "../src/sim/stars";
import {
  buyOffer, fitCore, installFromCargo, moveInstalled, newRun, reroll, rotateRig, sellInstalled, sellInventory, storeMod,
  storePlaced, storeTurret, takeFromInventory, type Run,
  pendingRune, takeRune, // FLIP-X2: the dawn's rune pick
  pendingLastChance, takeLastChance, // Z-BUMP: LAST CHANCE's pick
} from "../src/game/run";
import { BOONS, offeredId, type TakenLastChance } from "../src/sim/lastChance"; // Z-BUMP (REQ-BFG-073)
import { choicesFor, eventFor, pickChoice } from "../src/game/events";
import { finishWarlord, leaveCaravan, pickPending, pickRoad, todaysWarlord, takePart } from "../src/game/road";
import { onToTheRoad } from "../src/game/road"; // NPC-1 (REQ-BFG-077): the event after the fight
import { npcDayRules, roadLog, type RoadEntry } from "../src/sim/npcDay"; // NPC-1
import { finishDay, startDusk } from "../src/game/day";
import { brokenRoutes, fightBlock } from "../src/game/routeCheck";
import { unfusedInRun, type GainAt } from "../src/game/fuse";
import type { SideStats } from "../src/sim/battle";
import type { RoadPick } from "../src/game/roadTypes";

/** Every hero a run can start with (newRun takes any HeroId; the four race heroes are not offered by the UI yet). */
export const DRIVER_HEROES: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];

/** Every hero's signature factory: the build screen keeps it aboard ("THE SIGNATURE FACTORY STAYS ABOARD").
 *  run.ts storePlaced only refuses KILN and LOOM, so the driver applies the rule to the race heroes itself
 *  (REPORT.md §7: the race signatures can be stored, sold and traded through storePlaced today). */
const SIGNATURES = new Set(Object.values(HEROES).map((h) => h.factory));

const ZERO = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 1, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;

export interface Dusk {
  seed: number;
  hero: HeroId;
  day: number;
  build: Build; // the deck exactly as it fights this dusk
  road: string; // today's road stop, e.g. "event dice: BET 6 (won)" or "hard sootjaw: win, took press"
  gold: number; // gold still held at dusk
  invariant: string[]; // unfusedInRun at dusk: must stay empty (fuse.ts invariant)
  lastChance?: TakenLastChance; // Z-BUMP: the run's taken LAST CHANCE at this dusk, as ghostOf writes it (absent: none)
  roadLog?: RoadEntry[]; // NPC-1: the road log at this dusk, as ghostOf writes it (NPC_DAY on; absent off)
  runSeed?: number; // NPC-1: the run's seed, which the road log's check re-derives from (NPC_DAY on; absent off)
}

export interface DriverRun {
  seed: number;
  hero: HeroId;
  dusks: Dusk[];
  run: Run; // the finished run (its events and warlords logs, for coverage counts)
  ops: Record<string, number>; // 062m: what the run did with turrets and joins (buy, install, swap, move, store, sell, join)
}

/** This run's operation counts (reset by driveRun). */
let OPS: Record<string, number> = {};
const bump = (op: string, n = 1): void => {
  OPS[op] = (OPS[op] ?? 0) + n;
};

/** Up to `tries` random cells where `def` may stand (canPlaceItem, the editor's rule); a rig also gets a rotation.
 *  SHAPES-1 (REQ-BFG-086 R1, step 8's flip): a shaped piece (a long rig, a 2x3 or I3 factory) draws its turn first and is
 *  checked at that turn (its turned footprint, as the editor checks a carried piece at the turn it shows), so it never lands
 *  turned where only its rot-0 footprint fits. Before, the turn was drawn after a rot-0 check, so a SPIKE RAIL could land
 *  over another piece or off the deck. A 1-cell rig and a 2x2 draw exactly as before. */
function randomCell(b: Build, def: string, rng: Rng, tries = 10, ignoreUid = -1): { x: number; y: number; rot?: number } | null {
  if (isShaped(ITEMS[def])) {
    for (let t = 0; t < tries; t++) {
      const rot = rng.int(turnsOf(def));
      const { w, h } = footBox(ITEMS[def], rot);
      const x = rng.int(GRID - w + 1), y = rng.int(GRID - h + 1);
      if (canPlaceItem(b, def, x, y, ignoreUid, rot).ok) return { x, y, rot };
    }
    return null;
  }
  const size = ITEMS[def].size;
  for (let t = 0; t < tries; t++) {
    const x = rng.int(GRID - size + 1), y = rng.int(GRID - size + 1);
    if (canPlaceItem(b, def, x, y, ignoreUid).ok) return isRig(def) ? { x, y, rot: rng.int(4) } : { x, y };
  }
  return null;
}

/** A turret slot where gear `def` may go (actions.ts's rule, deck.ts canFitGear: an installed turret with a free
 *  gear slot that holds no copy of `def`), or -1. */
function gearSlot(b: Build, def: string, rng: Rng): number {
  const ok = hullSlots(b.hero).map((_, t) => t).filter((t) => canFitGear(b, t, def).ok);
  return ok.length ? rng.pick(ok) : -1;
}

/** An installed turret's slot (a core's socket; fitCore refuses an empty slot), or -1. */
function installedSlot(b: Build, rng: Rng): number {
  const ok = turretSlots(b).filter((s) => s.turret).map((s) => s.slot);
  return ok.length ? rng.pick(ok) : -1;
}

/** Install cargo turret `uid` in a random slot of the hull (an occupied slot swaps: its turret goes to cargo). */
function installSome(run: Run, rng: Rng, uid: number): void {
  const slot = rng.int(hullSlots(run.hero).length);
  const occupied = !!turretSlots(run.build)[slot]?.turret;
  if (installFromCargo(run, uid, slot).ok) bump(occupied ? "turret swap in" : "turret install");
}

/** Buy one offer the way the caravan does: supplies on the spot; a module to cargo, onto a deck cell or onto a
 *  turret (buyOffer's drop target; a buy that merges into a placed twin ignores the target, as the UI does).
 *  062m: a turret is bought into cargo (merging with a copy the player holds) and mostly installed at once. */
function buyOne(run: Run, rng: Rng, wagon: number, slot: number): boolean {
  const o = run.shop.wagons[wagon].offers[slot];
  const d = ITEMS[o.def];
  if (d.kind === "turret") {
    const res = buyOffer(run, wagon, slot);
    if (!res.ok) return false;
    bump(res.gain?.steps.length ? "turret buy (merged)" : "turret buy");
    if (res.gain?.where === "cargo" && rng.chance(0.75)) installSome(run, rng, res.gain.survivor);
    return true;
  }
  let at: GainAt | undefined;
  if (d.kind !== "supply" && rng.chance(0.6)) {
    if (d.kind === "gate" || d.kind === "factory") at = randomCell(run.build, o.def, rng) ?? undefined;
    else if (d.kind === "mod") {
      const t = gearSlot(run.build, o.def, rng);
      if (t >= 0) at = { turret: t };
    } else if (d.kind === "core") {
      const t = installedSlot(run.build, rng);
      if (t >= 0) at = { turret: t };
    }
  }
  return buyOffer(run, wagon, slot, at).ok;
}

/** One turret operation on the hull: install a cargo turret, move or swap an installed one, store it, sell it. */
function turretOp(run: Run, rng: Rng, sell: boolean): void {
  const slots = turretSlots(run.build);
  const installed = slots.filter((s) => s.turret).map((s) => s.slot);
  const cargo = run.inventory.filter((i) => ITEMS[i.def]?.kind === "turret");
  const a = rng.next();
  if (a < 0.35 && cargo.length) installSome(run, rng, rng.pick(cargo).uid);
  else if (a < 0.65 && installed.length) {
    const from = rng.pick(installed), to = rng.int(slots.length);
    const swap = !!slots[to]?.turret && to !== from;
    if (moveInstalled(run, from, to).ok && to !== from) bump(swap ? "turret swap slots" : "turret move");
  } else if (a < 0.85 && installed.length) {
    if (storeTurret(run, rng.pick(installed)).ok) bump("turret store");
  } else if (sell && installed.length) {
    if (sellInstalled(run, rng.pick(installed)) > 0) bump("turret sell (installed)");
  } else if (sell && cargo.length) {
    if (sellInventory(run, rng.pick(cargo).uid) > 0) bump("turret sell (cargo)");
  }
}

/** Rejoin an existing belt: from its last cell into a tile of another belt (deck.ts joinTiles, setJoin). */
function joinSome(run: Run, rng: Rng): void {
  const b = run.build;
  const cands = rng.shuffle(b.routes.map((_, i) => i).filter((i) => b.routes[i].join === undefined));
  for (const i of cands.slice(0, 4)) {
    const tiles = joinTiles(b, i);
    if (!tiles.length) continue;
    if (setJoin(b, i, rng.pick(tiles)) === null) bump("join set");
    return;
  }
}

function affordable(run: Run): { wagon: number; slot: number }[] {
  const out: { wagon: number; slot: number }[] = [];
  run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, si) => {
    if (!o.sold && o.price <= run.gold) out.push({ wagon: wi, slot: si });
  }));
  return out;
}

/** Move one cargo copy onto the deck or a turret (moving never fuses: actions.ts drop from "cargo"). */
function placeFromCargo(run: Run, rng: Rng): void {
  if (!run.inventory.length) return;
  const it = rng.pick(run.inventory);
  const d = ITEMS[it.def];
  const b = run.build;
  if (d.kind === "gate" || d.kind === "factory") {
    const c = randomCell(b, it.def, rng);
    if (!c) return;
    const got = takeFromInventory(run, it.uid);
    if (got) placeItem(b, { uid: got.uid, def: got.def, x: c.x, y: c.y, ...starField(starsOf(got)), ...rotField(got.def, c.rot ?? 0) });
  } else if (d.kind === "mod") {
    const t = gearSlot(b, it.def, rng);
    if (t < 0) return;
    const got = takeFromInventory(run, it.uid);
    if (got) b.mods.push({ uid: got.uid, def: got.def, turret: t, ...starField(starsOf(got)) });
  } else if (d.kind === "core") {
    const t = installedSlot(b, rng);
    if (t >= 0) fitCore(run, it.uid, t);
  } else if (d.kind === "turret") installSome(run, rng, it.uid);
}

/** A deck-to-cargo move: a placed item (never a signature factory) or turret equipment. */
function storeSome(run: Run, rng: Rng): void {
  const b = run.build;
  if (rng.chance(0.5) && b.mods.length) {
    storeMod(run, rng.pick(b.mods).uid);
    return;
  }
  const cand = b.items.filter((p) => !SIGNATURES.has(p.def));
  if (cand.length) storePlaced(run, rng.pick(cand).uid);
}

function moveSome(run: Run, rng: Rng): void {
  const b = run.build;
  if (!b.items.length) return;
  const p = rng.pick(b.items);
  const c = randomCell(b, p.def, rng, 6, p.uid);
  if (!c) return;
  // SHAPES-1 (R1, S2): a shaped piece lands at the turn randomCell checked (moveItem turns it; a factory's covered belts drop)
  if (isShaped(ITEMS[p.def])) {
    moveItem(b, p.uid, c.x, c.y, c.rot ?? 0);
    return;
  }
  moveItem(b, p.uid, c.x, c.y);
  const q = b.items.find((i) => i.uid === p.uid);
  if (q && isRig(q.def)) setRot(q, c.rot ?? 0);
}

/** Turn a placed piece as the build screen's ROTATE does (actions.ts rotate): a 1-cell rig by run.ts rotateRig. SHAPES-1
 *  (S2): a shaped piece turns around its anchor to the next turn that fits there (shapeEdit.ts turnFit, then moveItem);
 *  none fits: it stays put. Before, the driver turned a shaped rig by rotateRig, unchecked, as a 1-cell rig turns. */
function turnPiece(run: Run, uid: number): void {
  const p = run.build.items.find((q) => q.uid === uid);
  if (p && isShaped(ITEMS[p.def])) {
    const t = turnFit(run.build, uid);
    if (t.ok) moveItem(run.build, uid, p.x, p.y, t.rot);
    return;
  }
  rotateRig(run, uid);
}

/**
 * Draw a belt from a factory that has an output free to a free turret connector: a shortest path over free
 * cells (no machinery, no belt), within the belt left, then checked step by step with canExtend (the editor's
 * rule) before commitRoute. 062m: sometimes (`joinP`) the belt instead ends beside another belt and joins it, if
 * canJoin (the editor's check for a belt that steps into a belt tile) allows; commitRoute then carries the join.
 */
function drawRoute(run: Run, rng: Rng, joinP = 0.4): void {
  const b = run.build;
  const factories = b.items.filter((p) => ITEMS[p.def].kind === "factory" && routesOf(b, p.uid).length < (outputsAt(p.def, starsOf(p)) || 1));
  if (!factories.length) return;
  const f = rng.pick(factories);
  const occ = occupancy(b);
  const free = (k: number) => occ[k].item < 0 && occ[k].route < 0;
  const wantJoin = b.routes.length > 0 && rng.chance(joinP);
  let joinTile = -1;
  /** A belt tile next to k that a belt ending at k could join (canJoin checks it after the path is drawn). */
  const joinAt = (k: number): number => {
    if (!wantJoin) return -1;
    const near: number[] = [];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = kx(k) + dx, y = ky(k) + dy;
      if (x >= 0 && y >= 0 && x < GRID && y < GRID && occ[key(x, y)].route >= 0) near.push(key(x, y));
    }
    return near.length ? rng.pick(near) : -1;
  };
  const target = (k: number) => {
    if (ky(k) === 0 && connectorFree(b, kx(k), -1)) return true;
    joinTile = joinAt(k);
    return joinTile >= 0;
  };
  const fp = new Set(cellsOf(f)); // SHAPES-1 (R1): the factory's turned footprint (a 2x2's is footprint's, as before)
  const starts: number[] = [];
  for (const k of fp) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = kx(k) + dx, y = ky(k) + dy;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      const n = key(x, y);
      if (!fp.has(n) && free(n) && !starts.includes(n)) starts.push(n);
    }
  }
  const left = b.beltCap - b.routes.reduce((s, r) => s + r.cells.length, 0);
  const prev = new Map<number, number>();
  const queue = rng.shuffle(starts.slice());
  for (const s of queue) prev.set(s, -1);
  let end = -1;
  for (let qi = 0; qi < queue.length && end < 0; qi++) {
    const k = queue[qi];
    if (target(k)) { end = k; break; }
    const dirs = rng.shuffle([[0, -1], [1, 0], [0, 1], [-1, 0]]);
    for (const [dx, dy] of dirs) {
      const x = kx(k) + dx, y = ky(k) + dy;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      const n = key(x, y);
      if (prev.has(n) || !free(n)) continue;
      prev.set(n, k);
      queue.push(n);
    }
  }
  if (end < 0) return;
  const cells: number[] = [];
  for (let k = end; k >= 0; k = prev.get(k)!) cells.unshift(k);
  if (cells.length > left) return;
  const pending: number[] = [];
  for (const k of cells) {
    const chk = canExtend(b, f.uid, pending, k, -1);
    if (!chk.ok) return;
    pending.push(k);
  }
  if (joinTile >= 0) {
    if (!canJoin(b, f.uid, pending, joinTile, -1).ok) return;
    commitRoute(b, f.uid, pending, -1, joinTile);
    bump("join drawn");
    return;
  }
  commitRoute(b, f.uid, pending, -1);
}

/** The dawn caravan: random shop actions, then (most days) a spending spree down to `reserve` gold (kept for
 *  a road stop that costs gold: a bet, the dock, the herald, the smuggler). */
function caravan(run: Run, rng: Rng, reserve: number): void {
  const spend = () => affordable(run).filter((o) => run.shop.wagons[o.wagon].offers[o.slot].price <= run.gold - reserve);
  const n = 3 + rng.int(12);
  for (let i = 0; i < n; i++) {
    const a = rng.next();
    if (a < 0.36) {
      const list = spend();
      if (list.length) {
        const o = rng.pick(list);
        buyOne(run, rng, o.wagon, o.slot);
      }
    } else if (a < 0.48) placeFromCargo(run, rng);
    else if (a < 0.54) {
      if (run.shop.free > 0 || run.gold >= REROLL_COST) reroll(run);
    } else if (a < 0.58) {
      if (run.inventory.length) sellInventory(run, rng.pick(run.inventory).uid);
    } else if (a < 0.62) storeSome(run, rng);
    else if (a < 0.66) {
      // SHAPES-1 (S2): a shaped factory turns too (build.ts's R: a rig, or a shaped piece that can turn)
      const rigs = run.build.items.filter((p) => isRig(p.def) || (isShaped(ITEMS[p.def]) && canTurn(p.def)));
      if (rigs.length) turnPiece(run, rng.pick(rigs).uid);
    } else if (a < 0.70) moveSome(run, rng);
    else if (a < 0.82) drawRoute(run, rng);
    else if (a < 0.85) {
      if (run.build.routes.length && rng.chance(0.3)) removeRoute(run.build, rng.int(run.build.routes.length));
    } else if (a < 0.95) turretOp(run, rng, true); // 062m: turrets (install, swap, move, store, sell)
    else joinSome(run, rng); // 062m: belt joins
  }
  if (rng.chance(0.85)) {
    for (let guard = 0; guard < 40; guard++) {
      const list = spend();
      if (list.length) {
        const o = rng.pick(list);
        buyOne(run, rng, o.wagon, o.slot);
      } else if ((run.shop.free > 0 || run.gold >= REROLL_COST + 3 + reserve) && rng.chance(0.6)) reroll(run);
      else break;
    }
  }
  for (let k = 0; k < 8; k++) placeFromCargo(run, rng);
  if (rng.chance(0.5)) drawRoute(run, rng);
}

const TIERS: RoadPick[] = ["easy", "medium", "hard"];

/**
 * Which road stops a run takes. "mixed" (the default) is the risky random policy: the event half the time
 * (mostly a real choice; a gamble mostly when it wins), else a warlord (mostly Hard), mostly won. The others
 * isolate one path for the audit table (REPORT.md §1): "event:<id>:<LABEL>" takes that choice on the day its
 * event comes up; "warlord:<tier>" fights that tier every day and wins; "none" gains nothing on the road. On
 * every other day an isolated policy picks EASY and loses, which gives nothing.
 */
export type RoadPolicy = "mixed" | "none" | `event:${string}` | `warlord:${"easy" | "medium" | "hard"}` | `event:${string}|warlord:${string}`;

function describeWarlord(run: Run, pick: RoadPick): string {
  const w = todaysWarlord(run)!;
  const took = w.result?.took ?? "";
  return `${pick} ${w.id}${w.sabotaged ? " (sabotaged)" : ""}: ${w.result!.outcome}${took ? `, took ${took}` : ""}${w.result!.bountyPaid ? `, bounty ${w.result!.bountyPaid}` : ""}`;
}

function fight(run: Run, rng: Rng, pick: RoadPick, winP: number): string {
  if (!pickRoad(run, pick).ok) return "none";
  const w = todaysWarlord(run)!;
  const r = rng.next();
  finishWarlord(run, r < winP ? 0 : r < winP + (1 - winP) * 0.66 ? 1 : -1, 20 + run.day);
  if (pickPending(run.warlord)) takePart(run, rng.int(w.result!.parts.length));
  return describeWarlord(run, pick);
}

function takeChoice(run: Run, i: number): string {
  const ev = run.event!;
  const c = choicesFor(run)[i];
  const res = pickChoice(run, i);
  return `event ${ev.id}: ${c.label}${c.odds !== undefined ? (res.won ? " (won)" : " (lost)") : ""}`;
}

/** The event id and choice label an isolated event policy targets ("event:<id>:<LABEL>[|warlord:<tier>]"). */
function target(policy: RoadPolicy): { id: string; label: string } | null {
  if (!policy.startsWith("event:")) return null;
  const [, id, label] = policy.split("|")[0].split(":");
  return { id, label };
}

/** An isolated event policy's other days: "|warlord:<tier>" fights (and wins) that tier, else EASY lost. */
function otherDays(policy: RoadPolicy): { tier: RoadPick; winP: number } {
  const alt = policy.split("|")[1];
  return alt?.startsWith("warlord:") ? { tier: alt.slice(8) as RoadPick, winP: 1 } : { tier: "easy", winP: 0 };
}

/** NPC-1 (REQ-BFG-077; NPC_DAY on): the day is a fight, then the day's event. The fight: `mixed` a tier by its weights,
 *  mostly won; an isolated warlord policy its tier, won; any other policy its other days' fight (EASY lost by default).
 *  The event: `mixed` as the mixed stop chooses it; an isolated event policy its target choice on its event's day; else
 *  the first open choice that costs and gives nothing (none: the first open one). */
function npcRoadStop(run: Run, rng: Rng, policy: RoadPolicy): string {
  const o = otherDays(policy);
  const pick: RoadPick = policy === "mixed" ? rng.weighted(TIERS, (t) => (t === "hard" ? 6 : t === "medium" ? 2.5 : 1.5))
    : policy.startsWith("warlord:") ? (policy.slice(8) as RoadPick) : o.tier;
  const a = fight(run, rng, pick, policy === "mixed" ? 0.85 : policy.startsWith("warlord:") ? 1 : o.winP);
  if (onToTheRoad(run) !== "event") return `${a}; no event`;
  const ev = run.event!, list = choicesFor(run);
  const open = list.map((c, i) => ({ c, i })).filter(({ c }) => !c.blocked);
  if (!open.length) return `${a}; event ${ev.id}: nothing open`;
  let i: number;
  const t = target(policy);
  if (policy === "mixed") {
    i = rng.weighted(open, ({ c }) => (c.odds !== undefined ? (ev.roll < c.odds ? 8 : 1.5) : c.cost.length || c.gain.length ? 4 : 1)).i;
  } else {
    const hit = t && ev.id === t.id ? open.find(({ c }) => c.label === t.label) : undefined;
    i = (hit ?? open.find(({ c }) => !c.cost.length && !c.gain.length) ?? open[0]).i;
  }
  const b = takeChoice(run, i);
  onToTheRoad(run); // REFIT (the caravan has moved on)
  return `${a}; ${b}`;
}

/** Today's road stop under `policy`. Returns a short description. */
function roadStop(run: Run, rng: Rng, policy: RoadPolicy): string {
  leaveCaravan(run);
  if (npcDayRules()) return npcRoadStop(run, rng, policy); // NPC-1 (REQ-BFG-077): a fight, then the day's event
  if (policy === "mixed") {
    const pick: RoadPick = rng.chance(0.5) ? "event" : rng.weighted(TIERS, (t) => (t === "hard" ? 6 : t === "medium" ? 2.5 : 1.5));
    if (pick !== "event") return fight(run, rng, pick, 0.85);
    if (!pickRoad(run, "event").ok) return "none";
    const ev = run.event!;
    const open = choicesFor(run).map((c, i) => ({ c, i })).filter(({ c }) => !c.blocked);
    if (!open.length) return `event ${ev.id}: nothing open`;
    const { i } = rng.weighted(open, ({ c }) => {
      if (c.odds !== undefined) return ev.roll < c.odds ? 8 : 1.5; // gamble: mostly bets that win
      return c.cost.length || c.gain.length ? 4 : 1; // mostly a real choice, sometimes MOVE ON
    });
    return takeChoice(run, i);
  }
  if (policy.startsWith("warlord:")) return fight(run, rng, policy.slice(8) as RoadPick, 1);
  const t = target(policy);
  if (t && eventFor(run.seed, run.day) === t.id) {
    pickRoad(run, "event");
    const list = choicesFor(run);
    const i = list.findIndex((c) => c.label === t.label && !c.blocked);
    const zero = list.findIndex((c) => !c.blocked && !c.cost.length && !c.gain.length);
    if (i >= 0) return takeChoice(run, i);
    if (zero >= 0) return takeChoice(run, zero); // the target choice is blocked (no gold, nothing to trade)
    return `event ${t.id}: target blocked`;
  }
  const o = otherDays(policy);
  return fight(run, rng, o.tier, o.winP); // default: EASY lost, nothing from the road today
}

/** Gold the caravan keeps back for today's road stop. */
function reserveFor(run: Run, rng: Rng, policy: RoadPolicy): number {
  const t = target(policy);
  if (t) return eventFor(run.seed, run.day) === t.id ? 8 : 0;
  if (policy === "mixed") return rng.chance(0.35) ? 2 + rng.int(9) : 0;
  return 0;
}

/** REFIT after the road (no shop): road parts from cargo go onto the deck, a few moves. 062m: turrets can be
 *  installed, moved and stored there too (never sold: the caravan has moved on), and belts joined. */
function refit(run: Run, rng: Rng): void {
  for (let k = 0; k < 6; k++) placeFromCargo(run, rng);
  if (rng.chance(0.3)) moveSome(run, rng);
  if (rng.chance(0.2)) turretOp(run, rng, false);
  if (rng.chance(0.4)) drawRoute(run, rng);
  if (rng.chance(0.15)) joinSome(run, rng);
}

/** FIGHT is blocked while a belt is broken or goes nowhere (routeCheck.ts): the player refits it away. */
function unblock(run: Run): void {
  for (let guard = 0; guard < 32 && fightBlock(run.build); guard++) {
    const bad = brokenRoutes(run.build);
    if (!bad.length) break;
    removeRoute(run.build, bad[bad.length - 1]);
  }
}

/** Z-BUMP: the LAST CHANCE card a run takes when its pick is pending: "hull" (always offered), or "drawn" (one of the cards
 *  the offer holds, drawn from the driver's stream). */
export type LastChancePick = "hull" | "drawn";

/** One seeded run of `hero`, all ten days (the driver keeps a life in hand, so every run reaches day 10). */
export function driveRun(seed: number, hero: HeroId, policy: RoadPolicy = "mixed", card: LastChancePick = "hull"): DriverRun {
  OPS = {};
  const rng = new Rng(hashSeed("v070-driver", seed, hero, policy));
  const run = newRun(hero, hashSeed("v070-run", seed, hero), `drv-${seed}-${hero}`);
  const dusks: Dusk[] = [];
  for (let day = 1; day <= RUN_DAYS && !run.over; day++) {
    // Z-BUMP (the flip): a pending LAST CHANCE comes before the dawn's rune, as the picker requires: a card its offer holds,
    // from the driver's stream (drawn only when one is pending)
    const lc = pendingLastChance(run);
    if (lc) takeLastChance(run, card === "hull" ? "hull" : rng.pick(BOONS.filter((b) => offeredId(lc, b) !== null)));
    // FLIP-X2: the dawn's rune first (the first card; it draws nothing from the driver's stream), as a run must before its
    // dusk (run.ts fightRefusal); a dawn-gold rune's gold is in the purse for the caravan, a HULL or BELT rune on the deck
    const offer = pendingRune(run);
    if (offer) takeRune(run, offer.ids[0]);
    caravan(run, rng, reserveFor(run, rng, policy));
    const road = roadStop(run, rng, policy);
    refit(run, rng);
    unblock(run);
    const taken = run.lastChance?.boon ? { lastChance: { day: run.lastChance.day, boon: run.lastChance.boon, ...(run.lastChance.id !== undefined ? { id: run.lastChance.id } : {}) } } : {};
    // NPC-1 (REQ-BFG-077, REQ-BFG-078): the road log as ghostOf writes it, with NPC_DAY on (off: absent, as before)
    const log = npcDayRules() && run.warlords.length ? { roadLog: roadLog(run.warlords), runSeed: run.seed } : {};
    dusks.push({ seed, hero, day: run.day, build: cloneBuild(run.build), road, gold: run.gold, invariant: unfusedInRun(run), ...taken, ...log });
    startDusk(run, []);
    const r = rng.next();
    const winner = run.lives <= 1 || r < 0.8 ? 0 : r < 0.95 ? 1 : -1;
    finishDay(run, winner, 20 + day, ZERO, ZERO);
  }
  return { seed, hero, dusks, run, ops: OPS };
}

/** `n` runs, heroes in turn (run i plays DRIVER_HEROES[i % 6] on seed seed0 + i). */
export function driveRuns(n: number, seed0 = 1, heroes: readonly HeroId[] = DRIVER_HEROES, policy: RoadPolicy = "mixed", card: LastChancePick = "hull"): DriverRun[] {
  const out: DriverRun[] = [];
  for (let i = 0; i < n; i++) out.push(driveRun(seed0 + i, heroes[i % heroes.length], policy, card));
  return out;
}

/** The audit's isolated paths (REPORT.md §1): every event choice that changes something, each warlord tier, none. */
export const AUDIT_PATHS: readonly RoadPolicy[] = [
  "none",
  "event:wreck:SALVAGE", "event:wreck:SCRAP IT",
  "event:cache:BELT SPOOL", "event:cache:COIN POUCH",
  "event:trader:SELL", "event:trader:SWAP",
  "event:dice:BET 3", "event:dice:BET 6",
  "event:dock:PLATING", "event:dock:PATCH UP",
  "event:herald:STAKE 3", "event:herald:STAKE 3|warlord:hard", "event:sappers:HIRE", "event:sappers:HIRE|warlord:hard",
  "event:scout:HAGGLE", "event:scout:SEND WORD", "event:scout:SPY",
  "event:storm:RIDE THROUGH",
  "event:smuggler:BURN", "event:smuggler:SHOCK",
  "warlord:easy", "warlord:medium", "warlord:hard",
];

/** An error message with its numbers masked, for grouping ("budget: build costs # gold ..."). */
export function errorKind(e: string): string {
  return e.replace(/-?\d+(\.\d+)?/g, "#").replace(/uid # [A-Z .'-]+? /, "uid # ");
}
