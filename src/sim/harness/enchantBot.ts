// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E8): THE BOTS' WORDS. The par player values each offered word on every legal piece by the
// CHANGE IN THAT PIECE'S ROUTE DAMAGE, in the deck rating's own currency (deckRating.ts rateDeck, the number the par player already
// judges a part by: player.ts relOf), and buys the best (word, piece) pair when its value for the gold beats the threshold it holds a
// part to (player.ts pickOffer: a gain above PolicyKnobs.minRel, the best gain per gold). Nothing here rolls: the same deck gives the
// same values, so the policy's stream is not touched.
//
// THE MODEL (the static twin of the battle, as the rating is). rateDeck answers for the deck as it stands (offense per turret, the
// payloads a second per belt); deck.ts walkRoute gives each belt's damage per payload and what each rig adds to it. A word changes one
// of five things, and each is valued by recomputing the one turret term it touches: offense_t = thr(arrival, cap) x eq x ... :
//   * the value of each payload on the belts the piece touches (FIERY, RISING, GROWING, ECHOING on a rig, SWIFT on a factory
//     for the slug's own share) => eq changes by (the flow-weighted change) / (the flow-weighted eq);
//   * the arrival (ECHOING on a factory: 1 more slug every echoEvery-th WORK, run 5; SWIFT on a factory: twice as many) => the gun's throughput
//     min(arrival, cap) x firedShare(arrival / cap) is recomputed with the gun's own cap, which is what makes SWIFT good on a factory whose
//     gun has spare rate;
//   * the gun's cap and its shot (MASSIVE on a turret: half the rate, massiveShare x the DMG a shot; it queues less: the slugs it drops were
//     never fired). ENCHANT-1b (N1): MASSIVE is a turret's word and SWIFT a factory's, so neither is valued on the other kind;
//   * ECHOING on a turret: 1 shot in echoEvery hits twice (the turret's offense x (1 + 1 / echoEvery));
//   * the deck itself (WIDE: a rig's arrow, a factory's belt slot, a turret's gear slot): the deck is rated again with the word on it
//     (a rig: its best free side; a factory: the best belt the bots would lay into the new slot; a turret: the best gear waiting in cargo).
// The numbers a word is built from are enchant.ts ENCHANT_NUM (starting values), so a bench change moves the valuation with them.
//
// THE HONEST ESTIMATES (each is a single named number):
//   * RISING counts the slugs the piece sees in a fight (the belt's payloads a second x the part of the fight left after its first
//     payload; a turret: its shots), n, and is worth the step x stars x (n + 1) / 2 per payload (the mean rank), a rig's per arrow hit.
//   * GROWING is worth the step x stars x the mean `grow` over the dusks the piece will see before the run's tenth day
//     ((10 - day) / 2, at least 1 / 2, plus the counter it holds): a word bought on day 3 meets 8 dusks and averages 3.5 growths.
//   * BRACED is worth the STUN time it saves: stunsPerFight(day) stuns land on a deck a fight (a named guess; run 4 measured it, see below),
//     spread over its machines, each idles a part for DISRUPT_TIME s; the word swallows the first bracedStuns x stars of them, and what a stun
//     idles is the part's share of the offense.
//   * A held word is netted out: a new word's gain is measured on the piece WITHOUT its old word, less what the old word is worth there,
//     so the bots replace a word only for a higher-valued one.
// Pieces in cargo are worth 0 (they do no damage until they are placed). This file reads no star value itself (tests/harness.mods.test.ts).

import { BURN_DPS, BURN_TIME, DISRUPT_TIME, ITEMS, RUN_DAYS, rateMul, secPer } from "../content";
import { FURNACE_LONG_BELT, gearStats } from "../battle";
import { resolveCore } from "../cores";
import { canFitGear, cloneBuild, connectorClaims, installedTurrets, journeyTiles, occupancy, rigHits, routeInfo, setTurretList, turretList, walkRoute, type Build } from "../deck";
import { EQ, RATING_CURVE, fightTime, firedShare, rateDeck, type DeckRating, type RateOut } from "../deckRating";
import {
  ENCHANT_IDS, ENCHANT_NUM, enchantKindOf, enchantProblem, enchantRules, enchantStars, freeSides, isEnchantId, liveWord,
  type EnchantFields, type EnchantId, type EnchantKind, type WordChooser,
} from "../enchant";
import { roundHalfUp } from "../pct";
import { effectAt, gradeOf, starField, starsOf } from "../stars";
import type { Rng } from "../../core/rng";
import { applyProblem, buyEnchant, enchantChoices, pendingEnchantPick, skipWarlordWord, takeWarlordWord, wideSides, type EnchantTarget } from "../../game/enchanter";
import { pickMergedWord } from "../../game/fuse";
import type { Run } from "../../game/run";

// ---------------------------------------------------------------- the knobs of the estimates

