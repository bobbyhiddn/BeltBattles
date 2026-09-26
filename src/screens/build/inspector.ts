// Details panel: explains the hovered or selected thing (card, cargo, deck item, belt route,
// turret) with its action button; idle it shows the cruiser card. Landscape uses the left
// column (sized to its content), portrait the strip between the shop and the deck.
//
// 0.6.2t (REQ-BFG-032): the body is blocks of whole sentences from the glossary (src/ui/abilityText.ts), wrapped by the
// one helper (src/ui/richText.ts) at draw time (T4):
// - the ability text: bone, numbers white, BURN / SHOCK / FREEZE / POISON / FASTER / SLOWER in their battle colours, and
//   a perk's name right after the sentence it names, in the perk colour, never split;
// - the next-star line ("NEXT STAR: FEEDS 3 BELTS.") and merge progress ("1 MORE COPY TO MERGE."), each its own line;
// - stat rows with aligned values (a belt's timeline and gun-end readout, a turret's rows);
// - then, set apart by a rule, the flavour (dimmer, the small face) and the action hint (dimmer again).
// planPanel is the pure layout that drawDetails and the tests share: blocks marked `keep` always show whole (the phone
// guarantee, T6: the opening sentence, the hits or IDLE, the perk and the next-star line, and merge progress); every
// other block shows whole or not at all (the flavour too, 0b.5), in rank order while there is room. Where the kept blocks
// don't fit, the panel's compact variants are tried, fullest first (0.6.2p item 3's approach).

import { shopBadge, type DuskFoe, type Run } from "../../game/run";
import { record } from "../../game/day";
import { HEROES, ITEMS, MERCHANTS, SIGNATURE_CORES, START_LIVES, classFactor, rigShape, type HeroId } from "../../sim/content";
import { makeTurret } from "../../sim/battle"; // 0.6.1p: the turret's window as the battle sees it
import {
  arrowsOf, beltUsed, canSellTurret, connectedRouteCount, defOf, gearFor, gearOn, hitsOfRig, installedTurrets, itemByUid, routeInfo,
  routesOf, turretSellValue, turretSlots, walkRoute, type Build, type RigHit, type RouteWalk, type TimelineHit,
} from "../../sim/deck";
import { joinersOf, type WalkJoin } from "../../sim/deck"; // 0.6.2j: belt joins
import { JOIN_PACE_LINE, JOIN_PACE_PCT, factoryPace, loadEvery } from "../../sim/deck"; // 0.6.2 TUNE-M: RULE JOIN PACE

/**
 * 0.6.2 TUNE-M, RULE JOIN PACE: the lines a joined factory's panels lead with (its own panel, and each of its belts'):
 * JOIN_PACE_LINE ("JOINED: THIS FACTORY RUNS AT 70% PACE.") and, for belt `index` (or the factory's first belt), how
 * often a load now leaves onto it against the unjoined rate. [] for a factory none of whose belts joins, so those
 * panels read as before.
 */
export function joinPaceLines(b: Build, factoryUid: number, index = b.routes.findIndex((r) => r.factory === factoryUid)): [string, string][] {
  const pace = factoryPace(b, factoryUid);
  if (pace >= 1 || index < 0) return [];
  const every = loadEvery(b, index);
  const lines: [string, string][] = [[JOIN_PACE_LINE, C.cyan]];
  if (Number.isFinite(every)) lines.push([`A LOAD EVERY ${every.toFixed(1)}S ON THIS BELT, NOT ${(every * pace).toFixed(1)}S.`, C.cyan]);
  return lines;
}

/** 0.6.2s (REQ-BFG-031 S2): the build's intakes: its installed turrets' belt columns (an empty slot has none). */
const intakeCount = (b: Build): number => turretSlots(b).reduce((n, s) => n + s.intakes.length, 0);
import { resolveCore } from "../../sim/cores"; // 0.6.1b
import { C, RARITY_COLOR } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth, type FontId } from "../../render/font";
import { beltIcon, itemIcon } from "../../render/sprites";
import { button, panel, type Rect } from "../../ui/ui";
import { drawPortrait, tag } from "../../ui/captain";
import { buy, deleteRoute, rotate, selectGain, sell, sellPrice, store, unfitCore, unfitMod, type Ctx } from "./actions";
import { fusible, outputsAt, starsOf, starText } from "../../sim/stars";
import { gainModule, mergePreview } from "../../game/fuse";
import { flavourText } from "./flavour"; // 0.6.2p (item 1): the desc at the module's stars; 0.6.2t: whole sentences
import {
  abilityText, cardText, every as everyText, gatlingClashText, gist, hasAbilityText, hitText, mergeProgressText, mergesWithText, n2,
  newPerk, nextStarHeadline, nextStarText, percent, plural, shieldText, slagPulseExtra, type BeltKind, type TextOpts,
} from "../../ui/abilityText";
import { colourize, drawRich, lineText, PERK_COLOUR, wrapRich, type Span } from "../../ui/richText";
import type { Sel } from "./layout";
import { describe } from "./shop";
import {
  deadEndLines, freeNote, SLOT_HINT, slotActions, slotColor, slotIcon, slotLabels, slotNotes, slotSub, slotTitle, socketLines, turretHint,
  turretSpec, type SocketRow,
} from "./turretPanel"; // 0.6.2s; 0.6.2rel: its panels are PanelText too

/** 0.6.1a: an inspect title with its stars in the 5x7 ★ glyph ("TEMPER ★★"); 1 star shows none. */
const starred = (name: string, stars: number): string => (stars > 1 ? `${name} ${starText(stars)}` : name);

/** 0.6.1r N4: the class factor a core in this run's cargo or shop would fire at: the hero's turrets (all of one
 *  class today: FURNACE heavy k 1, WEAVER light k 0.55), as resolveCore scales it once fitted. */
export function heroK(run: Run): number {
  const td = installedTurrets(run.build)[0]?.td; // 0.6.2s: the first installed turret (the hero's first, at the start)
  return td ? classFactor(td) : 1;
}

/** 0.6.2t: the glossary's options for a run: its hero's class factor (a core's numbers) and its hero (MIMIC FORGE). */
export function textOpts(run: Run): TextOpts {
  return { k: heroK(run), hero: run.hero as HeroId };
}

// -------------------------------------------------------------------------------------------------------- the blocks

/** A block's role sets its colour and face (T4). */
export type Role = "hits" | "warn" | "ability" | "next" | "merges" | "merge" | "row" | "grid" | "note" | "flavour" | "hint";

/** One block of a panel's body: whole sentences, a stat row or a grid row of stat pairs. */
export interface Block {
  role: Role;
  /** Whole sentence(s); a stat row's value. */
  text: string;
  /** A stat row's label (its values align after the widest label of the panel). */
  label?: string;
  /** A grid row: label and value pairs in two aligned columns (the belt's gun-end readout). */
  cells?: [string, string][];
  /** A perk's name, after the text in the perk colour, never split ("★3 TWIN SIGNET"). */
  perk?: string;
  /** Must show whole (T6's phone guarantee). */
  keep?: boolean;
  /** An optional block's order when room is short: the lowest first (default 5). */
  rank?: number;
  /** Optional blocks of one chain show in order: once one doesn't fit, the later ones stay out too (an ability's
   *  later sentences never show without the ones before them). */
  chain?: string;
  /** A shorter text for the last compact variant (the next-star line's headline, T6). */
  alt?: string;
  /** A belt's timeline row: they give way from the end, and a note says how many (0.6.2 BELTSIDE's trim). */
  trim?: boolean;
  /** 0.6.2j (J10): a timeline row that is a JOINS line, not a hit tile (the trim note counts hit tiles only). */
  join?: boolean;
  /** The text's base colour (else the role's). */
  colour?: string;
}

/** Each role's base colour and whether it always takes the small (3x5) face: the flavour dimmer than the ability text,
 *  the hint dimmer again (T4). */
export const ROLE: Record<Role, { colour: string; small: boolean }> = {
  hits: { colour: C.bone, small: false },
  warn: { colour: C.amber, small: false },
  ability: { colour: C.bone, small: false },
  next: { colour: C.bone, small: false },
  merges: { colour: C.bone, small: false },
  merge: { colour: C.steel3, small: false },
  row: { colour: C.bone, small: false },
  grid: { colour: C.yellow, small: false },
  note: { colour: C.slate4, small: false },
  flavour: { colour: C.steel2, small: true },
  hint: { colour: C.slate3, small: true },
};
/** A stat label's colour. */
const LABEL = C.slate4;

/** The ability text as blocks: the opening sentence and the perk's sentence keep; the others give way first, from the
 *  last (a chain: a later sentence never shows without the ones before it). */
function abilityBlocks(def: string, stars: number, o: TextOpts): Block[] {
  const at = abilityText(def, stars, o);
  return at.sentences.map((text, i): Block => ({
    role: "ability", text, keep: i === 0 || i === at.perk?.after, rank: 2, chain: "ability",
    ...(at.perk && i === at.perk.after ? { perk: `★${at.perk.stars} ${at.perk.name}` } : {}),
  }));
}

