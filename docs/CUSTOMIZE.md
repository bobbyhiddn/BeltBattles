# Unlockable styles (REQ-BFG-072): CUSTOM-1's design, built by CUSTOM-2a

CUSTOM-1 (branch custom1) studied the feature and mocked it; CUSTOM-2a (branch custom2, from MOTION-2's accepted tip
73ddef4) builds it. It is presentation only: nothing under src/sim, src/net, server or src/core changes, the fingerprint
and replays are identical, and RULES_VERSION stays.

## The surfaces (CUSTOM-3 adds the fourth, the carrier)

| Surface | What it styles | Code |
|---|---|---|
| Floor panels | the deck grid in the deck sprite, so the board plate on every screen | `hull.ts hullSprite(hero, facing, floor)`, `drawStyledDeck`; `ship.ts heroPlate/drawPlate/drawStillCarrier(.., floor)` |
| Belts | rails, bed, normal chevrons and the turntable's hub; never the speed tints or the warn and dead rails | `sprites.ts beltStraight/beltCorner/turntable(.., style)`, `machinery.ts beltCell` |
| Stats panels | the player's battle plate and the build part panel with its idle forms | `ui.ts statsPanel(g, r, id)`; `battleHud.ts drawPlate`; `inspector.ts drawDetails/drawIdle/drawHeroStrip` |
| Carrier (CUSTOM-3, REQ-BFG-074) | the hull under the board: its paint and the dressing of the stern band and the bow (the outline, plate, pivot, mounts, lanes and motion stay the default's) | `carrier.ts shipSprite/shipShadow(key, P, deg, style)`; `ship.ts drawShip/dimShip/drawStillCarrier(.., carrier)`, `shipKey`; `arenaMotion.ts` |

Every default reproduces today's look and takes today's code path and cache keys (`hull:<hero>:<facing>`,
`plate:<hero>:<facing>`, `beltS:...` without a style suffix), so with no profile the game draws exactly what 0.9.4 with
MOTION-2 draws. A style gets its own cache key (`hull:<hero>:<facing>:<floor>`, `plate:<hero>:<floor>:<facing>`,
`...:<belt>`).

Carrier styles key the ship canvases the same way: the default (WAR COLOURS) keeps `ship:<hero>`, `shipR:<hero>:<deg>`
and `shipS:<hero>:<deg>`; a style uses `<hero>:<style>` in their place (`ship.ts shipKey`).

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
| Carrier | WAR COLOURS (default: today's ship in the faction's hull colours) | - | - |
| Carrier | ADMIRAL'S BLUE (royal blue, gilt line, gilt bow crest, gilt-framed deckhouse) | FINISH 3 RUNS | runsFinished 3 |
| Carrier | IRONCLAD (olive drab armour plating and belt, a steel ram, one broad funnel on a casemate) | BEAT 5 WARLORDS | warlordWins 5 |
| Carrier | STORMCALLER (storm purple, lightning at the stern and bow, rune-lit bow eyes) | WIN WITH 4 DIFFERENT HEROES | heroesWon 4 |
| Carrier | CHAMPION'S GOLD (long goal; gold, a dark cove stripe, a gilt laurel on the bow, a crown) | WIN 100 DUSK FIGHTS | duskWins 100 |

Every carrier style keeps the faction's trim (seams, rivets, the stem line, funnel collars, lamps) and glow (the funnel
mouths, the bridge lights); foes, ghosts and the title's attract fight keep WAR COLOURS. The readability test checks
each style's hull fill on every faction: smoke at 50% and fire at 25% against it and the board plate's ink rim against
it, no weaker than today's four hulls, and "yours": its paint is CIE76 delta E 20 or more from every faction's default
(today's closest two defaults are 19.8 apart). `scripts/stylecheck.mjs` measures the same on CUSTOMIZE's preview carrier.

`tests/styles.readability.test.ts` (with `src/render/styleContrast.ts`) checks every style's colours: belt direction,
tile edges, stat numbers and keyword colours, against thresholds set at today's look. `scripts/stylecheck.mjs` is its
rendered half: on the built page it reads back the pixels CUSTOMIZE draws for every style (the swatches, the preview's
belts, plate and part-panel strip) and measures the same four checks against the same thresholds (tools/styleRefs.ts).

## The profile (src/game/profile.ts)

One offline key, `beltbattles.profile.v1` (REVIEW-CUSTOM1 Q1 amends decision D3 for it):
`{ v, counters: { runs, runsFinished, flawless, duskWins, bestDay, warlordWins, matriarchWins, mostBelts }, heroesWon,
heroesFinished, unlocked, chosen, seen, folded, runNew, updatedAt }`.
- `migrateProfile` defaults every missing field; a newer `v` is read but never written back; a corrupt key is reseeded.
- Seeded once when absent from the local ghost pool (and RUNS_KEY online): best day, heroes with a win, wins per run,
  runs but the one in progress. An undercount.
- Folds (`src/game/styleFolds.ts`) read the run's own records and count once per `<runId>:<day>` (`:warlord`, `:end`):
  after each dusk (finishDay) and warlord result in the battle screen, and at the run's end (the dusk that ends it, the
  summary, ABANDON). The run save is unchanged. **Uploaded since 0.9.11 (PROFILE-UP, REQ-BFG-074 clause 4):** online only
  (a server configured and a device identity loaded; the offline page makes no request), `src/game/online.ts` calls
  `putProfile` (`src/net/profileClient.ts`) once when a run's end has been folded (`styleFolds.ts`, once per run id) and,
  3 s after the last pick, once after a CUSTOMIZE pick that changed a worn style; the body is the canonical wire profile
  (`src/net/profileWire.ts`: the counters, `heroesWon`, `heroesFinished`, `unlocked`, `chosen`, `updatedAt`) signed in its
  own domain with the device key; the server (`PUT /v1/profile`, `server/profileRoute.ts`) merges it into that player's
  record (counters take the larger, the lists the union, the worn styles the newer pick). Upload only: the client never
  merges the answer back; every failure is silent (no dialog, no console line, no retry); no new storage key.

## CUSTOMIZE (src/screens/customize.ts)

From the title's CUSTOMIZE button (the third in the HOW TO PLAY / OPTIONS row; a NEW dot while an unlocked style is
unseen). A preview of your carrier held still on the day's sea, four tabs (FLOOR, BELTS, PANELS, CARRIER), five 46 px
rows; a carrier row's swatch is the ship's bow at 1:1. One tap wears an open style
(saved at once); a tap on a locked one previews it with `PREVIEW: NOT YOURS YET.` in its own band; BACK, ESC or another
tab bring back what you wear. Locked rows show their earn line and progress (a number and a thin bar). The summary adds
`NEW STYLE: <NAME>.` when the run unlocked one. `tests/customize.test.ts`, `tests/profile.test.ts`; stills:
`scripts/customshots.mjs`; by real touch on every phone and the desk: `scripts/touchcheck.mjs` (its customize, newstyle
and roadfork sections; `--profile mixed` for a player with open and locked styles).
