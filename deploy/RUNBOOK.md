# Runbook: BeltBattles on Fly + Tigris (0.9.5: two small fixes, on the rules bb-0.9.3, uploads open)

One small Fly machine serves the game page and the ghost API from one HTTPS origin; the ghosts
live in a Tigris bucket. Everything below is non-interactive, with every flag spelled out, and
grouped so each numbered call is one shell call (one approval). Run every call with the repo root as
the working directory:

    /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r095/BeltBattles-r095   (branch release-095)

0.8.0 and its uploads step ran from the clone beltbattles-u080/BeltBattles-u080 (branch uploads-080), and 0.8.1 from
beltbattles-v081/BeltBattles-v081 (branch release-081). Sections 9 and 10 are kept as they ran there: their calls name
those clones and tips, and they must never run again. Section 11 is 0.8.2's call as written in the clone
beltbattles-r082/BeltBattles-r082 (branch release-082, tip 7669e36), and section 12 is 0.8.3's call as written in the
clone beltbattles-r083/BeltBattles-r083 (branch release-083, tip d909701). Each names its own clone. Neither may run
once section 13's call has run, and section 11's may not run once section 12's has. Section 13 is 0.8.4's call as
written in the clone beltbattles-r084/BeltBattles-r084 (branch release-084, tip e81a667). It ran there (release v6,
LIVE-084) and must never run again. Section 14 is 0.8.5's call as written in the clone
beltbattles-r085/BeltBattles-r085 (branch release-085, tip 52c0b43). It ran there (release v7, LIVE-085) and must never
run again. Section 15 is 0.8.6's call as written in the clone beltbattles-r086/BeltBattles-r086 (branch release-086,
tip c57de36). It ran there (release v8, LIVE-086) and must never run again. Section 16 is 0.8.7's launch as written in
the clone beltbattles-r087/BeltBattles-r087 (branch release-087, tip 14633e4). It ran there (release v9, live from
2026-10-04 at 21:40:50Z) and must never run again. 0.8.8's launch was section 17 of the runbook in the clone
beltbattles-r088/BeltBattles-r088 (branch release-088, tip 4897eb5); it ran there (release v10) and must never run
again. Section 17 is 0.8.9's launch as written in the clone beltbattles-r089/BeltBattles-r089 (branch release-089, tip
03903e9). It ran there (release v11, LIVE-089) and must never run again. Section 18 is 0.9.0's launch as written in
the clone beltbattles-r090/BeltBattles-r090 (branch release-090, tip e76f7af). It ran there (release v12, live since
2026-10-05 at about 16:52Z, LIVE-090) and must never run again. Section 19 is 0.9.1's launch as written in the clone
beltbattles-r091/BeltBattles-r091 (branch release-091, tip e781ab6). It never ran: 0.9.2 went live first and carried
0.9.1's whole content (LIVE-092), so section 19 must never run (its own version guard now refuses). Section 20 is
0.9.2's launch as written in the clone beltbattles-r092/BeltBattles-r092 (branch release-092, tip cafe1a6). It ran
there (release v13, live since 2026-10-06 at about 00:09Z, LIVE-092) and must never run again. Section 21 is 0.9.3's
launch as written in the clone beltbattles-r093/BeltBattles-r093 (branch release-093, tip 384ba42). It ran there
(release v14, live since 2026-10-06 at about 12:33Z, LIVE-093) and must never run again. Section 22 is 0.9.4's launch
as written in the clone beltbattles-r094/BeltBattles-r094 (branch release-094, tip eb4c249). It ran there (release v15,
live since 2026-10-06 at about 14:36Z, LIVE-094) and must never run again. Sections 3 to 8 now name 0.9.5's page and
the rules bb-0.9.3, and section 23 is 0.9.5's launch, from this clone.

Names used below: app `beltbattles` (URL https://beltbattles.fly.dev), org `personal`, bucket
`beltbattles-ghosts`, rules `bb-0.9.3`, game 0.9.5. The page is 0.9.5's: 0.8.0 (the release candidate c3c84e5) with the
phone controls (section 10), the title screen on phones (section 11), a part's whole description on a phone tap
(section 12), a roomier build screen on phones (section 13), BELTS (section 14: belt slots by level and by stars and
the hero's two gold upgrades), PACKS (section 15: the belt and armor packs in every shop, and player names), RUNES
(section 16: a rune pick at every dawn, the rune bar and 57 runes, carried in the ghost snapshot), the card faces
(0.8.8: short plain-word card text with icons and keywords, and the card cleanup: the stats apart from the abilities,
one short line per ability, the level details behind an info button, no copies-to-merge line; UI only), 0.8.9
(section 17: the computer captains buy ARMOR PACKs, and the card fixes: a wordless owned marker on shop cards instead
of the copy count, and a taller info view), 0.9.0 (section 18: release X, whole numbers, the sustain parts and runes,
and rivals that take runes, with Y1's clearer card faces), 0.9.1 (section 19: the hero balance pass, with WEAVER's
and FURNACE's hulls, the KILN's HEAT and FURNACE's four runes back in the dawn offer), 0.9.2 (section 20: the
captains' catch-up, the computer captains' plans and rune picks), 0.9.3 (section 21: release Y, one rule for each
part, with the phone finger targets), 0.9.4 (section 22: the captains' pass, the computer captains' plans and rune
picks again, with the touch check's fix, a test tool) and 0.9.5 (section 23: two small fixes, SALVO RACK's SHOT note
and the shop card's desktop hover text, and a factory or turret hold that takes its full time), on the rules bb-0.9.3
(0.9.3's; 0.9.4 and 0.9.5 keep them).
The server is uploads-080's (H2's cef0379, v080-h2, which adds the record check to POST /v1/ghosts, with
uploads open: section 9), built from this tip, so its strict decoder, record check, name check, rune check (one rune
for each dawn, exactly) and seed pool are bb-0.9.3's. The seed pool is bb-0.9.3's own (120 ghosts, each holding one
rune for each dawn), with nothing carried: src/sim/content.ts POOL_RULES_CARRIED is empty. fly.toml, the Dockerfile and
.dockerignore are unchanged.

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
  When release-084 was cut, d909701 had not gone live: its L4 (esc_d461cc44-a4e) was still pending, as was 0.8.2's.

Branch release-084, in this clone (a standalone copy of release-083), is release-083 plus 0.8.4 (section 13):
- 81ec126, 9aebd41, 9123140: a roomier build screen on phones (REQ-BFG-040), cherry-picked from 30b1d668's verified
  release-zoom bundle (4d74345, 910ede2, af9ad62, made on release-tap f7db355);
- 5f75f55: the 0.8.4 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- the release record: GAME_BUILD.txt records the 0.8.4 online page, sections 3 and 5 name it, and section 13 is its call.
  e81a667 went live as release v6 (LIVE-084).

Branch release-085, in this clone (a standalone copy of BELTS' branch belts, made in the clone
beltbattles-belts/BeltBattles-belts on e81a667; this clone holds only live084 = e81a667 and release-085, and the
branches above are in their own clones), is release-084 plus 0.8.5 (section 14):
- BELTS runs 1-5 to 3196877 (REQ-BFG-043, REQ-BFG-044, REQ-BFG-032): belt slots by level and by stars, the hero's
  TURRET SPEED and FACTORY upgrades (levels 1-4 for 10, 20 and 30 gold), the rules bump to bb-0.8.3 with both ghost
  pools regenerated, and the upload tests for the upgrade levels;
- 0799249: T47, no decimals in the texts BELTS added (REQ-BFG-047);
- 70c5b21: the 0.8.5 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- the release record: GAME_BUILD.txt records the 0.8.5 online page, sections 3 to 8 name it and the rules bb-0.8.3,
  and section 14 is its call. 52c0b43 went live as release v7 (LIVE-085).

Branch release-086, in this clone (a standalone copy of PACKS' branch packs, made in the clone
beltbattles-packs/BeltBattles-packs on 52c0b43; this clone holds only live085 = 52c0b43 and release-086, and the
branches above are in their own clones), is release-085 plus 0.8.6 (section 15):
- PACKS runs 1-2 to 3ebeaa6 (REQ-BFG-051, REQ-BFG-063): the BELT PACK (2 gold, +4 belt) and the ARMOR PACK (5 gold,
  +25 hull) as two fixed shop offers outside the roll, required player names on every bb-0.8.6 upload (2 to 10
  characters, a #XX tag from the player id), the rules bump to bb-0.8.6 with both ghost pools regenerated, and the
  captains refit under the new luck caps;
- cb75851: the 0.8.6 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- the release record: GAME_BUILD.txt records the 0.8.6 online page, sections 3 to 8 name it and the rules bb-0.8.6,
  and section 15 is its call;
- then a test-only commit: tests/packs.rules' label pin reads 0.8.6, and touchcheck waits for OPTIONS to be drawn
  after a reload. The page and the server are the release record's; section 15's `<TIP>` is this last commit.

Branch release-087, in this clone (a standalone copy of the rune branch runes-087f at bdb4265, which grew from
release-086's c57de36; this clone holds only runes-087f and release-087, and the branches above are in their own
clones), is release-086 plus 0.8.7 (section 16):
- RUNES-1, RUNES-2a, RUNES-087 and RUNES-087F to 12d54c8, and the shots-list follow-up bdb4265 (REQ-BFG-058): one rune
  pick at each dawn (1 of 3 on days 1-4, 1 of 2 from day 5), the rune bar, 57 runes (21 common, 20 rare, 11 epic, 5
  legendary), the held runes and the run seed in the ghost snapshot (v3) with the server's rune check, and the rules
  bump to bb-0.8.7 with bb-0.8.6's seed and stand-in pools carried unregenerated (POOL_RULES_CARRIED; BOT_RUNES off);
- 9f3ee6f: the 0.8.7 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- the release record: GAME_BUILD.txt records the 0.8.7 online page, sections 3 to 8 name it and the rules bb-0.8.7,
  and section 16 is its launch;
- then a test-only commit: asynccheck takes day 1's dawn rune before it places a part. The page and the server are the
  release record's; this last commit is section 16's tip.

Branch release-088, in the clone beltbattles-r088/BeltBattles-r088 (a standalone copy of release-087 at 14633e4; this
clone holds a copy of release-088 too), is release-087 plus 0.8.8 (section 17 of that clone's runbook):
- U2a, U2b, U2c and U2d to 11fbc6a (REQ-BFG-045, REQ-BFG-046, REQ-BFG-047): the card faces, 27 UI and test commits made
  on runes-087f (tag faces-088) and rebased cleanly onto 14633e4 (to 7c822c3). Every part, rig, turret and hero says
  what it does in short plain words with icons; the keywords get their colours, icons and a tap to explain; the shop
  cards get a stat chip; phoneBand is re-measured (390x844 and 430x739: band 148). No file under src/sim, server or
  src/net changed;
- f80875e: the 0.8.8 label (VERSION, package.json, package-lock.json) and docs/CHANGELOG.md;
- e500f1d: the first release record, for the card faces alone (the f80875ec4fdb page, which never shipped);
- 1210ee8: a test-only commit: touchcheck's names section waits for CONTINUE to be drawn after a reload, as it waits
  for OPTIONS since c57de36. It was the faces-only staging's tip (tag stage088-faces);
- U2e's 7 UI and test commits (REQ-BFG-070, REQ-BFG-046), cherry-picked with -x from u2e-088 (f7111d3, made on
  11fbc6a) onto 1210ee8, to 77ee87a: the card cleanup. The face you always see shows the stats, apart from the
  abilities, and one short line per ability; the level ladder, the next star and the keyword explanations move behind
  an info button (where U2c's ? was); no panel shows a copies-to-merge line. No file under src/sim, server or src/net
  changed;
- 85175fe: docs/CHANGELOG.md's 0.8.8 entry adds the card cleanup;
- the release record: GAME_BUILD.txt records the 0.8.8 online page built at 85175fe, sections 3 to 8 name it (the
  rules stay bb-0.8.7), and section 17 is its launch;
- then a test-only commit: the shop's familiar-slot chance test and the dead-offer audits get a time limit of their
  own (120 s, as net-upload.slack's DP tests have), because the global 30 s ran out under host load. The page and the
  server are the release record's; this last commit, 4897eb5, is the tip of 0.8.8's launch.

Branch release-089, in the clone beltbattles-r089/BeltBattles-r089 (a standalone copy of release-088 at 4897eb5; that
clone holds only release-088 and release-089), is release-088 plus 0.8.9 (section 17):
- CATCHUP-089's 7 commits (REQ-BFG-024, REQ-BFG-051; backlog #346 and #350), cherry-picked with -x from catchup-089
  (1210ee8..13c6782) onto 4897eb5, to 98e128c (tag stage089-catchup): the computer captains buy ARMOR PACKs up to the
  par field's mean count with the gold their plans leave over; the Hard stand-ins take theirs out of their road decks'
  gold upgrades; the Hard road decks still short of the par fields get free PvE plates; packs are trimmed back where
  they broke the ladder or the walls; and the stand-in generator writes POOL_RULES. Only src/sim/rivalBuilds.ts,
  src/sim/harness/standins.ts and three test files changed. The battle sim is untouched (parBench's fingerprint stays
  4daa5e5b), and the stand-in pool data, roadCap's prize column and the upload check don't move;
- U2f's 4 UI, test and docs commits (REQ-BFG-070, REQ-BFG-046), cherry-picked with -x from u2f-089 (f7111d3..8cae445),
  to 20113fa: the shop card's grey copy-count badge becomes a wordless owned marker, the info view (ⓘ) grows taller so
  long card info fits on one page, four long one-clause lines fit one line, and docs/TEXT-STYLE.md gains three rules.
  No file under src/sim, server or src/net changed;
- dfde5ac: the 0.8.9 label (VERSION, package.json, package-lock.json and the label pins);
- 7808c9b: docs/CHANGELOG.md's 0.8.9 entry;
- the release record: GAME_BUILD.txt records the 0.8.9 online page built at 7808c9b, sections 3 to 8 name it (the
  rules stay bb-0.8.7), and section 17 is its launch. 03903e9 went live as release v11 (LIVE-089).

Branch release-090, in the clone beltbattles-r090/BeltBattles-r090 (a standalone copy of the reviewed head y1x at
f0fe94c; that clone holds only release-090 and the tags x-head = f0fe94c, flipx2-357 = 357cabc, x2-base = 4bb8729 and
r089 = 03903e9), is 0.8.9's code plus release X and Y1's card faces (section 18):
- FLIP-X2 to 357cabc, on x2 4bb8729 (REQ-BFG-069, REQ-BFG-047, REQ-BFG-058): the sustain switch and the bots' rune
  switch on (SUSTAIN_LIVE, BOT_RUNES), TUNE-X's rune and data lines, the rules bumped once to bb-0.9.0, every pool
  regenerated, and every NUM exception removed. Four runes leave the dawn offer (SEARING, SHATTER SHOT, COAL CHUTE and
  HEAT SINK) and SIFTER leaves the shop; DRAG CHAIN FOUNDRY stuns for 3 seconds at star 3, and the STALL word is now
  STUN. An upload must hold exactly one rune for each dawn (cap's ruling 5d6d83ef57d1494c). Its step 3d picked the
  release line's 10 code and test commits with -x: CATCHUP-089's 7 and the test-only 14633e4, 1210ee8 and 4897eb5;
- FIX-ABE's two fixes, cherry-picked with -x (74e14a1 as 0c3df00, 8ffa25d as aefd2a3): a part held back to a later day
  never holds a merchant's ware slot, and the par player's forbid knob refuses a banned part only when it would take
  it;
- REDO-X to 77d54b0 (cap's ruling 207816b18a9fbfdb): the luck caps, the stand-in pool and the seed pool v3 regenerated
  once on the new offers, the captains and the wave-3 plans fitted to the new caps, LADDER_X_OPEN re-measured (81
  entries), and FLIP-X2's two late re-pins picked with -x (1b107cb as c5301b4, 6d50ff2 as 9e62dd4). Its one full gate
  was green;
- Y1's 13 display commits (REQ-BFG-070, REQ-BFG-046), cherry-picked with -x from 7341052, to f0fe94c: one-line card
  faces for six parts, SLUG rows, TESLA ARC's arc damage as a stat, GATLING SPOOL's spin step, FURNACE's two-line hero
  face, and the START: label on five runes. Under src/sim only text changed (FURNACE's blurb and five rune texts);
- e5a89b5: this runbook and docs/CHANGELOG.md, carried from 0.8.9's tip 03903e9 (the base held neither file's release
  line text: 9f3ee6f, 2da55d3, f80875e, e500f1d, 85175fe, 0ea93d8, 7808c9b and 03903e9);
- 06c7a1a: the 0.9.0 label (VERSION, package.json, package-lock.json and the label pins);
- 7937d58: docs/CHANGELOG.md's 0.9.0 entry;
- 2fc8308: a test-harness fix plus one read-only tooling hook (cap's ruling eaf260a2a192acf6). The scripted runs
  (scripts/playthrough.mjs) record a dusk loss as the lives it left, before the early-loss refund at dawn 3, and judge a
  foe's deck with its runes, as the unit tests do. src/main.ts gains window.bb.runeGrant (the runes' hull, belt and gold,
  read only), which those runs read; no player sees it, and no number, rule or text changes;
- the release record: GAME_BUILD.txt records the 0.9.0 online page built at 2fc8308, sections 3 to 8 name it and the
  rules bb-0.9.0, and section 18 is its launch (fbed404);
- then two test-only commits: 77f0b5e (cap's ruling bce92765e6026e9b), where the smoke's day-3 check (tools/smoke.ts)
  expects a v3 seed ghost, as FLIP-X2 made every pool deck carry its dawn runes (was v2); and then (cap's ruling
  bc2ad14029210996) touchcheck's ARMOR PACK check (scripts/touchcheck.mjs) expects +250 hull, NUM-1's scale (was 25).
  The page and the server are the release record's; this last commit, e76f7af, is section 18's tip. It went live as
  release v12 (LIVE-090).

Branch release-091, in the clone beltbattles-r091/BeltBattles-r091 (a standalone copy of BAL-2's bal2 at 7f642ec; that
clone holds only release-091 and the tags bal2-head = 7f642ec, y1x-base = f0fe94c and r090 = e76f7af), is 0.9.0's code
plus BAL-2's hero balance pass (section 19):
- Y-FURN's 6 commits (REQ-BFG-069, REQ-BFG-070), picked with -x by BAL-2 onto y1x f0fe94c: FURNACE's four runes in
  their release-Y forms (COAL CHUTE and HEAT SINK read the KILN's HEAT, SEARING burns, SHATTER SHOT shatters a SHIELD),
  and a rune card with each trigger and its effect on a line of its own. FURN-Y's two bench-only commits (fff8a3b,
  5409c6b) sit in the history before db6e235, which took their bench-only lines out;
- BAL-2's 16 commits to 7f642ec (REQ-BFG-069, REQ-BFG-058; cap's REVIEW-BAL1 section 3 and rulings f894080daebfa8c0,
  42da94243f43feef and d306b1b196dbab38): WEAVER's hull 1700 and FURNACE's 2100, the KILN's HEAT 13, and the four runes
  back in the dawn offer (DORMANT_RUNES empty) at COAL CHUTE 15, HEAT SINK 25, SEARING 5 and SHATTER SHOT 14; the rules
  bumped once to bb-0.9.1, with a rules gate row for the four runes; the luck caps, the captains' runes, the stand-in
  pool and the seed pool v3 made again once; the captain and wave-3 fits; LADDER_X_OPEN measured again (92 entries).
  Its one full gate was green;
- the six release-090 commits the Prime's setup picked with -x (e5a89b5, 7937d58, 2fc8308, fbed404, 77f0b5e and e76f7af,
  as c2cba0e, 49c75dd, 6c576e0, f53dea7, 7055e6f and b266f24): this runbook and docs/CHANGELOG.md as 0.9.0 left them, the
  test-harness fix with its read-only tooling hook, 0.9.0's release record and the two test-only fixes. 0.9.0's label
  commit (06c7a1a) was not picked;
- 608eee9: the 0.9.1 label (VERSION, package.json, package-lock.json and the label pins);
- ae16d18: the BUNDLE (test-only; backlog 333-11, 338 and 337): a near-miss rules case (bb-0.9.0 and bb-0.9.2 uploads
  get 422 at the exact rules check, on both stores), the uploads probe against a misbehaving in-process server, and
  rcruns' later runs reading the day-1 uploads again after each run;
- 5ee9524: docs/CHANGELOG.md's 0.9.1 entry;
- the release record (e781ab6): GAME_BUILD.txt records the 0.9.1 online page built at 5ee9524, sections 3 to 8 named it
  and the rules bb-0.9.1, and section 19 is its launch. e781ab6 is section 19's tip. It never launched: 0.9.2 went live
  first and carried it (LIVE-092).

Branch release-092, in the clone beltbattles-r092/BeltBattles-r092 (a standalone copy of release-091 at e781ab6; that
clone holds only release-092 and the tags r091 = e781ab6, bal2-head = 7f642ec, catchup-head = 23eb2fb, y1x-base =
f0fe94c and r090 = e76f7af), is 0.9.1's code plus the captains' catch-up (section 20):
- release-091 at e781ab6 (0.9.1 as staged, above), unchanged;
- CATCHUP-091's 5 commits (REQ-BFG-024, REQ-BFG-058, REQ-BFG-051; cap's rulings 3c58471c74bdc4ed, e2ca295ce9dcd60a and
  f77489ebe2e11698), made on bal2 7f642ec and picked with -x by the Prime's setup (21a81c7, 5ade8e3, 36e7214, fa273df
  and 23eb2fb, as e1d2526, 6183606, 69c10b9, 3f7c3b6 and 5e5a131): the captains' plans (part days, ARMOR PACKs, PvE
  plates) and the rune lists of EMBERLYN, MASTER VOSS, LONGTOOTH and the IRON MATRIARCH in src/sim/rivalBuilds.ts;
  genCaptainRunes' own rules (a rune that does nothing for a captain's hero is skipped, and CAPTAIN_RUNE_SKIP); and
  tests: LADDER_X_OPEN measured again (110 entries), runes.parity's record and stale comments. 25 of the 26 difficulty
  walls hold (0.9.1: 13). Its gate was green;
- 0a9368e: the 0.9.2 label (VERSION, package.json, package-lock.json and the label pins);
- e668330: docs/CHANGELOG.md's 0.9.2 entry;
- the release record (cafe1a6): GAME_BUILD.txt records the 0.9.2 online page built at e668330, sections 3 to 8 named it
  and the rules bb-0.9.1, and section 20 is its launch. cafe1a6 went live as release v13 (LIVE-092).

Branch release-093, in the clone beltbattles-r093/BeltBattles-r093 (a standalone copy of release Y's y7b2 at 63d4ab5;
that clone holds only release-093 and the tags y-head = 63d4ab5, base092 = 5e5a131, r092 = cafe1a6 and tap-head =
458500b), is 0.9.2's code plus release Y and the phone finger targets (section 21):
- release Y to 63d4ab5 (tag y-head; REQ-BFG-070, REQ-BFG-046): Y2 to Y6, YINT, Y7a, Y7b1 and Y7b2, 56 commits on base092
  5e5a131 (the captains' catch-up tip, where release-092 started). Every part does one thing (one ability line, one
  trigger, one effect), and a star changes a number but never adds a rule; a star's perk name shows only in the ⓘ view;
  POISON is gone (VENOM DRIP makes BURN last longer), HARASSMENT is gone (only a STUN counts), and LOAD TIME is gone
  from the cards; payoff parts need their engine. Y7b2 flipped the star switch for good, made FOUNDRY's fuse add up
  VENOM DRIP's seconds, and moved the rules once to bb-0.9.3 (the rules skip bb-0.9.2; no new rules gate row, cap's
  ruling Y7B2-Q2). Then the luck caps, the stand-in pool and the seed pool v3 were made again once, with the captain and
  wave-3 fits, and LADDER_X_OPEN was measured again (126 entries). Its one full gate was green;
- 0.9.2's release record, picked with -x by the Prime's setup: e668330 (docs/CHANGELOG.md's 0.9.2 entry) and cafe1a6
  (GAME_BUILD.txt and section 20), as 876a5ed and dfad24b. 0.9.2's label commit (0a9368e) was not picked;
- TAP-093 and TAP-093b's 5 commits (REQ-BFG-040), picked with -x (2f333e5, 3d89c42, f96d7bc, d60d656 and 458500b, as
  89f27ea, a517d61, db81269, b0b09f0 and f4cd8b8): MENU and SND are finger targets of at least 44 CSS px on portrait
  phones. On shorter phones MENU moves to the top-left corner, with the SOUND switch in its card; where a phone has room
  the top bar grows; the rune chips start right of the corner MENU. Display only: src/screens/build, src/ui/runeBar.ts,
  scripts/touchcheck.mjs and a test;
- 74ee35b: the 0.9.3 label (VERSION, package.json, package-lock.json and the label pins);
- 53ed114: docs/CHANGELOG.md's 0.9.3 entry;
- the release record (384ba42): GAME_BUILD.txt records the 0.9.3 online page built at 53ed114, sections 3 to 8 named it
  and the rules bb-0.9.3, and section 21 is its launch. 384ba42 is section 21's tip.

Branch release-094, in the clone beltbattles-r094/BeltBattles-r094 (a standalone copy of release-093 at 384ba42; that
clone holds only release-094 and the tags r093 = 384ba42, y-head = 63d4ab5, c093-head = 7a4faa7, tch-head = 814bea1,
tap-head = 458500b, base092 = 5e5a131 and r092 = cafe1a6), is 0.9.3's code plus the captains' pass and the touch check's
fix (section 22):
- release-093 at 384ba42 (0.9.3 as staged, above), unchanged;
- CATCHUP-093's 4 commits (REQ-BFG-024, REQ-BFG-058, REQ-BFG-051; cap's rulings HB 678fb328359e02f1, e2ca295ce9dcd60a,
  f77489ebe2e11698 and 3c58471c74bdc4ed), made on y-head 63d4ab5 and picked with -x by the Prime's setup (b080550,
  67edde3, 0a4ea7c and 7a4faa7, as b86a208, 22d2e36, 29fd705 and 3a18f4c): the captains' plans (part days, ARMOR PACKs,
  PvE plates) and the rune lists of MASTER VOSS and the IRON MATRIARCH in src/sim/rivalBuilds.ts; two more
  CAPTAIN_RUNE_SKIP rules in tools/genCaptainRunes.ts; and tests: LADDER_X_OPEN measured again (121 entries, was 126)
  and runes.parity's record. All 26 difficulty walls hold (0.9.3: 23). Its gate was green;
