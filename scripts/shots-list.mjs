// Shot list for scripts/shot.mjs: the 21 baseline 0.3.0 shots plus the 0.4.0 juice shots.

export const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
};

// In-page: reset the run, open a screen, fast-forward deterministically, render.
export function prep({ screen, secs }) {
  const g = window.bb.game;
  g.run = null;
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
];
