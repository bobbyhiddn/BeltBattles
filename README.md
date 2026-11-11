# BeltBattles

**An industrial-fantasy conveyor autobattler.** You captain a war cruiser across the wastes. You buy salvage from caravans, wire it together with conveyor belts, and send your build into automatic battles. The foes are other players' saved builds.

▶ **Play the live build: [beltbattles.fly.dev](https://beltbattles.fly.dev)**

| | |
|---|---|
| Current release | **0.9.16**: a fairer climb to the tenth win ([changelog](docs/CHANGELOG.md)) |
| Battle rules | `bb-0.15.0` |
| Runs on | any modern browser, desktop or phone |

---

## How a run works

1. **Pick a hero.** Four heroes are open from the start: FURNACE, WEAVER, FOUNDRY and BASTION. Each hero brings a hull, starting turrets and a signature factory.
2. **Dawn: the caravan.** Buy rigs, factories and turrets. Drop them on your deck and drag belts between them. Merging copies of a part raises its stars. Every run's shop holds at least one SHOCK part and one BURN part. From day 2 the caravan can also sell gates: a gate sits on a belt and fuses, splits or burns the slugs that pass. On day 3 and every odd day after, the ENCHANTER sells enchantments, and each one adds an effect to a part.
3. **The road.** Each day you choose one stop: a road event, or a fight with a warlord at Easy, Medium or Hard.
4. **Dusk: the ghost.** You fight another player's build from the same day of their own run. When none fits, a rival captain stands in, so the game also plays fully offline.
5. **Win or lose.** A run is won at **10 wins**. There is no day limit: the days go on while you still have hearts. Lose your last heart and the run is over.
6. **ENDLESS.** After a won run you can keep going. Your build carries on with 3 fresh hearts, and your score is your endless wins.

Battles play themselves. Your skill is in the build: what you buy, where it sits and how the belts feed it. The battle sim runs in fixed steps, is seeded and deterministic, so a fight replays exactly. Every enemy is a real build under the same rules as yours.

## Online play and privacy

- **Ghosts.** At each dusk, your build is uploaded as a ghost for other players to meet. The server re-checks every upload against the game's own rules (deck, gold, road and runes), so only legal builds are served.
- **Anonymous identity.** Each device makes its own key pair (ECDSA P-256 through WebCrypto). Your player ID is a hash of the public key, and every upload is signed with it.
- **What's left out.** No account, email, analytics, ads or third-party scripts.
- **Offline.** Without a connection, the game plays against stand-in captains.

## Tech

- **Client:** TypeScript and plain Canvas 2D and WebAudio, built with Vite into a single-file page of about 1 MB. All art is pixel art drawn in code, and all sound is synthesized in code.
- **Ghost server:** a zero-dependency Node 22 process (`node:http`, WebCrypto) that serves the page and the API. It runs on [Fly.io](https://fly.io) (app `beltbattles`) and stores ghosts and profiles in a Tigris bucket.
- **Tests:** Vitest. The full suite is about 600 files and 7,100 tests, covering the sim, the rules text, the server and the screens.

## Getting started

You need Node 22 or later.

```sh
npm ci
npm run dev            # dev server on http://localhost:5173
npm test               # the whole Vitest suite (large: run single files while you work)
npx vitest run tests/<file>.test.ts
```

| Script | What it does |
|---|---|
| `npm run build` | type-check, then build the offline game into `dist/` |
| `npm run build:online` | build the online game, which talks to the server it is served from, into `dist-online/` |
| `npm run server` | build and start the ghost server locally (settings in `server/config.ts`) |
| `npm run smoke` | a local smoke test of the built ghost server against a fake S3 (run it after staging) |
| `npm run balance`, `npm run parbench` | the balance harness and the par bench: simulated players' win rates and spending, by day and hero |
| `npm run typecheck:server`, `npm run typecheck:tests` | the extra type checks |
| `npm run stage` | stage a release (see `deploy/RUNBOOK.md`) |

## Repository layout

```
src/        the game: sim/ (battle rules), game/ (runs, shop, road), screens/, render/, ui/, audio/, net/, core/
server/     the ghost server: routes, storage (Tigris via S3 and SigV4), seed pool, admin and probe tools
tests/      the Vitest suites
tools/      balance and fight benches, ghost and stand-in pool generators, art and motion digests
scripts/    screenshot, type-check and helper scripts
deploy/     RUNBOOK.md (how a release is staged, checked and shipped), stage.mjs, GAME_BUILD.txt
docs/       CHANGELOG, DESIGN, ASYNC (online play), RACES, MOTION, CUSTOMIZE, HARNESS, TEXT-STYLE
```

## Branches and releases

- **`main`** holds the live build: the code of the latest release, plus this README.
- **`vX.Y.Z` tags** mark the exact commit that shipped for each release, alongside its `live-XXXX` tag.
- **`wip/*` branches** hold work in progress. They are deleted once their work ships.

Each release is staged and checked as described in `deploy/RUNBOOK.md`: the full suite, touch and screenshot checks, and the rules mutants. It is then deployed to Fly. What each release changes for players is in [docs/CHANGELOG.md](docs/CHANGELOG.md).

## What's next

- **The next battle rules (`bb-0.16.0`):** a player who wins two runs in a row meets tougher ghosts; losing or abandoning a run sets that back.
- **New pixel art:** larger, redrawn pictures for heroes, factories and rigs, starting with FURNACE.
- **One player ID across devices:** link a phone, a PC or the web to the same player with a one-time code.
- **Store builds:** iPhone and Android through Capacitor, Steam on desktop, and a free web version, most likely on itch.io.

## License

Private. All rights reserved.
