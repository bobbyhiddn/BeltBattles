# BeltBattles: full-game design (0.6.0 to 1.0)

Written against 0.4.1 (rules `bb-0.4.0`) while 0.5.0 (cruiser spacing, road events) is in
flight. Every pass keeps the rule the game already lives by: the battle sim is fixed-step,
seeded and deterministic, and every enemy is a real production build under player rules.
Lines marked **DECIDED** record the Prime's decisions; anything still **OPEN** is for the Prime.

## 0.6.0 Rivals and finale

**Goal.** A run becomes three acts against named rival captains instead of the same warlord
scaled by round. The data, builds, schedule and tests are already in: `src/sim/rivals.ts`,
`src/sim/rivalBuilds.ts`, `tests/rivals*.test.ts`.

**Acts.**

| Act | Banner | Rounds | Fights |
|---|---|---|---|
| I | ACT I · THE CINDER ROAD | 1-3 | two tier-1 regulars, then the act-1 elite (round 3) |
| II | ACT II · THE SKYWRIGHT PASS | 4-7 | three tier-2 regulars, then the act-2 elite (round 7) |
| III | ACT III · THE GRAND FOUNDRY | 8-12 | two tier-3 regulars, the boss at round 10, retries at 11-12 |

`rivalFor(runSeed, round)` picks regulars by shuffling each act's pool with
`hashSeed(runSeed, "rival", act)`, so there are no repeats within a run and the shop and battle
streams are not touched. The pools hold 3, 4 and 3 regulars for 2, 3 and 2 slots, so any two
runs usually differ.

**Win condition.**
- Beat the boss, THE IRON MATRIARCH, to win the run. This replaces `RUN_WINS = 7`.
- Every loss costs a life, as today (3 lives). Lose the last life and the run is lost at once, boss or not.
- Losing to the boss at round 10 costs a life and sends you back to the caravan. You then retry at round 11, and at 12 if needed, while you have lives.
- The boss buys one more plate and one more gate per retry (`matriarch` plan), so a retry needs a better deck, not luck.
- There are 12 rounds at most. A run that is still alive after losing at round 12 is lost.
- **DECIDED:** a draw with the boss counts as a loss that costs no life. You retry at the next round against the escalated boss, and a draw at round 12 loses the run.
- **DECIDED:** reaching round 10 with 0 wins is allowed. The boss is the only gate.

**Rewards.** Income stays `incomeFor(round, won)`, and beating the boss ends the run.
**DECIDED:** beating an elite pays +3 gold and gives a free pick of 1 of 2 rare parts at the next
caravan, so rounds 3 and 7 feel like milestones.

