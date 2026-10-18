// Build-screen chrome: status bar, shop card row, cargo tray, FIGHT with its cue, the
// next-battle card, the details panel, drag feedback and the pause/options menu.

import { foldRunEnd } from "../../game/styleFolds"; // CUSTOM-2a (REQ-BFG-072)
import { packPrice, saveRun, shopBadge, shopShut, type Run } from "../../game/run";
import { record } from "../../game/day";
import { ITEMS, PACK_IDS, PACK_ITEM, REROLL_COST } from "../../sim/content";
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
import { HERO_MIN, inCarrier } from "./layout"; // ZOOM-1 (REQ-BFG-080): the carrier's own zoom; the compact hero card
import { drawHeroCard } from "./inspector"; // ZOOM-1
import { BAR_H, cornerTap, cornerTarget } from "./layout"; // TAP-093 (backlog #340): the phone's bar and its corner MENU
import { optionsCard } from "../../ui/hud";
import { TitleScreen } from "../title";
import { drawHearts } from "../battleHud";
import { LC_HEART_S } from "../battleHud"; // LC-1 (REQ-BFG-073): the regained heart
import { START_LIVES } from "../../sim/content"; // RETUNE-1 run 2 (REQ-BFG-096): a row's hearts
import { livesCap } from "../../sim/hearts"; // RETUNE-1 run 2: a hearts run's 10
import { WIN_GOAL, longRun } from "../../sim/longRun"; // RUN-1 (REQ-BFG-059, D7): a long run's bar reads WINS n/10 and DAY n
import { dayText, onLongRoad } from "../runDay"; // RUN-1: the day's words, "DAY 3/10" or a long run's "DAY 12"
import type { BuildScreen } from "./build";
import { drawCard, drawPack, drawReroll, drawTag, drawTooltip, offerFace } from "./shop"; // SHOPCARD-1: offerFace (was TXT-095's offerTooltip)
import { drawDetails, hasDetails, offerMergeNote, textOpts } from "./inspector";
import { keywordCursorOff } from "./keywords"; // SHOPCARD-1e (E5): the column is not drawn while a hover tooltip shows
import { drawFoeCard } from "./foeView"; // SCOUT-1c (REQ-BFG-082): the NEXT BATTLE card opens a scouted foe
import { abilityText } from "../../ui/abilityText"; // 0.6.2t (T5): the pack tooltip's fallback sentence (SHOPCARD-1: no longer the card's effect line; SC-0912: PLAIN-1F's cardEffect import dropped, a shop card carries no effect line)
import { drawCarry, drawFightCue, drawSuggestion } from "./cues";
import { drawBeltX } from "./beltx"; // shoptap (D3)
import { deleteRoute } from "./actions"; // shoptap (D3): the X removes the belt as REMOVE BELT does
import { faceLines } from "../../ui/faces"; // U2c group 0 fix 3: the packs' faces in their tooltips

/** bb-0.8.6 (PACKS P5; U2c group 0 fix 3): a pack slot's tooltip text: the pack's face ("+4 BELT TILES FOR THE RUN.",
 *  "+250 {HULL} FOR THE RUN."), else its first sentence. AZ-PREP (REQ-BFG-079; REVIEW-HULL1D Q3): on the run's day
 *  (textOpts: with HULL_SCALE on the ARMOR PACK's hull x M(d), as its slot and its panel read it); it read day 1's. With
 *  the switch off, or on day 1, the same text as before. */
export function packTip(def: string, run: Run): string {
  return faceLines(def, 1, textOpts(run))?.rules[0]?.text ?? abilityText(def, 1, textOpts(run)).sentences[0] ?? "";
}

/** AZ-PREP (REQ-BFG-077; REVIEW-NPC1 Q4): the build bar's stage word: REFIT in REFIT with NPC_DAY on, else DAWN. */
export const barStage = (run: Pick<Run, "stage">): "REFIT" | "DAWN" => (shopShut(run) ? "REFIT" : "DAWN");

