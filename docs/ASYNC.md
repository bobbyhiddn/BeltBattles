# BeltBattles async ghosts

Groundwork for the 10-day run (ROADMAP §1, §3; spec §18, §20, §23): every day ends at
dusk in a fight against another player's **ghost**, meaning their saved build from the same
day of their own run. This covers the format, validation, matchmaking, replay, offline
fallback and a small build server. The run, the sim and the screens are untouched; 0.6.0
and 0.7.0 wire this in (checklist at the end).

## Architecture

```
 game client (browser, single-file build)             build server (node:http, no deps)
 ─────────────────────────────────────────            ───────────────────────────────────
 dusk: snapshot.ts ─ validate.ts ─ submitGhost ──POST /v1/ghosts──▶ decode ▶ validateUpload ▶ ghosts.jsonl
       fetchGhost ◀────────────────GET /v1/ghosts/match──────────── pickGhost (same rules+day)
        │ error / timeout / 404 / invalid answer
        ▼
       fallback.ts: bundled pool (pickGhost) ▶ stand-in from the stand-in pool (standInPick)
 fight: simulate(player, ghost, battleSeed) on the device; replay.ts stores and replays the record
```

| File | Role |
|---|---|
| `src/net/snapshot.ts` | `GhostSnapshot`, canonical encode/decode, strict checks, 16 KB cap, content ids |
| `src/net/validate.ts` | `validateBuild(build, day, mode = "strict")`, `validateUpload` (the player mode), `maxGoldByDay`, `buildCost` |
| `src/net/roadCap.ts` | the player mode's road ceiling: `roadCap`, `maxHonestSpend`, the reachable hull and belt, the D4 model |
| `src/net/matchmaking.ts` | pure `pickGhost(pool, req, rng)`, `matchSeed` |
| `src/net/replay.ts` | `battleRecordFor`, `replay`, `replayBattle`, rules-version refusal |
| `src/net/fallback.ts` | `offlineGhost`, `loadGhostPool`, `fallbackGhost` |
| `src/net/ghostClient.ts` | `fetchGhost` and `submitGhost`: fetch + AbortController, never throw |
| `server/` | `app.ts` (routes), `store.ts` (JSON lines), `main.ts` (CLI), `node.d.ts` (Node types) |
| `tools/` | `samplePool.ts` (40 validated sample ghosts), `genGhostPool.ts` (writes the JSON) |

Scripts: `npm run build:server` (type-checks with `tsconfig.server.json`, then bundles with
vite into `server/dist/`), `npm run server -- --port 7790 --data ./ghost-data`,
`npm run gen:ghosts -- --out <file>`, `npm run typecheck:server`.

## Snapshot format (v1)

`{ v: 1, rules, hero, day, wins, lives, build, runId, playerId, createdAt }`

- `rules` is `RULES_VERSION` at the fight. `day` is 1-10. `wins` (0..day−1) and `lives` (1..9) are the
  record the player carried **into** that dusk fight. `build` is the deck exactly as it fought.
- Canonical JSON: fixed key order, no whitespace, arrays in build order (item and route
  order matter to the sim). `encode(decode(x))` is byte-stable, so the id is a content hash:
  `ghostId = "g" + cyrb53(canonical)` in hex. Resubmitting the same snapshot is idempotent.
- Decoding is strict: unknown fields at any depth, missing fields, wrong types, non-integers,
  off-grid cells, ids outside `[A-Za-z0-9_-]{1,64}` and anything over **16 KB** all throw.
- The shape allows a negative `hullBonus` so battle records holding the earlier warlord stand-ins still
  decode (stand-ins now come from the stand-in pool). The strict `validateBuild` rejects it; the player mode
  accepts exactly the hulls a run reaches (−10 after a RIDE THROUGH with no plating).

## Validation (`validateBuild(build, day, mode)`)

One validator, two modes (0.7.0 prep, v070-validate):
- **strict** (`validateBuild(build, day)`, the default): the shop alone. It is the check for stand-ins, the
  bundled pool (`fallback.ts loadGhostPool`), the harness and the pool generator, which are all generated
  inside these rules.
- **player** (`validateUpload(build, day)`): a deck a real player uploaded (`POST /v1/ghosts`) or a ghost the
  server serves (`ghostClient.ts fetchGhost`). Every strict rule applies unchanged, except the **supply** and
  **budget** blocks, which also count what the road puts on a deck (below). It accepts every deck the strict
  mode accepts.

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
  joins a belt whose chain does; spec §8.1), routes per factory ≤ its outputs, belt tiles ≤ `beltCap`.
