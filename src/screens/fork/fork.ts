// The road fork (0.6.0b, REQ-BFG-010): after the dawn caravan, one road stop: the day's road event
// or the Easy, Medium or Hard warlord (mouse, touch, or keys 1-4). Landscape: four tall cards in a
// row, a click picks. Portrait: four 2-row cards stacked; the first tap inspects (the blurb shows
// below with a GO button), a second tap or GO picks. The pick is saved at once, so a reload can't
// take it again; a warlord pick stores the fight, so a reload replays exactly that fight.

import type { Game, Screen } from "../../game/game";
import { forkFor, pickRoad, roadChosen, warlordReward, warlordDeck, warlordDeckDay, type Fork } from "../../game/road";
import { saveRun, type Run, type RoadPick } from "../../game/run";
import { settings } from "../../core/settings";
import { RIVALS, RUN_DAYS, type Difficulty } from "../../sim/rivals";
import { C } from "../../render/palette";
import { type G } from "../../render/pixel";
import { drawText, wrap } from "../../render/font";
import { ArenaBg } from "../../render/arenaBg";
import { button, panel, type Rect } from "../../ui/ui";
import { optionsCard } from "../../ui/hud";
import { drawRunBar, newAnchors, type AnchorKind } from "../../ui/runbar";
import { eventScale } from "../event/layout";
import { drawEventCard, drawWarlordCard, rewardText, type ForkCardView } from "./cards";
import { EventScreen } from "../event/event";
import { BattleScreen } from "../battle";
import { TitleScreen } from "../title";

const PICKS: RoadPick[] = ["event", "easy", "medium", "hard"];
const IDS = ["fork0", "fork1", "fork2", "fork3"];

export class ForkScreen implements Screen {
  readonly run: Run;
  readonly fork: Fork;
  sel = -1; // portrait: the inspected card
  t = 0;
  menu = false;
  private leaving = false;
  private readonly bg = new ArenaBg();
  private readonly anchors = newAnchors();
  private readonly flash: Record<AnchorKind, number> = { gold: 0, lives: 0, hull: 0, belt: 0, cargo: 0 };
  private readonly onTap = [0, 1, 2, 3].map((i) => () => this.tap(i));
  private readonly onMenu = () => { this.menu = true; };
  private readonly v: ForkCardView = { hover: false, selected: false, key: 1, t: 0, calm: false, notes: [] };