/** 0.6.2t (T6): a compact form of a panel for a short band (the phone), fullest first: its body; a header sub line in
 *  place of the panel's (a rig's hits or its IDLE warning, moved up; used only where it fits the header); and `tight`:
 *  the 3x5 body at a 6 px line pitch, 1 px higher (the 69 px phone band then holds 5 lines under a button row, not 4). */
export interface Variant {
  body: Block[];
  sub?: string;
  subColor?: string;
  tight?: boolean;
}

/** The next-star line without the name of the perk that star brings (a compact variant). */
const noNextPerk = (bs: readonly Block[]): Block[] => bs.map((b) => (b.role === "next" && b.perk ? { ...b, perk: undefined } : b));
/** ...and at its headline, the first clause of the next star's effect (the last resort, as 0.6.2p's headline). */
const headlineNext = (bs: readonly Block[]): Block[] => noNextPerk(bs).map((b) => (b.role === "next" && b.alt ? { ...b, text: b.alt } : b));

/** The usual compact forms of a body: tight lines; then without the next star's perk name; then its headline. */
const tightForms = (body: Block[]): Variant[] => [
  { body, tight: true }, { body: noNextPerk(body), tight: true }, { body: headlineNext(body), tight: true },
];

/** How many more 1★ gains of `def` (bought, dropped, however) it takes to pass `atLeast` stars,
 *  simulated on a cloned run through the real gainModule (no re-implemented fuse math). */
function copiesToNextStar(run: Run, def: string, atLeast: number): number {
  const clone = { ...run, build: JSON.parse(JSON.stringify(run.build)), inventory: run.inventory.map((i) => ({ ...i })), fuseFx: [] } as Run;
  for (let n = 1; n <= 8; n++) {
    const g = gainModule(clone, def);
    if (g.stars > atLeast) return n;
  }
  return 8;
}

/** T5: the next-star line (and the perk that star brings) and merge progress; [] at the top star or when not fusible.
 *  The next-star block carries its headline (`alt`, T6) for the last compact variant. */
function progressBlocks(run: Run, def: string, stars: number): Block[] {
  const next = nextStarText(def, stars, textOpts(run));
  if (!next) return [];
  const perk = newPerk(def, stars + 1), head = nextStarHeadline(def, stars, textOpts(run));
  return [
    { role: "next", text: next, keep: true, ...(perk ? { perk: `★${stars + 1} ${perk}` } : {}), ...(head ? { alt: head } : {}) },
    { role: "merge", text: mergeProgressText(copiesToNextStar(run, def, stars)), keep: true },
  ];
}

/** The flavour (0.6.2p's star-aware desc, T7), whole or not at all (0b.5). */
const flavourBlock = (def: string, stars: number, k: number): Block => ({ role: "flavour", text: flavourText(def, stars, k), rank: 7 });
/** The action hint. */
const hintBlock = (text: string): Block => ({ role: "hint", text, rank: 6 });

/** 0.6.2 BELTSIDE: the hint for placing a part from the shop (`drag`: it can be dragged there too) or cargo. */
function placeHint(kind: string, drag: boolean): string {
  if (kind === "turret") return turretHint(drag); // 0.6.2s (S5): a turret goes into a TURRET SLOT
  const how = kind === "mod" || kind === "core" ? "TAP A TURRET TO FIT IT"
    : kind === "gate" ? "TAP A CELL BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT"
    : "TAP THE DECK TO PLACE IT";
  return drag ? `${how}, OR DRAG IT THERE.` : `${how}.`;
}

// ---------------------------------------------------------------------------------------------- one-line helpers

/** T5: an offer that merges on purchase: "MERGES WITH YOUR TEMPER INTO ★2: ADDS 4 BURN." (and the perk it brings);
 *  null when buying it merges nothing. */
export function mergeLine(run: Run, def: string): string | null {
  const b = mergeBlock(run, def);
  return b ? `${b.text}${b.perk ? ` ${b.perk}` : ""}` : null;
}

/** T5: the next-star line with the perk it brings, then merge progress: "NEXT STAR: ADDS 7 BURN. 2 MORE COPIES TO
 *  MERGE."; null at the top star or for a non-fusible id. */
export function nextLine(run: Run, def: string, stars: number): string | null {
  const b = progressBlocks(run, def, stars);
  return b.length ? `${b[0].text}${b[0].perk ? ` ${b[0].perk}` : ""} ${b[1].text}` : null;
}

/** 0.6.2 BELTSIDE: the IDLE warning, and its phone-band form (the sub line says IDLE in amber; the turn hint follows). */
export const IDLE_WARNING = "IDLE: NO ARROW REACHES A BELT. TURN IT OR MOVE IT BESIDE ONE.";
export const IDLE_SHORT = "IDLE: NO ARROW REACHES A BELT.";
/** 0.6.2t: the IDLE warning where it moves up into a narrow header (the desk column's). */
export const IDLE_HEAD = "IDLE: NO ARROW ON A BELT.";

/** 0.6.2t (0b.4): which belt a walk is on: locked (METRONOME, speed-locked), slag (a SLAG POT's fixed speed) or free. */
export function beltKind(w: RouteWalk): BeltKind {
  return w.locked ? "locked" : w.fixed !== undefined ? "slag" : "free";
}

/** 0.6.2 BELTSIDE (V4): one hit in a belt's timeline (0.6.2t: the glossary's hitText, with 0b.4's slag and locked
 *  readings: a SLAG belt never reads LOCKED or pays a locked bonus). Exported for tests. */
export function hitLabel(h: TimelineHit, belt: BeltKind): string {
  return hitText(h, belt);
}

