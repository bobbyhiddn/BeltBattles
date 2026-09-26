// 0.6.2t (REQ-BFG-032, readable ability text): the BEFORE / AFTER shot list for the brief's states, desk and phone.
// A BB_SHOTS module for scripts/shot.mjs (it re-exports VIEWS and prep): run it on this tree's build, or on another
// build with BB_DIST (the BEFORE shots use the polish tip's dist/ with this same list, so both show the same scenes):
//   PLAYWRIGHT_BROWSERS_PATH=... BB_SHOTS=scripts/shots-text.mjs node scripts/shot.mjs <outDir> text-
// Every scene drives only the window.bb hooks the polish tip already has (bb.open, bb.openDawn, bb.game, the build
// screen's select/touched), and every build-screen scene steps until the caravan has parked before it renders (0b.3:
// the cards slide in from past the right edge for about 0.8 s; a capture mid-slide would show them off their slots).
// 0.6.2rel: + the turret slots (a 6-hardpoint turret, MANTLET ★2 on a turret, a dead end, an empty slot, a turret offer
// and one in cargo), FB-B's QUENCH TANK on a belt, and a joined SLAG belt next to a joined METRONOME one (0b.4, J15).

export { VIEWS, prep } from "./shots-list.mjs";

const J = JSON.stringify;
const STEP = (n) => `for (let i = 0; i < ${n}; i++) bb.game.step(1 / 60);`;
/** Step on until the build screen's caravan has parked (scripts/shots-list.mjs parked(), 0.6.2p item 4). */
const PARKED = "for (let i = 0; i < 120 && bb.game.screen.caravan && !bb.game.screen.caravan.ready; i++) bb.game.step(1 / 60);";

/** A fresh `hero` run in the build screen (seed 12345), parked; then `body` (g = bb.game, b = its build). */
function fresh(hero, body) {
  return `(() => {
    const g = bb.game;
    g.run = null;
    bb.open("build", ${J(hero)}, 12345);
    ${STEP(20)}
    ${PARKED}
    const b = g.run.build;
    ${body}
    g.screen.touched();
    ${STEP(12)}
    ${PARKED}
    g.render();
  })()`;
}

/** A factory `def` at ★`stars` at (6,6) on the Furnace's free heavy intake (column 5), selected. */
const factory = (def, stars) => fresh("furnace", `
    b.items.push({ uid: 9101, def: ${J(def)}, x: 6, y: 6${stars > 1 ? `, stars: ${stars}` : ""} });
    b.routes.push({ factory: 9101, cells: [56, 55, 45, 35, 25, 15, 5] });
    g.screen.select({ kind: "item", uid: 9101 });`);

/** Rig `def` at ★`stars` west of the Kiln belt's (4,3), facing it (rot 1), with `spare` ★1 copies in cargo, selected. */
const rig = (def, stars, spare = 0) => fresh("furnace", `
    b.items.push({ uid: 9301, def: ${J(def)}, x: 3, y: 3, rot: 1${stars > 1 ? `, stars: ${stars}` : ""} });
    for (let i = 0; i < ${spare}; i++) g.run.inventory.push({ uid: 9310 + i, def: ${J(def)} });
    g.screen.select({ kind: "item", uid: 9301 });`);

/** A ★`stars` `def` in the cargo of a `hero` run, selected. */
const cargo = (def, stars, hero) => fresh(hero, `
    g.run.inventory.push({ uid: 9401, def: ${J(def)}${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.select({ kind: "cargo", uid: 9401 });`);

/** Turret 1 of a Furnace with core `core` (★`cs`) and gear `gear` (★`gs`) fitted, selected. */
const turret = (core, cs, gear, gs) => fresh("furnace", `
    ${core ? `b.mods.push({ uid: 9001, def: ${J(core)}, turret: 0${cs > 1 ? `, stars: ${cs}` : ""} });` : ""}
    ${gear ? `b.mods.push({ uid: 9002, def: ${J(gear)}, turret: 0${gs > 1 ? `, stars: ${gs}` : ""} });` : ""}
    g.screen.select({ kind: "turret", index: 0 });`);

