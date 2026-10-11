// Shot list for scripts/shot.mjs: the 21 baseline 0.3.0 shots plus the 0.4.0 juice shots.

export const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
};

// In-page: reset the run and the ghost pool, open a screen, fast-forward deterministically, render.
export function prep({ screen, secs }) {
  const g = window.bb.game;
  g.run = null;
  window.bb.clearPool();
  window.bb.setReducedMotion(false);
  window.bb.open(screen, "furnace", 12345);
  // RUNES-087F (REQ-BFG-058): a fresh run owes day 1's rune pick, so the build screen opens under the dawn RUNE PICKER.
  // A shot here shows the screen itself: the run holds the dawn's first offered rune, the pick taken as runeshots.mjs
  // openRun takes it (bb.holdRunes, then runeDay cleared). runeshots.mjs shoots the picker. game.go only queues the new
  // screen (game.pending; step swaps it in), so this reads the queued screen and checks it holds this run. A build
  // without runes has no runePicker, so this is a no-op there (shots-det.mjs can still render an older build)
  const s = g.pending || g.screen, o = g.run && s && s.run === g.run && s.runePicker && s.runePicker.offer(s);
  if (o) { window.bb.holdRunes([o.ids[0]]); delete g.run.runeDay; }
  const frames = Math.round((0.6 + secs) * 60);
  for (let i = 0; i < frames; i++) g.step(1 / 60);
  g.render();
  return { W: g.W, H: g.H, scale: g.view.scale, screen: window.bb.screen() };
}

// In-page: step the battle until a muzzle flash and impact particles are on screen together.
export const HIT_FRAME = `(() => {
  const g = bb.game;
  for (let i = 0; i < 60 * 40; i++) {
    g.step(1 / 60);
    const a = g.screen.arena;
    if (!a) break;
    const s = a.fx.stats();
    if (g.screen.phase === "fight" && s.muzzles > 0 && s.bigFresh > 0 && s.parts > 20) break;
  }
  g.render();
})()`;

// In-page: step until the KO, then into the slow-mo with the WIN/LOSE banner showing.
export const KO_FRAME = `(() => {
  const g = bb.game;
  for (let i = 0; i < 60 * 120; i++) {
    g.step(1 / 60);
    if (g.screen.phase === "outro") break;
  }
  for (let i = 0; i < 52; i++) g.step(1 / 60);
  g.render();
})()`;

// 0.5.0 road events: open a given event (with round/gold/lives/cargo), optionally pick a choice
// and step `after` frames (the result beat), optionally press REFIT.
export const EVENT = (id, o = {}, pick = -1, after = 0, refit = false) => `(() => {
  const g = bb.game;
  bb.openEvent(${JSON.stringify(id)}, ${JSON.stringify(o)});
  for (let i = 0; i < 60; i++) g.step(1 / 60);
  if (${pick} >= 0) { g.render(); g.screen.pick(${pick}); for (let i = 0; i < ${after}; i++) g.step(1 / 60); }
  if (${refit}) { g.screen.refit(); for (let i = 0; i < 60; i++) g.step(1 / 60); }
  g.render();
})()`;

// 0.6.0 the 10-day run: a dawn (build) at a given day/record with a ghost pool; a dusk battle vs
// that pool (optionally SKIP to its result card); a played-out run's end screen.
const J = JSON.stringify;
const STEP = (n) => `for (let i = 0; i < ${n}; i++) bb.game.step(1 / 60);`;
// RUNES-087F (REQ-BFG-058): prep's dawn-rune step for a shot script that opens a fresh build screen itself
// (bb.open("build", ...)): the run holds day 1's first offered rune, so the shot shows the build screen, not the picker
const TAKE_DAWN = `{ const g = bb.game, s = g.pending || g.screen, o = g.run && s && s.run === g.run && s.runePicker && s.runePicker.offer(s); if (o) { bb.holdRunes([o.ids[0]]); delete g.run.runeDay; } }`;
export const DAWN = (o, ghosts = []) => `(() => { bb.openDawn(${J(o)}, ${J(ghosts)}); ${STEP(90)} bb.game.render(); })()`;
export const DUSK = (o, ghosts = [], frames = 60, toResult = false) => `(() => {
  const g = bb.game;
  bb.openDusk(${J(o)}, ${J(ghosts)}); ${STEP(frames)}
  if (${toResult}) { g.screen.skip(); for (let i = 0; i < 600 && g.screen.phase !== "result"; i++) g.step(1 / 60); ${STEP(40)} }
  g.render();
})()`;
export const END = (o, ghosts = []) => `(() => { bb.openEnd(${J(o)}, ${J(ghosts)}); ${STEP(60)} bb.game.render(); })()`;
// 0.6.0b: the road fork at a dawn (optional extra page script, e.g. a portrait inspect), and a
// warlord fight (with `outcome` in the options: its result card)
export const FORK = (o, ghosts = [], extra = "") => `(() => { bb.openFork(${J(o)}, ${J(ghosts)}); ${STEP(60)} ${extra} bb.game.render(); })()`;
export const WARLORD = (tier, o, frames) => `(() => { bb.openWarlord(${J(tier)}, ${J(o)}); ${STEP(frames)} bb.game.render(); })()`;
// 0.6.1b: a battle with a turret core fitted before the fight starts. `bb.open("build", ...)` first
// so `game.run` exists (tooling-style: newRun, no shop purchase), the core is pushed straight onto
// Build.mods (same pattern as build-deadend's direct route mutation below), then `bb.open("battle", ...)`
// reuses that run (its `game.run ?? newRun(...)` no-ops once `game.run` is set) so the Arena's Battle
// is built with the core already fitted.
export const CORE_BATTLE = (def, turret = 0, stars = 1, frames = 210) => `(() => {
  const bb = window.bb, g = bb.game;
  try {
    g.run = null;
    bb.open("build", "furnace", 12345);
    ${STEP(20)} // Game.go() drops a second pending screen until the first wipe clears (~0.24s)
    g.run.build.mods.push({ uid: 9001, def: ${J(def)}, turret: ${turret}, stars: ${stars} });
    bb.open("battle", "furnace", 12345);
    ${STEP(frames)}
    g.render();
  } catch (e) { console.error("CORE_BATTLE: " + e.message + "\\n" + e.stack); }
})()`;
const POOL = [
  { day: 2, hero: "weaver", wins: 1, losses: 0 }, { day: 3, hero: "furnace", wins: 1, losses: 1 },
  { day: 5, hero: "weaver", wins: 3, losses: 1 }, { day: 8, hero: "furnace", wins: 4, losses: 3 },
];

