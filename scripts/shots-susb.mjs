// SUS-B (REQ-BFG-069, REQ-BFG-070): the shots of the sustain words, faces and HUD. A BB_SHOTS module for scripts/shot.mjs
// (its own VIEWS: the op phone 402x690 @3 and the 1920x1080 desk):
//   PLAYWRIGHT_BROWSERS_PATH=... BB_SHOTS=scripts/shots-susb.mjs node scripts/shot.mjs <outDir> susb-
// The BEFORE shots run the same list on susa's build (BB_DIST=<susa dist>): RIVETER, WARD STONE and IRON WALL (SHIELD WALL
// there) had faces before; the three new pieces had none (their scenes there show SUS-A's bare panels).
// Scenes: the four piece faces in cargo or placed (RIVETER placed on the Kiln belt, WARD BELL, MEND PRESS placed with its
// belt, MENDING LOOM), IRON WALL's kept text, WARD BELL's ⓘ view (LEVELS and KEYWORDS), a tap on each new word (SHIELD,
// HEAL, REGEN, and DARK WIND in SEAM WELDER's kept text), WARD STONE's rune read-out, and a battle frame: a WEAVER deck
// holding a WARD BELL ★3, a MENDING LOOM ★3 and a RIVETER ★3 on its belt, with WARD STONE, at the moment a HEAL float is up.

export { prep } from "./shots-list.mjs";

export const VIEWS = {
  phone: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};

const J = JSON.stringify;
const STEP = (n) => `for (let i = 0; i < ${n}; i++) bb.game.step(1 / 60);`;
const PARKED = "for (let i = 0; i < 120 && bb.game.screen.caravan && !bb.game.screen.caravan.ready; i++) bb.game.step(1 / 60);";
/** A press on the build screen's region whose id ends with `tail` (keywords.ts: "kw:?", "kw:<i>:<WORD>"), then a render. */
const TAP = (tail) => `{ const r = bb.game.ui.regions.filter((q) => q.id.endsWith(${J(tail)})).pop();
    if (!r) console.error("SUSB: no region " + ${J(tail)}); else { r.onTap(); bb.game.step(1 / 60); bb.game.render(); } }`;

/** A fresh `hero` run in the build screen (seed 12345), its dawn rune taken, parked; then `body`; then `after`. */
function fresh(hero, body, after = "") {
  return `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", ${J(hero)}, 12345);
    ${STEP(20)}
    const s = g.pending || g.screen, o = g.run && s && s.runePicker && s.runePicker.offer(s);
    if (o) { bb.holdRunes([o.ids[0]]); delete g.run.runeDay; }
    ${STEP(20)}
    ${PARKED}
    const b = g.run.build;
    ${body}
    g.screen.touched();
    ${STEP(12)}
    ${PARKED}
    g.render();
    ${after}
  })()`;
}

/** A ★`stars` `def` in cargo on a `hero` run, selected. */
const cargo = (def, stars, hero, after = "") => fresh(hero, `
    g.run.inventory.push({ uid: 9401, def: ${J(def)}${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.select({ kind: "cargo", uid: 9401 });`, after);
/** Rig `def` at ★`stars` west of the Kiln belt's (4,3), facing it (rot 1), selected (shots-text.mjs's rig). */
const rig = (def, stars, after = "") => fresh("furnace", `
    b.items.push({ uid: 9301, def: ${J(def)}, x: 3, y: 3, rot: 1${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.select({ kind: "item", uid: 9301 });`, after);
/** A factory `def` at ★`stars` at (6,6) on the Furnace's free heavy intake (column 5), selected (shots-text.mjs's). */
const factory = (def, stars, after = "") => fresh("furnace", `
    b.items.push({ uid: 9101, def: ${J(def)}, x: 6, y: 6${stars > 1 ? `, stars: ${stars}` : ""} });
    b.routes.push({ factory: 9101, cells: [56, 55, 45, 35, 25, 15, 5] });
    g.screen.select({ kind: "item", uid: 9101 });`, after);
