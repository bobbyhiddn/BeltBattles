// SUS-D (REQ-BFG-069): the shots of the sustain runes on their cards. A BB_SHOTS module for scripts/shot.mjs (its own
// VIEWS: the op phone 402x690 @3 and the 1280x800 desk). The sustain runes are offered only while the sustain switch is
// on, so these run on a build with SUSTAIN_LIVE = true (a temporary detached worktree, its one line flipped and never
// committed; removed after), served with BB_DIST:
//   PLAYWRIGHT_BROWSERS_PATH=... BB_DIST=<dist-on> BB_SHOTS=scripts/shots-susd.mjs node scripts/shot.mjs <outDir> susd-
// Scenes (the seeds give these offers with the switch on; tests/runes.sustain.test.ts pins the offer rules):
//   susd-dawn-common: a WEAVER run's day-1 dawn (seed 12362): BULWARK WARD, GREEN THREAD and SCRAP HALO, closed;
//   susd-dawn-rare:   a WEAVER run's day-3 dawn (seed 12431, a RARE dawn): TICK GUARD, WARD STONE and SEARING, TICK
//                     GUARD's card opened once (its line, SHIELD's reminder and TAP AGAIN TO TAKE IT);
//   susd-runebar-tickguard: a BASTION run holding its dawn rune and TICK GUARD, TICK GUARD's read-out open on the bar.

export { prep } from "./shots-list.mjs";

export const VIEWS = {
  phone: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

const J = JSON.stringify;
const STEP = (n) => `for (let i = 0; i < ${n}; i++) bb.game.step(1 / 60);`;

/** The dawn of `day` on a `hero` run with `seed`, nothing held, its pick pending (runeshots.mjs openRun's way); then the
 *  card at `open` (-1: none) tapped once. Logs the offer so the run log shows what the cards are. */
const dawn = (hero, day, seed, open = -1) => `(() => {
    const g = bb.game;
    bb.openDawn({ hero: ${J(hero)}, day: ${day}, gold: 12, seed: ${seed} });
    bb.holdRunes([]);
    g.run.runeDay = ${day};
    ${STEP(90)}
    const s = g.pending || g.screen, o = s.runePicker && s.runePicker.offer(s);
    console.log("SUSD offer: " + (o ? o.tier + " " + o.ids.join(",") : "none"));
    g.render(); // the picker's card regions are laid out as it draws
    if (${open} >= 0) {
      const r = g.ui.regions.filter((q) => q.id === "runepick-" + ${open}).pop();
      if (!r) console.error("SUSD: no card " + ${open}); else { r.onTap(); ${STEP(6)} }
    }
    g.render();
  })()`;

/** A BASTION run (seed 12345) holding its dawn rune and TICK GUARD, the bar's read-out open on TICK GUARD. */
const bar = () => `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", "bastion", 12345);
    ${STEP(20)}
    const s = g.pending || g.screen, o = g.run && s && s.runePicker && s.runePicker.offer(s);
    bb.holdRunes([o ? o.ids[0] : "iron_skin", "tick_guard"]);
    delete g.run.runeDay;
    ${STEP(30)}
    g.screen.touched();
    g.screen.runeBar.open = 1;
    ${STEP(6)}
    g.render();
  })()`;

const BOTH = ["phone", "desk"];
export const SHOTS = BOTH.flatMap((v) => [
  ["susd-dawn-common", v, "title", 0, dawn("weaver", 1, 12362)],
  ["susd-dawn-rare", v, "title", 0, dawn("weaver", 3, 12431, 0)],
  ["susd-runebar-tickguard", v, "title", 0, bar()],
]);
