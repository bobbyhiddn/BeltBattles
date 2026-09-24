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
       fallback.ts: bundled pool (pickGhost) ▶ stand-in from the stand-in pool (standInPick)
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
| `server/` | `app.ts` (routes), `store.ts` (the async `GhostStore` interface and the JSON-lines store), `tigrisStore.ts` (Tigris store), `s3.ts` + `sigv4.ts` (S3 client and signer, no SDK), `seed.ts` (the `seed` command), `config.ts` (flags and env), `main.ts` (CLI), `node.d.ts` (Node types) |
| `tools/` | `samplePool.ts` (40 validated sample ghosts), `genGhostPool.ts` (writes the JSON), `fakeS3.ts` (in-process S3 for tests), `smoke.ts` (local smoke run) |
| `deploy/`, `fly.toml`, `Dockerfile` | the Fly deploy kit: see "Running on Fly + Tigris" and `deploy/RUNBOOK.md` |

Scripts: `npm run build:server` (type-checks with `tsconfig.server.json`, then bundles with
vite into `server/dist/`), `npm run server -- --port 7790 --data ./ghost-data`,
`npm run gen:ghosts -- --out <file>`, `npm run typecheck:server`,
`node server/dist/ghost-server.mjs seed`, `node deploy/stage.mjs <game.html>`, `npm run smoke`.

## Snapshot format (v1)

`{ v: 1, rules, hero, day, wins, lives, build, runId, playerId, createdAt }`

- `rules` is `RULES_VERSION` at the fight. `day` is 1-10. `wins` (0..day−1) and `lives` (1..9) are the
  record the player carried **into** that dusk fight. `build` is the deck exactly as it fought.
- Canonical JSON: fixed key order, no whitespace, arrays in build order (item and route
  order matter to the sim). `encode(decode(x))` is byte-stable, so the id is a content hash:
  `ghostId = "g" + cyrb53(canonical)` in hex. Resubmitting the same snapshot is idempotent.
- Decoding is strict: unknown fields at any depth, missing fields, wrong types, non-integers,
  off-grid cells, ids outside `[A-Za-z0-9_-]{1,64}` and anything over **16 KB** all throw.
- The shape allows a negative `hullBonus` only so battle records holding the earlier warlord
  stand-ins still decode (stand-ins now come from the stand-in pool); `validateBuild` rejects it.

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
  rules with `npm run gen:ghosts` (the loader rejects entries from other rules), and then the stand-ins,
  whose pool is regenerated with `npm run standins`.
- Stored battle records from older rules can no longer be replayed by the new build.
  Keep the old build hosted if old replays matter.

## Offline fallback

