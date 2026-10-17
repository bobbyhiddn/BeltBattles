// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E4, E5): the RUN side of the words: the ENCHANTER's wagon, buying-is-applying, the warlord
// pick, the targets a word can go on and why it can't, and the sell warning. Pure game state (no DOM): the build screen's APPLY, the
// bots (harness/enchantBot.ts) and the tests all call these. The seeded words are src/sim/enchantSources.ts; the merge is fuse.ts.
//
// WHAT A TARGET IS: a rig or factory on the deck (`item`, by uid), an installed turret (`turret`, by slot) or a piece in cargo (`cargo`,
// by uid). A word is applied by uid wherever the piece is (fuse.ts setPieceWord), so a piece keeps it when it is moved, stored or
// placed again. NOTHING STACKS: a second word asks first (`REPLACES FIERY`) and replaces the old one, whose counter goes with it.
//
// With ENCHANT off nothing here does anything: no wagon, no pick, every call refuses.

import { ITEMS } from "../sim/content";
import { turretList, turretSlots } from "../sim/deck";
import {
  enchantDef, enchantKindOf, enchantProblem, enchantRules, freeSides, isEnchantId, liveWord, replacesText, sellAskText, withEnchantment,
  type EnchantFields,
} from "../sim/enchant";
import { ENCHANTER_PRICE, WARLORD_PICK_FROM, enchanterWords, warlordPickWords } from "../sim/enchantSources";
import { npcDayRules } from "../sim/npcDay";
import { starsOf } from "../sim/stars";
import { setPieceWord } from "./fuse";
import type { InvItem, Run } from "./run";

/** What a buy says in REFIT with NPC_DAY on: run.ts REFIT_NO_SHOP, word for word (a test holds them equal; run.ts imports this file). */
export const ENCHANTER_SHUT = "REFIT: THE CARAVAN HAS MOVED ON";

/** NPC-1's shopShut, as run.ts has it: no buying in REFIT or at dusk with NPC_DAY on. */
const shut = (run: Pick<Run, "stage">): boolean => npcDayRules() && (run.stage === "refit" || run.stage === "battle");

// ---------------------------------------------------------------------------------------------------------------- the wagon (E5a)

/**
 * At the end of run.ts rollShop (every dawn, and again on a REROLL): the ENCHANTER's wagon for today. With ENCHANT on and on an
 * ENCHANTER day it carries 2 different words at ENCHANTER_PRICE each, from hashSeed(seed, "ench", day, "enchanter"); a REROLL (or a
 * second call the same day) leaves it exactly as it is, sold flags included. It is added AFTER the base's wagons and draws on its own
 * stream, so every other offer is what it was. Off, or on any other day: no wagon.
 */
export function rollEnchanter(run: Run): void {
  if (!enchantRules()) return;
  const have = run.shop.enchanter;
  if (have && have.day === run.day) return;
  const words = enchanterWords(run.seed, run.day);
  if (!words.length) {
    delete run.shop.enchanter;
    return;
  }
  run.shop.enchanter = { day: run.day, offers: words.map((ench) => ({ ench, price: ENCHANTER_PRICE, sold: false })) };
}

// ---------------------------------------------------------------------------------------------------------------- targets

/** A piece a word can go on: a deck rig or factory (`item`), an installed turret (`turret`, its slot) or a piece in cargo. */
export type EnchantTarget = { kind: "item"; uid: number } | { kind: "turret"; slot: number } | { kind: "cargo"; uid: number };

/** What the run holds at a target. */
export interface TargetPiece extends EnchantFields {
  uid: number;
  def: string;
  stars: number;
}

/** The piece at `t`, or undefined. */
export function pieceAt(run: Run, t: EnchantTarget): TargetPiece | undefined {
  if (t.kind === "turret") {
    const x = turretList(run.build).find((q) => q.slot === t.slot);
    return x && { uid: x.uid, def: x.def, stars: starsOf(x), ...(x.ench !== undefined ? { ench: x.ench } : {}), ...(x.grow !== undefined ? { grow: x.grow } : {}) };
  }
  const o: (InvItem | (typeof run.build.items)[number]) | undefined =
    t.kind === "item" ? run.build.items.find((q) => q.uid === t.uid) : run.inventory.find((q) => q.uid === t.uid);
  return o && { uid: o.uid, def: o.def, stars: starsOf(o), ...(o.ench !== undefined ? { ench: o.ench } : {}), ...(o.enchDir !== undefined ? { enchDir: o.enchDir } : {}), ...(o.grow !== undefined ? { grow: o.grow } : {}) };
}