  constructor(public game: Game) {
    if (!game.run) throw new Error("ForkScreen needs a run");
    this.run = game.run;
    this.fork = forkFor(this.run);
  }

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return eventScale(pw, ph, portrait);
  }

  get toastY(): number {
    return 20;
  }

  enter(): void {
    this.run.stage = "fork";
    saveRun(this.run);
    this.game.audio.music("prep");
    this.game.audio.play("whoosh");
  }

  /** The reward and notes a warlord card shows (a pending SABOTAGE applies to any tier). */
  private info(tier: Difficulty): { reward: ReturnType<typeof warlordReward>; notes: string[] } {
    const run = this.run, id = this.fork.warlords[tier];
    const sab = !!run.sabotage;
    const reward = warlordReward(id, tier, warlordDeck(id, run.day, sab), warlordDeckDay(id, run.day, sab));
    const notes: string[] = [];
    if (sab) notes.push("SABOTAGED");
    if (tier === "hard" && run.bounty) notes.push(`+${run.bounty.pay} BOUNTY`);
    return { reward, notes };
  }

  layout(): { cards: Rect[]; head: number; detail: Rect | null } {
    const { W, H, portrait } = this.game;
    const top = 18;
    if (!portrait) {
      const gap = 6, cw = Math.min(124, Math.floor((W - 12 - 3 * gap) / 4));
      const ch = Math.min(170, H - top - 26 - 6);
      const x0 = Math.round(W / 2 - (4 * cw + 3 * gap) / 2);
      const y = top + 22 + Math.max(0, Math.floor((H - top - 22 - 6 - ch) / 2));
      return { cards: [0, 1, 2, 3].map((i) => ({ x: x0 + i * (cw + gap), y, w: cw, h: ch })), head: y - 16, detail: null };
    }
    const gap = 4, ch = 32, cw = W - 8;
    const detailH = 66;
    const total = 4 * ch + 3 * gap + 8 + detailH;
    const y0 = top + 20 + Math.max(0, Math.floor((H - top - 20 - 6 - total) / 2));
    const cards = [0, 1, 2, 3].map((i) => ({ x: 4, y: y0 + i * (ch + gap), w: cw, h: ch }));
    return { cards, head: y0 - 15, detail: { x: 4, y: y0 + 4 * ch + 3 * gap + 8, w: cw, h: detailH } };
  }

  /** Mouse click / key: pick at once. Touch in portrait: first tap inspects, the second picks. */
  tap(i: number): void {
    if (this.game.portrait && this.sel !== i) {
      this.sel = i;
      this.game.audio.play("click");
      return;
    }
    this.pick(i);
  }

  pick(i: number): void {
    if (this.leaving || this.menu || this.game.transitioning) return;
    const p = PICKS[i];
    if (!p) return;
    if (roadChosen(this.run)) return;
    const res = pickRoad(this.run, p);
    if (!res.ok) return this.game.error(res.reason ?? "CAN'T");
    saveRun(this.run);
    this.leaving = true;
    this.game.audio.play(p === "event" ? "whoosh" : "horn");
    this.game.go(p === "event" ? new EventScreen(this.game) : new BattleScreen(this.game, "warlord"));
  }

  update(dt: number): void {
    this.t += dt;
  }

  draw(g: G): void {
    const { W, H, portrait, ui } = this.game;
    const run = this.run, f = this.fork;
    this.bg.draw(g, W, H, { hulls: [], vertical: portrait, gapLine: false }, this.t);
    const L = this.layout();
    drawText(g, `THE ROAD · DAY ${run.day}/${RUN_DAYS}`, W / 2, L.head, C.yellow, { align: "center", outline: C.ink });
    drawText(g, "PICK ONE STOP · WARLORDS NEVER COST A LIFE", W / 2, L.head + 9, C.slate4, { font: "3", align: "center" });
    const v = this.v;
    v.t = this.t;
    v.calm = settings.reducedMotion;
    for (let i = 0; i < 4; i++) {
      const r = L.cards[i];
      v.key = i + 1;
      v.hover = !portrait && ui.hover === IDS[i];
      v.selected = portrait && this.sel === i;
      if (i === 0) {
        v.notes = [];
        drawEventCard(g, r, f.event, run.hero, v, portrait);
      } else {
        const tier = PICKS[i] as Difficulty;
        const inf = this.info(tier);
        v.notes = inf.notes;
        drawWarlordCard(g, r, f.warlords[tier], tier, inf.reward, v, portrait);
      }
      ui.add({ id: IDS[i], r, onTap: this.onTap[i], block: true });
    }
    if (L.detail) this.drawDetail(g, L.detail);
    drawRunBar(g, this.game, run, this.flash, this.anchors, this.onMenu);
    if (this.menu) {
      optionsCard(this.game, g, "PAUSED", [
        { id: "resume", label: "RESUME", primary: true, onTap: () => { this.menu = false; } },
        { id: "quit", label: "SAVE & QUIT", onTap: () => { saveRun(this.run); this.game.go(new TitleScreen(this.game)); } },
      ], () => { this.menu = false; });
    }
  }

  /** Portrait: the inspected card's blurb and a GO button (tap-to-inspect). */
  private drawDetail(g: G, r: Rect): void {
    const ui = this.game.ui;
    panel(g, r, "dark");
    const i = this.sel;
    if (i < 0) {
      drawText(g, "TAP A STOP TO INSPECT IT, TAP AGAIN TO GO", r.x + r.w / 2, r.y + r.h / 2 - 3, C.slate4, { font: "3", align: "center" });
      return;
    }
    let title: string, lines: string[];
    if (i === 0) {
      title = "ROAD EVENT";
      lines = ["NO FIGHT. TAKE ITS CHOICES, THEN DUSK."];
    } else {
      const tier = PICKS[i] as Difficulty, id = this.fork.warlords[tier], inf = this.info(tier);
      title = `${RIVALS[id].name} · ${RIVALS[id].trick}`;
      const notes = inf.notes.map((n) => (n === "SABOTAGED" ? "! SABOTAGED: YESTERDAY'S DECK" : `! ${n} ON A WIN`));
      lines = [RIVALS[id].blurb, rewardText(inf.reward), "A LOSS COSTS NO LIFE", ...notes];
    }
    drawText(g, title, r.x + 5, r.y + 5, C.yellow, { font: "3" });
    let y = r.y + 14;
    for (const ln of lines.flatMap((l) => wrap(l, r.w - 74, "3")).slice(0, 7)) {
      drawText(g, ln, r.x + 5, y, ln.startsWith("!") ? C.amber : C.bone, { font: "3" });
      y += 7;
    }
    button(ui, g, "forkgo", { x: r.x + r.w - 62, y: r.y + r.h - 24, w: 58, h: 20 }, i === 0 ? "TAKE IT" : "FIGHT", {
      primary: true, onTap: () => this.pick(i),
    });
  }

  key(k: string): void {
    if (k === "Escape") this.menu = !this.menu;
    else if (this.menu) return;
    else if (k >= "1" && k <= "4" && k.length === 1) this.pick(Number(k) - 1);
  }
}
