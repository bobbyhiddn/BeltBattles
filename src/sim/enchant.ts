// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E1, E2, E3): EIGHT ENCHANTMENTS on rigs, factories and turrets, behind one switch.
//
// The operator, 2026-10-10: "we should be able to enchant rigs factories and turrets." An enchantment is ONE extra effect bound to
// ONE piece (a rig, a factory or a turret): a word printed before the piece's name (FIERY WHETSTONE), one stat or one short line
// in plain words. It stays when the piece is moved or stored, one copy's word survives a merge, and it is lost on a sale or when a
// new word replaces it. The design is ref/pieces1/PIECES-1-REPORT.md section 4; the build brief wins where they differ.
//
// THE SWITCH: ENCHANT (false), in shapes2.ts's form: enchantRules(), setEnchant(on) and withEnchant(fn, on = true), which puts
// the switch back even on a throw. While it is off nothing sees an enchantment: no wagon, offer, warlord pick, LAST CHANCE
// change, stand-in word, validator acceptance, text sheet, save field or render path (a build that carries `ench` fights as if it
// did not: enchantFx.ts makes no state for it). The release's one bump turns it on and writes ENCHANT_RULES (rulesGate.ts).
//
// THE DATA (E2): Placed.ench (an ENCHANT_IDS id), Placed.enchDir (WIDE on a rig: the added arrow's side at rotation 0),
// BuildTurret.ench, InvItem.ench / enchDir / grow, and GROWING's counter `grow` (the field snapshot v3 reserves for GROW-1:
// ENCHANT-1 switches it on for GROWING only, under ENCHANT's rules world). Every field is optional and written only when
// present, after the other keys, so a build without them is byte for byte what it was.
//
// Shared, pure and dependency-light (no DOM): the client, the server, the tests and the harness read the same defs. It imports
// only ./content, ./foot, ./stars and ./overclock (the last two for ENCHANT-1c's C2 rule; neither reaches this file or deck.ts, which
// imports this file and re-exports its stand-in helpers for the portable loader).

import { ITEMS, SHAPE_ARROWS, rigShape, type GateEffect, type ItemDef } from "./content";
import { footOf } from "./foot";
import { doubles } from "./overclock"; // ENCHANT-1c (C2): does the sim's doubling change a rig's numbers (ECHOING's NOTHING TO DOUBLE)
import { effectAt } from "./stars"; // ENCHANT-1c (C2): the rig's effect at each star

/** THE switch (REQ-BFG-085): on since BUMP-1F (rules bb-0.13.0, src/net/rulesGate.ts ENCHANT_RULES); it was off until the release's bump. */
export const ENCHANT: boolean = true; // BUMP-1F: was false

let enchantOn = false;

/** Are the eight enchantments in the game now (ENCHANT, or a withEnchant call)? */
export function enchantRules(): boolean {
  return enchantOn;
}

/** Turn the enchantments on or off. Setting the state it already has does nothing. */
export function setEnchant(on: boolean): void {
  enchantOn = on;
}

/** Run `fn` with the enchantments on (or off), then put the switch back as it was, even if `fn` throws (withShapes2's form). */
export function withEnchant<T>(fn: () => T, on = true): T {
  const was = enchantOn;
  setEnchant(on);
  try {
    return fn();
  } finally {
    setEnchant(was);
  }
}

setEnchant(ENCHANT);

/** The eight launch words, in the order the brief lists them (KEEN waits for CRIT, REQ-BFG-048; SPARKING for STUN RECOVERY, REQ-BFG-067). */
export const ENCHANT_IDS = ["fiery", "rising", "growing", "echoing", "massive", "swift", "wide", "braced"] as const;
export type EnchantId = (typeof ENCHANT_IDS)[number];

/** The three kinds of piece that can carry a word (the allow-list's values). */
export type EnchantKind = "rig" | "factory" | "turret";

