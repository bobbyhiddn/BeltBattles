// 0.6.2t (REQ-BFG-032, readable ability text): the BEFORE / AFTER shot list for the brief's states, desk and phone.
// A BB_SHOTS module for scripts/shot.mjs (it re-exports VIEWS and prep): run it on this tree's build, or on another
// build with BB_DIST (the BEFORE shots use the polish tip's dist/ with this same list, so both show the same scenes):
//   PLAYWRIGHT_BROWSERS_PATH=... BB_SHOTS=scripts/shots-text.mjs node scripts/shot.mjs <outDir> text-
// Every scene drives only the window.bb hooks the polish tip already has (bb.open, bb.openDawn, bb.game, the build
// screen's select/touched), and every build-screen scene steps until the caravan has parked before it renders (0b.3:
// the cards slide in from past the right edge for about 0.8 s; a capture mid-slide would show them off their slots).

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
  ]),
  // 0b.5: the 1★ LONG HAUL phone panel (the polish showed 2 of its 3 flavour lines there), and desk for reference
  ...BOTH.map((v) => ["text-longhaul1", v, "build", 0.8, longHaul1()]),
];