- TCH-360's 2 commits (REQ-BFG-040), picked with -x (12335d3 and 814bea1, as ed866a1 and 813fa0c): the touch check
  (scripts/touchcheck.mjs) holds up on a busy host. A test tool only: no game code changed;
- 4e27b79: the 0.9.4 label (VERSION, package.json, package-lock.json and the label pins);
- f1c0a62: docs/CHANGELOG.md's 0.9.4 entry;
- the release record (eb4c249): GAME_BUILD.txt records the 0.9.4 online page built at f1c0a62, sections 3 to 8 named it
  and the rules bb-0.9.3, and section 22 is its launch. eb4c249 went live as release v15 (LIVE-094).

Branch release-095, in this clone (a standalone copy of release-094 at eb4c249; this clone holds only release-095 and
the tags r094 = eb4c249, txt-head = d1f6b65, hold-head = 7411720, r093 = 384ba42, c093-head = 7a4faa7, tch-head =
814bea1, tap-head = 458500b, y-head = 63d4ab5, base092 = 5e5a131, r092 = cafe1a6 and faces-088 = 11fbc6a, and the
branches above are in their own clones), is 0.9.4's code plus two small fixes (section 23):
- release-094 at eb4c249 (0.9.4 as live, above), unchanged;
- TXT-095's 3 commits (REQ-BFG-070, REQ-BFG-046; the note's words are the Prime's choice, oracle eca9983506b0133c), made
  on eb4c249 and picked with -x by the Prime's setup (fb92a76, 17789e6 and d1f6b65, as 1411be4, 0eb7ea8 and 3cdc80c):
  SALVO RACK's SHOT note gives its fallback (3 seconds after its first load), and the shop card's desktop hover shows
  the card's own ability line first, as a pack's hover does. Display only: src/ui/glossary.ts,
  src/screens/build/shop.ts and src/screens/build/chrome.ts, and two new test files;
- HOLD-363's 2 commits (REQ-BFG-040; backlog #363), made on eb4c249 and picked with -x (8116c81 and 7411720, as fe6c208
  and 0c74c0d): the build editor counts a press's time once a frame, so a factory or turret hold lifts after the time
  the code names (it lifted in about half that). src/screens/build/edit.ts and its test file only;
- 4930fc0: the 0.9.5 label (VERSION, package.json, package-lock.json and the label pins);
- 93f3e46: docs/CHANGELOG.md's 0.9.5 entry;
- the release record: GAME_BUILD.txt records the 0.9.5 online page built at 93f3e46, sections 3 to 8 name it and the
  rules bb-0.9.3, and section 23 is its launch. A commit can't name its own hash, so the Prime names the tip at launch.