/**
 * E1: the LEGAL KINDS are an allow-list over ItemDef.kind: a rig ("gate"), a "factory" and a "turret" (content.ts ItemKind).
 * Every other kind ("mod" gear, "core", "supply", and any kind added later, such as GATES-1's "converter") is refused by
 * default, so a kind that arrives later takes no word until this table names it.
 */
export const ENCHANT_KINDS: Readonly<Record<string, EnchantKind>> = { gate: "rig", factory: "factory", turret: "turret" };

/** The numbers the eight words are built from (the brief's starting values; the bench (tools/enchant1) sets the shipped ones).
 *  RUN 3's E9a read (day 5, ★1, par-field k 96, 12 opponents a deck, win points gained over the plain deck, mean of 4 heroes) at the brief's
 *  starting values: FIERY 12.9, RISING 20.3, GROWING 5.5, ECHOING 14.8, MASSIVE -2.4, SWIFT 1.9, WIDE 2.0, BRACED 1.0 (target +3 to +8).
 *  CUTS made from it (each logged in REPORT with its bench line): risingStep 5 -> 2 -> 1 (cap's ruling), echoEvery 3 -> 5; RAISES (under 3): bracedStuns 2 -> 3, massiveShare 2 -> 3.
 *  ★1 x1, ★2 x2, ★3 x3 multiplies burn, risingStep, growingStep and bracedStuns; a count (echoEvery) and the words (HALF, TWICE,
 *  +1 ARROW, +1 SLOT) do not scale. */
export const ENCHANT_NUM: { burn: number; risingStep: number; growingStep: number; echoEvery: number; bracedStuns: number; massiveShare: number } = {
  burn: 1, // FIERY: [BURN]+1 on the hit, the slug or the shot
  risingStep: 1, // RISING: the nth slug or shot gets +1 DMG x n (the brief's start: 5; cut in run 3: E9a read 20.3 at 5 and 10.9 at 2; cap's ruling 92ad6c30dc50caed: step 1)
  growingStep: 5, // GROWING: +5 DMG x the piece's `grow` (the dusk fights it has been through)
  echoEvery: 5, // ECHOING: every 5th slug it hits, 5th time it works, 5th shot (the brief's start: 3; cut in run 3: E9a read 14.8 points at 3)
  bracedStuns: 3, // BRACED: the first 3 STUNs on it each fight do nothing (the brief's start: 2; raised in run 3: E9a read 1.0 point at 2)
  massiveShare: 3, // MASSIVE: its slugs / shots deal 3x DMG at half the rate (the brief's start: 2x, equal DPS on paper; raised in run 3: E9a read -2.4 (day 5) and -9.1 (day 10) at 2x; cap's ruling 92ad6c30dc50caed lets the equal-on-paper rule give way)
};

export interface EnchantDef {
  id: EnchantId;
  name: string; // the word as printed
  code: string; // the stand-in word's two letters (`~fi`)
  color: string; // the word's colour in the panel, the spark and the log (E7; PIECES-1 4.2, run 3 checks each against the keyword colours)
  scales: boolean; // its numbers multiply with the piece's stars (a count or a word does not)
  kinds: readonly EnchantKind[]; // the kinds it can go on
}

/** The eight words. Colours are PIECES-1 4.2's starting values (BURN orange, amber, moss green, violet, iron grey, yellow, teal,
 *  PLATE steel #C6D0EA); E7 (run 3) moves any that sits too near a keyword's colour, and logs it. Run 5 (E10's fix round): BRACED's
 *  PLATE steel read as the part's own cream name (4 of 6 cold readers could not see it as a colour), so it is an ice blue, #6CC0F0
 *  (delta E 23 from the nearest keyword colour, PAIR's; rgb 54 from SHIELD's; 45 from the cream name; contrast 8.6 on the darkest panel).
 *  ENCHANT-1b (N1; cap's ruling on QUESTION 4): MASSIVE goes on a TURRET only and SWIFT on a FACTORY only. Each was a trap on the other
 *  kind (MASSIVE on a late factory -8.0 at day 10: a rig downstream adds its flat to every slug, and half as many slugs carry half the
 *  flats; SWIFT on a turret -3.6 at day 5) and strong on its own (MASSIVE on a turret +8.9 at day 5, SWIFT on a factory +5.4). */
