// Title: a live AI-vs-AI battle rolls behind the logo (attract mode) in the same framing
// as the real fight, with New Run, Continue, a how-to-play card and the options menu.
// intro (REQ-BFG-038): the title frames itself (titleLayout.ts): its own integer scale, so the two cruisers keep an
// open floor of 17-20% of the firing axis between them on a portrait phone too, clear of the logo and the panel.
// MOTION-2 (REQ-BFG-071, REVIEW-MOTION1 Q5): the attract fight sails in motion, as a battle does, over the three seas
// in turn (CALM SEA, STORM, EMBER SEA, one per round).

import { CustomizeScreen } from "./customize"; // CUSTOM-2a (REQ-BFG-072): the styles screen
import { loadProfile, unseen } from "../game/profile"; // CUSTOM-2a: the CUSTOMIZE button's NEW dot
import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { asideBox, loadRunGuarded as loadRun, saveProblem } from "../game/saveGuard"; // BUMP-1E P6 E.2: a save naming a part, rune or hero this build does not know is no CONTINUE (loadRun, guarded)
import { REFUND_DAY } from "../game/day"; // 0.6.2 TUNE-M: RULE EARLY-LOSS REFUND in the rules card
import { startingBuild, warlordBuild } from "../sim/ai";
import { HEROES, RULES_VERSION, type HeroId } from "../sim/content";
import { WIN_GOAL, longRun, longRunRules } from "../sim/longRun"; // RUN-1 (REQ-BFG-059, D7): the rules card and the continue card of a long run
import { ENDLESS_LIVES, endlessOffered, inEndless, type EndlessRun } from "../sim/endless"; // ENDLESS-1 (REQ-BFG-059, 3.5): an endless save's continue card; BUMP-1E P6: the rules card's endless sentence
import { endlessFor } from "../net/rulesGate"; // BUMP-1E P6 (R3.5): the rules card's endless sentence follows endlessFor, as day.ts takes it for a new run
import { endlessContinueSub, wonContinueSub } from "./endlessText";
import { SummaryScreen } from "./summary"; // ENDLESS-1 (3.2): CONTINUE on a won run whose offer was open opens its RUN WON card again
import { dayText } from "./runDay";
import { JOIN_OVER_LIMIT, JOIN_PACE_PCT } from "../sim/deck"; // 0.6.2 TUNE-M: RULE JOIN PACE and RULE JOIN LIMIT in the rules card
import { freeJoinsRules } from "../sim/freeJoins"; // JOINS-1 (REQ-BFG-091): neither rule in the card with FREE_JOINS on
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, icons, textWidth } from "../render/font";
import { titleArt } from "../render/sprites";
import { defaultScale } from "../core/io";
import { button, panel, para } from "../ui/ui";
import { optionsCard } from "../ui/hud";
import { helpCard, titleLayout, titleScale, type TitleLayout } from "./titleLayout";
import { HeroScreen } from "./hero";
import { BuildScreen } from "./build/build";
import { EventScreen } from "./event/event";
import { ForkScreen } from "./fork/fork";
import { BattleScreen } from "./battle";
import { VERSION } from "../version";
import { MOTION } from "../render/motion"; // MOTION-2 (REQ-BFG-071): the attract fight in motion
import { attractScene } from "../render/scenery"; // FIELD-1 (REQ-BFG-075): the attract fight's settings, round by round
import { ArenaMotion } from "../game/arenaMotion";
import { minGap } from "../game/battleLayout";
import { settings } from "../core/settings";
import { currentName } from "../game/ghostSnapshot"; // PACKS M2 (REQ-BFG-063): the name screen comes first
import { HEART_COST_FROM, HEART_COSTS, HEARTS_START, heartsRules } from "../sim/hearts"; // RETUNE-1 run 2: the rules card's hearts


/** JOINS-1 (REQ-BFG-091): the rules card's line 3 under the switch now. FREE_JOINS off: it states RULE JOIN LIMIT and
 *  RULE JOIN PACE, exactly as before; on, neither (a deck holds any number of legal joins, and a join never slows its
 *  factory). */
