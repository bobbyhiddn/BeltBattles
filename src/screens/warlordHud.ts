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
import { drawText } from "../render/font";
import { itemIcon } from "../render/sprites";
import { blockedButton, button, panel } from "../ui/ui";
import { fmtClock } from "../ui/statFormat"; // NUM-4 (REQ-BFG-047): the clock, whole elapsed seconds
import { fightBlock } from "../game/routeCheck";
import { TIER_COLOR, TIER_LABEL, drawPortrait, nameColor, tag } from "../ui/captain";
import { drawHearts } from "./battleHud";
import { itemName } from "./event/cards";
import { drawBadge } from "./build/shop";
import { npcDayRules } from "../sim/npcDay"; // NPC-1 (REQ-BFG-077, REQ-BFG-078)
import { drawDropCard } from "./fork/drops"; // NPC-1: the drop card

export interface WarlordActions {
  take: (() => void)[];
  refit: () => void;
  fight: () => void; // FIGHT NOW / ON TO DUSK
  road?: () => void; // NPC-1 (REQ-BFG-077; NPC_DAY on): ON TO THE ROAD, the day's event
}

/** NPC-1 (REQ-BFG-077): the result's one way on with NPC_DAY on, win or lose. */
export const ON_TO_THE_ROAD = "ON TO THE ROAD";

export function drawWarlordResult(g: G, game: Game, w: WarlordFight, pt: number, a: WarlordActions): void {
  const { W, H, ui } = game;
  const run = game.run!;
  const r = w.result!;
  const npc = npcDayRules(); // NPC-1 (REQ-BFG-077, REQ-BFG-078): the drop card or NO DROP, then ON TO THE ROAD
  const pick = r.outcome === "win" && !w.reward.legendary && !r.took && r.parts.length > 0;
  const cw = Math.min(W - 10, 214), ch = npc ? 132 : 124;
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
  drawHearts(g, x + cw - 10 - START_LIVES * 6, yy + 34, run.lives);
  drawText(g, "NO LIFE LOST", x + cw - 10, yy + 44, win ? C.slate4 : C.lime, { font: "3", align: "right" });
  let ry = yy + 62;
  rect(g, x + 8, ry - 4, cw - 16, 1, C.slate1);
  if (!win) {
    drawText(g, "REWARD FORFEIT · WARLORDS NEVER COST A LIFE", W / 2, ry + 2, C.bone, { font: "3", align: "center" });
    ry += 12;
  } else {
    const bounty = r.bountyPaid > 0 ? ` (BOUNTY +${r.bountyPaid})` : "";
    drawText(g, `+${r.gold} GOLD${bounty}`, x + 10, ry, C.yellow, { outline: C.ink });
    if (w.sabotaged) drawText(g, "SABOTAGED", x + cw - 10, ry + 1, C.amber, { font: "3", align: "right" });
    ry += 12;
    if (npc) {
      // NPC-1 (REQ-BFG-078): the drop as a part card going to cargo (the Matriarch's: her legendary part), or NO DROP
      drawDropCard(g, r.took, w.reward.legendary, x + 10, ry, cw - 20);
      ry += 24;
    } else if (w.reward.legendary && r.took) {
      tag(g, "LEGENDARY", x + 10, ry, C.plum4, C.white);
      drawText(g, `${itemName(r.took)} IS IN CARGO`, x + 60, ry + 2, C.lime, { font: "3" });
      ry += 12;
    } else if (pick) {
      drawText(g, "PICK 1 PART FROM THEIR DECK:", x + 10, ry, C.bone, { font: "3" });
      ry += 9;
    } else if (r.took) {
      drawText(g, `${itemName(r.took)} IS IN CARGO`, x + 10, ry, C.lime, { font: "3" });
      ry += 10;
    }
  }
  if (pt <= 0.35) return;
  const by = yy + ch - 26, bw = Math.floor((cw - 24) / 2);
  if (npc) {
    // NPC-1 (REQ-BFG-077): one way on, win or lose: the day's event (then REFIT, then dusk)
    button(ui, g, "toroad", { x: x + 10, y: by, w: cw - 20, h: 20 }, ON_TO_THE_ROAD, { primary: true, onTap: a.road ?? a.fight });
    return;
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
}