/** A dawn caravan forced to three wagons (2, 2 and 1 offers), `cargo` copies held, offer (wagon, slot) selected. */
function shop(wagons, pick, cargo = []) {
  return `(() => {
    const g = bb.game;
    bb.openDawn({ day: 5, gold: 30, cargo: ${J(cargo)} }, []);
    ${STEP(90)}
    ${PARKED}
    g.run.shop.wagons = ${J(wagons)};
    g.screen.select({ kind: "offer", wagon: ${pick[0]}, slot: ${pick[1]} });
    ${STEP(2)}
    g.render();
  })()`;
}
const W = (merchant, ...defs) => ({ merchant, offers: defs.map(([def, price]) => ({ def, price, sold: false })) });

/** 0b.4: a belt worked by a GREASE WORKS (uid 9121) and a BRAKE SHOE (uid 9122) at ★`stars`, the belt selected. A SLAG
 *  POT's belt (the Furnace's heavy intake, column 5), or a METRONOME's starting belt (speed-locked: every belt at 1x). */
const slagBelt = (stars) => fresh("furnace", `
    b.items.push({ uid: 9101, def: "slagpot", x: 6, y: 6 });
    b.routes.push({ factory: 9101, cells: [56, 55, 45, 35, 25, 15, 5] });
    b.items.push({ uid: 9121, def: "grease", x: 6, y: 4, rot: 3${stars > 1 ? `, stars: ${stars}` : ""} }, { uid: 9122, def: "brake", x: 6, y: 2, rot: 3${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.select({ kind: "route", index: b.routes.length - 1 });`);
const metronomeBelt = (stars) => fresh("metronome", `
    const r = b.routes[0], at = (i) => r.cells[i];
    const beside = (k) => [k - 1, k + 1].find((c) => c >= 0 && c % 10 !== 9 && c % 10 !== 0 && !b.items.some((p) => p.y * 10 + p.x === c) && !b.routes.some((q) => q.cells.includes(c)));
    const put = (uid, def, k) => { const c = beside(k); if (c === undefined) { console.error("METRONOME_BELT: no free cell beside " + k); return; }
      b.items.push({ uid, def, x: c % 10, y: Math.floor(c / 10), rot: c < k ? 1 : 3${stars > 1 ? `, stars: ${stars}` : ""} }); };
    put(9121, "grease", at(1)); put(9122, "brake", at(3));
    g.screen.select({ kind: "route", index: 0 });`);

/** 0b.5: the polish's asm-gantry scene (a WEAVER deck), its 1★ LONG HAUL (uid 9113) selected: the phone flavour case. */
const longHaul1 = () => fresh("weaver", `
    const K = (x, y) => y * 10 + x;
    b.items = [
      { uid: 1, def: "loom", x: 0, y: 8 }, { uid: 9101, def: "gantry", x: 4, y: 6, stars: 2 }, { uid: 9102, def: "assembly", x: 7, y: 6, stars: 3 },
      { uid: 9110, def: "coil", x: 3, y: 5, rot: 1 }, { uid: 9111, def: "whetstone", x: 3, y: 3, rot: 1 },
      { uid: 9112, def: "temper", x: 0, y: 4, rot: 1 }, { uid: 9113, def: "longhaul", x: 7, y: 3 },
    ];
    b.routes = [
      { factory: 9101, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 9101, cells: [K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
      { factory: 9102, cells: [K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] },
    ];
    g.screen.select({ kind: "item", uid: 9113 });`);

// ---- 0.6.2rel (REQ-BFG-032 x REQ-BFG-031 x REQ-BFG-027): the turret slots, FB-B's modules and the belt joins ----

