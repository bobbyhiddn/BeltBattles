# Runbook: BeltBattles on Fly + Tigris (0.8.0)

One small Fly machine serves the game page and the ghost API from one HTTPS origin; the ghosts
live in a Tigris bucket. Everything below is non-interactive, with every flag spelled out, and
grouped so each numbered call is one shell call (one approval). Run every call with the repo root as
the working directory:

    /home/cap/.hermit/primes/.workspaces/cap/beltbattles-v080/BeltBattles-v080   (branch deploy-080)

Names used below: app `beltbattles` (URL https://beltbattles.fly.dev), org `personal`, bucket
`beltbattles-ghosts`, rules `bb-0.8.0`, game 0.8.0. The game is the release candidate c3c84e5; the image is built
from H2's cef0379 (v080-h2), which adds the record check to POST /v1/ghosts and changes no client code.

**The page.** The image serves the ONLINE single-file page: `npm run build:online`
(VITE_GHOST_SERVER=same-origin, into dist-online/), then `node scripts/singlefile.mjs <out.html> --dist dist-online`.
It plays against the server that serves it, with no `?server=`. deploy/GAME_BUILD.txt records it:
/home/cap/deliveries/beltbattles/BeltBattles-0.8.0-c3c84e59f24a-online.html, 578,419 bytes, sha256 as GAME_BUILD.txt
records (it begins `38f93480697c6082`). The Prime rebuilt it byte for byte at c3c84e5 and again at cef0379
(VERIFIED-RC.md, VERIFIED-H2.md). Shore serves the offline page of the same commit (578,408 bytes); it plays offline
unless opened with `?server=`.

**History.** 0.6.0 created the app and the bucket (calls 1 and 2). The 0.6.1 server line (bb-0.6.1, 40 pool
ghosts) went live on 2026-09-25. The 0.6.2 and 0.7.0 deploys were staged but never run; 0.8.0 replaces both
(0.7.0 played exactly as 0.6.2, on rules bb-0.6.2). Call 4's command saves `fly releases -a beltbattles --image`
first (output-d080/releases-before.txt), which shows what was live. 0.8.0 ships four playable heroes (FURNACE,
WEAVER, FOUNDRY, BASTION), the bb-0.8.0 seed pool (120 ghosts, 12 a day), the ghost admin tool (section 7) and a
server that refuses an upload whose record no run can reach (docs/ASYNC.md). Uploads stay closed until the operator
opens them (section 9).

**Fallback names** (only for a rebuild from nothing). If `beltbattles` is taken (call 2 prints "Name has already
been taken"), use `beltbattles-game`: replace `beltbattles` with `beltbattles-game` in every `-a` flag and every
`beltbattles.fly.dev` URL below, and edit fly.toml before call 4: `app = "beltbattles-game"` and
`BB_GHOST_ORIGINS = "https://beltbattles-game.fly.dev"` (commit that edit). If the bucket name is
taken (Tigris names are global), use `beltbattles-ghosts-2026`; nothing else changes, because the
server reads BUCKET_NAME from the secret. If the org is not `personal`, use the slug call 1 prints.

**Secrets.** The Tigris variables exist only as Fly app secrets. Never print them: keep the
filter on call 2, never run `fly secrets list --json` through anything that echoes values, never run
`env` over `fly ssh console`. The server, the admin tool and the smoke never log them either.

## 1. Check flyctl, the signed-in user and the org (read-only)

```sh
fly version && fly auth whoami && fly orgs list && fly apps list
```

Expect a version line, the operator's e-mail, an org list that includes `personal` (or the slug to
use), and the existing `beltbattles` app.

## 2. Create the app, the Tigris bucket and its secrets (done at 0.6.0; only for a rebuild from nothing)

```sh
fly apps create beltbattles --org personal && set -o pipefail && fly storage create -a beltbattles -n beltbattles-ghosts --yes 2>&1 | grep -v -E 'AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|tid_|tsec_' && fly secrets list -a beltbattles
```

- `2>&1` sends both streams through the filter; the filter drops every line naming the key id or
  the secret key (and any `tid_`/`tsec_` token, belt and braces). `pipefail` keeps a failing
  `fly storage create` from looking like success.
- Expect `fly secrets list` to show these names (digests and dates only, no values):
  `AWS_ACCESS_KEY_ID`, `AWS_ENDPOINT_URL_S3`, `AWS_SECRET_ACCESS_KEY` and `BUCKET_NAME`. Newer flyctl
  versions also set `AWS_REGION`; without it the server uses `auto`. If any of the four is missing, stop
  before deploying: flyctl printed the values instead of setting them (the filter hid them), so destroy the
  empty bucket and create it again with `-a`.

## 3. Build and stage (local only: no network)

```sh
node deploy/stage.mjs /home/cap/deliveries/beltbattles/BeltBattles-0.8.0-c3c84e59f24a-online.html
```

Runs `npm run build:server` (type-check + vite bundle into server/dist/: ghost-server.mjs, ghost-admin.mjs,
gen-ghost-pool.mjs and their shared chunks), copies the page to the gitignored deploy/public/index.html and
refuses unless its SHA-256 and size equal deploy/GAME_BUILD.txt. Expect the last line:
`stage: ../../../../../../deliveries/beltbattles/BeltBattles-0.8.0-c3c84e59f24a-online.html -> deploy/public/index.html (578419 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
To ship a different build later: `node deploy/stage.mjs <file> --record`, then commit GAME_BUILD.txt.

## 4. Deploy: one machine

```sh
fly deploy --ha=false --remote-only && fly status -a beltbattles
```

- Builds on Fly's remote builder from this directory with ./Dockerfile and ./fly.toml; the
  context is only server/dist and deploy/public/index.html (.dockerignore): about 1.0 MB (the bundle
  about 440 kB, the page 578 kB). Tens of MB would mean node_modules got in and .dockerignore was not
  applied. Stop and report that.
- The image is node:22-alpine plus those files; no npm install step appears in the build log.
- The release command (`node /app/dist/ghost-server.mjs seed`) runs first, on a throwaway machine with the
  secrets, and writes the bundled bb-0.8.0 pool (120 ghosts: 3 per hero per day for the four heroes). It checks
  all 120 first (the strict decoder, the rules, validateUpload in the player mode, a reachable record, no
  duplicates) and writes nothing if one fails. Expect a `seed: rules bb-0.8.0, 120 pool ghosts on tigris (...)`
  line with `120 written, 0 unchanged, 0 removed` (no bb-0.8.0 ghosts in the bucket yet; on a re-deploy of the same
  image, `0 written, 120 unchanged, 0 removed`). The seed touches only `ghosts/bb-0.8.0/dNN/pool/`: the bb-0.6.1
  ghosts (and bb-0.6.2's, had 0.7.0 gone live) stay under their own prefixes, and no player upload is touched.
  If the release command fails, the deploy stops and nothing is replaced; the output names the failing step.
- `--ha=false` keeps one machine; `fly status` should show exactly one `app` machine, `started`, health check
  `passing`.

## 5. Live checks (one call)

```sh
curl -sS https://beltbattles.fly.dev/v1/health; echo; curl -sS -o /dev/null -w 'http -> %{http_code} %{redirect_url}\n' http://beltbattles.fly.dev/; curl -sS -D - -o /dev/null https://beltbattles.fly.dev/ | grep -i -E '^(HTTP|content-type|content-length|cache-control|x-content-type-options|referrer-policy)'; curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.0 online page (cmp)'; curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0'; curl -sS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | head -c 300; echo; curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts; fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0'
```

Expect, in order:
1. `{"ok":true,"rules":"bb-0.8.0","store":"tigris","ghosts":…,"uploads":"closed","uptimeS":…}`. `ghosts`
   counts what the lazy bucket cache has read so far; 0 right after a start is normal.
2. `http -> 301 https://beltbattles.fly.dev/` (force_https).
3. `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `content-length: 578419`,
   `cache-control: no-cache`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
4. `live page = the staged 0.8.0 online page (cmp)` (no line at all means a mismatch).
5. Ten lines `…day=N… -> 200`, days 1-10: a new player (`runs=0`, D2: seed ghosts only) with 0 wins and
   5 lives gets a ghost with no better record (D1: fewer wins, or as many and no more lives; here a 0-win ghost).
   Every day has 12 seed ghosts, 4 of them on the day's floor record.
6. Day 3's body for a new player on 1 win, 5 lives: `{"id":"g…","snapshot":{"v":2,"rules":"bb-0.8.0",…,"day":3,`
   with at most 1 win, from any of the four heroes.
7. `{"error":"uploads are not open yet"} -> 403`.
8. The admin tool's read-only list on the machine (section 7): 12 seed-pool ghosts a day, 0 uploads, 0 players;
   `all 120 0 0`.
Optional, separately: the rate limit, `curl -sS -o /dev/null -w '%{http_code}\n' 'https://beltbattles.fly.dev/v1/health?burst=[1-130]' | sort | uniq -c`:
about `120 200` and the rest `429` (120/min per client IP, keyed on Fly-Client-IP). Wait 60 s before
re-running any check from this machine.

**Older pages.** A browser that still holds an older page (no-cache: a reload gets 0.8.0) asks for its own rules'
ghosts. It gets that rules' seed ghosts if the bucket still holds them, otherwise a 404, and then it fights its own
stand-in. Its uploads are refused: 403 while uploads are closed, 422 (foreign rules) once they open.

## 6. Cold start (after the machine auto-stops)

Leave the app idle for about 10 minutes (no requests), then:

```sh
fly machine list -a beltbattles && curl -sS -o /dev/null -w 'cold health: %{http_code} in %{time_total}s\n' https://beltbattles.fly.dev/v1/health && curl -sS -o /dev/null -w 'first match after start: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-cold&seen=&runs=0' && curl -sS -o /dev/null -w 'warm match: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-cold&seen=&runs=0' && fly machine list -a beltbattles
```

Expect the first list to show the machine `stopped` and the last `started`. The server listens and
answers health within about a second of process start without touching storage, so "cold health"
is the machine start plus about a second. The first match lists and fetches day 3's bucket from Tigris; the
warm match comes from memory. The game waits at most 4 s for a ghost, then fights its own stand-in.

## 7. The ghost admin tool (on the machine, with the app's env)

The image carries it as /app/dist/ghost-admin.mjs. It reads the store exactly as the server does
(BB_GHOST_STORE=tigris and the Tigris secrets from the machine's env). docs/ASYNC.md "Operations" has the
full rules and the tests.

```sh
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.8.0'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs wipe-uploads --rules bb-0.8.0'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs remove-player <playerId> --rules bb-0.8.0'
```

- Every command but `list` is a DRY RUN unless `--apply` is added: it prints each record it would delete
  (key, kind, day, ghost id, player, reason), then `DRY RUN: nothing was deleted`. Read the plan, then run the
  same command again with `--apply`; it deletes exactly the planned records.
- `--rules` is required; nothing of another rules version is read or touched. `revalidate` runs only for this
  build's rules (bb-0.8.0): every upload through the strict decoder, the exact rules, the rules and hero gates,
  validateUpload in the player mode and the reachable-record check (the same check POST /v1/ghosts now makes, so a
  bb-0.8.0 store should never list a record failure). It can't re-check signatures: the server keeps neither keys
  nor signatures.
- The seed pool is never deleted, except by `wipe-uploads --pool` (the next deploy's release command writes it
  back). `remove-player` never touches a seed ghost.
- Exit 2 is a refused command line (nothing read); exit 1 means fewer records were deleted than planned.
- **After an `--apply` the running server keeps serving deleted ghosts** from its bucket cache until
  BB_GHOST_CACHE_TTL_S (600 s) passes or the machine restarts. To make it take effect at once:
  `fly apps restart beltbattles`, then check the match route.
- Old pools: the bb-0.6.1 pool (and bb-0.6.2's, had 0.7.0 gone live) can stay; it serves only older cached pages.
  To remove one, on the operator's word: `wipe-uploads --rules <old rules> --pool`, a dry run first, then `--apply`.

## 8. Re-seed, rollback, teardown

Re-seed (every deploy re-seeds; with an unchanged bundle nothing is written):

```sh
fly deploy --ha=false --remote-only && fly logs -a beltbattles --no-tail | grep -E 'seed:|seed failed' | tail -n 3
```

Expect `0 written, 120 unchanged, 0 removed`. After a rules bump or a new seed pool, expect the
new pool written and, for the same rules version, stale pool entries removed; player uploads are
never touched by the seed.

Rollback to an earlier release (its own release command re-seeds its own pool):

```sh
fly releases -a beltbattles --image
fly deploy --ha=false --remote-only --image <IMAGE REF of the release to return to, from the list above>
```

Rolling back to the previous image (output-d080/releases-before.txt names it) serves its page and its own pool
again; the bb-0.8.0 ghosts stay in the bucket under their own prefix, ready for a roll forward.

Teardown (destroys the ghosts; run only on the operator's word):

```sh
fly storage destroy beltbattles-ghosts --yes && fly apps destroy beltbattles --yes && fly apps list && fly storage list
```

## 9. Opening uploads (only on the operator's word; its own L4 call)

0.8.0 goes live with uploads closed. Opening them is a separate decision:
- set `BB_GHOST_UPLOADS = "open"` in fly.toml;
- re-pin, on purpose, the two tests that pin it closed today: tests/server-config.test.ts (the production
  configuration has uploads closed) and tests/h2.smoke.test.ts's HEAD case (uploads "as fly.toml" while fly.toml
  says closed). The smoke itself will then name `BB_GHOST_UPLOADS=closed   DIFFERS: fly.toml has open`, which is
  true: the smoke runs its own server closed;
- commit, run the gate, then call 4 and the checks for that step: a signed upload from the page 201; an unsigned
  POST 401; a dishonest deck 422; an unreachable record 422; `ghost-admin.mjs revalidate --rules bb-0.8.0` clean.
  Those checks are written with that step.
Closing again is the same edit back to `"closed"` and call 4.

## Troubleshooting

- Release command says `BB_GHOST_STORE=tigris needs …: not set`: a secret is missing; re-check call 2
  with `fly secrets list -a beltbattles` (names only).
- Seed or matches fail with `HTTP 403 SignatureDoesNotMatch` or a TLS/DNS error on
  `<bucket>.fly.storage.tigris.dev`: switch to path-style addressing with
  `fly deploy --ha=false --remote-only -e BB_GHOST_S3_ADDRESSING=path` (or add it to [env]).
- Matches answer 503 `ghost storage unavailable`: Tigris refused or timed out (5 s per call, two
  retries); `fly logs -a beltbattles --no-tail` shows `storage error:` lines with the operation, key
  and status (never credentials). Health stays 200 because it never touches storage. The game itself falls
  back to its own stand-in after 4 s, so players still get a fight.
- Health check failing right after deploy: `fly logs -a beltbattles --no-tail`; a missing
  /app/public/index.html stops the start with `static page: cannot read …` (re-run call 3, redeploy).
- The admin tool says the store is jsonl or a Tigris variable is not set: the ssh session lacks the app's
  env; run it as `fly ssh console -a beltbattles -C 'sh -lc "node /app/dist/ghost-admin.mjs list --rules bb-0.8.0"'`
  and report it before any `--apply`.
