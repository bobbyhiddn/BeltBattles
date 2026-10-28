# BeltBattles changelog

What each release adds for players. The repo kept no changelog before 0.8.0. 0.7.0's notes are in docs/ASYNC.md
("0.7.0 for players"), and 0.6.x's are in the published release notes.

## Next release (battle rules bb-0.14.0; the release lane writes the label): a part of each kind in every shop, and fresh ghosts

New battle rules: bb-0.14.0. Ghosts and uploads from bb-0.13.0 and older no longer meet this release's players. The
stand-in and seed pools were rebuilt for the new rules and again cover days 1 to 16 (192 ghosts in the seed pool).
- **Every run's shop stock holds at least one SHOCK part and one BURN part**, so the SMUGGLER always has a part of each
  kind to offer and never reads NONE ON OFFER.
- **Two late captains changed.** RATCHET's TEMPER holds BRACED from day 12 (it held FIERY), and GRIMHOLD's second ANVIL
  comes on day 6 (it came on day 4).

## 0.9.14.1: clearer cards, panels and words

Cards, panels and words are easier to read, and the server turns away one more kind of bad upload. The battle rules do not
change (bb-0.13.0).
- **Cards and shapes:** every card of a piece bigger than one cell shows its footprint grid: plain 2x2 factories and size-2
  turrets too, and LAST CHANCE's part card, the victory drop card and a road event's choice. Arrowheads in the grids are bigger
  arrows where the card has room (the cargo slot and the narrow phone card keep the small ones). A road card names every part it
  gives; a name that fits no line gets a row of its own, and a part the card takes may show as an icon alone. A shop card that is
  on sale and can also merge shows the sale mark beside the merge mark, and an offer on sale says ON SALE: WAS 3G. in its tap
  panel (not on the smallest phones' one-line strip) and in the desk's hover tooltip.
- **Carrying a piece:** a tall piece, or a gate, carried by a finger onto the top rows of the deck lands on the deck, where its
  ghost shows, instead of being refused without a word. A spot that is taken or blocked still refuses, and says why.
- **Notes on panels:** on a phone held upright, a definition note (a tap on a keyword, or a first-sight note) no longer covers the
  panel's rules: the panel grows up over the shop rows to hold it, keeps its small type where it already shows all its text in
  small type, and shrinks back when the note closes. A panel already as tall as it can grow (the tall turret panels) hangs the
  note just under its last rule row, and if the note would land on the how-to strip, the strip hides while the note shows. On a
  landscape phone a definition note stays where it is if that covers none of the panel's rules, and otherwise moves under the
  panel or beside the column (a few notes, such as the SWARM FAMILY note on some turret panels before you hold a rune, still
  cover a rule row).
- **Panels:** the family line says what it is, FORGE FAMILY or FAMILIES: FORGE, TEMPO, in the desk's hover tooltip and on the
  panel wherever the words fit (some phone panels still show the short name or the family marks). The tap panel of a part you
  own (on the deck, in cargo or in a turret slot) shows its star at one star too (NAME ★), and the part panel's info button is
  drawn as a ?.
- **The title:** the two carriers start with clear water between them, at least 14% of the width and one CSS inch, and the command
  panel is placed clear of them, on landscape phones and desk screens. On phones the touch targets of HOW TO PLAY, OPTIONS and
  CUSTOMIZE are 44 CSS px tall (the buttons look the same). HOW TO PLAY names POISON and says, in one sentence, what a gate does
  and what the ENCHANTER sells.
- **Words:** hull is said as HULL, never with the heart (LAST CHANCE's hull card and the ARMOR PACK; the desk slot shows 550 HULL
  while the amount has three digits). GRAPNEL GUN's levels and SHOT note say DESTROYS (was RIPS), LIMPET WORKS has a note saying
  what ANYTHING covers, and the desk's hover tooltip for a core or a piece of gear names its kind in plain words (CHANGES HOW A
  GUN SHOOTS; FITS A GUN'S GEAR SLOT). RISING's text says its climb starts over each fight, and the ENCHANTER's card says ALL
  THREE RESET EACH FIGHT. A fight's result card (dusk, road and replay) and its FIRST SHOT row show the time as 24 SEC instead of
  24S. A turret that carries a MANTLET says which belts' last tiles it guards: GUARDED: THE LAST TILE OF EACH BELT INTO IT (the
  last 2 tiles at two stars, the last 3 at three). Event hull chips say MAX HULL. The small writing's W is redrawn so that it
  differs from an H by two dots instead of one (WINS in the build bar, WARLORD in the road result line), and a star in small
  text is drawn as a real star on LAST CHANCE's part card and the victory card's drop line.
- **Enchantments on screen:** selecting a rig that holds GROWING no longer cuts its counter, and on LAST CHANCE's PART card the
  word's spark sits whole inside the card, in the top-right corner of the part's picture.
- **Battles and runes:** a belt's timeline now says what a scaling rig reads. At one star on day 1 IRON WALL's row reads IRON WALL
  +3 DAMAGE FOR EACH 10 SHIELD YOU HAVE, where it said only IRON WALL (the numbers follow the star and the day), and the other nine
  scaling rigs say what they read the same way. On a small screen a reader's badge (POWDER KEG's, SPALL CATCHER's) steps to a free
  place beside its piece instead of covering a belt's slug count. YOUR RUNES' list turns into pages (with <, > and the page
  number) whenever it does not fit the screen, and on a phone each rune's first sentence shows whole (FORGE WARD's row no longer
  stops after EACH SLUG FROM YOUR FACTORY:).
- **The server:** it now refuses an endless upload past day 25 at once, before it checks the deck (the game never sends one:
  past day 25 the foe is THE GOD), so a hand-made one can no longer tie the server up for many seconds.

The battle rules stay bb-0.13.0, so 0.9.14.1 meets the same ghosts as 0.9.14, and a run saved on 0.9.14 goes on.

## 0.9.14: gates and enchantments

New battle rules: bb-0.13.0. Ghosts and uploads from bb-0.12.0 and older no longer meet this release's players. The
stand-in and seed pools were rebuilt for the new rules and again cover days 1 to 16 (192 ghosts in the seed pool), and the
AI decks now buy gates and enchantments.
- **Three gates stand on a belt:** FUSER (rare, 6 gold), SCATTER MILL (common, 4 gold) and SMELTER (rare, 5 gold). A gate
  spends 1 second on each conversion. The FUSER takes two slugs and puts out one that deals both plus 50% (75% at two
  stars, 150% at three), so rigs before a FUSER count twice and rigs after it once. The SCATTER MILL turns one slug into
  three at half damage each (60% at two stars; four at half at three stars). The SMELTER adds BURN to a slug: +2, +5 or +8
  at one, two and three stars.
- **Placing a gate:** drop it on a belt tile and the belt splits around it. The label over the carried gate reads like
  SPLITS IT: 2 TILES IN, 3 TILES OUT, or says why the tile is refused (DROP IT ON A BELT, NEEDS BELT ON BOTH SIDES), and
  the gate's notes say the outlined tiles are the belt after it. A rig's arrow aimed at a gate's tile idles. Where two belts
  meet at a gate, it takes slugs from both in turn, and a belt can be drawn into a gate on another belt to join it there.
  The belt panel's numbers count the gates. If the belt under a gate goes, the gate goes back to cargo.
- **Gates in the shop and in battle:** from day 2 on (never day 1) all three can be on sale: the FUSER and SCATTER MILL at
  the tinker, the SMELTER at the alchemist. An enemy STUN can stall a gate like a factory, and LODESTONE counts a stalled
  gate like a stalled factory.