export const ENCHANT_DEFS: Readonly<Record<EnchantId, EnchantDef>> = {
  fiery: { id: "fiery", name: "FIERY", code: "fi", color: "#FF9B2A", scales: true, kinds: ["rig", "factory", "turret"] },
  rising: { id: "rising", name: "RISING", code: "ri", color: "#C8962A", scales: true, kinds: ["rig", "factory", "turret"] },
  growing: { id: "growing", name: "GROWING", code: "gr", color: "#7DBE3C", scales: true, kinds: ["rig", "factory", "turret"] },
  echoing: { id: "echoing", name: "ECHOING", code: "ec", color: "#9078FF", scales: false, kinds: ["rig", "factory", "turret"] },
  massive: { id: "massive", name: "MASSIVE", code: "ma", color: "#8A8F98", scales: false, kinds: ["turret"] }, // ENCHANT-1b (N1): turrets only
  swift: { id: "swift", name: "SWIFT", code: "sw", color: "#FFF59D", scales: false, kinds: ["factory"] }, // ENCHANT-1b (N1): factories only
  wide: { id: "wide", name: "WIDE", code: "wi", color: "#1FA6B8", scales: false, kinds: ["rig", "factory", "turret"] },
  braced: { id: "braced", name: "BRACED", code: "br", color: "#6CC0F0", scales: true, kinds: ["rig", "factory", "turret"] },
};

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Is `id` one of the eight words (whatever the switch says)? */
export function isEnchantId(id: unknown): id is EnchantId {
  return typeof id === "string" && has(ENCHANT_DEFS, id);
}

/** A word's def, or undefined for anything that is not one of the eight. */
export function enchantDef(id: unknown): EnchantDef | undefined {
  return isEnchantId(id) ? ENCHANT_DEFS[id] : undefined;
}

/** The kind of piece a def is, if it can carry a word at all (the allow-list). */
export function enchantKindOf(d: ItemDef | undefined): EnchantKind | undefined {
  return d && has(ENCHANT_KINDS, d.kind) ? ENCHANT_KINDS[d.kind] : undefined;
}

/** The stand-in word's code for an id (`~fi`), or undefined for anything that is not one of the eight. */
export function enchantCodeOf(id: unknown): string | undefined {
  return enchantDef(id)?.code;
}

/** The id a stand-in code names (`fi` -> "fiery"), or undefined. */
export function enchantIdOfCode(code: string): EnchantId | undefined {
  return ENCHANT_IDS.find((id) => ENCHANT_DEFS[id].code === code);
}

/** A piece's stars as the numbers read them: 1..3 (a signature factory passes its grade, stars.ts gradeOf, clamped to 3). */
export function enchantStars(stars: number | undefined): number {
  return typeof stars === "number" && Number.isFinite(stars) && stars >= 1 ? Math.min(3, Math.floor(stars)) : 1;
}

/**
 * The rig arrow sides (0-3, at rotation 0) that carry no arrow yet, for WIDE: none for a shaped rig (rule set B: its arrows
 * already shine from every outside edge), an X rig (4 arrows) or anything that is not a rig. The added arrow turns with the rig.
 */
export function freeSides(d: ItemDef | string | undefined): number[] {
  const def = typeof d === "string" ? (has(ITEMS, d) ? ITEMS[d] : undefined) : d;
  const shape = rigShape(def);
  if (!def || !shape || shape === "X" || footOf(def) !== "1") return [];
  return [0, 1, 2, 3].filter((s) => !SHAPE_ARROWS[shape].includes(s));
}

/** The short player reason a def refuses every word, by what it is (E1; `NOT ON GEAR` is the brief's). */
function kindReason(d: ItemDef): string {
  if (d.kind === "mod") return "NOT ON GEAR";
  if (d.kind === "core") return "NOT ON A CORE";
  if (d.kind === "supply") return "NOT ON A SUPPLY";
  return "NOT ON THIS PART";
}