`fetchGhost` never fails. On a network error, a timeout (AbortController), a non-200 answer, an empty
body or an unusable ghost (wrong rules or day, our own, already seen, or failing `validateBuild`),
it returns `fallbackGhost(req, pool)`:
1. a bundled-pool ghost chosen by `pickGhost` with `new Rng(req.seed)`, else
2. `offlineGhost(hero, day, seed)`: `standInPick(foe, day, seed)`, a deck of the other faction
   for that day from the bundled stand-in pool (`src/sim/standInPool.ts`), with the requester's
   record. Every pool deck spends the full purse (at least 90% of `maxGoldByDay(day)`) and wins
   at least half its battles against the day's par deck (`heroRefBuild`) of either faction. Its
   playerId is still `"offline-warlord"`, kept for compatibility.

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
Snapshots hold no names, no accounts and no IP addresses. The server's stdout request log holds
the time, method, path, status and duration of each request, and nothing else: no client IP and
no query string (the query holds the player id). The rate limit keys on the client IP (on Fly, the
player's Fly-Client-IP) and keeps it in memory only, so no player address is written to the store
or reaches Fly's log stream.

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
and serves both the game page (the released 0.6.0, at `/`) and the API (`/v1/...`) from one HTTPS origin,
https://beltbattles.fly.dev. It stops when idle and starts on the next request. Ghosts live in a
Tigris bucket (Fly's S3-compatible object storage), so the machine has no volume and nothing to
back up. The kit is `fly.toml`, `Dockerfile` and `.dockerignore` at the repo root, plus
`deploy/stage.mjs`, `deploy/GAME_BUILD.txt` and `deploy/RUNBOOK.md` (the exact commands, the checks
to run and rollback). `npm run smoke` runs the built bundle against the in-process fake S3.

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
- Deleting an old rules version means deleting the prefix `ghosts/<rules>/`.

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
| `BB_GHOST_UPLOADS` | `closed` | `open` | `closed`: POST /v1/ghosts answers 403 without reading the body |
| `BB_GHOST_TRUST_PROXY` | `fly` | `none` | `fly`: client IP = `Fly-Client-IP` (Fly's proxy sets or overwrites it), else the socket; `X-Forwarded-For` is never trusted, because its first hop is whatever the client sent; `none` ignores both headers |
| `BB_GHOST_STATIC` | `/app/public` | none | serve `<dir>/index.html` at `/` and `/index.html` (read once at start; missing = exit 2) |
| `BB_GHOST_HOST`, `BB_GHOST_PORT` | `0.0.0.0`, `8080` | `127.0.0.1`, `7790` | listen address |
| `BB_GHOST_ORIGINS` | `https://beltbattles.fly.dev` | the local Shore | CORS allow-list (the page itself is same-origin) |
| `BB_GHOST_RATE`, `BB_GHOST_DATA` | (default) | `120`, `./ghost-data` | requests/min per client IP; the JSON-lines directory |

**Seeding.** `node dist/ghost-server.mjs seed` is the `release_command`: before every release it
runs on a throwaway machine with the app's env and secrets, and a nonzero exit aborts the deploy.
- It first checks every sample-pool entry, and writes nothing if any check fails. The checks are:
  strict decode, the current `RULES_VERSION`, `validateBuild`, no duplicates, and a non-empty pool.
- Then it makes the pool for the current `RULES_VERSION` exactly the bundle: missing or differing
  records are written, and pool records not in the bundle are deleted.
- Pool records of other rules versions and every player upload are left alone.
- It prints `written`, `unchanged` and `removed`. An unchanged bundle prints 0 / 40 / 0.
- On the JSON-lines store the pool lives in `pool.jsonl`, replaced atomically; `ghosts.jsonl` stays
  append-only.

**Why uploads are closed.**
- Today's strict budget rule (shop gold only, see Validation) would reject honest 0.6.0b+ decks
  with 422, until 0.7.0's player budget ceiling replaces it (integration step 8 below).
- Uploads are also unsigned: anyone could fill the pool or impersonate a player id.
- Production therefore runs with `BB_GHOST_UPLOADS=closed`. Players fight the seeded pool, and the
  client's offline fallback covers everything else.
- Open uploads with 0.7.0, together with signed writes (REQ-BFG-016: a per-device key, which needs
  `crypto.subtle` and so a secure origin; that is why the page is served from the API's HTTPS
  origin) and the player budget ceiling.

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
   and whether it is a player ghost (`source: "server"` or a pool id) or a stand-in (`offline-…`).
7. **Config.** Set a server base URL. With none, the game plays offline (fallback only). Shore's
   origin must be listed in `--origins`.
8. **Keep the budget honest.** When warlord rewards or map events start granting gold, items or supplies,
   add the most a player could gain by day N to `maxGoldByDay`, or add a separate allowance for items that aren't bought.
   Otherwise honest decks will fail validation.
9. **Decide on dead-end belts.** The build screen lets a player save a belt that doesn't
   reach a turret (a toast, not a refusal), but validation requires connected routes (spec
   §8.1). Either block FIGHT or the upload while any belt is unconnected, or relax that rule.
