# Runbook: BeltBattles on Fly + Tigris (0.8.3: a part's whole description on a phone tap, on 0.8.0's server with uploads open)

One small Fly machine serves the game page and the ghost API from one HTTPS origin; the ghosts
live in a Tigris bucket. Everything below is non-interactive, with every flag spelled out, and
grouped so each numbered call is one shell call (one approval). Run every call with the repo root as
the working directory:

    /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r083/BeltBattles-r083   (branch release-083)

0.8.0 and its uploads step ran from the clone beltbattles-u080/BeltBattles-u080 (branch uploads-080), and 0.8.1 from
beltbattles-v081/BeltBattles-v081 (branch release-081). Sections 9 and 10 are kept as they ran there: their calls name
those clones and tips, and they must never run again. Section 11 is 0.8.2's call as written in the clone
beltbattles-r082/BeltBattles-r082 (branch release-082, tip 7669e36); it names that clone, and it must never run once
section 12's call has run. Sections 3 and 5 now name 0.8.3's page, and section 12 is 0.8.3's call, from this clone.

Names used below: app `beltbattles` (URL https://beltbattles.fly.dev), org `personal`, bucket
`beltbattles-ghosts`, rules `bb-0.8.0`, game 0.8.3. The page is 0.8.3's: 0.8.0 (the release candidate c3c84e5) with the
phone controls (section 10), the title screen on phones (section 11) and a part's whole description on a phone tap
(section 12). The server is uploads-080's, unchanged: H2's cef0379 (v080-h2), which adds the record check to POST
/v1/ghosts, with uploads open (section 9).

**Branches and commits.** The live 0.8.0 deploy (release v3, 2026-10-03, uploads closed) ran calls 3-5 from branch
deploy-080, 69fe689 (H2's cef0379 plus the deploy commit), in the staged clone beltbattles-v080/BeltBattles-v080. This
clone holds the same deploy-080. Its branch uploads-080 is deploy-080 plus the uploads step (section 9):
- 489beb4: fly.toml's `BB_GHOST_UPLOADS = "open"`, with the deliberate test re-pins;
- acce9fd: the probe, ghost-probe.mjs;
- 20410e8: the uploads docs (sections 3, 4, 5, 8 and 9, and docs/ASYNC.md). It went live as release v4 (uploads open).

Branch release-081, in this clone (a standalone copy of uploads-080), is uploads-080 plus 0.8.1 (section 10):
- the nine shoptap commits, the phone controls (REQ-BFG-034 to 037), cherry-picked from 0350e5f8b40a (made on 69fe689);
- 1d47d41: the 0.8.1 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- the release record: GAME_BUILD.txt records the 0.8.1 online page, sections 3 and 5 name it, and section 10 is its call.
  36fb391 went live as release v5 (LIVE-081).

Branch release-082, in this clone (a standalone copy of release-081), is release-081 plus 0.8.2 (section 11):
- ddcbeb8, 74956d1, 86cada1: the title screen on phones (REQ-BFG-038), fetched from 30b1d668's verified release-082
  bundle (made on 36fb391);
- a9a9090: the 0.8.2 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- the release record: GAME_BUILD.txt records the 0.8.2 online page, sections 3 and 5 name it, and section 11 is its call.
  When release-083 was cut, 7669e36 had not gone live: its L4 (esc_2edf070f-4fc) was still pending.

Branch release-083, in this clone (a standalone copy of release-082), is release-082 plus 0.8.3 (section 12):
- 899f728, fd22843, 4e52f3e, 5f79038: a part's whole description on a phone tap (REQ-BFG-034/035), cherry-picked from 30b1d668's
  verified release-tap bundle (5b71395, ae79068, 73cb2ec, f7db355, made on 86cada1);
- 462c29a: the 0.8.3 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- the release record: GAME_BUILD.txt records the 0.8.3 online page, sections 3 and 5 name it, and section 12 is its call.

**The page.** The image serves the ONLINE single-file page: `npm run build:online`
(VITE_GHOST_SERVER=same-origin, into dist-online/), then `node scripts/singlefile.mjs <out.html> --dist dist-online`.
It plays against the server that serves it, with no `?server=`. deploy/GAME_BUILD.txt records 0.8.3's:
/home/cap/deliveries/beltbattles/BeltBattles-0.8.3-462c29aa102e-online.html, 590,294 bytes, sha256 as GAME_BUILD.txt
records (it begins `de5e96fb357a2e34`), built at 462c29a. Shore serves the offline page of the same commit (590,283
bytes); it plays offline unless opened with `?server=`. Section 12's call stages the byte-identical copy in
../ref/pages/ beside this clone (stage.mjs checks the size and the SHA-256 against GAME_BUILD.txt, not the path).
Before 0.8.3, GAME_BUILD.txt recorded 0.8.2's page, BeltBattles-0.8.2-a9a9090ca36b-online.html (589,217 bytes, sha256
`3b6867b0b432be80…`), and before that 0.8.1's, BeltBattles-0.8.1-1d47d41ef7e4-online.html (587,335 bytes, sha256
`49ad55a7e1d4f014…`), which release v5 serves.
Before 0.8.1, GAME_BUILD.txt recorded 0.8.0's page, BeltBattles-0.8.0-c3c84e59f24a-online.html (578,419 bytes, sha256
`38f93480697c6082…`), which releases v3 and v4 serve. The Prime rebuilt that page byte for byte at c3c84e5 and at
cef0379 (VERIFIED-RC.md, VERIFIED-H2.md), and the uploads step kept it.