/** A Furnace whose slot 1 holds turret `def` at ★`stars` with `gear` ([def, stars] in hardpoint order) and a bought
 *  `core` ([def, stars]) if given, the turret selected. */
const installed = (def, stars, gear, core) => fresh("furnace", `
    b.turrets = [{ slot: 0, def: ${J(def)}, uid: 9700${stars > 1 ? `, stars: ${stars}` : ""} }];
    ${J(gear)}.forEach(([d, s], i) => b.mods.push({ uid: 9710 + i, def: d, turret: 0, ...(s > 1 ? { stars: s } : {}) }));
    ${core ? `b.mods.push({ uid: 9730, def: ${J(core[0])}, turret: 0${core[1] > 1 ? `, stars: ${core[1]}` : ""} });` : ""}
    g.screen.touched();
    g.screen.select({ kind: "turret", index: 0 });`);

/** A STAMP PRESS belt up column 10 under the Furnace's slot 2, which holds an inner-intake HAIL GUN (or nothing): the
 *  belt is a dead end; slot 2 selected. */
const deadEnd = (def) => fresh("furnace", `
    const K = (x, y) => y * 10 + x;
    b.items.push({ uid: 9760, def: "press", x: 8, y: 6 });
    b.routes.push({ factory: 9760, cells: [5, 4, 3, 2, 1, 0].map((y) => K(9, y)) });
    b.turrets = [{ slot: 0, def: "scrapcannon", uid: 9790, free: true }${def ? `, { slot: 1, def: ${J(def)}, uid: 9761 }` : ""}];
    g.screen.touched();
    g.screen.select({ kind: "turret", index: 1 });`);

/** The joins series' J10 deck on hero `hero`: its factory (`main`) feeds belt 1 up column 5; a `joiner` factory at
 *  (0,6) feeds belt 2 (a TEMPER on it), which joins belt 1 at its tile 2; a WHETSTONE on the join tile, a GREASE WORKS
 *  and a BRAKE SHOE (★`stars`) past it; belt 2 (the joining belt) selected. */
const joined = (hero, main, joiner, stars) => fresh(hero, `
    const K = (x, y) => y * 10 + x, st = ${stars > 1 ? `{ stars: ${stars} }` : "{}"};
    b.items = [
      { uid: 1, def: ${J(main)}, x: 4, y: 6 }, { uid: 2, def: ${J(joiner)}, x: 0, y: 6 },
      { uid: 10, def: "temper", x: 1, y: 5, rot: 1 }, { uid: 11, def: "whetstone", x: 5, y: 4, rot: 3 },
      { uid: 12, def: "grease", x: 5, y: 3, rot: 3, ...st }, { uid: 13, def: "brake", x: 5, y: 2, rot: 3, ...st },
    ];
    b.routes = [
      { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 2, cells: [K(2, 6), K(2, 5), K(2, 4), K(3, 4)], join: K(4, 4) },
    ];
    g.screen.select({ kind: "route", index: 1 });`);

/** FB-B QUENCH TANK: a TEMPER (★1, facing east: rot 1) and a QUENCH TANK (★`stars`; a rare II rig points east and west
 *  unturned) on the Kiln belt, the belt selected. */
const quenchBelt = (stars) => fresh("furnace", `
    b.items.push({ uid: 9301, def: "temper", x: 3, y: 4, rot: 1 }, { uid: 9302, def: "quench", x: 3, y: 2${stars > 1 ? `, stars: ${stars}` : ""} });
    g.screen.select({ kind: "route", index: 0 });`);

const SIX = [["chamber", 2], ["calibrate", 3], ["hopper", 2], ["mantlet", 2], ["spotter", 1], ["ram", 1]];

