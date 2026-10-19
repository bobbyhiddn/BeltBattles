// 0.6.1a: run-side fusion (ARSENAL.md §4.1, §4.2; REQ-BFG-019). Two copies of one fusible def at the
// same star level merge into one copy a level higher (1+1 = 2, 2+2 = 3; 3 is the maximum), as a copy
// is GAINED. gainModule is the only way a module enters a run: the shop (card, drag onto a cell or a
// turret), a warlord Hard pick, the Matriarch's prize, a road-event item (the trader's SWAP too) and
// tooling. Moving, storing, selling and trading never fuse. Invariant (tests/fuse.test.ts): after
// any run mutation no two fusible copies share a def and a star level below FUSE_MAX.

import { ITEMS } from "../sim/content";
import { coreFor, removeItem, removeTurret, rotField, routesOf, setTurretList, setTurretWord, turretList, type Build } from "../sim/deck";
import { enchantField, enchantRules, mergeWord, sameEnchant, type EnchantFields, type WordChooser } from "../sim/enchant"; // ENCHANT-1 (REQ-BFG-085, E4)
import { FUSE_MAX, fusible, gradeOf, outputsAt, starField, starsOf } from "../sim/stars";
import type { InvItem, Run } from "./run";

// 0.6.2s (REQ-BFG-031 S6, S7): turrets merge like every buyable module. An installed turret is a copy "slot"
// (Build.turrets, or the starting layout); a cargo turret is a cargo copy. Two FREE copies (each holding a hull's
// starting copy) never merge with each other: WEAVER keeps its three starting DART GUNs. A merge result is free when
// either copy was (it contains the starting copy), so its value is price x (2^(stars-1) - 1). An absorbed installed
// turret empties its slot; that slot's core and gear go to cargo (an empty slot holds none).
export type FuseWhere = "cargo" | "deck" | "turret" | "slot";

/** One merge: `absorbed` merged into `survivor`, which now has `stars` and sits at `where`. */
export interface FuseStep {
  def: string;
  absorbed: number;
  survivor: number;
  stars: number;
  where: FuseWhere;
  belts?: number; // belts removed with an absorbed factory (their tiles go back to belt capacity)
}

/** Where a gained copy goes: cargo (absent), a deck cell (caller checked canPlaceItem; 0.6.2 BELTSIDE: a rig
 *  takes `rot`, the drag preview's rotation) or a turret: its hardpoint for gear, its core socket for a turret
 *  core (0.6.1b). */
export type GainAt = { x: number; y: number; rot?: number } | { turret: number };

/** What gainModule did: the new copy's uid, the merges, and where the module ended up. */
export interface Gain {
  uid: number;
  steps: FuseStep[];
  survivor: number;
  stars: number;
  where: FuseWhere;
}

interface Copy { uid: number; def: string; stars: number; where: FuseWhere; belts: number; free?: boolean; slot?: number; word?: EnchantFields }

/** ENCHANT-1 (REQ-BFG-085, E4): a copy's word, only while the switch is on and the copy holds one (else no key at all). */
const wordOf = (o: { ench?: string; enchDir?: number; grow?: number }): { word?: EnchantFields } =>
  enchantRules() && o.ench !== undefined ? { word: enchantField(o) } : {};

function copiesOf(run: Run, def?: string): Copy[] {
  const b = run.build;
  const out: Copy[] = [];
  for (const p of b.items) if (!def || p.def === def) out.push({ uid: p.uid, def: p.def, stars: starsOf(p), where: "deck", belts: routesOf(b, p.uid).length, ...wordOf(p) });
  for (const m of b.mods) if (!def || m.def === def) out.push({ uid: m.uid, def: m.def, stars: starsOf(m), where: "turret", belts: 0 });
  // 0.6.2s: installed turrets (the starting layout's free copies when Build.turrets is absent)
  for (const t of turretList(b)) if (!def || t.def === def) out.push({ uid: t.uid, def: t.def, stars: starsOf(t), where: "slot", belts: 0, ...(t.free ? { free: true } : {}), slot: t.slot, ...wordOf(t) });
  for (const i of run.inventory) if (!def || i.def === def) out.push({ uid: i.uid, def: i.def, stars: starsOf(i), where: "cargo", belts: 0, ...(i.free ? { free: true } : {}), ...wordOf(i) });
  return out;
}