const KIND_NAME: Readonly<Record<EnchantKind, string>> = { rig: "RIG", factory: "FACTORY", turret: "TURRET" };

/**
 * ENCHANT-1b (N3; cap's ruling on QUESTION 1): the words that act on the slugs a rig's arrows HIT: FIERY's BURN, RISING's and GROWING's
 * DMG are added on the rig's hit (enchantFx.ts rigHitFx, called from Battle.applyHit) and ECHOING doubles the rig's stats on every
 * fifth slug it hits. They do nothing on a rig whose arrows never hit a slug. WIDE and BRACED do not depend on a hit.
 */
export const SLUG_WORDS: readonly EnchantId[] = ["fiery", "rising", "growing", "echoing"];

/**
 * N3: do this rig def's arrows ever hit a slug? An arrow hits when it points at a belt tile (deck.ts rigHits). The one kind of def that
 * never does is a rig whose effect works FACTORIES and does nothing to belts (`gate.stoke`: the STOKER; rigHits skips it: "its arrows do
 * nothing to belts; they work factories"). The rule reads what the def does, not a list of names, so a rig added later with such an
 * effect is covered; tests/enchant1.b.test.ts checks it against rigHits on a real deck for EVERY rig def and names each one that
 * hits nothing. Anything that is not a rig answers true (the question is only asked of rigs).
 */
export function rigHitsSlugs(d: ItemDef | undefined): boolean {
  return !(d && d.kind === "gate" && d.gate?.stoke);
}

const echoMemo = new WeakMap<GateEffect, boolean>();

/**
 * ENCHANT-1c (C2; cap's ruling on ENCHANT-1b's QUESTION 1): does ECHOING have anything to double on this rig def? ECHOING makes every fifth slug a
 * rig hits take the rig's effect twice: Battle.applyHit reads the rig's effect `e` (the keys flat, burn, perPriorGate, split, plate, stun, ...) and on
 * an echoed hit reads `overclocked(e)` instead (overclock.ts, the OVERCLOCKER's doubling; enchantFx.ts rigEchoes only decides WHICH hits). So the echo
 * changes something exactly when doubling changes the effect's numbers (overclock.ts `doubles`): a rig whose effect is a belt's speed (GREASE WORKS,
 * BRAKE SHOE, OVERDRIVE), a toll, a sift, a heal, a pulse, a keg, a brace, a hull bonus, an overclock cooldown, a SHOCK flag alone (GALVANIC COIL: twice
 * is once) or a latch with no damage (TWIN LATCH) has nothing in the hit to double. At ANY star: the word stays through merges, so a def refuses only
 * when ★1, ★2 and ★3 all have nothing. The rule reads what the def does, not a list of names (tests/enchant1.c.test.ts proves it against a real hit, with
 * and without the echo, for EVERY rig def, and names each def it refuses). Anything that is not a rig answers true (the question is only asked of rigs).
 */
export function rigEchoDoubles(d: ItemDef | undefined): boolean {
  if (!d || d.kind !== "gate") return true;
  const known = has(ITEMS, d.id);
  for (const s of [1, 2, 3]) {
    const e = (known ? effectAt(d.id, s) : d).gate;
    if (!e) continue;
    let yes = echoMemo.get(e);
    if (yes === undefined) echoMemo.set(e, (yes = doubles(e)));
    if (yes) return true;
  }
  return false;
}

