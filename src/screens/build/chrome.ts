// Build-screen chrome: status bar, shop card row, cargo tray, FIGHT with its cue, the
// next-battle card, the details panel, drag feedback and the pause/options menu.

import { packPrice, saveRun, shopBadge } from "../../game/run";
import { record } from "../../game/day";
import { ITEMS, PACK_IDS, PACK_ITEM, REROLL_COST, RUN_DAYS } from "../../sim/content";
import { packRects } from "./layout"; // bb-0.8.6 (REQ-BFG-051 P5): the two fixed pack slots
import { beltUsed } from "../../sim/deck";
import { starsOf } from "../../sim/stars";
import { C } from "../../render/palette";
import { frame, rect, type G } from "../../render/pixel";
import { drawText, textWidth, wrap } from "../../render/font";
import { beltIcon, coinIcon } from "../../render/sprites";
import { button, inside, itemSlot, panel, tapRect } from "../../ui/ui";
import { tapPx } from "../../ui/tap"; // zoom (D4)
import { heroCardRect } from "./layout"; // zoom (D2)
import { optionsCard } from "../../ui/hud";
import { TitleScreen } from "../title";
import { drawHearts } from "../battleHud";
import type { BuildScreen } from "./build";
import { drawCard, drawPack, drawReroll, drawTag, drawTooltip } from "./shop";
import { drawDetails, drawFoe, hasDetails, textOpts } from "./inspector";
import { abilityText, cardText } from "../../ui/abilityText"; // 0.6.2t (T5): the card's one-line effect, the tooltip's
import { drawCarry, drawFightCue, drawSuggestion } from "./cues";
import { drawBeltX } from "./beltx"; // shoptap (D3)
import { deleteRoute } from "./actions"; // shoptap (D3): the X removes the belt as REMOVE BELT does
import { faceLines } from "../../ui/faces"; // U2c group 0 fix 3: the packs' faces in their tooltips

/** Status bar: DAWN · DAY n/10, gold, the 5 hearts, the W-L record (landscape; portrait keeps it in
 *  the hero card below the shop), belt use when there is room, then MENU and SND. */