/**
 * ENCHANT-1 (REQ-BFG-085, E4): put a word (`fields`: enchantField's keys, `{}` for none) on the copy `uid`, wherever it is (a deck
 * rig or factory, an installed turret, a cargo piece), replacing any it holds: the old word, its side and its GROWING counter are
 * gone. A turret that loses WIDE sends the gear it can no longer hold to cargo (deck.ts setTurretWord). Gear holds no word.
 */
export function setPieceWord(run: Run, uid: number, fields: EnchantFields): void {
  const b = run.build;
  const t = turretList(b).find((x) => x.uid === uid);
  if (t) {
    for (const m of setTurretWord(b, t.slot, fields).mods) run.inventory.push({ uid: m.uid, def: m.def, ...starField(starsOf(m)) });
    return;
  }
  const o = b.items.find((p) => p.uid === uid) ?? run.inventory.find((i) => i.uid === uid);
  if (!o) return;
  delete o.ench;
  delete o.enchDir;
  delete o.grow;
  Object.assign(o, enchantField(fields));
}

/** Why a factory cannot lose WIDE now (the short player reason), shown by APPLY and the merge pick. */
export const EXTRA_BELT_LEFT = "TAKE ITS EXTRA BELT OFF FIRST";
/** The toast a merge shows when the survivor keeps WIDE because its extra belt is in use. */
export const KEPT_WIDE = "KEPT WIDE: ITS EXTRA BELT IS IN USE";

/**
 * ENCHANT-1 (run 5; the code reviewers' finding): does the deck factory `uid` hold WIDE and feed more belts than its own outputs, so the
 * belt slot WIDE gives it is in use? Losing WIDE then would leave the factory with more belts than outputs and block FIGHT (routeCheck.ts,
 * validate.ts). A turret that loses WIDE sends its extra gear to cargo (setTurretWord); a belt has no cargo, so the word stays until the
 * belt is taken off: APPLY refuses a replace (applyProblem) and a merge keeps WIDE (mergeWords, pickMergedWord).
 */
export function extraBeltInUse(run: Run, uid: number): boolean {
  return extraBeltInUseOn(run.build, uid);
}

/** BUMP-1F P2: extraBeltInUse on a build (the bots plan on builds: harness/enchantBot.ts never plans a word onto a WIDE factory whose belt is in use). */
export function extraBeltInUseOn(b: Build, uid: number): boolean {
  if (!enchantRules()) return false;
  const p = b.items.find((q) => q.uid === uid);
  if (!p || p.ench !== "wide" || ITEMS[p.def]?.kind !== "factory") return false;
  return routesOf(b, uid).length > (outputsAt(p.def, gradeOf(b, p)) || 1);
}

/**
 * ENCHANT-1 (E4): the merge pick. When a merge joined two DIFFERENT words, the survivor already keeps one (the bots' valued choice, else
 * its own) and `run.enchMerge` names the survivor, the word kept and the one lost. `takeLost` swaps them: the build screen asks the
 * player (`FIERY OR RISING?`) and calls this; keeping the word is the default. False when no pick is open, or (run 5) when taking the
 * other word would take WIDE off a factory whose extra belt is in use (the pick stays open: lay that belt off, then pick).
 */
export function pickMergedWord(run: Run, takeLost: boolean): boolean {
  const m = run.enchMerge;
  if (!m) return false;
  if (takeLost && extraBeltInUse(run, m.uid)) return false; // the pick stays open; the screen says EXTRA_BELT_LEFT
  delete run.enchMerge;
  const now = find(run, m.uid); // the piece may have been sold or changed since: then there is nothing to pick
  if (!now || !sameEnchant(now.word, m.kept)) return false;
  if (takeLost) setPieceWord(run, m.uid, m.lost);
  return true;
}

