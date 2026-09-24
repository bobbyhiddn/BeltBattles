# Runbook: BeltBattles on Fly + Tigris

One small Fly machine serves the game page and the ghost API from one HTTPS origin; the ghosts
live in a Tigris bucket. Everything below is non-interactive, with every flag spelled out, and
grouped so each numbered call is one shell call (one approval). Run every call with the repo root as
the working directory:

    /home/cap/.hermit/primes/.workspaces/cap/beltbattles-server/BeltBattles

Names used below: app `beltbattles` (URL https://beltbattles.fly.dev), org `personal`, bucket
`beltbattles-ghosts`, rules `bb-0.4.0`, game build 0.6.0, the released build Shore serves
(deploy/GAME_BUILD.txt: 260,659 bytes, sha256 `48e15f1b9567a4769a4ac7571a4e833fd57cd83292c290db649f18a8fc6831b8`).

**Fallback names.** If `beltbattles` is taken (call 2 prints "Name has already been taken"), use
`beltbattles-game`: replace `beltbattles` with `beltbattles-game` in every `-a` flag and every
`beltbattles.fly.dev` URL below, and edit fly.toml before call 4: `app = "beltbattles-game"` and
`BB_GHOST_ORIGINS = "https://beltbattles-game.fly.dev"` (commit that edit). If the bucket name is
taken (Tigris names are global), use `beltbattles-ghosts-2026`; nothing else changes, because the
server reads BUCKET_NAME from the secret. If the org is not `personal`, use the slug call 1 prints.

**Secrets.** The Tigris variables exist only as Fly app secrets. Never print them: keep the
filter on call 2, never run `fly secrets list --json` through anything that echoes values, never run
`env` over `fly ssh console`. The server never logs them either.

## 1. Check flyctl, the signed-in user and the org (read-only)

```sh
fly version && fly auth whoami && fly orgs list && fly apps list
```

Expect a version line, the operator's e-mail, an org list that includes `personal` (or the slug to
use), and no existing `beltbattles` app (if it exists and is ours, skip `fly apps create` in call 2).

## 2. Create the app, the Tigris bucket and its secrets

```sh
fly apps create beltbattles --org personal && set -o pipefail && fly storage create -a beltbattles -n beltbattles-ghosts --yes 2>&1 | grep -v -E 'AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|tid_|tsec_' && fly secrets list -a beltbattles
```

- `2>&1` sends both streams through the filter; the filter drops every line naming the key id or
  the secret key (and any `tid_`/`tsec_` token, belt and braces). `pipefail` keeps a failing
  `fly storage create` from looking like success.
- Expect `fly secrets list` to show these names (digests and dates only, no values):
  `AWS_ACCESS_KEY_ID`, `AWS_ENDPOINT_URL_S3`, `AWS_SECRET_ACCESS_KEY` and `BUCKET_NAME`, all
  staged for the first deployment. Newer flyctl versions also set `AWS_REGION`; without it the
  server uses `auto`. If any of the four is missing, stop before deploying: flyctl printed the
  values instead of setting them (the filter hid them), so destroy the empty bucket and create it
  again with `-a`.
- Fallback for a taken app name: `fly apps create beltbattles-game --org personal`, then the same
  storage command with `-a beltbattles-game`. For a taken bucket name: `-n beltbattles-ghosts-2026`.

## 3. Build and stage (local only: no network, no approval needed beyond the shell)

```sh
node deploy/stage.mjs ../ref/BeltBattles-0.6.0.html
```