export function helpLine3(free = freeJoinsRules()): string {
  // CARD-5 (REQ-BFG-111; CARD-5 PREP's item 3, HOWTOPLAY-CARD5): the line names the kinds, each clause true in the sim
  // (Battle.stamp puts a factory's slugs on its belts; a belt's front slug enters the chamber of the turret it reaches,
  // a joining belt's its chain's; a rig works on slugs or its belt's speed; a turret fires its loads; a core and gear
  // fit its sockets), with REVIEW-CARD5PREP 5.3's clause FOR THE TURRET THEIR BELT REACHES (REPORT-CARD5 section 7).
  // The belt sentences and both FREE_JOINS forms' join clauses stay as they were. Was "3  AT DAWN, BUY RIGS FROM THE
  // CARAVAN. DRAG OUT ..."
  // SHOPCARD-1 (REQ-BFG-115, H): the shop cards show only a piece's icon and price (the words moved to the panel a tap opens
  // and the desk's hover tooltip), so the line says how to read one: TAP A CARD TO READ IT (ON A DESK, POINT AT IT)
  // SHOPCARD-1c (REQ-BFG-081, REQ-BFG-115, G1; READ-10: no line a player read said MERGE or what ★2 and ★3 are, so the shop card's
  // merge mark, an up triangle over a star and a digit, was a picture of nothing): one clause, true by src/game/fuse.ts:1-6 and 113-132
  // (gainModule/chain: two copies of one piece at the same star merge into one a star higher, 1+1 = 2, 2+2 = 3, 3 the top, as a copy
  // is gained, that is, bought) and the game's own words (BUY+MERGE, MERGES INTO ★2: inspector.ts, faces.ts faceMerge)
  const how = "3  AT DAWN, BUY FROM THE CARAVAN: FACTORIES MAKE SLUGS FOR THE TURRET THEIR BELT REACHES, RIGS CHANGE THEM ON THE BELT, TURRETS FIRE THEM, CORES AND GEAR FIT A TURRET. TAP A CARD TO READ IT (ON A DESK, POINT AT IT). BUY A COPY OF A PIECE YOU OWN TO MERGE THEM INTO ★2 (TWO ★2 MERGE INTO ★3). DRAG OUT OF YOUR FACTORY TO LAY BELT TO A TURRET INTAKE. DRAG A BELT INTO ANOTHER TO JOIN THEM";
  return free ? `${how}.` : `${how} (${JOIN_OVER_LIMIT}). A JOINED FACTORY RUNS AT ${JOIN_PACE_PCT}% PACE.`;
}

/** CARD-5 (REQ-BFG-111, REQ-BFG-089; CARD-5 PREP's item 6): the keyword line, one clause each, drawn with icons() (each
 *  keyword its icon, then its player word: {*PLATE} draws SHIELD, {*SHIELD} WARD; the icons in their own colours, as
 *  drawText tints them). Each clause is the keyword's own reminder cut short (faces.ts REMINDER); WARD's keeps the
 *  reminder's HIT'S DAMAGE, since that hit's BURN, FRAY and STUN still land (battle.ts impact; PREP's draft said BLOCKS
 *  ALL OF ONE HIT). Rules text a player opens on demand, so no card carries a definition (REQ-BFG-089). */
export const HELP_KEYWORDS = icons(
  "6  {*BURN}: HULL DAMAGE OVER TIME. {*STUN}: STOPS THE PART IT HITS FOR A WHILE. {*PLATE}: SOAKS HULL DAMAGE. {*SHIELD}: BLOCKS ALL OF ONE HIT'S DAMAGE. {*PAIR}: SLUGS FROM TWO BELTS REACH ONE TURRET AT ONCE. {*FRAY}: LATER HULL HITS DEAL MORE.",
);

/** JOINS-1: the rules card the title draws: HELP with line 3 by the switch now (HELP itself with FREE_JOINS off).
 *  RETUNE-1 run 2 (REQ-BFG-096): and line 2 the hearts rule while HEARTS is on (HELP_HEARTS_2, below HELP). HULL-ON (the
 *  merge of JOINS-1's and RETUNE-1's helpLines, one function for both lines): while neither line moves it is HELP itself,
 *  as RETUNE-1's was. */