**History.** 0.6.0 created the app and the bucket (calls 1 and 2). The 0.6.1 server line (bb-0.6.1, 40 pool
ghosts) went live on 2026-09-25. The 0.6.2 and 0.7.0 deploys were staged but never run; 0.8.0 replaces both
(0.7.0 played exactly as 0.6.2, on rules bb-0.6.2). Call 4's command saves `fly releases -a beltbattles --image`
first (output-d080/releases-before.txt), which shows what was live. 0.8.0 ships four playable heroes (FURNACE,
WEAVER, FOUNDRY, BASTION), the bb-0.8.0 seed pool (120 ghosts, 12 a day), the ghost admin tool (section 7) and a
server that refuses an upload whose record no run can reach (docs/ASYNC.md). It went live on 2026-10-03 (release v3)
with uploads closed. The uploads step (section 9) opens them, on the operator's word. It changes the server bundle
(the probe rides along) and the uploads switch, and nothing else. It went live on 2026-10-03 at about
16:04Z (release v4, LIVE-U080). 0.8.1, the phone controls, changes the page and nothing else (section 10). It went
live on 2026-10-03 at about 17:21Z (release v5, LIVE-081). 0.8.2, the title screen on phones, also changes the page
and nothing else (section 11). 0.8.3, a part's whole description on a phone tap, is built on 0.8.2, so it carries
0.8.2's change too; it also changes the page and nothing else (section 12).

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
node deploy/stage.mjs /home/cap/deliveries/beltbattles/BeltBattles-0.8.3-462c29aa102e-online.html
```

Runs `npm run build:server` (type-check + vite bundle into server/dist/: ghost-server.mjs, ghost-admin.mjs,
gen-ghost-pool.mjs, from uploads-080 on also ghost-probe.mjs, and their shared chunks), copies the page to the
gitignored deploy/public/index.html and refuses unless its SHA-256 and size equal deploy/GAME_BUILD.txt. Expect the
last line:
`stage: ../../../../../../deliveries/beltbattles/BeltBattles-0.8.3-462c29aa102e-online.html -> deploy/public/index.html (590294 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
Section 12 stages the same bytes from ../ref/pages/, so its line names `../ref/pages/BeltBattles-0.8.3-462c29aa102e-online.html`.
To ship a different build later: `node deploy/stage.mjs <file> --record`, then commit GAME_BUILD.txt.

## 4. Deploy: one machine

```sh
fly deploy --ha=false --remote-only && fly status -a beltbattles
```

- Builds on Fly's remote builder from this directory with ./Dockerfile and ./fly.toml; the
  context is only server/dist and deploy/public/index.html (.dockerignore): about 1.0 MB (the bundle
  about 440 kB, or 460 kB from uploads-080 with the probe; the page 578 kB). Tens of MB would mean node_modules got in
  and .dockerignore was not applied. Stop and report that.
- The image is node:22-alpine plus those files; no npm install step appears in the build log.
- The release command (`node /app/dist/ghost-server.mjs seed`) runs first, on a throwaway machine with the
  secrets, and writes the bundled bb-0.8.0 pool (120 ghosts: 3 per hero per day for the four heroes). It checks
  all 120 first (the strict decoder, the rules, validateUpload in the player mode, a reachable record, no
  duplicates) and writes nothing if one fails. Expect a `seed: rules bb-0.8.0, 120 pool ghosts on tigris (...)`
  line with `120 written, 0 unchanged, 0 removed` (no bb-0.8.0 ghosts in the bucket yet; on a re-deploy of the same
  image, `0 written, 120 unchanged, 0 removed`). The seed touches only `ghosts/bb-0.8.0/dNN/pool/`: the bb-0.6.1
  ghosts (and bb-0.6.2's, had 0.7.0 gone live) stay under their own prefixes, and no player upload is touched.
  If the release command fails, the deploy stops and nothing is replaced; the output names the failing step.
- flyctl does not print the release command's own output: the deploy log shows only `release_command <machine>
  completed successfully` (LIVE-080 section 4). The `seed: …` line is in `fly logs -a beltbattles --no-tail`
  (section 8), another call.
- `--ha=false` keeps one machine; `fly status` should show exactly one `app` machine, `started` with its health check
  `passing`, or stopped until the first request (auto-stop). The rolling update can leave the machine `stopped`, with
  checks `1 total, 1 warning`, as the 0.8.0 deploy did (LIVE-080 section 4). The first request starts it.

## 5. Live checks (one call)

```sh
curl -sS https://beltbattles.fly.dev/v1/health; echo; curl -sS -o /dev/null -w 'http -> %{http_code} %{redirect_url}\n' http://beltbattles.fly.dev/; curl -sS -D - -o /dev/null https://beltbattles.fly.dev/ | grep -i -E '^(HTTP|content-type|content-length|cache-control|x-content-type-options|referrer-policy)'; curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.3 online page (cmp)'; curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0'; curl -sS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | head -c 300; echo; curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts; fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0'
```

Expect, in order:
1. `{"ok":true,"rules":"bb-0.8.0","store":"tigris","ghosts":…,"uploads":"closed","uptimeS":…}`, and
   `"uploads":"open"` once the uploads step (section 9) is live. `ghosts` counts what the lazy bucket cache has read
   so far; 0 right after a start is normal.
2. `http -> 301 https://beltbattles.fly.dev/` (force_https).
3. `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `content-length: 590294` (0.8.2's page: 589217; 0.8.1's: 587335; 0.8.0's: 578419),
   `cache-control: no-cache`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
4. `live page = the staged 0.8.3 online page (cmp)` (no line at all means a mismatch).
5. Ten lines `…day=N… -> 200`, days 1-10: a new player (`runs=0`, D2: seed ghosts only) with 0 wins and
   5 lives gets a ghost with no better record (D1: fewer wins, or as many and no more lives; here a 0-win ghost).
   Every day has 12 seed ghosts, 4 of them on the day's floor record.
6. Day 3's body for a new player on 1 win, 5 lives: `{"id":"g…","snapshot":{"v":2,"rules":"bb-0.8.0",…,"day":3,`
   with at most 1 win, from any of the four heroes.
7. `{"error":"uploads are not open yet"} -> 403` while uploads are closed. Once they are open (section 9), the same
   unsigned POST gets `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
8. The admin tool's read-only list on the machine (section 7): 12 seed-pool ghosts a day, 0 uploads, 0 players;
   `all 120 0 0`. Once uploads are open, the uploads and players columns also count the players' uploads: `all 120 N P`
   for N uploads by P players.
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
fly deploy --ha=false --remote-only --image <IMAGE REF of the release to return to, from the list above> -e BB_GHOST_UPLOADS=closed
```

Rolling back to the previous image (output-d080/releases-before.txt names it) serves its page and its own pool
again; the bb-0.8.0 ghosts stay in the bucket under their own prefix, ready for a roll forward.

**Never roll back by image from uploads-080.** A deploy by image takes its env from this directory's fly.toml, and
uploads-080's fly.toml opens uploads (section 9), so the older image would run with uploads open. To undo the uploads
step, use section 9's rollback: switch to deploy-080 (its fly.toml says closed) and deploy from there with
`-e BB_GHOST_UPLOADS=closed`, not by image. To go back further, to an image older than 0.8.0, run the two lines above
from deploy-080 (`git switch deploy-080` first), with the `-e`. Either way, health must then say `"uploads":"closed"`.

Teardown (destroys the ghosts; run only on the operator's word):

```sh
fly storage destroy beltbattles-ghosts --yes && fly apps destroy beltbattles --yes && fly apps list && fly storage list
```

## 9. Opening uploads (its own L4; only on the operator's word)

**Done:** release v4, 2026-10-03 at about 16:04Z (LIVE-U080). This section is kept as it ran, in the clone
beltbattles-u080/BeltBattles-u080 on uploads-080's tip 20410e8. Never run its call again.

0.8.0 went live with uploads closed: release v3, 2026-10-03, calls 3-5 from deploy-080, with all 8 live checks passed
(LIVE-080). This step opens them, as one call with one approval.

**What ships.** The server from branch uploads-080 at its tip, in this clone. That is deploy-080 (69fe689, the live
0.8.0) plus:
- `BB_GHOST_UPLOADS = "open"` in fly.toml (489beb4), the only deploy-file change. The code default stays closed
  (server/config.ts), so a start that loses the line refuses uploads. What makes open safe in 0.8.0 is already live in
  v3's server:
  - signed uploads: 401 without a device key's signature;
  - the budget check: validateUpload in the player mode, 422;
  - the hero gate: bb-0.8.0 takes FURNACE, WEAVER, FOUNDRY and BASTION, and METRONOME and SIPHON get 400 until 0.9.0;
  - the record check (H2): a record no run can reach gets 422.
- The probe, server/dist/ghost-probe.mjs (acce9fd). The call runs it from here against the live app. The image carries
  it too, unused there. vite re-splits the shared chunks, so server/dist holds 10 files, about 460 kB.
- This docs commit.

No request path changes: POST /v1/ghosts, the match route and the admin tool are v3's.

**The page does not change.** deploy/GAME_BUILD.txt still records the 0.8.0 online page (578,419 bytes, sha256
38f93480697c6082…). The call stages the byte-identical copy in ../ref/pages/, and stage.mjs checks its size and SHA-256.
The live page must stay cmp-identical to it. RULES_VERSION stays bb-0.8.0, and the seed pool is unchanged: the release
command writes nothing (0 written, 120 unchanged). This step changes the server bundle and the uploads switch only.

**Who meets the probe's uploads.** Between the probe and the clean-up, the store holds the probe's four honest decks. A
new player (fewer than 3 finished runs) meets only seed ghosts (D2). So only an experienced player can meet one, and
only until the clean-up removes them.

**Working directory:** this clone, branch uploads-080 (see the header). The call refuses unless HEAD is the tip named in
output-u080/CMD-U080.txt (beside this clone) and the tree is clean. ../output-u080/probe-id.txt must not hold an id:
the probe refuses to overwrite an earlier probe's id, which the clean-up still needs.

**The call.** output-u080/CMD-U080.txt is exactly this, with `<TIP>` filled in (a commit can't name its own hash):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-u080/BeltBattles-u080 || exit 1; [ "$(git rev-parse --short=7 HEAD)" = <TIP> ] || { echo "refused: HEAD is $(git rev-parse --short=7 HEAD), not <TIP>"; exit 1; }; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-u080/ref/pages/BeltBattles-0.8.0-c3c84e59f24a-online.html 2>&1 | tail -1 && fly releases -a beltbattles --image > ../output-u080/releases-before.txt 2>&1 && fly deploy --ha=false --remote-only 2>&1 | tee ../output-u080/run-deploy.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"uploads":"open"' && curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.0 online page (cmp)' && node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-u080/probe-id.txt && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.8.0' && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-u080/probe-id.txt) --rules bb-0.8.0 --apply" && fly apps restart beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"uploads":"open"' && curl -fsS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | grep -o '"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"[a-z]*","day":3,"wins":[01],"lives":[0-9]' && echo 'day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0' && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0'
```

In order, it:
1. sets `pipefail` and enters this clone;
2. refuses unless HEAD is `<TIP>` and the tree is clean;
3. stages the 0.8.0 online page (call 3), which also builds server/dist from the tip, the probe included;
4. saves the release list with image refs to ../output-u080/releases-before.txt: what was live (v3);
5. deploys (call 4), keeping the whole log in ../output-u080/run-deploy.txt and showing its last 30 lines;
6. runs `fly status`;
7. reads health, which must say uploads are open, or the call stops. It is the first request after the update, so it
   also starts a machine the update left stopped; `--retry 3` covers that start;
8. compares the live page with the staged one;
9. runs the probe, which writes its player id to ../output-u080/probe-id.txt before its first POST;
10. runs revalidate as a dry run: nothing planned;
11. runs remove-player for the probe's id, with `--apply`: the probe's 4 uploads are deleted;
12. restarts the app, so the server drops its cached copies (the bucket cache lives 600 s);
13. reads health again;
14. asks for one match, day 3 with 1 win and 5 lives, as a new player: 200 with rules bb-0.8.0;
15. lists the store: `all 120 0 0`.

Every step after the guards is chained with `&&`, so the first failure stops the call.

**Expect, step by step** (rehearsed on 127.0.0.1 with a JSON-lines store: output-u080/RUN-local-u080.log; the call's
own text with Fly stubbed: output-u080/RUN-cmd-sim-u080.log):
- Steps 1-2: no output.
- Step 3: `stage: ../ref/pages/BeltBattles-0.8.0-c3c84e59f24a-online.html -> deploy/public/index.html (578419 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
- Step 4: no output. Its file lists v3 (0.8.0, uploads closed) as the newest release.
- Step 5, the deploy's last 30 lines, as in 0.8.0's deploy (LIVE-080):
  - the image is node:22-alpine plus server/dist and the page, about 1.04 MB of context, with no npm install;
  - `release_command … completed successfully`. flyctl does not print the seed's own line. In `fly logs` it reads
    `seed: rules bb-0.8.0, 120 pool ghosts on tigris (…): 0 written, 120 unchanged, 0 removed`;
  - the one machine is updated (it may be left `stopped`), DNS is verified, and flyctl prints the app's URL.
- Step 6: exactly one `app` machine on the new version. It is `started` with its check `passing`, or `stopped` (checks
  `1 total, 1 warning`) until the next request.
- Step 7: `{"ok":true,"rules":"bb-0.8.0","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`. Right after a
  start, `ghosts` 0 and a small `uptimeS` are normal.
- Step 8: `live page = the staged 0.8.0 online page (cmp)`.
- Step 9, the probe, 12 lines (the ids differ on every run):
  ```
  probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.8.0); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored
  PASS  furnace-signed     expected: 201 {"id":"g…"} | got: 201 {"id":"g…"}
  PASS  furnace-unsigned   expected: 401 unsigned upload: the x-bb-key and x-bb-sig headers are required | got: 401 unsigned upload: the x-bb-key and x-bb-sig headers are required
  PASS  dishonest-signed   expected: 422 deck failed validation: budget: ... | got: 422 deck failed validation: budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows at most 13 (maxGoldByDay 8 + roadCap 5)
  PASS  unreachable-signed expected: 422 record: 0W 1 lives is no record a run carries into dusk 1 | got: 422 record: 0W 1 lives is no record a run carries into dusk 1
  PASS  hero-WEAVER        expected: 201 {"id":"g…"} | got: 201 {"id":"g…"}
  PASS  hero-FOUNDRY       expected: 201 {"id":"g…"} | got: 201 {"id":"g…"}
  PASS  hero-BASTION       expected: 201 {"id":"g…"} | got: 201 {"id":"g…"}
  PASS  hero-METRONOME     expected: 400 snapshot.hero: rules bb-0.8.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not METRONOME | got: 400 snapshot.hero: rules bb-0.8.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not METRONOME
  PASS  hero-SIPHON        expected: 400 snapshot.hero: rules bb-0.8.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not SIPHON | got: 400 snapshot.hero: rules bb-0.8.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not SIPHON
  probe player: <43 characters: the fresh key's player id>
  probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in ../output-u080/probe-id.txt
  ```
  On each 201 line, the expected id and the id got are the same. The four stored decks, each its own record under the
  probe's player id, are:
  - FURNACE's day-1 start deck (0 wins, 5 lives);
  - the WEAVER, FOUNDRY and BASTION day-3 reference decks (1 win, 5 lives).
- Step 10, revalidate:
  ```
  ghosts:admin revalidate --rules bb-0.8.0: tigris store, bucket beltbattles-ghosts at fly.storage.tigris.dev (virtual-hosted) (DRY RUN)
  plan: delete 0 record(s) of bb-0.8.0; keep 120 seed-pool ghost(s) and 4 upload(s)
  DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.
  ```
  The 4 uploads are the probe's. Players who uploaded since the deploy add to that count, and their uploads pass too.
- Step 11, remove-player:
  ```
  ghosts:admin remove-player <the probe's id> --rules bb-0.8.0: tigris store, bucket beltbattles-ghosts at fly.storage.tigris.dev (virtual-hosted) (APPLY)
  plan: delete 4 record(s) of bb-0.8.0; keep 120 seed-pool ghost(s) and 0 upload(s)
    delete ghosts/bb-0.8.0/d01/player/<g…>.json  upload day 1  ghost <g…>  player <the probe's id>  (player <the probe's id>)
    delete ghosts/bb-0.8.0/d03/player/<g…>.json  upload day 3  ghost <g…>  player <the probe's id>  (player <the probe's id>)
    (two more day-3 lines like the one above)
  APPLIED: deleted 4 of 4 record(s).
    A running server serves a deleted ghost until its bucket cache expires (BB_GHOST_CACHE_TTL_S) or it restarts.
  ```
  The four ghost ids are the four from the probe's 201 lines.
- Step 12: flyctl reports the machine restarted.
- Step 13: health again, with `"uploads":"open"`.
- Step 14: `"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"…","day":3,"wins":1,"lives":5`, then
  `day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0`. It is a seed ghost with at most 1 win; the rehearsal
  and LIVE-080 both got WEAVER.
- Step 15: the list. The header, ten day rows of `12 0 0`, then `  all    120        0        0`.

Each `fly ssh console` may first print `Connecting to …` on stderr. Afterwards, section 5's checks can be re-run with
their open-uploads lines (1, 7 and 8).

**Clean-up.** The call does it:
- remove-player deletes exactly the probe's uploads. Its plan names the probe's player id, a fresh key nobody else
  holds;
- the restart drops the server's cached copies;
- the final list shows 0 uploads.

If the call stopped after the probe's first 201, clean up by hand with the call below. The probe wrote its id to
../output-u080/probe-id.txt before its first POST.

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-u080/BeltBattles-u080 && [ -s ../output-u080/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-u080/probe-id.txt) --rules bb-0.8.0 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0'
```

Expect `plan: delete N record(s)`, where N is the number of 201s the probe got (at most 4), then
`APPLIED: deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example
to probe-id-1.txt) before any new probe.

**Closing again** is the rollback below. It returns the server to deploy-080's with uploads closed, and it needs no
commit. Uploads stored meanwhile stay in the bucket, honest by every check, and experienced players keep meeting them.
To remove them too, run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs wipe-uploads --rules bb-0.8.0'`
(a dry run: read the plan), then the same with `--apply`, then `fly apps restart beltbattles`. The seed pool stays.

**The rollback: from deploy-080 with `-e BB_GHOST_UPLOADS=closed`, never by image.** A deploy by image takes its env
from this directory's fly.toml, and uploads-080's fly.toml opens uploads, so an image deployed from here would run open.
So switch to deploy-080 (the live 0.8.0's source, whose fly.toml says closed), then stage and deploy from there with
`-e BB_GHOST_UPLOADS=closed` as well:

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-u080/BeltBattles-u080 || exit 1; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; git switch deploy-080 && node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-u080/ref/pages/BeltBattles-0.8.0-c3c84e59f24a-online.html 2>&1 | tail -1 && fly deploy --ha=false --remote-only -e BB_GHOST_UPLOADS=closed 2>&1 | tee ../output-u080/run-rollback.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"uploads":"closed"' && curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts; git switch uploads-080
```

Expect:
- the same stage line, with server/dist rebuilt from deploy-080: 7 files, v3's server;
- the release command `0 written, 120 unchanged, 0 removed` (in `fly logs`);
- health `{"ok":true,…,"uploads":"closed",…}`. Health must say closed: if it doesn't, stop and report;
- `{"error":"uploads are not open yet"} -> 403`;
- the clone back on uploads-080.

If the call stopped after the probe, also clean up its uploads (above). The rollback's server was rehearsed: deploy-080's
tree, staged, with fly.toml's env and `-e BB_GHOST_UPLOADS=closed`, answers health closed, an unsigned POST with 403, and
the same page (RUN-local-u080.log, last section).

**If a step fails:** output-u080/CMD-U080-EXPECT.md says, step by step, whether a failure means roll back, clean up, or
fix these docs.

## 10. 0.8.1: the phone controls (a new page; its own L4)

**Done:** release v5, 2026-10-03 at about 17:21Z (LIVE-081). This section is kept as it ran, in the clone
beltbattles-v081/BeltBattles-v081 on release-081's tip 36fb391. Never run its call again.

0.8.1 ships the phone controls on the live server: REQ-BFG-034 to 037 and backlog 319, the build screen's touch rules
and bigger tap targets on phones. The operator's word, 2026-10-03 at about 16:2xZ: "Nah, just launch to fly when
ready."

**What ships.** Branch release-081 at its tip, in this clone: uploads-080 (20410e8, live as release v4), the nine
shoptap commits, the 0.8.1 label (1d47d41) and the release record (GAME_BUILD.txt and this section). Only the page
changes:
- The page is the 0.8.1 online page that GAME_BUILD.txt records (587,335 bytes, sha256 `49ad55a7e1d4f014…`). It is the
  shoptap page the Prime verified (VERIFIED-SHOPTAP-0.8.0.md, sha256 `868db52b50603c1d…`) byte for byte, except one
  run of bytes: the label `0.8.0` -> `0.8.1`.
- The server is v4's: server/dist built here is byte-identical to server/dist built at 20410e8, the seed pool included
  (output-v081/VERIFIED-081.md). No request path changes. fly.toml, the Dockerfile and .dockerignore are uploads-080's,
  so uploads stay open.
- RULES_VERSION stays bb-0.8.0 and the sim fingerprint stays 06bd515c6244ba0c, so live ghosts and uploads stay valid.
  The release command re-seeds the same pool (`0 written, 120 unchanged, 0 removed`) and touches no upload.

No probe runs: the server is v4's, which the uploads step probed (LIVE-U080), and every upload in the store now is a
player's.

**Working directory:** this clone, branch release-081 (see the header). The call refuses unless HEAD is the tip named
in output-v081/CMD-081.txt (beside this clone) and the tree is clean.

**The call.** output-v081/CMD-081.txt is exactly this, with `<TIP>` filled in (a commit can't name its own hash):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-v081/BeltBattles-v081 || exit 1; [ "$(git rev-parse --short=7 HEAD)" = <TIP> ] || { echo "refused: HEAD is $(git rev-parse --short=7 HEAD), not <TIP>"; exit 1; }; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-v081/ref/pages/BeltBattles-0.8.1-1d47d41ef7e4-online.html 2>&1 | tail -1 && fly releases -a beltbattles --image > ../output-v081/releases-before.txt 2>&1 && fly deploy --ha=false --remote-only 2>&1 | tee ../output-v081/run-deploy.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"uploads":"open"' && curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.1 online page (cmp)' && curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0' > ../output-v081/days.txt && cat ../output-v081/days.txt && [ "$(grep -c -- '-> 200$' ../output-v081/days.txt)" = 10 ] && curl -fsS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | grep -o '"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"[a-z]*","day":3,"wins":[01],"lives":[0-9]' && echo 'day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0' && curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts | grep -- '-> 401$' && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0' && fly releases -a beltbattles --image > ../output-v081/releases-after.txt 2>&1 && head -4 ../output-v081/releases-after.txt
```

In order, it:
1. sets `pipefail` and enters this clone;
2. refuses unless HEAD is `<TIP>` and the tree is clean;
3. stages the 0.8.1 online page from ../ref/pages/ (call 3), which also builds server/dist from the tip;
4. saves the release list with image refs to ../output-v081/releases-before.txt: what was live (v4);
5. deploys (call 4), keeping the whole log in ../output-v081/run-deploy.txt and showing its last 30 lines;
6. runs `fly status`;
7. reads health, which must say uploads are open, or the call stops. It is the first request after the update, so it
   also starts a machine the update left stopped; `--retry 3` covers that start;
8. compares the live page with the staged one;
9. asks for a match on each of days 1-10, as a new player with 0 wins and 5 lives: all ten must answer 200
   (../output-v081/days.txt);
10. asks for one match, day 3 with 1 win and 5 lives, as a new player: 200 with rules bb-0.8.0;
11. sends an unsigned POST, which must get 401 (uploads open; a signature is required);
12. lists the store on the machine (read only);
13. saves the release list again, to ../output-v081/releases-after.txt, and shows its first lines.

Every step after the guards is chained with `&&`, so the first failure stops the call.

**Expect, step by step** (the call's own text with Fly stubbed on 127.0.0.1: output-v081/RUN-cmd-sim-081.log):
- Steps 1-2: no output.
- Step 3: `stage: ../ref/pages/BeltBattles-0.8.1-1d47d41ef7e4-online.html -> deploy/public/index.html (587335 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
- Step 4: no output. Its file lists v4 (0.8.0, uploads open) as the newest release.
- Step 5: as in the uploads step (LIVE-U080): about 1.05 MB of context and no npm install; `release_command …
  completed successfully` (in `fly logs`, the seed reads `0 written, 120 unchanged, 0 removed`); the one machine
  updated; DNS verified; the app's URL.
- Step 6: exactly one `app` machine on the new version. It is `started` with its check `passing`, or `stopped` until
  the next request.
- Step 7: `{"ok":true,"rules":"bb-0.8.0","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`.
- Step 8: `live page = the staged 0.8.1 online page (cmp)`.
- Step 9: ten lines `…day=N… -> 200`, days 1-10.
- Step 10: `"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"…","day":3,"wins":…,"lives":…`, then
  `day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0`.
- Step 11: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
- Step 12: the list: the header, ten day rows, then `all 120 N P` (padded columns), for N uploads by P players since
  uploads opened.
- Step 13: the newest release first, on a new image; v4 below it.

**Rollback** (its own L4, after telling the operator). Back to v4 (0.8.0's page, the same server, uploads open):
deploy v4's image from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is
uploads-080's byte for byte, so v4's image runs as v4 did:

```sh
fly deploy --ha=false --remote-only --image <v4's IMAGE REF, from ../output-v081/releases-before.txt>
```

Then health must say `"uploads":"open"`, and the live page must be 0.8.0's (578,419 bytes). Closing uploads is still
section 9's rollback (deploy-080 with `-e BB_GHOST_UPLOADS=closed`), and it also takes the page back to 0.8.0's.

**If a step fails:** output-v081/CMD-081-EXPECT.md says, step by step, whether to roll back or to fix these docs.

## 11. 0.8.2: the title screen on phones (a new page; its own L4)

**Not run from this clone.** When 0.8.3 was cut, this call's L4 (esc_2edf070f-4fc) was still pending. The section is
kept as written in the clone beltbattles-r082/BeltBattles-r082 on release-082's tip 7669e36, and its call names that
clone and tip. 0.8.3 (section 12) is built on 7669e36 and ships this change too. If this call ran there first,
LIVE-082 records it. Never run it once section 12's call has run.

0.8.2 ships the title-screen fix on the live server: REQ-BFG-038, after the operator's "The intro screen's battle also
has the two carriers too close." On a phone held upright the title's demo battle now keeps clear water between its two
carriers, NEW RUN no longer sits on one on small phones, and no title button is smaller than before. The operator's
word, 2026-10-03 at about 16:2xZ: "Nah, just launch to fly when ready."

**What ships.** Branch release-082 at its tip, in this clone: release-081 (36fb391, live as release v5: 0.8.1), the
three intro commits (ddcbeb8, 74956d1, 86cada1, fetched from 30b1d668's verified release-082 bundle), the 0.8.2 label
(a9a9090) and the release record (GAME_BUILD.txt and this section). Only the page changes:
- The page is the 0.8.2 online page that GAME_BUILD.txt records (589,217 bytes, sha256 `3b6867b0b432be80…`). It is the intro
  page the Prime verified at 86cada1 (sha256 `2b53e49f266cd641…`) byte for byte, except one run of bytes: the label
  `0.8.1` -> `0.8.2` (kit/pagediff.mjs).
- The server is v5's: since 36fb391 no line changed under server/, src/sim or src/net, and fly.toml, the Dockerfile
  and .dockerignore are unchanged (uploads-080's), so uploads stay open. The call's stage step builds server/dist from
  the tip.
- RULES_VERSION stays bb-0.8.0 and the sim fingerprint stays 06bd515c6244ba0c, so live ghosts and uploads stay valid.
  The release command re-seeds the same pool (`0 written, 120 unchanged, 0 removed`) and touches no upload.

No probe runs: the server is the one the uploads step probed (LIVE-U080), and every upload in the store is a player's.

**Working directory:** this clone, branch release-082 (see the header). The call refuses unless HEAD is the tip named
in output-r082/CMD-082.txt (beside this clone) and the tree is clean.

**The call.** output-r082/CMD-082.txt is exactly this, with `<TIP>` filled in (a commit can't name its own hash):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r082/BeltBattles-r082 || exit 1; [ "$(git rev-parse --short=7 HEAD)" = <TIP> ] || { echo "refused: HEAD is $(git rev-parse --short=7 HEAD), not <TIP>"; exit 1; }; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r082/ref/pages/BeltBattles-0.8.2-a9a9090ca36b-online.html 2>&1 | tail -1 && fly releases -a beltbattles --image > ../output-r082/releases-before.txt 2>&1 && fly deploy --ha=false --remote-only 2>&1 | tee ../output-r082/run-deploy.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"uploads":"open"' && curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.2 online page (cmp)' && curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0' > ../output-r082/days.txt && cat ../output-r082/days.txt && [ "$(grep -c -- '-> 200$' ../output-r082/days.txt)" = 10 ] && curl -fsS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | grep -o '"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"[a-z]*","day":3,"wins":[01],"lives":[0-9]' && echo 'day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0' && curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts | grep -- '-> 401$' && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0' && fly releases -a beltbattles --image > ../output-r082/releases-after.txt 2>&1 && head -4 ../output-r082/releases-after.txt
```

In order, it:
1. sets `pipefail` and enters this clone;
2. refuses unless HEAD is `<TIP>` and the tree is clean;
3. stages the 0.8.2 online page from ../ref/pages/ (call 3), which also builds server/dist from the tip;
4. saves the release list with image refs to ../output-r082/releases-before.txt: what was live (v5);
5. deploys (call 4), keeping the whole log in ../output-r082/run-deploy.txt and showing its last 30 lines;
6. runs `fly status`;
7. reads health, which must say uploads are open, or the call stops. It is the first request after the update, so it
   also starts a machine the update left stopped; `--retry 3` covers that start;
8. compares the live page with the staged one;
9. asks for a match on each of days 1-10, as a new player with 0 wins and 5 lives: all ten must answer 200
   (../output-r082/days.txt);
10. asks for one match, day 3 with 1 win and 5 lives, as a new player: 200 with rules bb-0.8.0;
11. sends an unsigned POST, which must get 401 (uploads open; a signature is required);
12. lists the store on the machine (read only);
13. saves the release list again, to ../output-r082/releases-after.txt, and shows its first lines.

Every step after the guards is chained with `&&`, so the first failure stops the call.

**Expect, step by step** (the call's own text with Fly stubbed on 127.0.0.1: output-r082/RUN-cmd-sim-082.log):
- Steps 1-2: no output.
- Step 3: `stage: ../ref/pages/BeltBattles-0.8.2-a9a9090ca36b-online.html -> deploy/public/index.html (589217 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
- Step 4: no output. Its file lists v5 (0.8.1, uploads open) as the newest release.
- Step 5: as in 0.8.1 (LIVE-081): `release_command … completed successfully` (in `fly logs`, the seed reads
  `0 written, 120 unchanged, 0 removed`); the one machine updated; DNS verified; the app's URL.
- Step 6: exactly one `app` machine on the new version. It is `started` with its check `passing`, or `stopped` until
  the next request.
- Step 7: `{"ok":true,"rules":"bb-0.8.0","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`.
- Step 8: `live page = the staged 0.8.2 online page (cmp)`.
- Step 9: ten lines `…day=N… -> 200`, days 1-10.
- Step 10: `"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"…","day":3,"wins":…,"lives":…`, then
  `day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0`.
- Step 11: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
- Step 12: the list: the header, ten day rows, then `all 120 N P` (padded columns), for N uploads by P players since
  uploads opened.
- Step 13: the newest release first, on a new image; v5 below it.

**Rollback** (its own L4, after telling the operator). Back to v5 (0.8.1's page, the same server, uploads open):
deploy v5's image from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is
uploads-080's byte for byte, so v5's image runs as v5 did:

```sh
fly deploy --ha=false --remote-only --image <v5's IMAGE REF, from ../output-r082/releases-before.txt>
```

Then health must say `"uploads":"open"`, and the live page must be 0.8.1's (587,335 bytes). Section 10's rollback (v4's
image) takes the page back to 0.8.0's; closing uploads is still section 9's rollback.

**If a step fails:** output-r082/CMD-082-EXPECT.md says, step by step, whether to roll back or to fix these docs.

## 12. 0.8.3: a part's whole description on a phone tap (a new page; its own L4)

0.8.3 ships the tap fix on the live server: REQ-BFG-034 and REQ-BFG-035, after the operator's "tapping an item doesn't
open its description so I don't know what I'm buying on mobile. And tapping items on the board doesn't open it
either." and, on 0.8.1, "still not seeing the full description of the item on tap". A phone's browser never gives the
page the whole screen, so after a tap the part panel had almost no room. Now, after a finger's tap on a phone held
upright, the panel grows over its neighbour until its text fits, and a press on what it covers reaches the part
underneath. 0.8.3 is built on 0.8.2 (section 11), so it also ships the title-screen fix. The operator's word,
2026-10-03 at about 16:2xZ: "Nah, just launch to fly when ready."

**What ships.** Branch release-083 at its tip, in this clone: release-082 (7669e36: release-081 36fb391, live as release
v5, plus 0.8.2's three intro commits, its label and its release record), the four tap commits (899f728, fd22843, 4e52f3e, 5f79038, cherry-picked
from 30b1d668's verified release-tap: 5b71395, ae79068, 73cb2ec, f7db355, made on 86cada1), the 0.8.3 label
(462c29a) and the release record (GAME_BUILD.txt and this section). Only the page changes:
- The page is the 0.8.3 online page that GAME_BUILD.txt records (590,294 bytes, sha256 `de5e96fb357a2e34…`). It is the tap-fix
  page 30b1d668 verified at f7db355 (sha256 `d74df4a5d8f529c4…`) byte for byte, except one run of bytes: the label
  `0.8.1` -> `0.8.3` (kit/pagediff.mjs).
- The server is v5's: since 36fb391 no line changed under server/, src/sim or src/net, and fly.toml, the Dockerfile
  and .dockerignore are unchanged (uploads-080's), so uploads stay open. The call's stage step builds server/dist from
  the tip.
- RULES_VERSION stays bb-0.8.0 and the sim fingerprint stays 06bd515c6244ba0c, so live ghosts and uploads stay valid.
  The release command re-seeds the same pool (`0 written, 120 unchanged, 0 removed`) and touches no upload.

No probe runs: the server is the one the uploads step probed (LIVE-U080), and every upload in the store is a player's.

**Section 11.** 0.8.2's call (in beltbattles-r082, tip 7669e36) was still waiting for its L4 when this section was
written. Whether or not it ran first, this call ships the page above. Once this call has run, never run section 11's.

**Working directory:** this clone, branch release-083 (see the header). The call refuses unless HEAD is the tip named
in output-r083/CMD-083.txt (beside this clone) and the tree is clean.

**The call.** output-r083/CMD-083.txt is exactly this, with `<TIP>` filled in (a commit can't name its own hash):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r083/BeltBattles-r083 || exit 1; [ "$(git rev-parse --short=7 HEAD)" = <TIP> ] || { echo "refused: HEAD is $(git rev-parse --short=7 HEAD), not <TIP>"; exit 1; }; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r083/ref/pages/BeltBattles-0.8.3-462c29aa102e-online.html 2>&1 | tail -1 && fly releases -a beltbattles --image > ../output-r083/releases-before.txt 2>&1 && fly deploy --ha=false --remote-only 2>&1 | tee ../output-r083/run-deploy.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"uploads":"open"' && curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.3 online page (cmp)' && curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0' > ../output-r083/days.txt && cat ../output-r083/days.txt && [ "$(grep -c -- '-> 200$' ../output-r083/days.txt)" = 10 ] && curl -fsS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | grep -o '"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"[a-z]*","day":3,"wins":[01],"lives":[0-9]' && echo 'day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0' && curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts | grep -- '-> 401$' && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0' && fly releases -a beltbattles --image > ../output-r083/releases-after.txt 2>&1 && head -4 ../output-r083/releases-after.txt
```

In order, it:
1. sets `pipefail` and enters this clone;
2. refuses unless HEAD is `<TIP>` and the tree is clean;
3. stages the 0.8.3 online page from ../ref/pages/ (call 3), which also builds server/dist from the tip;
4. saves the release list with image refs to ../output-r083/releases-before.txt: what was live (v5, or 0.8.2's
   release if section 11 ran first);
5. deploys (call 4), keeping the whole log in ../output-r083/run-deploy.txt and showing its last 30 lines;
6. runs `fly status`;
7. reads health, which must say uploads are open, or the call stops. It is the first request after the update, so it
   also starts a machine the update left stopped; `--retry 3` covers that start;
8. compares the live page with the staged one;
9. asks for a match on each of days 1-10, as a new player with 0 wins and 5 lives: all ten must answer 200
   (../output-r083/days.txt);
10. asks for one match, day 3 with 1 win and 5 lives, as a new player: 200 with rules bb-0.8.0;
11. sends an unsigned POST, which must get 401 (uploads open; a signature is required);
12. lists the store on the machine (read only);
13. saves the release list again, to ../output-r083/releases-after.txt, and shows its first lines.

Every step after the guards is chained with `&&`, so the first failure stops the call.

**Expect, step by step** (the call's own text with Fly stubbed on 127.0.0.1: output-r083/RUN-cmd-sim-083.log):
- Steps 1-2: no output.
- Step 3: `stage: ../ref/pages/BeltBattles-0.8.3-462c29aa102e-online.html -> deploy/public/index.html (590294 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
- Step 4: no output. Its file lists the live release first: v5 (0.8.1, uploads open), or 0.8.2's if section 11 ran.
- Step 5: as in 0.8.1 (LIVE-081): `release_command … completed successfully` (in `fly logs`, the seed reads
  `0 written, 120 unchanged, 0 removed`); the one machine updated; DNS verified; the app's URL.
- Step 6: exactly one `app` machine on the new version. It is `started` with its check `passing`, or `stopped` until
  the next request.
- Step 7: `{"ok":true,"rules":"bb-0.8.0","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`.
- Step 8: `live page = the staged 0.8.3 online page (cmp)`.
- Step 9: ten lines `…day=N… -> 200`, days 1-10.
- Step 10: `"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"…","day":3,"wins":…,"lives":…`, then
  `day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0`.
- Step 11: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
- Step 12: the list: the header, ten day rows, then `all 120 N P` (padded columns), for N uploads by P players since
  uploads opened.
- Step 13: the newest release first, on a new image; the release that was live before it below.

**Rollback** (its own L4, after telling the operator). Back to the release that was live before this call, the newest
in ../output-r083/releases-before.txt: v5 (0.8.1's page), or 0.8.2's release if section 11 ran first. The server and
uploads are the same either way. Deploy that image from this clone. A deploy by image takes its env from this
directory's fly.toml, and this fly.toml is uploads-080's byte for byte, so the old image runs as it did:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in ../output-r083/releases-before.txt>
```

Then health must say `"uploads":"open"`, and the live page must be the old one: 0.8.1's (587,335 bytes) or 0.8.2's
(589,217 bytes). Section 10's rollback (v4's image) takes the page back to 0.8.0's; closing uploads is still section
9's rollback.

**If a step fails:** output-r083/CMD-083-EXPECT.md says, step by step, whether to roll back or to fix these docs.

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