/** "4 AND 6", "4, 5 AND 6". */
function andList(xs: (string | number)[]): string {
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} AND ${xs[xs.length - 1]}`;
}

/** A rig's hits, one line each ("→ BELT 1, TILE 3"), or all on one line grouped by belt ("→ BELT 1 TILE 4, BELT 2 TILES
 *  4 AND 6"): the phone band's compact form; `short` labels the tiles as the belt readout's rows do ("→ BELT 1 T4, BELT 2
 *  T4 AND T6", the header's last resort). */
function hitLines(hits: readonly RigHit[]): { full: string[]; compact: string; short: string } {
  const by = new Map<number, number[]>();
  for (const h of hits) by.set(h.route, [...(by.get(h.route) ?? []), h.tile + 1]);
  return {
    full: hits.map((h) => `→ BELT ${h.route + 1}, TILE ${h.tile + 1}`),
    compact: `→ ${[...by].map(([r, ts]) => `BELT ${r + 1} ${ts.length === 1 ? `TILE ${ts[0]}` : `TILES ${andList(ts)}`}`).join(", ")}`,
    short: `→ ${[...by].map(([r, ts]) => `BELT ${r + 1} ${andList(ts.map((t) => `T${t}`))}`).join(", ")}`,
  };
}

// ---------------------------------------------------------------------------------------------------- the panels

/** A panel's text: its header, body blocks, compact variants (fullest first) and its buttons' labels. Pure; spec()
 *  adds the icon and the buttons' actions. Exported for the tests (planPanel on the phone band). */
export interface PanelText {
  title: string;
  color: string;
  sub: string;
  subColor?: string; // 0.6.2 BELTSIDE: an IDLE rig's sub line warns
  subShort?: string; // 0.6.2 BELTSIDE: the sub line where `sub` doesn't fit beside the portrait strip's buttons
  /** A header-only strip's text (the 360x640 portrait): the fullest that fits, on up to two lines (0.6.2 BELTSIDE's
   *  subTight for a belt's readout; 0.6.2t: an offer's one-line effect, the tap preview there). */
  headerOnly?: { texts: string[]; colour: string };
  body: Block[];
  /** Compact forms for a short band, fullest first (planBody takes the first whose kept blocks fit). */
  variants?: Variant[];
  labels: string[];
}

/** A rig's panel extras (tests): IDLE, an X rig (no ROTATE). */
export interface RigPanel extends PanelText {
  idle: boolean;
  x: boolean;
}

/**
 * 0.6.2 BELTSIDE (V4): a placed rig's panel: its hits, or IDLE when none of its arrows lands on a belt. beltside-062c
 * (DESIGN §12 P11): the lines that matter most come first. 0.6.2t: the hits (or IDLE), the ability text (its opening
 * sentence and its perk's sentence kept), the next-star line and merge progress, then the turn hint and the flavour. On
 * the phone band the compact variants put the hits on one line (or IDLE's short warning), then drop the next star's
 * perk name. Exported for tests; null unless `uid` is a placed rig.
 */
export function rigPanel(run: Run, uid: number): RigPanel | null {
  const p = itemByUid(run.build, uid);
  if (!p) return null;
  const d = defOf(p);
  if (d.kind !== "gate") return null;
  const stars = starsOf(p);
  const hits = hitsOfRig(run.build, p.uid);
  const arrows = arrowsOf(p).length, x = rigShape(d) === "X";
  const idle = hits.length === 0;
  const on = new Set(hits.map((h) => h.dir)).size;
  const hl = hitLines(hits);
  const lead: Block[] = idle ? [{ role: "warn", text: IDLE_WARNING, keep: true }] : hl.full.map((t): Block => ({ role: "hits", text: t, keep: true }));
  const leadTight: Block[] = idle ? [{ role: "warn", text: IDLE_SHORT, keep: true }]
    : hits.length > 1 ? [{ role: "hits", text: hl.compact, keep: true }] : lead;
  const rest = [
    ...abilityBlocks(d.id, stars, textOpts(run)),
    ...progressBlocks(run, d.id, stars),
    flavourBlock(d.id, stars, 1),
    hintBlock(x ? "FACES EVERY SIDE. DRAG TO MOVE." : "TAP TO TURN (OR R). DRAG TO MOVE."),
  ];
  // T6 (phone): the hits (or the IDLE warning) move up into the header's sub line, where they fit there (planBody skips
  // a head that doesn't): the compact list, then its short form with tile labels ("→ BELT 1 T4, BELT 2 T4 AND T6")
  const heads: Pick<Variant, "sub" | "subColor">[] = idle ? [IDLE_SHORT, IDLE_HEAD].map((sub) => ({ sub, subColor: C.amber }))
    : [...new Set([`RIG ${hl.compact}`, `RIG ${hl.short}`])].map((sub) => ({ sub }));
  const forms = (body: Block[], tight: boolean): Variant[] => [...heads.map((h) => ({ body, ...h, tight })), { body: [...leadTight, ...body], tight }];
  return {
    title: starred(d.name, stars), color: RARITY_COLOR[d.rarity],
    sub: idle ? "RIG · IDLE" : `RIG · ${on}/${arrows} ARROWS ON BELTS`,
    subShort: idle ? undefined : `RIG · ${on}/${arrows} HIT`,
    subColor: idle ? C.amber : undefined,
    body: [...lead, ...rest],
    variants: [
      { body: [...leadTight, ...rest] },
      ...heads.map((h) => ({ body: rest, ...h })),
      ...forms(rest, true),
      ...forms(noNextPerk(rest), true),
      ...forms(headlineNext(rest), true),
    ],
    labels: [...(x ? [] : ["ROTATE"]), "TO CARGO"],
    idle, x,
  };
}

/** T5: the MERGES WITH block of an offer that merges on purchase (the perk that star brings after it). */
function mergeBlock(run: Run, def: string): Block | null {
  const preview = mergePreview(run, def);
  if (!preview) return null;
  const to = preview.toStars, perk = newPerk(def, to);
  return { role: "merges", text: mergesWithText(def, to, textOpts(run)), keep: true, ...(perk ? { perk: `★${to} ${perk}` } : {}) };
}

/** A shop offer's panel, the phone's tap preview (T5): the module's 1-star ability text, the MERGES WITH line when it
 *  merges on purchase, the hint and the flavour; on the header-only 360x640 strip, its one-line effect. */
export function offerPanel(run: Run, wagon: number, slot: number): PanelText | null {
  const o = run.shop.wagons[wagon]?.offers[slot];
  if (!o) return null;
  const d = ITEMS[o.def];
  const merging = !o.sold && shopBadge(run, o.def)?.kind === "merge";
  const opts = textOpts(run);
  const mLine = merging ? mergeBlock(run, o.def) : null;
  const one = cardText(d.id, opts);
  const body: Block[] = [
    ...abilityBlocks(d.id, 1, opts),
    ...(mLine ? [mLine] : []),
    flavourBlock(d.id, 1, opts.k ?? 1),
    hintBlock(d.kind === "supply" ? "USED THE MOMENT YOU BUY IT." : placeHint(d.kind, true)),
  ];
  return {
    title: d.name, color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · ${MERCHANTS[run.shop.wagons[wagon].merchant].name}`,
    subShort: describe(d), // T6: the merchant's name gives way first, so the button can share the title's row
    headerOnly: one ? { texts: [one], colour: C.bone } : undefined,
    body,
    variants: tightForms(body),
    labels: [o.sold ? "SOLD" : d.kind === "supply" ? `BUY+USE ${o.price}G` : merging ? `BUY+MERGE ${o.price}G` : `BUY ${o.price}G`],
  };
}

/** A module in cargo: its ability text at its stars (a core's numbers at the hero's k), next star, merge progress. */
export function cargoPanel(run: Run, uid: number): PanelText | null {
  const it = run.inventory.find((i) => i.uid === uid);
  if (!it) return null;
  const d = ITEMS[it.def], stars = starsOf(it), opts = textOpts(run);
  // 0.6.2s (S6): a turret sells for turretSellValue, and a hull's free starting copy can't be sold at 1 star
  const turret = d.kind === "turret", sellable = !turret || canSellTurret(it);
  const body: Block[] = [
    ...abilityBlocks(d.id, stars, opts),
    ...progressBlocks(run, d.id, stars),
    ...(turret && it.free ? [{ role: "ability", text: freeNote(sellable), rank: 3 } as Block] : []),
    flavourBlock(d.id, stars, opts.k ?? 1),
    hintBlock(placeHint(d.kind, false)),
  ];
  return {
    title: starred(d.name, stars), color: RARITY_COLOR[d.rarity], sub: `${describe(d)} · IN CARGO`,
    subShort: `${KIND_WORD[d.kind] ?? "PART"} · IN CARGO`, // T6: the rarity gives way first (the title shows it in colour)
    body,
    variants: tightForms(body),
    labels: sellable ? [`SELL +${turret ? turretSellValue(it) : sellPrice(d.id, stars)}G`] : [],
  };
}

/** The kind as the panels name it (shop.ts describe, without the rarity). */
const KIND_WORD: Record<string, string> = {
  gate: "RIG", factory: "FACTORY", mod: "TURRET GEAR", core: "TURRET CORE", supply: "SUPPLY", turret: "TURRET",
};

/** A placed deck item: a rig (rigPanel), or a factory with its outputs at its stars (GANTRY PRESS ★2 THIRD ARM feeds 3)
 *  and its text; a hero's signature factory has no stars, no next star and no TO CARGO. */
export function itemPanel(run: Run, uid: number): PanelText | null {
  const p = itemByUid(run.build, uid);
  if (!p) return null;
  const d = defOf(p);
  if (d.kind === "gate") return rigPanel(run, uid);
  const stars = starsOf(p);
  const sig = !fusible(d.id);
  const body: Block[] = [
    ...(hasAbilityText(d.id) ? abilityBlocks(d.id, stars, textOpts(run)) : []),
    ...(sig ? [] : progressBlocks(run, d.id, stars)),
    flavourBlock(d.id, stars, 1),
    hintBlock("DRAG OUT OF IT TO LAY BELT."),
  ];
  return {
    title: starred(d.name, stars), color: RARITY_COLOR[d.rarity],
    sub: `FACTORY · BELTS ${routesOf(run.build, p.uid).length}/${outputsAt(d.id, stars) || 1}`,
    body,
    variants: tightForms(body),
    labels: sig ? [] : ["TO CARGO"],
  };
}

/** 0.6.2j: a belt's panel parts (routePanel adds the title and the button), exported for tests. */
export interface BeltPanel {
  sub: string;
  subShort?: string;
  headerOnly?: PanelText["headerOnly"];
  /** The ENDS SHORT warning, the belts that join it, its tiles and hits. */
  head: Block[];
  /** The timeline in R7 order, a JOINS row where the walk joins another belt (they give way from the end). */
  rows: Block[];
  /** The gun end's readout, always in sight. */
  foot: Block[];
  /** What stands for the last n rows on a short panel (moreFor: hit tiles only, 0.6.2j). */
  more: (n: number) => Block;
}

/**
 * A belt route (0.6.2 BELTSIDE, V4): its tiles and hits, the timeline in R7 order (0.6.2t: the glossary's hit rows, 0b.4),
 * then the gun end's readout in aligned stat pairs: DMG and BURN, SPD and TIME, and SHOCK and COPIES where they apply.
 * The readout always stays; on a short panel the last timeline rows give way first, and a note says how many.
 * 0.6.2j (J10): a joining belt shows its own tiles' hits, a cyan "JOINS BELT n AT TILE t." row, then the main belt's
 * hits from the join tile on (walkRoute continues through the join); its sub line names the belt it joins; a main belt
 * says which belts join it. 0b.4 holds through a join (J15: the speed belongs to the payload): a SLAG joiner keeps its
 * fixed speed past the join, so its speed hits there read NO EFFECT ON SLAG, never LOCKED; a normal payload joining a
 * slag-fed belt rides that belt's speed state. A belt without joins reads as before. Null unless route `index` exists.
 */