export function helpLines(): string[] {
  // RUN-1 (REQ-BFG-059, D7): with LONG_RUN on (a new run has no mark yet, so the switch decides: a card for the run the
  // player is about to start) line 1 names the win and line 2 the hearts rule's words ending in the run's end; off, neither moves
  const long = longRunRules();
  // BUMP-1E P6 (RULING-BUMP1E-R3 R3.5; ENDLESS-1 question 2): with endless in the game (endlessFor under this build's rules, as day.ts
  // takes it for a new run) line 2 ends with HELP_ENDLESS, one sentence; it is the only line that moves, so SHOPCARD-1's lines 3-6 keep their numbers and words
  const endless = endlessFor(RULES_VERSION);
  const lines = HELP.map((ln, i) => (i === 0 && long ? HELP_LONG_1 : i === 1 && heartsRules() ? (long ? (endless ? `${HELP_LONG_2} ${HELP_ENDLESS}` : HELP_LONG_2) : HELP_HEARTS_2) : i === 2 ? helpLine3() : ln));
  return lines.every((ln, i) => ln === HELP[i]) ? HELP : lines;
}

export const HELP = [ // exported for tests/joinpace.test.ts. Line 3 is helpLine3() read at load (JOINS-1): as the game ships (FREE_JOINS on) the free line, with FREE_JOINS off 0.6.2 TUNE-M's RULE JOIN PACE and RULE JOIN LIMIT (HULL-ON, ruling 22e26ded338944ea)
  "1  SURVIVE 10 DAYS. EACH DAY IS THE CARAVAN AT DAWN, THE ROAD, THEN A DUSK FIGHT AGAINST A GHOST: ANOTHER CAPTAIN'S SAVED CRUISER.",
  // 0.6.2 TUNE-M: line 2 states RULE EARLY-LOSS REFUND (day.ts)
  `2  YOU HAVE 5 LIVES. A DUSK LOSS COSTS ONE, A DRAW NONE. LOSE ON DAY 1 OR 2 AND DAY ${REFUND_DAY}'S DAWN GIVES ONE LIFE BACK (ONCE A RUN). YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).`,
  helpLine3(), // JOINS-1 (REQ-BFG-091), by the switch at load: shipped (FREE_JOINS on) neither join rule; with FREE_JOINS off exactly as before (RULE JOIN LIMIT and RULE JOIN PACE). The title draws helpLines() (HULL-ON, ruling 22e26ded338944ea)
  // CARD-5 (REQ-BFG-111; CARD-5 PREP's item 4): STUN, the word every card and note says (SHOCK is retired: VOCAB.md; this
  // line now sits in tests/words1.text.test.ts's sweep), and REVIEW-CARD5PREP 5.3's clause in HIT's words, true of 24 of the
  // 33 rigs (every HIT rig and STATIC BRUSH; not the speed, timer and STUN-guard rigs nor STOKER: REPORT-CARD5 section 7)
  // SHOPCARD-1 (REQ-BFG-113, H): a shaped piece's card draws its footprint, a rig's arrows as green arrowheads (shapePic.ts:
  // foot.ts footOffsets at rot 0 and deck.ts rigArrowCells), so the line says what that picture is
  "4  STAND RIGS BESIDE THE BELT, ARROWS AT IT (TAP TO TURN): BURN, STUN, SPLIT, SPEED UP OR SLOW DOWN. A SHAPE ON A CARD IS THE CELLS THAT PIECE FILLS, WITH A RIG'S ARROWS IN GREEN. MOST RIGS WORK ON EACH SLUG ON A TILE THEIR ARROWS POINT AT. LONGER CINDER ROUTES COOK HOTTER SLUGS.",
  "5  ON THE ROAD, EVENTS OFFER A CHOICE (KEYS 1-3). AT DUSK YOUR CRUISER FIGHTS ON ITS OWN: 0.5X-4X, SKIP, II OR P TO PAUSE.",
  HELP_KEYWORDS, // CARD-5 (REQ-BFG-111): item 6, the keyword line
];

/** BUMP-1D P6 (RULING-BANDS1-R1 B1.5): the hearts a lost dusk costs, by day band, in words, with neighbouring bands of equal cost
 *  merged: HEART_COSTS [1, 2, 3] reads "1 ON DAYS 1-3, 2 ON DAYS 4-6 AND 3 FROM DAY 7" (the words of the RETUNE-1 card, unchanged),
 *  [1, 2, 2] reads "1 ON DAYS 1-3 AND 2 FROM DAY 4" (not "2 ON DAYS 4-6 AND 2 FROM DAY 7"). Built from the constants. */
