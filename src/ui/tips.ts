// EXPLAIN-1 (REQ-BFG-089, E5; the operator, 2026-10-10: "any of the default rules text should be hidden without the
// hover"): THE FIRST-RUN TIPS. A panel's grey how-to hint (inspector.ts hintBlock: how to place, fit, install, turn, move,
// lay belt, read a turret's parts, swap a turret; what a supply does) is a tip: it shows on the face, where and as it
// always did, until the player has done its action once on this device; after that it never draws on the face, and it
// stays in the panel's ⓘ NOTES (inspector.ts explainPanel). A hint that teaches two actions (turn and move) shows until
// both are done.
// - THE TABLE (TIPS): each tip's id, the hint texts it covers (every text a panel can draw: tests/explain1.test.ts builds
//   every panel and checks each hint it draws is here) and the action that completes it. A hint is covered by one or more
//   tips (hintTips); it shows while any of them is not done (hintShows).
// - Only a successful action counts (src/screens/build: actions.ts, turretActions.ts, edit.ts call completeTip where the
//   action has succeeded): bought (a supply), placed, fitted, installed, turned, moved, laid, cycled or swapped. A cancelled
//   drag, a refused drop or a tap that only reads calls nothing.
// - STORAGE: localStorage "beltbattles.tips", a JSON list of the done tip ids, read once (the first time a tip is asked
//   about) and written on each change; every access in try/catch, as src/audio/audio.ts does for "beltbattles.sound". With
//   no storage, a bad value or a call that throws, every tip shows.
// - setTipsForTests (tooling and tests, as src/tooling.ts's helpers): start with every tip new or every tip done; main.ts
//   exposes it as bb.tips(). Pure but for the one module state and the store.

/** The tips, one per action a hint teaches. */
export type TipId = "place" | "fit" | "install" | "turn" | "move" | "supply" | "lay" | "cycle" | "swap";

/** One row of the table: the tip, the hint texts it covers, and the action that completes it (in words). */
export interface Tip {
  id: TipId;
  hints: readonly string[];
  action: string;
}

/** The installed turret's move hint (turretPanel.ts SLOT_HINT), and its touch form's lead (touchSlotHint). */
const SLOT = "HOLD IT, OR DRAG IT WITH NO GEAR ON, TO MOVE OR SWAP IT.";
const readParts = (what: string): string => `TAP IT AGAIN TO READ ${what}. ${SLOT}`;
/** The rig's turn hints (inspector.ts rigPanel, stokerPanel; TOUCH_TURN on touch). */
const TURN = ["TAP TO TURN (OR R). DRAG TO MOVE.", "TAP IT AGAIN TO TURN IT. DRAG TO MOVE."];
/** A part's place hints (inspector.ts placeHint), on the deck and beside a belt or a factory (a rig, a STOKER). */
const PLACE = [
  "TAP THE DECK TO PLACE IT, OR DRAG IT THERE.", "TAP THE DECK TO PLACE IT.", "DRAG IT ONTO THE DECK TO PLACE IT.",
  "TAP A CELL BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT, OR DRAG IT THERE.",
  "TAP A CELL BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT.",
  "DRAG IT BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT.",
  "TAP A CELL BESIDE A FACTORY: ITS ARROWS WORK THE FACTORIES THEY POINT AT, OR DRAG IT THERE.",
  "TAP A CELL BESIDE A FACTORY: ITS ARROWS WORK THE FACTORIES THEY POINT AT.",
  "DRAG IT BESIDE A FACTORY: ITS ARROWS WORK THE FACTORIES THEY POINT AT.",
];

