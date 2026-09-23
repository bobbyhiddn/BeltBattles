// Road event (0.5.0, REQ-BQR-002): between leaving the caravan and the battle. A titled scene,
// two lines of flavour and 2-3 choice cards (mouse, touch or keys 1-3). After a pick: a short
// result beat (rewards fly to the HUD, SFX, toast); a deck part offers REFIT or FIGHT NOW,
// anything else rolls on to the battle. The run is saved the moment a choice resolves.

import type { Game, Screen } from "../../game/game";
import type { Sfx } from "../../audio/audio";
import { EVENTS, type Choice } from "../../game/eventDefs";
import { choicesFor, pickChoice } from "../../game/events";
import { saveRun, type Run } from "../../game/run";
import { settings } from "../../core/settings";
import { ITEMS } from "../../sim/content";
import { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth } from "../../render/font";
import { ArenaBg } from "../../render/arenaBg";
import { drawScene } from "../../render/scenes";
import { button, panel } from "../../ui/ui";
import { optionsCard } from "../../ui/hud";
import { drawRunBar, newAnchors, type AnchorKind } from "../../ui/runbar";
import { deltaIcon, deltaText, drawChoiceCard, itemName } from "./cards";
import { eventLayout, eventScale, type EventLayout } from "./layout";
import { BattleScreen } from "../battle";
import { BuildScreen } from "../build/build";
import { TitleScreen } from "../title";

const AUTO = 1.9; // seconds after a pick before rolling on to the battle (no REFIT decision)
const CARD_IDS = ["choice0", "choice1", "choice2"];

interface Fly { icon: HTMLCanvasElement | null; kind: AnchorKind; text: string; x0: number; y0: number; t: number }

export class EventScreen implements Screen {
  readonly run: Run;
  L: EventLayout;
  choices: Choice[];
  phase: "choose" | "result" = "choose";
  pt = 0;
  t = 0;
  menu = false;
  won = true;
  outcome: [string, string] = ["", C.bone];
  deckItem: string | undefined;
  private shake = { i: -1, t: 0 };
  private flies: Fly[] = [];
  private readonly flash: Record<AnchorKind, number> = { gold: 0, lives: 0, hull: 0, belt: 0, cargo: 0 };
  private readonly anchors = newAnchors();
  private readonly ufx = new Fx();
  private bg = new ArenaBg();
  private leaving = false;
  private readonly onPick = [0, 1, 2].map((i) => () => this.pick(i));
  private readonly cv = { hover: false, pressed: false, state: "open" as "open" | "chosen" | "other", won: true, shake: 0, t: 0, flash: false };
  private lkey = "";