export function beltPanel(run: Run, index: number): BeltPanel | null {
  const b = run.build;
  if (!b.routes[index]) return null;
  const info = routeInfo(b, index);
  const w = walkRoute(b, index);
  const belt = beltKind(w);
  const est = w.estimate;
  // 0b.4: the walk counts SURGE VALVE's pulse damage on a SLAG belt, where the sim never pays it
  const dmg = Math.max(1, est.dmg - slagPulseExtra(w.timeline, belt)).toFixed(1);
  const hitCount = w.timeline.reduce((n, row) => n + row.hits.length, 0);
  const spd = belt === "locked" ? "100% (LOCKED)" : belt === "slag" ? `${percent(w.speedEnd)} (SLAG)` : percent(w.speedEnd);
  const time = `${est.time.toFixed(1)} SEC`;
  const cells: [string, string][][] = [
    [["DMG", dmg], ["BURN", String(est.burn)]],
    [["SPD", spd], ["TIME", time]],
    ...(est.shock || est.copies > 1 ? [[["SHOCK", est.shock ? "YES" : "NO"], ["COPIES", n2(est.copies)]] as [string, string][]] : []),
  ];
  const joined = joinersOf(b, index); // 0.6.2j (J10): the belts that join this one
  const joins = w.joins ?? [];
  const joinRow = (j: WalkJoin): Block => ({ role: "row", text: `JOINS BELT ${j.route + 1} AT TILE ${j.tile + 1}.`, colour: C.cyan, trim: true, join: true });
  const rows: Block[] = [];
  w.timeline.forEach((row, i) => {
    for (const j of joins) if (j.row === i) rows.push(joinRow(j));
    rows.push({ role: "row", label: `T${row.tile + 1}`, text: row.hits.map((h) => hitText(h, belt)).join(", "), trim: true });
  });
  for (const j of joins) if (j.row >= w.timeline.length) rows.push(joinRow(j));
  const feeds = info.connected ? `FEEDS TURRET ${info.turret + 1}` : "NOT CONNECTED";
  return {
    // 0.6.2j: a joining belt's sub names the belt it joins (0.6.2rel: two short sentences, no "·")
    sub: info.join ? `JOINS BELT ${info.join.route + 1}. ${feeds}.` : feeds,
    ...(info.join ? { subShort: `JOINS BELT ${info.join.route + 1}.` } : {}),
    headerOnly: info.connected ? {
      texts: [
        `DMG ${dmg}, BURN ${est.burn}${est.shock ? ", SHOCK" : ""}, SPD ${percent(w.speedEnd)}, ${time}`,
        `DMG ${dmg}, ${time}, BURN ${est.burn}`,
        `DMG ${dmg}, ${time}`,
      ],
      colour: C.yellow,
    } : undefined,
    head: [
      ...(info.connected ? [] : [{ role: "warn", text: "ENDS SHORT OF A TURRET INTAKE.", keep: true } as Block]),
      ...(joined.length ? [{
        role: "hits", colour: C.cyan, keep: true,
        text: joined.length === 1 ? `BELT ${joined[0] + 1} JOINS IT.` : `BELTS ${andList(joined.map((j) => j + 1))} JOIN IT.`,
      } as Block] : []),
      { role: "hits", text: hitCount ? `${info.tiles} TILES, ${hitCount} HIT${hitCount === 1 ? "" : "S"}:` : `${info.tiles} TILES. NO RIG WORKS THIS BELT.`, keep: true },
    ],
    rows,
    foot: cells.map((c): Block => ({ role: "grid", text: "", cells: c, keep: true })),
    more: (n) => moreFor(rows.slice(rows.length - n)),
  };
}

/** A belt route's panel (beltPanel with its title and REMOVE BELT). */
export function routePanel(run: Run, index: number): PanelText | null {
  const bp = beltPanel(run, index);
  if (!bp) return null;
  return {
    title: "BELT ROUTE", color: C.white, sub: bp.sub, ...(bp.subShort ? { subShort: bp.subShort } : {}), headerOnly: bp.headerOnly,
    body: [...bp.head, ...bp.rows, ...bp.foot],
    labels: ["REMOVE BELT"],
  };
}

/**
 * 0.6.1p: the GATLING clashes (the Prime's call): a GATLING never holds a window, so HOPPER's seconds and FINISHER RAM do
 * nothing on its turret. 0.6.2 CAND-A: every piece of gear on slot t, in hardpoint order (0.6.2s S4), not only the
 * first; a HOPPER's store still works there (tests/fb062.mech.test.ts). 0.6.2rel: whole sentences from the glossary
 * (gatlingClashText). Exported for tests.
 */
export function gatlingClash(b: Build, t: number, routine: string): string[] {
  if (routine !== "gatling") return [];
  return gearOn(b, t).map((m) => gatlingClashText(m.def, starsOf(m))).filter((s): s is string => !!s);
}

/** 0.6.2 FB-B (DESIGN §11 P6): the turret panel's sentence for a MANTLET ★2/★3 that shields `n` tiles: the last tile(s)
 *  of every belt into this turret, and each rig working a shielded tile (the glossary's shieldText). Exported for tests. */
export const shieldLine = (n: number): string => shieldText(n);

/**
 * A turret (0.6.1b) in its TURRET SLOT (0.6.2s, REQ-BFG-031 S10): its name, stars and rarity (the title) and its class
 * and slot (the sub line); first the belts a swap left without an intake (S2/S5); then its CORE socket and every GEAR
 * slot in hardpoint order (S4), filled or empty, each named in a row with its opening sentence under it (T5: the same
 * sentence as the module's own panel, the core at the turret's k); its firing rows (0.6.2t: from makeTurret, the
 * numbers the battle fires by; 0.6.2 FB-B: a HOPPER ★2/★3's store); a clash for each piece of gear a GATLING SPOOL
 * idles (CAND-A); a MANTLET ★2/★3's shield (FB-B); its notes (turretPanel.ts slotNotes) and the move hint. The compact
 * forms, fullest first: each socket's short effect (the glossary's gist) in its row; then the dead ends on one line each;
 * then every gear slot on one row. The dead ends and the socket rows always show. Null unless a turret is installed.
 */
export function turretPanel(run: Run, index: number): PanelText | null {
  const b = run.build;
  const td = turretSlots(b)[index]?.td; // 0.6.2s: the installed turret (an empty slot: turretPanel.ts emptySlotPanel)
  if (!td) return null;
  const gm = gearFor(b, index); // 0.6.1b: the gear REMOVE GEAR takes; the core has its own socket (coreFor via resolveCore)
  const tc = resolveCore(b, index, td); // 0.6.1b: bought core (k-scaled) or the signature core
  const tu = makeTurret(b, index, td); // its interval (every gear piece, the core, the long-belt cadence), window and store
  const every = tu.interval * (tc.bought ? tc.spec.reloadMul ?? 1 : 1); // SALVO's volley reload
  const coreName = tc.bought ? starred(ITEMS[tc.def].name, tc.stars) : (SIGNATURE_CORES[tc.def]?.name ?? "SIGNATURE CORE");
  const o = (k: number): TextOpts => ({ k, hero: b.hero as HeroId });
  // a socket's opening sentence (T5: as its own panel reads it); the compact forms use its gist in the row instead
  const first = (def: string, stars: number, k: number): Block[] => {
    const at = abilityText(def, stars, o(k));
    const perk = at.perk && at.perk.after === 0 ? { perk: `★${at.perk.stars} ${at.perk.name}` } : {};
    return at.sentences.length ? [{ role: "ability", text: at.sentences[0], keep: true, ...perk }] : [];
  };
  const coreGist = tc.bought ? gist(tc.def, tc.stars, o(tc.k)) : "";
  const warn = (short: boolean) => deadEndLines(b, index, short).map((text): Block => ({ role: "warn", text, keep: true }));
  const rowOf = (s: SocketRow): Block => ({ role: "row", label: s.label, text: s.text, keep: true });
  const noJam = tu.noJam || (tc.bought && tc.spec.noJam);
  // the turret's own numbers: kept in the full and gist forms (the gear-list form says them in an optional sentence)
  const stats: Block[] = [
    { role: "row", label: "FIRES", text: `EVERY ${n2(every)} SEC${tu.perShot > 1 ? `, ${tu.perShot} LOADS EACH SHOT` : ""}`, keep: true },
    {
      role: "row", label: "CHAMBER", keep: true,
      text: `${tu.window} LOADS, ${n2(tu.windowTime)} SEC${tu.storeMax ? `, STORES ${tu.storeMax} WHILE FIRING` : ""}${noJam ? ", NEVER JAMS" : ""}`,
    },
  ];
  // a clash (a piece of gear that does nothing here) and the shield come before the optional stats sentence below
  const rest: Block[] = [
    ...gatlingClash(b, index, tc.routine).map((text): Block => ({ role: "warn", text, rank: 1 })), // CAND-A: every gear slot
    ...(tu.intakeGuard > 0 ? [{ role: "ability", text: shieldLine(tu.intakeGuard), rank: 1 } as Block] : []), // FB-B MANTLET
    ...slotNotes(b, index).map((text): Block => ({ role: "ability", text, rank: 4 })),
    hintBlock(SLOT_HINT),
  ];
  const body: Block[] = [
    ...warn(false),
    ...socketLines(b, index, coreName).flatMap((s, i) =>
      [rowOf(s), ...(i === 0 ? (tc.bought ? first(tc.def, tc.stars, tc.k) : []) : s.def ? first(s.def, s.stars ?? 1, 1) : [])]),
    ...stats, ...rest,
  ];
  const gists = socketLines(b, index, coreGist ? `${coreName}: ${coreGist}.` : coreName, (d, s) => gist(d, s, o(1))).map(rowOf);
  const list = socketLines(b, index, coreName, undefined, true).map(rowOf);
  // the last form lists the gear on one row and says the stats in a sentence (the stat rows' long labels would narrow
  // its value column)
  const statsText: Block = {
    role: "ability", rank: 2,
    text: `IT FIRES ${everyText(every)}${tu.perShot > 1 ? `, ${tu.perShot} LOADS EACH SHOT` : ""}, AND ITS CHAMBER HOLDS ${plural(tu.window, "LOAD")}${tu.storeMax ? `, ${tu.storeMax} MORE WHILE IT FIRES` : ""}.`,
  };
  const forms = [[...warn(false), ...gists, ...stats, ...rest], [...warn(true), ...gists, ...stats, ...rest], [...warn(true), ...list, statsText, ...rest]];
  return {
    title: slotTitle(b, index), color: slotColor(b, index), sub: slotSub(b, index),
    body,
    variants: [{ body, tight: true }, ...forms.flatMap((f) => [{ body: f }, { body: f, tight: true }])],
    labels: [...(tc.bought ? ["REMOVE CORE"] : []), ...(gm ? ["REMOVE GEAR"] : []), ...slotLabels(b, index)],
  };
}

