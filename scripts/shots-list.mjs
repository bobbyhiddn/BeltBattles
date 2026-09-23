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
    ["run-lost", v, "title", 0, END({ results: "WLLWLDLL", seed: 4242, hero: "weaver" }, POOL)],
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
  ]),
  ...["desk", "phone"].flatMap((v) => [
    ["playback-paused", v, "battle", 7, "bb.game.screen.setSpeed(0); bb.game.screen.togglePause(); bb.game.render()"],
    ["run-flawless", v, "title", 0, END({ results: "WWWWWWWWWW", seed: 99 }, POOL)],
    ["title-help", v === "desk" ? "desk" : "small", "title", 1, "bb.game.screen.help = true; bb.game.render()"],
  ]),
];