export function heartCostWords(costs: readonly number[] = HEART_COSTS, from: readonly number[] = HEART_COST_FROM): string {
  const bands: { cost: number; from: number }[] = [];
  costs.forEach((cost, i) => {
    if (!bands.length || bands[bands.length - 1].cost !== cost) bands.push({ cost, from: from[i] });
  });
  const parts = bands.map((b, i) => (i === bands.length - 1 ? `${b.cost} FROM DAY ${b.from}` : `${b.cost} ON DAYS ${b.from}-${bands[i + 1].from - 1}`));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} AND ${parts[parts.length - 1]}`;
}

/** RETUNE-1 run 2 (REQ-BFG-096): line 2 with HEARTS on (no run exists on the title, so the switch decides): the hearts rule
 *  (hearts.ts: HEARTS_START, a loss costs heartCost(day) by day band, heartCostWords; no early-loss refund). */
export const HELP_HEARTS_2 = `2  YOU HAVE ${HEARTS_START} HEARTS. A DUSK LOSS COSTS ${heartCostWords()}, A DRAW NONE. YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).`;

/** RUN-1 (REQ-BFG-059, REQ-BFG-116; D7): the rules card of a long run (title.ts helpLines with LONG_RUN on): line 1 says what wins
 *  the run (10 dusk fights, not 10 days); line 2 is the hearts rule's own words (HELP_HEARTS_2's, up to "A DRAW NONE.") and then
 *  how the run ends: WON at 10 wins, LOST when the hearts run out, no day limit. Was "1  SURVIVE 10 DAYS. ..." and, ending line 2,
 *  "YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS)." The hearts rule's numbers don't change. */
export const HELP_LONG_1 = `1  WIN ${WIN_GOAL} DUSK FIGHTS. EACH DAY IS THE CARAVAN AT DAWN, THE ROAD, THEN A DUSK FIGHT AGAINST A GHOST: ANOTHER CAPTAIN'S SAVED CRUISER.`;
export const HELP_LONG_2 = `2  YOU HAVE ${HEARTS_START} HEARTS. A DUSK LOSS COSTS ${heartCostWords()}, A DRAW NONE. THE RUN IS WON AT ${WIN_GOAL} WINS AND LOST WHEN YOUR HEARTS RUN OUT. THERE IS NO DAY LIMIT. ${WIN_GOAL}-0 IS FLAWLESS.`;
/** BUMP-1E P6 (RULING-BUMP1E-R3 R3.5; ENDLESS-1 question 2): what the rules card says of endless, one sentence that follows HELP_LONG_2 on
 *  line 2 while endless is in the game (helpLines). The 3 is ENDLESS_LIVES (endless.ts: an endless starts with 3 hearts) and the score is
 *  the run's endless wins (summary.ts ENDLESS OVER; src/screens/endlessText.ts ENDLESS_OFFER_LINES). */
export const HELP_ENDLESS = `AFTER A WIN YOU CAN PLAY ON IN ENDLESS: ${ENDLESS_LIVES} FRESH HEARTS, AND YOUR SCORE IS YOUR ENDLESS WINS.`;

/** RUN-1 (REQ-BFG-059, D7): the CONTINUE button's second line for a saved run: "DAY 3/10 · FURNACE · 3-8" for a 10-day run, exactly as
 *  before; "WINS 3/10 · DAY 12 · FURNACE · 3-8" for a long run's save (its mark, Run.longRun; never "/N" on the day). */
export const continueSub = (save: { day: number; wins: number; losses: number; hero: HeroId; longRun?: boolean; endless?: boolean; over?: string | null; endlessRun?: EndlessRun }): string =>
  inEndless(save) // ENDLESS-1 (REQ-BFG-059, 3.5): an endless save reads "ENDLESS 4 · DAY 15 · FURNACE" (screens/endlessText.ts), never a "/10"
    ? endlessContinueSub({ day: save.day, hero: save.hero, endlessRun: save.endlessRun! })
    : endlessOffered(save) // ENDLESS-1 (3.2): a won run kept while its RUN WON offer is open (save.ts saveRun): "RUN WON · DAY 13 · FURNACE"
    ? wonContinueSub(save)
    : longRun(save)
    ? `WINS ${save.wins}/${WIN_GOAL} · ${dayText(save.day, true)} · ${HEROES[save.hero].name} · ${save.wins}-${save.losses}`
    : `${dayText(save.day, false)} · ${HEROES[save.hero].name} · ${save.wins}-${save.losses}`;