/**
 * E1: why `word` cannot go on a piece of `def`, as a short player reason, or null when it can. `piece` is the piece being
 * enchanted (WIDE on a rig reads `enchDir`, the side its arrow takes at rotation 0: it must be a free one). Reasons:
 * NOT ON GEAR / NOT ON A CORE / NOT ON A SUPPLY / NOT ON THIS PART (a kind off the allow-list), ONLY ON A TURRET (MASSIVE on a rig or a
 * factory) / ONLY ON A FACTORY (SWIFT on a rig or a turret) (ENCHANT-1b N1: a word with one kind says which), IT HITS NO SLUGS (N3: FIERY,
 * RISING, GROWING or ECHOING on a rig whose arrows hit no slug), NOTHING TO DOUBLE (ENCHANT-1c C2: ECHOING on a rig whose hit gives a slug no
 * number to double, rigEchoDoubles), NO FREE SIDE (WIDE on a shaped rig, an X rig, a rig with 4 arrows, or onto a side that carries an arrow already).
 * It says nothing of the switch (the callers ask enchantRules()) or of a word already on the piece (REPLACES, E4).
 */
export function enchantProblem(def: ItemDef | string | undefined, word: string, piece?: { enchDir?: number }): string | null {
  const d = typeof def === "string" ? (has(ITEMS, def) ? ITEMS[def] : undefined) : def;
  if (!d) return "UNKNOWN PART";
  if (!isEnchantId(word)) return "NOT AN ENCHANTMENT";
  const kind = enchantKindOf(d);
  if (!kind) return kindReason(d);
  const kinds = ENCHANT_DEFS[word].kinds;
  if (!kinds.includes(kind)) return kinds.length === 1 ? `ONLY ON A ${KIND_NAME[kinds[0]]}` : kind === "rig" ? "NOT ON A RIG" : "NOT ON THIS PART"; // ENCHANT-1b (N1)
  if (kind === "rig" && SLUG_WORDS.includes(word) && !rigHitsSlugs(d)) return "IT HITS NO SLUGS"; // ENCHANT-1b (N3)
  if (kind === "rig" && word === "echoing" && !rigEchoDoubles(d)) return "NOTHING TO DOUBLE"; // ENCHANT-1c (C2): the STOKER keeps IT HITS NO SLUGS (above); FIERY, RISING and GROWING add their own at the hit
  if (word === "wide" && kind === "rig") {
    const free = freeSides(d);
    if (!free.length) return "NO FREE SIDE";
    if (piece?.enchDir !== undefined && !free.includes(piece.enchDir)) return "NO FREE SIDE";
  }
  return null;
}

/** The enchantment fields a piece carries (Placed, BuildTurret, InvItem, TurretCopy). */
export interface EnchantFields {
  ench?: string;
  enchDir?: number;
  grow?: number;
}

/**
 * E2: the fields a copy of a piece carries (a cargo item made from a deck piece and back, a turret copy, a merge survivor):
 * `ench`, then `enchDir` (WIDE on a rig), then `grow` (GROWING's counter, only while the piece holds GROWING and only above
 * 0), each only when present, so a piece without a word copies as `{}`. Spread it LAST: `{ uid, def, ...starField(s), ...enchantField(p) }`.
 */
export function enchantField(p: EnchantFields | undefined): EnchantFields {
  if (!p || p.ench === undefined) return {};
  return {
    ench: p.ench,
    ...(p.enchDir !== undefined ? { enchDir: p.enchDir } : {}),
    ...(p.ench === "growing" && typeof p.grow === "number" && p.grow > 0 ? { grow: p.grow } : {}),
  };
}

/** The same fields with one word put on (a rig's WIDE passes its side): the piece's old word and counter are gone. */
export function withEnchantment(word: string, enchDir?: number): EnchantFields {
  return { ench: word, ...(word === "wide" && enchDir !== undefined ? { enchDir } : {}) };
}

/** E3: the extra belt slot WIDE gives a factory (`+1 [BELT] SLOT`): 1 for a placed piece holding WIDE while the switch is on,
 *  else 0. Every reader of a placed factory's belt slots adds it to stars.ts outputsAt (validate.ts, routeCheck.ts, edit.ts,
 *  inspector.ts); only factories are asked. */
export function wideSlots(p: { ench?: string } | undefined): number {
  return enchantOn && p?.ench === "wide" ? 1 : 0;
}

/** E4/E6: does a piece hold GROWING (so it may carry `grow`)? */
export const holdsGrowing = (p: { ench?: string } | undefined): boolean => p?.ench === "growing";

