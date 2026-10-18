// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E4, E5, E12): the build screen's WORD INTERACTION: what a tap on the ENCHANTER's word card or
// on a warlord pick's card does, the APPLY mode (every legal part glows, a refused part says why, the replace confirm, WIDE's side), the
// merge pick, and the sell confirm. Logic and state only; what it looks like is enchantStrip.ts, the rules are src/game/enchanter.ts
// (buyEnchant, takeWarlordWord, enchantChoices), src/game/fuse.ts (pickMergedWord) and src/sim/enchant.ts.
//
// STATE lives beside the screen, not in it: one record per owner object (the BuildScreen, or a test's stand-in), so build.ts needs only
// the short marked hooks it already has. Nothing here runs with the switch off: every entry point asks enchantRules() first, and the
// data it reads (run.shop.enchanter, run.enchPick, run.enchMerge, a piece's `ench`) only exists with the switch on.
//
// WHAT A TAP DOES in APPLY (applyDown/applyUp): the press is read by the build screen's OWN hit-testing (edit.ts Editor.pickAt: the
// cell, the turret mount, the cargo slot), then, for a finger, by the nearest piece within half a finger's width (ui/tap.ts tapPx):
// never a tighter test than the other taps use. A part that takes the word applies it (buyEnchant: the gold goes only on success; a
// pick's takeWarlordWord: free); a part that refuses says why (ONLY ON A TURRET, NO FREE SIDE, NOT ON GEAR, NOT ON A CORE, ALREADY
// FIERY); a part that holds another word asks REPLACES FIERY first; WIDE on a rig with several free sides asks which; a tap
// outside any part leaves APPLY with the gold untouched.

import { ENCHANT_DEFS, enchantRules, isEnchantId, replacesText, type EnchantId } from "../../sim/enchant";
import { rotOf } from "../../sim/deck";
import { ITEMS } from "../../sim/content";
import {
  buyEnchant, enchantChoices, pendingEnchantPick, pieceAt, sellWarning, skipWarlordWord, takeWarlordWord,
  type ApplyOpts, type ApplyResult, type EnchantTarget,
} from "../../game/enchanter";
import { EXTRA_BELT_LEFT, pickMergedWord } from "../../game/fuse";
import type { Run } from "../../game/run";
import { enchantIcon } from "../../render/enchantArt";
import { icons } from "../../render/font";
import { C } from "../../render/palette";
import { sdir } from "../../render/frame";
import { wordFace } from "../../ui/enchantFaces";
import type { Ctx } from "./actions";
import type { Sel } from "./layout";
import type { Block, PanelText } from "./inspector";

// ---------------------------------------------------------------------------------------------------------------- the word cards

/** A selection of a word card: the ENCHANTER's offer `i` (`pick` false) or the warlord pick's word `i` (`pick` true). */
export type WordSel = Extract<Sel, { kind: "word" }>;

/** What a word card holds now: the word, what it costs (0: a pick is free), and whether it is sold. */
export interface WordInfo {
  id: EnchantId;
  price: number;
  sold: boolean;
}

/** The word behind a word card, or null (the switch is off, no wagon today, no pick open, a forged id). */
export function wordOf(run: Run, w: Pick<WordSel, "pick" | "i">): WordInfo | null {
  if (!enchantRules()) return null;
  if (w.pick) {
    const id = pendingEnchantPick(run)?.words[w.i];
    return isEnchantId(id) ? { id, price: 0, sold: false } : null;
  }
  const e = run.shop.enchanter;
  const o = e && e.day === run.day ? e.offers[w.i] : undefined;
  return o && isEnchantId(o.ench) ? { id: o.ench, price: o.price, sold: o.sold } : null;
}

/** Does the build screen show the ENCHANTER's wagon now: the switch on, its day's wagon in the shop, the dawn caravan (not REFIT). */
export function wagonUp(run: Run): boolean {
  return enchantRules() && run.stage === "caravan" && !!run.shop.enchanter && run.shop.enchanter.day === run.day && run.shop.enchanter.offers.length > 0;
}

/** The text of a word's line as the panels draw it: the lines are written `[BURN]+1`, the panels' icon markup is `{BURN}`. */
export const wordText = (s: string): string => icons(s.replace(/\[([A-Z]+)\]/g, "{$1}"));

// ---------------------------------------------------------------------------------------------------------------- state

type Step = "choose" | "side" | "replace";