/** BRACED's estimate: the STUNs a foe lands on a deck in one fight, at dusk of `day` (1 + 0.4 a day: 1.4 on day 1, 3 on day 5, 5 on day 10),
 *  spread evenly over the deck's machines. A guess in the direction the par field's decks go (more stun sources on later days).
 *  RUN 4 MEASURED what lands (tools/enchant1/stuns.ts: the four heroes' par fields, k 96, 12 opponents a deck from the other heroes' fields,
 *  both sides, 2,304 battles a hero and day; O/bench/stuns-st1-*.json; mean of the four heroes, on a rig, factory or turret): 2.6 on day 3,
 *  4.4 on day 5, 6.6 on day 7, 8.6 on day 10, a line at 0.86 a day (belt tiles take about as many again and hold no word). The guess is KEPT:
 *  this static rating charges a stun's whole DISRUPT_TIME as lost fire (it ignores the backlog a gun with spare rate fires after the stun), and
 *  with the measured count it values BRACED at 0.085 of the deck on the furnace start deck against the battle's 1.1 win points (E9a, day 5,
 *  ★1); the low count and the dear stun roughly cancel. Changing it changes what par buys (REPORT 10, finding BRACED). */
export const stunsPerFight = (day: number): number => 1 + 0.4 * Math.max(0, Math.floor(day));
/** GROWING's horizon: the run's tenth day (a word meets the dusks from today to it). */
export const GROW_HORIZON = RUN_DAYS;
/** The seconds a gun spends loading before a belt's payload can leave it (the rating's window, about 1.5 s) and its shell's flight. */
const LOAD_AND_FLIGHT = 2;

// ---------------------------------------------------------------- the model

/** A piece a word can go on and be valued on: a rig or factory on the deck, or an installed turret (cargo is worth 0). */
export type WordTarget = { kind: "item"; uid: number } | { kind: "turret"; slot: number };

/** One piece of the deck as the valuation reads it. */
export interface WordPiece {
  target: WordTarget;
  kind: EnchantKind;
  def: string;
  uid: number;
  slot?: number;
  stars: number; // 1..3: a signature factory's grade counts (stars.ts gradeOf)
  held?: EnchantId; // the word it holds now (ENCHANT on)
  heldDir?: number;
  grow: number; // GROWING's counter
}

interface Route {
  ri: number;
  t: number; // the turret slot it feeds
  fac: number; // its factory's uid
  a: number; // payloads a second the turret takes from it (rateDeck's arrival after joins)
  v: number; // the walk's damage per payload, with its BURN stacks at BURN_TIME x BURN_DPS each (the route damage the brief names)
  own: number; // the slug's own share of that (the walk's damage less the rigs' flat): what MASSIVE and SWIFT scale at the factory
  left: number; // the share of the fight left after its first payload lands
  tiles: number;
  hits: Map<number, number>; // rig uid -> the arrow hits it lands on one payload
  gain: Map<number, number> // rig uid -> the damage (flat + BURN) its hits add to one payload
}

interface Tur {
  slot: number;
  D: number; // rateDeck's offense of this turret
  A: number; // payloads a second it takes
  eq: number; // the flow-weighted payload value (rateDeck's eq with the walk's numbers)
  cap: number; // the payloads a second it can fire at best
  noJam: boolean;
  thr: number; // payloads a second it fires: min(A, cap) x firedShare
  lavg: number; // the flow-weighted share of the fight left
  W: number; // sum of a x v x left over its belts (the weights of a belt's share)
  routes: Route[];
}

/** The deck as the valuation reads it: the rating, each belt's numbers and each turret's throughput. Built once per deck and day. */
export interface WordModel {
  b: Build;
  day: number;
  fight: number;
  base: DeckRating;
  routes: Route[];
  turrets: Map<number, Tur>;
  machines: number;
}

const thrOf = (A: number, cap: number, noJam: boolean): number => (cap > 0 ? Math.min(A, cap) * firedShare(A / cap, noJam, RATING_CURVE) : A);

/** The pieces a word can go on and be valued on: deck rigs and factories (by uid), installed turrets (by slot). */
export function piecesOf(b: Build): WordPiece[] {
  const out: WordPiece[] = [];
  for (const p of [...b.items].sort((x, y) => x.uid - y.uid)) {
    const kind = enchantKindOf(ITEMS[p.def]);
    if (!kind) continue;
    const held = liveWord(p);
    out.push({
      target: { kind: "item", uid: p.uid }, kind, def: p.def, uid: p.uid, stars: enchantStars(kind === "factory" ? gradeOf(b, p) : starsOf(p)),
      ...(held ? { held, ...(p.enchDir !== undefined ? { heldDir: p.enchDir } : {}) } : {}), grow: p.grow ?? 0,
    });
  }
  for (const s of installedTurrets(b)) {
    const held = liveWord(s.turret);
    out.push({
      target: { kind: "turret", slot: s.slot }, kind: "turret", def: s.turret.def, uid: s.turret.uid, slot: s.slot, stars: enchantStars(starsOf(s.turret)),
      ...(held ? { held } : {}), grow: s.turret.grow ?? 0,
    });
  }
  return out;
}

