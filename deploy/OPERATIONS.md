# BeltBattles server operations: backups, a restore, deletions, the drill and alerts

For the operator. Written by S4 (REQ-BFG-120), 2026-10-26, for the ghost server at `https://beltbattles.fly.dev`. `deploy/RUNBOOK.md` is the deploy and release manual; it links here.

**How to read it.** Every step that touches Fly, Tigris, GitHub, a vendor account or money is marked **NEEDS YOUR GO-AHEAD** and says what it costs a month. Agents never run those steps: production is read only for them. Vendor facts were read on **2026-10-26** from the pages listed in section 9; where two pages disagree, or a page says nothing, this file says so. Nothing in here was run against the live service: the tool (`ghost-ops`) is tested on a fake S3 and on local servers, and the vendor commands are copied from the vendors' own docs. Your first run of each is its test.

## 0. The plan on one page

| # | Step | Needs your go-ahead | Cost a month | Time |
|---|---|---|---|---|
| 1 | Deploy the release that carries `ghost-ops` and `GET /v1/health/alerts` (the release lane asks you, as for any deploy) | yes | $0 | 10 min |
| 2 | Create a NEW bucket with snapshots on, and its keys (3.1) | yes | about $0 (a few cents at most) | 10 min |
| 3 | Copy the old bucket into it with `ghost-ops`, and verify (3.2) | yes | cents | 20 min |
| 4 | Switch the app to the new bucket by new secrets and a deploy (3.3) | yes | $0 | 15 min |
| 5 | A nightly Tigris snapshot (3.4), a Healthchecks.io heartbeat for it (7.2) | yes (GitHub secrets, a new account) | $0 on free tiers | 30 min |
| 6 | A weekly copy outside Fly and Tigris (3.5) | yes (a new account) | $0 on free tiers | 45 min |
| 7 | An outside monitor on `/v1/health/alerts` (7.1) | yes (a new account) | $0 on the free tier | 10 min |
| 8 | The restore drill (6), before the launch and every quarter | yes | cents | under 1 hour |

Do 1 to 5 in that order: snapshots only exist for a bucket created with them on, so there is no backup until step 5 has run once. Steps 6 and 7 can follow in any order. Do not launch to the stores before steps 5, 6 and 8 have each passed once.