/** RUN-1 (REQ-BFG-059, REQ-BFG-116; D7): the bar's run progress after the stage word, as [text, colour] pieces. A 10-day run
 *  (no mark; every switch-off run and an old save): " · DAY 3/10" exactly as before. A long run: " · WINS 3/10" (the goal
 *  carries the /10) then " · DAY 12" (never "/N"; amber from day 11, the long road). */
export function barRun(run: Pick<Run, "day" | "wins" | "longRun">): [string, string][] {
  const long = longRun(run);
  if (!long) return [[` · ${dayText(run.day, false)}`, C.bone]];
  return [[` · WINS ${run.wins}/${WIN_GOAL}`, C.bone], [` · ${dayText(run.day, true)}`, onLongRoad(run.day, true) ? C.amber : C.bone]];
}

/** Status bar: DAWN (REFIT) · DAY n/10, gold, the 5 hearts, the W-L record (landscape; portrait keeps it in
 *  the hero card below the shop), belt use when there is room, then MENU and SND. RUN-1: a long run's reads
 *  DAWN (REFIT) · WINS n/10 · DAY n (barRun). (Exported for tests/run1.screens.draw.test.ts.) */
export function drawTopBar(g: G, s: BuildScreen): void {
  const { W, ui } = s.game;
  const run = s.run;
  // TAP-093 (backlog #340, REQ-BFG-040): a portrait phone's bar is L.bar.h tall: BAR_H, or a finger's target where the
  // screen spares it (layout.ts phoneBarLift), its contents centred in it. Elsewhere 14 px, exactly as before.
  const bh = s.L.bar.h, oy = Math.floor((bh - BAR_H) / 2);
  rect(g, 0, 0, W, bh, C.ink);
  rect(g, 0, bh - 1, W, 1, C.slate1);
  rect(g, 0, bh - 2, W, 1, C.navy);
  ui.add({ id: "bar", r: { x: 0, y: 0, w: W, h: bh }, block: true });
  const tap = s.L.phone ? tapPx(s.game.view) : 0;
  // TAP-093: a portrait phone's bar too short for a finger's target puts one MENU in its top-left corner, its target the
  // corner's dead space (cornerTarget); the sound setting is in MENU's card (SOUND: MUSIC + SFX / SFX ONLY / OFF).
  // TAP-093b: layout.ts cornerTap, the test the rune bar's chips use to start right of MENU's finger square
  const corner = cornerTap(s.L, tap) > 0;
  const narrow = W < 200;
  const sndW = narrow ? 19 : 25, menuW = narrow ? 21 : 27;
  const sndX = W - 2 - sndW, menuX = corner ? 2 : sndX - 1 - menuW;
  const end = corner ? W - 1 : menuX; // where the status line stops
  let x = corner ? menuX + menuW + 4 : 4;
  // AZ-PREP (REQ-BFG-077; REVIEW-NPC1 Q4 and N2): in REFIT with NPC_DAY on (the shop shut, run.ts shopShut) the bar names
  // the stage: REFIT · DAY n/10 (RUN-1: a long run's REFIT · WINS n/10 · DAY n). Off, or at the dawn, DAWN as before (0.9.7's
  // road REFIT keeps DAWN, as it keeps its sales)
  x += drawText(g, barStage(run), x, 5 + oy, C.amber, { font: "3" });
  // RUN-1 (REQ-BFG-059, D7): a long run's WINS n/10 and DAY n beside the stage (barRun); a 10-day run's DAY n/10, as before
  for (const [text, colour] of barRun(run)) x += drawText(g, text, x, 5 + oy, colour, { font: "3" });
  x += 5;
  g.drawImage(coinIcon(), x, 4 + oy);
  s.coinX = x + 5;
  x += 7 + drawText(g, String(run.gold), x + 7, 4 + oy, C.yellow, { outline: C.ink }) + 5;
  // LC-1 (REQ-BFG-073): the heart LAST CHANCE gave back, lit for a few seconds after the pick (lcHeartT: Infinity, none)
  const lcT = (s as { lcHeartT?: number }).lcHeartT ?? Infinity;
  // RETUNE-1 run 2 (REQ-BFG-096): a hearts run's 10 hearts in two rows of 5 (today's 5's width, so the bar is as before)
  const hc = livesCap(run);
  x += drawHearts(g, x, (hc > START_LIVES ? 1 : 4) + oy, run.lives, lcT, -1, lcT < LC_HEART_S ? run.lives - 1 : -1, hc, START_LIVES) + 5;
  // the W-L record: labelled where it fits, bare beside the hearts on narrow portrait bars (the
  // phone's bar has no room, so its hero card below the shop carries the record)
  const wl = record(run);
  if (x + textWidth(`W-L ${wl}`, "3") <= end - 4) {
    x += drawText(g, "W-L", x, 5 + oy, C.slate4, { font: "3" }) + 3;
    x += drawText(g, wl, x, 5 + oy, C.white, { font: "3" }) + 7;
  } else if (x + textWidth(wl, "3") <= end - 4) x += drawText(g, wl, x, 5 + oy, C.white, { font: "3" }) + 7;
  const used = beltUsed(run.build), cap = run.build.beltCap;
  const bt = `${used}/${cap}`;
  if (x + 9 + textWidth(bt, "3") <= end - 3) {
    g.drawImage(beltIcon(), x, 6 + oy);
    drawText(g, bt, x + 9, 5 + oy, used >= cap ? C.amber : C.bone, { font: "3" });
  }
  const open = () => { s.menu = true; };
  const menuR = { x: menuX, y: 1 + oy, w: menuW, h: 12 };
  if (corner) {
    // TAP-093: tap px tall from the corner, at least tap wide, clear of every target under the bar (the shop cards,
    // REROLL, the packs, the rune chips) and above a details panel grown over the shop (whose words take taps)
    const B = s.runeBar.layout(s), area = s.panelArea();
    const others = [...s.L.cards, s.L.reroll, ...s.L.packs, ...(B ? [...B.chips, ...(B.more ? [B.more] : [])] : [])];
    const hit = cornerTarget(menuR, tap, others, area !== s.L.info ? area.y : Infinity);
    s.cornerMenu = hit;
    button(ui, g, "menu", menuR, "MENU", { font: "3", onTap: open, hit: hit[0] });
    for (const r of hit.slice(1)) ui.add({ id: "menu", r, onTap: open, block: true });
    return;
  }
  s.cornerMenu = null;
  // zoom (REQ-BFG-040, D4): on a phone's layout SND and MENU take the bar and the gap above the shop as their targets
  // (down to 1 px above the first card row: lower, they would take a card's or a grown panel's presses). TAP-093: the
  // lifted bar is a finger's target tall, so each takes the bar's height, and SND (25 px) a finger's width too, MENU's
  // kept left of SND's
  const room = { x: 0, y: 0, w: W, h: Math.min(Math.min(...s.L.cards.map((c) => c.y), s.L.reroll.y) - 1, tap ? Math.max(bh, BAR_H + 2) : Infinity) };
  const sndR = { x: sndX, y: 1 + oy, w: sndW, h: 12 };
  const sndHit = tap ? tapRect(sndR, tap, room, tap) : undefined;
  s.game.soundButton(g, sndR, sndHit);
  button(ui, g, "menu", menuR, "MENU", { font: "3", onTap: open, ...(sndHit ? { hit: tapRect(menuR, tap, { ...room, w: sndHit.x }, tap) } : {}) });
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
      // SHOPCARD-1 (REQ-BFG-115): the card is the icon and the price and wordless marks, so the effect, the stat chip and the
      // gist rows that fed the old faces are no longer built here every frame; its sale mark: a scout's deal (run.shop.discount)
      // made this offer cheaper than its list price (run.ts priceOf)
      // SC-0912: PLAIN-1F's `effect: cardEffect(...)` (M3, F5) is dropped with the others; the sale mark is kept
      sale: !o.sold && o.price < ITEMS[o.def].price,
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
    drawPack(g, r, id, run.gold >= packPrice(id), s.game.ui.hover === `pack-${id}`, s.game.ui.pressed === `pack-${id}`, run.day); // HULL-1a
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
    // ZOOM-1 (REQ-BFG-080): a landscape tray of two rows says so in its middle (one row: y + 9, as before)
    drawText(g, "CARGO · EMPTY", r.x + r.w / 2, r.y + Math.floor(r.h / 2) - 2, C.slate3, { font: "3", align: "center" });
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

/** SHOPCARD-1e (E5): the offer whose hover tooltip shows this frame, with its card's index in L.cards: a mouse over a card, no
 *  piece carried, the caravan parked (the conditions the tooltip had inline); null when none shows. */
export function tooltipOffer(s: BuildScreen): { idx: number; o: Run["shop"]["wagons"][number]["offers"][number] } | null {
  if (!s.hover || s.ed.carry || !s.caravan.ready) return null;
  const idx = s.offers().findIndex((q) => q.wagon === s.hover!.wagon && q.slot === s.hover!.slot);
  const o = s.run.shop.wagons[s.hover.wagon]?.offers[s.hover.slot];
  return idx >= 0 && o && s.L.cards[idx] ? { idx, o } : null;
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
  if (held && !s.ed.busy) inCarrier(g, L, () => drawSuggestion(g, L, s.run.build, held.def, s.t)); // ZOOM-1: at the carrier's zoom
  // SHOPCARD-1e (REQ-BFG-115; E5, cap's SHOPCARD-1d review): on the desk the hover tooltip (drawn last, below) is a box under its
  // card, and the details column under the shop row shows the same hovered face in larger type: the box covered part of the
  // column and the column's last rows peeked out below and beside it (LIMPET WORKS' "HULL, 3s AFTER A HIT.", TWIN LATCH's "ROWS
  // MUST ... LTS."). While the tooltip shows, the column is not drawn: the box says everything the column would (offerFace is the
  // panel's own face), and no word of the column shows around or under it. A hover shows its panel without buttons (inspector.ts
  // baseSpec: `hovering ? []`), so no button or target of the column goes; the column is back the moment the mouse leaves the card.
  const tip = tooltipOffer(s);
  if (!L.portrait) {
    if (L.foe) drawFoeCard(g, s, L.foe); // SCOUT-1c (REQ-BFG-082): drawFoe, and a revealed foe's tap target
    if (tip) keywordCursorOff(s.game?.canvas); // drawDetails resets the desk's help cursor each frame; the column is not drawn now
    else drawDetails(g, s, s.sel, s.hover, L.info, s.foe, s.note());
  } else if (hasDetails(s, s.sel, s.hover) || !L.foe) {
    // a selection or hover uses the whole band. shoptap2 (REQ-BFG-034, -035): after a finger's tap, where the band is
    // shorter than a panel needs (a phone browser's toolbars take part of the screen), the panel grows (BuildScreen.panelArea);
    // a press on what it covers goes on to the screen beneath (a tap reads the part or card under it, a drag lifts it)
    const area = s.panelArea();
    const through = area !== L.info ? { band: L.info, press: (x: number, y: number) => s.down(x, y, s.game.ui.pointer.kind) } : undefined;
    drawDetails(g, s, s.sel, s.hover, area, s.foe, s.note(), through);
  } else {
    // idle portrait band: hero card over the NEXT BATTLE panel (zoom: on a phone's taller band, the pair in its middle)
    drawFoeCard(g, s, L.foe); // SCOUT-1c (REQ-BFG-082): drawFoe, and a revealed foe's tap target
    const top = heroCardRect(L.info, L.foe);
    if (top.h >= 30) drawDetails(g, s, s.sel, s.hover, top, s.foe, s.note());
    // ZOOM-1 (REQ-BFG-080, call 5): a phone's band sized for 90% of the panels can leave the hero card 24-29 px: its compact
    // form (the name over HULL, BELT and FEEDS)
    else if (top.h >= HERO_MIN) drawHeroCard(g, s, top);
  }
  drawTopBar(g, s);
  // shoptap (D3, REQ-BFG-036): the belt X a touch tap put up; a tap on it removes the whole belt (REMOVE BELT's path)
  const bx = s.ed.beltX(), br = bx ? s.beltXRect(bx) : null;
  if (bx && br) drawBeltX(g, ui, L, bx, br, () => deleteRoute(s, bx.index));
  // drag feedback (the placement suggestion is drawn above, before the details panel)
  if (c) {
    // SHAPES-1 (REQ-BFG-086 S3): a touch carry of a shaped piece shows the floating ROTATE button: a target a second
    // finger presses while the first carries (Region.second; game.ts pointerExtra)
    const rb = drawCarry(g, L, s.run.build, c, s.ed.px, s.ed.py, s.ed.carryT, (x, y) => s.turretAt(x, y), { W: s.game.view.W, tap: tapPx(s.game.view) });
    if (rb) ui.add({ id: "carryrotate", r: rb, onTap: () => { s.ed.rotateCarry(); }, second: true });
  }
  if (cue) drawFightCue(g, L.fight, L.portrait, s.t);
  // mouse hover tooltip under the card
  if (tip) {
    const { idx, o } = tip;
    // 0.6.2t (T5): the offer's opening sentence, as its panel and card read it. TXT-095 (REQ-BFG-070, REQ-BFG-046): faces
    // first, as the pack tooltip below: the face's first rule line (with the run's TextOpts), else that sentence
    // (shop.ts offerTooltip; was that opening sentence alone)
    // SHOPCARD-1 (REQ-BFG-115, F5): the card shows only its icon and price, so the tooltip shows its whole face (offerFace: every
    // line the panel's face draws), kept on screen (L.H); a click still selects the card and opens its panel (BuildScreen.up)
    drawTooltip(g, L.cards[idx], ITEMS[o.def], L.W, [...offerFace(o.def, textOpts(s.run)), ...(o.sold ? [] : [offerMergeNote(s.run, o.def)].filter((n): n is string => !!n))], L.H);
  }
  // bb-0.8.6 (REQ-BFG-051, PACKS P5): a mouse over a pack slot: its name and one-line text, as an offer's tooltip reads
  const ph = s.refit || c ? -1 : PACK_IDS.findIndex((id) => ui.hover === `pack-${id}`);
  if (ph >= 0) {
    const def = PACK_ITEM[PACK_IDS[ph]];
    // U2c group 0 fix 3: the pack's face, "+4 BELT TILES FOR THE RUN." and "+25 {HULL} FOR THE RUN." (the tooltip's layout
    // as before: one line of its 3x5 text)
    drawTooltip(g, packRects(L)[ph], ITEMS[def], L.W, packTip(def, s.run));
  }
  if (s.menu) {
    // TAP-093 (backlog #340): with the corner MENU (sound lives in its card) the card's buttons are a finger's target tall,
    // its SOUND toggle among them (optionsCard's k: its 19 px buttons k times as tall); elsewhere k = 1, as before
    const k = s.cornerMenu ? tapPx(s.game.view) / 19 : 1;
    optionsCard(s.game, g, "PAUSED", [
      { id: "resume", label: "RESUME", primary: true, onTap: () => { s.menu = false; } },
      { id: "quit", label: "SAVE & QUIT", onTap: () => { saveRun(s.run); s.game.go(new TitleScreen(s.game)); } },
      { id: "abandon", label: "ABANDON RUN", danger: true, onTap: () => { foldRunEnd(s.run); saveRun(null); s.game.run = null; s.game.go(new TitleScreen(s.game)); } }, // CUSTOM-2a: ABANDON counts as a run
    ], () => { s.menu = false; }, k);
  }
}