// ---------------------------------------------------------------------------------------------------------------- E4: merge, sell, replace

/** E4: the word a merge keeps when the two copies hold DIFFERENT words: `info.a` is the survivor's, `info.b` the absorbed copy's; it
 *  returns the fields to keep (one of the two). The bots pass one that values the words (harness/enchantBot.ts); without one the
 *  survivor keeps its own, and the player is asked after the merge (fuse.ts pickMergedWord). */
export type WordChooser = (info: { def: string; stars: number; a: EnchantFields; b: EnchantFields }) => EnchantFields;

/** E4: is this the very same word (and, for WIDE on a rig, the same side)? Two pieces without a word are the same. */
export const sameEnchant = (a: EnchantFields | undefined, b: EnchantFields | undefined): boolean =>
  a?.ench === b?.ench && (a?.ench !== "wide" || a?.enchDir === b?.enchDir);

/**
 * E4 (PIECES-1 4.5; the operator's Q3: one per piece, pick one on a merge): the word ONE merged piece keeps. `a` is the survivor's
 * copy, `b` the absorbed one's (each may hold none). Only one has a word: it is kept (it moves onto the survivor). The same word on
 * both: kept once; GROWING keeps the HIGHER counter, WIDE the survivor's side. Different words: `choose` picks the one kept (the
 * bots, by value); without it the survivor's is kept, and `lost` names the other for the player's pick. Numbers use the new stars
 * (nothing is stored but the word). Returns enchantField's fields (`{}` for none).
 */
export function mergeWord(a: EnchantFields | undefined, b: EnchantFields | undefined, choose?: (a: EnchantFields, b: EnchantFields) => EnchantFields): { kept: EnchantFields; lost?: EnchantFields } {
  const fa = enchantField(a), fb = enchantField(b);
  if (fa.ench === undefined) return { kept: fb };
  if (fb.ench === undefined) return { kept: fa };
  if (fa.ench === fb.ench) {
    const grow = Math.max(fa.grow ?? 0, fb.grow ?? 0);
    return { kept: { ...fa, ...(fa.ench === "growing" && grow > 0 ? { grow } : {}) } };
  }
  const pick = enchantField(choose ? choose(fa, fb) : fa);
  const kept = pick.ench === fb.ench ? fb : fa;
  return { kept, lost: kept === fa ? fb : fa };
}

/** E4: what a second word on a piece asks first: `REPLACES FIERY` (nothing stacks; the old word is lost). */
export const replacesText = (id: string): string => `REPLACES ${enchantDef(id)?.name ?? String(id).toUpperCase()}`;

/** E4: what selling an enchanted piece asks first: `SELL? FIERY IS LOST` (a second press on the same button sells). */
export const sellAskText = (id: string): string => `SELL? ${enchantDef(id)?.name ?? String(id).toUpperCase()} IS LOST`;

/** E4: the word a piece holds while the switch is on (a stray `ench` is ignored when it is off, or when it is not one of the eight). */
export const liveWord = (p: { ench?: string } | undefined): EnchantId | undefined => (enchantOn && isEnchantId(p?.ench) ? (p!.ench as EnchantId) : undefined);

/**
 * E3: after a dusk fight (a win, a loss or a draw) every piece holding GROWING grows by 1 (`grow` is its count of dusk fights
 * and is written only above 0). Warlord fights don't count: the line says DUSK FIGHT, and the server's bound (E6.5) needs a
 * count it can prove. Returns how many pieces grew. Does nothing while the switch is off.
 */
export function growPieces(b: { items: EnchantFields[]; turrets?: EnchantFields[] }): number {
  if (!enchantOn) return 0;
  let n = 0;
  for (const p of [...b.items, ...(b.turrets ?? [])]) {
    if (p.ench !== "growing") continue;
    p.grow = (p.grow ?? 0) + 1;
    n++;
  }
  return n;
}

/** Rate rule (E3; REPORT section 4): MASSIVE halves a whole rate (shots or slugs per 30 s) rounding DOWN, at least 1, so a trade
 *  never gains a point from a rounding; SWIFT doubles it. Anything else keeps it. */