/** An open APPLY: which word, from which card, what it costs, the step, and the line the panel says. */
export interface ApplyState {
  word: EnchantId;
  pick: boolean;
  i: number;
  price: number;
  step: Step;
  /** The part chosen so far (the side and replace steps). */
  target?: EnchantTarget;
  /** WIDE on a rig: the free sides (0-3 at rotation 0) the player may take, and the one taken. */
  sides?: number[];
  dir?: number;
  line: string;
  bad: boolean;
  /** Seconds since it opened (the glow's clock). */
  t: number;
}

/** The press a word card or APPLY took (enchantStrip.ts applyDown), kept until its release. */
export interface WordPress {
  x: number;
  y: number;
  kind: "mouse" | "touch" | "pen";
  card: WordSel | null;
}

interface Hold {
  apply: ApplyState | null;
  sell: { key: string; text: string; t: number } | null;
  slide: boolean;
  press: WordPress | null;
  hover: WordSel | null;
}

const HOLD = new WeakMap<object, Hold>();
function hold(owner: object): Hold {
  let h = HOLD.get(owner);
  if (!h) HOLD.set(owner, (h = { apply: null, sell: null, slide: true, press: null, hover: null }));
  return h;
}

/** The press a word card or APPLY took and has not seen released, or null; `setPress` keeps one (null drops it). */
export const pressOf = (owner: object): WordPress | null => hold(owner).press;
export function setPress(owner: object, p: WordPress | null): void {
  hold(owner).press = p;
}

/** The open APPLY of this screen, or null. A card that went (sold, the pick taken) closes it. */
export function applyState(owner: object & { run: Run }): ApplyState | null {
  const st = hold(owner).apply;
  if (st && !wordOf(owner.run, st)) hold(owner).apply = null;
  return hold(owner).apply;
}

/** The hovered word card (the desk's mouse). */
export const wordHover = (owner: object): WordSel | null => hold(owner).hover;
export function setWordHover(owner: object, w: WordSel | null): void {
  hold(owner).hover = w;
}

/** The caravan rolls its cards in at the dawn; a REROLL leaves the wagon where it is (rollEnchanter keeps it), so it stops sliding. */
export const wagonSlides = (owner: object): boolean => hold(owner).slide;
export function wagonSlide(owner: object, on: boolean): void {
  hold(owner).slide = on;
}

export const APPLY_HINT = "TAP A GLOWING PART";
export const SIDE_HINT = "WHICH SIDE GETS THE ARROW?";

// ---------------------------------------------------------------------------------------------------------------- tap on a word card

/** A tap on a word card: it selects (its tap panel opens); a second tap on the selected card opens APPLY. */
export function tapWord(ctx: Ctx & { sel?: Sel }, w: WordSel): void {
  const info = wordOf(ctx.run, w);
  if (!info || info.sold) return;
  const cur = ctx.sel;
  if (cur && cur.kind === "word" && cur.pick === w.pick && cur.i === w.i) {
    if (!applyState(ctx)) openApply(ctx, w);
    return;
  }
  ctx.select({ kind: "word", pick: w.pick, i: w.i });
}

/** Open APPLY for a word card (the panel's APPLY button, or the second tap). Short of gold it says so and stays closed. */
export function openApply(ctx: Ctx & { sel?: Sel }, w: Pick<WordSel, "pick" | "i">): boolean {
  const info = wordOf(ctx.run, w);
  if (!info || info.sold) return false;
  if (info.price > ctx.run.gold) {
    ctx.invalid(`NEED ${info.price - ctx.run.gold} MORE GOLD`);
    return false;
  }
  const cur = ctx.sel;
  if (!(cur && cur.kind === "word" && cur.pick === w.pick && cur.i === w.i)) ctx.select({ kind: "word", pick: w.pick, i: w.i });
  hold(ctx).apply = { word: info.id, pick: w.pick, i: w.i, price: info.price, step: "choose", line: APPLY_HINT, bad: false, t: 0 };
  return true;
}

/** Leave APPLY with everything as it was (the gold is only taken by a success). */
export function cancelApply(ctx: object): void {
  hold(ctx).apply = null;
}

