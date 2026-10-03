# BeltBattles changelog

What each release adds for players. The repo kept no changelog before 0.8.0. 0.7.0's notes are in docs/ASYNC.md
("0.7.0 for players"), and 0.6.x's are in the published release notes.

## 0.8.1: phone controls

Touch controls that work on a phone. No battle rule changes: the rules stay bb-0.8.0, so 0.8.0's ghosts and uploads
keep playing. A mouse works as in 0.8.0; its one change is the one-output notice below.
- **On touch, a tap reads and a drag moves.** A tap opens a part's panel and leaves the part where it is, even if the
  finger drifts a little. A drag places or moves it. Tap a placed part again to turn it, and tap a turret again to read
  its core and gear.
- **Shop cards you can't afford** open their panel too. BUY stays greyed.
- **Belts:** a tapped belt shows an X beside its ringed tile, and its panel has REMOVE BELT.
- **One-output factories:** dragging from one moves its belt, and the game says so, for example "KILN HAS 1 OUTPUT ·
  THIS MOVES ITS BELT".
- **The signature factory** says it stays: "THE SIGNATURE FACTORY STAYS ABOARD. IT CAN'T BE SOLD."
- **Bigger targets on phones:** panel buttons, the run summary's NEW RUN and TITLE, and the replay's BACK are at least
  44 px. On touch in landscape, the panel column's buttons sit two to a row. Placed parts and fitted pieces show SELL +NG.

## 0.8.0: humans and dwarves

**Two new heroes.** Hero select offers four heroes. Each comes with its hull, guns, signature factory and ammo, and a
portrait (docs/RACES.md sections 1, 2 and 9).
- **FOUNDRY** (human, HUMAN GUILDS). Its CRUCIBLE pours ALLOY BLANKs into each of its belts at once. Two blanks that
  reach one gun together fuse into an ALLOY SLUG worth 1.15 times both. A weld flash marks each fuse, and the route
  inspector marks belts that arrive in SYNC. Hull 225.
- **BASTION** (dwarf, DWARVEN HOLDS). Its WARDWORKS stamps BULWARK SLUGs. Each one that loads into its heavy gun plates
  the hull: 2 plating, up to 24. Plating takes enemy hits and burn before the hull does. A plating bar on the hull plate
  shows it. Hull 215.
- Their signatures stay unique and unbuyable. Every part in the shared pool does something for them.

**Wave 3: fifteen new parts in the one shared pool**, for every hero:
- rigs: PLATE ROLLER, TWIN GAUGE, PINCER, BRACE FRAME, TWIN LATCH, STOKER, PLATE BREAKER and SHIELD WALL;
- factories: TWIN MOULD and ARMOR PRESS;
- cores: ANVIL BREECH and STEAM BREECH;
- mods: TWIN TRIGGER, SPALL CATCHER and SEAM WELDER.

Two new families lead them: **TWIN** (paired, synchronised arrivals) and **PLATE** (plating, repair, endurance). Seven
families in all (FORGE, HARASS, SWARM, BURST, TEMPO, TWIN, PLATE) now mark the cards as shop hints, with every family
twelve parts or more.

**Six new captains**, each with a portrait and a plan for days 1-10:
- BRASSWICK (FOUNDRY's hull, Easy): MATCHED POUR, "MIRRORED BELTS, GAUGED. EVERY POUR FUSES.";
- MASTER VOSS (FOUNDRY's hull, Hard): LOCKSTEP, "LATCHED IN STEP. EVERY PAIR HITS HARDER.";
- GRIMHOLD (BASTION's hull, Medium): ANVIL WALL, "THICK PLATE MAKES EVERY SHOT HIT HARDER.";
- THANE KARSK (BASTION's hull, Hard): SHIELD WALL, "A WALL OF PLATE. HE BREAKS IT ON YOU.";
- LOCKJAW (FURNACE, a dusk stand-in only): TWIN BITE, "LATCHED BELTS. HIS SLUGS LAND IN PAIRS.";
- THISTLEMAIL (WEAVER, a dusk stand-in only): LEAF MAIL, "THREADS PLATE HER. PLATED, HER GUNS SPIN.".

The four race warlords also stand in at dusk.

**A per-run draw.** As the catalogue grows, each run draws 62 wares from it, unlocked in 5 steps over the ten days. The
caravan offers only the run's own wares, and rigs still lead the offers.

**The SMUGGLER's contraband.** When an effect has nothing unlocked yet, the SMUGGLER offers the run's own drawn wares of
that effect ahead of their day. It is blocked only when the run drew none. Early SHOCK, for example, is now blocked in
about 1 run in 77 (it was about 1 in 6).

**The balance pass for four heroes:**
- FOUNDRY's fuse is 1.15 times (it was 1.3) and its hull 225 (it was 250). BASTION's hull is 215 (it was 240).
- ANVIL BREECH, STEAM BREECH and ARMOR PRESS hit harder.
- ASSEMBLY LINE at 2 and 3 stars and OVERDRIVE at 2 stars are retuned, so each star step is a gain.
- Nine captains are regrown or eased.
- STOKER says when it is capped ("THE KILN'S GUN IS FULL, SO IT WORKS ONLY 25% FASTER.").
- PLATE BREAKER shows its damage range on a plated deck.

**Online (the Fly page).** The rules are now bb-0.8.0. 0.8.0 starts a fresh ghost pool, seeded with 120 honest decks of
all four heroes, three per hero for each day. 0.7.0's ghosts and uploads don't mix with 0.8.0's. Offline, the Shore page
plays as before, with no requests.