// [name, view, screen, seconds after the wipe, page script, special input]
export const SHOTS = [
  ["title", "phone", "title", 1.5], ["title", "desk", "title", 1.5],
  ["hero", "phone", "hero", 0.8], ["hero", "desk", "hero", 0.8],
  ["build", "phone", "build", 0.8], ["build", "desk", "build", 0.8],
  ["build", "small", "build", 0.8], ["build", "laptop", "build", 0.8],
  ["build-offer", "desk", "build", 1.5, "bb.game.screen.select({kind:'offer',wagon:0,slot:0}); bb.game.render()"],
  ["build-offer", "phone", "build", 1.5, "bb.game.screen.select({kind:'offer',wagon:0,slot:0}); bb.game.render()"],
  ["title-help", "phone", "title", 1, "bb.game.screen.help = true; bb.game.render()"],
  ["title", "small", "title", 1.5], ["hero", "small", "hero", 0.8],
  ["battle-intro", "desk", "battle", 1.2],
  ["battle-mid", "phone", "battle", 7], ["battle-mid", "desk", "battle", 7],
  ["battle-late", "desk", "battle", 16],
  ["battle-end", "desk", "battle", 60], ["battle-end", "phone", "battle", 60],
  ["summary", "desk", "summary", 1], ["summary", "phone", "summary", 1],
  // 0.4.0 additions
  ["battle-hit", "desk", "battle", 3, HIT_FRAME],
  ["battle-ko", "desk", "battle", 3, KO_FRAME],
  ["battle-ko", "phone", "battle", 3, KO_FRAME],
  ["build-drag", "desk", "build", 1.2, null, "drag"],
  ["build-drag", "phone", "build", 1.2, null, "drag"],
  // extra framing evidence for the two remaining views
  ["battle-mid", "laptop", "battle", 7], ["battle-mid", "small", "battle", 7],
  // 0.5.0 road events: a 3-choice event (one bet unaffordable) and the beat just after a pick
  ...["desk", "laptop", "phone", "small"].flatMap((v) => [
    ["event", v, "title", 0, EVENT("dice", { gold: 5 })],
    ["event-result", v, "title", 0, EVENT("wreck", { round: 1, gold: 8 }, 0, 20)],
  ]),
  // events sheet (desk + phone) and the refit that follows a salvaged part
  ...["desk", "phone"].flatMap((v) => [
    ["event-trader", v, "title", 0, EVENT("trader", { cargo: "whetstone" })],
    ["event-dock", v, "title", 0, EVENT("dock", { gold: 9, lives: 5 })], // PATCH UP disabled: LIVES FULL at START_LIVES (5)
    ["event-herald", v, "title", 0, EVENT("herald", { round: 2 })],
    ["event-storm", v, "title", 0, EVENT("storm")],
    ["event-smuggler", v, "title", 0, EVENT("smuggler")],
    ["event-scout", v, "title", 0, EVENT("scout")],
    ["event-refit-offer", v, "title", 0, EVENT("wreck", { round: 1, gold: 8 }, 0, 70)],
    ["build-refit", v, "title", 0, EVENT("wreck", { round: 1, gold: 8 }, 0, 70, true)],
  ]),
  // 0.6.0: dawn (DAY n/10, 5 hearts, NEXT BATTLE stand-in / pool ghost), dusk vs a pool ghost, the
  // result card after a loss (-1 LIFE), RUN COMPLETE / RUN LOST, and the playback bar (0.5X, pause)
  ...["desk", "laptop", "phone", "small"].flatMap((v) => [
    ["dawn", v, "title", 0, DAWN({ day: 3, wins: 2, losses: 0, lives: 5, gold: 14 })],
    ["dawn-ghost", v, "title", 0, DAWN({ day: 4, wins: 2, losses: 1, lives: 4, gold: 11 }, [{ day: 4, hero: "weaver", wins: 2, losses: 1 }])],
    ["dusk-ghost", v, "title", 0, DUSK({ day: 4, wins: 2, losses: 1, lives: 4 }, [{ day: 4, hero: "weaver", wins: 2, losses: 1 }], 75)],
    ["dusk-standin", v, "title", 0, DUSK({ day: 5, wins: 3, losses: 1, lives: 4 }, [], 75)], // M3b: honest stand-in, 1 plate
    ["dusk-loss", v, "title", 0, DUSK({ day: 2, wins: 1, losses: 0, lives: 5 }, [{ day: 2, hero: "furnace", wins: 1, losses: 0, power: 6 }], 40, true)],
    ["run-complete", v, "title", 0, END({ results: "WWLWDWLWWW", seed: 777 }, POOL)],
    // REQ-BFG-073 (backlog #378, REVIEW-STAGE097 R2): was "WLLWLDLL", whose fifth loss (dusk 8) now fires LAST CHANCE, so
    // the shot stopped at dawn 9 with the pick pending (2 lives left). Two more losses: playOut takes the HULL card at
    // dawn 9 (run.ts takeLastChance(run, "hull"), as the picker's second tap does), then days 9 and 10 are lost: RUN LOST
    // on day 10 with 0 lives, and day 8's row shows LAST CHANCE's +1 LIFE with the HULL card
    ["run-lost", v, "title", 0, END({ results: "WLLWLDLLLL", seed: 4242, hero: "weaver" }, POOL)],
    ["playback", v, "battle", 7, "bb.game.screen.setSpeed(0); for (let i = 0; i < 20; i++) bb.game.step(1 / 60); bb.game.render()"],
  ]),
  // 0.6.0b the road fork: day 1 (no intro rule), day 8 with the Iron Matriarch in the Hard slot, a
  // warlord intro, a Hard win with its part pick, a loss with no life lost, the Matriarch's
  // legendary win, dusk vs a stand-in captain, and a summary with warlord rows
  ...["desk", "laptop", "phone", "small"].flatMap((v) => [
    ["fork-day1", v, "title", 0, FORK({ day: 1 })],
    ["fork-day8", v, "title", 0, FORK({ day: 8, wins: 5, losses: 2, lives: 3, gold: 31 })],
    ["warlord-intro", v, "title", 0, WARLORD("hard", { day: 3, wins: 1, losses: 1, lives: 4 }, 75)],
    ["warlord-win", v, "title", 0, WARLORD("hard", { day: 4, wins: 2, losses: 1, lives: 4, outcome: 0 }, 60)],
    ["warlord-loss", v, "title", 0, WARLORD("easy", { day: 2, wins: 0, losses: 1, lives: 4, outcome: 1 }, 60)],
    ["dusk-standin-intro", v, "title", 0, DUSK({ day: 6, wins: 3, losses: 2, lives: 3 }, [], 75)],
    ["summary-warlords", v, "title", 0, END({ results: "WWLWDWLWWW", roads: "EMHvhVmEHv", seed: 777 }, POOL)],
  ]),
  ...["desk", "phone"].flatMap((v) => [
    ["warlord-matriarch-win", v, "title", 0, WARLORD("hard", { day: 8, wins: 5, losses: 2, lives: 3, outcome: 0 }, 60)],
    ["fork-inspect", v, "title", 0, FORK({ day: 5, wins: 3, losses: 1, lives: 4 }, [], "bb.game.screen.sel = 3;")],
    // B3: the retargeted events, SCOUT's reveal (SPY, then REFIT / FIGHT NOW), and a fork with a
    // pending ELITE BOUNTY and SABOTAGE (inspecting the Hard card)
    ["event-sappers", v, "title", 0, EVENT("sappers", { round: 4, gold: 9 })],
    ["event-scout-reveal", v, "title", 0, EVENT("scout", { round: 3, gold: 5 }, 2, 70)],
    ["fork-pending", v, "title", 0, FORK({ day: 6, wins: 3, losses: 2, lives: 3, bounty: true, sabotage: true }, [], "bb.game.screen.sel = 3;")],
  ]),
  ...["laptop", "small"].flatMap((v) => [
    ["event-scout-reveal", v, "title", 0, EVENT("scout", { round: 3, gold: 5 }, 2, 70)],
  ]),
  ...["desk", "phone"].flatMap((v) => [
    ["playback-paused", v, "battle", 7, "bb.game.screen.setSpeed(0); bb.game.screen.togglePause(); bb.game.render()"],
    ["run-flawless", v, "title", 0, END({ results: "WWWWWWWWWW", seed: 99 }, POOL)],
    ["title-help", v === "desk" ? "desk" : "small", "title", 1, "bb.game.screen.help = true; bb.game.render()"],
  ]),
  // 0.6.0c: a Hard win whose deck needed the fill (seed 1: OLD BULWARK on day 1 has only BRAKE; the
  // second part comes from a later deck), and HERALD / SAPPERS on day 10 (NO WARLORD LEFT)
  ...["desk", "laptop", "phone", "small"].flatMap((v) => [
    ["warlord-hardfill", v, "title", 0, WARLORD("hard", { day: 1, seed: 1, outcome: 0 }, 60)],
    ["event-herald-day10", v, "title", 0, EVENT("herald", { day: 10, gold: 9 })],
  ]),
  ...["desk", "phone"].flatMap((v) => [
    ["event-sappers-day10", v, "title", 0, EVENT("sappers", { day: 10, gold: 9 })],
    // a pressed FIGHT on a dead-end belt: the toast and the flashing belt. RUNES-087F (REQ-BFG-058): FIGHT refuses a
    // pending rune pick first (run.ts fightRefusal); prep has the run hold the dawn's first offered rune, so FIGHT meets
    // the dead end
    ["build-deadend-press", v, "build", 1.2, "bb.game.run.build.routes[0].cells.pop(); bb.game.screen.fight(); bb.game.step(1 / 60); bb.game.render()"],
  ]),
  // 0.6.0c: the end screen with every road event's STOP label (a 10-day run of events: one bag of
  // all 10), and FIGHT blocked by a dead-end belt (the starting belt cut one tile short)
  ...["desk", "laptop", "phone", "small"].flatMap((v) => [
    ["summary-stops", v, "title", 0, END({ results: "WWLWDWLWWW", roads: "VVVVVVVVVV", seed: 777 }, POOL)],
    ["build-deadend", v, "build", 1.2, "bb.game.run.build.routes[0].cells.pop(); bb.game.render()"],
  ]),
  // 0.6.0d: dusk stand-ins with their full-purse pool decks (standInPick) on days 1, 5 and 10 (an
  // empty pool, seed 12345): the intro (portrait + STAND-IN) and mid-battle (about 5 s into the fight)
  ...["desk", "phone"].flatMap((v) => [[1, 0, 0, 5], [5, 3, 1, 4], [10, 6, 3, 2]].flatMap(([day, wins, losses, lives]) => [
    [`dusk-pool-d${day}-intro`, v, "title", 0, DUSK({ day, wins, losses, lives }, [], 75)],
    [`dusk-pool-d${day}-mid`, v, "title", 0, DUSK({ day, wins, losses, lives }, [], 450)],
  ])),
  // 0.6.1b: the turret core socket + star pips (cruiser.ts) with the inspector's turret case open on
  // a bought core (CORE: SCATTER CHOKE **, REMOVE CORE, GEAR: EMPTY HARDPOINT), portrait and landscape;
  // and a battle with a core fitted, so SCATTER CHOKE's pellet render hook (ammo.ts) is on screen.
  ...["desk", "phone"].flatMap((v) => [
    ["build-core-socket", v, "build", 0.8, "bb.game.run.build.mods.push({uid: 9001, def: 'scatter', turret: 0, stars: 2}); bb.game.screen.select({kind:'turret', index:0}); bb.game.render()"],
  ]),
  ["battle-core", "desk", "title", 0, CORE_BATTLE("scatter", 0, 2, 600)],
  // 0.6.1d2: the MERGE badge + survivor ring (a forced offer matching an owned cargo copy,
  // selected so both the card badge and the cargo twin's yellow ring show), the merge animation
  // mid-flight (a synthetic run.fuseAnim step stepped to just past its flash/ring beat), and all
  // seven merchant wagons at once (forced past rollShop, for the wagon art/tag review).
  ...["desk", "phone"].flatMap((v) => [
    ["build-merge-badge", v, "title", 0, `(() => {
      const g = bb.game;
      bb.openDawn({ day: 3, cargo: ["temper"] }, []);
      for (let i = 0; i < 90; i++) g.step(1 / 60);
      const run = g.run, o = run.shop.wagons[0].offers[0];
      o.def = "temper"; o.price = 3; o.sold = false;
      g.screen.select({ kind: "offer", wagon: 0, slot: 0 });
      g.render();
    })()`],
    ["build-merge-anim", v, "title", 0, `(() => {
      const g = bb.game;
      bb.openDawn({ day: 3, cargo: ["temper"] }, []);
      for (let i = 0; i < 90; i++) g.step(1 / 60);
      const run = g.run, uid = run.inventory[0].uid;
      run.fuseAnim = [{ def: "temper", absorbed: -1, survivor: uid, stars: 2, where: "cargo" }];
      for (let i = 0; i < 18; i++) g.step(1 / 60);
      g.render();
    })()`],
    ["shop-7-merchants", v, "title", 0, `(() => {
      const g = bb.game;
      bb.openDawn({ day: 3 }, []);
      for (let i = 0; i < 90; i++) g.step(1 / 60);
      const run = g.run;
      const anyDef = run.shop.wagons[0].offers[0].def;
      const all = ["ironmonger", "tinker", "alchemist", "gunsmith", "scrapper", "quartermaster", "arcane"];
      run.shop.wagons = all.map((merchant) => ({ merchant, offers: [{ def: anyDef, price: 3, sold: false }] }));
      g.render();
    })()`],
  ]),
  // 0.6.2 BELTSIDE (ref/DESIGN-beltside.md): rigs beside the belt on the tooling showcase decks (src/tooling.ts
  // SHOWCASE, bb.openShowcase): rigs on both sides of one belt and its tile-by-tile timeline (V4), one LONG HAUL
  // feeding two belts and an OVERDRIVE (X) at a belt junction with their rig panels, an IDLE rig, the drag
  // preview (B1) auto-aimed and then turned by R (idle arrows dim), and battle frames with speed-tinted
  // chevrons (V1), payload state (V2) and arrow flashes (V3).
  ...["desk", "phone"].flatMap((v) => [
    ["beltside-sides", v, "title", 0, SHOWCASE("sides", "")],
    ["beltside-timeline", v, "title", 0, SHOWCASE("sides", "s.select({ kind: 'route', index: 0 });")],
    ["beltside-twobelts", v, "title", 0, SHOWCASE("twobelts", "s.select({ kind: 'item', uid: 10 });")],
    ["beltside-junction", v, "title", 0, SHOWCASE("junction", "s.select({ kind: 'item', uid: 10 });")],
    ["beltside-idle", v, "title", 0, SHOWCASE("sides", "s.run.build.items.push({ uid: 40, def: 'coil', x: 0, y: 9 }); s.touched(); s.select({ kind: 'item', uid: 40 });")],
    ["beltside-drag", v, "title", 0, SHOWCASE("junction", `const r = s.slotRect(0); s.ed.down(r.x + 9, r.y + 9); s.ed.move(...CELL(7, 2)); ${STEP(12)}`, { cargo: ["splitter"] })],
    ["beltside-drag-rotated", v, "title", 0, SHOWCASE("junction", `const r = s.slotRect(0); s.ed.down(r.x + 9, r.y + 9); s.ed.move(...CELL(7, 2)); s.key("r"); ${STEP(12)}`, { cargo: ["splitter"] })],
    ...[4, 7, 11].map((t) => [`beltside-battle-${t}s`, v, "title", 0, `(() => { bb.openShowcase("sides", "battle", { foe: "junction" }); ${STEP(60 * t)} bb.game.render(); })()`]),
    // payload state (V2): a burning slug past the TEMPER and a shocked one on the overdriven press belt, then
    // SPLITTER copies peeling apart
    ["beltside-battle-burnshock", v, "title", 0, BATTLE_UNTIL("s.routes[0].ammo.some((a) => a.p.burn > 0 && a.processed >= 5) && s.routes[1].ammo.some((a) => a.p.shock && a.processed >= 2)")],
    ["beltside-battle-peel", v, "title", 0, BATTLE_UNTIL("s.routes[0].ammo.some((a, k, l) => k > 0 && a.p.copy && l[k - 1].p.copy && l[k - 1].s - a.s > 1.5 && l[k - 1].s - a.s < 4)")],
  ]),
  // the smallest portrait (360x640): its inspector strip is a header only, so a selected belt's sub line carries the
  // turret-end readout (inspector.ts subTight), and a rig's sub line says IDLE
  ["beltside-timeline", "small", "title", 0, SHOWCASE("sides", "s.select({ kind: 'route', index: 0 });")],
  ["beltside-idle", "small", "title", 0, SHOWCASE("sides", "s.run.build.items.push({ uid: 40, def: 'coil', x: 0, y: 9 }); s.touched(); s.select({ kind: 'item', uid: 40 });")],
  // beltside-062 (the merge brief): a ★3 rig's inspector with its perk line (0.6.1r's levelLine under its hits) while
  // a shop card shows its MERGE badge (0.6.1r F1): the sides deck's SPLITTER at ★3 (PERFECT CUT since 0.6.1f; it was
  // THREE-WAY) beside a TEMPER offer
  // (MERGE ★2 with the placed TEMPER), and the junction's OVERDRIVE (X, 4 hits) at ★3 AFTERBURNER beside a BRAKE
  // offer, where the phone band must still show the hits (the flavour text gives way first)
  ...["desk", "phone"].flatMap((v) => [
    ["beltside-rig3-merge", v, "title", 0, RIG3_MERGE("sides", 16, "temper")],
    ["beltside-rig3-x", v, "title", 0, RIG3_MERGE("junction", 10, "brake")],
  ]),
  // beltside-062c (the 0.6.1c re-merge brief's new shot, DESIGN §12 P7/P9): a WEAVER deck with a rig on an ASSEMBLY
  // LINE ★3's belt (a LONG HAUL, one arrow on it, selected) next to a GANTRY PRESS ★2 with rigs on two of its belts (a
  // COIL working both at once, a WHETSTONE and a TEMPER)
  ...["desk", "phone"].map((v) => ["beltside-061c-asm-gantry", v, "title", 0, ASM_GANTRY()]),
  // 0.6.1r F7 (review-061's scenario): the turret panel with a bought SCATTER CHOKE ★2 core AND CALIBRATION gear on
  // turret 1, so it has two buttons (REMOVE CORE, REMOVE GEAR); in portrait they never cover the title or sub-line.
  ...["desk", "phone"].map((v) => [
    "build-core-gear", v, "build", 0.8,
    "bb.game.run.build.mods.push({uid: 9001, def: 'scatter', turret: 0, stars: 2}, {uid: 9002, def: 'calibrate', turret: 0}); bb.game.screen.select({kind:'turret', index:0}); bb.game.render()",
  ]),
  // 0.6.1r item 11 (0.6.1p's gap 6): the three new mods. A caravan (forced past rollShop) with the Quartermaster's
  // HOPPER, an Ironmonger MANTLET and a Tinker FINISHER RAM, each selected in turn; the turret inspector with each
  // one fitted; and a battle frame with a finisher shot (Projectile.finisher) in flight, dragging its red trail.
  ...["desk", "phone"].flatMap((v) => [
    ...[["hopper", 2], ["mantlet", 0], ["ram", 1]].map(([def, wagon]) => [`shop-new-mods-${def}`, v, "title", 0, NEW_MODS(wagon)]),
    ...["hopper", "mantlet", "ram"].map((def) => [`build-gear-${def}`, v, "build", 0.8,
      `bb.game.run.build.mods.push({uid: 9001, def: '${def}', turret: 0}); bb.game.screen.select({kind:'turret', index:0}); bb.game.render()`]),
    ["battle-finisher", v, "title", 0, finisherBattle()],
  ]),
  // 0.6.1c: the six new factories on the deck (selected, so the inspector shows each one's headline) and in battle
  // (their slugs on the belt: ember/spark, shot and slag tints), desk and phone; HOT SWAP 2 stars, ASSEMBLY LINE 3
  // (HOT START) and GANTRY PRESS 2 (THIRD ARM, three chutes). And a natural caravan (rollShop, seed 10, day 5) with the
  // Quartermaster's wagon: HOT SWAP and HOPPER, each once (M0).
  ...["desk", "phone"].flatMap((v) => [
    ...newFactories().map(([def, stars]) => [`build-factory-${def}`, v, "build", 0.8, factoryBuild(def, stars)]),
    ...newFactories().map(([def, stars]) => [`battle-factory-${def}`, v, "title", 0, factoryBattle(def, stars)]),
    ["shop-quartermaster", v, "title", 0, qmCaravan()],
    // M5: holding one TEMPER, seed 8's day-3 wreck (pick 0.22 < 0.35) salvages the TEMPER it merges with: MERGE badge
    ["event-salvage-merge", v, "title", 0, EVENT("wreck", { seed: 8, round: 3, cargo: "temper" })],
  ]),
  // 0.6.2b: every new foundry's selected art and live ammo, plus the carried-debuff marks on both layouts.
  ...["desk", "phone"].flatMap((v) => [
    ...[["scrapper", 3], ["sabot", 3], ["frostbite", 2], ["dragchain", 3], ["mimic", 3], ["limpet", 3]]
      .map(([def, stars]) => [`build-wave2-${def}`, v, "build", 0.8, factoryBuild(def, stars)]),
    ...[["scrapper", 3], ["sabot", 3], ["frostbite", 2], ["dragchain", 3], ["mimic", 3], ["limpet", 3]]
      .map(([def, stars]) => [`battle-wave2-${def}`, v, "title", 0, factoryBattle(def, stars, 1)]),
    ["battle-wave2-debuffs", v, "title", 0, debuffBattle()],
  ]),
  // 0.6.1f (V5): the retuned merges in the inspector: a 2-star BRAKE SHOE (HOT SHOE) and a 3-star SPLITTER (PERFECT
  // CUT) on the starting Kiln belt, one of them selected (its level and NEXT lines), desk and phone
  ...["desk", "phone"].flatMap((v) => [
    ["build-gate-brake2", v, "build", 0.8, gateBuild(9201)],
    ["build-gate-splitter3", v, "build", 0.8, gateBuild(9202)],
    // M2's pewter shot on the dark belt, in a chamber pip and in flight (battle-factory-shottower stops at the mouth)
    ["battle-shottower-flight", v, "title", 0, shotFlight()],
  ]),
  // beltside-062-on-061 (the 0.6.1 re-merge brief's new shot, DESIGN §13 P12/P13): a 2-star BRAKE SHOE rig (HOT SHOE)
  // working the Kiln belt beside a 3-star SPLITTER rig (PERFECT CUT), the belt selected: its timeline names the heat
  // first and PERFECT CUT's 2 X 85% after it, and the gun end reads the split heat, desk and phone
  ...["desk", "phone"].map((v) => ["beltside-061-brake-splitter", v, "build", 0.8, brakeSplitter()]),
  // 0.6.2p (the polish brief), desk and phone: a placed SPLITTER at 1, 2 and 3 stars (item 1's flavour, item 2's NEEDS n
  // MORE); the two old phone cuts on the inspector test's deck, a ★2 BRAKE SHOE IDLE and a ★2 SPLITTER on 2 belts (item
  // 3: their NEXT lines now whole); a ★2 PRESSURE BREECH in a WEAVER's cargo (a core's flavour at the light turret's
  // k 0.55, as its level line) and a placed ★2 SLAG POT's body (item 1); a SLAG POT belt worked by a GREASE WORKS and a
  // BRAKE SHOE, in the build screen (the belt selected: both hits read LOCKED) and mid-battle: neutral chevrons at the
  // slag's 0.75x (item 5). Item 4's parked shop row is beltside-061c-asm-gantry above; polish-long-names shows the
  // hyphenated one-word names, a MERGE ★2 badge and the BUY+MERGE button.
  ...["desk", "phone"].flatMap((v) => [
    ...[1, 2, 3].map((s) => [`polish-splitter-${s}`, v, "build", 0.8, polishRig("splitter", s)]),
    ["polish-brake2-idle", v, "title", 0, polishDeck("brake", 2, 0, 9, 0)],
    ["polish-splitter2-2hit", v, "title", 0, polishDeck("splitter", 2, 5, 3, 0)],
    ["polish-core2-weaver", v, "title", 0, polishCargo("pressure", 2, "weaver")],
    ["polish-factory2-slagpot", v, "build", 0.8, factoryBuild("slagpot", 2)],
    ["polish-slag-build", v, "build", 0.8, slagRigs(false)],
    ["polish-slag-battle", v, "title", 0, slagRigs(true)],
    ["polish-long-names", v, "title", 0, longNames()],
  ]),
  // 0.6.2p (item 4) on the 360x640 viewport too: the asm-gantry scene's parked shop row, and the long names
  ["beltside-061c-asm-gantry", "small", "title", 0, ASM_GANTRY()],
  ["polish-long-names", "small", "title", 0, longNames()],
  // 0.6.2j BELT JOINS (REQ-BFG-027, REQ-BFG-030): the "joins" showcase deck (src/tooling.ts; scripts/joinrun.mjs draws the
  // same join with real input as scripts/singlefile.mjs's join-desk and join-phone runs): the finished join, the joining
  // belt's readout through the join (JOINS BELT 1 AT TILE 2), the main belt's (1 BELT JOINS IT), and a battle frame with
  // a STAMP PRESS slug crossing into the KILN's belt, desk and phone
  ...["desk", "phone"].flatMap((v) => [
    ["joins-done", v, "title", 0, SHOWCASE("joins", "")],
    ["joins-readout", v, "title", 0, SHOWCASE("joins", "s.select({ kind: 'route', index: 1 });")],
    ["joins-mainbelt", v, "title", 0, SHOWCASE("joins", "s.select({ kind: 'route', index: 0 });")],
    ["joins-battle-cross", v, "title", 0, JOIN_CROSS()],
  ]),
];

