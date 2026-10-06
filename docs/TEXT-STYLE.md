# BeltBattles text style guide (docs/TEXT-STYLE.md)

**Purpose.** This guide says how every player-facing text on a BeltBattles piece is written and where it shows: the always-on card face, the
ⓘ view, word taps, the shop card and the notices. It starts from T1's guide, folds in the rules U2a-U2d built into the face kit, and states as
rules the decisions U2e took from the operator's words (REQ-BFG-070, sharpening REQ-BFG-046). The same text is committed as `docs/TEXT-STYLE.md`,
the one source for later jobs; where T1's guide differs, this file wins (section 12). Display only: no rule changes (bb-0.8.7). Strings are in
font.ts `icons()` markup: `{NAME}` is an icon alone (`{DMG}4`, `1.4{SEC}`), `{*NAME}` a keyword in panel style, its icon then its word (`{*BURN}`).
U2f (0.8.9) adds three rules: the ⓘ view's size (5.8), the owned marker (9.5) and no copy count on a badge (10.3).

## Sources (W = `/home/cap/.hermit/primes/.workspaces/cap/beltbattles-runes1`; its `ref*` folders are read-only copies)
- **The operator, verbatim (2026-10-04):** "The items don't need to say 1 more to merge." / "Let's follow the batomon pattern by having an info
  button that shows more information about further levels. It'll keep the cards cleaner to not show it all the time. Follow bazaar's card
  complexity syntax. They keep it simple but have engines that build incrementally. Also, we should separate out mechanics versus abilities on
  the card. Like, an item giving burn is an ability but an item with burn is just a stat."
- **T1, the base:** `W/ref-u2e/t1/REPORT.md` section 2 (formats by text type, notices, trigger labels, glossary form, widths) and `SAMPLE.md`.
- **MEMO C1-C8:** `W/ref-sustain/r1/MEMO.md` (C1 keywords, reminders; C2 icons; C4 the face, the shop chip; C7 NEXT★; C8 board cues; A8 rules).
- **Batomon:** `W/ref-sustain/r1/research/batomon-tft.md` (Q2 a two-effect ability cut to one; Q3 the inspect sheet; Q6 the level ladder
  "Shield: 450/900/1350"; Q7 bigger touch targets on mobile).
- **The Bazaar and Backpack Battles:** `W/ref-sustain/r1/research/bazaar-bpb.md` (Q2 one trigger and one effect a line, stats on the card,
  plain weapons as stat blocks; Q3 a second tooltip layer).