- **Gates on a small screen:** a gate's tap panel now shows its own numbers in the one-line effect at the top (the FUSER's
  2 slugs in and 1 out with its 50%, the SCATTER MILL's 1 in and 3 out, the SMELTER's +2 BURN), as a plain rig's does; the
  three showed no effect line there before.
- **Eight enchantments:** FIERY, RISING, GROWING, ECHOING, MASSIVE, SWIFT, WIDE and BRACED. Each adds one effect to a rig,
  a factory or a turret and prints its word before the part's name, in its colour. MASSIVE goes on turrets only and SWIFT
  on factories only. A part holds one: a new one replaces it (the game asks first: REPLACES FIERY), selling the part loses
  it (SELL? FIERY IS LOST), and it stays when you move the part.
- **The ENCHANTER:** a new merchant rides the caravan on days 3, 5, 7, 9 and every odd day after, with two different
  enchantments for 4 gold each. Buying one means putting it on a part.
- **Free picks:** your first win over a Hard warlord from day 5 on, and the win over the Iron Matriarch, each let you pick
  one of two enchantments (NO THANKS skips it). LAST CHANCE's part card can come enchanted.
- **Merging:** when two parts with different enchantments merge, you choose which one the merged part keeps; when only one
  has an enchantment, the merge keeps it. A factory whose extra belt from WIDE is in use keeps WIDE: another enchantment
  is refused on it (TAKE ITS EXTRA BELT OFF FIRST) and a merge keeps WIDE.
- **What a word cannot go on:** FIERY, RISING, GROWING and ECHOING are refused on a rig whose arrows hit no slug (IT HITS
  NO SLUGS), and ECHOING on a rig with nothing in its hit to double, such as TOLLBOOTH, BRACE FRAME or BALLAST (NOTHING TO
  DOUBLE).
- **GROWING** adds damage after each dusk fight (a win, a loss or a draw) and shows its count: a white number in a green
  frame. **FIERY** reads ADDS +1 BURN TO EACH HIT (TO ITS SLUGS on a factory, TO EACH SHOT on a turret), and a part's notes
  say which numbers are the part's own and which the enchantment changed.
- **Rival captains carry enchantments of their own:** one from day 5, a second from day 8, a third from day 12. A part a
  captain drops keeps its enchantment; the drop list and the victory card show it in colour before the part's name, and
  the victory card spells the star (STAR 2).
- **The ASH SHRINE** is a new road event. It offers an enchantment for some of your max hull or for one part from your
  cargo, and you choose which part gets it. Its second card says how many parts it takes (1x TEMPER); with nothing in
  cargo, that card is greyed and shows what it would cost and give (1x CARGO PART) instead of FREE and NOTHING, and the
  red reason stays.
- **Clearer cards:** RISING's and GROWING's lines give the damage for the day you are on, the same numbers as the stat
  row, on a part's panel and on every enchantment card in a run (on day 6 a one-star growing part adds 10 after each dusk
  fight, not 5). A warlord victory with a bounty reads like +13 GOLD: 3 WIN, 10 BOUNTY. An enemy part's panel says whose
  part it is (SPARKFANG'S HEAVY TURRET IN SLOT 1).
- **POISON is weaker:** each POISON now takes 2 hull damage every second (was 3).
- **CINDER MAIL's SHIELD counts:** a hull whose only SHIELD comes from CINDER MAIL now counts as shielded in the belt
  panel's damage estimate for rigs that spend your SHIELD, and the battle screen shows your SHIELD strip.
- **Captain decks:** BRASSWICK (Easy) builds his second factory on day 7 (was day 5), OLD BULWARK (Hard) brings GREASE
  WORKS to his warlord fights from day 3 (was day 6), and RATCHET (Easy) carries BRACED on his kiln from day 8.
- **Softer field:** two of the three seed ghosts each hero has on a day are picked to beat the AI's decks of the day 15% of
  the time (was 25%).
- **ENDLESS:** THE GOD gains 1500 hull per endless win (was 250).

The battle rules are now bb-0.13.0, so players of 0.9.14 meet only 0.9.14's ghosts; a run saved on 0.9.13 carries on under
the new rules, keeps the one foe it had already drawn for its day, and can find the gates and the ENCHANTER in its later
shops.

## 0.9.13: rigs that count, POISON and ENDLESS

New battle rules: bb-0.12.0. Ghosts and uploads from bb-0.11.0 and older no longer meet this release's players (a run
saved on 0.9.12 keeps the one foe it had already drawn for its day). The
stand-in and seed pools were rebuilt for the new rules and again cover days 1 to 16 (192 ghosts in the seed pool), and the
AI decks now buy the new rigs.
- **POISON is back as its own status:** VENOM DRIP now puts POISON on the foe's hull instead of making BURN last longer:
  1, 2 or 3 POISON at one, two and three stars. Each POISON takes 3 hull damage every second until the fight ends, more on
  later days, as BURN does. POISON adds up and never fades, goes straight to the hull past SHIELD, and a WARD never blocks
  it. It has its own icon, colour, glossary note and chip on the status row, and a first-sight note.
- **Seven new rigs that count what is on the board.** Each acts when it hits a slug, once for each thing it counts. The
  numbers are for one, two and three stars on day 1, and grow with the day. CINDER MAIL gives +2, +3 or +5 SHIELD
  for each BURN on the foe. ROT GAUGE gives +3, +5 or +8 damage for each POISON on the foe. LEECH COIL heals your hull 3, 4
  or 6 times the foe's POISON. CROWD PRESS gives +3, +7 or +11 damage for each slug on the belt it hits. AEGIS SPIKE gives
  +40, +88 or +140 damage for each WARD you have. GRUDGE ROD gives +6, +13 or +21 damage for each heart you have lost this
  run. TROPHY CHAIN gives +8, +12 or +28 damage for each win this run. Each has its own icon.
- **Five pieces that now count too** (the same kind of numbers): KINDLING (the new name of QUENCH TANK: the same piece)
  gives +3, +5 or +8 damage for each BURN on the foe and no longer uses the BURN up. PRESSURE BREECH has no cap of 5 loads any more: +5, +13 or +42
  damage for each load queued at it. IRON WALL gives +3, +6 or +17 damage for each whole 10 SHIELD you have, and no longer
  gives your hull SHIELD itself. SPALL CATCHER gives +1, +2 or +7 damage for each hit your ship has taken this fight, instead of
  a charge every 40 damage taken. POWDER KEG gives +2, +5 or +11 damage for each of its own hits this fight, instead of a
  fuse of 12, 10 or 8 seconds.
- **One order for every bonus:** damage that counts something (FOR EACH ...) is kept apart from a rig's own fixed damage,
  so DRAKE NOZZLE turns only the fixed damage into BURN, never the counted kind.
- **You can see the counts work:** a small +n floats up from the rig (or the gun) when a count adds 10 or more (larger from
  140), in the colour of what it added. While you hold a SPALL CATCHER your status row shows a hits chip, POWDER KEG shows its
  running bonus on its tile and SPALL CATCHER on its gun, and with a GRUDGE ROD or TROPHY CHAIN aboard your name on the
  battle screen reads your record, like 4W 6 hearts, and a tap on your plate says it in words.
