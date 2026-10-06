# Battles in motion (REQ-BFG-071): MOTION-1's prototype, shipped by MOTION-2

MOTION-1 (branch motion1 from motion-base eb4c249, 0.9.4) built this as a prototype behind `VITE_MOTION=1`. MOTION-2
(branch motion2 from motion1's tip f3b0338) ships it: every build draws battles in motion, with no build flag, and the
build screen, the run summary and the hero preview show the same ship, held still, on the day's sea. It is presentation
only: the sim, the net code, the server and src/core are untouched, the fingerprint is IDENTICAL and RULES_VERSION and
replays are unchanged.

## Where the ship is drawn (one world on every screen)

| Screen | What it draws | Code |
|---|---|---|
| Dusk and warlord battles | both carriers in motion on the day's sea | `BattleScreen` -> `ArenaMotion` |
| The title's attract fight | in motion; the sea cycles CALM SEA, STORM, EMBER SEA by round | `TitleScreen` -> `ArenaMotion` |
| Replays | in motion on the replayed day's sea, from the record's seed | `ReplayScreen` -> `ArenaMotion` |
| Build screen | the player's ship held still around the board's own rectangle, on the day's sea held still | `BuildScreen.draw` -> `drawStillCarrier` |
| Run summary | the ship held still on the run's last day's sea (a lost run's wreck dimmed as before) | `SummaryScreen.draw` -> `drawStillCarrier` |
| Hero preview | the hero's ship held still on day 1's sea (CALM SEA); its belts, slugs and turrets still run | `HeroScreen` -> `ArenaMotion` with `held` |

The road event and fork screens draw no carrier and keep 0.9.4's floor (`ArenaBg`).

The build screen's board keeps 0.9.4's deck frame (`BuildLayout.frame`): its tile size, position, taps and drags are
unchanged; only what is drawn under the board changed. Its sea is one cached blit a frame and never moves (REDUCED MOTION
or not). The still screens draw no bank and no drift (tests/motion.test.ts).

## Motion model and its numbers

- **Display clock.** `MotionModel.t` (src/render/motion.ts) advances by the frame's dt (capped at 0.25 s) in the screen's
  `update`, only while the battle (or replay) isn't paused or in its menu. It ignores the playback speed (0.5X-4X) and
  the sim's ticks, and the sim never reads it. `dist` counts the water travelled (a quarter speed with REDUCED MOTION, 0
  for a ship held still).
- **Curves per carrier**, seeded per battle from the battle seed by a display-only PRNG (mulberry32; no sim RNG, no
  `Math.random`). Every pose is a pure function of the clock, so a still at a given time repeats and the wake can read
  where the stern was.
  - Lane drift: `y = D (0.65 sin(w1 t + p1) + 0.35 sin(w2 t + p2))`, periods 12-16 s and 6.5-9 s. `D = min(6,
    floor((gapRest - gapMin) / 2))` px in portrait, 6 in landscape.
  - Heading (the "bank"): `-B v / vmax`, where `v = dy/dt` and `vmax` is its largest possible value. A carrier drifting up
    turns its bow up. `|bank| <= B = 12 deg x min(1, D / 6)`, so a carrier that barely drifts barely turns.
  - Surge: `x = S sin(wx t + px)`, periods 15-20 s. `S` = 6 px in portrait, `min(10, floor((gapRest - gapMin) / 2))` in
    landscape.
  - Bob: `sin(wb t + pb)`, periods 6-7.5 s. It moves the hull's shadow 2-4 px, so the hull seems to rise and settle.
  - Offsets are rounded to whole logical px (whole device pixels), so the pixel art stays crisp.
- **Held still** (`held`, the hero preview): every pose is zero (no bank, drift, surge, bob or sway) and the water doesn't
  move.
- **The gimbal.** Board map = carrier (translate by the lane offset, turn by the heading) x gimbal (turn by
  `-heading + sway`), about the board's pivot (its centre at rest). The two turns cancel to the shared sway
  `s(t) = SWAY sin(2 pi t / 11 s)`, the same for both boards at every instant. `SWAY` is 0 (off) in every player build
  (REVIEW-MOTION1 Q3); a test build's `?sway=N` sets it, at most 3 deg. At 0 the board map is a whole-pixel translation,
  so the boards stay screen-aligned and tiles, belts and numbers read as in 0.9.4.

## The ship (REVIEW-MOTION1 Q2)

- A ship per faction, seen from above, bow to the right, in its faction's hull colours (src/render/carrier.ts). It is
  184 px long; its pivot (the board's centre) is 88 px from the stern, so the bow reaches 96 px ahead of it.
- **Longer bow:** 33 px past a 130 px board (MOTION-1: 23), with a longer, finer taper (66 px). At 390x844 its tip sits
  at the screen's edge at rest; the surge carries it a few px past the edge and back.
- **Taller stern:** the hull flares from 92 px across under the board to 152 px at the stern (MOTION-1: 92 all along), so
  in portrait the stern stands 6 px past the board's top and bottom edges, with a raised deckhouse, twin funnels with the
  faction's glow, sponson lamps and a rudder post. The hull under the board stays inside it.
- The board's tile stays 24 CSS px at 390x844 (scale 6): nothing about the board's size or place changed.

## Lanes and gap

- **Portrait (phones): 0.9.4's stack exactly.** The enemy's lane is above and the player's below, and 0.9.4's
  `battleLayout` sets the scale, board size, gap, plates and bar. The two drifts close and open the gap:
  `gap = gapRest + y_player - y_enemy`, within `gapRest +- 2D`, never below the layout's minimum (17% of the firing
  axis). At 390x844 that is 102 px at rest, at least 90, minimum 72.
- **Landscape and desktop: 0.9.4's side-by-side boards at 0.9.4's size** (REVIEW-MOTION1 Q1). The player is on the left
  and the enemy on the right. The lanes split vertically by the band's spare rows, at most 24 px each, with the enemy
  raised and the player lowered: two parallel lanes, the enemy's a little ahead. Plates and the bar move with the lanes
  when the layout is made, and stay fixed during the fight (`laneLayout` in src/game/battleLayout.ts).
- Both carriers sail in from the left during the drive-in, starting 24 px past their hull boxes so the longer bow starts
  off screen.
- **Water between the ships.** In portrait the taller sterns reach 6 px into the gap each (a turned stern up to about
  22 px at the worst moment), so at the minimum gap at least 28 px of water stays between the hulls; the boards' gap is
  unchanged. In landscape the player's bow and the enemy's stern share the horizontal gap, on lanes up to 48 px apart.

## Shots, effects and taps

- **Boards.** 0.9.4's drawing code (`drawMachinery`, `drawTurrets`, cracks, limpets, the board plate cut from the deck
  sprite) draws each board at rest, at its deck frame `a.drawn`, under that board's canvas transform.
