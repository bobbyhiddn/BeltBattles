# Runbook: BeltBattles on Fly + Tigris (0.9.17: ghosts get tougher when you keep winning, on 0.9.16's fairer climb to the tenth win, 0.9.15.1's clearer faces, panels and drop rows, 0.9.15's SHOCK and BURN part in every run's shops, and clearer panels, 0.9.14.1's clearer cards, panels and words, 0.9.14's gates and enchantments, 0.9.13's rigs that count, POISON and ENDLESS, 0.9.12's shop cards, 0.9.11's 10-wins rules, 0.9.10's REPLAY and 0.9.9's hearts, hulls by the day and battle view, on the rules bb-0.16.0, uploads open)

One small Fly machine serves the game page and the ghost API from one HTTPS origin; the ghosts
live in a Tigris bucket. Everything below is non-interactive, with every flag spelled out, and
grouped so each numbered call is one shell call (one approval). Run every call with the repo root as
the working directory:

    /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0917/BeltBattles-r0917   (branch r0917; write refs/heads/r0917 or a tag)

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
live since 2026-10-06 at about 14:36Z, LIVE-094) and must never run again. Section 23 is 0.9.5's launch as written in
the clone beltbattles-r095/BeltBattles-r095 (branch release-095, tip cc0acfc). It ran there (release v16, live since
2026-10-06 at about 19:15Z, LIVE-095) and must never run again. Section 24 is 0.9.6's launch as written in the clone
beltbattles-r096/BeltBattles-r096 (branch release-096, tip 8fbba9d). It ran there (release v17, live since 2026-10-07
at about 16:36Z, LIVE-096) and must never run again. Section 25 is 0.9.7's launch as written in the clone
beltbattles-r097/BeltBattles-r097 (branch release-097, tip 236ac6f). It ran there (release v18, live since 2026-10-08
at about 18:36Z, LIVE-097) and must never run again. Section 26 is 0.9.8's launch as written in the clone
beltbattles-r098/BeltBattles-r098 (branch release-098, tip fa1e9ed). It ran there (release v19, live since 2026-10-09
at about 01:11Z, LIVE-098) and must never run again. A section 27 for a battle-view 0.9.9 on bb-0.9.7 was written in
the clone beltbattles-r099/BeltBattles-r099 (branch release-099) and never ran: that release was folded into this one.
Section 27 is 0.9.9's launch, as written in the clone beltbattles-c099/BeltBattles-c099 (branch c099, tip c0182e78fe6c):
it ran there (release v20) and must never run again. Section 28 is 0.9.9.1's launch (server only), as written in the
clone beltbattles-r0991/BeltBattles-r0991 (branch r0991): it ran there (release v21, live since 2026-10-14 at about
11:38Z, LIVE-0991) and must never run again. Section 29 is 0.9.10's launch, as written in the clone
beltbattles-r0910/BeltBattles-r0910 (branch r0910, tip c5f695ae83d3, tag stage-0910): it ran there (release v22, image
registry.fly.io/beltbattles:deployment-01M557C6PK0XAW8JT7K36VD1JQ, live since 2026-10-17 at about 15:24Z) and must never
run again. Section 30 is 0.9.11's launch, as written in the clone beltbattles-r0911/BeltBattles-r0911 (branch r0911,
tip 6541015f2de3, tag stage-0911): it ran there (release v23, image
registry.fly.io/beltbattles:deployment-01M56B4514PHZZ17S572CGSMA6, live since 2026-10-18 at about 01:49Z, LIVE-0911) and
must never run again. Section 31 is 0.9.12's launch, as written in the clone beltbattles-r0912/BeltBattles-r0912 (branch
r0912, tip a2d11e47efc3, tag stage-0912): it ran there (release v24, image
registry.fly.io/beltbattles:deployment-01M57BGVDCKDMKSE1VQ1JX6GEJ, live since 2026-10-18 at about 11:15Z, LIVE-0912) and
must never run again. Section 32 is 0.9.13's launch, as written in the clone beltbattles-r0913/BeltBattles-r0913 (branch r0913, tip
4ff77b0aa3c2, tag stage-0913): it ran there (release v25, image
registry.fly.io/beltbattles:deployment-01M5CHZNH6RKGMJNTE0GD0TJM9, live since 2026-10-20 at about 11:44Z, LIVE-0913) and
must never run again. Section 33 is 0.9.14's launch, as written in the clone beltbattles-r0914/BeltBattles-r0914 (branch
r0914, tip 2b327f191261, tag stage-0914): it runs once, under its own approval, and must run BEFORE section 34's. Section 34 is
0.9.14.1's launch, as written in the clone beltbattles-r09141/BeltBattles-r09141 (branch r09141, tip f14e3ee540de, tag
stage-09141): it runs once, under its own approval, after section 33's and BEFORE section 35's. Section 35 is 0.9.15's launch,
as written in the clone beltbattles-r0915/BeltBattles-r0915 (branch r0915, tip bf288fb0ebf7, tag stage-0915): it ran there (release v29, image
registry.fly.io/beltbattles:deployment-01M6XV00ACXZ2KGHG69555EYHH, live since 2026-11-08 at about 15:05Z, tag live-0915) and must never run again; sections 33
and 34 have run too (tags live-0914 and live-09141). Section 36 is 0.9.15.1's launch,
as written in the clone beltbattles-r09151/BeltBattles-r09151 (branch r09151, tip 89bb5abacfbb, tag stage-09151): it ran there (release v30, image
registry.fly.io/beltbattles:deployment-01M72YAPXXJRGYNC7NTDH9PVWW, live since 2026-11-10 at 14:40:19Z, tag live-09151) and must never run again. Section 37 is
0.9.16's launch, as written in the clone beltbattles-r0916/BeltBattles-r0916 (branch r0916, tip 3eb2669e9a6a, tag stage-0916): it is staged and accepted but has NOT run (the hosting service still serves
0.9.15.1, release v30), and it waits for the operator's yes. Section 38 is 0.9.17's launch, from this clone (beltbattles-r0917/BeltBattles-r0917, branch r0917; write refs/heads/r0917 or a tag), on either of two
launch paths (PATH A: after section 37's launch; PATH B: on top of 0.9.15.1, carrying 0.9.16 with it: section 38), and sections 3 to 8 now name 0.9.17's page and the rules bb-0.16.0.

Names used below: app `beltbattles` (URL https://beltbattles.fly.dev), org `personal`, bucket
`beltbattles-ghosts`, rules `bb-0.16.0`, game 0.9.17. The page is 0.9.17's: 0.8.0 (the release candidate c3c84e5) with the
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
picks again, with the touch check's fix, a test tool), 0.9.5 (section 23: two small fixes, SALVO RACK's SHOT note
and the shop card's desktop hover text, and a factory or turret hold that takes its full time), 0.9.6 (section 24:
battles in motion, both ships sailing over the day's sea while their boards stay level, and the same ship on every
screen), 0.9.7 (section 25: release Z's LAST CHANCE, where a run down to its last life gets a life back and one free
pick, with the bots' overfeed fix, plus the captains' re-plan and six card faces), 0.9.8 (section 26: styles you
earn for the carrier, its floor panels, its belts and the stats panels, picked on the new CUSTOMIZE screen), 0.9.9
(section 27: the hull release, where hulls grow with the day, every day has a warlord fight that drops a part, runs
start with 10 hearts, rune offers are open and joins are free, with shaped rigs and factories, the battle view and the
battle's counts, and cleaner cards), 0.9.9.1 (section 28: easier first opponents, a new seed pool on the server; the page
is 0.9.9's), 0.9.10 (section 29: REPLAY after every fight, on the result card, and the dark wind's REGEN badge gone on
the wind's first tick; display only), 0.9.11 (section 30: the 10-wins rules release: a run is won at its 10th dusk
win or lost at 0 hearts with no day limit, a lost dusk costs 1 heart on days 1-3 and 2 from day 4, twelve new rigs, six
plain and six shaped, a stand-in pool and a seed pool of 192 ghosts rebuilt for days 1-16, softer seed ghosts and a
fair floor, and the profile upload), 0.9.12 (section 31: the shop cards show only a piece's icon, price and simple
marks, a shaped piece's grid on its card, and plainer tap-panel words; display only), 0.9.13 (section 32: the rules
release bb-0.12.0: seven rigs that count what is on the board, five reworked pieces, POISON as its own status, ENDLESS
after a won run, a guard for saves a build does not know, a warm-up at the server's boot, pools rebuilt), 0.9.14
(section 33: the rules release bb-0.13.0: three gates that stand on a belt, eight enchantments with the ENCHANTER and the
ASH SHRINE, POISON at 2 a second, a softer field, a bigger god hull step in ENDLESS, pools rebuilt), 0.9.14.1 (section 34: a
client release with one server guard: a footprint grid on every card of a bigger piece, panels' notes and families, clearer words,
the belt rows that say what a scaling rig reads, YOUR RUNES in pages, and a server that refuses an endless upload past day 25 at
once), 0.9.15 (section 35: the rules release bb-0.14.0: a SHOCK part and a BURN part among every new run's wares, two captains
changed, the bots' fixes, pools rebuilt; with belt panels that say what they count and what they leave out, one ? info glyph, the
five-point star, folded empty gear rows, notes that leave the deck clear, the road card's arrow and the heavy turrets' icon), 0.9.15.1 (section 36: a client page release on the same server and rules: clearer faces, panels and drop rows, display and words only, and the
launch lines of fly.toml tracked), 0.9.16 (section 37: the rules release bb-0.15.0: a casual ghost on every day, a tougher ghost for a run that keeps winning, a second ghost for 11 busy matchups and a third for 3 of them,
the four Easy captains' day-5 words BRACED, MOTH QUEEN without HEATJACKET from day 5 and SILKSHADE without COUNTERWEIGHT from day 4, the difficulty curve on, pools rebuilt (230 seed ghosts); with one solid
panel behind LAST CHANCE's and the dawn rune pick's cards, the heavy turrets' gun icon, a rig's arrowheads on the narrow phone shop card and whole shaped-part icons on the scout deck, a warlord card and
LAST CHANCE's part card; staged, not launched) and 0.9.17 (section 38: the rules release bb-0.16.0: VETERAN, where two runs won in a row make a player's ghosts tougher and a lost or abandoned run takes them back,
a streak tier of 48 ghosts on days 5-16 that only a run on a streak meets, pools rebuilt (254 seed ghosts); with first-run explanations that keep off their panel's text rows under a mouse and a footprint plate
that follows the grid's shape on the narrow phone shop card), on the
rules bb-0.16.0 (0.9.17's; 0.9.16, staged first, has bb-0.15.0; 0.9.15 and 0.9.15.1 played bb-0.14.0, 0.9.14 and 0.9.14.1 played bb-0.13.0, 0.9.13 bb-0.12.0, 0.9.11 and 0.9.12 bb-0.11.0, 0.9.9 to 0.9.10 bb-0.10.0, 0.9.7 and 0.9.8 bb-0.9.7, 0.9.3 to
0.9.6 bb-0.9.3).
The server is uploads-080's (H2's cef0379, v080-h2, which adds the record check to POST /v1/ghosts, with
uploads open: section 9), built from this tip, so its strict decoder, record check (the hearts model under
bb-0.16.0, long runs included, and the stated losses of a long run's upload), name check, rune check (one rune for each
dawn, exactly), LAST CHANCE check, road-log check, the profile route (PUT /v1/profile), the ENDLESS fields, the gate ids,
the enchantment codes and seed pool are bb-0.16.0's. The seed pool is bb-0.16.0's own (254 ghosts, days 1-16, 12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18 a day, each holding one rune for each
dawn, a grade and its stated losses; server/seedPoolData.ts is 566,721 bytes; 0.9.16's bb-0.15.0 pool, 499,336 (in the store only if 0.9.16 launched first), and 0.9.15's and 0.9.15.1's bb-0.14.0 pool, 402,688, stay in the store as they are), with nothing
carried: src/sim/content.ts POOL_RULES_CARRIED is empty. The Dockerfile and .dockerignore are unchanged, and fly.toml is unchanged but for the launch lines that RIDE L1 tracked at 0.9.15.1 (`release_command_timeout` and
`[deploy.release_command_vm]`: section 36); 0.9.16 and 0.9.17 change none of them (the tracked launch config is the same 2,849 bytes, sha16 `383a063f00df9673`: sections 37 and 38). From 0.9.14.1 on POST /v1/ghosts
also refuses an endless snapshot past day 25 at once, before the deck check (422 `day: N is past the last online endless day 25`, server/app.ts:361-363 at 0.9.17, :355-357 at 0.9.16: S1).

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

Branch release-095, in the clone beltbattles-r095/BeltBattles-r095 (a standalone copy of release-094 at eb4c249; that
clone holds only release-095 and the tags r094 = eb4c249, txt-head = d1f6b65, hold-head = 7411720, r093 = 384ba42,
c093-head = 7a4faa7, tch-head = 814bea1, tap-head = 458500b, y-head = 63d4ab5, base092 = 5e5a131, r092 = cafe1a6 and
faces-088 = 11fbc6a), is 0.9.4's code plus two small fixes (section 23):
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
- the release record (cc0acfc): GAME_BUILD.txt records the 0.9.5 online page built at 93f3e46, sections 3 to 8 named it
  and the rules bb-0.9.3, and section 23 is its launch. cc0acfc went live as release v16 (LIVE-095).

Branch release-096, in the clone beltbattles-r096/BeltBattles-r096 (a standalone copy of release-095 at cc0acfc; that
clone holds only release-096 and the tags r095 = cc0acfc, motion-head = 73ddef4, merge096 = d9a89e3, r094 = eb4c249, r093 = 384ba42, txt-head =
d1f6b65, hold-head = 7411720, c093-head = 7a4faa7, tch-head = 814bea1, tap-head = 458500b, y-head = 63d4ab5, base092 =
5e5a131, r092 = cafe1a6 and faces-088 = 11fbc6a, and the branches above are in their own clones), is 0.9.5's code plus
battles in motion (section 24):
- release-095 at cc0acfc (0.9.5 as live, above), unchanged;
- the motion lane's branch motion2 at 73ddef4 (tag motion-head; REQ-BFG-071; MOTION-1 and MOTION-2, 14 commits made on
  0.9.4's eb4c249, in 28 files), merged by the Prime's setup with `git merge --no-ff` as d9a89e3 (tag merge096; parents
  cc0acfc and 73ddef4). Both carriers sail left to right over the day's sea (CALM SEA, STORM, EMBER SEA) while their
  boards stay level and parallel, and the player's ship shows on the title, in replays, and held still on the build
  screen, the run summary and the hero select. Display only: src/render, src/game's arena and battle-layout files,
  src/screens, src/main.ts and src/env.d.ts, with tests/motion.test.ts, four test scripts, docs/MOTION.md and
  .gitignore. The merge's one conflict was docs/CHANGELOG.md: 0.9.5's entry stays, and the 0.9.6 entry sits above it;
- 69c9e5b: the 0.9.6 label (VERSION, package.json, package-lock.json and the label pins);
- the release record (1ca6151): GAME_BUILD.txt records the 0.9.6 online page built at 69c9e5b, sections 3 to 8 named it
  and the rules bb-0.9.3, and section 24 is its launch;
- 8fbba9d: asynccheck's M1 views expect the plate-strip source line on desk and small-land under motion's landscape
  lanes (scripts only; the Prime's ruling 782627e17e7bc80f). 8fbba9d is section 24's tip. It went live as release v17
  (LIVE-096).

Branch release-097, in the clone beltbattles-r097/BeltBattles-r097 (a standalone copy of release-096 at 8fbba9d; that
clone holds only release-097 and the tags r096 = 8fbba9d, zbump-head = e0422dc, merge097 = c05acbd, c097-head = c129409, txt096-head = d99776f,
pick-c097 = a26cc0e and pick-t096 = 9cf21b7, with the older tags that came with release-096, and the branches above
are in their own clones), is 0.9.6's code plus LAST CHANCE, the captains' re-plan and six card faces (section 25):
- release-096 at 8fbba9d (0.9.6 as live, above), unchanged;
- release Z's zbump-accepted e0422dc (tag zbump-head; REQ-BFG-073: LC-1, Z-PREP, OVF-1 and Z-BUMP, 21 commits on 0.9.5's
  cc0acfc, in 77 files), merged by the Prime's setup with `git merge --no-ff` as c05acbd (tag merge097; parents 8fbba9d
  and e0422dc). LAST CHANCE is the game's rule: a run down to its last life gets one free pick (a rune, a part or +500
  max hull) with a life back, the bots pick too, and the server checks a LAST CHANCE upload. A new test shows the dark
  wind hits both hulls, the bots' deck rating prices an overfed gun's jams (OVF-1), and the rules moved once to
  bb-0.9.7 with one regeneration of the luck caps, the stand-in pool and the seed pool. The merge's four conflicts
  (src/main.ts's imports, the end of the build screen's draw(), and the two label tests) were each two sides adding
  lines at the same spot, resolved by the setup's scripts;
- CATCHUP-097's 2 commits (REQ-BFG-024, REQ-BFG-058, REQ-BFG-051), made on e0422dc and picked with -x (d289ece and
  c129409, as 47a897c and a26cc0e; tag pick-c097): the captains' re-plan in src/sim/rivalBuilds.ts and two tests' pins
  (LADDER_X_OPEN 121 -> 105);
- TXT-096's 3 commits (REQ-BFG-070, REQ-BFG-046), made on e0422dc and picked with -x (e1e29b9, 0fbab26 and d99776f, as
  9960f17, c8bfa51 and 9cf21b7; tag pick-t096): six card faces say a rule the game already played by, and a dead-text
  and stale-comment sweep. Text, comments and tests only;
- 73f6b2d: the browser drivers learn LAST CHANCE (REVIEW-ZBUMP Q2; scripts/playthrough.mjs and scripts/asynccheck.mjs
  only): while the picker is up, a scripted run takes the HULL card;
- e786a29: the 0.9.7 label (VERSION, package.json, package-lock.json and the label pins);
- 567642b: docs/CHANGELOG.md's 0.9.7 entry;
- the release record (236ac6f): GAME_BUILD.txt records the 0.9.7 online page built at 567642b, sections 3 to 8 named
  it and the rules bb-0.9.7, and section 25 is its launch. 236ac6f is section 25's tip. It went live as release v18
  (LIVE-097).

Branch release-098, in the clone beltbattles-r098/BeltBattles-r098 (a standalone copy of release-097 at 236ac6f; that
clone holds only release-098 and
the tags r097 = 236ac6f, custom-head = 8a7294c and merge098 = fdabebe, with the older tags that came with release-097,
and the branches above are in their own clones), is 0.9.7's code plus styles you earn (section 26):
- release-097 at 236ac6f (0.9.7 as live, above), unchanged;
- the motion lane's custom3 at 8a7294c (tag custom-head, the lane's custom3-accepted; REQ-BFG-072 and REQ-BFG-074:
  CUSTOM-2a, CUSTOM-2b and CUSTOM-3, 18 commits on 0.9.6's 8fbba9d, one of them the merge of 8fbba9d into custom2, in
  58 files), merged by the Prime's setup with `git merge --no-ff` as fdabebe (tag merge098; parents 236ac6f and
  8a7294c), with no conflict. Styles you earn for the carrier, its floor panels, its belts and the stats panels, the
  CUSTOMIZE screen with its NEW dot and the run summary's NEW STYLE line, the choice saved on the device
  (`beltbattles.profile.v1`); the road event and fork screens show the day's sea, and the landscape surge stays inside
  the boards' margin. Display code, its tests, test scripts, 7 art tools and docs: nothing under src/sim, src/net,
  src/core or server;
- 73877fc: the run-lost shot plays to a real RUN LOST under LAST CHANCE (backlog #378; scripts/shots-list.mjs only);
- 0fe90a1: the 0.9.8 label (VERSION, package.json, package-lock.json and the label pins);
- ee32c76: docs/CHANGELOG.md's 0.9.8 entry;
- the release record (fa1e9ed): GAME_BUILD.txt records the 0.9.8 online page built at ee32c76, sections 3 to 8 named
  it and the rules bb-0.9.7, and section 26 is its launch. fa1e9ed is section 26's tip. It went live as release v19
  (LIVE-098).

Branch release-099, in the clone beltbattles-r099/BeltBattles-r099 (a standalone copy of release-098 at fa1e9ed; that
clone holds only release-099 and
the tags r098 = fa1e9ed, merge099a = 42f6ed6, merge099b = 079538f, step099 = c5777b6, pick099 = ae36928, tsfix099 =
2860cae and tsc099 = 3b4f259, with the lanes' tags (wind2-accepted = 11df9ac, explain1-accepted = fcb0066 and the tags
under them) and the older tags that came with release-098, and the branches above are in their own clones), was
0.9.8's code plus the battle view and cleaner cards (its own section 27, which never ran; its content ships in c099,
below):
- release-098 at fa1e9ed (0.9.8 as live, above), unchanged;
- the motion lane's bundle wind2-accepted at 11df9ac (66 commits on fa1e9ed, 3 of them merges, in 127 files: FIELD-1,
  SCOUT-1, SCOUT-1b and SCOUT-1c with the card lane's ZOOM-1, WORDS-1 and SPACE-1, WIND-1 and WIND-2; REQ-BFG-071,
  REQ-BFG-075, REQ-BFG-076, REQ-BFG-082, REQ-BFG-083, REQ-BFG-093, the display half of REQ-BFG-097, REQ-BFG-080,
  REQ-BFG-081 and REQ-BFG-087), merged by the Prime's setup with `git merge --no-ff` as 42f6ed6 (tag merge099a;
  parents fa1e9ed and 11df9ac; its tree is wind2-accepted's). A setting for every battle (sea, ground or air) and a
  wider view of the fight, VIEW BATTLEFIELD after every fight, the battle speed that holds for the run, a scouted
  foe's carrier from the NEXT BATTLE card, the dark wind's numbers on both carriers with hull, SHIELD and plating
  numbers, the player's carrier up close on the build screen, plainer card words and clear space between a card's
  items. Display code, its tests, test scripts, two tools (tools/styleRefs.ts, tools/textSheet.ts) and docs: nothing
  under src/sim, src/net, src/core or server;
- the card lane's EXPLAIN-1 at fcb0066 (tag explain1-accepted; 7 commits in 19 files; REQ-BFG-089 and REQ-BFG-084
  step 0b), merged as 079538f (tag merge099b; parents 42f6ed6 and fcb0066) with one conflict, in
  BuildScreen.pressed(), resolved as both lanes' trials did (the foe view's line first, then EXPLAIN-1's). A card
  shows its stats and its own rules; flavour, a turret's ammo and gear lines and how-to tips move to NOTES in the ⓘ
  view;
- c5777b6: the scout-faces step (src/screens/battleScout.ts only): a scouted part's face hides what its card hides;
- ee8b0b4 and ae36928: TSC-369's two commits, picked with -x (REQ-BFG-040; tsconfig.tests.json,
  scripts/tscheck-tests.mjs, tests/tsc-tests-baseline.json and package.json's `typecheck:tests` line): the tests'
  type check, a ratchet;
- 2860cae and 3b4f259: test only (one test's types; the type check's baseline from 155 to 162, once, for 7 shim gaps);
- 9096167: the 0.9.9 label (VERSION, package.json, package-lock.json and the label pins);
- cb8908b: docs/CHANGELOG.md's 0.9.9 entry;
- its release record: GAME_BUILD.txt recorded a 0.9.9 online page built at cb8908b on the rules bb-0.9.7, and its
  section 27 was that page's launch. It never ran.

Branch c099, in this clone (beltbattles-c099/BeltBattles-c099; write `refs/heads/c099` or a tag: "c099" alone is
ambiguous here), is release-099's content plus the hull release, and it is 0.9.9 (section 27):
- the hull release, merged as c099-hullon-accepted e866408cc0fa (MERGE-099F): AZ-BUMP's bump to bb-0.10.0 and HULL-ON's
  flip (hearts, free joins, open runes, the SHIELD and WARD numbers, HULL_SCALE, NPC_DAY, LADDER_FIX, PICK), with
  SHAPES-1's shaped rigs and factories;
- the card lane's CARD-3 and CARD-4 and the motion lane's PAIR-1, PAIR-1c, COUNT-1, PERF-1, FIX-099G, CNT-DAY
  (790af71e74ff), CNT-DAY2 (fe799f66cfe1), BROWSE-099F (c099-browse eed4e4ddf490), CNT-DAY3 (c099-cntday3
  0b465cd1c220) and PANEL-FIT (c099-panelfit 07a1ff40af24, display only); the server smoke's fixture fix (c099-smoke
  380882f43e73, tools/smoke.ts only);
- S8, the hull lane's one regeneration (s8-accepted 117ba0613dc0, merged as 3cc58d0a7651, tag c099-s8): the stand-in
  pool, the seed pool with its grades, the luck caps and the captains' runes made again once under bb-0.10.0, with
  FIT-099's damage fit and PICK_RULE { losing 1, deep 0.5, deepAt 2 };
- CARD-5 (card5-accepted 582a8e251468, merged as 8c44be979704, tag c099-card5; the phone shop card words, HOW TO PLAY,
  presentation only) and its test re-pin 002cad70642d (tag c099-card5b; tests/card5.test.ts only);
- 814a1b9: docs/CHANGELOG.md's 0.9.9 entry;
- the release record: GAME_BUILD.txt records the 0.9.9 online page built at 814a1b9, tests/tsc-tests-baseline.json
  moves from 162 to 164 (S8's tests/s8.seedfile.test.ts:26 and :63, TS2345; `npm run typecheck:tests -- --write
  --force`, the release lane's decision), sections 3 to 8 name the page and the rules bb-0.10.0, and section 27 is its
  launch. A commit can't name its own hash, so the Prime names the tip at launch.

**The page.** The image serves the ONLINE single-file page: `npm run build:online`
(VITE_GHOST_SERVER=same-origin, into dist-online/), then `node scripts/singlefile.mjs <out.html> --dist dist-online`.
It plays against the server that serves it, with no `?server=`. deploy/GAME_BUILD.txt records 0.9.17's:
../output-stage0917/pages/BeltBattles-0.9.17-771ec08d406e-online.html beside this clone (GAME_BUILD.txt names it from
the repo root), 1,180,630 bytes, sha256 as GAME_BUILD.txt records (it begins `8e4522603efd8cb0`), built at 771ec08. Shore
serves the offline page of the same commit (1,180,619 bytes, sha256 `a02b23c9cd19042f…`;
../output-stage0917/pages/BeltBattles-0.9.17-771ec08d406e.html, and the same bytes as ../output-stage0917/shore/index.html);
it plays offline unless opened with `?server=`. Section 38's launch stages these bytes from wherever the Prime keeps them
(stage.mjs checks the size and the SHA-256 against GAME_BUILD.txt, not the path). Before 0.9.17, 0.9.16's release record
(7c8f8312484f, tag r0916-T) recorded 0.9.16's page, BeltBattles-0.9.16-161a9829b173-online.html (1,177,256 bytes, sha256
`0825a2ddf82919e1…`, built at 161a982); no hosting release serves it yet, because 0.9.16 is staged and not launched (the hosting service serves 0.9.15.1's page, release v30), and on PATH B it never
does (section 38). Before 0.9.16, 0.9.15.1's release record
(6562173238bc) recorded 0.9.15.1's page, BeltBattles-0.9.15.1-8916ac159bca-online.html (1,176,557 bytes, sha256
`0e6b7aed33fc9297…`, built at 8916ac1), which release v30 serves. Before 0.9.15.1, 0.9.15's release record
(8eec84d2a551) recorded 0.9.15's page, BeltBattles-0.9.15-8256f7d15581-online.html (1,169,732 bytes, sha256
`b4f84e0f3100a3c8…`, built at 8256f7d), which release v29 serves. Before 0.9.15, 0.9.14.1's release record
(970325961d76) recorded 0.9.14.1's page, BeltBattles-0.9.14.1-e7b636a44b55-online.html (1,160,876 bytes, sha256
`8be6986bc622bc59…`, built at e7b636a), which 0.9.14.1's release serves. Before 0.9.14.1, 0.9.14's release record
(2d310a5f5313) recorded 0.9.14's page, BeltBattles-0.9.14-e894e6d8415d-online.html (1,150,336 bytes, sha256
`7775384bd060eb9c…`, built at e894e6d), which 0.9.14's release serves. Before 0.9.14, 0.9.13's release record
(df46acc) recorded 0.9.13's page, BeltBattles-0.9.13-b2ddc3840a6a-online.html (1,063,979 bytes, sha256
`74431b5aa7524ce5…`, built at b2ddc38), which release v25 serves. Before 0.9.13, 0.9.12's release record
(bbdf742) recorded 0.9.12's page, BeltBattles-0.9.12-9a145b83e041-online.html (1,015,682 bytes, sha256
`9911a69fc4d826ca…`, built at 9a145b8), which release v24 serves. Before 0.9.12, 0.9.11's release record
(0be1bbb) recorded 0.9.11's page, BeltBattles-0.9.11-88c2e865e10b-online.html (1,014,964 bytes, sha256
`574b7ba79251aee5…`, built at 88c2e86), which release v23 serves. Before 0.9.11, 0.9.10's release record
(c5f695a) recorded 0.9.10's page, BeltBattles-0.9.10-d92ef999a23d-online.html (936,607 bytes, sha256
`7b32c744ab6c7953…`, built at d92ef99), which release v22 serves. Before 0.9.10, 0.9.9's release record
(c0182e7; 0.9.9.1's record kept it) recorded 0.9.9's page, BeltBattles-0.9.9-814a1b9c065d-online.html (934,945 bytes,
sha256 `67612299dd841566…`, built at 814a1b9), which releases v20 and v21 serve. Before 0.9.9, 0.9.8's release record
(fa1e9ed) recorded 0.9.8's page,
BeltBattles-0.9.8-ee32c765630a-online.html (736,701 bytes, sha256 `06fa891c66dc1334…`, built at ee32c76), which release
v19 serves. Before 0.9.8, 0.9.7's release record (236ac6f) recorded 0.9.7's page,
BeltBattles-0.9.7-567642b421f7-online.html (717,904 bytes, sha256 `ab1307f1a5a7f168…`, built at 567642b), which release
v18 serves. Before 0.9.7, 0.9.6's release record (1ca6151) recorded 0.9.6's page,
BeltBattles-0.9.6-69c9e5bdd9ea-online.html (706,489 bytes, sha256 `d3d640009943fcfe…`, built at 69c9e5b), which release
v17 serves. Before 0.9.6, 0.9.5's release record (cc0acfc) recorded 0.9.5's page,
BeltBattles-0.9.5-93f3e46f4697-online.html (691,285 bytes, sha256 `cddb1dede47ea618…`, built at 93f3e46), which release
v16 serves. Before 0.9.5, 0.9.4's release record (eb4c249) recorded 0.9.4's page,
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
and 0.9.5 pages play the same rules and meet each other's ghosts and uploads. It went live on 2026-10-06 at about
19:15Z (release v16, LIVE-095). 0.9.6, battles in motion, holds 0.9.5's battle code (section 24): both ships sail over
the day's sea while their boards stay level, and the same ship shows on every screen. It changes only what the screens
draw: no battle number, rune or rule changes, so the rules stay bb-0.9.3 and the pools don't move. 0.9.3, 0.9.4, 0.9.5
and 0.9.6 pages play the same rules and meet each other's ghosts and uploads. It went live on 2026-10-07 at about
16:36Z (release v17, LIVE-096). 0.9.7, release Z's LAST CHANCE with the captains' re-plan and six card faces, holds
0.9.6's code and changes the battle rules again (section 25): the rules move to bb-0.9.7, with a new seed pool (120
ghosts, 12 a day, each holding one rune for each dawn). A run down to its last life gets a life back and one free pick,
and the bots price an overfed gun's jams. The bb-0.9.3 ghosts and uploads stay in the bucket under their own prefix and
match only 0.9.3 to 0.9.6 pages; a 0.9.7 page asks for and uploads bb-0.9.7 ghosts only. It went live on 2026-10-08
at about 18:36Z (release v18, LIVE-097). 0.9.8, styles you earn, holds 0.9.7's battle code (section 26): looks the
player earns for the carrier, its floor panels, its belts and the stats panels, picked on the new CUSTOMIZE screen and
kept on the device. It changes only what the screens draw: no battle number, rune or rule changes, so the rules stay
bb-0.9.7 and the pools don't move. 0.9.7 and 0.9.8 pages play the same rules and meet each other's ghosts and uploads.
It went live on 2026-10-09 at about 01:11Z (release v19, LIVE-098). 0.9.9, the hull release with the battle view,
changes the battle rules again (section 27): the rules move to bb-0.10.0, with a new seed pool (120 ghosts, 12 a day,
each holding one rune for each dawn and a grade) and a new stand-in pool, made once (S8). Hulls grow with the day,
every day has a warlord fight that can drop a part, runs start with 10 hearts, rune offers are open, joins are free,
rigs and factories take shapes and a losing record meets weaker ghosts; the battle view and cleaner cards ride along.
The bb-0.9.7 ghosts and uploads stay in the bucket under their own prefix and match only 0.9.7 and 0.9.8 pages; a 0.9.9
page asks for and uploads bb-0.10.0 ghosts only.

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
node deploy/stage.mjs ../output-stage0917/pages/BeltBattles-0.9.17-771ec08d406e-online.html
```

Runs `npm run build:server` (type-check + vite bundle into server/dist/: ghost-server.mjs, ghost-admin.mjs,
gen-ghost-pool.mjs, from uploads-080 on also ghost-probe.mjs, and their shared chunks), copies the page to the
gitignored deploy/public/index.html and refuses unless its SHA-256 and size equal deploy/GAME_BUILD.txt. Expect the
last line:
`stage: ../output-stage0917/pages/BeltBattles-0.9.17-771ec08d406e-online.html -> deploy/public/index.html (1180630 bytes, sha256 matches GAME_BUILD.txt); server/dist built`.
A byte-identical copy elsewhere (for example in /home/cap/deliveries/beltbattles/) stages the same way; the line then
names that path.
To ship a different build later: `node deploy/stage.mjs <file> --record`, then commit GAME_BUILD.txt.

## 4. Deploy: one machine

```sh
fly deploy --ha=false --remote-only && fly status -a beltbattles
```

- Builds on Fly's remote builder from this directory with ./Dockerfile and ./fly.toml; the
  context is only server/dist and deploy/public/index.html (.dockerignore): about 3.1 MB at 0.9.17 (the
  bundle 1,891,276 bytes in 9 files, the page 1,180,630 bytes; 0.9.16's: about 3.0 MB, the bundle 1,824,043 bytes in 9 files and the page 1,177,256 bytes; 0.9.15.1's: about 2.9 MB, the bundle 1,715,024 bytes in 9 files (0.9.15's again: section 36) and the page 1,176,557 bytes; 0.9.15's: 1,715,024 bytes in 9 files and 1,169,732; 0.9.14.1's: 1,706,706 bytes in 9 files and 1,160,876; 0.9.14's: 1,704,956 and 1,150,336; 0.9.13's: 1,491,495 and 1,063,979; 0.8.0's were about 440 kB and 578 kB). Tens of MB would mean node_modules got in
  and .dockerignore was not applied. Stop and report that.
- The image is node:22-alpine plus those files; no npm install step appears in the build log.
- The release command (`node /app/dist/ghost-server.mjs seed`) runs first, on a throwaway machine with the
  secrets, and writes the bundled bb-0.16.0 pool (254 ghosts: 3 per hero per day for the four heroes, days 1-16, which is 192, plus 48 streak-tier ghosts (one a hero on days 5-16) and 14 for the busiest matchups: 12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18 a day; the
  seed pool v3, each ghost holding one rune for each dawn, the seed step's grade and its stated losses, a race ghost with
  its run seed). It checks all 254 first (the strict decoder, the rules, validateUpload in the player mode with its exact
  rune count and the road log, a reachable record, no duplicates) and writes nothing if one fails. The grades ship in
  the bundle (server/seedPoolData.ts, S8), so the seed plays no battle: 0.9.17's cost (bb-0.16.0's pool, 566,721 bytes) is in section 38 (STAGE-0917: kit0917/seed0917.sh and seedtime.sh); 0.9.16's (bb-0.15.0's pool, 499,336 bytes) is in section 37 (STAGE-0916: kit0916/seed0916.sh and seedtime.sh); 0.9.15's (bb-0.14.0's pool, 402,688 bytes) is in section 35 (STAGE-0915: kit0915/seed0915.sh and seedtime.sh; the VM's 256 MB are 262,144 kB); bb-0.13.0's seed (0.9.14) cost about 13 s wall and a peak RSS of 240,488 kB at nice 10 on a 30 GB host (the launch seed over the old pool, load 5.6), and 16 s and 260,336 kB on one pinned core (STAGE-0914: kit0914/seed0914.sh and seedtime.sh; see sections 33 and 34, finding F1) (0.9.13: about 9 s wall and a peak RSS of
  about 186,000 kB at a loaded host, 11 s and 187,424 kB on one pinned core; see sections 32 and 33; 0.9.11's 192 ghosts took 2.4 s and 170,128 kB, one process at nice
  19, kit0911/seed0911.sh, STAGE-0911's pre-flight, whose STAGE report has the one-core number at its tip,
  kit0911/seedtime.sh; 0.9.10's 120 ghosts took 2 s and 96,812 kB; 0.9.9's: 97,604 kB). Expect a `seed: rules
  bb-0.16.0, 254 pool ghosts on tigris (...)` line with `254 written, 0 unchanged, 0 removed` at 0.9.17's launch (the
  first bb-0.16.0 seed: the live store holds, on PATH A, bb-0.15.0's 230 and bb-0.14.0's 192 and the older pools, on PATH B bb-0.14.0's 192 and the older pools, and nothing under bb-0.16.0 on either: section 38), and `0
  written, 254 unchanged, 0 removed` on every later deploy of the same image (the release command runs at each `fly deploy`,
  not at a machine start or `fly apps restart`). (0.9.9's launch wrote `120 written, 0
  unchanged, 0 removed` under bb-0.10.0, 0.9.9.1's `78 written, 42 unchanged, 78 removed`, 0.9.10's `0 written, 120
  unchanged, 0 removed`, 0.9.11's `192 written, 0 unchanged, 0 removed` (the first bb-0.11.0 seed: the live store held
  bb-0.10.0's 120 and nothing under bb-0.11.0), 0.9.13's `192 written, 0 unchanged, 0 removed` (the first bb-0.12.0 seed: the live store held
  bb-0.11.0's 192 and nothing under bb-0.12.0), 0.9.14's `192 written, 0 unchanged, 0 removed` (the first bb-0.13.0 seed: the live store held
  bb-0.12.0's 192 and nothing under bb-0.13.0: section 33), 0.9.14.1's `0 written, 192 unchanged, 0 removed` (a new image carrying the same
  bb-0.13.0 pool: section 34), 0.9.15's `192 written, 0 unchanged, 0 removed` (the first bb-0.14.0 seed: the live store held bb-0.13.0's 192 and nothing under bb-0.14.0: section 35),
  0.9.15.1's `0 written, 192 unchanged, 0 removed` (a new image carrying the same bb-0.14.0 pool: section 36), 0.9.16's launch, which is staged and has not run (its seed would read `230 written, 0 unchanged, 0 removed`,
  the first bb-0.15.0 seed: section 37), and 0.9.12's `0 written, 192 unchanged, 0 removed` (a new image carrying
  the same pool; the live store already held the 192: section 31).) The seed touches only `ghosts/bb-0.16.0/dNN/pool/`:
  bb-0.15.0's 230 pool ghosts (if 0.9.16 launched first) and every upload under it, bb-0.14.0's 192 pool ghosts and every upload under it, bb-0.13.0's 192 pool ghosts and every upload under it, bb-0.12.0's 192 pool ghosts and every upload under it, bb-0.11.0's 192 pool ghosts and every upload under it, bb-0.10.0's 120 pool ghosts and every upload under it, and the
  bb-0.9.7, bb-0.9.3, bb-0.9.1, bb-0.9.0, bb-0.8.7, bb-0.8.6, bb-0.8.3 and bb-0.8.0 ghosts and uploads (and bb-0.6.1's)
  stay under their own prefixes, and no player upload is touched. Pool ghosts carry no player name: the name check is
  POST /v1/ghosts's alone.
  If the release command fails, the deploy stops and nothing is replaced; the output names the failing step. From 0.9.15.1 on fly.toml itself gives the release command a
  performance-1x machine and 15 minutes (`[deploy.release_command_vm]` and `release_command_timeout`; RIDE L1, section 36); through 0.9.15 those two settings lived only in an
  untracked launch.toml.
- flyctl does not print the release command's own output: the deploy log shows only `release_command <machine>
  completed successfully` (LIVE-080 section 4). The `seed: …` line is in `fly logs -a beltbattles --no-tail`
  (section 8), another call.
- `--ha=false` keeps one machine; `fly status` should show exactly one `app` machine, `started` with its health check
  `passing`, or stopped until the first request (auto-stop). The rolling update can leave the machine `stopped`, with
  checks `1 total, 1 warning`, as the 0.8.0 deploy did (LIVE-080 section 4). The first request starts it.

## 5. Live checks (one call)

```sh
curl -sS https://beltbattles.fly.dev/v1/health; echo; curl -sS -o /dev/null -w 'http -> %{http_code} %{redirect_url}\n' http://beltbattles.fly.dev/; curl -sS -D - -o /dev/null https://beltbattles.fly.dev/ | grep -i -E '^(HTTP|content-type|content-length|cache-control|x-content-type-options|referrer-policy)'; curl -fsS https://beltbattles.fly.dev/ | cmp - deploy/public/index.html && echo 'live page = the staged 0.9.17 online page (cmp)'; curl -sS -o /dev/null -w '%{url_effective} -> %{http_code}\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.16.0&day=[1-16]&wins=0&lives=10&player=runbook-check&seen=&runs=0'; curl -sS 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.16.0&day=3&wins=1&lives=9&player=runbook-check&seen=&runs=0' | head -c 300; echo; curl -sS -w ' -> %{http_code}\n' -X POST -H 'content-type: application/json' --data '{}' https://beltbattles.fly.dev/v1/ghosts; fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.16.0'
```

Expect, in order:
1. `{"ok":true,"rules":"bb-0.16.0","store":"tigris","ghosts":…,"uploads":"closed","uptimeS":…}`, and
   `"uploads":"open"` once the uploads step (section 9) is live. `ghosts` counts what the lazy bucket cache has read
   so far; 0 right after a start is normal.
2. `http -> 301 https://beltbattles.fly.dev/` (force_https).
3. `HTTP/2 200`, `content-type: text/html; charset=utf-8`, `content-length: 1180630` (0.9.16's page: 1177256; 0.9.15.1's page: 1176557; 0.9.15's page: 1169732; 0.9.14.1's page: 1160876; 0.9.14's page: 1150336; 0.9.13's page: 1063979; 0.9.12's page: 1015682; 0.9.11's page: 1014964; 0.9.10's page: 936607; 0.9.9's page: 934945; 0.9.8's page: 736701; 0.9.7's page: 717904; 0.9.6's page: 706489; 0.9.5's page: 691285; 0.9.4's: 691202; 0.9.3's: 691113; 0.9.2's: 696831; 0.9.1's: 696824; 0.9.0's: 695449; 0.8.9's: 672501; 0.8.8's: 670455; 0.8.7's: 634882; 0.8.6's: 607541; 0.8.5's: 598639; 0.8.4's: 591654; 0.8.3's: 590294; 0.8.2's: 589217; 0.8.1's: 587335; 0.8.0's: 578419),
   `cache-control: no-cache`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
4. `live page = the staged 0.9.17 online page (cmp)` (no line at all means a mismatch).
5. Sixteen lines `…day=N… -> 200`, days 1-16: a new player (`runs=0`, D2: seed ghosts only) with 0 wins and
   10 hearts (a hearts run starts with 10; a 5-lives request reads 404 on days 1-4, since every seed ghost there holds
   more lives) gets a ghost with no better record (D1: fewer wins, or as many and no more lives; here a 0-win ghost).
   Under bb-0.16.0 the days hold 12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18 seed ghosts (254 in all; bb-0.15.0's held 12, 12, 13, 13, 12, 13, 16, 17, 17, 16, 18, 16, 14, 13, 14 and 14, 230 in all, and up to 0.9.15.1 every day held 12), at least 4 of them on the day's floor record (12 on day 1; 6 on days 2, 3 and 11; 5 on days 7, 9 and 13; 4 on the others: counted by the hull lane at the shipped bb-0.16.0 pool, packet section 4, and the same counts as at bb-0.15.0). Under bb-0.11.0, bb-0.12.0, bb-0.13.0, bb-0.14.0, bb-0.15.0 and bb-0.16.0 a thin day widens to
   the nearest earlier day that has an eligible ghost (src/net/matchmaking.ts matchDays; server/app.ts:391-412 until
   0.9.12, :406-427 from 0.9.13, :427-451 at 0.9.17), and the day bound is 25 (server/app.ts:228 until 0.9.12, :236 from 0.9.13, :243 at 0.9.17, maxDayFor):
   STAGE-0911's, STAGE-0913's, STAGE-0914's and STAGE-09141's seedcheck.sh [3d] read day 17 and day 25 `-> 200` (a ghost of day 16) and day 26
   `-> 400` (`day: expected an integer in 1..25`; STAGE-0915's read at bb-0.14.0: section 35; STAGE-0916's read at bb-0.15.0: section 37; STAGE-0917's read at bb-0.16.0: section 38); add `day=17` to the call if you want that line live.
6. Day 3's body for a new player on 1 win, 9 hearts: `{"id":"g…","snapshot":{"v":3,"rules":"bb-0.16.0",…,"day":3,`
   with at most 1 win, from any of the four heroes. Under bb-0.16.0 (as under bb-0.15.0, bb-0.14.0, bb-0.13.0, bb-0.12.0 and bb-0.11.0) a seed ghost holds one rune for
   each dawn, its grade and its stated losses, so it travels as v3, as a served player upload does: with its runes and
   without its run seed (the server never serves one).
7. `{"error":"uploads are not open yet"} -> 403` while uploads are closed. Once they are open (section 9), the same
   unsigned POST gets `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`.
8. The admin tool's read-only list on the machine (section 7): sixteen day rows of seed-pool ghosts (12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18 under bb-0.16.0), 0 uploads, 0
   players; `all 254 0 0`. Once uploads are open, the uploads and players columns also count the players' uploads: `all
   254 N P` for N uploads by P players. (`--rules bb-0.11.0` still reads `all 192 N P`: 0.9.11's and 0.9.12's pool and
   uploads stay; `--rules bb-0.10.0` still reads `all 120 N P`: 0.9.10's pool and uploads stay; `--rules bb-0.15.0` reads `all 230 N P` if 0.9.16 launched first (PATH A; on PATH B it has no bucket: section 38 says
   what the list prints), `--rules bb-0.14.0` (from 0.9.16 on), `--rules bb-0.13.0` (from 0.9.15 on) and
   `--rules bb-0.12.0` (from 0.9.14 on) read `all 192 N P` too: those pools and their uploads stay.) From 0.9.14.1 on, read the list for S1: a row
   whose day is above 25 with uploads above 0 is a stored endless snapshot past the bound; expect none (sections 34, 35, 37 and 38).
Optional, separately: the rate limit, `curl -sS -o /dev/null -w '%{http_code}\n' 'https://beltbattles.fly.dev/v1/health?burst=[1-130]' | sort | uniq -c`:
about `120 200` and the rest `429` (120/min per client IP, keyed on Fly-Client-IP). Wait 60 s before
re-running any check from this machine.

**Older pages.** A browser that still holds an older page (no-cache: a reload gets the live page) asks for its own rules'
ghosts. It gets that rules' seed ghosts if the bucket still holds them, otherwise a 404, and then it fights its own
stand-in. Its uploads are refused: 403 while uploads are closed, 422 (foreign rules) once they open. Under 0.9.17 a 0.9.16 tab or page (PATH A only: on PATH B nobody ran 0.9.16) asks for bb-0.15.0 ghosts: it still gets the bb-0.15.0 ghosts the bucket holds (230 seed
ghosts and the uploads made under them; the match route reads the bucket of the rules a request names, server/app.ts:442-445), but its
uploads answer 422 (`rules bb-0.15.0 not accepted: this server validates bb-0.16.0`, server/app.ts:366-368), and those pages say nothing
(section 38); a 0.9.15.1 or 0.9.15 tab or page asks for bb-0.14.0 ghosts and meets the same (192 seed ghosts and the uploads made under them; 422 `rules bb-0.14.0 not accepted: this server validates bb-0.16.0`; section 38).
Under 0.9.16, if it launches first, a 0.9.15.1 or 0.9.15 tab or page asks for bb-0.14.0 ghosts: it still gets the bb-0.14.0 ghosts the bucket holds (192 seed
ghosts and the uploads made under them), but its
uploads answer 422 (`rules bb-0.14.0 not accepted: this server validates bb-0.15.0`, server/app.ts:360-361 in 0.9.16's tree), and those pages say nothing
(section 37). Under 0.9.15.1 an open 0.9.15 tab was not an older page: it asked for, and uploaded under, the same rules bb-0.14.0, so it kept playing the same
ghosts as the 0.9.15.1 pages (section 36). Under 0.9.15 a
0.9.14.1 or 0.9.14 tab or page asked for bb-0.13.0 ghosts: it still gets the bb-0.13.0 ghosts the bucket holds (192 seed
ghosts and the uploads made under them), but its
uploads answer 422 (`rules bb-0.13.0 not accepted: this server validates bb-0.16.0`, server/app.ts:366-368), and those pages say nothing
(section 35). Under 0.9.14.1 an open
0.9.14 tab was not an older page: it asked for, and uploaded under, the same rules bb-0.13.0, so it kept playing the same ghosts as the
0.9.14.1 pages (section 34). Under 0.9.14 a
0.9.13 tab or page asked for bb-0.12.0 ghosts: it still gets the bb-0.12.0 ghosts the bucket holds (192 seed
ghosts and the uploads made under them), but its uploads answer 422 (`rules bb-0.12.0 not accepted: this server
validates bb-0.16.0`, server/app.ts:366-368), and those pages say nothing. Under 0.9.13 a
0.9.12 or 0.9.11 tab or page asked for bb-0.11.0 ghosts: it still gets the bb-0.11.0 ghosts the bucket holds (192 seed
ghosts and the uploads made under them), but its uploads answer 422 (`rules bb-0.11.0 not accepted: this server
validates bb-0.16.0`, server/app.ts:366-368), and those pages say nothing; the older rules (bb-0.10.0 and before) as
before. Under 0.9.12 an open 0.9.11 tab is not an older page: it asks for, and uploads under, the same rules
bb-0.11.0, so it keeps playing the same ghosts as the 0.9.12 pages (section 31). Under 0.9.11 and 0.9.12 the
0.9.10 and 0.9.9 pages (and 0.9.9.1's) still get the bb-0.10.0 ghosts the bucket holds, 120 seed ghosts and the uploads
made since 0.9.9 (34 at staging), but their uploads answer 422 (`rules bb-0.10.0 not accepted: this server validates
bb-0.11.0`, server/app.ts:336-337), and those pages say nothing. Under 0.9.9 the
0.9.8 and 0.9.7 pages still get the bb-0.9.7 ghosts the bucket holds (the match route serves the bucket of the rules a
request names: server/app.ts:204, :357), but their uploads answer 422 (`rules bb-0.9.7 not accepted: this server
validates bb-0.10.0`, server/app.ts:321-322), and those pages say nothing.
The 0.9.6, 0.9.5, 0.9.4 and 0.9.3 pages still get the bb-0.9.3 ghosts the bucket holds, but their uploads answer 422,
because this server validates bb-0.16.0. The 0.9.2 page (and the 0.9.1 page) gets
the bb-0.9.1 ghosts, the 0.9.0 page the bb-0.9.0 ghosts, the 0.8.7, 0.8.8 and 0.8.9 pages the bb-0.8.7 ghosts, and
theirs answer 422 too.

## 6. Cold start (after the machine auto-stops)

Leave the app idle for about 10 minutes (no requests), then:

```sh
fly machine list -a beltbattles && curl -sS -o /dev/null -w 'cold health: %{http_code} in %{time_total}s\n' https://beltbattles.fly.dev/v1/health && curl -sS -o /dev/null -w 'first match after start: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.16.0&day=3&wins=1&lives=9&player=runbook-cold&seen=&runs=0' && curl -sS -o /dev/null -w 'warm match: %{http_code} in %{time_total}s\n' 'https://beltbattles.fly.dev/v1/ghosts/match?rules=bb-0.16.0&day=3&wins=1&lives=9&player=runbook-cold&seen=&runs=0' && fly machine list -a beltbattles
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
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.16.0'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.16.0'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs wipe-uploads --rules bb-0.16.0'
fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs remove-player <playerId> --rules bb-0.16.0'
```

- Every command but `list` is a DRY RUN unless `--apply` is added: it prints each record it would delete
  (key, kind, day, ghost id, player, reason), then `DRY RUN: nothing was deleted`. Read the plan, then run the
  same command again with `--apply`; it deletes exactly the planned records.
- `--rules` is required; nothing of another rules version is read or touched. `revalidate` runs only for this
  build's rules (bb-0.16.0): every upload through the strict decoder, the exact rules, the rules and hero gates,
  validateUpload in the player mode (the runes' exact count, one for each dawn, their ids, repeats and dormant runes
  too, and a LAST CHANCE's day and card), the reachable-record check (with the record's LAST CHANCE, read by the
  record's own rules) and the player name (the checks POST /v1/ghosts makes, so a bb-0.16.0 store should never list a
  record, name or rune failure). **From 0.9.14.1 on (S1)** `revalidate` skips the deck check of a stored endless snapshot past day 25
  (server/ghostAdmin.ts:271) and prints one line after the plan: `deck check skipped for N stored endless snapshot(s) past day 25 (too slow;
  POST /v1/ghosts refuses such a day): <up to five refs>`; every other check (id, key, rules, gate, the endless record, the name) still runs on it,
  so a forged one is still found, and an honest one is kept. Before 0.9.14.1 the tool deck-checked every stored record, 3-26 s of CPU and up to 221 MB
  for a deep endless one: with such a record on the store, run `revalidate` only with an image that has S1 (section 34).
  It does not re-derive the dawn offers from the stored run seed: that rune check is POST's alone. It can't re-check
  signatures: the server keeps neither keys nor signatures.
- The seed pool is never deleted, except by `wipe-uploads --pool` (the next deploy's release command writes it
  back). `remove-player` never touches a seed ghost.
- Exit 2 is a refused command line (nothing read); exit 1 means fewer records were deleted than planned.
- **After an `--apply` the running server keeps serving deleted ghosts** from its bucket cache until
  BB_GHOST_CACHE_TTL_S (600 s) passes or the machine restarts. To make it take effect at once:
  `fly apps restart beltbattles`, then check the match route.
- `ghost-admin` does not know the profiles (PROFILE-UP, section 30): `profiles/<playerId>.json` on Tigris is never listed,
  revalidated or removed by it; a `--profile` probe leaves one, to delete by hand (any S3 tool, or leave it: one small record).
- Old pools: the bb-0.15.0 (0.9.16's, if it launched first: the PATH A rollback's, section 38; no bucket on PATH B), the bb-0.14.0 (0.9.15's and 0.9.15.1's, the PATH B rollback's, section 38, and the rollback of 0.9.16's own launch, section 37), bb-0.13.0 (0.9.14.1's: section 35), bb-0.12.0, bb-0.11.0, bb-0.10.0, bb-0.9.7, bb-0.9.3, bb-0.9.1, bb-0.9.0, bb-0.8.7, bb-0.8.6, bb-0.8.3 and bb-0.8.0
  pools and uploads, and the bb-0.6.1 pool (and bb-0.6.2's, had 0.7.0 gone live), can stay; they serve only older
  cached pages.
  To remove one, on the operator's word: `wipe-uploads --rules <old rules> --pool`, a dry run first, then `--apply`.

## 8. Re-seed, rollback, teardown

Re-seed (every deploy re-seeds; with an unchanged bundle nothing is written):

```sh
fly deploy --ha=false --remote-only && fly logs -a beltbattles --no-tail | grep -E 'seed:|seed failed' | tail -n 3
```

Expect `0 written, 254 unchanged, 0 removed` (bb-0.16.0's pool; 0.9.17's own launch is the first bb-0.16.0 seed: `254
written, 0 unchanged, 0 removed`, section 38; 0.9.16's launch, staged and not run, would be the first bb-0.15.0 seed: `230 written, 0 unchanged, 0 removed`, section 37; 0.9.15's launch was the first bb-0.14.0 seed: `192 written, 0 unchanged, 0 removed`, section 35, and 0.9.15.1's `0 written, 192 unchanged, 0 removed`, the same pool, section 36; 0.9.14's launch was the first bb-0.13.0 seed, section 33, and 0.9.14.1's `0 written, 192 unchanged, 0 removed`, the same pool, section 34; 0.9.13's launch was the first bb-0.12.0 seed, section 32; 0.9.11's launch was the first bb-0.11.0 seed: `192 written, 0 unchanged, 0
removed`, section 30; 0.9.12's launch was `0 written, 192 unchanged, 0 removed`, section 31). After a rules bump or a
new seed pool, expect the new pool written and, for the same rules version, stale pool entries removed; player uploads
are never touched by the seed.

Rollback to an earlier release (its own release command re-seeds its own pool):

```sh
fly releases -a beltbattles --image
fly deploy --ha=false --remote-only --image <IMAGE REF of the release to return to, from the list above> -e BB_GHOST_UPLOADS=closed
```

From 0.9.17 the previous image depends on the launch path (section 38): on PATH A it is 0.9.16's hosting release (v31 if nothing else ships first; read it at the launch), the page and the server together, which puts bb-0.15.0 back on both sides; its release command
re-seeds bb-0.15.0's pool (`0 written, 230 unchanged, 0 removed`) and leaves bb-0.16.0's decks where they are. On PATH B (0.9.16 is never launched alone) it is 0.9.15.1's release (v30, image
registry.fly.io/beltbattles:deployment-01M72YAPXXJRGYNC7NTDH9PVWW; the page and the server together, which puts bb-0.14.0 back on both sides); its release command re-seeds bb-0.14.0's pool (`0 written, 192 unchanged, 0
removed`) and leaves bb-0.16.0's decks where they are. See section 38's rollback; what a run saved in 0.9.17 does on each older page, and what the streak key does, is section 38's saved-run paragraph.
If 0.9.16 launches first, from 0.9.16 the previous image is 0.9.15.1's release (v30, image registry.fly.io/beltbattles:deployment-01M72YAPXXJRGYNC7NTDH9PVWW; the page and the server together, which puts
bb-0.14.0 back on both sides): see section 37's rollback. Its release command re-seeds bb-0.14.0's pool (`0 written, 192 unchanged, 0 removed`) and leaves
bb-0.15.0's decks where they are. What a run saved in 0.9.16 does in it is item (b) of section 37's saved-run paragraph.
From 0.9.15.1 the previous image was 0.9.15's release (v29, image registry.fly.io/beltbattles:deployment-01M6XV00ACXZ2KGHG69555EYHH; the page and the server together, on the same rules
bb-0.14.0): see section 36's rollback. Its release command re-seeds the same pool (`0 written, 192 unchanged, 0 removed`), and a run saved in 0.9.15.1 loads in it (a 0.9.15.1 save is a
0.9.15 save: the same save key and RUN_VERSION, and nothing under src/game moved; section 36). From 0.9.15 the previous image is 0.9.14.1's release (v28; the page and the server together, which puts
bb-0.13.0 back on both sides): see section 35's rollback. Its release command re-seeds bb-0.13.0's pool (`0 written, 192 unchanged, 0 removed`) and leaves
bb-0.14.0's decks where they are. A run saved in 0.9.15 loads in it (from the code: the same save key and RUN_VERSION, and every id it names, its wares too,
is one 0.9.14.1 knows, so no aside line and the wares stay; section 35), and S1's guard stays (0.9.14.1 has it). From
0.9.14.1 the previous image was 0.9.14's release (its number is in the CMD; the page and the server together, on the same rules
bb-0.13.0): see section 34's rollback. Its release command re-seeds the same pool (`0 written, 192 unchanged, 0 removed`), a run saved in 0.9.14.1 loads in it,
and S1's guard goes with it. From 0.9.14 the previous image was 0.9.13's v25 (registry.fly.io/beltbattles:deployment-01M5CHZNH6RKGMJNTE0GD0TJM9,
the page and the server together, which puts bb-0.12.0 back on both sides): see section 33's rollback. Its release
command re-seeds bb-0.12.0's pool (`0 written, 192 unchanged, 0 removed`) and leaves bb-0.13.0's decks where they are. A run saved in 0.9.14 that
names a gate (on the deck, in cargo or among that day's caravan offers) is set aside by 0.9.13's save guard with its aside line (section 33: NEW RUN replaces it); a save without one loads as an ordinary run. From
0.9.13 the previous image was 0.9.12's v24 (registry.fly.io/beltbattles:deployment-01M57BGVDCKDMKSE1VQ1JX6GEJ,
the page and the server together, which puts bb-0.11.0 back on both sides): see section 32's rollback. Its release
command re-seeds bb-0.11.0's pool (`0 written, 192 unchanged, 0 removed`, on a JSON-lines store too while it holds no ENDLESS upload: section 32) and
leaves bb-0.12.0's decks where they are. A run saved in 0.9.13 that names one of the seven new rigs (in its deck, cargo or caravan offers) may not open under 0.9.12
(section 32: a dead CONTINUE; NEW RUN replaces it). From
0.9.12 the previous image was 0.9.11's v23 (registry.fly.io/beltbattles:deployment-01M56B4514PHZZ17S572CGSMA6,
the page and the server together, on the same rules bb-0.11.0): see section 31's rollback. Its release command
re-seeds the same pool (`0 written, 192 unchanged, 0 removed`), and a run saved in 0.9.12 loads in it. From 0.9.11 the
previous image was 0.9.10's v22 (registry.fly.io/beltbattles:deployment-01M557C6PK0XAW8JT7K36VD1JQ,
the page and the server together, on bb-0.10.0): see section 30's rollback. Its release command re-seeds bb-0.10.0
(`0 written, 120 unchanged, 0 removed`) and bb-0.11.0's records stay under their own prefix, unseen. **On a JSON-lines
dev store it is different**: v22's seed (and v22's ghost-admin) cannot read bb-0.11.0 lines and rewrite the file without
them, so never run v22's seed against a jsonl store that holds bb-0.11.0 data. Fly's store is Tigris, whose seed is
prefix-scoped (STAGE-0911's tigris-rollback rehearsal; section 30).

Rolling back to the previous image (the last call's releases-before file names it; for 0.9.9 that is 0.9.8's release,
v19, image registry.fly.io/beltbattles:deployment-01M4F3CAMZQZW1JXKQZ1R8XXS0, its page on the older rules bb-0.9.7)
moves the rules back: see section 27's rollback. Its release command re-seeds the bb-0.9.7 pool (`0 written, 120
unchanged, 0 removed`: 0.9.9's seed never touched that prefix), and the bb-0.10.0 records stay under their own prefix,
unseen. After a rollback, a 0.9.9 run whose deck holds a NAIL STRIP (or an EMBER TROUGH or SPIKE RAIL, which 0.9.8 doesn't know either) can't be continued: 0.9.8's title offers CONTINUE, but the tap does nothing (0.9.8 throws `unknown item nailstrip`, which the player doesn't see). NEW RUN works and replaces that save (the STAGE's rollback probe on 0.9.8's page, fa1e9ed: output-stage099c/browser/rbprobe-098.log). A player's saved styles, battle speed and seen tips stay on the device. The release before it is
0.9.7's v18 (image registry.fly.io/beltbattles:deployment-01M4ECQT8HY0RZN20KX97JXKH4), on bb-0.9.7 too; the one before
that, 0.9.6's v17 (image registry.fly.io/beltbattles:deployment-01M4BKHAMC03HP1RPN8SPEWGNT), is on the older rules
bb-0.9.3: going back to it also moves the rules back, as section 25's rollback says.

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

**Addendum, 0.9.11 (PROFILE-UP; section 30).** The probe takes an opt-in third argument, `--profile` (`node
server/dist/ghost-probe.mjs <base-url> <id-file> --profile`): after its POSTs it PUTs a minimal signed profile (expects
200 and the profile as sent) and the same body with a broken signature (expects 401), so the summary reads `17 of 17`
instead of `15 of 15` (at bb-0.12.0 from 0.9.13 on: `18 of 18` instead of `16 of 16`, section 32; at bb-0.13.0 from 0.9.14 on: `23 of 23` instead of `21 of 21`, section 33; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; at bb-0.16.0 from 0.9.17 on: `25 of 25` instead of `23 of 23`, section 38). The server keeps
that one profile for the probe's player at `profiles/<player id>.json`, which ghost-admin does not know (section 7):
delete it by hand. The route is new in 0.9.11: deploy the server first or together with the client, never the client
alone (an old server answers the page's PUT /v1/profile with a 404, silent on screen).

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

## 24. 0.9.6: battles in motion (rules bb-0.9.3, no bump; its own L4)

0.9.5's launch is section 23, in the clone beltbattles-r095/BeltBattles-r095 (branch release-095, tip cc0acfc). It ran
there on its own L4 and must never run again: 0.9.5 is live as release v16 (image
registry.fly.io/beltbattles:deployment-01M49A6YJKWCTYPSABXK2TM40V, since 2026-10-06 at about 19:15Z, LIVE-095). This
section is 0.9.6's launch, from this clone.

0.9.6 ships battles in motion on 0.9.5's rules, bb-0.9.3 (the motion lane's MOTION-1 and MOTION-2; REQ-BFG-071):
- **Battles in motion:** both carriers sail left to right over the sea, drifting, turning and bobbing, while their
  boards stay level and parallel, so tiles, belts and numbers read as before. Shots fly between the moving boards, and
  the HUD stays fixed.
- **Three seas by day:** CALM SEA on days 1-3, STORM (with rain) on days 4-7 and EMBER SEA on days 8-10.
- **One ship everywhere:** the player's ship sails under the board in battle, on the title and in replays, and is held
  still on the build screen, the run summary and the hero select. The build screen's board, taps and drags are where
  they were.
- **REDUCED MOTION** (OPTIONS) sails straight: no turning, drifting or bobbing, a slower sea and no rain. Fights last
  just as long either way.

It is presentation only. The motion code draws with its own display-only random source, never the battle's, and
nothing under src/sim, src/net, src/core, server or tools changed. The dev knobs (`?sway`, `?sea`, `?perf`) live only in
test builds; the player build ignores them. docs/MOTION.md describes the motion.

**What ships.** Branch release-096 at its tip, in this clone: release-095's cc0acfc (0.9.5 as live; tag r095) merged
with the motion lane's motion2 at 73ddef4 (tag motion-head; 14 commits made on 0.9.4's eb4c249, in 28 files) by the
Prime's setup as d9a89e3 (tag merge096), the 0.9.6 label (69c9e5b) and the release record (GAME_BUILD.txt and this
section). A commit can't name its own hash, so the Prime names the tip at launch.
- The page is the 0.9.6 online page that GAME_BUILD.txt records (BeltBattles-0.9.6-69c9e5bdd9ea-online.html,
  706,489 bytes, sha256 `d3d640009943fcfe…`), built at 69c9e5b; it reads V0.9.6 on the title screen. It is 15,204 bytes
  larger than 0.9.5's page, because the motion code runs in every build.
- The rules stay bb-0.9.3 (RULES_VERSION, and the probe's PROBE_RULES); POOL_RULES_CARRIED stays empty, and
  SUSTAIN_LIVE and BOT_RUNES stay on. Since cc0acfc, nothing changed under src/sim, src/net, src/core, server or tools:
  only display code (src/render, src/game's arena and battle-layout files, src/screens, src/main.ts), its tests, test
  scripts, docs and the label. The pools don't move: the stand-in check that read the pool identical at 0.9.4's 813fa0c
  carries, since no file in the generator's bundle changed, and the seed pool is 0.9.5's. parBench's fingerprint is
  1e04d09c, as at 0.9.5, and the pinned sim fingerprint reads identical to 0.9.4's pin, fp-094-7a4faa7.json (848,668
  bytes, sha256 `bfe9ae76803a1bf1…`; a copy is ../kit096/h2/ beside this clone), at d9a89e3 and at the tip.
- The server is built from the tip, from 0.9.5's server sources (which are 0.9.4's): its strict decoder, its record,
  name and rune checks, its rules gate and its bundled seed pool are 0.9.5's, so the upload check accepts and refuses
  what it did.
- 0.9.3, 0.9.4, 0.9.5 and 0.9.6 pages play the same rules: each asks for and uploads bb-0.9.3 ghosts, so they meet each
  other's ghosts and uploads. A browser still on the 0.9.5 page keeps playing and uploading as before.
- fly.toml, the Dockerfile and .dockerignore are unchanged (uploads-080's, as 0.9.5's), so uploads stay open. Under
  deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** re-seeds the bb-0.9.3 pool that 0.9.3's launch (section 21) wrote and 0.9.4's and 0.9.5's
launches (sections 22 and 23) re-seeded: `seed: rules bb-0.9.3, 120 pool ghosts on tigris (...)` with `0 written, 120
unchanged, 0 removed`. The rules don't move, so the players' bb-0.9.3 uploads already in the bucket stay and keep
meeting players.

**The probe runs** (section 9's pattern, as in section 23). The upload path is 0.9.5's, unchanged, and the probe checks
it end to end on the new image: its honest decks hold their dawn runes, taken as the bots take them, and travel as v3
with the run seed. The release checks rehearsed this whole block on a local server, the built server on a scratch
store, the hand clean-up included (kit096/probecheck.sh; ../output-stage096/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 23's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-096 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage096/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.6` on both 0.9.6 pages). It refuses unless the staged label is 0.9.6 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. 0.9.6 launches after 0.9.5 (section 23),
   so the guard expects to read 0.9.5 live, and that passes. If it reads an older label instead, Fly is not on v16:
   stop there and ask the Prime, because this section's seed line and rollback assume 0.9.5's release;
3. stage the 0.9.6 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.3, as at 0.9.5's launch). Expect:
- health: `{"ok":true,"rules":"bb-0.9.3","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.6 online page (cmp)`, and `content-length: 706489`;
- a bb-0.9.3 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.3","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.3 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives, as at 0.9.5;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.3` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 N P`. The
  uploads and players columns may be above 0, because bb-0.9.3 uploads have come in since 0.9.3's launch (after 0.9.5's
  launch the list read `all 120 12 2`, LIVE-095);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.3, 120 pool ghosts on tigris (...)` with `0 written,
  120 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.3, as in section 23), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage096/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 12 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.3); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 9 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, and hero-METRONOME and hero-SIPHON 400 (`snapshot.hero:
   rules bb-0.9.3 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`); then `probe player: <43 characters>` and
   `probe: 9 of 9 checks as expected; the server stored 4 deck(s) for this player (expected 4); the player id is in
   ../output-stage096/probe-id.txt`. The four stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, and the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.3'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.3; keep 120 seed-pool ghost(s) and N upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` N is the probe's 4 plus every bb-0.9.3 upload players made
   since 0.9.3's launch, and theirs pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage096/probe-id.txt) --rules bb-0.9.3 --apply"`.
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
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r096/BeltBattles-r096 && [ -s ../output-stage096/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage096/probe-id.txt) --rules bb-0.9.3 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.3'
```

Expect `plan: delete N record(s) of bb-0.9.3`, where N is the number of 201s the probe got (at most 4), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first. 0.9.5's image reads the same rules,
so the clean-up works under either image.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.5's release v16 (image
registry.fly.io/beltbattles:deployment-01M49A6YJKWCTYPSABXK2TM40V, LIVE-095), its page on the same rules bb-0.9.3.
Check that the releases-before file lists v16 first; if it doesn't, stop and ask the Prime. Deploy that image from this
clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte for
byte, as 0.9.5's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M49A6YJKWCTYPSABXK2TM40V
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.3"`, and the page must be 0.9.5's online page,
BeltBattles-0.9.5-93f3e46f4697-online.html (691,285 bytes, sha256 `cddb1dede47ea618…`). Its release command re-seeds the
same pool (`0 written, 120 unchanged, 0 removed` under bb-0.9.3). The rules are the same, so a rollback keeps the pool
and every bb-0.9.3 upload in use: 0.9.5 plays the same rules, and its battles are the same battles, drawn on the old
floor. The release before v16 is 0.9.4's v15 (image
registry.fly.io/beltbattles:deployment-01M48T7AKR4SABBBPG50RJD9YG, LIVE-094; its page
BeltBattles-0.9.4-f1c0a62452cf-online.html, 691,202 bytes), on the same rules too: the same command with v15's image
returns it, with the same seed line.

## 25. 0.9.7: LAST CHANCE (new rules bb-0.9.7; its own L4)

0.9.6's launch is section 24, in the clone beltbattles-r096/BeltBattles-r096 (branch release-096, tip 8fbba9d). It ran
there on its own L4 and must never run again: 0.9.6 is live as release v17 (image
registry.fly.io/beltbattles:deployment-01M4BKHAMC03HP1RPN8SPEWGNT, since 2026-10-07 at about 16:36Z, LIVE-096). This
section is 0.9.7's launch, from this clone.

0.9.7 ships release Z (REQ-BFG-073: LAST CHANCE) with the captains' re-plan (REQ-BFG-024, REQ-BFG-058, REQ-BFG-051) and
six card faces (REQ-BFG-070, REQ-BFG-046), on new battle rules, bb-0.9.7:
- **LAST CHANCE:** once a run, a dusk loss before day 10 that leaves the player on the last life gives that life back at
  once (the dusk card says `LAST CHANCE: +1 LIFE`). At the next dawn, before the dawn's rune, the player picks one of
  three free cards: a RUNE that fits the hero, an epic PART (a rig, turret or gear) that goes to cargo, or +500 max
  HULL for the rest of the run. The bots pick too, a ghost carries its card, and POST /v1/ghosts checks an upload's
  LAST CHANCE (its day, its card and its record) from the run seed.
- **The dark wind** hits both hulls alike; a new test keeps it so (it did before too).
- **The overfeed:** the bots' deck rating counts the shots a gun fed past its rate loses to jams (OVF-1).
- **The one bump and its one regeneration** (Z-BUMP): the rules move once to bb-0.9.7 (RULES_VERSION, the probe's
  PROBE_RULES and the rules gate's LAST_CHANCE_RULES), with nothing carried (POOL_RULES_CARRIED is empty); the luck caps,
  the stand-in pool and the seed pool v3 were made again once, under bb-0.9.7.
- **The captains' re-plan** (CATCHUP-097): OLD BULWARK's road deck from day 5, LONGTOOTH's early days, the day-5 road
  armor of SILKSHADE and THANE KARSK, and the IRON MATRIARCH's armor on days 8 to 10. LADDER_X_OPEN holds 105 (was 121).
- **Six card faces** (TXT-096) now say a rule the game already played by: ASSEMBLY LINE, HULLBREAKER, GATLING SPOOL,
  GRAPNEL GUN, PRESSURE BREECH and SORTING ARM. Text only.

**What ships.** Branch release-097 at its tip, in this clone: release-096's 8fbba9d (0.9.6 as live; tag r096) merged
with release Z's zbump-accepted e0422dc (tag zbump-head; 21 commits on 0.9.5's cc0acfc, in 77 files) by the Prime's
setup as c05acbd (tag merge097), CATCHUP-097's 2 commits and TXT-096's 3, each picked with -x (tags pick-c097 = a26cc0e
and pick-t096 = 9cf21b7), the drivers' LAST CHANCE fix (73f6b2d, scripts only), the 0.9.7 label (e786a29), the
CHANGELOG commit (567642b) and the release record (GAME_BUILD.txt and this section). A commit can't name its own hash,
so the Prime names the tip at launch.
- The page is the 0.9.7 online page that GAME_BUILD.txt records (BeltBattles-0.9.7-567642b421f7-online.html, 717,904 bytes, sha256
  `ab1307f1a5a7f168…`), built at 567642b; it reads V0.9.7 on the title screen. It is 11,415 bytes larger than 0.9.6's
  page.
- The rules move to bb-0.9.7, once, with nothing carried. The seed pool and the stand-in pool are bb-0.9.7's own, made
  once by Z-BUMP; the stand-in check read the pool identical at 9cf21b7 (this branch's pick-t096), and nothing since
  reaches the generator. The pinned sim fingerprint is CATCHUP-097's final pin, fp-097-final-c129409.json (848,001 bytes,
  sha256 `21f2dab4cc4ff692…`; a copy is ../kit097/h2/ beside this clone): the merge c05acbd reads identical to Z-BUMP's
  pin (847,924 bytes, `a79bda3268286f2b…`), and the two pick tags and the tip read identical to CATCHUP-097's.
  parBench's fingerprint is 8cde5ed0 (0.9.6's was 1e04d09c: the overfeed moved BASTION's ten rows).
- The server is built from the tip. POST /v1/ghosts takes snapshot v3 under bb-0.9.7 with 0.9.6's checks (exactly one
  rune for each dawn, each one its dawn offered, no unknown or repeated rune, the record, the name), and LAST CHANCE's:
  a LAST CHANCE comes before day 10 and before the deck's day, its rune or part must be the one its day offered (from
  the run seed), the HULL card adds its +500 to the hull the check allows, and the record must be one a run carries into
  that dusk after its LAST CHANCE (or, without one, a record that needs none). ghosts:admin revalidate and
  the seed check read each stored record by its own rules. The run seed is stored, never served.
- Its bundled seed pool is bb-0.9.7's (v3: 120 ghosts, 12 a day, each holding one rune for each dawn; 22 of them sit on
  a record only a LAST CHANCE run reaches, mostly the floor ghosts at 0 wins and 1 life on days 7 to 10, and the seed
  check takes them). The release command seeds it for the first time. The bb-0.9.3 ghosts and uploads stay under their
  own prefix and match only 0.9.3 to 0.9.6 pages; a 0.9.7 page asks for and uploads bb-0.9.7 ghosts only. A browser
  still on the 0.9.6 page keeps getting bb-0.9.3 ghosts, but its uploads answer 422 (foreign rules) until it reloads.
- fly.toml, the Dockerfile, .dockerignore and server/config.ts are unchanged (uploads-080's, as 0.9.6's), so uploads stay
  open. Under deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** seeds the bb-0.9.7 pool for the first time: `seed: rules bb-0.9.7, 120 pool ghosts on tigris
(...)` with `120 written, 0 unchanged, 0 removed` (on any later start of the same image, `0 written, 120 unchanged, 0
removed`). The bb-0.9.3 pool and every bb-0.9.3 upload are not touched; 0.9.7 players no longer meet them.

**The probe runs** (section 9's pattern, as in section 24), because the rules changed and LAST CHANCE adds two rows: its
honest decks hold their dawn runes, taken as the bots take them, and travel as v3 with the run seed, and one of them
holds a LAST CHANCE. The release checks rehearsed this whole block on a local server, the built server on a scratch
store, the hand clean-up included (kit097/probecheck.sh; ../output-stage097/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 24's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-097 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage097/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.7` on both 0.9.7 pages). It refuses unless the staged label is 0.9.7 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. 0.9.7 launches after 0.9.6 (section 24),
   so the guard expects to read 0.9.6 live, and that passes. If it reads an older label instead, Fly is not on v17:
   stop there and ask the Prime, because this section's seed line and rollback assume 0.9.6's release;
3. stage the 0.9.7 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.7). Expect:
- health: `{"ok":true,"rules":"bb-0.9.7","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.7 online page (cmp)`, and `content-length: 717904`;
- a bb-0.9.7 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.7","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.7 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.7` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 0 0` (no
  bb-0.9.7 upload yet, unless a player uploaded since the deploy);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.7, 120 pool ghosts on tigris (...)` with `120 written,
  0 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.7), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage097/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 14 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.7); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 11 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into dusk 1`), hero-WEAVER, hero-FOUNDRY and
   hero-BASTION 201, hero-METRONOME and hero-SIPHON 400 (`snapshot.hero: rules bb-0.9.7 accept only FURNACE, WEAVER,
   FOUNDRY, BASTION, not …`), then the two LAST CHANCE rows: lastchance-signed 201 (FURNACE's day-6 start deck with its
   six dawn runes and the HULL card, +500 max hull, at 0 wins and 2 lives, its LAST CHANCE on day 5) and
   lastchance-day3 422 (`record: 0W 2 lives is no record a run carries into dusk 6 after a LAST CHANCE on day 3`: the same deck with its LAST CHANCE on day 3); then `probe player: <43 characters>`
   and `probe: 11 of 11 checks as expected; the server stored 5 deck(s) for this player (expected 5); the player id is
   in ../output-stage097/probe-id.txt`. The five stored decks hold their dawn runes: FURNACE's day-1 start deck with
   one rune, the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each, and FURNACE's day-6 LAST CHANCE deck
   with six;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.7'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.7; keep 120 seed-pool ghost(s) and 5 upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` The 5 uploads are the probe's, the LAST CHANCE deck among
   them, which revalidates clean (its run seed, its card and its LAST CHANCE day); players who uploaded since the deploy
   add to that count, and their uploads pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage097/probe-id.txt) --rules bb-0.9.7 --apply"`.
   Expect `plan: delete 5 record(s) of bb-0.9.7; keep 120 seed-pool ghost(s) and …`, five `delete
   ghosts/bb-0.9.7/dNN/player/<g…>.json` lines (one on day 1, three on day 3 and one on day 6, the five ids of the
   probe's 201 lines), then `APPLIED: deleted 5 of 5 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.7"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.7'`: ten day rows of 12, then
   `all 120 0 0` (or `all 120 N P` if players uploaded since the deploy; never a probe upload).

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's five honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r097/BeltBattles-r097 && [ -s ../output-stage097/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage097/probe-id.txt) --rules bb-0.9.7 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.7'
```

Expect `plan: delete N record(s) of bb-0.9.7`, where N is the number of 201s the probe got (at most 5), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first, while the 0.9.7 image (the one
built for bb-0.9.7) still serves.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.6's release v17 (image
registry.fly.io/beltbattles:deployment-01M4BKHAMC03HP1RPN8SPEWGNT, LIVE-096), its page on the older rules bb-0.9.3.
Check that the releases-before file lists v17 first; if it doesn't, stop and ask the Prime. Deploy that image from this
clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte for
byte, as 0.9.6's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M4BKHAMC03HP1RPN8SPEWGNT
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.3"`, and the page must be 0.9.6's online page,
BeltBattles-0.9.6-69c9e5bdd9ea-online.html (706,489 bytes, sha256 `d3d640009943fcfe…`). A rollback serves bb-0.9.3
again: its release command re-seeds the bb-0.9.3 pool (`0 written, 120 unchanged, 0 removed`), and the bb-0.9.3
partition and its uploads are as 0.9.6 left them. Any bb-0.9.7 uploads made in between stay in the bucket under their
own prefix, unseen, ready for a roll forward; 0.9.6 pages never ask for them. The release before v17 is 0.9.5's v16
(image registry.fly.io/beltbattles:deployment-01M49A6YJKWCTYPSABXK2TM40V, LIVE-095; its page
BeltBattles-0.9.5-93f3e46f4697-online.html, 691,285 bytes), on bb-0.9.3 too: the same command with v16's image returns
it, with the same seed line.

## 26. 0.9.8: styles you earn (rules bb-0.9.7, no bump; its own L4)

0.9.7's launch is section 25, in the clone beltbattles-r097/BeltBattles-r097 (branch release-097, tip 236ac6f). It ran
there on its own L4 and must never run again: 0.9.7 is live as release v18 (image
registry.fly.io/beltbattles:deployment-01M4ECQT8HY0RZN20KX97JXKH4, since 2026-10-08 at about 18:36Z, LIVE-097). This
section is 0.9.8's launch, from this clone.

0.9.8 ships styles you earn on 0.9.7's rules, bb-0.9.7 (the motion lane's CUSTOM-2a, CUSTOM-2b and CUSTOM-3;
REQ-BFG-072 and REQ-BFG-074):
- **Styles you earn:** new looks for the player's floor panels, belts and stats panels (four of each, beside today's
  look) and for the carrier itself (WAR COLOURS stays the default; ADMIRAL'S BLUE, IRONCLAD, STORMCALLER and CHAMPION'S
  GOLD are earned). Playing opens them: finishing runs, winning dusk fights, reaching later days and beating warlords.
- **CUSTOMIZE**, a new button beside OPTIONS on the title, shows each style on the player's own ship. One tap wears an
  open style; a locked one says its goal and how far along the player is. A NEW dot on CUSTOMIZE and a NEW STYLE line on
  the run summary say when a style opens.
- **Where the styles show:** the player's board in battle and on the build screen, the battle plate and part panel, the
  run summary, the player's side of replays and the hero select. Foes keep today's look.
- **The road and the fork** show the day's sea behind their cards, and the landscape battle keeps both boards whole on
  the screen while the ships surge.

It is presentation only. Nothing under src/sim, src/net, src/core or server changed, and under tools/ only 7 art tools
did. **A player's styles and unlocks live on the device**, in the browser's storage under `beltbattles.profile.v1`; the
server sees none of them yet (PROFILE-UP, backlog #371, comes later). docs/CUSTOMIZE.md describes the styles.

**What ships.** Branch release-098 at its tip, in this clone: release-097's 236ac6f (0.9.7 as live; tag r097) merged
with the motion lane's custom3 at 8a7294c (tag custom-head, the motion lane's custom3-accepted; 18 commits on 0.9.6's
8fbba9d, in 58 files) by the Prime's setup as fdabebe (tag merge098), the run-lost shot fix (73877fc, scripts only,
backlog #378), the 0.9.8 label (0fe90a1), the CHANGELOG commit (ee32c76) and the release record (GAME_BUILD.txt and this
section). A commit can't name its own hash, so the Prime names the tip at launch.
- The page is the 0.9.8 online page that GAME_BUILD.txt records (BeltBattles-0.9.8-ee32c765630a-online.html, 736,701 bytes, sha256
  `06fa891c66dc1334…`), built at ee32c76; it reads V0.9.8 on the title screen. It is 18,797 bytes larger than 0.9.7's
  page: the styles' art, their catalogue and the CUSTOMIZE screen.
- The rules stay bb-0.9.7 (RULES_VERSION, the probe's PROBE_RULES and the rules gate's LAST_CHANCE_RULES);
  POOL_RULES_CARRIED stays empty. The pools don't move: the stand-in check that read the pool identical at 9cf21b7 (0.9.7's
  pick-t096) carries, since no file in the generator's bundle changed, and the seed pool is 0.9.7's. parBench's
  fingerprint is 8cde5ed0, as at 0.9.7, and the pinned sim fingerprint reads identical to 0.9.7's pin,
  fp-097-final-c129409.json (848,001 bytes, sha256 `21f2dab4cc4ff692…`; a copy is ../kit098/h2/ beside this clone), at
  the merge and at the tip.
- The server is built from the tip, from 0.9.7's server sources: its strict decoder, its record, name, rune and LAST
  CHANCE checks, its rules gate and its bundled seed pool are 0.9.7's, so the upload check accepts and refuses what it
  did.
- 0.9.7 and 0.9.8 pages play the same rules: each asks for and uploads bb-0.9.7 ghosts, so 0.9.7's ghosts and uploads
  still meet 0.9.8 players. A browser still on the 0.9.7 page keeps playing and uploading as before.
- fly.toml, the Dockerfile, .dockerignore and server/config.ts are unchanged (uploads-080's, as 0.9.7's), so uploads
  stay open. Under deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** re-seeds the bb-0.9.7 pool that 0.9.7's launch (section 25) wrote: `seed: rules bb-0.9.7, 120
pool ghosts on tigris (...)` with `0 written, 120 unchanged, 0 removed`. The rules don't move, so the players' bb-0.9.7
uploads already in the bucket stay and keep meeting players.

**The probe runs** (section 9's pattern, as in section 25). The upload path is 0.9.7's, unchanged, and the probe checks
it end to end on the new image: its honest decks hold their dawn runes, taken as the bots take them, and travel as v3
with the run seed, and one of them holds a LAST CHANCE. The release checks rehearsed this whole block on a local server,
the built server on a scratch store, the hand clean-up included (kit098/probecheck.sh; ../output-stage098/REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 25's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the release-098 tip named at launch and the tree is
   clean, and unless the probe's id file (for example ../output-stage098/probe-id.txt) holds no id yet: the probe
   refuses to overwrite an earlier probe's id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.8` on both 0.9.8 pages). It refuses unless the staged label is 0.9.8 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. 0.9.8 launches after 0.9.7 (section 25),
   so the guard expects to read 0.9.7 live, and that passes. If it reads an older label instead, Fly is not on v18:
   stop there and ask the Prime, because this section's seed line and rollback assume 0.9.7's release;
3. stage the 0.9.8 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.9.7, as at 0.9.7's launch). Expect:
- health: `{"ok":true,"rules":"bb-0.9.7","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.8 online page (cmp)`, and `content-length: 736701`;
- a bb-0.9.7 match on each of days 1-10, as a new player with 0 wins and 5 lives: ten lines `…day=N… -> 200`;
- day 3 with 1 win and 5 lives, as a new player: `"snapshot":{"v":3,"rules":"bb-0.9.7","hero":"…","day":3,"wins":…,
  "lives":…`. A new player meets seed ghosts only, and under bb-0.9.7 a seed ghost holds one rune for each dawn, so it
  travels as v3 (without its run seed); the rehearsal got WEAVER, 1 win, 5 lives, as at 0.9.7;
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.9.7` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 N P`. The
  uploads and players columns may be above 0, because bb-0.9.7 uploads have come in since 0.9.7's launch (after 0.9.7's
  launch and its probe's clean-up the list read `all 120 0 0`, LIVE-097);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.9.7, 120 pool ghosts on tigris (...)` with `0 written,
  120 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.9.7, as in section 25), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage098/probe-id.txt`. It writes its player
   id to that file before its first POST. Expect 14 lines (the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.9.7); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 11 PASS lines: furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1 allows
   at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run carries into
   dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, hero-METRONOME and hero-SIPHON 400 (`snapshot.hero: rules
   bb-0.9.7 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`), then the two LAST CHANCE rows: lastchance-signed 201
   (FURNACE's day-6 start deck with its six dawn runes and the HULL card, +500 max hull, at 0 wins and 2 lives, its LAST
   CHANCE on day 5) and lastchance-day3 422 (`record: 0W 2 lives is no record a run carries into dusk 6 after a LAST
   CHANCE on day 3`: the same deck with its LAST CHANCE on day 3); then `probe player: <43 characters>` and `probe: 11 of
   11 checks as expected; the server stored 5 deck(s) for this player (expected 5); the player id is in
   ../output-stage098/probe-id.txt`. The five stored decks hold their dawn runes: FURNACE's day-1 start deck with one
   rune, the WEAVER, FOUNDRY and BASTION day-3 reference decks with three each, and FURNACE's day-6 LAST CHANCE deck with
   six;
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.9.7'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.9.7; keep 120 seed-pool ghost(s) and N upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` N is the probe's 5 plus every bb-0.9.7 upload players made
   since 0.9.7's launch, and theirs pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage098/probe-id.txt) --rules bb-0.9.7 --apply"`.
   Expect `plan: delete 5 record(s) of bb-0.9.7; keep 120 seed-pool ghost(s) and …`, five `delete
   ghosts/bb-0.9.7/dNN/player/<g…>.json` lines (one on day 1, three on day 3 and one on day 6, the five ids of the
   probe's 201 lines), then `APPLIED: deleted 5 of 5 record(s).`;
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s);
5. health again: `"rules":"bb-0.9.7"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.7'`: ten day rows of 12, then
   `all 120 0 0`, or `all 120 N P` with the players' uploads since 0.9.7's launch; never a probe upload.

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's five honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them.

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r098/BeltBattles-r098 && [ -s ../output-stage098/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage098/probe-id.txt) --rules bb-0.9.7 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.9.7'
```

Expect `plan: delete N record(s) of bb-0.9.7`, where N is the number of 201s the probe got (at most 5), then `APPLIED:
deleted N of N record(s).` and a list with no upload by the probe. Then move probe-id.txt away (for example to
probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first. 0.9.7's image reads the same rules,
so the clean-up works under either image.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.7's release v18 (image
registry.fly.io/beltbattles:deployment-01M4ECQT8HY0RZN20KX97JXKH4, LIVE-097), its page on the same rules bb-0.9.7.
Check that the releases-before file lists v18 first; if it doesn't, stop and ask the Prime. Deploy that image from this
clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is uploads-080's byte for
byte, as 0.9.7's clone's is, so the old image runs as it did, with uploads open:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M4ECQT8HY0RZN20KX97JXKH4
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.7"`, and the page must be 0.9.7's online page,
BeltBattles-0.9.7-567642b421f7-online.html (717,904 bytes, sha256 `ab1307f1a5a7f168…`). Its release command re-seeds the
same pool (`0 written, 120 unchanged, 0 removed` under bb-0.9.7). The rules are the same, so a rollback keeps the pool
and every bb-0.9.7 upload in use: 0.9.7 plays the same rules, and its battles are the same battles, drawn without the
styles. A player's saved styles and unlocks stay on the device, unused by 0.9.7 (it never reads
`beltbattles.profile.v1`), and a 0.9.8 page finds them again. The release before v18 is 0.9.6's v17 (image
registry.fly.io/beltbattles:deployment-01M4BKHAMC03HP1RPN8SPEWGNT, LIVE-096; its page
BeltBattles-0.9.6-69c9e5bdd9ea-online.html, 706,489 bytes). Going back to v17 also moves the rules back to bb-0.9.3, as
section 25's rollback says: its release command re-seeds the bb-0.9.3 pool (`0 written, 120 unchanged, 0 removed`),
the bb-0.9.3 partition and its uploads are as 0.9.6 left them, and the bb-0.9.7 pool and uploads stay in the bucket
under their own prefix, unseen, ready for a roll forward.

## 27. 0.9.9: hearts, the hull by the day and the battle view (new rules bb-0.10.0; its own L4)

0.9.8's launch is section 26, in the clone beltbattles-r098/BeltBattles-r098 (branch release-098, tip fa1e9ed). It ran
there on its own L4 and must never run again: 0.9.8 is live as release v19 (image
registry.fly.io/beltbattles:deployment-01M4F3CAMZQZW1JXKQZ1R8XXS0, since 2026-10-09 at about 01:11Z, LIVE-098). A
battle-view 0.9.9 on bb-0.9.7 was staged in the clone beltbattles-r099 (branch release-099, its own section 27) and
never ran; its content ships here. This section is 0.9.9's launch, from this clone (branch c099; write
`refs/heads/c099` or a tag here: "c099" alone is ambiguous in this clone).

0.9.9 ships the hull release with the battle view, on new battle rules, bb-0.10.0:
- **The hull by the day** (HULL_SCALE): every carrier's max hull is multiplied by the day (x1.4 on day 2 up to x6 on
  day 10), damage more slowly (up to x2.6; x1.6, x1.7 and x1.8 on days 3 to 5 with SHAPES on: FIT-099,
  src/sim/shapes.ts:89), every heal and every SHIELD gain (the sim's PLATE) as the hull (src/sim/hullScale.ts:233-253);
  WARD (the sim's SHIELD) doesn't grow. The dark wind takes a share of each hull's own maximum. Each day's gold grows to
  day 10.
- **A warlord every day** (NPC_DAY): the road always has a warlord fight that can drop a part of its deck, then the
  day's event and REFIT. A snapshot carries its road log (`road`), and POST /v1/ghosts re-derives each warlord, its deck
  and its seeded drop from the run seed.
- **Star steps that pay** (LADDER_FIX), **open rune offers** (OPEN_RUNES), **free joins** (FREE_JOINS: no join pace and
  no join limit; WEAVER's hull 1500), **more SHIELD and WARD** (GUARD), **10 hearts** (HEARTS: a loss costs 1, 2 or 3
  by the day, LAST CHANCE at 1 heart or fewer, no day-3 refund), **the graded pick** (PICK: a record 2 or more losses
  behind its wins meets the weaker half of the ghosts it may fight, by the seed ghosts' grades; PICK_RULE { losing 1,
  deep 0.5, deepAt 2 }, src/net/pick.ts:79, re-tuned by S8 on the regenerated pool).
- **Shaped rigs and factories** (SHAPES): NAIL STRIP, EMBER TROUGH, SPIKE RAIL; GANTRY PRESS 2x3, ASSEMBLY LINE 3 in a
  line; turret intakes kept clear.
- **The battle view and the battle's counts:** settings, a wider view, VIEW BATTLEFIELD, the dark wind's numbers, the
  counters and PAIR on the board, cleaner cards and CARD-5's phone shop card words, SHIELD and WARD as the player words
  (display and text only).
- **The one bump and its one regeneration:** the rules move once to bb-0.10.0 (RULES_VERSION, src/sim/content.ts:42;
  the probe's PROBE_RULES, server/ghostProbe.ts:69; the gates NPC_DAY_RULES, FREE_JOINS_RULES, SHAPES_RULES,
  HEARTS_RULES, PICK_RULES and OPEN_RUNES_RULES written as literals in src/net/rulesGate.ts), with nothing carried
  (POOL_RULES_CARRIED is empty, so POOL_RULES = bb-0.10.0). LAST_CHANCE_RULES stays bb-0.9.7 (src/net/rulesGate.ts:186):
  both rules versions carry LAST CHANCE. S8 (s8-accepted 117ba0613dc0, merged as 3cc58d0a7651, tag c099-s8) made the
  generated files again once, under bb-0.10.0: the stand-in pool (src/sim/standInPoolData.ts, 48,590 bytes, sha256
  `58ed4dbe7d7ad74a…`, tagged bb-0.10.0), the seed pool with its grades (server/seedPoolData.ts, 192,209 bytes,
  `71f635fc7bd8f936…`, 120 ghosts), the luck caps (src/sim/harness/luckCapsData.ts, 7,410 bytes, `46a9590759b3ba6d…`)
  and the captains' runes (CAPTAIN_RUNES in src/sim/rivalBuilds.ts, 19 lists).

**What ships.** Branch c099 at its tip, in this clone: 0.9.8 as live (r098 fa1e9ed) with the battle view and cleaner
cards (STAGE-099's content), AZ-BUMP's bump and HULL-ON's flip (c099-hullon-accepted e866408cc0fa), SHAPES-1, the card
lane's CARD-3 and CARD-4, the motion lane's PAIR-1, PAIR-1c, COUNT-1, CNT-DAY to CNT-DAY3, PERF-1, FIX-099G,
BROWSE-099F and PANEL-FIT (c099-panelfit 07a1ff40af24), the server smoke's fixture fix (c099-smoke 380882f43e73), S8
(c099-s8 3cc58d0a7651), CARD-5 (card5-accepted 582a8e251468, merged as 8c44be979704, tag c099-card5) with its test
re-pin (c099-card5b 002cad70642d), the CHANGELOG commit (814a1b9) and the release record (GAME_BUILD.txt, this
runbook and the tests' type-check baseline, 162 to 164). The label was already 0.9.9. A commit can't name its own
hash, so the Prime names the tip at launch.
- The page is the 0.9.9 online page that GAME_BUILD.txt records (BeltBattles-0.9.9-814a1b9c065d-online.html, 934,945
  bytes, sha256 `67612299dd841566…`), built at 814a1b9; it reads V0.9.9 on the title screen. It is 198,244 bytes larger
  than 0.9.8's page (736,701 bytes).
- The rules move to bb-0.10.0, once, with nothing carried. The seed pool and the stand-in pool are bb-0.10.0's own,
  made once by S8. The stand-in check read the committed pool identical at c099-card5b (every later commit is the
  CHANGELOG, GAME_BUILD.txt, this runbook and the tests' type-check baseline): `check: IDENTICAL: regenerated 48590 bytes in memory (2093440 battles, 965.7 s, 20 workers) vs committed src/sim/standInPoolData.ts (48590 bytes)` and `written-module guard: all 120 stored codes decode to exactly the scored decks` (kit099c/stand.sh, 2026-10-13 20:06-20:51Z, two calls; output-stage099c/logs/standins-check-c099-card5b.log). The pinned sim fingerprint
  is S8's, 857,946 bytes, sha16 e731bdca8c7ec442 (kit099c/h2/fp-s8-117ba06.json, every switch on as shipped); the final
  tip reads identical to it. parBench's fingerprint is 4eab334f (0.9.8's was 8cde5ed0; c099-cntday3, before S8, read
  343b69f4).
- The server is built from the tip. POST /v1/ghosts takes snapshot v3 under bb-0.10.0 only (server/app.ts:321-322) with
  0.9.8's checks (one rune for each dawn, each one its dawn offered by the open rule; the record; the name; LAST
  CHANCE's day, card and record) and the hull release's: the record by the hearts model (lives up to 10; a lost dusk
  costs 1, 2 or 3; src/net/records.ts), the road log (each warlord's drop re-derived from the run seed), the shapes
  rules, free joins, and no grade on an upload (422 `grade: only the seed pool's ghosts carry a grade`,
  server/app.ts:330). ghosts:admin revalidate and the seed check read each stored record by its own rules. The run
  seed is stored, never served.
- Its bundled seed pool is bb-0.10.0's (120 ghosts, 12 a day; v3, each holding one rune for each dawn and the seed
  step's grade; 68 of the 120 hold a long rig or a bigger factory). The release command seeds it for the first time.
  The bb-0.9.7 ghosts and uploads stay under their own prefix and match only 0.9.7 and 0.9.8 pages; a 0.9.9 page asks
  for and uploads bb-0.10.0 ghosts only (src/game/online.ts:183; src/net/ghostClient.ts:65 refuses any other rules). A
  browser still on the 0.9.8 page keeps getting bb-0.9.7 ghosts, but its uploads answer 422 (foreign rules) until it
  reloads.
- fly.toml, the Dockerfile, .dockerignore, deploy/stage.mjs, server/config.ts, server/tigrisStore.ts and
  server/store.ts are unchanged since fa1e9ed (git diff fa1e9ed..c099-card5b is empty for them, and every later commit
  touches none of them), so uploads stay open. Under deploy/, only GAME_BUILD.txt and this runbook changed.

**The release command** seeds the bb-0.10.0 pool for the first time: `seed: rules bb-0.10.0, 120 pool ghosts on tigris
(...)` with `120 written, 0 unchanged, 0 removed` (on any later start of the same image, `0 written, 120 unchanged, 0
removed`; server/main.ts). The bb-0.9.7 pool and every bb-0.9.7 upload are not touched (the seed lists and deletes only
`ghosts/bb-0.10.0/dNN/pool/`, server/tigrisStore.ts); 0.9.9 players no longer meet them. **It plays no battle:** S8
ships the seed pool's grades in the bundle (server/seedPoolData.ts), so the seed loads them as they are. On one core of
the staging host it took 2 s, peak RSS 97,604 kB, `120 written, 0 unchanged, 0 removed` (kit099c/seedtime.sh at
814a1b9, the same server code as the tip: output-stage099c/logs/seedtime-changelog-814a1b9.log; S8's own check read
421 ms and 92.1 MiB). Before S8, at c099-cntday3, the seed graded its pool on boot: 73 s and 189 MB. The release
command runs on fly.toml's machine (shared-cpu-1x, 256 MB, fly.toml:51-53), slower than that core but with room to
spare. A seed that fails aborts the deploy, and v19 keeps serving.

**The probe runs** (section 9's pattern, as in section 25), because the rules changed and the NPC day adds two rows: its
honest decks hold their dawn runes (taken as the bots take them, by the open rule: server/ghostProbe.ts), travel as v3
with the run seed and sit at the hearts start (10 hearts), one holds a LAST CHANCE and one a road log. The release
checks rehearse this whole block on a local server, the built server on a scratch store, the hand clean-up included
(kit099c/probecheck.sh: the PREP's run at c099-cntday3 read every expectation yes; the STAGE runs it again at the final
tip, output-stage099c/STAGE-REPORT.md).

**The launch call is the Prime's.** The Prime writes it at launch, on section 25's pattern, and runs it under its own
operator approval (L4). In order, it must:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the c099 tip named at launch (`git rev-parse
   refs/heads/c099`: "c099" alone is ambiguous in this clone) and the tree is clean, and unless the probe's id file
   (for example ../output-stage099c/probe-id.txt) holds no id yet: the probe refuses to overwrite an earlier probe's
   id, which that probe's clean-up still needs;
2. run the version guard (backlog #341) before anything is staged or deployed. It reads the version label on the page
   it stages and on the page Fly serves, with section 15's grep (`grep -oP '\x60\K[0-9]+\.[0-9]+\.[0-9]+(?=\x60)'`,
   which reads `0.9.9` on both 0.9.9 pages). It refuses unless the staged label is 0.9.9 and the live one is not newer
   (equal passes: a re-run), and it refuses when either label can't be read. 0.9.9 launches after 0.9.8 (section 26),
   so the guard expects to read **0.9.8** live, and that passes. If it reads an older label instead, Fly is not on v19:
   stop there and ask the Prime, because this section's seed line and rollback assume 0.9.8's release. (The guard reads
   labels only: STAGE-099's never-shipped bb-0.9.7 page also reads 0.9.9, so only stage.mjs's size and SHA-256 check
   against GAME_BUILD.txt tells the two pages apart);
3. stage the 0.9.9 online page (call 3: the size and SHA-256 GAME_BUILD.txt records), which also builds server/dist,
   the probe included;
4. save `fly releases -a beltbattles --image` to a releases-before file: what was live, the rollback's target;
5. deploy (call 4) and run `fly status`;
6. run the live checks below;
7. run the probe block below.
Every step after the guards is chained with `&&`, so the first failure stops the call.

If the version guard refuses, the call prints `refused: Fly serves X and the staged page is Y; never deploy over a newer
version` and stops: nothing was staged or deployed. Leave Fly as it is and report it.

**The live checks** (section 5's, under bb-0.10.0). Expect:
- health: `{"ok":true,"rules":"bb-0.10.0","store":"tigris","ghosts":…,"uploads":"open","uptimeS":…}`; it is the first
  request after the update, so `--retry 3` covers a machine the update left stopped;
- `live page = the staged 0.9.9 online page (cmp)`, and `content-length: 934945`;
- a bb-0.10.0 match on each of days 1-10, as a new player with **0 wins and 10 hearts** (`wins=0&lives=10`): ten lines
  `…day=N… -> 200`. (A 5-lives request, section 25's, reads 404 on days 1-4 under hearts: every seed ghost there holds
  more lives, and D1 never hands a better record);
- day 3 with **1 win and 9 hearts** (`wins=1&lives=9`), as a new player: `"snapshot":{"v":3,"rules":"bb-0.10.0",
  "hero":"…","day":3,"wins":…,"lives":…`. A new player meets seed ghosts only, and a bb-0.10.0 seed ghost travels as v3
  (without its run seed, with its grade);
- an unsigned POST: `{"error":"unsigned upload: the x-bb-key and x-bb-sig headers are required"} -> 401`;
- `ghost-admin.mjs list --rules bb-0.10.0` on the machine: ten day rows of 12 seed-pool ghosts, then `all 120 0 0` (no
  bb-0.10.0 upload yet, unless a player uploaded since the deploy);
- in `fly logs -a beltbattles --no-tail`: `seed: rules bb-0.10.0, 120 pool ghosts on tigris (...)` with `120 written,
  0 unchanged, 0 removed`.

**The probe block** (section 9's steps 9 to 15, under bb-0.10.0), each step chained with `&&`:
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage099c/probe-id.txt`. It writes its
   player id to that file before its first POST. Expect 16 lines (18 at bb-0.11.0, from 0.9.11 on: section 30; 19 at
   bb-0.12.0, from 0.9.13 on: section 32; 24 at bb-0.13.0, from 0.9.14 on: section 33; the same at bb-0.14.0 from 0.9.15 on: section 35; 24 at bb-0.15.0, from 0.9.16 on: section 37; 26 at bb-0.16.0, from 0.9.17 on: section 38; the ids differ on every run): the header
   `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.10.0); only the FURNACE, WEAVER,
   FOUNDRY and BASTION decks may be stored`, then 13 PASS lines (15 at bb-0.11.0: longrun-signed 201 and
   longrun-nolosses 422 join them, section 30; 16 at bb-0.12.0: a scale-signed 201 row joins them, section 32; 21 at bb-0.13.0: gates-signed 201 and the four ENDLESS rows join them, section 33; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; 23 at bb-0.16.0: veteran-match 200 and veteran-bad 400, two GET rows after the endless match, join them, section 38):
   furnace-signed 201, furnace-unsigned 401,
   dishonest-signed 422 (`budget: build costs 20 gold (items 0, mods 0, 0 crates, 4 plating) but a player's day 1
   allows at most 13 (maxGoldByDay 8 + roadCap 5)`), unreachable-signed 422 (`record: 0W 1 lives is no record a run
   carries into dusk 1`), hero-WEAVER, hero-FOUNDRY and hero-BASTION 201, hero-METRONOME and hero-SIPHON 400
   (`snapshot.hero: rules bb-0.10.0 accept only FURNACE, WEAVER, FOUNDRY, BASTION, not …`), the two LAST CHANCE rows:
   lastchance-signed 201 (FURNACE's start deck with its dawn runes and the HULL card at dusk 7, 0 wins and 1 heart, its
   LAST CHANCE on day 6) and lastchance-day3 422 (`record: 0W 1 lives is no record a run carries into dusk 7 after a
   LAST CHANCE on day 3`), then the NPC day's two rows (AZ-BUMP S6, 00af45d): npcday-signed 201 (WEAVER's start deck at
   dusk 2, 1 win, with the road log of its two warlord wins: day 1 EASY, no drop; day 2 MEDIUM, its seeded drop
   SCATTER) and npcday-forged 422 (`deck failed validation: road: day 2: the seeded roll of LACEWING gave scatter, not
   dartgun`); then `probe player: <43 characters>` and `probe: 13 of 13 checks as expected; the server stored 6 deck(s)
   for this player (expected 6); the player id is in ../output-stage099c/probe-id.txt` (at bb-0.11.0 from 0.9.11 on: `15
   of 15 checks as expected; the server stored 7 deck(s) for this player (expected 7)`; at bb-0.12.0 from 0.9.13 on: `16
   of 16 checks as expected; the server stored 8 deck(s) for this player (expected 8)`; at bb-0.13.0 from 0.9.14 on: `21 of 21 checks as expected;
   the server stored 10 deck(s) for this player (expected 10)`; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; at bb-0.16.0 from 0.9.17 on: `23 of 23 checks as expected; the server stored 10 deck(s) for this player (expected 10)`: section 38). The six stored decks (seven at
   bb-0.11.0: the seventh is a day-12 long-run deck; eight at bb-0.12.0: the eighth is the scale-signed 201's deck; ten at bb-0.13.0 and the same ten at bb-0.14.0, bb-0.15.0 and bb-0.16.0 (the two veteran rows are GETs and store nothing): the ninth is the
   gates-signed 201's deck and the tenth the endless-honest 201's):
   FURNACE's day-1 start deck, the WEAVER, FOUNDRY and BASTION day-3 reference decks, FURNACE's day-7 LAST CHANCE deck
   and WEAVER's day-2 NPC-day deck (server/ghostProbe.ts; tests/ghost-probe.test.ts);
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.10.0'`, a dry run. Expect
   `plan: delete 0 record(s) of bb-0.10.0; keep 120 seed-pool ghost(s) and 6 upload(s)` and `DRY RUN: nothing was
   deleted. --apply deletes exactly the 0 record(s) above.` The 6 uploads are the probe's (the LAST CHANCE and NPC-day
   decks among them, which revalidate clean); players who uploaded since the deploy add to that count, and their
   uploads pass too;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage099c/probe-id.txt) --rules bb-0.10.0 --apply"`.
   Expect `plan: delete 6 record(s) of bb-0.10.0; keep 120 seed-pool ghost(s) and …`, six `delete
   ghosts/bb-0.10.0/dNN/player/<g…>.json` lines (one on day 1, one on day 2, three on day 3 and one on day 7, the six
   ids of the probe's 201 lines), then `APPLIED: deleted 6 of 6 record(s).` (7 of 7 at bb-0.11.0; 8 of 8 at bb-0.12.0; 10 of 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38);
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s, fly.toml);
5. health again: `"rules":"bb-0.10.0"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.10.0'`: ten day rows of 12,
   then `all 120 0 0` (or `all 120 N P` if players uploaded since the deploy; never a probe upload).

Who meets the probe's uploads: between the probe and the clean-up, the store holds the probe's six honest decks. A new
player (fewer than 3 finished runs) meets only seed ghosts, so only an experienced player can meet one, and only until
the clean-up removes them (and the cache, 600 s, or the restart drops them).

**The hand clean-up**, if the call stops after the probe's first 201 (the probe wrote its id before its first POST; a
failed check doesn't stop the probe, but its exit 1 stops the `&&` chain, so up to 6 decks may be left; 7 at bb-0.11.0;
8 at bb-0.12.0; 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-c099/BeltBattles-c099 && [ -s ../output-stage099c/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage099c/probe-id.txt) --rules bb-0.10.0 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.10.0'
```

Expect `plan: delete N record(s) of bb-0.10.0`, where N is the number of 201s the probe got (at most 6; 7 at bb-0.11.0;
8 at bb-0.12.0; 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38), then `APPLIED: deleted N of N record(s).` and a list with no upload by the probe. Then move
probe-id.txt away (for example to probe-id-1.txt) before any new probe. If a rollback follows, run the clean-up first,
while the 0.9.9 image serves.
(0.9.8's ghost-admin can remove them too: its remove-player and list take any rules, only revalidate refuses another
rules version.)

**What the server sees of hearts, LAST CHANCE and the other switches.** All nine switches ship on (HEARTS, GUARD,
PICK, OPEN_RUNES, FREE_JOINS, NPC_DAY, HULL_SCALE, LADDER_FIX, SHAPES), and every bb-0.10.0 rule asks the switch AND the
record's rules (src/net/rulesGate.ts), so a bb-0.9.7 record is read as 0.9.8 read it:
- **Hearts:** a bb-0.10.0 snapshot's `lives` are hearts (up to 10); the match route takes `lives` up to 10 under
  bb-0.10.0 and up to 9 under older rules (server/app.ts:216-217, livesCapFor); the record check judges an upload by the
  hearts model (a lost dusk costs 1, 2 or 3 by the day; draws and road fights cost none). A 0.9.8 run saved on a player's
  device finishes on its 5 lives under 0.9.9, and the page neither uploads it nor saves its ghost (src/game/ghostGuard.ts;
  a console line only), so the server never sees a 5-lives record under bb-0.10.0.
- **LAST CHANCE:** LAST_CHANCE_RULES stays bb-0.9.7, so both rules versions carry `lastChance`; under hearts it fires
  at the first loss that would leave 1 heart or fewer before day 10 and sets the hearts to 1. POST checks its day, its
  card and the record after it (the probe's two rows).
- **The NPC day:** a bb-0.10.0 upload may carry `road`, its warlord fights; POST re-derives each drop from the run seed
  and refuses a forged one (the probe's npcday-forged row). Older rules refuse the field at decode (400).
- **The graded pick:** the seed ghosts carry a `grade` (written by the seed step; bundled since S8); POST refuses a
  graded upload (422, server/app.ts:330); the match route draws a record 2 or more losses behind its wins from the
  weaker half of its eligible ghosts by grade (src/net/pick.ts, PICK_RULE). revalidate doesn't refuse grades.
- **Open runes, free joins, shapes:** POST re-derives each dawn's offer by the open rule, takes any number of legal
  joins at full pace, and judges shaped pieces, all under bb-0.10.0 only (src/net/validate.ts).
- **The hull by the day and the star steps** change no field: a record's hull and damage are worked out where a battle
  starts; POST's budget check is unchanged in kind.

**S8's notes for this release** (S8's REPORT section 12.2):
- RULING-S8-R6 item 8: "Turning SHAPES or NPC_DAY off is more than a switch flip. The stand-in pool holds shaped pieces
  and road-fed decks, so it won't decode with SHAPES off (stand-in code: bad item ...) and can't seed ghosts with NPC_DAY
  off (budget: ...). The pools must be regenerated in that world first."
- The seed command's time: 2 s on one core of the staging host, no battles (above; S8's own check 421 ms).
- The server ceiling is unchanged: roadCap on days 1-10 is 5 20 36 51 66 81 94 104 115 125, and maxHonestSpend is 13 37
  63 89 116 144 171 196 223 250. No real deck is over it: the day-1 seed ghost weaver-0 costs 18 G against 13 and is
  held by its 6 G of road drops, with 1 G to spare (the tightest honest seed deck). EMBER TROUGH costs 5 G.

**Rollback** (its own L4 every time, after telling the operator; never part of the launch call). Back to the release
that served before the launch, the newest release in the launch's releases-before file: 0.9.8's release v19 (image
registry.fly.io/beltbattles:deployment-01M4F3CAMZQZW1JXKQZ1R8XXS0, LIVE-098), its page on the older rules bb-0.9.7.
Check that the releases-before file lists v19 first; if it doesn't, stop and ask the Prime. Deploy that image from this
clone. A deploy by image takes its env from this directory's fly.toml, and this fly.toml is the same bytes as 0.9.8's
(git diff fa1e9ed..c099-card5b -- fly.toml is empty, and no later commit touches it), so the old image runs as it did,
with uploads open: **the image route is safe for the server**.

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M4F3CAMZQZW1JXKQZ1R8XXS0
```

Then health must say `"uploads":"open"` and `"rules":"bb-0.9.7"`, and the page must be 0.9.8's online page,
BeltBattles-0.9.8-ee32c765630a-online.html (736,701 bytes, sha256 `06fa891c66dc1334…`). A rollback serves bb-0.9.7
again: its release command re-seeds the bb-0.9.7 pool (`0 written, 120 unchanged, 0 removed`: 0.9.9's seed never
touched that prefix), and the bb-0.9.7 partition and its uploads are as 0.9.8 left them, plus nothing (0.9.9 refused
every bb-0.9.7 upload). Any bb-0.10.0 uploads made in between stay in the bucket under their own prefix, unseen, ready
for a roll forward; 0.9.8 pages never ask for them. What a rollback does to players:
- **An open 0.9.9 tab** (until it reloads): its match requests at 10 hearts get 400 from 0.9.8 (`lives: expected an
  integer in 0..9`), and at 9 or fewer a 404 (0.9.8's decoder skips every bb-0.10.0 object: `road` and `grade` are
  unknown fields to it); either way the page fights its own offline stand-in. Its uploads get 400 or 422 and the page
  says nothing. A reload gets 0.9.8's page.
- **A run saved by 0.9.9 on a player's device:** 0.9.8 keeps runs under the same key (`beltbattles.run.v7`) and the same
  save version (8), so it loads a 0.9.9 run instead of refusing it; it clamps the lives to 5 and prunes joins past 2.
  After a rollback, a 0.9.9 run whose deck holds a NAIL STRIP (or an EMBER TROUGH or SPIKE RAIL, which 0.9.8 doesn't know either) can't be continued: 0.9.8's title offers CONTINUE, but the tap does nothing (0.9.8 throws `unknown item nailstrip`, which the player doesn't see). NEW RUN works and replaces that save (the STAGE's rollback probe on 0.9.8's page, fa1e9ed: output-stage099c/browser/rbprobe-098.log).
- **A player's styles, battle speed and seen tips** stay on the device, as section 26 says.
The release before v19 is 0.9.7's v18 (image registry.fly.io/beltbattles:deployment-01M4ECQT8HY0RZN20KX97JXKH4,
LIVE-097; its page BeltBattles-0.9.7-567642b421f7-online.html, 717,904 bytes), on bb-0.9.7 too: the same command with
v18's image returns it, with the same seed line.

## 28. 0.9.9.1: easier starting opponents (server only; rules bb-0.10.0 kept; its own L4)

0.9.9's launch is section 27, in the clone beltbattles-c099/BeltBattles-c099 (branch c099, tip c0182e78fe6c = tags
stage-099c and live-099). It ran there on its own L4 and must never run again: 0.9.9 is live as release v20 (image
registry.fly.io/beltbattles:deployment-01M4VY1CPFXG7M6FHY41HJ3WM1, since 2026-10-14 at about 00:48Z, LIVE-099). This
section is 0.9.9.1's launch, from the clone beltbattles-r0991/BeltBattles-r0991 (branch r0991; r0991-base = live-099 =
c0182e78fe6c), staged on 2026-10-14.

0.9.9.1 is a **server-only** release: SOFT-1 (REQ-BFG-092) regenerates the seed pool, the 120 ghosts a new player meets
in their first runs, so they are easier to beat: a typical run now ends around 6 to 7 wins (0.9.9: about 5; 0.9.8: about
7). "0.9.9.1" names the release in these docs only: the game page is 0.9.9's, byte for byte, and still reads V0.9.9; the
battle rules stay bb-0.10.0; Shore is not touched.

**What ships.** Branch r0991 at its tip, the release record commit (tag stage-0991; the launch text names its 12 hex):
r0991-base, SOFT-1 (soft1-accepted 26769d1ab308, one commit on live-099, merged as c86743f8ed69 after a merge-tree
check) and the release record (this runbook, docs/CHANGELOG.md and deploy/GAME_BUILD.txt's source line;
tests/tsc-tests-baseline.json stays at 164). The STAGE's gate (kit-r0991/gate0991.sh, item 1) holds every path changed
since r0991-base to tools/samplePool.ts, server/seedPoolData.ts, tests/**, docs/CHANGELOG.md, deploy/GAME_BUILD.txt and
deploy/RUNBOOK.md, and RULES_VERSION to bb-0.10.0.
- **The page** is 0.9.9's online page, unchanged: BeltBattles-0.9.9-814a1b9c065d-online.html, 934,945 bytes, sha256
  `67612299dd841566…`, staged from ../output-r0991/pages/ (a copy of the page v20 serves; the tip's own build:online
  and build are cmp-identical to 0.9.9's two pages: gate item 3). GAME_BUILD.txt keeps its bytes and sha256; only its
  source line names ../output-r0991/pages/ (neither stage.mjs nor the smoke reads that line: they check bytes and
  sha256).
- **The rules** stay bb-0.10.0 (RULES_VERSION, src/sim/content.ts:42; PROBE_RULES, server/ghostProbe.ts:69), so every
  0.9.9 run, save, ghost and upload carries on. PICK_RULE stays { losing 1, deep 0.5, deepAt 2 } (src/net/pick.ts:79):
  a change there changes the page too (src/net/fallback.ts:12 imports matchPick), which would make it a page release
  (0.9.10), not this.
- **The seed pool** is SOFT-1's: server/seedPoolData.ts, 190,272 bytes, sha16 e0318ad8969cbf38 (0.9.9's: 192,209 bytes,
  71f635fc7bd8f936), 120 ghosts, 12 a day, every one graded. 78 of the 120 are new (pooldiff.sh r0991-base..the tip:
  78 ids added, 78 removed, 0 regraded, 42 kept). SOFT-1's bench (96 seeds a hero,
  beltbattles-azbump/output-soft1/bench/bands-soft1.md): par 6.69 (0.9.9: 5.10; 0.9.8: 7.15), c5 3.68 wins (0.9.9:
  3.18), 0W 3%, >=3W 75%. The fingerprint and parBench are unchanged (857,946 bytes, e731bdca8c7ec442 / 4eab334f): no
  sim rule moved.
- **The server bundle**: server/dist differs from v20's in the seed chunk only (seed-<hash>.mjs, which holds the pool;
  its name moves with its content), in ghost-server.mjs only by that chunk's name, and in gen-ghost-pool.mjs
  (tools/samplePool.ts, the generator, which the server never runs); the other six files are byte-identical (gate item
  3). fly.toml, the Dockerfile, .dockerignore, deploy/stage.mjs and every server/*.ts file but seedPoolData.ts are
  unchanged since c0182e7, so uploads stay open.
- **Known test reds at the tip (test only).** 13 test files (17 tests) pin the old pool's content; nothing shipped reads
  them: rc.seedpool, seed.records, net-upload, runes.parity, net-server, snapshot.contract, s8.seedcheck, runes.snapshot,
  belts.snapshot, turrets.snapshot, h2.records, names.upload and h2.nearmiss. SOFT-1 run 1's whole suite on this patch:
  397 files, 382 passed, 2 skipped, these 13 red and no other (runes.parity is also red at the base under load: its
  120 s limit). SOFT-1 run 2 re-pins them by cause on branch soft1, after soft1-accepted; the re-pins ride the next
  client release.

**The release command** (`node /app/dist/ghost-server.mjs seed`) makes the store's bb-0.10.0 pool match the bundle:
`seed: rules bb-0.10.0, 120 pool ghosts on tigris (...)` with **`78 written, 42 unchanged, 78 removed`**: a ghost's id
is its content's (server/seed.ts:67 ghostId), so each changed ghost is a new id written and an old id removed. It lists
and deletes only ghosts/bb-0.10.0/dNN/pool/ (server/tigrisStore.ts:257-279): uploads (…/player/) are never touched. Any
later start of the same image reads `0 written, 120 unchanged, 0 removed`. It plays no battle: 0.7 s and 95,536 kB
peak RSS on one core of the staging host (gate item 5c on this exact pool at the pre-stage 1725a8fd3af7; the STAGE's
gate measures it again at the tip; 0.9.9's: 2 s, 97,604 kB). A seed that fails aborts the deploy and v20 keeps serving.

**The launch call is the Prime's**: output-r0991/CMD-0991.txt (`CMD_FINAL=1 kit-r0991/mkcmd0991.sh r0991 78 A` at the
tip; its sha16 in CMD-0991.txt.sha16), rehearsed with Fly stubbed by kit-r0991/cmd-sim0991.sh (`RESULT (099): PASS`,
three refusal runs first). Run once, under its own operator approval (L4). In order:
1. set `pipefail`, enter this clone, and refuse unless HEAD is the r0991 tip named at launch (12 hex; tag stage-0991),
   the tree is clean and ../output-r0991/probe-id.txt holds no earlier probe id;
2. **the page guard** (in place of section 27's version guard: 0.9.9.1's page is 0.9.9's, so a label can't tell them
   apart): refuse unless the page Fly serves is byte-identical (cmp) to the staged 0.9.9 online page and /v1/health
   reads `"rules":"bb-0.10.0"`. It prints `page guard: Fly serves the 0.9.9 page; only the server changes`, or `refused:
   Fly serves no page (curl exit N)` / `another page than the staged 0.9.9 page (cmp differs)`, `and its health reads
   …; route A ships the server only, over the 0.9.9 page on rules bb-0.10.0`, and stops before anything is staged.
   Leave Fly as it is and report it;
3. stage the page (`node deploy/stage.mjs <the page>`: its size and sha256 against GAME_BUILD.txt; it builds
   server/dist at the tip);
4. save `fly releases -a beltbattles --image` to ../output-r0991/releases-before.txt (v20 first: the rollback target);
5. deploy (`fly deploy --ha=false --remote-only`, its output in ../output-r0991/run-deploy.txt), `fly status`, then
   print the release command's seed line from `fly logs -a beltbattles --no-tail` (information only, never failing);
6. the live checks; 7. the pool check; 8. the probe block; then releases-after.
Every step after the guards is chained with `&&`, so the first failure stops the call.

**The live checks** (section 27's, unchanged): health `{"ok":true,"rules":"bb-0.10.0","store":"tigris",…,"uploads":
"open",…}` (`--retry 3`); `live page = the staged 0.9.9 online page (cmp)`; days 1-10 for a new player at 0 wins and 10
hearts, ten `-> 200` lines (../output-r0991/days.txt); day 3 at 1 win and 9 hearts, a v3 bb-0.10.0 snapshot; an unsigned
POST `-> 401`.

**The pool check (new): is the NEW pool served?** A match answer carries the ghost's id (server/app.ts:360), and a new
player (runs 0) is matched on the day's seed pool only, by matchPick with an rng seeded by the query and the current
minute (app.ts:271, matchSeed): one pool and one query give a known set of possible ids. The call asks the ten day
matches again and checks each served id is one the tip's pool can serve for its day
(../output-r0991/expect-ids-<tip>.txt, written when the text was made), then asks 3 records whose every possible ghost
is new in this pool (day 3 at 1 win and 10 hearts, day 4 at 2 wins and 9 hearts, day 5 at 2 wins and 8 hearts): `pool
check: 3 of 3 records whose every candidate is new in this pool (…) served new ids …the NEW pool is served`. v20's pool
can't answer those with a new id.

**The probe block** (section 27's, unchanged; the probe-id file is ../output-r0991/probe-id.txt): the probe (16 lines,
13 of 13, 6 decks; at bb-0.11.0 from 0.9.11 on: 18 lines, 15 of 15, 7 decks, section 30; at bb-0.12.0 from 0.9.13 on: 19
lines, 16 of 16, 8 decks, section 32; at bb-0.13.0 from 0.9.14 on: 24 lines, 21 of 21, 10 decks, section 33; the same at bb-0.14.0 from 0.9.15 on: section 35; at bb-0.15.0 from 0.9.16 on: 24 lines, 21 of 21, 10 decks, section 37; at bb-0.16.0 from 0.9.17 on: 26 lines, 23 of 23, 10 decks, section 38), revalidate's dry run (`plan: delete 0 record(s) of bb-0.10.0; keep 120 seed-pool
ghost(s) and N upload(s)`: N = the probe's 6 plus every real player's upload since 0.9.9 went live, which all pass),
remove-player --apply of the probe's id (`APPLIED: deleted 6 of 6 record(s).`), `fly apps restart beltbattles`, health,
and `list --rules bb-0.10.0`: ten day rows of 12, then `all 120 N P` (real players' uploads, never a probe upload).

**The hand clean-up**, if the call stops after the probe's first 201 (up to 6 decks left; 7 at bb-0.11.0; 8 at
bb-0.12.0; 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0991/BeltBattles-r0991 && [ -s ../output-r0991/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-r0991/probe-id.txt) --rules bb-0.10.0 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.10.0'
```

Expect `APPLIED: deleted N of N record(s).` (N = the probe's 201s, at most 6; 7 at bb-0.11.0; 8 at bb-0.12.0; 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38) and a list
with no probe upload. Then move probe-id.txt away (probe-id-1.txt) before any new probe. If a rollback follows,
clean up first.

**Rollback to v20** (its own L4 every time, after telling the operator; never part of the launch call). Check that
../output-r0991/releases-before.txt lists v20 first; if not, stop and ask the Prime. From this clone:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M4VY1CPFXG7M6FHY41HJ3WM1
```

v20's release command (0.9.9's bundle) puts 0.9.9's pool back: `seed: rules bb-0.10.0, 120 pool ghosts on tigris (...)`
with **`78 written, 42 unchanged, 78 removed`** (0.9.9's old ids written again, SOFT-1's removed). Rehearsed: gate
item 5f and cmd-sim0991.sh's rollback step read that line, the store's pool ids by day equal to r0991-base's, and
`all 120 6 1` (a 0.9.9 player's six uploads kept). Uploads are untouched both ways, and since the rules are the same
(bb-0.10.0), uploads made under 0.9.9.1 keep meeting experienced players after a rollback. The page is the same bytes,
so players see no change but their first opponents; an open tab needs no reload. fly.toml is the same bytes as v20's
(no commit since c0182e7 touches it), so the image route is safe for the server. Before v20: 0.9.8's v19
(registry.fly.io/beltbattles:deployment-01M4F3CAMZQZW1JXKQZ1R8XXS0, rules bb-0.9.7), section 27's rollback.

**Route B** (0.9.10, a page release, had soft1-accepted moved PICK_RULE's numbers in src/net/pick.ts) was not needed:
soft1-accepted changes no file under src/ (gate item 1).

## 29. 0.9.10: REPLAY after every fight (client release; rules bb-0.10.0 kept; its own L4)

0.9.9's launch is section 27 (clone beltbattles-c099, release v20) and 0.9.9.1's is section 28 (clone
beltbattles-r0991, release v21, image registry.fly.io/beltbattles:deployment-01M4X37P54Y3R4KKA4PKJSW8QB, live since
2026-10-14 at about 11:38Z, LIVE-0991). Both ran and must never run again. This section is 0.9.10's launch, from this
clone (beltbattles-r0910/BeltBattles-r0910, branch r0910; write `refs/heads/r0910` or a tag; r0910-base = live-0991 =
5b3c17a3c416), staged on 2026-10-16.

0.9.10 is a **client (page) release**: a new page on the same server and the same rules. REPLAY (REQ-BFG-112) puts a
REPLAY button beside VIEW BATTLEFIELD on the result card of a dusk and of a warlord fight. It plays the fight just
watched again, from a record made as the Arena makes it (src/screens/battle.ts cardRecordFor), at the run's kept speed,
and it is read only: nothing is saved, kept, folded or sent. PAIR-2 (REQ-BFG-100) takes the REGEN badge off the dark
wind's first tick (src/screens/battleHud.ts regenNow). Both are display code. The label moves 0.9.9 -> 0.9.10
(src/version.ts:2, package.json:4, package-lock.json:3 and :9), so the title reads V0.9.10.

**What ships.** Branch r0910 at its tip, the release record commit (tag stage-0910; the launch text names its 12 hex):
r0910-base (live-0991); REPLAY-1b (replay1b-accepted 5a9e879789e6, which holds REPLAY-1 482b616a9b65; merged as
9e7167437556); PAIR-2 (pair2-accepted 45bd8eabcbdc; merged as b349a627a6c7); SOFT-1 run 2's re-pins (soft1-repinned
574ab6c89e3d, 13 seed-pool test files, test only; merged as a8c051094425); two tooling commits, scripts only (the shot
list's fork shots pick the Hard card, STAGE-099C F4; rcruns' honest check uses the server's own `validateUpload`, F10,
in the new scripts/serverCheck.mjs); the label and CHANGELOG commit d92ef999a23d; and the release record (this runbook and
deploy/GAME_BUILD.txt). Since r0910-base the only files changed under src/sim, src/net, src/core, src/game, server, tools
or the package files are the label's three: src/version.ts, package.json and package-lock.json.
- **The page** is BeltBattles-0.9.10-d92ef999a23d-online.html, 936,607 bytes, sha256 `7b32c744ab6c7953…` (GAME_BUILD.txt
  holds the whole hash), built at d92ef99 and staged from ../output-stage0910/pages/. It is 1,662 bytes larger than
  0.9.9's page (934,945). Shore gets the offline page of the same commit: BeltBattles-0.9.10-d92ef999a23d.html, 936,596
  bytes, sha256 `6e1b752b2cc274df…` (= ../output-stage0910/shore/index.html).
- **The server** is unchanged. server/dist built at the tip is byte-identical to v21's (W/ref/v21-dist: 9 files, sha256
  equal), and server/, fly.toml, the Dockerfile, .dockerignore and deploy/stage.mjs have no change since r0910-base.
  Uploads stay open.
- **The rules** stay bb-0.10.0 (RULES_VERSION, src/sim/content.ts:42; PROBE_RULES, server/ghostProbe.ts:69). A 0.9.9 page
  and a 0.9.10 page ask for, and upload under, the same rules, so they meet each other's ghosts: the match route serves
  the bucket of the rules a request names (server/app.ts:357) and an upload under other rules is refused (:321-322).
- **A saved run is unchanged.** It is version 8 (RUN_VERSION, src/game/run.ts:179) under `beltbattles.run.v7`
  (src/game/save.ts:38); no file under src/game changed since r0910-base, and REPLAY keeps nothing in the run (its record
  is a field of the battle screen, never saved).

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the pool it would write already in the store:
`seed: rules bb-0.10.0, 120 pool ghosts on tigris (...)` with **`0 written, 120 unchanged, 0 removed`** (server/
seedPoolData.ts is 190,272 bytes, sha16 e0318ad8969cbf38, at r0910-base and at the tip). Rehearsed on a scratch jsonl
store (kit0910/seed0910.sh at d92ef99, O/logs/seed0910-d92ef99.log, 7 of 7 steps pass): v21's seed on a fresh store writes
`120 written, 0 unchanged, 0 removed`; the tip's seed over it reads **`0 written, 120 unchanged, 0 removed`** in 0.5 s with
a peak RSS of 95,916 kB (one process, no battle played) and pool.jsonl byte-identical before and after (163,495 bytes,
f6242788a6567d73); run again it reads the same; `list` reads `all 120 0 0`; revalidate's dry run reads `plan: delete 0
record(s) of bb-0.10.0; keep 120 seed-pool ghost(s) and 0 upload(s)`.

**The launch call is the Prime's** (CMD-0910, from CMD-0991's text; run once, under its own operator approval, L4). Fly
serves 0.9.9's page now (v21), so section 28's page guard still fits: refuse unless Fly serves the 0.9.9 page, byte for
byte, and /v1/health reads `"rules":"bb-0.10.0"` (the label can tell the pages apart again, so section 27's label guard
fits too: the staged label is 0.9.10, the live one 0.9.9). The live checks are
section 5's, with this page: `content-length: 936607` and `live page = the staged 0.9.10 online page (cmp)`; days 1-10
for a new player at 0 wins and 10 hearts (ten `-> 200`), day 3 at 1 win and 9 hearts (a v3 bb-0.10.0 snapshot), an
unsigned POST `-> 401`. There is no pool check: the pool does not change (section 28's would read the same ids as before).
The probe block is section 27's, unchanged (16 lines, 13 of 13, 6 decks at bb-0.10.0; 18 lines, 15 of 15, 7 decks at
bb-0.11.0 from 0.9.11 on, section 30; 19 lines, 16 of 16, 8 decks at bb-0.12.0 from 0.9.13 on, section 32; 24 lines, 21 of 21, 10 decks at bb-0.13.0 from 0.9.14 on, section 33; the same at bb-0.14.0 from 0.9.15 on: section 35; 24 lines, 21 of 21, 10 decks at bb-0.15.0 from 0.9.16 on, section 37; 26 lines, 23 of 23, 10 decks at bb-0.16.0 from 0.9.17 on, section 38; revalidate's
dry run keeps the 120 seed-pool ghosts and every real upload; remove-player --apply of the probe's id;
`fly apps restart beltbattles`; `list`).

**Rollback to v21** (its own L4 every time, after telling the operator; never part of the launch call). Check that the
releases-before file lists v21 first; if not, stop and ask the Prime. From this clone:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M4X37P54Y3R4KKA4PKJSW8QB
```

v21 is 0.9.9.1: 0.9.9's page (934,945 bytes, sha256 `67612299dd841566…`, reads V0.9.9, has no REPLAY) on SOFT-1's pool.
Its release command re-seeds the same pool and writes nothing (**`0 written, 120 unchanged, 0 removed`**, rehearsed:
seed0910.sh step e), and uploads are untouched both ways, so the store is as the launch left it. A run saved by 0.9.10 is
a run saved by 0.9.9.1 (version 8, the same key): the 0.9.9 page loads it and carries on, and a REPLAY that was open
goes with the page, with nothing of it saved. An open 0.9.10 tab keeps its page until it reloads and meets the same
rules. fly.toml is unchanged, so the image route is safe for the server. Before v21: v20 = 0.9.9 (section 27's rollback).

**The checks of this STAGE.** Before this record, at r0910-base plus the merges and the tooling commits: tsc and
typecheck:server 0 errors, typecheck:tests PASS at 164 (tests/tsc-tests-baseline.json stays 164), the fingerprint
(857,946 bytes, e731bdca8c7ec442) and all 41 parBench lines (`fingerprint all: 4eab334f`) IDENTICAL, 26 test files green
each alone (the replay, pair and count files, and the 13 re-pinned ones), and at d92ef99 the label tests, the page smoke
4 of 4 offline and 4 of 4 online with 0 console errors and 0 NOT HONEST, and the seed rehearsal above. At the record commit
the STAGE runs the gate, the server rehearsals (seedcheck, probecheck), the whole suite and the browser block (touchcheck,
card3check, asynccheck, rcruns, the mirror, the shots and stills, the REPLAY stills); every result is in the STAGE
report (O/STAGE-REPORT.md). **Carried, not run:** the stand-in check (no file under src/sim changed since 0.9.9's
IDENTICAL result; tools/samplePool.ts is the seed pool's generator, 0.9.9.1's own change), the mutants (the server and
the validators are unchanged since 0.9.9's 36 of 36) and the rollback probe (the saved run is unchanged).

## 30. 0.9.11: a run is won at 10 wins (rules release bb-0.11.0; server and client in one deploy; its own L4)

0.9.10's launch is section 29 (clone beltbattles-r0910, release v22, image
registry.fly.io/beltbattles:deployment-01M557C6PK0XAW8JT7K36VD1JQ, live since 2026-10-17 at about 15:24Z). It ran and
must never run again. This section is 0.9.11's launch, from this clone (beltbattles-r0911/BeltBattles-r0911, branch
r0911; write `refs/heads/r0911` or a tag; r0911-base = live-0910 = c5f695ae83d3), staged on 2026-10-17.

0.9.11 is a **rules release** (route B): the battle rules move to **bb-0.11.0**, so the page and the server ship
together, in one Fly deploy, and **never the page alone**: its PUT /v1/profile and its uploads under bb-0.11.0 need the
new server (an old server answers the profile with a 404, silent on screen, and refuses the uploads with a 422). It is
BUMP-1D, the hull lane 6c99be48's bump (tag bump-accepted 54bd779774b6, merged here as r0911-bump 6a17f7b120f7): a run
is won at its 10th dusk win or lost at 0 hearts, with no day limit (REQ-BFG-059, REQ-BFG-116); a lost dusk costs 1 heart
on days 1-3 and 2 from day 4 (HEART_COSTS [1, 2, 2], src/sim/hearts.ts:61; was 3 from day 7); twelve new rigs, six plain
and six shaped (REQ-BFG-114); softer seed ghosts and a gentler floor (REQ-BFG-092); the stand-in pool and the seed pool
rebuilt for days 1-16 (192 seed ghosts); and PROFILE-UP, the signed profile upload (PUT /v1/profile). The label moves
0.9.10 -> 0.9.11 (src/version.ts:2, package.json:4, package-lock.json:3 and :9), so the title reads V0.9.11.

**What ships.** Branch r0911 at its tip, the closing docs commit (tag stage-0911; the launch text names its 12 hex; the
release record is 0be1bbb1b279, two commits before it): r0911-base (live-0910); the merge of bump-accepted (r0911-bump
6a17f7b120f7: 276 files against r0911-base, +17,895 -1,948: src 73, server 10, tools 13, tests 179, docs/CHANGELOG.md;
nothing under deploy/ and none of the package files or src/version.ts); three test and script commits (f4aab47:
runes.parity's decks test 600 s and the harness CPU budget 240 s, tests only, pre-approved in RULING-BUMP-R3 Q2;
11ff116: asynccheck's slow-server row 20 s and its PUT /v1/profile rows; 82620e3: the page smoke's runner takes
HEART_COSTS [1, 2, 2] and the run's long-run mark; the last two scripts only); the label and CHANGELOG commit
88c2e865e10b; the release record 0be1bbb1b279 (this runbook, docs/CUSTOMIZE.md, docs/ASYNC.md and deploy/GAME_BUILD.txt);
d421a61, made after the release record (scripts only: the page smoke's phone run ends a shaped piece's finger the game's
finger lift below its plan, so a SPIKE RAIL drag is no longer dropped off the deck; it builds pages byte-identical to
the record's); and the closing docs commit (this section's tip and checks, nothing else).
- **The page** is BeltBattles-0.9.11-88c2e865e10b-online.html, 1,014,964 bytes, sha256 `574b7ba79251aee5…`
  (GAME_BUILD.txt holds the whole hash), built at 88c2e86 and staged from ../output-stage0911/pages/. It is 78,357 bytes
  larger than 0.9.10's page (936,607) and the same size as BUMP-1D's own page at 54bd779 (1,014,964: the label is as
  long as the old one). Shore gets the offline page of the same commit: BeltBattles-0.9.11-88c2e865e10b.html, 1,014,953
  bytes, sha256 `4b1640356daaaf7b…` (= ../output-stage0911/shore/index.html).
- **The server** changes: ten source files under server/ (app.ts, config.ts, ghostAdmin.ts, ghostProbe.ts, s3.ts, seed.ts,
  tigrisStore.ts, seedPoolData.ts, and the new profileRoute.ts and profileStore.ts), plus src/ and tools/ code the bundle
  imports. server/dist at the tip is 9 files, 1,431,852 bytes, against v22's 9 files, 1,075,520 bytes (W/ref/v22-dist):
  **all nine differ** (ghost-server.mjs, ghost-admin.mjs, gen-ghost-pool.mjs, ghost-probe.mjs and the chunks config,
  heroBuilds, identity, seed and validate, each with a new hash name; kit0911/srvdiff.sh, O/logs/srvdiff-<tip>.txt).
  fly.toml, the Dockerfile, .dockerignore and deploy/stage.mjs have no change since r0911-base. Uploads stay open.
- **The rules** are bb-0.11.0: RULES_VERSION (src/sim/content.ts:47), LONG_RUN_RULES (src/net/rulesGate.ts:408),
  SHAPES2_RULES (:276) and PROBE_RULES (server/ghostProbe.ts:90). HEARTS_RULES, PICK_RULES, OPEN_RUNES_RULES,
  FREE_JOINS_RULES, SHAPES_RULES and NPC_DAY_RULES stay bb-0.10.0 and LAST_CHANCE_RULES bb-0.9.7 (each read against the
  record's own rules); FIRST_RUN stays false (src/sim/firstRun.ts:35). The switches on: LONG_RUN, PLAIN_RIGS, SHAPES2,
  HEARTS, SHAPES. A 0.9.10 page asks for, and uploads under, bb-0.10.0; a 0.9.11 page under bb-0.11.0. The match route
  serves the bucket of the rules a request names (server/app.ts:391-412) and an upload under other rules is refused
  (:336-337), so the two pages never meet each other's ghosts. The 34 bb-0.10.0 uploads live at staging stay in their
  bucket, unseen by 0.9.11 players.
- **A saved run, from the code.** The save's version line (RUN_VERSION 8, src/game/run.ts:197) and key
  (`beltbattles.run.v7`, src/game/save.ts:38) are unchanged. (a) *A run saved in 0.9.10 and loaded by 0.9.11* has no
  `longRun` mark (src/game/run.ts:183-188), so migrateRun keeps it a run of its own kind (src/game/save.ts:297, :323)
  and it ends after day 10's dusk, "complete", or at 0 hearts (src/game/day.ts:213-215, :266-268; pinned by
  tests/run1.rule.test.ts:197-204). It plays the new heart costs (a loss on days 7-10 costs 2, was 3), draws the rest
  of its shops from its saved ware list (so the twelve new rigs are not in them), and its dusk uploads are refused with
  a 422 (a bb-0.11.0 upload must state `losses`, src/net/records.ts:262-265) and stay off the server. (b) *A run saved
  by 0.9.11 and loaded by v22 (0.9.10, the rollback)*, **rehearsed in a browser** (kit0911/rbprobe on v22's page,
  W/ref/pages-0910/BeltBattles-0.9.10-d92ef999a23d.html; the STAGE report's section 15; O/browser/rbprobe-*.log with
  stills): the same key and version 8, so v22's loader accepts the save and its title offers CONTINUE (`DAY 10/10 ·
  FURNACE · 5-6` for a day-12 run: the day is clamped to 10, r0911-base src/game/save.ts:311, `longRun: true` is kept and
  read by nothing, and a LAST CHANCE from day 10 on is dropped as malformed, :302). **What CONTINUE does depends on the
  rigs the run holds.** A deck holding one of the twelve new rigs (a RASP): CONTINUE does nothing, every time (the title
  stays; page error `unknown item rasp`), and the save is left as it was. A caravan whose shop offers one (SPARK GAP,
  BALLAST): CONTINUE opens the build screen and **the screen goes black** (page error `Cannot read properties of
  undefined (reading 'rarity')`; after a reload the title is back and CONTINUE goes black again), and v22 rewrites the
  save shorter (1,762 to 942 characters in the probe). Both probe saves had a new rig in their shop, as a save made at a
  dawn may (the shop draws from the pool the new rigs are in). In every case NEW RUN, from the title (after a reload
  where the screen is black), starts a normal day-1 run and replaces the save: **a player's 0.9.11 run in progress is
  lost on the rollback, silently.** A save holding only pieces v22 knows, in its deck and its shop, would load as a
  day-10 run and end "complete" after one more dusk (from the code, not probed).

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store holding bb-0.10.0's pool (120
ghosts, 0.9.9.1's) and nothing under bb-0.11.0: `seed: rules bb-0.11.0, 192 pool ghosts on tigris (...)` with
**`192 written, 0 unchanged, 0 removed`** (server/seedPoolData.ts is 391,992 bytes, sha16 0546f5afe4bab423: 192
ghosts, days 1-16, 12 a day, each stating its losses, SEED_POOL_RULES bb-0.11.0). **bb-0.10.0's 120 pool ghosts and every
upload under it are left exactly as they are**: the Tigris seed lists and writes only `ghosts/bb-0.11.0/dNN/pool/`
(server/tigrisStore.ts replacePool, poolPrefix(rules, day)). Rehearsed twice, on the tip's real CLIs and v22's
(W/ref/v22-dist): (1) on a scratch JSON-lines store (kit0911/seed0911.sh, O/logs/seed0911-<tip>.log): v22's seed on a
fresh store writes `120 written, 0 unchanged, 0 removed`; the tip's seed over it **`192 written, 0 unchanged, 0
removed`** in 1.9 s (nice 19, one process, peak RSS 171,976 kB, no battle played) with bb-0.10.0's 120 still listed
and its lines in pool.jsonl untouched; run again **`0 written, 192 unchanged, 0 removed`**; `list --rules bb-0.11.0`
reads sixteen day rows of 12 and `all 192 0 0`, `--rules bb-0.10.0` `all 120 0 0`; revalidate's dry run `plan: delete 0
record(s) of bb-0.11.0; keep 192 seed-pool ghost(s) and 0 upload(s)`. (2) **On the Tigris path** (kit0911/tigris-rollback.sh:
the same CLIs with BB_GHOST_STORE=tigris against the in-process fake S3, tools/fakeS3.ts, SigV4-strict; O/logs/
tigris-rollback-<tip>.log): the same counts, with bb-0.10.0's 120 objects byte-identical before and after, 192 objects
under bb-0.11.0, and no DELETE request at all. The seed plays no battle; fly.toml's [[vm]] has 256 MB and this seed's
peak RSS is about 171,000 kB on this host (170,128-171,976 kB over the rehearsals; 185,436 kB with the seed pinned to one
core, kit0911/seedtime.sh at the tip; 0.9.10's 120 ghosts: 97,604 kB): watch the release command's exit at the launch.

**The launch call is the Prime's** (CMD-0911, from CMD-0910's text; run once, under its own operator approval, L4).
Fly serves 0.9.10's page now (v22), so the guards are: refuse unless Fly serves the 0.9.10 page, byte for byte
(`content-length: 936607`, sha256 `7b32c744ab6c7953…`), /v1/health reads `"rules":"bb-0.10.0"`, and the label can
tell the pages apart (the staged label is 0.9.11, the live one 0.9.10). The live checks are section 5's, with this page
and these rules: health `"rules":"bb-0.11.0"` and `"uploads":"open"`, `content-length: 1014964`, `live page = the staged
0.9.11 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`), day 3 at 1 win and 9
hearts (a v3 bb-0.11.0 snapshot), an unsigned POST `-> 401`, and `list --rules bb-0.11.0`: sixteen day rows of 12, then
`all 192 0 0` (no bb-0.11.0 upload yet, unless a player uploaded since the deploy). In `fly logs -a beltbattles
--no-tail`: the `seed:` line above.

**The probe block** (section 27's steps, under bb-0.11.0 with the new numbers; each step chained with `&&`; the
probe-id file is ../output-stage0911/probe-id.txt, which must not exist yet):
1. `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage0911/probe-id.txt`: **18 lines**, the
   header (`probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.11.0); only the FURNACE,
   WEAVER, FOUNDRY and BASTION decks may be stored`), **15 PASS lines** (section 27's thirteen, now under bb-0.11.0, and
   two new ones: longrun-signed 201, a day-12 deck with 9 wins and 2 draws, and longrun-nolosses 422, `losses: a long
   run's upload states the dusks the run lost (snapshot.losses is missing; ...)`), then `probe player: <43 characters>` and
   **`probe: 15 of 15 checks as expected; the server stored 7 deck(s) for this player (expected 7); the player id is in
   ../output-stage0911/probe-id.txt`**. The seven stored decks: FURNACE's day-1 start deck, the WEAVER, FOUNDRY and
   BASTION day-3 reference decks, FURNACE's day-7 LAST CHANCE deck, WEAVER's day-2 NPC-day deck and the day-12 long-run
   deck. With `--profile` after the id file, two PUTs more (profile-signed 200, profile-badsig 401) and **`17 of 17`**. (At bb-0.12.0, from 0.9.13 on: 19 lines, 16 of 16, 8 decks,
   `--profile` 18 of 18; revalidate keeps 192 and 8 upload(s); `APPLIED: deleted 8 of 8 record(s).`: section 32. At bb-0.13.0, from 0.9.14 on: 24 lines, 21 of 21, 10 decks,
   `--profile` 23 of 23; revalidate keeps 192 and 10 upload(s); `APPLIED: deleted 10 of 10 record(s).`: section 33. The same at bb-0.14.0
   from 0.9.15 on: section 35. At bb-0.15.0, from 0.9.16 on: 24 lines, 21 of 21, 10 decks, `--profile` 23 of 23; revalidate keeps 230 and 10 upload(s); `APPLIED: deleted 10 of 10 record(s).`: section 37. At bb-0.16.0, from 0.9.17 on: 26 lines, 23 of 23, 10 decks,
   `--profile` 25 of 25; revalidate keeps 254 and 10 upload(s); `APPLIED: deleted 10 of 10 record(s).`: section 38.)
2. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.11.0'`, a dry run:
   `plan: delete 0 record(s) of bb-0.11.0; keep 192 seed-pool ghost(s) and 7 upload(s)` (the probe's 7, plus any real
   player's upload since the deploy, which all pass) and `DRY RUN: nothing was deleted.`;
3. `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage0911/probe-id.txt) --rules bb-0.11.0 --apply"`:
   `plan: delete 7 record(s) of bb-0.11.0; keep 192 seed-pool ghost(s) and …`, seven `delete ghosts/bb-0.11.0/dNN/player/<g…>.json`
   lines (days 1, 2, 3 (three), 7 and 12: the Tigris store enumerates days 1 to 25), then **`APPLIED: deleted 7 of 7
   record(s).`** (8 of 8 at bb-0.12.0; 10 of 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38);
4. `fly apps restart beltbattles`, so the server drops its cached copies (the bucket cache lives 600 s, fly.toml);
5. health again: `"rules":"bb-0.11.0"` and `"uploads":"open"`;
6. `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.11.0'`: sixteen day rows of 12,
   then `all 192 0 0` (or `all 192 N P` if players uploaded since the deploy; never a probe upload).

STAGE-0911's local rehearsal of exactly this block (kit0911/probecheck.sh on the built tip, a scratch store; O/logs/
probecheck-<tip>.txt): every `expect:` line yes, with 18 lines, `15 of 15`, 7 stored, `delete 0 ... keep 192 ... 7`, `deleted 7 of 7`
three times (the first probe, the hand clean-up, the `--profile` probe), `all 192 0 0` after each restart, and
`--profile` `17 of 17` (STAGE-0913 at bb-0.12.0: 19 lines, `16 of 16`, 8 stored, `deleted 8 of 8`, `--profile` `18 of 18`; STAGE-0914 at bb-0.13.0: 24 lines, `21 of 21`, 10 stored, `deleted 10 of 10`, `--profile` `23 of 23`; the same at bb-0.14.0 from 0.9.15 on: section 35; STAGE-0916 at bb-0.15.0: 24 lines, `21 of 21`, 10 stored, `deleted 10 of 10`, `--profile` `23 of 23`: section 37; STAGE-0917 at bb-0.16.0: 26 lines, `23 of 23`, 10 stored, `deleted 10 of 10`, `--profile` `25 of 25`: section 38). A `--profile` probe leaves `profiles/<player id>.json`, which ghost-admin does not know: delete it
by hand (an S3 tool), or leave it. Each probe leaves a day-12 deck until `remove-player` runs.

**The hand clean-up**, if the call stops after the probe's first 201 (up to 7 decks left; 8 at bb-0.12.0; 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38):

```sh
set -o pipefail; cd /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0911/BeltBattles-r0911 && [ -s ../output-stage0911/probe-id.txt ] && fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs remove-player $(cat ../output-stage0911/probe-id.txt) --rules bb-0.11.0 --apply" && fly apps restart beltbattles && sleep 5 && fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.11.0'
```

Expect `plan: delete N record(s) of bb-0.11.0`, N the number of 201s the probe got (at most 7; 8 at bb-0.12.0; 10 at bb-0.13.0; the same at bb-0.14.0 from 0.9.15 on: section 35; the same at bb-0.15.0 from 0.9.16 on: section 37; the same at bb-0.16.0 from 0.9.17 on: section 38), then `APPLIED: deleted N of N
record(s).` Then move probe-id.txt away before any new probe.

**Rollback to v22** (its own L4 every time, after telling the operator; never part of the launch call). Check that the
releases-before file lists v22 first; if not, stop and ask the Prime. If a probe's decks are on the store, run the
clean-up first, while 0.9.11 serves. From this clone:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M557C6PK0XAW8JT7K36VD1JQ
```

v22 is 0.9.10: the page (936,607 bytes, sha256 `7b32c744ab6c7953…`, V0.9.10, with REPLAY) and the server together, on
**bb-0.10.0**, so it puts the old rules back on both sides. Its release command re-seeds bb-0.10.0 and writes nothing
(**`0 written, 120 unchanged, 0 removed`**), and leaves bb-0.11.0's pool and uploads where they are, under their own
prefix, unseen (rehearsed on the Tigris path: v22's seed over the tip's bucket, bb-0.11.0's 192 objects byte-identical
and not one DELETE; O/logs/tigris-rollback-<tip>.log). **Not on a JSON-lines dev store**: there v22's seed (and v22's
ghost-admin) cannot read bb-0.11.0 lines, count them as unreadable and rewrite the file without them (`0 written, 120
unchanged, 192 removed`; O/logs/seed0911-<tip>.log, step e). Never run v22's seed against a jsonl store that holds
bb-0.11.0 data. Fly's store is Tigris (fly.toml's BB_GHOST_STORE = "tigris"), where the rollback is clean. An open
0.9.11 tab keeps its page until it reloads and asks v22's server for bb-0.11.0 ghosts it cannot decode (it fights its
own stand-in), its uploads answer 422 and its PUT /v1/profile 404, all silent. A run saved by 0.9.11 is the case
above, (b): on v22 its CONTINUE does nothing or goes black and NEW RUN replaces it, so a rollback costs every player the
run in progress. fly.toml is unchanged, so the image route is safe for the server. Before v22: v21 = 0.9.9.1 (section
29's rollback).

**The server note** (RULING-BUMP-R3 Q3, not a defect): there is no roadCap warm-up at boot, so the first deep upload per
process pays about 5 s, once. It is on BUMP-1E's list. (0.9.13's server and every later one have the warm-up: server/warm.ts, sections 32 to 35 and 37.)

**The checks of this STAGE** (the numbers; the logs are in the STAGE report, O/STAGE-REPORT.md, and none of the checks
changes a file). At r0911-bump (6a17f7b120f7, the bump's tree): tsc and typecheck:server 0 errors, typecheck:tests PASS
at 164 (tests/tsc-tests-baseline.json stays 164), the fingerprint (853,244 bytes, 0c9159c337f8f7c2; 352 decks, 1,056
battles) and all 41 parBench lines (`fingerprint all: 145416d1`) IDENTICAL to the bump's pins. The stand-in check (the
16-day pool regenerated from the STAGE's own bundle at r0911-bump, then `--check`): **IDENTICAL**, 99,984 bytes,
4,137,088 battles; no file of its closure (87 files) changed after r0911-bump, so it carries to the tip. At 88c2e86 (the
label): the label tests (tests/rc.label, tests/packs.rules: 8 passed) and the three builds. At the record commit
0be1bbb1b279: the gate (tsc 0, typecheck:server 0, typecheck:tests PASS at 164, **the smoke 45 of 45**, luckcaps
**IDENTICAL**, `regenerated 7412 bytes`), fp and parBench IDENTICAL again, seedcheck.sh 14 of 14 and probecheck.sh 17 of
17 (every `expect:` yes), the seed rehearsals above, capsearch (report-only) 2 ok of 19, and the whole suite **ALL GREEN:
432 files, 5,069 tests passed, 7 opt-in skipped**. The page smoke (pages099c.sh off and on at d421a61, whose pages are
byte-identical to the record's): **4 of 4 runs offline and 4 of 4 online**, 0 console errors, 0 NOT HONEST. The browser
block at the record commit, with d421a61's runner: touchcheck noprof 2,215 of 2,215 and mixed 2,107 of 2,107 (0.9.9's
mixed: 2,044; the difference is the REPLAY section's 63 rows), card3check 13 of 13, stylecheck 180 of 180, explaincheck
35 of 35, surge 4 of 4, asynccheck 62 of 62, rcruns offline 32 of 32 and online 44 of 44, mirror PASS, runeshots 103,
motiontap 123 of 123, the c1 and p1 stills 0 failed, the field, scout and LAST CHANCE stills, 311 shots, and a
like-for-like samepixels account against the live build (every differing frame in a class of the brief's ruling 23). The
mutants: 36 of 36 caught (CM2b's anchor moved with the rules and was re-anchored as CM2c, which is caught). Report-only:
motionperf against v22's page (60 fps in every scene, p99 16.8 ms) and the rollback probe (the saved-run bullet above,
(b)).

## 31. 0.9.12: shop cards show a piece's icon and price (client release; rules bb-0.11.0 kept; its own L4)

0.9.11's launch is section 30 (clone beltbattles-r0911, release v23, image
registry.fly.io/beltbattles:deployment-01M56B4514PHZZ17S572CGSMA6, live since 2026-10-18 at about 01:49Z, LIVE-0911). It
ran and must never run again. This section is 0.9.12's launch, from this clone (beltbattles-r0912/BeltBattles-r0912,
branch r0912; write `refs/heads/r0912` or a tag; r0912-base = live-0911 = 6541015f2de3), staged on 2026-10-18.

0.9.12 is a **client release** (a new page; the server and the rules are kept): the battle rules stay **bb-0.11.0**, and
no file under src/sim, src/net, src/core, src/game, server or tools differs from live-0911 (`git diff --name-only
r0912-base <this commit> -- src/sim src/net src/core src/game server tools` lists nothing). It is SHOPCARD-1, the card
lane 3fe3ed56's ride (REQ-BFG-115, -113 and -081; tag sc0912b-accepted 97e2cc5753d0: SHOPCARD-1 to 1f, SC-0912 and
SC-0912b), merged here as r0912-cards ef923bb1d67c. It is display only: every unsold shop card shows just the piece's icon, its
price and simple marks (rarity, owned, a merge mark, a sale mark); a shaped piece shows its grid on its shop card and in
its cargo slot; the tap panel's and the desk tooltip's words are plainer; the buy button says `SALE: BUY nG` on a sale
and `MERGE ★n: nG` on a merge; HOW TO PLAY gets a merge clause and a shape sentence (docs/CHANGELOG.md's 0.9.12 entry, each
claim checked in the code). The label moves 0.9.11 -> 0.9.12 (src/version.ts:2, package.json:4, package-lock.json:3 and
:9), so the title reads V0.9.12.

**What ships.** Branch r0912 at its tip (tag stage-0912; the launch text names its 12 hex): r0912-base (live-0911); the
--no-ff merge r0912-cards ef923bb1d67c of sc0912b-accepted (63 files against r0912-base, +3,383 -343: src 21, tests 42, six
of them new; nothing else); 70e3481 (scripts only: rcruns.mjs's version check follows the label); the label and CHANGELOG
commit 9a145b83e041; the release record bbdf742de012 (deploy/GAME_BUILD.txt and this runbook); and the closing docs commit
(deploy/RUNBOOK.md only: this section's checks and the seed's measured cost, and the corrections of the STAGE's fact check).
- **The page** is BeltBattles-0.9.12-9a145b83e041-online.html, 1,015,682 bytes, sha256 `9911a69fc4d826ca…` (GAME_BUILD.txt
  holds the whole hash), built at 9a145b8 and staged from ../output-stage0912/pages/. It is 718 bytes larger than 0.9.11's
  page (1,014,964). Shore gets the offline page of the same commit: BeltBattles-0.9.12-9a145b83e041.html, 1,015,671 bytes,
  sha256 `be5f369618cf538f…` (= ../output-stage0912/shore/index.html).
- **The server does not change.** server/dist built at this commit is 9 files, 1,431,852 bytes, and **all nine are
  byte-identical to v23's** (W/ref/v23-dist, the beltbattles-r0911 clone's server/dist at the 0.9.11 launch: ghost-server.mjs, ghost-admin.mjs,
  gen-ghost-pool.mjs, ghost-probe.mjs and the config, heroBuilds, identity, seed and validate chunks, same hash names;
  kit0912/srvdiff.sh, O/logs/srvdiff-<commit>.txt). Not even the label reaches the server bundle. fly.toml, the
  Dockerfile, .dockerignore and deploy/stage.mjs have no change since r0912-base. Uploads stay open.
- **The rules** are bb-0.11.0 and no rules literal moved: RULES_VERSION (src/sim/content.ts:47), LONG_RUN_RULES
  (src/net/rulesGate.ts:408), SHAPES2_RULES (:276) and PROBE_RULES (server/ghostProbe.ts:90); HEARTS_RULES, PICK_RULES,
  OPEN_RUNES_RULES, FREE_JOINS_RULES, SHAPES_RULES and NPC_DAY_RULES stay bb-0.10.0 and LAST_CHANCE_RULES bb-0.9.7;
  FIRST_RUN stays false (src/sim/firstRun.ts:35). A 0.9.11 page and a 0.9.12 page both ask for, and upload under,
  bb-0.11.0: the match route serves the bucket of the rules a request names (server/app.ts:404) and an upload under other
  rules is refused (:336-337), so the two pages meet each other's ghosts. The fingerprint (853,244 bytes,
  0c9159c337f8f7c2; 352 decks, 1,056 battles) and all 41 parBench lines (`fingerprint all: 145416d1`) are IDENTICAL to
  0.9.11's at r0912-cards.
- **A saved run, from the code.** The save's version line (RUN_VERSION 8, src/game/run.ts:197) and key
  (`beltbattles.run.v7`, src/game/save.ts:38) are unchanged, no file under src/game, src/sim, src/core or src/net differs
  from live-0911, and none of the ride's 21 src files reads or writes localStorage: a run saved in 0.9.11 loads in 0.9.12,
  and a run saved in 0.9.12 loads in 0.9.11 (v23, the rollback). Unlike section 30's rollback to v22, rolling back to v23
  does not cost a player the run in progress.

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store already holding bb-0.11.0's 192
pool ghosts (days 1-16, 12 a day; LIVE-0911: 192 written at v23's launch), and this commit's bundle carries the same pool
(server/seedPoolData.ts is 391,992 bytes, sha16 0546f5afe4bab423, byte for byte r0912-base's): `seed: rules bb-0.11.0, 192
pool ghosts on tigris (...)` with **`0 written, 192 unchanged, 0 removed`**, as on every later start of the same image.
bb-0.10.0's 120 pool ghosts and every upload are not touched (the Tigris seed lists and writes only
`ghosts/bb-0.11.0/dNN/pool/`, section 30). Rehearsed on the built tip's real CLI and v23's, on a scratch JSON-lines store
(kit0912/seed0912.sh, O/logs/seed0912-<commit>.log): v23's seed on a fresh store `192 written, 0 unchanged, 0 removed`;
this commit's seed over it **`0 written, 192 unchanged, 0 removed`**; again the same; and **the rollback**, v23's seed over
that store, **`0 written, 192 unchanged, 0 removed`**, with pool.jsonl byte-identical after each step and `ghost-admin list
--rules bb-0.11.0` reading `all 192 0 0` after the fresh seed, the launch seed and the rollback. The seed plays no battle.
Its cost, measured at the release record with the seed pinned to one core (kit0912/seedtime.sh, a loaded host): 4 s and a
peak RSS of 168,164 kB (0.9.11 read 3 s and 185,436 kB on a quiet host; the bundle is the same), on a 256 MB VM (fly.toml's
[[vm]]).

**The launch call is the Prime's** (CMD-0912, from CMD-0911's text; run once, under its own operator approval, L4).
Fly serves 0.9.11's page now (v23), so the guards are: refuse unless Fly serves the 0.9.11 page, byte for byte
(`content-length: 1014964`, sha256 `574b7ba79251aee5…`), and /v1/health reads `"rules":"bb-0.11.0"` (the rules do not tell
the two releases apart; the page's bytes do). The live checks are section 5's, with this page: health `"rules":"bb-0.11.0"`
and `"uploads":"open"`, `content-length: 1015682`, `live page = the staged 0.9.12 online page (cmp)`, days 1-16 for a new
player at 0 wins and 10 hearts (sixteen `-> 200`), day 3 at 1 win and 9 hearts (a v3 bb-0.11.0 snapshot), an unsigned POST
`-> 401`, and `list --rules bb-0.11.0`: sixteen day rows of 12, then `all 192 0 0` (or `all 192 N P`, if N uploads by P players
under bb-0.11.0 came in since v23's launch). In `fly logs -a beltbattles --no-tail`: the `seed:` line above. The page's own label (V0.9.12 on the title) is what tells the two pages apart in a browser.

**The probe block** is section 30's, unchanged (the server and the rules are 0.9.11's; the probe-id file is
../output-stage0912/probe-id.txt, which must not exist yet): `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev
../output-stage0912/probe-id.txt` prints **18 lines**, ending **`probe: 15 of 15 checks as expected; the server stored 7
deck(s) for this player (expected 7); the player id is in ../output-stage0912/probe-id.txt`** (with `--profile` after the id
file, two PUTs more and `17 of 17`); revalidate's dry run `plan: delete 0 record(s) of bb-0.11.0; keep 192 seed-pool
ghost(s) and 7 upload(s)` (the probe's 7, plus any real player's upload since v23's launch); `remove-player <id> --rules
bb-0.11.0 --apply` prints **`APPLIED: deleted 7 of 7 record(s).`**; then `fly apps restart beltbattles`, health again, and
`list --rules bb-0.11.0` reads `all 192 0 0` (or `all 192 N P`). Rehearsed locally on the built commit
(kit0912/probecheck.sh, O/logs/probecheck-<commit>.txt). **The hand clean-up** is section 30's block run from this clone:
its `cd` names /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0912/BeltBattles-r0912 and both
`../output-stage0911/probe-id.txt` become `../output-stage0912/probe-id.txt`.

**Rollback to v23** (its own L4 every time, after telling the operator; never part of the launch call). Check that the
releases-before file lists v23 first; if not, stop and ask the Prime. If a probe's decks are on the store, run the clean-up
first, while 0.9.12 serves. From this clone:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M56B4514PHZZ17S572CGSMA6
```

v23 is 0.9.11: the page (1,014,964 bytes, sha256 `574b7ba79251aee5…`, V0.9.11, with words on its shop cards) and the server
together, on the same rules **bb-0.11.0**. Its release command re-seeds the same pool and writes nothing (**`0 written, 192
unchanged, 0 removed`**, step d of seed0912.sh; on a JSON-lines store too, because both releases carry the same 192
ghosts). Saves carry both ways (the saved-run bullet above): a run in progress in 0.9.12 continues in 0.9.11. An open 0.9.12
tab keeps its page until it reloads; its matches and uploads use the same rules, so they work against v23. fly.toml is
unchanged, so the image route is safe for the server. Before v23: v22 = 0.9.10 (section 30's rollback, which loses every
player's 0.9.11 run in progress; going back past v23 is a separate decision).

**The checks of this STAGE** (the logs are in the STAGE report, O/STAGE-REPORT.md; none of the checks changes a file).
At r0912-cards (ef923bb1d67c, the merge): tsc and typecheck:server 0 errors, typecheck:tests PASS at 164 (the baseline
file untouched), fp and all 41 parBench lines IDENTICAL, the six new tests/shopcard1*.test.ts with card3, card4 and
keywords.tap: 9 files, 178 tests passed. At 9a145b8 (the label): the label tests (8 passed) and the three builds; the
page smoke (pages099c.sh off and on): **4 of 4 runs offline and 4 of 4 online**, 0 console errors, 0 NOT HONEST, the
title reading 0.9.12, runnercopies all SAME. At the release record bbdf742de012: the gate (tsc 0, typecheck:server 0,
typecheck:tests PASS at 164, **the smoke 45 of 45**, luckcaps **IDENTICAL**, `regenerated 7412 bytes`), fp and parBench
IDENTICAL again, seedcheck.sh 14 of 14 and probecheck.sh 17 of 17 (every `expect:` yes), the seed rehearsal above (a-d:
v23 192/0/0, T 0/192/0 twice, the rollback 0/192/0), server/dist against v23's (**all nine files identical**), the
seed's cost (4 s and a peak RSS of 168,164 kB with the seed pinned to one core, a loaded host; 0.9.11's quiet-host
reading: 3 s and 185,436 kB), and the whole suite **ALL GREEN: 438 files, 5,168 tests passed, 7 opt-in skipped**. The
browser block at the release record: touchcheck noprof 2,215 of 2,215 (no key differs from 0.9.11's log) and mixed 2,107
of 2,107, run in parts (the build-screen sections read 1,152 of 1,153 under a host load of about 30: the one FAIL was
the known wk-phone-land belt-X flake, and its clean re-run, alone, passed 88 of 88; the other ten sections read 955 of
955), card3check 13 of 13, stylecheck 180 of 180, explaincheck 35 of 35, surge 4 of 4, asynccheck 62 of 62, rcruns
offline 32 of 32 and online 44 of 44, mirror PASS, runeshots 103, motiontap 123 of 123, the c1 and p1 stills 0 failed,
the field, scout and LAST CHANCE stills, 311 shots, and a samepixels account against live-0911's frames (130 of the 311
differ, every one in a class of the brief's ruling 23, and every frame of the battle, playback, hero, dusk, run and
summary groups is identical). Report-only: the text sheet at the record commit against r0912-base's (every changed line
is one of the card lane's player-note changes) and motionperf (read on a shared host, so not like for like with
0.9.11's). The stand-in check, the mutants, the Tigris rehearsal, capsearch and the rollback probe are carried from
0.9.11 (their inputs are unchanged: `git diff --name-only r0912-base <tip> -- src/sim tools server src/net src/game` is
empty).

## 32. 0.9.13: rigs that count, POISON and ENDLESS (rules release bb-0.12.0; server and client in one deploy; its own L4)

0.9.12's launch is section 31 (clone beltbattles-r0912, release v24, image
registry.fly.io/beltbattles:deployment-01M57BGVDCKDMKSE1VQ1JX6GEJ, live since 2026-10-18 at about 11:15Z, LIVE-0912). It
ran and must never run again. This section is 0.9.13's launch, from this clone (beltbattles-r0913/BeltBattles-r0913,
branch r0913; write `refs/heads/r0913` or a tag; r0913-base = live-0912 = a2d11e47efc3), staged on 2026-10-19.

0.9.13 is a **rules release** (route B, as 0.9.11 was): the battle rules move to **bb-0.12.0**, so the page and the server
ship together, in **one Fly deploy**, and **never the page alone**: a 0.9.13 page asks for, and uploads under, bb-0.12.0,
and only this release's server holds that pool and validates those uploads (v24 refuses them: a 422 for a run's upload, `rules bb-0.12.0 not accepted: this server validates
bb-0.11.0`; a 400 for an ENDLESS dusk's). It is BUMP-1E,
the hull lane 6c99be48's ride (tag bump1e-accepted fbf13a28eaec; REQ-BFG-059, 117, 098, 108, 110 and 100), merged here by
cap as r0913-bump1e (--no-ff on live-0912, tree df214a4446ad = the ride's) and labelled 0.9.13: **seven new rigs that count
what is on the board** (CINDER MAIL, ROT GAUGE, LEECH COIL, CROWD PRESS, AEGIS SPIKE, GRUDGE ROD, TROPHY CHAIN), **five
pieces reworked to count** (KINDLING, which was QUENCH TANK; PRESSURE BREECH; IRON WALL; SPALL CATCHER; POWDER KEG),
**POISON** back as its own status (VENOM DRIP applies it), SOOTJAW's scatter choke on day 5 (it was day 3), **ENDLESS** after
a won run (CONTINUE ENDLESS or END RUN, 3 fresh hearts, a tracked best score), the save guard (a saved run that names a
piece, rune or hero the build does not know gets one plain line above the title's buttons and a NEW RUN), JsonlStore keeping
the lines it cannot decode, roadCap's warm-up at the server's boot (server/warm.ts) and fresh stand-in and seed pools for the
new rules (docs/CHANGELOG.md's 0.9.13 entry; every claim checked in the code, O/logs/changelog-claims.md). The label moves
0.9.12 -> 0.9.13 (src/version.ts:2, package.json:4, package-lock.json:3 and :9), so the title reads V0.9.13.

**What ships.** Branch r0913 at its tip (tag stage-0913, made when the STAGE ends; the launch text names its 12 hex): r0913-base (live-0912); the
--no-ff merge r0913-bump1e 535d0bcdfd59 of bump1e-accepted (288 files against r0913-base, +17,708 -1,663: src/sim 22,
src/net 8, src/game 14, other src 30, server 8, tools 13, scripts 16, tests 175, docs 2; 65 of them under the protected
paths, by design in a rules release); e842895 (scripts only: rcruns.mjs's version check follows the label); the label and
CHANGELOG commit b2ddc3840a6a; and the release record (deploy/GAME_BUILD.txt and this runbook).
- **The page** is BeltBattles-0.9.13-b2ddc3840a6a-online.html, 1,063,979 bytes, sha256 `74431b5aa7524ce5…` (GAME_BUILD.txt
  holds the whole hash), built at b2ddc38 and staged from ../output-stage0913/pages/. It is 48,297 bytes larger than 0.9.12's
  page (1,015,682). Shore gets the offline page of the same commit: BeltBattles-0.9.13-b2ddc3840a6a.html, 1,063,968 bytes,
  sha256 `c6544b7019211656…` (= ../output-stage0913/shore/index.html).
- **The server changes** (this is why the release is one deploy): server/dist built at this commit is 9 files, 1,491,495
  bytes, against v24's 9 files, 1,431,852 bytes (W/ref/v24-dist, W37's server/dist at the 0.9.12 launch;
  kit0913/srvdiff.sh, O/logs/srvdiff-<commit>.txt). **Eight of the nine differ**: ghost-server.mjs (2,078 -> 3,106 bytes: the
  warm-up at boot), ghost-admin.mjs (16,562 -> 16,926), gen-ghost-pool.mjs (312,574 -> 337,657), ghost-probe.mjs (27,461 ->
  29,782: the 16th row, scale-signed) and the config (66,977 -> 67,938), seed (393,727 -> 396,860: the bb-0.12.0 pool),
  validate (303,369 -> 308,928) and heroBuilds (302,305 -> 323,499) chunks; only the identity chunk is identical. The reasons are the ride's
  eight server files (app.ts, ghostAdmin.ts, ghostProbe.ts, main.ts, seedPoolData.ts, store.ts, tigrisStore.ts, warm.ts) and
  the sim and net code they bundle (the seven rigs, POISON, ENDLESS's fields and checks). fly.toml, the Dockerfile,
  .dockerignore and deploy/stage.mjs have no change since r0913-base. Uploads stay open.
- **The rules** are bb-0.12.0 and no literal moved after the merge: RULES_VERSION (src/sim/content.ts:53), PROBE_RULES
  (server/ghostProbe.ts:98), SCALE_RULES (src/net/rulesGate.ts:427) and ENDLESS_RULES (:477), SEED_POOL_RULES
  (server/seedPoolData.ts:8; server/seed.ts:92 refuses a pool dealt under other rules); LONG_RUN_RULES (:408) and
  SHAPES2_RULES (:276) stay bb-0.11.0; HEARTS_RULES (:348), PICK_RULES (:368), OPEN_RUNES_RULES (:392), FREE_JOINS_RULES
  (:220), SHAPES_RULES (:236) and NPC_DAY_RULES (:204) stay bb-0.10.0 and LAST_CHANCE_RULES (:188) bb-0.9.7; FIRST_RUN
  stays false (src/sim/firstRun.ts:35). The switches SCALE_RIGS (src/sim/scale.ts:33) and ENDLESS (src/sim/endless.ts:27)
  are on beside LONG_RUN, PLAIN_RIGS, SHAPES2, HEARTS and SHAPES; STAND_IN_POOL_DAYS is 16 (src/sim/standInPool.ts:87). A
  0.9.13 page asks for, and uploads under, bb-0.12.0; a 0.9.11 or 0.9.12 page asks for bb-0.11.0. The match route serves the bucket of the rules a request
  names and an upload under other rules is refused (422 `rules bb-0.11.0 not accepted: this server validates bb-0.12.0`,
  server/app.ts:345-346), so **a player of 0.9.13 meets only bb-0.12.0 ghosts**, except the one foe that a run saved by
  0.9.12 had already drawn for its day. The fingerprint (859,252 bytes, sha16 `d5e79f68116a48a8`; 352 decks, 1,056 battles,
  digest d7fa56f4) and all 41 parBench lines (`fingerprint all: a6922535`) are IDENTICAL to the hull lane's pins at the merge.
- **A saved run, from the code** (O/logs/s2-save.txt has the lines). The save's key (`beltbattles.run.v7`,
  src/game/save.ts:39) and RUN_VERSION (8, src/game/run.ts:213) are unchanged; the ride adds only optional fields (the endless
  mark, run.ts:199, set by newRun alone, :238-239; the endless state, :204). (a) **A run saved by 0.9.12 loads in 0.9.13**: it
  names no id that 0.9.13 does not know (no piece, rune or hero was removed; QUENCH TANK keeps its id), so the save guard
  (src/game/saveGuard.ts:70-86) does not trip, no aside line, CONTINUE works and the run goes on under bb-0.12.0 with the
  reworked numbers; it carries no endless mark, so when it is won it ends there (NEW RUN and TITLE) and is **not** offered
  ENDLESS (src/sim/endless.ts:113-114; src/screens/summary.ts:273-275). (b) **A 0.9.13 save on 0.9.12 (v24, the rollback)**
  has no guard to meet: 0.9.12 has no saveGuard.ts (the E.2 class, accepted for 0.9.11). **Read in a browser** by the STAGE's
  rollback probe (kit0913/rbprobe; 0.9.13's page and 0.9.12's page, each with a save that holds a GRUDGE ROD, one in ENDLESS on day
  15 and a won run kept for its RUN WON offer; O/browser/rbprobe-*.log and their stills): 0.9.13's page loads all three with no
  error. On 0.9.12's page a save that names **one of the seven new rigs** (in its build, its inventory or its shop stock) breaks
  CONTINUE: a GRUDGE ROD in the build leaves the title as it was (a dead CONTINUE; page error `unknown item grudgerod`); a new rig
  only in the shop stock opens a build screen that draws nothing (a black screen; page error `Cannot read properties of undefined
  (reading 'price')`). A reload brings the title back, the save stays (a won run's is cleared by that load) and **NEW RUN always
  works** and replaces it; no title fails to draw, no console error loop. A save that names **no new rig** loads on 0.9.12 as an
  ordinary run: one in ENDLESS opens its build screen on its day with the day's rune pick and plays on as a run past day 10 with
  its hearts; a won run kept for its offer opens its build screen on the day it was won (no RUN WON offer: 0.9.12 clears that
  save). From 0.9.13 on the save guard makes this rollback graceful (the aside line, the save untouched); a rollback from
  0.9.13 to 0.9.12 can leave a player who held a new rig with a dead or black CONTINUE until NEW RUN: a finding, not a blocker.

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store holding bb-0.11.0's 192 pool ghosts
(days 1-16, 12 a day) and the uploads made under it, and nothing under bb-0.12.0; this commit's bundle carries the new pool
(server/seedPoolData.ts is 395,125 bytes, sha16 `3034060c68d6fad0`, 192 ghosts, SEED_POOL_RULES bb-0.12.0; v24's is 391,992
bytes): `seed: rules bb-0.12.0, 192 pool ghosts on tigris (...)` with **`192 written, 0 unchanged, 0 removed`**, and on every
later deploy of the same image `0 written, 192 unchanged, 0 removed` (the release command runs at each `fly deploy`). **bb-0.11.0's 192 pool ghosts and every upload under it
are left as they are**: the Tigris seed lists and writes only `ghosts/bb-0.12.0/dNN/pool/`. Rehearsed on this commit's real
CLI and v24's (kit0913/seed0913.sh, O/logs/seed0913-<commit>.log; a scratch JSON-lines store): (a) v24's seed on a fresh store
`192 written, 0 unchanged, 0 removed` (bb-0.11.0); (b) **this commit's seed over it `192 written, 0 unchanged, 0 removed`**
(bb-0.12.0), bb-0.11.0's lines in pool.jsonl byte for byte as they were and `ghost-admin list --rules bb-0.11.0` still
`all 192 0 0`; (c) again **`0 written, 192 unchanged, 0 removed`**, pool.jsonl byte-identical; (d) `list --rules bb-0.12.0` reads `all 192 0 0` and revalidate's dry run
`plan: delete 0 record(s) of bb-0.12.0; keep 192 seed-pool ghost(s) and 0 upload(s)`; (e) **the rollback**, v24's seed over
that store, **`0 written, 192 unchanged, 0 removed`** (bb-0.11.0), pool.jsonl byte-identical, bb-0.12.0's 192 still listed.
On the Tigris path (kit0913/tigris-rollback.sh, the real CLIs against tools/fakeS3.ts; O/logs/tigris-rollback-<commit>.log)
the same five steps pass with every object byte for byte (hashes in the log) and no DELETE request. The seed plays no
battle. Its cost, one process under nice 19 at a loaded host (load 30): **9.1 s wall, a peak RSS of 186,192 kB**
(seed0913-<commit>.log; the merge commit's run read 7.5 s and 178,624 kB), and pinned to one core (kit0913/seedtime.sh, load 33)
**11 s and 187,424 kB**. fly.toml's [[vm]] is 256 MB; 0.9.12's seed took 4 s and 168,164 kB, 0.9.11's 3 s and 185,436 kB
(both on one pinned core).

**The boot.** The server now warms roadCap's memo once the port is open and uploads are open (server/main.ts:47-48,
server/warm.ts): the first deep upload no longer pays about 5 seconds. Started the way the Dockerfile and fly.toml start it
(`node dist/ghost-server.mjs`, fly.toml's [env], a seeded scratch store, one core, nice 19; kit0913/boot0913.sh,
O/logs/boot-<commit>.log; load 35): the first `/v1/health` 200 came **1,119 ms** after the process start (fly.toml's health check has a
10 s grace period, 30 s interval, 5 s timeout), the log line **`road model warmed for days 1-25 under rules bb-0.12.0 in 2988 ms`** at 3.3 s
(a restart on the same store: 3,576 ms of work), and the process held **101,200 kB RSS after the warm-up, a peak of 110,280 kB**
(second boot: peak 109,884 kB) against the 256 MB VM (the merge commit's boot-535d0bc.log, load 27, read 645 ms, 2,570 ms at 2.8 s, 1,510 ms,
100,188 kB and peaks of 103,072 kB and 111,264 kB). The warm-up yields between days, so a health check or a request is never held for more than
a day's work. This host was loaded and is not Fly's shared core: read the times as one sample under load, not as a floor. The machine stops when
idle (`auto_stop_machines` in fly.toml), so the warm-up runs again at every cold start. **After the deploy and after a restart, look for that line** in
`fly logs -a beltbattles --no-tail`.

**The launch call is the Prime's** (CMD-0913, from CMD-0912's text; run once, under its own operator approval, L4). Fly
serves 0.9.12's page now (v24), so the guards are: refuse unless Fly serves the 0.9.12 page, byte for byte
(`content-length: 1015682`, sha256 `9911a69fc4d826ca…`), and /v1/health reads `"rules":"bb-0.11.0"`, and `fly releases -a beltbattles --image` lists v24 first (keep it as releases-before.txt: the
rollback needs it); then stage the 0.9.13
page, deploy once (`fly deploy --ha=false --remote-only`: the image carries the new server/dist and the new page), and run
section 5's live checks with this page: health `"rules":"bb-0.12.0"` and `"uploads":"open"`, `content-length: 1063979`,
`live page = the staged 0.9.13 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`),
day 3 at 1 win and 9 hearts (a v3 bb-0.12.0 snapshot), days 17 and 25 `-> 200` (a ghost of day 16) and day 26 `-> 400`, an unsigned
POST `-> 401`, and `list --rules bb-0.12.0`: sixteen day rows of 12, then `all 192 0 0` (`list --rules bb-0.11.0` still reads
`all 192 N P`; and `all 192 N P` for bb-0.12.0 too, if real players uploaded since the deploy). Section 5's one-line call asks only days 1-16
and day 3: add `day=17`, `day=25` and `day=26` queries to see those three lines. In `fly logs -a beltbattles --no-tail`: the `seed:` line above and the warm-up line. The page's own label (V0.9.13 on the title) tells the
two pages apart in a browser.

**The probe block** is section 27's, with the new numbers (the probe-id file is ../output-stage0913/probe-id.txt, which must
not exist yet): `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage0913/probe-id.txt` prints **19
lines** (the header, 16 checks, `probe player:` and the summary), ending **`probe: 16 of 16 checks as expected; the server stored 8
deck(s) for this player (expected 8); the player id is in ../output-stage0913/probe-id.txt`** (the new row is `scale-signed 201`: a deck with a
GRUDGE ROD; with `--profile` after the id file, two PUTs more and **`18 of 18`**); revalidate's dry run `plan: delete 0
record(s) of bb-0.12.0; keep 192 seed-pool ghost(s) and 8 upload(s)` (the probe's 8, plus any real player's upload since the deploy); `remove-player <id> --rules bb-0.12.0 --apply`
prints **`APPLIED: deleted 8 of 8 record(s).`**; then `fly apps restart beltbattles`, health again, and `list --rules
bb-0.12.0` reads `all 192 0 0`. Rehearsed locally on the built commit (kit0913/probecheck.sh, O/logs/probecheck-<commit>.txt:
18 `expect:` lines, all yes). **The hand clean-up** is section 30's block run from this clone, with at most 8 decks: its `cd` names
/home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0913/BeltBattles-r0913, both `../output-stage0911/probe-id.txt` become
`../output-stage0913/probe-id.txt`, and both `--rules bb-0.11.0` become `--rules bb-0.12.0`.
**The four ENDLESS rows** (a kit tool, never part of the repo: kit0913/endlessprobe.mjs, built from tests/endless1.server.test.ts's
rows and the game's own honest endless run, signed as ghost-probe signs): `node endlessprobe.mjs https://beltbattles.fly.dev
../output-stage0913/endless-probe-id.txt` prints one line each for (1) an honest endless dusk (day 14, victory day 10) -> 201,
(2) the same dusk with 30 endless wins -> 400 `snapshot.endlessWins`, (3) a record no endless leads to -> 422 `record: ...`, (4) a
`mode=endless` match request -> 200, then **`endless probe: 4 of 4 checks as expected`** and the clean-up line it prints (its local form). On Fly run `fly ssh console -a beltbattles -C "node /app/dist/ghost-admin.mjs
remove-player $(cat ../output-stage0913/endless-probe-id.txt) --rules bb-0.12.0 --apply"` (it prints `APPLIED: deleted 1 of 1 record(s).`;
the probe's record is a day-14 one, which remove-player finds on either store), then `fly apps restart beltbattles` (the server keeps
deleted ghosts until a restart) and `list --rules bb-0.12.0` reads `all 192 0 0` again. Run the ENDLESS rows after the first probe's clean-up
and restart, with their own id file.
Rehearsed locally (kit0913/endlessprobe-local.sh, O/logs/endlessprobe-<commit>.log: 4 of 4, deleted 1 of 1, `all 192 0 0`).

**Revalidate** (packet item 9 (a), finding F1): after the deploy run `fly ssh console -a beltbattles -C 'node
/app/dist/ghost-admin.mjs revalidate --rules bb-0.12.0'` (a dry run; add `--apply` only if it plans deletes you expect) **over
the stored bb-0.12.0 records only, in a fresh process** (each `fly ssh console -C` is one): validating a record older than
bb-0.10.0 in the same process restores QUENCH TANK over KINDLING for the rest of that process (finding F1, src/net/validate.ts
nesting; the fix is owed to bb-0.13.0). The dry run prints `plan: delete 0 record(s) of bb-0.12.0; keep 192 seed-pool ghost(s) and N upload(s)` and
`DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.`

**ENDLESS online.** Endless is on in the game (src/sim/endless.ts:27). The client goes online for an endless dusk only up to
day 25 (ENDLESS_ONLINE_LAST_DAY = LONG_RUN_MAX_DAY, src/sim/endless.ts:156); past day 25 the foe is THE GOD, the day's strongest
stand-in deck, with no request. Endless wins earn only a tracked best score (BEST n, kept on the player's device and never
lowered: src/game/profile.ts); nothing is sent to the server for it.

**Rollback to v24** (its own L4 every time, after telling the operator; never part of the launch call). Check that the
releases-before file lists v24 first; if not, stop and ask the Prime. If a probe's decks are on the store, run the
clean-up first, while 0.9.13 serves. From this clone:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M57BGVDCKDMKSE1VQ1JX6GEJ
```

v24 is 0.9.12: the page (1,015,682 bytes, sha256 `9911a69fc4d826ca…`, V0.9.12) and the server together, on bb-0.11.0 on both
sides: the live bb-0.11.0 decks never meet bb-0.12.0 players again. Its release command (`seed`) re-seeds bb-0.11.0's
pool: **`0 written, 192 unchanged, 0 removed`**, and leaves bb-0.12.0's decks and uploads in the bucket under their own prefix
(rehearsed on both stores with the 192 pool ghosts: the 0.9.11 finding, where v22's JSON-lines store dropped the lines it could not
decode, does not recur for them, v24's store keeps them; v24's JSON-lines seed would still drop an ENDLESS dusk's upload, which its
decoder refuses; on Tigris, the real store, nothing is removed). An **open 0.9.13 tab** keeps its page until it reloads; asked for
bb-0.12.0 ghosts, v24's server **serves them** (its match route serves the bucket of the rules a request names; tigris-rollback step f),
but refuses that tab's uploads (a 422 for a run's, a 400 for an ENDLESS dusk's; read from v24's code, not rehearsed: step f sends only an
unsigned POST, 401). A run
saved in 0.9.13 may not carry on there (item (b) above, read in a browser): CONTINUE is dead or black if the save names a new
rig, an ordinary run if it does not; NEW RUN always works. Rolling back loses nothing on the server.

tests/tsc-tests-baseline.json is the ride's (5242b7c lowered it from 164 to 163 type errors); the release lane did not touch it (sha16
`216977d9b4bd72fe`).

**The checks of this STAGE** (STAGE-0913; O/STAGE-REPORT.md has every command, log and number; this paragraph is brought up
to date by the closing docs commit): step 0 (scope: the sorted name-status diff equals the packet's difflist, 288 files; 65
protected paths); step 2 (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, fp and 41 parBench lines IDENTICAL); the
label tests (8 passed); the seed rehearsal (8 PASS, 0 FAIL); the Tigris rehearsal (five steps PASS); seedcheck (14 of 14
`expect:` yes) and probecheck (18 `expect:` lines, all yes); the ENDLESS probe 4 of 4; the gate (smoke 45 PASS, luckcaps IDENTICAL);
gen:ghosts IDENTICAL (server/seedPoolData.ts 395,125 bytes `3034060c68d6fad0`); mutants `--check` 38 of 38 apply; **the stand-in
check (step S): all 32 hero-days saved and `check: IDENTICAL` (99,507 bytes regenerated, 4,361,088 battles; it carries to T and to the
tip, since no file of closure-gens.txt changes after r0913-bump1e)**; **the browser block on the tip (T's page and server)**: the page
smoke offline and online 4 of 4 each (0 console errors, 0 NOT HONEST), touch noprof 2,323 of 2,323 (0.9.12: 2,215; +108 are the ENDLESS
summary rows), card3check 13 of 13, stylecheck 180 of 180, explaincheck 35 of 35, surge 4 of 4, asynccheck 62 of 62, rcruns off 32 of 32
and on 44 of 44, the mirror, runeshots 103, 311 shots (126 differ from 0.9.12's, every one in a class the release names), motion taps
123 of 123, the stills (c1: one accepted tap-target overlap of POWDER KEG's badge on the phone; p1: 0), the field and scout stills, the
LAST CHANCE shots and the rollback probe (item (b) above). **The suite at T is ALL GREEN: 472 test files, 5,684 tests = 5,675 passed + 9 skipped** (the hull lane's 469 files match file by
file, 5,646 passed + 9 skipped; runes.parity, harness.v2 and heroes.playable, which its suite ran apart, add 29 tests): the four
nice-19 shards were cut by their timeouts on a loaded host, and the 11 files that had failed on time alone passed in file-by-file
re-runs at nice 10 (the last, standInPool.gen, alone: 12 of 12, its 600 s par test by half a second); **touch mixed 2,215 of 2,215
distinct checks, 0 FAIL** (0.9.12: 2,107; +108 are the ENDLESS summary rows); **the LOOKS** (82 shots: the RUN WON offer, the
endless HUD, ENDLESS OVER with BEST, YOUR RUNES, HOW TO PLAY at four sizes, the new rigs' shop and panels, KINDLING, a POISON
dusk, the save guard's aside line and SOOTJAW's day 5) show no clipped or overlapping text and no word on a shop card, except one
row of YOUR RUNES' list on a phone (FORGE WARD's second line), which 0.9.12 cuts the same way; **the mutants: 37 of 37 current
mutants caught (38 in the list: CM2b survives by design, its anchor `bb-0.9` being older than every label the tests upload under,
and CM2c and CM2d re-anchor it; the exact rules check is pinned by CM2, CM2c and CM2d)**. The report has every number and log.

## 33. 0.9.14: gates and enchantments (rules release bb-0.13.0; server and client in one deploy; its own L4)

0.9.13's launch is section 32 (clone beltbattles-r0913, release v25, image
registry.fly.io/beltbattles:deployment-01M5CHZNH6RKGMJNTE0GD0TJM9, live since 2026-10-20 at about 11:44Z, LIVE-0913). It
ran and must never run again. This section is 0.9.14's launch, from this clone (beltbattles-r0914/BeltBattles-r0914,
branch r0914; write `refs/heads/r0914` or a tag; r0914-base = live-0913 = 4ff77b0aa3c2), staged on 2026-10-20.

0.9.14 is a **rules release** (route B, as 0.9.11 and 0.9.13 were): the battle rules move to **bb-0.13.0**, so the page and the server
ship together, in **one Fly deploy**, and **never the page alone**: a 0.9.14 page asks for, and uploads under, bb-0.13.0,
and only this release's server holds that pool and validates those uploads (v25 refuses them: a 422 for a run's upload,
`rules bb-0.13.0 not accepted: this server validates bb-0.12.0`). The server must also know the gate ids and the word codes:
the probe's row 17 (`gates-signed`) answers 201 only on a server of this build. It is BUMP-1F,
the hull lane 6c99be48's ride (tag bump1f-accepted 77504c8266e2, tag object 72d35ca48852; REQ-BFG-085, 052 and 057), merged here by
cap as r0914-bump1f (--no-ff on live-0913, tree 6937de815e26 = the ride's) and labelled 0.9.14: **three gates, the converters FUSER,
SCATTER MILL and SMELTER**, that stand on a belt tile and split the belt around them (GATES, src/sim/gates.ts:31), **eight
enchantments** that the ENCHANTER sells on odd days from day 3, that two warlord wins and the ASH SHRINE give, and that rival captains
carry from day 5 (ENCHANT with ENCHANT-2 and ENCHANT-2W, src/sim/enchant.ts:28), **POISON at 2 a second** (was 3), a softer field (SOFT_TARGET 150, was 250),
**THE GOD's hull step 1500** in ENDLESS (was 250), the probe's four ENDLESS rows (now rows 18-21 of server/ghostProbe.ts), F1's ITEMS-order guard,
and fresh stand-in and seed pools for the new rules (docs/CHANGELOG.md's 0.9.14 entry: 18 bullets and one closing sentence; the hull lane
proved them file:line in W/ref/bump1f/changelog-cites.md and the STAGE re-read the cites at the tip, O/STAGE-REPORT.md). EFFECT_FLOOR is not in it. The label moves
0.9.13 -> 0.9.14 (src/version.ts:2, package.json:4, package-lock.json:3 and :9), so the title reads V0.9.14.

**What ships.** Branch r0914 at its tip (tag stage-0914, made when the STAGE ends; the launch text names its 12 hex): r0914-base (live-0913);
the --no-ff merge r0914-bump1f 943069a84df6 of bump1f-accepted (319 files against r0914-base, +27,628 -1,732: src/sim 39,
src/net 6, src/game 14, other src 35, server 3, tools 22, scripts 1, tests 197, docs 1, vite.config.ts 1 (its test block only: the setupFiles line for F1's guard); 84 of them under the protected
paths, by design in a rules release); 721dde9c (scripts only: rcruns.mjs's version check follows the label); the label and
CHANGELOG commit e894e6d8415d; and the release record (deploy/GAME_BUILD.txt and this runbook).
- **The page** is BeltBattles-0.9.14-e894e6d8415d-online.html, 1,150,336 bytes, sha256 `7775384bd060eb9c…` (GAME_BUILD.txt
  holds the whole hash), built at e894e6d and staged from ../output-stage0914/pages/. It is 86,357 bytes larger than 0.9.13's
  page (1,063,979). Shore gets the offline page of the same commit: BeltBattles-0.9.14-e894e6d8415d.html, 1,150,325 bytes,
  sha256 `4bdce9984295a523…` (= ../output-stage0914/shore/index.html).
- **The server changes** (this is why the release is one deploy): server/dist built at this commit is 9 files, 1,704,956
  bytes, against v25's 9 files, 1,491,495 bytes (W/ref/v25-dist, the server/dist baked into Fly v25 at the 0.9.13 launch;
  kit0914/srvdiff.sh, O/logs/srvdiff-<commit>.txt). **Eight of the nine differ or are gone**: ghost-server.mjs (3,106 -> 3,206 bytes),
  ghost-admin.mjs (16,926 -> 16,935), gen-ghost-pool.mjs (337,657 -> 393,926), ghost-probe.mjs (29,782 -> 39,987: rows 17-21,
  gates-signed and the four ENDLESS rows) and the config (67,938 -> 67,953), seed (396,860 -> 402,124: the bb-0.13.0 pool) and
  validate (308,928 -> 316,279) chunks; the heroBuilds chunk (323,499) is gone and an enchantSources chunk (457,747) carries
  the shared sim code in its place; only the identity chunk is identical. The reasons are the ride's three server files (ghostProbe.ts,
  seedPoolData.ts, warm.ts) and the sim and net code they bundle (the gates, the enchantments and their checks). fly.toml, the Dockerfile,
  .dockerignore and deploy/stage.mjs have no change since r0914-base. Uploads stay open.
- **The rules** are bb-0.13.0 and no literal moved after the merge: RULES_VERSION (src/sim/content.ts:57), GATES_RULES
  (src/net/rulesGate.ts:318), ENCHANT_RULES (:360), PROBE_RULES (server/ghostProbe.ts:120), SEED_POOL_RULES
  (server/seedPoolData.ts:8; server/seed.ts:92 refuses a pool dealt under other rules); SCALE_RULES (:512) and ENDLESS_RULES
  (:562) stay bb-0.12.0; LONG_RUN_RULES (:493) and SHAPES2_RULES (:278) stay bb-0.11.0; HEARTS_RULES (:433), PICK_RULES (:453),
  OPEN_RUNES_RULES (:477), FREE_JOINS_RULES (:222), SHAPES_RULES (:238) and NPC_DAY_RULES (:206) stay bb-0.10.0 and
  LAST_CHANCE_RULES (:190) bb-0.9.7; FIRST_RUN stays false (src/sim/firstRun.ts:35); POOL_RULES_CARRIED is empty
  (src/sim/content.ts:67), so POOL_RULES = RULES_VERSION. The switches GATES (src/sim/gates.ts:31), ENCHANT (src/sim/enchant.ts:28),
  SCALE_RIGS (src/sim/scale.ts:34) and ENDLESS (src/sim/endless.ts:27) are on beside LONG_RUN, PLAIN_RIGS, SHAPES2, HEARTS
  and SHAPES; POISON_DPS is 2 (src/sim/content.ts:104), ENDLESS_GOD_HULL_STEP 1500 (src/sim/endless.ts:162), SOFT_TARGET 150
  (tools/samplePool.ts:344) and STAND_IN_POOL_DAYS 16 (src/sim/standInPool.ts:88). A 0.9.14 page asks for, and uploads under,
  bb-0.13.0; a 0.9.13 page asks for bb-0.12.0. The match route serves the bucket of the rules a request
  names and an upload under other rules is refused (422 `rules bb-0.12.0 not accepted: this server validates bb-0.13.0`,
  server/app.ts:345-346), so **a player of 0.9.14 meets only bb-0.13.0 ghosts**, except the one foe that a run saved by
  0.9.13 had already drawn for its day. The fingerprint (855,629 bytes, sha16 `18d8eda4f890e17a`; 352 decks, 1,056 battles,
  digest fe740b10) and all 41 parBench lines (`fingerprint all: fb18252c`) are IDENTICAL to the hull lane's pins at the merge.
- **A saved run, from the code** (O/logs/s2-save.txt has the lines). The save's key (`beltbattles.run.v7`,
  src/game/save.ts:39), RUN_VERSION (8, src/game/run.ts:244) and the save guard (src/game/saveGuard.ts) are unchanged; the ride
  adds only optional fields (a cargo piece's `ench`, `enchDir` and `grow`, run.ts:53-58; the ENCHANTER's wagon in the shop,
  run.ts:90; the open enchantment picks `enchMerge`, `enchPick`, `enchPicks` and `enchShrine`, run.ts:237-243). (a) **A run saved by 0.9.13 loads in 0.9.14**: it names
  no piece, rune or hero that 0.9.14 does not know (the ride removes no id), so the save guard (src/game/saveGuard.ts:70-86) does not trip,
  no aside line, CONTINUE works and the run goes on under bb-0.13.0 (the sim reads the code's rules, not the save's): POISON takes 2 a second, the
  gates (from day 2, never day 1: src/game/run.ts:534-535, src/game/wares.ts:45) and the ENCHANTER's wagon (odd days from 3:
  run.ts:653, src/game/enchanter.ts:37-47) can appear in its next shop roll, a dawn or a REROLL (run.ts:688-694); it keeps the one foe it
  had already drawn for its day (src/game/day.ts:78, src/game/online.ts:213), meets bb-0.13.0 ghosts only from its next day on, and
  uploads under bb-0.13.0; a saved ENDLESS run meets THE GOD's step 1500 from its next endless dusk (intended, packet limitation 5); a run
  that carries the endless mark keeps being offered ENDLESS when it is won, one that does not (a run started before 0.9.13) ends there.
  (b) **A 0.9.14 save on 0.9.13 (v25, the rollback)**: 0.9.13 has the save guard, which names any hero, piece or rune of the stored run
  that its build does not know (hero, enemyHero, build.items/mods/turrets, inventory, shop.wagons[].offers, build.runes): **a save that names a gate
  is set aside** with the aside line (`THE SAVED RUN NEEDS A NEWER VERSION OF THE GAME. START A NEW RUN.`), no CONTINUE, the save left
  in storage untouched, NEW RUN replaces it. The run's wares hold all three gates from day 2 on (src/game/wares.ts:45 and :189-195 holdGates,
  src/sim/gates.ts:74 minStock 3), but a day's caravan shows only the offers its draw picks: **a 0.9.14 save names a gate when one is on the deck, in cargo or among that
  day's offers, so whether a given save from day 2 on meets the aside line on 0.9.13 is the day's draw, not every save**;
  a save without a gate loads as an ordinary run (an enchantment is an unknown optional field, ignored; the word does nothing on 0.9.13), and one in ENDLESS plays on with its hearts.
  **Read in a browser** by the STAGE's rollback probe (kit0914/rbprobe/rbprobe.sh; six saves written by 0.9.14's own code, each opened on 0.9.14's page as the control and on 0.9.13's page; O/browser/rbprobe-*.log and their stills;
  0 console errors in all 12 runs): the control loads and CONTINUEs every save. **On 0.9.13's page a save with a FUSER on its deck, with a FUSER only among the caravan's offers, or an ENDLESS run whose caravan holds a gate**
  shows the title's aside line (THE SAVED RUN NEEDS A NEWER VERSION OF THE GAME. START A NEW RUN.) and no CONTINUE; the save stays in storage untouched, and NEW RUN works. **A save with a word on a deck part and no gate,
  an ENDLESS run with no gate in its caravan, and a won run kept for its RUN WON offer** load there: CONTINUE works (the day-12 build screen; the day-15 endless run with its 3 endless wins; the summary) and so does NEW RUN.
  One side effect: 0.9.13's CONTINUE saves such a run again without its `wares` map (its migrateRun drops a map that names the gates, which it does not know: src/game/save.ts:300-302; with the three gate ids taken out by hand it kept
  all 64 entries), and a run opened again in 0.9.14 after that has no wares, so every module is on sale for it (src/game/wares.ts:202): rolling back and forward again within one run changes that run's shops. Nothing is lost on the server.

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store holding bb-0.12.0's 192 pool ghosts
(days 1-16, 12 a day) and the uploads made under it, and nothing under bb-0.13.0; this commit's bundle carries the new pool
(server/seedPoolData.ts is 400,383 bytes, sha16 `6867350cda7d6a69`, 192 ghosts, SEED_POOL_RULES bb-0.13.0; v25's is 395,125
bytes, +1.3%): `seed: rules bb-0.13.0, 192 pool ghosts on tigris (...)` with **`192 written, 0 unchanged, 0 removed`**, and on every
later deploy of the same image `0 written, 192 unchanged, 0 removed` (the release command runs at each `fly deploy`). **bb-0.12.0's 192 pool ghosts and every upload under it
are left as they are**: the Tigris seed lists and writes only `ghosts/bb-0.13.0/dNN/pool/`. Rehearsed on this commit's real
CLI and v25's (kit0914/seed0914.sh, O/logs/seed0914-<commit>.log; a scratch JSON-lines store): (a) v25's seed on a fresh store
`192 written, 0 unchanged, 0 removed` (bb-0.12.0); (b) **this commit's seed over it `192 written, 0 unchanged, 0 removed`**
(bb-0.13.0), bb-0.12.0's lines in pool.jsonl byte for byte as they were and `ghost-admin list --rules bb-0.12.0` still
`all 192 0 0`; (c) again **`0 written, 192 unchanged, 0 removed`**, pool.jsonl byte-identical; (d) `list --rules bb-0.13.0` reads `all 192 0 0` and revalidate's dry run
`plan: delete 0 record(s) of bb-0.13.0; keep 192 seed-pool ghost(s) and 0 upload(s)`; (e) **the rollback**, v25's seed over
that store, **`0 written, 192 unchanged, 0 removed`** (bb-0.12.0), pool.jsonl byte-identical, bb-0.13.0's 192 still listed.
On the Tigris path (kit0914/tigris-rollback.sh, the real CLIs against tools/fakeS3.ts; O/logs/tigris-rollback-<commit>.log)
the same five steps are rehearsed with every object byte for byte (hashes in the log) and no DELETE request. The seed plays no
battle. Its cost at the STAGE's rehearsal: **12.9 s and a peak RSS (VmHWM) of 240,488 kB** for the launch seed over the old pool (seed0914 step b: nice 10,
one process, load 5.6), and **16 s and 260,336 kB on one pinned core** (kit0914/seedtime.sh: taskset -c 5, nice 19, a fresh store;
O/logs/seedtime-<commit>.log). fly.toml's [[vm]] is 256 MB (262,144 kB) and the release command runs on a throwaway machine of that size, so
**the seed is the launch's heaviest step: 92% and 99% of the VM's memory by those two reads**, against 0.9.13's 11 s and 187,424 kB on one
pinned core (71%; 9.1 s and 186,192 kB at a loaded host) and 0.9.12's 4 s and 168,164 kB. The reads were taken on a 30 GB host, which sets node's heap
limits; none was taken on a 256 MB machine. With node held to the limits of a small machine (kit0914/seedmem.sh, one core, nice 10, O/logs/seedmem-T.log) the same seed still completes,
exit 0, at 200,956, 208,084, 207,576 and 199,748 kB under `--max-old-space-size` 128, 96, 64 and 48, and at 173,344 and 168,728 kB with a small young generation too
(`--max-semi-space-size` 4 and 2): 64-79% of the VM. A release command killed for memory fails the deploy and replaces nothing (section 4).

**The boot.** The server warms roadCap's memo once the port is open and uploads are open (server/main.ts:47-48,
server/warm.ts; the ride changed warm.ts): the first deep upload does not pay about 5 seconds. After the deploy and after a restart, **look for the
line `road model warmed for days 1-25 under rules bb-0.13.0 in <ms> ms`** in `fly logs -a beltbattles --no-tail` (0.9.13's was 2,988 ms
of work at 3.3 s after the process start, 101,200 kB RSS after it, a peak of 110,280 kB; fly.toml's health check has a 10 s grace period, 30 s interval, 5 s timeout, and the VM is 256 MB).
The warm-up yields between days, so a health check or a request is never held for more than a day's work. The machine stops when
idle (`auto_stop_machines` in fly.toml), so the warm-up runs again at every cold start. This host is not Fly's shared core: read the times as one sample.
**Rehearsed on this commit** (kit0914/boot0914.sh: this commit's server/dist/ghost-server.mjs started the way the Dockerfile and fly.toml start it, on a scratch store
after the release command's seed; taskset -c 5, nice 10; O/logs/boot-<commit>.log): boot 1 answered its **first /v1/health 200 at 523 ms**
after the process start (RSS 82,624 kB), printed the **warm-up line at 1,805 ms**, `road model warmed for days 1-25 under rules bb-0.13.0 in 1609 ms`, and held 126,596 kB after it
with a peak of 134,676 kB (VmHWM: 51% of the 256 MB VM); boot 2, a restart on the same store, 508 ms, 1,738 ms (`in 1571 ms`), 132,596 kB and a peak of 132,596 kB.
Both are far inside fly.toml's 10 s grace period and the 256 MB VM (0.9.13's rehearsal, at a loaded host: first health 1.1 s, warm-up line 3.3 s, 101 MB, a peak of 110 MB).

**The launch call is the Prime's** (CMD-0914, from CMD-0913's text; run once, under its own operator approval, L4). Fly
serves 0.9.13's page now (v25), so the guards are: refuse unless Fly serves the 0.9.13 page, byte for byte
(`content-length: 1063979`, sha256 `74431b5aa7524ce5…`), and /v1/health reads `"rules":"bb-0.12.0"`, and `fly releases -a beltbattles --image` lists v25 first (keep it as releases-before.txt: the
rollback needs it); then stage the 0.9.14
page, deploy once (`fly deploy --ha=false --remote-only`: the image carries the new server/dist and the new page), and run
section 5's live checks with this page: health `"rules":"bb-0.13.0"` and `"uploads":"open"`, `content-length: 1150336`,
`live page = the staged 0.9.14 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`),
day 3 at 1 win and 9 hearts (a v3 bb-0.13.0 snapshot), days 17, 25 and 26 as the STAGE's seedcheck read them at this tip (days 17 and 25 `-> 200`, each served a day-16 ghost; day 26 `-> 400`, `day: expected an integer in 1..25`), an unsigned
POST `-> 401`, and `list --rules bb-0.13.0`: sixteen day rows of 12, then `all 192 0 0` (`list --rules bb-0.12.0` still reads
`all 192 N P`; and `all 192 N P` for bb-0.13.0 too, if real players uploaded since the deploy). Section 5's one-line call asks only days 1-16
and day 3: add `day=17`, `day=25` and `day=26` queries to see those three lines. In `fly logs -a beltbattles --no-tail`: the `seed:` line above and the warm-up line. The page's own label (V0.9.14 on the title) tells the
two pages apart in a browser.

**The probe block** is section 27's, with the new numbers (the probe-id file is ../output-stage0914/probe-id.txt, which must
not exist yet): `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage0914/probe-id.txt` prints **24
lines** (the header, 21 checks, `probe player:` and the summary), ending **`probe: 21 of 21 checks as expected; the server stored 10
deck(s) for this player (expected 10); the player id is in ../output-stage0914/probe-id.txt`** (the new rows are `gates-signed 201` (row 17: a deck
holding the gates, which only a server of this build accepts) and the four ENDLESS rows that were the kit tool endlessprobe.mjs at 0.9.13: `endless-honest 201`,
`endless-wins-cap 400`, `endless-norecord 422` and `endless-match 200` (rows 18-21; the match stores no deck, the other two 201s do); with `--profile` after the id file, two PUTs more and **`23 of 23`**); revalidate's dry run `plan: delete 0
record(s) of bb-0.13.0; keep 192 seed-pool ghost(s) and 10 upload(s)` (the probe's 10, plus any real player's upload since the deploy); `remove-player <id> --rules bb-0.13.0 --apply`
prints **`APPLIED: deleted 10 of 10 record(s).`**; then `fly apps restart beltbattles`, health again, and `list --rules
bb-0.13.0` reads `all 192 0 0`. Rehearsed locally on the built commit (kit0914/probecheck.sh, O/logs/probecheck-<commit>.txt:
23 `expect:` lines, all yes, none no: the first probe prints 24 lines and `probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10)`;
the dry run reads `delete 0, keep 192 seed ghosts and 10 uploads`; `APPLIED: deleted 10 of 10 record(s).` three times (the probe's own clean-up, the hand clean-up and the `--profile` probe's);
`all 192 0 0` after each restart; `--profile` reads `23 of 23` with the two profile rows (`profile-signed` 200, `profile-badsig` 401);
the day-3 match after the restart is a v3 seed ghost under bb-0.13.0; a second probe on the same id file is refused, exit 2, and a fresh one reads 21 of 21 again).
**The hand clean-up** is section 30's block run from this clone, with at most 10 decks: its `cd` names
/home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0914/BeltBattles-r0914, both `../output-stage0911/probe-id.txt` become
`../output-stage0914/probe-id.txt`, and both `--rules bb-0.11.0` become `--rules bb-0.13.0`. The ENDLESS rows are part of the probe now, so
0.9.13's kit tool is not run: one probe, one clean-up, one restart. The Tigris store enumerates days 1 to 25, so remove-player finds the probe's day-14 ENDLESS record too.

**Revalidate** (packet item 9 (a)): after the deploy run `fly ssh console -a beltbattles -C 'node
/app/dist/ghost-admin.mjs revalidate --rules bb-0.13.0'` (a dry run; add `--apply` only if it plans deletes you expect) **over
the stored bb-0.13.0 records only, in a fresh process** (each `fly ssh console -C` is one). 0.9.13's finding F1 (validating a record older than
bb-0.10.0 in the same process restored QUENCH TANK over KINDLING for the rest of that process) is **fixed at this tip**: src/net/validate.ts:86-87
(inRulesWorld) and :277, :300, :310 and :320 (the scaling, shapes, shapes-2 and gates worlds) put ITEMS back whole through keepItems
(src/sim/itemsKeep.ts:72; BUMP-1F P2, F1 and Q5), and tests/items.order.test.ts and the suite guard tests/setup/itemsGuard.ts (vite.config.ts's test
block) hold it; the fresh-process habit is kept anyway, and costs nothing. The dry run prints `plan: delete 0 record(s) of bb-0.13.0; keep 192 seed-pool ghost(s) and N upload(s)` and
`DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.`

**ENDLESS online** is as section 32 says (src/sim/endless.ts:27): the client goes online for an endless dusk only up to day 25 (ENDLESS_ONLINE_LAST_DAY, src/sim/endless.ts:156);
past day 25 the foe is THE GOD, the day's strongest stand-in deck, with no request; **THE GOD gains 1500 hull per endless win, was 250** (src/sim/endless.ts:162). Endless wins earn only a tracked best score
(BEST n, kept on the player's device and never lowered: src/game/profile.ts); nothing is sent to the server for it. From 0.9.14.1 on the server also refuses an endless upload past day 25 at once, before the deck check (S1: section 34).

**Rollback to v25** (its own L4 every time, after telling the operator; never part of the launch call). Check that the
releases-before file lists v25 first; if not, stop and ask the Prime. If a probe's decks are on the store, run the
clean-up first, while 0.9.14 serves. From this clone:

```sh
fly deploy --ha=false --remote-only --image registry.fly.io/beltbattles:deployment-01M5CHZNH6RKGMJNTE0GD0TJM9
```

v25 is 0.9.13: the page (1,063,979 bytes, sha256 `74431b5aa7524ce5…`, V0.9.13) and the server together, on bb-0.12.0 on both
sides: the live bb-0.12.0 decks never meet bb-0.13.0 players again. Its release command (`seed`) re-seeds bb-0.12.0's
pool: **`0 written, 192 unchanged, 0 removed`**, and leaves bb-0.13.0's decks and uploads in the bucket under their own prefix
(rehearsed on both stores with the 192 pool ghosts: seed0914 step e and the Tigris rehearsal's step e; on Tigris, the real store, nothing is removed;
on the scratch JSON-lines store v25's loader read 223 of the 384 lines as ghosts, skipped 161 as bad lines (bb-0.13.0 lines it does not decode) and left the file byte for byte as it was). An **open 0.9.14 tab** keeps its page until it reloads; asked for
bb-0.13.0 ghosts, v25's server answers as the Tigris rehearsal's step f read it (kit0914/tigris-rollback.sh, O/logs/tigris-rollback-<commit>.log: health `"rules":"bb-0.12.0","store":"tigris"`; `GET /v1/ghosts/match?rules=bb-0.13.0` for day 3 `-> 200` with a bb-0.13.0 ghost out of the bucket's own prefix, and the same request under bb-0.12.0 `-> 200` too; `PUT /v1/profile` and an unsigned `POST /v1/ghosts` `-> 401`), and refuses that tab's uploads
(a 422 for a run's, a 400 for an ENDLESS dusk's, read from v25's code). A run
saved in 0.9.14 and opened on 0.9.13 meets the save guard (item (b) above): a save that names a gate (on the deck, in cargo or among that day's offers) is set aside with the aside line, which a save from day 2 on can be; NEW RUN
always works. Rolling back loses nothing on the server.

tests/tsc-tests-baseline.json is unchanged by the ride (3,382 bytes, sha16 `216977d9b4bd72fe`, 163 type errors); the release lane did not touch it.

**The known limitations** (internal notes, packet section 7; none is fixed here): (1) the par bot books a modeled sale hull for a LAST CHANCE part it cannot place (bots only; 0 of 192
pool ghosts refused; tests/bump1e.lastchance is narrowed to three cases); (2) the bots lose a word when a belt redraw lifts its rig (468 against 476 word-days, -1.7%); (3) the ladder:
parBeatsEasy fails on days 9 and 10; (4) P5 line 9 (POISON against BURN) is report only (81.5% on day 3, 63.8% on day 9); (5) a saved bb-0.12.0 endless run meets step 1500 from its next
endless dusk (intended). Display items for later releases: a selected GROWING rig's counter box reads 3 as 9 under the white frame (F1), FIERY's spark sits on the LAST CHANCE card's frame corner (F2),
HOW TO PLAY has no POISON in its keyword line and no line on the gates or the ENCHANTER's words (F3), damage numbers stack in dense day 8-9 fights (F5), and the YOUR RUNES list's last page cuts its last entry's value on the phone views (0.9.13 does the same: F8).
Three tests have no time limit of their own and can time out under load (green alone, standing ruling 1): tests/s8.seedcheck '(a)', tests/seed.test 'is 192 v3 ghosts ...' and tests/bump1e.warm's memo-hit bound.

**The checks of this STAGE** (STAGE-0914; O/STAGE-REPORT.md has every command, log and number; this paragraph is brought up
to date by the closing docs commit): step 0 (scope: the name-status diff equals the packet's difflist, 319 files; 84
protected paths; the six generated files' bytes); step S (the stored pools, never regenerated): the stored bundle's `--check` over the stored resume dir `check: IDENTICAL: regenerated 101288 bytes`,
gen:ghosts IDENTICAL (server/seedPoolData.ts 400,383 bytes `6867350cda7d6a69`), and the day-5 proof (a scratch bundle built from r0914-bump1f regenerated day 5 from scratch with the shipped options: both heroes' files, furnace and weaver, identical to the stored files after the key); step 2 (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, fp and 41 parBench lines IDENTICAL); the
label tests (8 passed). At the release record's commit the gate (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, the three builds and the knobs build exit 0,
the smoke 45 of 45, luckcaps `check: IDENTICAL: regenerated 7401 bytes`); fp and all 41 parBench lines IDENTICAL; runnercopies all SAME; seedcheck 14 of 14 yes; probecheck 23 of 23 yes;
the seed rehearsal 8 PASS (the launch seed `192 written, 0 unchanged, 0 removed`, again `0 written, 192 unchanged, 0 removed`, and v25's rollback seed `0 written, 192 unchanged, 0 removed`);
the boot; the Tigris rehearsal's steps a to e PASS; server/dist against v25's (eight of nine differ or are gone, above); the six generated files' bytes SAME; and no file of the
stand-in generators' closure (102 files) changed after bump1f-accepted. **The suite at this commit's tree: ALL GREEN, 525 files** (6,419 tests declared: 6,408 passed and 11 skipped; the hull lane's 525 files match file by file, and the four more tests are the P7 probe rows), after seven
time-outs under load in the first round (two 600 s limits, four 30 s limits and the known memo-hit bound of tests/bump1e.warm) that all passed in the second round at a quiet host (O/logs/suite-<commit>-rr*.log). The
canary is green (tests/net-pool 5 of 5). **The browser block so far** (run on T's built pages): the page smoke 4 of 4 on the offline and on the online page at 0 console errors and 0 NOT HONEST; touchcheck
noprof 2,409 of 2,409 (0.9.13's 2,323 + the ride's two new sections, apply 68 and gatesplit 18; the six scout rows that read the enemy LOOM's face title needed a one-line scripts fix, fefab254, because a rival's word now comes first: RISING LOOM);
card3check 13, stylecheck 180, explaincheck 35, surge 4, mirror, asynccheck 62 of 62 and rcruns 32 and 44 (0.9.13's counts); the field and scout stills and the LAST CHANCE shots; the rollback probe above. After those, the browser block went on (run 3): **the stills** (c1 one failed check, `op690 cnt:belt0:1: the tap opens its panel`,
byte for byte the failure 0.9.13's c1 read and cap accepted then, F11: the C8 badge's tap target over belt 0's second chip; p1 0
failed checks; desk 0); **touch mixed, whole: 2,301 distinct checks, 0 FAIL** (0.9.13's 2,215 plus the ride's apply 68 and
gatesplit 18; 18 slow-tap WARNs at the other lanes' load, none a FAIL); **the pixel comparison** of T's 311 shots against
live-0913's (213 byte-identical, 98 differ, each the title's version text, a word's spark mark on a part, the shop's stock and the
ENCHANTER's wagon, a road event or offer drawn another way, or a seeded foe's board: none without seeded content; T's frames are
the next release's reference), the shots with metrics (311, ALL PASS) and the runeshots (103); the motion taps (123 of 123); **the
LOOKS** (97 PNGs, all viewed: no clipped or overlapping text and no word on a shop card); and **the mutants: 37 of 37 current
mutants caught, every one red and none timed out (the list has 38 ids: CM2c, the oldest of the rules-check chain, survives by
design and is superseded by CM2d and CM2e, because its anchor `bb-0.10` is older than every label the tests upload under now that
BUMP-1F moved the rules test's labels; cap's ruling at 0.9.13 for CM2b, repeated for CM2c).** O/STAGE-REPORT.md has every number
and log.

## 34. 0.9.14.1: clearer cards, panels and words (client release with S1's server guard; rules bb-0.13.0 kept; its own L4)

0.9.14's launch is section 33 (clone beltbattles-r0914, branch r0914, tag stage-0914, tip 2b327f191261). It goes live BEFORE this
release and must have run once, so that Fly serves 0.9.14's page and server (its Fly release number is the rollback target
below; the CMD names it). This section is 0.9.14.1's launch, from this clone (beltbattles-r09141/BeltBattles-r09141, branch
r09141; write `refs/heads/r09141` or a tag; r09141-base = stage-0914 = 2b327f191261), staged on 2026-10-27. **Never deploy it
before 0.9.14 is live**: 0.9.14.1 holds 0.9.14's rules bump (it is 0.9.14 plus the four rides below), so a deploy on top of
0.9.13 would launch the rules release without section 33's guards; the launch call's guards below refuse unless Fly serves
0.9.14's page.

0.9.14.1 is a **client release with one server guard** (a new page, as 0.9.10 and 0.9.12 were, plus S1's refusal): the battle
rules stay **bb-0.13.0**, and no file under src/sim, src/net, src/core or src/game differs from 0.9.14 (`git diff --name-only
r09141-base <this commit> -- src/sim src/net src/core src/game` lists nothing), so the stored decks, the pool and the saves are
untouched. It is four accepted rides, merged by cap with --no-ff on stage-0914 in this order (REQ-BFG-057, -081, -089, -098,
-100 and -113):
- **S1** (the store lane a9e82fba; tag s1-accepted 572e271f1367, 5 files; merge deaa6643a569): POST /v1/ghosts answers **422
  `day: N is past the last online endless day 25`** for an endless snapshot past ENDLESS_ONLINE_LAST_DAY (25), before the rules
  check and the deck check (server/app.ts:355-357), and `ghost-admin revalidate` skips the deck check of a stored endless
  snapshot past day 25 and prints one line (server/ghostAdmin.ts:271; the line is in section 7). The game never sends such an
  upload (past day 25 the foe is THE GOD, a stand-in, and nothing goes up), so no honest record is refused; a hand-made one used
  to hold the request thread for 7.7 s at day 33 and 26 s at day 41 (S1's report).
- **ROWS-1** (the pieces lane 0551e0fb; tag rows1-accepted aeac5357c145, 13 files; merge 7c19518cdc10): display and text only: a
  belt's timeline row says what a scaling rig reads (the ten readers), YOUR RUNES' list pages, a reader's badge steps aside from
  a belt's slug chip.
- **POLISH-1** (the pieces lane; tag polish1-accepted 21cf6079422b, 41 files; merge e8ffd485a0f7): display, words and tests only.
- **PRESENT-2 with PRESENT-1** (the presentation lane 51a13003; present2-accepted dc0a1cfda124, which holds present1-accepted
  4656d58630ee; 50 files; merge 1b978f5d0664, with cap's two keep-both hunks: src/screens/lastChancePicker.ts (POLISH-1's
  lcSparkAt, then PRESENT-1's lcPartGrid) and tools/textSheet.ts (ROWS-1's belt-row lines, then PRESENT-1's ruleNotes line)):
  display only (the title, footprint grids, panels' notes and families).
The label moves 0.9.14 -> **0.9.14.1** (src/version.ts:2, package.json:4, package-lock.json:3 and :9; four parts on purpose:
BUMP-1G will be 0.9.15), so the title reads V0.9.14.1. docs/CHANGELOG.md's 0.9.14.1 entry says it in players' words (each claim
checked in the code; O/logs/changelog-claims.md has the file:line list).

**What ships.** Branch r09141 at its tip (tag stage-09141, made when the STAGE ends; the launch text names its 12 hex):
r09141-base (stage-0914); the four merges above (`r09141-rides` 8c8f5c368409 against r09141-base: 99 files, +6,018 -429: other src
32, server 2, tools 1, scripts 1, tests 62 (27 new test files, 552 in all), docs 1, nothing under src/sim, src/net, src/game,
src/core or deploy/; **3 of them under the protected paths**: server/app.ts and server/ghostAdmin.ts (S1) and tools/textSheet.ts
(the text-sheet tool, not shipped); no package file and no src/version.ts before the label); cap's scripts-only commit
8c8f5c368409 (scripts/touchcheck.mjs: the panel-title check also accepts POLISH-1's `NAME ★`); c13244ee1dad (scripts only:
rcruns.mjs's version check follows the label); the label and CHANGELOG commit e7b636a44b55; the release record (deploy/GAME_BUILD.txt
and this runbook); a tests-only commit f7ec5ff9dcbd (three ride tests follow POLISH-1's star at one star, `NAME ★`: tests/present1.s4b, present2.famhead and rows1.merged;
cap's RULING-STAGE09141-R1; no file outside tests/); and the closing docs commits (deploy/RUNBOOK.md only).
- **The page** is BeltBattles-0.9.14.1-e7b636a44b55-online.html, 1,160,876 bytes, sha256 `8be6986bc622bc59…` (GAME_BUILD.txt holds the
  whole hash), built at e7b636a and staged from ../output-stage09141/pages/. It is 10,540 bytes larger than 0.9.14's page (1,150,336;
  sha16 `7775384bd060eb9c`). Shore gets the offline page of the same commit: BeltBattles-0.9.14.1-e7b636a44b55.html, 1,160,865 bytes,
  sha256 `8e709f4702fdebe3…` (= ../output-stage09141/shore/index.html).
- **The server changes by S1's two files** (server/app.ts, server/ghostAdmin.ts): server/dist built at this commit against 0.9.14's
  (W/ref/0914-dist, the server/dist staged for 0.9.14's launch; kit09141/srvdiff.sh, O/logs/srvdiff-<commit>.txt): 9 files, 1,706,706 bytes, against 0.9.14's 9 files, 1,704,956 bytes (+1,750). **Eight of the nine differ by bytes, and only three differ in content**, all three the reach of S1's two files: ghost-admin.mjs (16,935 -> 17,624 bytes: the skip and its one line), the config chunk (67,953 -> 68,164: server/app.ts's guard) and the shared enchantSources chunk (457,747 -> 458,597: the sim code ghostAdmin.ts now imports, ENDLESS_ONLINE_LAST_DAY). The other five (ghost-server.mjs, gen-ghost-pool.mjs, ghost-probe.mjs, the seed chunk and the validate chunk) have the same sizes as 0.9.14's and differ only in minified import names (33, 3,224, 110, 17 and 3,556 bytes), because the shared chunk's exports were renumbered; the chunk names changed with them (config-C4f97P5o, enchantSources-BHFqmHF8, seed-C0PL1shH, validate-BqZkvAGt). Only the identity chunk is identical.
  fly.toml, the Dockerfile, .dockerignore and deploy/stage.mjs have no change since r09141-base. Uploads stay open.
- **The rules** are bb-0.13.0 and no literal moved: RULES_VERSION (src/sim/content.ts:57), GATES_RULES (src/net/rulesGate.ts:318),
  ENCHANT_RULES (:360), PROBE_RULES (server/ghostProbe.ts:120), SEED_POOL_RULES (server/seedPoolData.ts:8; server/seed.ts:92 refuses
  a pool dealt under other rules); SCALE_RULES (:512) and ENDLESS_RULES (:562) stay bb-0.12.0; LONG_RUN_RULES (:493) and
  SHAPES2_RULES (:278) bb-0.11.0; HEARTS_RULES (:433), PICK_RULES (:453), OPEN_RUNES_RULES (:477), FREE_JOINS_RULES (:222),
  SHAPES_RULES (:238) and NPC_DAY_RULES (:206) bb-0.10.0 and LAST_CHANCE_RULES (:190) bb-0.9.7; FIRST_RUN stays false
  (src/sim/firstRun.ts:35); POOL_RULES_CARRIED is empty (src/sim/content.ts:67). A 0.9.14 page and a 0.9.14.1 page both ask for,
  and upload under, bb-0.13.0, so **they meet each other's ghosts**; the fingerprint (855,629 bytes, sha16 `18d8eda4f890e17a`;
  352 decks, 1,056 battles, digest fe740b10) and all 41 parBench lines (`fingerprint all: fb18252c`) are IDENTICAL to 0.9.14's
  at r09141-rides and at the release record.
- **A saved run, from the code.** The save's key (`beltbattles.run.v7`, src/game/save.ts:39) and RUN_VERSION (8,
  src/game/run.ts:244) are unchanged and nothing under src/game differs from 0.9.14: **a run saved in 0.9.14 continues in
  0.9.14.1, and a run saved in 0.9.14.1 is a 0.9.14 save** (the rollback does not cost a player the run in progress). The rides
  add no line that reads or writes browser storage (no added line of the 32 changed src files names localStorage, sessionStorage, indexedDB, SAVE_KEY, setItem or
  getItem: O/logs/storagecheck-r09141-rides.txt).

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store holding bb-0.13.0's 192 pool ghosts (days
1-16, 12 a day; 0.9.14's own launch wrote them) and this commit's bundle carries the same pool (server/seedPoolData.ts is
400,383 bytes, sha16 `6867350cda7d6a69`, byte for byte r09141-base's and 0.9.14's): `seed: rules bb-0.13.0, 192 pool ghosts on
tigris (...)` with **`0 written, 192 unchanged, 0 removed`**, as on every later deploy of the same image. Nothing under any other
rules is touched. Rehearsed on this commit's real CLI and 0.9.14's, on a scratch JSON-lines store (kit09141/seed09141.sh,
O/logs/seed09141-<commit>.log): (a) 0.9.14's seed on a fresh store `192 written, 0 unchanged, 0 removed`; (b) **this commit's seed
over it `0 written, 192 unchanged, 0 removed`**, pool.jsonl byte-identical; (c) **the rollback**, 0.9.14's seed over that store,
**`0 written, 192 unchanged, 0 removed`**, pool.jsonl byte-identical; `ghost-admin list --rules bb-0.13.0` reads `all 192 0 0` after
each, and revalidate's dry run at this commit `plan: delete 0 record(s) of bb-0.13.0; keep 192 seed-pool ghost(s) and 0 upload(s)`.
On the Tigris path (kit09141/tigris-rollback.sh, the real CLIs against tools/fakeS3.ts; O/logs/tigris-rollback-<commit>.log) the same
steps are rehearsed with every object byte for byte and no DELETE request. The seed plays no battle. Its cost at the STAGE's
rehearsal: **13.6 s and a peak RSS of 236,540 kB** for this commit's seed over 0.9.14's pool (seed09141 step b: nice 10, one process, load about 10; the peak is the process's exact high-water mark, K/maxrss.py), against 13.4 s and 256,392 kB for 0.9.14's own launch seed on a fresh store (step a) and 13.5 s and 265,292 kB for the rollback seed (step c); and **16 s and 249,480 kB on one pinned core** (kit09141/seedtime.sh: taskset -c 5, nice 10, a fresh store; O/logs/seedtime-<commit>.log). The seed does the same work whether or not it writes anything (it checks all 192 ghosts first: the strict decoder, the rules, validateUpload in the player mode and the reachable record), so 0.9.14.1's launch seed costs what 0.9.14's launch seed did (0.9.14's STAGE read 12.9 s and 240,488 kB by a polled peak, and 16 s and 260,336 kB on one core). **By these reads the seed is 90-101% of the 256 MB VM (262,144 kB) on this 30 GB host: finding F1, carried from 0.9.14.** The reads were taken on a host whose node heap limits are looser than a 256 MB machine's; 0.9.14's rehearsal showed the same seed completing under small-machine node limits (kit0914/seedmem.sh: 200,956 kB and less, exit 0); none was taken on a real 256 MB machine. 0.9.14's own launch comes first and shows how this seed runs on the VM; a release command killed for memory fails the deploy and replaces nothing (section 4). fly.toml's [[vm]] is 256 MB (262,144 kB) and the release command runs on a throwaway machine of that size.

**The boot.** The server warms roadCap's memo once the port is open and uploads are open (server/main.ts, server/warm.ts; neither
changed). After the deploy and after a restart, look for the line `road model warmed for days 1-25 under rules bb-0.13.0 in <ms> ms`
in `fly logs -a beltbattles --no-tail`. Rehearsed on this commit (kit09141/boot09141.sh; taskset -c 5, nice 10;
O/logs/boot-<commit>.log; server/app.ts changed, so it was read again): boot 1 answered its **first /v1/health 200 at 562 ms** after the process start (RSS 81,008 kB), printed the **warm-up line at 1,919 ms**, `road model warmed for days 1-25 under rules bb-0.13.0 in 1736 ms`, and held 123,876 kB after it with a peak of 125,656 kB (VmHWM: 48% of the 256 MB VM); boot 2, a restart on the same store, 572 ms, 1,978 ms (`in 1790 ms`), 122,304 kB and a peak of 131,504 kB. Both are inside fly.toml's 10 s grace period and the 256 MB VM (0.9.14's
rehearsal: first health 523 ms, warm-up line 1,805 ms, 126,596 kB after it, a peak of 134,676 kB).

**The launch call is the Prime's** (CMD-09141, from CMD-0914's text; run once, under its own operator approval, L4, and only after 0.9.14 is live). Fly
serves 0.9.14's page now, so the guards are: refuse unless Fly serves the 0.9.14 page, byte for byte (`content-length: 1150336`,
sha256 `7775384bd060eb9c…`), and /v1/health reads `"rules":"bb-0.13.0"`, and `fly releases -a beltbattles --image` lists 0.9.14's
release first (keep it as releases-before.txt: the rollback needs it; the rules do not tell the two releases apart, the page's bytes do); then
stage the 0.9.14.1 page, deploy once (`fly deploy --ha=false --remote-only`: the image carries the new server/dist and the new page), and run
section 5's live checks with this page: health `"rules":"bb-0.13.0"` and `"uploads":"open"`, `content-length: 1160876`,
`live page = the staged 0.9.14.1 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`), day 3 at
1 win and 9 hearts (a v3 bb-0.13.0 snapshot), days 17, 25 and 26 as the STAGE's seedcheck read them at this tip (days 17 and 25 `-> 200`, each served a day-16 ghost; day 26 `-> 400`, `day: expected an integer in 1..25`: the same answers as 0.9.14's), an
unsigned POST `-> 401`, and `list --rules bb-0.13.0`: sixteen day rows of 12, then `all 192 0 0` (or `all 192 N P`, if N uploads by P players came
in since 0.9.14's launch). In `fly logs -a beltbattles --no-tail`: the `seed:` line above and the warm-up line. The page's own label (V0.9.14.1 on the
title) tells the two pages apart in a browser.

**S1's read-only check after the deploy** (S1's report, section 7): the guard keeps new deep endless uploads out, but one stored before
it could still be there. On the machine run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules
bb-0.13.0'` and the same with `--rules bb-0.12.0` (`list` is read only, never runs the deck check, and is safe on the 256 MB machine). It prints one row per day:
`day pool uploads players`. A run snapshot is never past day 25 (the decoder), so **a row whose day is above 25 with uploads above 0 is a stored endless snapshot
past the bound**; expect none (the game never uploads one, and a clean store prints rows for days 1-16 only, then `all 192 0 0`; in a real store
`all 192 N P`). While one exists, run `revalidate` only with an image that has S1 (this one: it prints `deck check skipped for N stored endless
snapshot(s) past day 25 (too slow; POST /v1/ghosts refuses such a day): <refs>` and finds a forged record by the cheap checks); **never run `revalidate`
with 0.9.14's or 0.9.13's image while such a row exists** (that tool deck-checks every record: 3-26 s of CPU and up to 221 MB each). To remove one:
`remove-player <playerId> --rules bb-0.13.0` (a dry run first), then `--apply` on the operator's say-so, then `fly apps restart beltbattles` (the server
serves deleted ghosts from its bucket cache until BB_GHOST_CACHE_TTL_S, 600 s). If the lane sees one, the account is a hand-built client: tell the operator.

**The probe block** is section 33's, unchanged (the probe has 21 rows; S1 adds none, because no probe row posts an endless day past 25; the probe-id file is
../output-stage09141/probe-id.txt, which must not exist yet): `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev
../output-stage09141/probe-id.txt` prints **24 lines** (the header, 21 checks, `probe player:` and the summary), ending **`probe: 21 of 21 checks as
expected; the server stored 10 deck(s) for this player (expected 10); the player id is in ../output-stage09141/probe-id.txt`** (with `--profile` after the
id file, two PUTs more and **`23 of 23`**); revalidate's dry run `plan: delete 0 record(s) of bb-0.13.0; keep 192 seed-pool ghost(s) and 10 upload(s)`
(the probe's 10, plus any real player's upload since the deploy); `remove-player <id> --rules bb-0.13.0 --apply` prints **`APPLIED: deleted 10 of 10
record(s).`**; then `fly apps restart beltbattles`, health again, and `list --rules bb-0.13.0` reads `all 192 0 0`. Rehearsed locally on the built commit
(kit09141/probecheck.sh, O/logs/probecheck-<commit>.txt): 23 `expect:` lines, all yes, none no: the first probe prints 24 lines and `probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10)`; the dry run reads `delete 0, keep 192 seed ghosts and 10 uploads`; `APPLIED: deleted 10 of 10 record(s).` three times (the probe's own clean-up, the hand clean-up and the `--profile` probe's); `all 192 0 0` after each restart; `--profile` reads `23 of 23` with the two profile rows (`profile-signed` 200, `profile-badsig` 401); the day-3 match after the restart is a v3 seed ghost under bb-0.13.0; a second probe on the same id file is refused, exit 2, and a fresh one reads 21 of 21 again. **The hand clean-up** is section 30's block run from this clone, with at most 10 decks: its `cd` names
/home/cap/.hermit/primes/.workspaces/cap/beltbattles-r09141/BeltBattles-r09141, both `../output-stage0911/probe-id.txt` become `../output-stage09141/probe-id.txt`,
and both `--rules bb-0.11.0` become `--rules bb-0.13.0`.

**Revalidate**: after the deploy run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.13.0'` (a dry run; add
`--apply` only if it plans deletes you expect) **over the stored bb-0.13.0 records only, in a fresh process** (each `fly ssh console -C` is one). The dry run prints
`plan: delete 0 record(s) of bb-0.13.0; keep 192 seed-pool ghost(s) and N upload(s)`, `DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.`,
and, only when the store holds a stored endless snapshot past day 25, S1's one line (above). Rehearsed over the scratch store: this commit's real ghost-admin, over the scratch store after the seed, prints `plan: delete 0 record(s) of bb-0.13.0; keep 192 seed-pool ghost(s) and 0 upload(s)` and `DRY RUN: nothing was deleted.` with no S1 line (a clean store); S1's line itself is pinned by tests/s1.endlesscap.test.ts (revalidate over an honest day 33, a forged day 33 and an honest day 20 prints one skip line for the two deep ones and plans only the forged one).

**ENDLESS online** is as section 33 says (src/sim/endless.ts:27): the client goes online for an endless dusk only up to day 25 (ENDLESS_ONLINE_LAST_DAY,
src/sim/endless.ts:156); past day 25 the foe is THE GOD with no request, and since S1 the server refuses such an upload at once (422) if a hand-made client sends one.
Raising ENDLESS_ONLINE_LAST_DAY would also reopen the server to deep uploads (the guard reads the same constant): only after the deck check runs off the request thread.

**Rollback to 0.9.14's Fly release** (its own L4 every time, after telling the operator; never part of the launch call). Check that the releases-before file lists
0.9.14's release first (its number is in the CMD); if not, stop and ask the Prime. If a probe's decks are on the store, run the clean-up first, while 0.9.14.1 serves. From
this clone:

```sh
fly deploy --ha=false --remote-only --image <IMAGE REF of 0.9.14's release, from releases-before.txt>
```

0.9.14's release is the page (1,150,336 bytes, sha256 `7775384bd060eb9c…`, V0.9.14) and the server together, on the **same rules bb-0.13.0**: the stored decks and the
pool are untouched by a rollback, and S1's guard goes away with it. Its release command re-seeds the same pool and writes nothing (**`0 written, 192 unchanged, 0
removed`**, step c of seed09141.sh; on Tigris too: the rehearsal's last step). Saves carry both ways (the saved-run bullet above): a run in progress in 0.9.14.1 continues in 0.9.14. An open
0.9.14.1 tab keeps its page until it reloads; its matches and uploads use the same rules, so they work against 0.9.14's server (the Tigris rehearsal's step f: 0.9.14's server over
the bucket answers a bb-0.13.0 match `-> 200`). fly.toml is unchanged, so the image route is safe for the server. Before 0.9.14: v25 = 0.9.13 (section 33's rollback, which puts
bb-0.12.0 back on both sides; going back past 0.9.14 is a separate decision).

tests/tsc-tests-baseline.json is unchanged by the rides (3,382 bytes, sha16 `216977d9b4bd72fe`, 163 type errors); the release lane did not touch it.

**The known limitations** of section 33 stand (the bots' sale hull and redraw word loss, the ladder's days 9 and 10, P5 line 9, saved endless runs meeting step 1500, F6: 0.9.13's CONTINUE
drops a 0.9.14 save's wares). Display items: 33 panels, every one at one star, whose family head shows the 3x3 marks or sits beside the title since POLISH-1 put ` ★` after a one-star part's title (tests/present2.famhead.test.ts P5A_STAR1: phone band 32, laptop column 1; cap's RULING-STAGE09141-R1; POLISH-2's title rule may give the names back); LAST CHANCE's cards (src/screens/lastChancePicker.ts:219-227) and the road-fork drops (src/screens/fork/drops.ts:81-89) still draw the old `i` info button; GRAPNEL GUN's old card line still says RIP on the smallest phone's one-line strip (src/ui/abilityText.ts:1055-1059); the shop-offer panel's title has no star (src/screens/build/inspector.ts:758). Seen in this STAGE's LOOKS, none of them from the rides' code: LAST CHANCE's title line `SAVED ON 1 HEART. PICK ONE. FREE.` (src/screens/lastChancePicker.ts:69) just fits its plate on a 300 px wide phone and runs past both screen edges at 280 px (narrower than the smallest view the repo checks, 360x640: the line fits at 360x640 and at 320x568); and on the desk the BELT ROUTE column (126 px) shows `+N MORE HIT TILES (NUMBERED ON THE DECK)` instead of the rows of a belt with two IRON WALL hits (ROWS-1's give-way rule, src/screens/build/inspector.ts: whole trailing rows give way, a row is never cut), where the phones show every row; a belt with one reader fits the desk column.

**The checks of this STAGE** (STAGE-09141; O/STAGE-REPORT.md has every command, log and number; this paragraph is brought up to date by the closing docs commits): step 0 (scope: the name-status diff equals the setup's difflist, 99 files; 3 protected paths: server/app.ts, server/ghostAdmin.ts and tools/textSheet.ts; no package file, src/version.ts or deploy/ before the label; the six generated files' bytes; closure-gens.txt 0 changed); step 2 at r09141-rides (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, fp and all 41 parBench lines IDENTICAL); the label tests (6 files, 31 tests); the page smoke 4 of 4 on the offline and on the online page at 0 console errors, 0 NOT HONEST and `version 0.9.14.1` on 4 of 4. At the release record's commit the gate (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, the three builds and the knobs build exit 0, the smoke 45 of 45, luckcaps `check: IDENTICAL: regenerated 7401 bytes`); fp and all 41 parBench lines IDENTICAL; runnercopies all SAME; seedcheck 14 of 14 yes; probecheck 23 of 23 yes; the seed rehearsal 6 PASS (0.9.14's seed `192 written, 0 unchanged, 0 removed`, this commit's `0 written, 192 unchanged, 0 removed`, and the rollback seed `0 written, 192 unchanged, 0 removed`); the boot; the Tigris rehearsal's steps a to f PASS; server/dist against 0.9.14's (three files differ in content, S1's reach); the six generated files' bytes SAME; and no file of the stand-in generators' closure (102 files) changed since the base. The text sheets ON and OFF: +93 lines each, 0 overflows. **The suite: at the release record's tree 549 of the 552 files were green (547 passed and 2 skipped whole; 6,611 tests declared, 6,600 passed and 11 skipped), and the three files that POLISH-1's star at one star turned red (tests/present1.s4b, tests/present2.famhead and tests/rows1.merged: pins of the other three rides, 6 failed assertions, no time-out) pass 35 of 35 alone after cap's ruling R1 re-pinned them (the tests-only commit f7ec5ff9dcbd; the page and the server are unchanged by it)**; the canary is green (tests/net-pool 5 of 5). **The rest of the browser block, each step alone at the release record's tree** (the page and the server at the final tip are T's bytes: O/logs/samebuild-*.txt): touch noprof **2,420 of 2,420** and mixed, whole, in the two parts of 0.9.14, **1,153 and 1,160**, with no FAIL (+11 each against 0.9.14: PRESENT-1's TITLE-TAP check in the customize section on its 11 views; every other changed touch line has its cause: POLISH-1's star after a one-star part's title, PRESENT-1's S4 (b) growth of a phone panel over the shop for a first-sight note (src/screens/build/keywords.ts:421-425, :953), the run ids, and the six scout lines that read PASS now); card3check 13, stylecheck 180, explaincheck 35, surge 4, the mirror and asynccheck 62 of 62; introcheck's title mode 198 of 198; rcruns 32 of 32 offline and 44 of 44 online at 0 console errors and `version 0.9.14.1` on all 8 offline runs (the one NOT HONEST line is F10's control); runeshots 103; the 311 shots with metrics (no console errors) and the samepixels account against 0.9.14's 311 shots (77 identical, 234 differ: every differing frame is explained by the label or by PRESENT-1, PRESENT-2 or POLISH-1; none is unexplained); the motion taps 123 of 123; the stills c1 and p1 at 0 failed checks (0.9.14's one known c1 failure is gone); the field and scout stills and the LAST CHANCE shots (28 PASS lines). **The LOOKS** (89 PNGs, 0 console errors): no clipped or overlapping text on any view of the repo, no word on a shop card; LAST CHANCE's spark and corner grid do not overlap; a warlord result card's seconds equal its arena clock in 11 real frames; YOUR RUNES' list pages on a phone and its last entry is whole. **The mutants: all 38 apply (S1's lines moved p11's anchor from offset 35 to 50) and the 37 current mutants are caught** (every one red by an assertion failure; the nine units in one call took 10 min 18 s); CM2c survives by design and is superseded by CM2d and CM2e; a hand mutant of S1's day-25 guard (server/app.ts:355 never firing) is caught too (tests/s1.endlesscap and tests/endless1.server, O/logs/s1mutant-970325961d76.log). **Perf** (motionperf, one paired run alone against 0.9.14's offline page, 390x844 at 4x and 1x): 60 fps, p99 16.8 ms, 0% of frames over 20 ms, no errors in any scene; the build screen's game work per frame 1.47 ms at 4x and 0.789 ms at 1x against 0.9.14's 2.599 and 0.86: not slower. The rollback probe, the stored pools' proofs and the stand-in proofs are carried (nothing under src/game moved; no file of the stand-in generators' closure changed).

## 35. 0.9.15: every run's shops offer a SHOCK and a BURN part, and clearer panels (rules release bb-0.14.0; server and client in one deploy; its own L4)

0.9.14's launch is section 33 (clone beltbattles-r0914, branch r0914, tag stage-0914, tip 2b327f191261) and 0.9.14.1's is section 34
(clone beltbattles-r09141, branch r09141, tag stage-09141, tip f14e3ee540de). **The launch order is 0.9.14, then 0.9.14.1, then 0.9.15**,
back to back: both go live BEFORE this release and must each have run once, so that Fly serves 0.9.14.1's page and server (0.9.14.1's Fly
release, v28, is the rollback target below; the CMD names it). This section is 0.9.15's launch, from this clone
(beltbattles-r0915/BeltBattles-r0915, branch r0915; write `refs/heads/r0915` or a tag; r0915-base = stage-09141 = f14e3ee540de), staged on
2026-10-28. **Never deploy it before 0.9.14.1 is live**: 0.9.15 holds 0.9.14.1 (BUMP-1G's tip is the hull lane's merge of stage-09141), so a
deploy on top of 0.9.14 would ship 0.9.14.1's rides and S1's guard without section 34's launch; the launch call's guards below refuse unless
Fly serves 0.9.14.1's page.

0.9.15 is a **rules release** (route B, as 0.9.11, 0.9.13 and 0.9.14 were): the battle rules move to **bb-0.14.0**, so the page and the
server ship together, in **one Fly deploy**, and **never the page alone**: a 0.9.15 page asks for, and uploads under, bb-0.14.0, and only
this release's server holds that pool and takes those uploads (0.9.14.1's server takes bb-0.13.0 only: server/app.ts:360-361). It is three
accepted rides, merged by cap in this order (REQ-BFG-033 and -024; -085, -089 and -098; -081, -087 and -113), and cap's ruling R0:
- **BUMP-1G** (the hull lane 6c99be48; tag bump1g-09141 -> 279d93d9f3b4, tag object d78120dc5f01: the hull lane's merge of stage-09141 into
  bump1g, parents a98264179412 and f14e3ee540de, so r0915 fast-forwards to it, tag r0915-bump; 88 files against stage-09141, +1,395 -710, 20
  of them not tests). **SHOCK-1, the effect floor** (EFFECT_FLOOR, src/sim/effectFloor.ts:28): every run begun on 0.9.15 holds at least one
  SHOCK rig and one BURN rig (the SMUGGLER's two kinds, src/game/smugglerPool.ts:29-36) among its wares, the parts its shop can sell over the
  run; a run that would have had none gets one in place of another part, of the same merchant and rarity where it can (src/game/wares.ts:146,
  :220-247). With the floor off 77 of 2,000 table seeds lack SHOCK and 18 lack BURN (tests/effectfloor.draw.test.ts:41-42), so about 1 run
  in 21 to 26 changes. In a new run the SMUGGLER always has a part of each kind to offer and never reads NONE ON OFFER
  (src/game/eventDefs.ts:142-148, :176-180). **G2, two captains:** RATCHET (Easy) holds its TEMPER BRACED from day 12, was FIERY
  (src/sim/npcWords.ts:79); GRIMHOLD (Medium) merges its second ANVIL BREECH on day 6, was day 4, so on days 4 and 5 that part has one star
  (src/sim/rivalBuilds.ts:948); both on the road and at dusk. **B1-B3** (the bots, src/sim/harness): a rig's word kept on a belt redraw,
  LAST CHANCE's part-sale hull in whole plates, the cache keys with the new switches. G3 trims the four wave-3 NPC plans (tools/wave3Npcs.ts,
  design data the game does not read). **One regeneration**: the stand-in pool, the picks, the 192-ghost seed pool and the luck caps. No
  fight rule changed: BUMP-1G's diff holds no battle file, and src/sim/content.ts changes only the label and comments (O/logs/changelog-claims-A.md, A1).
- **POLISH-2** (the pieces lane 0551e0fb; tag polish2-accepted -> 437b429fb7df, tag object 23d0fc2ee7a6; 13 files; merge 680217a4b3c7,
  clean, tag r0915-m1): display only. A belt's panel counts FIERY and GROWING parts (BURN and DMG) and says in one NOT COUNTED line what its
  numbers leave out (where the panel has no room, the same words are the first note of its `?` view); LAST CHANCE's cards, the road's drop
  list and the event cards draw the one `?` info glyph (src/ui/infoGlyph.ts:21-35).
- **PRESENT-3** (the presentation lane 51a13003; tag present3-accepted -> 882d0ead5662, tag object 1fc57fd5aad8; 23 files; merge
  c2662af3b084 with `-X theirs`, tag r0915-merged: merge-tree named one conflicted file, tests/present1.s4b.test.ts, whose FACES table
  PRESENT-3's side wins as its packet says): display only. The five-point star; a turret panel's empty gear rows on one line (`GEAR 2-6
  EMPTY`); first-run notes that leave the deck clear; definition notes on desks and landscape phones that no longer cover a turret panel's
  rules; the road card's arrow; the heavy turrets' carriage-gun icon.
- **R0**, cap's tests-only commit fed433cfe5ea (RULING-STAGE0915-R0, tag r0915-rides): with PRESENT-3's folded gear rows four installed ★★
  turrets' ⓘ views (MASSIVE RAMPART CANNON, WIDE RAMPART CANNON, MASSIVE SCRAP CANNON and MASSIVE TWIN NEEDLE) need a 4th page on 402x690, so
  tests/polish2.infoPages.test.ts's list takes the four (35 -> 39 views past 3 pages; none needs a 5th).
The label moves 0.9.14.1 -> **0.9.15** (src/version.ts:2, package.json:4, package-lock.json:3 and :9; three parts again), so the title reads
V0.9.15. docs/CHANGELOG.md's 0.9.15 entry says it in players' words (each claim checked in the code: O/logs/changelog-claims-A.md and -B.md).

**What ships.** Branch r0915 at its tip (tag stage-0915, made when the STAGE ends; the launch text names its 12 hex): r0915-base
(stage-09141); r0915-bump (BUMP-1G, a fast-forward); the two merges and R0 above (`r0915-rides` fed433cfe5ea against r0915-base: 120 files,
A 17, M 103, D 0, 56 commits: src/sim 10, src/net 0, src/game 3, src/core 0, other src 12, server 2, tools 4, scripts 0, tests 88, docs 1,
deploy 0; **19 of them under the protected paths, all BUMP-1G's, by design in a rules release**: server/ghostProbe.ts,
server/seedPoolData.ts, src/game/{eventDefs,smugglerPool,wares}.ts, src/sim/{content,effectFloor,npcWords,rivalBuilds,scaleRating,
standInPoolData}.ts, src/sim/harness/{lastChance,luckCapsData,player,shopper}.ts and tools/{retune1,samplePool,smoke,wave3Npcs}.ts; no package
file, src/version.ts, vite.config.ts or deploy/ before the label); d46f1dfe5063 (scripts only: scripts/rcruns.mjs's version check follows
the label, the brief's ruling 8); the label and CHANGELOG commit 8256f7d15581; and the release record (deploy/GAME_BUILD.txt and this runbook).
- **The page** is BeltBattles-0.9.15-8256f7d15581-online.html, 1,169,732 bytes, sha256 `b4f84e0f3100a3c8…` (GAME_BUILD.txt holds the
  whole hash), built at 8256f7d and staged from ../output-stage0915/pages/. It is 8,856 bytes larger than 0.9.14.1's page (1,160,876;
  sha16 `8be6986bc622bc59`). Shore gets the offline page of the same commit: BeltBattles-0.9.15-8256f7d15581.html, 1,169,721 bytes,
  sha256 `52940498c4bd8624…` (= ../output-stage0915/shore/index.html).
- **The server changes** (this is why the release is one deploy): server/dist built at this commit is 1,715,024 bytes in 9 files, against 0.9.14.1's
  9 files, 1,706,706 bytes (W/ref/09141-dist: T(0.9.14.1)'s export, the server/dist of 0.9.14.1's launch; kit0915/srvdiff.sh,
  O/logs/srvdiff-<commit>.txt): 9 files, 1,715,024 bytes, against 0.9.14.1's 9 files, 1,706,706 bytes (+8,318). **Eight of the nine differ by bytes (only the identity chunk is identical), and six of those eight differ in content**, all of it BUMP-1G's: ghost-probe.mjs (39,987 bytes both ways: PROBE_RULES and the rune offers the probe asks for now name `bb-0.14.0`, server/ghostProbe.ts:120), the seed chunk (402,124 -> 404,429 bytes, +2,305: the bb-0.14.0 pool, server/seedPoolData.ts), gen-ghost-pool.mjs (393,926 -> 395,256, +1,330), the validate chunk (316,279 -> 320,940, +4,661: the sim code the validator bundles), the config chunk (68,164 bytes both ways: the server's imports and its rules literal) and the shared enchantSources chunk (458,597 -> 458,619, +22: RULES_VERSION `bb-0.14.0`, RATCHET's word `braced` where it was `fiery`, and GRIMHOLD's `M2(6, "anvil", 0)` where it was `M2(4, ...)`). ghost-server.mjs (3,206 bytes) and ghost-admin.mjs (17,624 bytes) have the same sizes as 0.9.14.1's and differ only in minified import names and the names of the chunks they import, because the shared chunks' exports were renumbered; four chunk names changed (config-CQqhEMh1, enchantSources-CjCMoT84, seed-CVcysJme, validate-sGvjvV6z). POLISH-2 and PRESENT-3 add nothing to the bundle. BUMP-1G changes two server files (server/ghostProbe.ts: PROBE_RULES; server/seedPoolData.ts:
  the bb-0.14.0 pool) and sim and game code that the server bundles; POLISH-2 and PRESENT-3 change no file under server/, src/sim, src/net,
  src/core, src/game or tools/. fly.toml, the Dockerfile, .dockerignore and deploy/stage.mjs have no change since r0915-base. Uploads stay open.
- **The rules** are bb-0.14.0: RULES_VERSION (src/sim/content.ts:61), PROBE_RULES (server/ghostProbe.ts:120) and SEED_POOL_RULES
  (server/seedPoolData.ts:8; server/seed.ts:92 refuses a pool dealt under other rules). There is **no new rulesGate.ts literal** (G1 took no
  mirror, so no LEAD_RULES): GATES_RULES (src/net/rulesGate.ts:318) and ENCHANT_RULES (:360) stay bb-0.13.0; SCALE_RULES (:512) and
  ENDLESS_RULES (:562) bb-0.12.0; LONG_RUN_RULES (:493) and SHAPES2_RULES (:278) bb-0.11.0; HEARTS_RULES (:433), PICK_RULES (:453),
  OPEN_RUNES_RULES (:477), FREE_JOINS_RULES (:222), SHAPES_RULES (:238) and NPC_DAY_RULES (:206) bb-0.10.0 and LAST_CHANCE_RULES (:190)
  bb-0.9.7; FIRST_RUN stays false (src/sim/firstRun.ts:35); POOL_RULES_CARRIED is empty (src/sim/content.ts:71), so POOL_RULES =
  RULES_VERSION (:73). The switches EFFECT_FLOOR (src/sim/effectFloor.ts:28, new), GATES (src/sim/gates.ts:31), ENCHANT
  (src/sim/enchant.ts:28), SCALE_RIGS (src/sim/scale.ts:34) and ENDLESS (src/sim/endless.ts:27) are on beside LONG_RUN, PLAIN_RIGS, SHAPES2,
  HEARTS and SHAPES; POISON_DPS is 2 (src/sim/content.ts:108), ENDLESS_GOD_HULL_STEP 1500 (src/sim/endless.ts:162) and STAND_IN_POOL_DAYS
  16 (src/sim/standInPool.ts:88). A 0.9.15 page asks for, and uploads under, bb-0.14.0; a 0.9.14.1 or 0.9.14 page asks for bb-0.13.0. The
  match route reads only the bucket of the rules a request names (server/app.ts:434-436) and an upload under other rules is refused (422
  `rules bb-0.13.0 not accepted: this server validates bb-0.14.0`, server/app.ts:360-361), so **a player of 0.9.15 meets only bb-0.14.0
  ghosts**, except a foe that a run saved by 0.9.14.1 had already picked for its day (the saved runs below). The fingerprint (857,755 bytes,
  sha16 `921e2202aa58bc4a`) and all 41 parBench lines (`fingerprint all: e1ec0b3c`) are IDENTICAL to the hull lane's pins
  (W/ref/bump1g/output-bump1g/fp/fp-m09141s.json and parfp-m09141s.txt) at r0915-rides (at the release record: the checks below); 0.9.14.1's
  pins (855,629 bytes `18d8eda4f890e17a`, fb18252c) are not the pins any more.

**The order.** One Fly deploy carries the page and the server together, on top of 0.9.14.1, and never the page alone. The launch order is
0.9.14 (section 33), then 0.9.14.1 (section 34), then 0.9.15, back to back; this launch runs only once 0.9.14.1 is live (0.9.15 holds it).
**The launch call is the Prime's** (CMD-0915, from CMD-0914's and CMD-09141's text; run once, under its own operator approval, L4). Fly
serves 0.9.14.1's page then, so the guards are: refuse unless Fly serves the 0.9.14.1 page, byte for byte (`content-length: 1160876`, sha256
`8be6986bc622bc59…`), and /v1/health reads `"rules":"bb-0.13.0"`, and `fly releases -a beltbattles --image` lists 0.9.14.1's release first
(keep it as releases-before.txt: the rollback needs it; the rules do not tell 0.9.14's and 0.9.14.1's releases apart, the page's bytes do);
then stage the 0.9.15 page, deploy once (`fly deploy --ha=false --remote-only`: the image carries the new server/dist and the new page), and
run section 5's live checks with this page: health `"rules":"bb-0.14.0"` and `"uploads":"open"`, `content-length: 1169732`,
`live page = the staged 0.9.15 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`), day 3 at 1 win and
9 hearts (a v3 bb-0.14.0 snapshot), days 17, 25 and 26 as the STAGE's seedcheck read them (below), an unsigned POST `-> 401`, and `list
--rules bb-0.14.0`: sixteen day rows of 12, then `all 192 0 0` (`all 192 N P` if real players uploaded since the deploy; `list --rules
bb-0.13.0` still reads `all 192 N P`: 0.9.14's and 0.9.14.1's pool and uploads stay). Section 5's one-line call asks only days 1-16 and
day 3: add `day=17`, `day=25` and `day=26` queries to see those three lines. In `fly logs -a beltbattles --no-tail`: the `seed:` line and
the warm-up line (below). The page's own label (V0.9.15 on the title) tells the two pages apart in a browser.

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store holding bb-0.13.0's 192 pool ghosts (days 1-16, 12 a
day; 0.9.14's launch writes them and 0.9.14.1's keeps them), the uploads made under it and the older pools, and nothing under bb-0.14.0. This
commit's bundle carries the new pool (server/seedPoolData.ts is 402,688 bytes, sha16 `5756d795170150f6`, 192 ghosts, days 1-16, 12 a day,
SEED_POOL_RULES bb-0.14.0; 0.9.14.1's is 400,383 bytes, sha16 `6867350cda7d6a69`): `seed: rules bb-0.14.0, 192 pool ghosts on tigris
(...)` with **`192 written, 0 unchanged, 0 removed`**, and on every later deploy of the same image `0 written, 192 unchanged, 0 removed` (the
release command runs at each `fly deploy`). **bb-0.13.0's 192 pool ghosts and every upload under it are left as they are**: the Tigris seed
lists and writes only `ghosts/bb-0.14.0/dNN/pool/` (server/tigrisStore.ts replacePool). Rehearsed on this commit's real CLI and 0.9.14.1's
(kit0915/seed0915.sh, O/logs/seed0915-<commit>.log; a scratch JSON-lines store; 0.9.14.1's CLI from W/ref/09141-dist), each step as it must
read: (a) 0.9.14.1's seed on a fresh store `192 written, 0 unchanged, 0 removed` (bb-0.13.0); (b) **this commit's seed over it `192 written,
0 unchanged, 0 removed`** (bb-0.14.0), bb-0.13.0's lines in pool.jsonl byte for byte as they were and `ghost-admin list --rules bb-0.13.0`
still `all 192 0 0`; (c) again **`0 written, 192 unchanged, 0 removed`**, pool.jsonl byte-identical; (d) `list --rules bb-0.14.0` and `list
--rules bb-0.13.0` read `all 192 0 0`, and revalidate's dry run `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and 0
upload(s)`; (e) **the rollback**, 0.9.14.1's seed over that store, **`0 written, 192 unchanged, 0 removed`** (bb-0.13.0), pool.jsonl
byte-identical, bb-0.14.0's 192 still listed. On the Tigris path (kit0915/tigris-rollback.sh: the real CLIs against tools/fakeS3.ts;
O/logs/tigris-rollback-<commit>.log) the same five steps run with every object checked byte for byte (hashes in the log) and no DELETE
request, then a step f (0.9.14.1's server over the rolled-back bucket: the rollback below). The reads and the seed's cost (step b: nice 10,
one process, the exact peak RSS by K/maxrss.py; kit0915/seedtime.sh: one pinned core, a fresh store, O/logs/seedtime-<commit>.log):
`seed rehearsal: 8 PASS, 0 FAIL` (`SEED REHEARSAL (0.9.15): PASS`): (a) 0.9.14.1's seed on a fresh store `192 written, 0 unchanged, 0 removed` (bb-0.13.0); (b) **this commit's seed over it `192 written, 0 unchanged, 0 removed`** (bb-0.14.0), the first 340,398 bytes of pool.jsonl (bb-0.13.0's lines) hashing the same before and after, so only appended, and both lists `all 192 0 0`; (c) again `0 written, 192 unchanged, 0 removed`, pool.jsonl byte-identical (682,653 bytes, sha16 35072cafcaa4baa0); (d) `list --rules bb-0.14.0` and `list --rules bb-0.13.0` both `all 192 0 0` and revalidate's dry run `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and 0 upload(s)`; (e) **the rollback**, 0.9.14.1's seed over that store, `0 written, 192 unchanged, 0 removed`, pool.jsonl byte-identical and bb-0.14.0's 192 still listed. The Tigris path (kit0915/tigris-rollback.sh against the fake S3) passes steps a to e with every object byte for byte (bb-0.13.0's 192 objects hash 040ea2a16f9a3c7a before and after, bb-0.14.0's 192 hash f8aeae37d0f8c81b before and after the rollback seed) and 0 DELETE requests (PUT 384, GET 408, LIST 106). **Step b took 11.1 s with a peak RSS of 267,136 kB** (nice 10, one process, load about 1.6; the peak is the process's exact high-water mark, K/maxrss.py), against 11.0 s and 234,596 kB for 0.9.14.1's own launch seed on a fresh store (step a), 11.2 s and 273,516 kB for this commit's seed again (step c) and 11.0 s and 244,532 kB for the rollback seed (step e); kit0915/seedtime.sh, one pinned core (taskset -c 5, nice 10, a fresh store): **14 s and 256,464 kB**. By these reads the seed peaks at 89-104% of the 256 MB VM (262,144 kB) on this 30 GB host (0.9.14.1's STAGE: 90-101%), and two of the five reads (267,136 and 273,516 kB) are above it. The seed plays no battle, but it checks all 192 ghosts first (the strict decoder, the rules, validateUpload in the player
mode and the reachable record), whether or not it writes them. fly.toml's [[vm]] is 256 MB (262,144 kB) and the release command runs on a
throwaway machine of that size: **finding F1, carried from 0.9.14 and 0.9.14.1.** 0.9.14.1's STAGE read 236,540-265,292 kB for the seed of
bb-0.13.0's 192 ghosts on this 30 GB host (90-101% of the VM; section 34), and this pool is 2,305 bytes bigger. Those reads come from a host
whose node heap limits are looser than a 256 MB machine's; 0.9.14's rehearsal saw the seed complete under small-machine node limits
(kit0914/seedmem.sh: 200,956 kB and less, exit 0); none was taken on a real 256 MB machine. 0.9.14's and 0.9.14.1's launches come first and
show how such a seed runs on the VM. A release command killed for memory fails the deploy and replaces nothing (section 4).

**The boot.** The server warms roadCap's memo once the port is open and uploads are open (server/main.ts, server/warm.ts; neither changed
since 0.9.14, but BUMP-1G changed sim code the warm-up runs, so the STAGE reads it again). After the deploy and after a restart, look for the line
`road model warmed for days 1-25 under rules bb-0.14.0 in <ms> ms` (server/warm.ts:26) in `fly logs -a beltbattles --no-tail`. fly.toml's
health check has a 10 s grace period, a 30 s interval and a 5 s timeout, and the VM is 256 MB. Rehearsed on this commit (kit0915/boot0915.sh:
this commit's server/dist/ghost-server.mjs started the way the Dockerfile and fly.toml start it, on a scratch store after the release
command's seed; taskset -c 5, nice 10; O/logs/boot-<commit>.log): boot 1 answered its **first /v1/health 200 at 467 ms** after the process start (RSS 83,584 kB), printed the **warm-up line at 1,591 ms**, `road model warmed for days 1-25 under rules bb-0.14.0 in 1434 ms`, and held 124,076 kB after it with a peak of 128,548 kB (VmHWM: 49% of the 256 MB VM); a health asked right after the warm-up answered 200 in about 1 ms; boot 2, a restart on the same store, 470 ms, 1,622 ms (`in 1467 ms`), 123,344 kB and a peak of 130,156 kB (50%). Both are far inside the 10 s grace period and the 256 MB VM. (0.9.14.1's rehearsal: first health 562 ms, warm-up line
1,919 ms, 123,876 kB after it, a peak of 125,656 kB.)

**The probe block** is section 33's, under bb-0.14.0 (PROBE_RULES, server/ghostProbe.ts:120; the plan is unchanged: twenty POSTs and the
endless match; the probe-id file is ../output-stage0915/probe-id.txt, which must not exist yet): `node server/dist/ghost-probe.mjs
https://beltbattles.fly.dev ../output-stage0915/probe-id.txt` prints **24 lines** (the header `probe: POST https://beltbattles.fly.dev/v1/ghosts
as a fresh device (rules bb-0.14.0); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`, 21 checks, `probe player:` and the
summary), ending **`probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10); the player id is in
../output-stage0915/probe-id.txt`** (with `--profile` after the id file, two PUTs more and **`23 of 23`**); revalidate's dry run `plan: delete 0
record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and 10 upload(s)` (the probe's 10, plus any real player's upload since the deploy);
`remove-player <id> --rules bb-0.14.0 --apply` prints its `delete ghosts/bb-0.14.0/dNN/player/<id>.json` lines and **`APPLIED: deleted 10 of
10 record(s).`** (the Tigris store enumerates days 1 to 25, so it finds the probe's day-14 ENDLESS record too); then `fly apps restart
beltbattles`, health again, and `list --rules bb-0.14.0` reads `all 192 0 0`. Rehearsed locally on the built commit (kit0915/probecheck.sh,
O/logs/probecheck-<commit>.txt): 23 `expect:` lines, all yes, none no: the first probe prints 24 lines and `probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10)`; the dry run reads `delete 0, keep 192 seed ghosts and 10 uploads`; `APPLIED: deleted 10 of 10 record(s).` three times (the probe's own clean-up, the hand clean-up and the `--profile` probe's); `all 192 0 0` after each restart; `--profile` reads `23 of 23` with the two profile rows (`profile-signed` 200, `profile-badsig` 401); the day-3 match after the restart is a v3 seed ghost under bb-0.14.0; a second probe on the same id file is refused, exit 2, and a fresh one reads 21 of 21 again. The probe's plan is the one section 33 describes; only its header and the object keys name bb-0.14.0. **The hand clean-up** is section 30's block run from this clone, with at most 10 decks:
its `cd` names /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0915/BeltBattles-r0915, both `../output-stage0911/probe-id.txt` become
`../output-stage0915/probe-id.txt`, and both `--rules bb-0.11.0` become `--rules bb-0.14.0`.

**Revalidate**: after the deploy run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.14.0'` (a dry
run; add `--apply` only if it plans deletes you expect) **over the stored bb-0.14.0 records only, in a fresh process** (each `fly ssh console
-C` is one). The dry run prints `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and N upload(s)` and `DRY RUN: nothing was
deleted. --apply deletes exactly the 0 record(s) above.`, and, only when the store holds a stored endless snapshot past day 25, S1's one line
(section 7). With this image `revalidate` takes only `--rules bb-0.14.0` (section 7: it runs only for the build's rules); `list` and
`remove-player` take any rules. Rehearsed over the scratch store: this commit's real ghost-admin, over the scratch store after the seed (seed0915 step d), prints `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and 0 upload(s)` and `DRY RUN: nothing was deleted.` with no S1 line (a clean store); with the probe's 10 uploads on the store (probecheck's dry run) it prints `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and 10 upload(s)`; S1's line itself is pinned by tests/s1.endlesscap.test.ts.

**S1's read-only check after the deploy** (section 34's form; the guard is in this server too: server/app.ts:355-357 and
server/ghostAdmin.ts:271, both unchanged since 0.9.14.1): on the machine run `fly ssh console -a beltbattles -C 'node
/app/dist/ghost-admin.mjs list --rules bb-0.14.0'` and the same with `--rules bb-0.13.0` (`list` is read only, never runs the deck check, and
is safe on the 256 MB machine). It prints one row per day: `day pool uploads players`. A run snapshot is never past day 25 (the decoder), so
**a row whose day is above 25 with uploads above 0 is a stored endless snapshot past the bound**; expect none (the game never uploads one,
and S1 refuses one since 0.9.14.1). A clean store prints rows for days 1-16 only, then `all 192 0 0` (bb-0.14.0 right after the launch); a
store with uploads prints `all 192 N P` (bb-0.13.0 holds what players uploaded under 0.9.14 and 0.9.14.1). While such a row exists, run
`revalidate` only with an image that has S1 (this one or 0.9.14.1's). To remove one: `remove-player <playerId> --rules <its rules>` (a dry run
first), then `--apply` on the operator's say-so, then `fly apps restart beltbattles` (the server serves deleted ghosts from its bucket cache
until BB_GHOST_CACHE_TTL_S, 600 s). If the lane sees one, the account is a hand-built client: tell the operator.

**The days a GET answers 200 for** (a new player at 0 wins and 10 hearts; kit0915/seedcheck.sh's [3] and [3d] on this commit's server over
the scratch store, O/logs/seedcheck-<commit>.txt): seedcheck read 14 `expect:` lines, all yes: health `{"ok":true,"rules":"bb-0.14.0","store":"jsonl","ghosts":192,"uploads":"open",...}`, the served page = the page (cmp), its label `0.9.15`, days 1-16 each `-> 200` (16 of 16), days 17 and 25 `-> 200`, each served a day-16 ghost, day 26 `-> 400`, `day: expected an integer in 1..25` (the same answers as 0.9.14.1's), and a bb-0.13.0 match `-> 404` on the scratch store (it holds no pool under bb-0.13.0; on Fly the same request answers 200). The day bound is 25 (maxDayFor), and a thin day widens to the nearest
earlier day that has an eligible ghost (section 5, item 5). On Fly a bb-0.13.0 request (an open 0.9.14.1 tab) is answered from bb-0.13.0's
pool, which the scratch store does not hold (seedcheck's [5] answers 404 there).

**ENDLESS online** is as sections 33 and 34 say: the client goes online for an endless dusk only up to day 25 (ENDLESS_ONLINE_LAST_DAY,
src/sim/endless.ts:156); past day 25 the foe is THE GOD with no request, and S1 refuses such an upload at once (server/app.ts:355-357).
ENDLESS_RULES stays bb-0.12.0 (src/net/rulesGate.ts:562) and THE GOD's hull step 1500 (src/sim/endless.ts:162): BUMP-1G changes neither file.

**Saved runs, from the code** (W/tmp/stage0915/step2ab-notes.md = O/logs/step2ab-saved-runs.md, read at r0915-rides). The save's key
(`beltbattles.run.v7`, src/game/save.ts:39), RUN_VERSION (8, src/game/run.ts:244) and the save guard (src/game/saveGuard.ts) are unchanged.
BUMP-1G changes three src/game files (eventDefs.ts and the new smugglerPool.ts: the SMUGGLER's pools; wares.ts: holdEffects, the floor) and
adds no part, hero or rune id (src/sim/effectFloor.ts adds no ITEMS entry: :14-26). A run's wares are drawn once, when the run starts
(src/game/run.ts:263), with the floor inside the draw (src/game/wares.ts:146); a saved wares map is kept when it is well formed
(src/game/save.ts:302; src/game/wares.ts:262-266: every id buyable in the loading build, days 1-10). (a) **A run saved in 0.9.14.1 loads in
0.9.15 and goes on.** No aside line (every id it names is known: src/game/saveGuard.ts:19-39, :70-86). It keeps the wares it was dealt, so the
floor does not reach it, and its SMUGGLER can still read NONE ON OFFER for a kind its wares lack (src/game/eventDefs.ts:179). It keeps
tonight's foe if its dusk had started (src/game/run.ts:134-135), and from then on it asks for and uploads ghosts under bb-0.14.0
(src/game/day.ts:64-65, :132). (b) **A run saved in 0.9.15 loads in 0.9.14.1 (the rollback).** The same key and RUN_VERSION; every id in it,
the wares map too (the floor swaps in pieces of the SMUGGLER's two existing pools), is one 0.9.14.1 knows, so there is no aside line and the
wares map is kept whole. It goes on, and asks for and uploads ghosts under bb-0.13.0 again; its bb-0.14.0 uploads stay in the store and meet no
0.9.14.1 player. Unlike 0.9.14's rollback (section 33: 0.9.13 does not know the gate ids, sets such a save aside, and its CONTINUE drops a 0.9.14
save's wares, F6), nothing is set aside and the wares stay. An ENDLESS run is unchanged by 0.9.15 (ENDLESS_RULES bb-0.12.0; THE GOD's step
1500 since 0.9.14; S1's day-25 guard since 0.9.14.1).

**Rollback to 0.9.14.1's Fly release** (its own L4 every time, after telling the operator; never part of the launch call). Check that the
releases-before file lists 0.9.14.1's release first (v28; its number is in the CMD); if not, stop and ask the Prime. If a probe's
decks are on the store, run the clean-up first, while 0.9.15 serves. From this clone:

```sh
fly deploy --ha=false --remote-only --image <IMAGE REF of 0.9.14.1's release, from releases-before.txt>
```

0.9.14.1's release is the page (1,160,876 bytes, sha256 `8be6986bc622bc59…`, V0.9.14.1) and the server together, **on bb-0.13.0 on both
sides**: players ask for bb-0.13.0 ghosts again, bb-0.14.0's decks meet none of them, and S1's guard stays (0.9.14.1 has it). Its release
command (`seed`) re-seeds bb-0.13.0's pool: **`0 written, 192 unchanged, 0 removed`**, and leaves bb-0.14.0's decks and uploads in the bucket
under their own prefix (rehearsed on both stores: seed0915 step e and the Tigris rehearsal's step e; on Tigris, the real store, nothing is
removed). An **open 0.9.15 tab** keeps its page until it reloads; asked for bb-0.14.0 ghosts, 0.9.14.1's server answers as the Tigris
rehearsal's step f records it (health `"rules":"bb-0.13.0"`; GET match rules=bb-0.13.0 day 3 -> 200, a bb-0.13.0 ghost; GET match rules=bb-0.14.0 day 3, as an open 0.9.15 tab asks, -> 200, a bb-0.14.0 ghost (the match route reads the bucket of the rules a request names, and the rollback leaves bb-0.14.0's pool in the bucket, so such a tab keeps getting bb-0.14.0 ghosts until it reloads); PUT /v1/profile -> 401 (the route exists); an unsigned POST /v1/ghosts -> 401; 0 `skipping bad object` log lines), and it refuses that tab's uploads (its rules check takes bb-0.13.0 only:
server/app.ts:360-361). A run saved in 0.9.15 and opened on 0.9.14.1 is item (b) above. **Read in a browser** by the STAGE's rollback probe
(kit0915/rbprobe on 0.9.14.1's page, with a 0.9.15 save whose wares hold a swapped-in part and one in ENDLESS): **12 of 12 loads read as the code expects** (K/rbprobe0915/rbprobe.sh: six saves, each loaded in a browser on 0.9.15's offline page and on 0.9.14.1's offline page; O/browser/rbprobe-{0915,09141}-*.log and stills; the saves by 0.9.15's code are S1, day 8 on seed i 31, whose wares hold the floor's swapped-in SHOCK part STATIC BRUSH (without the floor that draw lacks SHOCK), S2, day 8 on i 64, swapped-in BURN part RASP, E, in ENDLESS as the game saves it (day 15's dawn, 3 endless wins), and P, day 8, plain, a word on a deck part; the saves by 0.9.14.1's code are Q1, day 8 on S1's seed with no SHOCK part in its wares, and Q2, in ENDLESS): on **0.9.14.1's page, the rollback**, every 0.9.15 save shows CONTINUE (never the aside line), CONTINUE opens the saved day (build day 8, or day 15 for the ENDLESS run), **the run's wares stay whole** (67, 66, 66 and 65 entries; S1's STATIC BRUSH and S2's RASP stay in them with their saved day), the save in storage is not rewritten (4,620, 4,484, 6,634 and 4,598 characters before and after), CONTINUE a second time works, NEW RUN works, 0 console errors; on 0.9.15's page the same saves behave the same (the control), and 0.9.14.1's own saves Q1 and Q2 load on 0.9.15's page with their wares kept whole and no aside line (the forward load). The floor changes 95 of the 2,000 table seeds (77 lack SHOCK and 18 lack BURN without it) and 138 of the first 3,000 playEndless seeds. The probe played no day after loading, so the SMUGGLER's card on a loaded day, later caravans and online play are not read (the code reading above covers them). fly.toml is
unchanged, so the image route is safe for the server. Before 0.9.14.1: 0.9.14's release (section 34's rollback, on the same rules bb-0.13.0)
and v25 = 0.9.13 (section 33's rollback, which puts bb-0.12.0 back on both sides); going back past 0.9.14.1 is a separate decision. Rolling
back loses nothing on the server.

tests/tsc-tests-baseline.json is unchanged by the rides (3,382 bytes, sha16 `216977d9b4bd72fe`, 163 type errors); the release lane did not touch it.

**The known limitations** (internal notes: the hull lane's packet section 7 and the brief's ruling 25; none is fixed here and none is a STOP):
the hull lane's balance lines (1) line 1: c5 reaches 10 wins in 23.6% of 768 runs against the 25.0% bar (noise under R1.2; bb-0.13.0 read
26.6%), (2) line 8: Easy is below Medium on days 9, 10 and 11, and parBeatsEasy fails on day 10 (R1.5; pinned in tests/rivals.difficulty),
(3) line 4 reads 85.9%, a noise-pass against R1.2's 90.0%; (4) MOTH QUEEN and SILKSHADE are over the new luck caps on day 6 (pinned in
tests/captains.luck); (5) P5 line 9 (POISON against BURN) stays report only; (6) a saved bb-0.12.0 endless run meets THE GOD's hull step 1500
from its next endless dusk (intended, since 0.9.14); (7) F1, the seed against the 256 MB VM (the release command above). The hull lane leaves
the casual-calibrated grade, PAR'S CEILING, G4, the smoke-eligibility test and the b1shots.mjs seed to bb-0.15.0. Of the three load-sensitive
tests that section 33 names, BUMP-1G gives two a time limit of their own (s8.seedcheck '(a)' and seed.test 'is 192 v3 ghosts', 120,000 ms)
and the third, bump1e.warm's memo-hit bound, the form "a fifth, or under 150 ms"; eight pool-loading tests get 120,000 ms each (the packet's
P1 and P7). Display items for a later release, carried from 0.9.14.1 (section 34): F4's GRAPNEL GUN card line that still says RIP on
the smallest phone's one-line strip (src/ui/abilityText.ts:1055-1059) and the shop-offer panel's title with no star; F11, LAST CHANCE's
title line `SAVED ON 1 HEART. PICK ONE. FREE.` (src/screens/lastChancePicker.ts:70) past both edges of a 280 px wide phone (it fits at
300 px and on every view the repo checks); F12, the desk's BELT ROUTE column (126 px) that shows `+N MORE HIT TILES
(NUMBERED ON THE DECK)` instead of a two-hit belt's IRON WALL rows. F4's old `i` info button on LAST CHANCE's cards and the road-fork drops is
gone: POLISH-2 draws the `?` there (src/screens/lastChancePicker.ts:225, src/screens/fork/drops.ts:86). Seen in this STAGE's LOOKS:
The STAGE's LOOKS (run 2; O/looks: 81 pictures of T's built page and 69 zoomed crops, all viewed; O/looks/VIEWS-V1.md, VIEWS-V2.md and VIEWS-V3.md say what each one shows) found no word on any shop card and, with one exception, no text cut or overlapping where a ride changed it. The pictures: a shop holding the effect floor's BURN part BELLOWS (the game's own caravan) and one holding its SHOCK part GALVANIC COIL (put into a wagon by hand, because no caravan of that seed's days 1 to 10 rolled it), the SMUGGLER's offers on both runs (a BURN part and a SHOCK part, never NONE ON OFFER), a belt panel with FIERY and GROWING counted (DMG 147 -> 169, BURN 1 -> 2) and the NOT COUNTED line at 360x640, 402x690 and on both desks (and as the first note of the ? view where the panel has no room), LAST CHANCE's cards, the road's drop list and the ASH SHRINE's cards with the new ?, GEAR 2-6 EMPTY on a THUNDERER panel, the four pages of MASSIVE SCRAP CANNON ★★'s ⓘ view, five-point stars in a note, a tooltip, a level list, a card and the help card, the heavy turrets' carriage-gun icon in the shop, a panel head and the ⓘ drop list, the road cards' arrows, definition notes on both desks and at 844x390, a first-run note with the how-to hint hidden, RATCHET's BRACED TEMPER, GRIMHOLD's day-6 CORE ANVIL BREECH ★★, and V0.9.15 on the title at four sizes. **The exception is PRESENT-3 S's own look:** every ★ of the 3x5 face is drawn as the 5-wide star over its 3-wide slot and the 2 columns to its left (src/render/font.ts:512-520, STAR5_ROWS :422), so in text drawn with a 1 px outline (a panel title on the desk) each later star cuts off the right part of the star before it: `DRAG CHAIN FOUNDRY ★★★` reads like ◭◭★, `FROSTBITE FOUNDRY ★★` like ◭★ and the desk face's `BRACED TEMPER ★★` the same (the base drew separate cross-like marks; the count stays readable; without an outline the stars only touch, and the 5x7 face's stars are not affected; the pre-merge stills of PRESENT-3 show no star run in the 3x5 face, so this look was not on them). Four other things seen are not changes of the rides (each re-shot at 0.9.14.1 where said, and the same there), left for a later release: (1) on the road fork's card the drop row draws a footprint grid over the 14 px icon of a 2x2 piece (src/screens/fork/drops.ts:69), so a heavy turret's new carriage gun shows in that row only as the grid with one pixel of the gun, at 402x690 and on the desk (at 0.9.14.1 the grid hid the old icon the same way; the gun is clear in the shop card, the panel head and the ⓘ drop list); (2) in the first-run state on a phone, the first-sight sentence about arrows lies over the deck's first row (src/screens/build/keywords.ts:1073-1075; PRESENT-3 H's clearing, deckClear at :610 and its two calls at :744 and :1010, covers definition notes only; the picture is byte for byte the same at 0.9.14.1); (3) on a 1920x1080 desk GRIMHOLD's turret face in the battle view cuts its title and its sub line with a dot (`RISING RAMPART CAN.`, `HEAVY TURRET IN SL.`: src/screens/build/inspector.ts:1519 fitHead and :1537 fitTitle, while src/screens/battleScout.ts:139 says a foe's sub is never cut) and leaves the core's and gear's rule lines out (the same at 0.9.14.1; only the icon differs); (4) with nine rows the road drop list's top edge slices the dimmed fork's sub-title above it (cosmetic; not re-shot at 0.9.14.1, and the rides change that list's layout code not at all: src/screens/fork/drops.ts changes only the info mark and one star flag). Also noted: the ⓘ view's last page still reads `TAP FOR MORE 4/4` (src/screens/build/keywords.ts:1188), and index.html asks for viewport-fit=cover while no safe-area inset is set anywhere in src, so on a phone with rounded corners the title's version label (4 css px from the right edge) may sit under a corner (a screenshot cannot show this).

**The checks of this STAGE** (STAGE-0915; O/STAGE-REPORT.md has every command, log and number; this paragraph is brought up to date by the
closing docs commits): step 0 (K/step0-0915.sh, 93 PASS: the tip fed433cfe5ea = r0915-rides; the scope, 120 files = the setup's difflist =
the union of the three rides' own files; 19 protected paths, all BUMP-1G's; no package file, src/version.ts, vite.config.ts or deploy/ before
the label; the rules literals and switches at the file:line above; the six generated files' bytes; 564 test files, 12 new; no file of the
stand-in generators' closure (104 files) changed since bump1g-accepted); step S (the stored pools, never regenerated): S.1 the stored bundle's
`--check` over the stored resume dir `check: IDENTICAL: regenerated 101654 bytes` (all 16 days), S.2 day 5 regenerated from scratch with a
bundle built from r0915-rides: both heroes' files, furnace and weaver, identical to the stored files after the key, S.3 gen:ghosts IDENTICAL
(server/seedPoolData.ts 402,688 bytes `5756d795170150f6`); step 2 at r0915-rides (tsc 0, typecheck:server 0, typecheck:tests PASS at 163,
the fingerprint and all 41 parBench lines IDENTICAL to the hull lane's pins). The label tests (7 files, 33 tests); the page smoke 4 of 4 on the offline and on the online page at 0 console errors, 0 NOT HONEST and `version 0.9.15` on 4 of 4. At the release record's commit the gate (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, the three builds and the knobs build exit 0, the smoke 45 of 45, luckcaps `check: IDENTICAL: regenerated 7401 bytes`); fp (857,755 bytes, `921e2202aa58bc4a`) and all 41 parBench lines (`e1ec0b3c`) IDENTICAL to the hull lane's pins; runnercopies all SAME; seedcheck 14 of 14 yes; probecheck 23 of 23 yes; the seed rehearsal 8 PASS (0.9.14.1's seed `192 written, 0 unchanged, 0 removed`, this commit's seed `192 written, 0 unchanged, 0 removed` under bb-0.14.0, again `0 written, 192 unchanged, 0 removed`, and the rollback seed `0 written, 192 unchanged, 0 removed`); the boot; the Tigris rehearsal's steps a to e PASS and f recorded; server/dist against 0.9.14.1's (eight of nine differ, six in content, all BUMP-1G's); the six generated files' bytes SAME; and no file of the stand-in generators' closure (104 files) changed since bump1g-accepted (127 files changed) or since r0915-bump (41). The text sheets ON (3,141 lines) and OFF (3,131): 3 lines differ from 0.9.14.1's in each (line 1, the label and the rules, and the two lines of RATCHET's TEMPER, `FIERY TEMPER` -> `BRACED TEMPER`), 0 overflows. capsearch (report only) lists the same 19 captains as 0.9.14.1; GRIMHOLD's day-4 and day-5 budget lines are gone and MOTH QUEEN's and SILKSHADE's luck-cap lines moved with the new caps. The rest of the STAGE's checks, at T (run 1 and run 2): the suite (`bash K/suiterr.sh 8eec84d2a551 6`, six batches of 94 files at `--maxWorkers=2`, nice 10, 16 min 23 s at load 9 to 19) is ALL GREEN, 564 files in one round (562 passed and 2 skipped whole, tests/portraits.sheet and tests/balance; 6,743 tests declared, 6,732 passed, 11 skipped; no red, no time-out), against 0.9.14.1's suite (552 files, 6,646 tests) 12 new files (tests/bump1g.cachekey and effectfloor.draw; polish2.glyph, guest, hint, infoPages and words; present3.arrow, cannon, firstrun, gearfold and star) and three files whose count moved (tests/beltside.shaped 20 -> 23, present2.column 11 -> 16, shopcard1f 24 -> 23); the pool canary (`BB_POOL_CANARY=1`, tests/net-pool) 5 of 5. The browser block, each group alone after K/b/waitclear.sh: touch noprof 2,420 of 2,420 and mixed 1,153 + 1,160, every count by section equal to 0.9.14.1's; card3check 13, stylecheck 180, explaincheck 35, surge 4, asynccheck 62, rcruns 32 offline and 44 online (0 console errors; the only NOT HONEST line is F10's control), motion taps 123, runeshots 103, introcheck's title mode 198, the mirror PASS, stills c1 and p1 with 0 failed checks, the field and scout stills, LAST CHANCE's shots (28 PASS); the rollback probe 12 of 12 (above); the pixel account against 0.9.14.1's 311 shots-det frames: 63 differ, each with its cause (a frame may have two: the label's 6 title frames, POLISH-2's 8 fork frames, PRESENT-3's 56; BUMP-1G alone moves none); in run 2 all 63 were also viewed base against tip (two read-only helpers, O/shotsdet-cmp/VIEWS-P1.md and VIEWS-P2.md, every cluster of changed pixels looked at): 63 explained, none unexplained, every changed pixel is its cause's (the label, the `i` -> `?`, the road arrows, the stars, the heavy-turret icon under the fork row's grid), and the one defect inside a cause is the star run of PRESENT-3 S described above (the stars of an outlined 3x5 title overlap). The mutants (`bash K/mutpar-both09141.sh 8eec84d2a551`, nine units in one call, 13 min 23 s): 39 apply; 37 of 37 current mutants are caught, each red on an assertion (no `Test timed out` in any log); CM2c and CM2d (rules prefixes bb-0.10 and bb-0.11) survive by design and are superseded by CM2e and CM2f (cap's ruling, oracle 41a9a6482f1e054b: the near-miss labels of tests/rc.rules.test.ts, :211-217, are derived from RULES_VERSION and name bb-0.13.0, bb-0.14.1 and bb-0.12.0, so a check loosened to a prefix of an older line still passes, which is expected and no gap); a hand mutant of S1's day-25 guard is caught (tests/s1.endlesscap and tests/endless1.server, 8 failures) and CM2b's old prefix by hand stays green (not counted). Perf (report only, motionperf against 0.9.14.1's page): 60 fps and 0% of frames over 20 ms in all ten rows, the build screen's game work 1.38 ms against 1.36 ms at 4x and 0.64 against 0.68 ms at 1x: not slower. The seed's small-machine read (report only, K/seedmem.sh, one core, nice 10): with default flags 13.7 s and 258,276 kB on this host (98% of the 262,144 kB VM); under `--max-old-space-size` 128, 96, 64 and 48 the seed exits 0 at 206,228, 212,500, 204,084 and 214,528 kB (77 to 81%), and with `--max-semi-space-size` 4 and 2 as well at 176,812 and 168,640 kB; none was taken on a real 256 MB machine. The seed pool's floor-record counts quoted in section 5, item 5 were recounted at T and hold exactly (12 on day 1; 6 on days 2, 3 and 11; 5 on days 7, 9 and 13; 4 on the others).

## 36. 0.9.15.1: clearer faces, panels and drop rows (client page release; rules bb-0.14.0 kept; its own L4)

0.9.15's launch is section 35 (clone beltbattles-r0915, branch r0915, tag stage-0915, tip bf288fb0ebf7). It has run: Fly serves 0.9.15 as release v29
(image registry.fly.io/beltbattles:deployment-01M6XV00ACXZ2KGHG69555EYHH, since 2026-11-08 at about 15:05Z; tag live-0915 = stage-0915 = bf288fb0ebf7), the
page and the server together on bb-0.14.0, and **v29 is the rollback target below**. This section is 0.9.15.1's launch, from this clone
(beltbattles-r09151/BeltBattles-r09151, branch r09151; write `refs/heads/r09151` or a tag; r09151-base = stage-0915 = live-0915 = bf288fb0ebf7), staged on
2026-11-08. **Never deploy it unless Fly serves 0.9.15**: 0.9.15.1 holds 0.9.15's rules bump (it is 0.9.15 plus the rides below), so a deploy on top of
0.9.14.1 would launch the rules release without section 35's guards; the launch call's guards below refuse unless Fly serves 0.9.15's page, byte for byte.

0.9.15.1 is a **client page release** (a new page, as 0.9.10, 0.9.12 and 0.9.14.1 were, and with no server change): the battle rules stay **bb-0.14.0**, and
no file under src/sim, src/net, src/core, src/game or server/ differs from 0.9.15 (`git diff --name-only r09151-base <this commit> -- src/sim src/net src/core src/game server tools` lists nothing; the label moves package.json and package-lock.json only in their version fields), so the stored decks, the
pool and the saves are untouched, and a 0.9.15 page and a 0.9.15.1 page meet each other's ghosts (both ask for, and upload under, bb-0.14.0). It is three
rides, put on stage-0915 by cap in this order (REQ-BFG-081, -113, -087, -004 and -089):
- **PRESENT-4** (the presentation lane 51a13003; `present4-accepted`, tag object f32824635e8a -> 64d23f074439, a fast-forward from the base: 6 commits, 12
  files, +918 -20, tree 06813059e9bc): display only. S2: an outlined 3x5 run of stars reads whole (src/render/font.ts pass(); REQ-BFG-081). G: the road's
  drop row shows a shaped part's icon whole, with a small footprint mark (REQ-BFG-113). T: on a phone's first run the rig sentence clears the deck
  (REQ-BFG-087, -004). N: the info view's last page reads `TAP TO CLOSE N/N` (REQ-BFG-089). Each answers a display item that section 35's LOOKS paragraph
  records (the star run, the drop row's footprint grid over a 2x2 icon, the first-run sentence over the deck, the last page's `TAP FOR MORE 4/4`). M (the
  carriage gun's muzzle pixel) and its revert are net 0.
- **The POLISH chain** (the pieces lane 0551e0fb; POLISH-3, 3b, 4, 4c, 5 and 6; `polish6-accepted`, tag object 8c7d57dcb4dd -> 7ce9207865f9, which holds
  polish3- to polish5-accepted: 30 commits, no merges; 49 files, +4,224 -162; merged by cap with --no-ff as a9c01cbceafa, tree 3aac27f1120e, the pieces
  lane's own merge-tree; REQ-BFG-089 and -087): display and words fixes (battle faces, panels, the ENCHANTER's days, the road and the shop, words). It
  overlaps PRESENT-4 in src/screens/build/inspector.ts and keywords.ts only (both auto-merged; no shared test).
- **RIDE L1** (the hull lane 6c99be48; cap's config-only commit 19fb9b2bbb69): fly.toml gains the launch lines (the launch config, below). No player sees it.
The label moves 0.9.15 -> **0.9.15.1** (src/version.ts:2, package.json:4, package-lock.json:3 and :9; four parts, as 0.9.14.1 was: npm runs `npm ci` with
it; the server image runs no npm; the title prints `V${VERSION}`), so the title reads V0.9.15.1. docs/CHANGELOG.md's 0.9.15.1 entry says it in players'
words (each claim checked in the code; O/STAGE-REPORT.md lists file:line for each). This release also retitles 0.9.15's section there, and section 35
above, to what the code does (the hull lane's ruling F2): `0.9.15: every run's shops offer a SHOCK and a BURN part, and clearer panels` (the effect floor
puts a SHOCK and a BURN part among each run's wares: src/sim/effectFloor.ts:28, src/game/wares.ts:146); the bodies are unchanged.

**What ships.** Branch r09151 at its tip (tag stage-09151, made when the STAGE ends; the launch text names its 12 hex): r09151-base (stage-0915); the
three rides above (`r09151-rides` 19fb9b2bbb69 against r09151-base: 60 files, A 32, M 28, D 0: other src 15, scripts 4 (scripts/faceClose.mjs and
scripts/warlordSetup.mjs new; scoutshots.mjs and touchcheck.mjs: test tools, not shipped), tests 40 (27 new test files, 591 in all), the launch config 1;
nothing under src/sim, src/net, src/game, src/core, server/, tools/, docs/ or deploy/; **none of them under the protected paths**; no package file and no
src/version.ts before the label); scripts-only commits (the first: scripts/rcruns.mjs's version check follows the label, the brief's ruling 8; any later tooling fix is named in O/STAGE-REPORT.md); the label
commit 8916ac159bca (src/version.ts, package.json, package-lock.json, the label pins in tests/; the pages are built here) and the CHANGELOG commit
4d20549fabb8 (docs/CHANGELOG.md only); and the release record, commit
6562173238bc (tag r09151-T): deploy/GAME_BUILD.txt and this runbook. After r09151-rides only those files change (the label's three files, the label pins in
tests/, scripts/ tooling fixes, docs/CHANGELOG.md and deploy/). No pool or stand-in is regenerated (ledger A2 of O/LEDGER-09151.md, the STAGE's check ledger:
no file of the stand-in generators' closure, 104 files, changed since 0.9.15; the six generated files are 0.9.15's bytes).
- **The page** is BeltBattles-0.9.15.1-8916ac159bca-online.html, 1,176,557 bytes, sha256 `0e6b7aed33fc9297…` (GAME_BUILD.txt holds the
  whole hash), built at 8916ac1 and staged from ../output-stage09151/pages/. It is 6,825 bytes larger than 0.9.15's page (1,169,732;
  sha16 `b4f84e0f3100a3c8`). Shore gets the offline page of the same commit: BeltBattles-0.9.15.1-8916ac159bca.html, 1,176,546 bytes,
  sha256 `f0a2e209b9a4eaec…` (= ../output-stage09151/shore/index.html; 6,825 bytes larger than 0.9.15's offline page, 1,169,721 bytes,
  sha16 `52940498c4bd8624`).
- **The server does not change** (this is why the release is a page release): server/dist built at this commit is expected byte for byte 0.9.15's
  (W/ref/0915-dist, T(0.9.15)'s export, the server/dist of 0.9.15's launch: 9 files, 1,715,024 bytes; kit09151/srvdiff.sh, O/logs/srvdiff-<commit>.txt,
  which ends `SRVDIFF: IDENTICAL` when no file differs by bytes), because server/, src/net, src/sim and src/core are unchanged since 0.9.15 (ledger A3). The
  server rehearsals below (the seed, the boot, the probe, revalidate, the Tigris rollback) are 0.9.15's, carried on that premise; the checks paragraph at the
  end gives the STAGE's read of it. The Dockerfile, .dockerignore and deploy/stage.mjs have no change since r09151-base; fly.toml gains the launch lines
  (next bullet). Uploads stay open.
- **The launch config** is tracked now (RIDE L1: cap's config-only commit 19fb9b2bbb69, numstat `11 0` on fly.toml alone; fly.toml is 2,849 bytes, sha16
  `383a063f00df9673`). Through 0.9.15 the release command's two settings lived only in an untracked launch.toml (built from fly.toml at each
  launch); from 0.9.15.1 they are in fly.toml itself, under `[deploy]`: `release_command_timeout = "15m"` (the wait for the release command; it was 5 min)
  and `[deploy.release_command_vm]` with `size = "performance-1x"` (one dedicated core for the seed): the 11 added lines are a 5-line header comment, a
  2-line comment, those three settings' lines and one empty line, and no other line of fly.toml changed. **A launch therefore needs no extra config file**:
  no `--config`, no untracked launch.toml; the plain `fly deploy --ha=false --remote-only` from the repo root reads them. Why: on a shared-cpu-1x the
  seed is held to the 1/16-core baseline (0.9.14's first launch attempt: about 95 s of CPU, 11.6 min, and Fly's v26 failed at the 5 min default, replacing
  nothing). **What to read in the release output** (and in the deploy's logs): the release machine's size, which must be performance-1x, and the seed's
  time, which must come in inside the 15 minutes (section 4: flyctl prints only `release_command <machine> completed successfully`, and the `seed:` line is in
  `fly logs -a beltbattles --no-tail`; ledger C3 is this launch's read: the seed ran on the performance-1x release machine inside 15 min).
- **The rules** are bb-0.14.0 and no literal moved: RULES_VERSION (src/sim/content.ts:61), PROBE_RULES (server/ghostProbe.ts:120), SEED_POOL_RULES
  (server/seedPoolData.ts:8; server/seed.ts:92 refuses a pool dealt under other rules); GATES_RULES (src/net/rulesGate.ts:318) and ENCHANT_RULES (:360)
  stay bb-0.13.0; SCALE_RULES (:512) and ENDLESS_RULES (:562) bb-0.12.0; LONG_RUN_RULES (:493) and SHAPES2_RULES (:278) bb-0.11.0; HEARTS_RULES (:433),
  PICK_RULES (:453), OPEN_RUNES_RULES (:477), FREE_JOINS_RULES (:222), SHAPES_RULES (:238) and NPC_DAY_RULES (:206) bb-0.10.0 and LAST_CHANCE_RULES
  (:190) bb-0.9.7; FIRST_RUN stays false (src/sim/firstRun.ts:35); POOL_RULES_CARRIED is empty (src/sim/content.ts:71). A 0.9.15 page and a 0.9.15.1 page
  both ask for, and upload under, bb-0.14.0, so **they meet each other's ghosts**; the fingerprint (857,755 bytes, sha16 `921e2202aa58bc4a`) and all 41
  parBench lines (`fingerprint all: e1ec0b3c`) are 0.9.15's, carried (ledger A1: `git diff --quiet 8eec84d2a551 <this commit> -- src/sim src/net src/core src/game` exits 0).
- **A saved run, from the code.** The save's key (`beltbattles.run.v7`, src/game/save.ts:39), RUN_VERSION (8, src/game/run.ts:244) and the rest of src/game
  are unchanged (ledger A4: `git diff --quiet bf288fb0ebf7 <this commit> -- src/game` exits 0): **a run saved in 0.9.15 continues in 0.9.15.1, and a run
  saved in 0.9.15.1 is a 0.9.15 save** (the rollback does not cost a player the run in progress).

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store holding bb-0.14.0's 192 pool ghosts (days 1-16, 12 a day; 0.9.15's own
launch wrote them: `192 written, 0 unchanged, 0 removed`) and this commit's bundle carries the same pool (server/seedPoolData.ts is 402,688 bytes, sha16
`5756d795170150f6`, byte for byte r09151-base's and 0.9.15's): `seed: rules bb-0.14.0, 192 pool ghosts on tigris (...)` with **`0 written, 192 unchanged, 0 removed`** at the launch, as on every later deploy of the same image. Nothing under any other rules is touched (bb-0.13.0's 192 pool ghosts and every upload
under it stay as they are). Carried from 0.9.15's STAGE, not re-run (ledger A3): the seed rehearsal on its real CLI and 0.9.14.1's (section 35: kit0915/seed0915.sh, a scratch JSON-lines store, 8 PASS) read this image's seed over a store that already holds the pool as **`0 written, 192 unchanged, 0 removed`** (its step c), pool.jsonl byte-identical, `list --rules bb-0.14.0` `all 192 0 0` and revalidate's dry run `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and 0 upload(s)`; on the Tigris path (kit0915/tigris-rollback.sh against the fake S3) the same steps passed
with every object byte for byte and no DELETE request. The seed plays no battle, but it checks all 192 ghosts first (the strict decoder, the rules,
validateUpload in the player mode and the reachable record), whether or not it writes them, so its cost is what 0.9.15's STAGE read for it: step b 11.1 s and
a peak RSS of 267,136 kB, step c (the same seed again: the case of this launch) 11.2 s and 273,516 kB, and 14 s and 256,464 kB on one pinned core
(kit0915/seedtime.sh), on a 30 GB host: 89-104% of a 256 MB VM's 262,144 kB (finding F1, section 35). Those reads compare with fly.toml's [[vm]] size (256 MB),
the size that sections 33 to 35 give the release machine; RIDE L1's `[deploy.release_command_vm]` sets performance-1x instead, so read the size and the time
in the release output (the launch config above).

**The boot** is section 35's, unchanged (carried: ledger A3). The server warms roadCap's memo once the port is open and uploads are open (server/main.ts,
server/warm.ts). After the deploy and after a restart, look for the line `road model warmed for days 1-25 under rules bb-0.14.0 in <ms> ms` (server/warm.ts:26) in `fly logs -a beltbattles --no-tail`. 0.9.15's rehearsal (kit0915/boot0915.sh, section 35): the first /v1/health 200
at 467 ms after the process start, the warm-up line at 1,591 ms (`in 1434 ms`), 124,076 kB after it and a peak of 128,548 kB (49% of the 256 MB VM); a restart
470 ms and 1,622 ms, 123,344 kB and a peak of 130,156 kB; both far inside fly.toml's 10 s grace period.

**The launch call is the Prime's** (CMD-09151, from CMD-0915's text; run once, under its own operator approval, L4, and only while Fly serves 0.9.15). Fly
serves 0.9.15's page now, so the guards are: refuse unless Fly serves the 0.9.15 page, byte for byte (`content-length: 1169732`, sha256 `b4f84e0f3100a3c8…`),
and /v1/health reads `"rules":"bb-0.14.0"`, and `fly releases -a beltbattles --image` lists 0.9.15's release (v29) first (keep it as releases-before.txt: the
rollback needs it; both releases play bb-0.14.0, so health cannot tell them apart: the page's bytes do); then stage the 0.9.15.1 page, deploy once
(`fly deploy --ha=false --remote-only`: the image carries the same server/dist and the new page, and fly.toml's own lines give the release command its machine and its 15 minutes), and run section 5's live checks with this page: health `"rules":"bb-0.14.0"` and `"uploads":"open"`, `content-length: 1176557`, `live page = the staged 0.9.15.1 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`), day 3 at 1 win and 9 hearts (a v3 bb-0.14.0
snapshot), days 17, 25 and 26 as 0.9.15's seedcheck read them (section 35: days 17 and 25 `-> 200`, each served a day-16 ghost; day 26 `-> 400`, `day: expected an integer in 1..25`), an unsigned POST `-> 401`, and `list --rules bb-0.14.0`: sixteen day rows of 12, then `all 192 0 0` (or `all 192 N P`, if real
players have uploaded since 0.9.15's launch; `list --rules bb-0.13.0` still reads `all 192 N P`: 0.9.14's and 0.9.14.1's pool and uploads stay). Section 5's
one-line call asks only days 1-16 and day 3: add `day=17`, `day=25` and `day=26` queries to see those three lines. In `fly logs -a beltbattles --no-tail`: the
`seed:` line above and the warm-up line. The page's own label (V0.9.15.1 on the title) tells the two pages apart in a browser.

**The probe block** is section 35's, unchanged (carried: ledger A3; the plan is the same twenty POSTs and the endless match; the probe-id file is
../output-stage09151/probe-id.txt, which must not exist yet): `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage09151/probe-id.txt`
prints **24 lines** (the header `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.14.0); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`, 21 checks, `probe player:` and the summary), ending **`probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10); the player id is in ../output-stage09151/probe-id.txt`** (with `--profile` after the id file, two
PUTs more and **`23 of 23`**); revalidate's dry run `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and 10 upload(s)` (the probe's 10, plus
any real player's upload since 0.9.15's launch); `remove-player <id> --rules bb-0.14.0 --apply` prints its `delete ghosts/bb-0.14.0/dNN/player/<id>.json` lines and
**`APPLIED: deleted 10 of 10 record(s).`** (the Tigris store enumerates days 1 to 25, so it finds the probe's day-14 ENDLESS record too); then `fly apps restart beltbattles`, health again, and `list --rules bb-0.14.0` reads `all 192 0 0` (or `all 192 N P`, if real players have uploaded). 0.9.15's rehearsal on the built
commit (kit0915/probecheck.sh, section 35): 23 `expect:` lines, all yes, none no. **The hand clean-up** is section 30's block run from this clone, with at most
10 decks: its `cd` names /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r09151/BeltBattles-r09151, both `../output-stage0911/probe-id.txt` become
`../output-stage09151/probe-id.txt`, and both `--rules bb-0.11.0` become `--rules bb-0.14.0`.

**Revalidate** is section 35's, unchanged: after the deploy run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.14.0'`
(a dry run; add `--apply` only if it plans deletes you expect) **over the stored bb-0.14.0 records only, in a fresh process** (each `fly ssh console -C` is one).
The dry run prints `plan: delete 0 record(s) of bb-0.14.0; keep 192 seed-pool ghost(s) and N upload(s)` and `DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.`, and, only when the store holds a stored endless snapshot past day 25, S1's one line (section 7). **S1's read-only check after the
deploy, the days a GET answers 200 for and ENDLESS online** are section 35's too (the guard is in this server: server/app.ts:355-357 and
server/ghostAdmin.ts:271): on the machine run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.14.0'` and the same with
`--rules bb-0.13.0`; a row whose day is above 25 with uploads above 0 would be a stored endless snapshot past the bound: expect none.

**Rollback to 0.9.15's Fly release v29** (its own L4 every time, after telling the operator; never part of the launch call). Check that the releases-before
file lists 0.9.15's release first (v29; its image is registry.fly.io/beltbattles:deployment-01M6XV00ACXZ2KGHG69555EYHH, and the file must agree); if not, stop
and ask the Prime. If a probe's decks are on the store, run the clean-up first, while 0.9.15.1 serves. From this clone:

```sh
fly deploy --ha=false --remote-only --image <IMAGE REF of 0.9.15's release (v29), from releases-before.txt>
```

0.9.15's release is the page (1,169,732 bytes, sha256 `b4f84e0f3100a3c8…`, V0.9.15) and the server together, on the **same rules bb-0.14.0** on both sides: the
stored decks and the pool are untouched by a rollback. Its release command re-seeds the same pool and writes nothing (**`0 written, 192 unchanged, 0 removed`**; step c of seed0915.sh, carried: ledger A3). Saves carry both ways (the saved-run bullet above): a run in progress in 0.9.15.1 continues in 0.9.15 (a
0.9.15.1 save is a 0.9.15 save: SAVE_KEY src/game/save.ts and RUN_VERSION src/game/run.ts are unchanged; ledger A4). An open 0.9.15.1 tab keeps its page until
it reloads; its matches and uploads use the same rules, so they work against 0.9.15's server. fly.toml's env and VM lines are unchanged (RIDE L1 added only
the release command's two settings), so the image route is safe for the server. Before 0.9.15: 0.9.14.1's release (section 35's rollback, which puts bb-0.13.0
back on both sides), 0.9.14's (section 34's) and v25 = 0.9.13 (section 33's rollback, which puts bb-0.12.0 back on both sides); going back past 0.9.15 is a
separate decision.

tests/tsc-tests-baseline.json is unchanged by the rides (3,382 bytes, sha16 `216977d9b4bd72fe`, 163 type errors); the release lane did not touch it.

**The known limitations** of section 35 stand, except where a ride of this release changes one (PRESENT-4's four items above answer display items that section 35
records; the STAGE's report says which of section 35's findings each ride changed). Accepted with the rides, not findings (the brief's ruling 14): POLISH's V1
(12 ENCHANTER-day belt views put the NOT COUNTED line behind the i without gaining a row), V2 (VOSS's two 1920x1080 belt faces at a 1 px gap), V3 (battle faces
under the minimum gap: 42 -> 46 at band-300x640 and 28 -> 32 at 360x640), P6-R1 (the word cards cross the deck for 0.1-0.2 s at roll-out), V10 (at 360x640@2
with a rune held and 6 or 7 offers the word-card row overlaps the hull by 1 px), POLISH-3 and 3b's faces under the minimum, SPARKFANG's six faces and the 12 foe
faces; and PRESENT-4's G misses its cold-read cells bar (kept, packet Q2).

**The checks of this STAGE** (STAGE-09151; O/STAGE-REPORT.md has every command, log and number, and O/LEDGER-09151.md every check's row: what ran at the label
commit or at T, and what it carried from 0.9.15's STAGE with the proof's exit code; this paragraph is brought up to date by the closing docs commit): Run 1 ran, at T 6562173238bc unless noted: step 0 (91 rows PASS); the whole suite once at the label commit 8916ac159bca (ALL GREEN, 591 files, 7,045 tests = 7,034 passed and 11 skipped; three files that were red only on time, under another lane's load, passed alone at nice 0), carried to T by the L..T rule; the gate (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, the three builds and the knobs build, the smoke 45 PASS 0 FAIL, luckcaps `check: IDENTICAL: regenerated 7401 bytes`); srvdiff against 0.9.15's server/dist (IDENTICAL: 9 files, 1,715,024 bytes, 0 differ); labeltest (7 files, 33 tests); the seven mutants of the ledger's run list (7 of 7 caught); the pages' off and on runs (4 of 4 each, 0 console errors, `version 0.9.15.1` on 4 of 4, the page after each run unchanged); runeshots (103) and the samepixels account (46 of 311 shots-det frames differ, each in a class: the label 6, PRESENT-4 13 of 13, the POLISH chain 28 of 28); card3check 13, stylecheck 180, explaincheck 35, surge 4, mirror PASS, asynccheck 62, introcheck title 198, stills c1 and p1 0 failed, lcshots 28 PASS lines, motion taps 123 (each as 0.9.15's); touch noprof 2,487 of 2,487 (0.9.15's 2,420 plus the 67 checks of `apply`'s three new views) and touch mixed part 1 1,153 of 1,153 (as 0.9.15's); the text sheets (only the label line and GRAPNEL GUN's line move). Carried from 0.9.15's STAGE with each proof's exit code at T (ledger section A): fp and parBench, the pools, the stand-ins and the generated files, every server row (the seed rehearsal, seedcheck, probecheck, seedtime, boot, revalidate's dry run, the Tigris rollback, the canary), the rollback probe, and 30 of the 37 current mutant units; skipped as report-only: capsearch, seedmem, motionperf. Run 2 (task 0e85a040f007f925) ran, at T 6562173238bc: touch mixed part 2 (1,227 of 1,227, 0 FAIL: 0.9.15's 1,160 plus the 67 checks of `apply`'s three new views, desk, laptop and phone-land; noprof's 2,487 carries the same 67); rcruns off 32 of 32 and on 44 of 44 (as 0.9.15's; F10's CONTROL the only NOT HONEST line; 0 console errors); and the LOOKS' bespoke captures on T's built page, all viewed (the ENCHANTER's dawn at 844x390, 1366x768 and 1920x1080, with FIGHT's arrow left of FIGHT after one placement; a first-run phone's rig sentence inside the panel and a SORTING ARM belt reading COPIES 1.3 in the two-column readout; VIEW BATTLEFIELD at 844x390 with BACK and ON TO DAWN stopping at the face, and a bare face at 926x428 closed by a press off every part; MASTER VOSS's turret reading `TURRET SLOT 1` at 280x653; GRIMHOLD's face whole on the 1920x1080 desk): no clipped or overlapping text from the rides and no word on a shop card; the one overlap seen, a first-run definition note over a belt panel's rows, is 0.9.15's own behaviour (the same scene on 0.9.15's page draws it in the same place; it shows once per word and is gone with the tips done). Nothing of the ledger is left to run.

## 37. 0.9.16: a fairer climb to the tenth win (rules release bb-0.15.0; server and client in one launch; the operator's yes first)

0.9.15.1's launch is section 36 (clone beltbattles-r09151, branch r09151, tag stage-09151, tip 89bb5abacfbb). It has run: the hosting service serves 0.9.15.1 as release v30
(image registry.fly.io/beltbattles:deployment-01M72YAPXXJRGYNC7NTDH9PVWW, since 2026-11-10 at 14:40:19Z; tag live-09151 = stage-09151 = 89bb5abacfbb), the page and the server
together on bb-0.14.0, and **v30 is the rollback target below**. This section is 0.9.16's launch, from this clone (beltbattles-r0916/BeltBattles-r0916, branch r0916; write
`refs/heads/r0916` or a tag; r0916-base = stage-09151 = live-09151 = 89bb5abacfbb), staged on 2026-11-11. **As of 0.9.17's staging it is staged and accepted (tag stage-0916 = 3eb2669e9a6a) and has NOT been launched**: 0.9.15.1 is still live, and this launch waits for the operator's yes. **If 0.9.17 is launched on top of 0.9.15.1 instead (PATH B, section 38), this section's launch never runs alone: section 38 carries all of 0.9.16 with it.** **Never launch it unless the hosting service serves 0.9.15.1**: 0.9.16
holds 0.9.15.1 (BUMP-1H's tip is the hull lane's merge of stage-09151), so a launch on top of 0.9.15 would ship 0.9.15.1's rides without section 36's launch; the launch call's
guards below refuse unless the live page is 0.9.15.1's, byte for byte.

0.9.16 is a **rules release** (route B, as 0.9.11, 0.9.13, 0.9.14 and 0.9.15 were): the battle rules move to **bb-0.15.0**, so the page and the server ship together, in **one launch**,
and **never the page alone**: a 0.9.16 page asks for, and uploads under, bb-0.15.0, and only this release's server holds that pool and takes those uploads (0.9.15.1's server takes
bb-0.14.0 only: server/app.ts:360-361). It is two accepted parts, put together by cap (setup.log phase a, sections 3 to 5):
- **BUMP-1H** (the hull lane 6c99be48; REQ-BFG-124; tag bump1h-09151, tag object 9e2a5c64fa47 -> 69dadf893143, tree 01ccb7d6efef, also tagged r0916-bump: the hull lane's merge of
  stage-09151 and two tests-only re-pins, so r0916 starts there; 81 files against stage-09151, +1,468 -422, 27 commits; 15 of them not tests; the hull lane's packet is
  W/ref/bump1h/PACKET-STAGE-BUMP1H.md). **Battle rules bb-0.15.0**: **the casual ghost** (on every day, one of each hero's two everyday ghosts is the deck that a casual player's
  decks beat about half the time); **the streak tier** (days 7-12: one more ghost per hero, at the record that the AI's runs most often have by then, 6 wins and no loss on day 7 up to 9 wins and 2 losses on day 12: tools/samplePool.ts:940); **depth** (14 depth ghosts on the busiest matchups: 11 matchups hold a second ghost and 3 of those a third; tools/samplePool.ts:946-948); **H2** (the
  four Easy captains' day-5 words are BRACED); **H3** (MOTH QUEEN has no HEATJACKET from day 5, SILKSHADE no COUNTERWEIGHT from day 4); the switches **CURVE** (src/net/curve.ts:23)
  and **SOFT1_CURVE** (tools/samplePool.ts:356) are on; **one regeneration**: the 230-ghost seed pool (the 192 of 0.9.15, 37 of them with a new deck, 24 streak ghosts and 14 for the busiest matchups: docs/CHANGELOG.md:10-11 at the CHANGELOG commit), the
  stand-in pool (its 192 decks are identical; only its two rules literals moved) and the luck caps (regenerated identical). Its 15 non-test files: docs/CHANGELOG.md,
  scripts/b1shots.mjs, server/{ghostProbe,seedPoolData}.ts, src/net/{curve,pick,rulesGate}.ts, src/sim/{content,npcWords,rivalBuilds,standInPoolData}.ts,
  src/sim/harness/casual.ts and tools/{genGhostPool,samplePool,smoke}.ts.
- **PRESENT-5, carrying BACKDROP-1 and BACKDROP-2** (the presentation lane 51a13003; REQ-BFG-113 and -115 (PRESENT-5), -073 (BACKDROP-1) and -058 (BACKDROP-2); tag
  present5-accepted, tag object 9b4b2faad38c -> a94d9a0f302c, which descends from stage-09151 and holds backdrop2-accepted 5b3a5cb0cfed and backdrop1-accepted ffeaadd3b1e7; 21 files,
  +2,313 -41; cap's --no-ff merge 84d19adbe5b3 onto BUMP-1H's tip, tree 6eea04fd3945 = merge-tree's, tag r0916-rides, tag object 75ee038ed1c9): display only. LAST CHANCE's card
  column, and the dawn rune pick's cards and YOUR RUNES tray, stand on one solid "dark" panel (BACKDROP-1 and BACKDROP-2: lcGround in src/screens/lastChancePicker.ts, pickGround in
  src/screens/runePicker.ts); M2, the heavy turrets' gun icon loses a detached white pixel (src/render/turretIcon.ts:33); A, the narrow phone shop card draws a rig's arrowheads 4 px
  (src/ui/shapePic.ts, src/screens/build/shop.ts:335); G5, the scout report's deck, a warlord card's reward parts (the CHANGELOG names the IRON MATRIARCH's legendary part, on a phone held upright) and LAST CHANCE's part-card corner fallback
  draw a shaped part's icon whole with a small footprint mark (src/screens/event/reveal.ts:61, src/screens/fork/cards.ts:71, src/screens/lastChancePicker.ts:539); G2a, one helper, no pixel moves. The operator saw
  the stills (BACKDROP's at about 21:35Z on 2026-11-08, PRESENT-5's at about 02:27Z on 2026-11-09) and raised no objection.
- **The merge is file-disjoint** (setup.log section 5): the merged tree differs from the bump's in exactly the ride's 21 files and from the ride's in exactly the bump's 81, and no
  file is in both.
The label moves 0.9.15.1 -> **0.9.16** (src/version.ts:2, package.json:4, package-lock.json:3 and :9; three parts again), so the title reads V0.9.16. docs/CHANGELOG.md's 0.9.16
entry says it in players' words (each claim checked in the code: O/STAGE-REPORT.md lists file:line for each).

**What ships.** Branch r0916 at its tip (tag stage-0916 = 3eb2669e9a6a, made when the STAGE ended; the launch text names its 12 hex): r0916-base (stage-09151); r0916-bump (BUMP-1H, above); the ride's
merge (`r0916-rides` 84d19adbe5b3 against r0916-base: 102 files, the union of the two parts' own files (81 + 21), A 13, M 89, D 0, 43 commits: src/sim 5, src/net 3, src/game 0,
src/core 0, other src 8, server 2, tools 3, scripts 1, tests 79, docs 1, deploy/ 0; **13 of them under the protected paths, all BUMP-1H's, by design in a rules release**:
server/ghostProbe.ts, server/seedPoolData.ts, src/net/{curve,pick,rulesGate}.ts, src/sim/{content,npcWords,rivalBuilds,standInPoolData}.ts, src/sim/harness/casual.ts and
tools/{genGhostPool,samplePool,smoke}.ts; no package file, src/version.ts, vite.config.ts, index.html or deploy/ before the label); scripts-only commits (the first: scripts/rcruns.mjs's
version check follows the label, the brief's ruling 8; any later tooling fix is named in O/STAGE-REPORT.md); the label commit 161a9829b173 (src/version.ts, package.json, package-lock.json, the
label pins in tests/rc.label.test.ts and tests/packs.rules.test.ts, and RIDE T1's two test limits: tests/polish2.infoPages.test.ts:146 and tests/card4.test.ts:538 get 120,000 ms; the
pages are built here) and the CHANGELOG commit a80237467190 (docs/CHANGELOG.md only); and the release record, commit 7c8f8312484f (tag r0916-T): deploy/GAME_BUILD.txt and this runbook. After
r0916-rides only those files change (the label's three files, tests/, scripts/ tooling fixes, docs/CHANGELOG.md and deploy/). The suite is 599 test files at r0916-rides (591 at the base;
8 new: curve.pick and curve.picks (the bump); backdrop1.ground, backdrop2.ground and present5.cannon, .dropmark, .marksurfaces and .narrowhead (the ride); 0 deleted). The generated files
are read only (the hull lane made them; the STAGE never regenerates a pool and never rebuilds the stand-in bundle): server/seedPoolData.ts 499,336 bytes, sha16 `2f22968dd422ee44` (230
ghosts); src/sim/standInPoolData.ts 101,654 bytes, `63e7d49ea34c9f3f` (192 decks, days 1-16); src/sim/harness/luckCapsData.ts 7,401 bytes, `df6335f71ec121ef`; tools/samplePool.ts
104,105 bytes, `17c1776e46efdf09`; tests/fixtures/runes.parity.x.json 371,724 bytes, `8396c6414eeb851d`; tests/fixtures/beltside-062c/roadDraws-080.json 48,147 bytes, `92baceda9986f949`.
- **The page** is BeltBattles-0.9.16-161a9829b173-online.html, 1,177,256 bytes, sha256 `0825a2ddf82919e1…` (GAME_BUILD.txt holds the
  whole hash), built at 161a982 and staged from ../output-stage0916/pages/. It is 699 bytes larger than 0.9.15.1's page (1,176,557 bytes;
  sha16 `0e6b7aed33fc9297`). Shore gets the offline page of the same commit: BeltBattles-0.9.16-161a9829b173.html, 1,177,245 bytes,
  sha256 `31194e0e8725a657…` (= ../output-stage0916/shore/index.html; 699 bytes larger than 0.9.15.1's offline page, 1,176,546 bytes, sha16 `f0a2e209b9a4eaec`).
- **The server changes** (this is why the release is one launch): server/dist built at this commit is 1,824,043 bytes in 9 files, against 0.9.15.1's 9 files, 1,715,024 bytes (W/ref/09151-dist:
  T(0.9.15.1)'s export, the server/dist of 0.9.15.1's launch and byte for byte 0.9.15's; kit0916/srvdiff.sh, O/logs/srvdiff-<commit>.txt): The STAGE's rehearsals below ran at the label commit 161a9829b173 (the log names carry its 12 hex) and carry to this commit, which adds only deploy/RUNBOOK.md and deploy/GAME_BUILD.txt (the ledger's X..T rule). **8 of the 9 files differ and 1 is identical** (`SRVDIFF: DIFFERS`, as a rules release must read; the bundle is 109,019 bytes larger): ghost-server.mjs (3,206 -> 3,206 bytes), ghost-admin.mjs (17,624 -> 17,624), ghost-probe.mjs (39,987 -> 39,987), the config chunk (config-CQqhEMh1.mjs -> config-C5tbAk-n.mjs, 68,164 -> 68,164) and the validate chunk (validate-sGvjvV6z.mjs -> validate-B-hOOFqj.mjs, 320,940 -> 320,940) keep their sizes and differ by the hashed names of the chunks they import, by the identifiers they import, and by the rules literal (bb-0.14.0 -> bb-0.15.0: PROBE_RULES and the probe's rune and gate worlds in ghost-probe.mjs, the revalidate guard and the name check in ghost-admin.mjs, the exact rules check in the config chunk, the default rules of the validators); the enchantSources chunk (enchantSources-CjCMoT84.mjs -> enchantSources-DwvXQkJn.mjs, 458,619 -> 459,498 bytes, +879) carries RULES_VERSION bb-0.15.0, H2's four BRACED words and BUMP-1H's lead pick with its `withoutLead` fallback (src/net/pick.ts); the seed chunk (seed-CVcysJme.mjs -> seed-9bAb1ILK.mjs, 404,429 -> 501,039 bytes, +96,610) holds the 230-ghost pool (server/seedPoolData.ts grows by 96,648 bytes); gen-ghost-pool.mjs (395,256 -> 406,786 bytes, +11,530) is the generator's bundle (BUMP-1H changed tools/genGhostPool.ts and tools/samplePool.ts); the identity chunk (identity-CZ3_I6Dh.mjs) is identical. 0.9.15.1's four hashed chunk names (config, enchantSources, seed, validate) are gone and the new ones took their places, so the file count stays 9. BUMP-1H changes two server
  files (server/ghostProbe.ts: PROBE_RULES; server/seedPoolData.ts: the bb-0.15.0 pool) and sim and net code that the server bundles; PRESENT-5 and BACKDROP change no file under
  server/, src/sim, src/net, src/core, src/game or tools/. The Dockerfile, .dockerignore and deploy/stage.mjs have no change since r0916-base, and the tracked launch config is as
  section 36 left it (next bullet). Uploads stay open.
- **The launch config** is the tracked one (RIDE L1, live since 0.9.15.1: cap's config-only commit 19fb9b2bbb69, numstat `11 0` on the launch config alone; the file is 2,849 bytes, sha16
  `383a063f00df9673`, and 0.9.16 does not change it: the scope check lists no file outside the 102, and after r0916-rides only the files named above may move). Its release lines are
  `release_command_timeout = "15m"` (line 25), `[deploy.release_command_vm]` (line 27) and `size = "performance-1x"` (line 28). **0.9.15.1's release machine was a performance-1x, and
  its release command ran 68 s (14:38:52-14:40:00Z) inside the 15 minutes** (it ran the seed, `0 written, 192 unchanged, 0 removed`; LIVE-09151 section 4, check C3: the platform's live
  config read `release_command_timeout` 15m0s and a `release_command_vm` size of performance-1x), so **a launch uses the tracked config as it is: no extra config file**: no
  `--config`, no untracked launch.toml and no '?? launch.toml' guard (ledger C2); the plain `fly deploy --ha=false --remote-only` from the repo root reads those lines. **What to read after
  the launch**: the launch output itself prints no machine size (LIVE-09151), so read the platform's live config, which must still say `release_command_timeout` 15m0s and a
  `release_command_vm` size of performance-1x, and the seed's time on the release machine, which must come in inside the 15 minutes (section 4: the platform's CLI prints only
  `release_command <machine> completed successfully`, and the `seed:` line is in `fly logs -a beltbattles --no-tail`; ledger C3 is this launch's read: the seed's line and its time, for the
  hull lane's LIVE packet; the seed's peak RSS cannot be read after the fact, because the release machine is destroyed when the command ends: LIVE-0915).
- **The rules** are bb-0.15.0: RULES_VERSION (src/sim/content.ts:66), PROBE_RULES (server/ghostProbe.ts:120) and SEED_POOL_RULES (server/seedPoolData.ts:8; server/seed.ts:92 refuses a
  pool dealt under other rules); **LEAD_RULES (src/net/rulesGate.ts:580) is new**: the first rules version with the gate of the lead pick (src/net/pick.ts matchPick) and the seed pool's new slots, and a match
  request under older rules, bb-0.14.0 among them, picks as before whatever the switch (src/net/rulesGate.ts:575-579; src/net/curve.ts:10-12); the lead pick itself is coded and unused, because
  PICK_RULE has no `lead` in bb-0.15.0 (src/net/pick.ts:90-92), so the streak ghosts meet the runs of their own record through the nearest-record pick; STAND_IN_DATA.rules
  (src/sim/standInPoolData.ts:51, generated) reads bb-0.15.0 too. The
  server's exact rules check (server/app.ts:360-361) is unchanged and reads RULES_VERSION. GATES_RULES (src/net/rulesGate.ts:318) and ENCHANT_RULES (:360) stay bb-0.13.0; SCALE_RULES
  (:512) and ENDLESS_RULES (:562) bb-0.12.0; LONG_RUN_RULES (:493) and SHAPES2_RULES (:278) bb-0.11.0; HEARTS_RULES (:433), PICK_RULES (:453), OPEN_RUNES_RULES (:477), FREE_JOINS_RULES
  (:222), SHAPES_RULES (:238) and NPC_DAY_RULES (:206) bb-0.10.0 and LAST_CHANCE_RULES (:190) bb-0.9.7; FIRST_RUN stays false (src/sim/firstRun.ts:35); POOL_RULES_CARRIED is empty
  (src/sim/content.ts:76), so POOL_RULES = RULES_VERSION (:78). The switches EFFECT_FLOOR (src/sim/effectFloor.ts:28), GATES (src/sim/gates.ts:31), ENCHANT (src/sim/enchant.ts:28),
  SCALE_RIGS (src/sim/scale.ts:34) and ENDLESS (src/sim/endless.ts:27) are on beside LONG_RUN, PLAIN_RIGS, SHAPES2, HEARTS and SHAPES, and **two are new since 0.9.15.1: CURVE
  (src/net/curve.ts:23) and SOFT1_CURVE (tools/samplePool.ts:356)**; POISON_DPS is 2 (src/sim/content.ts:113), ENDLESS_GOD_HULL_STEP 1500 (src/sim/endless.ts:162) and STAND_IN_POOL_DAYS
  16 (src/sim/standInPool.ts:88). A 0.9.16 page asks for, and uploads under, bb-0.15.0; a 0.9.15.1 or 0.9.15 page asks for bb-0.14.0. The match route reads only the bucket of the rules
  a request names (server/app.ts:434-436) and an upload under other rules is refused (422 `rules bb-0.14.0 not accepted: this server validates bb-0.15.0`, server/app.ts:360-361), so **a
  player of 0.9.16 meets only bb-0.15.0 ghosts**, except a foe that a run saved by 0.9.15.1 had already picked for its day (the saved runs below). The fingerprint (857,831 bytes, sha16
  `bb71188c4f0e188f`) and all 41 parBench lines (`fingerprint all: e1ec0b3c`) are the hull lane's pins (W/ref/bump1h/output-bump1h/fp/fp-fin6.json and parfp-fin6.txt; the STAGE's reads
  of them are in the checks paragraph below); 0.9.15.1's pins (857,755 bytes `921e2202aa58bc4a`) are not the pins any more.

**The order.** One launch carries the page and the server together, on top of 0.9.15.1 (the hosting release v30), and never the page alone. **The launch call is the Prime's** (CMD-0916,
from CMD-09151's text; run once, and only after **the operator's yes**, asked in chat for the exact text, simulated first, before anything is submitted: the release lane's ask-first rule,
PLAN-0916 section 4; the platform's own approval is no gate, because the policy engine approved a launch-type command at once at 0.9.15.1's clean-up, LIVE-09151 section 2). The ask tells
the operator that the seed writes a NEW bucket, 230 ghosts under bb-0.15.0, and that uploads made under bb-0.14.0 stop meeting players. The call is two texts, the LAUNCH and a guarded
FINISH (probe, revalidate, remove-player, restart, lists, releases-after) with its own simulation, so that a cut leaves a clean resume point (PLAN-0916
section 4; 0.9.15.1's launch call was cut off by a restart after its probe: LIVE-09151). The hosting service serves 0.9.15.1's page then, so the guards are: refuse unless it serves the
0.9.15.1 page, byte for byte (`content-length: 1176557`, sha256 `0e6b7aed33fc9297…`), and /v1/health reads `"rules":"bb-0.14.0"`, and `fly releases -a beltbattles --image` lists
0.9.15.1's release (v30) first (keep it as releases-before.txt: the rollback needs it; both releases play bb-0.14.0, so health cannot tell them apart: the page's bytes do); then stage the
0.9.16 page, launch once (`fly deploy --ha=false --remote-only`: the image carries the new server/dist and the new page, and the tracked launch config gives the release command its machine
and its 15 minutes), and run section 5's live checks with this page: health `"rules":"bb-0.15.0"` and `"uploads":"open"`, `content-length: 1177256`, `live page = the staged
0.9.16 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`), day 3 at 1 win and 9 hearts (a v3 bb-0.15.0 snapshot), days 17, 25 and 26 as the STAGE's
seedcheck read them (below), an unsigned POST `-> 401`, the pool check (the ids that the sixteen day calls served are each one of this release's 230 seed ghosts: 0.9.16's pool check reads expect-ids-3eb2669e9a6a.txt, 230 lines, one `<day> <id>` each,
made by storeids.mjs from the tip's own seed, 4,245 bytes, sha16 `58aa3abc71969095` (W/ref/stage0916/expect-ids-3eb2669e9a6a.txt; the STAGE's own O/expect-ids-7c8f8312484f.txt held the same 230 ids with a constant 1
in its day column, STAGE-0916's finding F12, so it is not the file to read)), and `list --rules bb-0.15.0`: sixteen day rows (12, 12, 13, 13, 12, 13, 16, 17, 17,
16, 18, 16, 14, 13, 14 and 14 pool ghosts), then `all 230 0 0` (`all 230 N P` if real players uploaded since the launch; `list --rules bb-0.14.0` still reads `all 192 N P`: 0.9.15's and
0.9.15.1's pool and uploads stay). Section 5's one-line call asks only days 1-16 and day 3: add `day=17`, `day=25` and `day=26` queries to see those three lines.
In `fly logs -a beltbattles --no-tail`: the `seed:` line and the warm-up line (below). The page's own label (V0.9.16 on the title) tells the two pages apart in a browser.

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store holding bb-0.14.0's 192 pool ghosts (days 1-16, 12 a day; 0.9.15's launch wrote them and 0.9.15.1's
kept them), the uploads made under it and the older pools, and nothing under bb-0.15.0. This commit's bundle carries the new pool (server/seedPoolData.ts is 499,336 bytes, sha16
`2f22968dd422ee44`, 230 ghosts, days 1-16, 12, 12, 13, 13, 12, 13, 16, 17, 17, 16, 18, 16, 14, 13, 14 and 14 a day, SEED_POOL_RULES bb-0.15.0; 0.9.15.1's is 402,688 bytes, sha16
`5756d795170150f6`; the hull lane's read of it: 230 of 288 ghosts, 499,336 of the 620,000 byte limit, 822 reachable states, 0 uncovered and at least 4 eligible ghosts at every state,
MIN_ELIGIBLE 2; packet section 4): `seed: rules bb-0.15.0, 230 pool ghosts on tigris (...)` with **`230 written, 0 unchanged, 0 removed`**, and on every later launch of the same image `0
written, 230 unchanged, 0 removed` (the release command runs at each `fly deploy`). **A new bucket: bb-0.14.0's 192 pool ghosts and every upload under it are left as they are**, so
uploads made under bb-0.14.0 stop meeting players (a 0.9.16 page asks for bb-0.15.0 only): the Tigris seed lists and writes only `ghosts/bb-0.15.0/dNN/pool/` (server/tigrisStore.ts
replacePool). Rehearsed on this commit's real CLI and 0.9.15.1's (kit0916/seed0916.sh, O/logs/seed0916-<commit>.log; a scratch JSON-lines store; 0.9.15.1's CLI from W/ref/09151-dist),
each step as it must read: (a) 0.9.15.1's seed on a fresh store `192 written, 0 unchanged, 0 removed` (bb-0.14.0); (b) **this commit's seed over it `230 written, 0 unchanged, 0
removed`** (bb-0.15.0), bb-0.14.0's lines in pool.jsonl byte for byte as they were and `ghost-admin list --rules bb-0.14.0` still `all 192 0 0`; (c) again **`0 written, 230 unchanged, 0
removed`**, pool.jsonl byte-identical; (d) `list --rules bb-0.15.0` reads `all 230 0 0` and `list --rules bb-0.14.0` `all 192 0 0`, and revalidate's dry run (below); (e) **the rollback**,
0.9.15.1's seed over that store, **`0 written, 192 unchanged, 0 removed`** (bb-0.14.0), pool.jsonl byte-identical, bb-0.15.0's 230 still listed. On the Tigris path
(kit0916/tigris-rollback.sh: the real CLIs against tools/fakeS3.ts; O/logs/tigris-rollback-<commit>.log) the same five steps run with every object checked byte for byte (hashes in the
log) and no DELETE request, then a step f (0.9.15.1's server over the rolled-back bucket: the rollback below): all five steps read as they must (vitest exit 0 in 48 s): (a) 0.9.15.1's seed on an empty bucket `192 written, 0 unchanged, 0 removed` (192 objects under bb-0.14.0, none under bb-0.15.0); (b) this commit's seed `230 written, 0 unchanged, 0 removed` (230 objects under bb-0.15.0; bb-0.14.0's 192 byte for byte as before, hash f8aeae37d0f8c81b both times); (c) again `0 written, 230 unchanged, 0 removed`; (d) the tip's `list` reads bb-0.15.0 `all 230 0 0` and bb-0.14.0 `all 192 0 0`; (e) the rollback, 0.9.15.1's seed, `0 written, 192 unchanged, 0 removed`, bb-0.14.0's hash f8aeae37d0f8c81b again and bb-0.15.0's 230 objects byte for byte as they were (hash 18b9b688b65b4cb3 both times). The fake S3 saw 422 PUT, 447 GET, 106 LIST and 0 DELETE requests. The reads and the seed's cost (step b: one process, the exact
peak RSS by K/maxrss.py; kit0916/seedtime.sh: one pinned core, a fresh store, O/logs/seedtime-<commit>.log): seed0916 reads **8 PASS, 0 FAIL** (`SEED REHEARSAL (0.9.16): PASS`). Step b, this commit's seed over 0.9.15.1's store, ran **11.3 s with a peak RSS of 244,000 kB** (exit 0, nice 19, one process, 1-minute load 2.08, this host); step a (0.9.15.1's seed on a fresh store, 192 written) 11.2 s and 242,548 kB; step c (this commit's seed again, 0 written, 230 unchanged) 11.2 s and 276,580 kB; step e (the rollback, 0.9.15.1's seed, 0 written, 192 unchanged) 11.5 s and 261,172 kB. kit0916/seedtime.sh (one pinned core, a fresh store, 230 written) read **14 s wall and a peak RSS (VmHWM, last read) of 245,516 kB**. These are this host's reads, not the release machine's. The canary (`BB_POOL_CANARY=1` on tests/net-pool, alone;
O/logs/canary-<commit>.log): green: `Test Files 1 passed (1)`, `Tests 5 passed (5)` in 239 s (the cached pool against a pool built fresh in the process: `generates 230 valid snapshots across days 1-16 for the four playable heroes, reproducibly`, 237 s; 0.9.15's read was 5 of 5 in 197 s). The hull lane's local read of the seed was 11.8 s with a peak RSS of 252,396 kB (packet section 4; 0.9.15's STAGE read 234,596-273,516 kB: section
35), and the hull lane's advice is to keep the performance-1x release machine (RIDE L1's tracked config). The seed plays no battle, but it checks all 230 ghosts first (the strict decoder,
the rules, validateUpload in the player mode and the reachable record), whether or not it writes them. 0.9.15.1's release command wrote nothing and ran 68 s on its performance-1x machine
(above); this launch writes 230 ghosts into a new bucket, so ledger C3's read of its time on the release machine is the one that counts.

**The boot.** The server warms roadCap's memo once the port is open and uploads are open (server/main.ts, server/warm.ts; neither changed since 0.9.14, but BUMP-1H changed sim and net code
the warm-up runs, so the STAGE reads it again). After the launch and after a restart, look for the line `road model warmed for days 1-25 under rules bb-0.15.0 in <ms> ms`
(server/warm.ts:26) in `fly logs -a beltbattles --no-tail`. The tracked launch config's health check has a 10 s grace period, a 30 s interval and a 5 s timeout, and the serving machine
is its [[vm]] block: shared-cpu-1x with 256 MB. The hull lane's local read at bb-0.15.0 (packet section 4): health in 0.26 s, the warm-up line at 849 ms and a peak RSS of 130,932 kB, against
a 160,000 kB bar. Rehearsed on this commit (kit0916/boot0916.sh: this commit's server/dist/ghost-server.mjs started the way the Dockerfile and the tracked launch config start it, on a
scratch store after the release command's seed; one pinned core; O/logs/boot-<commit>.log): boot 1 (after the release command's seed): the first `/v1/health` 200 at 489 ms after the process start (RSS then 89,844 kB; health `"rules":"bb-0.15.0"`, 230 ghosts, uploads open), the warm-up line at 1,542 ms: `road model warmed for days 1-25 under rules bb-0.15.0 in 1402 ms`, VmRSS 125,796 kB after it and peak VmHWM 125,796 kB; boot 2 (a restart on the same store): health at 488 ms, the warm-up line at 1,610 ms (`... in 1434 ms`), VmRSS 118,980 kB after it and peak VmHWM 130,384 kB; each peak is under the 160,000 kB bar, and a health after the warm-up answered 200 in under a millisecond. This host's one core is faster than the release machine's, so the times are a floor (the hull lane read 0.26 s, 849 ms and 130,932 kB).

**The probe block** is section 35's, under bb-0.15.0 (PROBE_RULES, server/ghostProbe.ts:120; the plan is twenty POSTs and the endless match, 21 rows; the probe-id file is
../output-stage0916/probe-id.txt, which must not exist yet): `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage0916/probe-id.txt` prints **24
lines** (the header `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.15.0); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`, 21 checks,
`probe player:` and the summary), ending **`probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10); the player id is in
../output-stage0916/probe-id.txt`** (with `--profile` after the id file, two PUTs more and **`23 of 23`**); revalidate's dry run (below); `remove-player <id> --rules bb-0.15.0 --apply`
prints its `delete ghosts/bb-0.15.0/dNN/player/<id>.json` lines and **`APPLIED: deleted 10 of 10 record(s).`** (the Tigris store enumerates days 1 to 25, so it finds the probe's day-14
ENDLESS record too); then `fly apps restart beltbattles`, health again, and `list --rules bb-0.15.0` reads `all 230 0 0` (or `all 230 N P`, if real players have uploaded). Rehearsed
locally on the built commit (kit0916/probecheck.sh, O/logs/probecheck-<commit>.txt): 23 `expect:` lines, all yes and none NO. The first probe prints 24 lines (the header, 21 checks, `probe player:` and the summary) and ends `probe: 21 of 21 checks as expected; the server stored 10 deck(s) for this player (expected 10)`; the named rows read PASS (lastchance-signed 201, lastchance-day3 422, npcday-signed 201, npcday-forged 422, longrun-signed 201, scale-signed 201, gates-signed 201, endless-honest 201, endless-wins-cap 400, endless-norecord 422, endless-match 200, longrun-nolosses 422). Revalidate's dry run with the probe's decks on the store: `plan: delete 0 record(s) of bb-0.15.0; keep 230 seed-pool ghost(s) and 10 upload(s)`. `remove-player` printed `APPLIED: deleted 10 of 10 record(s).` three times (step 4, the hand clean-up, and the `--profile` probe's), and the list read `all 230 0 0` after each restart and after the last clean-up. `--profile` read `probe: 23 of 23 checks as expected; the server stored 10 deck(s) for this player (expected 10)` with profile-signed 200 and profile-badsig 401. The day-3 match after the restart is a v3 seed ghost under bb-0.15.0; the guard (a second probe on the same id file) is refused with exit 2, and the fresh probe after it reads 21 of 21 again. **The hand clean-up** is section 30's block run from this clone, with at most 10
decks: its `cd` names /home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0916/BeltBattles-r0916, both `../output-stage0911/probe-id.txt` become `../output-stage0916/probe-id.txt`, and
both `--rules bb-0.11.0` become `--rules bb-0.15.0`.

**Revalidate**: after the launch run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.15.0'` (a dry run; add `--apply` only if it plans deletes
you expect) **over the stored bb-0.15.0 records only, in a fresh process** (each `fly ssh console -C` is one). The dry run prints a `plan:` line for bb-0.15.0 and `DRY RUN: nothing was
deleted. --apply deletes exactly the N record(s) above.`, and, only when the store holds a stored endless snapshot past day 25, S1's one line (section 7). With this image `revalidate`
takes only `--rules bb-0.15.0` (section 7: it runs only for the build's rules, so bb-0.14.0's records are not read by it); `list` and `remove-player` take any rules. Rehearsed over the
scratch store: `plan: delete 0 record(s) of bb-0.15.0; keep 230 seed-pool ghost(s) and 0 upload(s)` and then `DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.` (seed0916's step d: this commit's real ghost-admin in its own process; no S1 line on a clean store); with the probe's 10 uploads on the store the probecheck dry run reads `plan: delete 0 record(s) of bb-0.15.0; keep 230 seed-pool ghost(s) and 10 upload(s)`.

**S1's read-only check after the launch** (section 34's form; the guard is in this server too: server/app.ts:355-357 and server/ghostAdmin.ts:271, both unchanged since 0.9.14.1): on the
machine run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.15.0'` and the same with `--rules bb-0.14.0` (`list` is read only, never runs the deck
check, and is safe on the 256 MB machine). It prints one row per day: `day pool uploads players`. A run snapshot is never past day 25 (the decoder), so **a row whose day is above 25 with
uploads above 0 is a stored endless snapshot past the bound**; expect none (the game never uploads one, and S1 refuses one since 0.9.14.1). A clean bb-0.15.0 store prints rows for days
1-16 only, with 12, 12, 13, 13, 12, 13, 16, 17, 17, 16, 18, 16, 14, 13, 14 and 14 pool ghosts (packet section 4; seed0916's step d and seedcheck read them), then **`all 230 0 0`** right
after the launch (`all 230 N P` once real players have uploaded); bb-0.14.0 reads **`all 192 N P`** (it holds what players uploaded under 0.9.15 and 0.9.15.1, and the pool stays). While
such a row exists, run `revalidate` only with an image that has S1 (this one or 0.9.14.1's and later). To remove one: `remove-player <playerId> --rules <its rules>` (a dry run first), then
`--apply` on the operator's say-so, then `fly apps restart beltbattles` (the server serves deleted ghosts from its bucket cache until BB_GHOST_CACHE_TTL_S, 600 s). If the lane sees one,
the account is a hand-built client: tell the operator.

**The days a GET answers 200 for** (a new player at 0 wins and 10 hearts; kit0916/seedcheck.sh's [3] and [3d] on this commit's server over the scratch store,
O/logs/seedcheck-<commit>.txt): health `{"ok":true,"rules":"bb-0.15.0","store":"jsonl","ghosts":230,"uploads":"open","uptimeS":0}`; the served page is the staged page (cmp) and its label reads 0.9.16; days 1 to 16 each `-> 200` (sixteen of sixteen); day 3 at 1 win and 9 hearts a v3 bb-0.15.0 snapshot; **day 17 `-> 200` (the ghost served is from day 16: a thin day widens to the nearest earlier day), day 25 `-> 200` (also from day 16) and day 26 `-> 400` (`day: expected an integer in 1..25`)**, the same three answers as 0.9.15.1's; [5]'s bb-0.14.0 match 404 here (the scratch store holds no pool under bb-0.14.0); the unsigned POST 401; the per-day pool counts of `list --rules bb-0.15.0` are 12, 12, 13, 13, 12, 13, 16, 17, 17, 16, 18, 16, 14, 13, 14 and 14; 15 of 15 `expect:` lines yes. The day bound is 25 (maxDayFor), and a thin day widens to the nearest earlier day that has an eligible ghost (section 5, item 5). On the
hosting service a bb-0.14.0 request (an open 0.9.15.1 tab) is answered from bb-0.14.0's pool, which the scratch store does not hold (seedcheck's [5] answers 404 there).

**ENDLESS online** is as sections 33 and 34 say: the client goes online for an endless dusk only up to day 25 (ENDLESS_ONLINE_LAST_DAY, src/sim/endless.ts:156); past day 25 the foe is THE
GOD with no request, and S1 refuses such an upload at once (server/app.ts:355-357). ENDLESS_RULES stays bb-0.12.0 (src/net/rulesGate.ts:562) and THE GOD's hull step 1500
(src/sim/endless.ts:162): BUMP-1H changes neither value.

**Saved runs, from the code** (O/logs/step2ab-saved-runs.md, read at r0916-rides; ledger A2 is the format). The save's key (`beltbattles.run.v7`, src/game/save.ts:39), RUN_VERSION (8,
src/game/run.ts:244) and the rest of src/game are unchanged since 0.9.15.1 (ledger A2: `git diff --quiet 89bb5abacfbb <this commit> -- src/game` exits 0), so a 0.9.16 save has
0.9.15.1's keys. (a) **A run saved in 0.9.15.1 (bb-0.14.0) and opened in 0.9.16:** the same code decides it as for 0.9.15 with a 0.9.14.1 save (section 35): nothing under src/game moved (ledger A2 exit 0), so it loads and goes on, with no aside line, because every id it names is known to 0.9.16: BUMP-1H adds or removes no part, hero or rune (`git diff -U0 r0916-base r0916-rides -- src/sim/content.ts` is RULES_VERSION and a comment; the guard is src/game/saveGuard.ts:19-38 and :70-81) and PRESENT-5 is display code. The dusk foe a run stores when its dusk starts is fought exactly as stored (src/game/run.ts:131-140), and a stored dusk foe or warlord deck is re-placed under the shape rules, not re-picked (src/game/save.ts:136, :180). From its next request on the run asks for ghosts under bb-0.15.0 (src/game/day.ts:64-65; src/game/online.ts:205) and stamps its uploads bb-0.15.0 (src/game/day.ts:132), the only rules this server takes (server/app.ts:360-361). (b) **A run saved in 0.9.16 and opened on 0.9.15.1 (the rollback):** from the code it loads: the same key and RUN_VERSION, and the guard knows every id (BUMP-1H and PRESENT-5 add none), so there is no aside line. A dusk foe already stored (it may be a bb-0.15.0 streak or depth ghost, whose build names only parts 0.9.15.1 knows) is fought as stored; from then on the run asks for and uploads under bb-0.14.0 again, and its bb-0.15.0 uploads stay in the store and meet no 0.9.15.1 player. The browser read of this is the rollback probe, below.

**Rollback to 0.9.15.1's hosting release v30** (its own yes from the operator in chat, every time, after telling him; never part of the launch call). Check that the releases-before file
lists 0.9.15.1's release first (v30; its image is registry.fly.io/beltbattles:deployment-01M72YAPXXJRGYNC7NTDH9PVWW, and the file must agree); if not, stop and ask the Prime. If a probe's
decks are on the store, run the clean-up first, while 0.9.16 serves. From this clone:

```sh
fly deploy --ha=false --remote-only --image <IMAGE REF of 0.9.15.1's release (v30), from releases-before.txt>
```

0.9.15.1's release is the page (1,176,557 bytes, sha256 `0e6b7aed33fc9297…`, V0.9.15.1) and the server together, **on bb-0.14.0 on both sides**: players ask for bb-0.14.0 ghosts again, and
bb-0.15.0's decks meet none of them. Its release command (`seed`) re-seeds bb-0.14.0's pool: **`0 written, 192 unchanged, 0 removed`**, and leaves bb-0.15.0's 230 pool ghosts and every
upload under it in the bucket under their own prefix (rehearsed on both stores: seed0916 step e and the Tigris rehearsal's step e; on Tigris, the real store, nothing is removed). An
**open 0.9.16 tab** keeps its page until it reloads (STAGE-0915's F4 again): asked for bb-0.15.0 ghosts, 0.9.15.1's server answers as the Tigris rehearsal's step f records it
(health `"rules":"bb-0.14.0"`; GET match rules=bb-0.14.0 day 3 -> 200, a bb-0.14.0 ghost; GET match rules=bb-0.15.0 day 3, as an open 0.9.16 tab asks, -> 200, a bb-0.15.0 ghost (the match route reads the bucket of the rules a request names, and the rollback leaves bb-0.15.0's pool in the bucket, so such a tab keeps getting bb-0.15.0 ghosts until it reloads); PUT /v1/profile -> 401 (the route exists); an unsigned POST /v1/ghosts -> 401; 0 `skipping bad object` log lines), and it refuses that tab's uploads (its rules check takes bb-0.14.0 only: server/app.ts:360-361); the page says nothing, and the tab is harmless until it reloads (then it is
0.9.15.1's page, asking bb-0.14.0). A run saved in 0.9.16 and opened on 0.9.15.1 is item (b) above. **Read in a browser** by the STAGE's rollback probe (kit0916/rbprobe on 0.9.15.1's page,
with a 0.9.16 save taken mid-run after a fight against a ghost and one in ENDLESS): 8 of 8 loads read as the code expects: 0.9.15.1's page loads a 0.9.16 save taken after seven fights against ghosts (day 8) and one taken in ENDLESS (day 15): CONTINUE shows, there is no aside line, the saved day opens, the run and its wares (65 and 66) are kept whole, the save in storage is not rewritten, CONTINUE a second time and NEW RUN work, and there are 0 errors; 0.9.15.1's saves load on 0.9.16 the same way (the probe plays no day on a loaded run, and REPLAY of a day fought under 0.9.16 is expected not to play on 0.9.15.1, because src/net/replay.ts:92 refuses a record made under other rules). The launch config's env and VM lines are unchanged, so the image route is safe for the
server. Before 0.9.15.1: 0.9.15's release v29 (image registry.fly.io/beltbattles:deployment-01M6XV00ACXZ2KGHG69555EYHH; section 36's rollback, on the same rules bb-0.14.0), 0.9.14.1's v28
(section 35's rollback, which puts bb-0.13.0 back on both sides), 0.9.14's v27 (section 34's rollback, on the same rules bb-0.13.0) and v25 = 0.9.13 (section 33's rollback, which puts
bb-0.12.0 back on both sides); **never v26, which failed** (LIVE-0915); going back past 0.9.15.1 is a separate decision. Rolling back loses nothing on the server.

tests/tsc-tests-baseline.json is unchanged by both parts (3,382 bytes, sha16 `216977d9b4bd72fe`, 163 type errors); the release lane did not touch it.

**The known limitations** (internal notes: the hull lane's packet section 7, the first group of the brief's ruling 14; none is fixed here and none is a STOP): (1) REQ-BFG-124's par line
(RULING-BUMP1H-R5): par_est is 86.7% (raw 90.1% against the live pool's 89.3% on the same 768 runs), and the CHANGELOG says nothing about par; (2) tests/rivals.difficulty keeps 71 open
LADDER_X_OPEN entries at its K 24 instrument, one of them new (day 8, GRUBNOSE over MOTH QUEEN, v 0.0168), and none is a K 96 failure (0 / 0 / 102); (3) bastion's endless mean is 0.71 (the
overall mean, 3.28, passes; bastion is on the next rules release's list); (4) STAGE-0915's F6 is answered: c5 reaches 10 wins in 28.9% of 768 runs (bar 25%), parBeatsEasy holds on days 1-10,
and H3 took MOTH QUEEN and SILKSHADE back under the luck caps on day 6, which answers section 35's limitations (1) and (4) and the parBeatsEasy part of (2); capsearch at T (report only) reads
their other days so: H3 also took MOTH QUEEN's days 7 and 9 and SILKSHADE's days 7 and 10 back under their good-luck caps (tests/captains.luck.test.ts:108-109 and :114-115), and one good-luck deck of each
is still over its caps and stays pinned as a known limitation: MOTH QUEEN's day 10 (rare 11 > 9, was 12 > 9; :110) and SILKSHADE's day 4 (star2 3 > 2, unchanged; :116). The others of sections 35 and 36
stand, except where this release changes one. The display parts' accepted notes (PRESENT-5's packet section 7 and BACKDROP's rulings Q1 to Q3) are in their packets
(W/ref/rides/present5/STAGING-PACKET-PRESENT5.md and W/ref/rides/backdrop/).

**The checks of this STAGE** (STAGE-0916; O/STAGE-REPORT.md has every command, log and number, and O/LEDGER-0916.md every check's row: what ran at the label commit or at T, and what it
carried from the earlier STAGEs and the hull lane's runs, with the proof's exit code; this paragraph is brought up to date by the closing docs commit): Run 1 (task 216ce8084a017cb3) ran, at T 7c8f8312484f unless noted: step 0 (PASS, 0 FAIL: the 14 tags and their objects, the merge's parents and tree, the rules literals and switches, the scope of 102 files, the 13 protected files, the generated files' bytes, 599 test files, 0 of the closure's 105 files changed); the stand-in check at r0916-rides (WEAVER day 6 regenerated from scratch with the stored bundle: byte-identical, 150,701 bytes, sha16 `39d62b923ba792b0`, 296 s); fp and parBench at r0916-rides (857,831 bytes `bb71188c4f0e188f` and all 41 parBench lines `e1ec0b3c`, identical to the hull lane's pins); labeltest (7 files, 33 tests) and RIDE T1's two files alone (card4 27 of 27, polish2.infoPages 2 of 2); the gate at the label commit 161a9829b173 (tsc 0, typecheck:server 0, typecheck:tests PASS at 163, the three builds and the knobs build 0, luckcaps `check: IDENTICAL: regenerated 7401 bytes`) and the smoke at T (45 PASS, 0 FAIL; at the label commit the two checks that read the record failed, because the record is T's); the server rows at the label commit (the seed rehearsal 8 PASS with `230 written, 0 unchanged, 0 removed` into a new bucket on the jsonl store and on the Tigris path, seedcheck 15 of 15, probecheck 21 of 21 and `--profile` 23 of 23, seedtime 14 s, the boot at 125,796 kB against the 160,000 kB bar, srvdiff 8 of 9 files differ as a rules release must, the canary 5 of 5); the whole suite once at the label commit (ALL GREEN: 599 files, 7,090 tests = 7,078 passed and 12 skipped, 0 red), carried to T by the L..T rule (only docs/CHANGELOG.md and deploy/ changed; tests/ghost-probe.test.ts, which names the RUNBOOK in a message it checks, alone at T and again at the final tip: 14 of 14 each); the mutants (the 13 units of the run list, 13 of 13 caught; the anchors 40 of 40; 25 current units carried); the pages' off and on runs (4 of 4 each, 0 console errors, `version 0.9.16` on 4 of 4, the page after each run unchanged); runeshots (103), card3check 13, stylecheck 180, explaincheck 35, surge 4, mirror PASS, asynccheck 62, introcheck title 198, stills c1 and p1 0 failed, lcshots 28 PASS lines, motion taps 123, and rcruns off 32 and on 44 (each as 0.9.15.1's); touch noprof 2,487 of 2,487 (as 0.9.15.1's); the samepixels account (39 of 311 shots-det frames differ, each in a class: the label 6, PRESENT-5 33; BUMP-1H alone moves none of the 311); the text sheets (10 lines move in each, 0 overflows); the rollback probe (8 of 8 loads as the code expects, read above); and the LOOKS (64 pictures of T's built page, all viewed: LAST CHANCE's and the dawn rune pick's solid panels, the BRACED words, MOTH QUEEN's and SILKSHADE's road decks without those two parts, the shaped parts' whole icons with the footprint mark, the 4 px arrowheads, the heavy turrets' gun icon with no stray dot, V0.9.16 on the title; no clipped or overlapping text from the rides and no word on a shop card; the one overlap seen, the desk scout report's toast over its corner caption, is 0.9.15.1's own). Run 2 (task 04637c0c2f53a0bf) ran, at T: touch mixed part 1 (1,153 of 1,153) and part 2 (1,227 of 1,227), 0 FAIL, no count moved against 0.9.15.1's (the scout rows read BRACED LOOM where 0.9.15.1 read RISING LOOM: H2's word), and capsearch, report only: only MOTH QUEEN's and SILKSHADE's lines differ from 0.9.15's read (17 of 19 captains are identical), and three of each one's four good-luck decks that were over the luck caps are back under them (limitation (4) above says which two stay). Carried from the earlier STAGEs and the hull lane, with each proof's exit code at T (ledger section A): the pools as generated (A1), the save format (A2), the display ride's own checks (A4) and 25 of the 38 current mutant units (A3); skipped as report-only: seedmem and motionperf. Nothing of the ledger is left to run.

## 38. 0.9.17: ghosts get tougher when you keep winning (rules release bb-0.16.0; server and client in one launch; the operator's yes first)

0.9.15.1's launch is section 36 (clone beltbattles-r09151, branch r09151, tag stage-09151, tip 89bb5abacfbb). It has run: the hosting service serves 0.9.15.1 as release v30
(image registry.fly.io/beltbattles:deployment-01M72YAPXXJRGYNC7NTDH9PVWW, since 2026-11-10 at 14:40:19Z; tag live-09151 = stage-09151 = 89bb5abacfbb), the page and the server
together on bb-0.14.0, **and it still does when this section is written: v30 is the live release**. 0.9.16's launch is section 37 (clone beltbattles-r0916, branch r0916, tag stage-0916 =
3eb2669e9a6a): it is **staged and accepted, and it has NOT run**; it waits for the operator's own yes, so 0.9.16 has no hosting release yet, and this section never names one as a fact:
0.9.16's hosting release (v31 if nothing else ships first; read it at the launch). This section is 0.9.17's launch, from this clone (beltbattles-r0917/BeltBattles-r0917, branch r0917; write
`refs/heads/r0917` or a tag; r0917-base = stage-0916 = 3eb2669e9a6a), staged on 2026-11-11. 0.9.17's tree holds all of 0.9.16 (BUMP-1I's base is stage-0916), so **there are two launch paths, and
cap chooses at the launch** (below). **Never launch it unless the hosting service serves what the chosen path's guards name**: 0.9.16's page on PATH A, 0.9.15.1's page on PATH B.

0.9.17 is a **rules release** (route B, as 0.9.11, 0.9.13, 0.9.14, 0.9.15 and 0.9.16 were): the battle rules move to **bb-0.16.0**, so the page and the server ship together, in **one launch**, and
**never the page alone**: a 0.9.17 page asks for, and uploads under, bb-0.16.0, and only this release's server holds that pool and takes those uploads (0.9.16's server takes bb-0.15.0 only and
0.9.15.1's bb-0.14.0 only: server/app.ts:366-368 in this tree, :360-361 in theirs). It is two accepted parts, put together by cap (setup.log phase a, sections 3 to 5):
- **BUMP-1I** (the hull lane 6c99be48; REQ-BFG-125, with REQ-BFG-124's par line; tag bump1i-accepted, tag object f7aee94315b1 -> 31c7aeda8bb9, tree 442cd23d2454, also tagged r0917-bump: 16 commits on stage-0916
  and no merge, so r0917 starts there; 67 files against stage-0916, +1,561 -499; 14 of them not tests; the hull lane's packet is W/ref/bump1i/PACKET-STAGE-BUMP1I.md). **Battle rules bb-0.16.0, VETERAN**
  (below, in a player's words): the device counts the runs it won in a row; from 2, every match request of a run carries that count, and the server picks from the stronger half of the eligible ghosts;
  **the shield** (a request that is not a veteran's never draws a tier ghost while another ghost is eligible); **the tier** (48 ghosts, one a hero on each of days 5-16, at STREAK_TARGET 525; 0.9.16's
  streak tier had 24, on days 7-12, at 450, and anyone could meet them); **one regeneration**: the 254-ghost seed pool (the 192 of 0.9.15, 48 tier ghosts and 14 depth ghosts, which sit on 11 matchups), the
  stand-in pool (its 192 decks are identical; only its two rules strings moved) and the luck caps (regenerated identical). Its 14 non-test files: docs/CHANGELOG.md, server/{app,ghostProbe,seedPoolData}.ts,
  src/game/online.ts, src/game/streakHook.ts (new), src/net/ghostClient.ts, src/net/veteran.ts (new), src/screens/build/chrome.ts (the import and the ABANDON call: no pixel moves), src/sim/{content,standInPoolData}.ts,
  src/sim/harness/endlessBench.ts and tools/{retune1,samplePool}.ts; 53 test files (2 new: tests/veteran.pick.test.ts and tests/veteran.device.test.ts).
- **PRESENT-6** (the presentation lane 51a13003; REQ-BFG-113, -115, -081 and -004; tag present6-accepted, tag object 37c4f9e60a97 -> d5eaf97684af, tree d2d03abfad3c; 5 commits on stage-0916; cap's --no-ff merge
  8eb3f084956d onto the bump's tip, tree 3ee21af1bc6c = merge-tree's, tag r0917-rides, tag object 4fe3aaa00218): display only, client only, 13 files, +1,160 -40. **N1**: with a mouse, the explanation that a first
  run opens by itself keeps off its own panel's text rows (src/screens/build/keywords.ts, src/screens/build/inspector.ts; a finger's notes did not move); **A2**: on the narrow phone shop card the footprint
  plate's ink follows the grid's own shape (src/ui/shapePic.ts, src/screens/build/shop.ts:335); **G6**: the victory drop card (src/screens/fork/drops.ts:181) and the warlord pick button
  (src/screens/warlordHud.ts:162) draw a shaped part's icon whole with the footprint mark (neither is reachable in the shipped game, so no frame moves). The operator saw the three stills (about 09:06Z on
  2026-11-11) and raised no objection.
- **The merge is file-disjoint** (setup.log section 5): the merged tree differs from the bump's in exactly the ride's 13 files and from the ride's in exactly the bump's 67, and no file is in both.
The label moves 0.9.16 -> **0.9.17** (src/version.ts:2, package.json:4, package-lock.json:3 and :9; three parts), so the title reads V0.9.17. docs/CHANGELOG.md's 0.9.17 entry says it in players' words (each claim
checked in the code: O/STAGE-REPORT.md lists file:line for each).

**VETERAN, in a player's words: win two runs in a row and your ghosts get tougher; lose a run, or abandon one, and they go back.** (A run is won at its 10th win; days go on while hearts remain.) What the code does
(packet section 1, read in the code at this tree): the game counts, on the device, the runs it won in a row, in the browser key `beltbattles.streak.v1` (STREAK_KEY, src/game/online.ts:51; the value is
`{ streak, last }`, :48-50): a won run adds 1, once per run id (takeStreak, :209-222; capped at 99, VETERAN_STREAK_MAX, src/net/veteran.ts:70); a run that ends lost, or at the day cap, sets it to 0 (countRun,
:231-235), and so does ABANDON RUN before the 10th win (src/screens/build/chrome.ts:361 calls abandonRun, src/game/streakHook.ts:15-17, online.ts:226-229; an abandon in ENDLESS, where the run was already won,
changes nothing). Every match request of a run carries `streak=<n>` once the count is above 0 (online.ts:246 and :251; src/net/ghostClient.ts:38), so a fresh device sends none, and the count changes only at a run's end or at ABANDON, so every
request of one run carries the same count (online.ts:246). From 2 (VETERAN_AT,
src/net/veteran.ts:67) a request is a veteran's (veteranFor, :105-107); the server takes an integer in 0..99 and answers 400 to anything else (`streak: expected an integer in 0..99`, server/app.ts:250 and :222-253)
and, for a veteran whose record in the run is 2 or more wins ahead of its losses, picks from the stronger half of the eligible ghosts by grade, then by the nearest record (veteranPick, server/app.ts:442 and :445; the
veteran's lead { share 0.5, at 2 }, src/net/veteran.ts:75, :5-9). **The shield** (VETERAN_SHIELD, :79): a request that is not a veteran's never draws a tier ghost (player id `sample-<hero>-3`, VETERAN_TIER_VARIANT :84) while another ghost is eligible (veteranPick,
:116-122). **The tier**: STREAK_TARGET 525, days 5-16, one ghost a hero (tools/samplePool.ts:918, :922 and :925). The switch is VETERAN = true (src/net/veteran.ts:35). A request under rules before bb-0.16.0
(VETERAN_RULES, :64), an endless request and a request with the switch off pick exactly as before (:118). A forged streak only changes the ghosts of that device's own run: the server trusts it as it trusts
`runs` (:11-12). There is no server state and no profile field for the streak (online.ts:48-50), and **nothing on screen shows it**: a player never sees the count, the tier or the shield (packet section 7).

**The two launch paths** (cap chooses at the launch; the STAGE rehearsed both, and this section describes both). One launch carries the page and the server together on either path, and never the page alone. The seed line
is the same on both, `254 written, 0 unchanged, 0 removed` into a new bucket; what differs is what the live store holds before, the lists after, the launch call's guards and the rollback target.
- **PATH A: 0.9.16 goes live first** (section 37's launch, as staged, under its own yes from the operator), and 0.9.17 then launches on top of it (this section, under its own yes). *The store before this launch*
  holds bb-0.15.0's 230 pool ghosts (written by 0.9.16's launch) and every upload under it, bb-0.14.0's 192 and every upload under it, and the older pools, and nothing under bb-0.16.0. *The seed line*:
  `254 written, 0 unchanged, 0 removed` (bb-0.16.0). *The lists after*: bb-0.16.0 `all 254 0 0`, bb-0.15.0 `all 230 N P` and bb-0.14.0 `all 192 N P`. *The launch call's guards* read 0.9.16 as live: refuse unless the
  hosting service serves 0.9.16's page byte for byte (`content-length: 1177256`, sha256 `0825a2ddf82919e1…`), /v1/health reads `"rules":"bb-0.15.0"` and `fly releases -a beltbattles --image` lists 0.9.16's release
  first. *The rollback target*: 0.9.16's hosting release (v31 if nothing else ships first; read it at the launch), whose image reference is read there, not written here.
- **PATH B: 0.9.16 is never launched alone**: 0.9.17 launches on top of 0.9.15.1 (the hosting release v30, live today) and carries all of 0.9.16 with it (the CHANGELOG's 0.9.16 and 0.9.17 sections ship together).
  bb-0.15.0 never goes live and has no bucket in the store. *The store before this launch* holds bb-0.14.0's 192 pool ghosts (0.9.15's launch wrote them and 0.9.15.1's kept them) and every upload under them, and the
  older pools; nothing under bb-0.15.0 or bb-0.16.0. *The seed line*: `254 written, 0 unchanged, 0 removed` (bb-0.16.0). *The lists after*: bb-0.16.0 `all 254 0 0`, bb-0.14.0 `all 192 N P`, and bb-0.15.0, which has no
  bucket, prints an empty table: the title line `ghosts:admin list --rules bb-0.15.0: jsonl store, <dir> (read only)`, the column heads `day pool uploads players` and the one row `all 0 0 0`. *The launch call's guards* read 0.9.15.1 as live: refuse unless it serves 0.9.15.1's page byte for byte (`content-length: 1176557`, sha256 `0e6b7aed33fc9297…`), /v1/health reads
  `"rules":"bb-0.14.0"` and `fly releases -a beltbattles --image` lists 0.9.15.1's release (v30) first. *The rollback target*: 0.9.15.1's hosting release v30.
Both guards keep the list as releases-before.txt (the rollback needs it). On either path an open older tab keeps its page until it reloads (STAGE-0915's F4): section 5's "Older pages" says what it meets after the launch, and the rollback paragraph says what an open 0.9.17 tab meets after a rollback.

**What ships.** Branch r0917 at its tip (tag stage-0917, made when the STAGE ends; the launch text names its 12 hex): r0917-base (stage-0916 = 3eb2669e9a6a, tag object 32c89583f2b5); r0917-bump (BUMP-1I, above; tag object c2d70e9d6c48);
the ride's merge (`r0917-rides` 8eb3f084956d against r0917-base: 80 files, the union of the two parts' own files (67 + 13), A 8, M 72, D 0, 22 commits: src/sim 3, src/net 2, src/game 2, src/core 0, other src 7, server 3,
tools 2, scripts 0, tests 60, docs 1, deploy/ 0; **12 of them under the protected paths, all BUMP-1I's, by design in a rules release**: server/app.ts, server/ghostProbe.ts, server/seedPoolData.ts, src/game/online.ts,
src/game/streakHook.ts, src/net/ghostClient.ts, src/net/veteran.ts, src/sim/content.ts, src/sim/harness/endlessBench.ts, src/sim/standInPoolData.ts, tools/retune1.ts and tools/samplePool.ts; no package file,
src/version.ts, vite.config.ts, index.html or deploy/ before the label); the scripts-only commit fea30bff5976 (scripts/rcruns.mjs's version check follows the label, the brief's ruling 8; any later tooling fix is named in
O/STAGE-REPORT.md); the label commit 771ec08d406e (src/version.ts, package.json, package-lock.json and the two label pins, tests/rc.label.test.ts and tests/packs.rules.test.ts; the pages are built here) and the CHANGELOG
commit ec3cf40ee00b (docs/CHANGELOG.md only); and the release record, commit [[T12]] (tag r0917-T): deploy/GAME_BUILD.txt and this runbook. After r0917-rides only those files change (the label's three files, the
two label pins, scripts/ tooling fixes, docs/CHANGELOG.md and deploy/). The suite is 604 test files at r0917-rides (599 at the base; 5 new: veteran.pick and veteran.device (the bump); present6.cornermarks,
present6.pickplate and present6.sight (the ride); 0 deleted). The generated files are read only (the hull lane made them; the STAGE never regenerates a pool and never rebuilds the stand-in bundle):
server/seedPoolData.ts 566,721 bytes, sha16 `d3dced6c68750e24` (254 ghosts); src/sim/standInPoolData.ts 101,654 bytes, `7ff1cc1af31ba14d` (192 decks, days 1-16); src/sim/harness/luckCapsData.ts 7,401 bytes,
`df6335f71ec121ef`; tools/samplePool.ts 105,960 bytes, `9c34cf5ede9faf2b`; tests/fixtures/runes.parity.x.json 371,733 bytes, `87a13e10c619d61b`; tests/fixtures/beltside-062c/roadDraws-080.json 48,147 bytes,
`92baceda9986f949`.
- **The page** is BeltBattles-0.9.17-771ec08d406e-online.html, 1,180,630 bytes, sha256 `8e4522603efd8cb0…` (GAME_BUILD.txt holds the
  whole hash), built at 771ec08 and staged from ../output-stage0917/pages/. It is 3,374 bytes larger than 0.9.16's page (1,177,256 bytes; sha16 `0825a2ddf82919e1`) and 4,073 bytes larger than 0.9.15.1's page (1,176,557 bytes;
  sha16 `0e6b7aed33fc9297`). Shore gets the offline page of the same commit: BeltBattles-0.9.17-771ec08d406e.html, 1,180,619 bytes,
  sha256 `a02b23c9cd19042f…` (= ../output-stage0917/shore/index.html; 3,374 bytes larger than 0.9.16's offline page, 1,177,245 bytes, sha16 `31194e0e8725a657`, and 4,073 bytes larger than 0.9.15.1's, 1,176,546 bytes, sha16 `f0a2e209b9a4eaec`).
- **The server changes** (this is why the release is one launch): server/dist built at this commit is 1,891,276 bytes in 9 files, against 0.9.16's 9 files, 1,824,043 bytes (W/ref/0916-dist: T(0.9.16)'s export, which the base's page and
  server are; kit0917/srvdiff.sh, O/logs/srvdiff-<commit>.txt): The STAGE's rehearsals below ran at the label commit 771ec08d406e (the log names carry its 12 hex) and carry to this commit, which adds only docs/CHANGELOG.md, deploy/RUNBOOK.md and deploy/GAME_BUILD.txt (the ledger's X..T rule). **All 9 files differ in name or content from 0.9.16's** (`SRVDIFF: DIFFERS`, as a rules release must read; the bundle is 67,233 bytes larger than 0.9.16's, and 176,252 bytes larger than 0.9.15.1's 9 files, 1,715,024 bytes): ghost-server.mjs (3,206 -> 3,158 bytes), ghost-admin.mjs (17,624 -> 17,618) and ghost-probe.mjs (39,987 -> 41,965, +1,978: PROBE_RULES bb-0.16.0 and the two veteran rows) keep their names and differ in content (the chunk names and identifiers they import, and the rules literal bb-0.15.0 -> bb-0.16.0); the config chunk (config-C5tbAk-n.mjs -> config-BKFl5BdW.mjs, 68,164 -> 68,235 bytes, +71) holds the server's app code (server/app.ts: the `streak` parse and the two veteranPick calls); the seed chunk (seed-9bAb1ILK.mjs -> seed-BcSJFmHS.mjs, 501,039 -> 568,393 bytes, +67,354) holds the 254-ghost pool (server/seedPoolData.ts grows by 67,385 bytes); gen-ghost-pool.mjs (406,786 -> 407,011 bytes, +225) is the generator's bundle (BUMP-1I changed tools/samplePool.ts and src/sim/content.ts, which it bundles). The chunk graph is cut anew: 0.9.16's validate (320,940 bytes), enchantSources (459,498) and identity (6,799) chunks are gone, and three chunks take their places: fallback-8kMVSJD5.mjs (760,813 bytes: the shared sim and net code, which carries RULES_VERSION), records-DGUvyOdG.mjs (14,325) and veteran-O3ScFFIk.mjs (9,758: veteranPick, VETERAN_RULES, veteranRules and the upload identity code). Against 0.9.15.1's bundle every one of the 9 files differs too (the seed chunk 404,429 -> 568,393 bytes, the config chunk 68,164 -> 68,235, gen-ghost-pool.mjs 395,256 -> 407,011, ghost-probe.mjs 39,987 -> 41,965; its validate (320,940), enchantSources (458,619) and identity (6,799) chunks are gone the same way), so 0.9.15.1's launch can never be mistaken for this one's. BUMP-1I changes three server files (server/app.ts: the `streak` parse and the two veteranPick calls; server/ghostProbe.ts: PROBE_RULES and
  the two veteran probe rows; server/seedPoolData.ts: the bb-0.16.0 pool) and sim and net code that the server bundles (src/net/veteran.ts, new, which server/app.ts and server/ghostProbe.ts import; src/sim/content.ts:
  RULES_VERSION); PRESENT-6 changes no file under server/, src/sim, src/net, src/core, src/game or tools/ (none of the ride's src files is imported from server/: setup.log section 7). The Dockerfile, .dockerignore and
  deploy/stage.mjs have no change since r0917-base, and the tracked launch config is as section 36 left it (next bullet). Uploads stay open.
- **The launch config** is the tracked one (RIDE L1, live since 0.9.15.1: cap's config-only commit 19fb9b2bbb69, numstat `11 0` on the launch config alone; the file is 2,849 bytes, sha16
  `383a063f00df9673`, and neither 0.9.16 nor 0.9.17 changes it: the scope check lists no file outside the 80 and reads the launch config as the base's, 0 changed). Its release lines are
  `release_command_timeout = "15m"` (line 25), `[deploy.release_command_vm]` (line 27) and `size = "performance-1x"` (line 28). **0.9.15.1's release machine was a performance-1x, and
  its release command ran 68 s (14:38:52-14:40:00Z) inside the 15 minutes** (it ran the seed, `0 written, 192 unchanged, 0 removed`; LIVE-09151 section 4, check C3: the platform's live
  config read `release_command_timeout` 15m0s and a `release_command_vm` size of performance-1x), so **a launch uses the tracked config as it is: no extra config file**: no
  `--config`, no untracked launch.toml and no '?? launch.toml' guard (the brief's step 6, as at 0.9.16); the plain `fly deploy --ha=false --remote-only` from the repo root reads those lines. **What to read after
  the launch**: the launch output itself prints no machine size (LIVE-09151), so read the platform's live config, which must still say `release_command_timeout` 15m0s and a
  `release_command_vm` size of performance-1x, and the seed's time on the release machine, which must come in inside the 15 minutes (section 4: the platform's CLI prints only
  `release_command <machine> completed successfully`, and the `seed:` line is in `fly logs -a beltbattles --no-tail`; ledger C4 is this launch's read: the seed's line and its time, for the
  hull lane's LIVE packet; the seed's peak RSS cannot be read after the fact, because the release machine is destroyed when the command ends: LIVE-0915).
- **The rules** are bb-0.16.0: RULES_VERSION (src/sim/content.ts:66), PROBE_RULES (server/ghostProbe.ts:130), SEED_POOL_RULES (server/seedPoolData.ts:8; server/seed.ts:92 refuses a
  pool dealt under other rules), STAND_IN_DATA.rules (src/sim/standInPoolData.ts:51, generated) and **VETERAN_RULES (src/net/veteran.ts:64, new)**, a literal like LEAD_RULES, so it stays put at later bumps.
  **LEAD_RULES (src/net/rulesGate.ts:580) stays bb-0.15.0 and is a stable literal from now on**: a match request under bb-0.15.0 or older keeps its old pick whatever the switches and whatever streak it states
  (src/net/rulesGate.ts:575-579; src/net/veteran.ts:62-63 and :118). The server's exact rules check (server/app.ts:366-368) is unchanged and reads RULES_VERSION. GATES_RULES (src/net/rulesGate.ts:318)
  and ENCHANT_RULES (:360) stay bb-0.13.0; SCALE_RULES (:512) and ENDLESS_RULES (:562) bb-0.12.0; LONG_RUN_RULES (:493) and SHAPES2_RULES (:278) bb-0.11.0; HEARTS_RULES (:433), PICK_RULES (:453), OPEN_RUNES_RULES
  (:477), FREE_JOINS_RULES (:222), SHAPES_RULES (:238) and NPC_DAY_RULES (:206) bb-0.10.0 and LAST_CHANCE_RULES (:190) bb-0.9.7; FIRST_RUN stays false (src/sim/firstRun.ts:35); POOL_RULES_CARRIED is empty
  (src/sim/content.ts:76), so POOL_RULES = RULES_VERSION (:78). The switches EFFECT_FLOOR (src/sim/effectFloor.ts:28), GATES (src/sim/gates.ts:31), ENCHANT (src/sim/enchant.ts:28),
  SCALE_RIGS (src/sim/scale.ts:34) and ENDLESS (src/sim/endless.ts:27) are on beside LONG_RUN, PLAIN_RIGS, SHAPES2, HEARTS and SHAPES, and so are 0.9.16's CURVE (src/net/curve.ts:23) and SOFT1_CURVE
  (tools/samplePool.ts:356); **new since 0.9.16 are VETERAN (src/net/veteran.ts:35), VETERAN_SHIELD (:79), VETERAN_AT (:67), VETERAN_STREAK_MAX (:70), VETERAN_TIER_VARIANT (:84) and the device key STREAK_KEY
  (src/game/online.ts:51)**; POISON_DPS is 2 (src/sim/content.ts:113), ENDLESS_GOD_HULL_STEP 1500 (src/sim/endless.ts:162) and STAND_IN_POOL_DAYS 16 (src/sim/standInPool.ts:88). A 0.9.17 page asks for, and uploads
  under, bb-0.16.0; a 0.9.16 page asks for bb-0.15.0; a 0.9.15.1 or 0.9.15 page asks for bb-0.14.0. The match route reads only the bucket of the rules a request names (server/app.ts:442-445) and an upload under other
  rules is refused (422 `rules bb-0.15.0 not accepted: this server validates bb-0.16.0`, server/app.ts:366-368), so **a player of 0.9.17 meets only bb-0.16.0 ghosts**, except a foe that a run saved by an older
  version had already picked for its day (the saved runs below). The fingerprint (857,831 bytes, sha16 `bb71188c4f0e188f`) and all 41 parBench lines (`fingerprint all: e1ec0b3c`) are unchanged from 0.9.16's, because the
  sim reads neither the rules literal nor the pick (packet section 2; the STAGE's reads of them are in the checks paragraph below).

**The order.** One launch carries the page and the server together, on top of the live release of the chosen path (0.9.16's hosting release on PATH A, 0.9.15.1's v30 on PATH B), and never the page alone. **The launch call is the Prime's**
(CMD-0917, from CMD-0916's text, ported for the path that holds; run once, and only after **the operator's yes**, asked in chat for the exact text, simulated first, before anything is submitted: the release lane's ask-first
rule, PLAN-0917 section 4; the platform's own approval is no gate, because the policy engine approved a launch-type command at once at 0.9.15.1's clean-up, LIVE-09151 section 2). The ask tells the operator that the seed writes
a NEW bucket, 254 ghosts under bb-0.16.0, that uploads made under the older rules stop meeting players, and, on PATH B, that this one launch carries 0.9.16 too. The call is two texts, the LAUNCH and a guarded FINISH
(probe, revalidate, remove-player, restart, lists, releases-after) with its own simulation, so that a cut leaves a clean resume point (PLAN-0917 section 4; 0.9.15.1's launch call was cut off by a restart after its
probe: LIVE-09151). The guards are the chosen path's (above); then stage the 0.9.17 page, launch once (`fly deploy --ha=false --remote-only`: the image carries the new server/dist and the new page, and the tracked
launch config gives the release command its machine and its 15 minutes), and run section 5's live checks with this page: health `"rules":"bb-0.16.0"` and `"uploads":"open"`, `content-length: 1180630`,
`live page = the staged 0.9.17 online page (cmp)`, days 1-16 for a new player at 0 wins and 10 hearts (sixteen `-> 200`), day 3 at 1 win and 9 hearts (a v3 bb-0.16.0 snapshot), days 17, 25 and 26 as the STAGE's
seedcheck read them (below), an unsigned POST `-> 401`, the pool check (the ids that the sixteen day calls served are each one of this release's 254 seed ghosts: O/expect-ids-<commit>.txt, 254 lines, one `<day> <id>`
each, sorted, made by storeids.mjs from the tip's own seed, in the form of W/ref/stage0916/expect-ids-3eb2669e9a6a.txt; 4,693 bytes, sha16 `61073c940751b31a`; its counts by day are the pool's below), and `list --rules bb-0.16.0`: sixteen day rows (12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18 pool ghosts), then
`all 254 0 0` (`all 254 N P` if real players uploaded since the launch; on PATH A `list --rules bb-0.15.0` still reads `all 230 N P` and `list --rules bb-0.14.0` `all 192 N P`: those pools and their uploads stay). Section 5's
one-line call asks only days 1-16 and day 3: add `day=17`, `day=25` and `day=26` queries to see those three lines. In `fly logs -a beltbattles --no-tail`: the `seed:` line and the warm-up line (below). The page's own
label (V0.9.17 on the title) tells the pages apart in a browser.

**The release command** (`node /app/dist/ghost-server.mjs seed`) finds the live store as the chosen path's "store before" (above) and nothing under bb-0.16.0. This commit's bundle carries the new pool (server/seedPoolData.ts is
566,721 bytes, sha16 `d3dced6c68750e24`, 254 ghosts, days 1-16, 12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18 a day, SEED_POOL_RULES bb-0.16.0; 0.9.16's is 499,336 bytes, sha16 `2f22968dd422ee44`,
230 ghosts; 0.9.15.1's is 402,688 bytes, sha16 `5756d795170150f6`; the hull lane's read of it: 254 of 288 ghosts, 566,721 of the 620,000 byte limit, 822 reachable states, 0 uncovered, and with the 48 tier ghosts left out
still 0 uncovered with 4 or more other ghosts at every state; packet section 4): `seed: rules bb-0.16.0, 254 pool ghosts on tigris (...)` with **`254 written, 0 unchanged, 0 removed`**, and on every later launch of
the same image `0 written, 254 unchanged, 0 removed` (the release command runs at each `fly deploy`). **A new bucket: the older buckets (bb-0.15.0's on PATH A, bb-0.14.0's on both) and every upload under them are left
as they are**, so uploads made under the older rules stop meeting players (a 0.9.17 page asks for bb-0.16.0 only): the Tigris seed lists and writes only `ghosts/bb-0.16.0/dNN/pool/` (server/tigrisStore.ts
replacePool, :261). Rehearsed on this commit's real CLI and the older CLIs, on BOTH paths, each on its own fresh scratch JSON-lines store (kit0917/seed0917.sh, O/logs/seed0917-<commit>.log; 0.9.15.1's CLI from
W/ref/09151-dist and 0.9.16's from W/ref/0916-dist), each step as it must read. PATH A: (a0) 0.9.15.1's seed on a fresh store `192 written, 0 unchanged, 0 removed` (bb-0.14.0); (a) 0.9.16's seed over it `230 written, 0
unchanged, 0 removed` (bb-0.15.0); (b) **this commit's seed over that `254 written, 0 unchanged, 0 removed`** (bb-0.16.0), bb-0.15.0's and bb-0.14.0's lines in pool.jsonl byte for byte as they were and both still listed;
(c) again **`0 written, 254 unchanged, 0 removed`**, pool.jsonl byte-identical; (d) `list --rules bb-0.16.0` reads `all 254 0 0`, `list --rules bb-0.15.0` `all 230 0 0` and `list --rules bb-0.14.0` `all 192 0 0`, and
revalidate's dry run (below); (e) **the rollback to 0.9.16**, 0.9.16's seed over that store, **`0 written, 230 unchanged, 0 removed`** (bb-0.15.0), pool.jsonl byte-identical, bb-0.16.0's 254 still listed. PATH B:
(a) 0.9.15.1's seed on a fresh store `192 written, 0 unchanged, 0 removed`; (b) **this commit's seed over it `254 written, 0 unchanged, 0 removed`**, bb-0.14.0's 192 byte for byte as they were and **no bb-0.15.0 record anywhere
in the store**; (c) again `0 written, 254 unchanged, 0 removed`; (d) `list --rules bb-0.16.0` reads `all 254 0 0`, `list --rules bb-0.14.0` `all 192 0 0` and `list --rules bb-0.15.0` prints an empty table: the title line `ghosts:admin list --rules bb-0.15.0: jsonl store, <dir> (read only)`, the column heads `day pool uploads players` and the one row `all 0 0 0`; (e) **the rollback to
0.9.15.1**, 0.9.15.1's seed over that store, **`0 written, 192 unchanged, 0 removed`** (bb-0.14.0), bb-0.16.0's 254 still listed. On the Tigris path (kit0917/tigris-rollback.sh: the real CLIs against tools/fakeS3.ts; PATH A's
form, 0.9.16's seed and then this commit's, with PATH B's form where the clock allowed it; O/logs/tigris-rollback-<commit>.log) the same steps run with every object checked byte for byte (hashes in the log) and no DELETE
request, then a step f (the old server over the rolled-back bucket: the rollback check below): all five steps read as they must on both forms (PATH A's, 0.9.16 and this commit: vitest exit 0 in 51 s; PATH B's, 0.9.15.1 and this commit: vitest exit 0 in 50 s). PATH A: (a) 0.9.16's seed on an empty bucket `230 written, 0 unchanged, 0 removed` (230 objects under bb-0.15.0, none under bb-0.16.0); (b) this commit's seed `254 written, 0 unchanged, 0 removed` (254 objects under bb-0.16.0; bb-0.15.0's 230 byte for byte as before, hash 18b9b688b65b4cb3 both times); (c) again `0 written, 254 unchanged, 0 removed`; (d) the tip's `list` reads bb-0.16.0 `all 254 0 0` and bb-0.15.0 `all 230 0 0`; (e) the rollback, 0.9.16's seed, `0 written, 230 unchanged, 0 removed`, bb-0.15.0's hash 18b9b688b65b4cb3 again and bb-0.16.0's 254 objects byte for byte as they were (hash 66c8941a9f4b10b1 both times). The fake S3 saw 484 PUT, 525 GET, 107 LIST and 0 DELETE requests. PATH B reads the same with 0.9.15.1 (bb-0.14.0, 192 objects, hash f8aeae37d0f8c81b both times; bb-0.16.0's 254, hash 66c8941a9f4b10b1) and saw 446 PUT, 486 GET, 107 LIST and 0 DELETE. The reads and the seed's cost (step b: one process, the exact peak RSS by K/maxrss.py; kit0917/seedtime.sh: one
pinned core, a fresh store, O/logs/seedtime-<commit>.log): seed0917 reads **20 PASS, 0 FAIL** (`SEED REHEARSAL (0.9.17, both paths): PASS`). PATH A's step b (this commit's seed over the store 0.9.16's launch leaves: the launch of 0.9.17) ran **11.2 s with a peak RSS of 252,504 kB** (exit 0, nice 19, one process, 1-minute load 1.51, this host); step a0 (0.9.15.1's seed on a fresh store, 192 written) 11.2 s and 251,728 kB; step a (0.9.16's seed over it, 230 written) 11.2 s and 246,984 kB; step c (this commit's seed again, 0 written, 254 unchanged) 11.2 s and 274,456 kB; step e (the rollback to 0.9.16, 0.9.16's seed, 0 written, 230 unchanged) 11.2 s and 260,572 kB. PATH B's step b (this commit's seed over 0.9.15.1's store) ran **11.2 s with a peak RSS of 235,380 kB**; its step a (192 written) 11.2 s and 234,252 kB; step c (0 written, 254 unchanged) 11.2 s and 236,028 kB; step e (the rollback to 0.9.15.1, 0.9.15.1's seed, 0 written, 192 unchanged) 11.1 s and 254,764 kB. kit0917/seedtime.sh (one pinned core, a fresh store, 254 written) read **15 s wall and a peak RSS (VmHWM, last read) of 269,108 kB**. These are this host's reads, not the release machine's. The canary (`BB_POOL_CANARY=1` on tests/net-pool, alone; O/logs/canary-<commit>.log): [[S7:CANARY]] The hull lane's local read of the seed was 12.0 s with a
peak RSS of 256,484 kB (packet section 4; BUMP-1H's 230 ghosts: 252,396 kB; 0.9.16's STAGE read 244,000 kB here: section 37), and the hull lane's advice is to keep the performance-1x release machine (RIDE L1's tracked
config). The seed plays no battle, but it checks all 254 ghosts first (the strict decoder, the rules, validateUpload in the player mode and the reachable record), whether or not it writes them. 0.9.15.1's release command wrote
nothing and ran 68 s on its performance-1x machine (above); this launch writes 254 ghosts into a new bucket, so ledger C4's read of its time on the release machine is the one that counts.

**The boot.** The server warms roadCap's memo once the port is open and uploads are open (server/main.ts, server/warm.ts; neither changed since 0.9.14, but BUMP-1I changed sim and net code the warm-up runs, so the STAGE reads it
again). After the launch and after a restart, look for the line `road model warmed for days 1-25 under rules bb-0.16.0 in <ms> ms` (server/warm.ts:26) in `fly logs -a beltbattles --no-tail`. The tracked launch config's
health check has a 10 s grace period, a 30 s interval and a 5 s timeout, and the serving machine is its [[vm]] block: shared-cpu-1x with 256 MB. The hull lane's local read at bb-0.16.0 (packet section 4): health in 0.29 s, the
warm-up line at 875 ms and a peak RSS of 122,564 kB, against a 160,000 kB bar. Rehearsed on this commit (kit0917/boot0917.sh: this commit's server/dist/ghost-server.mjs started the way the Dockerfile and the tracked launch
config start it, on a scratch store after the release command's seed; one pinned core; O/logs/boot-<commit>.log): boot 1 (after the release command's seed): the first `/v1/health` 200 at 548 ms after the process start (RSS then 91,280 kB; health `"rules":"bb-0.16.0"`, 254 ghosts, uploads open), the warm-up line at 1,829 ms: `road model warmed for days 1-25 under rules bb-0.16.0 in 1631 ms`, VmRSS 127,340 kB after it and peak VmHWM 129,968 kB; boot 2 (a restart on the same store): health at 684 ms, the warm-up line at 2,304 ms (`... in 2078 ms`), VmRSS 120,916 kB after it and peak VmHWM 129,076 kB; each peak is under the 160,000 kB bar, and a health after the warm-up answered 200 in about a millisecond. This host's one core is not the release machine's, and other lanes ran beside it, so the times are a floor (the hull lane read 0.29 s, 875 ms and 122,564 kB).

**The probe block** is section 35's, under bb-0.16.0 (PROBE_RULES, server/ghostProbe.ts:130; the plan is twenty POSTs, the endless match and the two veteran GET rows, 23 rows; the probe-id file is
../output-stage0917/probe-id.txt, which must not exist yet): `node server/dist/ghost-probe.mjs https://beltbattles.fly.dev ../output-stage0917/probe-id.txt` prints **26
lines** (the header `probe: POST https://beltbattles.fly.dev/v1/ghosts as a fresh device (rules bb-0.16.0); only the FURNACE, WEAVER, FOUNDRY and BASTION decks may be stored`, 23 checks,
`probe player:` and the summary), ending **`probe: 23 of 23 checks as expected; the server stored 10 deck(s) for this player (expected 10); the player id is in
../output-stage0917/probe-id.txt`** (with `--profile` after the id file, two PUTs more and **`25 of 25`**). **The two new rows are GETs after the endless match, and they store no deck** (the stored count stays 10):
`veteran-match` (a veteran's request on the start record, `/v1/ghosts/match?rules=bb-0.16.0&runs=5&day=1&wins=0&lives=10&player=other-player&streak=2`, expects 200 and a ghost) and `veteran-bad` (the same with `streak=x`,
expects 400 and the error `streak: expected an integer in 0..99`; server/ghostProbe.ts:69-72 and :584-604). A server that does not read `streak` never answers the second row with a 400, so the pair tells a build that reads
it from one that does not; against a closed store the plain run reads 1 of 23 (veteran-bad answers its 400 before the store is read: packet section 4). Revalidate's dry run (below); `remove-player <id> --rules bb-0.16.0
--apply` prints its `delete ghosts/bb-0.16.0/dNN/player/<id>.json` lines and **`APPLIED: deleted 10 of 10 record(s).`** (the Tigris store enumerates days 1 to 25, so it finds the probe's day-14 ENDLESS record too); then
`fly apps restart beltbattles`, health again, and `list --rules bb-0.16.0` reads `all 254 0 0` (or `all 254 N P`, if real players have uploaded). Rehearsed locally on the built commit (kit0917/probecheck.sh,
O/logs/probecheck-<commit>.txt): 25 `expect:` lines, all yes and none NO. The first probe prints 26 lines (the header, 23 checks, `probe player:` and the summary) and ends `probe: 23 of 23 checks as expected; the server stored 10 deck(s) for this player (expected 10)`; the named rows read PASS (lastchance-signed 201, lastchance-day3 422, npcday-signed 201, npcday-forged 422, longrun-signed 201, scale-signed 201, gates-signed 201, endless-honest 201, endless-wins-cap 400, endless-norecord 422, endless-match 200, **veteran-match 200 (a ghost) and veteran-bad 400 (`streak: expected an integer in 0..99`)**, longrun-nolosses 422). Revalidate's dry run with the probe's decks on the store: `plan: delete 0 record(s) of bb-0.16.0; keep 254 seed-pool ghost(s) and 10 upload(s)`. `remove-player` printed `APPLIED: deleted 10 of 10 record(s).` three times (step 4, the hand clean-up, and the `--profile` probe's), and the list read `all 254 0 0` after each restart and after the last clean-up. `--profile` read `probe: 25 of 25 checks as expected; the server stored 10 deck(s) for this player (expected 10)` with profile-signed 200 and profile-badsig 401. The day-3 match after the restart is a v3 seed ghost under bb-0.16.0; the guard (a second probe on the same id file) is refused with exit 2, and the fresh probe after it reads 23 of 23 again. **The hand clean-up** is section 30's block run from this clone, with at most 10 decks: its `cd` names
/home/cap/.hermit/primes/.workspaces/cap/beltbattles-r0917/BeltBattles-r0917, both `../output-stage0911/probe-id.txt` become `../output-stage0917/probe-id.txt`, and both `--rules bb-0.11.0` become `--rules bb-0.16.0`.

**Revalidate**: after the launch run `fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs revalidate --rules bb-0.16.0'` (a dry run; add `--apply` only if it plans deletes you expect) **over the stored
bb-0.16.0 records only, in a fresh process** (each `fly ssh console -C` is one). The dry run prints a `plan:` line for bb-0.16.0 and `DRY RUN: nothing was deleted. --apply deletes exactly the N record(s) above.`, and, only
when the store holds a stored endless snapshot past day 25, S1's one line (section 7). With this image `revalidate` takes only `--rules bb-0.16.0` (section 7: it runs only for the build's rules, so the bb-0.15.0 and
bb-0.14.0 records are not read by it); `list` and `remove-player` take any rules. Rehearsed over the scratch store (the form `plan: delete 0 record(s) of bb-0.16.0; keep 254 seed-pool ghost(s) and N upload(s)`): `plan: delete 0 record(s) of bb-0.16.0; keep 254 seed-pool ghost(s) and 0 upload(s)` and then `DRY RUN: nothing was deleted. --apply deletes exactly the 0 record(s) above.` (seed0917's step d on each path: this commit's real ghost-admin in its own process; no S1 line on a clean store); with the probe's 10 uploads on the store the probecheck dry run reads `plan: delete 0 record(s) of bb-0.16.0; keep 254 seed-pool ghost(s) and 10 upload(s)`.

**S1's read-only check after the launch** (section 34's form; the guard is in this server too: server/app.ts:361-363 and server/ghostAdmin.ts:271, the second unchanged since 0.9.14.1): on the machine run
`fly ssh console -a beltbattles -C 'node /app/dist/ghost-admin.mjs list --rules bb-0.16.0'` and the same with `--rules bb-0.15.0` (PATH A) and `--rules bb-0.14.0` (`list` is read only, never runs the deck check, and is
safe on the 256 MB machine). It prints one row per day: `day pool uploads players`. A run snapshot is never past day 25 (the decoder), so **a row whose day is above 25 with uploads above 0 is a stored endless snapshot past
the bound**; expect none (the game never uploads one, and S1 refuses one since 0.9.14.1). A clean bb-0.16.0 store prints rows for days 1-16 only, with 12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18 pool
ghosts (packet section 4; seed0917's step d and seedcheck read them), then **`all 254 0 0`** right after the launch (`all 254 N P` once real players have uploaded). On PATH A bb-0.15.0 reads **`all 230 N P`** (0.9.16's
pool and what players uploaded under 0.9.16) and bb-0.14.0 **`all 192 N P`**; on PATH B bb-0.14.0 reads **`all 192 N P`** (it holds what players uploaded under 0.9.15 and 0.9.15.1, and the pool stays) and bb-0.15.0,
which has no bucket, prints an empty table: the title line `ghosts:admin list --rules bb-0.15.0: jsonl store, <dir> (read only)`, the column heads `day pool uploads players` and the one row `all 0 0 0`. While such a row exists, run `revalidate` only with an image that has S1 (this one or 0.9.14.1's and later). To remove one: `remove-player <playerId> --rules <its rules>` (a dry
run first), then `--apply` on the operator's say-so, then `fly apps restart beltbattles` (the server serves deleted ghosts from its bucket cache until BB_GHOST_CACHE_TTL_S, 600 s). If the lane sees one, the account is a
hand-built client: tell the operator.

**The days a GET answers 200 for** (a new player at 0 wins and 10 hearts; kit0917/seedcheck.sh's [3] and [3d] on this commit's server over the scratch store, O/logs/seedcheck-<commit>.txt): health `{"ok":true,"rules":"bb-0.16.0","store":"jsonl","ghosts":254,"uploads":"open","uptimeS":0}`; the served page is the staged page (cmp) and its label reads 0.9.17; days 1 to 16 each `-> 200` (sixteen of sixteen), and each of the sixteen served a ghost that is a line (its served day, its id) of O/expect-ids-<commit>.txt (16 of 16); day 3 at 1 win and 9 hearts a v3 bb-0.16.0 snapshot; **day 17 `-> 200` (the ghost served is from day 16: a thin day widens to the nearest earlier day), day 25 `-> 200` (also from day 16) and day 26 `-> 400` (`day: expected an integer in 1..25`)**, the same three answers as 0.9.16's; [5]'s bb-0.15.0 match 404 here (the scratch store holds no pool under bb-0.15.0); the unsigned POST 401; the per-day pool counts of `list --rules bb-0.16.0` are 12, 12, 13, 13, 16, 17, 16, 17, 17, 16, 18, 16, 18, 17, 18 and 18; 16 of 16 `expect:` lines yes. The day bound is 25
(maxDayFor; parseMatchQuery, server/app.ts:243), and a thin day widens to the nearest earlier day that has an eligible ghost (section 5, item 5). On the hosting service a bb-0.15.0 request (an open 0.9.16 tab, PATH A) is
answered from bb-0.15.0's pool and a bb-0.14.0 request (an open 0.9.15.1 tab) from bb-0.14.0's pool, which the scratch store does not hold (it answers 404 there).

**ENDLESS online** is as sections 33 and 34 say: the client goes online for an endless dusk only up to day 25 (ENDLESS_ONLINE_LAST_DAY, src/sim/endless.ts:156); past day 25 the foe is THE GOD with no request, and S1
refuses such an upload at once (server/app.ts:361-363). ENDLESS_RULES stays bb-0.12.0 (src/net/rulesGate.ts:562) and THE GOD's hull step 1500 (src/sim/endless.ts:162): BUMP-1I changes neither value. An endless request is
never a veteran's (src/net/veteran.ts:118), and an abandon in ENDLESS leaves the streak as it is (src/game/online.ts:227).

**Saved runs and the streak key, from the code** (O/logs/step2ab-saved-runs.md, read at r0917-rides; ledger A2 is the format). The save's key (`beltbattles.run.v7`, src/game/save.ts:39), RUN_VERSION (8,
src/game/run.ts:244) and the save guard (src/game/saveGuard.ts) are unchanged since 0.9.16 (ledger A2: `git diff --quiet 3eb2669e9a6a <this commit> -- src/game/save.ts src/game/run.ts src/game/saveGuard.ts` exits 0; the
whole-folder proof `-- src/game` exits 1 by design, because the bump changes src/game/online.ts and adds src/game/streakHook.ts, and neither touches a save: the streak is its own device key, STREAK_KEY, which is not on
Run and in no save, profile or upload: src/game/online.ts:48-51), so a 0.9.17 save has 0.9.16's and 0.9.15.1's keys. (a) **A run saved in 0.9.16 (bb-0.15.0) or in 0.9.15.1 (bb-0.14.0) and opened in 0.9.17, and whether
such a run's end moves the streak:** the same code decides it as for 0.9.16 loading a 0.9.15.1 save (section 37): the three files of ledger A2's proof are unchanged (`git diff --quiet 3eb2669e9a6a HEAD -- src/game/save.ts src/game/run.ts src/game/saveGuard.ts` exits 0; only src/game/online.ts and the new src/game/streakHook.ts move under src/game, and they add one device-only key that is no part of a save), so it loads and goes on, with no aside line, because every id it names is known to 0.9.17: BUMP-1I and PRESENT-6 add or remove no part, hero or rune (`git diff -U0 3eb2669e9a6a HEAD -- src/sim/content.ts` is line 66 alone; the guard is src/game/saveGuard.ts:19-38 and :70-86). The dusk foe a run stores when its dusk starts is fought exactly as stored (src/game/run.ts:134-140, src/game/day.ts:78-80 and :108-115, src/game/online.ts:258), and a stored dusk foe or warlord deck is re-placed under the shape rules, not re-picked (src/game/save.ts:136, :180). From its next request on the run asks for ghosts under bb-0.16.0 (src/game/online.ts:249; src/game/day.ts:64-65) and stamps its uploads bb-0.16.0 (src/game/day.ts:132), the only rules this server takes (server/app.ts:366-368). **Its end moves the streak like any other run's**: the battle screen's end calls countRun for every finished run (src/screens/battle.ts:491), which takes the streak once per run id (src/game/online.ts:232-234 and :216): a run won at its tenth win adds 1, a lost run or the day cap sets 0, and nothing on that path asks when the run began or under which rules, so a run started in 0.9.16 or 0.9.15.1 and finished in 0.9.17 counts like one started in 0.9.17; ABANDON RUN on it sets 0 (src/screens/build/chrome.ts:361, src/game/online.ts:226-229). A dusk fought under the older rules reads REPLAY UNAVAILABLE (OTHER RULES) in 0.9.17, as it did on 0.9.16 (src/net/replay.ts:92). On PATH B no player has a 0.9.16 save. (b) **A run saved in 0.9.17 and opened on 0.9.16 or on 0.9.15.1 (the two rollbacks):** from the code it loads: the same key and RUN_VERSION, `Run` unchanged and the guard unchanged, and 0.9.17 adds no hero, part or rune id, so the older guard finds nothing unknown and there is no aside line. A dusk foe already stored (it may be a bb-0.16.0 ghost, a tier ghost included) is fought as stored; from then on the run asks for and uploads under that build's own rules again (bb-0.15.0 on 0.9.16, bb-0.14.0 on 0.9.15.1), and its bb-0.16.0 uploads stay in the store and meet no older player; its REPLAY of a 0.9.17 dusk reads REPLAY UNAVAILABLE (OTHER RULES) there. The older pages never read, write or clear `beltbattles.streak.v1` (`git grep` for it finds nothing in src at 3eb2669e9a6a or at 89bb5abacfbb, and neither revision clears storage wholesale or walks its keys), so the count stays on the device as the last 0.9.17 run end left it, and it is what it was when the player is back on 0.9.17. The browser read of all this is the rollback probe, below. (c) **The streak key** (what 0.9.17 reads when it is absent or
malformed, and what the older pages do with it): `streak()` (src/game/online.ts:197-204) reads the key `beltbattles.streak.v1` as JSON: absent (no key, or no storage) reads 0, malformed JSON reads 0, and so do a non-integer, a negative number and an integer above VETERAN_STREAK_MAX (99, src/net/veteran.ts:70); the stored form is `{ streak: N, last: <run id> }` (online.ts:218; `last` is the once-per-run guard, :216), written only at a run's end or at ABANDON RUN, and only while the online session is active. A request carries `streak` only when it is above 0 (online.ts:251; src/net/ghostClient.ts:38), so a device with the key absent, malformed or 0 sends the request it always sent; the server answers 400 `streak: expected an integer in 0..99` to anything else (server/app.ts:214-220 and :250), and a request under VETERAN_AT (2, src/net/veteran.ts:67) is not a veteran's. Neither older page reads or clears the key (the grep above).

**Rollback, per path** (its own yes from the operator in chat, every time, after telling him; never part of the launch call). Check that the releases-before file lists the rollback target first; if not, stop and ask the
Prime. If a probe's decks are on the store, run the clean-up first, while 0.9.17 serves. From this clone, the target's image reference being the one in releases-before.txt:

```sh
fly deploy --ha=false --remote-only --image <IMAGE REF of the rollback target, from releases-before.txt>
```

- **PATH A: the target is** 0.9.16's hosting release (v31 if nothing else ships first; read it at the launch). It is the page (1,177,256 bytes, sha256 `0825a2ddf82919e1…`, V0.9.16) and the server together, **on bb-0.15.0 on both sides**: players ask for bb-0.15.0 ghosts
  again, and bb-0.16.0's decks meet none of them. Its release command (`seed`) re-seeds bb-0.15.0's pool: **`0 written, 230 unchanged, 0 removed`**, and leaves bb-0.16.0's 254 pool ghosts and every upload under it in
  the bucket under their own prefix (rehearsed on the jsonl store: seed0917 PATH A step e; on Tigris, the real store, nothing is removed).
- **PATH B: the target is 0.9.15.1's hosting release v30** (image registry.fly.io/beltbattles:deployment-01M72YAPXXJRGYNC7NTDH9PVWW; the page 1,176,557 bytes, sha256 `0e6b7aed33fc9297…`, V0.9.15.1, and the server
  together, **on bb-0.14.0 on both sides**). Its release command re-seeds bb-0.14.0's pool: **`0 written, 192 unchanged, 0 removed`**, and leaves bb-0.16.0's 254 pool ghosts and every upload under it in the bucket
  (rehearsed: seed0917 PATH B step e; and nothing is removed on Tigris).
**For both: what an open 0.9.17 tab meets after the rollback.** The hull lane's packet (W/ref/bump1i/PACKET-STAGE-BUMP1I.md, section 4, which corrects item 9 of its REPORT) reads the old route's code: the old server's match route reads
the bucket the request names and has no rules check of its own, and its parseMatchQuery checks only the form of the rules string and ignores `streak` (STAGE-0915's F4 again). By that reading an open 0.9.17 tab keeps asking for bb-0.16.0
ghosts, and the old server serves them from the bucket the launch wrote, by its own old pick: no shield (a player who is not on a streak can meet one of the 48 tier ghosts on days 5-16, tougher than 0.9.16's 24) and no
veteran's lead (a player on a streak gets the ordinary pick), until the page reloads onto the old build; its uploads are refused until then (the old server's rules check takes its own rules only: 422). That is a reading
of the code. **What the STAGE's rollback check READ** (step 1: the hull lane's request `/v1/ghosts/match?rules=bb-0.16.0&runs=5&day=1&wins=0&lives=10&player=other-player&streak=2`, sent to the OLD server over the store
that holds the bb-0.16.0 bucket; where it differs from the reading above, the measured read wins): on PATH A, 0.9.16's server (W/ref/0916-dist): health `"rules":"bb-0.15.0"`; GET match rules=bb-0.15.0 day 3 -> 200; PUT /v1/profile -> 401 (the route exists); an unsigned POST /v1/ghosts -> 401; 0 `skipping bad object` log lines. **The hull lane's request** (`/v1/ghosts/match?rules=bb-0.16.0&runs=5&day=1&wins=0&lives=10&player=other-player&streak=2`) **answered 200 with a bb-0.16.0 ghost** (g17f449972ca2fa, player sample-bastion-2: not a tier ghost, and none stands on day 1); the same request without a streak (`streak=0`) served the same ghost, so the old route ignores `streak`; and a request for day 12 at 9 wins and 8 hearts from a player not on a streak was served a **tier ghost** (g15073091009a3b, sample-weaver-3): the old server has no shield. The jsonl rehearsal of PATH A read the same (0.9.16's own server over the store after the rollback seed: health `"rules":"bb-0.15.0"`, 676 ghosts; 200 and a bb-0.16.0 ghost, g0cf8db555dd719, sample-foundry-2, on day 1; a tier ghost, sample-bastion-3, on day 12). on PATH B, 0.9.15.1's server (W/ref/09151-dist) over PATH B's store after its step (e):
(the Tigris form of PATH B) health `"rules":"bb-0.14.0"`; GET match rules=bb-0.14.0 day 3 -> 200; PUT /v1/profile -> 401; an unsigned POST /v1/ghosts -> 401; 0 `skipping bad object` log lines. **The hull lane's request answered 200 with a bb-0.16.0 ghost** (g17f449972ca2fa, sample-bastion-2, not a tier ghost); the same without a streak served the same ghost; and the day-12 request from a player not on a streak was served a **tier ghost** (g06c5ebf64c11cd, sample-furnace-3), as on PATH A. The jsonl rehearsal of PATH B read the same (0.9.15.1's own server over the store after step e: health `"rules":"bb-0.14.0"`, 446 ghosts; 200 and a bb-0.16.0 ghost, g1305999db5dc28, sample-foundry-1, on day 1; a tier ghost, sample-bastion-3, on day 12). Only a store that never held the bb-0.16.0 bucket answers such a tab with a 404, and the tab then picks from its bundled pool with the shield (src/net/ghostClient.ts:108-122, veteranFallback). A page that
reloads is the old build's page again, asking for its own rules. **Read in a browser** by the STAGE's rollback probe (kit0917/rbprobe0917 on the two older pages, with a 0.9.17 save taken mid-run after a fight against a
ghost and one in ENDLESS, each with `beltbattles.streak.v1` holding 2): on 0.9.16's page (PATH A): [[S7:RBSAVE_A]] on 0.9.15.1's page (PATH B): [[S7:RBSAVE_B]] The launch config's env and VM lines are unchanged, so the image
route is safe for the server. Before the target: on PATH A the release before 0.9.16's is 0.9.15.1's v30 (section 37's rollback); before 0.9.15.1: 0.9.15's release v29 (image
registry.fly.io/beltbattles:deployment-01M6XV00ACXZ2KGHG69555EYHH; section 36's rollback, on the same rules bb-0.14.0), 0.9.14.1's v28 (section 35's rollback, which puts bb-0.13.0 back on both sides), 0.9.14's v27
(section 34's rollback, on the same rules bb-0.13.0) and v25 = 0.9.13 (section 33's rollback, which puts bb-0.12.0 back on both sides); **never v26, which failed** (LIVE-0915); going back past the target is a
separate decision. Rolling back loses nothing on the server.

tests/tsc-tests-baseline.json is unchanged by both parts (3,382 bytes, sha16 `216977d9b4bd72fe`, 163 type errors); the release lane did not touch it.

**The known limitations** (internal notes: the hull lane's packet section 7 and PRESENT-6's packet section 7, the first group of the brief's ruling 14; none is fixed here and none is a STOP): (1) the endless on the road (RULING-BUMP1I-R2
R2.2): par's mean endless wins over its won runs at THE GOD's step 1500 read 5.79 on the gate's read (band 2-6), 6.17 on a second read and 5.98 pooled (800 runs, se 0.46); off the road 2.76; the endless did not change in this
release; (2) the heroes' spread on the road: par reaches 10 wins on the road in 66.1% (furnace), 85.9% (weaver), 80.2% (foundry) and 64.6% (bastion) of runs, the widest gap 15.6 against a bar of 20; (3) bastion's endless mean is
0.66 off the road, on the next rules release's list (R2.1); (4) tests/rivals.difficulty keeps 71 open LADDER_X_OPEN entries at its K 24 instrument, re-stamped from one dump (53 moved, none past its old ceiling), and none is
a K 96 failure; (5) STAGE-0916's F11 stands: MOTH QUEEN's day-10 and SILKSHADE's day-4 good-luck decks stay over the luck caps (pinned in tests/captains.luck.test.ts); (6) nothing in the game shows the streak, by design in
this release; (7) the comment at src/sim/content.ts:61-63 still calls the lead pick bb-0.15.0's mechanism (a comment in a closure file; it waits for the next regeneration); (8) REQ-BFG-125's reads (packet section 8): par reaches 10 wins in
74.2% of runs on a streak and 91.3% off it (0.9.16: 90.1%), about 80.6% over the long run (bars 60.0-85.0), and the casual bot c5 in 30.5% (0.9.16: 28.9%), because the tier is kept for players on a streak; the CHANGELOG
says nothing about par or the endless; (9) PRESENT-6's accepted soft point (its packet section 7): **with a mouse on phone-sized views the note in its new place under the panel can lie over the bow turret slots' tap
boxes, and a press there closes the note**; A2 is the rule for every shaped part on the narrow card, the 4 px arrowheads read as plus signs, and 1920x1080 with a rune held keeps the old place; (10) the shield on the server (RULING-BUMP1I-R1 R1.6): server/app.ts calls veteranPick on one day's bucket at a time (the request's own day, then each earlier
day: :440-446), so on the server a request that is not a veteran's draws a tier ghost as soon as one day's bucket holds no other eligible ghost, while the bench and the client's offline pick look at the whole pool at
once; neither the hull lane's replay of the two off-the-road reads against the server's walk (1,536 runs, 17,690 fights, every pick on the request's own day, no tier ghost drawn either way) nor the state count shows
such a bucket (packet section 4). 0.9.16's findings and notes
(W/ref/stage0916/REVIEW-STAGE0916.md: F10, the desk scout report's toast over the corner caption, and the small layout notes) stand. The others of sections 35, 36 and 37 stand, except where this release changes one.
The display part's packet and rulings are W/ref/rides/present6/STAGING-PACKET-PRESENT6.md and its siblings.

**The checks of this STAGE** (STAGE-0917; O/STAGE-REPORT.md has every command, log and number, and O/LEDGER-0917.md every check's row: what ran at the label commit or at T, and what it carried from the earlier STAGEs and the
hull lane's runs, with the proof's exit code; this paragraph is brought up to date by the closing docs commit): [[S7:CHECKS]]

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