export function enchantRate(id: string | undefined, rate: number): number {
  if (id === "massive") return Math.max(1, Math.floor(rate / 2));
  if (id === "swift") return rate * 2;
  return rate;
}

/** The DMG share a word gives a slug or a shot: MASSIVE ENCHANT_NUM.massiveShare x (3 shipped; the brief's 2x kept the damage per
 *  second equal on paper with the interval doubling), SWIFT x1/2, every other word x1. */
export function enchantShare(id: string | undefined): number {
  return id === "massive" ? ENCHANT_NUM.massiveShare : id === "swift" ? 0.5 : 1;
}

/**
 * The one line a word says on a kind of piece (the tap panel's `ON A RIG: ...`, E7), built from ENCHANT_NUM so a bench change
 * moves the text with the number. null where the word cannot go (ENCHANT-1b N1: MASSIVE on a rig or a factory, SWIFT on a rig or a
 * turret). Whole numbers, core words; none starts with YOUR, START or AT DAWN (the rune openers, PIECES-1 4.6).
 */
export function enchantLine(id: EnchantId, kind: EnchantKind): string | null {
  if (!ENCHANT_DEFS[id].kinds.includes(kind)) return null;
  const n = ENCHANT_NUM;
  const what = kind === "rig" ? "SLUG IT HITS" : kind === "factory" ? "SLUG IT MAKES" : "SHOT";
  const its = kind === "rig" ? "ITS HIT" : kind === "factory" ? "ITS SLUGS" : "ITS SHOTS";
  switch (id) {
    // ENCHANT-2 (REQ-BFG-085; T4c, ENCHANT-1c's QUESTION 3): the word's card and LAST CHANCE's detail say what the part's panel says, `ADDS +1 [BURN] TO EACH HIT.`
    // (was `ITS HIT: [BURN]+1.`); the panel's own line adds `, ON TOP OF ITS OWN STATS` (enchantFaces.ts pieceLine): a card shows no part's stats
    case "fiery": return `ADDS +${n.burn} [BURN] ${kind === "rig" ? "TO EACH HIT" : kind === "factory" ? "TO ITS SLUGS" : "TO EACH SHOT"}.`;
    case "rising": return `EACH ${what}: +${n.risingStep} DMG MORE THAN THE LAST.`;
    case "growing": return `AFTER EACH DUSK FIGHT: ${its} +${n.growingStep} DMG, FOR THE RUN.`;
    case "echoing":
      return kind === "rig" ? `EVERY ${ord(n.echoEvery)} SLUG IT HITS GETS ITS STATS TWICE.`
        : kind === "factory" ? `EVERY ${ord(n.echoEvery)} TIME IT WORKS: 1 MORE SLUG.` : `EVERY ${ord(n.echoEvery)} SHOT HITS TWICE.`;
    case "massive": return `FIRES HALF AS OFTEN. ${n.massiveShare}x DMG A SHOT.`; // ENCHANT-1b (N1): a turret's line only (the kind guard above)
    case "swift": return "WORKS TWICE AS OFTEN. ITS SLUGS DEAL HALF DMG."; // ENCHANT-1b (N1): a factory's line only
    case "wide": return kind === "rig" ? "+1 ARROW" : kind === "factory" ? "+1 [BELT] SLOT" : "+1 [GEAR] SLOT";
    case "braced": return `THE FIRST ${n.bracedStuns} [STUN]STUNS ON IT EACH FIGHT DO NOTHING.`;
  }
}

/** 3 -> "THIRD" (the count word in ECHOING's line). TEXT-STYLE 8.4 (tests/textRules.ts) bans an ordinal in digits (`3RD`) in face text, so the
 *  word is spelled out; the brief's own `EVERY 3RD ...` is reworded for it (run 3, logged in REPORT). */
function ord(n: number): string {
  const w = ["", "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH"];
  return w[n] ?? `${n}TH`;
}