- **hardpoint**: only turret equipment, on an installed turret; at most that turret's gear slots of gear, never
  two copies of one gear on a turret, one core per socket.
- **supply** (strict): `beltCap` = hero base + whole +4 belt crates; `hullBonus` = whole +25 plating.
- **budget** (strict):

```
maxGold(day) = START_GOLD + Σ_{d=1}^{day−1} incomeFor(d, won = true)     // 8, 17, 27, 38, 50, 63, 77, 91, 105, 119
cost(build)  = Σ value(deck items) + Σ value(turret mods)                  // value = price × 2^(stars − 1)
             + Σ turretValue(installed turrets)   // 0.6.2s: price × (2^(stars − 1) − 1 if it holds the free starting copy)
             + price(beltcrate) × ceil((beltCap − hero.belt) / 4)
             + price(plating)   × ceil(hullBonus / 25)
valid ⇔ cost(build) ≤ maxGold(day)
```
For the shop alone this is a safe upper bound: selling refunds at most half the value, rerolls only spend.

### The player mode's supply and budget (`src/net/roadCap.ts`)

The road puts more on a real player's deck than the shop's gold: road gold (warlord wins, the herald's bounty,
bets, SCRAP IT, the coin pouch, RIDE THROUGH), free or cheap parts (SALVAGE, SMUGGLER, TRADER SWAP, a Hard
win's pick, the Matriarch's part, each a 1-star copy through `gainModule`), the scout's discount or free reroll,
and hull and belt off the shop's grid (dock PLATING +20 hull, RIDE THROUGH −10 hull, the BELT SPOOL +4 belt).
The strict check refuses such honest decks.

- **supply** (player): `hullBonus` = 25 × plates + a *mix* of the road's hull choices (dock PLATING +20, RIDE
  THROUGH −10, each once a run), never below events.ts's HULL TOO WEAK floor after a hull cost; `beltCap` = hero
  base + 4 × crates + the BELT SPOOL (+4, once). The mix's events must fit in the day's road stops (one a day):
  a hull of 10 (dock + ride-through) is reachable from day 2, never on day 1.
- **budget** (player):

```
maxHonestSpend(day) = maxGold(day) + roadCap(day)       // roadCap 7, 18, 30, 46, 62, 80, 99, 116, 133, 155
cost(build)         = parts + price(plating) × plates + price(beltcrate) × crates
parts               = buildCost's own terms but the supplies: items, turret mods and the installed turrets
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
  full value, and it comes from the best gold plan of those days, not from the deck's own plan. Against the
  best plan one run can follow, the slack is 0, 0, 0, 1, 3, 6, 9, 10, 12 and 15 gold on days 1-10
  (`tests/net-upload.slack.test.ts` pins it).

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

## Replay and rules versions

A `BattleRecord` is `{ rules, seed, builds: [player, ghost] }`. The seed is `battleSeed(run)`. The sim is
fixed-step with one seeded Rng, so `replay(record)` reproduces the winner, end tick and both
hulls bit for bit (tested over 60 seeds, headless and frame by frame). `replay` and
`replayBattle` **refuse** a record whose `rules` differ from `RULES_VERSION`.

Ghosts only match their own rules version. What a rules bump (any change to content.ts
numbers or sim behaviour) does to the pool:
- The server only accepts uploads under its own `RULES_VERSION`, so deploy it together with the game.
- Old ghosts stay in `ghosts.jsonl` and in memory, bucketed by rules. Old clients can still
  match each other; new clients start with an empty pool for the new version.
- Until players refill it, new clients fall back to the bundled pool, which must be regenerated for the new
  rules with `npm run gen:ghosts` (the loader rejects entries from other rules), and then the stand-ins,
  whose pool is regenerated with `npm run standins`.
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

## Security stance

- Fights are simulated **on the client**. The server never runs a battle and never receives
  results, so a cheater can only lie about their own record, which only changes whom they are matched with.
- The server **re-validates every deck** (shape, legality, and the player mode's budget) and every rule
  lives in the shared TypeScript. The client also validates each ghost before simulating it (the player
  mode), so a hostile server cannot crash the sim with a malformed deck.
- Limits: 16 KB bodies (checked by header and while streaming), a per-IP fixed-window rate limit
  (120/min by default), 10 s request and 5 s header timeouts, strict query parsing, a CORS
  allow-list (default `http://127.0.0.1:7778`, the local Shore), and a 127.0.0.1 bind by default.
- **Ranked play later:** clients upload battle records, and the server re-simulates them with
  `replay()`, which already runs in Node, before counting a result. It would also rate-limit
  and dedupe by `runId` and sign stored results. No change to the snapshot format is needed.