// ------------------------------------------------------------------------------------------------------ the layout

/** One drawn line of a panel's body. */
export interface PLine {
  spans: Span[];
  font: FontId;
  /** A stat row's label (drawn in the label colour at the left) and its value's indent. */
  label?: string;
  indent?: number;
  /** A grid row's pairs: each label at x + at, its value at x + vx. */
  cells?: { at: number; label: string; spans: Span[]; vx: number }[];
  /** The block it belongs to (tests). */
  block: Block;
  /** The height it takes: its glyphs and the gap under them (LH, or 6 for a tight 3x5 line). */
  pitch: number;
}

/** The pixel height a line takes in each face (its glyphs and the gap under them). */
export const LH: Record<FontId, number> = { "5": 9, "3": 7 };
/** 0.6.2t (T6): a tight variant's 3x5 line pitch (5 px glyphs, 1 px gap). */
export const LH_TIGHT = 6;
/** The rule between the ability text and the flavour or hint (T4: visibly separated). */
export const DIVIDER = 4;

/** A laid-out block: its lines and their height. */
export interface Laid {
  b: Block;
  lines: PLine[];
  h: number;
}

/** A face's gap after a stat label. */
const labelGap = (font: FontId): number => (font === "5" ? 5 : 4);

interface Cols {
  labelW: number; // a stat row's value indent
  /** The grid rows' geometry: two columns (the second at `at1`) when every pair fits them, else one pair a line. */
  grid: { two: boolean; at1: number; l0: number; l1: number };
}

/** Lay one block into wrapped lines at `width` in the panel's main face (the flavour and hint take the small face);
 *  `tight`: 3x5 lines at LH_TIGHT. */
function layBlock(b: Block, width: number, main: FontId, cols: Cols, tight = false): PLine[] {
  const font: FontId = ROLE[b.role].small ? "3" : main;
  const pitch = font === "3" && tight ? LH_TIGHT : LH[font];
  const base = b.colour ?? ROLE[b.role].colour;
  if (b.role === "grid" && b.cells) {
    const gp = cols.grid, gap = labelGap(font);
    if (gp.two) {
      return [{
        spans: [], font, block: b, pitch,
        cells: b.cells.map(([l, v], i) => ({ at: i ? gp.at1 : 0, label: l, spans: colourize(v, base), vx: i ? gp.at1 + gp.l1 + gap : gp.l0 + gap })),
      }];
    }
    // one pair a line, the values aligned after the widest label
    const lw = Math.max(gp.l0, gp.l1) + gap;
    return b.cells.map(([l, v]) => ({ spans: [], font, block: b, pitch, cells: [{ at: 0, label: l, spans: colourize(v, base), vx: lw }] }));
  }
  if (b.role === "row") {
    const indent = b.label ? cols.labelW : 0;
    return wrapRich(colourize(b.text, base), width - indent, font)
      .map((spans, i) => ({ spans, font, block: b, indent, pitch, ...(i === 0 && b.label ? { label: b.label } : {}) }));
  }
  let spans: Span[];
  if (b.role === "next" && b.text.startsWith("NEXT STAR:")) {
    spans = [{ t: "NEXT STAR:", c: PERK_COLOUR, whole: true }, { t: " ", c: base }, ...colourize(b.text.slice(10).trim(), base)];
  } else if (b.role === "flavour") spans = colourize(b.text, base, base); // its numbers stay dim; its keywords keep their colours
  else if (b.role === "hint" || b.role === "note") spans = [{ t: b.text, c: base }];
  else spans = colourize(b.text, base);
  if (b.perk) spans.push({ t: " ", c: base }, { t: b.perk, c: PERK_COLOUR, whole: true });
  return wrapRich(spans, width, font).map((s) => ({ spans: s, font, block: b, pitch }));
}

/** Lay out blocks: a panel's stat labels share one value column, and its grid rows two label columns. */
export function lay(bs: readonly Block[], width: number, main: FontId, tight = false): Laid[] {
  const labels = bs.filter((b) => b.role === "row" && b.label).map((b) => textWidth(b.label!, main));
  const grids = bs.filter((b) => b.role === "grid" && b.cells);
  const colW = (i: number, j: 0 | 1) => Math.max(0, ...grids.flatMap((b) => (b.cells![i] ? [textWidth(b.cells![i][j], main)] : [])));
  // the second column starts at the half, or after the first column's widest value; two columns only if all fit
  const gap = labelGap(main), l0 = colW(0, 0), l1 = colW(1, 0);
  const at1 = Math.max(Math.floor((width + gap) / 2), l0 + gap + colW(0, 1) + 6);
  const cols: Cols = {
    labelW: labels.length ? Math.max(...labels) + labelGap(main) : 0,
    grid: { two: at1 + l1 + gap + colW(1, 1) <= width, at1, l0, l1 },
  };
  return bs.map((b) => {
    const lines = layBlock(b, width, main, cols, tight);
    return { b, lines, h: lines.reduce((n, l) => n + l.pitch, 0) };
  });
}

/** The height of blocks in display order: a rule before the first small block (flavour, hint) after a big one. */
export function heightOf(ls: readonly Laid[]): number {
  let h = 0, big = false, ruled = false;
  for (const l of ls) {
    const small = ROLE[l.b.role].small;
    if (small && big && !ruled) {
      h += DIVIDER;
      ruled = true;
    }
    if (!small) big = true;
    h += l.h;
  }
  return h;
}

/** The body's plan: the main face, the blocks drawn (in order) and their lines. */
export interface BodyPlan {
  font: FontId;
  shown: Laid[];
  lines: (PLine | "rule")[];
  height: number;
  /** The kept blocks fit whole (false: the last variant is drawn, cut at the panel's end: a phone cut). */
  fits: boolean;
  /** Which text was used: 0 the full body, n the n-th compact variant. */
  variant: number;
  /** The variant's tight 3x5 pitch (its body starts 1 px higher). */
  tight: boolean;
  /** The variant's header sub line, in place of the panel's (a rig's hits or IDLE warning), and its colour. */
  sub?: string;
  subColor?: string;
  /** The optional blocks left out. */
  dropped: Block[];
}

/** A note for timeline rows that gave way (0.6.2 BELTSIDE's trim). */
const moreNote = (n: number): Block => ({ role: "note", text: `+${n} MORE HIT TILE${n === 1 ? "" : "S"} (NUMBERED ON THE DECK)`, keep: true });
/** 0.6.2j (J10): the block standing for the timeline rows that gave way: the note counts the hit tiles among them (a
 *  JOINS row is none); when they hold no hit tile, the first of them shows as itself. */
export function moreFor(dropped: readonly Block[]): Block {
  const k = dropped.filter((b) => !b.join).length;
  return !k && dropped.length ? { ...dropped[0], trim: false, keep: true } : moreNote(k);
}

/** Choose the blocks for `avail` px: every kept block, the timeline rows that fit (then a note for the rest), then the
 *  optional blocks by rank, each only if it fits whole. Returns them in display order. */
