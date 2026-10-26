# BeltBattles async ghosts

Groundwork for the 10-day run (ROADMAP §1, §3; spec §18, §20, §23): every day ends at
dusk in a fight against another player's **ghost**, meaning their saved build from the same
day of their own run. This covers the format, validation, matchmaking, replay, offline
fallback and a small build server. 0.7.0a wires it into the game behind a server URL setting
("0.7.0a: what the game does online", at the end); with no URL, the default, the game plays
offline exactly as 0.6.2. 0.7.0 ships it: the Fly page plays online, the store has its admin tool
("Operations"), and "0.7.0 for players" says what changes for a player. 0.8.0 changes battles, so its rules
are **bb-0.8.0**: a fresh ghost pool, seeded with all four playable heroes ("0.8.0: rules bb-0.8.0 and the
four-hero seed pool"). BELTS changes battles again (belt slots by level, the hero's two gold upgrades), so its rules are
**bb-0.8.3** ("BELTS: rules bb-0.8.3").

## Architecture

```
 game client (browser, single-file build)             build server (node:http, no deps)
 ─────────────────────────────────────────            ───────────────────────────────────
 dusk: snapshot.ts ─ validate.ts ─ submitGhost ──POST /v1/ghosts──▶ verifyUpload ▶ decode ▶ validateUpload ▶ store
       (signed with the device key: identity.ts)
 dawn: fetchGhost ◀───────────────GET /v1/ghosts/match──────────── pickGhost (same rules+day, no better
        │ error / timeout (4 s) / 404 / invalid answer                record: D1; runs < 3: seed pool only: D2)
        ▼
       the game (0.7.0a): 0.6.2's own dusk stand-in, standInFoe (fetchGhost's offline- fallback mapped)
 fight: simulate(player, ghost, battleSeed) on the device; the dusk keeps battleRecordFor(...) for REPLAY
```

| File | Role |
|---|---|
| `src/net/snapshot.ts` | `GhostSnapshot`, canonical encode/decode, strict checks, 16 KB cap, content ids |
| `src/net/validate.ts` | `validateBuild(build, day, mode = "strict")`, `validateUpload` (the player mode), `maxGoldByDay`, `buildCost` |
| `src/net/roadCap.ts` | the player mode's road ceiling: `roadCap`, `maxHonestSpend`, the reachable hull and belt, the D4 model |
| `src/net/rulesGate.ts` | `parseRules`, `rulesAtLeast` and the gate that keeps turret slots and belt joins out of rules before bb-0.6.2; 0.8.0: `RULES_HEROES`, the heroes each rules version carries (FURNACE and WEAVER up to bb-0.6.2, the four playable heroes from bb-0.8.0) |
| `src/net/matchmaking.ts` | pure `pickGhost(pool, req, rng)`, `eligible` (with the record rule, D1), `isNewPlayer` and `NEW_PLAYER_RUNS` (D2), `matchSeed` |
| `src/net/records.ts` | 0.7.0a: the records (wins, lives) a run can carry into each dusk under 0.6.2's run rules, unchanged under bb-0.8.0 and bb-0.8.3 (`reachableRecords`, `isReachable`, `floorRecord`). The seed, `ghosts:admin revalidate` and, since 0.8.0 H2, `POST /v1/ghosts` refuse a record `isReachable` refuses |
| `src/net/replay.ts` | `battleRecordFor`, `replay`, `replayBattle`, rules-version refusal |
| `src/net/fallback.ts` | `offlineGhost`, `loadGhostPool`, `fallbackGhost` |
| `src/net/ghostClient.ts` | `fetchGhost` and `submitGhost` (signed): fetch + AbortController, never throw |
| `src/net/identity.ts` | the device key, `loadIdentity`, `playerIdFromKey`, `verifyUpload` (0.7.0: see "Identity and signed uploads") |
| `src/game/online.ts`, `session.ts` | 0.7.0a: the game's online session (the server URL setting, the identity, the dawn fetch, the dusk upload, the finished-runs count); `session.ts` holds it for the screens and game logic |
| `src/game/replays.ts`, `src/screens/replay.ts` | 0.7.0a: REPLAY of a stored dusk record from the run summary, read-only |
| `server/` | `app.ts` (routes), `store.ts` (the async `GhostStore` interface and the JSON-lines store), `tigrisStore.ts` (Tigris store), `s3.ts` + `sigv4.ts` (S3 client and signer, no SDK), `seed.ts` (the `seed` command), `config.ts` (flags and env), `main.ts` (CLI), `node.d.ts` (Node types) |
| `tools/` | `samplePool.ts` (the seed pool: 120 checked ghosts of the four playable heroes since 0.8.0, see "Seeding"), `genGhostPool.ts` (writes the JSON), `fakeS3.ts` (in-process S3 for tests), `smoke.ts` (local smoke run) |
| `deploy/`, `fly.toml`, `Dockerfile` | the Fly deploy kit: see "Running on Fly + Tigris" and `deploy/RUNBOOK.md` |

Scripts: `npm run build:server` (type-checks with `tsconfig.server.json`, then bundles with
vite into `server/dist/`), `npm run server -- --port 7790 --data ./ghost-data`,
`npm run gen:ghosts -- --out <file>`, `npm run typecheck:server`,
`node server/dist/ghost-server.mjs seed`, `node deploy/stage.mjs <game.html>`, `npm run smoke`.

## Snapshot format (v2)

`{ v: 2, rules, hero, day, wins, lives, build, runId, playerId, createdAt }` (`SNAPSHOT_VERSION` = 2)

- `rules` is `RULES_VERSION` at the fight (bb-0.8.3 since BELTS; bb-0.8.0 in 0.8.0 to 0.8.4; bb-0.6.2 in 0.6.2 and 0.7.0). `day` is 1-10. `wins` (0..day−1) and `lives` (1..9) are
  the record the player carried **into** that dusk fight. `build` is the deck exactly as it fought.
- v2 is v1 plus what a 0.6.2 deck can hold, each optional and written only when present: `stars` (1..3) on an
  item or mod (merged copies), `rot` (0..3) on an item (a rig's rotation), `build.turrets` (at most 8 entries
  `{ slot, def, uid, stars?, free? }`: the hull's turret slots) and `join` on a route (a joining belt's join
  tile). A v1 snapshot still decodes (as 1-star copies, `migrateV1` moves its gates beside the belts); v1 may
  hold none of the four. Turrets and joins need bb-0.6.2 rules or later (the rules gate, below).
- bb-0.8.3 (BELTS): a v2 build may also carry `upgrades` `{ turret?, factory? }`, the hero's two gold upgrade levels, each
  1..4 (absent = 1), written only when a level was bought, last among the build's keys. A build without it encodes byte
  for byte as before, so `SNAPSHOT_VERSION` stays 2: the rules string keeps the pools apart. A level outside 1..4 (5,
  0, 2.5) or an unknown track is a decode error (400).
- The game writes v2: `ghostOf(run, createdAt, playerId)` in `src/game/day.ts` (0.7.0a uploads it under the
  device key's playerId, see "0.7.0a: what the game does online"); `src/game/ghostSnapshot.ts` mirrors the
  contract for the local pool, and tests/snapshot.contract.test.ts holds the two together.
- Canonical JSON: fixed key order, no whitespace, arrays in build order (item and route
  order matter to the sim). `encode(decode(x))` is byte-stable, so the id is a content hash:
  `ghostId = "g" + cyrb53(canonical)` in hex. Resubmitting the same snapshot is idempotent.
- Decoding is strict: unknown fields at any depth, missing fields, wrong types, non-integers,
  off-grid cells, ids outside `[A-Za-z0-9_-]{1,64}` and anything over **16 KB** all throw.
- The shape allows a negative `hullBonus` so battle records holding the earlier warlord stand-ins still
  decode (stand-ins now come from the stand-in pool). The strict `validateBuild` rejects it; the player mode
  accepts exactly the hulls a run reaches (−100 after a RIDE THROUGH with no plating).

## Validation (`validateBuild(build, day, mode)`)

One validator, two modes (0.7.0 prep, v070-validate):
- **strict** (`validateBuild(build, day)`, the default): the shop alone. It is the check for stand-ins, the
  bundled pool (`fallback.ts loadGhostPool`), the harness and the pool generator, which are all generated
  inside these rules.
- **player** (`validateUpload(build, day, rules = RULES_VERSION)`): a deck a real player uploaded (`POST /v1/ghosts`)
  or a ghost the server serves (`ghostClient.ts fetchGhost`). Every strict rule applies unchanged, except the
  **supply** and **budget** blocks, which also count what the road puts on a deck (below). It accepts every deck
  the strict mode accepts under today's rules. `rules` is the snapshot's rules version (0.7.0, v070-rel): see
  **rules** below.

Both use deck.ts's own rules, and every error starts with its category:
- **shape**: the strict build shape, and day 1-10.
- **item**: every item and mod exists; uids are unique; there is exactly one signature factory and it is the hero's own
  (a foreign Kiln or Loom is rejected); every other item is sold by a merchant.
- **turret** (0.6.2s turret slots): each entry of `build.turrets` is a turret def in a slot of the hull, one per
  slot, uids unique with the items' and mods', stars 1-3; a free copy only of the hero's own starting defs, at most
  as many as it starts with.
- **placement**: `canPlaceItem` (deck equipment only, on the deck, no factory on a belt) and
  no overlapping footprints.
- **route**: `routeWellFormed` (starts beside its factory, orthogonal steps, no loops, passes
  only through gates), no crossings, **connected** (ends on a turret connector it claims, or, 0.6.2j, legally
  joins a belt whose chain does; spec §8.1), routes per factory ≤ its outputs, belt tiles ≤ `beltCap`. A join must be
  legal (`deck.ts joinProblem`: next to its join tile, another belt's tile, no loop). Under bb-0.10.0 (FREE_JOINS,
  REQ-BFG-091, on from HULL-ON's flip) a deck holds any number of legal joins, and a joined factory runs at its full
  pace: there is no `JOIN_LIMIT` and no `JOIN_PACE`. A record under older rules keeps its own rule (`rulesGate.ts
  freeJoinsFor`): at most `JOIN_LIMIT` (2) joins, the next legal one in route order refused, "2 JOINS PER DECK" (0.6.2
  RULE JOIN LIMIT), and its joined factories at `JOIN_PACE`. A join with an illegal shape keeps its shape reason and
  never counts. Both modes share this check.
- **hardpoint**: only turret equipment, on an installed turret; at most that turret's gear slots of gear, never
  two copies of one gear on a turret, one core per socket.
- **rules** (`validateUpload` only, given the snapshot's `rules`): turret slots (a non-empty `build.turrets`) and belt
  joins (any route `join`) are bb-0.6.2 rules. Under rules that predate bb-0.6.2, or that `src/net/rulesGate.ts` can't
  read as `bb-MAJOR.MINOR.PATCH`, such a deck is refused with one error naming the rules and the feature.
- **supply** (strict): `beltCap` = hero base + whole +4 belt crates; `hullBonus` = whole +250 plating.
- **budget** (strict):

```
maxGold(day) = START_GOLD + Σ_{d=1}^{day−1} incomeFor(d, won = true)     // 8, 17, 27, 38, 50, 63, 77, 91, 105, 119
cost(build)  = Σ value(deck items) + Σ value(turret mods)                  // value = price × 2^(stars − 1)
             + Σ turretValue(installed turrets)   // 0.6.2s: price × (2^(stars − 1) − 1 if it holds the free starting copy)
             + price(beltcrate) × ceil((beltCap − hero.belt) / 4)
             + price(plating)   × ceil(hullBonus / 250)
valid ⇔ cost(build) ≤ maxGold(day)
```
For the shop alone this is a safe upper bound: selling refunds at most half the value, rerolls only spend.

### The player mode's supply and budget (`src/net/roadCap.ts`)

The road puts more on a real player's deck than the shop's gold: road gold (warlord wins, the herald's bounty,
bets, SCRAP IT, the coin pouch, RIDE THROUGH), free or cheap parts (SALVAGE, SMUGGLER, TRADER SWAP, a Hard
win's pick, the Matriarch's part, each a 1-star copy through `gainModule`), the scout's discount or free reroll,
and hull and belt off the shop's grid (dock PLATING +200 hull, RIDE THROUGH −100 hull, the BELT SPOOL +4 belt).
The strict check refuses such honest decks.

- **supply** (player): `hullBonus` = 250 × plates (`ITEMS.plating.supply.hull`) + a *mix* of the road's hull choices
  (dock PLATING +200, RIDE THROUGH −100, each once a run; eventDefs.ts), never below events.ts's HULL TOO WEAK floor
  after a hull cost (roadCap.ts `HULL_FLOOR`, 1000); `beltCap` = hero base + 4 × crates + the BELT SPOOL (+4, once).
  The mix's events must fit in the day's road stops (one a day): a hull of 100 (dock + ride-through) is reachable
  from day 2, never on day 1. With NPC_DAY on and the uploader's seed, they must also be events that seed offered by
  that day (`eventFor(seed, 1..day)`, each day's event after its fight); a mix that needs another is refused with its
  own line (AZ-PREP; REVIEW-HULL1D Q1). Off, or without a seed (a served ghost), the mix is seed-blind. `hullBonus`
  stays a day-1 number in the snapshot and in these checks: with HULL_SCALE on, M scales it in battle, where the max
  hull is M(d) × (hero base + `hullBonus`), rounded to a whole 10 (hullScale.ts `hullAt`, battle.ts; AZ-BUMP,
  REVIEW-AZPREP Q4).
- **budget** (player):

```
maxHonestSpend(day) = maxGold(day) + roadCap(day)       // bb-0.9.7, NPC_DAY off: roadCap 5, 17, 28, 44, 57, 73, 89, 108, 124, 147
                      + drops (NPC_DAY on)              // NPC_DAY on (npcPlanDP): roadCap 5, 20, 36, 51, 66, 80, 93, 102, 113, 123: each day
                                                        // a fight's gold (the best tier's) then the day's event; no part priced: the road log
                                                        // names each drop and validate.ts counts it at its value (roadDropValue, "+ drops N")
                                                        // HULL_SCALE on moves maxGold on days 8-10 (92, 108, 125) and roadCap
                                                        // on day 9 by 1 (125; 114 with NPC_DAY on)
cost(build)         = parts + price(plating) × plates + price(beltcrate) × crates
parts               = buildCost's own terms but the supplies: items, turret mods and the installed turrets
                      (bb-0.8.3: and the upgrade gold paid, 0 / 10 / 30 / 60 a track)
valid ⇔ for some reachable mix: cost(build) ≤ maxGold(day) + roadCapFor(day, mix)
```
The player mode prices the parts with the strict mode's own `buildCost`, so a new cost term (0.6.2s: the installed
turrets, where a free starting copy is worth 0) is counted the same way in both modes. Turrets come only from the
caravan (eventDefs.ts keeps them out of every road pool and trade), so the road ceiling needs no turret term.

`roadCap(day)` is the most extra value any honest run can have put on its deck by that dusk. It is the best
plan over the days 1..day, read from the live tables (eventDefs.ts `EVENTS`, road.ts `warlordReward` over every
captain a slot can hold, content.ts prices and merchants):
- one road stop a day: the day's event or a warlord; each event at most once a run (days 1-10 are one bag of
  all ten events); the Iron Matriarch from day 8, once; a staked bounty pays on the next Hard win; fights won
  and bets won (the max);
- **timing**: gold received on day d is spendable from caravan d+1 only (REFIT after the road has no shop), so
  it counts only for d < day; parts, hull and belt reach the deck the same day (REFIT); gold paid always counts;
  the scout's discount or free reroll counts only when the next caravan comes by that dusk;
- the discount is priced exactly for its model: rolls of at most `OFFERS` distinct defs (merchants are drawn
  without replacement, a wagon never repeats a def), every price −1 (min 1), rerolls at `REROLL_COST`, all the
  gold a run can hold at that caravan. That gold is a deliberate over-count: road parts count as if sold at
  full value, and it comes from the best gold plan of those days, not from the deck's own plan;
- every Hard fight pays the best captain's part that day, with or without a SABOTAGE. A seed's Hard slot shows each
  captain once on days 1-5 and never yesterday's, so this over-counts too: on bb-0.6.2 one captain alone pays the
  day's best part on several days. A free SABOTAGE adds nothing (no best pay needs one).

Against the best plan one run can follow (its own road gold funds its discount, every part stays on the deck, the
captains one seed shows, no free SABOTAGE), the slack is 0, 0, 0, 2, 4, 6, 8, 10, 12 and 14 gold on days 1-10 on
bb-0.6.2, and the same on bb-0.8.0 and bb-0.8.3 (the pins pass unchanged). Of that, up to 2 gold a day is the Hard rotation (`tests/net-upload.slack.test.ts` pins every part).

A deck whose hull or belt came partly from the road is checked against the plans that took those events with
those choices (`roadCapFor(day, mix)`), so the hull and belt are costed at their cheapest honest mix: the
dock's plating costs its 2 gold and that day's road stop.

New road content must update the ceiling on purpose: the Delta kinds, events, fork picks and warlord reward
fields are reviewed lists in roadCap.ts (a new kind or event fails to compile, and tests/net-upload.test.ts's
D4 guard fails). Anything unmodelled throws `RoadModelError`, and `validateUpload` then refuses with a
`budget: the player ceiling is unavailable` error. It never passes a deck silently.

## Matchmaking (`pickGhost`)

Candidates are ghosts with the requester's `rules` and `day`, excluding the requester's own
`playerId` and every id in `seen` (the ghosts already fought this run). They are ranked by
`|wins − req.wins|`, then `|lives − req.lives|`, and the pick is uniform within the best rank
via `rng.int`. That rank is sorted by id first, so the result depends only on the pool
contents, the request and the rng. It returns `null` when nothing is left. The server seeds
with `matchSeed(req, minute)`, so a retry within a minute returns the same ghost while later runs vary.

0.7.0a adds two rules (the Prime's decisions):
- **D1, the record rule:** a player is never handed a ghost with a better record. `eligible` keeps a ghost
  only with fewer wins than the request, or as many wins and at most as many lives (`noBetterRecord`); the
  ranking above then runs on what is left. It holds on the server and in every client-side pick
  (`fallbackGhost`), and `fetchGhost` refuses a served ghost with a better record (it falls back), so a server
  without the rule can't hand one over either.
- **D2, the new-player pool:** a player's first `NEW_PLAYER_RUNS` = 3 finished runs (won or lost) match only
  seed ghosts, never another player's upload. The request carries `runs`, the device's count of finished
  runs; absent counts as 0. While `runs < 3` the route matches `store.bucket(rules, day, "pool")`, the seed
  pool alone (`ghosts/<rules>/dNN/pool/` on Tigris, `pool.jsonl` on the JSON-lines store); the record rule
  applies inside it too.
- Nothing eligible: **404**, and the game falls back to 0.6.2's own stand-in.

`GET /v1/ghosts/match?rules=&day=&wins=&lives=&player=&seen=id1,id2&runs=n`; `runs` is 0..9999.

## Replay and rules versions

A `BattleRecord` is `{ rules, seed, builds: [player, ghost] }`. The seed is `battleSeed(run)`. The sim is
fixed-step with one seeded Rng, so `replay(record)` reproduces the winner, end tick and both
hulls bit for bit (tested over 60 seeds, headless and frame by frame). `replay` and
`replayBattle` **refuse** a record whose `rules` differ from `RULES_VERSION`.

**The REPLAY button (0.7.0a, decision D6).** Online, each dusk keeps its `battleRecordFor(your deck, the
foe's deck, battleSeed(run))` and both final hulls in its `DayResult` (the run's round history). The run
summary's round history shows REPLAY on each such dusk: it plays `replayBattle(record)` in the battle view
(`src/screens/replay.ts`: the same arena, plates and playback bar, then the result and BACK). A replay is
read-only: it changes no run state. A record whose rules differ says "REPLAY UNAVAILABLE (OTHER RULES)".
Offline (no server URL) a dusk stores no record, as 0.6.2, so the summary has no REPLAY column.
0.7.0 (R1 M1): on a phone (the viewport's short side under 500 CSS px) the REPLAY targets leave the 8 px rows,
too small to tap: a strip under the round history holds one button per stored dusk (REPLAY DAY n, or RULES), each
at least 44 CSS px tall and wide (`summaryLayout`, tests/summary.replaytap.test.ts). The desktop keeps the cell
in the row.

Turret slots and belt joins are bb-0.6.2 rules (0.7.0, v070-rel). `src/net/rulesGate.ts` is the one place that reads
a rules version as a number. `rulesAtLeast(rules, "bb-0.6.2")` reads `bb-MAJOR.MINOR.PATCH` and refuses anything
else. A build with a non-empty `turrets` or any route `join` under older or unreadable rules is refused on every
accepting path, before the path's exact `RULES_VERSION` check:
- the strict snapshot decoder `checkSnapshot`: `POST /v1/ghosts` (400) and the server's store, the client's upload
  encoder, `fetchGhost` (falls back) and `loadGhostPool` (rejected);
- `checkRecord` (`replay`, `replayBattle`): a `RulesMismatchError` naming the build;
- `validateUpload(build, day, rules)`: a `rules:` error.

It is defence in depth for a server that will accept more than one rules version. Today every path also demands
`RULES_VERSION` exactly.

The heroes go by rules version too (0.8.0 H1, `RULES_HEROES` in `src/net/rulesGate.ts`): FURNACE and WEAVER under
bb-0.6.2 and every earlier or unreadable version, and the four playable heroes (FURNACE, WEAVER, FOUNDRY, BASTION) from
bb-0.8.0 on. The strict decoder and `validateUpload` ask it, so a FOUNDRY or BASTION ghost can never travel under 0.7.0's
rules, whatever a client sends. From the 0.8.0 RC `RULES_VERSION` was bb-0.8.0 (`HEROES_RULES`); since BELTS it is
bb-0.8.3, a later version that takes the same four (the table needs no new row).

Ghosts only match their own rules version. What a rules bump (any change to content.ts
numbers or sim behaviour) does to the pool (0.8.0's bump to bb-0.8.0 is one: see "0.8.0: rules bb-0.8.0 and the
four-hero seed pool"; BELTS's to bb-0.8.3 another: see "BELTS: rules bb-0.8.3"):
- The server only accepts uploads under its own `RULES_VERSION`, so deploy it together with the game.
- Old ghosts stay in `ghosts.jsonl` and in memory, bucketed by rules. Old clients can still
  match each other; new clients start with an empty pool for the new version.
- Until players refill it, new clients meet the seed pool, which must be regenerated for the new rules
  (`npm run gen:ghosts` writes it; `seed` refuses entries of other rules), and then 0.6.2's own stand-in when
  nothing is eligible; the stand-in pool is regenerated with `npm run standins`.
- Stored battle records from older rules can no longer be replayed by the new build.
  Keep the old build hosted if old replays matter.

## Offline fallback

`fetchGhost` never fails. On a network error, a timeout (AbortController), a non-200 answer, an empty
body or an unusable ghost (wrong rules or day, our own, already seen, or failing `validateUpload`, the player mode),
it returns `fallbackGhost(req, pool)`:
1. a bundled-pool ghost chosen by `pickGhost` with `new Rng(req.seed)`, else
2. `offlineGhost(hero, day, seed)`: `standInPick(foe, day, seed)`, a deck of the other faction
   for that day from the bundled stand-in pool (`src/sim/standInPool.ts`), with the requester's
   record. Every pool deck spends the full purse (at least 90% of `maxGoldByDay(day)`) and wins
   at least half its battles against the day's par deck (`heroRefBuild`) of either faction. Its
   playerId is still `"offline-warlord"`, kept for compatibility.

`loadGhostPool(json)` strictly decodes each entry, requires the current rules and a passing
`validateBuild` (the strict mode: the bundled pool is generated inside the shop's rules), drops duplicates,
and reports rejected entries by index.

**What the game does with a fallback (0.7.0a).** The game ships no ghost pool (the page stays its size) and
calls `fetchGhost` without one, so its fallback is always `offlineGhost` (an `offline-` id). The game never
fights that deck: any fallback becomes 0.6.2's own tuned dusk stand-in, `standInFoe(run.seed, day)` (the day's
rival captain with its named build), labelled OFFLINE STAND-IN (`src/game/day.ts onlineFoe`).

## Security stance

- Fights are simulated **on the client**. The server never runs a battle and never receives
  results, so a cheater can only lie about their own record, which only changes whom they are matched with.
  Since 0.8.0 H2 the lie must at least be a record a run can reach (`POST /v1/ghosts` refuses any other with 422), so a
  deck can't claim, say, one life on day 1 to be matched against more players.
- The server **re-validates every deck** (shape, legality, and the player mode's budget) and every rule
  lives in the shared TypeScript. The client also validates each ghost before simulating it (the player
  mode), so a hostile server cannot crash the sim with a malformed deck.
- Uploads are **signed** with a per-device key, and the server stores a ghost only under the
  playerId of the key that signed it (see "Identity and signed uploads"). A body is validated only
  after its signature and playerId check out.
- Limits: 16 KB bodies (checked by header and while streaming), a per-IP fixed-window rate limit
  (120/min by default), 10 s request and 5 s header timeouts, strict query parsing, a CORS
  allow-list (default `http://127.0.0.1:7778`, the local Shore), and a 127.0.0.1 bind by default.
- **Ranked play later:** clients upload battle records, and the server re-simulates them with
  `replay()`, which already runs in Node, before counting a result. It would also rate-limit
  and dedupe by `runId` and sign stored results. No change to the snapshot format is needed.

## Identity and signed uploads (0.7.0)

REQ-BFG-016 and ROADMAP §3: no login is needed to play. Each device makes its own private key and
a public player ID from it, and signs every upload, so nobody can post as you. `src/net/identity.ts`
runs unchanged in the browser and in Node, through WebCrypto only (`globalThis.crypto.subtle`: no
`Buffer`, no `node:crypto`). The server checks uploads with its `verifyUpload` and nothing else.

| | The contract |
|---|---|
| Key | ECDSA P-256 with SHA-256 |
| Private key | generated non-extractable and kept as a `CryptoKey`. In the browser it lives in IndexedDB, database `beltbattles-identity`, never in localStorage, which every page on the shared Shore origin can read |
| Creation | once, add-if-absent, then read back: two tabs racing on a fresh browser both end up with the pair stored first |
| Public key | exported `raw`: 65 bytes, uncompressed (`0x04`, x, y) |
| `playerId` | base64url without padding of SHA-256(raw public key): 43 characters, which fits `ID_PATTERN` |
| Signed message | the UTF-8 bytes of `"bb-ghost-upload-1\n"`, then the exact request body bytes |
| Headers | `x-bb-key`: base64url(raw public key), 87 characters. `x-bb-sig`: base64url(the 64-byte signature in WebCrypto's r‖s form), 86 characters |
| No `crypto.subtle` | on a plain-http page, which is not a secure context, `loadIdentity` returns null and the caller must not upload: the game plays offline |

- base64url is RFC 4648 §5 without padding, and strict: a value with padding, `+`, `/`, whitespace
  or non-zero unused bits is malformed. `x-bb-key` must decode to 65 bytes starting with `0x04`, so
  one key has exactly one playerId, and `x-bb-sig` to 64 bytes.
- `loadIdentity(store, subtle?)` returns `{ playerId, publicKey, sign(body) }`, where `sign` returns
  the two header values, or null when there is no WebCrypto or the key store fails. It never throws.
  The stores are `indexedDbKeyStore()` for the browser and `memoryKeyStore()` for tests and tools.
- `playerIdFromKey(raw, subtle?)`. `verifyUpload(body, key, sig, subtle?)` returns
  `{ ok: true, playerId }` or `{ ok: false, error }` and never throws. `uploadHeaderError(key, sig)`
  is its syntax-only first half, which the server runs before it reads the body.
- `submitGhost(baseUrl, snapshot, identity, timeoutMs?)` encodes the snapshot once, signs those
  bytes and sends exactly them. A snapshot whose `playerId` is not `identity.playerId` returns
  `{ ok: false, error }` without a request.

**POST /v1/ghosts**, checked in this order:
1. Uploads closed: 403, and the body is not read.
2. `x-bb-key` or `x-bb-sig` missing or malformed: 401, and the body is not read.
3. The body is read within the 16 KB limit (413 over it), then the signature is checked over the
   exact bytes received: 401 if it does not match.
4. The snapshot is decoded, strictly: 400 on an error. The decoder bounds the record: day 1..10, wins 0..day-1 and
   lives 1..9, so a record outside those keeps its 400. It also carries the rules gates (`src/net/rulesGate.ts`):
   turret slots and belt joins need bb-0.6.2 or later, and the hero must be one its rules take. bb-0.8.3 (like bb-0.8.0)
   takes FURNACE, WEAVER, FOUNDRY and BASTION, so a METRONOME or SIPHON upload gets 400
   `snapshot.hero: rules bb-0.8.3 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not METRONOME` (0.9.0 adds them).
5. `snapshot.playerId` is not the key's playerId: 403.
6. The rules version: anything but this build's `RULES_VERSION` exactly gets 422 (`rules bb-0.8.0 not accepted: this
   server validates bb-0.8.3`).
7. The deck, in the player mode (`validateUpload`): 422 `deck failed validation`, with its errors.
8. The record (0.8.0 H2, backlog 325): a (wins, lives) no run can carry into that day's dusk (`src/net/records.ts
   isReachable`, the check the seed and `ghosts:admin revalidate` apply) gets 422, named with the day in revalidate's
   words, for example `{"error":"record: 0W 1 lives is no record a run carries into dusk 1"}`. Before H2 an honest,
   signed, budget-checked deck could carry a fake low record, such as one life on day 1, and so be eligible for more
   matches (D1 serves only ghosts with no better record). See "0.8.0 H2: the record check" for the two old saves whose
   uploads it refuses on purpose.
9. Then the store: 201, or 200 if the ghost is already stored. Nothing refused above is stored.

The stored record keeps its format (`{"id","at","snapshot"}`): neither the key nor the signature is
stored. A stored ghost's playerId is its key's hash, so the ghost names its owner without holding
the key. CORS allows the headers `content-type, x-bb-key, x-bb-sig`. The rate limit and the IP-free
request log are unchanged. `seed` writes the pool into the store directly: it never goes through
POST and signs nothing.

What signing buys: nobody can upload under a playerId whose private key they don't hold, and a
body changed in transit is refused. What it doesn't: anyone can make new keys, so the per-IP rate
limit and deck validation still bound a flood; it proves nothing about how the deck was played;
and there is no nonce, so re-sending a signed upload stores nothing new (the ghost id is the
content hash: 200).

**Migration for the 0.7.0 wiring.** The key's playerId becomes the upload id: every snapshot the
game uploads, and the `player` of every match request, is `identity.playerId`. 0.6.0's random
id (`beltbattles.player.v1` in localStorage, `"p"` plus 20 base-36 characters) is never uploaded.
It is kept only to recognize the player's own older local ghosts, which are stamped with it and are
never fought. `submitGhost` refuses such a ghost as it is, because its playerId is not the key's.

## Privacy

`playerId` is the base64url SHA-256 hash of the device's public key (0.7.0; 0.6.0's anonymous
random id stays on the device, see the migration rule above), and `runId` is an anonymous random id
made on the device. The id pattern cannot hold an e-mail address, and neither id is linked to an
account. The device key is made in the browser and never leaves it: the private key is
non-extractable, kept in IndexedDB (database `beltbattles-identity`), and signs uploads only.
Clearing the site's data deletes it; the next upload then comes from a new key and so a new
playerId. An upload carries the public key and a signature. The server checks them and stores
neither: the stored ghost is the snapshot alone. Snapshots hold no names, no accounts and no IP
addresses. The server's stdout request log holds the time, method, path, status and duration of
each request, and nothing else: no client IP, no query string (the query holds the player id),
and no key, signature or player id. The rate limit keys on the client IP (on Fly, the player's
Fly-Client-IP) and keeps it in memory only, so no player address is written to the store or reaches
Fly's log stream.

## Hosting options (operator decides)

| Option | Effort | Rough cost | Notes |
|---|---|---|---|
| Stay local (today) | done | €0 | Reachable on this machine and through Shore only |
| Tailscale Funnel from this machine | ~1 h | €0 | Public HTTPS URL; online only while this machine is |
| Small VPS (Hetzner CX22, DO basic) + Caddy TLS + domain | ~½ day | €4-6/mo + ~€12/yr domain | systemd unit, nightly copy of `ghosts.jsonl` |
| Fly.io / Render / Railway + 1 GB volume | 2-4 h | ~$2-7/mo | Needs a volume for the JSON-lines file |
| **Fly.io + Tigris (chosen)** | kit done | a few $/mo; the machine stops when idle | No volume: ghosts are Tigris objects. See "Running on Fly + Tigris" |
| Cloudflare Workers + D1/KV | 1-2 days | free tier likely enough | Port `app.ts` to fetch handlers and the store to D1; `src/net` runs unchanged |

At about 1 KB per ghost, 1 million ghosts is about 1 GB. The in-memory index is fine up to hundreds of
thousands. Past that, cap each (rules, day) bucket or move to SQLite.

## Running on Fly + Tigris

One `shared-cpu-1x` machine with 256 MB in `iad` runs the bundle (`node:22-alpine`, no npm install)
and serves both the game page (the published build recorded in `deploy/GAME_BUILD.txt`, at `/`) and the API (`/v1/...`) from one HTTPS origin,
https://beltbattles.fly.dev. It stops when idle and starts on the next request. Ghosts live in a
Tigris bucket (Fly's S3-compatible object storage), so the machine has no volume and nothing to
back up. The kit is `fly.toml`, `Dockerfile` and `.dockerignore` at the repo root, plus
`deploy/stage.mjs`, `deploy/GAME_BUILD.txt` and `deploy/RUNBOOK.md` (the exact commands, the checks
to run and rollback). `npm run smoke` runs the built bundle against the in-process fake S3.

**The two pages (0.7.0).**
- **The Fly page plays online.** `npm run build:online` is the same Vite build as `npm run build`, with
  `VITE_GHOST_SERVER=same-origin`, into the gitignored `dist-online/`. The two bundles differ in that one setting
  (tests/build.online.test.ts). `node scripts/singlefile.mjs <out.html> --dist dist-online` inlines it into the
  single-file page.
- **Where it plays.** Served at `/` by the ghost server (`BB_GHOST_STATIC`), it plays online against the origin that
  serves it, with no `?server=`. Opened from file:// it has no origin, so it plays offline.
- **The Shore page stays offline.** It is the default build (`dist/`): offline exactly as 0.6.2, unless opened with
  `?server=`.
- **Checked in a browser.** `node scripts/asynccheck.mjs <dir> --only D` serves both pages at `/` of the built server.
  - The online page with uploads open: the dusk fetches a ghost from the same origin, the signed upload gets 201, and
    every request goes to that origin.
  - The online page with uploads closed: the 403 is silent and the run plays on.
  - The offline page: no session and one request.
- **The image records the page.** `deploy/GAME_BUILD.txt` names the page the image carries; the deploy step records
  it.

**Object layout.** One object per ghost, keyed by rules, day and content id:

```
ghosts/<rules>/d<DD>/pool/<id>.json     stand-in pool: written only by `seed`
ghosts/<rules>/d<DD>/player/<id>.json   player uploads: written only by POST /v1/ghosts
```

- One (rules, day) bucket is one LIST prefix, `ghosts/<rules>/d<DD>/`.
- The pool has its own prefix below it, so a seed lists, rewrites and deletes pool keys without
  ever seeing a player key.
- Keys use only `[A-Za-z0-9._/-]`, so ListObjectsV2 XML never needs unescaping. Rules strings that
  would make a `.` or `..` path segment are refused.
- `<id>` is the content hash (`ghostId`), so a key's body never changes.
- Each body is the same `{"id","at","snapshot"}` record as a `ghosts.jsonl` line: concatenating the
  objects gives a valid JSON-lines file.
- A pool record's `at` is its `createdAt`, so re-seeding an unchanged pool writes nothing.
- Deleting an old rules version means deleting the prefix `ghosts/<rules>/`: `ghosts:admin wipe-uploads --pool`
  (see "Operations").

**How the store loads and writes** (`server/tigrisStore.ts`):
- A start never touches storage. `/v1/health` answers at once (80 ms after spawn in the smoke run)
  and never touches storage either; it reports `store: "tigris"`, the ghosts held in memory and the
  uploads setting.
- A bucket is listed on its first match request, and its objects are fetched 16 at a time and
  cached. Concurrent requests share one load.
- After `BB_GHOST_CACHE_TTL_S` (60 s by default, 600 s in fly.toml) the next request lists the
  bucket again. It fetches only new keys and drops vanished ones, so writes from other machines and
  re-seeds show up within the TTL. On the one production machine every upload goes through this
  process and is indexed at once, and a deploy (the re-seed) restarts it, so the TTL only delays
  out-of-band changes. Each re-list is a Tigris Class A request (10,000 a month are free), which is
  why production uses the longer TTL. Lower it if the app ever runs more than one machine.
  If that refresh fails, the cached copy is served and the refresh is retried 5 s later.
- At most 64 buckets are cached; the least recently used one is dropped.
- Writes are durable first: HEAD the key (if the ghost is already there, answer 200 with the same
  id), then PUT, then index. So a 201 always means the object exists.
- Storage failures answer 503 with `retry-after: 5`, and the client falls back offline.
- `server/s3.ts` has these limits:
  - every call gets a 5 s timeout;
  - it retries at most twice, with jittered backoff (200 ms, then 800 ms), and only after network
    errors, timeouts or 5xx answers;
  - requests are SigV4-signed over the payload's SHA-256 by `server/sigv4.ts`, which is tested
    against the published AWS examples;
  - errors carry the operation, key and status, never a header.

**Environment** (`server/config.ts`; flags override env; a bad value stops the start with exit 2):

| Variable | Production (fly.toml) | Default | Meaning |
|---|---|---|---|
| `BB_GHOST_STORE` | `tigris` | `jsonl` | backend |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `BUCKET_NAME` | app secrets from `fly storage create` | none (`AWS_REGION`: `auto`) | Tigris credentials, `https://fly.storage.tigris.dev`, `auto`, the bucket; with `tigris`, a missing one stops the start, and the message names the variable, never a value. `AWS_REGION` is the exception: Fly's documented output sets only the other four, so it defaults to `auto` |
| `BB_GHOST_S3_ADDRESSING` | (default) | `virtual` | `virtual` (`https://<bucket>.<host>/<key>`, what Tigris documents) or `path` |
| `BB_GHOST_CACHE_TTL_S` | `600` | `60` | seconds a loaded bucket is served before it is listed again (each re-list is a Tigris Class A request) |
| `BB_GHOST_UPLOADS` | `open` from the uploads step (deploy/RUNBOOK.md section 9); `closed` before it and in its rollback | `closed` | `closed`: POST /v1/ghosts answers 403 without reading the body. Only an explicit `open` takes uploads, so a start that lost the setting stays closed |
| `BB_GHOST_TRUST_PROXY` | `fly` | `none` | `fly`: client IP = `Fly-Client-IP` (Fly's proxy sets or overwrites it), else the socket; `X-Forwarded-For` is never trusted, because its first hop is whatever the client sent; `none` ignores both headers |
| `BB_GHOST_STATIC` | `/app/public` | none | serve `<dir>/index.html` at `/` and `/index.html` (read once at start; missing = exit 2) |
| `BB_GHOST_HOST`, `BB_GHOST_PORT` | `0.0.0.0`, `8080` | `127.0.0.1`, `7790` | listen address |
| `BB_GHOST_ORIGINS` | `https://beltbattles.fly.dev` | the local Shore | CORS allow-list (the page itself is same-origin) |
| `BB_GHOST_RATE`, `BB_GHOST_DATA` | (default) | `120`, `./ghost-data` | requests/min per client IP; the JSON-lines directory |

**Seeding.** `node dist/ghost-server.mjs seed` is the `release_command`: before every release it
runs on a throwaway machine with the app's env and secrets, and a nonzero exit aborts the deploy.
- It first checks every sample-pool entry, and writes nothing if any check fails. The checks are:
  strict decode, the current `RULES_VERSION`, `validateUpload` (the player mode, as an upload is checked),
  a record label a run can reach, no duplicates, and a non-empty pool.
- Then it makes the pool for the current `RULES_VERSION` exactly the bundle: missing or differing
  records are written, and pool records not in the bundle are deleted.
- Pool records of other rules versions and every player upload are left alone.
- It prints `written`, `unchanged` and `removed`. An unchanged bundle prints 0 / 120 / 0 (0.7.0's: 0 / 60 / 0).

**The seed rule (0.7.0a, decision D5).** The bb-0.6.2 seed pool (`tools/samplePool.ts generateSamplePool`,
what `seed` and `npm run gen:ghosts` write) is 60 ghosts drawn from the stand-in pool: per hero and day, the
40 sample ghosts' par deck and seeded pick, and one floor ghost (a third deck). Every seed ghost passes
`validateUpload` in the player (honest) mode, and the shop's strict `validateBuild` too; the generator and the
seed fail loudly if one doesn't. Every record label is reachable under 0.6.2's run rules (`src/net/records.ts`:
5 lives, a loss costs 1, the early-loss refund at dawn 3, the DOCK's PATCH UP; checked against the run code; unchanged
under bb-0.8.0 and bb-0.8.3).
A floor ghost carries the weakest record a run can bring to that dusk (no wins and the fewest lives: 5 4 4 3 2
1 1 1 1 1 over days 1-10), so under the record rule it is eligible for every reachable request: for every day
1-10 and every reachable (wins, lives) at that dusk, at least 2 seed ghosts are eligible
(tests/seed.records.test.ts; the generator throws otherwise). The pool keeps its turret and join decks (24
and 41 of 60 in 0.7.0).

**The four-hero seed pool (0.8.0 RC).** The bb-0.8.0 seed pool is 120 ghosts: every playable hero on every day 1-10,
with 0.7.0's 3 ghosts per hero and day (two sample ghosts with drawn records and one floor ghost).
- FURNACE and WEAVER's 60 come first and are 0.7.0's rule unchanged: the stand-in pool's par deck, a seeded pick and a
  third deck. They are byte for byte 7c7feb9's pool but the rules string.
- FOUNDRY and BASTION's 60 (`tools/samplePool.ts raceGhosts`) are the par player's dusk decks of that day
  (`src/sim/harness/player.ts playerBuild`, the typical policy). That is a real run through the game's caravan, buying
  only what it offers at the offer price. Each comes from one of the par field's runs (seeds 1-12), picked by hero,
  variant and day, and the three decks of a hero and day are distinct.
- The stand-in pool and the offline stand-ins stay FURNACE and WEAVER's (`STAND_IN_HEROES`), so offline play is
  unchanged.
- Every ghost passes the strict decoder, `validateUpload` in the player mode, the reachable-record check and the rules
  gate, and `seed` re-checks them all before writing.
- With the race floor ghosts, every reachable state at every dusk has at least 4 eligible seed ghosts. The pool carries
  26 turret decks and 75 join decks of 120.
- Matching is hero-blind, so any player meets ghosts of all four heroes (tests/rc.seedpool.test.ts).
- On the JSON-lines store the pool lives in `pool.jsonl`, replaced atomically; `ghosts.jsonl` stays
  append-only.

**Uploads: closed by default, open in production from the uploads step.**
- The server takes only signed uploads (see "Identity and signed uploads"), so nobody can post under
  another player's id. It checks every deck in the player mode (`validateUpload`, the road's honest
  ceiling), refuses a hero its rules don't take (the hero gate) and a record no run can reach (H2). 0.7.0a's game
  signs and uploads its dusk deck when a server URL is set.
- 0.8.0 went live on 2026-10-03 with `BB_GHOST_UPLOADS=closed`. An upload got 403 (silently), players fought the seed
  pool, and the game's fallback covered the rest.
- Opening uploads is the operator's call, its own deploy: the uploads step, deploy/RUNBOOK.md section 9. It ships
  branch uploads-080, whose fly.toml sets `BB_GHOST_UPLOADS = "open"`. From that step on, production takes uploads, and
  its live checks run the probe (see "Operations"). The code default stays `closed`, so a start that loses the setting
  refuses uploads. The rollback runs closed: deploy-080 with `-e BB_GHOST_UPLOADS=closed`.
- A secure origin is needed for the device key (`crypto.subtle`); that is why the page is served from the
  API's HTTPS origin.

**Scaling: when lazy bucket loads stop being enough.**
- A first load of a (rules, day) bucket costs one LIST per 1,000 keys plus one GET per ghost, 16 at
  a time (about 20-50 ms each from `iad`).
- A few hundred ghosts load well inside the client's 4 s match timeout. Around 1,000-2,000 ghosts
  per bucket, a cold machine's first match gets close to that timeout, and the client falls back
  offline.
- Each machine also holds every loaded bucket in memory (roughly 5-10 KB per parsed ghost), so a
  256 MB machine tops out at around ten thousand ghosts in total.
- Before either limit is reached (uploads open plus real traffic), pick one of these:
  1. A periodic compaction that writes one index object per bucket, `ghosts/<rules>/d<DD>/index.jsonl`
     (all records), so a load is one GET plus a LIST of the keys newer than the index.
  2. Cap what a bucket serves, such as the newest N ghosts per (wins, lives) band, and add the band
     to the key so a match loads only its slice.
  3. Move the index to a database (SQLite with LiteFS on a volume, or Postgres), keeping the objects
     as the source of truth.

  More machines don't help with this: each one loads buckets independently and only adds LIST
  traffic.

## Operations: the ghost admin tool (0.7.0)

Uploads don't open without a way to clean the store (the genre study's R4: a bulk wipe by version or by
exploit). `server/ghostAdmin.ts` is that tool. `npm run build:server` builds it into `server/dist/ghost-admin.mjs`,
so the Fly image carries it as `/app/dist/ghost-admin.mjs`. It reads the store exactly as the server does
(`server/config.ts`): `BB_GHOST_STORE` and the Tigris variables, or the JSON-lines directory (`BB_GHOST_DATA` or
`--data <dir>`). On the machine, run it with the app's own env and secrets; deploy/RUNBOOK.md has the exact
commands.

```
npm run ghosts:admin -- list                     --rules bb-0.8.3
npm run ghosts:admin -- revalidate               --rules bb-0.8.3 [--apply]
npm run ghosts:admin -- wipe-uploads             --rules bb-0.8.3 [--apply] [--pool]
npm run ghosts:admin -- remove-player <playerId> --rules bb-0.8.3 [--apply]
node /app/dist/ghost-admin.mjs list --rules bb-0.8.3          # the same tool in the image
node /app/dist/ghost-admin.mjs wipe-uploads --rules bb-0.8.0 --pool   # 0.8.0-0.8.4's pool and uploads: a dry run
node /app/dist/ghost-admin.mjs wipe-uploads --rules bb-0.6.2 --pool   # 0.7.0's pool and uploads: a dry run
```

| Command | What it does |
|---|---|
| `list` | Per day: the seed-pool ghosts, the uploads and the distinct players who uploaded them, then the totals. Read only |
| `revalidate` | Every stored upload goes through the checks `POST /v1/ghosts` runs: the strict decoder (with the rules gate), the exact rules, `validateUpload` in the player mode and the reachable-record check (`src/net/records.ts`; POST has applied it since 0.8.0 H2, so revalidate finds records stored before that). It also checks its own id (and Tigris key). Each failure is listed with every reason; `--apply` deletes exactly those. Only this build's `RULES_VERSION`; for an older version use `wipe-uploads`. The signature can't be checked again: the server keeps neither the key nor the signature |
| `wipe-uploads` | Every upload of that rules version. The seed pool goes only with `--pool`, and the next deploy's `seed` writes it back |
| `remove-player <id>` | Every upload by that player. A seed-pool ghost is never touched |

- **A dry run unless `--apply`.** It prints exactly what `--apply` would delete (each record's key or line, kind,
  day, ghost id, player and reason) and deletes nothing.
- **One rules version.** `--rules` is required, and nothing of another rules version is read or touched. On Tigris
  the tool lists only `ghosts/<rules>/`. Objects there that are neither `pool/` nor `player/` are counted and left alone.
- **Exactly the plan.** `--apply` deletes the records it printed: the keys on Tigris, or the exact lines it read on
  JSON lines. The file is rewritten to a copy and renamed over the original; a line appended meanwhile makes it start
  over. A record written after the plan is never deleted. Exit 0 when done (a dry run too), 1 on a storage error or an
  apply that deleted less than its plan, 2 on a usage or settings error (nothing touched).
- **A running server keeps a deleted ghost in memory** until it reloads its copy. On Tigris that is when the bucket
  cache expires (`BB_GHOST_CACHE_TTL_S`, 600 s in fly.toml) or the machine restarts. On JSON lines it is only a
  restart, so stop that server while the tool rewrites its files.
- **Tested on both stores** (tests/ghost-admin.test.ts, Tigris through the in-process fake S3, set up from the same
  env as the server's):
  - a dry run deletes nothing;
  - `--apply` deletes exactly the listed records, and a later `list` agrees;
  - the seed pool and other rules versions stay;
  - bad uploads planted straight into the store, past POST, are found;
  - the match route stops serving a deleted ghost: a fresh server at once, a running one after its cache TTL.

**The uploads step's probe (0.8.0 U2).** `server/ghostProbe.ts`, built beside the admin tool into
`server/dist/ghost-probe.mjs`, checks a live server from outside, as a player's page would:
`node server/dist/ghost-probe.mjs <base-url> <id-file>`. It is a port of 0.7.0 U1's probe.
- It makes a fresh device identity with the game's own `loadIdentity` (a non-extractable key, in memory). Each POST
  sends the canonical bytes `submitGhost` sends, signed with `identity.sign`.
- It posts nine uploads and expects these answers:
  - a signed, honest FURNACE start deck (day 1, 0 wins, 5 lives): 201 and its ghost id;
  - the same bytes unsigned: 401;
  - that deck over day 1's budget: 422 with validateUpload's budget error;
  - that honest deck on a record no run carries (day 1, 1 life): 422 with H2's record error;
  - WEAVER's, FOUNDRY's and BASTION's honest day-3 reference decks (1 win, 5 lives): 201 each;
  - METRONOME's and SIPHON's: 400 from the strict decode's hero gate, naming bb-0.8.3 and the hero.
- Exactly four decks are stored, FURNACE's, WEAVER's, FOUNDRY's and BASTION's, each its own record under the probe's
  player. The probe writes that player's id to `<id-file>` before the first POST, so
  `remove-player <id> --rules bb-0.8.3 --apply` can always clean up after it. It refuses an id file that already holds
  an id.
- It prints one line per check (name, expected, got), then the player id, then the number of decks the server stored.
  It exits 0 only if every check matched, 1 if a check failed or got no answer, and 2 for a usage error (nothing sent).
  Against a closed server every POST gets 403 and it exits 1. It runs only in a build whose rules are bb-0.8.3 (0.8.0 to
  0.8.4's probe: bb-0.8.0), and it prints no key material.
- tests/ghost-probe.test.ts runs it against the in-process server on both stores, open and closed, plus bad arguments
  and a dead port.
- **0.9.11 (rules bb-0.11.0; BUMP-1D, PROFILE-UP):** the probe now makes **15** POSTs and stores **7** decks (the nine
  above, plus LAST CHANCE's two, the NPC day's two and the long run's two: `longrun-signed` 201, a day-12 deck with 9
  wins and 2 draws, and `longrun-nolosses` 422, `losses: a long run's upload states the dusks the run lost ...`). It
  prints 18 lines; the summary reads `probe: 15 of 15 checks as expected; the server stored 7 deck(s) for this player
  (expected 7)`. The seven decks sit on days 1, 2, 3 (three), 7 and 12; `remove-player <id> --rules bb-0.11.0 --apply`
  deletes them (the Tigris store enumerates days 1 to 25). With a third argument, `--profile`, it also PUTs a minimal
  signed profile (`profile-signed`, expects 200 and the profile as sent) and the same body with a broken signature
  (`profile-badsig`, 401): `17 of 17`. The server keeps that one profile for the probe's player; **ghost-admin does not
  know `profiles/`** (Tigris: `profiles/<player id>.json`; the file store: `<data dir>/profiles`), so delete it by hand.

## PUT /v1/profile (PROFILE-UP, 0.9.11)

`PUT /v1/profile` (server/profileRoute.ts; the case in server/app.ts, CORS `Access-Control-Allow-Methods: GET, POST, PUT,
OPTIONS`) keeps one merged profile per player, upload only. The body is the canonical wire profile
(src/net/profileWire.ts), signed in its **own domain**: `x-bb-key` and `x-bb-sig` over `"bb-profile-1\n"` + the exact body
bytes (src/net/identity.ts `verifyProfile`), so a ghost upload's signature never verifies here and the reverse. The body
carries no player id: the record is the signer's, so a key can only write its own. Refusals, in the order they are checked:
403 while uploads are closed (the body is not read); 401 for a missing or malformed header, or a signature that does not
match the exact bytes; 413 over MAX_PROFILE_BYTES; 400 for anything but the canonical wire profile; 422 for a newer `v`
or a plausibility cap (named); 503 when storage is down. 200 answers the merged profile (counters take the larger, the
lists the union, `chosen` the newer `updatedAt`, a style only if unlocked). The store is
`profileStoreFor` (server/profileStore.ts): `<data dir>/profiles` for the file store, `profiles/<playerId>.json` on
Tigris; a lost race between two writes of one key is accepted, because the next upload merges again. The client
(src/net/profileClient.ts `putProfile`, called from src/game/online.ts) PUTs once when a run's end is folded and 3 s after
the last CUSTOMIZE pick, only while online with an identity, never at boot, one try each, silent on every failure. An old
server answers a new client's PUT with a 404 (nothing changes on screen); an old client never PUTs. **Deploy the server
first or together with the client, never the client alone** (0.9.11 is a rules release, so they ship together anyway).

## One player on every device (IDENT-1, REQ-BFG-122)

Not a rules change: no `RULES_VERSION`, sim, deck-validation or ghost-format line moves. A feeder that rides a client+server release.

**The model.** A key's own id is still `base64url(SHA-256(raw public key))`. One canonical player P (always its first key's own id)
can have several keys linked to it, and later a Steam account. A key uploads under its own id (every 0.9.13 client, with no extra
store read) or under the player it is linked to; anything else is a 403, as before. A key links to at most one player. The pool, the
match query, `ghost-admin` and the names tags see only ids of the same kind they always did.

**Records** (same backing store as the profiles: `<dataDir>/identity/…` locally, Tigris objects outside `ghosts/` and `profiles/`):
`links/keys/<keyId>.json` `{player,at}`; `players/<P>.json` `{keys[],steam[],at,code?}`; `linkcodes/<sha256(code)>.json`
`{player,expiresAt}` (codes are stored hashed); `links/steam/<steamId>.json` `{player,at}`; `tombstones/<P>.json` `{at,ids[]}`.
`server/linkStore.ts` is the key/value interface with its three implementations; `server/links.ts` holds the rules and the caches.

**Routes** (each signed by a device key in its OWN domain, over the exact body bytes; the body is canonical compact JSON with the
client's clock `at`, refused when more than 10 minutes off the server's, 422): `POST /v1/link/code` `{at}` -> `{code,expiresAt}`;
`POST /v1/link/redeem` `{at,code}` -> `{player,profile}`; `GET /v1/profile?at=<ms>` (the signed text is the query) ->
`{player,profile}`; `DELETE /v1/player` `{at}` -> `{deleted:true}`; `POST /v1/link/steam` `{at,ticket,identity,appid}` -> `{player,
profile}` (501 while `BB_STEAM_WEB_API_KEY` and `BB_STEAM_APP_IDS` are not both set). Domains: `bb-link-code-1\n`,
`bb-link-redeem-1\n`, `bb-profile-get-1\n`, `bb-delete-1\n`, `bb-link-steam-1\n`. The full replies and refusals are the header of
`server/linkRoutes.ts`.

**Link codes.** 8 symbols of `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0 O 1 I L), shown `XXXX-XXXX` (about 40 bits), live 10 minutes,
single use, one live code per player (a new one replaces it). A wrong, expired or used code gets one refusal that never says which
(403), and so does a code whose player has since become a device itself (only damaged data makes one: a key that joins a player takes
its own live code and player record with it); wrong codes are limited to 5 per client address in 10 minutes (429; a try is counted when
it arrives, before anything is awaited, and given back unless it ends as a wrong code, so a burst of parallel tries cannot pass 5; the
count is in each machine's memory, so each machine counts its own). A redeeming key whose player has other keys or a Steam account, or
that is linked elsewhere, gets 409: nothing is re-pointed. So does a link past the room a player has: 64 keys besides its first key,
and 64 Steam accounts (`this player already has the most linked devices it can have`, `this player already has the most Steam accounts
it can have`); the store and the code are left as they were. A Steam account whose player is itself a device is refused with 403
(`that Steam account could not be linked`) and its ticket is not spent. A lone key's profile is merged into the player's
(`mergeWire`) and removed; its old ghosts stay as they are.

**The client.** `beltbattles.link.v1` (written only when linked) holds `{player,key,at,readAt}`. `Identity.playerId` is the player
once linked, as of the load or the last `refresh()`; the title calls `refresh()` when a NEW RUN starts, so a link takes effect at the
next new run. The match request and the snapshots then carry P; the server also takes the key's own id from that key and skips the
ghosts of every key linked to P, so a player never meets their own ghost from another device. A linked device reads the player's
profile after the link and at startup (at most once an hour, `src/net/profileSync.ts`) and merges it with the wire's own rules
(counters the max, sets the union, the picks the newer); a newer build's profile is never overwritten by an older one.

**The native mirror.** On the phone builds (Capacitor's Preferences plugin: UserDefaults / SharedPreferences, not the Keychain) a NEW key
is made extractable once, its private JWK goes to the mirror (`beltbattles.identity.jwk.v1`) and IndexedDB keeps a non-extractable
re-import; an empty IndexedDB plus a mirrored JWK restores the same key, so a purged WebView keeps its playerId and, through the
mirrored link record, its player. On the web nothing changes.

**Deletion.** `DELETE /v1/player` removes the player's profile, every link to it (keys and Steam) and its live code, and writes the
tombstone. From then on none of its ghosts is served (an in-memory set, read on the first request and at start, refreshed every 60 s)
and its ids answer 410. `ghost-admin purge-tombstoned [--apply]` removes the ghosts themselves in every rules version (a dry run by
default). The device drops its key, its mirror and its link record; local progress stays.

## 0.8.0: rules bb-0.8.0 and the four-hero seed pool

0.8.0 changes battles: FOUNDRY and BASTION become playable, fifteen wave-3 parts join the one shared pool, and the
balance pass for four heroes moved numbers. So the rules string moves once, at the release step: `RULES_VERSION` is
**bb-0.8.0** (src/sim/content.ts, the release candidate's only src/sim change). docs/CHANGELOG.md has the player's view.

- **A fresh pool.** Ghosts match only their own rules version. 0.8.0 players start with the bb-0.8.0 seed pool: 120
  ghosts, all four heroes, 3 per hero and day ("Seeding"). Real uploads join it once uploads open.
- **0.7.0's uploads are turned away, quietly.** The server validates bb-0.8.0 only.
  - A bb-0.6.2 upload from a 0.7.0 page gets 422 ("rules bb-0.6.2 not accepted"), or 403 while uploads are closed.
  - A FOUNDRY or BASTION snapshot under bb-0.6.2 already gets 400 at the decoder's hero gate.
  - A cached 0.7.0 page keeps playing. It asks for bb-0.6.2 ghosts and meets 0.7.0's seed pool if the store still holds
    it, else 0.6.2's stand-in. Its runs play on.
  - tests/rc.rules.test.ts checks all this on both stores, and the browser check runs the real 0.7.0 page against a
    0.8.0 server.
- **What else hashes or records the rules string:**
  - ghost ids (content hashes) and the match seed: every seed ghost has a new id;
  - the stand-in pool's data module: its rules tag moved and its decks did not (`npm run standins` writes the same
    decks, and `--check` reads IDENTICAL);
  - battle records: 0.7.0's stored dusks say REPLAY UNAVAILABLE (OTHER RULES).
  - No battle reads the string: the sim fingerprint is unchanged.
- **Offline is unchanged.** With no server URL there is no request and no identity. Every hero meets the same dusk
  stand-ins, from FURNACE and WEAVER's stand-in pool.
- **The deploy (the Prime's step).** The release command seeds bb-0.8.0's 120 ghosts and touches nothing of bb-0.6.2.
  0.7.0's pool stays unless the operator wipes it with the admin tool (`wipe-uploads --rules bb-0.6.2 --pool`, a dry run
  first).

## 0.8.0 H2: the record check

`POST /v1/ghosts` refuses with 422 an upload whose record (wins, lives) no run can carry into that day's dusk
(`src/net/records.ts isReachable`; step 8 of the checks in "Identity and signed uploads"). It runs after the rules
check and `validateUpload` and before the store, so nothing is stored, and a foreign-rules upload still meets the rules
422 first (what a 0.7.0 page meets).
- **The run rules are unchanged under bb-0.8.0** (and under BELTS's bb-0.8.3). Lives move only by the dusk loss, the early-loss refund at dawn 3 and
  the DOCK's PATCH UP (once a run: ten events in one bag for ten days). No event choice costs lives and warlords never move
  them. So a run started on a 0.6.2, 0.7.0 or 0.8.0 page only uploads records the check takes:
  tests/h2.playthrough.test.ts plays 1,600 real runs of the four heroes through the run code and meets all 178 reachable
  records.
- **Two old saves can carry a record it refuses, and refusing their uploads is intended.** The client is silent on a 422
  (`src/game/online.ts` keeps the result and logs nothing), so the run plays on; widening the model instead would let a
  low record make a ghost eligible for more matches, for every player.
  - A run migrated from a version-4 (0.5.0) save: `save.ts v4to5` adds 2 lives, for example day 3 with 0 wins and 3 lives.
  - A run saved by a page older than 0.6.2 TUNE-M (ab0ee25, which added the early-loss refund; save v7 has had no bump
    since 0.6.1a and a v6 save migrates in place) that passed dawn 3 after an early loss without its refund: day 3 0W 3L
    and 1W 4L, day 4 0W 2L and 1W 3L, day 5 0W 1L and 1W 2L, day 6 1W 1L; from day 7 its records are reachable again. In
    practice this is an unfinished run saved by the 0.6.0 page on beltbattles.fly.dev, the only origin that uploads.
- **Records stored before the check** (bb-0.8.0 has none: it ships with the check; nor has bb-0.8.3) stay until
  `ghosts:admin revalidate --rules bb-0.8.3 --apply` (this build's rules: revalidate takes no other) deletes them; the
  match route keeps working with them there (tests/net-matchmaking.d1d2.test.ts plants such records past POST).
- Tested on both stores (tests/h2.records.test.ts): 7 unreachable records the decoder takes get 422 and leave the store
  unchanged (health's count, the store's listing, its records, every Tigris object); every reachable record of every day
  gets 201; the order of the checks; a resend still gets 200; all 120 seed ghosts posted as one player's dusks get 201.

## BELTS: rules bb-0.8.3

BELTS (REQ-BFG-043, REQ-BFG-044) changes which decks are legal, so the rules string moves again: `RULES_VERSION` is
**bb-0.8.3** (src/sim/content.ts). What changes for a deck that travels:
- **Belt slots by level.** A bought factory feeds 2 / 3 / 4 belts at ★1 / ★2 / ★3 (GANTRY PRESS 3 / 4 / 5). The hero's
  signature factory never merges and has no stars: it feeds 2 belts at FACTORY level 1 and one more a level (2 / 3 / 4 /
  5; the LOOM 3 / 4 / 5 / 6). `validateBuild` reads a factory's slots at its stars and the hero factory's at the build's
  FACTORY level (`stars.ts gradeOf`), so one belt more is refused: `route: KILN uid 1 feeds 4 routes but has 3 output(s)`.
- **The hero's two gold upgrades** (TURRET SPEED and FACTORY, levels 1-4 for 10, 20 and 30 gold, bought in the caravan
  outside the shop roll) travel as `build.upgrades` ("Snapshot format"). The strict decoder takes levels 1-4 only (level
  5 is a 400). The upgrade gold paid is a `buildCost` term, so both modes' budgets count it: a level the day's gold can't
  pay for is a 422 `budget:` error (level 4 of either track on day 1: 60 gold against 8, a player's 13). A signature
  factory with stars is refused (`can't have 2 stars`).
- **A fresh pool.** Ghosts match only their own rules version: a BELTS page asks for bb-0.8.3 ghosts and meets the
  bb-0.8.3 seed pool (`npm run gen:ghosts`, the same composition, "Seeding"), then its stand-in.
- **0.8.0 to 0.8.4's uploads are turned away, quietly.** The server validates bb-0.8.3 only. bb-0.8.0 takes the same
  four heroes (`HEROES_RULES` stays bb-0.8.0, the first rules that carried them), so a bb-0.8.0 upload passes the
  decoder and gets 422 (`rules bb-0.8.0 not accepted: this server validates bb-0.8.3`), or 403 while uploads are closed.
  A cached 0.8.4 page keeps playing: it asks for bb-0.8.0 ghosts and meets 0.8.0's pool while the store holds it (the
  seed replaces only its own rules' pool; `wipe-uploads --rules bb-0.8.0 --pool` removes it, a dry run first), else its
  stand-in; its client logs nothing on the 422 and the run plays on.
- **Unchanged:** the hero table, the run's life rules (`src/net/records.ts`), the road ceiling (`roadCap`, the same per
  day), `SNAPSHOT_VERSION` (2) and offline play (no request, no identity).
- Tested on both stores in tests/belts.rules.test.ts: the gate (bb-0.8.3 in; bb-0.8.0 and bb-0.8.3's near misses out,
  nothing stored); a bb-0.8.0 session (stand-in at dawn, a quiet 422 at dusk, the run on to day 2, no console line); the
  upload decks with the levels (a FURNACE at FACTORY level 2 with the KILN on 3 belts 201, on 4 refused; a WEAVER with
  the LOOM at level 1 on 3 belts 201, on 4 refused; level 4 on day 1 refused by the budget; level 5 by the decoder; a
  WEAVER deck holding a KILN; a 2-star KILN; an honest run's levels through the game's own client 201); and offline
  play with the levels makes no request.

## 0.7.0 for players

0.7.0 is the async release. The battles don't change (the rules stay `bb-0.6.2`); what changes is who you fight
at dusk, and what you can do after.

- **Real ghosts at dusk.** On the Fly page (https://beltbattles.fly.dev), each dusk fights another player's deck
  from the same day of their run, fetched from the ghost server and fought on your device. The NEXT BATTLE card and
  the enemy plate say ONLINE GHOST.
- **Fair matches.** You never meet a ghost with a better record than yours, and never the same ghost twice in a
  run. Your first 3 finished runs meet only the seed ghosts: 60 honest decks, at least two for every record a run
  can carry into each dusk.
- **Your decks go up.** Each dusk deck is signed with a key your browser keeps, checked for an honest budget, and
  becomes a ghost for others once uploads open. Uploads open later, on the operator's word; until then they are
  refused quietly and nothing changes for you.
- **REPLAY.** The run summary replays any online dusk, read-only. On a phone, each dusk gets a big REPLAY button
  under the round history.
- **Never stuck on the network.** If the server is slow or down, the dusk fights 0.6.2's own stand-in within a few
  seconds, labelled OFFLINE STAND-IN.
- **Anonymous.** No account and no personal data: your player id comes from a key made in your browser.
- **The Shore page stays offline.** It plays exactly as 0.6.2 (the same foes, the same saves) unless opened with
  `?server=`.

## 0.7.0a: what the game does online

0.7.0a wires the async groundwork into the game (`src/game/online.ts`, `session.ts`, `day.ts`, the screens),
as the Prime's decisions D1-D6 set it. Uploads stay closed in production until the uploads step (deploy/RUNBOOK.md
section 9).

1. **The server URL setting (D3).** None by default, and then the game is offline exactly as 0.6.2: the same
   dusk foes on the same seeds (`startDusk(run, loadPool())`: the local pool, else `standInFoe`), no identity,
   no IndexedDB, no request and no new storage key. A URL comes from, in order:
   - `?server=<https URL>` on the page (http only for localhost and 127.0.0.1), saved under
     `beltbattles.server.v1`; `?server=off` clears it and plays offline; a bad value is ignored;
   - the saved URL;
   - the build's `VITE_GHOST_SERVER`: "" in the default build; "same-origin" means the page's own origin. That is
     the Fly page (0.7.0: `npm run build:online`, see "Running on Fly + Tigris"), where the page and the API share the
     HTTPS origin. A page on another origin must be in the server's `BB_GHOST_ORIGINS`.
2. **Identity.** With a URL, one session per page load runs `loadIdentity(indexedDbKeyStore())` once. Null (no
   WebCrypto, a plain-http origin other than localhost): the game plays offline, as 0.6.2. The key's playerId
   is the upload id and the match request's `player`; 0.6.0's random id (`beltbattles.player.v1`) stays on the
   device for the local pool and is never uploaded.
3. **Fetch tonight's ghost (D4).** As soon as the day has no stored dusk foe (from dawn), the session calls
   `fetchGhost(url, { rules: RULES_VERSION, day, wins, lives, playerId, seen: run.seenGhosts, hero, seed:
   battleSeed(run), runs }, 4000)`. A server ghost becomes a `kind: "ghost"` DuskFoe (`ghostName(snapshot)`,
   its hero, a cloned build, its record), stored in `run.dusk` and saved, so the NEXT BATTLE card shows it and
   a reload fights the same ghost; its id joins `run.seenGhosts` (no repeats in a run). Any fallback (an
   error, the 4 s timeout, a 404, an unusable answer) is 0.6.2's own `standInFoe`; no ghost pool ships in the
   page. If the answer is still out at FIGHT, a DUSK · FINDING A GHOST... card holds the dusk at most 5 s.
   Fetching at dawn can only send a lower record than the one carried into the dusk (PATCH UP may add a life
   later that day), never a higher one, so the record rule (D1) still holds.
4. **Fight it.** `startDusk` keeps the stored foe and the fight runs on `battleSeed(run)`, as before.
5. **Submit at dusk.** Once per dusk (`run.uploaded`), as the dusk starts (the build committed, before the
   fight): `ghostOf(run, Date.now(), identity.playerId)` (v2, bb-0.6.2) goes up with `submitGhost`, only if
   `validateUpload` (the player mode, as the server checks it) accepts it; a refused deck is a console.debug
   line. Fire and forget: 403 (closed), 401, 422 and network errors are silent, and nothing waits for them.
   (The game says nothing; a browser's own network log still lists a refused POST, as Chromium's console does.)
6. **The battle record.** `battleRecordFor(your deck, the foe's, battleSeed)` and both final hulls stay in the
   dusk's `DayResult`, for the summary's REPLAY ("Replay and rules versions", D6).
7. **Show the source.** The NEXT BATTLE card and the enemy plate name it in small text: ONLINE GHOST, or
   OFFLINE STAND-IN after a fallback; the card says FINDING A GHOST... until the answer. Offline the card is
   0.6.2's. 0.7.0 (R1 M1): the plate's line sits in the free row above the plate where the battle layout leaves one
   (desktop 1920x1080, landscape screens with room). Elsewhere (phones in portrait and landscape, a 1366x768 laptop)
   it goes inside the plate's strip as a grey tag before the name: ONLINE · WEAVER · 0W 5♥, or OFFLINE · <captain>.
   0.7.0a drew it just under the plate there, on the enemy hull's top rail. The battle layout itself is unchanged.

- **D2:** a finished run (won or lost) counts once in `beltbattles.runs.v1` (online only) and goes up as `runs`.
- **D5:** the seed pool's rule, under "Seeding".
- **Save v7, no bump:** `Run.seenGhosts` and `uploaded`, `DuskFoe.source` and `ghostId`, `DayResult.record` and
  `hulls` are optional and absent offline (a v8 key would be a new key written offline); `save.ts
  normalizeOnline` drops malformed ones, and every older save still loads.

**Steps 8 and 9 of the 0.6.0 checklist, where they stand:**

8. **Keep the budget honest.** Done in 0.7.0 prep (v070-validate): the server (`POST /v1/ghosts`) and
   `fetchGhost` check player decks in the player mode, `validateUpload`: the strict rules, with the road's
   reachable hull and belt, and `cost ≤ maxHonestSpend(N) = maxGoldByDay(N) + roadCap(N)` (see Validation).
   The strict `validateBuild` stays the check for stand-ins, the bundled pool and the harness. When road
   content changes (a new event, choice kind or warlord reward), update `src/net/roadCap.ts` on purpose: its
   D4 guard test fails until it models the new content, and until then `validateUpload` refuses uploads with a
   clear error. Buyable parts join automatically (prices and pools are read from the live tables). Rebased onto
   the 0.6.2 mechanics head 7bcde98 (v070-validate-062m): the player mode costs installed turrets through
   `buildCost`, and validateBuild's turret and join rejections pass through it unchanged. Rebased onto the
   published 0.6.2 (rel-062-final 40d2b2c, v070-validate-rel): RULES_VERSION is bb-0.6.2, so the server and
   `fetchGhost` accept only bb-0.6.2 ghosts, and the ceiling was re-pinned for TUNE-C's warlord decks. The join
   limit (2) is validateBuild's own, in both modes. The rules gate (`rulesGate.ts`, see Replay and rules
   versions) keeps turrets and joins out of older rules on every accepting path. Uploads stay closed in production
   until the uploads step (deploy/RUNBOOK.md section 9).
   0.7.0a gates the game's own upload on the same `validateUpload`, and the seed pool too (D5). Left, as
   v070-validate-rel's REPORT section 9 says: the ceiling's avoidable slack (0 0 0 2 4 6 8 10 12 14 gold over
   days 1-10, a safe upper bound), and the gate as defence in depth.
9. **Dead-end belts.** Decided in 0.6.x: the build screen blocks FIGHT while any belt is one an upload would
   refuse (a dead end, a crossing, a broken step: `src/game/routeCheck.ts fightBlock`, a local mirror of
   validateBuild's route block); a deck with no belt at all may still fight. 0.7.0a adds the upload gate: a deck
   the player mode still refuses is simply not uploaded. Left: the mirror could call validate.ts itself now
   that the page bundles it.