/** The deck with the word of piece `p` taken off (the baseline a word is valued against); the same deck when it holds none. */
function stripped(b: Build, p: WordPiece): Build {
  if (!p.held) return b;
  const c = cloneBuild(b);
  const o: EnchantFields | undefined = p.target.kind === "item" ? c.items.find((x) => x.uid === p.uid) : (c.turrets ?? []).find((t) => t.slot === p.slot);
  if (o) {
    delete o.ench;
    delete o.enchDir;
    delete o.grow;
  }
  return c;
}

/** The model of deck `b` at dusk of `day`: rateDeck's rating and read-outs, the walk of every connected belt, every turret's throughput. */
export function modelOf(b: Build, day: number): WordModel {
  const fight = fightTime(day);
  const out: RateOut = { stokeKeep: new Map(), arrival: new Map(), turretDmg: new Map() };
  const base = rateDeck(b, RATING_CURVE, fight, out, undefined, day);
  const hits = rigHits(b), claims = connectorClaims(b), occ = occupancy(b);
  const burnV = BURN_TIME * BURN_DPS;
  const routes: Route[] = [];
  b.routes.forEach((rt, ri) => {
    const info = routeInfo(b, ri, claims, occ, hits);
    if (!info.connected || info.turret < 0) return;
    const a = out.arrival?.get(ri) ?? 0;
    if (a <= 0) return;
    const w = walkRoute(b, ri, hits), e = w.estimate;
    const hm = new Map<number, number>(), gm = new Map<number, number>();
    for (const row of w.timeline) {
      for (const th of row.hits) {
        hm.set(th.uid, (hm.get(th.uid) ?? 0) + 1);
        gm.set(th.uid, (gm.get(th.uid) ?? 0) + (th.flat ?? 0) + burnV * (th.burn ?? 0));
      }
    }
    routes.push({
      ri, t: info.turret, fac: rt.factory, a, v: Math.max(1, e.dmg + burnV * e.burn + (e.shock ? EQ.shock : 0)), own: Math.max(0, e.dmg - (e.flat ?? 0)),
      left: Math.max(0.1, (fight - e.time - LOAD_AND_FLIGHT) / fight), tiles: info.join ? journeyTiles(b, ri, occ) : rt.cells.length, hits: hm, gain: gm,
    });
  });
  const turrets = new Map<number, Tur>();
  for (const s of installedTurrets(b)) {
    const rs = routes.filter((r) => r.t === s.slot);
    const D = out.turretDmg?.get(s.slot) ?? 0;
    if (!rs.length || D <= 0) continue;
    // the gun's cap, as rateDeck computes it (deckRating.ts: the speed x the gear's x the core's, E1's long belt; STEAM BREECH's cadence is not modelled)
    const g = gearStats(b, s.slot), core = resolveCore(b, s.slot, s.td);
    const longest = Math.max(...rs.map((r) => r.tiles));
    const raw = s.td.speed * g.speedMul * (b.hero === "furnace" && longest >= 8 ? rateMul(FURNACE_LONG_BELT) : 1) * rateMul(core.spec.fireRate);
    const cap = Math.min(g.perShot, s.td.window + g.window) / secPer(Math.max(1, roundHalfUp(raw)));
    const A = rs.reduce((x, r) => x + r.a, 0), noJam = g.noJam || !!core.spec.noJam;
    const W = rs.reduce((x, r) => x + r.a * r.v * r.left, 0);
    turrets.set(s.slot, {
      slot: s.slot, D, A, eq: W / A, cap, noJam, thr: thrOf(A, cap, noJam), lavg: rs.reduce((x, r) => x + r.a * r.left, 0) / A, W, routes: rs,
    });
  }
  return { b, day, fight, base, routes, turrets, machines: Math.max(1, b.items.filter((p) => !!enchantKindOf(ITEMS[p.def])).length + installedTurrets(b).length) };
}

// ---------------------------------------------------------------- one word on one piece

/** What the valuation may need beyond the deck: cargo (WIDE on a turret needs gear waiting), the next uid, and the player's own belt rule. */
export interface WordExtras {
  inventory?: readonly { uid: number; def: string; stars?: number }[];
  nextUid?: number;
  /** WIDE on a factory: the rating gain (a fraction of `base`, the deck's rating value) of the best belt the bots would lay into the new slot of `after` (-Infinity: none). */
  wideFactory?: (after: Build, base: number) => number;
  /** ENCHANT-2 (REQ-BFG-085, T5a): a spot the GAME would refuse is skipped, so the bot plans the next-best legal one instead of throwing in buyPlan / botWarlordPick
   *  (the long run's day 11+ par runs met `TAKE ITS EXTRA BELT OFF FIRST`: SWIFT planned over a WIDE factory whose extra belt is in use, fuse.ts wideBeltProblem).
   *  Set by enchanterPlans and botWarlordPick from the run (game/enchanter.ts applyProblem); absent: every enchantProblem-legal spot counts, as before. */
  legal?: (target: WordTarget, word: string) => boolean;
}