function choose(all: readonly Laid[], avail: number, width: number, main: FontId, tight = false): { chosen: Laid[]; fits: boolean } {
  const seqOf = (s: Set<Laid>, note: Laid | null): Laid[] => {
    const seq = all.filter((l) => s.has(l));
    if (!note) return seq;
    const lastTrim = [...seq].reverse().find((l) => l.b.trim);
    const grid = seq.findIndex((l) => l.b.role === "grid");
    const at = lastTrim ? seq.indexOf(lastTrim) + 1 : grid >= 0 ? grid : seq.length;
    return [...seq.slice(0, at), note, ...seq.slice(at)];
  };
  let set = new Set(all.filter((l) => l.b.keep));
  let note: Laid | null = null;
  if (heightOf(seqOf(set, null)) > avail) return { chosen: seqOf(set, null), fits: false };
  const trims = all.filter((l) => l.b.trim);
  if (trims.length) {
    const rows = (n: number) => new Set([...set, ...trims.slice(0, n)]);
    if (heightOf(seqOf(rows(trims.length), null)) <= avail) set = rows(trims.length);
    else {
      for (let n = trims.length - 1; n >= 0; n--) {
        const nt = lay([moreFor(trims.slice(n).map((l) => l.b))], width, main, tight)[0]; // 0.6.2j: hit tiles only
        if (heightOf(seqOf(rows(n), nt)) <= avail || n === 0) {
          set = rows(n);
          note = nt;
          break;
        }
      }
    }
  }
  const optional = all.filter((l) => !l.b.keep && !l.b.trim)
    .sort((a, b) => (a.b.rank ?? 5) - (b.b.rank ?? 5) || all.indexOf(a) - all.indexOf(b));
  const stopped = new Set<string>(); // chains whose next block didn't fit: their later blocks stay out too
  for (const o of optional) {
    if (o.b.chain && stopped.has(o.b.chain)) continue;
    const s = new Set([...set, o]);
    if (heightOf(seqOf(s, note)) <= avail) set = s;
    else if (o.b.chain) stopped.add(o.b.chain);
  }
  return { chosen: seqOf(set, note), fits: true };
}

/**
 * Plan a panel's body for `avail` px at `width` (T6): the 5x7 face when every block fits it, else the 3x5 face with
 * every kept block whole and the rest whole or absent; where the kept blocks don't fit, the first compact variant whose
 * do (else the last, drawn until the space ends: a phone cut). A tight variant has 1 px more (its body starts 1 px
 * higher). `subFits` says whether a variant's header sub line fits the header (else that variant is skipped).
 */
export function planBody(body: readonly Block[], variants: readonly Variant[] | undefined, width: number, avail: number,
  subFits: (s: string) => boolean = () => true, keepBig = false): BodyPlan {
  const finish = (font: FontId, chosen: Laid[], fits: boolean, variant: number, from: readonly Laid[], v?: Variant): BodyPlan => {
    const lines: (PLine | "rule")[] = [];
    let big = false, ruled = false;
    for (const l of chosen) {
      const small = ROLE[l.b.role].small;
      if (small && big && !ruled) {
        lines.push("rule");
        ruled = true;
      }
      if (!small) big = true;
      lines.push(...l.lines);
    }
    return {
      font, shown: chosen, lines, height: heightOf(chosen), fits, variant, tight: !!v?.tight,
      ...(v?.sub ? { sub: v.sub, subColor: v.subColor } : {}),
      dropped: from.filter((l) => !chosen.includes(l)).map((l) => l.b),
    };
  };
  const big = lay(body, width, "5");
  if (heightOf(big) <= avail) return finish("5", big, true, 0, big);
  // 0.6.2t: the desk column (keepBig) keeps the readable 5x7 face while its kept blocks fit it: the optional blocks
  // give way first, each whole or not at all, least important first (the flavour, then the hint, then the ability's
  // later sentences); only then does the text drop to the 3x5 face
  const texts: Variant[] = [{ body: [...body] }, ...(variants ?? [])];
  if (keepBig) {
    for (let v = 0; v < texts.length; v++) {
      const t = texts[v];
      if (t.tight || (t.sub && !subFits(t.sub))) continue; // the tight pitch is the 3x5 face's
      const all = v === 0 ? big : lay(t.body, width, "5");
      const pick = choose(all, avail, width, "5");
      if (pick.fits) return finish("5", pick.chosen, true, v, all, t);
    }
  }
  let last: BodyPlan | null = null;
  for (let v = 0; v < texts.length; v++) {
    const t = texts[v];
    if (t.sub && !subFits(t.sub)) continue;
    const room = avail + (t.tight ? 1 : 0);
    const all = lay(t.body, width, "3", !!t.tight);
    const { chosen, fits } = choose(all, room, width, "3", !!t.tight);
    last = finish("3", chosen, fits, v, all, t);
    if (fits) return last;
  }
  return last!;
}

// ------------------------------------------------------------------------------------------- the panel's geometry

/** 0.6.2: a panel's title (the 5x7 face, outlined) or sub line (3x5) within `max` px: a title that doesn't fit
 *  steps down to the 3x5 face, and whatever still doesn't fit is cut short with a dot. */
function fitHead(g: G, s: string, x: number, y: number, max: number, color: string, title: boolean): void {
  if (title && textWidth(s) <= max) {
    drawText(g, s, x, y, color, { outline: C.ink });
    return;
  }
  let t = s;
  while (t.length > 1 && textWidth(t, "3") > max) t = `${t.slice(0, -2).trimEnd()}.`;
  drawText(g, t, x, title ? y + 1 : y, color, title ? { font: "3", outline: C.ink } : { font: "3" });
}

/**
 * 0.6.1r F7 (review-061; the Prime's layout call): in portrait the 1-2 action buttons never cover the panel's
 * title or sub-line. They keep the top-right row when it can hold them right of both texts (at the old even width,
 * else each sized to its label); otherwise they take one row directly under the sub-line (and the icon box), and
 * the body text moves down by that row (`shift`). Returns one rect per label, in action order (the last action
 * sits at the right edge, as before). Exported for tests.
 */
export function portraitButtons(title: string, sub: string, labels: string[], r: Rect): { rects: Rect[]; shift: number } {
  const n = labels.length, gap = 3, h = 13;
  const clear = r.x + 23 + Math.max(textWidth(title) + 2, textWidth(sub, "3")) + 3; // the title's outline, then a gap
  const even = Math.min(64, Math.floor((r.w - 10 - gap * (n - 1)) / n));
  const sized = labels.map((l) => Math.min(even, Math.max(24, textWidth(l, "3") + 10)));
  const place = (ws: number[], right: number, y: number): Rect[] => {
    const out: Rect[] = [];
    let x = right;
    for (let i = ws.length - 1; i >= 0; i--) {
      x -= ws[i];
      out[i] = { x, y, w: ws[i], h };
      x -= gap;
    }
    return out;
  };
  for (const ws of [labels.map(() => even), sized]) {
    const rects = place(ws, r.x + r.w - 4, r.y + 4);
    if (rects[0].x >= clear) return { rects, shift: 0 };
  }
  // the row: y+21..y+33, 1 px under the icon box (y+4..y+19) and 3 px under the sub-line (y+13..y+17). The body
  // text, which began at y+25, starts 3 px under the row (y+37): a 12 px shift keeps 4 lines of the 3x5 face in
  // the 69 px phone band (the turret case's CORE and GEAR lines both still show).
  const w = Math.floor((r.w - 10 - gap * (n - 1)) / n);
  return { rects: place(labels.map(() => w), r.x + r.w - 5, r.y + 21), shift: 12 };
}

/** beltside-062: the least portrait panel height that holds portraitButtons' row (y+21..y+33) inside its frame. */
const PORT_ROW_MIN_H = 36;

/**
 * beltside-062: BELTSIDE's portrait top row, for a strip too short for portraitButtons' second row (the header-only
 * 360x640 portrait): 1-2 buttons at the top right, one at the even width, two each sized to its label; the title and
 * the header text are cut short left of them (drawDetails, fitHead).
 */
function topRowButtons(labels: string[], r: Rect): Rect[] {
  const n = labels.length, gap = 3, h = 13;
  const even = Math.min(64, Math.floor((r.w - 10 - gap * (n - 1)) / n));
  const out: Rect[] = [];
  let x = r.x + r.w - 4;
  for (let i = n - 1; i >= 0; i--) {
    const w = n > 1 ? Math.min(even, Math.max(34, textWidth(labels[i], "3") + 10)) : even;
    x -= w;
    out[i] = { x, y: r.y + 4, w, h };
    x -= gap;
  }
  return out;
}

/** The whole panel's plan: its rect, the buttons' rects, the header and the body plan. Pure (drawDetails, tests). */
export interface PanelPlan {
  r: Rect;
  column: boolean;
  /** The portrait buttons' rects (null in the column: its buttons stack under the text). */
  rects: Rect[] | null;
  shift: number;
  subs: string[];
  subMax: number;
  body: BodyPlan;
  /** The body's top y and the last y a glyph may reach. */
  y: number;
  maxY: number;
  /** A header-only strip (no body line fits): the header text drawn in place of the sub line, on 1-2 lines. */
  headerOnly: { lines: string[]; colour: string } | null;
}