// 0.6.2p (item 4): the shop's three one-word names wider than a card (COUNTERWEIGHT, OVERCLOCKER, HULLBREAKER, now
// hyphenated) in rollShop's 2-2-1 wagon shape, each at its merchant and price, with a COUNTERWEIGHT copy in cargo: its
// card wears the MERGE ★2 badge and, selected, its panel shows the MERGES WITH line and the BUY+MERGE button
function longNames() {
  return `(() => {
    const g = bb.game;
    bb.openDawn({ day: 5, gold: 30, cargo: ["counterweight"] }, []);
    ${STEP(90)}
    g.run.shop.wagons = [
      { merchant: "scrapper", offers: [{ def: "counterweight", price: 4, sold: false }, { def: "dragchain", price: 5, sold: false }] },
      { merchant: "gunsmith", offers: [{ def: "hullbreaker", price: 5, sold: false }, { def: "escapement", price: 5, sold: false }] },
      { merchant: "tinker", offers: [{ def: "overclocker", price: 6, sold: false }] },
    ];
    g.screen.select({ kind: "offer", wagon: 0, slot: 0 });
    g.render();
  })()`;
}

// 0.6.2p: rig `def` at ★`stars` west of the Kiln belt's (4,3), facing it (a T's first arrow east: rot 1), selected
function polishRig(def, stars) {
  return `(() => {
    const g = bb.game;
    g.run.build.items.push({ uid: 9301, def: ${J(def)}, x: 3, y: 3, rot: 1${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.touched();
    g.screen.select({ kind: "item", uid: 9301 });
    g.render();
  })()`;
}