/** 0.6.2s S6: may copies x and y (same def, same stars) merge? Not two free starting copies. */
const mergeable = (x: Copy, y: Copy) => !(x.free && y.free);

function find(run: Run, uid: number): Copy | undefined {
  return copiesOf(run).find((c) => c.uid === uid);
}

function setStars(run: Run, uid: number, stars: number, free = false): void {
  const b = run.build;
  const tl = turretList(b), t = tl.find((x) => x.uid === uid);
  if (t) { // 0.6.2s: an installed turret (free stays set once the starting copy is inside)
    if (stars > 1) t.stars = stars;
    else delete t.stars;
    if (free) t.free = true;
    setTurretList(b, tl);
    return;
  }
  const o = b.items.find((p) => p.uid === uid) ?? b.mods.find((m) => m.uid === uid) ?? run.inventory.find((i) => i.uid === uid);
  if (!o) return;
  if (stars > 1) o.stars = stars;
  else delete o.stars;
  if (free && run.inventory.includes(o as InvItem)) (o as InvItem).free = true; // 0.6.2s: a cargo turret
}

/** Remove a copy from its spot. A gate's cell becomes plain belt (routes are RouteDef.cells), a
 *  factory takes its belts with it, a mod frees its hardpoint. Returns the belts removed. 0.6.2s: an installed
 *  turret empties its slot; the slot's core and gear go to cargo, stars kept. */
function absorb(run: Run, c: Copy): number {
  if (c.where === "deck") {
    removeItem(run.build, c.uid);
    return c.belts;
  }
  if (c.where === "slot") {
    for (const m of removeTurret(run.build, c.slot!).mods) run.inventory.push({ uid: m.uid, def: m.def, ...starField(starsOf(m)) });
    return 0;
  }
  if (c.where === "turret") run.build.mods = run.build.mods.filter((m) => m.uid !== c.uid);
  else run.inventory = run.inventory.filter((i) => i.uid !== c.uid);
  return 0;
}

/** The survivor rule (ARSENAL.md §4.1 rule 4). `arriving` is the copy that just reached this star
 *  level (a new copy, or the survivor of the previous step of a chain); null in fuseAll. */
function survivorOf(a: Copy, b: Copy, arriving: number | null): Copy {
  const pa = a.where !== "cargo", pb = b.where !== "cargo";
  if (pa !== pb) return pa ? a : b; // 1. a placed copy beats one in cargo
  if (pa) {
    // 3. two placed factories: the one with more belts survives
    if (ITEMS[a.def]?.kind === "factory" && a.belts !== b.belts) return a.belts > b.belts ? a : b;
    // 2. two placed copies: the twin that was already at that star level keeps its spot
    if (arriving === a.uid) return b;
    if (arriving === b.uid) return a;
  }
  return a.uid < b.uid ? a : b; // 4. otherwise the lower uid
}

function chain(run: Run, uid: number, arrivingFirst: boolean, choose?: WordChooser): FuseStep[] {
  const steps: FuseStep[] = [];
  let cur = find(run, uid);
  let first = true, picked = false;
  while (cur && fusible(cur.def) && cur.stars < FUSE_MAX) {
    const c = cur;
    const twin = copiesOf(run, c.def).filter((t) => t.uid !== c.uid && t.stars === c.stars && mergeable(c, t)).sort((x, y) => x.uid - y.uid)[0];
    if (!twin) break;
    const keep = survivorOf(c, twin, first && !arrivingFirst ? null : c.uid);
    const lose = keep === c ? twin : c;
    const belts = absorb(run, lose);
    const stars = c.stars + 1;
    setStars(run, keep.uid, stars, !!lose.free); // 0.6.2s: free is kept when the starting copy merges in
    if (keep.word || lose.word) picked = mergeWords(run, keep, lose, stars, choose) || picked; // ENCHANT-1 (REQ-BFG-085, E4): the merged piece keeps one word
    steps.push({ def: c.def, absorbed: lose.uid, survivor: keep.uid, stars, where: keep.where, ...(belts ? { belts } : {}) });
    cur = find(run, keep.uid);
    first = false;
  }
  if (picked && run.enchMerge) { // ENCHANT-1: this chain opened a pick: it names the final survivor, while the word kept is still the one on it
    if (!cur || !sameEnchant(cur.word, run.enchMerge.kept)) delete run.enchMerge;
    else run.enchMerge.uid = cur.uid;
  }
  if (steps.length) queueFx(run, steps);
  return steps;
}

