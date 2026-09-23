// Build-screen chrome: status bar, shop card row, cargo tray, FIGHT with its cue, the
// next-battle card, the details panel, drag feedback and the pause/options menu.

import { saveRun } from "../../game/run";
import { ITEMS, RUN_LIVES, RUN_WINS } from "../../sim/content";
import { beltUsed } from "../../sim/deck";
import { C } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { drawText } from "../../render/font";
import { beltIcon, coinIcon, heartIcon } from "../../render/sprites";
import { button, inside, itemSlot, panel } from "../../ui/ui";
import { optionsCard } from "../../ui/hud";
import { TitleScreen } from "../title";
import type { BuildScreen } from "./build";
import { drawCard, drawReroll, drawTag, drawTooltip } from "./shop";
import { drawDetails, drawFoe } from "./inspector";
import { drawCarry, drawFightCue, drawSuggestion } from "./cues";

function drawTopBar(g: G, s: BuildScreen): void {
  const { W, ui } = s.game;
  const run = s.run;
  rect(g, 0, 0, W, 14, C.ink);
  rect(g, 0, 13, W, 1, C.slate1);
  rect(g, 0, 12, W, 1, C.navy);
  ui.add({ id: "bar", r: { x: 0, y: 0, w: W, h: 14 }, block: true });
  drawText(g, `ROUND ${run.round}`, 4, 5, C.bone, { font: "3" });
  const gx = 40;
  g.drawImage(coinIcon(), gx, 4);
  drawText(g, String(run.gold), gx + 7, 4, C.yellow, { outline: C.ink });
  s.coinX = gx + 12;
  const hx = gx + 28;
  for (let i = 0; i < RUN_LIVES; i++) g.drawImage(heartIcon(i < run.lives), hx + i * 7, 4);
  let wx = hx + 25;
  for (let i = 0; i < RUN_WINS; i++) rect(g, wx + i * 5, 4, 4, 6, i < run.wins ? C.lime : C.slate1);
  wx += RUN_WINS * 5 + 6;
  const used = beltUsed(run.build), cap = run.build.beltCap;
  if (W >= 200) {
    g.drawImage(beltIcon(), wx, 6);
    drawText(g, `${used}/${cap}`, wx + 9, 5, used >= cap ? C.amber : C.bone, { font: "3" });
  }
  s.game.soundButton(g, { x: W - 27, y: 1, w: 25, h: 12 });
  button(ui, g, "menu", { x: W - 55, y: 1, w: 27, h: 12 }, "MENU", { font: "3", onTap: () => { s.menu = true; } });
}

function drawShop(g: G, s: BuildScreen): void {
  const L = s.L, run = s.run, t = s.t;
  const list = s.offers();
  const carry = s.ed.carry;
  let lastWagon = -1;
  for (let i = 0; i < list.length; i++) {
    const r0 = L.cards[i];
    if (!r0 || !L.tags) continue;
    const { wagon } = list[i];
    if (wagon !== lastWagon) drawTag(g, r0.x + s.caravan.dx(i, L.W), r0.y - 8, run.shop.wagons[wagon].merchant);
    lastWagon = wagon;
  }
  for (let i = 0; i < list.length; i++) {
    const r0 = L.cards[i];
    if (!r0) continue;
    const { wagon, slot } = list[i];
    const w = run.shop.wagons[wagon];
    const o = w.offers[slot];
    const r = { x: r0.x + s.caravan.dx(i, L.W), y: r0.y, w: r0.w, h: r0.h };
    const sel = s.sel.kind === "offer" && s.sel.wagon === wagon && s.sel.slot === slot;
    const shake = s.shakeT > 0 && s.shakeSrc.kind === "offer" && s.shakeSrc.wagon === wagon && s.shakeSrc.slot === slot ? s.shakeT : 0;
    drawCard(g, r, ITEMS[o.def], o.price, w.merchant, {
      sold: o.sold, affordable: run.gold >= o.price, selected: sel && !carry, hover: !!s.hover && s.hover.wagon === wagon && s.hover.slot === slot,
      pulse: !s.boughtOnce && s.sel.kind === "none", hidden: !!carry && carry.src.from === "offer" && carry.src.wagon === wagon && carry.src.slot === slot, shake,
    }, t);
  }
  const rr = { ...L.reroll, x: L.reroll.x + s.caravan.dx(list.length, L.W) };
  const ok = run.gold >= 2 && s.caravan.ready;
  drawReroll(g, rr, ok, s.game.ui.hover === "reroll", s.game.ui.pressed === "reroll");
  s.game.ui.add({ id: "reroll", r: rr, onTap: () => s.doReroll(), block: true });
}

