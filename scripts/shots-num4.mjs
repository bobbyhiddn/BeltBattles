// NUM-4 (REQ-BFG-047, REQ-BFG-046, REQ-BFG-069): the shots of the formatters. A BB_SHOTS module for scripts/shot.mjs (its
// own VIEWS, SUS-B's: the op phone 402x690 @3 and the 1920x1080 desk). The same list runs on x1's build (BEFORE, from a
// throwaway worktree: BB_DIST) and on num4's (AFTER), so both show the same moments:
//   cd W/BeltBattles-t045 && PLAYWRIGHT_BROWSERS_PATH=W/ms-playwright BB_DIST=../wt-num4-x1/dist BB_SHOTS=scripts/shots-num4.mjs \
//     nice -n 19 node scripts/shot.mjs ../output-num4/shots/before num4-
//   ... (num4's dist) ... node scripts/shot.mjs ../output-num4/shots/after num4-
// The scene code is SUS-B's (scripts/shots-susb.mjs: fresh, cargo, factory, TAP) and NUM-1's / NUM-2's (their frozen prep,
// the panel-title check, the battle's fight start): a fresh run at seed 12345, day 1's dawn rune pick taken, the caravan
// parked, fixed steps, render. A scene that misses its subject says so with console.error("NUM4: ..."), which shot.mjs
// lists under ERRORS. The frames are deterministic (x1: two runs, 30 / 30 PNGs byte-identical); W/output-num4/shots/
// dump-num4.mjs dumps the same frames as text (bb.panel(), the battle's pops, the result) into a JSON beside the shots.
//   - The RATE faces: two turrets (DART GUN `dartgun`, HAIL GUN `hailgun`) and two factories (MEND PRESS `mendpress`, a
//     sustain piece: ITEMS resolves it whatever SUSTAIN_LIVE says, as in SUS-B's shots; FROSTBITE FOUNDRY `frostbite`),
//     each ★1 in a FURNACE run's cargo, selected: their stat rows (x1: `n.nn{SEC}` cadences; NUM-4: `{RATE}n`).
//   - The fold's pieces (NUM-3's STUN fold): FROSTBITE, DRAG CHAIN FOUNDRY `dragchain` and SABOT FOUNDRY `sabot` placed
//     ★1 at (6,6) with a belt up the Furnace's free column 5, selected; MANTLET `mantlet` (turret gear, kind "mod") ★1 in
//     cargo, selected, and with its ⓘ view open (the region "kw:?").
//   - WARD BELL's ⓘ view (SUS-B F1's words): a ★1 WARD BELL in a BASTION run's cargo, the ⓘ view open (SUS-B's scene).
//   - A BELTS upgrade panel: FURNACE's KILN selected with 30 gold (its FACTORY level line and UPGRADE line), and the
//     starting SCRAP CANNON selected with 30 gold (its SPEED level line), at TURRET SPEED level 1/4 and at 4/4 (on x1
//     the desk column drops the line below 4/4: see turret0).
//   - A battle frame with damage, heal and poison pops: a WEAVER deck with a MENDING LOOM ★3 on turret 1 (REGEN), a
//     RIVETER ★3 beside its belt tile 3 (HEAL) and a VENOM DRIP `venom` ★3 beside belt tile 2 (POISON), vs the classic
//     stand-in (bb.open("battle")), stepped from the fight's start until a damage pop, a green HEAL float and a lime
//     poison pop are all up and solid (arena.fx.pops).
//   - The results screen: the FURNACE's day-1 dusk vs the classic stand-in, stepped to its end (no SKIP), the result card
//     40 frames in (DUSK · DAY 1 · its time, FIRST SHOT).