/** ENCHANT-1 (REQ-BFG-085, E4): copy `lose` merged into `keep` (now at `stars`): `keep` holds one word. One word: it is kept (it moves
 *  onto the survivor). Two different words: the chooser's, else the survivor's own, and the pick stays open (`run.enchMerge`; true). */
function mergeWords(run: Run, keep: Copy, lose: Copy, stars: number, choose?: WordChooser): boolean {
  let { kept, lost } = mergeWord(keep.word, lose.word, choose && ((a, b) => choose({ def: keep.def, stars, a, b })));
  // ENCHANT-1 (run 5): a factory using WIDE's extra belt keeps WIDE (the survivor's own word); the other word is lost without a pick
  if (lost && keep.where === "deck" && keep.word?.ench === "wide" && extraBeltInUse(run, keep.uid)) {
    kept = keep.word;
    lost = undefined;
    run.fuseFx = [...(run.fuseFx ?? []), KEPT_WIDE];
  }
  if (!sameEnchant(keep.word, kept) || (kept.grow ?? 0) !== (keep.word?.grow ?? 0)) setPieceWord(run, keep.uid, kept);
  if (!lost) return false;
  run.enchMerge = { uid: keep.uid, kept, lost };
  return true;
}

/** Cosmetic: the build screen toasts these in order ("MERGED: TEMPER ★2", "MERGED · 1 BELT REMOVED").
 *  Player text is ★ plus the level (ARSENAL.md §6 Naming); the inspect title spells it in glyphs ("TEMPER ★★"). */
function queueFx(run: Run, steps: FuseStep[]): void {
  const last = steps[steps.length - 1];
  const fx = [`MERGED: ${ITEMS[last.def].name} ★${last.stars}`];
  const belts = steps.reduce((n, s) => n + (s.belts ?? 0), 0);
  if (belts) fx.push(`MERGED · ${belts} BELT${belts > 1 ? "S" : ""} REMOVED`);
  run.fuseFx = [...(run.fuseFx ?? []), ...fx];
}

/** The chain loop from copy `uid`: merge while a twin (same def, same stars below FUSE_MAX) exists. */
export function fuseFrom(run: Run, uid: number, choose?: WordChooser): FuseStep[] {
  return chain(run, uid, true, choose);
}

/** Merge every pair in the run (migration of old saves, tooling). Lowest stars first, then uid. ENCHANT-1: `choose` picks the word
 *  a merge of two different words keeps (the bots'); without it the survivor's own. */
export function fuseAll(run: Run, choose?: WordChooser): FuseStep[] {
  const steps: FuseStep[] = [];
  for (;;) {
    const all = copiesOf(run).filter((c) => fusible(c.def) && c.stars < FUSE_MAX).sort((x, y) => x.stars - y.stars || x.uid - y.uid);
    const c = all.find((x) => all.some((y) => y !== x && y.def === x.def && y.stars === x.stars && mergeable(x, y)));
    if (!c) return steps;
    steps.push(...chain(run, c.uid, false, choose));
  }
}

/**
 * 0.6.1b: a turret core gained onto a turret takes its socket. A bought core already there goes to cargo with
 * its stars: a swap, not the gear rule "ONE PIECE OF GEAR PER TURRET" (ARSENAL.md §2.1 rule 6). No merge can
 * follow from the swap itself: by the invariant the swapped core has no twin.
 */
