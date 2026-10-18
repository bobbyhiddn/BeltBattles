// Warlord result card (0.6.0b): WIN / LOSS / DRAW of the road-stop fight. A warlord never costs a
// life: the hearts stay full and a loss reads NO LIFE LOST · REWARD FORFEIT. A win shows its gold
// (and a staked ELITE BOUNTY); Hard offers a pick of 1 of 2 parts from the warlord's own deck; the
// Iron Matriarch's LEGENDARY part is already in cargo. A part in cargo offers REFIT or FIGHT NOW
// (as after road events); otherwise ON TO DUSK.

import type { Game } from "../game/game";
import { shopBadge, type WarlordFight } from "../game/run";
import { START_LIVES } from "../sim/content";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { drawGridRight } from "../ui/shapePic"; // SHOPCARD-1 (REQ-BFG-113, G4): a shaped part's grid on its pick button
import { itemIcon } from "../render/sprites";
import { blockedButton, button, panel, type Rect } from "../ui/ui";
import { fmtClock } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the clock, whole elapsed seconds
import { fightBlock } from "../game/routeCheck";
import { TIER_COLOR, TIER_LABEL, drawPortrait, nameColor, tag } from "../ui/captain";
import { drawHearts } from "./battleHud";
import { VIEW_ROW_H } from "./battleHud"; // SCOUT-1 (REQ-BFG-076): VIEW BATTLEFIELD on the card
import { viewRow } from "./battleHud"; // REPLAY-1 (REQ-BFG-112): VIEW BATTLEFIELD's row, with the card's REPLAY
import { primaryTap, viewFloor } from "./battleHud"; // REPLAY-1b (REQ-BFG-112): ON TO THE ROAD's finger target
import { livesCap } from "../sim/hearts"; // RETUNE-1 run 2 (REQ-BFG-096): a hearts run's 10
import { lifeWord } from "../ui/stakes"; // RETUNE-1 run 2: HEART on a hearts run
import { itemName } from "./event/cards";
import { drawBadge } from "./build/shop";
import { DROP_STARS, npcDayRules } from "../sim/npcDay"; // NPC-1 (REQ-BFG-077, REQ-BFG-078); HULL-1b: DROP_STARS
import { drawDropCard } from "./fork/drops"; // NPC-1: the drop card

/** The line over a Hard win's part pick. */
export const PICK_LINE_TEXT = "PICK 1 PART FROM THEIR DECK:";
/** SCOUT-1b (REQ-BFG-082): with VIEW BATTLEFIELD on the card, the PICK line's place over the picks (its 3x5 text, then
 *  4 px), and how far VIEW BATTLEFIELD's row moves up to sit above it. */
export const PICK_LINE = 9;

/** SCOUT-1b (REQ-BFG-082): the card's bottom rows (y, top down) for a card at `yy`, `ch` px tall: VIEW BATTLEFIELD's row
 *  (with `view`), the PICK line (with `pick`; without the view where it always was, under the gold line) and the buttons'
 *  row (the picks, REFIT and FIGHT NOW, or ON TO DUSK). With both, the PICK line sits right over the picks it heads and
 *  VIEW BATTLEFIELD right above that line. */
export function warlordRows(yy: number, ch: number, pick: boolean, view: boolean): { view: number; pickLine: number; buttons: number } {
  const buttons = yy + ch - 26;
  return { view: buttons - VIEW_ROW_H - (pick ? PICK_LINE : 0), pickLine: pick && view ? buttons - PICK_LINE : yy + 74, buttons };
}

export interface WarlordActions {
  take: (() => void)[];
  refit: () => void;
  fight: () => void; // FIGHT NOW / ON TO DUSK
  road?: () => void; // NPC-1 (REQ-BFG-077; NPC_DAY on): ON TO THE ROAD, the day's event
}

/** NPC-1 (REQ-BFG-077): the result's one way on with NPC_DAY on, win or lose. */
export const ON_TO_THE_ROAD = "ON TO THE ROAD";