/** CANCEL / Escape: one step back (from the side or replace step to choosing a part), else out of APPLY. False: nothing was open. */
export function backApply(ctx: object & { run: Run }): boolean {
  const st = applyState(ctx);
  if (!st) return false;
  if (st.step !== "choose") {
    delete st.target;
    delete st.sides;
    delete st.dir;
    st.step = "choose";
    st.line = APPLY_HINT;
    st.bad = false;
  } else cancelApply(ctx);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------- choose a part

export type ApplyOutcome = "applied" | "refused" | "ask" | "out";

const sameTarget = (a: EnchantTarget, b: EnchantTarget): boolean =>
  a.kind === b.kind && (a.kind === "turret" ? a.slot === (b as { slot: number }).slot : a.uid === (b as { uid: number }).uid);

/** The selection that shows the part at `t`. */
export function selOfTarget(t: EnchantTarget): Sel {
  return t.kind === "turret" ? { kind: "turret", index: t.slot } : t.kind === "item" ? { kind: "item", uid: t.uid } : { kind: "cargo", uid: t.uid };
}

/** The part's name for the toasts: `WHETSTONE`. */
function pieceName(run: Run, t: EnchantTarget): string {
  const p = pieceAt(run, t);
  return p && ITEMS[p.def] ? ITEMS[p.def].name : "PART";
}

function say(st: ApplyState, line: string, bad: boolean): void {
  st.line = line;
  st.bad = bad;
}

/**
 * A tap on the part at `t` in APPLY. A part outside the choices (not a part at all) leaves APPLY ("out"); a refused part says why
 * ("refused": the reason is the panel's line and a red toast); a legal part tries the word ("applied", or "ask": the replace
 * confirm or WIDE's side is open).
 */
export function chooseTarget(ctx: Ctx, t: EnchantTarget): ApplyOutcome {
  const st = applyState(ctx);
  if (!st) return "out";
  const row = enchantChoices(ctx.run, st.word).find((c) => sameTarget(c.target, t));
  if (!row) {
    cancelApply(ctx);
    return "out";
  }
  st.step = "choose";
  delete st.target;
  delete st.sides;
  delete st.dir;
  if (row.reason) return refuse(ctx, st, row.reason);
  return attempt(ctx, st, t, {});
}

function refuse(ctx: Ctx, st: ApplyState, reason: string): ApplyOutcome {
  say(st, reason, true);
  ctx.invalid(reason);
  return "refused";
}

/** buyEnchant / takeWarlordWord for the open APPLY, and what each answer opens. */
function attempt(ctx: Ctx, st: ApplyState, t: EnchantTarget, o: ApplyOpts): ApplyOutcome {
  const run = ctx.run;
  const r: ApplyResult = st.pick ? takeWarlordWord(run, st.i, t, o) : buyEnchant(run, st.i, t, o);
  if (r.ok) return won(ctx, st, t, r.replaced);
  if (r.needSide) {
    st.step = "side";
    st.target = t;
    st.sides = r.needSide;
    say(st, SIDE_HINT, false);
    return "ask";
  }
  if (r.needReplace) {
    st.step = "replace";
    st.target = t;
    say(st, r.reason ?? replacesText(r.needReplace), false);
    return "ask";
  }
  return refuse(ctx, st, r.reason ?? "CAN'T APPLY");
}

/** The word went on: the gold's popup and sound (actions.ts buy()), the part selected, APPLY closed. */
function won(ctx: Ctx, st: ApplyState, t: EnchantTarget, replaced?: string): ApplyOutcome {
  const name = pieceName(ctx.run, t), def = ENCHANT_DEFS[st.word];
  if (st.price > 0) {
    const cp = ctx.coinPos();
    ctx.ufx.popup(cp.x, cp.y + 10, `-${st.price}`, C.yellow);
    ctx.game.audio.play("coin");
  } else ctx.game.audio.play("repair");
  ctx.game.toast(`${def.name} ${name}${replaced ? ` · ${ENCHANT_DEFS[replaced as EnchantId]?.name ?? ""} LOST` : ""}`, def.color);
  hold(ctx).apply = null;
  ctx.touched();
  ctx.select(selOfTarget(t));
  return "applied";
}

/** WIDE's side (0-3 at rotation 0) chosen in the side step: tries the word with it. */
export function chooseSide(ctx: Ctx, side: number): ApplyOutcome {
  const st = applyState(ctx);
  if (!st || st.step !== "side" || !st.target || !st.sides?.includes(side)) return "out";
  st.dir = side;
  return attempt(ctx, st, st.target, { dir: side });
}

/** The replace confirm answered: the word goes on, the old one is lost. */
export function confirmReplace(ctx: Ctx): ApplyOutcome {
  const st = applyState(ctx);
  if (!st || st.step !== "replace" || !st.target) return "out";
  return attempt(ctx, st, st.target, { replace: true, ...(st.dir !== undefined ? { dir: st.dir } : {}) });
}

// ---------------------------------------------------------------------------------------------------------------- the warlord pick, the merge pick

/** NO THANKS: the open pick closes and its word is lost. */
export function skipPick(ctx: Ctx): void {
  const st = hold(ctx).apply;
  if (st?.pick) hold(ctx).apply = null;
  const sel = (ctx as { sel?: Sel }).sel;
  if (sel && sel.kind === "word" && sel.pick) ctx.select({ kind: "none" });
  if (skipWarlordWord(ctx.run)) {
    ctx.game.audio.play("click");
    ctx.touched();
  }
}

/** The open merge pick, or null: the survivor's piece, the word it keeps, the one it lost (both words, E4). */
export function mergePrompt(run: Run): { uid: number; kept: EnchantId; lost: EnchantId } | null {
  const m = enchantRules() ? run.enchMerge : undefined;
  return m && isEnchantId(m.kept.ench) && isEnchantId(m.lost.ench) ? { uid: m.uid, kept: m.kept.ench, lost: m.lost.ench } : null;
}

/** The merge pick answered: `takeLost` the second word (the lost one) replaces the kept; the first leaves the survivor as it is. */
export function answerMerge(ctx: Ctx, takeLost: boolean): void {
  if (!mergePrompt(ctx.run)) return;
  if (!pickMergedWord(ctx.run, takeLost) && ctx.run.enchMerge) { // run 5: WIDE's extra belt is in use, so the pick stays open (fuse.ts extraBeltInUse)
    ctx.game.toast(EXTRA_BELT_LEFT, C.red);
    return;
  }
  ctx.game.audio.play("click");
  ctx.touched();
}

// ---------------------------------------------------------------------------------------------------------------- the panel

/** One button of a panel (inspector.ts Action). */
export interface WordAction {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onTap: () => void;
}

const SIDE_WORD = ["UP", "RIGHT", "DOWN", "LEFT"] as const;
const SIDE_LOCAL = ["FRONT", "RIGHT", "BACK", "LEFT"] as const;

/** The on-screen word for a rig's WIDE side `side` (0-3 at rotation 0) on the piece at `t`: UP, RIGHT, DOWN or LEFT. The displayed
 *  side is (enchDir + the rig's rotation) mod 4 (enchDir is stored at rotation 0: deck.ts wideDir), then the deck's facing. */
export function sideWord(s: { run: Run; L: { frame: Parameters<typeof sdir>[0] } }, t: EnchantTarget, side: number): string {
  const p = t.kind === "item" ? s.run.build.items.find((q) => q.uid === t.uid) : undefined;
  // a rig still in cargo has no place on the deck: its own sides (the side at rotation 0 is the one its first arrow points to)
  if (!p) return SIDE_LOCAL[side % 4];
  return SIDE_WORD[sdir(s.L.frame, (side + rotOf(p)) % 4)];
}

/**
 * The tap panel of a word card (E5a, E7 "The word's own card"): the word in its colour, `ON A RIG: ...`, `ON A FACTORY: ...`, `ON A
 * TURRET: ...` (MASSIVE: `ONLY ON A TURRET`, SWIFT: `ONLY ON A FACTORY`, one row and no NOT ON rows), the NOTES behind the ⓘ, and the APPLY button (`NEED nG` and dim when the gold
 * is short). While APPLY is open the panel says what to do (or why a tapped part refused, or REPLACES FIERY, or WIDE's sides) and its
 * buttons are CANCEL (and the sides, or REPLACE).
 */
export function wordSpec(ctx: Ctx, show: WordSel): { icon: HTMLCanvasElement | null; text: PanelText; actions: WordAction[] } | null {
  const info = wordOf(ctx.run, show);
  if (!info) return null;
  const f = wordFace(info.id), st = applyState(ctx);
  const open = !!st && st.pick === show.pick && st.i === show.i;
  const rows: Block[] = f.lines.map((l): Block => (l.legal
    ? { role: "ability", text: `${l.label}: ${wordText(l.text)}`, brass: `${l.label}:`, keep: !open, rank: 2 }
    : { role: "ability", text: l.label, colour: C.slate4, keep: !open, rank: 2 }));
  const lead: Block[] = open && st ? [{ role: st.bad ? "warn" : "ability", text: st.line, keep: true, ...(st.bad ? { colour: C.red } : st.step === "replace" ? { colour: C.amber } : {}) }] : [];
  const body: Block[] = [...lead, ...rows];
  const text: PanelText = {
    title: f.name, color: f.color,
    sub: info.price > 0 ? `ENCHANTMENT · ${info.price}G` : "ENCHANTMENT · FREE", subShort: "ENCHANTMENT",
    body, variants: [{ body, tight: true }],
    labels: [],
    notes: f.notes.map((t): Block => ({ role: "note", text: t })),
  };
  const actions: WordAction[] = [];
  if (!open || !st) {
    const short = info.price > ctx.run.gold;
    actions.push({ id: "apply", label: short ? `NEED ${info.price - ctx.run.gold}G` : "APPLY", primary: !short, disabled: short || info.sold, onTap: () => { openApply(ctx, show); } });
  } else {
    if (st.step === "side" && st.sides && st.target) {
      for (const sd of st.sides) actions.push({ id: `applyside${sd}`, label: sideWord(ctx as unknown as { run: Run; L: { frame: Parameters<typeof sdir>[0] } }, st.target, sd), primary: true, onTap: () => { chooseSide(ctx, sd); } });
    }
    if (st.step === "replace") actions.push({ id: "applyreplace", label: "REPLACE", primary: true, onTap: () => { confirmReplace(ctx); } });
    actions.push({ id: "applycancel", label: "CANCEL", onTap: () => { backApply(ctx); } });
  }
  return { icon: enchantIcon(info.id), text, actions };
}

// ---------------------------------------------------------------------------------------------------------------- the sell confirm (E4)

/** How long an armed SELL waits for its second press. */
export const SELL_ARM_S = 3;

/** Which piece a selection's SELL is about: `u12` for a placed or cargo piece (the uid follows it from the deck to cargo), `t2` for an
 *  installed turret's slot. null for a selection with no SELL (a belt, a word card ...). */
function sellKey(run: Run, t: EnchantTarget): string | null {
  const p = pieceAt(run, t);
  return p ? (t.kind === "turret" ? `t${t.slot}` : `u${p.uid}`) : null;
}

function targetOfSel(show: Sel): EnchantTarget | null {
  return show.kind === "cargo" ? { kind: "cargo", uid: show.uid } : show.kind === "item" ? { kind: "item", uid: show.uid }
    : show.kind === "turret" ? { kind: "turret", slot: show.index } : null;
}

/**
 * E4: selling a piece that holds a word asks first. The first press arms the piece (its SELL button then reads `SELL? FIERY IS
 * LOST`, sellLabelFor) and sells nothing: true. A second press on the same piece within SELL_ARM_S: false, the sale goes on. A
 * piece with no word (or the switch off): false at once. The price is unchanged; every sell path asks (actions.ts sell and
 * sellPlaced, turretActions.ts sellTurretAt).
 */
export function sellAsk(ctx: Ctx, t: EnchantTarget): boolean {
  if (!enchantRules()) return false;
  const text = sellWarning(ctx.run, t);
  if (!text) return false;
  const key = sellKey(ctx.run, t), h = hold(ctx);
  if (key === null) return false;
  if (h.sell && h.sell.key === key) {
    h.sell = null;
    return false;
  }
  h.sell = { key, text, t: SELL_ARM_S };
  ctx.game.toast(text, C.amber);
  return true;
}

/** The SELL button's label while the selected piece is armed (`SELL? FIERY IS LOST`), else null (inspector.ts spec reads it). */
export function sellLabelFor(ctx: Ctx, show: Sel): string | null {
  if (!enchantRules()) return null;
  const h = HOLD.get(ctx);
  const t = h?.sell ? targetOfSel(show) : null;
  return h?.sell && t && sellKey(ctx.run, t) === h.sell.key ? h.sell.text : null;
}

// ---------------------------------------------------------------------------------------------------------------- the screen's hooks

const sameSel = (a: Sel, b: Sel): boolean => JSON.stringify(a) === JSON.stringify(b);

/** BuildScreen.select: a different selection closes APPLY (unless it is the word card APPLY is for) and disarms SELL. */
export function onSelect(ctx: object, prev: Sel, next: Sel): void {
  const h = HOLD.get(ctx);
  if (!h) return;
  if (h.apply && !(next.kind === "word" && next.pick === h.apply.pick && next.i === h.apply.i)) h.apply = null;
  if (h.sell && !sameSel(prev, next)) h.sell = null;
}

/** Once a frame: the armed SELL runs down, APPLY's glow clock runs. */
export function applyTick(ctx: object, dt: number): void {
  const h = HOLD.get(ctx);
  if (!h) return;
  if (h.sell && (h.sell.t -= dt) <= 0) h.sell = null;
  if (h.apply) h.apply.t += dt;
}
