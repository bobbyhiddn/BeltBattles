// Run HUD bar for the road-event screen (0.5.0): gold, lives, max hull, belt capacity and cargo,
// each with an anchor the event rewards fly to (the value flashes white when one lands), plus
// MENU and SND. Same ink strip as the build screen's bar.

import type { Game } from "../game/game";
import type { Run } from "../game/run";
import { HEROES, RUN_LIVES } from "../sim/content";
import { beltUsed } from "../sim/deck";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { beltIcon, coinIcon, heartIcon } from "../render/sprites";
import { crateIcon, shieldIcon } from "../render/eventArt";
import { button } from "./ui";

export type AnchorKind = "gold" | "lives" | "hull" | "belt" | "cargo";
export type Anchors = Record<AnchorKind, { x: number; y: number }>;

/** Draws the bar and fills `out` with the anchor points. `flash[k]` > 0 flashes that value. */
export function drawRunBar(g: G, game: Game, run: Run, flash: Record<AnchorKind, number>, out: Anchors, onMenu: () => void): void {
  const { W, ui } = game;
  rect(g, 0, 0, W, 14, C.ink);
  rect(g, 0, 13, W, 1, C.slate1);
  rect(g, 0, 12, W, 1, C.navy);
  ui.add({ id: "bar", r: { x: 0, y: 0, w: W, h: 14 }, block: true });
  let x = 4;
  g.drawImage(coinIcon(), x, 4);
  out.gold.x = x + 2; out.gold.y = 6;
  const gs = String(run.gold);
  drawText(g, gs, x + 7, 4, flash.gold > 0 ? C.white : C.yellow, { outline: C.ink });
  x += 7 + textWidth(gs) + 7;
  for (let i = 0; i < RUN_LIVES; i++) g.drawImage(heartIcon(i < run.lives), x + i * 7, 4);
  out.lives.x = x + 8; out.lives.y = 6;
  if (flash.lives > 0) rect(g, x - 1, 10, RUN_LIVES * 7, 1, C.white);
  x += RUN_LIVES * 7 + 5;
  g.drawImage(shieldIcon(), x, 4);
  out.hull.x = x + 2; out.hull.y = 6;
  const hs = String(HEROES[run.hero].hull + run.build.hullBonus);
  drawText(g, hs, x + 7, 5, flash.hull > 0 ? C.white : C.bone, { font: "3" });
  x += 7 + textWidth(hs, "3") + 6;
  g.drawImage(beltIcon(), x, 6);
  out.belt.x = x + 3; out.belt.y = 7;
  const bs = `${beltUsed(run.build)}/${run.build.beltCap}`;
  drawText(g, bs, x + 9, 5, flash.belt > 0 ? C.white : C.bone, { font: "3" });
  x += 9 + textWidth(bs, "3") + 6;
  const cs = String(run.inventory.length);
  out.cargo.x = x + 3; out.cargo.y = 7;
  if (x + 8 + textWidth(cs, "3") < W - 58) {
    g.drawImage(crateIcon(), x, 5);
    drawText(g, cs, x + 8, 5, flash.cargo > 0 ? C.white : C.bone, { font: "3" });
  }
  game.soundButton(g, { x: W - 27, y: 1, w: 25, h: 12 });
  button(ui, g, "menu", { x: W - 55, y: 1, w: 27, h: 12 }, "MENU", { font: "3", onTap: onMenu });
}

export function newAnchors(): Anchors {
  return { gold: { x: 0, y: 0 }, lives: { x: 0, y: 0 }, hull: { x: 0, y: 0 }, belt: { x: 0, y: 0 }, cargo: { x: 0, y: 0 } };
}