**NEXT BATTLE panel** (`drawFoe` / `drawIdle` in `src/screens/build/inspector.ts`):
- The name comes from `RIVALS[id].name` instead of `warlordName`. It is red for regulars and gets an **ELITE** (amber) or **BOSS** (plum4) tag.
- Line 2: `trick` in yellow, then `blurb` in bone, e.g. `SLOW COOKER · ONE LONG WINDING BELT. LATE, HOT SLUGS.`
- Line 3 keeps the class line (`FURNACE · HULL 347`) and adds `TRY 2/3` on boss retries.
- A 24x24 portrait on the left: `portraitImage(id)` from `src/render/portraits.ts` (a faction base plus the rival's feature and palette from `RIVALS[id].portrait`; the hero card uses `portraitImage(heroId)`).
- In portrait layout the strip keeps 2 rows: name + tag, then trick. The blurb moves to the tap-to-inspect details.

**Act banners.** A full-width banner shows for 1.6 s when the caravan arrives before rounds 1, 4
and 8 (`actFor(round)`: title + name). Round 10 gets a FINALE banner with the boss portrait. The
banner also shows how far you are through the act (e.g. `2 RIVALS · 1 ELITE`) and appears again
on reload.

**Summary screen.** It lists every rival fought, in order: portrait, name, trick, round, result and
time. The one who ended a lost run is highlighted, and a won run shows the boss last with a crown.
It also shows `RIVALS BEATEN n/10`, plus elites and boss beaten.

**Roster** (reference = today's warlord of the other faction at the same round, fought as the
player over 20 seeds; a lower reference win rate means a harder rival. The margin is reference hull
left minus rival hull left, as fractions. Values come from `tests/rivals.difficulty.test.ts`.)

| Rival | Faction | Tier | Trick | Rounds | Ref win | Margin |
|---|---|---|---|---|---|---|
| SOOTJAW | Furnace / orc | 1 | SLOW COOKER | 1-2 | 50% | -0.06 |
| NETTLE | Weaver / elf | 1 | SHORT STITCH | 1-2 | 50% | +0.11 |
| GRUBNOSE | Furnace / orc | 1 | PRESS GANG | 1-2 | 100% | +0.33 |
| MOTH QUEEN | Weaver / elf | act-1 elite | FRAY STORM | 3 | 0% | -0.28 |
| SPARKFANG | Furnace / orc | 2 | SHOCK TROOPER | 4-6 | 88% | +0.21 |
| LACEWING | Weaver / elf | 2 | SPLITTER SWARM | 4-6 | 67% | +0.03 |
| RATCHET | Furnace / orc | 2 | OVERCLOCK | 4-6 | 38% | -0.06 |
| EMBERLYN | Weaver / elf | 2 | EMBER WEAVE | 4-6 | 67% | -0.02 |
| OLD BULWARK | Furnace / orc | act-2 elite | IRONCLAD | 7 | 0% | -0.33 |
| SILKSHADE | Weaver / elf | 3 | STATIC WEB | 8-9 | 35% | -0.02 |
| LONGTOOTH | Furnace / orc | 3 | GATE CHAIN | 8-9 | 15% | -0.22 |
| HIGHSPIRE | Weaver / elf | 3 | TRIPLE THREAT | 8-9 | 3% | -0.28 |
| IRON MATRIARCH | Furnace / orc | boss | GRAND FOUNDRY | 10-12 | 0% | -0.39 |

Every rival's hull is `warlordHull(round)` + 25 per plate it bought. Every deck costs no more than a
player who won every round could have spent by then.

**First fight and elites** (asserted in `tests/rivals.difficulty.test.ts`):
- At round 1, no tier-1 rival is harder than today's round-1 warlord for any pacing-test deck (start deck plus 0-2 gates): win rate at most 10 points lower, margin at most 0.05 lower, mirrors included.
- Sootjaw and Nettle open round 1 on a softer `opener` layout: a 6-tile staircase, and a loom under the guns with long stitches. From round 2 they redraw into their full trick.
- Each act elite leads every regular of its act by at least 0.08 margin. Moth Queen leads by 0.21 or more.

**DECIDED:** mirror matches stay. `rivalFor` keeps its `(runSeed, round)` signature; this is revisited
when new races add rivals.

**Road events (0.5.0) with rivals.** One seeded event with 2-3 priced choices sits between the caravan
and each battle. Rivals give events something to point at:
- SCOUT (1 gold) reveals the next rival's deck in the NEXT BATTLE panel.
- SABOTAGE (4 gold) removes the rival's newest upgrade for this fight (`planBuild` at round - 1).
- ELITE BOUNTY is offered only before rounds 3 and 7: stake 3 gold, get 10 back if you beat the elite.
- **DECIDED:** all three are accepted. The 0.6.0 integration adds them to the 0.5.0 road-event table.

## 0.7.0 Arsenal

**Scope.** The operator's v0.2 spec asks for six heroes across five races (Orc Furnace, Elf Weaver,
Human Foundry, Dwarf Bastion, Beastfolk Metronome, plus Siphon and a random pick), async matches
against other players' saved builds, PvE warlords at Easy/Medium/Hard, and dark-wind map events.
The Prime's revised roadmap governs 0.7.0 onward; ANVIL and VOLTA below are candidate mechanics only.