/** Lay out a panel in `area` (the landscape column when area.h >= 70, else the portrait band). */
export function planPanel(sp: PanelText, area: Rect): PanelPlan {
  const column = area.h >= 70; // landscape column: size to content, the buttons under the text
  const labels = sp.labels;
  const wrapW = area.w - 10;
  let port = !column && labels.length ? portraitButtons(sp.title, sp.sub, labels, area) : null;
  if (port?.shift && sp.subShort) {
    const short = portraitButtons(sp.title, sp.subShort, labels, area);
    if (!short.shift) port = short;
  }
  if (port?.shift && area.h < PORT_ROW_MIN_H) port = { rects: topRowButtons(labels, area), shift: 0 };
  // 0.6.1r (item 11): a sub-line wider than the desk column breaks after its last " · " onto a second line; 0.6.2rel:
  // or after its last full stop (a joining belt's "JOINS BELT 1. FEEDS TURRET 1.")
  const cut = sp.sub.lastIndexOf(" · "), stop = sp.sub.lastIndexOf(". ");
  const subs = column && (cut > 0 || stop > 0) && textWidth(sp.sub, "3") > area.w - 27
    ? cut > 0 ? [sp.sub.slice(0, cut + 2), sp.sub.slice(cut + 3)] : [sp.sub.slice(0, stop + 1), sp.sub.slice(stop + 2)]
    : [sp.sub];
  const shift = (port?.shift ?? 0) + (subs.length > 1 ? 4 : 0);
  const extra = labels.length ? labels.length * 19 + 3 : 4;
  const headRight = !column && port && !port.shift ? port.rects[0].x - 3 : area.x + area.w - 4;
  const subMax = headRight - (area.x + 23);
  // the body starts at y + 25 + shift (a tight variant's 1 px higher). The column grows to its text (27 + shift + body +
  // extra, as 0.6.1r sized it); the band's text ends 4 px above its bottom edge. A variant's sub line must fit the header
  const body = planBody(sp.body, sp.variants, wrapW, column ? area.h - 27 - shift - extra : area.h - 27 - shift,
    (s) => subs.length === 1 && textWidth(s, "3") <= subMax, column);
  const r = column ? { ...area, h: Math.min(area.h, 27 + shift + body.height + extra) } : area;
  const y = r.y + 25 + shift - (body.tight ? 1 : 0);
  const maxY = column && labels.length ? r.y + r.h - 5 - labels.length * 19 : r.y + r.h - 4;
  // no body line fits (the header-only 360x640 strip): its header text instead of the sub line, on up to two lines
  const headerOnly = !column && r.y + 25 + shift + 5 > maxY && sp.headerOnly
    ? { lines: headerLines(sp.headerOnly.texts, subMax, r.w - 27), colour: sp.headerOnly.colour } : null;
  return { r, column, rects: port?.rects ?? null, shift, subs: body.sub ? [body.sub] : subs, subMax, body, y, maxY, headerOnly };
}

/** A header-only strip's text: the first of `texts` that fits one line of `first` px, else the fullest that fits two
 *  (the first line beside the buttons, the second under them), else the last on two lines, the second cut. */
export function headerLines(texts: readonly string[], first: number, second: number): string[] {
  for (const t of texts) if (textWidth(t, "3") <= first) return [t];
  for (const t of texts) {
    const a = wrapRich([{ t, c: C.bone }], first, "3").map(lineText);
    const rest = wrapRich([{ t: a.slice(1).join(" "), c: C.bone }], second, "3").map(lineText);
    if (a.length > 1 && rest.length === 1 && textWidth(a[0], "3") <= first) return [a[0], rest[0]];
  }
  const t = texts[texts.length - 1], a = wrapRich([{ t, c: C.bone }], first, "3").map(lineText);
  return [a[0], ...(a.length > 1 ? [a.slice(1).join(" ")] : [])];
}

// -------------------------------------------------------------------------------------------------------- drawing

interface Action {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onTap: () => void;
}

interface Spec {
  icon: HTMLCanvasElement | null;
  text: PanelText;
  actions: Action[];
}

function spec(ctx: Ctx, show: Sel, hovering: boolean): Spec | null {
  const { run } = ctx;
  const b = run.build;
  const tp = turretSpec(ctx, show, hovering); // 0.6.2s (REQ-BFG-031 S10): turret cards and empty turret slots
  if (tp !== undefined) return tp;
  switch (show.kind) {
    case "offer": {
      const t = offerPanel(run, show.wagon, show.slot);
      const o = run.shop.wagons[show.wagon]?.offers[show.slot];
      if (!t || !o) return null;
      const can = !o.sold && run.gold >= o.price;
      return {
        icon: itemIcon(o.def), text: t,
        actions: hovering ? [] : [{
          id: "buy", label: t.labels[0], primary: can, disabled: !can,
          onTap: () => {
            const res = buy(ctx, show.wagon, show.slot);
            if (res.gain) selectGain(ctx, res.gain); // 0.6.1a: after a merge, the survivor
          },
        }],
      };
    }
    case "cargo": {
      const t = cargoPanel(run, show.uid);
      const it = run.inventory.find((i) => i.uid === show.uid);
      if (!t || !it) return null;
      return { icon: itemIcon(it.def), text: t, actions: [{ id: "sell", label: t.labels[0], onTap: () => sell(ctx, it.uid) }] };
    }
    case "item": {
      const p = itemByUid(b, show.uid);
      const t = p ? itemPanel(run, p.uid) : null;
      if (!p || !t) return null;
      const d = defOf(p);
      const actions: Action[] = d.kind === "gate"
        ? [
          ...((t as RigPanel).x ? [] : [{ id: "rotate", label: "ROTATE", onTap: () => rotate(ctx, p.uid) }]),
          { id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) },
        ]
        : t.labels.length ? [{ id: "store", label: "TO CARGO", onTap: () => store(ctx, p.uid) }] : [];
      return { icon: itemIcon(d.id), text: t, actions };
    }
    case "route": {
      const t = routePanel(run, show.index);
      if (!t) return null;
      return { icon: beltIcon(), text: t, actions: [{ id: "rmroute", label: "REMOVE BELT", danger: true, onTap: () => deleteRoute(ctx, show.index) }] };
    }
    case "turret": {
      const td = turretSlots(b)[show.index]?.td; // 0.6.2s: the installed turret (an empty slot has none)
      const t = turretPanel(run, show.index);
      if (!td || !t) return null;
      const gm = gearFor(b, show.index); // 0.6.1b: gear only; the core has its own socket (coreFor via resolveCore)
      const tc = resolveCore(b, show.index, td);
      const actions: Action[] = [];
      if (tc.bought) actions.push({ id: "unfitcore", label: "REMOVE CORE", onTap: () => unfitCore(ctx, show.index) });
      if (gm) actions.push({ id: "unfit", label: "REMOVE GEAR", onTap: () => unfitMod(ctx, show.index) });
      // 0.6.2s (S10): the installed turret's icon; TO CARGO and SELL after the socket buttons
      return { icon: slotIcon(b, show.index), text: t, actions: [...actions, ...slotActions(ctx, show.index)] };
    }
    default:
      return null;
  }
}

/** True when a hovered card or a selection has details to show (otherwise the idle cards). */
export function hasDetails(ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null): boolean {
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  return spec(ctx, show, !!hover) !== null;
}

/** Draw a body line at (x, y): a stat label and its value, a grid row, or rich spans. */
function drawLine(g: G, l: PLine, x: number, y: number): void {
  if (l.cells) {
    for (const c of l.cells) {
      drawText(g, c.label, x + c.at, y, LABEL, { font: l.font });
      drawRich(g, c.spans, x + c.vx, y, l.font);
    }
    return;
  }
  if (l.label) drawText(g, l.label, x, y, LABEL, { font: l.font });
  drawRich(g, l.spans, x + (l.indent ?? 0), y, l.font);
}