  constructor(public game: Game) {
    if (!game.run?.event) throw new Error("EventScreen needs a run on the road");
    this.run = game.run;
    this.choices = choicesFor(this.run);
    const ev = this.run.event!;
    if (ev.picked >= 0) {
      // reloaded after the pick: show the outcome, never the choice again
      this.phase = "result";
      this.pt = 9;
      this.won = ev.won ?? true;
      const c = this.choices[ev.picked];
      if (c) this.outcome = outcomeText(c, this.won);
      this.deckItem = ev.item;
    }
    this.L = this.layout();
  }

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return eventScale(pw, ph, portrait);
  }

  get toastY(): number {
    return Math.round(this.L.scene.y + this.L.scene.h / 2 - 6);
  }

  private layout(): EventLayout {
    const { W, H, portrait } = this.game;
    const k = `${W}x${H}${portrait}`;
    if (k !== this.lkey || !this.L) {
      this.lkey = k;
      this.L = eventLayout(W, H, portrait, this.choices.length);
    }
    return this.L;
  }

  enter(): void {
    this.L = this.layout();
    this.game.audio.music("prep");
    if (this.phase === "choose") this.game.audio.play("whoosh");
    saveRun(this.run);
  }

  pick(i: number): void {
    if (this.phase !== "choose" || this.menu || this.game.transitioning) return;
    const c = this.choices[i];
    if (!c) return;
    const res = pickChoice(this.run, i);
    if (!res.ok) {
      this.shake = { i, t: 0.32 };
      this.game.error(res.reason ?? "CAN'T DO THAT");
      return;
    }
    saveRun(this.run); // resolved and saved: reloading can't take it again
    this.phase = "result";
    this.pt = 0;
    this.won = !!res.won;
    this.deckItem = res.deckItem;
    this.outcome = outcomeText(c, this.won);
    const r = this.L.cards[i];
    const x0 = r.x + r.w / 2, y0 = r.y + 25;
    for (const d of c.cost) if (d.k === "gold") this.ufx.popup(this.anchors.gold.x, this.anchors.gold.y + 10, `-${d.n}`, C.red);
    if (this.won) {
      for (const d of c.gain) {
        const kind: AnchorKind | null = d.k === "gold" ? "gold" : d.k === "lives" ? "lives" : d.k === "hull" ? "hull" : d.k === "belt" ? "belt" : d.k === "item" ? "cargo" : null;
        if (kind) this.flies.push({ icon: deltaIcon(d), kind, text: d.k === "item" ? "+1" : deltaText(d, false).split(" ")[0], x0, y0, t: -0.08 * this.flies.length });
      }
    }
    this.game.toast(this.outcome[0], this.outcome[1], sfxFor(c, this.won));
  }

  private go(next: Screen): void {
    if (this.leaving) return;
    this.leaving = true;
    saveRun(this.run);
    this.game.go(next);
  }

  refit(): void {
    if (this.phase !== "result" || !this.deckItem) return;
    this.run.stage = "refit";
    this.go(new BuildScreen(this.game));
  }

  fight(): void {
    if (this.phase !== "result") return;
    this.run.stage = "battle";
    this.game.audio.play("go");
    this.go(new BattleScreen(this.game));
  }

  update(dt: number): void {
    this.t += dt;
    if (this.menu) return;
    this.pt += dt;
    this.shake.t = Math.max(0, this.shake.t - dt);
    for (const k of Object.keys(this.flash) as AnchorKind[]) this.flash[k] = Math.max(0, this.flash[k] - dt);
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      f.t += dt;
      if (f.t >= 0.55) {
        const a = this.anchors[f.kind];
        this.flash[f.kind] = 0.3;
        this.ufx.popup(a.x, a.y + 10, f.text, C.lime);
        this.flies.splice(i, 1);
      }
    }
    this.ufx.update(dt);
    if (this.phase === "result" && !this.deckItem && this.pt >= AUTO) this.fight();
  }

  draw(g: G): void {
    const L = (this.L = this.layout());
    const { W, H, portrait, ui } = this.game;
    const run = this.run, ev = run.event!, def = EVENTS[ev.id];
    this.bg.draw(g, W, H, { hulls: [], vertical: portrait, gapLine: false }, this.t);
    panel(g, L.panel, "dark");
    // header: kind chip + title (+ round on wide screens)
    const kw = textWidth(def.kind, "3") + 6;
    rect(g, L.panel.x + 4, L.titleY + (L.titleScale > 1 ? 3 : 1), kw, 8, C.amber);
    drawText(g, def.kind, L.panel.x + 7, L.titleY + (L.titleScale > 1 ? 5 : 3), C.ink, { font: "3" });
    drawText(g, def.title, L.panel.x + 9 + kw, L.titleY, C.yellow, { scale: L.titleScale, outline: C.ink });
    if (!portrait) drawText(g, `ROUND ${run.round} · ON THE ROAD`, L.panel.x + L.panel.w - 6, L.titleY + 5, C.slate4, { font: "3", align: "right" });
    const s = L.scene;
    rect(g, s.x - 1, s.y - 1, s.w + 2, s.h + 2, C.ink);
    const offer = ev.id === "wreck" ? gainItem(this.choices[0]) ?? "temper" : ev.id === "trader" ? gainItem(this.choices[1]) ?? "coil" : "temper";
    drawScene(g, ev.id, s.x, s.y, s.w, s.h, run.hero, offer, this.t, settings.reducedMotion);
    for (let i = 0; i < 2; i++) drawText(g, def.text[i], W / 2, L.textY + i * 8, C.bone, { font: "3", align: "center" });
    // choice cards
    const cv = this.cv;
    for (let i = 0; i < this.choices.length; i++) {
      const r = L.cards[i];
      const id = CARD_IDS[i];
      cv.hover = ui.hover === id;
      cv.pressed = ui.pressed === id && ui.pointer.down;
      cv.state = this.phase === "choose" ? "open" : i === ev.picked ? "chosen" : "other";
      cv.won = this.won;
      cv.shake = this.shake.i === i ? this.shake.t : 0;
      cv.t = this.t;
      cv.flash = !settings.reducedMotion && this.phase === "result" && this.pt < 0.3 && Math.floor(this.pt * 20) % 2 === 0;
      drawChoiceCard(g, r, this.choices[i], i, cv);
      if (this.phase === "choose") ui.add({ id, r, onTap: this.onPick[i], block: true });
    }
    if (this.phase === "result" && this.pt > 0.6) this.drawOutcome(g);
    drawRunBar(g, this.game, run, this.flash, this.anchors, () => { this.menu = true; });
    this.drawFlies(g);
    this.ufx.drawPops(g, 0, 0);
    if (this.menu) {
      optionsCard(this.game, g, "PAUSED", [
        { id: "resume", label: "RESUME", primary: true, onTap: () => { this.menu = false; } },
        { id: "quit", label: "SAVE & QUIT", onTap: () => { saveRun(this.run); this.game.go(new TitleScreen(this.game)); } },
      ], () => { this.menu = false; });
    }
  }

  private drawFlies(g: G): void {
    for (const f of this.flies) {
      if (f.t < 0 || !f.icon) continue;
      const p = Math.min(1, f.t / 0.55), e = p * p * (3 - 2 * p);
      const a = this.anchors[f.kind];
      const x = f.x0 + (a.x - f.x0) * e, y = f.y0 + (a.y - f.y0) * e - Math.sin(p * Math.PI) * 18;
      g.drawImage(f.icon, Math.round(x - f.icon.width / 2), Math.round(y - f.icon.height / 2));
    }
  }

  private drawOutcome(g: G): void {
    const L = this.L, ui = this.game.ui;
    const k = Math.min(1, (this.pt - 0.6) / 0.2);
    const r = { ...L.actions, y: L.actions.y + Math.round((1 - k) * 12) };
    panel(g, r, "raised");
    ui.add({ id: "outcome", r, block: true });
    const [text, color] = this.outcome;
    drawText(g, text, L.portrait ? r.x + r.w / 2 : r.x + 10, r.y + (L.portrait ? 7 : Math.floor(r.h / 2) - 3), color, { outline: C.ink, align: L.portrait ? "center" : "left" });
    const bh = 19, by = L.portrait ? r.y + r.h - bh - 5 : r.y + Math.floor((r.h - bh) / 2);
    if (this.deckItem) {
      const bw = L.portrait ? Math.floor((r.w - 16) / 2) : 76;
      const x0 = L.portrait ? r.x + 6 : r.x + r.w - 2 * bw - 14;
      button(ui, g, "refit", { x: x0, y: by, w: bw, h: bh }, "REFIT", { primary: true, onTap: () => this.refit() });
      button(ui, g, "fightnow", { x: x0 + bw + 4, y: by, w: bw, h: bh }, "FIGHT NOW", { onTap: () => this.fight() });
      if (!L.portrait) drawText(g, `${itemName(this.deckItem)} IS IN CARGO`, r.x + 10, r.y + Math.floor(r.h / 2) + 7, C.slate4, { font: "3" });
    } else {
      const bw = L.portrait ? r.w - 12 : 90;
      button(ui, g, "evfight", { x: L.portrait ? r.x + 6 : r.x + r.w - bw - 8, y: by, w: bw, h: bh }, "FIGHT!", { primary: true, onTap: () => this.fight() });
    }
  }

  key(k: string): void {
    if (k === "Escape") this.menu = !this.menu;
    else if (this.menu) return;
    else if (k === "1" || k === "2" || k === "3") this.pick(Number(k) - 1);
    else if ((k === "r" || k === "R") && this.pt > 0.3) this.refit();
    else if ((k === "f" || k === "F" || k === "Enter" || k === " ") && this.pt > 0.3) this.fight();
  }
}