**Star merging.** Dropping a duplicate part onto its twin on the deck (or in cargo) merges them into
★2. Two ★2 parts merge into ★3, so ★3 takes 4 copies. With 5 offers a round and a pool of ~32, 4
copies are reachable in a 12-round run and 9 are not. A merged part keeps one tile, sells for half
of everything paid into it, and shows ★ pips on its rarity strip.

| Part | ★1 | ★2 | ★3 |
|---|---|---|---|
| Temper | 2 burn | 3 burn | 5 burn |
| Whetstone | +2 flat | +3 flat | +5 flat |
| Grease Works / Overdrive | 1.6x / 3x | 1.9x / 3.5x | 2.2x / 4x |
| Brake Shoe | 0.5x | 0.4x | 0.33x |
| Long Haul | +2 per prior gate | +3 | +4 |
| Galvanic Coil | 1.6 s stall | 2.2 s | 2.8 s, also stalls on hull hits |
| Splitter | 2 copies at 60% | 2 at 70% | 3 at 50% |
| Calibration | fires 25% faster | 35% | 45% |
| Stamp Press | 1.4 s stamp | 1.2 s | 1.0 s |

Supplies never merge. Rivals from 0.7.0 on may field ★2 parts in act III and ★3 parts at the boss only.

**Parts pool, 14 to 32.** Every part carries 1-2 synergy tags: BURN, SHOCK, FRAY, SPEED, HAUL, SPLIT,
ARMOR. A tag bonus lights up at 3 and 5 parts of one tag (e.g. BURN 3: burn ticks +25%).

| New part | Kind | Tags | Effect (★1) | Price |
|---|---|---|---|---|
| BELLOWS | gate | BURN | +1 burn per 2 s the payload has ridden | 5 |
| QUENCH TANK | gate | BURN, HAUL | turns the payload's burn into +3 flat per stack | 5 |
| SPARK PLUG | gate | SHOCK | shock + 1 flat; shocked targets take +20% for 2 s | 5 |
| RELAY COIL | gate | SHOCK | the next gate on the route triggers twice | 7 |
| BARBED SPOOL | gate | FRAY | payload applies +1 extra Fray stack | 5 |
| TENSIONER | gate | SPEED | 1.3x speed, never slower than 1x after it | 3 |
| COUNTERWEIGHT | gate | HAUL | +1 flat per belt tile already ridden (max +8) | 5 |
| SORTING ARM | gate | SPLIT | splits only every 2nd payload, copies at 100% | 7 |
| FLUX KETTLE | gate | BURN, SPLIT | 2 copies at 50%, each with +1 burn | 7 |
| RIFLING | mod | HAUL | shots on this turret +15% damage | 5 |
| HOPPER | mod | SPEED | loading window +1 slot | 5 |
| MANTLET | mod | ARMOR | this turret cannot be stalled | 5 |
| SPARE KILN / SPARE LOOM | factory | hero | a second signature factory, legendary | 12 |
| BOILER PLATE | supply | ARMOR | +15 hull, and burn on you ticks 20% slower | 4 |
| REPAIR KIT | supply | ARMOR | +40 hull for the next battle only | 3 |
| TOOL CRATE | supply | - | +1 cargo slot | 3 |
| LODESTONE | gate | SHOCK, HAUL | +1 flat per shocked hit this battle (max +6) | 7 |
| GILT SEAL | mod | - | turret fires 2 per shot while Fray on the foe is 10+ | 7 |

**Two new heroes** (candidate mechanics only, see the scope note):
- **ANVIL**, Deepguild dwarves. CRUCIBLE (2x2, 2.0 s) stamps SLAG slugs: base 7, and each hit leaves slag on the struck machine (+0.4 s to its next stamp or shot, max +1.2 s). One heavy centre turret (connectors 4 and 5) plus one light turret at column 8. Hull 220, belt 16. Playstyle: GRIND THEM DOWN.
- **VOLTA**, Sparkwright gnomes. DYNAMO (2x2, 0.9 s, 2 outputs) stamps CHARGE slugs: base 2, +1 per gate passed, and every machinery hit shocks. Two medium turrets (columns 2 and 7, window 2, 0.8 s). Hull 170, belt 20. Playstyle: GATES ARE AMMO.
- Each hero gets 3 rivals of its own in 0.7.x: one per tier, plus a variant elite.

