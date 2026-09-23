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
 dusk: snapshot.ts ─ validate.ts ─ submitGhost ──POST /v1/ghosts──▶ decode ▶ validateBuild ▶ ghosts.jsonl
       fetchGhost ◀────────────────GET /v1/ghosts/match──────────── pickGhost (same rules+day)
        │ error / timeout / 404 / invalid answer
        ▼
       fallback.ts: bundled pool (pickGhost) ▶ warlord stand-in
 fight: simulate(player, ghost, battleSeed) on the device; replay.ts stores and replays the record
```

| File | Role |
|---|---|
| `src/net/snapshot.ts` | `GhostSnapshot`, canonical encode/decode, strict checks, 16 KB cap, content ids |
| `src/net/validate.ts` | `validateBuild(build, day)`, `maxGoldByDay`, `buildCost` |
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
- The shape allows a negative `hullBonus` only so battle records holding warlord stand-ins still
  decode; `validateBuild` rejects it.

## Validation (`validateBuild(build, day)`)

It uses deck.ts's own rules, and every error starts with its category:
- **shape**: the strict build shape, and day 1-10.
- **item**: every item and mod exists; uids are unique; there is exactly one signature factory and it is the hero's own
  (a foreign Kiln or Loom is rejected); every other item is sold by a merchant.
- **placement**: `canPlaceItem` (deck equipment only, on the deck, no factory on a belt) and
  no overlapping footprints.
- **route**: `routeWellFormed` (starts beside its factory, orthogonal steps, no loops, passes
  only through gates), no crossings, **connected** (ends on a turret connector it claims;
  spec §8.1), routes per factory ≤ its outputs, belt tiles ≤ `beltCap`.
- **hardpoint**: only turret equipment, on a turret the hero has, one module per turret.
- **supply**: `beltCap` = hero base + whole +4 belt crates; `hullBonus` = whole +25 plating.
- **budget**:

```
maxGold(day) = START_GOLD + Σ_{d=1}^{day−1} incomeFor(d, won = true)     // 8, 17, 27, 38, 50, 63, 77, 91, 105, 119
cost(build)  = Σ price(deck items) + Σ price(turret mods)
             + price(beltcrate) × ceil((beltCap − hero.belt) / 4)
             + price(plating)   × ceil(hullBonus / 25)
valid ⇔ cost(build) ≤ maxGold(day)
```
This is a safe upper bound. Selling refunds at most half the price, rerolls only spend,
and today the shop and round income are the only sources of gold, items and supplies.

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
  rules with `npm run gen:ghosts` (the loader rejects entries from other rules), and then the stand-ins.
- Stored battle records from older rules can no longer be replayed by the new build.
  Keep the old build hosted if old replays matter.

## Offline fallback

`fetchGhost` never fails. On a network error, a timeout (AbortController), a non-200 answer, an empty
body or an unusable ghost (wrong rules or day, our own, already seen, or failing `validateBuild`),
it returns `fallbackGhost(req, pool)`:
1. a bundled-pool ghost chosen by `pickGhost` with `new Rng(req.seed)`, else
2. `offlineGhost(hero, day, seed)`: `warlordBuild` of the other faction for that day, with
   the requester's record. 0.6.0 swaps in the rival captains.

`loadGhostPool(json)` strictly decodes each entry, requires the current rules and a passing
`validateBuild`, drops duplicates, and reports rejected entries by index.

## Security stance

- Fights are simulated **on the client**. The server never runs a battle and never receives
  results, so a cheater can only lie about their own record, which only changes whom they are matched with.
- The server **re-validates every deck** (shape, legality, budget) and every rule lives in the
  shared TypeScript. The client also validates each ghost before simulating it, so a
  hostile server cannot crash the sim with a malformed deck.
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
   If `validateBuild(run.build, N).ok`, call `submitGhost(serverUrl, snap)` without awaiting it
   (fire and forget). A failure never blocks the fight.
3. **Fetch the ghost.** `fetchGhost(serverUrl, { rules, day: N, wins, lives, playerId, seen: run.seenGhosts, hero: run.hero, seed: battleSeed(run) }, 4000, { pool })`.
   `pool` is `loadGhostPool(bundledJson).entries`. Push the returned `id` onto `run.seenGhosts`.
4. **Fight it.** Replace `enemyBuild(run)` with `ghost.snapshot.build` and set the enemy hero
   from `ghost.snapshot.hero` for that day (it can be a mirror match). Keep `battleSeed(run)`.
5. **Store the battle record.** `battleRecordFor(run.build, ghost.snapshot.build, battleSeed(run))`
   goes into the round history, for replays and bug reports (`replayBattle(record)` for playback).
6. **Show the ghost before the fight:** its hero, its record (wins, losses, lives), the day,
   and whether it is a player ghost (`source: "server"` or a pool id) or a warlord stand-in (`offline-…`).
7. **Config.** Set a server base URL. With none, the game plays offline (fallback only). Shore's
   origin must be listed in `--origins`.
8. **Keep the budget honest.** When warlord rewards or map events start granting gold, items or supplies,
   add the most a player could gain by day N to `maxGoldByDay`, or add a separate allowance for items that aren't bought.
   Otherwise honest decks will fail validation.
9. **Decide on dead-end belts.** The build screen lets a player save a belt that doesn't
   reach a turret (a toast, not a refusal), but validation requires connected routes (spec
   §8.1). Either block FIGHT or the upload while any belt is unconnected, or relax that rule.