/** Why `word` cannot go on the piece at `t` (enchant.ts enchantProblem: NOT ON A RIG, NO FREE SIDE, NOT ON GEAR ...), or null when it can. */
export function applyProblem(run: Run, t: EnchantTarget, word: string, dir?: number): string | null {
  if (!enchantRules()) return "NO ENCHANTMENTS";
  if (!isEnchantId(word)) return "NOT AN ENCHANTMENT";
  const p = pieceAt(run, t);
  if (!p) return "NOT A PART";
  return enchantProblem(p.def, word, dir !== undefined ? { enchDir: dir } : undefined);
}

/** WIDE on a rig: the sides (0-3 at rotation 0) the added arrow can take; [] for any other piece or word. */
export function wideSides(run: Run, t: EnchantTarget): number[] {
  const p = pieceAt(run, t);
  return p && enchantKindOf(ITEMS[p.def]) === "rig" ? freeSides(p.def) : [];
}

/** One tappable piece while APPLY is open: where it is, what it is, the word it holds, and the reason a word can't go on it (null: it glows). */
export interface EnchantChoice {
  target: EnchantTarget;
  def: string;
  stars: number;
  held?: string;
  reason: string | null;
  sides: number[];
}

/**
 * Every piece APPLY can show for `word`, in a fixed order (deck rigs and factories by uid, installed turrets by slot, fitted core and
 * gear by uid, then cargo by uid): the ones that take it have `reason: null` (they glow), the others say why (`NOT ON GEAR`,
 * `NOT ON A CORE`, `NOT ON A RIG`, `NO FREE SIDE`). `sides` lists WIDE's free sides on a rig.
 */