## 0.8.0 Progression

- **Unlocks.** Furnace and Weaver start open. Beating the act-2 elite once unlocks ANVIL, and beating the boss once unlocks VOLTA. Parts unlock in 3 batches of 6: the first boss kill with any hero unlocks batch 1, the second hero's boss kill batch 2, a COMMODORE clear batch 3.
- **Difficulty tiers.** Beat the boss on one tier to open the next.
  - DECKHAND: rivals -25 hull, 4 lives.
  - CAPTAIN: as designed, 3 lives.
  - COMMODORE: rivals +1 plate and elites field their next-round deck.
  - ADMIRAL: rivals +2 plates, the boss has 1 retry, and income is -1 per round.
- **Run history.** The last 20 runs go to `beltbattles.history.v1` (about 2 KB each): hero, tier, seed, result, rivals fought and beaten, the final deck, battle times and gold spent. Tapping a run shows its summary screen and a REPLAY SEED button.
- **Daily seed.** `hashSeed("daily", "YYYY-MM-DD")` in UTC: the same rivals, shops and events for everyone that day. It works locally only and records the first attempt. **DECIDED:** the share code is deferred to the revised roadmap, because async play may replace it.
- **Tutorial round.** On first launch only (skippable), round 0 against SCRAP DUMMY: a bare kiln with 6 belt tiles and hull -80. Three prompts: draw a belt to the turret, drop the free temper on it, press FIGHT. Nothing carries over.

## 0.9.0 Balance and sound

- **Headless balance harness.** `npm run balance` runs a vitest file behind `BB_BALANCE=1`, like `tests/balance.test.ts`.
  - A reference strategy plays full runs for 200 seeds per hero. It buys the highest `estimateRoute` gain it can place, rerolls when nothing fits, and uses the cheapest belt fix.
  - It writes JSON and a text table: run win rate, per-round battle length, loss round, gold curve and each rival's kill rate.
- **Targets** (asserted in the harness, not in `npm test`):
  - The reference strategy wins a base CAPTAIN run 50-65% of the time per hero.
  - Rounds 1-3 average 20-45 s at 1x, and no battle exceeds 75 s before round 10.
  - It beats the boss on the first try in 30-45% of won runs.
  - No regular rival kills more than 35% of reference runs that reach it.
  - Each elite kills 25-45%.
- **Music.** Four loops from the existing WebAudio synth: caravan (96 bpm, 64 bars), battle for acts I-II (112 bpm), act III (120 bpm, minor) and boss (126 bpm, adds the kiln-roar drone). Each loop is 60-90 s, crossfades over 0.5 s and ducks under KO stingers.
- **By-ear SFX pass.** Loudness-match every event against `fire` (heavy) = 0 dB. A split has its own chirp; burn ticks are quieter than hits (-9 dB); shock gets a crackle tail; act banners get a gong. A 6-voice cap per event type stops 4x playback from mashing.

## 1.0 release

- **Performance on a mid-range phone** (Pixel 6a / iPhone 11 class):
  - 60 fps in the caravan and at 1x battle; at 4x playback the sim takes 4 ms or less per frame.
  - No frame over 33 ms in a 10-round scripted playthrough (`scripts/playthrough.mjs`).
  - The JS heap stays flat across 5 runs.
- **Single-file build.** `scripts/singlefile.mjs` produces one HTML file of at most 1.5 MB with no network requests. It loads offline from `file://`, and saves survive a version bump through a `version` migration.
- **Release gate.** All tests are green, the balance harness is within targets and `RULES_VERSION` is bumped. The operator plays one full run per hero on a phone and approves. **DECIDED:** a store or itch.io wrapper is the operator's call at release.
