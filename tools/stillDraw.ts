// CUSTOM-2a (REQ-BFG-071 tidy, REVIEW-MOTION2 Q2): the dev tools' stand-ins for the tracked hull's drawing, which the
// game no longer has (cruiser.ts drawHull and arenaDraw.ts drawArena are deleted with the test builds' ?motion=0 knob).
// The digests and contact sheets (artDigest, fwDigest, heroesArtSheet, heroesFxSheet, wave3ArtSheet) draw decks and
// arenas the one way every screen draws them now: the carrier held still under its board plate. Dev tools only; nothing
// in the game imports this.

import type { G } from "../src/render/pixel";
import type { CruiserView } from "../src/render/cruiser";
import { drawStillCarrier } from "../src/render/ship";
import { ArenaMotion } from "../src/game/arenaMotion";
import { motionDefaults } from "../src/render/motion";
import type { Arena } from "../src/game/arena";

/** A deck's hull as the build screen draws it: the carrier held still under its board plate (was drawHull). */
export function drawDeckHull(g: G, v: CruiserView): void {
  drawStillCarrier(g, v.model.hero, v.frame);
}

const held = new WeakMap<Arena, ArenaMotion>();

/** An arena as the game draws one (was drawArena): both carriers held still at rest (no bank, drift, wake or sea), their
 *  boards, shots, effects and numbers as in a battle. */
export function drawArenaStill(g: G, a: Arena, W: number, H: number): void {
  let m = held.get(a);
  if (!m) {
    m = new ArenaMotion(1, 1, motionDefaults(), false, true);
    held.set(a, m);
  }
  m.draw(g, a, W, H, false);
}
