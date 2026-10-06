// 0.7.0a M4 (REQ-BFG-016; decision D6): a stored dusk record replayed in the battle view, read-only. The same arena,
// layout, plates and playback bar as the dusk (0.5X-4X, SKIP, pause), a REPLAY · DAY n banner, then the result and
// BACK to the screen it came from (the run summary). It plays the Battle openReplay(record) made (replayBattle: a
// fresh Battle under this build's rules), so the fight is the stored one bit for bit; it never touches the run: no
// save, no dusk result, no ghost, no new pick.
// MOTION-2 (REQ-BFG-071, REVIEW-MOTION1 Q5): a replay sails in motion as the dusk did, on its day's sea (display only:
// the display clock and PRNG, seeded from the record's seed; the fight itself is the record's, bit for bit).

import { playerSkin } from "../game/profile"; // CUSTOM-2a (REQ-BFG-072, R11): the player's side wears the chosen styles
import type { Game, Screen } from "../game/game";
import { Arena } from "../game/arena";
import { battleLayout, battleScale, laneLayout, minGap, type BattleLayout } from "../game/battleLayout";
import { ArenaMotion } from "../game/arenaMotion";
import { MOTION } from "../render/motion";
import { settings } from "../core/settings";
import type { Battle } from "../sim/battle";
import { HEROES, RUN_DAYS } from "../sim/content";
import { C } from "../render/palette";
import type { G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { banner } from "../ui/hud";
import { fmtClock, fmtDmg } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the clock and the hull, whole
import { button, panel } from "../ui/ui";
import { SPEEDS, SPEED_1X, drawBar, drawPlate, type BarState } from "./battleHud";
import type { View } from "../core/io";
import { isPhone, tapPx } from "../ui/tap"; // shoptap (D5, backlog 319)

type Box = { x: number; y: number; w: number; h: number };
const hits = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** shoptap (D5, backlog 319): the result card's BACK height: 15 px (0.7.0a), on a phone at least TAP_CSS CSS px. */
export function replayBackH(v: Pick<View, "W" | "H" | "scale" | "dpr">): number {
  return isPhone(v) ? Math.max(15, tapPx(v)) : 15;
}

/**
 * shoptap (D5, backlog 319): the replay's BACK while the fight plays. 0.7.0a's 36 x 12 at the top right, everywhere but a
 * phone. On a phone a TAP_CSS square (R1 measured 0.7.0a's at 24 CSS px tall), as wide as its label needs: in the first
 * screen corner (top right, bottom right, top left, bottom left; 2 px in, then flush with the screen's edge) clear of
 * both plates, both hulls, the playback bar and the REPLAY label (an iPhone turned on its side: the bottom right, under
 * the enemy hull and right of the bar); where none is clear (a portrait phone, whose hulls fill its width), the top right
 * as before, the square narrower than 0.7.0a's button so it keeps off the enemy plate. Pure (tests).
 */
export function replayLeaveRect(L: BattleLayout, v: Pick<View, "W" | "H" | "scale" | "dpr">): Box {
  const { W, H } = L;
  if (!isPhone(v)) return { x: W - 38, y: 2, w: 36, h: 12 };
  const h = Math.max(12, tapPx(v)), w = Math.max(h, textWidth("BACK", "3") + 6);
  const corners: Box[] = [2, 0].flatMap((m) => [
    { x: W - w - m, y: m, w, h }, { x: W - w - m, y: H - h - m, w, h }, { x: m, y: m, w, h }, { x: m, y: H - h - m, w, h },
  ]);
  const label = { x: 3, y: 3, w: textWidth("REPLAY", "3") + 2, h: 7 }; // the outlined REPLAY at (4, 4)
  const keep = [...L.plates, ...L.hulls, L.bar, label];
  return corners.find((c) => keep.every((k) => !hits(c, k))) ?? corners[0];
}

export class ReplayScreen implements Screen {
  readonly arena: Arena;
  L!: BattleLayout;
  speed = SPEED_1X;
  /** The replayed fight has ended (its result shows). */
  over = false;
  private pt = 0;
  private left = false;
  private bar: BarState;
  private plateR = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  private hp: [string, string] = ["", ""];
  private readonly heroName: string;
  /** MOTION-2 (REQ-BFG-071): the replay in motion. CUSTOM-2a (REVIEW-MOTION2 Q2): always (no ?motion=0). */
  readonly motion: ArenaMotion;
  private readonly seed: number;

  constructor(private game: Game, private back: Screen, battle: Battle, private label: { day: number; foe: string }) {
    const [mine, theirs] = battle.record.builds;
    this.seed = battle.record.seed;
    this.arena = new Arena(mine, theirs, battle.record.seed, game.audio, battle);
    this.arena.views[0].skin = playerSkin(); // CUSTOM-2a (R11): your side wears your styles; the foe's the defaults
    this.arena.off = [0, 0];
    this.heroName = HEROES[mine.hero].name;
    this.motion = new ArenaMotion(this.seed, label.day, MOTION, settings.reducedMotion);
    this.bar = {
      speed: this.speed, compact: false, showSpeeds: true, paused: false,
      onSpeed: SPEEDS.map((_, i) => () => this.setSpeed(i)),
      onCycle: () => this.setSpeed((this.speed + 1) % SPEEDS.length),
      onSkip: () => this.skip(),
      onPause: () => this.togglePause(),
    };
    this.relayout();
  }

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return battleScale(pw, ph, portrait);
  }

  enter(): void {
    this.relayout();
    this.game.audio.music("battle");
  }

  private relayout(): void {
    const { W, H, portrait } = this.game;
    if (this.L && this.L.W === W && this.L.H === H && this.L.portrait === portrait) return;
    // MOTION-2: the battle's lanes (portrait as 0.9.4; landscape's enemy lane raised and a little ahead)
    this.L = laneLayout(battleLayout(W, H, portrait));
    this.motion.setLanes(this.L, minGap(portrait ? H : W));
    this.arena.setFrames(this.L.frames, this.L.enter);
  }

  setSpeed(i: number): void {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.arena.speed = SPEEDS[this.speed];
  }

  togglePause(): void {
    if (this.over) return;
    this.arena.paused = !this.arena.paused;
  }

  skip(): void {
    if (this.over) return;
    this.arena.paused = false;
    for (const e of this.arena.finish()) if (e.type === "end") this.end();
  }

  private end(): void {
    this.over = true;
    this.pt = 0;
    this.arena.speed = 1;
    this.game.audio.music(null);
  }

  /** Back to where the replay was opened. Nothing to save: a replay changes no run state (D6). */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.game.go(this.back);
  }

  update(dt: number): void {
    this.relayout();
    this.pt += dt;
    if (this.arena.paused) return;
    this.motion.update(dt, settings.reducedMotion); // MOTION-2: the display clock (frame time; never the sim's)
    if (!this.over) {
      const ev = this.arena.update(dt);
      for (let i = 0; i < ev.length; i++) if (ev[i].type === "end" && !this.over) this.end();
      if (this.arena.b.over && !this.over) this.end();
    } else this.arena.update(dt, false);
  }

  draw(g: G): void {
    const { W, H, ui } = this.game;
    const a = this.arena, b = a.b;
    const m = this.motion;
    // MOTION-2: the day's sea, then the carriers, boards, shots and effects in motion
    m.drawSea(g, W, H, a.fx.shakeX, a.fx.shakeY, this.game.view.scale, this.game.view.dpr, this.seed);
    m.draw(g, a, W, H, settings.reducedMotion);
    for (let s = 0; s < 2; s++) {
      this.hp[s] = fmtDmg(Math.max(0, b.sides[s].hull.hp)); // NUM-4: the hull is whole (NUM-1); was Math.ceil
      const p = this.L.plates[s], r = this.plateR[s];
      r.x = p.x; r.y = p.y; r.w = p.w; r.h = p.h;
    }
    drawPlate(g, this.game, a, this.plateR[1], 1, this.label.foe, this.hp[1]);
    drawPlate(g, this.game, a, this.plateR[0], 0, this.heroName, this.hp[0]);
    const sec = Math.floor(b.t);
    const st = this.bar;
    st.speed = this.speed;
    st.compact = this.L.compact;
    st.paused = this.arena.paused;
    st.showSpeeds = !this.over;
    drawBar(g, this.game, a, this.L.bar, `${Math.floor(sec / 60)}:${sec % 60 < 10 ? "0" : ""}${sec % 60}`, st);
    const cy = Math.round(H / 2);
    if (!this.over && this.pt < 1.6) banner(g, W, cy - 16, `REPLAY · DAY ${this.label.day}/${RUN_DAYS}`, C.ice, `VS ${this.label.foe}`, Math.min(1, this.pt / 0.35));
    drawText(g, "REPLAY", 4, 4, C.ice, { font: "3", outline: C.ink });
    if (this.over && this.pt > 0.6) {
      const won = b.winner === 0, lost = b.winner === 1;
      // shoptap (D5, backlog 319): on a phone BACK is at least TAP_CSS CSS px tall (R1 measured 30), the card as much taller
      const bh = replayBackH(this.game.view);
      const w = Math.min(W - 10, 150), h = 52 + bh - 15;
      const x = Math.round(W / 2 - w / 2), y = cy - Math.round(h / 2);
      panel(g, { x, y, w, h }, "raised");
      drawText(g, won ? "WIN" : lost ? "LOSS" : "DRAW", W / 2, y + 6, won ? C.lime : lost ? C.red : C.bone, { align: "center", scale: 2, outline: C.ink });
      drawText(g, `REPLAY · DAY ${this.label.day} · ${fmtClock(b.t)}S`, W / 2, y + 23, C.slate4, { font: "3", align: "center" }); // NUM-4: a clock
      button(ui, g, "replayback", { x: x + 10, y: y + h - 4 - bh, w: w - 20, h: bh }, "BACK", { primary: true, onTap: () => this.leave() });
    } else {
      button(ui, g, "replayleave", replayLeaveRect(this.L, this.game.view), "BACK", { font: "3", onTap: () => this.leave() });
    }
  }

  key(k: string): void {
    if (k >= "1" && k <= "4" && k.length === 1) this.setSpeed(Number(k) - 1);
    else if (k === "s" || k === "S") this.skip();
    else if (k === "Escape" || ((k === "Enter" || k === " ") && this.over)) this.leave();
    else if (k === " " || k === "p" || k === "P") this.togglePause();
  }
}