- **SOOTJAW** (a Medium captain) now brings his scatter choke on day 5, not day 3.
- **ENDLESS:** after you win a run you can CONTINUE ENDLESS or END RUN. Your build, gold, runes and upgrades carry on with 3
  fresh hearts, and your score is your endless wins; close the game on that screen and it is still waiting. In endless a
  loss costs 1 heart on every day, a draw costs none, PATCH UP still gives back 1 heart (never above 3) and LAST CHANCE does
  not fire; endless ends when you have no heart left, at 30 endless wins or after day 64. Your endless foes are other players' endless builds, and THE
  GOD, the strongest stand-in deck of the day, when none is near and always past day 25. ENDLESS OVER shows your endless
  wins, the day you won the run on and your best (BEST n, kept on your device, never lowered), and YOUR RUNES pages when
  you hold many runes. HOW TO PLAY says it in one sentence.
- **Smaller words:** a tap on SHIELD in a rig's notes shows SHIELD's own words and no longer POISON's, and VENOM DRIP's
  belt row says its POISON. A saved run that names a piece, rune or hero this build does not know now gets one plain line
  above the title's buttons and a NEW RUN, instead of a CONTINUE that cannot open.

A run saved on 0.9.12 carries on under the new rules and ends at its win: ENDLESS is offered only on runs started in this
release.

## 0.9.12: shop cards show a piece's icon and price

- Shop cards now show only a piece's icon and price, with small marks: rarity, an owned marker, a merge mark (an up
  triangle over a star and the level you'd reach) and a sale mark (a down triangle by the price). A shaped piece shows
  its shape, with a rig's green arrows, on its shop card and in its cargo slot. Tap a card (on a desk, point at it) to
  read it; the desk tooltip shows the whole face. The buy button says SALE on a sale; on a merge it names the star the
  merge makes instead, drawn as a real star. HOW TO PLAY now says how merging works and what a card's shape shows. The
  tap panel's words are plainer too: what a rig's HIT is, that a shield or a heal goes to the hull, what a factory's
  belt number counts, and what MIMIC FORGE, LIMPET WORKS, STOKER, ASSEMBLY LINE, BRACE FRAME, MANTLET, GRAPNEL GUN,
  QUENCH TANK and TWIN LATCH do. ASSEMBLY LINE says it only works while it feeds a gun, LIMPET WORKS says its blast
  comes after its own slug hits anything, GRAPNEL GUN says its hit destroys a slug near it, and QUENCH TANK says it
  uses up the burn. A factory's size note shows only on a factory big enough to get an extra belt, and says so with
  the belt icon. LOOSE THREAD's open FRAY note no longer covers its own line, on the dawn pick, the rune bar and LAST
  CHANCE. BALLAST and the SHIELD family's tap text say MAX HULL in words instead of a heart. On a desk, the hover box
  no longer shows the details panel's text around it.

The battle rules stay bb-0.11.0, so 0.9.11 and 0.9.12 players still meet each other's ghosts, and runs saved in 0.9.11
carry on.

## 0.9.11: a run is won at 10 wins

New battle rules: bb-0.11.0. Ghosts and uploads from 0.9.10 and older no longer meet this release's players. The stand-in
and seed pools were rebuilt for the new rules and now cover days 1 to 16. Your first three finished runs meet only that
fresh pool of 192 ghosts; after that, other players' runs join it as they come in.
- **A run is won at 10 wins:** a run no longer stops at day 10. It ends when you win your 10th dusk fight (RUN WON, and
  10-0 is FLAWLESS) or when your hearts run out, and there is no day limit: day 11, 12 and on come as long as you have
  hearts. The top bar reads WINS n/10 beside the day, and HOW TO PLAY says a run is won at 10 wins with no day limit.
- **A lost dusk costs less:** 1 heart on days 1 to 3 and 2 hearts from day 4 on (it was 3 from day 7). A draw costs none.
- **Softer ghosts, and a gentler floor:** the ghosts you meet at first are a little weaker than before, and a run with no
  wins yet meets decks built the way a casual player builds them.
- **Twelve new rigs:** six plain rigs, RASP, SPARK GAP, SCALE GUARD and BALLAST (common), GRINDSTONE and BRANDING IRON
  (rare), and six shaped rigs, ELBOW GUARD, SAW BAR and SPARK COMB (common), CINDER HOOK and JAW CRUSHER (rare) and PICKAXE
  (epic). The shaped ones cover more than one square, bent, straight, T-shaped or square, and each arrow shines from every
  outside edge of the rig that faces its way, so where you place them and which way you turn them matters. Each run's
  stock holds at least seven of the nine shaped rigs. CINDER HOOK starts as a plain damage rig and burns from its first
  merge. LAST CHANCE can now offer PICKAXE among its epic parts.
- **Numbers that moved:** NAIL STRIP hits harder (16, 33 and 53 at one, two and three stars, was 12, 25 and 40) and SPIKE
  RAIL a little softer (8, 16 and 28, was 10, 20 and 35). PLATE BREAKER is now called SHIELD FUEL (the same piece).
- **The foe's record is exact:** on the dusk intro a ghost's record shows the wins and losses it really had, and a draw
  is not counted as a loss.
- **Your profile follows you:** your run counts, best day, the heroes you finished and won with, your unlocks and your
  chosen looks are now saved to the ghost server when you finish a run or pick a look (only while you play online), signed
  with your ghost key. Nothing changes on screen.