// The HOW TO PLAY lines (RETUNE-1's helpLines: HELP, with line 2 the hearts rule while HEARTS is on; off, HELP itself) are
// helpLines above, merged with JOINS-1's line 3 (HULL-ON)

export class TitleScreen implements Screen {
  private arena!: Arena;
  private n = 0;
  private overT = 0;
  help = false;
  private menu = false;
  private t = 0;
  private save = loadRun();
  private layoutKey = "";
  /** intro: the frame (titleLayout) and the buttons' size factor, the menu scale over this screen's (pickScale). */
  private L!: TitleLayout;
  private k = 1;
  /** CUSTOM-2a (REQ-BFG-072): a style unlocked and not yet seen in CUSTOMIZE (its button's NEW dot). */
  newStyle = false;
  /** MOTION-2 (REQ-BFG-071): the attract fight in motion. CUSTOM-2a (REVIEW-MOTION2 Q2): always (no ?motion=0). */
  motion!: ArenaMotion;

  constructor(private game: Game) {
    this.newArena();
  }

  /** intro (REQ-BFG-038): the title's own scale (titleLayout.ts titleScale): the menu scale on the desk and in landscape;
   *  on a portrait phone one step down, so the cruisers keep open floor between them clear of the logo and the panel. */
  pickScale(pw: number, ph: number, portrait: boolean): number {
    const s = titleScale(pw, ph, portrait, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    this.k = defaultScale(pw, ph, portrait) / s;
    return s;
  }

  private newArena(): void {
    const heroes: HeroId[] = ["furnace", "weaver"];
    const me = heroes[this.n % 2], foe = heroes[(this.n + 1) % 2];
    const seed = 1000 + this.n * 7919;
    this.arena = new Arena(startingBuild(me, 1), warlordBuild(foe, 2 + (this.n % 4)), seed, null);
    this.arena.quiet = true;
    this.arena.b.sides[0].hull.hp += 60; // keep the attract fight going a while
    // MOTION-2: the round's carriers and sea (display only: the display clock and PRNG, seeded like the round). FIELD-1
    // (REQ-BFG-075): the settings in turn (scenery.ts ATTRACT_SCENES: OPEN SEA, DESERT, SKY first: all three media), at
    // the title's own framing (no camera)
    this.motion = new ArenaMotion(seed, attractScene(this.n), MOTION, settings.reducedMotion);
    this.n++;
    this.overT = 0;
    this.layoutKey = "";
  }

  enter(): void {
    this.game.audio.music(null);
    this.save = loadRun();
    this.newStyle = unseen(loadProfile()).length > 0; // CUSTOM-2a: the NEW dot (read once; CUSTOMIZE marks them seen)
  }

  private place(): void {
    const { W, H, portrait } = this.game;
    // intro: the saved run and the buttons' size factor are in the key too (CONTINUE makes the panel taller)
    const key = `${W}x${H}${portrait}${!!this.save}${this.k}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    // open floor between the bows like the real battle (0.5.0): 20% of the firing axis, at least the battle's 17%
    // (titleLayout.ts; before the intro job the portrait floor was whatever the logo and the panel left over)
    this.L = titleLayout(W, H, portrait, !!this.save, this.k);
    this.arena.setFrames(this.L.frames, portrait ? [[0, 1], [0, -1]] : [[-1, 0], [1, 0]]);
    // MOTION-2: the drifts never close the open floor below the battle's minimum (as in a battle)
    this.motion.setLanes({ portrait, gap: this.L.gap }, minGap(portrait ? H : W));
  }

  /** intro tooling (read only; scripts/introcheck.mjs): the title's frame as drawn, in logical px: its scale and the
   *  buttons' size factor, the open floor between the hull boxes, the logo band, the command panel, the sound button,
   *  the version line and the hull boxes; `logoWhole`, the logo is drawn whole. */
  layoutInfo(): { scale: number; k: number; gap: number; fits: boolean; logo: TitleLayout["logo"]; panel: TitleLayout["panel"]; sound: TitleLayout["sound"]; version: TitleLayout["version"]; hulls: TitleLayout["hulls"]; logoWhole: boolean } {
    this.place();
    const L = this.L;
    const art = titleArt("BELTBATTLES", (gg, s, x, yy, c) => drawText(gg, s, x, yy, c), (s) => textWidth(s));
    return {
      scale: this.game.view.scale, k: L.k, gap: L.gap, fits: L.fits, logo: L.logo, panel: L.panel, sound: L.sound, version: L.version,
      hulls: L.hulls, logoWhole: art.width + 6 <= L.W || textWidth("BELTBATTLES") * 2 <= L.W,
    };
  }

  update(dt: number): void {
    this.t += dt;
    this.place();
    this.motion.update(dt, settings.reducedMotion); // MOTION-2: the display clock (frame time; never the sim's)
    this.arena.update(dt);
    if (this.arena.b.over && (this.overT += dt) > 3.2) this.newArena();
  }

  draw(g: G): void {
    const { W, H, portrait, ui } = this.game;
    const game = this.game;
    this.place();
    const m = this.motion, a = this.arena;
    // MOTION-2 (REQ-BFG-071): the round's sea, then the carriers, boards, shots and effects in motion
    m.drawSea(g, W, H, a.fx.shakeX, a.fx.shakeY, game.view.scale, game.view.dpr, m.model.seed, a);
    m.draw(g, a, W, H, settings.reducedMotion);
    g.globalAlpha = 0.45;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;

    // logo band (a dark strip keeps it legible when the attract battle runs underneath)
    const art = titleArt("BELTBATTLES", (gg, s, x, yy, c) => drawText(gg, s, x, yy, c), (s) => textWidth(s));
    const L = this.L;
    const ly = L.ly; // intro: titleLayout's (0350e5f's on the desk and in landscape; under the sound button in portrait)
    g.globalAlpha = 0.7;
    rect(g, 0, ly - 6, W, 44, C.ink);
    g.globalAlpha = 1;
    rect(g, 0, ly - 6, W, 1, C.slate1);
    rect(g, 0, ly + 37, W, 1, C.slate1);
    if (art.width + 6 <= W) g.drawImage(art, Math.round(W / 2 - art.width / 2), ly);
    else drawText(g, "BELTBATTLES", W / 2, ly + 4, C.fire3, { align: "center", scale: 2, outline: C.ink });
    drawText(g, "BUILD BELTS · COOK AMMO · BREAK HULLS", W / 2, ly + 30, C.bone, { font: "3", align: "center", outline: C.ink });

    // command panel (intro: titleLayout's rects, 0350e5f's wherever the title keeps the menu scale; where it steps the
    // scale down the buttons are k times as big, so each keeps at least the CSS size it had)
    const save = this.save;
    const b = L.buttons;
    panel(g, L.panel, "dark");
    // PACKS M2 (REQ-BFG-063): with no player name stored, every title button (but the sound one) opens the name screen
    // first and does its own thing once a name is in (gate)
    button(ui, g, "new", b.new, "NEW RUN", { primary: true, onTap: () => this.gate(() => game.go(new HeroScreen(game))) });
    if (save && b.cont) {
      button(ui, g, "cont", b.cont, "CONTINUE", {
        sub: continueSub(save), // RUN-1 (REQ-BFG-059, D7): a long run's save reads WINS n/10 · DAY n · HERO · W-L
        onTap: () => this.gate(() => this.continueRun()),
      });
    }
    button(ui, g, "help", b.help, this.help ? "CLOSE" : "HOW TO PLAY", {
      font: "3", active: this.help, onTap: () => this.gate(() => { this.help = !this.help; }),
    });
    button(ui, g, "options", b.options, "OPTIONS", { font: "3", onTap: () => this.gate(() => { this.menu = true; }) });
    // CUSTOM-2a (REQ-BFG-072, Q5): CUSTOMIZE, the third button of the row, with a NEW dot while an unlocked style is unseen
    button(ui, g, "customize", b.customize, "CUSTOMIZE", { font: "3", onTap: () => this.gate(() => game.go(new CustomizeScreen(game))) });
    if (this.newStyle) newDot(g, b.customize);
    game.soundButton(g, L.sound);
    drawText(g, `V${VERSION}`, W - 4, H - 8, C.slate3, { font: "3", align: "right" });
    // BUMP-1E P6 E.2: the saved run was set aside (it names something this build does not know): one plain line, just above the panel (the
    // portrait panel sits at the bottom edge, so there is no room under it), on a dark strip like the logo band's
    const aside = saveProblem();
    if (aside && !save) {
      const { lines, y0, boxH, lh } = asideBox(W, ly + 42, L.panel.y);
      g.globalAlpha = 0.7;
      rect(g, 0, y0 - 2, W, boxH, C.ink);
      g.globalAlpha = 1;
      lines.forEach((ln, i) => drawText(g, ln, W / 2, y0 + i * lh, C.yellow, { font: "3", align: "center", outline: C.ink }));
    }
    if (this.help) this.drawHelp(g);
    if (this.menu) optionsCard(game, g, "OPTIONS", [{ id: "optdone", label: "DONE", primary: true, onTap: () => { this.menu = false; } }], () => { this.menu = false; }, this.k);
  }

  private drawHelp(g: G): void {
    const { W, H } = this.game;
    // intro: titleLayout.ts helpCard: 0350e5f's card at k = 1 (desk, landscape); where the title steps its scale down
    // (k > 1) the card keeps its CSS width and its text takes the 5x7 face, about as tall in CSS px as the 3x5 face was
    const help = helpLines(); // RETUNE-1 run 2 (REQ-BFG-096): line 2 says hearts while HEARTS is on; off, HELP
    // JOINS-1 (REQ-BFG-091): line 3 by the switch now (HELP exactly, with FREE_JOINS off)
    const { x, y, w, h, font } = helpCard(W, H, this.k, help);
    panel(g, { x, y, w, h }, "raised");
    drawText(g, "HOW TO PLAY", W / 2, y + 6, C.yellow, { align: "center" });
    let yy = y + 20;
    for (const ln of help) yy += para(g, [ln], x + 8, yy, w - 16, C.bone, font, 2) + 3;
    this.game.ui.add({ id: "helpcard", r: { x, y, w, h }, onTap: () => { this.help = false; } });
  }

  private continueRun(): void {
    const run = loadRun();
    if (!run) return;
    this.game.run = run;
    // ENDLESS-1 (REQ-BFG-059, 3.2): a won run kept while its RUN WON offer was open (save.ts saveRun): the card again, with CONTINUE
    // ENDLESS and END RUN; nothing else of a finished run is ever saved, so every other save goes on as it always did
    if (endlessOffered(run)) return this.game.go(new SummaryScreen(this.game));
    // on the road: the same event (resolved or not); at the fork: the fork; mid-warlord: the same
    // fight again (same deck, same seed); after the road stop: a refit (the caravan is gone)
    const onRoad = run.stage === "event" && !!run.event && run.event.day === run.day;
    const warlord = run.stage === "warlord" && !!run.warlord && run.warlord.day === run.day;
    this.game.go(onRoad ? new EventScreen(this.game) : run.stage === "fork" ? new ForkScreen(this.game)
      : warlord ? new BattleScreen(this.game, "warlord") : new BuildScreen(this.game));
  }

  /** PACKS M2 (REQ-BFG-063): a player name is required. With one stored (or given this page load), `then` runs now;
   *  else the name screen opens first (required: no way past it but a name) and `then` runs once it is stored. */
  gate(then: () => void): void {
    if (currentName()) then();
    else this.game.openName({ required: true, done: () => then() });
  }

  /** PACKS M2: the title's first tap off the buttons opens the name screen too, while no name is stored. */
  down(): void {
    this.gate(() => {});
  }

  key(k: string): void {
    if (k === "Escape") {
      this.help = false;
      this.menu = false;
    } else if (this.menu) return;
    else if (k === "Enter" || k === " ") this.gate(() => this.game.go(new HeroScreen(this.game)));
    else if (k === "c" || k === "C") this.gate(() => this.continueRun());
    else if (k === "h" || k === "H" || k === "?") this.gate(() => { this.help = !this.help; });
  }
}

/** CUSTOM-2a (REQ-BFG-072): the NEW dot on a button's top right corner: a lime dot in an ink rim. */
export function newDot(g: G, r: { x: number; y: number; w: number; h: number }): void {
  rect(g, r.x + r.w - 7, r.y + 2, 5, 5, C.ink);
  rect(g, r.x + r.w - 6, r.y + 3, 3, 3, C.lime);
}