/** A word's worth on a piece: the relative rating gain and, for WIDE on a rig, the side that earns it. */
export interface WordGain { value: number; dir?: number }

/** The mean growth a GROWING word will have by the dusks of the run: see the header. */
export const growEstimate = (day: number, grow0: number): number => Math.max(1, GROW_HORIZON - day) / 2 + grow0;

/** The payload counts RISING reads: the slugs the piece sees in one fight. */
function slugsOf(m: WordModel, p: WordPiece, touched: { r: Route; h: number }[]): number {
  if (p.kind === "turret") {
    const t = m.turrets.get(p.slot!);
    return t ? t.thr * m.fight * t.lavg : 0;
  }
  return touched.reduce((s, x) => s + x.r.a * m.fight * x.r.left, 0);
}

/** The belts a piece's word reaches and how many times it reaches a payload there (a rig: its arrow hits; a factory or a turret: 1). */
function touchOf(m: WordModel, p: WordPiece): { r: Route; h: number }[] {
  if (p.kind === "rig") return m.routes.filter((r) => r.hits.has(p.uid)).map((r) => ({ r, h: r.hits.get(p.uid)! }));
  if (p.kind === "factory") return m.routes.filter((r) => r.fac === p.uid).map((r) => ({ r, h: 1 }));
  return m.routes.filter((r) => r.t === p.slot).map((r) => ({ r, h: 1 }));
}

/**
 * Slugs one WORK of factory `p` puts out (ECHOING counts works, run 5; enchantFx.ts slugMadeFx): a batch (DOUBLE STAMP 2, ★3 3; SHOT
 * TOWER 3), a pour (TWIN MOULD, the CRUCIBLE: one a belt, at most its pour size), else 1. `belts` is how many belts it feeds.
 */
function slugsPerWork(p: WordPiece, belts: number): number {
  const spec = effectAt(p.def, p.stars).factory;
  if (!spec) return 1;
  return Math.max(1, spec.batch ?? 1) * (spec.pour ? Math.max(1, Math.min(belts, spec.pour)) : 1);
}

/** The part of the offense a STUN on the piece idles: a turret's whole term, a factory's belts' shares, a rig's own bonus on its belts. */
function shareOf(m: WordModel, p: WordPiece, touched: { r: Route; h: number }[]): number {
  if (m.base.offense <= 0) return 0;
  if (p.kind === "turret") return (m.turrets.get(p.slot!)?.D ?? 0) / m.base.offense;
  let d = 0;
  for (const { r } of touched) {
    const t = m.turrets.get(r.t);
    if (!t || t.W <= 0) continue;
    const s = (r.a * r.v * r.left) / t.W; // the belt's share of its turret's offense
    d += t.D * s * (p.kind === "factory" ? 1 : Math.min(1, (r.gain.get(p.uid) ?? 0) / r.v));
  }
  return d / m.base.offense;
}

/**
 * The relative gain (a fraction of the deck's rating, player.ts relOf's currency) of putting `word` on piece `p` of `m`'s deck, the deck
 * read WITHOUT any word `p` holds. `grow0` is GROWING's counter on `p` (the counter a held GROWING has; 0 for a new word). WIDE and
 * BRACED are valued here too (see the header); the extras serve WIDE only.
 */