export const VIEWS = {
  phone: { viewport: { width: 402, height: 690 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
};

// NUM-1's prep (W/output-num1/shots/shots-num1.mjs): the page's own frame loop frozen, so a shot is the frame the scene
// rendered; reset the run and the ghost pool, open, the dawn pick taken, fast-forward, render.
export function prep({ screen, secs }) {
  const g = window.bb.game;
  window.requestAnimationFrame = () => 0;
  g.last = Infinity;
  g.t = 0;
  g.run = null;
  window.bb.clearPool();
  window.bb.setReducedMotion(false);
  window.bb.open(screen, "furnace", 12345);
  const s = g.pending || g.screen, o = g.run && s && s.run === g.run && s.runePicker && s.runePicker.offer(s);
  if (o) { window.bb.holdRunes([o.ids[0]]); delete g.run.runeDay; }
  const frames = Math.round((0.6 + secs) * 60);
  for (let i = 0; i < frames; i++) g.step(1 / 60);
  g.render();
  return { W: g.W, H: g.H, scale: g.view.scale, screen: window.bb.screen() };
}

const J = JSON.stringify;
const STEP = (n) => `for (let i = 0; i < ${n}; i++) bb.game.step(1 / 60);`;
const PARKED = "for (let i = 0; i < 120 && bb.game.screen.caravan && !bb.game.screen.caravan.ready; i++) bb.game.step(1 / 60);";
/** The pending dawn rune pick, taken (scripts/shots-list.mjs TAKE_DAWN): the run holds the dawn's first offered rune. */
const TAKE_DAWN = `{ const g = bb.game, s = g.pending || g.screen, o = g.run && s && s.run === g.run && s.runePicker && s.runePicker.offer(s); if (o) { bb.holdRunes([o.ids[0]]); delete g.run.runeDay; } }`;
/** The details panel's title holds `name` (bb.panel, shoptap tooling), or an error. */
const CHECK = (name) => `{ const p = bb.panel(); if (!p || !p.title.includes(${J(name)})) console.error("NUM4: expected the " + ${J(name)} + " panel, got " + (p ? p.title : "no panel")); }`;
/** A press on the build screen's region whose id ends with `tail` (keywords.ts: "kw:?", the ⓘ button), then a render. */
const TAP = (tail) => `{ const r = bb.game.ui.regions.filter((q) => q.id.endsWith(${J(tail)})).pop();
    if (!r) console.error("NUM4: no region " + ${J(tail)}); else { r.onTap(); bb.game.step(1 / 60); bb.game.render(); } }`;

/** A fresh `hero` run in the build screen (seed 12345), its dawn rune taken, parked; then `body`; render; the `name`
 *  panel checked; then `after` (SUS-B's fresh). */
function fresh(hero, body, name, after = "") {
  return `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", ${J(hero)}, 12345);
    ${STEP(20)}
    ${TAKE_DAWN}
    ${STEP(20)}
    ${PARKED}
    const b = g.run.build;
    ${body}
    g.screen.touched();
    ${STEP(12)}
    ${PARKED}
    g.render();
    ${CHECK(name)}
    ${after}
  })()`;
}

/** A ★`stars` `def` in cargo on a `hero` run, selected. */
const cargo = (def, stars, hero, name, after = "") => fresh(hero, `
    g.run.inventory.push({ uid: 9401, def: ${J(def)}${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.select({ kind: "cargo", uid: 9401 });`, name, after);
/** A factory `def` at ★`stars` at (6,6) on the Furnace's free heavy intake (column 5) with its belt, selected. */
const factory = (def, stars, name, after = "") => fresh("furnace", `
    b.items.push({ uid: 9101, def: ${J(def)}, x: 6, y: 6${stars > 1 ? `, stars: ${stars}` : ""} });
    b.routes.push({ factory: 9101, cells: [56, 55, 45, 35, 25, 15, 5] });
    g.screen.select({ kind: "item", uid: 9101 });`, name, after);
/** BELTS: FURNACE's signature KILN selected with 30 gold (its FACTORY level line, its UPGRADE line and button). */
const kiln = () => fresh("furnace", `
    g.run.gold = 30;
    const p = b.items.find((q) => q.def === "kiln");
    if (!p) console.error("NUM4: no KILN on the FURNACE deck");
    else g.screen.select({ kind: "item", uid: p.uid });`, "KILN");
/** BELTS: the FURNACE's starting turret (slot 0, the SCRAP CANNON) selected with 30 gold, its TURRET SPEED at `level`
 *  (build.upgrades; 1 = a fresh run): its SPEED level line. On x1 the desk column drops that line (inspector.ts: rank 7,
 *  the first block to give way; bb.panel().dropped ["ability"] for all six heroes' starting turrets) at levels 1-3, while
 *  the UPGRADE button shows; at 4/4 (no button) it shows there too, so the list takes both. */
const turret0 = (level = 1) => fresh("furnace", `
    g.run.gold = 30;
    ${level > 1 ? `b.upgrades = { ...(b.upgrades || {}), turret: ${level} };` : ""}
    g.screen.select({ kind: "turret", index: 0 });`, "SCRAP CANNON");

// the pops' colours (render/palette.ts C; arenaReact.ts react): an impact's number is white, yellow (big), fire4 (heavy)
// or rune3 (plating took it); a heal's float HEAL_COLOUR (C.green); poison's C.lime
const DAMAGE = ["#E9F1E5", "#F6CF48", "#FFE38A", "#9DB0FF"], HEAL = "#59DF67", POISON = "#28FF64";

/** The battle frame: a WEAVER run (dawn pick taken) whose deck holds a MENDING LOOM ★3 on its first turret, a RIVETER ★3
 *  beside its belt's tile 3 and a VENOM DRIP ★3 beside tile 2 (SUS-B's battle-sustain deck without its shields, plus the
 *  poison); the dusk against the classic stand-in, stepped from the fight's start until a damage pop, a HEAL float and a
 *  poison pop are all up, each solid (past its white first frames, before it blinks out). Both rigs are rare, so II rigs
 *  (content.ts RARITY_SHAPE, SHAPE_ARROWS [1, 3]): unturned they point east and west, at the column belt beside them.
 *  (shots-susb.mjs turns its RIVETER with rot 1, which points a II rig north and south, off the belt: on x1 a VENOM DRIP
 *  placed that way put no poison on the foe in 30 s.) */
const battle = () => `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", "weaver", 12345);
    ${STEP(20)}
    ${TAKE_DAWN}
    const b = g.run.build;
    b.mods.push({ uid: 9802, def: "mendingloom", turret: 0, stars: 3 });
    const r = b.routes[0];
    if (r.cells[1] - r.cells[0] !== -10) console.error("NUM4: the WEAVER's first belt does not run north (" + r.cells.join(",") + ")");
    const free = (q) => q % 10 !== 9 && q % 10 !== 0 && !b.items.some((p) => p.y * 10 + p.x === q) && !b.routes.some((w) => w.cells.includes(q));
    const rig = (uid, def, i) => { const k = r.cells[i], c = [k - 1, k + 1].find(free);
      if (c === undefined) console.error("NUM4: no cell for " + def + " beside belt tile " + i);
      else b.items.push({ uid, def, x: c % 10, y: Math.floor(c / 10), stars: 3 }); };
    rig(9803, "riveter", 2);
    rig(9804, "venom", 1);
    bb.open("battle");
    for (let i = 0; i < 600 && !(g.screen.arena && g.screen.phase === "fight"); i++) g.step(1 / 60);
    const a = g.screen.arena;
    if (!a || g.screen.phase !== "fight") console.error("NUM4: the fight never started");
    else {
      for (const [uid, nm] of [[9803, "RIVETER"], [9804, "VENOM DRIP"]]) if (!a.b.sides[0].gates.some((v) => v.uid === uid)) console.error("NUM4: no " + nm + " in the battle");
      const kinds = { damage: (p) => ${J(DAMAGE)}.includes(p.color), heal: (p) => p.color === ${J(HEAL)}, poison: (p) => p.color === ${J(POISON)} };
      const ever = {};
      let all = false;
      for (let i = 0; i < 60 * 60 && g.screen.phase === "fight"; i++) {
        g.step(1 / 60);
        const up = a.fx.pops.slice(0, a.fx.np).filter((p) => p.t >= 0.05 && p.t / p.max < 0.7);
        const have = Object.keys(kinds).filter((k) => up.some(kinds[k]));
        for (const k of have) ever[k] = true;
        if (have.length === 3) { all = true; break; }
      }
      if (!all) console.error("NUM4: no frame with damage, heal and poison pops up together (never seen: " + (Object.keys(kinds).filter((k) => !ever[k]).join(", ") || "none") + ")");
    }
    g.render();
  })()`;

/** The results screen: the FURNACE's day-1 dusk vs the classic stand-in (dawn pick taken), stepped to its end without a
 *  SKIP, then 40 frames into the result card. */
const results = () => `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", "furnace", 12345);
    ${STEP(20)}
    ${TAKE_DAWN}
    bb.open("battle");
    for (let i = 0; i < 60 * 240 && !(g.screen.arena && g.screen.phase === "result"); i++) g.step(1 / 60);
    if (!g.screen.arena || g.screen.phase !== "result") console.error("NUM4: no result card after 240 s");
    ${STEP(40)}
    g.render();
  })()`;

const BOTH = ["phone", "desk"];
export const SHOTS = BOTH.flatMap((v) => [
  // the RATE faces: 2 turrets and 2 factories, ★1 in cargo
  ["num4-rate-dartgun", v, "build", 0.8, cargo("dartgun", 1, "furnace", "DART GUN")],
  ["num4-rate-hailgun", v, "build", 0.8, cargo("hailgun", 1, "furnace", "HAIL GUN")],
  ["num4-rate-mendpress", v, "build", 0.8, cargo("mendpress", 1, "furnace", "MEND PRESS")],
  ["num4-rate-frostbite", v, "build", 0.8, cargo("frostbite", 1, "furnace", "FROSTBITE")],
  // the fold's pieces: the three STUN factories placed with a belt, MANTLET in cargo and its ⓘ view
  ["num4-fold-frostbite", v, "build", 0.8, factory("frostbite", 1, "FROSTBITE")],
  ["num4-fold-dragchain", v, "build", 0.8, factory("dragchain", 1, "DRAG CHAIN")],
  ["num4-fold-sabot", v, "build", 0.8, factory("sabot", 1, "SABOT")],
  ["num4-fold-mantlet", v, "build", 0.8, cargo("mantlet", 1, "furnace", "MANTLET")],
  ["num4-info-mantlet", v, "build", 0.8, cargo("mantlet", 1, "furnace", "MANTLET", TAP("kw:?"))],
  // WARD BELL's ⓘ view (SUS-B's info-wardbell scene)
  ["num4-info-wardbell", v, "build", 0.8, cargo("wardbell", 1, "bastion", "WARD BELL", TAP("kw:?"))],
  // a BELTS upgrade panel: the hero factory and a starting turret
  ["num4-belts-kiln", v, "build", 0.8, kiln()],
  ["num4-belts-turret", v, "build", 0.8, turret0()],
  ["num4-belts-turret4", v, "build", 0.8, turret0(4)],
  // a battle frame with damage, heal and poison pops; the results screen
  ["num4-battle-pops", v, "title", 0, battle()],
  ["num4-results", v, "title", 0, results()],
]);