The battle rules are now bb-0.11.0, so 0.9.11 players meet only ghosts made under the new rules; a run you started in 0.9.10
keeps its old ending (it stops after day 10's dusk), plays on the new heart costs, and its decks stay off the server.

## 0.9.10: REPLAY after every fight

- **REPLAY after every fight:** the result card that follows a fight, the dusk and the warlord on the road, now has REPLAY
  beside VIEW BATTLEFIELD. It plays the fight you just watched again, exactly as it went, at your battle speed. A speed you
  pick in it holds for that replay only, and pause and SKIP work as in any replay. BACK returns to the same card, and you
  can watch it as often as you like. Nothing in your run changes. A warlord's card reopened with CONTINUE has no REPLAY. On
  phones, ON TO DAWN, SEE THE RUN and ON TO THE ROAD are easier to tap.

The battle rules stay bb-0.10.0, so 0.9.9 and 0.9.10 players still meet each other's ghosts, and your runs and saved
games carry on as they are.

## 0.9.9.1: easier first opponents

The starting opponents are easier again: a typical run now ends around 6 to 7 wins (0.9.9: about 5; 0.9.8: about 7).
Nothing else changes: the game still reads V0.9.9, the battle rules stay bb-0.10.0, and your runs, saved games and
uploaded ghosts carry on as they are.

## 0.9.9: 10 hearts, hulls that grow and the battle view

New battle rules: bb-0.10.0 (hulls that grow with the day, a warlord every day, 10 hearts, open rune offers, free joins,
more SHIELD and WARD, WEAVER's hull 1500). Ghosts and uploads from 0.9.8 no longer meet 0.9.9 players, and the stand-in
and seed pools were rebuilt for the new rules, with the new long rigs and bigger factories: 78 of the 120 stand-ins hold
one (FURNACE 36 of 60, WEAVER 42 of 60), and so do 68 of the 120 seed ghosts. You'll fight that fresh pool of 120 ghosts
at first, then other players' 0.9.9 runs as they come in. The captains' runes were rebuilt with them: SOOTJAW carries
SCRAP SAINT in place of LAST STAND on day 10, and RATCHET IRON SKIN in place of SCRAP BITER from day 7. A browser still
on the 0.9.8 page keeps meeting 0.9.8's ghosts, but its runs no longer go online until it reloads. A run you started in
0.9.8 finishes on its 5 lives, and its decks stay off the server.
- **Battle settings:** every battle now has its own setting, picked at random: on water (OPEN SEA, STORM SEA or EMBER
  SEA), on the ground (FOREST, DESERT or BADLANDS) or in the air (SKY or STORM CLOUDS). Your carrier rolls on tracks over
  the ground and flies on engine pods through the air. A replay shows its battle's setting, and the title's demo fight
  tours them all.
- **A wider view of the fight:** the camera pulls back while the carriers fight, so both ships and the setting around
  them show with room to spare. The hull panels, the clock and the speed controls keep their size.
- **VIEW BATTLEFIELD after every fight:** a new button on the result card shows both carriers as the fight left them,
  with each side's damage dealt, shots, hull lost, SHIELD soaked and WARD stops. Tap a part to read it; a turret also
  says how much damage it dealt in how many shots. BACK returns to the card, or go on from the view.
- **Your battle speed holds:** the speed you pick in a battle (0.5X, 1X, 2X or 4X) stays for the rest of the run, warlord
  fights too, and after a reload or CONTINUE. A new run starts at 1X; a replay keeps its own speed.
- **A scouted foe up close:** once a SCOUT stop's SPY has shown tonight's dusk deck, tap the NEXT BATTLE card to see that
  foe's carrier. Tap a part to read it, and BACK returns to yours. Without SPY the card is as before.
- The dark wind's hits now show on both carriers: each tick a bright violet number lands on your hull and on the foe's,
  drawn over the storm, and both hull bars flash.
- DARK WIND · HITS BOTH HULLS shows between the carriers when the wind rises, in replays too (it was a blinking banner over
  the boards).
- Each hull panel shows its hull as a number, with its max where there is room ("805/2100").
- WARD shows its count beside its pips, and SHIELD shows its amount beside the bar. A hit SHIELD soaks pops BLOCKED and
  the amount; a hit a WARD stops pops BLOCKED.
- VIEW BATTLEFIELD adds WIND TAKEN. Its SHIELD and WARD rows read SHIELD BLOCKED and WARD BLOCKED.
- **The dark wind looks fair on every screen:** when the carriers sit side by side (a desktop, a laptop, a phone held
  sideways), the storm rolls in from both sides of the screen, so it covers both boards alike. It used to cover only
  your board there. A phone held upright looks as before.
- **Every number shows over the dark wind:** hits, BURN, heals and BLOCKED are never dimmed by the storm.
- **In a replay, BACK keeps off the foe's panel:** on a desktop or laptop it sits in the bottom right corner, so the
  foe's hull number shows in full.
- **One fight clock:** the playback bar and the result card read the same second at the end of a fight (a 69-second
  fight read 1:08 on the bar and 69S on the card).
- The battle shows each fight's counts as numbers: a status row on each hull panel (BURN stacks, FRAY out of 15, parts
  stunned); the foe's statuses were drawn off the screen before.
- Each gun shows the slugs waiting at it; it turns amber when 4 are backed up and red with JAM until it fires again.
- Each belt shows the slugs on it while the fight runs. A one-tile belt that joins another shows none: its slugs are
  counted on the belt they join.
- Tap or hover a panel's counts, a gun or a belt to read each count's rule.
- A counter's panel and a part's face in battle show that day's numbers, as the build screen does.
- Word notes on a belt's panel, the ⓘ view's rune words and a fitted part's panel now show that day's numbers too.
- Rune cards: tapping FRAY or BURN shows that day's damage, the same number the pieces' panels show.
- The hull panel's REGEN badge now shows the heal that lands each second on that day's hull.
- A long foe name on the battle panel now makes room instead of being drawn over by the numbers: its ONLINE or OFFLINE
  tag goes first, then the end of the name, marked with a dot.
- A PAIR shows on the board: both belts' last tiles flash blue, a bracket joins them at the gun, PAIR's mark pops over
  it, and each hit of the paired shot carries the mark.
- A load waiting for its partner makes its belt's last tile glow until its window closes.
- A gun with a PAIR reader shows PAIR's rule under its count when you tap or hover it.
- Hit numbers always draw over the gun and belt counts.
- The foe's gun counts sit off its board on the desk and on a phone held sideways.
- A tap or a hover on the paused chip no longer reaches a count under it.
- **Your carrier up close:** the build screen shows your carrier as big as the screen has room for. On a desktop the
  board is two thirds bigger, and on most phones a fifth bigger. The shop, your hero card, NEXT BATTLE and FIGHT keep
  their size.
- **Cargo beside your ship:** on a desktop or laptop your cargo sits under FIGHT, two rows of slots, so nothing covers
  your carrier.
- **Details on a phone:** a part's details sit between the shop and your carrier in a shorter strip that fits most
  parts. A part with more to say grows up over the shop, never over your carrier, and a tap on a shop card it covers
  still reads that card.
- **Clear space between descriptions:** cards and panels leave about half a line of space between their separate
  items: the stat row, each description, each level line and the note under the rule (DART GUN's panel, for one). On a
  phone a panel that needs the room grows up over the shop, never over your carrier.
- **Plainer card words:**
  - Turret cards now say what their numbers mean: how many loads the gun holds (it fires them one a shot, then reloads)
    and how many gear slots it has.
  - Tap a stat icon on any card to read it. That works for the speed `»`, the load `●` and the gear `⚙`.
  - Speed rigs now say where they act: from their own tile on, toward the gun.
  - Cards and runes use plain words where they used VOLLEY, MERGED, STAMP, MACHINES, NEXT RIG'S, BONUS DAMAGE, BLOCKS
    and WRECK.
  - FINAL NAIL's card now says it never works on a GATLING SPOOL, and FORGE WARD's that cast or poured slugs give
    nothing.
  - Every shop card on a phone now hints at what it does, speed rigs included (FAST, SLOW, TWICE, ...).
  - Tap a family tag (FORGE, SWARM, BURST, ...) on a panel to read what that family does.
  - Cores and gear now say what they do in the panel header. Merchant names stay on the desk's wagons.
  - MENDING LOOM and GREEN THREAD now say HEAL each second. They always healed by HEAL's rules.
- **Cleaner cards:** a card shows its stats and its own rules. Flavour, a turret's ammo and gear lines and how-to tips
  move to NOTES in the ⓘ view (on a desktop, rest the mouse on the card's icon). A tip shows until you've done it once.
- **WHETSTONE, TEMPER and BARBED SPOOL** show their bonus as a stat.
- **SHIELD and WARD:** plating, the layer that soaks damage point for point before your hull, is now called SHIELD (it
  was PLATE). The old SHIELD, the block that stops all of one hit's damage and then breaks, is now called WARD. Both
  words have new definitions, and if you played 0.9.8 or earlier on this device, a one-time notice tells you the new
  names.
- **Phone shop cards say what they do:** every core, every piece of gear and four rigs (TOLLBOOTH, SORTING ARM, BRACE
  FRAME and OVERDRIVE) now name what they do on their shop card, in words where the picture was (SPLASHES, HULL ONLY,
  ALL LOADS, ...).
- Every factory's phone shop card now says what it makes, and 19 more rigs, the inner-column guns and most cores and
  gear say what they do in two short rows. HOW TO PLAY names the kinds of pieces and the six keywords, a fitted piece's
  keyword notes now open one after another, and LIMPET WORKS' and SCRAPPER's numbers follow the day.
- **More details fit on a small phone:** more parts' details now fit the strip between the shop and your carrier, so
  fewer grow up over the shop. Some use the small letters to fit, and a how-to tip shows just under the details, on your
  carrier's side (just above them where the screen has no room there), instead of making them taller. An idle rig's fix
  (TURN IT OR MOVE IT BESIDE A BELT.) moves to NOTES.
- A word's definition now opens just above its line when it would cover that word, and on a rune card it keeps clear
  of TAP AGAIN TO TAKE IT.
- LAST CHANCE's part and hull cards leave clear space between their items, the box under a hovered shop card on a
  desktop leaves space under its family line, and a rune's read-out from the rune bar ends after its last line unless a
  note shows.
- The first time you meet a keyword on a rune card or a piece's panel, its meaning opens by itself, and the first rig you
  look at explains what rigs do. Every keyword on a rune card can be tapped for its meaning, and turrets show RATE, HOLDS
  and GEAR SLOTS in words.
- Rune cards: only the TAP AGAIN TO TAKE IT bar takes a rune now, so a tap on the card or on one of its words no longer
  takes it by mistake, and on phones a card's words are easier to tap. A rune that needs a part now says which in its
  note (COAL CHUTE: WORKS WITH A HEAT JACKET OR FURNACE'S KILN). Notes and the how-to strip no longer cover a panel's
  title, BUY, prices or REROLL. Card words that playtesters misread are clearer.
- Three new rigs take more than one deck cell: NAIL STRIP and EMBER TROUGH (2 cells, common) and SPIKE RAIL (3 cells,
  rare). Each arrow shines from every cell, so a long rig laid along a belt hits more of it.
- GANTRY PRESS is now 2 by 3 cells and feeds one more belt at every star.
- ASSEMBLY LINE is now 3 cells in a line and costs 1 gold less.
- Long rigs and the bigger factories turn: tap the piece, press R or turn the mouse wheel. If a turn doesn't fit there,
  the next one is tried.
- On a phone, a long piece you drag shows above your finger and snaps to the nearest spot where it fits. A ROTATE button
  floats beside it: tap it with a second finger.
- Cards show each piece's shape and how many hits it can make.
- No rig or factory can be dropped on a turret's intake any more (a rig already there may stay). A turret put in over a
  long rig or a big factory sends that piece to your cargo.
- In a saved run, GANTRY PRESS and ASSEMBLY LINE move to a spot where their new shape fits, and the build screen says
  so. A belt that can't stay is removed, and a factory with no room goes to your cargo.
- When a run has no part of a kind for the SMUGGLER to sell, its card says NONE ON OFFER again.
- The build screen runs smoothly again on slower phones: it now redraws only the parts of the picture that move, so it
  looks exactly the same.
- **Hull grows with the day:** every carrier's max hull grows with the day: on day 2 it is 140% of day 1's, then 180%,
  220%, 280%, 340%, 400%, 460% and 520% on days 3 to 9, and 600% on day 10. Damage grows too, more slowly: 130% on day
  2, 160% on day 3, 170% on day 4, 180% on day 5, 200% on day 6, then 210%, 230%, 240% and 260% on days 7 to 10. Heals
  and SHIELD grow with the day just as max hull does: every heal, from RIVETER, MEND PRESS, MENDING LOOM, GREEN THREAD,
  TWIN SALVE, SCRAP MEDIC and LEECH VOW (SCRAP MEDIC's 300 HEAL is 1,800 on day 10), and every SHIELD you gain (PLATE
  ROLLER's 15 a payload is 90 on day 10). WARD doesn't grow: it blocks a whole hit, however hard. The numbers in these
  notes are day 1's; cards show each day's. In 0.9.8 none of these grew.
- With shapes on, days 3-5 hit a little softer, so those fights keep their pace.
- The dark wind now takes the same share of every hull's maximum, so a bigger hull no longer outlasts a smaller one when
  the wind rises.
- Each day's gold keeps growing to day 10: 6 gold plus the day's number, up to 10, and 2 more after a win. In 0.9.8 it
  stopped growing after day 6.
- **A warlord every day:** after the caravan, the road always has a warlord fight: pick Easy, Medium or Hard (the stop
  with only a road event is gone). The day's road event follows, then REFIT, where you can rearrange your carrier but
  can't buy, sell or reroll, and then dusk.
- The fork names the day's event under the warlords (AFTER THE FIGHT: and the event's name), and REFIT's bar reads
  REFIT · DAY n/10.
- A warlord you beat drops one part of the deck it fought with, 60%, 75% or 90% of the time (Easy, Medium, Hard), into
  your cargo: at ★1, or at ★2 from Hard. It replaces Hard's pick of 2 parts.
- What a warlord drops: common rigs most often, then rare rigs and gear, and least often epic parts, turrets and
  factories (from Easy and Medium they weigh 6, 3, 1 and 1; from Hard 5, 3, 2 and 2), each part in a group as likely as
  the next. Signature factories, supplies and legendary parts never drop, and the IRON MATRIARCH still pays her
  legendary part. The fork shows each warlord's drop chance (DROP 75%), its ⓘ the odds of each part, and the victory
  card the drop (DROP · TO CARGO · ★2 from Hard).
- Star steps that didn't pay now do: QUENCH TANK ★1 turns each BURN on the payloads it hits into 40 damage (30 in 0.9.8,
  no more than the BURN itself), STOKER ★3 makes the factories its arrows point at up to 85% faster (70%), and at ★2 and
  ★3 a payload OVERDRIVE speeds up keeps 50% and 100% of the ride the speed cuts, for its ride bonuses.
- **10 hearts:** runs now start with 10 hearts. Early losses cost 1 heart, later ones 2 or 3 (days 1-3, 4-6, and from
  day 7); draws and road fights cost none. LAST CHANCE comes once, at the first loss before the last day that would leave
  you 1 heart or fewer, and keeps you on 1 heart. In 0.9.8 a run had 5 lives and every loss cost 1.
- Hearts on screen: your hero card counts them (7/10 HEARTS), and NEXT BATTLE and the dusk fight's intro show what
  tonight's loss costs (-1, -2 or -3 and a heart) and say LAST CHANCE SAVES YOU when it would. PATCH UP at the FIELD
  DOCK gives 1 heart, up to 10 (1 life, up to 5, in 0.9.8).
- The early-loss refund is gone: in 0.9.8 a life lost on day 1 or 2 came back at the dawn of day 3, once a run.
- **LAST CHANCE:** once a run, the first dusk loss before day 10 that would leave you 1 heart or fewer leaves you on 1
  heart instead (day 6 at the earliest: six losses in a row cost 9 of your 10 hearts). The dusk card says LAST CHANCE:
  1 HEART, and at the next dawn, before your rune, you take one of three free cards: an epic RUNE, which can be any
  hero's now; an epic PART (a rig, turret or gear) into your cargo at ★2; or the HULL card, +500 max hull for the rest
  of the run that grows with the day as your hull does (+700 on day 2, then +900, +1,100, +1,400, +1,700, +2,000,
  +2,300 and +2,600 on days 3 to 9, and +3,000 on day 10), so it is +2,000 to +3,000 on the dawns it can come (days 7
  to 10). In 0.9.8 it came when a loss left you on your last life and gave that life back; its RUNE fitted your hero,
  its PART came at ★1 and its HULL card was +500 on every day.
- Players on a losing streak now meet opponents they can beat: the bottom of the ghost pool is built from a casual
  player's decks. Once your losses are 2 or more ahead of your wins, you meet the weaker half of the ghosts you could
  be matched with.
- The opening opponents were rebuilt for 0.9.9's rules, so a typical run is tougher than in 0.9.8: it now ends around 5
  wins, against about 7 in 0.9.8.
- **Open rune offers:** rune offers are open now: any hero can be offered any rune. THE LONG ROAD now gives +6% damage
  per rig a load passes (in 0.9.8 it doubled your ride bonus).
- **Free joins:** joins are free now: a joined factory keeps its full pace, and a deck can hold as many joins as you
  build. In 0.9.8 a joined factory ran at 70% pace and a deck held 2 joins.
- **More SHIELD and WARD:** PLATE ROLLER now rolls 15, 33 or 51 SHIELD onto your hull for each payload it hits at ★1, ★2
  or ★3 (5, 11 or 17 in 0.9.8), and WARD BELL gives your hull one WARD every 4, 3 or 2 seconds (8, 5 or 4). RIVET
  HOARD's FIGHT START is +180 SHIELD (+60), LAST WALL's AT HALF HULL +140 SHIELD (+80), and SEAM RIVETS' EACH PAIR +30
  SHIELD (+10).
- WEAVER's hull is now 1500 on day 1 (1700 in 0.9.8), so a road event that costs hull says HULL TOO WEAK sooner: an
  event can't take your max hull below 1,000 on day 1, a floor that grows with the day as your hull does (2,800 on day
  5, 6,000 on day 10).
- THANE KARSK and THISTLEMAIL carry fewer ARMOR PACKs late in a run.
- **Online:** 0.9.9's runs go online under the new rules, and the server checks each one by them: its hearts, its LAST
  CHANCE and every warlord drop it claims (a drop must be the one that warlord's roll gave).

## 0.9.8: styles you earn

Same battle rules as 0.9.7 (bb-0.9.7), so 0.9.7's ghosts and uploads still meet 0.9.8 players.
- **Styles you earn:** playing unlocks new looks for your carrier's floor panels, its belts and your stats panels: four
  of each, beside today's look. You earn them by playing and finishing runs, winning dusk fights, reaching later days
  and beating warlords.
- **CUSTOMIZE**, a new button beside OPTIONS on the title, shows each style on your own ship. One tap wears a style you
  have earned. A locked style says how to earn it and how far along you are, and a tap shows it on your ship without
  wearing it.
- **Where your styles show:** your board in battle and on the build screen, your battle plate and part panel, the run
  summary, your side of replays and the hero select. Foes keep today's look.
- **Looks only:** styles never change rules, ghosts or replays. Your choice is saved on this device.
- **A head start:** if you already play, the styles your saved ghosts show you have earned are open from the start.
- **NEW:** a lime dot on CUSTOMIZE and a NEW STYLE line on the run summary tell you when a style opens.
- **The road and the fork** show the day's sea behind their cards, as the build screen does.
- **Carrier styles:** your carrier's hull is now a style you choose, the fourth tab of CUSTOMIZE. Today's ship in your
  faction's colours stays the default (WAR COLOURS), and four more are earned: ADMIRAL'S BLUE (finish 3 runs), IRONCLAD
  (beat 5 warlords), STORMCALLER (win with 4 different heroes) and CHAMPION'S GOLD (win 100 dusk fights). Each keeps
  your faction's trim and lights, its smoke and fire when hit, and its place in your lane, so you always know which
  ship is yours. Foes keep today's look.
- **The landscape battle** keeps both boards whole on the screen while the ships surge: on a desktop or laptop, the
  outer tile columns no longer slip past the screen's side for a moment.

## 0.9.7: LAST CHANCE

New battle rules: bb-0.9.7. Ghosts and uploads from 0.9.6 no longer meet 0.9.7 players, and the stand-in and seed pools
were rebuilt for the new rules. You'll fight a fresh pool of 120 ghosts at first, then other players' 0.9.7 runs as they
come in.
- **LAST CHANCE:** once a run, when a dusk loss before day 10 leaves you on your last life, you get that life back at
  once, and the dusk card says LAST CHANCE: +1 LIFE. At the next dawn, before your rune, LAST CHANCE offers three free
  cards ("+1 LIFE. PICK ONE. FREE."): a RUNE that fits your hero, an epic PART (a rig, turret or gear) that goes to
  cargo, or +500 max HULL for the rest of the run. Tap a card to read it, then tap it again to take it; there is no
  skip. The run summary shows +1 LIFE on that dusk's row, with the card you took. A ghost that took a LAST CHANCE
  carries its card, and the server checks every upload that took one.
- **The dark wind hits both hulls alike:** from 25 seconds into a fight, both ships take the same hull damage at the same
  moment. It always did; a new check now keeps it that way (from a playtest note).
- **Bots overfeed their guns less:** a bot now counts the shots a gun loses to jams when it is fed faster than it fires.
  BASTION's bot decks jam about a quarter less, and they win about as often as before.
- **OLD BULWARK** fights harder on the road from day 5: he brings BELLOWS and a stronger QUENCH TANK, his GREASE WORKS a
  day sooner, and a SWIVEL GUN fed by a DRAG CHAIN FOUNDRY on day 10. His FLAK SCREEN and COUNTERWEIGHT come a little
  later on the road (days 8 and 9).
- **On the road, LONGTOOTH** brings his TEMPER on day 4 and his WHETSTONE's second star on day 5.
- **SILKSHADE and THANE KARSK** carry a little less road armor on day 5, so strong decks can beat them there again.
- **The IRON MATRIARCH** carries more armor on days 8, 9 and 10.
- **Six card faces now say a rule the game already played by:** ASSEMBLY LINE works only while it feeds a gun (★3: rigs
  start at once); HULLBREAKER hits only the hull; GATLING SPOOL fires at once; GRAPNEL GUN rips slugs from a rig as well
  as a belt; PRESSURE BREECH counts at most 5 waiting slugs; SORTING ARM's copies keep full damage. Text clean-up: stale
  comments and unused item descriptions.

## 0.9.6: battles in motion

Same battle rules as 0.9.5 (bb-0.9.3), so 0.9.5's ghosts and uploads still meet 0.9.6 players.
- **Battles in motion:** both carriers sail left to right side by side over the sea, drifting, turning and bobbing, while
  their boards stay level and parallel, so tiles, belts and numbers read as before. Shots fly between the moving boards.
- **Three seas by day:** CALM SEA on days 1-3, STORM (with rain) on days 4-7 and EMBER SEA on days 8-10.
- **One ship everywhere:** your carrier is now a ship with a long bow and a tall stern under your board, in battle, on
  the title, in replays, and held still on the build screen, the run summary and the hero select. The build screen's
  board, taps and drags are where they were.
- **REDUCED MOTION** (OPTIONS) sails straight: no turning, drifting or bobbing, a slower sea and no rain. Fights last
  just as long either way.

## 0.9.5: small fixes

Same battle rules as 0.9.4 (bb-0.9.3), so 0.9.4's ghosts and uploads still meet 0.9.5 players.
- **SALVO RACK's SHOT note**, in its ⓘ view or when you tap SHOT on its card, now gives the fallback its card already
  states: it fires at a full chamber, or 3 seconds after its first load.
- **On desktop, hovering a shop card** now shows the card's own ability line, as hovering a pack does. This fixes
  out-of-date hover text on MANTLET, TWIN LATCH, STOKER and IRON WALL. Guns and the few factories whose cards show only
  stats keep their old hover text.
- **Holding a factory or turret to lift it** now takes the time it should, a little under half a second (it used to
  lift in about half that). So a finger that rests briefly on a factory before drawing a belt now draws the belt
  instead of lifting the factory.

## 0.9.4: the captains' pass

Same battle rules as 0.9.3 (bb-0.9.3), so 0.9.3's ghosts and uploads still meet 0.9.4 players.
- **MASTER VOSS** no longer opens with TWIN NAILS on day 1: he takes OILED COGS that day and TWIN NAILS on day 2, and on
  day 8 IRON SKIN instead of SEAM RIVETS. He buys his early armor sooner (below).
- **The IRON MATRIARCH** no longer takes IRON SKIN (she takes BULWARK WARD on day 5 and FINAL NAIL on day 6), so strong
  decks can beat her on day 8 again.
- **HIGHSPIRE** buys her two day-9 ARMOR PACKs on day 10.
- **More road armor on the days they fell behind:** LONGTOOTH on days 9 and 10, MASTER VOSS on days 6 to 10,
  THANE KARSK on days 4, 5 and 8 to 10, and the MOTH QUEEN on days 7 and 10.
- **A day sooner on the road:** LONGTOOTH brings his LONG HAUL on day 4 and his TEMPER on day 5, HIGHSPIRE's TEMPER
  gets its second star on day 4, and OLD BULWARK brings his STATIC BRUSH on day 8.
- **Armor sooner, as dusk stand-ins and on the road:** MASTER VOSS buys two ARMOR PACKs on day 4 (was day 8), and
  LONGTOOTH one (was day 6). LOCKJAW, who meets you only at dusk, buys his on day 4 too (was day 8).

## 0.9.3: one rule for each part, and easier taps on phones

New battle rules: bb-0.9.3. Ghosts and uploads from 0.9.2 no longer meet 0.9.3 players. You'll fight a fresh pool of 120
ghosts at first, then other players' 0.9.3 runs as they come in.
- **One rule for each part:** a part does one thing, in one ability line with one trigger and one effect. A star changes
  a number and never adds a rule. IRON WALL and ANVIL BREECH still have two parts in their one line.
- **Perk names:** a star's perk name now shows only in the ⓘ levels view.
- **POISON is gone:** VENOM DRIP makes BURN last longer instead, 3, 6 or 9 seconds more by star.
- **HARASSMENT is gone:** only a STUN counts now. TOLLBOOTH blocks STUNS, FLAK SCREEN shoots down STUN shots, and
  SCRAPPER counts the STUNS you land. A wreck or a rip still lands, but none of them counts it.
- **LOAD TIME is gone from the cards:** SALVO RACK says it waits for a full chamber, or 3 seconds after its first load.
  ROTARY BREECH fires part-full chambers 50%, 65% or 80% sooner by star.
- **Payoff parts need their engine, and do nothing without it:** VENOM DRIP and QUENCH TANK work on BURN, PLATE BREAKER
  spends PLATE and STEAM BREECH needs it, and TWIN GAUGE works on a matched belt.
- **STOKER's factories still never outrun the gun they feed,** so stoking never jams it, and its card now says UP TO.
  EXT. CHAMBER fires 2, 3 or 4 loads a shot by star, up to what its gun's chamber holds.
- **BRAKE SHOE** only slows its belt now: to 50%, 40% or 30% speed by star. **MANTLET** keeps STUN off its gun and off
  the last 1, 2 or 3 tiles of each belt into it.
- **FOUNDRY:** when two blanks fuse, their VENOM DRIP seconds add up.
- **30 parts were reworked this way:** SABOT FOUNDRY, HOT SWAP, LIMPET WORKS, MANTLET, LODESTONE, SPOTTER, OVERDRIVE,
  PINCER, TWIN GAUGE, BELLOWS, QUENCH TANK, LONG HAUL, BARBED SPOOL, PLATE BREAKER, BRAKE SHOE, SURGE VALVE, TWIN LATCH,
  ASSEMBLY LINE, HOPPER, TWIN TRIGGER, SEAM WELDER, EXT. CHAMBER, ROTARY BREECH, STEAM BREECH, DRAKE NOZZLE,
  COUNTERWEIGHT, CAPACITOR BANK, POWDER KEG, SPALL CATCHER and VENOM DRIP. TOLLBOOTH, SCRAPPER, FLAK SCREEN, GRAPNEL GUN
  and BRACE FRAME follow the same rule (BRACE FRAME no longer cuts STUNS more while you hold PLATE).
- **Rivals were rebuilt for the new numbers:** the caravan's stand-ins and the starting ghosts were made again, and 13
  captains' parts now come later to fit the new luck caps. Most come a day later and four come two days later.
  LONGTOOTH's COUNTERWEIGHT comes on day 6 again, two or three days later (0.9.2 gave his stand-in it on day 4). The
  captains' runes are unchanged.
- **Phones:** MENU and SND are easier to tap. On shorter screens MENU moves to the top-left corner, and the SOUND switch
  is in its menu. Where a phone has room, the top bar grows to a finger's height instead. The rune row no longer
  catches taps meant for MENU or SND.

## 0.9.2: the captains' catch-up

Same battle rules as 0.9.1 (bb-0.9.1), so 0.9.1 and 0.9.2 players meet each other's ghosts, and their uploads keep
playing.
- **MASTER VOSS** no longer shuts out strong players: his early armor comes later, and he skips two of his strongest
  runes, TWIN SUNS and MOLTEN VOWS.
- **SILKSHADE, the MOTH QUEEN and LONGTOOTH** ease off on the days they stopped strong decks.
- **The IRON MATRIARCH** no longer takes PYRE HEART.
- **THANE KARSK** drops his day-5 road armor.
- **A little more road armor:** HIGHSPIRE and THANE KARSK on day 4, SILKSHADE on days 4 and 5, and HIGHSPIRE on day 8.
- **Two parts come sooner:** on the road, HIGHSPIRE's TEMPER gets its second star on day 5 (was day 6). LONGTOOTH's
  stand-in gets its COUNTERWEIGHT on day 4 (was day 6).
- **EMBERLYN** no longer picks COAL CHUTE, which did nothing for her.

## 0.9.1: the hero balance pass

New battle rules: bb-0.9.1. Ghosts and uploads from 0.9.0 no longer meet 0.9.1 players. You'll fight a fresh pool of 120
ghosts at first, then other players' 0.9.1 runs as they come in.
- **The heroes are closer to even:** WEAVER starts with 1700 hull (was 1800), and FURNACE with 2100 (was 2000).
- **FURNACE's four runes are back in the dawn offer:**
  - COAL CHUTE (common): your HEAT +15%.
  - HEAT SINK (rare): your HEAT +25%.
  - SEARING (rare): the foe starts with 5 BURN, and a foe with your BURN can't heal.
  - SHATTER SHOT (rare): your shots deal 14% more damage, and your hits break a SHIELD and still land.
- **The KILN's HEAT** is 13 (was 12): FURNACE's slugs gain 13 damage for each second they ride.
- **Rune cards:** a rune card shows each trigger and its effect on a line of its own.
- **Rivals were rebuilt for the new numbers:** the caravan's stand-ins and the starting ghosts were made again, and the
  captains' runes were drawn again from the larger rune offer. MASTER VOSS's stand-in now gets its COUNTERWEIGHT on
  day 5 (was day 3). As a Hard warlord he still has it from day 3.

## 0.9.0: whole numbers, sustain, rivals with runes, clearer cards

New battle rules: bb-0.9.0. Ghosts and uploads from 0.8.x no longer meet 0.9.0 players. You'll fight a fresh pool of 120
ghosts at first, then other players' 0.9.0 runs as they come in.
- **Whole numbers:** every number on a card and in a fight is a whole number. Damage and hull use a scale ten times
  larger, speeds are whole numbers, and every time is in whole seconds.
- **Sustain:** parts and runes that SHIELD, HEAL or REGEN your hull during a fight join the game, from day 3. WARD BELL
  shields your hull every 8 seconds.
- **Rivals use runes:** the starting ghosts, the caravan's stand-ins and the captains now take a rune at each dawn, as
  you do.
- **Four runes leave the dawn offer for now:** SEARING, SHATTER SHOT, COAL CHUTE and HEAT SINK. SIFTER leaves the shop
  for now.
- **DRAG CHAIN FOUNDRY** stuns for 3 seconds at ★3, and STALL is now called STUN.
- **The caravan always shows its full set of offers:** a part that only opens on a later day never takes a merchant's
  slot before then.
- **Uploads:** an uploaded run must hold one rune for each dawn it reached. The server refuses one that doesn't.
- **Captains and warlords** were refitted to the new numbers, so a few of their parts now arrive a day or more later.
- **Clearer cards:** GALVANIC COIL, FROSTBITE FOUNDRY, HULLBREAKER, SALVO RACK, COMPOUND BREECH and TWIN MOULD each say
  what they do in one line. SALVO RACK's turret shows its volley pace as its RATE. TWIN MOULD shows a SLUG row, and so
  does MIMIC FORGE on FOUNDRY.
- **TESLA ARC** shows its arc damage as a stat, and GATLING SPOOL's spin step is in its ⓘ levels view.
- **FURNACE's hero card** shows its two abilities as two short lines.
- **START:** runes that act at the start of a battle now begin with START: (RIVET HOARD, GRAVE PLATES, LOOSE THREAD,
  TANGLE WIRE and ASH KINDLE).

## 0.8.9: tougher captains, cleaner shop cards

No battle rule changes: the rules stay bb-0.8.7, so 0.8.7, 0.8.8 and 0.8.9 players meet each other's ghosts, and their
uploads keep playing.
- **Tougher captains:** the computer captains now buy ARMOR PACKs too, as players do, so the Hard captains stay a
  fight in the later days.
- **Owned marker:** a shop card for a piece you already own shows a small owned marker instead of a copy count. The
  MERGE badge and the BUY+MERGE button still show when a buy merges.
- **A taller info view:** the info view (ⓘ) is taller, so long card info fits on one page.

## 0.8.8: card faces

No battle rule changes: the rules stay bb-0.8.7, so 0.8.7's ghosts and uploads keep playing, and 0.8.7 and 0.8.8 players
meet each other's ghosts.
- **Plain card text:** parts, rigs, turrets and heroes say what they do in a few short words. A number comes with a
  small icon for what it measures, such as damage, seconds, slugs, belts or gold.
- **Cleaner cards:** the face you always see shows the stats, then one short line for each ability. The stats sit in
  their own rows, apart from the abilities. A factory's second stat row shows what its slugs carry, such as BURN or
  HEAT.
- **The info button (ⓘ)** on a panel's header opens the details. It shows the level ladder, with each number at every
  star and your star's number in yellow. It also shows what each star adds, what the next star changes, and what the
  panel's keywords mean.
- **No copies-to-merge line:** a card no longer counts the copies you still need for a merge. The MERGE badge and the
  BUY+MERGE button still show when a buy merges.
- **Keywords:** BURN, STUN, HEAT, FRAY, PLATE and PAIR each have their own colour and icon, on parts, captains and
  rune reminders. Tap a keyword on a build-screen panel to read what it means, or hover it with a mouse.
- **Shop cards** show the piece's main number with its icon.
- **Tall phones:** the part panel is a little shorter, so your carrier gets more room. Every panel still shows whole.

## 0.8.7: runes

New battle rules: bb-0.8.7. Ghosts and uploads from 0.8.6 stay with that version. You'll start against the same 120
ghosts 0.8.6 started with, then meet other players' 0.8.7 runs as they come in.
- **A rune at every dawn:** each day starts with a rune pick, one of three cards on days 1 to 4 and one of two from day
  5. A rune boosts you for the rest of the run. Take the day's rune before you fight.
- **57 runes:** 21 common, 20 rare, 11 epic and 5 legendary. Day 1 offers only commons, rarer runes come up as the run
  goes on, and legendaries from day 5. You never get the same rune twice.
- **The rune bar:** the runes you hold sit in a bar at the top of the build screen. Tap one to read what it does.
- **Ghosts carry their runes:** your ghosts fight with the runes you held, and the ghosts you meet fight with theirs.
  The server checks that each rune was one your run was offered. The starting ghosts and the caravan's stand-ins hold
  no runes yet.

## 0.8.6: belt and armor packs, and your name on your ghosts

New battle rules: bb-0.8.6. You'll fight the new rules' ghosts: a fresh pool of 120 at first, then other players'
0.8.6 runs as they come in. Ghosts and uploads from 0.8.5 stay with that version.
- **Two packs in every shop:** a BELT PACK (2 gold, +4 belt) and an ARMOR PACK (5 gold, +25 hull) sit beside REROLL on
  every visit. They never roll away, and you can buy them again and again. They replace the belt crates and hull
  plates the shop used to roll.
- **Your name:** you pick a name before your first run (2 to 10 letters, digits, spaces or hyphens). Your ghosts carry
  it, so a player who meets one sees "VS NAME#2C · 7-2" before the fight. The tag after the # comes from your device,
  so two players with the same name still look different. Change it under OPTIONS, on the title screen or in the build
  screen's MENU.
- **The warlords are easier with packs:** a typical player now beats them more often. A later update toughens them up.

## 0.8.5: gold upgrades and more belts

New battle rules: bb-0.8.3. You'll fight the new rules' ghosts: a fresh pool of 120 at first, then other players'
0.8.5 runs as they come in. Ghosts and uploads from 0.8.0 to 0.8.4 stay with those versions.
- **Gold upgrades, always on offer:** two upgrades sit on the build screen outside the shop, so they never roll away.
  TURRET SPEED makes your starting turrets fire faster. FACTORY gives your hero's own factory one more belt and a
  faster cycle. Each goes from level 1 to 4, for 10, 20 and 30 gold. Tap the turret or the factory, then UPGRADE.
- **More belts per factory:** a bought factory feeds 2 belts at one star, 3 at two stars and 4 at three (the GANTRY
  PRESS one more). Your hero's factory feeds 2 belts at level 1 and one more with each upgrade (the LOOM 3 to 6).
- **Your hero's factory never shows up in the shop.** You upgrade it instead.
- **No decimals in the new texts:** the upgrade lines and your hero's factory say FASTER instead of a number of seconds.

## 0.8.4: a roomier build screen on phones

No battle rule changes: the rules stay bb-0.8.0, so 0.8.0's ghosts and uploads keep playing. 0.8.4 also carries 0.8.3's
tap fix and 0.8.2's title-screen fix.
- **Zoomed out on phones:** on a phone held upright, the build screen is drawn smaller, so a part's description gets
  its own room between the shop and your carrier. Tap a shop card or a part and its whole description usually fits
  there; the few longest still grow over the shop, as in 0.8.3. Desktops, tablets and phones held sideways look as
  before.

## 0.8.3: a part's whole description on a phone tap

No battle rule changes: the rules stay bb-0.8.0, so 0.8.0's ghosts and uploads keep playing. 0.8.3 also carries 0.8.2's
title-screen fix.
- **Tap to read, on a real phone:** tapping a shop card or a part on your carrier now shows its whole description on a
  phone held upright. A phone's browser never gives the game the whole screen, so the panel used to get only a sliver
  of room: a header and buttons, often no text. Now, after a tap, the panel grows over its neighbour until its text
  fits, and a press on what it covers still reaches the part underneath. A mouse, drags and landscape work as before.

## 0.8.2: the title screen on phones

No battle rule changes: the rules stay bb-0.8.0, so 0.8.0's ghosts and uploads keep playing.
- **Title screen:** the demo battle's two carriers keep clear water between them on phones held upright. On small
  phones NEW RUN no longer sits on a carrier, and no title button is smaller than before.

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