- **U2a-U2d:** `W/ref-u2e/u2c/REPORT.md`, `W/ref-u2e/u2d/REPORT.md`, `W/ref-u2e/BRIEF-U2c.md`, `W/ref-u2e/BRIEF-U2d.md` (the formatter
  registry, the glossary, tap to explain, the chip rule, the notices, U2b's F3, F5 and F6, `NEXT_LINE_W = GLOSSARY_WRAP_W = 225`).
- **U2f:** `W/BRIEF-U2f.md` (cap's answers to U2e's questions 2 and 3: the owned marker, the taller ⓘ view; the shortened lines).
- **U2e:** `W/BRIEF-U2e.md` steps 2-6. **Code, for exact names:** `src/ui/faces.ts`, `statFormat.ts`, `icons.ts`, `chips.ts`, `glossary.ts`,
  `richText.ts`; `src/render/font.ts` (`ICON`, `KEYWORDS`, `ICON_COLOUR`); `src/screens/build/keywords.ts`.

## 1. Stats apart from abilities
1. **The test.** When the effect happens, whose shot, payload or effect is it?
2. **The piece's own: a STAT**, an icon and a number in the stat row, never a sentence: its own DMG, its cadence (`n{SEC}`), its loads
   (`{SLUG}`), its gear slots (`{GEAR}`), its belts (`{BELT}`), and the BURN, STUN, HEAT or FRAY its own shots or payloads carry.
3. **Given to something else: an ABILITY line.** Payloads passing a rig, the turret a core or gear is fitted to, neighbours, the belt, your
   hull, the run, the rules.
4. **By kind.** A turret is a stat row only (SCRAP CANNON on U2c's turret panel: `1{SEC} {SLUG}3 {GEAR}1`). A factory shows its output as
   stats, with a line only for a mechanic or for what it gives something else. Rigs, cores, gear, packs and heroes' rules are abilities. A
   hero's signature factory shows its own output as stats and the hero's rule as an ability.
5. **Evidence.** The Bazaar prints a stat as a number on the card (Fang: "cooldown 3.0 sec on the face"); Backpack Battles' plain Wooden Sword
   is a stat block, no rules text (`ref-sustain/r1/research/bazaar-bpb.md` Q2). MEMO A8 rule 6: "Stats are icons on the face, never sentences."

| piece | BEFORE (u2d-gate) | AFTER (U2e) | whose effect |
|---|---|---|---|
| KILN | `ITS SLUGS HAVE {*HEAT} 1.2.` | a second stat row, `{HEAT}1.2` | its slugs': stat |
| LOOM | `ITS SLUGS HAVE {*FRAY} 1.` | `{FRAY}1` in its stat row | its slugs': stat |
| HOT SWAP | `ITS SLUGS ALTERNATE: +2 {*BURN}, THEN {*STUN} 1.6.` | stats `{BURN}2 {STUN}1.6`; one mechanic line, `ALTERNATES {*BURN} AND {*STUN} SLUGS.` | its slugs': stats |
| DOUBLE STAMP | `STAMPS 2 SLUGS AT A TIME.` | `{SLUG}2` in its second stat row | its batch: stat |
| TEMPER (rig) | `HIT: +1 {*BURN}.` | unchanged | it gives BURN: ability |
| ARMOR PRESS | `EVERY 3{SEC}: +3 {*PLATE}.` | unchanged | PLATE lands on your hull: ability |
| WARDWORKS | `ITS SLUGS LOAD: +2 {*PLATE}.` | unchanged (`LOAD:` in brass) | your hull (BASTION's rule): ability |
| SCATTER CHOKE (core) | stat `{DMG}40% EACH`; `SHOT: BURSTS INTO 3 PELLETS.` | `SHOT: BURSTS INTO 3 PELLETS, 40% {DMG} EACH.` | its turret's shot: ability |

## 2. The stat row
1. At most 3 icon + number pairs a row (icons.ts `STAT_ROW_MAX`; `statRow` throws on a 4th; MEMO C2).
2. SEC follows its number (`1.4{SEC}`); every other icon precedes it (`{DMG}4`, `{SLUG}2`). A keyword in a row is its icon alone, unsigned:
   `{HEAT}1.2`, never `{*HEAT}`.
3. Each kind's pairs come from its one data function (`factoryStats`: cadence, DMG, belts; `turretStats`: cadence, loads, gear slots). The
   cadence is `speedPair`'s, the one place the NUMBERS release turned `n{SEC}` into a `{RATE}` pair (NUM-4: `{RATE}19`, the SPEED, shots or slugs in 30 s).
4. A face takes a second row only for its own extra stats: KILN `{RATE}24 {DMG}40 {BELT}2`, then `{HEAT}12` (NUM-4; was `1.25{SEC} {DMG}4 {BELT}2`, `{HEAT}1.2`).
5. Every row fits the op view's band: 225 px of the 5x7 font.
6. `{BELT}` is a factory's belt count only; belt capacity is tiles, in words: `+4 BELT TILES FOR THE RUN.` (U2c fix 2).

## 3. One line per ability (The Bazaar's syntax)
1. An ability is one line: at most one trigger, as a brass label, then one effect, a verb or a signed value first.
2. The labels (MEMO A8 rule 1's five, plus `START:`):

| label | when it fires |
|---|---|
| `HIT:` | each slug on a tile the rig's arrows point at, while it works |
| `SHOT:` | each shot this turret fires |
| `LOAD:` | a slug enters this turret's chamber |
| `START:` | the fight starts (Batomon's "On Battle Start", Backpack Battles' "Start of battle:") |
| `EVERY 3{SEC}:` | a timer, again and again for the whole fight |
| `{*PAIR}:` | a load completes a pair at this turret |

3. A passive ability has no label: `ITS BELT RUNS 60% FASTER.` (GREASE WORKS).
4. An ability that still needs 2 or more clauses (AND, THEN, WHILE, ELSE, or a caveat it can't lose) is a rules-redesign candidate, such as
   OVERCLOCKER's `DOUBLES THE NEXT RIG'S HIT, THEN RESTS 4{SEC}.` or PLATE BREAKER's `ELSE: +1 {DMG}.`: keep the clearest wording that fits and
   list it, with a suggested one-line rule, for the rules job, which also owns "engines that build incrementally". A text job never changes a rule.
5. Interim perk clauses (U2b F6: `★2 SPARK JUMP: {*STUN} HITS 2 PARTS.`) and interim caveats (U2b F5: `INNER COLUMN ONLY.`) keep only what the
   sim does that the face would otherwise hide: a face never says less than the sim. One line each, caveats last; R4 (the STAR batch) and U4
   (the board cues) delete their rows. **Release Y (Y7b2):** R4 is done: every interim perk clause left with its perk rule, and of the caveats
   only `INNER COLUMN ONLY.` is left (section 13).
6. **Evidence.** The Bazaar: "A line is one trigger + one effect; items have 1 line at Bronze and 2-3 short lines at Gold+, never one long
   chained sentence" (`ref-sustain/r1/research/bazaar-bpb.md` Q2). Batomon's developer cut Petrirex's "Shield and Damage" to "Shield only"
   (`ref-sustain/r1/research/batomon-tft.md` Q2).

## 4. What the always-on face shows
1. **Shown**, top to bottom: the title with its star badge; the header (kind, families); the stat row(s); the ability lines; the interim
   caveats; then, where room is left, the hint and the flavour (release Y, R-1: a perk's name is never on the face; section 13.1). With it:
   the shop card's stat chip (section 9), keyword taps and the desk's hover tooltip.
2. **Not shown:** NEXT★ (faceNextBlock and the legacy next block), MERGES INTO (faceMergeBlock), merge progress, the dim keyword REMINDER
   lines, any copy count. The level detail is one tap away, in the ⓘ view (section 5).
3. **The gold-upgrade lines stay**, because they label a purchase: `FACTORY: LEVEL 2/4.`, `UPGRADE: 3 BELTS, WORKS FASTER.`, and the starting
   turret's `SPEED: LEVEL 1/4. UPGRADE: FASTER.` (upgradeText.ts). These levels are gold upgrades, not stars.
4. **An offer that merges when bought** shows it by the card's `MERGE ★2` badge and the panel's `BUY+MERGE` button; no sentence.
5. **Faceless pieces** (the RULES, STUN-fold and crit pieces; faces.ts header) keep today's sentences until a rules job gives them a face;
   4.2 and 4.4 hold for them too, and their legacy `NEXT STAR:` line moves to the ⓘ view.
6. **Evidence.** The operator: "It'll keep the cards cleaner to not show it all the time." MEMO C4: one face format for every piece.

## 5. The ⓘ button and its view (Batomon's info button)
1. **The button.** One ⓘ per panel, in the header's icon box corner where U2c's `?` was: the same place and hit rect (keywords.ts `questionBox`,
   `questionRect`, `tapRect` on touch), so no touch target moves. Its glyph is an "i", a dot over a stem; the desk's mouse works it as it did `?`.
2. **The view** covers the body: LEVELS first, then KEYWORDS, paged as U2c's view was. A tap turns the page (`TAP FOR MORE 1/2`) and closes
   the view after the last; ⓘ again, or any other press, closes it.
3. **LEVELS**, for a piece with stars, in this order:
   - a ladder line for each number that changes with the stars, in the face's own icons: the icon, a space, then each star's value as the
     face prints it, joined by `/`: TEMPER `{BURN} +1/+2/+4`, ARMOR PRESS `{PLATE} +3/+6.6/+10.5`; SEC follows its numbers, as in the stat
     row: HOT SWAP's cadence `1.5/1.3/1.1{SEC}`; a rule's words stay around the numbers (`EVERY 3/2.5/2{SEC}`, `RIPS 1/2/3`); `-` marks a
     star the number isn't there yet (`-/2/2 PARTS`). The separator is `/` because font.ts has no `»` and Batomon writes "Shield:
     450/900/1350"; a `/` joins numbers only (before a letter it is still T2's banned slash rate, `/S`);
   - the current star's value drawn in yellow (in text dumps, `[+2]`);
   - each star's perk name, where the star has one: `★2 SPARK JUMP`, `★3 ...` (release Y: the name alone; the interim clauses are gone, and
     the ⓘ view is the only place a perk's name shows, section 13.1);
   - what merging gives, in the NEXT★ form (faceNext): `NEXT ★2: +2 {BURN}`. Never a copy count; none at the top star.
4. **No LEVELS** for a piece without stars (a hero's signature factory, a pack). A RULES piece that keeps today's sentences shows its legacy
   `NEXT STAR: ...` line there.
5. **KEYWORDS:** each word the panel names, once, in reading order, as a tap shows it (glossary.ts `glossaryText`: a keyword's reminder with
   the piece's own number and its one extra sentence; a label's row; a tap note), then the held runes' keywords.
6. **Width.** A ladder and a face's NEXT★ line are each one line of 5x7 within 225 px on the op view: the NEXT★ fit check moves onto these
   lines and is never weakened (tests/levels.test.ts). A perk's clause, a legacy `NEXT STAR:` sentence and a definition (at most 2 lines)
   wrap. Every line fits the view's width; on the desk's narrow column `wrapRich` wraps them all.
7. **Evidence.** Batomon's inspect sheet shows "full stats, ability and evolution chain" on demand (`ref-sustain/r1/research/batomon-tft.md` Q3);
   its ladders keep the sentence and change one number a level, "Shield: 450/900/1350" (Q6); it made tap targets bigger on mobile (Q7).
   Backpack Battles moves extra detail to a second tooltip layer (`ref-sustain/r1/research/bazaar-bpb.md` Q3).
8. **Size (U2f).** While its entries fit the body on one page, the view covers the body (5.2). When they don't, it grows into the room past
   the panel (keywords.ts `infoFree`, `infoView`):
   - on the phone, upward into the room above the panel, over the shop (from the shop's top, under the top bar and the rune row): that box is
     read first, then the body;
   - on the desk, down the free column below the panel, one box from the body down, over the panel's buttons while it is open.
   - It never covers the panel's title row, its star badge or the ⓘ button (U2e's box, rect, hit rect and region `kw:?`), nor the phone's
     header buttons. Nothing moves or changes size while it is closed. A box outside the panel has its own ink edge; a later page that fits
     the body shows there. A tap on any of its boxes turns the page; any other press closes it.
   - The aim: most panels on 1 page; on the op view none over 2 (3 with a rune held), on the desk none over 3. Measured on the text sheet's
     panels: op 305 on 1 page (U2e's view: 118 / 160 / 27 on 1 / 2 / 3); a rune held, at most 2; the 1920x1080 desk 291 / 14 (U2e's:
     70 / 96 / 88 / 26 / 15 / 10). tests/keywords.tap.test.ts pins them and the geometry on every phone view.

TEMPER ★1's ⓘ view on the op view, its own words only (the `+1` drawn in yellow):
```text
LEVELS
{BURN} +1/+2/+4
NEXT ★2: +2 {BURN}
KEYWORDS
HIT: EACH SLUG ON A TILE ITS ARROWS POINT AT, WHILE IT WORKS.
EACH {*BURN}: 1 HULL DAMAGE A SEC FOR 3{SEC}. THEY ADD UP, AND {*PLATE} SOAKS THEM.
```
At ★2 the `+2` is yellow and the line reads `NEXT ★3: +4 {BURN}`; at ★3 there is no NEXT★ line.

## 6. Numbers
1. Every number goes through one statFormat.ts formatter: `fmtDmg` (damage, HEAT, FRAY's step, plating), `fmtSpeed` (a cadence), `fmtSec` (a
   duration: STUN, a period), `fmtPct` (a share or a bonus), `fmtCount` (loads, belts, gear slots, slugs, BURN and FRAY stacks), `fmtGold` (a price).
2. No digit literal in a face template or a glossary string: faceText and glossary.test scan faces.ts and glossary.ts. Numbers come from the
   sim's data (content.ts, races/*.ts, the star levels, the hero, the class factor k).
3. Tests pin faces through the formatter registry, `captureFormats(fn, site)` (records of unit, value, printed and site), never through
   literal numbers; numcheck traces every number on a face. NUMBERS changes only the formatter bodies and `speedPair`, so these pins rebase.
4. A stat is unsigned (`{HEAT}1.2`, `{BURN}2`). An ability's value is signed when it adds or cuts (`+1 {*BURN}`, `+15% {DMG}`). A ladder
   prints each value as the face does.
5. NUM-4: every formatter prints the sim's whole value as it is (damage x10, SPEED per 30 s, whole seconds, whole %); a fraction is a finding, never rounded (statFormat.ts FRACTIONAL; tests/numbers.faces). Clocks and measured shares are readings: `fmtClock` (floored seconds) and `fmtReadPct`. Upgrade lines name the next SPEED (`UPGRADE: {RATE}36.`).

## 7. Keywords, colours and the glossary
1. Six keywords (font.ts `KEYWORDS`): BURN, STUN, HEAT, FRAY, PLATE, PAIR. One keyword, one colour, everywhere (font.ts `ICON_COLOUR`): BURN
   orange, STUN cyan, HEAT amber, FRAY violet, PLATE steel, PAIR blue. The rune cards use the same (U2d F3); their own texts
   (`src/sim/runes.ts`) are the rune rules job's.
2. In a sentence a keyword is `{*NAME}`, its icon then its word; in a stat row, a chip, a LEVELS ladder or a NEXT★ line it is the icon
   alone (`{BURN}`). It never takes a suffix: `{*STUN}S` is wrong (its S would draw in the base colour).
3. One mechanic, one word: STALL and SHOCK are STUN, PLATING is PLATE, FIRE RATE and WORKS FASTER are RATE, MACHINE is PART (glossary.ts).
4. Name a keyword; never define it inline. Its reminder (faces.ts `REMINDER`, at most 10 words, MEMO C1), with the piece's own number,
   shows on a tap, in the desk's hover tooltip and in the ⓘ KEYWORDS list; never on the face (MEMO C4's dim reminder line is gone).
5. Other colours: numbers white; trigger labels, `★n` and perk names brass (a perk name never splits); the RATE and GOLD icons yellow; the kept
   texts' FASTER yellow, SLOWER blue (richText.ts `KEYWORD_COLOUR`). Each tappable word has a dotted underline in its colour.
   FLIP-X2: FREEZE's ice is gone with the mechanic (NUM-3: frost rounds STUN). FROST names a round, as CHAIN does, so both draw in the
   text's own colour (bone). Release Y (Y7b2): POISON's lime is gone with POISON, and OVERDRIVE ★3's chain-and-frost clause left with its
   guard (section 13).
6. A glossary row (glossary.ts, in T1 2.4's form) is `{ word, aliases, colour, def, kw?, extra?, scope }`. Its definition leads with its word
   (`{*BURN}: ...`, `JAM: ...`) and fits 2 lines of 5x7 at `GLOSSARY_WRAP_W`; a keyword's is its reminder plus at most one sentence the face
   dropped. `TAP_NOTES` hold what only a piece's own panel can say: PRESSURE BREECH's `SHOT: IT COUNTS UP TO 5 WAITING LOADS, AND IT NEVER JAMS.`

## 8. Form
1. No "·" chains: whole sentences, each with its full stop.
2. No hand-wrapping: a text is whole sentences, and the one wrap helper, richText.ts `wrapRich` (`wrapText` for plain text), breaks them at
   draw time. No line break in a string.
3. Notices in T1's form, `LABEL: TEXT.`: `IDLE: NO ARROW REACHES A BELT.`, `STAYS ABOARD: THE SIGNATURE FACTORY CAN'T BE SOLD.`,
   `STARTING TURRET: YOUR HULL'S FREE ONE, SO IT CAN'T BE SOLD AT ★1.`
4. T2's bans stand (tests/textRules.ts `BANNED`); U2d allowed only the icons, SEC after a number and the trigger colon. Also banned: FLAT,
   IDLE as a timer, engine words (COMMISSION, BOOSTABLE, WINDOW, TIER, INTERVAL, FIFO, PRIOR), `NEEDS n MORE`, more than two decimals, and
   damage with two decimals.

| banned | write |
|---|---|
| `+2 DMG` (DMG as a word) | `+2 {DMG}` |
| `EVERY 3S` | `EVERY 3{SEC}:` |
| `X2`, `1.5X` | `2 TIMES`, `TWICE AS FAST` |
| `/S`, `/HIT`, `PER` | `A SEC`, `EACH SHOT`, `FOR EACH` |
| `3RD` | `OF EVERY 3 {SLUG}, ONE BECOMES 2.` (SORTING ARM) |
| `MAX 6.` | a cap names its unit: `MAX 15 {FRAY}.` |

5. Capitals only, in glyphs the face being drawn has: no lower case (a reminder never says "n"), no `»`.
6. Flavour adds something or nothing (T1's T7): it never repeats an ability line. A signature factory's tip is number-free and repeats
   nothing on its face (KILN: `A LONG BELT SPEEDS UP THE GUN IT FEEDS.`). The hint (`DRAG IT ONTO A TURRET TO FIT IT.`) and the flavour are
   optional blocks: they give way first.

## 9. The shop card
1. Each offer shows a one-line effect: its stat chip, one icon alone and one value, read off the face at ★1 (`faceAt(def, 1, o)`; a shop
   offers ★1 only).
2. The chip rule (chips.ts): an icon is the mechanic its number measures. The pick: the rule's keyword with its count (TEMPER `{BURN}+1`, GALVANIC
   COIL `{STUN}1.6`), else the first stat pair (DART GUN `{RATE}55`, unsigned; was `0.55{SEC}`), else the rule's first number with an icon (CALIBRATION `{RATE}+33%`).
3. `{RATE}` only for a gun firing or a factory working (`RATE_KEYS`: CALIBRATION, ESCAPEMENT, GATLING SPOOL, STOKER), never a belt's speed
   (GREASE WORKS: no chip). Never a waiting timer (a rest, a delay, a period): OVERCLOCKER's rest is no chip; only a cadence is a `{SEC}` chip.
4. A faceless piece, a pack, or a face with no number that has an icon keeps today's card and its one line of effect. On the op view's
   narrow card the chip takes the family marks' place; the desk's wide card keeps the marks, the chip left of the price.
5. **The owned marker (U2f).** A shop, warlord-pick or event card for a piece you own that won't merge yet (`drawBadge` "wait") shows a
   wordless marker in the badge's corner: two overlapped squares, the copy behind slate3 and the one in front slate4, on a 5x7 ink square
   (shop.ts `drawOwnedMarker`). No digit, no ★, no word (it was `+1 ★2`, a copy count). `MERGE ★n` (buying merges now), `MAX` and the
   `BUY+MERGE` button stay. Why a marker at all: TFT marks the shop units you already own, and a merge game needs that cue.

## 10. No copy counts
1. No text counts copies: not the face, not the ⓘ view, not a tooltip. `1 MORE COPY TO MERGE.` and `2 MORE COPIES TO MERGE.` are gone, with
   mergeProgressText and copiesToNextStar (the operator: "The items don't need to say 1 more to merge."). T1's and MEMO C7's
   `1 MORE COPY TO ★2.` goes too.
2. A merge says what it gives (`NEXT ★2: +2 {BURN}` in the ⓘ view, the `MERGE ★2` badge), never how many copies it takes. The glossary's
   COPIES (SPLITTER's and SORTING ARM's slugs) is a mechanic, not a copy count.
3. **Not on a badge either (U2f).** No card, badge or button counts copies anywhere, the shop's badges included: not `+1 ★2`, not `n MORE`,
   not `2/3`. A card says only that you own one (the owned marker, 9.5) or what buying gives (`MERGE ★2`, `BUY+MERGE`).
   tests/ownedMarker.test.ts pins the marker's own pixels and that no source line draws a `+1 ★` count.

## 11. Widths and fit (T1 2.6, still valid)
1. The op view is 402x690 CSS px at DPR 3. Its info band is 235 px wide at x5, with 225 px of text: 37 capitals of 5x7 (221 px) or 56 of
   3x5; real text fits about 40 characters, as spaces and punctuation are narrower. A glyph is 5 px + 1 (3 + 1 in 3x5); an icon is one glyph.
2. `NEXT_LINE_W` = `GLOSSARY_WRAP_W` = 225 px holds a stat row, a LEVELS or NEXT★ line (one line each) and a definition (2 lines at most).
3. A panel draws in 5x7 only when its kept blocks fit, after the optional blocks give way; otherwise the whole panel drops to the 3x5 micro
   face. Every faced panel fits in 5x7 on the op view, with a rune held too (a 235x89 band).
4. The desk (640x360 at x3) wraps with `wrapRich` in its narrow column (128 px); its hover tooltip is 3x5, 150 px wide.
5. After a face change, re-measure phoneBand(W), the zoom pins and the fit checks; never guess them, and never weaken a check.

## 12. T1's guide: what stays, what is superseded
| T1 (`ref-u2e/t1/REPORT.md` section 2) | now |
|---|---|
| 2.1's principles; 2.2's notice form; 2.4's glossary rows; 2.6's widths; 2.7's T2 bans, T4's one wrap helper, T7's flavour | kept (3, 6-8, 11); T2 narrowed by U2d (8.4) |
| 2.2 factory `EVERY 1.8 SEC: A PLAIN SLUG, 3 DAMAGE.`; signature factory `CINDER SLUG: 4 DAMAGE.` | superseded: the piece's own numbers are stats (1, 2) |
| 2.2 next star, merge progress (`1 MORE COPY TO ★2.`) and `MERGES INTO ★2: ...` on the panel | superseded: NEXT★ moves to the ⓘ view; the other two are gone (4, 5, 10) |
| 2.2 the shop card's one-liner | superseded by the stat chip where the piece has a face (9) |
| 2.3 eight trigger words | narrowed to six labels (3.2): WHILE is a clause (3.4); LAND(S): and FIRST/AFTER n SEC: are no labels |
| 2.5 SEC, DAMAGE and BURN as words; stat glyphs never in ability lines | superseded: icons everywhere (`{DMG}`, `n{SEC}`, `{*BURN}`; U1, U2a) |
| 2.5 `UP TO n`, never MAX | superseded: a cap names its unit, `MAX 15 {FRAY}.` (U2b F3) |
| 2.5 star scaling: the current star only, no ladder, no slash | split: the face keeps the current star; the ⓘ view shows the ladder with `/` (5.3) |

## 13. Release Y's text rules (REQ-BFG-070, REQ-BFG-046; DESIGN-Y, REVIEW-STARD R-1, rulings Y7A-R1..R6; Y7b2 FLIP-Y, bb-0.9.3)
1. **Perk names live in the ⓘ view only, on every piece (R-1).** A star's perk name (`★2 OVERPRESSURE`) shows in the LEVELS list of the ⓘ
   view and nowhere else: not after a face line, not after a kept sentence, not on a NEXT★ line on the face. A star changes a number; the
   ⓘ ladder carries the number, the name is flavour.
2. **A perk name stays only if it still names what its star does; otherwise it goes, with no rename.** Release Y dropped the names whose
   rule left (Y7b2 3a): TOLLBOOTH's FACTORY GUARD, SCRAPPER's BIG HAUL, SABOT's SHRAPNEL, SPOTTER's FACTORY SPOT and EAGLE EYE, GRAPNEL's
   SALVAGE LINE, BRAKE SHOE's HOT SHOE and RED-HOT SHOE, BARBED SPOOL's RAZOR WIRE, ASSEMBLY LINE's HOT START, HOPPER's BOTTOMLESS, EXT.
   CHAMBER's WIDE BREECH and TRIPLE BREECH, ROTARY BREECH's GREASED RACE and CLEAN FEED, POWDER KEG's WIDE BLAST. Kept, because they still
   name the star's change: SURGE VALVE's OVERPRESSURE (a stronger pulse) and HAMMER VALVE (a faster, harder pulse), OVERDRIVE's REDLINE and
   AFTERBURNER (more speed), MANTLET's FULL GUARD and BULWARK SKIRT (more guarded tiles), LONGCASE's DEEP WIND and FULL WIND.
3. **No text promises what the sim doesn't do.** No face, ⓘ line, perk name or gist may promise fewer jams where the rule has no no-jam
   (Y7A-R6: HOPPER, ROTARY BREECH), a guard that left (OVERDRIVE's chains and frost) or a flat that left (BRAKE SHOE's HOT SHOE).
4. **A number capped by something else says UP TO.** Where a piece's number is capped by another part's size or pace, the face says `UP TO
   n` and the tap note on `UP TO` names the cap: EXT. CHAMBER `EACH SHOT FIRES UP TO 3 {SLUG}.` (a shot never fires more than its gun's
   chamber holds, Y7A-R2), STOKER `ITS FACTORIES WORK UP TO 20% FASTER.` (a stoke never outruns its gun, Y7A-R1). A piece's own cap still
   names its unit (`MAX 15 {FRAY}.`, section 12).
5. **A payoff names its engine as its condition.** A piece that does nothing without an engine names it in its one line, so the face says
   when it acts: QUENCH TANK `HIT: TURNS EACH {*BURN} INTO +30 {DMG}.`, VENOM DRIP `HIT: ITS {*BURN} LASTS +3{SEC}.`, PLATE BREAKER `HIT: SPENDS
   10 {*PLATE} FOR +40 {DMG}.`, TWIN GAUGE `... ON A MATCHED BELT.`
6. **Retired words** (no face, ⓘ, sentence, tap or rune line may use them; the glossary has no row for them): HARASSMENT (every stop is a
   STUN), ONLINE (rigs START), POISON (VENOM DRIP lengthens BURN), LOAD TIME (a gun's wait is said as what it is: SALVO RACK `IT WAITS FOR
   A FULL CHAMBER, OR 3 SECONDS AFTER ITS FIRST LOAD.`; ROTARY BREECH `FIRES PART-FULL CHAMBERS 50% SOONER.`).
7. **The same rule reads the same on every piece.** The locked-belt flats of the speed rigs (OVERDRIVE, BRAKE SHOE, GREASE WORKS) use one
   sentence, `ON METRONOME'S LOCKED BELTS IT ADDS 30 DAMAGE INSTEAD.`; a belt-timeline row is `<NAME> +<amount> <what>` with no colon
   (`VENOM DRIP +3 SEC TO EACH BURN`), a colon only for a notice (`TWIN GAUGE: NO EFFECT ON AN UNMATCHED BELT`).
8. **A rune states its own exception to a keyword.** A keyword's line stays general (`{*SHIELD}: BLOCKS ONE HIT'S DAMAGE.`; no SHIELD line
   says it blocks everything); a rune whose rule breaks it says so in its own reminder (glossary.ts `RUNE_NOTE`: SHATTER SHOT `SHIELD: IT
   BREAKS; THE HIT STILL LANDS.`).