function drawCargo(g: G, s: BuildScreen): void {
  const r = s.L.cargo;
  const run = s.run;
  panel(g, r, "inset");
  const carry = s.ed.carry;
  const items = run.inventory;
  if (!items.length) {
    drawText(g, "CARGO · EMPTY", r.x + r.w / 2, r.y + 9, C.slate3, { font: "3", align: "center" });
  } else {
    const n = s.cargoSlots();
    for (let i = 0; i < Math.min(n, items.length); i++) {
      const it = items[i];
      const sr = s.slotRect(i);
      const hidden = carry?.src.from === "cargo" && carry.uid === it.uid;
      const shake = s.shakeT > 0 && s.shakeSrc.kind === "cargo" && s.shakeSrc.uid === it.uid ? Math.round(Math.sin(s.shakeT * 70) * 2) : 0;
      itemSlot(g, sr.x + shake, sr.y, hidden ? null : it.def, s.sel.kind === "cargo" && s.sel.uid === it.uid, s.t);
      if (shake) frame(g, sr.x - 1 + shake, sr.y - 1, 20, 20, C.red);
    }
    if (items.length > n) drawText(g, `+${items.length - n}`, r.x + r.w - 3, r.y + 8, C.yellow, { font: "3", align: "right" });
  }
  if (carry && carry.src.from !== "cargo" && inside(r, s.ed.px, s.ed.py)) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.yellow);
}

export function drawBuildChrome(g: G, s: BuildScreen): void {
  const L = s.L;
  const ui = s.game.ui;
  drawShop(g, s);
  drawCargo(g, s);
  if (L.foe) drawFoe(g, s.run, L.foe);
  const cue = s.placedOnce && !s.ed.busy;
  button(ui, g, "fight", L.fight, "FIGHT!", { primary: true, blink: s.armed > 0, active: cue && Math.floor(s.t * 3) % 2 === 1, onTap: () => s.fight() });
  drawDetails(g, s, s.sel, s.hover, L.info);
  drawTopBar(g, s);
  // drag feedback and contextual cues
  const c = s.ed.carry;
  if (c) drawCarry(g, L, s.run.build, c, s.ed.px, s.ed.py, s.ed.carryT, (x, y) => s.turretAt(x, y));
  else {
    const held = s.ed.selectedCarry();
    if (held && !s.ed.busy) drawSuggestion(g, L, s.run.build, held.def, s.t);
  }
  if (cue) drawFightCue(g, L.fight, L.portrait, s.t);
  // mouse hover tooltip under the card
  if (s.hover && !c && s.caravan.ready) {
    const idx = s.offers().findIndex((q) => q.wagon === s.hover!.wagon && q.slot === s.hover!.slot);
    const o = s.run.shop.wagons[s.hover.wagon]?.offers[s.hover.slot];
    if (idx >= 0 && o && L.cards[idx]) drawTooltip(g, L.cards[idx], ITEMS[o.def], L.W);
  }
  if (s.menu) {
    optionsCard(s.game, g, "PAUSED", [
      { id: "resume", label: "RESUME", primary: true, onTap: () => { s.menu = false; } },
      { id: "quit", label: "SAVE & QUIT", onTap: () => { saveRun(s.run); s.game.go(new TitleScreen(s.game)); } },
      { id: "abandon", label: "ABANDON RUN", danger: true, onTap: () => { saveRun(null); s.game.run = null; s.game.go(new TitleScreen(s.game)); } },
    ], () => { s.menu = false; });
  }
}