export function enchantChoices(run: Run, word: string): EnchantChoice[] {
  const out: EnchantChoice[] = [];
  const add = (target: EnchantTarget, def: string, stars: number, held?: string): void => {
    const reason = enchantProblem(def, word);
    out.push({ target, def, stars, ...(held !== undefined ? { held } : {}), reason, sides: word === "wide" && reason === null ? wideSides(run, target) : [] });
  };
  for (const p of [...run.build.items].sort((x, y) => x.uid - y.uid)) add({ kind: "item", uid: p.uid }, p.def, starsOf(p), p.ench);
  for (const s of turretSlots(run.build)) if (s.turret) add({ kind: "turret", slot: s.slot }, s.turret.def, starsOf(s.turret), s.turret.ench);
  for (const m of [...run.build.mods].sort((x, y) => x.uid - y.uid)) out.push({ target: { kind: "cargo", uid: m.uid }, def: m.def, stars: starsOf(m), reason: enchantProblem(m.def, word), sides: [] });
  for (const i of [...run.inventory].sort((x, y) => x.uid - y.uid)) add({ kind: "cargo", uid: i.uid }, i.def, starsOf(i), i.ench);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- apply and buy

/** What an apply or a buy answered. `needReplace`: the piece holds this word (ask `REPLACES ...` first, then call again with replace).
 *  `needSide`: WIDE on a rig with several free sides: ask which. `reason`: a short player line when `ok` is false. */
export interface ApplyResult {
  ok: boolean;
  reason?: string;
  needReplace?: string;
  needSide?: number[];
  replaced?: string;
}

/** Options of apply and buy: `dir` (WIDE on a rig: the chosen side) and `replace` (the player confirmed REPLACES). */
export interface ApplyOpts {
  dir?: number;
  replace?: boolean;
}

/** The checks both a purchase and a pick make before anything changes: the piece, the word's legality, the replace and the side. */
function applyCheck(run: Run, t: EnchantTarget, word: string, opts: ApplyOpts): { res: ApplyResult; fields?: EnchantFields; held?: string } {
  const p = pieceAt(run, t);
  const why = applyProblem(run, t, word);
  if (why || !p) return { res: { ok: false, reason: why ?? "NOT A PART" } };
  let dir = opts.dir;
  if (word === "wide" && enchantKindOf(ITEMS[p.def]) === "rig") {
    const free = freeSides(p.def);
    if (dir === undefined && free.length === 1) dir = free[0];
    if (dir === undefined) return { res: { ok: false, needSide: free, reason: "CHOOSE A SIDE" } };
    const bad = applyProblem(run, t, word, dir);
    if (bad) return { res: { ok: false, reason: bad } };
  }
  const held = liveWord(p);
  if (held === word && (word !== "wide" || p.enchDir === dir)) return { res: { ok: false, reason: `ALREADY ${enchantDef(word)?.name ?? word.toUpperCase()}` } }; // the same word again would only reset its counter
  if (held && !opts.replace) return { res: { ok: false, needReplace: held, reason: replacesText(held) } };
  return { res: { ok: true }, fields: withEnchantment(word, word === "wide" ? dir : undefined), held };
}

/**
 * Put `word` on the piece at `t` (nothing is paid here: buyEnchant and takeWarlordWord pay). It replaces any word the piece holds
 * once the caller confirmed (`opts.replace`). Returns ok, or why not.
 */
export function applyWord(run: Run, t: EnchantTarget, word: string, opts: ApplyOpts = {}): ApplyResult {
  const c = applyCheck(run, t, word, opts);
  if (!c.res.ok || !c.fields) return c.res;
  const p = pieceAt(run, t)!;
  setPieceWord(run, p.uid, c.fields);
  return { ok: true, ...(c.held ? { replaced: c.held } : {}) };
}

/**
 * E5a, BUYING IS APPLYING: the ENCHANTER's offer `slot` goes on the piece at `t`, and only then does the gold go. Nothing changes (gold,
 * the offer, the piece) when it refuses: no gold, a sold offer, a refused piece (`NOT ON A RIG`, `NO FREE SIDE`, `NOT ON GEAR`), a
 * word already on the piece without `opts.replace` (`REPLACES FIERY`: the confirm), WIDE on a rig without a side when it has more than
 * one free (`needSide`). Refused in REFIT with NPC_DAY on, like every buy. There is no enchantment item in cargo.
 */
export function buyEnchant(run: Run, slot: number, t: EnchantTarget, opts: ApplyOpts = {}): ApplyResult {
  if (!enchantRules()) return { ok: false, reason: "NO ENCHANTMENTS" };
  if (shut(run)) return { ok: false, reason: ENCHANTER_SHUT };
  const o = run.shop.enchanter?.offers[slot];
  if (!o) return { ok: false, reason: "NO SUCH OFFER" };
  if (o.sold) return { ok: false, reason: "SOLD" };
  if (run.gold < o.price) return { ok: false, reason: `NEED ${o.price - run.gold} MORE GOLD` };
  const c = applyCheck(run, t, o.ench, opts);
  if (!c.res.ok || !c.fields) return c.res;
  const p = pieceAt(run, t)!;
  run.gold -= o.price;
  o.sold = true;
  setPieceWord(run, p.uid, c.fields);
  return { ok: true, ...(c.held ? { replaced: c.held } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------- the warlord pick (E5b)

/**
 * A warlord fight was WON (road.ts finishWarlord): with ENCHANT on, the run's first Hard-tier win on day 5 or later over a captain who
 * is not the Iron Matriarch opens pick 1, and the win over the Iron Matriarch opens pick 2: a pick of 1 of 2 words from
 * hashSeed(seed, "ench", day, "warlord") (run.enchPick). Two picks at most per run: a declined pick is spent. The gold and the drop
 * are not touched. Off, a loss or a draw, an Easy or Medium win: nothing.
 */
export function openWarlordPick(run: Run, w: { tier: string; id: string; day: number }, won: boolean): void {
  if (!enchantRules() || !won || w.tier !== "hard") return;
  const used = run.enchPicks ?? [];
  const no: 0 | 1 | 2 = w.id === "matriarch" ? (used.includes(2) ? 0 : 2) : w.day >= WARLORD_PICK_FROM[0] && !used.includes(1) ? 1 : 0;
  if (!no) return;
  run.enchPicks = [...used, no];
  run.enchPick = { day: w.day, no, words: warlordPickWords(run.seed, w.day) };
}

/** The open warlord pick (two words), or null. */
export const pendingEnchantPick = (run: Pick<Run, "enchPick">): { day: number; no: 1 | 2; words: [string, string] } | null => (enchantRules() ? run.enchPick ?? null : null);

/** Take word `i` (0 or 1) of the open pick and put it on the piece at `t`: free. Closes the pick on success; a refusal changes nothing. */
export function takeWarlordWord(run: Run, i: number, t: EnchantTarget, opts: ApplyOpts = {}): ApplyResult {
  const pk = pendingEnchantPick(run);
  if (!pk) return { ok: false, reason: "NO PICK OPEN" };
  const word = pk.words[i];
  if (!word) return { ok: false, reason: "NO SUCH WORD" };
  const r = applyWord(run, t, word, opts);
  if (r.ok) delete run.enchPick;
  return r;
}

/** NO THANKS: the open pick closes and the word is lost. False when no pick is open. */
export function skipWarlordWord(run: Run): boolean {
  if (!run.enchPick) return false;
  delete run.enchPick;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------- sell (E4)

/**
 * E4: selling a piece that holds a word asks first, `SELL? FIERY IS LOST` (a second press on the same button sells). The text, or null
 * when the piece holds no word (or the switch is off): then the sale needs no extra press.
 */
export function sellWarning(run: Run, t: EnchantTarget): string | null {
  const w = liveWord(pieceAt(run, t));
  return w ? sellAskText(w) : null;
}