// 0.6.2p: tests/inspectorLines.test.ts's phone deck (the Kiln's belt up column 4, a STAMP PRESS belt up column 6 that
// bends into column 5) with rig `def` (uid 10, ★stars) at (x, y) turned `rot`, no spare copy, selected
function polishDeck(def, stars, x, y, rot) {
  return `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", "furnace", 12345);
    ${TAKE_DAWN}
    ${STEP(20)}
    ${parked()}
    const K = (x, y) => y * 10 + x, b = g.run.build; // the screen's view holds this build object: edit it in place
    b.beltCap = 30;
    b.items = [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 },
      { uid: 10, def: ${J(def)}, x: ${x}, y: ${y}${rot ? `, rot: ${rot}` : ""}${stars > 1 ? `, stars: ${stars}` : ""} }];
    b.routes = [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 7, cells: [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)] }];
    g.screen.touched();
    g.screen.select({ kind: "item", uid: 10 });
    ${STEP(12)}
    g.render();
  })()`;
}

// 0.6.2p: a ★`stars` `def` in the cargo of a `hero` run, selected (its flavour, level and NEXT lines at the hero's k)
function polishCargo(def, stars, hero) {
  return `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", ${J(hero)}, 12345);
    ${TAKE_DAWN}
    ${STEP(20)}
    ${parked()}
    g.run.inventory.push({ uid: 9401, def: ${J(def)}${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.select({ kind: "cargo", uid: 9401 });
    ${STEP(12)}
    g.render();
  })()`;
}