/** WARD STONE held (with the dawn's rune) and its read-out open on the rune bar. */
const wardStone = () => fresh("bastion", `
    bb.holdRunes(["ward_stone"]);`, `
    g.screen.runeBar.open = 0;
    g.render();`);

/** The battle frame: a WEAVER run whose deck holds a WARD BELL ★3 and a MENDING LOOM ★3 on its first turret, a RIVETER ★3
 *  beside its belt and WARD STONE; the dusk against the classic foe, stepped until a green HEAL float is up (after the
 *  foe's first hits broke SHIELD and REGEN works). */
const battle = () => `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", "weaver", 12345);
    ${STEP(20)}
    const b = g.run.build;
    bb.holdRunes(["ward_stone"]);
    b.mods.push({ uid: 9801, def: "wardbell", turret: 0, stars: 3 }, { uid: 9802, def: "mendingloom", turret: 0, stars: 3 });
    const r = b.routes[0], k = r.cells[2], c = [k - 1, k + 1].find((q) => q % 10 !== 9 && q % 10 !== 0 && !b.items.some((p) => p.y * 10 + p.x === q) && !b.routes.some((w) => w.cells.includes(q)));
    if (c !== undefined) b.items.push({ uid: 9803, def: "riveter", x: c % 10, y: Math.floor(c / 10), rot: c < k ? 1 : 3, stars: 3 });
    else console.error("SUSB: no cell for the RIVETER");
    bb.open("battle");
    ${STEP(2)}
    const green = "#59DF67";
    let seen = 0;
    for (let i = 0; i < 60 * 40; i++) {
      g.step(1 / 60);
      const a = g.screen.arena;
      if (!a) continue;
      // a HEAL float up while 1 or 2 SHIELD are lit (the foe's hits broke WARD STONE's 3; the bell gives them back)
      const up = a.fx.pops.slice(0, a.fx.np).some((p) => p.color === green && p.t < 0.35), n = a.b.sides[0].shield ?? 0;
      if (up && a.b.t > 6 && n >= 1 && n < 3) { seen = 1; break; }
    }
    if (!seen) console.error("SUSB: no HEAL float in 40 s");
    g.render();
  })()`;

const BOTH = ["phone", "desk"];
export const SHOTS = BOTH.flatMap((v) => [
  ["susb-face-riveter1", v, "build", 0.8, rig("riveter", 1)],
  ["susb-face-wardbell1", v, "build", 0.8, cargo("wardbell", 1, "bastion")],
  ["susb-face-mendpress1", v, "build", 0.8, factory("mendpress", 1)],
  ["susb-face-mendingloom1", v, "build", 0.8, cargo("mendingloom", 1, "weaver")],
  ["susb-face-ironwall1", v, "build", 0.8, cargo("shieldwall", 1, "bastion")],
  ["susb-info-wardbell1", v, "build", 0.8, cargo("wardbell", 1, "bastion", TAP("kw:?"))],
  ["susb-info-mendpress2", v, "build", 0.8, factory("mendpress", 2, TAP("kw:?"))],
  ["susb-tap-shield", v, "build", 0.8, cargo("wardbell", 1, "bastion", TAP(":SHIELD"))],
  ["susb-tap-heal", v, "build", 0.8, rig("riveter", 2, TAP(":HEAL"))],
  ["susb-tap-regen", v, "build", 0.8, cargo("mendingloom", 2, "weaver", TAP(":REGEN"))],
  // DARK WIND in SEAM WELDER's kept text: a tap on the phone; the desk column wraps the two words apart, so its ⓘ view
  ["susb-info-seamwelder", v, "build", 0.8, cargo("seamwelder", 1, "foundry", TAP("kw:?"))],
  ...(v === "phone" ? [["susb-tap-darkwind", v, "build", 0.8, cargo("seamwelder", 1, "foundry", TAP(":DARK WIND"))]] : []),
  ["susb-rune-wardstone", v, "build", 0.8, wardStone()],
  ["susb-battle-sustain", v, "title", 0, battle()],
]);
