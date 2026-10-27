// M3 (REQ-BFG-119) Goal 3: a battle frame for the feature graphic, drawn by the game's own battle code the way the title screen draws its
// attract fight (src/screens/title.ts newArena, place, update and draw: an Arena of two decks, an ArenaMotion for the setting and the
// carriers, the same calls in the same order), but with no dim layer, no logo band and no buttons, and at a size and place of this page's
// choosing: 512 x 250 logical pixels, which the caller scales by 2 into 1024 x 500. Display only: nothing of the sim changes.

import { Arena } from "../../../src/game/arena";
import { ArenaMotion } from "../../../src/game/arenaMotion";
import { arenaIn, minGap } from "../../../src/game/battleLayout";
import { warlordBuild } from "../../../src/sim/ai";
import { SHOWCASE } from "../../../src/tooling";
import { MOTION } from "../../../src/render/motion";
import { makeCanvas } from "../../../src/render/pixel";
import type { SceneId } from "../../../src/render/scenery";
import type { HeroId } from "../../../src/sim/content";

export interface FrameSpec {
  /** the setting (scenery.ts: calm, storm, ember, forest, desert, badlands, sky, clouds) */
  scene: SceneId;
  /** the fight's own clock at the frame, in seconds */
  seconds: number;
  /** the left cruiser: a showcase deck of src/tooling.ts SHOWCASE */
  left: string;
  /** the right cruiser: a warlord's deck (sim/ai.ts warlordBuild) of `right` on round `rightDay` */
  right: HeroId;
  rightDay: number;
  seed: number;
  /** the open floor between the cruisers, in logical pixels */
  gap: number;
  /** the top of the cruisers' box (the logo band sits above it) */
  top: number;
  /** the pair's shift along the screen, in logical pixels (the drawn hulls reach further to the right than to the left of their boxes) */
  shift: number;
  W: number;
  H: number;
}

export function battleFrame(s: FrameSpec): { canvas: HTMLCanvasElement; info: Record<string, unknown> } {
  const { W, H } = s;
  const arena = new Arena(SHOWCASE[s.left].build(), warlordBuild(s.right, s.rightDay), s.seed, null);
  arena.quiet = true;
  const motion = new ArenaMotion(s.seed, s.scene, MOTION, false);
  const placed = arenaIn({ x: s.shift, y: s.top, w: W, h: 156 }, false, s.gap);
  arena.setFrames(placed.frames, [[-1, 0], [1, 0]]);
  motion.setLanes({ portrait: false, gap: s.gap }, minGap(W));
  for (let i = 0; i < Math.round(s.seconds * 60); i++) {
    motion.update(1 / 60, false);
    arena.update(1 / 60);
  }
  const [canvas, g] = makeCanvas(W, H);
  motion.drawSea(g, W, H, arena.fx.shakeX, arena.fx.shakeY, 2, 1, motion.model.seed, arena);
  motion.draw(g, arena, W, H, false);
  const b = arena.b;
  return {
    canvas,
    info: {
      t: Math.round(b.t * 100) / 100, projectiles: b.projectiles.length, over: b.over,
      hulls: b.sides.map((x) => Math.round((100 * x.hull.hp) / x.hull.max)), boxes: placed.hulls,
    },
  };
}