// 0.6.2p: placeFactory's SLAG POT (★1) with a GREASE WORKS on its belt's (5,4) and a BRAKE SHOE on its (5,2), both east of
// the belt facing west (rot 3). Build: the belt selected. Battle: stepped until both rigs are online and 2 slag slugs ride
// the belt, one past the GREASE (where the sim's render-only speedAt reads 1.6x)
function slagRigs(battle) {
  const rigs = `g.run.build.items.push({ uid: 9121, def: "grease", x: 6, y: 4, rot: 3 }, { uid: 9122, def: "brake", x: 6, y: 2, rot: 3 });`;
  if (!battle) {
    return `(() => {
      const g = bb.game;
      ${placeFactory("slagpot", 1)}
      ${rigs}
      g.screen.touched();
      g.screen.select({ kind: "route", index: 1 });
      g.render();
    })()`;
  }
  return `(() => {
  const bb = window.bb, g = bb.game;
  try {
    g.run = null;
    bb.open("build", "furnace", 12345);
    ${STEP(20)}
    ${placeFactory("slagpot", 1)}
    ${rigs}
    bb.open("battle", "furnace", 12345);
    let ok = false;
    for (let i = 0; i < 60 * 30 && !ok; i++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (!a || g.screen.phase !== "fight") continue;
      const s = a.b.sides[0], r = s.routes.find((q) => q.factory === 9101);
      const online = s.gates.filter((q) => q.uid === 9121 || q.uid === 9122).every((q) => q.online);
      ok = online && !!r && r.ammo.length >= 2 && r.ammo.some((x) => x.s > 2.5 * 12);
    }
    if (!ok) console.error("SLAG_RIGS: no frame with both rigs online and 2 slag slugs on the belt within 30 s");
    g.render();
  } catch (e) { console.error("SLAG_RIGS: " + e.message + "\\n" + e.stack); }
})()`;
}