function drawTopBar(g: G, s: BuildScreen): void {
  const { W, ui } = s.game;
  const run = s.run;
  rect(g, 0, 0, W, 14, C.ink);
  rect(g, 0, 13, W, 1, C.slate1);
  rect(g, 0, 12, W, 1, C.navy);
  ui.add({ id: "bar", r: { x: 0, y: 0, w: W, h: 14 }, block: true });
  const narrow = W < 200;
  const sndW = narrow ? 19 : 25, menuW = narrow ? 21 : 27;
  const sndX = W - 2 - sndW, menuX = sndX - 1 - menuW;
  let x = 4;
  x += drawText(g, "DAWN", x, 5, C.amber, { font: "3" });
  x += drawText(g, ` · DAY ${run.day}/${RUN_DAYS}`, x, 5, C.bone, { font: "3" }) + 5;
  g.drawImage(coinIcon(), x, 4);
  s.coinX = x + 5;
  x += 7 + drawText(g, String(run.gold), x + 7, 4, C.yellow, { outline: C.ink }) + 5;
  x += drawHearts(g, x, 4, run.lives) + 5;
  // the W-L record: labelled where it fits, bare beside the hearts on narrow portrait bars (the
  // phone's bar has no room, so its hero card below the shop carries the record)
  const wl = record(run);
  if (x + textWidth(`W-L ${wl}`, "3") <= menuX - 4) {
    x += drawText(g, "W-L", x, 5, C.slate4, { font: "3" }) + 3;
    x += drawText(g, wl, x, 5, C.white, { font: "3" }) + 7;
  } else if (x + textWidth(wl, "3") <= menuX - 4) x += drawText(g, wl, x, 5, C.white, { font: "3" }) + 7;
  const used = beltUsed(run.build), cap = run.build.beltCap;
  const bt = `${used}/${cap}`;
  if (x + 9 + textWidth(bt, "3") <= menuX - 3) {
    g.drawImage(beltIcon(), x, 6);
    drawText(g, bt, x + 9, 5, used >= cap ? C.amber : C.bone, { font: "3" });
  }
  // zoom (REQ-BFG-040, D4): on a phone's layout SND and MENU take the bar and the gap above the shop as their targets
  // (down to 1 px above the first card row: lower, they would take a card's or a grown panel's presses)
  const tap = s.L.phone ? tapPx(s.game.view) : 0;
  const room = { x: 0, y: 0, w: W, h: Math.min(...s.L.cards.map((c) => c.y), s.L.reroll.y) - 1 };
  const sndR = { x: sndX, y: 1, w: sndW, h: 12 }, menuR = { x: menuX, y: 1, w: menuW, h: 12 };
  s.game.soundButton(g, sndR, tap ? tapRect(sndR, tap, room) : undefined);
  button(ui, g, "menu", menuR, "MENU", { font: "3", onTap: () => { s.menu = true; }, ...(tap ? { hit: tapRect(menuR, tap, room) } : {}) });
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
      badge: o.sold ? null : shopBadge(run, o.def), // 0.6.1d: live, never stored on the offer
      effect: cardText(o.def, textOpts(run)), // 0.6.2t (T5): drawn on a wide (landscape) card
    }, t);
  }
  const rr = { ...L.reroll, x: L.reroll.x + s.caravan.dx(list.length, L.W) };
  const free = run.shop.free > 0;
  const ok = (free || run.gold >= REROLL_COST) && s.caravan.ready;
  drawReroll(g, rr, ok, s.game.ui.hover === "reroll", s.game.ui.pressed === "reroll", free);
  s.game.ui.add({ id: "reroll", r: rr, onTap: () => s.doReroll(), block: true });
  // bb-0.8.6 (REQ-BFG-051, PACKS P5): the two fixed packs beside REROLL; they stay put while the caravan rolls in and out
  packRects(L).forEach((r, i) => {
    const id = PACK_IDS[i];
    drawPack(g, r, id, run.gold >= packPrice(id), s.game.ui.hover === `pack-${id}`, s.game.ui.pressed === `pack-${id}`);
    s.game.ui.add({ id: `pack-${id}`, r, onTap: () => s.doPack(id), block: true });
  });
}

/** Refit after a road event: the caravan's row becomes one bolted notice (no cards, no reroll). */
function drawRefitBanner(g: G, s: BuildScreen): void {
  const L = s.L;
  const first = L.cards[0], last = L.reroll;
  const x = Math.min(first.x, last.x), y = first.y - (L.tags ? 7 : 0);
  const r = { x, y, w: Math.max(first.x + first.w, last.x + last.w) - x, h: Math.max(first.y + first.h, last.y + last.h) - y };
  panel(g, r, "dark");
  s.game.ui.add({ id: "refitbanner", r, block: true });
  const cx = r.x + r.w / 2, big = r.h >= 44;
  // lines wrap to the panel (narrow portrait screens get more, shorter lines)
  const info = wrap(`AFTER ${s.refitFrom()} · THE CARAVAN HAS MOVED ON`, r.w - 10, "3");
  const hint = wrap("PLACE YOUR NEW PARTS, THEN FIGHT", r.w - 10, "3");
  const blockH = (big ? 14 : 7) + 4 + (info.length + hint.length) * 8;
  let ty = r.y + Math.max(4, Math.floor((r.h - blockH) / 2));
  drawText(g, "ROAD REFIT", cx, ty, C.yellow, { align: "center", outline: C.ink, scale: big ? 2 : 1 });
  ty += (big ? 14 : 7) + 5;
  for (const ln of info) { drawText(g, ln, cx, ty, C.bone, { font: "3", align: "center" }); ty += 8; }
  for (const ln of hint) { drawText(g, ln, cx, ty, C.slate4, { font: "3", align: "center" }); ty += 8; }
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
    const survivorUid = s.survivorUid(); // 0.6.1d2: the shop hover/selection's merge-target ring
    const fc = s.fuseAnimCargo(); // 0.6.1d2: the merge animation's pip override, if it's in cargo
    for (let i = 0; i < Math.min(n, items.length); i++) {
      const it = items[i];
      const sr = s.slotRect(i);
      const hidden = carry?.src.from === "cargo" && carry.uid === it.uid;
      const shake = s.shakeT > 0 && s.shakeSrc.kind === "cargo" && s.shakeSrc.uid === it.uid ? Math.round(Math.sin(s.shakeT * 70) * 2) : 0;
      const stars = hidden ? 1 : fc && fc.uid === it.uid ? fc.showStars : starsOf(it);
      itemSlot(g, sr.x + shake, sr.y, hidden ? null : it.def, s.sel.kind === "cargo" && s.sel.uid === it.uid, s.t, stars, !hidden && it.uid === survivorUid);
      if (shake) frame(g, sr.x - 1 + shake, sr.y - 1, 20, 20, C.red);
    }
    if (items.length > n) drawText(g, `+${items.length - n}`, r.x + r.w - 3, r.y + 8, C.yellow, { font: "3", align: "right" });
  }
  if (carry && carry.src.from !== "cargo" && inside(r, s.ed.px, s.ed.py)) frame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, C.yellow);
}