/** SCOUT-1 (REQ-BFG-076): `onView`, VIEW BATTLEFIELD, on its own row right above the card's actions (the pick, REFIT and
 *  FIGHT NOW, or ON TO DUSK: never in their place; the pick works as before), the card a row taller; `viewHit`, its tap
 *  target's least height. Absent, the card exactly as before. SCOUT-1b (REQ-BFG-082): with a part pick, its line "PICK 1
 *  PART FROM THEIR DECK:" sits right over the picks it heads, and VIEW BATTLEFIELD's row right above that line. Tooling:
 *  returns the card's box as drawn this frame. REPLAY-1 (REQ-BFG-112): `onReplay`, the card's REPLAY, at the right end of
 *  VIEW BATTLEFIELD's row (battleHud.ts viewRow); absent, that row exactly as before. REPLAY-1b (REVIEW-REPLAY1 ruling 2):
 *  ON TO THE ROAD's target is `viewHit` px tall at least too (primaryTap); NPC_DAY off, the buttons are as before. */
export function drawWarlordResult(g: G, game: Game, w: WarlordFight, pt: number, a: WarlordActions, onView?: () => void, viewHit = 0, onReplay?: () => void): Rect {
  const { W, H, ui } = game;
  const run = game.run!;
  const r = w.result!;
  const npc = npcDayRules(); // NPC-1 (REQ-BFG-077, REQ-BFG-078): the drop card or NO DROP, then ON TO THE ROAD
  const pick = r.outcome === "win" && !w.reward.legendary && !r.took && r.parts.length > 0;
  const cw = Math.min(W - 10, 214), ch = (npc ? 132 : 124) + (onView ? VIEW_ROW_H : 0);
  const x = Math.round(W / 2 - cw / 2), y = Math.round(H / 2 - ch / 2);
  const k = Math.min(1, pt / 0.25);
  g.globalAlpha = 0.55 * k;
  rect(g, 0, 0, W, H, C.ink);
  g.globalAlpha = 1;
  const yy = y + Math.round((1 - k) * 30);
  panel(g, { x, y: yy, w: cw, h: ch }, "raised");
  ui.add({ id: "resultbg", r: { x: 0, y: 0, w: W, h: H }, block: true });
  const win = r.outcome === "win", loss = r.outcome === "loss";
  drawText(g, win ? "WIN" : loss ? "LOSS" : "DRAW", W / 2, yy + 6, win ? C.lime : loss ? C.red : C.bone, { align: "center", scale: 2, outline: C.ink });
  drawText(g, `ROAD · DAY ${w.day} · ${TIER_LABEL[w.tier]} WARLORD · ${fmtClock(r.time)}S`, W / 2, yy + 23, C.slate4, { font: "3", align: "center" }); // NUM-4: a clock
  // the warlord: portrait, name, tier
  drawPortrait(g, w.id, x + 10, yy + 32);
  drawText(g, w.name, x + 40, yy + 34, nameColor(w.id), { outline: C.ink });
  tag(g, TIER_LABEL[w.tier], x + 40, yy + 45, TIER_COLOR[w.tier]);
  // lives: never touched by a warlord
  // RETUNE-1 run 2 (REQ-BFG-096): a hearts run's 10 in two rows of 5 (today's width, over the line) and HEART in the words
  const hc = livesCap(run);
  drawHearts(g, x + cw - 10 - START_LIVES * 6, yy + (hc > START_LIVES ? 31 : 34), run.lives, 0, -1, -1, hc, START_LIVES);
  drawText(g, `NO ${lifeWord(run)} LOST`, x + cw - 10, yy + 44, win ? C.slate4 : C.lime, { font: "3", align: "right" });
  let ry = yy + 62;
  rect(g, x + 8, ry - 4, cw - 16, 1, C.slate1);
  if (!win) {
    drawText(g, `REWARD FORFEIT · WARLORDS NEVER COST A ${lifeWord(run)}`, W / 2, ry + 2, C.bone, { font: "3", align: "center" });
    ry += 12;
  } else {
    const bounty = r.bountyPaid > 0 ? ` (BOUNTY +${r.bountyPaid})` : "";
    drawText(g, `+${r.gold} GOLD${bounty}`, x + 10, ry, C.yellow, { outline: C.ink });
    if (w.sabotaged) drawText(g, "SABOTAGED", x + cw - 10, ry + 1, C.amber, { font: "3", align: "right" });
    ry += 12;
    if (npc) {
      // NPC-1 (REQ-BFG-078): the drop as a part card going to cargo (the Matriarch's: her legendary part), or NO DROP
      drawDropCard(g, r.took, w.reward.legendary, x + 10, ry, cw - 20, w.reward.legendary ? 1 : DROP_STARS[w.tier]); // HULL-1b: Hard's ★2
      ry += 24;
    } else if (w.reward.legendary && r.took) {
      tag(g, "LEGENDARY", x + 10, ry, C.plum4, C.white);
      drawText(g, `${itemName(r.took)} IS IN CARGO`, x + 60, ry + 2, C.lime, { font: "3" });
      ry += 12;
    } else if (pick) {
      drawText(g, PICK_LINE_TEXT, x + 10, warlordRows(yy, ch, pick, !!onView).pickLine, C.bone, { font: "3" }); // SCOUT-1b
      ry += 9;
    } else if (r.took) {
      drawText(g, `${itemName(r.took)} IS IN CARGO`, x + 10, ry, C.lime, { font: "3" });
      ry += 10;
    }
  }
  const box = { x, y: yy, w: cw, h: ch };
  if (pt <= 0.35) return box;
  const by = yy + ch - 26, bw = Math.floor((cw - 24) / 2);
  const vb = { x: x + 10, y: warlordRows(yy, ch, pick, true).view, w: cw - 20, h: 21 };
  if (onView) viewRow(ui, g, vb, { x, y: yy, w: cw, h: ch }, onView, viewHit, onReplay);
  if (npc) {
    // NPC-1 (REQ-BFG-077): one way on, win or lose: the day's event (then REFIT, then dusk). REPLAY-1b (REQ-BFG-112;
    // REVIEW-REPLAY1 ruling 2): its target a finger's tall on a phone (battleHud.ts primaryTap), the button drawn as before
    const rb = { x: x + 10, y: by, w: cw - 20, h: 20 }, rh = primaryTap(rb, viewHit, H, onView ? viewFloor(vb) : by);
    button(ui, g, "toroad", rb, ON_TO_THE_ROAD, { primary: true, onTap: a.road ?? a.fight, ...(rh !== rb ? { hit: rh } : {}) });
    return box;
  }
  if (pick) {
    r.parts.forEach((d, i) => {
      const bx = x + 10 + i * (bw + 4);
      button(ui, g, `take${i}`, { x: bx, y: by, w: bw, h: 20 }, "", { onTap: a.take[i] });
      const ic = itemIcon(d);
      g.drawImage(ic, bx + 4, by + 10 - Math.floor(ic.height / 2));
      drawText(g, itemName(d), bx + 18, by + 7, C.white, { font: "3" });
      // 0.6.1d2: the same MERGE/wait/MAX badge as the shop card, bottom-right so it never
      // crosses the name text (which isn't wrapped or truncated here).
      const badge = shopBadge(run, d);
      drawGridRight(g, d, bx, by + 2, bw, bx + 18 + textWidth(itemName(d), "3") + 3, badge ? by + 12 : Infinity); // SHOPCARD-1 (G4): clear of the name and the badge
      if (badge) {
        const bw2 = Math.max(20, Math.min(34, bw - 6));
        drawBadge(g, bx + bw - bw2 - 2, by + 12, bw2, badge, pt);
      }
    });
  } else if (r.took) {
    button(ui, g, "refit", { x: x + 10, y: by, w: bw, h: 20 }, "REFIT", { primary: true, onTap: a.refit });
    const fr = { x: x + 14 + bw, y: by, w: bw, h: 20 };
    const why = fightBlock(run.build); // a dead-end or broken belt: REFIT first (routeCheck.ts)
    if (why) blockedButton(ui, g, "fightnow", fr, "FIGHT NOW", why);
    else button(ui, g, "fightnow", fr, "FIGHT NOW", { onTap: a.fight });
  } else {
    button(ui, g, "next", { x: x + 10, y: by, w: cw - 20, h: 20 }, "ON TO DUSK", { primary: true, onTap: a.fight });
  }
  return box;
}