function gainItem(c: Choice | undefined): string | undefined {
  const d = c?.gain.find((q) => q.k === "item");
  return d && d.k === "item" ? d.def : undefined;
}

export function outcomeText(c: Choice, won: boolean): [string, string] {
  if (c.odds !== undefined) {
    const g = c.gain.find((d) => d.k === "gold");
    return won ? [`THE DICE LOVE YOU! +${g && g.k === "gold" ? g.n : 0} GOLD`, C.lime] : ["THE DICE SAY NO", C.red];
  }
  const d = c.gain[0];
  if (!d) return ["YOU MOVE ON", C.bone];
  switch (d.k) {
    case "item": return [`GOT ${itemName(d.def)}${ITEMS[d.def].kind === "supply" ? "" : " · TO CARGO"}`, C.lime];
    case "gold": return [`+${d.n} GOLD`, C.yellow];
    case "hull": return [`+${d.n} MAX HULL`, C.lime];
    case "lives": return [`+${d.n} LIFE`, C.lime];
    case "belt": return [`+${d.n} BELT CAPACITY`, C.lime];
    case "bounty": return ["CHALLENGE ACCEPTED", C.amber];
    case "foeHull": return [`FOE HULL ${d.n} THIS ROUND`, C.lime];
    case "discount": return [`NEXT CARAVAN: PRICES -${d.n}`, C.lime];
    case "reroll": return [`NEXT CARAVAN: ${d.n} FREE REROLL`, C.lime];
    default: return ["DONE", C.bone];
  }
}

function sfxFor(c: Choice, won: boolean): Sfx {
  if (c.odds !== undefined) return won ? "win" : "lose";
  const d = c.gain[0];
  if (!d) return "whoosh";
  return d.k === "item" ? "pickup" : d.k === "gold" || d.k === "discount" || d.k === "reroll" ? "coin" : d.k === "bounty" ? "horn" : d.k === "foeHull" ? "stamp" : "repair";
}
