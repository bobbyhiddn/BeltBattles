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
 dusk: snapshot.ts ─ validate.ts ─ submitGhost ──POST /v1/ghosts──▶ verifyUpload ▶ decode ▶ validateUpload ▶ store
       (signed with the device key: identity.ts)
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
| `src/net/rulesGate.ts` | `parseRules`, `rulesAtLeast` and the gate that keeps turret slots and belt joins out of rules before bb-0.6.2 |
| `src/net/matchmaking.ts` | pure `pickGhost(pool, req, rng)`, `matchSeed` |
| `src/net/replay.ts` | `battleRecordFor`, `replay`, `replayBattle`, rules-version refusal |
| `src/net/fallback.ts` | `offlineGhost`, `loadGhostPool`, `fallbackGhost` |
| `src/net/ghostClient.ts` | `fetchGhost` and `submitGhost` (signed): fetch + AbortController, never throw |
| `src/net/identity.ts` | the device key, `loadIdentity`, `playerIdFromKey`, `verifyUpload` (0.7.0: see "Identity and signed uploads") |
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
- The shape allows a negative `hullBonus` so battle records holding the earlier warlord stand-ins still
  decode (stand-ins now come from the stand-in pool). The strict `validateBuild` rejects it; the player mode
  accepts exactly the hulls a run reaches (−10 after a RIDE THROUGH with no plating).

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
  legal (`deck.ts joinProblem`: next to its join tile, another belt's tile, no loop), and a deck holds at most
  `JOIN_LIMIT` (2) joins: the next legal one in route order is refused, "2 JOINS PER DECK" (0.6.2 RULE JOIN LIMIT).
  A join with an illegal shape keeps its shape reason and never counts. Both modes share this check.
- **hardpoint**: only turret equipment, on an installed turret; at most that turret's gear slots of gear, never
  two copies of one gear on a turret, one core per socket.
- **rules** (`validateUpload` only, given the snapshot's `rules`): turret slots (a non-empty `build.turrets`) and belt
  joins (any route `join`) are bb-0.6.2 rules. Under rules that predate bb-0.6.2, or that `src/net/rulesGate.ts` can't
  read as `bb-MAJOR.MINOR.PATCH`, such a deck is refused with one error naming the rules and the feature.
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
maxHonestSpend(day) = maxGold(day) + roadCap(day)       // bb-0.6.2: roadCap 5, 17, 29, 43, 59, 74, 90, 110, 127, 149
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
  full value, and it comes from the best gold plan of those days, not from the deck's own plan;
- every Hard fight pays the best captain's part that day, with or without a SABOTAGE. A seed's Hard slot shows each
  captain once on days 1-5 and never yesterday's, so this over-counts too: on bb-0.6.2 one captain alone pays the
  day's best part on several days. A free SABOTAGE adds nothing (no best pay needs one).

Against the best plan one run can follow (its own road gold funds its discount, every part stays on the deck, the
captains one seed shows, no free SABOTAGE), the slack is 0, 0, 0, 2, 4, 6, 8, 10, 12 and 14 gold on days 1-10 on
bb-0.6.2. Of that, up to 2 gold a day is the Hard rotation (`tests/net-upload.slack.test.ts` pins every part).

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
4. The snapshot is decoded, strictly: 400 on an error.
5. `snapshot.playerId` is not the key's playerId: 403.
6. The rules version and `validateBuild` (422), then the store: 201, or 200 if the ghost is already
   stored.

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
| `BB_GHOST_UPLOADS` | `closed` | `closed` | `closed`: POST /v1/ghosts answers 403 without reading the body. Only an explicit `open` takes uploads, so a start that lost the setting stays closed |
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
- The server now takes only signed uploads (see "Identity and signed uploads"), so nobody can post
  under another player's id. The game does not sign or upload yet: that is the 0.7.0 wiring.
- Production therefore runs with `BB_GHOST_UPLOADS=closed`. Players fight the seeded pool, and the
  client's offline fallback covers everything else.
- Open uploads with 0.7.0, once the game signs its uploads (REQ-BFG-016: a per-device key, which
  needs `crypto.subtle` and so a secure origin; that is why the page is served from the API's HTTPS
  origin) and the player budget ceiling lands.

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

1. **Identity.** Once per page load, `identity = await loadIdentity(indexedDbKeyStore())`. If it
   is null (no `crypto.subtle` on a plain-http page, or no IndexedDB), play offline as if no server
   were set (step 7): no upload and no match request. Otherwise `playerId = identity.playerId`.
   0.6.0's random id stays in localStorage only to recognize the player's own older local ghosts
   (the migration rule under "Identity and signed uploads"). Make a fresh `runId` per run. Add
   `seenGhosts: string[]` to `Run` (bump the save version).
2. **Submit at dusk.** Before day N's fight, build
   `{ v: 1, rules: RULES_VERSION, hero: run.hero, day: N, wins: run.wins, lives: run.lives, build: run.build, runId, playerId, createdAt: Date.now() }`.
   If `validateUpload(run.build, N).ok` (the player mode, as the server checks it), call
   `submitGhost(serverUrl, snap, identity)` without awaiting it (fire and forget). A failure never
   blocks the fight.
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
   `buildCost`, and validateBuild's turret and join rejections pass through it unchanged. Rebased onto the
   published 0.6.2 (rel-062-final 40d2b2c, v070-validate-rel): RULES_VERSION is bb-0.6.2, so the server and
   `fetchGhost` accept only bb-0.6.2 ghosts, and the ceiling was re-pinned for TUNE-C's warlord decks. The join
   limit (2) is validateBuild's own, in both modes. The rules gate (`rulesGate.ts`, see Replay and rules
   versions) keeps turrets and joins out of older rules on every accepting path. Uploads stay closed in production.
9. **Decide on dead-end belts.** The build screen lets a player save a belt that doesn't
   reach a turret (a toast, not a refusal), but validation requires connected routes (spec
   §8.1). Either block FIGHT or the upload while any belt is unconnected, or relax that rule.