## Privacy

`playerId` and `runId` are anonymous random ids generated on the device, such as
`crypto.randomUUID()` kept in localStorage. The id pattern cannot hold an e-mail address.
Snapshots hold no names, no accounts and no IP addresses. The server prints client IPs in its stdout
request log (path and status only, never the query string, which holds the player id). If it
goes public, keep log retention short or drop IPs from the log line.

## Hosting options (operator decides)

| Option | Effort | Rough cost | Notes |
|---|---|---|---|
| Stay local (today) | done | €0 | Reachable on this machine and through Shore only |
| Tailscale Funnel from this machine | ~1 h | €0 | Public HTTPS URL; online only while this machine is |
| Small VPS (Hetzner CX22, DO basic) + Caddy TLS + domain | ~½ day | €4-6/mo + ~€12/yr domain | systemd unit, nightly copy of `ghosts.jsonl` |
| Fly.io / Render / Railway + 1 GB volume | 2-4 h | ~$2-7/mo | Needs a volume for the JSON-lines file |
| Cloudflare Workers + D1/KV | 1-2 days | free tier likely enough | Port `app.ts` to fetch handlers and the store to D1; `src/net` runs unchanged |

At about 1 KB per ghost, 1 million ghosts is about 1 GB. The in-memory index is fine up to hundreds of
thousands. Past that, cap each (rules, day) bucket or move to SQLite.

## 0.6.0 / 0.7.0 integration: exactly what to wire

1. **Identity.** Create `playerId` once (localStorage) and a fresh `runId` per run. Add
   `seenGhosts: string[]` to `Run` (bump the save version).
2. **Submit at dusk.** Before day N's fight, build
   `{ v: 1, rules: RULES_VERSION, hero: run.hero, day: N, wins: run.wins, lives: run.lives, build: run.build, runId, playerId, createdAt: Date.now() }`.
   If `validateUpload(run.build, N).ok` (the player mode, as the server checks it), call
   `submitGhost(serverUrl, snap)` without awaiting it (fire and forget). A failure never blocks the fight.
3. **Fetch the ghost.** `fetchGhost(serverUrl, { rules, day: N, wins, lives, playerId, seen: run.seenGhosts, hero: run.hero, seed: battleSeed(run) }, 4000, { pool })`.
   `pool` is `loadGhostPool(bundledJson).entries`. Push the returned `id` onto `run.seenGhosts`.
4. **Fight it.** Replace `enemyBuild(run)` with `ghost.snapshot.build` and set the enemy hero
   from `ghost.snapshot.hero` for that day (it can be a mirror match). Keep `battleSeed(run)`.
5. **Store the battle record.** `battleRecordFor(run.build, ghost.snapshot.build, battleSeed(run))`
   goes into the round history, for replays and bug reports (`replayBattle(record)` for playback).
6. **Show the ghost before the fight:** its hero, its record (wins, losses, lives), the day,
   and whether it is a player ghost (`source: "server"` or a pool id) or a stand-in (`offline-…`).
7. **Config.** Set a server base URL. With none, the game plays offline (fallback only). Shore's
   origin must be listed in `--origins`.
8. **Keep the budget honest.** Done in 0.7.0 prep (v070-validate): the server (`POST /v1/ghosts`) and
   `fetchGhost` check player decks in the player mode, `validateUpload`: the strict rules, with the road's
   reachable hull and belt, and `cost ≤ maxHonestSpend(N) = maxGoldByDay(N) + roadCap(N)` (see Validation).
   The strict `validateBuild` stays the check for stand-ins, the bundled pool and the harness. When road
   content changes (a new event, choice kind or warlord reward), update `src/net/roadCap.ts` on purpose: its
   D4 guard test fails until it models the new content, and until then `validateUpload` refuses uploads with a
   clear error. Buyable parts join automatically (prices and pools are read from the live tables). Rebased onto
   the 0.6.2 mechanics head 7bcde98 (v070-validate-062m): the player mode costs installed turrets through
   `buildCost`, and validateBuild's turret and join rejections pass through it unchanged. Joined and turreted
   ghosts go online only with the bb-0.6.2 RULES_VERSION bump: today the server and `fetchGhost` gate on RULES_VERSION
   equality alone, and a client from before 0.6.2j refuses the `join` and `turrets` fields.
9. **Decide on dead-end belts.** The build screen lets a player save a belt that doesn't
   reach a turret (a toast, not a refusal), but validation requires connected routes (spec
   §8.1). Either block FIGHT or the upload while any belt is unconnected, or relax that rule.
