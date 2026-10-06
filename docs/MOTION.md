# MOTION-1: battles in motion (a display-only prototype, REQ-BFG-071)

Branch motion1 from motion-base (eb4c249, 0.9.4 as staged). Everything here is behind the compile-time flag
`VITE_MOTION=1`; the default build draws and behaves as at motion-base. The sim, the net code and the server are
untouched, and so is anything the sim imports.

## Motion model and its numbers

- **Display clock.** `MotionModel.t` (src/render/motion.ts) advances by the frame's dt (capped at 0.25 s) in
  `BattleScreen.update`, only while the battle isn't paused or in its menu. It ignores the playback speed (0.5X-4X) and
  the sim's ticks, and the sim never reads it. `dist` counts the water travelled (a quarter speed with reduce motion).
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
- **The gimbal.** Board map = carrier (translate by the lane offset, turn by the heading) x gimbal (turn by
  `-heading + sway`), about the board's pivot (its centre at rest). The two turns cancel to the shared sway
  `s(t) = SWAY sin(2 pi t / 11 s)`, the same for both boards at every instant. `SWAY` = `?sway=N`, at most 3 deg, 0
  (off) by default. At 0 the board map is a whole-pixel translation, so the boards stay screen-aligned and read as today.

## Lanes and gap

- **Portrait (phones): today's stack exactly.** The enemy's lane is above and the player's below, so the screen doesn't
  flip, and today's `battleLayout` sets the scale, board size, gap, plates and bar. The two drifts close and open the gap:
  `gap = gapRest + y_player - y_enemy`, within `gapRest +- 2D`, never below the layout's minimum (17% of the firing
  axis). At 390x844 that is 102 px at rest, at least 90, minimum 72.
- **Landscape and desktop: today's side-by-side boards at today's size.** The player is on the left and the enemy on the
  right, the boards facing each other as today. The lanes split vertically by the band's spare rows, at most 24 px each,
  with the enemy raised and the player lowered. That gives two parallel lanes, the enemy's a little ahead (to the right).
  Surge closes and opens the horizontal gap, bounded the same way. Plates and the bar move with the lanes when the layout
  is made, and stay fixed during the fight (`laneLayout` in src/game/battleLayout.ts).
- Both carriers sail in from the left during the drive-in.
- **Open water stays between the ships.** A ship stands out about 23 px past its board at bow and stern, along x only.
  In portrait a hull turned 12 deg stays within its board's height (half-height 64 of 70 px), so the vertical gap is all
  water. In landscape the player's bow and the enemy's stern take 18 px each of the horizontal gap. At its minimum
  (1280x720: 73 px) 37 px of water remains.

## Shots, effects and taps

- **Boards.** Today's drawing code (`drawMachinery`, `drawTurrets`, cracks, limpets, the board plate cut from today's hull
  art) draws each board at rest, at its deck frame `a.drawn`, under that board's canvas transform. With sway, that
  transform rotates.
- **Shots.** Each frame `drawShells` maps both ends of each shot through the current transforms: the gun's muzzle
  through the shooter's board, and the target point through the target's board. It lerps between those two current
  points (with today's arc), so a shot lands on its tile or hull while both ships move.
- **Effects.** `react()` tags each spawn with the board it belongs to (`Fx.anchor`): its side, the marked side for a
  telegraph, the loser for a KO. A motion build draws each board's particles, blasts, rings, scorches and damage
  numbers under that board's transform, so they ride with it. The camera shake stays global.
- **Taps.** The HUD stays fixed and hits as before. New in the prototype, a tap off the HUD hit-tests through the inverse
  of carrier x board to a board tile: screen point, then rest space, then deck-local, then a tile. The tapped tile lights
  (display only). The hit test leaves out the camera shake: a heavy hit's 5 px shake must not move a tile from under a
  finger. scripts/motiontap.mjs checks it with real touch taps.

## Backdrops and reduce motion

- **Three code-drawn seas, by day:** CALM SEA (days 1-3), STORM (4-7) and EMBER SEA (8-10). `?sea=` forces one. Each sea
  has three layers that scroll right to left. Far is the water itself with soft swell bands (opaque). Mid is wave crests.
  Near is whitecaps and glints (glowing flecks on the ember sea). Speeds are 3/9/22 px/s (calm), 5/14/34 (storm) and
  3/8/20 (ember). A dithered vignette sits on top. Contrast is low, and the brightest marks are sparse, so the boards are
  the bright thing on screen.
- **STORM** has rain streaks (deterministic in time and index) and a soft brightening of at most 6% white over 2.4 s,
  every 13 s. It has no flash. Reduce motion turns both off.
- **Wake and bow wave.** The wake is the stern's past positions, carried off by the near layer's speed and spreading as
  it ages. The bow wave is foam baked into the hull sprite.
- **Reduce motion** reuses `settings.reducedMotion`, already in OPTIONS as "REDUCED MOTION: ON/OFF" and following
  prefers-reduced-motion until set. It gives straight sailing (no bank, drift, surge, bob or sway), the sea at a quarter
  speed (the water travelled accumulates, so switching never jumps), no rain and no storm brightening, on top of today's
  rules (no shake, no flashes).
- **The build screen doesn't move** and keeps today's floor. That costs nothing and risks nothing; the day's sea could
  show still behind it later.

## Caching and the flag

- **Sea.** Three layer canvases and a vignette at the logical size, built once per (W, H, sea, reduce motion, seed,
  scale, DPR). A resize, a setting change or a DPR change rebuilds them. Each layer is blitted twice (wrapped) at a
  whole-pixel offset. Only STORM's rain is drawn per frame.
- **Hulls.** A ship per faction at heading 0, then per whole degree from -12 to 12, rotated once (nearest neighbour) and
  cached, with its shadow. Board plates are cut once per hero and facing from today's hull sprite.
- The battle canvas is the logical resolution (195x422 at 390x844), so a frame is cheap (REPORT section 7).
- **The flag.** `VITE_MOTION=1` at build time sets `MOTION_BUILD`, and the battle screen makes an `ArenaMotion` unless
  `?motion=0`. Without the flag there is no `ArenaMotion`: `ArenaBg` and `drawArena` draw as before, the URL options are
  ignored, the drive-in is today's, and the effect tags are written but never read. The default build's pixels are
  checked against motion-base's (REPORT section 8).
- **Dev knobs** (motion builds only): `?motion=0|1`, `?sway=N`, `?sea=calm|storm|ember` and `?perf=1` (a frame-time
  overlay with the ms split for backdrop, hulls, boards, shots and effects). Tooling: `bb.motion()` and
  `bb.motionTile(side, cx, cy)`.
- **Files.** src/render/motion.ts (clock, curves, transforms, flag), src/render/carrier.ts (ships, plates, wake marks),
  src/render/backdrop.ts (seas), src/game/arenaMotion.ts (the battle drawn in motion, taps), `laneLayout` in
  src/game/battleLayout.ts, tests/motion.test.ts, scripts/motionshots.mjs, scripts/motiontap.mjs and
  scripts/motionperf.mjs.