/** THE TABLE (E5): every hint text a panel draws, by the tip(s) that cover it. */
export const TIPS: readonly Tip[] = [
  { id: "place", hints: PLACE, action: "a part placed on the deck (bought onto it, or from cargo)" },
  {
    id: "fit", hints: ["TAP A TURRET TO FIT IT, OR DRAG IT THERE.", "TAP A TURRET TO FIT IT.", "DRAG IT ONTO A TURRET TO FIT IT."],
    action: "a core or a piece of gear fitted to a turret",
  },
  {
    id: "install",
    hints: [
      "DRAG IT ONTO A TURRET SLOT TO INSTALL IT, OR ONTO CARGO.", "DRAG IT ONTO A TURRET SLOT TO INSTALL IT.",
      "DRAG IT ONTO A TURRET SLOT, OR TAP A SLOT, TO INSTALL IT.", "DRAG A TURRET HERE FROM CARGO OR THE SHOP.",
    ],
    action: "a turret installed in a turret slot",
  },
  { id: "turn", hints: TURN, action: "a placed rig turned" },
  { id: "move", hints: [...TURN, "FACES EVERY SIDE. DRAG TO MOVE."], action: "a placed part moved on the deck" },
  { id: "supply", hints: ["USED THE MOMENT YOU BUY IT."], action: "a supply bought" },
  { id: "lay", hints: ["DRAG OUT OF IT TO LAY BELT."], action: "a belt laid" },
  {
    id: "cycle",
    hints: ["TAP THE TURRET AGAIN FOR ITS NEXT PART.", readParts("ITS CORE AND GEAR"), readParts("ITS CORE"), readParts("ITS GEAR")],
    action: "a tap on the selected turret that steps to its next fitted part",
  },
  {
    id: "swap", hints: [SLOT, readParts("ITS CORE AND GEAR"), readParts("ITS CORE"), readParts("ITS GEAR")],
    action: "an installed turret moved or swapped to another slot",
  },
];

/** The store's key. */
export const TIPS_KEY = "beltbattles.tips";

const IDS: readonly TipId[] = TIPS.map((t) => t.id);
const isTipId = (v: unknown): v is TipId => typeof v === "string" && (IDS as readonly string[]).includes(v);

/**
 * CARD-2 (REQ-BFG-004, REQ-BFG-081; K1): THE FIRST-SIGHT NOTES share this store. Each effect keyword's definition opens
 * once by itself the first time a face shows it, and the rig sentence on the first rig (src/ui/firstSight.ts). A note is
 * done once its box has been on screen; its id ("kw:PAIR", "rig") then joins the stored list with the tips' ids. The ids
 * live here, with the store (tips.ts imports nothing), so a stored note is never read as an unknown id.
 * With no storage the done set lives in memory for the session, as the tips' does, so a note shows once a session and
 * never on every open.
 */
export type SightId = string;
/**
 * CARD-2 (K1): THE EFFECT KEYWORDS, every word whose tap shows a keyword definition (glossary.ts rows, faces.ts REMINDER)
 * other than the basic stats: the 9 face keywords (font.ts KEYWORDS), RIDE (a rune keyword), the 4 trigger labels, the 3
 * tap-note words (glossary.ts TAP_NOTES: SPOTTER's AIM, STOKER's FASTER, EXT. CHAMBER's UP TO) and the kept texts' glossary
 * words. Not: the basic stats (RATE, DMG, SLUG, GEAR, BELT, and the rune keywords HULL and GOLD, plain words everywhere
 * else), which K4 labels on turrets, nor the family tags. Each is a row's word (glossary.ts glossaryEntry(..).word).
 */
export const FIRST_SIGHT_WORDS: readonly string[] = [
  "PAIR", "FRAY", "PLATE", "SHIELD", "BURN", "STUN", "HEAT", "HEAL", "REGEN", "RIDE",
  "HIT", "SHOT", "LOAD", "EVERY",
  "AIM", "FASTER", "UP TO",
  "PART", "SPEED", "JAM", "MATCHED", "LOCKED", "COPIES", "BONUS DAMAGE", "DARK WIND",
];
/** The rig sentence's note (the first rig panel). */
export const RIG_SIGHT: SightId = "rig";
/** A keyword's note id. */
export const kwSight = (word: string): SightId => `kw:${word}`;
/** Every first-sight id this build knows: the rig sentence's, then each word's. */
export const FIRST_SIGHT_IDS: readonly SightId[] = [RIG_SIGHT, ...FIRST_SIGHT_WORDS.map(kwSight)];
const SIGHT_IDS = FIRST_SIGHT_IDS;
const isSightId = (v: unknown): v is SightId => typeof v === "string" && SIGHT_IDS.includes(v);