// 0.6.2j: the "joins" showcase deck fighting "sides", stepped from 1 s until a joined payload is crossing into its main
// belt (past the join tile's edge, short of its centre), at most 30 s more
function JOIN_CROSS() {
  return `(() => {
    bb.openShowcase("joins", "battle", { foe: "sides" });
    const g = bb.game;
    ${STEP(60)}
    for (let i = 0; i < 60 * 30; i++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (!a) continue;
      const s = a.b.sides[0], r = s.routes.find((q) => q.join);
      if (r && s.routes[r.join.route].ammo.some((x) => x.via === r.index && x.s > r.join.enter + 1 && x.s < r.join.enter + 5)) break;
    }
    g.render();
  })()`;
}

// 0.6.2 BELTSIDE: the "sides" showcase deck fighting "junction", stepped from 3 s until `cond` holds for the
// player's side `s` (at most 20 s more)
function BATTLE_UNTIL(cond) {
  return `(() => {
    bb.openShowcase("sides", "battle", { foe: "junction" });
    const g = bb.game;
    ${STEP(180)}
    for (let i = 0; i < 60 * 20; i++) {
      g.step(1 / 60);
      const s = g.screen.arena.b.sides[0];
      if (${cond}) break;
    }
    g.render();
  })()`;
}

// 0.6.1f: battle-factory-shottower's fight, stepped until a shot flies, one sits in a chamber pip and 2 ride its belt
function shotFlight() {
  return `(() => {
  const bb = window.bb, g = bb.game;
  try {
    g.run = null;
    bb.open("build", "furnace", 12345);
    for (let i = 0; i < 20; i++) g.step(1 / 60);
    ${placeFactory("shottower", 1)}
    bb.open("battle", "furnace", 12345);
    let ok = false;
    for (let i = 0; i < 60 * 30 && !ok; i++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (!a || g.screen.phase !== "fight") continue;
      const s = a.b.sides[0];
      const flying = a.b.projectiles.some((p) => p.from === 0 && p.payload.ammo === "shot");
      const piped = s.turrets.some((t) => t.stack.some((p) => p.ammo === "shot"));
      const riding = s.routes.filter((r) => r.factory === 9101).reduce((k, r) => k + r.ammo.filter((x) => x.processed >= 2).length, 0) >= 2;
      ok = flying && piped && riding;
    }
    if (!ok) console.error("SHOT_FLIGHT: no frame with a shot in flight, one in a chamber pip and 2 up the belt within 30 s");
    g.render();
  } catch (e) { console.error("SHOT_FLIGHT: " + e.message + "\\n" + e.stack); }
})()`;
}