const BOTH = ["desk", "phone"];
export const SHOTS = [
  ...BOTH.flatMap((v) => [
    // the operator's two cases
    ["text-mimic3", v, "build", 0.8, factory("mimic", 3)],
    ["text-scrapper3", v, "build", 0.8, factory("scrapper", 3)],
    // a rig at ★1, ★2 and ★3 (BRAKE SHOE: HOT SHOE at ★2, RED-HOT SHOE at ★3), no spare copy: the next-star line and
    // merge progress ("1 MORE COPY" from ★1, "2 MORE COPIES" from a lone ★2)
    ...[1, 2, 3].map((s) => [`text-rig${s}-brake`, v, "build", 0.8, rig("brake", s)]),
    // a turret core panel (SCATTER CHOKE ★2 with CALIBRATION gear) and a core in cargo (PRESSURE BREECH ★2, WEAVER k 0.55)
    ["text-turret-core", v, "build", 0.8, turret("scatter", 2, "calibrate", 1)],
    ["text-cargo-core", v, "build", 0.8, cargo("pressure", 2, "weaver")],
    // HOPPER: a shop card selected (its card, one-liner and inspect text) and fitted as a turret's gear
    ["text-shop-hopper", v, "title", 0, shop([W("ironmonger", ["mantlet", 4], ["beltcrate", 2]), W("tinker", ["ram", 5], ["grease", 3]), W("quartermaster", ["hopper", 4])], [2, 0])],
    ["text-turret-hopper", v, "build", 0.8, turret(null, 1, "hopper", 3)],
    // MERGES WITH: a TEMPER offer while a TEMPER is in cargo (the BUY+MERGE button, the MERGES WITH line)
    ["text-shop-merge", v, "title", 0, shop([W("alchemist", ["temper", 3], ["venom", 4]), W("gunsmith", ["scatter", 4], ["salvo", 7]), W("arcane", ["mimic", 11])], [0, 0], ["temper"])],
    // 0b.4: a SLAG belt's readout with a speed rig on it, next to the same rigs on a METRONOME belt (speed-locked)
    ["text-belt-slag", v, "build", 0.8, slagBelt(1)],
    ["text-belt-metronome", v, "build", 0.8, metronomeBelt(1)],
    ["text-belt-slag3", v, "build", 0.8, slagBelt(3)],
    ["text-belt-metronome3", v, "build", 0.8, metronomeBelt(3)],
    // 0.6.2rel: a turret with 6 hardpoints (a legendary THUNDERER ★3: six gear and a GATLING SPOOL core, so its clashes
    // show), MANTLET ★2 on a turret (FULL PLATE's shield), a dead end and an empty slot, a turret offer and one in cargo
    ["text-turret-six", v, "build", 0.8, installed("thunderer", 3, SIX, ["gatling", 2])],
    ["text-turret-mantlet2", v, "build", 0.8, turret(null, 1, "mantlet", 2)],
    ["text-turret-deadend", v, "build", 0.8, deadEnd("hailgun")],
    ["text-slot-empty", v, "build", 0.8, deadEnd(null)],
    ["text-shop-turret", v, "title", 0, shop([W("gunsmith", ["bombard", 8], ["hailgun", 10]), W("arcane", ["thunderer", 13]), W("tinker", ["ram", 5])], [0, 0])],
    ["text-cargo-turret", v, "build", 0.8, cargo("siegegun", 2, "furnace")],
    // FB-B QUENCH TANK ★2 behind a TEMPER: its timeline row names the Burn it spent
    ["text-belt-quench", v, "build", 0.8, quenchBelt(2)],
    // 0b.4 through a join: a SLAG POT's belt joined into the Kiln's, next to the same join on METRONOME (locked)
    ["text-join-slag", v, "build", 0.8, joined("furnace", "kiln", "slagpot", 3)],
    ["text-join-metronome", v, "build", 0.8, joined("metronome", "clockworks", "press", 3)],
  ]),
  // 0b.5: the 1★ LONG HAUL phone panel (the polish showed 2 of its 3 flavour lines there), and desk for reference
  ...BOTH.map((v) => ["text-longhaul1", v, "build", 0.8, longHaul1()]),
];