**The page.** The image serves the ONLINE single-file page: `npm run build:online`
(VITE_GHOST_SERVER=same-origin, into dist-online/), then `node scripts/singlefile.mjs <out.html> --dist dist-online`.
It plays against the server that serves it, with no `?server=`. deploy/GAME_BUILD.txt records 0.9.5's:
../output-stage095/pages/BeltBattles-0.9.5-93f3e46f4697-online.html beside this clone (GAME_BUILD.txt names it from
the repo root), 691,285 bytes, sha256 as GAME_BUILD.txt records (it begins `cddb1dede47ea618`), built at 93f3e46. Shore
serves the offline page of the same commit (691,274 bytes; ../output-stage095/pages/BeltBattles-0.9.5-93f3e46f4697.html,
and the same bytes as ../output-stage095/shore/index.html); it plays offline unless opened with `?server=`. Section
23's launch stages these bytes from wherever the Prime keeps them (stage.mjs checks the size and the SHA-256 against
GAME_BUILD.txt, not the path). Before 0.9.5, 0.9.4's release record (eb4c249) recorded 0.9.4's page,
BeltBattles-0.9.4-f1c0a62452cf-online.html (691,202 bytes, sha256 `70473aa7ed421e69…`, built at f1c0a62), which release
v15 serves. Before 0.9.4, 0.9.3's release record (384ba42) recorded 0.9.3's page,
BeltBattles-0.9.3-53ed11440102-online.html (691,113 bytes, sha256 `ba769ea1a13179d9…`, built at 53ed114), which release
v14 serves. Before 0.9.3, 0.9.2's release record (cafe1a6, carried here as dfad24b) recorded 0.9.2's
page, BeltBattles-0.9.2-e668330ad535-online.html (696,831 bytes, sha256 `5376446c863e77a4…`, built at e668330), which
release v13 serves. Before 0.9.2, 0.9.1's release record (e781ab6) recorded 0.9.1's page,
BeltBattles-0.9.1-5ee95246d7a6-online.html (696,824 bytes, sha256 `749847a3a146952c…`, built at 5ee9524), which never
shipped: 0.9.2 went live first and carried it. Before 0.9.1, 0.9.0's release record (fbed404, carried here as
f53dea7) recorded 0.9.0's
page, BeltBattles-0.9.0-2fc830882c86-online.html (695,449 bytes, sha256 `fd0b3f356c09c551…`, built at 2fc8308), which
release v12 serves. Before 0.9.0, 0.8.9's release record (03903e9) recorded 0.8.9's page,
BeltBattles-0.8.9-7808c9bbe65a-online.html (672,501 bytes, sha256 `26e15c74e455d701…`, built at 7808c9b), which
release v11 serves. (This branch's base f0fe94c still recorded 0.8.6's page in GAME_BUILD.txt: the base never held the
release line's records.) Before 0.8.9, GAME_BUILD.txt recorded 0.8.8's page,
BeltBattles-0.8.8-85175feea4c8-online.html (670,455 bytes, sha256 `037580bd97a64536…`, built at 85175fe), which
release v10 serves. Before the card cleanup joined 0.8.8, GAME_BUILD.txt recorded
the faces-only 0.8.8 page, BeltBattles-0.8.8-f80875ec4fdb-online.html (668,122 bytes, sha256 `e8c076452d5c0540…`, built at f80875e), which
never shipped. Before 0.8.8, it recorded 0.8.7's page, BeltBattles-0.8.7-9f3ee6ff52ce-online.html (634,882 bytes,
sha256 `e51c567ec87ebea0…`), which release v9 serves.
Before 0.8.7, it recorded 0.8.6's page, BeltBattles-0.8.6-cb7585130d52-online.html (607,541 bytes, sha256
`77aaa7ca0ed842c4…`), which release v8 serves.
Before 0.8.6, GAME_BUILD.txt recorded 0.8.5's page, BeltBattles-0.8.5-70c5b21eed24-online.html (598,639 bytes, sha256
`7c22d4617a3dda76…`), which release v7 serves. Before 0.8.5, it recorded 0.8.4's page, BeltBattles-0.8.4-5f75f5532043-online.html (591,654 bytes, sha256
`bc576ea38e39ff9d…`), which release v6 serves. Before 0.8.4, it recorded 0.8.3's page, BeltBattles-0.8.3-462c29aa102e-online.html (590,294 bytes, sha256
`de5e96fb357a2e34…`); before that 0.8.2's, BeltBattles-0.8.2-a9a9090ca36b-online.html (589,217 bytes, sha256
`3b6867b0b432be80…`); and before that 0.8.1's, BeltBattles-0.8.1-1d47d41ef7e4-online.html (587,335 bytes, sha256
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
0.8.2's change too; it also changes the page and nothing else (section 12). 0.8.4, a roomier build screen on phones,
is built on 0.8.3, so it carries 0.8.3's and 0.8.2's changes too; it also changes the page and nothing else
(section 13). It went live on 2026-10-03 at about 22:04Z (release v6, LIVE-084). 0.8.5, BELTS, is built on 0.8.4 and
changes the battle rules (section 14): the rules move to bb-0.8.3, with a new seed pool (120 ghosts, 12 a day). The
bb-0.8.0 ghosts and uploads stay in the bucket under their own prefix and match only 0.8.0-0.8.4 pages; a 0.8.5 page
asks for and uploads bb-0.8.3 ghosts only. It went live on 2026-10-04 at about 08:04Z (release v7, LIVE-085). 0.8.6,
PACKS, is built on 0.8.5 and changes the battle rules again (section 15): the rules move to bb-0.8.6, with a new seed
pool (120 ghosts, 12 a day), and every bb-0.8.6 upload must carry a player name. The bb-0.8.3 ghosts and uploads stay
in the bucket under their own prefix and match only 0.8.5 pages; a 0.8.6 page asks for and uploads bb-0.8.6 ghosts
only. It went live on 2026-10-04 at about 20:35Z (release v8, LIVE-086). 0.8.7, RUNES, is built on 0.8.6 and changes
the battle rules again (section 16): the rules move to bb-0.8.7, a run takes one rune at every dawn, and an upload
carries its runes and its run seed, from which the server checks that each rune was offered. Its seed pool is
bb-0.8.6's 120 decks, carried unregenerated (POOL_RULES_CARRIED; bots hold no runes yet) and seeded under bb-0.8.7.
The bb-0.8.6 ghosts and uploads stay in the bucket under their own prefix and match only 0.8.6 pages; a 0.8.7 page
asks for and uploads bb-0.8.7 ghosts only. It went live on 2026-10-04 at 21:40:50Z (release v9). 0.8.8, the card
faces and the card cleanup, is built on 0.8.7 and changes the page and nothing else (section 17 in the clone
beltbattles-r088): the rules stay bb-0.8.7, so 0.8.7 and 0.8.8 pages play the same rules and meet each other's ghosts
and uploads. It went live as release v10. 0.8.9, the captains' catch-up and the card fixes, is built on 0.8.8
(section 17): the computer captains buy ARMOR PACKs, the shop cards show a wordless owned marker, and the info view is
taller. The battle sim, the upload check and the pools don't move, so the rules stay bb-0.8.7, and 0.8.7, 0.8.8 and
0.8.9 pages play the same rules and meet each other's ghosts and uploads. It went live on 2026-10-05 at about 10:14Z
(release v11, LIVE-089). 0.9.0, release X with Y1's card faces, holds 0.8.9's code and changes the battle rules again
(section 18): the rules move to bb-0.9.0, with a new seed pool (120 ghosts, 12 a day, each holding one rune for each
dawn). Every number is whole, the sustain parts and runes join, the starting ghosts, the caravan's stand-ins and the
captains take runes, and an upload must hold exactly one rune for each dawn it reached. The bb-0.8.7 ghosts and uploads
stay in the bucket under their own prefix and match only 0.8.7, 0.8.8 and 0.8.9 pages; a 0.9.0 page asks for and
uploads bb-0.9.0 ghosts only. It went live on 2026-10-05 at about 16:52Z (release v12, LIVE-090). 0.9.1, BAL-2's hero
balance pass, holds 0.9.0's code and changes the battle rules again (section 19): the rules move to bb-0.9.1, with a new
seed pool (120 ghosts, 12 a day, each holding one rune for each dawn). WEAVER's hull is 1700 and FURNACE's 2100, the
KILN's HEAT is 13, and FURNACE's four runes are back in the dawn offer. The bb-0.9.0 ghosts and uploads stay in the
bucket under their own prefix and match only 0.9.0 pages; a 0.9.1 page asks for and uploads bb-0.9.1 ghosts only. 0.9.2,
the captains' catch-up, holds 0.9.1's code (section 20): the computer captains' plans and rune picks change, but no
battle number, rune or rule does, so the rules stay bb-0.9.1 and the pools don't move. 0.9.1 and 0.9.2 pages play the
same rules and meet each other's ghosts and uploads. 0.9.1 never launched on its own: 0.9.2 went live first, with
0.9.1's whole content, on 2026-10-06 at about 00:09Z (release v13, LIVE-092). 0.9.3, release Y with the phone finger
targets, holds 0.9.2's code and changes the battle rules again (section 21): the rules move to bb-0.9.3 (skipping
bb-0.9.2), with a new seed pool (120 ghosts, 12 a day, each holding one rune for each dawn). Each part does one thing,
POISON and HARASSMENT are gone, and on phones MENU and SND are finger targets. The bb-0.9.1 ghosts and uploads stay in
the bucket under their own prefix and match only 0.9.1 and 0.9.2 pages; a 0.9.3 page asks for and uploads bb-0.9.3
ghosts only. It went live on 2026-10-06 at about 12:33Z (release v14, LIVE-093). 0.9.4, the captains' pass, holds
0.9.3's code (section 22): the computer captains' plans and rune picks change, and the touch check (a test tool) holds
up on a busy host, but no battle number, rune or rule does, so the rules stay bb-0.9.3 and the pools don't move. 0.9.3
and 0.9.4 pages play the same rules and meet each other's ghosts and uploads. It went live on 2026-10-06 at about
14:36Z (release v15, LIVE-094). 0.9.5, two small fixes, holds 0.9.4's code (section 23): SALVO RACK's SHOT note gives
its fallback, the shop card's desktop hover shows the card's own ability line, and a factory or turret hold takes its
full time. No battle number, rune or rule changes, so the rules stay bb-0.9.3 and the pools don't move. 0.9.3, 0.9.4
and 0.9.5 pages play the same rules and meet each other's ghosts and uploads.

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
node deploy/stage.mjs ../output-stage095/pages/BeltBattles-0.9.5-93f3e46f4697-online.html
```

Runs `npm run build:server` (type-check + vite bundle into server/dist/: ghost-server.mjs, ghost-admin.mjs,
gen-ghost-pool.mjs, from uploads-080 on also ghost-probe.mjs, and their shared chunks), copies the page to the
gitignored deploy/public/index.html and refuses unless its SHA-256 and size equal deploy/GAME_BUILD.txt. Expect the
last line:
`stage: ../output-stage095/pages/BeltBattles-0.9.5-93f3e46f4697-online.html -> deploy/public/index.html (691285 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
A byte-identical copy elsewhere (for example in /home/cap/deliveries/beltbattles/) stages the same way; the line then
names that path.
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
  secrets, and writes the bundled bb-0.9.3 pool (120 ghosts: 3 per hero per day for the four heroes; the seed pool v3,
  each ghost holding one rune for each dawn, a race ghost with its run seed). It checks all 120 first (the strict
  decoder, the rules, validateUpload in the player mode with its exact rune count, a reachable record, no duplicates)
  and writes nothing if one fails. Expect a `seed: rules bb-0.9.3, 120 pool ghosts on tigris (...)` line with
  `0 written, 120 unchanged, 0 removed` at 0.9.5's launch: 0.9.3's launch (section 21) wrote the bb-0.9.3 pool, 0.9.4's
  (section 22) re-seeded it unchanged, and 0.9.5's bundled pool is the same 120 ghosts (a re-deploy of the same image
  reads the same). Only a bucket with no
  bb-0.9.3 ghost yet reads `120 written, 0 unchanged, 0 removed`. The seed touches only `ghosts/bb-0.9.3/dNN/pool/`: the
  bb-0.9.1, bb-0.9.0, bb-0.8.7, bb-0.8.6, bb-0.8.3 and bb-0.8.0 ghosts and uploads (and bb-0.6.1's) stay under their own
  prefixes, and no player upload is touched. Pool ghosts carry no player name: the name check is POST /v1/ghosts's
  alone.
  If the release command fails, the deploy stops and nothing is replaced; the output names the failing step.
- flyctl does not print the release command's own output: the deploy log shows only `release_command <machine>
  completed successfully` (LIVE-080 section 4). The `seed: …` line is in `fly logs -a beltbattles --no-tail`
  (section 8), another call.
- `--ha=false` keeps one machine; `fly status` should show exactly one `app` machine, `started` with its health check
  `passing`, or stopped until the first request (auto-stop). The rolling update can leave the machine `stopped`, with
  checks `1 total, 1 warning`, as the 0.8.0 deploy did (LIVE-080 section 4). The first request starts it.

## 5. Live checks (one call)

```sh
curl -sS https://beltbattles.fly.dev/v1/health; echo; curl -sS -o /dev/null -w 'http -> %{http_code} %{redirect_url}\n' http://beltbattles.fly.dev/; curl -sS -D - -o /dev/null https://beltbattles.fly.dev/ | grep -i -E '^(HTTP|content-type|content-length|cache-control|x-content-type-options|referrer-policy)'; curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.9.5 online page (cmp)'; curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.9.3&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0'; curl -sS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.9.3&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | head -c 300; echo; curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts; fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'
```

Expect, in order:
1. `{"ok":true,"rules":"bb-0.9.3","store":"tigris","ghosts":…,"uploads":"closed","uptimeS":…}`, and
   `"uploads":"open"` once the uploads step (section 9) is live. `ghosts` counts what the lazy bucket cache has read
   so far; 0 right after a start is normal.
2. `http -> 301 https://beltbattles.fly.dev/` (force_https).
3. `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `content-length: 691285` (0.9.4's page: 691202; 0.9.3's: 691113; 0.9.2's: 696831; 0.9.1's: 696824; 0.9.0's: 695449; 0.8.9's: 672501; 0.8.8's: 670455; 0.8.7's: 634882; 0.8.6's: 607541; 0.8.5's: 598639; 0.8.4's: 591654; 0.8.3's: 590294; 0.8.2's: 589217; 0.8.1's: 587335; 0.8.0's: 578419),
   `cache-control: no-cache`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
4. `live page = the staged 0.9.5 online page (cmp)` (no line at all means a mismatch).
5. Ten lines `…day=N… -> 200`, days 1-10: a new player (`runs=0`, D2: seed ghosts only) with 0 wins and
   5 lives gets a ghost with no better record (D1: fewer wins, or as many and no more lives; here a 0-win ghost).
   Every day has 12 seed ghosts, 4 of them on the day's floor record.
6. Day 3's body for a new player on 1 win, 5 lives: `{"id":"g…","snapshot":{"v":3,"rules":"bb-0.9.3",…,"day":3,`
   with at most 1 win, from any of the four heroes. Under bb-0.9.3 a seed ghost holds one rune for each dawn, so it
   travels as v3, as a served player upload does: with its runes and without its run seed (the server never serves
   one).
7. `{"error":"uploads are not open yet"} -> 403` while uploads are closed. Once they are open (section 9), the same
   unsigned POST gets `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
8. The admin tool's read-only list on the machine (section 7): 12 seed-pool ghosts a day, 0 uploads, 0 players;
   `all 120 0 0`. Once uploads are open, the uploads and players columns also count the players' uploads: `all 120 N P`
   for N uploads by P players.
Optional, separately: the rate limit, `curl -sS -o /dev/null -w '%{http_code}\n' 'https://beltbattles.fly.dev/v1/health?burst=[1-130]' | sort | uniq -c`:
about `120 200` and the rest `429` (120/min per client IP, keyed on Fly-Client-IP). Wait 60 s before
re-running any check from this machine.

**Older pages.** A browser that still holds an older page (no-cache: a reload gets the live page) asks for its own rules'
ghosts. It gets that rules' seed ghosts if the bucket still holds them, otherwise a 404, and then it fights its own
stand-in. Its uploads are refused: 403 while uploads are closed, 422 (foreign rules) once they open. Under 0.9.5 the
0.9.4 and 0.9.3 pages are the exceptions: they play the same rules, bb-0.9.3, so they meet the same ghosts and their
uploads are taken. The 0.9.2 page (and the 0.9.1 page) still gets the bb-0.9.1 ghosts the bucket holds, but its
uploads answer 422, because this server validates bb-0.9.3. The 0.9.0 page gets the bb-0.9.0 ghosts, the 0.8.7, 0.8.8
and 0.8.9 pages the bb-0.8.7 ghosts, and theirs answer 422 too.

## 6. Cold start (after the machine auto-stops)

Leave the app idle for about 10 minutes (no requests), then:

```sh
fly machine list -a beltbattles && curl -sS -o /dev/null -w 'cold health: %{http_code} in %{time_total}s\n' https://beltbattles.fly.dev/v1/health && curl -sS -o /dev/null -w 'first match after start: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.9.3&day=3&wins=1&lives=5&player=runbook-cold&seen=&runs=0' && curl -sS -o /dev/null -w 'warm match: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.9.3&day=3&wins=1&lives=5&player=runbook-cold&seen=&runs=0' && fly machine list -a beltbattles
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
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.3'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs wipe-uploads --rules bb-0.9.3'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs remove-player <playerId> --rules bb-0.9.3'
```

- Every command but `list` is a DRY RUN unless `--apply` is added: it prints each record it would delete
  (key, kind, day, ghost id, player, reason), then `DRY RUN: nothing was deleted`. Read the plan, then run the
  same command again with `--apply`; it deletes exactly the planned records.
- `--rules` is required; nothing of another rules version is read or touched. `revalidate` runs only for this
  build's rules (bb-0.9.3): every upload through the strict decoder, the exact rules, the rules and hero gates,
  validateUpload in the player mode (the runes' exact count, one for each dawn, their ids, repeats and dormant runes
  too), the reachable-record check and the player name (the checks POST /v1/ghosts makes, so a bb-0.9.3 store should
  never list a record, name or rune failure).
  It does not re-derive the dawn offers from the stored run seed: that rune check is POST's alone. It can't re-check
  signatures: the server keeps neither keys nor signatures.
- The seed pool is never deleted, except by `wipe-uploads --pool` (the next deploy's release command writes it
  back). `remove-player` never touches a seed ghost.
- Exit 2 is a refused command line (nothing read); exit 1 means fewer records were deleted than planned.
- **After an `--apply` the running server keeps serving deleted ghosts** from its bucket cache until
  BB_GHOST_CACHE_TTL_S (600 s) passes or the machine restarts. To make it take effect at once:
  `fly apps restart beltbattles`, then check the match route.
- Old pools: the bb-0.9.1, bb-0.9.0, bb-0.8.7, bb-0.8.6, bb-0.8.3 and bb-0.8.0 pools and uploads, and the bb-0.6.1
  pool (and bb-0.6.2's, had 0.7.0 gone live), can stay; they serve only older cached pages.
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

Rolling back to the previous image (the last call's releases-before file names it; for 0.9.5 that is 0.9.4's release,
v15, image registry.fly.io/beltbattles:deployment-01M48T7AKR4SABBBPG50RJD9YG, its page on the same rules bb-0.9.3)
serves its page and the same pool: its release command re-seeds the bb-0.9.3 pool (`0 written, 120 unchanged, 0
removed`). Back on 0.9.4, the bb-0.9.3 pool and every bb-0.9.3 upload stay in use, since 0.9.4 plays the same rules.
The release before it is 0.9.3's v14 (image registry.fly.io/beltbattles:deployment-01M48K69FETC5MGGD2C8J7WBTY), on the
same rules too.

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

**Not run from this clone.** When 0.8.4 was cut, this call's L4 (esc_d461cc44-a4e) was still pending. The section is
kept as written in the clone beltbattles-r083/BeltBattles-r083 on release-083's tip d909701, and its call names that
clone and tip. 0.8.4 (section 13) is built on d909701 and ships this change too. If this call ran there first,
LIVE-083 records it. Never run it once section 13's call has run.

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

## 13. 0.8.4: a roomier build screen on phones (a new page; its own L4)

**Ran** from beltbattles-r084/BeltBattles-r084 (branch release-084, tip e81a667) on 2026-10-03 at about 22:04Z:
release v6, LIVE-084. Never run it again: section 14's call ships what came after.

0.8.4 ships the phone zoom-out on the live server: REQ-BFG-040, after the operator's "still not seeing the full
description of the item on tap. We can zoom out our ui quite a bit on mobile. It's too crammed" (on 0.8.1). On a phone
held upright (its short side under 500 CSS px) the build screen now draws its art smaller, never more than 1.75 CSS px
per art pixel (x5 instead of x7 on a 402x690 page at DPR 3), so the band for a part's description grows from about 3 px
to 122 px and most panels fit there whole; the rest still grow over the shop with their whole text, as in 0.8.3.
Desktops, tablets, landscape phones and every other screen are unchanged. 0.8.4 is built on 0.8.3 (section 12), so it
also ships the tap fix and the title-screen fix. The operator's word, 2026-10-03 at about 16:2xZ: "Nah, just launch to
fly when ready."

**What ships.** Branch release-084 at its tip, in this clone: release-083 (d909701: release-082 7669e36, the four tap
commits, 0.8.3's label and its release record), the three zoom commits (81ec126, 9aebd41, 9123140, cherry-picked from 30b1d668's
verified release-zoom: 4d74345, 910ede2, af9ad62, made on release-tap f7db355), the 0.8.4 label (5f75f55) and the release record
(GAME_BUILD.txt and this section). Only the page changes:
- The page is the 0.8.4 online page that GAME_BUILD.txt records (591,654 bytes, sha256 `bc576ea38e39ff9d…`). It is the zoom
  page 30b1d668 verified at af9ad62 (sha256 `abdff164fd423917…`) byte for byte, except one run of bytes: the label
  `0.8.1` -> `0.8.4` (kit/pagediff.mjs).
- The server is v5's: since 36fb391 no line changed under server/, src/sim or src/net, and fly.toml, the Dockerfile
  and .dockerignore are unchanged (uploads-080's), so uploads stay open. The call's stage step builds server/dist from
  the tip.
- RULES_VERSION stays bb-0.8.0 and the sim fingerprint stays 06bd515c6244ba0c, so live ghosts and uploads stay valid.
  The release command re-seeds the same pool (`0 written, 120 unchanged, 0 removed`) and touches no upload.

No probe runs: the server is the one the uploads step probed (LIVE-U080), and every upload in the store is a player's.

**Sections 11 and 12.** 0.8.2's call (in beltbattles-r082, tip 7669e36) and 0.8.3's call (in beltbattles-r083, tip
d909701) were both still waiting for their L4s when this section was written. Whether or not either ran first, this
call ships the page above. Once this call has run, never run section 11's or section 12's.

**Working directory:** this clone, branch release-084 (see the header). The call refuses unless HEAD is the tip named
in output-r084/CMD-084.txt (beside this clone) and the tree is clean.

**The call.** output-r084/CMD-084.txt is exactly this, with `<TIP>` filled in (a commit can't name its own hash):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r084/BeltBattles-r084 || exit 1; [ "$(git rev-parse --short=7 HEAD)" = <TIP> ] || { echo "refused: HEAD is $(git rev-parse --short=7 HEAD), not <TIP>"; exit 1; }; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r084/ref/pages/BeltBattles-0.8.4-5f75f5532043-online.html 2>&1 | tail -1 && fly releases -a beltbattles --image > ../output-r084/releases-before.txt 2>&1 && fly deploy --ha=false --remote-only 2>&1 | tee ../output-r084/run-deploy.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"uploads":"open"' && curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.4 online page (cmp)' && curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0' > ../output-r084/days.txt && cat ../output-r084/days.txt && [ "$(grep -c -- '-> 200$' ../output-r084/days.txt)" = 10 ] && curl -fsS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.0&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | grep -o '"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"[a-z]*","day":3,"wins":[01],"lives":[0-9]' && echo 'day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0' && curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts | grep -- '-> 401$' && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.0' && fly releases -a beltbattles --image > ../output-r084/releases-after.txt 2>&1 && head -4 ../output-r084/releases-after.txt
```

In order, it:
1. sets `pipefail` and enters this clone;
2. refuses unless HEAD is `<TIP>` and the tree is clean;
3. stages the 0.8.4 online page from ../ref/pages/ (call 3), which also builds server/dist from the tip;
4. saves the release list with image refs to ../output-r084/releases-before.txt: what was live (v5, or the release of
   section 11's or section 12's call if one ran first);
5. deploys (call 4), keeping the whole log in ../output-r084/run-deploy.txt and showing its last 30 lines;
6. runs `fly status`;
7. reads health, which must say uploads are open, or the call stops. It is the first request after the update, so it
   also starts a machine the update left stopped; `--retry 3` covers that start;
8. compares the live page with the staged one;
9. asks for a match on each of days 1-10, as a new player with 0 wins and 5 lives: all ten must answer 200
   (../output-r084/days.txt);
10. asks for one match, day 3 with 1 win and 5 lives, as a new player: 200 with rules bb-0.8.0;
11. sends an unsigned POST, which must get 401 (uploads open; a signature is required);
12. lists the store on the machine (read only);
13. saves the release list again, to ../output-r084/releases-after.txt, and shows its first lines.

Every step after the guards is chained with `&&`, so the first failure stops the call.

**Expect, step by step** (the call's own text with Fly stubbed on 127.0.0.1: output-r084/RUN-cmd-sim-084.log):
- Steps 1-2: no output.
- Step 3: `stage: ../ref/pages/BeltBattles-0.8.4-5f75f5532043-online.html -> deploy/public/index.html (591654 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
- Step 4: no output. Its file lists the live release first: v5 (0.8.1, uploads open), or 0.8.2's or 0.8.3's if section
  11's or section 12's call ran.
- Step 5: as in 0.8.1 (LIVE-081): `release_command … completed successfully` (in `fly logs`, the seed reads
  `0 written, 120 unchanged, 0 removed`); the one machine updated; DNS verified; the app's URL.
- Step 6: exactly one `app` machine on the new version. It is `started` with its check `passing`, or `stopped` until
  the next request.
- Step 7: `{"ok":true,"rules":"bb-0.8.0","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`.
- Step 8: `live page = the staged 0.8.4 online page (cmp)`.
- Step 9: ten lines `…day=N… -> 200`, days 1-10.
- Step 10: `"snapshot":{"v":2,"rules":"bb-0.8.0","hero":"…","day":3,"wins":…,"lives":…`, then
  `day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.0`.
- Step 11: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
- Step 12: the list: the header, ten day rows, then `all 120 N P` (padded columns), for N uploads by P players since
  uploads opened.
- Step 13: the newest release first, on a new image; the release that was live before it below.

**Rollback** (its own L4, after telling the operator). Back to the release that was live before this call, the newest
in ../output-r084/releases-before.txt: v5 (0.8.1's page), or 0.8.2's or 0.8.3's release if section 11's or section
12's call ran first. The server and uploads are the same either way. Deploy that image from this clone. A deploy by
image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte for byte, so the old image
runs as it did:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in ../output-r084/releases-before.txt>
```

Then health must say `"uploads":"open"`, and the live page must be the old one: 0.8.1's (587,335 bytes), 0.8.2's
(589,217 bytes) or 0.8.3's (590,294 bytes). Section 10's rollback (v4's image) takes the page back to 0.8.0's; closing
uploads is still section 9's rollback.

**If a step fails:** output-r084/CMD-084-EXPECT.md says, step by step, whether to roll back or to fix these docs.

## 14. 0.8.5: gold upgrades and more belts (new rules bb-0.8.3; its own L4)

**Ran** from beltbattles-r085/BeltBattles-r085 (branch release-085, tip 52c0b43) on 2026-10-04 at about 08:04Z:
release v7, LIVE-085. Never run it again: section 15's call ships what came after.

0.8.5 ships BELTS on the live server: REQ-BFG-043, REQ-BFG-044 and REQ-BFG-032, after the operator's word of 2026-10-03
at about 22:10Z: "I've decided turret speed and upgrading hero factories should be an action that you can do by
default. 10g then 20g then 30g. ... making starter turrets and factories upgradable out of shop cycle should give a good
strategic money sink." Every hero gets two gold upgrades outside the shop: TURRET SPEED (its starting turrets) and
FACTORY (its own factory), each from level 1 to 4 for 10, 20 and 30 gold. A factory feeds more belts: a bought one 2/3/4
by its stars (the GANTRY PRESS 3/4/5), the hero's own 2/3/4/5 by its level (the LOOM 3/4/5/6). The hero's factory is
never offered in a shop. T47 (REQ-BFG-047): no text that BELTS added shows a decimal.

**What ships.** Branch release-085 at its tip, in this clone: release-084's e81a667 (live as v6), BELTS runs 1-5 (to
3196877), T47 (0799249), the 0.8.5 label (70c5b21) and the release record (GAME_BUILD.txt and this section).
- The page is the 0.8.5 online page that GAME_BUILD.txt records (598,639 bytes, sha256 `7c22d4617a3dda76…`), built at
  70c5b21.
- The rules move to bb-0.8.3 (RULES_VERSION), with BELTS' pinned sim fingerprint (ref/h2/fp-final-3196877.json beside
  this clone: 949,007 bytes, sha256 `2e20449c802aadc6…`; identical at the tip). The server is built from the tip: its
  strict decoder and record check take the upgrade levels, and its bundled seed pool is bb-0.8.3's (120 ghosts, 12 a
  day).
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's), so uploads stay open. Under deploy/, only
  GAME_BUILD.txt and this runbook changed.
- The release command seeds the bb-0.8.3 pool for the first time (`120 written, 0 unchanged, 0 removed`). The bb-0.8.0
  ghosts and uploads stay under their own prefix and match only 0.8.0-0.8.4 pages; a 0.8.5 page asks for and uploads
  bb-0.8.3 ghosts only.

No probe runs: the upload path is the one the uploads step probed (LIVE-U080), now on the new rules, and BELTS' upload
tests cover the upgrade levels on both stores.

**The version guard (backlog #341).** Step 2c reads the version label on the page Fly serves and on the page this call
stages. It refuses unless the staged label is 0.8.5 and the live one is not newer (equal passes: a re-run), and it
refuses when either label can't be read. It runs before anything is staged or deployed, so a stale approved call can
never roll Fly back.

**Working directory:** this clone, branch release-085 (see the header). The call refuses unless HEAD is the tip named
in output-r085/CMD-085.txt (beside this clone), the tree is clean and the version guard passes.

**The call.** output-r085/CMD-085.txt is exactly this, with `<TIP>` filled in (a commit can't name its own hash):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r085/BeltBattles-r085 || exit 1; [ "$(git rev-parse --short=7 HEAD)" = <TIP> ] || { echo "refused: HEAD is $(git rev-parse --short=7 HEAD), not <TIP>"; exit 1; }; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; v=$(grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)' /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r085/ref/pages/BeltBattles-0.8.5-70c5b21eed24-online.html); l=$(curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/ | grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'); [ "$v" = 0.8.5 ] && [ -n "$l" ] && [ "$(printf '%s\n%s\n' "$l" "$v" | sort -V | tail -1)" = "$v" ] || { echo "refused: Fly serves ${l:-an unreadable version} and the staged page is ${v:-unreadable}; never deploy over a newer version"; exit 1; }; echo "version guard: Fly serves $l, the staged page is $v"; node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r085/ref/pages/BeltBattles-0.8.5-70c5b21eed24-online.html 2>&1 | tail -1 && fly releases -a beltbattles --image > ../output-r085/releases-before.txt 2>&1 && fly deploy --ha=false --remote-only 2>&1 | tee ../output-r085/run-deploy.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"rules":"bb-0.8.3"' | grep '"uploads":"open"' && curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.5 online page (cmp)' && curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.3&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0' > ../output-r085/days.txt && cat ../output-r085/days.txt && [ "$(grep -c -- '-> 200$' ../output-r085/days.txt)" = 10 ] && curl -fsS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.3&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | grep -o '"snapshot":{"v":2,"rules":"bb-0.8.3","hero":"[a-z]*","day":3,"wins":[01],"lives":[0-9]' && echo 'day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.3' && curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts | grep -- '-> 401$' && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.3' && fly releases -a beltbattles --image > ../output-r085/releases-after.txt 2>&1 && head -4 ../output-r085/releases-after.txt
```

In order, it:
1. sets `pipefail` and enters this clone;
2. refuses unless HEAD is `<TIP>` and the tree is clean, then runs the version guard: it refuses unless the staged page
   is 0.8.5 and Fly serves 0.8.5 or older;
3. stages the 0.8.5 online page from ../ref/pages/ (call 3), which also builds server/dist from the tip;
4. saves the release list with image refs to ../output-r085/releases-before.txt: what was live (v6, 0.8.4);
5. deploys (call 4), keeping the whole log in ../output-r085/run-deploy.txt and showing its last 30 lines;
6. runs `fly status`;
7. reads health, which must say the rules are bb-0.8.3 and uploads are open, or the call stops. It is the first request
   after the update, so it also starts a machine the update left stopped; `--retry 3` covers that start;
8. compares the live page with the staged one;
9. asks for a bb-0.8.3 match on each of days 1-10, as a new player with 0 wins and 5 lives: all ten must answer 200
   (../output-r085/days.txt);
10. asks for one match, day 3 with 1 win and 5 lives, as a new player: 200 with rules bb-0.8.3;
11. sends an unsigned POST, which must get 401 (uploads open; a signature is required);
12. lists the bb-0.8.3 store on the machine (read only);
13. saves the release list again, to ../output-r085/releases-after.txt, and shows its first lines.

Every step after the guards is chained with `&&`, so the first failure stops the call.

**Expect, step by step** (the call's own text with Fly stubbed on 127.0.0.1: output-r085/RUN-cmd-sim-085.log):
- Steps 1 and 2: `version guard: Fly serves 0.8.4, the staged page is 0.8.5`, and nothing else.
- Step 3: `stage: ../ref/pages/BeltBattles-0.8.5-70c5b21eed24-online.html -> deploy/public/index.html (598639 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
- Step 4: no output. Its file lists the live release first: v6 (0.8.4, rules bb-0.8.0, uploads open).
- Step 5: `release_command … completed successfully` (in `fly logs`, the seed reads `seed: rules bb-0.8.3, 120 pool
  ghosts on tigris (...)` with `120 written, 0 unchanged, 0 removed`); the one machine updated; DNS verified; the
  app's URL.
- Step 6: exactly one `app` machine on the new version. It is `started` with its check `passing`, or `stopped` until
  the next request.
- Step 7: `{"ok":true,"rules":"bb-0.8.3","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`.
- Step 8: `live page = the staged 0.8.5 online page (cmp)`.
- Step 9: ten lines `…day=N… -> 200`, days 1-10.
- Step 10: `"snapshot":{"v":2,"rules":"bb-0.8.3","hero":"…","day":3,"wins":…,"lives":…`, then
  `day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.3`.
- Step 11: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
- Step 12: the list: the header, ten day rows of 12 seed-pool ghosts, then `all 120 0 0` (padded columns): no bb-0.8.3
  uploads yet.
- Step 13: the newest release first, on a new image; v6 below it.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Fly then serves a newer release, or a label could not be read. Leave
Fly as it is and never run this call again.

**Rollback** (its own L4, after telling the operator). Back to v6 (0.8.4's page on the rules bb-0.8.0), the newest
release in ../output-r085/releases-before.txt (image deployment-01M41WP31Q2RRMWNNA58H4XQ1W when this was written).
Deploy that image from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is
uploads-080's byte for byte, so the old image runs as it did:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in ../output-r085/releases-before.txt>
```

Then health must say `"rules":"bb-0.8.0"` and `"uploads":"open"`, and the live page must be 0.8.4's (591,654 bytes).
v6's release command re-seeds the bb-0.8.0 pool (`0 written, 120 unchanged, 0 removed`). The bb-0.8.3 pool and any
bb-0.8.3 uploads stay in the bucket under their own prefix, ready for a roll forward; 0.8.4 pages never ask for them.

**If a step fails:** output-r085/CMD-085-EXPECT.md says, step by step, whether to roll back or to fix these docs.

## 15. 0.8.6: belt and armor packs, and player names (new rules bb-0.8.6; its own L4)

**Status when 0.8.7 was staged** (release-087, 2026-10-04): kept as written in the clone beltbattles-r086/BeltBattles-r086
(branch release-086, tip c57de36); this clone holds no record that it ran. Never run it once section 16's launch has
run: Fly then serves 0.8.7, and its version guard refuses a staged 0.8.6 page.

0.8.6 ships PACKS on the live server: REQ-BFG-051 and REQ-BFG-063, after the operator's words of 2026-10-04: "Shops
should always offer belt packs and armor packs." (about 03:10Z) and "Players should have to set a name at the
beginning of game setup so their builds get tracked." Every shop visit has two fixed offers outside the roll: a BELT
PACK (2 gold, +4 belt) and an ARMOR PACK (5 gold, +25 hull), bought again and again with no cap; the belt crate and the
hull plating left the rolled stock. Every player picks a name (2 to 10 characters: A-Z, 0-9, space, hyphen) before the
first run. Every bb-0.8.6 upload carries it, and a foe's intro reads `VS NAME#TAG · W-L` (the tag comes from the
player id; a nameless foe shows WANDERER).

**What ships.** Branch release-086 at its tip, in this clone: release-085's 52c0b43 (live as v7), PACKS runs 1-2 (to
3ebeaa6), the 0.8.6 label (cb75851), the release record (GAME_BUILD.txt and this section) and a test-only commit (tests/packs.rules'
label pin; touchcheck's OPTIONS wait), which is `<TIP>`.
- The page is the 0.8.6 online page that GAME_BUILD.txt records (607,541 bytes, sha256 `77aaa7ca0ed842c4…`), built at
  cb75851.
- The rules move to bb-0.8.6 (RULES_VERSION), with PACKS' pinned sim fingerprint (ref/h2/fp-final-d4c6728.json beside
  this clone: 937,341 bytes, sha256 `c04d889f82f2901e…`; identical at the tip). The server is built from the tip: its
  strict decoder and record check cost the packs against the day's gold, POST /v1/ghosts requires a valid player name
  on every bb-0.8.6 upload (422 with its reason), and its bundled seed pool is bb-0.8.6's (120 ghosts, 12 a day,
  nameless by design: the seed writes them directly, never through POST).
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's), so uploads stay open. Under deploy/, only
  GAME_BUILD.txt and this runbook changed.
- The release command seeds the bb-0.8.6 pool for the first time (`120 written, 0 unchanged, 0 removed`). The bb-0.8.3
  ghosts and uploads stay under their own prefix and match only 0.8.5 pages; a 0.8.6 page asks for and uploads
  bb-0.8.6 ghosts only.

No probe runs: the upload path is the one the uploads step probed (LIVE-U080), now on the new rules, and PACKS' upload
tests cover the packs and the names on both stores.

**The version guard (backlog #341).** Step 2c reads the version label on the page Fly serves and on the page this call
stages. It refuses unless the staged label is 0.8.6 and the live one is not newer (equal passes: a re-run), and it
refuses when either label can't be read. It runs before anything is staged or deployed, so a stale approved call can
never roll Fly back.

**Working directory:** this clone, branch release-086 (see the header). The call refuses unless HEAD is the tip named
in output-r086/CMD-086.txt (beside this clone), the tree is clean and the version guard passes.

**The call.** output-r086/CMD-086.txt is exactly this, with `<TIP>` filled in (a commit can't name its own hash):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r086/BeltBattles-r086 || exit 1; [ "$(git rev-parse --short=7 HEAD)" = <TIP> ] || { echo "refused: HEAD is $(git rev-parse --short=7 HEAD), not <TIP>"; exit 1; }; [ -z "$(git status --porcelain)" ] || { echo "refused: the tree is not clean"; exit 1; }; v=$(grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)' /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r086/ref/pages/BeltBattles-0.8.6-cb7585130d52-online.html); l=$(curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/ | grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'); [ "$v" = 0.8.6 ] && [ -n "$l" ] && [ "$(printf '%s\n%s\n' "$l" "$v" | sort -V | tail -1)" = "$v" ] || { echo "refused: Fly serves ${l:-an unreadable version} and the staged page is ${v:-unreadable}; never deploy over a newer version"; exit 1; }; echo "version guard: Fly serves $l, the staged page is $v"; node deploy/stage.mjs /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r086/ref/pages/BeltBattles-0.8.6-cb7585130d52-online.html 2>&1 | tail -1 && fly releases -a beltbattles --image > ../output-r086/releases-before.txt 2>&1 && fly deploy --ha=false --remote-only 2>&1 | tee ../output-r086/run-deploy.txt | tail -30 && fly status -a beltbattles && sleep 5 && curl -fsS --retry 3 --retry-delay 2 https://beltbattles.fly.dev/v1/health | grep '"rules":"bb-0.8.6"' | grep '"uploads":"open"' && curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.8.6 online page (cmp)' && curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.6&day=[1-10]&wins=0&lives=5&player=runbook-check&seen=&runs=0' > ../output-r086/days.txt && cat ../output-r086/days.txt && [ "$(grep -c -- '-> 200$' ../output-r086/days.txt)" = 10 ] && curl -fsS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.8.6&day=3&wins=1&lives=5&player=runbook-check&seen=&runs=0' | grep -o '"snapshot":{"v":2,"rules":"bb-0.8.6","hero":"[a-z]*","day":3,"wins":[01],"lives":[0-9]' && echo 'day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.6' && curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts | grep -- '-> 401$' && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.8.6' && fly releases -a beltbattles --image > ../output-r086/releases-after.txt 2>&1 && head -4 ../output-r086/releases-after.txt
```

In order, it:
1. sets `pipefail` and enters this clone;
2. refuses unless HEAD is `<TIP>` and the tree is clean, then runs the version guard: it refuses unless the staged page
   is 0.8.6 and Fly serves 0.8.6 or older;
3. stages the 0.8.6 online page from ../ref/pages/ (call 3), which also builds server/dist from the tip;
4. saves the release list with image refs to ../output-r086/releases-before.txt: what was live (v7, 0.8.5);
5. deploys (call 4), keeping the whole log in ../output-r086/run-deploy.txt and showing its last 30 lines;
6. runs `fly status`;
7. reads health, which must say the rules are bb-0.8.6 and uploads are open, or the call stops. It is the first request
   after the update, so it also starts a machine the update left stopped; `--retry 3` covers that start;
8. compares the live page with the staged one;
9. asks for a bb-0.8.6 match on each of days 1-10, as a new player with 0 wins and 5 lives: all ten must answer 200
   (../output-r086/days.txt);
10. asks for one match, day 3 with 1 win and 5 lives, as a new player: 200 with rules bb-0.8.6;
11. sends an unsigned POST, which must get 401 (uploads open; a signature is required);
12. lists the bb-0.8.6 store on the machine (read only);
13. saves the release list again, to ../output-r086/releases-after.txt, and shows its first lines.

Every step after the guards is chained with `&&`, so the first failure stops the call.

**Expect, step by step** (the call's own text with Fly stubbed on 127.0.0.1: output-r086/RUN-cmd-sim-086.log):
- Steps 1 and 2: `version guard: Fly serves 0.8.5, the staged page is 0.8.6`, and nothing else.
- Step 3: `stage: ../ref/pages/BeltBattles-0.8.6-cb7585130d52-online.html -> deploy/public/index.html (607541 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
- Step 4: no output. Its file lists the live release first: v7 (0.8.5, rules bb-0.8.3, uploads open).
- Step 5: `release_command … completed successfully` (in `fly logs`, the seed reads `seed: rules bb-0.8.6, 120 pool
  ghosts on tigris (...)` with `120 written, 0 unchanged, 0 removed`); the one machine updated; DNS verified; the
  app's URL.
- Step 6: exactly one `app` machine on the new version. It is `started` with its check `passing`, or `stopped` until
  the next request.
- Step 7: `{"ok":true,"rules":"bb-0.8.6","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`.
- Step 8: `live page = the staged 0.8.6 online page (cmp)`.
- Step 9: ten lines `…day=N… -> 200`, days 1-10.
- Step 10: `"snapshot":{"v":2,"rules":"bb-0.8.6","hero":"…","day":3,"wins":…,"lives":…`, then
  `day 3 match (new player, 1W 5 lives) -> 200, rules bb-0.8.6`.
- Step 11: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
- Step 12: the list: the header, ten day rows of 12 seed-pool ghosts, then `all 120 0 0` (padded columns): no bb-0.8.6
  uploads yet.
- Step 13: the newest release first, on a new image; v7 below it.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Fly then serves a newer release, or a label could not be read. Leave
Fly as it is and never run this call again.

**Rollback** (its own L4, after telling the operator). Back to v7 (0.8.5's page on the rules bb-0.8.3), the newest
release in ../output-r086/releases-before.txt (image deployment-01M42Z1NJFNVBMGE8DBN5F27QC when this was written).
Deploy that image from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is
uploads-080's byte for byte, so the old image runs as it did:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in ../output-r086/releases-before.txt>
```

Then health must say `"rules":"bb-0.8.3"` and `"uploads":"open"`, and the live page must be 0.8.5's (598,639 bytes).
v7's release command re-seeds the bb-0.8.3 pool (`0 written, 120 unchanged, 0 removed`). The bb-0.8.6 pool and any
bb-0.8.6 uploads stay in the bucket under their own prefix, ready for a roll forward; 0.8.5 pages never ask for them.

**If a step fails:** output-r086/CMD-086-EXPECT.md says, step by step, whether to roll back or to fix these docs.

## 16. 0.8.7: runes (new rules bb-0.8.7, the bb-0.8.6 pools carried; its own L4)

**Status: done.** Its call (output-stage087/CMD-087.txt in the clone beltbattles-r087/BeltBattles-r087, branch
release-087, tip 14633e4) ran on 2026-10-04: 0.8.7 is live as release v9 since 21:40:50Z. This section is kept as written
there. Never run it again: once 0.8.8's launch (section 17 in the clone beltbattles-r088) has run, Fly serves 0.8.8,
and its version guard refuses a staged 0.8.7 page.

0.8.7 ships RUNES on the live server: REQ-BFG-058, pick-a-rune run boosts with rarities. Every dawn a run picks one
rune: 1 of 3 cards on days 1-4, 1 of 2 from day 5, the first on day 1. The catalogue holds 57 runes (21 common, 20 rare,
11 epic, 5 legendary); day 1 offers commons only, no legendary shows before day 5, and a held rune is never offered
again. The held runes sit in the rune bar on the build screen, and FIGHT waits until the day's rune is taken. A run's
ghost carries its runes and its run seed (snapshot v3), and the server re-derives each dawn's offer from that seed.

**What ships.** Branch release-087 at its tip, in this clone: release-086's c57de36 (0.8.6), RUNES-1, RUNES-2a,
RUNES-087 and RUNES-087F (to 12d54c8) with the shots-list follow-up bdb4265, the 0.8.7 label (9f3ee6f), the release
record (GAME_BUILD.txt and this section) and a test-only commit (asynccheck takes day 1's dawn rune before it places a
part), which is the tip.
- The page is the 0.8.7 online page that GAME_BUILD.txt records (634,882 bytes, sha256 `e51c567ec87ebea0…`), built at
  9f3ee6f; it reads V0.8.7 on the title screen.
- The rules move to bb-0.8.7 (RULES_VERSION), but the bot pools don't move: POOL_RULES_CARRIED (src/sim/content.ts)
  carries bb-0.8.6's seed pool and stand-in pool forward unregenerated, and BOT_RUNES is off, so pool ghosts,
  stand-ins and captains hold no runes. A rune-less build battles exactly as at c57de36 (tests/runes.parity: 0 of 360
  battles differ), and PACKS' pinned sim fingerprint (fp-final-d4c6728.json, 937,341 bytes, sha256
  `c04d889f82f2901e…`; a copy is ../kit087/h2/ beside this clone) is identical at the tip.
- The server is built from the tip. Its strict decoder takes snapshot v3 (the run seed and the held runes) and refuses
  every other v3 field. POST /v1/ghosts re-derives each dawn's offer from the upload's run seed and answers 422 `deck
  failed validation` with a `rune: …` error for more runes than days, an unknown or repeated rune, or a rune its dawn
  didn't offer. The rules gate refuses runes under any rules before bb-0.8.7. The seed is stored, never served: a
  served ghost carries no seed. The name check of bb-0.8.6 stays.
- Its bundled seed pool is bb-0.8.6's 120 decks (12 a day), written under bb-0.8.7: the release command seeds the
  bb-0.8.7 pool for the first time (`120 written, 0 unchanged, 0 removed`). The bb-0.8.6 ghosts and uploads stay under
  their own prefix and match only 0.8.6 pages; a 0.8.7 page asks for and uploads bb-0.8.7 ghosts only.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's), so uploads stay open. Under deploy/, only
  GAME_BUILD.txt and this runbook changed.

No probe runs: the upload path is the one the uploads step probed (LIVE-U080), now on the new rules. tests/runes.snapshot
covers the rune check at POST /v1/ghosts (a legal upload stored with its seed, a rune its dawn didn't offer refused with
422 naming it, the served copy without its seed), and the release checks of ../output-stage087/REPORT.md ran the seed
and these live checks against the built server on a scratch store.

**The launch call is the Prime's.** The Prime writes it at launch, on section 15's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-087 tip named at launch and the tree is
   clean;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.8.7` on both 0.8.7 pages). It refuses unless the staged label is 0.8.7 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. Fly serves 0.8.6 if section 15's call ran
   first, otherwise 0.8.5 (v7); either passes;
3. stage the 0.8.7 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below, every step after the guards chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.8.7). Expect:
- health: `{"ok":true,"rules":"bb-0.8.7","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.8.7 online page (cmp)`, and `content-length: 634882`;
- a bb-0.8.7 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":2,"rules":"bb-0.8.7","hero":"…","day":3,"wins":…,
  "lives":…` (a seed ghost holds no v3 field, so it travels as v2);
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.8.7` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 0 0`;
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.8.7, 120 pool ghosts on tigris (...)` with `120 written,
  0 unchanged, 0 removed`.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.8.6's image (its page on the
rules bb-0.8.6) if section 15's call ran before this launch, otherwise v7, 0.8.5's page on the rules bb-0.8.3 (image
deployment-01M42Z1NJFNVBMGE8DBN5F27QC when this was written). Deploy that image from this clone. A deploy by image takes
its env from this directory's fly.toml, and this fly.toml is uploads-080's byte for byte, so the old image runs as it
did:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in the launch's releases-before file>
```

Then health must say `"uploads":"open"` and the old release's rules: `"rules":"bb-0.8.6"` with 0.8.6's page (607,541
bytes), or `"rules":"bb-0.8.3"` with 0.8.5's page (598,639 bytes) for v7. Its release command re-seeds its own pool
(`0 written, 120 unchanged, 0 removed`). The bb-0.8.7 pool and any bb-0.8.7 uploads stay in the bucket under their own
prefix, ready for a roll forward; older pages never ask for them.

## 17. 0.8.9: the captains' catch-up and the card fixes (the rules stay bb-0.8.7; its own L4)

**Status: done.** Its call (output-stage089/CMD-089.txt beside the clone beltbattles-r089/BeltBattles-r089, branch
release-089, tip 03903e9) ran on 2026-10-05: 0.8.9 is live as release v11 since about 10:14Z (LIVE-089). This section is
kept as written there. Never run it again: Fly serves 0.8.9 now, and once section 18's launch has run, Fly serves 0.9.0,
and its version guard refuses a staged 0.8.9 page.

0.8.8's launch was this section in the clone beltbattles-r088/BeltBattles-r088 (branch release-088, tip 4897eb5). It
runs there, before this one, and never from here. This section assumes it has run, so 0.8.8 is live (release v10
expected; the Prime confirms the number at launch).

0.8.9 ships two changes on top of 0.8.8's card faces:
- **The captains' catch-up** (CATCHUP-089; REQ-BFG-024, named computer builds built around synergies, and REQ-BFG-051,
  the shop's belt and armor packs; backlog #346 and #350). The par field has bought ARMOR PACKs since 0.8.6, so the
  computer captains buy them too. Each captain's plan adds ARMOR PACKs (5 gold, +25 hull each) up to the par field's
  mean count for its hero and day, with the gold the plan leaves over. The Hard stand-ins take their packs out of their
  road decks' gold upgrades (cap's ruling Q1 e2ca295ce9dcd60a, (B)). The Hard road decks still short of the par fields
  get free PvE plates on those days (fallback 2). Packs were trimmed back where they broke the ladder or the walls
  (cap's ruling Q2 f77489ebe2e11698). So the Hard captains stay a fight in the later days. The stand-in generator also
  writes POOL_RULES, the rules its pool was generated under (backlog #350).
- **The card fixes** (U2f; REQ-BFG-070 and REQ-BFG-046), display only. The shop card's grey "+1 ★2" badge becomes a
  wordless owned marker (two overlapped squares), and MERGE ★n, MAX and BUY+MERGE stay. The info view (ⓘ) grows
  taller, up over the shop on the phone and down the free column on the desk, so long card info fits on one page.
  Four long one-clause lines fit one line of the panel band, and docs/TEXT-STYLE.md gains three rules.

**What ships.** Branch release-089 at its tip, in this clone: release-088's 4897eb5 (0.8.8), CATCHUP-089's 7 commits
(catchup-089 = 13c6782, cherry-picked with -x onto 4897eb5, to 98e128c), U2f's 4 commits (u2f-089 = 8cae445,
cherry-picked with -x, to 20113fa), the 0.8.9 label (dfde5ac), the CHANGELOG commit (7808c9b) and the release record
(GAME_BUILD.txt and this section). A commit can't name its own hash, so the Prime names the tip at launch.
- The page is the 0.8.9 online page that GAME_BUILD.txt records (BeltBattles-0.8.9-7808c9bbe65a-online.html,
  672,501 bytes, sha256 `26e15c74e455d701…`), built at 7808c9b; it reads V0.8.9 on the title screen.
- The rules stay bb-0.8.7 (RULES_VERSION); POOL_RULES_CARRIED and BOT_RUNES stay as they are, and the seed and stand-in
  pools don't move. Since 4897eb5, only src/sim/rivalBuilds.ts and src/sim/harness/standins.ts changed under src/sim,
  server and src/net: the captains' plans and the stand-ins' harness. The battle sim is untouched, and parBench's
  fingerprint is 4daa5e5b, as at 4897eb5. The pinned sim fingerprint moved only in the captains' road decks (`rival/*`,
  124 of its 352 records). Its new pin is CATCHUP's fp-final-13c6782.json (937,919 bytes, sha256 `9393837475955d57…`;
  a copy is ../kit089/h2/ beside this clone), and it is identical at the tip.
- The server is built from the tip, from 0.8.7's server sources: its strict decoder, its record, name and rune checks
  and its bundled seed pool (bb-0.8.6's 120 decks, carried under bb-0.8.7) are 0.8.7's. roadCap's prize column is
  unchanged, so the upload check accepts and refuses what it did.
- 0.8.7, 0.8.8 and 0.8.9 pages play the same rules: each asks for and uploads bb-0.8.7 ghosts, so they meet each
  other's ghosts and uploads. A browser still on the 0.8.8 page keeps playing and uploading as before.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's), so uploads stay open. Under deploy/, only
  GAME_BUILD.txt and this runbook changed.

**The release command** re-seeds the bb-0.8.7 pool that 0.8.7's launch (release v9) wrote: `seed: rules bb-0.8.7, 120
pool ghosts on tigris (...)` with `0 written, 120 unchanged, 0 removed`.

No probe runs: the upload path is 0.8.7's, unchanged. The release checks of ../output-stage089/REPORT.md ran the seed and
these live checks against the built server on a scratch store.

**The launch call is the Prime's.** The Prime writes it at launch, on section 16's pattern (0.8.7's call is
output-stage087/CMD-087.txt in the clone beltbattles-r087), and runs it under its own operator approval (L4). In order,
it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-089 tip named at launch and the tree is
   clean;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.8.9` on both 0.8.9 pages). It refuses unless the staged label is 0.8.9 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. Fly serves 0.8.8 (0.8.8's launch, release
   v10 expected), so the guard expects to read 0.8.8 live, and that passes. If it reads 0.8.7 live instead, 0.8.8's
   launch has not run: stop there and ask the Prime, because this section's rollback goes to 0.8.8's release;
3. stage the 0.8.9 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below, every step after the guards chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.8.7, as at 0.8.7's and 0.8.8's launches). Expect:
- health: `{"ok":true,"rules":"bb-0.8.7","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.8.9 online page (cmp)`, and `content-length: 672501`;
- a bb-0.8.7 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":2,"rules":"bb-0.8.7","hero":"…","day":3,"wins":…,
  "lives":…` (a new player meets seed ghosts only, and a seed ghost holds no v3 field, so it travels as v2);
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.8.7` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 N P`.
  The uploads and players columns may be above 0, because 0.8.7 (live since 21:40:50Z) and then 0.8.8 take bb-0.8.7
  uploads (`all 120 0 0` if none came in yet);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.8.7, 120 pool ghosts on tigris (...)` with `0 written,
  120 unchanged, 0 removed`.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.8.8's release (v10
expected; the Prime confirms it at launch), 0.8.8's image (its page on the same rules bb-0.8.7; its image ref is in
that file). Deploy that image from this clone. A deploy by image takes its
env from this directory's fly.toml, and this fly.toml is uploads-080's byte for byte, so the old image runs as it did:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in the launch's releases-before file>
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.8.7"`, and the page must be 0.8.8's online page (670,455
bytes). Its release command re-seeds its own pool (`0 written, 120 unchanged, 0 removed`). Back on 0.8.8, the bb-0.8.7
pool and every bb-0.8.7 upload stay in use, since 0.8.8 plays the same rules.

## 18. 0.9.0: release X, numbers + sustain + runes, with Y1's card faces (new rules bb-0.9.0; its own L4)

0.8.9's launch was section 17, in the clone beltbattles-r089/BeltBattles-r089 (branch release-089, tip 03903e9). It ran
there: 0.8.9 is live as release v11 (image registry.fly.io/beltbattles:deployment-01M45RVRBEA9BVPEC1JFKRAPE4) since
2026-10-05 at about 10:14Z (LIVE-089). This section is 0.9.0's launch, from this clone.

0.9.0 ships release X and Y1's card faces, on new battle rules, bb-0.9.0:
- **Whole numbers** (REQ-BFG-047): every number on a card and in a fight is a whole number. Damage and hull use a scale
  ten times larger (an ARMOR PACK is +250 hull), speeds are whole numbers, and every time is in whole seconds.
- **Sustain** (REQ-BFG-069): parts and runes that SHIELD, HEAL or REGEN your hull during a fight join the game, from
  day 3: WARD BELL (it shields your hull every 8 seconds), MEND PRESS, MENDING LOOM and the sustain runes.
- **Rivals use runes** (REQ-BFG-058): the starting ghosts, the caravan's stand-ins and the captains take a rune at each
  dawn, as a player does (BOT_RUNES on; the captains' lists are CAPTAIN_RUNES). Four runes leave the dawn offer
  (SEARING, SHATTER SHOT, COAL CHUTE and HEAT SINK: DORMANT_RUNES), and SIFTER leaves the shop (DORMANT_ITEMS). DRAG
  CHAIN FOUNDRY stuns for 3 seconds at star 3, and the STALL word is now STUN.
- **The upload rule** (cap's ruling 5d6d83ef57d1494c): an upload must hold exactly one rune for each dawn it reached
  (`runes.length === day`, an absent field counting as none), in validateUpload's player mode, so POST /v1/ghosts
  refuses a run that skipped a pick. The device's own ghost pool still keeps an older ghost with fewer.
- **The caravan** (FIX-ABE): a part held back to a later day never takes a merchant's slot, so every caravan shows its
  full set of offers.
- **The captains** (REDO-X; rulings 97e639e5813acb37, 1cfdc5fff106d58f and e778dc5d38efd5fd) are fitted to the
  regenerated luck caps, so a few of their parts arrive a day or more later; THANE KARSK leaves his GALVANIC COIL out
  while sustain is on.
- **Y1's card faces** (REQ-BFG-070, REQ-BFG-046), display only: one-line faces for GALVANIC COIL, FROSTBITE FOUNDRY,
  HULLBREAKER, SALVO RACK, COMPOUND BREECH and TWIN MOULD; SLUG rows for TWIN MOULD and for MIMIC FORGE on FOUNDRY;
  TESLA ARC's arc damage as a stat; GATLING SPOOL's spin step in its ⓘ levels; FURNACE's two-line hero face; and the
  START: label on five battle-start runes.

**What ships.** Branch release-090 at its tip, in this clone: y1x f0fe94c (FLIP-X2's 357cabc, FIX-ABE's two picks,
REDO-X to 77d54b0 and Y1's 13 picks), the CARRY commit (e5a89b5), the 0.9.0 label (06c7a1a), the CHANGELOG commit
(7937d58), the test-harness fix with its read-only tooling hook (2fc8308; cap's ruling eaf260a2a192acf6), the release
record (GAME_BUILD.txt and this section, fbed404) and two test-only commits: the smoke's day-3 check expects a v3 seed
ghost (77f0b5e; cap's ruling bce92765e6026e9b), and then touchcheck's ARMOR PACK check expects +250 hull on NUM-1's
scale, where it expected 25 (cap's ruling bc2ad14029210996). That second one is the tip. A commit can't name its own
hash, so the Prime names the tip at launch.
- The page is the 0.9.0 online page that GAME_BUILD.txt records (BeltBattles-0.9.0-2fc830882c86-online.html, 695,449
  bytes, sha256 `fd0b3f356c09c551…`), built at 2fc8308; it reads V0.9.0 on the title screen.
- The rules move to bb-0.9.0 (RULES_VERSION, and the probe's PROBE_RULES), once, with nothing carried
  (POOL_RULES_CARRIED is empty): the seed pool and the stand-in pool are bb-0.9.0's own, regenerated once by REDO-X.
  The pinned sim fingerprint is the 0.9.0 pin, fp-090-f0fe94c.json (840,311 bytes, sha256 `75071881987ad880…`; a copy
  is ../kit090/h2/ beside this clone), made at f0fe94c; REDO-X's head 77d54b0 and the tip read identical to it, and
  parBench's fingerprint is 029d1ab7. LADDER_X_OPEN ships with 81 entries (REVIEW-REDOX section 5: ship with it).
- The server is built from the tip. POST /v1/ghosts takes snapshot v3 under bb-0.9.0, re-derives each dawn's rune offer
  from the upload's run seed, and answers 422 `deck failed validation` with a `rune: …` error for a deck that doesn't
  hold exactly one rune for each dawn, or holds an unknown, repeated or dormant rune, or a rune its dawn didn't offer.
  The rules gate refuses the sustain parts and runes under older rules. The run seed is stored, never served. The name
  check stays.
- Its bundled seed pool is bb-0.9.0's (v3: 120 ghosts, 12 a day, each holding one rune for each dawn; a race ghost
  carries its run seed). The release command seeds it for the first time. The bb-0.8.7 ghosts and uploads stay under
  their own prefix and match only 0.8.7, 0.8.8 and 0.8.9 pages; a 0.9.0 page asks for and uploads bb-0.9.0 ghosts only.
  A browser still on the 0.8.9 page keeps getting bb-0.8.7 ghosts, but its uploads answer 422 (foreign rules) until it
  reloads.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's, as 0.8.9's), so uploads stay open. Under
  deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** seeds the bb-0.9.0 pool for the first time: `seed: rules bb-0.9.0, 120 pool ghosts on tigris
(...)` with `120 written, 0 unchanged, 0 removed` (on a re-deploy of the same image, `0 written, 120 unchanged, 0
removed`).

**The probe runs** (section 9's pattern), because the upload rule changed: the exact rune count, and the probe's own
honest decks now hold their dawn runes, taken as the bots take them, and travel as v3 with the run seed. The release
checks rehearsed this whole block on a local server, the built server on a scratch store, the hand clean-up included
(kit090/probecheck.sh; ../output-stage090/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 16's pattern with section 9's probe block,
and runs it under its own operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-090 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage090/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.0` on both 0.9.0 pages). It refuses unless the staged label is 0.9.0 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. Fly serves 0.8.9 (release v11), so the
   guard expects to read 0.8.9 live, and that passes;
3. stage the 0.9.0 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.0). Expect:
- health: `{"ok":true,"rules":"bb-0.9.0","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.0 online page (cmp)`, and `content-length: 695449`;
- a bb-0.9.0 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.0","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.0 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.0` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 0 0` (no
  bb-0.9.0 upload yet, unless a player uploaded since the deploy);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.0, 120 pool ghosts on tigris (...)` with `120 written,
  0 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.0), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage090/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 12 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.0); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 9 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, and hero-METRONOME and hero-SIPHON 400 (`snapshot.hero:
   rules bb-0.9.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`); then `probe player: <43 characters>` and
   `probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in
   ../output-stage090/probe-id.txt`. The four stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, and the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.0'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.0; keep 120 seed-pool ghost(s) and 4 upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` The 4 uploads are the probe's; players who uploaded since
   the deploy add to that count, and their uploads pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage090/probe-id.txt) --rules bb-0.9.0 --apply"`.
   Expect `plan: delete 4 record(s) of bb-0.9.0; keep 120 seed-pool ghost(s) and …`, four `delete
   ghosts/bb-0.9.0/dNN/player/<g…>.json` lines (one on day 1 and three on day 3, the four ids of the probe's 201 lines),
   then `APPLIED: deleted 4 of 4 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.0"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.0'`: ten day rows of 12, then
   `all 120 0 0` (or `all 120 N P` if players uploaded since the deploy; never a probe upload).

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's four honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r090/BeltBattles-r090 && [ -s ../output-stage090/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage090/probe-id.txt) --rules bb-0.9.0 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.0'
```

Expect `plan: delete N record(s) of bb-0.9.0`, where N is the number of 201s the probe got (at most 4), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first, while the 0.9.0 image (the one
built for bb-0.9.0) still serves.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.8.9's release v11, image
registry.fly.io/beltbattles:deployment-01M45RVRBEA9BVPEC1JFKRAPE4 (its page on the rules bb-0.8.7). Deploy that image
from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte
for byte, as 0.8.9's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M45RVRBEA9BVPEC1JFKRAPE4
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.8.7"`, and the page must be 0.8.9's online page,
BeltBattles-0.8.9-7808c9bbe65a-online.html (672,501 bytes, sha256 `26e15c74e455d701…`). Its release command re-seeds its
own pool (`0 written, 120 unchanged, 0 removed` under bb-0.8.7), and every bb-0.8.7 upload stays in play. The bb-0.9.0
pool and any bb-0.9.0 uploads stay in the bucket under their own prefix, ready for a roll forward; 0.8.9 pages never ask
for them.

## 19. 0.9.1: the hero balance pass (new rules bb-0.9.1; its own L4)

0.9.0's launch was section 18, in the clone beltbattles-r090/BeltBattles-r090 (branch release-090, tip e76f7af). It ran
there: 0.9.0 is live as release v12 (image registry.fly.io/beltbattles:deployment-01M46FK2JY995JXBK2G53CC30A) since
2026-10-05 at about 16:52Z (LIVE-090). This section is 0.9.1's launch, from this clone.

0.9.1 ships BAL-2's hero balance pass, on new battle rules, bb-0.9.1:
- **The hulls** (REQ-BFG-069; cap's REVIEW-BAL1 section 3): WEAVER starts with 1700 hull (was 1800), and FURNACE with
  2100 (was 2000).
- **The KILN's HEAT** is 13 (was 12): the CINDER SLUG's HEAT, so FURNACE's slugs gain 13 damage for each second they
  ride.
- **FURNACE's four runes** (REQ-BFG-058; Y-FURN's release-Y forms; cap's ruling f894080daebfa8c0) are back in the dawn
  offer (DORMANT_RUNES is empty): COAL CHUTE (common: your HEAT +15%), HEAT SINK (rare: your HEAT +25%), SEARING (rare:
  the foe starts with 5 BURN, and a foe with your BURN can't heal) and SHATTER SHOT (rare: your shots deal 14% more
  damage, and your hits break a SHIELD and still land). The rules gate refuses a build holding one of the four under
  older rules (src/net/rulesGate.ts FURNACE_RUNES_RULES).
- **Rune cards** (REQ-BFG-070, display only): a rune card shows each trigger and its effect on a line of its own
  (Y-FURN step 3a).
- **The one regeneration** (BAL-2): the luck caps, the captains' runes (16 of 19 lists moved: every dawn now draws from
  65 runes, was 61), the stand-in pool and the seed pool v3; then the captain fit (MASTER VOSS's stand-in takes its
  COUNTERWEIGHT on day 5, was day 3; as a Hard warlord he still has it from day 3) and the wave-3 plans' fit.
  LADDER_X_OPEN was measured again: 92 entries (was 81).

**What ships.** Branch release-091 at its tip, in this clone: BAL-2's tip 7f642ec (tag bal2-head: y1x f0fe94c, 0.9.0's
base, with Y-FURN's 6 picks and BAL-2's 16 commits), the six release-090 commits the Prime's setup picked with -x
(e5a89b5, 7937d58, 2fc8308, fbed404, 77f0b5e and e76f7af, as c2cba0e, 49c75dd, 6c576e0, f53dea7, 7055e6f and b266f24),
the 0.9.1 label (608eee9), the BUNDLE commit (ae16d18: backlog 333-11, 338 and 337, test-only), the CHANGELOG commit
(5ee9524) and the release record (GAME_BUILD.txt and this section). A commit can't name its own hash, so the Prime
names the tip at launch.
- The page is the 0.9.1 online page that GAME_BUILD.txt records (BeltBattles-0.9.1-5ee95246d7a6-online.html, 696,824
  bytes, sha256 `749847a3a146952c…`), built at 5ee9524; it reads V0.9.1 on the title screen.
- The rules move to bb-0.9.1 (RULES_VERSION, and the probe's PROBE_RULES), once, with nothing carried
  (POOL_RULES_CARRIED is empty): the seed pool and the stand-in pool are bb-0.9.1's own, made once by BAL-2. The pinned
  sim fingerprint is the 0.9.1 pin, fp-091-7f642ec.json (838,332 bytes, sha256 `d326cacae82cfc5c…`; a copy is
  ../kit091/h2/ beside this clone), made at 7f642ec; the carry tip b266f24 and the tip read identical to it, and
  parBench's fingerprint is 9f8eff2f. LADDER_X_OPEN ships with 92 entries.
- The server is built from the tip. POST /v1/ghosts takes snapshot v3 under bb-0.9.1 with 0.9.0's checks: exactly one
  rune for each dawn, each one its dawn offered (from the upload's run seed), no unknown or repeated rune, the record,
  the name. The four FURNACE runes are no longer dormant, so a dawn may offer them and an upload may hold them. The run
  seed is stored, never served.
- Its bundled seed pool is bb-0.9.1's (v3: 120 ghosts, 12 a day, each holding one rune for each dawn; a race ghost
  carries its run seed). The release command seeds it for the first time. The bb-0.9.0 ghosts and uploads stay under
  their own prefix and match only 0.9.0 pages; a 0.9.1 page asks for and uploads bb-0.9.1 ghosts only. A browser still
  on the 0.9.0 page keeps getting bb-0.9.0 ghosts, but its uploads answer 422 (foreign rules) until it reloads.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's, as 0.9.0's), so uploads stay open. Under
  deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** seeds the bb-0.9.1 pool for the first time: `seed: rules bb-0.9.1, 120 pool ghosts on tigris
(...)` with `120 written, 0 unchanged, 0 removed` (on a re-deploy of the same image, `0 written, 120 unchanged, 0
removed`).

**The probe runs** (section 9's pattern, as in section 18), because the rules changed: its honest decks hold their dawn
runes, taken as the bots take them, and travel as v3 with the run seed. With the four runes back in the offer, the
honest FURNACE deck may take one of them at a dawn; that is expected. The release checks rehearsed this whole block on
a local server, the built server on a scratch store, the hand clean-up included (kit091/probecheck.sh;
../output-stage091/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 18's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-091 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage091/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.1` on both 0.9.1 pages). It refuses unless the staged label is 0.9.1 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. Fly serves 0.9.0 (release v12), so the
   guard expects to read 0.9.0 live, and that passes;
3. stage the 0.9.1 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.1). Expect:
- health: `{"ok":true,"rules":"bb-0.9.1","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.1 online page (cmp)`, and `content-length: 696824`;
- a bb-0.9.1 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.1","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.1 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.1` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 0 0` (no
  bb-0.9.1 upload yet, unless a player uploaded since the deploy);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.1, 120 pool ghosts on tigris (...)` with `120 written,
  0 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.1), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage091/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 12 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.1); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 9 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, and hero-METRONOME and hero-SIPHON 400 (`snapshot.hero:
   rules bb-0.9.1 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`); then `probe player: <43 characters>` and
   `probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in
   ../output-stage091/probe-id.txt`. The four stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, and the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.1'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.1; keep 120 seed-pool ghost(s) and 4 upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` The 4 uploads are the probe's; players who uploaded since
   the deploy add to that count, and their uploads pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage091/probe-id.txt) --rules bb-0.9.1 --apply"`.
   Expect `plan: delete 4 record(s) of bb-0.9.1; keep 120 seed-pool ghost(s) and …`, four `delete
   ghosts/bb-0.9.1/dNN/player/<g…>.json` lines (one on day 1 and three on day 3, the four ids of the probe's 201 lines),
   then `APPLIED: deleted 4 of 4 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.1"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.1'`: ten day rows of 12, then
   `all 120 0 0` (or `all 120 N P` if players uploaded since the deploy; never a probe upload).

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's four honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r091/BeltBattles-r091 && [ -s ../output-stage091/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage091/probe-id.txt) --rules bb-0.9.1 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.1'
```

Expect `plan: delete N record(s) of bb-0.9.1`, where N is the number of 201s the probe got (at most 4), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first, while the 0.9.1 image (the one
built for bb-0.9.1) still serves.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.0's release v12, image
registry.fly.io/beltbattles:deployment-01M46FK2JY995JXBK2G53CC30A (its page on the rules bb-0.9.0). Deploy that image
from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte
for byte, as 0.9.0's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M46FK2JY995JXBK2G53CC30A
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.0"`, and the page must be 0.9.0's online page,
BeltBattles-0.9.0-2fc830882c86-online.html (695,449 bytes, sha256 `fd0b3f356c09c551…`). Its release command re-seeds its
own pool (`0 written, 120 unchanged, 0 removed` under bb-0.9.0), and every bb-0.9.0 upload stays in play. The bb-0.9.1
pool and any bb-0.9.1 uploads stay in the bucket under their own prefix, ready for a roll forward; 0.9.0 pages never ask
for them.

## 20. 0.9.2: the captains' catch-up (rules bb-0.9.1 kept; its own L4)

0.9.1's launch is section 19, in the clone beltbattles-r091/BeltBattles-r091 (branch release-091, tip e781ab6). It runs
there, on its own L4, before this one, and never from here. This section assumes it has run, so 0.9.1 is live (the
release after v12; LIVE-091 records its number and image when it goes live, and the Prime confirms them at launch).
This section is 0.9.2's launch, from this clone.

0.9.2 ships the captains' catch-up (CATCHUP-091; REQ-BFG-024, named computer builds built around synergies, REQ-BFG-058,
the captains' rune picks, and REQ-BFG-051, their ARMOR PACKs; cap's rulings 3c58471c74bdc4ed, e2ca295ce9dcd60a and
f77489ebe2e11698), on 0.9.1's rules, bb-0.9.1:
- **The walls:** the Hard captains no longer shut out strong decks. 25 of the 26 difficulty walls hold (0.9.1: 13).
  MASTER VOSS's day-3 ARMOR PACK comes on day 8, and he skips TWIN SUNS and MOLTEN VOWS (CAPTAIN_RUNE_SKIP). SILKSHADE,
  the MOTH QUEEN and LONGTOOTH ease off on the days they stopped strong decks: a few parts come a day later, they carry
  fewer road plates there, and LONGTOOTH skips SCRAP SAINT. THANE KARSK drops his day-5 road plates. The IRON MATRIARCH
  no longer takes PYRE HEART.
- **The Hard band:** HIGHSPIRE and THANE KARSK carry one more road plate on day 4, SILKSHADE one on each of days 4 and
  5, and HIGHSPIRE three on day 8. On the road, HIGHSPIRE's TEMPER gets its second star on day 5 (was day 6), and
  LONGTOOTH's stand-in gets its COUNTERWEIGHT on day 4 (was day 6).
- **The dead rune:** genCaptainRunes skips a rune that does nothing for a captain's hero, so EMBERLYN (a WEAVER captain)
  no longer picks COAL CHUTE.
- The rune lists of 4 of the 19 captains moved (EMBERLYN, MASTER VOSS, LONGTOOTH and the IRON MATRIARCH). LADDER_X_OPEN
  was measured again: 110 entries (was 92), each with its reason.

**What ships.** Branch release-092 at its tip, in this clone: release-091's e781ab6 (0.9.1 as staged; tag r091),
CATCHUP-091's 5 commits (catchup-head = 23eb2fb, made on bal2 7f642ec and picked with -x by the Prime's setup: 21a81c7,
5ade8e3, 36e7214, fa273df and 23eb2fb, as e1d2526, 6183606, 69c10b9, 3f7c3b6 and 5e5a131), the 0.9.2 label (0a9368e),
the CHANGELOG commit (e668330) and the release record (GAME_BUILD.txt and this section). A commit can't name its own
hash, so the Prime names the tip at launch.
- The page is the 0.9.2 online page that GAME_BUILD.txt records (BeltBattles-0.9.2-e668330ad535-online.html,
  696,831 bytes, sha256 `5376446c863e77a4…`), built at e668330; it reads V0.9.2 on the title screen.
- The rules stay bb-0.9.1 (RULES_VERSION, and the probe's PROBE_RULES); POOL_RULES_CARRIED stays empty, and
  SUSTAIN_LIVE and BOT_RUNES stay on. Since e781ab6, only src/sim/rivalBuilds.ts changed under src/sim, server and
  src/net: the captains' plans and rune lists. No content.ts number, nothing in runes.ts and no battle behaviour
  changed. The pools don't move: the stand-in check at 5e5a131 made the stand-in pool again and read it identical
  to the committed one, and the seed pool is 0.9.1's. parBench's fingerprint is 9f8eff2f, as at 0.9.1. The pinned sim
  fingerprint moved only in the captains' road decks (`rival/*`, 44 of its 352 records). Its pin is CATCHUP-091's
  fp-091-final-23eb2fb.json (838,455 bytes, sha256 `0c00c8f09d2a6a56…`; a copy is ../kit092/h2/ beside this clone),
  and 5e5a131 and the tip read identical to it.
- The server is built from the tip, from 0.9.1's server sources: its strict decoder, its record, name and rune checks,
  its rules gate and its bundled seed pool are 0.9.1's. roadCap's prize column is unchanged, so the upload check
  accepts and refuses what it did.
- 0.9.1 and 0.9.2 pages play the same rules: each asks for and uploads bb-0.9.1 ghosts, so they meet each other's
  ghosts and uploads. A browser still on the 0.9.1 page keeps playing and uploading as before.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's, as 0.9.1's), so uploads stay open. Under
  deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** re-seeds the bb-0.9.1 pool that 0.9.1's launch (section 19) wrote: `seed: rules bb-0.9.1, 120
pool ghosts on tigris (...)` with `0 written, 120 unchanged, 0 removed`.

**The probe runs** (section 9's pattern, as in section 19). The upload path is 0.9.1's, unchanged, and the probe checks
it end to end on the new image: its honest decks hold their dawn runes, taken as the bots take them, and travel as v3
with the run seed. The release checks rehearsed this whole block on a local server, the built server on a scratch
store, the hand clean-up included (kit092/probecheck.sh; ../output-stage092/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 19's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-092 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage092/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.2` on both 0.9.2 pages). It refuses unless the staged label is 0.9.2 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. 0.9.1 launches first (section 19), so the
   guard expects to read 0.9.1 live, and that passes. If it reads 0.9.0 live instead, 0.9.1's launch has not run: stop
   there and ask the Prime, because this section's rollback goes to 0.9.1's release;
3. stage the 0.9.2 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.1, as at 0.9.1's launch). Expect:
- health: `{"ok":true,"rules":"bb-0.9.1","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.2 online page (cmp)`, and `content-length: 696831`;
- a bb-0.9.1 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.1","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.1 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.1` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 N P`. The
  uploads and players columns may be above 0, because 0.9.1 takes bb-0.9.1 uploads from its launch on (`all 120 0 0`
  if none came in yet);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.1, 120 pool ghosts on tigris (...)` with `0 written,
  120 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.1, as in section 19), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage092/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 12 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.1); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 9 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, and hero-METRONOME and hero-SIPHON 400 (`snapshot.hero:
   rules bb-0.9.1 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`); then `probe player: <43 characters>` and
   `probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in
   ../output-stage092/probe-id.txt`. The four stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, and the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.1'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.1; keep 120 seed-pool ghost(s) and N upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` N is the probe's 4 plus every bb-0.9.1 upload players made
   since 0.9.1's launch, and theirs pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage092/probe-id.txt) --rules bb-0.9.1 --apply"`.
   Expect `plan: delete 4 record(s) of bb-0.9.1; keep 120 seed-pool ghost(s) and …`, four `delete
   ghosts/bb-0.9.1/dNN/player/<g…>.json` lines (one on day 1 and three on day 3, the four ids of the probe's 201 lines),
   then `APPLIED: deleted 4 of 4 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.1"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.1'`: ten day rows of 12, then
   `all 120 0 0`, or `all 120 N P` with the players' uploads since 0.9.1's launch; never a probe upload.

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's four honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r092/BeltBattles-r092 && [ -s ../output-stage092/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage092/probe-id.txt) --rules bb-0.9.1 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.1'
```

Expect `plan: delete N record(s) of bb-0.9.1`, where N is the number of 201s the probe got (at most 4), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first. 0.9.1's image reads the same rules,
so the clean-up works under either image.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.1's release (the release
after v12; LIVE-091 records its number and image), 0.9.1's image (its page on the same rules bb-0.9.1). Deploy that
image from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is
uploads-080's byte for byte, as 0.9.1's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in the launch's releases-before file>
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.1"`, and the page must be 0.9.1's online page,
BeltBattles-0.9.1-5ee95246d7a6-online.html (696,824 bytes, sha256 `749847a3a146952c…`). Its release command re-seeds the
same pool (`0 written, 120 unchanged, 0 removed` under bb-0.9.1). The rules are the same, so a rollback keeps the pool
and every bb-0.9.1 upload in use: 0.9.1 plays the same rules.

## 21. 0.9.3: release Y and the phone finger targets (new rules bb-0.9.3; its own L4)

0.9.2's launch was section 20, in the clone beltbattles-r092/BeltBattles-r092 (branch release-092, tip cafe1a6). It ran
there: 0.9.2 is live as release v13 (image registry.fly.io/beltbattles:deployment-01M478MHA2E60PC77Q2GPBT8E2) since
2026-10-06 at about 00:09Z, with 0.9.1's whole content, on the rules bb-0.9.1 (LIVE-092). Section 19, 0.9.1's own
launch, never ran and must never run. This section is 0.9.3's launch, from this clone.

0.9.3 ships release Y (REQ-BFG-070 and REQ-BFG-046: one rule for each part, and parts that read like game pieces) with
the phone finger targets (REQ-BFG-040: TAP-093 and TAP-093b), on new battle rules, bb-0.9.3:
- **One rule for each part:** a part does one thing, in one ability line with one trigger and one effect, and a star
  changes a number but never adds a rule. IRON WALL and ANVIL BREECH keep two parts in their one line (cap's rulings
  Y7A-R3d and Y7A-R3c). A star's perk name shows only in the ⓘ levels view. Y7b2 flipped the star switch for good: the
  switch and every one of its off branches are gone.
- **The retired rules:** POISON is gone (VENOM DRIP makes BURN last 3, 6 or 9 seconds longer, by star), HARASSMENT is
  gone (only a STUN counts: TOLLBOOTH, FLAK SCREEN and SCRAPPER count STUNS only), and LOAD TIME is gone from the cards.
  Payoff parts need their engine and do nothing without it. When two FOUNDRY blanks fuse, their VENOM DRIP seconds add
  up. 30 parts were reworked; docs/CHANGELOG.md names them.
- **The one regeneration** (Y7b2, BAL-2's method): the luck caps, the captains' runes (none of the 19 lists moved), the
  stand-in pool and the seed pool v3; then the captain fit (13 parts come later to fit the new caps, and LONGTOOTH's
  COUNTERWEIGHT is back on day 6) and the wave-3 fit. LADDER_X_OPEN was measured again: 126 entries (was 110).
- **The phones** (display only): MENU and SND are finger targets of at least 44 CSS px on every portrait phone. On
  shorter phones MENU moves to the top-left corner, with the SOUND switch in its card; where a phone has room (390x844)
  the top bar grows to a finger's height; with runes held the corner MENU is a full finger's square, and the rune chips
  start right of it. Landscape and the desktop are unchanged.

**What ships.** Branch release-093 at its tip, in this clone: release Y's tip 63d4ab5 (tag y-head: Y2 to Y6, YINT, Y7a,
Y7b1 and Y7b2 on base092 5e5a131), the 7 commits the Prime's setup picked with -x (0.9.2's e668330 and cafe1a6, as
876a5ed and dfad24b; TAP-093 and TAP-093b's 2f333e5, 3d89c42, f96d7bc, d60d656 and 458500b, as 89f27ea, a517d61,
db81269, b0b09f0 and f4cd8b8), the 0.9.3 label (74ee35b), the CHANGELOG commit (53ed114) and the release record
(GAME_BUILD.txt and this section). A commit can't name its own hash, so the Prime names the tip at launch.
- The page is the 0.9.3 online page that GAME_BUILD.txt records (BeltBattles-0.9.3-53ed11440102-online.html,
  691,113 bytes, sha256 `ba769ea1a13179d9…`), built at 53ed114; it reads V0.9.3 on the title screen.
- The rules move to bb-0.9.3 (RULES_VERSION, and the probe's PROBE_RULES), once, with nothing carried
  (POOL_RULES_CARRIED is empty); SUSTAIN_LIVE and BOT_RUNES stay on. The rules skip bb-0.9.2, because 0.9.2 shipped on
  bb-0.9.1. src/net/rulesGate.ts gained a note and no row: release Y adds no id, and the exact rules check on every
  accepting path refuses a bb-0.9.1 upload (cap's ruling Y7B2-Q2). The seed pool and the stand-in pool are bb-0.9.3's
  own, made once by Y7b2; its stand-in check read the pool identical, and nothing since reaches the generator. The
  pinned sim fingerprint is the 0.9.3 pin, fp-093-63d4ab5.json (848,307 bytes, sha256 `a0314f3c8718a737…`; a copy is
  ../kit093/h2/ beside this clone), made at 63d4ab5; the carry tip f4cd8b8 and the tip read identical to it, and
  parBench's fingerprint is 1e04d09c. bb-0.9.3's raw battle digest is 0a1700f1 (cap's ruling Y7B2-Q1).
- The server is built from the tip. POST /v1/ghosts takes snapshot v3 under bb-0.9.3 with 0.9.2's checks: exactly one
  rune for each dawn, each one its dawn offered (from the upload's run seed), no unknown or repeated rune, the record,
  the name. Of the server's own sources only server/ghostProbe.ts (PROBE_RULES) and src/net/rulesGate.ts (the note)
  changed since 0.9.2; the sim it bundles is release Y's. The run seed is stored, never served.
- Its bundled seed pool is bb-0.9.3's (v3: 120 ghosts, 12 a day, each holding one rune for each dawn; a race ghost
  carries its run seed). The release command seeds it for the first time. The bb-0.9.1 ghosts and uploads stay under
  their own prefix and match only 0.9.1 and 0.9.2 pages; a 0.9.3 page asks for and uploads bb-0.9.3 ghosts only. A
  browser still on the 0.9.2 page keeps getting bb-0.9.1 ghosts, but its uploads answer 422 (foreign rules) until it
  reloads.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's, as 0.9.2's), so uploads stay open. Under
  deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** seeds the bb-0.9.3 pool for the first time: `seed: rules bb-0.9.3, 120 pool ghosts on tigris
(...)` with `120 written, 0 unchanged, 0 removed` (on a re-deploy of the same image, `0 written, 120 unchanged, 0
removed`). The bb-0.9.1 pool is not touched.

**The probe runs** (section 9's pattern, as in section 19), because the rules changed: its honest decks hold their dawn
runes, taken as the bots take them, and travel as v3 with the run seed. The release checks rehearsed this whole block on
a local server, the built server on a scratch store, the hand clean-up included (kit093/probecheck.sh;
../output-stage093/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 20's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-093 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage093/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.3` on both 0.9.3 pages). It refuses unless the staged label is 0.9.3 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. Fly serves 0.9.2 (release v13), so the
   guard expects to read 0.9.2 live, and that passes;
3. stage the 0.9.3 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.3). Expect:
- health: `{"ok":true,"rules":"bb-0.9.3","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.3 online page (cmp)`, and `content-length: 691113`;
- a bb-0.9.3 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.3","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.3 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.3` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 0 0` (no
  bb-0.9.3 upload yet, unless a player uploaded since the deploy);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.3, 120 pool ghosts on tigris (...)` with `120 written,
  0 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.3, as in section 19), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage093/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 12 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.3); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 9 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, and hero-METRONOME and hero-SIPHON 400 (`snapshot.hero:
   rules bb-0.9.3 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`); then `probe player: <43 characters>` and
   `probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in
   ../output-stage093/probe-id.txt`. The four stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, and the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.3'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.3; keep 120 seed-pool ghost(s) and 4 upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` The 4 uploads are the probe's; players who uploaded since
   the deploy add to that count, and their uploads pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage093/probe-id.txt) --rules bb-0.9.3 --apply"`.
   Expect `plan: delete 4 record(s) of bb-0.9.3; keep 120 seed-pool ghost(s) and …`, four `delete
   ghosts/bb-0.9.3/dNN/player/<g…>.json` lines (one on day 1 and three on day 3, the four ids of the probe's 201 lines),
   then `APPLIED: deleted 4 of 4 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.3"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'`: ten day rows of 12, then
   `all 120 0 0` (or `all 120 N P` if players uploaded since the deploy; never a probe upload).

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's four honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r093/BeltBattles-r093 && [ -s ../output-stage093/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage093/probe-id.txt) --rules bb-0.9.3 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'
```

Expect `plan: delete N record(s) of bb-0.9.3`, where N is the number of 201s the probe got (at most 4), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first, while the 0.9.3 image (the one
built for bb-0.9.3) still serves.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.2's release v13, image
registry.fly.io/beltbattles:deployment-01M478MHA2E60PC77Q2GPBT8E2 (its page on the rules bb-0.9.1). Deploy that image
from this clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte
for byte, as 0.9.2's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M478MHA2E60PC77Q2GPBT8E2
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.1"`, and the page must be 0.9.2's online page,
BeltBattles-0.9.2-e668330ad535-online.html (696,831 bytes, sha256 `5376446c863e77a4…`). Its release command re-seeds its
own pool (`0 written, 120 unchanged, 0 removed` under bb-0.9.1), and every bb-0.9.1 upload stays in play. The bb-0.9.3
pool and any bb-0.9.3 uploads stay in the bucket under their own prefix, ready for a roll forward; 0.9.2 pages never ask
for them.

## 22. 0.9.4: the captains' pass (rules bb-0.9.3, no bump; its own L4)

0.9.3's launch is section 21, in the clone beltbattles-r093/BeltBattles-r093 (branch release-093, tip 384ba42). It runs
there, on its own L4, before this one, and never from here. This section assumes it has run, so 0.9.3 is live (the
release after v13, expected v14; LIVE-093 records its number and image when it goes live, and the Prime confirms them
at launch). This section is 0.9.4's launch, from this clone.

0.9.4 ships the captains' pass (CATCHUP-093; REQ-BFG-024, named computer builds built around synergies, REQ-BFG-058,
the captains' rune picks, and REQ-BFG-051, their ARMOR PACKs; cap's rulings HB 678fb328359e02f1, e2ca295ce9dcd60a,
f77489ebe2e11698 and 3c58471c74bdc4ed) with the touch check's fix (TCH-360, REQ-BFG-040: a test tool), on 0.9.3's
rules, bb-0.9.3:
- **The walls:** all 26 difficulty walls hold on release Y's field (0.9.3: 23). MASTER VOSS no longer opens with TWIN
  NAILS (CAPTAIN_RUNE_SKIP: not before day 2; he takes OILED COGS on day 1, and IRON SKIN for SEAM RIVETS on day 8).
  The IRON MATRIARCH no longer takes IRON SKIN (BULWARK WARD on day 5, FINAL NAIL on day 6), so strong decks beat her on
  day 8 again. HIGHSPIRE's two day-9 ARMOR PACKs come on day 10.
- **The Hard band:** LONGTOOTH, MASTER VOSS, THANE KARSK and the MOTH QUEEN carry more road plates on the days they fell
  behind (up to the par field's pack count). On the road, at good luck only (cap's ruling HB (B)), LONGTOOTH's LONG HAUL
  comes on day 4 (was day 5) and his TEMPER on day 5 (was day 6), HIGHSPIRE's TEMPER gets its second star on day 4 (was
  day 5), and OLD BULWARK's STATIC BRUSH comes on day 8 (was day 9).
- **The named stand-ins:** MASTER VOSS buys two ARMOR PACKs on day 4 (was day 8), LONGTOOTH one on day 4 (was day 6)
  and LOCKJAW one on day 4 (was day 8).
- The rune lists of 2 of the 19 captains moved (MASTER VOSS and the IRON MATRIARCH). LADDER_X_OPEN was measured again:
  121 entries (was 126), each with its reason. The luck caps didn't move.
- **The touch check** (scripts/touchcheck.mjs; no game code): a drag's first moves go out back to back, each check waits
  for the game to register its drag, a drag that registered nothing gets one logged RETRY, and the 200 ms tap rule reads
  the p95 of the taps.

**What ships.** Branch release-094 at its tip, in this clone: release-093's 384ba42 (0.9.3 as staged; tag r093),
CATCHUP-093's 4 commits (c093-head = 7a4faa7, made on y-head 63d4ab5 and picked with -x by the Prime's setup: b080550,
67edde3, 0a4ea7c and 7a4faa7, as b86a208, 22d2e36, 29fd705 and 3a18f4c), TCH-360's 2 commits (tch-head = 814bea1:
12335d3 and 814bea1, as ed866a1 and 813fa0c), the 0.9.4 label (4e27b79), the CHANGELOG commit (f1c0a62) and the release
record (GAME_BUILD.txt and this section). A commit can't name its own hash, so the Prime names the tip at launch.
- The page is the 0.9.4 online page that GAME_BUILD.txt records (BeltBattles-0.9.4-f1c0a62452cf-online.html,
  691,202 bytes, sha256 `70473aa7ed421e69…`), built at f1c0a62; it reads V0.9.4 on the title screen.
- The rules stay bb-0.9.3 (RULES_VERSION, and the probe's PROBE_RULES); POOL_RULES_CARRIED stays empty, and
  SUSTAIN_LIVE and BOT_RUNES stay on. Since 384ba42, only src/sim/rivalBuilds.ts changed under src/sim, server and
  src/net: the captains' plans and rune lists. No content.ts number, nothing in runes.ts and no battle behaviour
  changed. The pools don't move: the stand-in check at 813fa0c made the stand-in pool again and read it identical to
  the committed one, and the seed pool is 0.9.3's. parBench's fingerprint is 1e04d09c, as at 0.9.3. The pinned sim
  fingerprint moved only in the captains' decks (78 `rival/*` records; the pool, par, warlord and start records are
  unchanged). Its pin is CATCHUP-093's final pin, kept as fp-094-7a4faa7.json (848,668 bytes, sha256
  `bfe9ae76803a1bf1…`; a copy is ../kit094/h2/ beside this clone), and 813fa0c and the tip read identical to it.
- The server is built from the tip, from 0.9.3's server sources: its strict decoder, its record, name and rune checks,
  its rules gate and its bundled seed pool are 0.9.3's. roadCap's prize column is unchanged, so the upload check
  accepts and refuses what it did.
- 0.9.3 and 0.9.4 pages play the same rules: each asks for and uploads bb-0.9.3 ghosts, so they meet each other's
  ghosts and uploads. A browser still on the 0.9.3 page keeps playing and uploading as before.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's, as 0.9.3's), so uploads stay open. Under
  deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** re-seeds the bb-0.9.3 pool that 0.9.3's launch (section 21) wrote: `seed: rules bb-0.9.3, 120
pool ghosts on tigris (...)` with `0 written, 120 unchanged, 0 removed`. The rules don't move, so the bb-0.9.3 uploads
of 0.9.3's players stay in the bucket and keep meeting players.

**The probe runs** (section 9's pattern, as in section 21). The upload path is 0.9.3's, unchanged, and the probe checks
it end to end on the new image: its honest decks hold their dawn runes, taken as the bots take them, and travel as v3
with the run seed. The release checks rehearsed this whole block on a local server, the built server on a scratch
store, the hand clean-up included (kit094/probecheck.sh; ../output-stage094/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 21's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-094 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage094/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.4` on both 0.9.4 pages). It refuses unless the staged label is 0.9.4 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. 0.9.3 launches first (section 21), so the
   guard expects to read 0.9.3 live, and that passes. If it reads 0.9.2 live instead, 0.9.3's launch has not run: stop
   there and ask the Prime, because this section's seed line and rollback assume 0.9.3's release;
3. stage the 0.9.4 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.3, as at 0.9.3's launch). Expect:
- health: `{"ok":true,"rules":"bb-0.9.3","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.4 online page (cmp)`, and `content-length: 691202`;
- a bb-0.9.3 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.3","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.3 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives, as at 0.9.3;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.3` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 N P`. The
  uploads and players columns may be above 0, because 0.9.3 takes bb-0.9.3 uploads from its launch on (`all 120 0 0`
  if none came in yet);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.3, 120 pool ghosts on tigris (...)` with `0 written,
  120 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.3, as in section 21), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage094/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 12 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.3); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 9 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, and hero-METRONOME and hero-SIPHON 400 (`snapshot.hero:
   rules bb-0.9.3 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`); then `probe player: <43 characters>` and
   `probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in
   ../output-stage094/probe-id.txt`. The four stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, and the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.3'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.3; keep 120 seed-pool ghost(s) and N upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` N is the probe's 4 plus every bb-0.9.3 upload players made
   since 0.9.3's launch, and theirs pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage094/probe-id.txt) --rules bb-0.9.3 --apply"`.
   Expect `plan: delete 4 record(s) of bb-0.9.3; keep 120 seed-pool ghost(s) and …`, four `delete
   ghosts/bb-0.9.3/dNN/player/<g…>.json` lines (one on day 1 and three on day 3, the four ids of the probe's 201 lines),
   then `APPLIED: deleted 4 of 4 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.3"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'`: ten day rows of 12, then
   `all 120 0 0`, or `all 120 N P` with the players' uploads since 0.9.3's launch; never a probe upload.

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's four honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r094/BeltBattles-r094 && [ -s ../output-stage094/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage094/probe-id.txt) --rules bb-0.9.3 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'
```

Expect `plan: delete N record(s) of bb-0.9.3`, where N is the number of 201s the probe got (at most 4), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first. 0.9.3's image reads the same rules,
so the clean-up works under either image.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.3's release, the one 0.9.3's
launch makes (expected v14; the release before this one; `fly releases --image` lists its image), 0.9.3's image (its
page on the same rules bb-0.9.3). Deploy that image from this clone. A deploy by image takes its env from this
directory's fly.toml, and this fly.toml is uploads-080's byte for byte, as 0.9.3's clone's is, so the old image runs as
it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image <the IMAGE REF of the newest release in the launch's releases-before file>
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.3"`, and the page must be 0.9.3's online page,
BeltBattles-0.9.3-53ed11440102-online.html (691,113 bytes, sha256 `ba769ea1a13179d9…`). Its release command re-seeds the
same pool (`0 written, 120 unchanged, 0 removed` under bb-0.9.3). The rules are the same, so a rollback keeps the pool
and every bb-0.9.3 upload in use: 0.9.3 plays the same rules.

## 23. 0.9.5: two small fixes (rules bb-0.9.3, no bump; its own L4)

0.9.4's launch is section 22, in the clone beltbattles-r094/BeltBattles-r094 (branch release-094, tip eb4c249). It ran
there on its own L4 and must never run again: 0.9.4 is live as release v15 (image
registry.fly.io/beltbattles:deployment-01M48T7AKR4SABBBPG50RJD9YG, since 2026-10-06 at about 14:36Z, LIVE-094). This
section is 0.9.5's launch, from this clone.

0.9.5 ships two small fixes on 0.9.4's rules, bb-0.9.3:
- **SALVO RACK's SHOT note** (TXT-095; REQ-BFG-070, REQ-BFG-046; the words are the Prime's choice, oracle
  eca9983506b0133c): the note on SHOT, in the ⓘ view and on a tap of SHOT on the card, now gives the fallback the card
  already states: it fires at a full chamber, or 3 seconds after its first load. Its next reload still takes longer by
  the same share. The 3 comes from the game's own timer; it is not written into the text.
- **The shop card's desktop hover** (TXT-095; REQ-BFG-070, REQ-BFG-046): it shows the card's own ability line at one
  star, with the run's numbers, as a pack's hover does. A gun or factory whose card shows only stats keeps its old
  text. This fixes the out-of-date hover text of MANTLET, TWIN LATCH, STOKER and IRON WALL. The hover is mouse only.
- **The hold** (HOLD-363; REQ-BFG-040, backlog #363): the build editor counts a press's time once a frame, so holding a
  factory, or a turret with nothing picked, lifts it after the time the code names, a little under half a second (it
  lifted in about half that). A finger that rests briefly on a KILN or LOOM before drawing a belt now draws the belt.
  Every other press, tap and drag reads as before.

**What ships.** Branch release-095 at its tip, in this clone: release-094's eb4c249 (0.9.4 as live; tag r094), TXT-095's
3 commits (txt-head = d1f6b65, made on eb4c249 and picked with -x by the Prime's setup: fb92a76, 17789e6 and d1f6b65, as
1411be4, 0eb7ea8 and 3cdc80c), HOLD-363's 2 commits (hold-head = 7411720, made on eb4c249: 8116c81 and 7411720, as
fe6c208 and 0c74c0d), the 0.9.5 label (4930fc0), the CHANGELOG commit (93f3e46) and the release record (GAME_BUILD.txt
and this section). A commit can't name its own hash, so the Prime names the tip at launch.
- The page is the 0.9.5 online page that GAME_BUILD.txt records (BeltBattles-0.9.5-93f3e46f4697-online.html,
  691,285 bytes, sha256 `cddb1dede47ea618…`), built at 93f3e46; it reads V0.9.5 on the title screen.
- The rules stay bb-0.9.3 (RULES_VERSION, and the probe's PROBE_RULES); POOL_RULES_CARRIED stays empty, and
  SUSTAIN_LIVE and BOT_RUNES stay on. Since eb4c249, nothing changed under src/sim, server or src/net: only display and
  input code (src/ui/glossary.ts and three files under src/screens/build), their tests and the label. The pools don't
  move: the stand-in check that read the pool identical at 0.9.4's 813fa0c carries, since no file in the generator's
  bundle changed, and the seed pool is 0.9.4's. parBench's fingerprint is 1e04d09c, as at 0.9.4, and the pinned sim
  fingerprint reads identical to 0.9.4's pin, fp-094-7a4faa7.json (848,668 bytes, sha256 `bfe9ae76803a1bf1…`; a copy is
  ../kit095/h2/ beside this clone), at 0c74c0d and at the tip.
- The server is built from the tip, from 0.9.4's server sources: its strict decoder, its record, name and rune checks,
  its rules gate and its bundled seed pool are 0.9.4's, so the upload check accepts and refuses what it did.
- 0.9.3, 0.9.4 and 0.9.5 pages play the same rules: each asks for and uploads bb-0.9.3 ghosts, so they meet each
  other's ghosts and uploads. A browser still on the 0.9.4 page keeps playing and uploading as before.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's, as 0.9.4's), so uploads stay open. Under
  deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** re-seeds the bb-0.9.3 pool that 0.9.3's launch (section 21) wrote and 0.9.4's launch (section
22) re-seeded: `seed: rules bb-0.9.3, 120 pool ghosts on tigris (...)` with `0 written, 120 unchanged, 0 removed`. The
rules don't move, so the players' bb-0.9.3 uploads already in the bucket stay and keep meeting players.

**The probe runs** (section 9's pattern, as in section 22). The upload path is 0.9.4's, unchanged, and the probe checks
it end to end on the new image: its honest decks hold their dawn runes, taken as the bots take them, and travel as v3
with the run seed. The release checks rehearsed this whole block on a local server, the built server on a scratch
store, the hand clean-up included (kit095/probecheck.sh; ../output-stage095/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 22's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-095 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage095/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.5` on both 0.9.5 pages). It refuses unless the staged label is 0.9.5 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. 0.9.5 launches after 0.9.4 (section 22),
   so the guard expects to read 0.9.4 live, and that passes. If it reads an older label instead, Fly is not on v15:
   stop there and ask the Prime, because this section's seed line and rollback assume 0.9.4's release;
3. stage the 0.9.5 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.3, as at 0.9.4's launch). Expect:
- health: `{"ok":true,"rules":"bb-0.9.3","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.5 online page (cmp)`, and `content-length: 691285`;
- a bb-0.9.3 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.3","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.3 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives, as at 0.9.4;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.3` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 N P`. The
  uploads and players columns may be above 0, because bb-0.9.3 uploads have come in since 0.9.3's launch (after 0.9.4's
  launch the list read `all 120 1 1`, LIVE-094);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.3, 120 pool ghosts on tigris (...)` with `0 written,
  120 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.3, as in section 22), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage095/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 12 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.3); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 9 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, and hero-METRONOME and hero-SIPHON 400 (`snapshot.hero:
   rules bb-0.9.3 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`); then `probe player: <43 characters>` and
   `probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in
   ../output-stage095/probe-id.txt`. The four stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, and the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.3'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.3; keep 120 seed-pool ghost(s) and N upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` N is the probe's 4 plus every bb-0.9.3 upload players made
   since 0.9.3's launch, and theirs pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage095/probe-id.txt) --rules bb-0.9.3 --apply"`.
   Expect `plan: delete 4 record(s) of bb-0.9.3; keep 120 seed-pool ghost(s) and …`, four `delete
   ghosts/bb-0.9.3/dNN/player/<g…>.json` lines (one on day 1 and three on day 3, the four ids of the probe's 201 lines),
   then `APPLIED: deleted 4 of 4 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.3"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'`: ten day rows of 12, then
   `all 120 0 0`, or `all 120 N P` with the players' uploads since 0.9.3's launch; never a probe upload.

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's four honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r095/BeltBattles-r095 && [ -s ../output-stage095/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage095/probe-id.txt) --rules bb-0.9.3 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'
```

Expect `plan: delete N record(s) of bb-0.9.3`, where N is the number of 201s the probe got (at most 4), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first. 0.9.4's image reads the same rules,
so the clean-up works under either image.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.4's release v15 (image
registry.fly.io/beltbattles:deployment-01M48T7AKR4SABBBPG50RJD9YG, LIVE-094), its page on the same rules bb-0.9.3.
Check that the releases-before file lists v15 first; if it doesn't, stop and ask the Prime. Deploy that image from this
clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte for
byte, as 0.9.4's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M48T7AKR4SABBBPG50RJD9YG
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.3"`, and the page must be 0.9.4's online page,
BeltBattles-0.9.4-f1c0a62452cf-online.html (691,202 bytes, sha256 `70473aa7ed421e69…`). Its release command re-seeds the
same pool (`0 written, 120 unchanged, 0 removed` under bb-0.9.3). The rules are the same, so a rollback keeps the pool
and every bb-0.9.3 upload in use: 0.9.4 plays the same rules. The release before v15 is 0.9.3's v14 (image
registry.fly.io/beltbattles:deployment-01M48K69FETC5MGGD2C8J7WBTY, LIVE-093; its page
BeltBattles-0.9.3-53ed11440102-online.html, 691,113 bytes), on the same rules too: the same command with v14's image
returns it, with the same seed line.

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
  env; run it as `fly ssh console -a beltbattles -C 'sh -lc "node /app/dist/ghost-admin.mjs list --rules bb-0.9.0"'`
  and report it before any `--apply`.
- The call stops at once with `refused: Fly serves X and the staged page is Y; never deploy over a newer version`:
  the version guard (step 2 of sections 14 to 18) found Fly serving a newer release than the call stages, or could
  not read a label. Nothing was staged or deployed. Never deploy over a newer version: leave Fly as it is and report it.
- An upload answers 422 `deck failed validation` with a `rune: …` error: under bb-0.9.0 POST /v1/ghosts re-derives
  each dawn's rune offer from the upload's run seed, and refuses a deck that doesn't hold exactly one rune for each dawn
  (an absent field counts as none), an unknown, repeated or dormant rune, or a rune its dawn didn't offer; nothing was
  stored. The 0.9.0 page takes and uploads one offered rune at every dawn, so such an upload points at a client that is
  not the 0.9.0 page.
- An upload answers 422 with a `name: ...` reason: under bb-0.8.6 POST /v1/ghosts requires a valid player name, and
  nothing was stored. The 0.8.6 page asks for a name before the first run, so a nameless upload points at a client
  that is not the 0.8.6 page.