// 0.6.1f: a 2-star BRAKE SHOE (uid 9201) and a 3-star SPLITTER (uid 9202) working the first two free tiles of the Kiln's
// belt, one of them selected (its level and NEXT lines). beltside-062-on-061 (DESIGN R1, D3): 0.6.1f stood both ON those
// tiles; each is now a rig beside its old tile, facing it, on D3's first side (left of travel): the belt runs up column 4
// from the Kiln at (4,6), so the rigs stand west of (4,4) and (4,3) at rot 1 (an I's and a T's first arrow point +x)
function gateBuild(uid) {
  return `(() => {
    const g = bb.game, b = g.run.build;
    const taken = new Set(b.items.map((p) => p.y * 10 + p.x));
    const belt = new Set(b.routes.flatMap((r) => r.cells));
    const cells = b.routes[0].cells;
    const tiles = cells.filter((c, i) => i > 0 && !taken.has(c)).slice(0, 2);
    const spot = tiles.map((c) => c - 1); // the west neighbour: left of travel on a belt running up the deck (from c + 10)
    if (tiles.length < 2 || tiles.some((c) => cells[cells.indexOf(c) - 1] !== c + 10) || spot.some((k) => k % 10 === 9 || taken.has(k) || belt.has(k))) {
      console.error("GATE_BUILD: no free cell west of the Kiln belt's first two free tiles");
    }
    b.items.push({ uid: 9201, def: "brake", x: spot[0] % 10, y: Math.floor(spot[0] / 10), rot: 1, stars: 2 });
    b.items.push({ uid: 9202, def: "splitter", x: spot[1] % 10, y: Math.floor(spot[1] / 10), rot: 1, stars: 3 });
    g.screen.touched(); // rebuild the screen's cruiser model, so the two rigs are drawn
    g.screen.select({ kind: "item", uid: ${uid} });
    g.render();
  })()`;
}

// beltside-062-on-061: HOT SHOE (uid 9201) west of the Kiln belt's (4,4) and PERFECT CUT (uid 9202) west of (4,3), side
// by side, both at rot 1 (facing east, onto the belt: tiles 1 and 2); the belt route selected (its timeline)
function brakeSplitter() {
  return `(() => {
    const g = bb.game, b = g.run.build;
    const taken = new Set(b.items.map((p) => p.y * 10 + p.x)), belt = new Set(b.routes.flatMap((r) => r.cells));
    if ([43, 33].some((k) => taken.has(k) || belt.has(k)) || !belt.has(44) || !belt.has(34)) console.error("BRAKE_SPLITTER: the Kiln belt's west side is not free");
    b.items.push({ uid: 9201, def: "brake", x: 3, y: 4, rot: 1, stars: 2 }, { uid: 9202, def: "splitter", x: 3, y: 3, rot: 1, stars: 3 });
    g.screen.touched(); // rebuild the screen's cruiser model, so the two rigs are drawn
    g.screen.select({ kind: "route", index: 0 });
    g.render();
  })()`;
}

// 0.6.1c: [def, stars] for the factory shots (a hoisted function: SHOTS above is built at module load)
function newFactories() {
  return [["doublestamp", 1], ["shottower", 1], ["hotswap", 2], ["slagpot", 1], ["assembly", 3], ["gantry", 2]];
}

// The factory at (6,6) on the free heavy intake (column 5), the starting Kiln route beside it (13 of 14 belt tiles)
function placeFactory(def, stars) {
  return `g.run.build.items.push({ uid: 9101, def: ${JSON.stringify(def)}, x: 6, y: 6${stars > 1 ? `, stars: ${stars}` : ""} });
    g.run.build.routes.push({ factory: 9101, cells: [56, 55, 45, 35, 25, 15, 5] });`;
}

function factoryBuild(def, stars) {
  return `(() => {
    const g = bb.game;
    ${placeFactory(def, stars)}
    g.screen.touched(); // rebuild the screen's cruiser model, so the factory's new route is drawn
    g.screen.select({ kind: "item", uid: 9101 });
    g.render();
  })()`;
}

// 0.6.2 BELTSIDE: a showcase deck in the build screen, then `extra` (with s = the build screen, CELL(x, y) = the
// logical point at the centre of deck cell (x, y) for the screen's facing: 12 px cells, a 120 px deck)
function SHOWCASE(name, extra, o = {}) {
  return `(() => {
    bb.openShowcase(${J(name)}, "build", ${J(o)}); ${STEP(90)}
    const s = bb.game.screen, f = s.L.frame, D = 120;
    const CELL = (x, y) => {
      // ZOOM-1 (REQ-BFG-080): through the carrier's own zoom where the build has it (BuildScreen.tileCentre)
      if (typeof s.tileCentre === "function") { const p = s.tileCentre(x, y); return [p.x, p.y]; }
      const sx = f.facing === 0 || f.facing === 2 ? f.dx + x * 12 : f.facing === 1 ? f.dx + D - (y + 1) * 12 : f.dx + y * 12;
      const sy = f.facing === 0 ? f.dy + y * 12 : f.facing === 2 ? f.dy + D - (y + 1) * 12 : f.dy + x * 12;
      return [sx + 6, sy + 6];
    };
    ${extra}
    bb.game.render();
  })()`;
}

// beltside-062: showcase `name` in the build screen with rig `uid` at ★3, selected (its inspector: hits, then the
// perk line), and the first wagon's first offer forced to `offer`, a def the deck already holds at ★1, so that card
// shows its MERGE badge (0.6.1d2/0.6.1r F1)
function RIG3_MERGE(name, uid, offer) {
  return SHOWCASE(name, `
    const p = s.run.build.items.find((q) => q.uid === ${uid});
    p.stars = 3;
    const o = s.run.shop.wagons[0].offers[0];
    o.def = ${J(offer)}; o.price = 3; o.sold = false;
    s.touched();
    s.select({ kind: "item", uid: ${uid} });
    ${STEP(12)}`);
}