/** The done tips: null until read (the first ask reads the store once). */
let done: Set<TipId> | null = null;
/** CARD-2 (K1): the done first-sight notes, read with the tips (one store). */
let seen: Set<SightId> = new Set();

/** The store as this device has it: the done tips, or none (no storage, a bad value, a throw: every tip shows). CARD-2:
 *  the done first-sight notes too (into `sights`). */
function read(sights: Set<SightId>): Set<TipId> {
  const out = new Set<TipId>();
  try {
    const raw = localStorage.getItem(TIPS_KEY);
    if (!raw) return out;
    const v: unknown = JSON.parse(raw);
    // a bad value (not a list of strings) shows every tip; an id this build doesn't know is skipped (a later build's)
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return new Set();
    for (const x of v) {
      if (isTipId(x)) out.add(x);
      else if (isSightId(x)) sights.add(x);
    }
  } catch {
    sights.clear();
    return new Set();
  }
  return out;
}

function state(): Set<TipId> {
  if (!done) {
    seen = new Set();
    done = read(seen);
  }
  return done;
}

function write(): void {
  try {
    localStorage.setItem(TIPS_KEY, JSON.stringify([...state(), ...seen]));
  } catch { /* ignore: the tips stay done for this session */ }
}

/** CARD-2 (K1): whether a first-sight note has been on screen on this device (or, with no storage, this session). */
export function sightDone(id: SightId): boolean {
  state();
  return seen.has(id);
}

/** CARD-2 (K1): a first-sight note's box has been on screen: done, for good (written to the store on the change). */
export function completeSight(id: SightId): void {
  state();
  if (seen.has(id)) return;
  seen.add(id);
  write();
}

/** CARD-2 (K1): the done first-sight notes, in FIRST_SIGHT_IDS order (tooling, tests). */
export const sightsDone = (): SightId[] => {
  state();
  return SIGHT_IDS.filter((id) => seen.has(id));
};

/** The tips that cover a hint text ([] for a text that is no hint). */
export function hintTips(text: string): TipId[] {
  return TIPS.filter((t) => t.hints.includes(text)).map((t) => t.id);
}

/** Whether a tip's action has been done on this device. */
export const tipDone = (id: TipId): boolean => state().has(id);

/** Whether a hint still shows on the face: while any tip that covers it is not done (a text no tip covers always shows). */
export function hintShows(text: string): boolean {
  const ids = hintTips(text);
  return !ids.length || ids.some((id) => !tipDone(id));
}

/** A successful action: its tip is done, for good (written to the store on the change). */
export function completeTip(id: TipId): void {
  const s = state();
  if (s.has(id)) return;
  s.add(id);
  write();
}

/** The done tips, in table order (tooling, tests). */
export const tipsDone = (): TipId[] => IDS.filter((id) => state().has(id));

/**
 * The test hook (tooling: bb.tips; tests): "new", every tip new (the store cleared); "done", every tip done (the store
 * written); "reload", forget what was read, so the next ask reads the store again (a page reload). Returns the done tips.
 * CARD-2 (K1): "new" and "done" cover the first-sight notes too (every note new, or every note done), so every capture
 * can start with all new or all done; "sight", every tip done and every first-sight note new (a panel that shows a how-to
 * tip shows no first-sight box, so a capture of the first-sight boxes starts here).
 */
export function setTipsForTests(mode: "new" | "done" | "reload" | "sight"): TipId[] {
  if (mode === "reload") {
    done = null;
    return tipsDone();
  }
  done = new Set(mode === "done" || mode === "sight" ? IDS : []);
  seen = new Set(mode === "done" ? SIGHT_IDS : []);
  try {
    if (mode !== "new") localStorage.setItem(TIPS_KEY, JSON.stringify([...done, ...seen]));
    else localStorage.removeItem(TIPS_KEY);
  } catch { /* ignore */ }
  return tipsDone();
}