Runs `npm run build:server` (type-check + vite bundle into server/dist/), copies the page to the
gitignored deploy/public/index.html and refuses unless its SHA-256 and size equal
deploy/GAME_BUILD.txt. Expect the last line: `stage: ../ref/BeltBattles-0.6.0.html ->
deploy/public/index.html (260659 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
To ship a different build later: `node deploy/stage.mjs <file> --record`, commit GAME_BUILD.txt.

## 4. Deploy: one machine

```sh
fly deploy --ha=false --remote-only && fly status -a beltbattles
```

- Builds on Fly's remote builder from this directory with ./Dockerfile and ./fly.toml; the
  context is only server/dist and deploy/public/index.html (.dockerignore). The build log's context
  transfer should be a few hundred kB (the bundle is about 110 kB, the page 261 kB); tens of MB
  would mean node_modules got in and .dockerignore was not applied. Stop and report that.
- The image is node:22-alpine plus about 370 kB; no npm install step appears in the build log.
- The release command runs first, on a throwaway machine with the secrets. Expect in the output:
  `seed: rules bb-0.4.0, 40 pool ghosts on tigris (bucket beltbattles-ghosts at fly.storage.tigris.dev (virtual-hosted)): 40 written, 0 unchanged, 0 removed`.
  If it fails, the deploy stops and nothing is replaced; the output names the failing step.
- `--ha=false` creates one machine only; `fly status` should show exactly one `app` machine,
  `started`, health check `passing`.

## 5. Live checks (one call)

```sh
curl -sS https://beltbattles.fly.dev/v1/health; echo; curl -sS -o /dev/null -w 'http -> %{http_code} %{redirect_url}\n' http://beltbattles.fly.dev/; curl -sS -D - -o /dev/null https://beltbattles.fly.dev/ | grep -i -E '^(HTTP|content-type|content-length|cache-control|x-content-type-options|referrer-policy)'; curl -fsS https://beltbattles.fly.dev/ | sha256sum | grep -q 48e15f1b9567a4769a4ac7571a4e833fd57cd83292c290db649f18a8fc6831b8 && echo 'index.html: sha256 matches deploy/GAME_BUILD.txt'; curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.4.0&day=[1-10]&wins=0&lives=3&player=runbook-check&seen='; curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts; curl -sS -o /dev/null -w '%{http_code}\n' 'https://beltbattles.fly.dev/v1/health?burst=[1-130]' | sort | uniq -c
```

Expect, in order:
1. `{"ok":true,"rules":"bb-0.4.0","store":"tigris","ghosts":…,"uploads":"closed","uptimeS":…}`.
2. `http -> 301 https://beltbattles.fly.dev/` (force_https).
3. `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `content-length: 260659`,
   `cache-control: no-cache`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
4. `index.html: sha256 matches deploy/GAME_BUILD.txt` (no line at all means a mismatch).
5. Ten lines `…day=N… -> 200`, days 1-10 (curl's `[1-10]` glob; the seeded pool has 4 ghosts a day).
6. `{"error":"uploads are not open yet"} -> 403`.
7. The burst: about `120 200` and the rest `429` (120/min per client IP, keyed on Fly-Client-IP;
   the earlier checks count too). Wait 60 s before re-running any check from this machine.

## 6. Cold start (after the machine auto-stops)

Leave the app idle for about 10 minutes (no requests), then:

```sh
fly machine list -a beltbattles && curl -sS -o /dev/null -w 'cold health: %{http_code} in %{time_total}s\n' https://beltbattles.fly.dev/v1/health && curl -sS -o /dev/null -w 'first match after start: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.4.0&day=3&wins=1&lives=3&player=runbook-cold&seen=' && curl -sS -o /dev/null -w 'warm match: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.4.0&day=3&wins=1&lives=3&player=runbook-cold&seen=' && fly machine list -a beltbattles
```

Expect the first list to show the machine `stopped` and the last `started`. The server listens and
answers health within about a second of process start without touching storage, so "cold health"
is the machine start plus about a second (a few seconds in all). The first match lists and fetches
day 3's bucket from Tigris (one LIST, four GETs); the warm match comes from memory.

## 7. Re-seed, rollback, teardown

Re-seed (every deploy re-seeds; with an unchanged bundle nothing is written):

```sh
fly deploy --ha=false --remote-only && fly logs -a beltbattles --no-tail | grep -E 'seed:|seed failed' | tail -n 3
```

Expect `0 written, 40 unchanged, 0 removed`. After a rules bump or a new stand-in pool, expect the
new pool written and, for the same rules version, stale pool entries removed; player uploads are
never touched.

Rollback to an earlier release (its own release command re-seeds its own pool):

```sh
fly releases -a beltbattles --image
fly deploy --ha=false --remote-only --image <IMAGE REF of the release to return to, from the list above>
```

Teardown (destroys the ghosts; run only on the operator's word):

```sh
fly storage destroy beltbattles-ghosts --yes && fly apps destroy beltbattles --yes && fly apps list && fly storage list
```

## Troubleshooting

- Release command says `BB_GHOST_STORE=tigris needs …: not set`: a secret is missing; re-check call 2
  with `fly secrets list -a beltbattles` (names only).
- Seed or matches fail with `HTTP 403 SignatureDoesNotMatch` or a TLS/DNS error on
  `<bucket>.fly.storage.tigris.dev`: switch to path-style addressing with
  `fly deploy --ha=false --remote-only -e BB_GHOST_S3_ADDRESSING=path` (or add it to [env]).
- Matches answer 503 `ghost storage unavailable`: Tigris refused or timed out (5 s per call, two
  retries); `fly logs -a beltbattles --no-tail` shows `storage error:` lines with the operation, key
  and status (never credentials). Health stays 200 because it never touches storage.
- Health check failing right after deploy: `fly logs -a beltbattles --no-tail`; a missing
  /app/public/index.html stops the start with `static page: cannot read …` (re-run call 3, redeploy).