export function drawDetails(g: G, ctx: Ctx, sel: Sel, hover: { wagon: number; slot: number } | null, area: Rect, foe: DuskFoe): void {
  if (area.h < 14) return;
  const show: Sel = hover ? { kind: "offer", wagon: hover.wagon, slot: hover.slot } : sel;
  const sp = spec(ctx, show, !!hover);
  const column = area.h >= 70;
  if (!sp) return drawIdle(g, ctx.run, area, column, foe);
  const t: PanelText = { ...sp.text, labels: sp.actions.map((a) => a.label) };
  const plan = planPanel(t, area);
  const r = plan.r;
  panel(g, r, "dark");
  ctx.game.ui.add({ id: "details", r, block: true });
  rect(g, r.x + 4, r.y + 4, 16, 16, C.ink);
  rect(g, r.x + 5, r.y + 5, 14, 14, C.slate0);
  if (sp.icon) g.drawImage(sp.icon, r.x + 12 - Math.floor(sp.icon.width / 2), r.y + 12 - Math.floor(sp.icon.height / 2));
  const acts = sp.actions;
  if (acts.length && plan.column) {
    // landscape column: one full-width button per action, stacked bottom-up under the text
    let by = r.y + r.h - 5;
    for (let i = acts.length - 1; i >= 0; i--) {
      by -= 16;
      const a = acts[i];
      button(ctx.game.ui, g, a.id, { x: r.x + 5, y: by, w: r.w - 10, h: 16 }, a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap });
      by -= 3;
    }
  } else if (plan.rects) {
    acts.forEach((a, i) => button(ctx.game.ui, g, a.id, plan.rects![i], a.label, { font: "3", primary: a.primary, danger: a.danger, disabled: a.disabled, onTap: a.onTap }));
  }
  fitHead(g, t.title, r.x + 23, r.y + 4, plan.subMax, t.color, true);
  const subColor = t.subColor ?? C.slate4;
  if (plan.headerOnly) {
    // the header-only strip (360x640): the header text in place of the sub line (a belt's readout; an offer's effect)
    plan.headerOnly.lines.forEach((ln, i) => {
      const max = i === 0 ? plan.subMax : r.w - 27;
      if (textWidth(ln, "3") <= max) drawRich(g, colourize(ln, plan.headerOnly!.colour), r.x + 23, r.y + 13 + i * 6, "3");
      else fitHead(g, ln, r.x + 23, r.y + 13 + i * 6, max, plan.headerOnly!.colour, false);
    });
  } else if (plan.body.sub) {
    // T6: a compact variant's own sub line (a rig's hits, or its IDLE warning in amber)
    fitHead(g, plan.body.sub, r.x + 23, r.y + 13, plan.subMax, plan.body.subColor ?? subColor, false);
  } else if (plan.subs.length > 1) {
    plan.subs.forEach((s, i) => fitHead(g, s, r.x + 23, r.y + 13 + i * 6, plan.subMax, subColor, false));
  } else {
    fitHead(g, t.subShort && textWidth(t.sub, "3") > plan.subMax ? t.subShort : t.sub, r.x + 23, r.y + 13, plan.subMax, subColor, false);
  }
  for (const v of visibleLines(plan)) {
    if (v.line === "rule") rect(g, r.x + 5, v.y + 1, r.w - 10, 1, C.slate1);
    else drawLine(g, v.line, r.x + 5, v.y);
  }
}

/** The body lines drawDetails draws and their y: every line whose glyphs end by the panel's last y (a line past it is a
 *  phone cut, which planBody avoids; the tests check that every kept line is here). Exported for tests. */
export function visibleLines(plan: PanelPlan): { line: PLine | "rule"; y: number }[] {
  const out: { line: PLine | "rule"; y: number }[] = [];
  let y = plan.y;
  for (const l of plan.body.lines) {
    if (l === "rule") {
      if (y + 1 <= plan.maxY) out.push({ line: l, y });
      y += DIVIDER;
      continue;
    }
    if (y + (l.font === "5" ? 7 : 5) > plan.maxY) break;
    out.push({ line: l, y });
    y += l.pitch;
  }
  return out;
}

function drawIdle(g: G, run: Run, area: Rect, column: boolean, foe: DuskFoe): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  if (!column && area.h < 30) {
    panel(g, area, "dark");
    drawText(g, "NEXT", area.x + 5, area.y + 5, C.slate4, { font: "3" });
    drawText(g, foe.name, area.x + 24, area.y + 4, C.red, { outline: C.ink });
    drawText(g, `${foeClass(foe)} · BELT ${used}/${cap} · W-L ${record(run)}`, area.x + 5, area.y + 14, C.bone, { font: "3" });
    return;
  }
  if (!column) return drawHeroStrip(g, run, area);
  // landscape column: the stats in the 5x7 face when they fit (RUN split into RUN and LIVES)
  const big: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${intakeCount(b)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)}`, C.white],
    ["LIVES", `${run.lives}/${START_LIVES}`, C.white],
  ];
  const kw = textWidth("FEEDS") + 6;
  if (big.every(([, v]) => 10 + kw + textWidth(v) <= area.w) && 31 + big.length * 10 <= area.h) {
    const r = { ...area, h: 31 + big.length * 10 };
    panel(g, r, "dark");
    drawText(g, h.name, r.x + 5, r.y + 5, C.white, { outline: C.ink });
    drawText(g, h.factionName, r.x + r.w - 5, r.y + 6, C.slate4, { font: "3", align: "right" });
    drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, r.y + 16, C.yellow, { font: "3" });
    let y = r.y + 27;
    for (const [k, v, c] of big) {
      drawText(g, k, r.x + 5, y, C.slate4);
      drawText(g, v, r.x + 5 + kw, y, c);
      y += 10;
    }
    return;
  }
  const rows: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap} TILES`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${connectedRouteCount(b)}/${intakeCount(b)} INTAKES`, connectedRouteCount(b) ? C.lime : C.red],
    ["RUN", `W-L ${record(run)} · ${run.lives}/${START_LIVES} LIVES`, C.white],
  ];
  const r = column ? { ...area, h: Math.min(area.h, 29 + rows.length * 8) } : area;
  panel(g, r, "dark");
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, y, C.yellow, { font: "3" });
  y += 9;
  for (const [k, v, c] of rows) {
    if (y + 7 > r.y + r.h - 2) break;
    drawText(g, k, r.x + 5, y, C.slate4, { font: "3" });
    drawText(g, v, r.x + 34, y, c, { font: "3" });
    y += 8;
  }
}

/** Portrait hero card (strip): name and faction, playstyle, then HULL · BELT · FEEDS and RUN rows. */
function drawHeroStrip(g: G, run: Run, r: Rect): void {
  const h = HEROES[run.hero];
  const b = run.build;
  const used = beltUsed(b), cap = b.beltCap;
  const feeds = connectedRouteCount(b), intakes = intakeCount(b);
  panel(g, r, "dark");
  let y = r.y + 5;
  drawText(g, h.name, r.x + 5, y, C.white, { outline: C.ink });
  drawText(g, h.factionName, r.x + r.w - 5, y + 1, C.slate4, { font: "3", align: "right" });
  y += 11;
  drawText(g, `PLAYSTYLE: ${h.pattern}`, r.x + 5, y, C.yellow, { font: "3" });
  y += 9;
  const stats: [string, string, string][] = [
    ["HULL", String(h.hull + b.hullBonus), C.white],
    ["BELT", `${used}/${cap}`, used >= cap ? C.amber : C.white],
    ["FEEDS", `${feeds}/${intakes}`, feeds ? C.lime : C.red],
  ];
  let x = r.x + 5;
  for (const [k, v, c] of stats) {
    x += drawText(g, k, x, y, C.slate4, { font: "3" }) + 3;
    x += drawText(g, v, x, y, c, { font: "3" }) + 8;
  }
  y += 8;
  if (y + 5 <= r.y + r.h - 3) {
    const x2 = r.x + 5 + drawText(g, "RUN", r.x + 5, y, C.slate4, { font: "3" }) + 3;
    drawText(g, `W-L ${record(run)} · ${run.lives}/${START_LIVES} LIVES`, x2, y, C.white, { font: "3" });
  }
}

/** The opponent's hero and hull (a ghost's hull includes its own plating). */
function foeClass(foe: DuskFoe): string {
  const h = HEROES[foe.hero];
  return `${h.name} · HULL ${h.hull + foe.build.hullBonus}`;
}

/** Next-battle card (tonight's dusk opponent): beside FIGHT in landscape (3 rows); a 2-row strip
 *  in portrait. A pool ghost reads "GHOST · <HERO> · <W>-<L>", a stand-in its warlord name. */
export function drawFoe(g: G, foe: DuskFoe, r: Rect): void {
  panel(g, r, "dark");
  const head = foe.kind === "ghost" ? "NEXT BATTLE · DUSK GHOST" : "NEXT BATTLE · DUSK";
  // 0.6.0b: a stand-in is a rival captain: its portrait, its name and a STAND-IN tag
  const rival = foe.kind === "standin" ? foe.rival : undefined;
  const ps = r.h >= 32 ? 24 : 16;
  if (rival) drawPortrait(g, rival, r.x + 5, r.y + Math.round((r.h - ps) / 2), ps);
  const x0 = rival ? r.x + 5 + ps + 5 : r.x + 5;
  drawText(g, r.h < 32 ? "NEXT BATTLE" : head, x0, r.y + 5, C.slate4, { font: "3" });
  if (r.h < 32) {
    drawText(g, foeClass(foe), r.x + r.w - 5, r.y + 5, C.bone, { font: "3", align: "right" });
    const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
    if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
    return;
  }
  const nw = drawText(g, foe.name, x0, r.y + 13, C.red, { outline: C.ink });
  if (rival) tag(g, "STAND-IN", x0 + nw + 4, r.y + 14, C.slate3);
  drawText(g, foeClass(foe), x0, r.y + 24, C.bone, { font: "3" });
}
