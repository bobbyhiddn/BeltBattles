// Road event (0.5.0, REQ-BQR-002): between leaving the caravan and the battle. A titled scene,
// two lines of flavour and 2-3 choice cards (mouse, touch or keys 1-3). After a pick: a short
// result beat (rewards fly to the HUD, SFX, toast); a deck part offers REFIT or FIGHT NOW,
// anything else rolls on to the battle. The run is saved the moment a choice resolves.

import type { Game, Screen } from "../../game/game";
import type { Sfx } from "../../audio/audio";
import { EVENTS, type Choice, type Delta } from "../../game/eventDefs";
import { choicesFor, pickChoice } from "../../game/events";
import { saveRun, shopBadge, type Run } from "../../game/run";
import { settings } from "../../core/settings";
import { Fx } from "../../render/fx";
import { C } from "../../render/palette";
import { rect, type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font";
import { SeaBackdrop } from "../../render/backdrop"; // CUSTOM-2a (REVIEW-MOTION2 Q1): the day's sea, held still
import { seaForDay, stillSeaSeed } from "../../render/motion";
import { drawScene } from "../../render/scenes";
import { blockedButton, button, panel, type Rect } from "../../ui/ui";
import { fightBlock } from "../../game/routeCheck";
import { optionsCard } from "../../ui/hud";
import { drawRunBar, newAnchors, type AnchorKind } from "../../ui/runbar";
import { heartsWord } from "../../ui/stakes"; // RETUNE-1 run 2 (REQ-BFG-096): PATCH UP's +1 HEART on a hearts run
import { heartsRun } from "../../sim/hearts"; // RETUNE-1 run 2: the run's mark
import { deltaIcon, deltaText, drawChoiceCard, itemName, type CardView } from "./cards";
import { drawReveal } from "./reveal";
import { storedFoe } from "../../game/day";
import { eventLayout, eventScale, type EventLayout } from "./layout";
import { duskScreen } from "../battle"; // 0.7.0a: the dusk gate (offline: 0.6.2's BattleScreen at once)
import { BuildScreen } from "../build/build";
import { TitleScreen } from "../title";
import { npcDayRules } from "../../sim/npcDay"; // NPC-1 (REQ-BFG-077): REFIT before every dusk
import { hullShown } from "../../sim/hullScale"; // HULL-1a (REQ-BFG-079): a hull gain on the day's hull

const AUTO = 1.9; // seconds after a pick before rolling on to the battle (no REFIT decision)
/** NPC-1 (REQ-BFG-077; NPC_DAY on): the event's one way on, REFIT before dusk. */
export const REFIT_LABEL = "REFIT";
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
  /** SCOUT's SPY: tonight's dusk deck is shown over the scene (then REFIT / FIGHT NOW). */
  reveal = false;
  private shake = { i: -1, t: 0 };
  private flies: Fly[] = [];
  private readonly flash: Record<AnchorKind, number> = { gold: 0, lives: 0, hull: 0, belt: 0, cargo: 0 };
  private readonly anchors = newAnchors();
  private readonly ufx = new Fx();
  /** CUSTOM-2a (REVIEW-MOTION2 Q1): one world on every screen. The day's sea, held still behind the cards: one cached
   *  blit a frame (render/backdrop.ts drawStill), as the build screen draws it. No layout or touch target moves. */
  private sea = new SeaBackdrop();
  private leaving = false;
  private readonly onPick = [0, 1, 2].map((i) => () => this.pick(i));
  private readonly onRefit = () => this.refit();
  private readonly onFight = () => this.fight();
  private readonly onMenu = () => { this.menu = true; };
  private readonly tmp = { x: 0, y: 0, w: 0, h: 0 };
  private readonly tmp2 = { x: 0, y: 0, w: 0, h: 0 };
  private readonly cv: CardView = { hover: false, pressed: false, state: "open", won: true, shake: 0, t: 0, flash: false };
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
      if (c) this.outcome = outcomeText(c, this.won, this.run.day, heartsRun(this.run)); // HULL-1a: the day's hull (RETUNE-1 run 2: HEART)
      this.deckItem = ev.item;
      this.reveal = !!ev.reveal;
    }
    this.L = this.layout();
  }

  pickScale(pw: number, ph: number, portrait: boolean): number {
    return eventScale(pw, ph, portrait);
  }

  get toastY(): number {
    // along the top of the scene, clear of the props on the road; under SCOUT's report: its foot
    return this.reveal ? this.L.scene.y + this.L.scene.h - 16 : this.L.scene.y + 4;
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
    this.reveal = !!this.run.event?.reveal;
    this.outcome = outcomeText(c, this.won, this.run.day, heartsRun(this.run)); // HULL-1a: the day's hull (RETUNE-1 run 2: HEART)
    const r = this.L.cards[i];
    const x0 = r.x + r.w / 2, y0 = r.y + 25;
    for (const d of c.cost) if (d.k === "gold") this.ufx.popup(this.anchors.gold.x, this.anchors.gold.y + 16, `-${d.n}`, C.red);
    if (this.won) {
      for (const d of c.gain) {
        const kind: AnchorKind | null = d.k === "gold" ? "gold" : d.k === "lives" ? "lives" : d.k === "hull" ? "hull" : d.k === "belt" ? "belt" : d.k === "item" ? "cargo" : null;
        if (kind) this.flies.push({ icon: deltaIcon(d), kind, text: d.k === "item" ? "+1" : deltaText(d, false, this.run.day).split(" ")[0], x0, y0, t: -0.08 * this.flies.length });
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
    // NPC-1 (REQ-BFG-077): with NPC_DAY on, REFIT comes before every dusk (0.9.7: only after a deck part or SCOUT's spy)
    if (this.phase !== "result" || !(npcDayRules() || this.deckItem || this.reveal)) return;
    this.run.stage = "refit";
    this.go(new BuildScreen(this.game));
  }

  fight(): void {
    if (this.phase !== "result") return;
    if (npcDayRules()) return this.refit(); // NPC-1: no FIGHT NOW: the one way on is REFIT, whose FIGHT goes to dusk
    this.run.stage = "battle";
    this.game.audio.play("go");
    this.go(duskScreen(this.game));
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
        this.ufx.popup(a.x, a.y + 16, f.text, C.lime);
        this.flies.splice(i, 1);
      }
    }
    this.ufx.update(dt);
    // NPC-1: with NPC_DAY on nothing rolls on by itself (REFIT is the one button)
    if (this.phase === "result" && !npcDayRules() && !this.deckItem && !this.reveal && this.pt >= AUTO) this.fight();
  }

  draw(g: G): void {
    const L = (this.L = this.layout());
    const { W, H, portrait, ui } = this.game;
    const run = this.run, ev = run.event!, def = EVENTS[ev.id];
    this.sea.drawStill(g, { W, H, kind: seaForDay(run.day), dist: 0, t: 0, reduced: false, seed: stillSeaSeed(run.day), scale: this.game.view.scale, dpr: this.game.view.dpr });
    panel(g, L.panel, "dark");
    const s = L.scene;
    rect(g, s.x - 1, s.y - 1, s.w + 2, s.h + 2, C.ink);
    // the part a salvage/trade shows; gone from the scene once salvaged or swapped
    const taken = (ev.id === "wreck" && ev.picked === 0) || (ev.id === "trader" && ev.picked === 1);
    const offer = taken ? "" : ev.id === "wreck" ? gainItem(this.choices[0]) ?? "temper" : ev.id === "trader" ? gainItem(this.choices[1]) ?? "coil" : "temper";
    drawScene(g, ev.id, s.x, s.y, s.w, s.h, run.hero, offer, this.t, settings.reducedMotion);
    const spied = this.reveal && this.phase === "result" && this.pt > 0.3 ? storedFoe(run) : null;
    if (spied) drawReveal(g, s, spied);
    this.drawHeader(g);
    // choice cards (after a pick: the chosen card slides to the first slot, the rest give way)
    const cv = this.cv;
    for (let i = 0; i < this.choices.length; i++) {
      const id = CARD_IDS[i];
      let r = L.cards[i];
      if (this.phase === "result") {
        if (i !== ev.picked && this.pt > 0.25) continue;
        if (i === ev.picked && i > 0) r = slide(L.cards[i], L.cards[0], Math.min(1, this.pt / 0.25), this.tmp);
      }
      cv.hover = ui.hover === id;
      cv.pressed = ui.pressed === id && ui.pointer.down;
      cv.state = this.phase === "choose" ? "open" : i === ev.picked ? "chosen" : "other";
      cv.won = this.won;
      cv.shake = this.shake.i === i ? this.shake.t : 0;
      cv.t = this.t;
      cv.flash = !settings.reducedMotion && this.phase === "result" && this.pt < 0.3 && Math.floor(this.pt * 20) % 2 === 0;
      // 0.6.1d2: the same MERGE/wait/MAX badge as the shop card, for a choice that gains an item.
      const itemGain = this.choices[i].gain.find((dl): dl is Extract<Delta, { k: "item" }> => dl.k === "item");
      cv.badge = itemGain ? shopBadge(run, itemGain.def) : null;
      cv.day = run.day; // HULL-1a (REQ-BFG-079): a hull amount on the day's hull
      drawChoiceCard(g, r, this.choices[i], i, cv);
      if (this.phase === "choose") ui.add({ id, r, onTap: this.onPick[i], block: true });
    }
    if (this.phase === "result" && this.pt > 0.3) this.drawOutcome(g);
    drawRunBar(g, this.game, run, this.flash, this.anchors, this.onMenu);
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

  /** Kind chip + title (+ flavour: a column beside the scene in landscape, under it in portrait). */
  private drawHeader(g: G): void {
    const L = this.L, run = this.run, def = EVENTS[run.event!.id];
    const kw = textWidth(def.kind, "3") + 6;
    if (!L.portrait) {
      let y = L.titleY;
      rect(g, L.titleX, y, kw, 8, C.amber);
      drawText(g, def.kind, L.titleX + 3, y + 2, C.ink, { font: "3" });
      y += 12;
      for (const ln of wrap(def.title, Math.floor(L.textW / 2))) {
        drawText(g, ln, L.titleX, y, C.yellow, { scale: 2, outline: C.ink });
        y += 17;
      }
      y += 3;
      for (const ln of wrap(`${def.text[0]} ${def.text[1]}`, L.textW, "3")) {
        drawText(g, ln, L.titleX, y, C.bone, { font: "3" });
        y += 8;
      }
      drawText(g, `DAY ${run.day} · ON THE ROAD`, L.titleX, L.panel.y + L.panel.h - 11, C.slate4, { font: "3" });
      return;
    }
    rect(g, L.titleX, L.titleY + 1, kw, 8, C.amber);
    drawText(g, def.kind, L.titleX + 3, L.titleY + 3, C.ink, { font: "3" });
    const tw = drawText(g, def.title, L.titleX + kw + 4, L.titleY + 1, C.yellow, { outline: C.ink });
    // portrait has no footer: the day sits at the end of the title row when it fits
    const day = `DAY ${run.day}`, right = L.panel.x + L.panel.w - 5;
    if (L.titleX + kw + 4 + tw + 6 + textWidth(day, "3") <= right) drawText(g, day, right, L.titleY + 2, C.slate4, { font: "3", align: "right" });
    for (let i = 0; i < 2; i++) drawText(g, def.text[i], L.textX, L.textY + i * 8, C.bone, { font: "3", align: "center" });
  }

  private drawOutcome(g: G): void {
    const L = this.L, ui = this.game.ui;
    const k = Math.min(1, (this.pt - 0.3) / 0.2);
    const o = L.outcome;
    const r = this.tmp2;
    r.x = o.x; r.y = o.y + Math.round((1 - k) * 10); r.w = o.w; r.h = o.h;
    panel(g, r, "raised");
    ui.add({ id: "outcome", r, block: true });
    const [text, color] = this.outcome;
    const stack = L.portrait || r.w < 240;
    const bh = 19;
    const spied = this.reveal ? storedFoe(this.run) : null;
    const sub = this.deckItem ? `${itemName(this.deckItem)} IS IN CARGO` : spied ? `DUSK: ${spied.name}` : "";
    const blockH = 7 + (sub ? 10 : 0) + 6 + bh; // stacked: text, sub line, buttons
    const top = r.y + Math.max(4, Math.floor((r.h - blockH) / 2));
    const by = stack ? top + blockH - bh : r.y + Math.floor((r.h - bh) / 2);
    const ty = stack ? top : r.y + Math.floor(r.h / 2) - 7;
    drawText(g, text, stack ? r.x + r.w / 2 : r.x + 8, ty, color, { outline: C.ink, align: stack ? "center" : "left" });
    if (npcDayRules()) {
      // NPC-1 (REQ-BFG-077): REFIT before every dusk: one button (its FIGHT goes to dusk)
      if (sub) drawText(g, sub, stack ? r.x + r.w / 2 : r.x + 8, ty + 11, C.slate4, { font: "3", align: stack ? "center" : "left" });
      const bw = stack ? r.w - 12 : 96;
      button(ui, g, "refit", { x: stack ? r.x + 6 : r.x + r.w - bw - 8, y: by, w: bw, h: bh }, REFIT_LABEL, { primary: true, onTap: this.onRefit });
    } else if (this.deckItem || this.reveal) {
      drawText(g, sub, stack ? r.x + r.w / 2 : r.x + 8, ty + 11, C.slate4, { font: "3", align: stack ? "center" : "left" });
      const bw = stack ? Math.floor((r.w - 16) / 2) : 68;
      const x0 = stack ? r.x + 6 : r.x + r.w - 2 * bw - 12;
      button(ui, g, "refit", { x: x0, y: by, w: bw, h: bh }, "REFIT", { primary: true, onTap: this.onRefit });
      const fr = { x: x0 + bw + 4, y: by, w: bw, h: bh };
      const why = fightBlock(this.run.build); // a dead-end or broken belt: REFIT first (routeCheck.ts)
      if (why) blockedButton(ui, g, "fightnow", fr, "FIGHT NOW", why);
      else button(ui, g, "fightnow", fr, "FIGHT NOW", { onTap: this.onFight });
    } else {
      const bw = stack ? r.w - 12 : 80;
      button(ui, g, "evfight", { x: stack ? r.x + 6 : r.x + r.w - bw - 8, y: by, w: bw, h: bh }, "FIGHT!", { primary: true, onTap: this.onFight });
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

function slide(a: Rect, b: Rect, k: number, out: Rect): Rect {
  const e = k * k * (3 - 2 * k);
  out.x = Math.round(a.x + (b.x - a.x) * e);
  out.y = Math.round(a.y + (b.y - a.y) * e);
  out.w = a.w;
  out.h = a.h;
  return out;
}

function gainItem(c: Choice | undefined): string | undefined {
  const d = c?.gain.find((q) => q.k === "item");
  return d && d.k === "item" ? d.def : undefined;
}

/** HULL-1a (REQ-BFG-079): `day`, the run's day (a hull gain reads the day's number with HULL_SCALE on). */
export function outcomeText(c: Choice, won: boolean, day?: number, hearts = false): [string, string] {
  if (c.odds !== undefined) {
    const g = c.gain.find((d) => d.k === "gold");
    return won ? [`THE DICE LOVE YOU! +${g && g.k === "gold" ? g.n : 0} GOLD`, C.lime] : ["THE DICE SAY NO", C.red];
  }
  const d = c.gain[0];
  if (!d) return ["YOU MOVE ON", C.bone];
  switch (d.k) {
    case "item": return [`GOT ${itemName(d.def)}`, C.lime]; // the outcome panel adds "<PART> IS IN CARGO"
    case "gold": return [`+${d.n} GOLD`, C.yellow];
    case "hull": return [`+${hullShown(d.n, day)} MAX HULL`, C.lime];
    case "lives": return [`+${d.n} ${hearts ? heartsWord(d.n) : "LIFE"}`, C.lime]; // RETUNE-1 run 2: `hearts`, a hearts run's PATCH UP
    case "belt": return [`+${d.n} BELT CAPACITY`, C.lime];
    case "bounty": return [`STAKED: +${d.n} ON YOUR NEXT HARD WIN`, C.amber];
    case "sabotage": return ["SAPPERS HIRED: NEXT WARLORD WEAKER", C.lime];
    case "reveal": return ["SCOUTED: TONIGHT'S DUSK DECK", C.lime];
    case "discount": return [`NEXT CARAVAN: PRICES -${d.n}`, C.lime];
    case "reroll": return [`NEXT CARAVAN: ${d.n} FREE REROLL`, C.lime];
    default: return ["DONE", C.bone];
  }
}

function sfxFor(c: Choice, won: boolean): Sfx {
  if (c.odds !== undefined) return won ? "win" : "lose";
  const d = c.gain[0];
  if (!d) return "whoosh";
  return d.k === "item" ? "pickup" : d.k === "gold" || d.k === "discount" || d.k === "reroll" ? "coin" : d.k === "bounty" ? "horn"
    : d.k === "sabotage" ? "stamp" : d.k === "reveal" ? "whoosh" : "repair";
}