function freeSocket(run: Run, turret: number): void {
  const old = coreFor(run.build, turret);
  if (!old) return;
  run.build.mods = run.build.mods.filter((m) => m.uid !== old.uid);
  run.inventory.push({ uid: old.uid, def: old.def, ...starField(starsOf(old)) });
}

/** THE way a module enters a run: a 1-star copy in cargo, on a deck cell or on a turret, then fused.
 *  0.6.1b: a core gained onto a turret swaps out the socket's bought core (freeSocket); gear on a turret is
 *  the caller's check. The survivor rules treat cores like mods; an absorbed core frees its socket, so that
 *  turret falls back to its signature core.
 *  HULL-1c (REQ-BFG-078; REVIEW-HULL1B N3): `stars` counts only for a copy to cargo (no `at`); a copy put on a cell or a
 *  turret (`at`) is ★1 whatever `stars` says. Its one caller with `stars`, road.ts finishWarlord, passes no `at`. */
export function gainModule(run: Run, def: string, at?: GainAt, stars = 1, opts?: { word?: EnchantFields; choose?: WordChooser }): Gain {
  const uid = run.nextUid++;
  if (at && "turret" in at && ITEMS[def]?.kind === "core") freeSocket(run, at.turret);
  if (at && "turret" in at) run.build.mods.push({ uid, def, turret: at.turret });
  else if (at) run.build.items.push({ uid, def, x: at.x, y: at.y, ...rotField(def, at.rot ?? 0) }); // rot: rigs only, never 0
  // HULL-1b (REQ-BFG-078): `stars`, a copy above 1 star into cargo (NPC_DAY's Hard drop at ★2); 1 = as before
  // ENCHANT-1 (REQ-BFG-085): `opts.word`, a copy that arrives enchanted into cargo (LAST CHANCE's part card); `opts.choose`, the bots' word pick
  else run.inventory.push({ uid, def, ...starField(stars), ...(enchantRules() ? enchantField(opts?.word) : {}) });
  const steps = fuseFrom(run, uid, opts?.choose);
  const fin = find(run, steps.length ? steps[steps.length - 1].survivor : uid)!;
  return { uid, steps, survivor: fin.uid, stars: fin.stars, where: fin.where };
}

/** What gaining one more copy of `def` into cargo would do, without changing the run (badge,
 *  inspect and pick cards): the final star level, the survivor and where it sits; null: no merge. */
export function mergePreview(run: Run, def: string): { toStars: number; survivorUid: number; where: FuseWhere } | null {
  if (!fusible(def)) return null;
  const sim = { ...run, build: JSON.parse(JSON.stringify(run.build)), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [] } as Run;
  const g = gainModule(sim, def);
  return g.steps.length ? { toStars: g.stars, survivorUid: g.survivor, where: g.where } : null;
}

/** Invariant check: one message per def and star level (below FUSE_MAX) held more than once. */
export function unfusedInRun(run: Run): string[] {
  // 0.6.2s: per def and star level, N ordinary and F free copies; a pair is unfused iff N >= 1 and N + F >= 2
  // (two free starting copies never merge). With no free copies this is the 0.6.1a rule (k > 1).
  const n = new Map<string, { n: number; f: number }>();
  for (const c of copiesOf(run)) {
    if (!fusible(c.def) || c.stars >= FUSE_MAX) continue;
    const e = n.get(`${c.def}*${c.stars}`) ?? { n: 0, f: 0 };
    if (c.free) e.f++;
    else e.n++;
    n.set(`${c.def}*${c.stars}`, e);
  }
  return [...n].filter(([, e]) => e.n >= 1 && e.n + e.f >= 2)
    .map(([key, e]) => { const [d, s] = key.split("*"); return `UNFUSED PAIR: ${ITEMS[d].name} ★${s} x${e.n + e.f}`; });
}

/** A copy of `o` with the star field of `stars` (absent at 1 star): moving parts keeps their stars. */
export function keepStars<T extends object>(o: T, stars: number): T & { stars?: number } {
  return { ...o, ...starField(stars) };
}
