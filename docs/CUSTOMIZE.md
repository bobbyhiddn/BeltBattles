# Unlockable styles (REQ-BFG-072): CUSTOM-1's design, built by CUSTOM-2a

CUSTOM-1 (branch custom1) studied the feature and mocked it; CUSTOM-2a (branch custom2, from MOTION-2's accepted tip
73ddef4) builds it. It is presentation only: nothing under src/sim, src/net, server or src/core changes, the fingerprint
and replays are identical, and RULES_VERSION stays.

## The three surfaces

| Surface | What it styles | Code |
|---|---|---|
| Floor panels | the deck grid in the deck sprite, so the board plate on every screen | `hull.ts hullSprite(hero, facing, floor)`, `drawStyledDeck`; `ship.ts heroPlate/drawPlate/drawStillCarrier(.., floor)` |
| Belts | rails, bed, normal chevrons and the turntable's hub; never the speed tints or the warn and dead rails | `sprites.ts beltStraight/beltCorner/turntable(.., style)`, `machinery.ts beltCell` |
| Stats panels | the player's battle plate and the build part panel with its idle forms | `ui.ts statsPanel(g, r, id)`; `battleHud.ts drawPlate`; `inspector.ts drawDetails/drawIdle/drawHeroStrip` |

Every default reproduces today's look and takes today's code path and cache keys (`hull:<hero>:<facing>`,
`plate:<hero>:<facing>`, `beltS:...` without a style suffix), so with no profile the game draws exactly what 0.9.4 with
MOTION-2 draws. A style gets its own cache key (`hull:<hero>:<facing>:<floor>`, `plate:<hero>:<floor>:<facing>`,
`...:<belt>`).

## Who wears what (each view sets its skin)

`CruiserView.skin` is set by the screen that makes the view (REVIEW-CUSTOM1 R11); absent, `styles.ts skinOf` gives the
defaults. The player's side wears `profile.ts playerSkin()`: the battle (`arena.views[0]`), replays, the build screen
(and its panels through `Ctx.skin`), the summary and the hero preview. The foe's board and plate, the battle bar, shop
cards, the result card, the foe card and the title's attract fight keep the defaults. Ghosts carry no style (Q4).

## The catalogue (src/render/styles.ts)

| Surface | Style | Earn line (`LOCKED: <LINE>.`) | Counter |
|---|---|---|---|
| Floor | SHIP'S PLATE (default) | - | - |
| Floor | TIMBER DECK | WIN 3 DUSK FIGHTS | duskWins 3 |
| Floor | TREAD PLATE | REACH DAY 5 | bestDay 5 |
| Floor | BRASS CHECKER | BEAT A WARLORD | warlordWins 1 |
| Floor | RUNE STONE (long goal) | FINISH WITH 3 DIFFERENT HEROES | heroesFinished 3 |
| Belts | IRON BELT (default) | - | - |
| Belts | VERDIGRIS | PLAY 2 RUNS | runs 2 |
| Belts | BLUED STEEL | END A RUN WITH 3 BELTS | mostBelts 3 |
| Belts | TIMBER ROLLERS | WIN WITH 2 DIFFERENT HEROES | heroesWon 2 |
| Belts | RUNE CHAIN (long goal) | WIN 60 DUSK FIGHTS | duskWins 60 |
| Panels | SLATE (default) | - | - |
| Panels | BRASSBOUND | FINISH A RUN | runsFinished 1 |
| Panels | VERDIGRIS | BEAT THE IRON MATRIARCH | matriarchWins 1 |
| Panels | CAPTAIN'S DESK | REACH DAY 8 | bestDay 8 |
| Panels | WARLORD'S PLUM (long goal) | WIN A RUN 10-0 | flawless 1 |

`tests/styles.readability.test.ts` (with `src/render/styleContrast.ts`) checks every style's colours: belt direction,
tile edges, stat numbers and keyword colours, against thresholds set at today's look.

## The profile (src/game/profile.ts)

One offline key, `beltbattles.profile.v1` (REVIEW-CUSTOM1 Q1 amends decision D3 for it):
`{ v, counters: { runs, runsFinished, flawless, duskWins, bestDay, warlordWins, matriarchWins, mostBelts }, heroesWon,
heroesFinished, unlocked, chosen, seen, folded, runNew, updatedAt }`.
- `migrateProfile` defaults every missing field; a newer `v` is read but never written back; a corrupt key is reseeded.
- Seeded once when absent from the local ghost pool (and RUNS_KEY online): best day, heroes with a win, wins per run,
  runs but the one in progress. An undercount.
- Folds (`src/game/styleFolds.ts`) read the run's own records and count once per `<runId>:<day>` (`:warlord`, `:end`):
  after each dusk (finishDay) and warlord result in the battle screen, and at the run's end (the dusk that ends it, the
  summary, ABANDON). The run save is unchanged. Nothing is uploaded (Q2: a later server job).

## CUSTOMIZE (src/screens/customize.ts)

From the title's CUSTOMIZE button (the third in the HOW TO PLAY / OPTIONS row; a NEW dot while an unlocked style is
unseen). A preview of your carrier held still on the day's sea, three tabs, five 46 px rows. One tap wears an open style
(saved at once); a tap on a locked one previews it with `PREVIEW: NOT YOURS YET.` in its own band; BACK, ESC or another
tab bring back what you wear. Locked rows show their earn line and progress (a number and a thin bar). The summary adds
`NEW STYLE: <NAME>.` when the run unlocked one. `tests/customize.test.ts`, `tests/profile.test.ts`; stills:
`scripts/customshots.mjs`.
