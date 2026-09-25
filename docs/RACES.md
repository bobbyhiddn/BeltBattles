# BeltBattles races: FOUNDRY, BASTION, METRONOME, SIPHON

Build spec for the four new heroes (spec §6, §7, §11-§15, §25; roadmap §4). Numbers are
first-pass balance values. All four heroes run in the battle sim (`src/sim/races/`), and these
are their shipped values. The Prime's rulings on part 1's open items are in §6. **OPEN** marks
what is still undecided. The layout contract (factory 2x2, turret kind and col0, width 2) is
fixed by the art brief. Nothing here changes Furnace or Weaver: `tests/races.golden.test.ts`
pins their battles bit for bit.

## 0. Shared rules (all heroes, already live in 0.4.1)

- A belt cell is 12 px. Belts run at 30 px/s x speed state, so one tile takes 0.4 s at 1x.
  A connected route of n tiles is 12n+6 px long: 0.4n + 0.2 s at 1x.
- **Eligible ride time** counts only the seconds a payload actually moves on a belt. These don't
  count: time blocked in a queue, time stalled by Shock, time waiting in a chamber, and time
  before the payload is stamped. There are no repeat laps (routes don't loop).
- Chamber: a payload loads while the turret is in its load phase and has room in its window.
  The window closes when full, or 1.5 s after the first load. The turret then fires LIFO, one
  payload per fireInterval (two with Ext. Chamber), until empty. Jams: 4+ payloads backed up
  near a firing chamber cost one shot, then a random payload fires first (3 s cooldown).
- Impacts: 50% land on bare hull. The rest pick a weighted target: belt tile 1, gate 2,
  factory 3, turret 2. Every hit damages the hull. Shock disrupts the machine struck for 1.6 s.
- Starting layout: every hero starts with its signature factory wired to at least one live gun.
  A Stamp Press (plain slugs, 1.4 s) feeds any free connector.

## 1. FOUNDRY (Human, HUMAN GUILDS): engineer arrivals

| Field | Value |
|---|---|
| Hull / belt | 190 / 18 |
| Factory | CRUCIBLE 2x2: every 1.6 s it pours one ALLOY BLANK into each attached route with room at its entry, all on the same tick ("twin pour"). 2 outputs |
| Ammo | ALLOY BLANK: base 3, ride scaling 0, no special. Two synced blanks fuse into an ALLOY SLUG |
| Turrets | 2 MEDIUM. Gun 1: col0 2, connectors [2, 3]. Gun 2: col0 6, connectors [6, 7]. Both: fireInterval 0.8 s, window 2, flight 0.45 s |
| Start | Crucible at (2,6). Two mirrored 6-tile routes run straight up columns 2 and 3 into gun 1. Gun 1 is live and fuses every pour (9 dmg per 1.6 s). Gun 2 is dark until the player feeds it: a Stamp Press, or splitting the Crucible across both guns (no fusion then) |

**Sync rule ("arrive together").** A blank reaching a connector fuses with an unfused blank
already in the same turret's chamber when both of these hold:
1. The partner entered through a **different connector** (so never the same route).
2. The partner loaded **no more than 0.25 s** (15 ticks) earlier.

Fusion happens at intake, before firing. It ignores window space and the load/fire phase, and
uses no extra slot. A disrupted turret admits nothing, so both blanks wait at their connectors
and load, and fuse, on the same tick once it recovers. Waiting at a busy chamber therefore
keeps pairs together.

**Alloy slug.** Damage = 1.5 x (dA + dB), where each d is that blank's own damage when it fuses:
max(1, 3 x mult + flat), counting gates that blank passed on its own route. Burn adds, Shock
carries if either has it, and prior-gate count is the larger. The slug is fired as one payload.
Two plain blanks give 9. A Whetstone on one route gives (5 + 3) x 1.5 = 12.

**Unmatched blank.** It loads and fires as an ALLOY BLANK for its own damage (3 plus its gates).
It stays fusable only for 0.25 s after loading and is never lost. Desynced Foundry deals 2 x 3
per 1.6 s, 3.75 dmg/s. Synced Foundry deals 9 per 1.6 s, 5.6 dmg/s.

**Getting synchronized blanks legitimately (spec §14).** Generic factories make plain slugs,
which never fuse.
- The Crucible's twin pour is the source. Both blanks of a pour are born on the same tick, so
  equal travel time means sync.
- The player engineers equal travel: mirrored routes with the same tile count, and speed gates
  on the same cell index. Or a delay line: a route longer by a whole pour interval (1.6 s is
  4 tiles at 1x) meets the next pour's blank.
- The route inspector already reports arrival time per route. The UI should add a SYNC tick
  when two routes into one gun land within 0.25 s.
- **Deferred (ruling 7):** a human-pool gate ASSAY STAMP (rare, 5 g) that turns a passing plain
  slug into an alloy blank. It waits for the full-arsenal pass (0.10.0) and isn't built.
- Every fusion emits a `fuse` battle event `{ side, turret, dmg }` after the `load` event
  (ruling 10). Furnace and Weaver never emit one.

**Gates.**
- Splitter: splits a blank into two 60% copies on one belt. Copies can't fuse with each other
  (same connector) but can each fuse with a partner from the other route. Splitting both
  mirrored routes gives two fused slugs per pour at 60%, so +20% damage and more chamber load.
- Long Haul, Whetstone, Temper, Coil: act on the blank that passes them. The fused slug inherits
  them, and flat damage is multiplied by 1.5 in the fusion.
- Grease, Brake, Overdrive: change one route's travel time and desync it unless mirrored or
  compensated. Mirrored speed gates only move startup.
- Commissioning is per route (1.2 s + 0.6 s per earlier gate), so mirrored gates come online on
  the same tick.

**Impact model.**
- The Crucible is a factory target (weight 3). A Shock pauses both pours together, so sync holds.
- A Shock on one route's belt stalls that route for 1.6 s. Its blanks fall out of step and fire
  unfused until its backlog clears, a few pours later.
- A Shock on a gun closes its intake. Waiting pairs re-sync on release.

## 2. BASTION (Dwarf, DWARVEN HOLDS): plate and endure

| Field | Value |
|---|---|
| Hull / belt | 240 (very high) / 14 |
| Factory | WARDWORKS 2x2: one BULWARK SLUG every 1.5 s, 1 output |
| Ammo | BULWARK SLUG: base 4, ride scaling 0. Special: plates Bastion's hull on arrival |
| Turret | 1 HEAVY: col0 4, connectors [4, 5], fireInterval 1.2 s, window 3, flight 0.65 s |
| Start | Wardworks at (4,6), straight 6-tile route up column 4 into connector 4. The gun is live. Connector 5 is free for a Stamp Press |

**Plating rule.**
- Arrival means the chamber. When a bulwark slug loads into Bastion's chamber, the hull gains
  2 x the slug's split multiplier in plating, so a Splitter copy adds 1.2. The slug still fires
  normally.
- It happens at load, not on firing. The spec says "on arrival", so delivery tempo drives
  defence. A full or jammed chamber, or a shocked turret, visibly starves the plating.
- **Cap:** 24 plating. Excess is lost. **No decay**: plating lasts until it is spent or the
  battle ends. It resets between battles like all combat state.
- **Absorption:** plating takes enemy impact damage (including the Fray bonus) and Burn ticks
  point for point before HP. Every impact damages the hull wherever it lands, so plating guards
  every hit.
- **The dark wind bypasses plating.** The battle clock can't be stalled. Shock disruption isn't
  blocked. Plating doesn't count toward hull % at the 120 s cap.

**Gates.**
- Splitter: +20% damage and plating, and more chamber load, so jams come sooner.
- Long Haul, Whetstone: damage only.
- Temper, Coil: normal.
- Grease, Overdrive: plating starts sooner. Brake: plating starts later. Bulwark slugs have no
  ride scaling.
- Plain slugs from a Stamp Press don't plate.

**Impact model.** The Wardworks is a factory target (weight 3). A Shock on it pauses production,
and so plating, for 1.6 s. The heavy turret is one weight-2 target.

## 3. METRONOME (Beastfolk, BEASTFOLK PACKS): hit the beat

| Field | Value |
|---|---|
| Hull / belt | 200 / 20 |
| Factory | CLOCKWORKS 2x2: one PENDULUM SLUG every 1.3 s, 1 output |
| Ammo | PENDULUM SLUG: damage = 2 + 8 x max(0, 1 - abs(ride - 4.2) / 3.0), then x mult + flat as usual |
| Turret | 1 ADAPTABLE: col0 4, connectors [4, 5], fireInterval 0.9 s, window 3, flight 0.55 s |
| Start | Clockworks at (4,6), straight 6-tile route into connector 4 (ride 2.6 s, 5.7 dmg). The player builds toward 10 tiles |

**Speed lock.**
- Metronome belts ignore every speed state from any source. That includes its own Grease, Brake
  and Overdrive, and hostile Drag. Every Metronome belt runs at 1x.
- Those gates still count as gates for Long Haul and commissioning.
- Shock and freeze still stop a belt. They are stops, not speed states, and stopped time isn't
  ride time, so they delay a slug without changing its damage.

**Pendulum curve.** Ride time is the eligible ride time from §0. With speed locked it is exactly
0.4 x tiles + 0.2 s, so the route length sets the beat.
- The peak, 10 dmg, is at ride 4.2 s: a 10-tile route.
- It falls linearly to 2 at 1.2 s (2-3 tiles) and at 7.2 s (17-18 tiles).
- Samples: 6 tiles 5.7, 8 tiles 7.9, 10 tiles 10, 12 tiles 7.9.
- Under- and over-shooting cost the same. A congested queue adds no ride, because blocked time
  is excluded.

Implementation: `AmmoDef.rideCurve(ride)` replaces `base + rideScale x ride`. `Battle.fire`
and `estimateRoute` use it, with the firing turret's sweet-spot shift. The speed lock is
`HERO_RULES.metronome.speedLock` (`races/data.ts`): transport, the belt render state and
`estimateRoute` all run speed-locked belts at 1x.

**Module swap between days (ruling 4).**
1. The adaptable turret has one hardpoint, like every turret.
2. During preparation, Metronome may unmount its module to inventory and mount any owned turret
   module, free and as often as it likes. The mount locks when the battle starts.
3. Other heroes keep a mounted module until they sell it, from the 0.9.0 integration on.
- Data: `HERO_RULES[hero].freeModuleSwap`, true for Metronome only (a races table, so
  HeroDef is untouched). `storeMod` and the build screen are unchanged until 0.9.0 honours it.

**ESCAPEMENT and LONGCASE (ruling 5).** Shared turret modules: rare, 5 g, priced like
Calibration.
- ESCAPEMENT moves the sweet spot 1.2 s earlier: peak at ride 3.0 s, a 7-tile route.
- LONGCASE moves it 1.2 s later: peak at ride 5.4 s, a 13-tile route.
- Escapement also shortens its turret's fire interval by 10% on every ammo.
- Longcase adds 1.5 fired damage to non-pendulum ammo with at least 2.0 s of eligible belt ride.
  Pendulum damage keeps its shifted curve, with no added flat damage.
- Fused Escapement shortens the interval by 14% at ★2 and 18% at ★3. Fused Longcase's
  other-ammo bonus rises to 2.5 and 4 damage. The pendulum peak shifts stay at ±1.2 s.
- The Gunsmith sells both in the one shared pool. `DORMANT_ITEMS` contains neither.
- Head art, display only (`adaptableHead`): no beastfolk module shows HAMMER, ESCAPEMENT shows
  REPEATER and LONGCASE shows LANCE.

**Gates and impacts.**
- Metronome's belts stay at 1x speed. Grease, Brake and Overdrive add locked-belt damage at
  their hit, so all three are useful offers without disturbing the pendulum beat.
- Splitter copies keep the parent's ride time. A copy can re-ride at most one tick of belt
  (≤ 1/60 s), an older sim quirk shared with Furnace and kept for bit-identity.
- Whetstone, Long Haul, Temper and Coil work as usual.
- The Clockworks is a weight-3 target and the adaptable turret weight 2.

## 4. SIPHON (Unaligned, SUMP DRIFTERS): bleed their line

The sixth hero, unlocked by the first completed run (ruling 9). That gate comes later; the
battle sim runs Siphon in full now.

| Field | Value |
|---|---|
| Hull / belt | 190 / 20 |
| Factory | SUMP 2x2: one LEECH SLUG every 0.9 s, 2 outputs fed round robin (like the Loom) |
| Ammo | LEECH SLUG: base 3, ride scaling 0. Special: DRAG or ECHO, marked at stamping |
| Turrets | 2 LIGHT. Left: col0 1, connector [2]. Right: col0 7, connector [7]. Both: fireInterval 0.6 s, window 2, flight 0.34 s |
| Start | Sump at (4,6). An 8-tile route to connector 2 and an 8-tile route to connector 7 (16/20 belt). Both guns are live |

**How the Sump chooses.**
- It stamps each leech for the gun its route feeds: routes into the left gun carry DRAG, routes
  into the right gun carry ECHO. A route with no gun carries DRAG.
- This is deterministic, readable on the belt, and the player picks by routing. Alternating per
  stamp was rejected: a blocked route flips the parity for good.
- Implementation: the mark is the ammo kind (`leechDrag` or `leechEcho`, both base 3), so
  Splitter copies keep it. The Sump is fed round robin like the Loom (`sumpProduce`).

**Drag.**
- When a DRAG leech strikes a belt tile, the struck segment runs at x0.25 of its speed state
  for 3.0 s. A segment is the belt span between two machinery nodes (spec §5.3).
- A gate hit drags the segment downstream of it. A factory hit drags the first segment of each
  of its routes. A turret hit drags the last segment of each route feeding it. A bare-hull hit
  deals damage only.
- Re-hits refresh the 3.0 s; they don't stack.
- Dragged movement isn't eligible ride time, so Drag never cooks Furnace slugs hotter. A slug
  crawling through a dragged segment gains no ride there, so it arrives cooler.
- Metronome belts are immune.
- Implementation: gate cells are the nodes, so a segment is a run of plain belt cells between
  gates (`segments`). A gate hit drags the run that starts right after the gate; nothing is
  dragged if the next cell is another gate or the route ends. 0.6.2 BELTSIDE: gates became rigs
  beside the belt (ref DESIGN-beltside.md), so the nodes are the belt tiles a rig's arrows hit.
  Each hit tile opens the segment downstream of it, every tile belongs to one segment, and a rig
  hit drags the segment that starts at each tile it hits. Drag lives on the struck side
  (`RaceSide.drag`, per-cell end times). A Furnace or Weaver side gets that state only when it
  faces a Siphon (`raceLink`).

**Echo.** The Prime's proposal, refined:
- Siphon keeps an echo memory: the most recent enemy payload that struck its cruiser.
- When an ECHO leech loads into its chamber, it copies that payload's added effects: flat damage
  (cap +6), Burn stacks (cap 4), Shock, and Fray stacks (cap 1, only thread slugs carry it).
- It doesn't copy base damage, ride scaling or split multipliers. Those are the enemy's ammo
  and factory, not its processing. An empty memory gives a plain leech.
- The memory isn't consumed. Each new enemy impact overwrites it.
- An alloy slug keeps its fused base damage in `flat`, so Echo copies only the part above a
  plain fusion: flat - 9. A copied Fray stack lands on impact, like a thread slug's.
- Why: gates are never fired, so "last fired module" has no referent. The payload that just hit
  you is concrete, visible and deterministic. Copying at load shows the charge in the chamber
  before it fires. Echo gets stronger the more the enemy processes, which is Siphon's counter
  role, and does nothing against a bare line.

**Gates.**
- Splitter copies keep their mode; each ECHO copy gets flat x mult and full statuses.
- Grease, Brake and Overdrive work normally.
- Coil plus DRAG: a non-hull hit both disrupts and drags.

**Impact model.** The Sump is a weight-3 target, and each light gun is weight 2.

## 5. Balance intent and open items

- Target: each new hero wins 35-65% against Furnace and Weaver at an equal gold budget. The
  separate balance harness measures that over populations of legal builds, and tuning happens
  there. The numbers in §1-§4 are first-pass values; none was tuned to a table.
- `output/matchups6.md` (6x6, reference builds, days 1/5/10, 20 seeds from both sides) is a
  report, not a target. Fixed builds make most cells 0% or 100%. Its test asserts only sanity:
  every battle ends before BATTLE_CAP, every number is finite, and both sides fire.
- **OPEN (balance harness): reference spend.** Furnace and Weaver references (ai.ts
  `warlordBuild`) spend far less than the race heroes' references: 0 of 8 g on day 1 against
  6 of 8, and 45-47 g against 58-65 g on day 10 (§7). Not fixed here; the harness owns spend.
- **OPEN (ruling 8): turret target weights.** Weight is 2 per gun, so three-gun Weaver draws
  more turret hits than one-gun Bastion (spec §15). Changing it alters Furnace and Weaver
  battles, so it waits for the balance pass.
- **OPEN (0.8.0/0.9.0 integration, UI and caravan):**
  - a FUSE visual for the `fuse` event (the sim emits it);
  - a plating bar on the hull plate (`race.plating.plate`, cap 24);
  - a SYNC marker in the route inspector (two routes into one gun within 0.25 s);
  - Drag and Echo overlays (dragged cells in `race.drag.until`; the echo memory in
    `race.echo.mem`, copied into each ECHO leech at load);
  - adaptable head art from `adaptableHead` (HAMMER, REPEATER, LANCE);
  - the build screen honours `freeModuleSwap`; the caravan honours `shopExclude` (a
    `DORMANT_ITEMS` part joins the one shared pool once it gains an effect on other ammo; no
    faction pools);
  - `PLAYABLE_HEROES` grows as heroes ship, and Siphon unlocks after the first completed run.
- **Deferred (ruling 7):** ASSAY STAMP, in the full-arsenal pass (0.10.0).

## 6. Prime rulings (part 2)

1. **Reference builds, not warlords.** "Warlord" is the Easy/Medium/Hard captain roster. The
   per-hero decks are reference builds in `src/sim/races/refBuilds.ts`: `raceStartBuild(hero,
   uid0)` and `raceRefBuild(hero, day)`. A run is 10 days, so days 1-10; other days clamp.
2. **One entry point**, `src/sim/heroBuilds.ts`: `heroStartBuild(hero)` and
   `heroRefBuild(hero, day)` for all six heroes, and `PLAYABLE_HEROES = ["furnace", "weaver"]`.
   Furnace and Weaver delegate to ai.ts: `startingBuild`, and `warlordBuild(hero, day)` with
   `hullBonus = PLATE_STEP x rampPlates(day)`. Items, modules and belt stay as `warlordBuild`
   makes them. Every hero and day returns a deck of the requested hero (tested).
3. **Honest budget.** All 60 reference builds are decks a player could own that day: the
   validate.ts rules, whole plates, never negative, and purchase cost at most
   `maxGoldByDay(day)` (START_GOLD plus `incomeFor(d, true)` for each earlier day). Day 1 is a
   real fight: no handicap and no softened layout.
   - **Amended (Step A): the plating ramp rounds to the NEAREST plate.**
     `rampPlates(day) = max(0, round(warlordHull(day) / 25))`, which is 0,0,0,0,1,1,2,2,2,3
     for days 1-10, so the reference hull bonus is 0/0/0/0/25/25/50/50/50/75. The dusk
     stand-in (`src/game/honest.ts`) and the rival captains (`src/sim/rivals.ts`) use the same
     rule, so all three agree. The first cut rounded down (+25 days 6-7, +50 days 8-10).
     `wholePlating` (round down) stays for other uses.
4. **Module swap** (spec line 394): `HERO_RULES.metronome.freeModuleSwap` (§3).
5. **ESCAPEMENT and LONGCASE**: beastfolk-pool turret modules, rare, 5 g (§3). (Since 0.6.1f that mark is the neutral DORMANT_ITEMS flag; there are no faction pools: one shared salvage pool, REQ-BFG-021.)
6. **Speed gates stay inert on Metronome belts**; `shopExclude` hides them (§3).
7. **ASSAY STAMP** waits for 0.10.0 and isn't built.
8. **Turret target weights** stay as they are: OPEN for the balance pass (§5).
9. **SIPHON is the sixth hero**, unlocked by the first completed run. The sim runs it in full.
10. **`fuse` event** `{ side, turret, dmg }`, emitted after `load` when two blanks fuse.
    Furnace and Weaver never emit one (tested).

## 7. Final numbers and reference builds

**Tuning v1 (§8) supersedes the part-2 values below wherever they differ.** The layouts,
rules and reference builds are unchanged.

**METRONOME (shipped).** Hull 200, belt 20. CLOCKWORKS: 1.3 s, 1 output. Pendulum slug:
2 + 8 x max(0, 1 - |ride - 4.2 - shift| / 3.0), then x mult + flat, at least 1. ADAPTABLE gun
[4, 5]: 0.9 s, window 3, flight 0.55 s. Every belt runs at 1x (`speedLock`). ESCAPEMENT shift
-1.2 s (peak 7 tiles), LONGCASE +1.2 s (peak 13 tiles). `freeModuleSwap` true; `shopExclude`
Grease, Brake, Overdrive.

**SIPHON (shipped).** Hull 190, belt 20. SUMP: 0.9 s, 2 outputs, round robin. Leech slug:
base 3, no ride scaling, marked by destination (right gun ECHO, anything else DRAG). 2 LIGHT
guns, [2] and [7]: 0.6 s, window 2, flight 0.34 s. Drag: x0.25 for 3.0 s (`DRAG_MULT`,
`DRAG_TIME`), refreshed, never stacked. Echo caps: flat +6, Burn 4, Shock, Fray 1 (`ECHO_CAP`).

**Reference builds** (`heroRefBuild`, days 1-10). Purchase cost in gold, as validate.ts
`buildCost` counts it (items, modules, belt crates above base, plating):

| hero | d1 | d2 | d3 | d4 | d5 | d6 | d7 | d8 | d9 | d10 |
|---|---|---|---|---|---|---|---|---|---|---|
| budget (maxGoldByDay) | 8 | 17 | 27 | 38 | 50 | 63 | 77 | 91 | 105 | 119 |
| FURNACE | 0 | 3 | 5 | 8 | 18 | 31 | 39 | 42 | 42 | 47 |
| WEAVER | 0 | 3 | 6 | 11 | 19 | 24 | 32 | 40 | 40 | 45 |
| FOUNDRY | 6 | 9 | 12 | 17 | 27 | 32 | 45 | 48 | 51 | 61 |
| BASTION | 6 | 9 | 14 | 19 | 32 | 35 | 43 | 48 | 51 | 61 |
| METRONOME | 6 | 11 | 16 | 21 | 34 | 37 | 45 | 52 | 57 | 65 |
| SIPHON | 6 | 9 | 14 | 19 | 29 | 32 | 42 | 47 | 50 | 58 |
| plates (rampPlates) | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 2 | 2 | 3 |

- FOUNDRY mirrors its processing on both fusing routes; a Stamp Press lights gun 2 on day 7.
- BASTION hardens the bulwark line; a Stamp Press feeds the heavy gun's second connector on day 5.
- METRONOME redraws its route to 10 tiles (the peak) and never buys speed gates; a Stamp Press
  joins on day 5 and a Splitter on day 8.
- SIPHON processes both leech lines and mounts Calibration on both guns.
- Race heroes add a purchase every day. Furnace and Weaver follow ai.ts, which buys nothing on
  day 1 and nothing new on day 9 (§5, reference spend).

## 8. Tuning v1 (balance harness v1, six heroes, days 1/3/5/7/10)

Numbers only, no new mechanics. Furnace and Weaver are untouched: their pairing and mirror
cells in the harness are identical to v1.

| hero | number | part 2 | tuning v1 |
|---|---|---|---|
| FOUNDRY | hull | 190 | 250 |
| FOUNDRY | ALLOY BLANK base | 3 | 3.5 |
| FOUNDRY | FUSE_MULT (alloy = x (dA + dB)) | 1.5 | 1.3 (a synced pour 9 -> 9.1) |
| BASTION | WARDWORKS interval | 1.5 s | 1.1 s |
| BASTION | BULWARK SLUG base | 4 | 5 |
| BASTION | heavy gun fireInterval | 1.2 s | 0.75 s |
| METRONOME | pendulum floor / swing / spread (peak 4.2 s) | 2 / 8 / 3.0 s | 4 / 4 / 4.0 s |
| METRONOME | adaptable gun fireInterval | 0.9 s | 0.7 s |
| METRONOME | hull | 200 | 210 |
| SIPHON | leech base (DRAG and ECHO) | 3 | 5 |
| SIPHON | SUMP interval | 0.9 s | 1.1 s |
| SIPHON | hull | 190 | 220 |
| SIPHON | ECHO_CAP flat / Burn (Shock, Fray 1 unchanged) | +6 / 4 | +3 / 2 |

- The pendulum is 4 + 4 x max(0, 1 - |ride - 4.2 - shift| / 4.0): 8 at 10 tiles, 6.4 at 6
  tiles, 4 at the ends. The beat still pays, but an off-beat deck is no longer dead weight and
  the peak no longer decides fights on its own. ESCAPEMENT and LONGCASE still move the peak by
  1.2 s.
- One-gun heroes were capped by their gun, not their factory, from day 5 on, so BASTION and
  METRONOME got faster guns. SIPHON's slower Sump gives late gates fewer payloads to multiply;
  its higher base carries its early game.
- Plating per slug (2) and its cap (24), SYNC_WINDOW, the Drag numbers and the belt sizes are
  unchanged.
- **OPEN:** on day 10 WEAVER's population still beats every one-gun or fusion hero (FURNACE
  19%, FOUNDRY 16%, BASTION 16%, METRONOME 27%). A race-only number that lifts those cells to
  35% would make the race beat FURNACE by far more than 65%. FOUNDRY's day-1 elites (97% vs
  WEAVER) against its weak day-5 elites need a curve no single number gives. Details:
  output/tune/REPORT-tune.md.