- **Shots.** Each frame `drawShells` maps both ends of each shot through the current transforms: the gun's muzzle
  through the shooter's board, and the target point through the target's board. It lerps between those two current
  points (with 0.9.4's arc), so a shot lands on its tile or hull while both ships move.
- **Effects.** `react()` tags each spawn with the board it belongs to (`Fx.anchor`): its side, the marked side for a
  telegraph, the loser for a KO. Each board's particles, blasts, rings, scorches and damage numbers draw under that
  board's transform, so they ride with it. The camera shake stays global. The HUD (plates, bar, buttons) stays fixed.
- **Taps (REVIEW-MOTION1 Q4).** The HUD hits as before. A tap off the HUD is hit-tested through the inverse of carrier x
  board to a board tile (leaving out the camera shake) and remembered for tooling (`bb.motion().lastTap`); nothing is
  drawn for it, so a player sees no change from 0.9.4. scripts/motiontap.mjs is the test-only probe that checks it.

## Backdrops and REDUCED MOTION

- **Three code-drawn seas, by day:** CALM SEA (days 1-3), STORM (4-7) and EMBER SEA (8-10). Each sea has three layers
  that scroll right to left: far (the water with soft swell bands, opaque), mid (wave crests) and near (whitecaps and
  glints; glowing flecks on the ember sea). Speeds are 3/9/22 px/s (calm), 5/14/34 (storm) and 3/8/20 (ember). A
  dithered vignette sits on top. Contrast is low, so the boards are the bright thing on screen.
- **STORM** has rain streaks (deterministic in time and index) and a soft brightening of at most 6% white over 2.4 s,
  every 13 s. It has no flash.
- **Wake and bow wave.** The wake is the stern's past positions, carried off by the near layer's speed and spreading as
  it ages (none for a ship held still). The bow wave is foam baked into the hull sprite.
- **REDUCED MOTION** (OPTIONS, "REDUCED MOTION: ON/OFF", following prefers-reduced-motion until set) gives straight
  sailing (no bank, drift, surge, bob or sway), the sea at a quarter speed (the water travelled accumulates, so switching
  never jumps), no rain and no storm brightening, on top of 0.9.4's rules (no shake, no flashes). The battle's pace is the
  same with and without it: the sim never reads the display clock (tests/motion.test.ts plays the same battle both ways).

## Caching and cost

- **Sea.** Three layer canvases and a vignette at the logical size, built once per (W, H, sea, REDUCED MOTION, seed,
  scale, DPR); each layer is blitted twice (wrapped) at a whole-pixel offset, and only STORM's rain is drawn per frame.
  The still screens flatten the layers and the vignette into one canvas per key: one blit a frame.
- **Ships.** A ship per faction at heading 0, then per whole degree from -12 to 12, rotated once (nearest neighbour) on a
  212 x 194 canvas around its pivot and cached, with its shadow.
- **Board plates** are cut once per hero and facing from the deck sprite (hull.ts `hullSprite`, carrier.ts `boardPlate`).
  One deck sprite feeds the board plate everywhere (render/ship.ts), and every cache is keyed per hero: CUSTOM-2's deck
  styles (REQ-BFG-072) key the same seams (hull.ts `hullSprite`/`drawDeck`, carrier.ts `boardPlate`, sprites.ts belts,
  ui.ts panels).
- The battle canvas is the logical resolution (195x422 at 390x844), so a frame is cheap. The build screen costs a sea
  blit, the ship and its shadow and the plate, against 0.9.4's floor (a blit and its dust motes), hull, treads and
  sprockets.

## Dev knobs (test builds only)

- `MOTION_KNOBS` is `import.meta.env.DEV` (vite's dev server and vitest) or `VITE_MOTION_KNOBS=1` at build time
  (`VITE_MOTION_KNOBS=1 vite build --outDir dist-knobs`: the scripts' pages). Vite replaces both at build time, so a
  player build (`npm run build`, `build:online`) never calls the URL parser: it is not in the player bundle, and neither
  is the `?perf=1` overlay.
- Knobs: `?motion=0` (0.9.4's floor and tracked hulls on every screen, for comparisons), `?sway=N`,
  `?sea=calm|storm|ember` and `?perf=1` (a frame-time overlay in battle, and running per-layer totals in battle, on the
  title and on the build screen, read through `bb.motion()`).
- Tooling in every build (window.bb): `bb.motion()` (the knobs, the options, and on a battle, title or replay its sea,
  clock, poses and last tap), `bb.motionTile(side, cx, cy)` and `bb.openReplay(o)` (a dusk replayed, for stills).

## Files

src/render/motion.ts (clock, curves, transforms, knobs), src/render/carrier.ts (ships, plates, wake marks),
src/render/ship.ts (the carrier as every screen draws it), src/render/backdrop.ts (seas), src/game/arenaMotion.ts (an
Arena drawn in motion, taps), `laneLayout` in src/game/battleLayout.ts, tests/motion.test.ts, scripts/motionshots.mjs
(stills and the video at its final size), scripts/motiontap.mjs, scripts/motionperf.mjs and scripts/motionpick.mjs.