/** FIGHT! beside the bow. A dead-end or broken belt (s.block) disables it and names why: under
 *  FIGHT! when it fits, else as the label; a press toasts it (BuildScreen.fight). */
function drawFight(g: G, s: BuildScreen, cue: boolean): void {
  const ui = s.game.ui, r = s.L.fight, why = s.block;
  // zoom (REQ-BFG-040, D4): on a phone's layout FIGHT is a finger's target (TAP_CSS CSS px tall) at the smaller scale
  const foot = s.L.hull.y + s.L.hull.h + 1;
  const hit = s.L.phone ? { hit: tapRect(r, tapPx(s.game.view), { x: 0, y: foot, w: s.game.W, h: s.game.H - foot }) } : {};
  if (!why) {
    button(ui, g, "fight", r, "FIGHT!", { primary: true, blink: s.armed > 0, active: cue && Math.floor(s.t * 3) % 2 === 1, onTap: () => s.fight(), ...hit });
    return;
  }
  button(ui, g, "fight", r, "", { disabled: true, onBlocked: () => s.fight(), ...hit });
  const both = r.h >= 28 && textWidth(why, "3") <= r.w - 6;
  const lines = both ? [why] : wrap(why, r.w - 6, "3");
  const h = (both ? 11 : 0) + lines.length * 7 - 2;
  let y = r.y + Math.floor((r.h - 1 - h) / 2);
  if (both) {
    drawText(g, "FIGHT!", r.x + r.w / 2, y, C.slate3, { align: "center" });
    y += 11;
  }
  for (const ln of lines) {
    drawText(g, ln, r.x + r.w / 2, y, C.red, { font: "3", align: "center" });
    y += 7;
  }
}