export function wordGain(m: WordModel, p: WordPiece, word: EnchantId, grow0 = 0, x: WordExtras = {}): WordGain {
  const N = ENCHANT_NUM, S = p.stars, burnV = BURN_TIME * BURN_DPS;
  if (enchantProblem(p.def, word) !== null) return { value: 0 };
  if (word === "wide") return wideGain(m, p, x);
  const touched = touchOf(m, p);
  if (!touched.length) return { value: 0 };
  if (word === "braced") {
    const e = stunsPerFight(m.day) / m.machines;
    return { value: (Math.min(N.bracedStuns * S, e) * DISRUPT_TIME * shareOf(m, p, touched)) / m.fight };
  }
  const np = slugsOf(m, p, touched);
  let dOffense = 0;
  for (const tslot of new Set(touched.map((q) => q.r.t))) {
    const T = m.turrets.get(tslot);
    if (!T || T.thr <= 0 || T.eq <= 0) continue;
    const mine = new Map(touched.filter((q) => q.r.t === tslot).map((q) => [q.r, q.h] as const));
    let capScale = 1, eqScale = 1;
    const perWork = word === "echoing" && p.kind === "factory" ? slugsPerWork(p, touched.length) : 1; // 1 more slug in echoEvery works: a batch or a pour is one work
    const k = (r: Route): number => {
      if (!mine.has(r) || p.kind !== "factory") return 1;
      if (word === "echoing") return 1 + 1 / (N.echoEvery * perWork);
      return word === "swift" ? 2 : 1; // ENCHANT-1b (N1): a factory's word (MASSIVE is a turret's)
    };
    const dv = (r: Route): number => {
      const h = mine.get(r);
      if (h === undefined) return 0;
      switch (word) {
        case "fiery": return h * S * N.burn * burnV;
        case "rising": return h * N.risingStep * S * (np + 1) / 2;
        case "growing": return h * N.growingStep * S * growEstimate(m.day, grow0);
        case "echoing": return p.kind === "rig" ? (r.gain.get(p.uid) ?? 0) / N.echoEvery : 0; // every echoEvery-th slug it hits gets its stats twice
        case "swift": return p.kind === "factory" ? -Math.min(r.own / 2, Math.max(0, r.v - 10)) : 0; // half the share (a slug never under 10)
        default: return 0; // MASSIVE is a turret's word (ENCHANT-1b N1): its whole value is the gun's cap and shot, below. (Run 4 had a factory case here, (massiveShare - 1) x r.own.)
      }
    };
    if (p.kind === "turret") {
      if (word === "echoing") eqScale = 1 + 1 / N.echoEvery; // 1 shot in echoEvery hits twice
      else if (word === "massive") { capScale = 0.5; eqScale = ENCHANT_NUM.massiveShare; } // fires half as often, massiveShare x DMG a shot
    }
    const A2 = T.routes.reduce((s, r) => s + r.a * k(r), 0);
    const W2 = T.routes.reduce((s, r) => s + r.a * k(r) * (r.v + dv(r)) * r.left, 0);
    const eq2 = A2 > 0 ? W2 / A2 : 0;
    const D2 = (T.D * (thrOf(A2, T.cap * capScale, T.noJam) / T.thr) * (eq2 / T.eq)) * eqScale;
    dOffense += D2 - T.D;
  }
  return { value: m.base.offense > 0 ? dOffense / m.base.offense : 0 };
}

/** WIDE: the deck rated again with the word on the piece (a rig: its best free side; a factory: the player's belt for the new slot; a turret: the best cargo gear). */
function wideGain(m: WordModel, p: WordPiece, x: WordExtras): WordGain {
  const base = m.base.value;
  if (base <= 0) return { value: 0 };
  const rate = (a: Build): number => rateDeck(a, RATING_CURVE, m.fight, undefined, undefined, m.day).value / base - 1;
  const item = (a: Build): EnchantFields | undefined => a.items.find((q) => q.uid === p.uid);
  if (p.kind === "rig") {
    let best: WordGain = { value: 0 };
    for (const d of freeSides(p.def)) {
      const a = cloneBuild(m.b), o = item(a)!;
      o.ench = "wide";
      o.enchDir = d;
      const v = rate(a);
      if (v > best.value) best = { value: v, dir: d };
    }
    return best;
  }
  if (p.kind === "factory") {
    if (!x.wideFactory) return { value: 0 };
    const a = cloneBuild(m.b);
    item(a)!.ench = "wide";
    const v = x.wideFactory(a, base);
    return { value: Number.isFinite(v) && v > 0 ? v : 0 };
  }
  let best = 0;
  for (const it of x.inventory ?? []) {
    if (ITEMS[it.def]?.kind !== "mod") continue; // gear (a core has its own socket)
    const a = cloneBuild(m.b), list = turretList(a), t = list.find((q) => q.slot === p.slot);
    if (!t) continue;
    t.ench = "wide";
    setTurretList(a, list); // a word on a turret writes build.turrets (the starting layout has none)
    if (!canFitGear(a, p.slot!, it.def).ok) continue;
    a.mods.push({ uid: x.nextUid ?? 1_000_000, def: it.def, turret: p.slot!, ...starField(starsOf(it)) });
    best = Math.max(best, rate(a));
  }
  return { value: best };
}

/** The relative gain of `word` on the piece `target` of deck `b` (the piece's own word netted out: `net`, default true, subtracts what the held word is worth there). */
export function wordValue(b: Build, day: number, target: WordTarget, word: string, opts: { dir?: number; net?: boolean; extras?: WordExtras } = {}): number {
  if (!isEnchantId(word)) return 0;
  const piece = piecesOf(b).find((q) => q.target.kind === target.kind && (target.kind === "item" ? q.uid === (target as { uid: number }).uid : q.slot === (target as { slot: number }).slot));
  if (!piece) return 0;
  const m = modelOf(stripped(b, piece), day), x = opts.extras ?? {};
  let v = wordGain(m, piece, word, 0, x).value;
  if (opts.net !== false && piece.held && piece.held !== word) v -= wordGain(m, piece, piece.held, piece.grow, x).value;
  return v;
}

// ---------------------------------------------------------------- the best word for a deck

