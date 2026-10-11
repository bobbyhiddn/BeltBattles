// The road fork (0.6.0b, REQ-BFG-010): after the dawn caravan, one road stop: the day's road event
// or the Easy, Medium or Hard warlord (mouse, touch, or keys 1-4). Landscape: four tall cards in a
// row, a click picks. Portrait: four 2-row cards stacked; the first tap inspects (the blurb shows
// below with a GO button), a second tap or GO picks. The pick is saved at once, so a reload can't
// take it again; a warlord pick stores the fight, so a reload replays exactly that fight.

import type { Game, Screen } from "../../game/game";
import { forkFor, pickRoad, roadChosen, warlordReward, warlordDeck, warlordDeckDay, type Fork } from "../../game/road";
import { forkPicks, warlordDropTable } from "../../game/road"; // NPC-1 (REQ-BFG-077, REQ-BFG-078)
import { npcDayRules, type DropTable } from "../../sim/npcDay"; // NPC-1
import { DROP_BOX } from "./cards"; // NPC-1: the desk card's drop box
import { dropInfoButton, dropLine, dropStarText, drawDropIcons, drawDropList } from "./drops"; // NPC-1; HULL-1b: dropStarText
import { EVENTS, type EventId } from "../../game/eventDefs"; // NPC-1: AFTER THE FIGHT: <TITLE>
import { rect } from "../../render/pixel"; // NPC-1: the inspect panel's drop rule
import { saveRun, type Run, type RoadPick } from "../../game/run";
import { settings } from "../../core/settings";
import { RIVALS, RUN_DAYS, type Difficulty } from "../../sim/rivals";
import { C } from "../../render/palette";
import { type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font"; // HULL-1b: textWidth (the drop row)
import { SeaBackdrop } from "../../render/backdrop"; // CUSTOM-2a (REVIEW-MOTION2 Q1): the day's sea, held still
import { seaForDay, stillSeaSeed } from "../../render/motion";
import { button, panel, type Rect } from "../../ui/ui";
import { optionsCard } from "../../ui/hud";
import { drawRunBar, newAnchors, type AnchorKind } from "../../ui/runbar";
import { lifeWord } from "../../ui/stakes"; // RETUNE-1 run 2 (REQ-BFG-096): HEART on a hearts run
import { eventScale } from "../event/layout";
import { drawEventCard, drawWarlordCard, rewardText, type ForkCardView } from "./cards";
import { EventScreen } from "../event/event";
import { BattleScreen } from "../battle";
import { TitleScreen } from "../title";
import { drawRich, wrapRich, type Span } from "../../ui/richText"; // U2b: a captain's lines in rich text
import { captainSpans } from "../../ui/captainText"; // U2b: the keyword colours

const IDS = ["fork0", "fork1", "fork2", "fork3"];

export class ForkScreen implements Screen {
  readonly run: Run;
  readonly fork: Fork;
  /** The cards, in order: road.ts forkPicks() (0.9.7: the event and the three warlords; NPC-1, NPC_DAY on: the three
   *  warlords, the day's event an info line, AFTER THE FIGHT: <TITLE>). */
  readonly picks: readonly RoadPick[] = forkPicks();
  /** NPC-1 (NPC_DAY on): the warlord whose drop list (ⓘ) is open, or null. */
  dropList: Difficulty | null = null;
  sel = -1; // portrait: the inspected card
  t = 0;
  menu = false;
  private leaving = false;
  /** CUSTOM-2a (REVIEW-MOTION2 Q1): one world on every screen. The day's sea, held still behind the cards: one cached
   *  blit a frame (render/backdrop.ts drawStill), as the build screen draws it. No layout or touch target moves. */
  private readonly sea = new SeaBackdrop();
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
    // 0.6.2 RULE EASY PAY: the card shows today's pay (the run's day; SABOTAGE may swap the deck's day)
    const reward = warlordReward(id, tier, warlordDeck(id, run.day, sab), warlordDeckDay(id, run.day, sab), run.day);
    const notes: string[] = [];
    if (sab) notes.push("SABOTAGED");
    if (tier === "hard" && run.bounty) notes.push(`+${run.bounty.pay} BOUNTY`);
    return { reward, notes };
  }

  layout(): { cards: Rect[]; head: number; detail: Rect | null } {
    const { W, H, portrait } = this.game;
    const top = 18;
    // NPC-1: n cards (0.9.7: 4) and, with NPC_DAY on, a row for AFTER THE FIGHT (0.9.7: none), so 0.9.7's sums are unchanged
    const n = this.picks.length, info = npcDayRules() ? 10 : 0, idx = Array.from({ length: n }, (_, i) => i);
    if (!portrait) {
      const gap = 6, cw = Math.min(124, Math.floor((W - 12 - (n - 1) * gap) / n));
      const ch = Math.min(170, H - top - 26 - 6 - info);
      const x0 = Math.round(W / 2 - (n * cw + (n - 1) * gap) / 2);
      const y = top + 22 + info + Math.max(0, Math.floor((H - top - 22 - info - 6 - ch) / 2));
      return { cards: idx.map((i) => ({ x: x0 + i * (cw + gap), y, w: cw, h: ch })), head: y - 16 - info, detail: null };
    }
    const gap = 4, ch = 32, cw = W - 8;
    const detailH = 66 + (info ? 26 : 0); // NPC-1: the drop's icons and odds under the warlord's lines
    const total = n * ch + (n - 1) * gap + 8 + detailH;
    const y0 = top + 20 + info + Math.max(0, Math.floor((H - top - 20 - info - 6 - total) / 2));
    const cards = idx.map((i) => ({ x: 4, y: y0 + i * (ch + gap), w: cw, h: ch }));
    return { cards, head: y0 - 15 - info, detail: { x: 4, y: y0 + n * ch + (n - 1) * gap + 8, w: cw, h: detailH } };
  }

  /** NPC-1 (REQ-BFG-078): a warlord's drop table on today's fork (the deck it would fight with: SABOTAGE's when pending). */
  dropOf(tier: Difficulty): DropTable {
    const run = this.run, id = this.fork.warlords[tier], sab = !!run.sabotage;
    return warlordDropTable(id, tier, warlordDeck(id, run.day, sab));
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
    if (this.leaving || this.menu || this.game.transitioning || this.dropList) return;
    const p = this.picks[i];
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
    this.sea.drawStill(g, { W, H, kind: seaForDay(run.day), dist: 0, t: 0, reduced: false, seed: stillSeaSeed(run.day), scale: this.game.view.scale, dpr: this.game.view.dpr });
    const L = this.layout();
    const npc = npcDayRules(); // NPC-1 (REQ-BFG-077): one fight to pick; the day's event comes after it
    drawText(g, `THE ROAD · DAY ${run.day}/${RUN_DAYS}`, W / 2, L.head, C.yellow, { align: "center", outline: C.ink });
    // RETUNE-1 run 2 (REQ-BFG-096): HEART on a hearts run (lifeWord), LIFE as before otherwise
    drawText(g, `${npc ? "PICK ONE FIGHT" : "PICK ONE STOP"} · WARLORDS NEVER COST A ${lifeWord(run)}`, W / 2, L.head + 9, C.slate4, { font: "3", align: "center" });
    if (npc) drawText(g, afterTheFight(f.event), W / 2, L.head + 18, C.amber, { font: "3", align: "center" });
    const v = this.v;
    v.t = this.t;
    v.calm = settings.reducedMotion;
    for (let i = 0; i < this.picks.length; i++) {
      const r = L.cards[i];
      const p = this.picks[i];
      v.key = i + 1;
      v.hover = !portrait && ui.hover === IDS[i];
      v.selected = portrait && this.sel === i;
      v.drop = undefined;
      if (p === "event") {
        v.notes = [];
        drawEventCard(g, r, f.event, run.hero, v, portrait);
      } else {
        const tier = p;
        const inf = this.info(tier);
        v.notes = inf.notes;
        if (npc && !portrait) v.drop = this.dropOf(tier); // NPC-1 (REQ-BFG-078): the desk card's drop row
        drawWarlordCard(g, r, f.warlords[tier], tier, inf.reward, v, portrait);
      }
      ui.add({ id: IDS[i], r, onTap: this.onTap[i], block: true });
      // NPC-1: the desk card's ⓘ (the full drop list), at its reward box's top right, over the card's own target
      if (v.drop) dropInfoButton(this.game, g, `forkinfo${i}`, r.x + r.w - 15, r.y + r.h - DROP_BOX + 3, this.dropList === p, () => this.openDrops(p as Difficulty));
    }
    if (L.detail) this.drawDetail(g, L.detail);
    drawRunBar(g, this.game, run, this.flash, this.anchors, this.onMenu);
    if (this.dropList) {
      const id = f.warlords[this.dropList];
      drawDropList(g, this.game, RIVALS[id].name, this.dropOf(this.dropList), () => { this.dropList = null; });
    }
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
    const p = this.picks[i];
    if (p === "event") {
      title = "ROAD EVENT";
      lines = ["NO FIGHT. TAKE ITS CHOICES, THEN DUSK."];
    } else {
      const tier = p, id = this.fork.warlords[tier], inf = this.info(tier);
      title = `${RIVALS[id].name}, ${RIVALS[id].trick}`; // U2b (REQ-BFG-032 rule 1, U2a-INPUTS 2): no middle dot
      const notes = inf.notes.map((n) => (n === "SABOTAGED" ? "! SABOTAGED: YESTERDAY'S DECK" : `! ${n} ON A WIN`));
      lines = [RIVALS[id].blurb, rewardText(inf.reward), `A LOSS COSTS NO ${lifeWord(this.run)}`, ...notes]; // RETUNE-1 run 2: HEART on a hearts run
      if (npcDayRules()) {
        // NPC-1 (REQ-BFG-078): the inspect panel's drop row: the parts as icons with their odds, and the ⓘ list
        const t = this.dropOf(tier), dy = r.y + r.h - 26;
        rect(g, r.x + 4, dy - 3, r.w - 8, 1, C.slate1);
        // HULL-1b (REQ-BFG-078): a Hard drop's star after the chance ("DROP 90% ★2"); the icons start after the line
        const dl = dropLine(t) + dropStarText(t), ix = Math.max(44, 9 + textWidth(dl, "3"));
        drawText(g, dl, r.x + 5, dy + 4, C.lime, { font: "3" });
        if (t.lines.length) drawDropIcons(g, t, r.x + ix, dy, r.w - ix - 80);
        dropInfoButton(this.game, g, "forkinfo", r.x + r.w - 78, dy + 2, this.dropList === tier, () => this.openDrops(tier));
      }
    }
    drawRich(g, captainSpans(title, C.yellow), r.x + 5, r.y + 5, "3"); // U2b: a keyword in its colour (REQ-BFG-032 rule 3)
    let y = r.y + 14;
    // U2b: a captain's blurb (the first line) in rich text, its keywords in their colours; the rest as before
    const rows = lines.flatMap((l, n) => (i > 0 && n === 0 ? wrapRich(captainSpans(l, C.bone), r.w - 74, "3")
      : wrap(l, r.w - 74, "3").map((ln): Span[] => [{ t: ln, c: ln.startsWith("!") ? C.amber : C.bone }])));
    for (const ln of rows.slice(0, 7)) {
      drawRich(g, ln, r.x + 5, y, "3");
      y += 7;
    }
    button(ui, g, "forkgo", { x: r.x + r.w - 62, y: r.y + r.h - 24, w: 58, h: 20 }, p === "event" ? "TAKE IT" : "FIGHT", {
      primary: true, onTap: () => this.pick(i),
    });
  }

  /** NPC-1 (REQ-BFG-078): open a warlord's full drop list (ⓘ); a tap anywhere closes it. */
  openDrops(tier: Difficulty): void {
    this.dropList = tier;
    this.game.audio.play("click");
  }

  key(k: string): void {
    if (k === "Escape" && this.dropList) this.dropList = null;
    else if (k === "Escape") this.menu = !this.menu;
    else if (this.menu) return;
    else if (k >= "1" && k <= String(this.picks.length) && k.length === 1) this.pick(Number(k) - 1);
  }
}

/** NPC-1 (REQ-BFG-077): the fork's info line for the day's event: "AFTER THE FIGHT: <EVENT TITLE>". */
export function afterTheFight(event: EventId): string {
  return `AFTER THE FIGHT: ${EVENTS[event].title}`;
}