export function drawBuildChrome(g: G, s: BuildScreen): void {
  const L = s.L;
  const ui = s.game.ui;
  if (s.refit) drawRefitBanner(g, s);
  else drawShop(g, s);
  drawCargo(g, s);
  const cue = s.placedOnce && !s.ed.busy && !s.block;
  drawFight(g, s, cue);
  // contextual placement cue for a selected card or cargo part. 0.6.1r (item 11): drawn before the details panel,
  // so in portrait the panel covers the part of a lifted gear/core that hovers over its turret up into the info
  // band (it hid the panel's text); in landscape the two never meet
  const c = s.ed.carry;
  const held = c ? null : s.ed.selectedCarry();
  if (held && !s.ed.busy) drawSuggestion(g, L, s.run.build, held.def, s.t);
  if (!L.portrait) {
    if (L.foe) drawFoe(g, s.foe, L.foe, s.note());
    drawDetails(g, s, s.sel, s.hover, L.info, s.foe, s.note());
  } else if (hasDetails(s, s.sel, s.hover) || !L.foe) {
    // a selection or hover uses the whole band. shoptap2 (REQ-BFG-034, -035): after a finger's tap, where the band is
    // shorter than a panel needs (a phone browser's toolbars take part of the screen), the panel grows (BuildScreen.panelArea);
    // a press on what it covers goes on to the screen beneath (a tap reads the part or card under it, a drag lifts it)
    const area = s.panelArea();
    const through = area !== L.info ? { band: L.info, press: (x: number, y: number) => s.down(x, y, s.game.ui.pointer.kind) } : undefined;
    drawDetails(g, s, s.sel, s.hover, area, s.foe, s.note(), through);
  } else {
    // idle portrait band: hero card over the NEXT BATTLE panel (zoom: on a phone's taller band, the pair in its middle)
    drawFoe(g, s.foe, L.foe, s.note());
    const top = heroCardRect(L.info, L.foe);
    if (top.h >= 30) drawDetails(g, s, s.sel, s.hover, top, s.foe, s.note());
  }
  drawTopBar(g, s);
  // shoptap (D3, REQ-BFG-036): the belt X a touch tap put up; a tap on it removes the whole belt (REMOVE BELT's path)
  const bx = s.ed.beltX(), br = bx ? s.beltXRect(bx) : null;
  if (bx && br) drawBeltX(g, ui, L, bx, br, () => deleteRoute(s, bx.index));
  // drag feedback (the placement suggestion is drawn above, before the details panel)
  if (c) drawCarry(g, L, s.run.build, c, s.ed.px, s.ed.py, s.ed.carryT, (x, y) => s.turretAt(x, y));
  if (cue) drawFightCue(g, L.fight, L.portrait, s.t);
  // mouse hover tooltip under the card
  if (s.hover && !c && s.caravan.ready) {
    const idx = s.offers().findIndex((q) => q.wagon === s.hover!.wagon && q.slot === s.hover!.slot);
    const o = s.run.shop.wagons[s.hover.wagon]?.offers[s.hover.slot];
    // 0.6.2t (T5): the offer's opening sentence, as its panel and card read it
    if (idx >= 0 && o && L.cards[idx]) drawTooltip(g, L.cards[idx], ITEMS[o.def], L.W, abilityText(o.def, 1, textOpts(s.run)).sentences[0] ?? "");
  }
  // bb-0.8.6 (REQ-BFG-051, PACKS P5): a mouse over a pack slot: its name and one-line text, as an offer's tooltip reads
  const ph = s.refit || c ? -1 : PACK_IDS.findIndex((id) => ui.hover === `pack-${id}`);
  if (ph >= 0) {
    const def = PACK_ITEM[PACK_IDS[ph]];
    // U2c group 0 fix 3: the pack's face, "+4 BELT TILES FOR THE RUN." and "+25 {HULL} FOR THE RUN." (the tooltip's layout
    // as before: one line of its 3x5 text)
    drawTooltip(g, packRects(L)[ph], ITEMS[def], L.W, faceLines(def, 1)?.rules[0]?.text ?? abilityText(def, 1, textOpts(s.run)).sentences[0] ?? "");
  }
  if (s.menu) {
    optionsCard(s.game, g, "PAUSED", [
      { id: "resume", label: "RESUME", primary: true, onTap: () => { s.menu = false; } },
      { id: "quit", label: "SAVE & QUIT", onTap: () => { saveRun(s.run); s.game.go(new TitleScreen(s.game)); } },
      { id: "abandon", label: "ABANDON RUN", danger: true, onTap: () => { saveRun(null); s.game.run = null; s.game.go(new TitleScreen(s.game)); } },
    ], () => { s.menu = false; });
  }
}