/** What a bot looks at: a build with its cargo and the day (a Run satisfies it). */
export interface WordState {
  build: Build;
  inventory?: readonly { uid: number; def: string; stars?: number }[];
  day: number;
  nextUid?: number;
}

/** The best place for a word: where, the relative rating gain over the piece as it is (its old word netted out), WIDE's side, and the word it replaces. */
export interface WordSpot {
  target: WordTarget;
  value: number;
  dir?: number;
  replaces?: EnchantId;
  def: string;
}

/**
 * The best legal piece for `word` on the deck in `s` (a Run or a build with its day): the pair with the highest value; null when no
 * piece gains. Cargo is never a target (a piece in cargo does no damage). A piece that holds this very word is skipped; one that holds
 * another is a target only when this word is worth more there than the one it holds (REPLACES FIERY), so the bots never trade a word
 * for a lower-valued one. Ties go to the lower uid (items first), then the lower slot. `x`: WIDE's extras (cargo, the belt rule).
 */
export function bestWordFor(s: WordState, word: string, x: WordExtras = {}): WordSpot | null {
  if (!enchantRules() || !isEnchantId(word)) return null;
  const ex: WordExtras = { inventory: s.inventory, nextUid: s.nextUid, ...x };
  const pieces = piecesOf(s.build), main = modelOf(s.build, s.day);
  let best: WordSpot | null = null;
  for (const p of pieces) {
    if (enchantProblem(p.def, word) !== null || p.held === word) continue;
    if (ex.legal && !ex.legal(p.target, word)) continue; // ENCHANT-2 (T5a): the game would refuse this spot
    const m = p.held ? modelOf(stripped(s.build, p), s.day) : main;
    const g = wordGain(m, p, word, 0, ex);
    const old = p.held ? wordGain(m, p, p.held, p.grow, ex).value : 0;
    const value = g.value - old;
    if (value > (best?.value ?? 1e-9)) best = { target: p.target, value, ...(g.dir !== undefined ? { dir: g.dir } : {}), ...(p.held ? { replaces: p.held } : {}), def: p.def };
  }
  return best;
}