**Targets.** Lose at most 24 hours of data (a nightly snapshot). Be serving again within 1 hour (section 4). Keep a weekly copy outside Fly and Tigris. The data that matters most is `profiles/<playerId>.json` (a player's saved progress); ghosts matter less (they never change once written, and the seed pool is rebuilt by every deploy).

## 1. What is in the bucket

One Tigris bucket (today `beltbattles-ghosts`) holds everything, as objects:

| Prefix | What | Notes |
|---|---|---|
| `profiles/<playerId>.json` | a player's saved progress, at most 2 KB | the most valuable data |
| `ghosts/<rules>/dDD/player/<id>.json` | player ghosts (one per dusk upload) | never rewritten once written |
| `ghosts/<rules>/dDD/pool/<id>.json` | the seed pool (192 ghosts) | every deploy rebuilds it (`seed`) |
| `players/`, `links/keys/`, `links/steam/`, `linkcodes/`, `tombstones/` | the identity keys IDENT-1 adds (not live yet) | `ghost-ops` copies any prefix with no change |

Size: about 1.1 KB per ghost, 15 MB a day per 1,000 daily players, 5.3 GB a year (LAUNCH-0 1.3). Nothing ever deletes a ghost today, so the bucket only grows.

## 2. The tool: `ghost-ops`

`ghost-ops` is a command-line tool built with the server (`npm run build:server` writes `server/dist/ghost-ops.mjs`; the image carries it as `/app/dist/ghost-ops.mjs`). It needs Node 20 or newer and nothing else. It reads the bucket from the same settings as the server:

```
BB_GHOST_STORE=tigris
AWS_ENDPOINT_URL_S3=https://fly.storage.tigris.dev
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
BUCKET_NAME=beltbattles-ghosts-v2
```

(`AWS_REGION` is optional; it defaults to `auto`, which is what Tigris wants. Fly's page names `https://fly.storage.tigris.dev` as the endpoint `fly storage create` sets, and `https://t3.storage.dev` as the canonical one.)

| Command | What it does |
|---|---|
| `snapshot --out <dir> [--prefix <p>] [--concurrency <n>]` | Copies the WHOLE bucket (or one prefix) to `<dir>/<UTC stamp>/objects/<key>` and writes `manifest.json` last: every object's key, size, sha256, last-modified and content type, plus counts per prefix. It writes into `<stamp>.partial` and renames it when complete, so a cut run never looks finished. Reads the bucket only. |
| `verify <dir> [--exact]` | Checks the snapshot's own files against its manifest first (a damaged snapshot fails before the bucket is read), then every manifest object against the bucket, byte for byte. Keys in the bucket that the snapshot lacks are listed by prefix; `--exact` makes them a failure too. Reads only. |
| `restore <dir> [--apply] [--force]` | A DRY RUN unless `--apply`. Writes the snapshot into the configured bucket: `profiles/` and the identity prefixes first, ghosts last, then runs `verify` (`--exact` if the bucket started empty). Refuses a bucket that is not empty unless `--force`, which skips objects that already match. Never deletes anything. |
| `tigris-snapshot [--name <n>]` | Takes a Tigris snapshot of the bucket (the request Tigris documents). One request. |
| `check-health <baseUrl>` | `GET <baseUrl>/v1/health/alerts`: one `OK` line, or one `ALERT` line per alert. Needs no bucket settings. |
| `drill <dir>` | The restore drill's checks against the configured (drill) bucket, in one command: PASS or FAIL with the time taken (section 6). |

**Exit codes** (the same as `ghost-admin`): `0` done; `1` a storage error, a difference or a short write (`check-health`: an alert, or the server cannot be reached); `2` a usage or settings error, nothing read or written. `ghost-ops --help` needs no settings.

**What it will not do.** It never deletes. It refuses a key that could leave the snapshot directory (an empty segment, `.`, `..`, a backslash, a NUL or a leading `/`): it names it, counts it and exits 1 at the end. It prints no access key, no secret key and no signature, and it shows a key under `profiles/`, `players/`, `links/`, `linkcodes/` or `tombstones/` as just its prefix, because those keys name a player.

**A snapshot directory is player data.** Its folders are mode 0700 and its files 0600. Keep it off shared drives and out of git and chat, and delete it when you are done. Keep your environment files (`~/bb-old.env`, `~/bb-new.env`, below) outside the repository, mode 600.

**Where to run it: not on the app's own machine.** The app runs on a 256 MB machine whose server already uses 100-200 MB; a second Node process there can get the server killed for lack of memory. Use your own computer, or a GitHub Actions job (3.4, 3.5). `fly ssh console` is fine for `--help` and `check-health`, nothing bigger.

To run it from your computer: `git clone` the repository at the release tag, then `npm ci && npm run build:server`; the files in `server/dist/` are standalone. To load an environment file in your shell: `set -a; . ~/bb-new.env; set +a`.

## 3. Backups

### 3.1 The new bucket with snapshots on, and its keys   (NEEDS YOUR GO-AHEAD)

Tigris takes snapshots only of a bucket made with snapshots on. The two vendors disagree about turning them on later: Fly's page says "Snapshots must be enabled when the bucket is created — they cannot be turned on later" and "Buckets created with `fly storage create` do not have snapshots enabled"; Tigris's own pages say an existing bucket can be switched in the dashboard (Bucket Settings, Storage Settings; the bucket must have no lifecycle or expiry rules) or with `tigris buckets enable-snapshots`. Nobody has tried it on this bucket, so the safe plan is a NEW bucket and a copy-in. `fly storage create` is the wrong tool here: it makes a bucket without snapshots and, run for an app, sets that app's secrets at once, which would point production at an empty bucket.

**Cost.** Tigris charges $0.02 per GB a month for storage, $0.005 per 1,000 writes and listings, $0.0005 per 1,000 reads, and nothing for data out; the first 5 GB, 10,000 writes and 100,000 reads a month are free on a Tigris account (pricing page, 2026-10-26; whether the free part applies to a bucket Fly bills is not stated). At launch size the bucket costs cents. Snapshots add nothing ("You only pay for new object versions stored. Snapshots themselves incur no extra charges"); a profile that is rewritten leaves its old version in each snapshot that held it, about 0.8 GB for 30 nightly snapshots at 1,000 daily players (my estimate from LAUNCH-0's 14 dusks a run), about $0.02.

1. Install the Tigris command line and sign in with your Fly account (Fly's page: "install the Tigris CLI and sign in with your Fly.io account"):
   ```
   npm install -g @tigrisdata/cli
   tigris login
   tigris buckets list          # should list the same buckets as: fly storage list
   ```
   (Other ways to install: `curl -fsSL https://get.t3.storage.dev/install.sh | sh`, or `brew install tigrisdata/tap/tigris`.)
2. Create the bucket:
   ```
   tigris buckets create beltbattles-ghosts-v2 --enable-snapshots
   ```
3. Make three access keys, each limited to one bucket. The secret is shown ONCE: put each straight into your password manager.
   ```
   tigris access-keys create bb-app-v2      --bucket beltbattles-ghosts-v2 --role Editor     # the app, the copy-in, the drill
   tigris access-keys create bb-backup-v2   --bucket beltbattles-ghosts-v2 --role ReadOnly   # the backup jobs (3.4, 3.5)
   tigris access-keys create bb-copyin-old  --bucket beltbattles-ghosts    --role ReadOnly   # reads the OLD bucket for the copy-in
   ```
   A `ReadOnly` key can read objects, list them and "create snapshots and forks" (Tigris, roles page), so the backup jobs never need a key that can write or delete. In the Tigris dashboard (`fly storage dashboard beltbattles-ghosts-v2`) turn **Default allowed operations** off for these keys, otherwise a standard key may create and list buckets without any role.
4. Write the two environment files (mode 600, outside the repository):
   ```
   ~/bb-old.env:  BB_GHOST_STORE=tigris  AWS_ENDPOINT_URL_S3=https://fly.storage.tigris.dev  AWS_ACCESS_KEY_ID=<bb-copyin-old id>  AWS_SECRET_ACCESS_KEY=<its secret>  BUCKET_NAME=beltbattles-ghosts
   ~/bb-new.env:  BB_GHOST_STORE=tigris  AWS_ENDPOINT_URL_S3=https://fly.storage.tigris.dev  AWS_ACCESS_KEY_ID=<bb-app-v2 id>      AWS_SECRET_ACCESS_KEY=<its secret>  BUCKET_NAME=beltbattles-ghosts-v2
   ```
   (one setting per line in the real files.)

### 3.2 The copy-in: old bucket to new bucket   (NEEDS YOUR GO-AHEAD)

**Cost.** Cents: about three reads and one write per object (10,000 objects: inside the free allowance).

1. Snapshot the OLD bucket to a folder on your computer, and check it:
   ```
   set -a; . ~/bb-old.env; set +a
   node server/dist/ghost-ops.mjs snapshot --out ~/bb-backups
   node server/dist/ghost-ops.mjs verify ~/bb-backups/<the new folder>
   ```
   Expect exit 0 from both. `verify` may list "in the bucket but not in the snapshot" if players wrote in between; that is not a failure without `--exact`.
2. Look before you write (a dry run: nothing is written, and it checks every file's sha256 first):
   ```
   set -a; . ~/bb-new.env; set +a
   node server/dist/ghost-ops.mjs restore ~/bb-backups/<the folder>
   ```
   It must say `would write N objects` and exit 0. If it says the bucket is not empty, the new bucket is not new: stop and ask.
3. Write it, and read the verdict:
   ```
   node server/dist/ghost-ops.mjs restore ~/bb-backups/<the folder> --apply
   ```
   It writes `profiles/` first and ghosts last, then runs `verify --exact` on the new bucket. Expect `restore OK` and exit 0. If it stops half way (a network error), run the same command again with `--force`: it skips what is already there.
4. On the day of the switch, repeat 1 and 3 once more just before step 3.3 (a second snapshot of the old bucket, then `restore ... --apply --force` into the new one): it writes only what is new since the first pass.
5. Check the new bucket against the old with the admin tool, as the drill does (6): the per-day counts must be equal.

### 3.3 The switch: new secrets, then a deploy   (NEEDS YOUR GO-AHEAD)

**Cost.** $0. The release command (`seed`) runs against the new bucket on this deploy and writes the seed pool into it.

1. Stage the new secrets (staged secrets change nothing until the next deploy; `--stage` is Fly's documented option):
   ```
   fly secrets set --stage -a beltbattles AWS_ACCESS_KEY_ID=<bb-app-v2 id> AWS_SECRET_ACCESS_KEY=<its secret> BUCKET_NAME=beltbattles-ghosts-v2
   ```
   `AWS_ENDPOINT_URL_S3` stays as it is. Fly cannot show secrets back to you, so keep the old values in your password manager for the rollback.
2. Do the final delta copy of 3.2 step 4.
3. Deploy as `deploy/RUNBOOK.md` says (`node deploy/stage.mjs <game.html>`, then `fly deploy`). The deploy restarts the machine on the new bucket.
4. Check, read only: `curl -s https://beltbattles.fly.dev/v1/health` shows `"store":"tigris"`; `node server/dist/ghost-ops.mjs check-health https://beltbattles.fly.dev` prints `OK`; and with the new environment loaded (`set -a; . ~/bb-new.env; set +a`) `node server/dist/ghost-admin.mjs list --rules bb-0.12.0` shows the counts you saw in step 3.2.5.

What a player can lose in the switch: the uploads and profile writes of the minutes between the final delta copy and the new machine starting. A lost ghost is one fewer foe. A lost profile write is re-sent with the player's next dusk (each upload is a device's whole profile).

**Rollback.** Stage the OLD secret values again (`fly secrets set --stage ...`) and deploy. The old bucket still holds everything up to the switch, so keep it for at least a week (do not delete it until step 3.4 has run for a week). Anything written to the new bucket since the switch is not in the old one: copy it back first with `ghost-ops snapshot` of the new bucket and `restore --apply --force` into the old.

### 3.4 The nightly snapshot, kept 30 days   (NEEDS YOUR GO-AHEAD)

A Tigris snapshot is a point-in-time view of the whole bucket, taken in one request and costing nothing extra. A restore is a fork of a snapshot into a new bucket (section 4); there is no in-place restore.

**How to take one.** Either of these makes one snapshot:
```
node server/dist/ghost-ops.mjs tigris-snapshot --name nightly-20261101       # ghost-ops, any machine with the read-only key
tigris snapshots take beltbattles-ghosts-v2 nightly-20261101                  # the Tigris CLI (one page of its docs shows a --name flag instead of the second word: tigris snapshots take --help says which)
```
List them with `tigris snapshots list beltbattles-ghosts-v2`. A snapshot's version is a Unix time in nanoseconds (the Tigris docs' example is `1751631910196672425`), so a version is older than 30 days when it is smaller than `$(date -d '30 days ago' +%s)000000000` (on a Mac: `$(date -v-30d +%s)000000000`).

**Where it runs, with costs.**

- **A GitHub Actions job (recommended).** Needs no Fly machine, and the free minutes cover it: GitHub gives a Free-plan account 2,000 minutes a month for private repositories (docs, 2026-10-26); this job uses about 2 minutes a night, 60 a month ($0.006 a minute on Linux if you ever went over). Scheduled jobs run on the default branch, in UTC, can be delayed (most at the start of an hour, so use an odd minute), and the shortest interval is 5 minutes. GitHub disables scheduled workflows of PUBLIC repositories after 60 days without activity; for private repositories the docs say nothing, so the heartbeat below is what tells you. Save as `.github/workflows/backup-nightly.yml`:
  ```yaml
  name: backup-nightly
  on:
    schedule:
      - cron: "17 3 * * *"        # 03:17 UTC every day
    workflow_dispatch: {}          # a button for the first test run
  jobs:
    snapshot:
      runs-on: ubuntu-latest
      timeout-minutes: 15
      steps:
        - uses: actions/checkout@v4          # use the newest major version GitHub offers
        - uses: actions/setup-node@v4
          with: { node-version: 22 }
        - run: npm ci && npm run build:server
        - name: Take the Tigris snapshot
          env:
            BB_GHOST_STORE: tigris
            AWS_ENDPOINT_URL_S3: https://fly.storage.tigris.dev
            AWS_ACCESS_KEY_ID: ${{ secrets.TIGRIS_BACKUP_KEY_ID }}
            AWS_SECRET_ACCESS_KEY: ${{ secrets.TIGRIS_BACKUP_KEY_SECRET }}
            BUCKET_NAME: beltbattles-ghosts-v2
          run: node server/dist/ghost-ops.mjs tigris-snapshot --name "nightly-$(date -u +%Y%m%d)"
        - name: Heartbeat (it ran)
          if: success()
          run: curl -fsS -m 10 --retry 3 "https://hc-ping.com/${{ secrets.HC_NIGHTLY_UUID }}"
        - name: Heartbeat (it failed)
          if: failure()
          run: curl -fsS -m 10 --retry 3 "https://hc-ping.com/${{ secrets.HC_NIGHTLY_UUID }}/fail"
  ```
  The three secrets (`TIGRIS_BACKUP_KEY_ID`, `TIGRIS_BACKUP_KEY_SECRET` from `bb-backup-v2`, and `HC_NIGHTLY_UUID` from 7.2) go in the repository's Settings, Secrets and variables, Actions. GitHub never shows them back to you. This file is a starting point: it has not been run. Press the button once and watch it pass.
- **A Fly scheduled machine (the alternative).** `fly machine run <image> --schedule daily ...` starts a machine on a fuzzy daily cycle. Fly documents no way to pick the time of day (it follows from when the machine was created), and the app's secrets reach every machine of the app. It costs about $0.03 a month ($0.0030 an hour for a 256 MB shared machine while it runs, about a minute a day, plus $0.15 per GB a month for the root disk of a stopped machine). It needs the app's image tag and a separate care when the app is redeployed, which is why the GitHub job is the recommendation. Not tried.

**How old snapshots go.** Tigris documents no retention period and no expiry for snapshots, and says "Object expiration is not supported on snapshot-enabled buckets". Assume a snapshot stays until it is deleted (or its bucket is). So "kept 30 days" is YOUR monthly chore (put it in your calendar, first Monday of the month, 5 minutes):
```
tigris snapshots list beltbattles-ghosts-v2
tigris snapshots delete beltbattles-ghosts-v2 <version>,<version>,... --yes
```
Deleting a snapshot is permanent and does not touch forks already made from it. Run these with your own `tigris login` on your own computer; never put a key that can delete into the nightly job (the docs do not say which key role may delete a snapshot). If you forget the chore, nothing breaks; the bucket just keeps more history, and section 5 tells you what that means for deleted players.

### 3.5 The weekly copy outside Fly and Tigris   (NEEDS YOUR GO-AHEAD, new account)

A snapshot lives inside Tigris. If the Tigris account were lost or locked, it would go with the bucket. So once a week `ghost-ops snapshot` makes a full copy that goes to a store at another company. The copy is player data: encrypt it before it leaves GitHub's runner, and keep the passphrase in your password manager (not only in GitHub).

Options, with costs at launch size (under 1 GB per copy; prices from the vendors' pages, 2026-10-26). Any new account waits for you.

| Option | Cost | Notes |
|---|---|---|
| **Backblaze B2** | the first 10 GB free; then $6.95 per TB a month (from 2026-05-01); calls free; 3x free egress | S3-compatible endpoint `https://s3.<region>.backblazeb2.com`. An application key can be limited to one bucket (Read and Write, Read Only or Write Only). `rclone` is documented to work; Backblaze's own page does not document `aws s3 sync`. |
| **Cloudflare R2** | the first 10 GB a month free; then $0.015 per GB a month; 1 million writes and 10 million reads free; no egress fee | endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. A token can be limited to buckets (Object Read and Write). For object-level tokens rclone needs `no_check_bucket = true`. |
| **Your own computer or a disk** | $0 | run `ghost-ops snapshot --out /your/disk/bb` yourself each week (5 minutes). The only option with no new account, and the one that fails by being forgotten. |

Keep the last 5 weekly copies (35 days), so the oldest copy is never older than 35 days; section 5 uses that number.

A GitHub job for it (B2 shown; a starting point, not run). Save as `.github/workflows/backup-weekly.yml`:
```yaml
name: backup-weekly
on:
  schedule:
    - cron: "41 4 * * 0"          # Sundays 04:41 UTC
  workflow_dispatch: {}
jobs:
  offsite:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build:server
      - name: Snapshot the bucket
        env:
          BB_GHOST_STORE: tigris
          AWS_ENDPOINT_URL_S3: https://fly.storage.tigris.dev
          AWS_ACCESS_KEY_ID: ${{ secrets.TIGRIS_BACKUP_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.TIGRIS_BACKUP_KEY_SECRET }}
          BUCKET_NAME: beltbattles-ghosts-v2
        run: |
          node server/dist/ghost-ops.mjs snapshot --out "$RUNNER_TEMP/bb"
          node server/dist/ghost-ops.mjs verify "$RUNNER_TEMP/bb"/*
      - name: Encrypt and copy off-site
        env:
          RCLONE_CONFIG_OFFSITE_TYPE: b2
          RCLONE_CONFIG_OFFSITE_ACCOUNT: ${{ secrets.OFFSITE_KEY_ID }}
          RCLONE_CONFIG_OFFSITE_KEY: ${{ secrets.OFFSITE_KEY }}
          OFFSITE_PASSPHRASE: ${{ secrets.OFFSITE_PASSPHRASE }}
        run: |
          sudo apt-get update -y && sudo apt-get install -y rclone
          stamp=$(date -u +%Y%m%d)
          tar -C "$RUNNER_TEMP" -cf "$RUNNER_TEMP/bb-$stamp.tar" bb
          printf %s "$OFFSITE_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --symmetric --cipher-algo AES256 -o "$RUNNER_TEMP/bb-$stamp.tar.gpg" "$RUNNER_TEMP/bb-$stamp.tar"
          rclone copyto "$RUNNER_TEMP/bb-$stamp.tar.gpg" "offsite:<your-b2-bucket>/weekly/bb-$stamp.tar.gpg"
          rclone delete "offsite:<your-b2-bucket>/weekly" --min-age 35d
      - name: Heartbeat (it ran)
        if: success()
        run: curl -fsS -m 10 --retry 3 "https://hc-ping.com/${{ secrets.HC_WEEKLY_UUID }}"
      - name: Heartbeat (it failed)
        if: failure()
        run: curl -fsS -m 10 --retry 3 "https://hc-ping.com/${{ secrets.HC_WEEKLY_UUID }}/fail"
```
Cost: about 5 minutes of runner a week (20 a month, free). To read a weekly copy back (section 4, route B): `rclone copyto offsite:<bucket>/weekly/bb-<stamp>.tar.gpg ./x.gpg`, then `gpg -d x.gpg | tar -x`, which gives a `bb/<stamp>/` snapshot folder. Two cautions: Backblaze B2 keeps old file versions unless the bucket's lifecycle setting says "keep only the last version", so a deleted copy may still be there (check that setting, so that "35 days" is true); and the passphrase is the only way back into the copies, so it lives in your password manager as well as in GitHub.

### 3.6 A key that cannot write   (part of 3.1, NEEDS YOUR GO-AHEAD)

Tigris supports it: an access key has a role mapped to one bucket, and `ReadOnly` ("Read objects and bucket metadata, list objects, and create snapshots and forks"). Use `bb-backup-v2` for every backup job, so a leaked GitHub secret can read player data but never change or delete it. The key the app uses (`bb-app-v2`) is the only one that can write. If a backup key leaks: delete it in the dashboard (`fly storage dashboard beltbattles-ghosts-v2`, Access Keys) and make a new one; nothing else changes.

## 4. A restore: back within 1 hour

**Decide first.** Is the bucket gone or damaged, or is it the code? A bad deploy is rolled back by deploying the previous tree (`deploy/RUNBOOK.md`); no data needs restoring for that. The steps below are for lost, wiped or corrupted data.

**What is lost.** Route A loses everything written since the newest nightly snapshot: up to 24 hours, which is the target. Route B loses everything since the newest weekly copy: up to 7 days. Use route B only when route A is not possible (for example the Tigris account itself is gone).

**Route A: fork the newest snapshot   (NEEDS YOUR GO-AHEAD)**  — about 30 minutes. **Cost:** cents; a fork is free until it is written to ("you only pay for new object versions written to forks"), and the new bucket is billed as any bucket ($0.02 per GB a month). The old bucket costs the same until you delete it.
1. `tigris snapshots list beltbattles-ghosts-v2` and take the newest version, `<version>`. Check it is under 26 hours old (the heartbeat in 7.2 would have told you).
2. Fork it into a NEW bucket; a fork is an instant, copy-on-write copy and an old snapshot is never changed:
   ```
   tigris buckets create beltbattles-ghosts-v3 --fork-of beltbattles-ghosts-v2 --source-snapshot <version>
   ```
   (Tigris: "We recommend out-of-place recovery: fork from the desired snapshot and use the new bucket." The source bucket cannot be deleted while forks depend on it.)
3. Make the app's key for it: `tigris access-keys create bb-app-v3 --bucket beltbattles-ghosts-v3 --role Editor`, and a read-only one for the jobs (`bb-backup-v3`).
4. Check it (read only), with the new bucket's environment loaded (`set -a; . ~/bb-new.env; set +a`, pointing at `beltbattles-ghosts-v3`): `node server/dist/ghost-admin.mjs list --rules bb-0.12.0` must show counts that look like yesterday's, and `node server/dist/ghost-admin.mjs revalidate --rules bb-0.12.0` (a dry run) must have 0 records to delete.
5. Switch by secrets and a deploy, exactly as 3.3 (with `beltbattles-ghosts-v3` and the new keys). Then change the jobs' secrets (3.4, 3.5) to the new bucket and the new `bb-backup-v3` key, and take a first snapshot of the new bucket by hand (`tigris-snapshot`): a fork starts with the old snapshots behind it, but the nightly job must now name the new bucket.
6. Do section 5 (deletions) before you announce anything.

**Route B: restore a `ghost-ops` copy into a new bucket   (NEEDS YOUR GO-AHEAD)**  — about 45 minutes, more for a big bucket. **Cost:** cents (one write per object, then a few reads for the check; B2 and R2 charge nothing to read your own copy out under their free egress).
1. Get the newest weekly copy (3.5) or any `ghost-ops` snapshot folder you hold. Decrypt and unpack it.
2. Make a new bucket with snapshots on and its keys (3.1 steps 2 and 3; call it `beltbattles-ghosts-v3`).
3. With the new bucket's environment: `ghost-ops restore <folder>` (the dry run: it checks every file and says what it would write), then `ghost-ops restore <folder> --apply`. It prints its own `verify --exact` and the time it took. Rough speed to plan with: our test restored 216 objects in 0.2 s on a local fake; on Tigris expect tens of milliseconds a PUT with 8 at a time, so 10,000 objects take a few minutes and 100,000 about 15 to 30.
4. Switch (3.3), then section 5.

**The one-hour budget.** Decide and create the bucket 10 minutes; fork or restore 15 to 30; check 5; switch by deploy 10 (the release command seeds the pool); section 5 and the first look at `/v1/health` 10. If route A takes more than an hour, something other than the plan is wrong: stop and ask.

## 5. Deletions: what a restore brings back

A restore can bring back a player who asked to be deleted AFTER the snapshot. Re-apply those deletions before the restored service is announced.

1. **Players who asked by email** (the privacy contact): for every request newer than the snapshot, remove their ghosts and their profile. Run the admin tool from your computer with the restored bucket's Editor environment loaded (`set -a; . ~/bb-new.env; set +a`), not on the app's machine:
   ```
   node server/dist/ghost-admin.mjs remove-player <playerId> --rules bb-0.12.0            # a dry run: look at it
   node server/dist/ghost-admin.mjs remove-player <playerId> --rules bb-0.12.0 --apply
   ```
   `remove-player` removes the player's uploads for one rules version; it does not remove `profiles/<playerId>.json` (LAUNCH-0 1.9). Delete that object too: `tigris rm t3://<bucket>/profiles/<playerId>.json` (check `tigris rm --help`), then ask the server to forget it by waiting 10 minutes (its bucket cache) or restarting the machine. Do the same for every rules version that still holds their ghosts.
2. **After IDENT-1 ships** (a player deletes inside the app; the server writes `tombstones/<playerId>.json`): the tombstones that existed at the snapshot come back with it, and `ghost-admin purge-tombstoned` (a dry run first, then `--apply`) removes the ghosts of every tombstoned player in every rules version. The deletions made AFTER the snapshot are the gap: if the old bucket is still readable, copy its newer tombstones over before you run it:
   ```
   (old bucket environment)  node server/dist/ghost-ops.mjs snapshot --out ~/bb-tombs --prefix tombstones/
   (new bucket environment)  node server/dist/ghost-ops.mjs restore ~/bb-tombs/<folder> --apply --force
   ```
   (`--force` writes only the tombstones the new bucket lacks and never deletes.) If the old bucket is gone, those players must delete again; say so on your support page.
3. **How long deleted data can live on in backups**, for the store privacy text. A deleted player's data leaves the live service at once, but stays in every backup made before the deletion. With this plan: in Tigris snapshots until you delete them (30 days if the monthly chore is done on time; Tigris sets no expiry of its own, and a deleted live object stays in each snapshot that held it), and in the weekly off-site copies for 35 days. So the honest sentence is: *"Data you delete is removed from the live service immediately and from our backups within 35 days."* If a regulator or a player needs it gone sooner, delete the snapshots and the off-site copies that hold it (`tigris snapshots delete ...`, `rclone delete ...`); that costs the backups.

## 6. The restore drill: every quarter, under 1 hour   (NEEDS YOUR GO-AHEAD)

Run it once before the launch and then every quarter (first week of January, April, July, October). **Cost:** cents (a fork is free; the reads are a few times the object count; the drill bucket lives under an hour). Run it at a quiet hour, so that few players write while it runs. Write the result in the table at the end.

Prepare once: the production environment file `~/bb-prod.env` (the read-only key `bb-backup-v2` and `BUCKET_NAME=beltbattles-ghosts-v2`), and `~/bb-drill.env` for the drill bucket (made in step 3).

1. Note the time: `date -u`.
2. A fresh snapshot, so that the drill rehearses the newest one (a real restore uses last night's: the only difference is how much is lost):
   ```
   set -a; . ~/bb-prod.env; set +a
   node server/dist/ghost-ops.mjs tigris-snapshot --name drill-$(date -u +%Y%m%d)
   tigris snapshots list beltbattles-ghosts-v2          # note the version of drill-...
   ```
3. Fork it into the drill bucket and make a key (`Editor`, because step 6's probe uploads):
   ```
   tigris buckets create beltbattles-ghosts-drill --fork-of beltbattles-ghosts-v2 --source-snapshot <version>
   tigris access-keys create bb-drill --bucket beltbattles-ghosts-drill --role Editor
   ```
   Put the key in `~/bb-drill.env` (same layout as 3.1 step 4, `BUCKET_NAME=beltbattles-ghosts-drill`). Note how long the fork took.
4. A `ghost-ops` copy of production, taken straight after the fork (the thing to compare with):
   ```
   set -a; . ~/bb-prod.env; set +a
   node server/dist/ghost-ops.mjs snapshot --out ~/bb-drill
   ```
5. The checks, in one command, against the drill bucket:
   ```
   set -a; . ~/bb-drill.env; set +a
   node server/dist/ghost-ops.mjs drill ~/bb-drill/<the folder>
   ```
   It runs `verify --exact` (every object present with the same bytes, nothing extra), compares the per-(rules, day) ghost counts with the snapshot's, and runs the `revalidate` dry run, which must delete 0 records. It prints `drill PASS` or `drill FAIL` and the time taken. If a handful of objects differ because players wrote during the drill, run steps 4 and 5 again; a failure that repeats is real.
   The same checks by hand, if you want to see them: `ghost-ops verify <folder> --exact`; `node server/dist/ghost-admin.mjs list --rules bb-0.12.0` once with each environment (the counts equal); `node server/dist/ghost-admin.mjs revalidate --rules bb-0.12.0` (a dry run, 0 to delete).
6. (Still with the drill environment) the server and its probe:
   ```
   BB_GHOST_UPLOADS=open BB_GHOST_PORT=7790 node server/dist/ghost-server.mjs &
   : > ~/probe-id.txt
   node server/dist/ghost-probe.mjs http://127.0.0.1:7790 ~/probe-id.txt
   ```
   Every row must pass (exit 0). Stop the server (`kill %1`). The probe leaves its four test decks in the drill bucket; the next step deletes the bucket.
7. Clean up, which also proves you can: 
   ```
   tigris buckets delete beltbattles-ghosts-drill      # if it says the bucket is not empty: tigris rm t3://beltbattles-ghosts-drill -f (check --help)
   tigris snapshots delete beltbattles-ghosts-v2 <the drill version> --yes
   ```
   then delete the `bb-drill` key in the dashboard (`fly storage dashboard beltbattles-ghosts-v2`, Access Keys), and delete `~/bb-drill` and `~/probe-id.txt` (player data).
8. Note the time again. **Pass:** the drill says PASS, the probe is green, and the whole thing took under an hour.

| Date | Operator | Objects | Fork took | `drill` | Probe | Total | Pass? |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

For scale: the automated test of this drill (216 objects, filled through the real server, on a fake bucket on this computer) takes 0.12 s to snapshot, 0.18 s to restore and verify, and 0.08 s to verify again. Tigris is slower per object (tens of milliseconds a request); your first run's figures are the real ones.

## 7. Alerts

Fly's own check (`GET /v1/health` every 30 s) stays exactly as it is: it takes a failing machine out of routing, but it never restarts it and never tells anyone. **Do not point Fly's check at `/v1/health/alerts`**: a failing Fly check takes the only machine out of routing.

The server now also answers `GET /v1/health/alerts` (and `HEAD`): `200 {"status":"ok",...}` when everything is quiet, and `503 {"status":"alert","alerts":[{"rule":"...","detail":"..."}]}` with the reasons otherwise. It reads memory only (it never touches storage or waits for the deck-check worker) and its text holds numbers and rule names, never an address, a key or a player id. Outside monitors need only the status code.

### 7.1 An uptime monitor on `/v1/health/alerts`   (NEEDS YOUR GO-AHEAD, new account)

UptimeRobot, the free plan (their pricing page, 2026-10-26): 50 monitors at a 5-minute interval, alerts by one email address plus a few integrations (Discord, Pushover and others) and mobile push; SMS costs credits. Its HTTP monitors send a `HEAD` request and retry with `GET`; the route answers both. **Cost:** $0. **Check before you rely on it:** UptimeRobot's Terms say it "is available for any use, including commercial and business use", but its pricing page labels the free plan "good for hobby and non-profit projects". Read the Terms yourself; if you want certainty, the paid plan is the safe choice, and Better Stack's free tier (10 monitors and heartbeats, 3-minute checks) is the alternative (its page says "free for personal projects"; commercial use is not stated).

1. New monitor, type HTTP(s), URL `https://beltbattles.fly.dev/v1/health/alerts`, interval 5 minutes, alert contact your email (and the phone app).
2. It is "up" on 200 and "down" on a 503 or no answer. A 503 means a rule fired, and the monitor says "down", not why: run `node server/dist/ghost-ops.mjs check-health https://beltbattles.fly.dev` (or open the URL in a browser) for the `ALERT` lines.

**A cost you will notice.** Today the machine stops when idle (`auto_stop_machines`). A monitor that asks every 5 minutes wakes it, so the machine will run all month: $2.19 for the 256 MB machine (LAUNCH-0 1.5). The launch deploy (S5) makes the machine always-on anyway, so plan for it. The first answer after a sleep takes 3 to 5 seconds (LAUNCH-0 measured 3.4 to 5.2 s).

### 7.2 Heartbeats for the backup jobs   (NEEDS YOUR GO-AHEAD, new account)

Healthchecks.io, the free "Hobbyist" plan (2026-10-26): 20 checks, unlimited team size, alerts by email, Slack, Telegram, Discord, Signal and more. A job reports with `https://hc-ping.com/<uuid>` (success) or `.../fail`; a check that gets no success inside its period plus grace is "down" and alerts. **Cost:** $0. **Check before you rely on it:** its About page says "free for hobby use, for open source projects, and for non-profits" and does not grant commercial use in words; read their terms or take a paid plan.

Make two checks: **backup-nightly** with period 1 day and grace 2 hours (it alerts when the nightly snapshot has not reported for 26 hours), and **backup-weekly** with period 7 days and grace 1 day. Copy each check's UUID into the repository secrets `HC_NIGHTLY_UUID` and `HC_WEEKLY_UUID`. The jobs in 3.4 and 3.5 already call them.

### 7.3 Fly's bill: there is no alert

LAUNCH-0 asked for a Fly spend alert at twice the expected bill. **Fly's docs say it does not exist**: "We don't support billing alerts (yet), so budget accordingly." (docs.fly.io, cost management, 2026-10-26). So instead: put a recurring reminder in your calendar (weekly for the first month, then monthly) to open the Fly dashboard and read **Current month to date**. The bill grows mainly in three ways: more or bigger machines (fixed by `fly.toml`), outbound data ($0.02 per GB; the game page is 1 MB a load, and `BB_GHOST_RATE`'s 120 requests a minute per address is what caps it), and Tigris requests (the `cache.evictedByCeiling` alert below is the early sign). Expected: about $2.19 a month for the machine today, $3.69 after the launch deploy (LAUNCH-0 1.5), plus cents of Tigris.

### 7.4 What each alert means, and the first thing to do

Every rule is read from the sampled `/v1/health` numbers (the answer's `samples` field says how many it holds: one every 10 seconds, up to an hour). An alert clears by itself when its window has passed. (S3 is the abuse-limits release and S5 the planned launch deploy, a 512 MB always-on machine; `docs/ASYNC.md` describes S3's limits.) The settings are env names; set one with `fly secrets set -a beltbattles NAME=value` (this restarts the machine). To silence a rule that cries wolf until a fix is deployed: `BB_ALERT_DISABLE=rss-high` (a comma-separated list).

| Rule | Fires when | Means | First thing to do |
|---|---|---|---|
| `worker-not-ready` | the deck-check worker is not `ready` for 30 s, once the process is 60 s old | Uploads get 503; matches and the page still work. Fly's check cannot see this. | `fly logs -a beltbattles` for `deck check worker` lines; `fly machine restart <id> -a beltbattles` (go-ahead); if it follows a deploy, roll back. |
| `worker-restarts` | `validator.restarts` rose in the last 15 min | The worker crashed, ran out of memory, or a check passed its 10 s deadline. | `fly logs` around the time; if memory, see `rss-high`; one restart after a deploy is normal, a rising count is not. |
| `check-timeouts` | `validator.timeouts` or `validator.queueFull` rose in the last 5 min | Checks are too slow or the queue (16) is full: an attack, a slow CPU, or too many players. | `GET /v1/health`: look at `limits` (is one client flooding?) and `validator`; if it is honest traffic, the machine is too small (S5). |
| `queue-depth` | `validator.queueDepth` over 8 in every sample for 2 min | The worker cannot keep up. | As `check-timeouts`. |
| `rss-high` | `memory.rssMb` over 80% of the machine's memory for 1 min | An out-of-memory kill is near; it restarts the server. | `GET /v1/health`: compare `cache.playerGhosts` with `cache.ceiling`; lower `BB_GHOST_CACHE_MAX` or move to the 512 MB machine (S5). |
| `heap-high` | `memory.heapUsedMb` over 60% of `memory.heapLimitMb` for 1 min | The same, seen from the heap. | As `rss-high`. |
| `cache-too-small` | `cache.evictedByCeiling` rose by more than one ceiling (6,000) in an hour, or the ghost cache sat full for an hour while over a sixth of a ceiling was dropped | The ghost cache is churning: matching still works but fetches more from Tigris (cost and delay). Not urgent. | Plan the bigger machine (`BB_GHOST_CACHE_MAX=30000` with `NODE_OPTIONS=--max-old-space-size=300`, S5) or the prune tool. |
| `abuse-refusals` | S3's abuse limits (`keyInflight`, `ipInflight`, `keyBudget`, `ipBudget`, `newKeys`) refused over 30 requests in 15 min | A client is asking for too much, or a big carrier address is hitting a limit. | `GET /v1/health`: which of `limits` is rising; one address is handled by the limit itself; a school or carrier address may need a higher limit (see `docs/ASYNC.md`, S3). |
| `server-errors` | 5xx answers over 1% of the last 5 min's requests (at least 20 requests and 3 errors) | Something is failing for players. | `GET /v1/health` `errors.byRoute` says which route; `fly logs`. |
| `storage-errors` | `errors.storage` rose in the last 5 min | Tigris did not answer or refused the server (after its own retries): uploads and profile writes fail with 503. | Tigris and Fly status pages; `fly logs` for `s3 ...` lines; if only after a secrets change, the key or bucket name is wrong. |

**On an honest day none of them fires.** At idle on the 256 MB machine the server holds RSS about 104 MB, heap about 7 MB of 144 MB, a ready worker, an empty queue and nothing refused. Under S3's honest load (a bucket load pushes RSS to 193-198 MB for a few seconds; a full cache keeps heap near 64 MB) every rule stays quiet: each "for a minute" rule needs the number to hold for the whole minute, and the heap rule is set at 60% of 144 MB (86 MB), above anything measured and below the 96 MB at which the runtime stops. `tests/s4.alerts.test.ts` and `tests/s4.health.test.ts` replay those numbers.

The one honest case that does alert: a cold deep deck check on a machine whose CPU has run out of burst time can pass its 10-second deadline (`check-timeouts`). That is a real fault, because the player's upload failed.

### 7.5 The settings (all optional; the defaults are what the table above says)

| Setting | Default | What it changes |
|---|---|---|
| `BB_ALERT_SAMPLE_S` | 10 | seconds between samples (the ring holds an hour: 362 samples at 10 s) |
| `BB_ALERT_DISABLE` | none | rules to switch off, comma-separated |
| `BB_ALERT_MEM_MB` | the machine's memory as the OS reports it (about 215 MB on the 256 MB machine) | what `rss-high` takes 80% of |
| `BB_ALERT_BOOT_GRACE_S`, `BB_ALERT_WORKER_DOWN_S` | 60, 30 | `worker-not-ready`: the process age before it can fire, and how long the worker must be not ready |
| `BB_ALERT_RESTARTS_WINDOW_S`, `BB_ALERT_CHECK_FAIL_WINDOW_S` | 900, 300 | the windows of `worker-restarts` and `check-timeouts` |
| `BB_ALERT_QUEUE_DEPTH`, `BB_ALERT_QUEUE_FOR_S` | 8, 120 | `queue-depth` |
| `BB_ALERT_RSS_PCT`, `BB_ALERT_RSS_FOR_S` | 80, 60 | `rss-high` |
| `BB_ALERT_HEAP_PCT`, `BB_ALERT_HEAP_FOR_S` | 60, 60 | `heap-high` (set `BB_ALERT_HEAP_PCT=70` for the brief's 70%: with the 96 MB limit the runtime stops at 67% of the 144 MB the server reports, so 70% can only fire as it crashes) |
| `BB_ALERT_EVICT_PER_HOUR`, `BB_ALERT_EVICT_WINDOW_S` | one ceiling (`cache.ceiling`), 3600 | `cache-too-small`, first arm |
| `BB_ALERT_CEILING_HOLD_S`, `BB_ALERT_CEILING_HOLD_EVICT` | 3600, a sixth of the ceiling | `cache-too-small`, second arm |
| `BB_ALERT_ABUSE_RISE`, `BB_ALERT_ABUSE_WINDOW_S` | 30, 900 | `abuse-refusals` |
| `BB_ALERT_5XX_PCT`, `BB_ALERT_5XX_WINDOW_S`, `BB_ALERT_5XX_MIN_REQUESTS`, `BB_ALERT_5XX_MIN_ERRORS` | 1, 300, 20, 3 | `server-errors` |
| `BB_ALERT_STORAGE_WINDOW_S` | 300 | `storage-errors` |

A wrong value stops the server's start and names the setting (exit 2), as the other settings do; the deploy's `seed` release command does not read them, so a typo cannot block a deploy.

## 8. Costs a month, all together

| Item | Cost |
|---|---|
| New bucket with snapshots, 30 nightly snapshots | cents (storage $0.02 per GB; snapshots free) |
| Nightly and weekly GitHub jobs | $0 (about 80 of 2,000 free minutes) |
| Weekly copy at Backblaze B2 or Cloudflare R2 | $0 under 10 GB |
| UptimeRobot, Healthchecks.io | $0 on the free plans (read the terms, 7.1 and 7.2) |
| The machine kept awake by the monitor | $2.19 (already planned as always-on at launch) |
| A restore drill | cents |
| Fly spend alert | not available |

## 9. Sources read on 2026-10-26

- Tigris: `https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/`, `.../docs/snapshots/`, `.../docs/forks/`, `.../docs/cli/` (install, login), `.../docs/cli/buckets/create/`, `.../docs/cli/snapshots/take/`, `.../docs/cli/snapshots/list/`, `.../docs/cli/snapshots/delete/`, `.../docs/cli/access-keys/`, `.../docs/concepts/authnz/` (roles), `.../pricing.md`.
- Fly: `https://docs.fly.io/tigris` (snapshots, `fly storage create`, the dashboard command, billing), `https://docs.fly.io/about/cost-management` (no billing alerts), `https://docs.fly.io/about/pricing/` and `https://fly.io/pricing/` (machine prices), `https://docs.fly.io/flyctl/machine-run/` and `.../blueprints/task-scheduling` (scheduled machines), `https://docs.fly.io/apps/secrets` (`--stage`).
- GitHub: `docs.github.com` pages on workflow events (the `schedule` trigger), billing for Actions (free minutes) and disabling workflows.
- Backblaze B2: `https://www.backblaze.com/cloud-storage/pricing` and its blog post of 2026-03-17 on the new price; Cloudflare R2: `https://developers.cloudflare.com/r2/pricing/`.
- UptimeRobot: `https://uptimerobot.com/pricing/`, `.../terms/`; Better Stack: `https://betterstack.com/pricing`; Healthchecks.io: `https://healthchecks.io/pricing/`, `.../docs/`, `.../about/`.
- Not found, so not claimed: a Tigris snapshot retention period or expiry; which role may delete a snapshot; whether the 5 GB Tigris free allowance applies to a bucket Fly bills; Fly's per-second price for a 256 MB machine (the hourly price is $0.0030); whether `fly machine run --schedule` can be combined with `--rm`; GitHub's rule for scheduled jobs in private repositories after inactivity.