// beltside-062c: the Loom parked off-route at (0,8); GANTRY PRESS ★2 at (4,6) on column 4 (A) and, west then up, column 1
// (B); ASSEMBLY LINE ★3 at (7,6) up column 8. A COIL (L, rot 1) at (3,5) works A (4,5) and B (3,6), a WHETSTONE A (4,3),
// a TEMPER B (1,4); a LONG HAUL (II) at (7,3) works the Assembly Line's (8,3) with one arrow (the other at empty deck)
function ASM_GANTRY() {
  return `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", "weaver", 12345);
    ${TAKE_DAWN}
    ${STEP(20)}
    const K = (x, y) => y * 10 + x;
    g.run.build.items = [
      { uid: 1, def: "loom", x: 0, y: 8 }, { uid: 9101, def: "gantry", x: 4, y: 6, stars: 2 }, { uid: 9102, def: "assembly", x: 7, y: 6, stars: 3 },
      { uid: 9110, def: "coil", x: 3, y: 5, rot: 1 }, { uid: 9111, def: "whetstone", x: 3, y: 3, rot: 1 },
      { uid: 9112, def: "temper", x: 0, y: 4, rot: 1 }, { uid: 9113, def: "longhaul", x: 7, y: 3 },
    ];
    g.run.build.routes = [
      { factory: 9101, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 9101, cells: [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
      { factory: 9102, cells: [K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] },
    ];
    g.screen.touched();
    g.screen.select({ kind: "item", uid: 9113 });
    ${STEP(12)}
    ${parked()}
    g.render();
  })()`;
}

// 0.6.2p (item 4): step on until the build screen's caravan has parked. Its cards slide in from the right for 0.83 s
// (layout.ts Caravan: 0.55 s + 0.07 s a card); ASM_GANTRY rendered about 0.3 s in, so its phone shot caught five of the
// six slots still past the right edge (the shop row itself fits: 3 a row from x 12 to 156 of the phone's 167 px).
// Every other build shot already waits (prep's 0.8 s, or 90 frames after openDawn / openShowcase). A hoisted function:
// SHOTS above is built at module load.
function parked() {
  return "for (let i = 0; i < 120 && bb.game.screen.caravan && !bb.game.screen.caravan.ready; i++) bb.game.step(1 / 60);";
}

// CORE_BATTLE's pattern, stepped until at least 2 of the factory's slugs ride its belt in the fight
function factoryBattle(def, stars, want = def === "slagpot" ? 2 : 3) {
  return `(() => {
  const bb = window.bb, g = bb.game;
  try {
    g.run = null;
    bb.open("build", "furnace", 12345);
    for (let i = 0; i < 20; i++) g.step(1 / 60);
    ${placeFactory(def, stars)}
    bb.open("battle", "furnace", 12345);
    let n = 0;
    // SLAG POT's slow slag rarely has 3 on its belt before the chamber jams (about 25 s in), so it stops at 2
    for (let i = 0; i < 60 * 30 && n < ${want}; i++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      n = a && g.screen.phase === "fight" ? a.b.sides[0].routes.filter((r) => r.factory === 9101).reduce((k, r) => k + r.ammo.length, 0) : 0;
    }
    if (n < ${want}) console.error("FACTORY_BATTLE: fewer than ${want} ${def} slugs on its belt within 30 s");
    for (let i = 0; i < 12; i++) g.step(1 / 60); // past the stamp's 0.18 s flash, so the sprite shows unwashed
    if (${want} === 1) for (let i = 0; i < 60 * 2 && g.screen.phase === "fight" && g.screen.pt < 0.8; i++) g.step(1 / 60);
    g.render();
  } catch (e) { console.error("FACTORY_BATTLE: " + e.message + "\\n" + e.stack); }
})()`;
}

function debuffBattle() {
  return `(() => {
    bb.openShowcase("sides", "battle", { foe: "junction" });
    const g = bb.game;
    ${STEP(180)}
    for (let i = 0; i < 60 * 10; i++) {
      const ammo = g.screen.arena?.b.sides[0].routes.flatMap((r) => r.ammo) ?? [];
      if (ammo.length) {
        ammo[0].p.debuffs = { chill: true, snag: true, sap: true };
        break;
      }
      g.step(1 / 60);
    }
    for (let i = 0; i < 60 * 2 && g.screen.phase === "fight" && g.screen.pt < 0.8; i++) g.step(1 / 60);
    g.render();
  })()`;
}

function qmCaravan() {
  return `(() => {
    const g = bb.game;
    bb.openDawn({ day: 5, gold: 30, seed: 10 }, []);
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    const w = g.run.shop.wagons.findIndex((x) => x.merchant === "quartermaster");
    if (w < 0) console.error("QM_CARAVAN: no Quartermaster wagon");
    else g.screen.select({ kind: "offer", wagon: w, slot: g.run.shop.wagons[w].offers.findIndex((o) => o.def === "hotswap") });
    g.render();
  })()`;
}

function NEW_MODS(wagon) {
  return `(() => {
    const g = bb.game;
    bb.openDawn({ day: 5, gold: 30 }, []);
    ${STEP(90)}
    // rollShop's 3-wagon shape: 2, 2 and 1 offers (only the last wagon gets one slot)
    g.run.shop.wagons = [
      { merchant: "ironmonger", offers: [{ def: "mantlet", price: 4, sold: false }, { def: "beltcrate", price: 2, sold: false }] },
      { merchant: "tinker", offers: [{ def: "ram", price: 5, sold: false }, { def: "grease", price: 3, sold: false }] },
      { merchant: "quartermaster", offers: [{ def: "hopper", price: 4, sold: false }] },
    ];
    g.screen.select({ kind: "offer", wagon: ${wagon}, slot: 0 });
    g.render();
  })()`;
}

// FINISHER RAM on the FURNACE's heavy turret (CORE_BATTLE's pattern), stepped until one of its finisher shots is
// 40% into its flight, so the 1 px red trail (arenaDraw.ts) is on screen (a function: SHOTS above uses it)
function finisherBattle() {
  return `(() => {
  const bb = window.bb, g = bb.game;
  try {
    g.run = null;
    bb.open("build", "furnace", 12345);
    ${STEP(20)}
    g.run.build.mods.push({ uid: 9001, def: "ram", turret: 0 });
    bb.open("battle", "furnace", 12345);
    let found = false;
    for (let i = 0; i < 60 * 60 && !found; i++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      found = !!a && g.screen.phase === "fight" && a.b.projectiles.some((p) => p.finisher && p.from === 0 && p.t / p.flight >= 0.4);
    }
    if (!found) console.error("FINISHER_BATTLE: no finisher shot in flight within 60 s");
    g.render();
  } catch (e) { console.error("FINISHER_BATTLE: " + e.message + "\\n" + e.stack); }
})()`;
}