/** The value of every legal (piece, word) pair, for a table or a test: best first. */
export function rankWords(s: WordState, word: string, x: WordExtras = {}): WordSpot[] {
  if (!enchantRules() || !isEnchantId(word)) return [];
  const ex: WordExtras = { inventory: s.inventory, nextUid: s.nextUid, ...x };
  const main = modelOf(s.build, s.day), out: WordSpot[] = [];
  for (const p of piecesOf(s.build)) {
    if (enchantProblem(p.def, word) !== null || p.held === word) continue;
    const m = p.held ? modelOf(stripped(s.build, p), s.day) : main;
    const g = wordGain(m, p, word, 0, ex);
    out.push({ target: p.target, value: g.value - (p.held ? wordGain(m, p, p.held, p.grow, ex).value : 0), ...(g.dir !== undefined ? { dir: g.dir } : {}), ...(p.held ? { replaces: p.held } : {}), def: p.def });
  }
  return out.sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------- the merge chooser

/**
 * A prior worth of a word on a kind of piece, in the units of wordGain (a fraction of the rating) for a typical par deck: the order the
 * PIECES-1 4.8 rules of thumb give. Used where there is no deck to read (harness/merge.ts, a piece in cargo): FIERY, RISING and GROWING
 * are the damage words; ECHOING is a third more on a turret or factory; MASSIVE and SWIFT are conditional (worth little blind); WIDE
 * waits for gear, a free side or a belt; BRACED saves some stun time.
 */
export const WORD_PRIOR: Readonly<Record<EnchantKind, Readonly<Record<EnchantId, number>>>> = {
  rig: { fiery: 0.03, rising: 0.025, growing: 0.035, echoing: 0.015, massive: 0, swift: 0, wide: 0.02, braced: 0.005 },
  factory: { fiery: 0.035, rising: 0.03, growing: 0.04, echoing: 0.03, massive: 0, swift: 0.02, wide: 0.015, braced: 0.006 }, // ENCHANT-1b (N1): MASSIVE is a turret's word
  turret: { fiery: 0.035, rising: 0.03, growing: 0.04, echoing: 0.03, massive: 0.02, swift: 0, wide: 0.01, braced: 0.008 }, // ENCHANT-1b (N1): SWIFT is a factory's word
};

/** The prior worth of the word `f` holds on piece kind `def` at `stars` (GROWING's counter adds to it: each growth is worth a step). */
export function priorValue(def: string, f: EnchantFields): number {
  const kind = enchantKindOf(ITEMS[def]), id = f.ench;
  if (!kind || !isEnchantId(id)) return 0;
  return WORD_PRIOR[kind][id] + (id === "growing" ? 0.004 * (f.grow ?? 0) : 0);
}

/**
 * E4, the bots: a merge of two DIFFERENT words keeps the higher-valued one (the survivor's on a tie), judged by the prior worth of each
 * on the merged piece's kind. A deck-aware chooser (chooserFor) reads the survivor's place on the deck instead.
 */
export const chooser: WordChooser = ({ def, a, b }) => (priorValue(def, b) > priorValue(def, a) ? b : a);

/**
 * The chooser for the run the bot is playing: the two words valued on the survivor where it stands (wordGain on the deck without its
 * word), so a merge keeps the word that does more THERE; a survivor in cargo, or one not found, falls back to the prior. fuse.ts calls it
 * after the merge, with the survivor already at its new stars and still holding its own word.
 */
export function chooserFor(run: Pick<Run, "build" | "inventory" | "day">): WordChooser {
  return ({ def, stars, a, b }) => {
    const mine = (f: EnchantFields): boolean => f.ench !== undefined;
    if (!mine(a) || !mine(b)) return mine(b) ? b : a;
    const piece = piecesOf(run.build).find((q) => q.def === def && q.stars === enchantStars(stars) && q.held === a.ench && (q.heldDir === undefined || q.heldDir === a.enchDir));
    if (!piece) return chooser({ def, stars, a, b });
    const m = modelOf(stripped(run.build, piece), run.day), x: WordExtras = { inventory: run.inventory };
    const va = wordGain(m, piece, a.ench as EnchantId, a.grow ?? 0, x).value, vb = wordGain(m, piece, b.ench as EnchantId, b.grow ?? 0, x).value;
    return vb > va ? b : a;
  };
}

/** The chooser the par player passes every merge path with ENCHANT on (undefined off: buyOffer and gainModule take the survivor's word as today). */
export const wordPick = (run: Pick<Run, "build" | "inventory" | "day">): WordChooser | undefined => (enchantRules() ? chooserFor(run) : undefined);

/** A bot that left a merge pick open (gainModule inside the game's own road code: a warlord's drop): keep the word that is worth more on the piece. */
export function settleMergePick(run: Run): void {
  const m = run.enchMerge;
  if (!m || !enchantRules()) return;
  const keep = chooserFor(run)({ def: pieceDef(run, m.uid), stars: pieceStars(run, m.uid), a: m.kept, b: m.lost });
  pickMergedWord(run, keep === m.lost && m.lost.ench !== m.kept.ench);
}

function pieceDef(run: Run, uid: number): string {
  return run.build.items.find((p) => p.uid === uid)?.def ?? turretList(run.build).find((t) => t.uid === uid)?.def ?? run.inventory.find((i) => i.uid === uid)?.def ?? "";
}
function pieceStars(run: Run, uid: number): number {
  const o = run.build.items.find((p) => p.uid === uid) ?? turretList(run.build).find((t) => t.uid === uid) ?? run.inventory.find((i) => i.uid === uid);
  return starsOf(o);
}

// ---------------------------------------------------------------- the par player's purchases and picks

/** What a bot decides to do with one ENCHANTER offer or warlord word: where it goes and what it is worth. */
export interface WordPlan { word: EnchantId; spot: WordSpot }

/**
 * The par player's word candidates at the ENCHANTER: for each unsold offer the purse affords, the best (word, piece) pair; a pair
 * is only listed when it gains. `x` carries the player's belt rule for WIDE on a factory. [] with ENCHANT off or no ENCHANTER wagon today.
 */
export function enchanterPlans(run: Run, x: WordExtras = {}): { slot: number; price: number; plan: WordPlan }[] {
  const w = run.shop.enchanter;
  if (!enchantRules() || !w) return [];
  const out: { slot: number; price: number; plan: WordPlan }[] = [];
  w.offers.forEach((o, slot) => {
    if (o.sold || o.price > run.gold || !isEnchantId(o.ench)) return;
    const spot = bestWordFor(run, o.ench, { legal: (t, wd) => applyProblem(run, t, wd) === null, ...x }); // ENCHANT-2 (T5a): + legal, the game's own refusals
    if (spot) out.push({ slot, price: o.price, plan: { word: o.ench as EnchantId, spot } });
  });
  return out;
}

/** Buy the planned word through the game's own action (buyEnchant: applied, then paid); throws if the game refuses what the bot planned. */
export function buyPlan(run: Run, slot: number, plan: WordPlan): void {
  const { spot, word } = plan;
  const r = buyEnchant(run, slot, spot.target, { ...(spot.dir !== undefined ? { dir: spot.dir } : {}), ...(spot.replaces ? { replace: true } : {}) });
  if (!r.ok) throw new Error(`par player: buyEnchant ${word} -> ${JSON.stringify(spot.target)} failed: ${r.reason}`);
}

/**
 * A warlord win's pick (E5b): the par player takes the word, of the two, that gains the most on its best piece, for nothing
 * (takeWarlordWord); when no piece gains from either it says NO THANKS (skipWarlordWord). Returns what it did.
 */
export function botWarlordPick(run: Run, x: WordExtras = {}): { took: EnchantId; spot: WordSpot } | "skipped" | null {
  const pk = pendingEnchantPick(run);
  if (!pk) return null;
  let best: { i: number; word: EnchantId; spot: WordSpot } | undefined;
  pk.words.forEach((w, i) => {
    const spot = isEnchantId(w) ? bestWordFor(run, w, { legal: (t, wd) => applyProblem(run, t, wd) === null, ...x }) : null; // ENCHANT-2 (T5a): + legal
    if (spot && spot.value > (best?.spot.value ?? 1e-9)) best = { i, word: w as EnchantId, spot };
  });
  if (!best) {
    skipWarlordWord(run);
    return "skipped";
  }
  const r = takeWarlordWord(run, best.i, best.spot.target, { ...(best.spot.dir !== undefined ? { dir: best.spot.dir } : {}), ...(best.spot.replaces ? { replace: true } : {}) });
  if (!r.ok) throw new Error(`par player: warlord word ${best.word} -> ${JSON.stringify(best.spot.target)} failed: ${r.reason}`);
  return { took: best.word, spot: best.spot };
}

// ---------------------------------------------------------------- the casual player's words

/** The share of the ENCHANTER's offers a casual player buys (a coin per affordable offer, on its own seeded stream). */
export const CASUAL_WORD_RATE = 0.5;

/** The pieces a casual player may put a word on: legal, on the deck or an installed turret, holding no word (it never replaces one). */
function casualTargets(run: Run, word: string): { target: EnchantTarget; sides: number[] }[] {
  return enchantChoices(run, word)
    .filter((c) => c.reason === null && c.target.kind !== "cargo" && c.held === undefined)
    .map((c) => ({ target: c.target, sides: c.sides }));
}

/**
 * THE CASUAL RULE (harness/casual.ts; tools): each unsold ENCHANTER offer the purse affords is bought with chance `rate` (a seeded coin),
 * and goes on a seeded legal piece that holds no word (a seeded free side for WIDE on a rig); with no such piece the offer is left. The
 * rule never reads a rating and never replaces a word. `rng` is the caller's own stream (never the policy's). Returns what it bought.
 */
export function casualWordBuys(run: Run, rate: number, rng: Rng): { word: string; on: string; price: number; target: EnchantTarget }[] {
  const w = run.shop.enchanter, out: { word: string; on: string; price: number; target: EnchantTarget }[] = [];
  if (!enchantRules() || !w) return out;
  w.offers.forEach((o, slot) => {
    if (o.sold || o.price > run.gold || rng.next() >= rate) return;
    const list = casualTargets(run, o.ench);
    if (!list.length) return;
    const pick = rng.pick(list);
    const dir = pick.sides.length ? rng.pick(pick.sides) : undefined;
    const on = pieceDef(run, pick.target.kind === "turret" ? (turretUid(run, pick.target.slot) ?? -1) : pick.target.uid);
    const r = buyEnchant(run, slot, pick.target, dir !== undefined ? { dir } : {});
    if (r.ok) out.push({ word: o.ench, on, price: o.price, target: pick.target });
  });
  return out;
}

function turretUid(run: Run, slot: number): number | undefined {
  return turretList(run.build).find((t) => t.slot === slot)?.uid;
}

/** The casual player's warlord pick: a seeded word of the two on a seeded legal piece with no word; NO THANKS when none takes it. */
export function casualWarlordPick(run: Run, rng: Rng): boolean {
  const pk = pendingEnchantPick(run);
  if (!pk) return false;
  const i = rng.int(2), list = casualTargets(run, pk.words[i]);
  if (!list.length) {
    skipWarlordWord(run);
    return false;
  }
  const pick = rng.pick(list), dir = pick.sides.length ? rng.pick(pick.sides) : undefined;
  const r = takeWarlordWord(run, i, pick.target, dir !== undefined ? { dir } : {});
  if (!r.ok) skipWarlordWord(run);
  return r.ok;
}

// ---------------------------------------------------------------- a word that arrives with a part (LAST CHANCE)

/** The words a deck holds, in deck order (rigs and factories by uid, then installed turrets by slot): for the HOLDING table and the tests. */
export function wordsHeld(b: Build): { word: EnchantId; def: string; grow: number }[] {
  return piecesOf(b).filter((p) => p.held).map((p) => ({ word: p.held!, def: p.def, grow: p.grow }));
}

/** How many words a deck holds. */
export const wordCount = (b: Build): number => (enchantRules() ? wordsHeld(b).length : 0);

/** Is `target` a legal place for `word` (a quick check for the bots, the game's own applyProblem)? */
export const legalFor = (run: Run, target: EnchantTarget, word: string, dir?: number): boolean => applyProblem(run, target, word, dir) === null;

/** WIDE's free sides on a rig target (enchanter.ts wideSides), re-exported for the tests. */
export { wideSides };
export { ENCHANT_IDS };
