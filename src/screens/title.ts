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
import { loadRun } from "../game/run";
import { REFUND_DAY } from "../game/day"; // 0.6.2 TUNE-M: RULE EARLY-LOSS REFUND in the rules card
import { startingBuild, warlordBuild } from "../sim/ai";
import { HEROES, RUN_DAYS, type HeroId } from "../sim/content";
import { JOIN_OVER_LIMIT, JOIN_PACE_PCT } from "../sim/deck"; // 0.6.2 TUNE-M: RULE JOIN PACE and RULE JOIN LIMIT in the rules card
import { freeJoinsRules } from "../sim/freeJoins"; // JOINS-1 (REQ-BFG-091): neither rule in the card with FREE_JOINS on
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
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
import { ArenaMotion } from "../game/arenaMotion";
import { minGap } from "../game/battleLayout";
import { settings } from "../core/settings";
import { currentName } from "../game/ghostSnapshot"; // PACKS M2 (REQ-BFG-063): the name screen comes first
import { HEART_COST_FROM, HEART_COSTS, HEARTS_START, heartsRules } from "../sim/hearts"; // RETUNE-1 run 2: the rules card's hearts

/** MOTION-2: the attract fight's sea, round by round: a day of each setting (render/motion.ts seaForDay). */
const ATTRACT_DAYS = [2, 5, 9];

/** JOINS-1 (REQ-BFG-091): the rules card's line 3 under the switch now. FREE_JOINS off: it states RULE JOIN LIMIT and
 *  RULE JOIN PACE, exactly as before; on, neither (a deck holds any number of legal joins, and a join never slows its
 *  factory). */
export function helpLine3(free = freeJoinsRules()): string {
  const how = "3  AT DAWN, BUY RIGS FROM THE CARAVAN. DRAG OUT OF YOUR FACTORY TO LAY BELT TO A TURRET INTAKE. DRAG A BELT INTO ANOTHER TO JOIN THEM";
  return free ? `${how}.` : `${how} (${JOIN_OVER_LIMIT}). A JOINED FACTORY RUNS AT ${JOIN_PACE_PCT}% PACE.`;
}

/** JOINS-1: the rules card the title draws: HELP with line 3 by the switch now (HELP itself with FREE_JOINS off).
 *  RETUNE-1 run 2 (REQ-BFG-096): and line 2 the hearts rule while HEARTS is on (HELP_HEARTS_2, below HELP). HULL-ON (the
 *  merge of JOINS-1's and RETUNE-1's helpLines, one function for both lines): while neither line moves it is HELP itself,
 *  as RETUNE-1's was. */
export function helpLines(): string[] {
  const lines = HELP.map((ln, i) => (i === 1 && heartsRules() ? HELP_HEARTS_2 : i === 2 ? helpLine3() : ln));
  return lines.every((ln, i) => ln === HELP[i]) ? HELP : lines;
}

export const HELP = [ // exported for tests/joinpace.test.ts (0.6.2 TUNE-M: line 3 states RULE JOIN PACE; JOINS-1: at load)
  "1  SURVIVE 10 DAYS. EACH DAY IS THE CARAVAN AT DAWN, THE ROAD, THEN A DUSK FIGHT AGAINST A GHOST: ANOTHER CAPTAIN'S SAVED CRUISER.",
  // 0.6.2 TUNE-M: line 2 states RULE EARLY-LOSS REFUND (day.ts)
  `2  YOU HAVE 5 LIVES. A DUSK LOSS COSTS ONE, A DRAW NONE. LOSE ON DAY 1 OR 2 AND DAY ${REFUND_DAY}'S DAWN GIVES ONE LIFE BACK (ONCE A RUN). YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).`,
  helpLine3(), // JOINS-1 (REQ-BFG-091): with FREE_JOINS off exactly as before (RULE JOIN LIMIT and RULE JOIN PACE)
  "4  STAND RIGS BESIDE THE BELT, ARROWS AT IT (TAP TO TURN): BURN, SHOCK, SPLIT, SPEED UP OR SLOW DOWN. LONGER CINDER ROUTES COOK HOTTER SLUGS.",
  "5  ON THE ROAD, EVENTS OFFER A CHOICE (KEYS 1-3). AT DUSK YOUR CRUISER FIGHTS ON ITS OWN: 0.5X-4X, SKIP, II OR P TO PAUSE.",
];

/** RETUNE-1 run 2 (REQ-BFG-096): line 2 with HEARTS on (no run exists on the title, so the switch decides): the hearts rule
 *  (hearts.ts: HEARTS_START, a loss costs heartCost(day), 1/2/3 by day band; no early-loss refund). */
export const HELP_HEARTS_2 = `2  YOU HAVE ${HEARTS_START} HEARTS. A DUSK LOSS COSTS ${HEART_COSTS[0]} ON DAYS 1-${HEART_COST_FROM[1] - 1}, ${HEART_COSTS[1]} ON DAYS ${HEART_COST_FROM[1]}-${HEART_COST_FROM[2] - 1} AND ${HEART_COSTS[2]} FROM DAY ${HEART_COST_FROM[2]}, A DRAW NONE. YOUR SCORE IS YOUR W-L RECORD (10-0 IS FLAWLESS).`;
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
    // MOTION-2: the round's carriers and sea (display only: the display clock and PRNG, seeded like the round)
    this.motion = new ArenaMotion(seed, ATTRACT_DAYS[this.n % ATTRACT_DAYS.length], MOTION, settings.reducedMotion);
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
    m.drawSea(g, W, H, a.fx.shakeX, a.fx.shakeY, game.view.scale, game.view.dpr, m.model.seed);
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
        sub: `DAY ${save.day}/${RUN_DAYS} · ${HEROES[save.hero].name} · ${save.wins}-${save.losses}`,
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
