# BeltBattles races: FOUNDRY, BASTION, METRONOME, SIPHON

Build spec for the four new heroes (spec §6, §7, §11-§15, §25; roadmap §4). Numbers are
first-pass balance values. FOUNDRY and BASTION are implemented in `src/sim/races/`, and these
are their shipped values. METRONOME and SIPHON are specified here for the follow-up job.
**OPEN** marks a decision left to the Prime. The layout contract (factory 2x2, turret kind and
col0, width 2) is fixed by the art brief. Nothing here changes Furnace or Weaver.

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
- **OPEN (not built):** a human-pool gate ASSAY STAMP (rare, 5 g) that turns a passing plain
  slug into an alloy blank. That would let Stamp Press lines become fusion partners.

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
| Hull / belt | 260 (very high) / 14 |
| Factory | WARDWORKS 2x2: one BULWARK SLUG every 1.5 s, 1 output |
| Ammo | BULWARK SLUG: base 5, ride scaling 0. Special: plates Bastion's hull on arrival |
| Turret | 1 HEAVY: col0 4, connectors [4, 5], fireInterval 1.2 s, window 3, flight 0.65 s |
| Start | Wardworks at (4,6), straight 6-tile route up column 4 into connector 4. The gun is live. Connector 5 is free for a Stamp Press |

**Plating rule.**
- Arrival means the chamber. When a bulwark slug loads into Bastion's chamber, the hull gains
  3 x the slug's split multiplier in plating, so a Splitter copy adds 1.8. The slug still fires
  normally.
- It happens at load, not on firing. The spec says "on arrival", so delivery tempo drives
  defence. A full or jammed chamber, or a shocked turret, visibly starves the plating.
- **Cap:** 30 plating. Excess is lost. **No decay**: plating lasts until it is spent or the
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

## 3. METRONOME (Beastfolk, BEASTFOLK PACKS): hit the beat (follow-up job)

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

Implementation note: add an optional `rideCurve(ride)` on AmmoDef, used in place of
`base + rideScale x ride` in `payloadDamage` callers. It needs a races hook in `Battle.fire`
and in `estimateRoute`.

**Module swap between days (rules only).**
1. The adaptable turret has one hardpoint, like every turret.
2. During preparation, Metronome may unmount its module to inventory and mount any owned turret
   module, free and as often as it likes. The mount locks when the battle starts.
3. Other heroes lose that freedom: a mounted module stays until sold.
   **OPEN:** today (0.4.1) every hero can unmount modules (`storeMod`). Making the swap
   Metronome-only changes Furnace and Weaver UX, so the Prime decides.
4. **OPEN:** beastfolk-pool modules ESCAPEMENT (sweet spot -1.2 s, 3 tiles) and LONGCASE
   (+1.2 s). They make the swap a real counter-pick.

**Gates and impacts.**
- Speed gates are inert. **OPEN:** hide them from Metronome's wagons.
- Splitter copies keep the parent's ride time.
- Whetstone, Long Haul, Temper and Coil work as usual.
- The Clockworks is a weight-3 target and the adaptable turret weight 2.

## 4. SIPHON (Unaligned, SUMP DRIFTERS): bleed their line (follow-up job)

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

**Drag.**
- When a DRAG leech strikes a belt tile, the struck segment runs at x0.25 of its speed state
  for 3.0 s. A segment is the belt span between two machinery nodes (spec §5.3).
- A gate hit drags the segment downstream of it. A factory hit drags the first segment of each
  of its routes. A turret hit drags the last segment of each route feeding it. A bare-hull hit
  deals damage only.
- Re-hits refresh the 3.0 s; they don't stack.
- Dragged movement isn't eligible ride time, so Drag never cooks Furnace slugs hotter.
- Metronome belts are immune.

**Echo.** The Prime's proposal, refined:
- Siphon keeps an echo memory: the most recent enemy payload that struck its cruiser.
- When an ECHO leech loads into its chamber, it copies that payload's added effects: flat damage
  (cap +6), Burn stacks (cap 4), Shock, and Fray stacks (cap 1, only thread slugs carry it).
- It doesn't copy base damage, ride scaling or split multipliers. Those are the enemy's ammo
  and factory, not its processing. An empty memory gives a plain leech.
- The memory isn't consumed. Each new enemy impact overwrites it.
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

- Target: each new hero wins 35-65% against Furnace and Weaver at an equal gold budget. That
  means warlord builds of the same round, with the same `warlordHull(round)` offset.
  `output/matchups.md` measures FOUNDRY and BASTION. METRONOME and SIPHON values above are
  first guesses for the follow-up to tune.
- **OPEN (UI pass):**
  - a FUSE event and visual (the sim emits a `load` event today);
  - a plating bar on the hull plate;
  - a SYNC marker in the route inspector;
  - Drag and Echo overlays.
- **OPEN:** turret target weight is 2 per gun, so three-gun Weaver draws more turret hits than
  one-gun Bastion (spec §15 asks for this difference to be accounted for). No change is made.
- **OPEN:** Siphon's place at launch (roadmap default: a sixth hero unlocked by the first
  completed run).
