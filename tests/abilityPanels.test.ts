import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newRun, type Run } from "../src/game/run";
import { HEROES, ITEMS, buyableModules, rigShape, type HeroId } from "../src/sim/content";
import { gearSlotsOf, key as K, rotField, setTurretList, turretSlots, walkRoute, type Placed } from "../src/sim/deck";
import { emptySlotPanel } from "../src/screens/build/turretPanel";
import { rotFacing } from "../src/sim/beltside";
import { makeTurret, type TurretState } from "../src/sim/battle";
import { ROUTINES } from "../src/sim/cores";
import { effectAt, fusible } from "../src/sim/stars";
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { buildLayout } from "../src/screens/build/layout";
import {
  ROLE, beltKind, cargoPanel, gatlingClash, itemPanel, lay, offerPanel, planPanel, rigPanel, routePanel, shieldLine, turretPanel, visibleLines,
  type Block, type Laid, type PanelText, type PLine,
} from "../src/screens/build/inspector";
import { socketLines } from "../src/screens/build/turretPanel";
import { abilityText, cardText, clashShortText, gatlingClashText, gist, n2, speedText } from "../src/ui/abilityText";
import { KEPT_FLAVOUR, flavourText } from "../src/screens/build/flavour";
import { PERK_COLOUR, lineText, stubLine, wrapText } from "../src/ui/richText";
import { faceLines } from "../src/ui/faces"; // U2a
import { speedPair } from "../src/ui/faces"; // U2c step 4: the installed turret's stat row
import { statRow } from "../src/ui/icons"; // U2c step 4
import { fmtCount, fmtSec } from "../src/ui/statFormat"; // U2c step 4
import { icons, stripIcons } from "../src/render/font"; // U2c step 4
import { resolveCore } from "../src/sim/cores"; // U2c step 4
import { glossaryText } from "../src/ui/glossary"; // U2c step 4: COMPOUND BREECH's hold, its tap text
import { MODULES, STARS, SUPPLIES, banned, numbers, repeats, sentencesOf, starsOf } from "./textRules";

// 0.6.2t (REQ-BFG-032): the panels. T6's phone fit for every buyable module at every star (rigs, factories, cores,
// gear and supplies; placed, in cargo, on offer and fitted), with KNOWN_PHONE_CUTS empty and the flavour whole or absent
// (0b.5); T4's layout (perk after its effect, aligned stat rows, flavour and hint dimmer); the carry-overs 0b.1 (LIMPET
// WORKS at 1 star), 0b.2 (no stub last line), 0b.3 (captures wait for the caravan) and 0b.4 (SLAG vs METRONOME).

/** The narrowest full portrait band, 161 x 69 (PORT_BAND tall), which is also the smallest panel a finger opens at that
 *  width (layout.ts panelArea grows a touch panel to at least PORT_BAND). bb-0.8.6 (PACKS Q5, oracle 35e8ebc1eda74818):
 *  0.8.5's 167 x 361 view plus the 33 px the pack row (BELT PACK, ARMOR PACK) takes under REROLL's row; 167 x 361 itself
 *  now gives a 161 x 36 band (the cost test below). The name keeps 0.6.2t's: since the zoom (REQ-BFG-040) the 390x844
 *  phone draws at 234 x 506 with phone=true (tests/zoom.test.ts), not at this view. */
const PHONE = buildLayout(167, 394, true, 5).info;
/** The 1920x1080 desk's details column (480 x 270 at scale 4). */
const DESK = buildLayout(480, 270, false, 5).info;

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
/** A Furnace with the Kiln's belt up column 4 and a STAMP PRESS belt up column 6 (tests/inspectorLines.test.ts P11); rig
 *  `def` (uid 10, ★stars) at (x, y) turned `rot`, and `spare` ★1 copies of it in cargo. */
function rigRun(def: string, stars: number, x: number, y: number, rot: number, spare: number): Run {
  const run = newRun("furnace", 5, "t6");
  run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def }));
  run.build = {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) }],
    routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
  };
  return run;
}
/** The layouts a rig's shape allows there: 1 hit, 2 hits (II, L, T, X), 3 hits (T, X), IDLE. */
function layouts(def: string): [string, number, number, number][] {
  const shape = rigShape(def)!;
  return [
    ["1hit", 3, 3, rotFacing(def, 1)],
    ...(shape === "L" ? [["2hit", 5, 2, 3]] : shape === "I" ? [] : [["2hit", 5, 3, 0]]),
    ...(shape === "T" || shape === "X" ? [["3hit", 5, 2, 0]] : []),
    ["idle", 0, 9, 0],
  ] as [string, number, number, number][];
}

/** 0.6.2rel (REQ-BFG-031): the gear a turret can carry, one of each (a turret never takes a second copy of a def). */
const GEAR = MODULES.filter((d) => d.kind === "mod").map((d) => d.id);
/** A FURNACE with turret `def` (★stars) in slot 0 and `gear` in its hardpoints, in order, and a bought core if given. */
function turretRun(def: string, stars: number, gear: [string, number][], core?: [string, number]): Run {
  const run = newRun("furnace", 5, "turret");
  setTurretList(run.build, [{ slot: 0, def, uid: 700, ...(stars > 1 ? { stars } : {}) }]);
  gear.forEach(([g, s], i) => run.build.mods.push({ uid: 710 + i, def: g, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]));
  if (core) run.build.mods.push({ uid: 730, def: core[0], turret: 0, ...(core[1] > 1 ? { stars: core[1] } : {}) } as Run["build"]["mods"][number]);
  return run;
}
/** n distinct pieces of gear at ★1, ★2, ★3 in turn. */
const gearOf = (n: number): [string, number][] => GEAR.slice(0, n).map((g, i) => [g, 1 + (i % 3)]);
/** 0.6.2rel: a FURNACE with a STAMP PRESS belt up column 10 under slot 1 and `def` in slot 1 (an inner-intake turret
 *  leaves it a dead end; no turret there, an empty slot does too). */
function deadEndRun(def?: string): Run {
  const run = newRun("furnace", 5, "deadend");
  run.build.items.push({ uid: 760, def: "press", x: 8, y: 6 });
  run.build.routes.push({ factory: 760, cells: [5, 4, 3, 2, 1, 0].map((y) => K(9, y)) });
  setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, ...(def ? [{ slot: 1, def, uid: 761 }] : [])]);
  return run;
}

/** 0.6.2rel (REQ-BFG-027, the joins series' J10 scene): the hero's factory feeds belt 1 up column 4; a `factory` at
 *  (0,6) feeds belt 2, which joins belt 1 at its tile 2 (cell (4,4)); `items` beside them. */
const JM = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const JR = [K(2, 6), K(2, 5), K(2, 4), K(3, 4)];
function joinRun(o: { hero?: HeroId; main?: string; factory?: string; items?: Placed[] } = {}): Run {
  const hero = o.hero ?? "furnace", run = newRun(hero, 5, "joins");
  run.build = {
    hero, mods: [], beltCap: 40, hullBonus: 0,
    items: [{ uid: 1, def: o.main ?? HEROES[hero].factory, x: 4, y: 6 }, { uid: 2, def: o.factory ?? "press", x: 0, y: 6 }, ...(o.items ?? [])],
    routes: [{ factory: 1, cells: [...JM] }, { factory: 2, cells: [...JR], join: K(4, 4) }],
  };
  run.inventory = [];
  return run;
}
/** A rig facing west (dir 3) or east (dir 1) at (x, y), at ★stars. */
const rigAt = (uid: number, def: string, x: number, y: number, dir: number, stars = 1): Placed =>
  ({ uid, def, x, y, ...rotField(def, rotFacing(def, dir)), ...(stars > 1 ? { stars } : {}) });
/** Speed rigs on belt 1 past the join tile (tiles 3 and 4), at ★stars. */
const pastJoin = (stars: number): Placed[] => [rigAt(21, "grease", 5, 3, 3, stars), rigAt(22, "brake", 5, 2, 3, stars)];
/** Hits before and after the join: every tile of belt 2 and of belt 1 from the join on. */
const busyJoin = (): Placed[] => [
  rigAt(31, "temper", 1, 5, 1), rigAt(32, "whetstone", 1, 4, 1), rigAt(33, "venom", 3, 5, 0), rigAt(34, "whetstone", 5, 4, 3),
  rigAt(35, "temper", 5, 3, 3), rigAt(36, "barbed", 5, 2, 3), rigAt(37, "whetstone", 5, 1, 3), rigAt(38, "temper", 5, 0, 3),
];

/** Every inspect panel the tests fit: each buyable module at every star, where the game can show it. */
function panels(): { id: string; kind: string; t: PanelText }[] {
  const out: { id: string; kind: string; t: PanelText }[] = [];
  for (const d of MODULES.filter((x) => x.kind === "gate")) {
    for (const s of STARS) for (const [lay, x, y, rot] of layouts(d.id)) for (const spare of [0, 1]) {
      out.push({ id: `rig ${d.id} ★${s} ${lay} spare${spare}`, kind: "rig", t: rigPanel(rigRun(d.id, s, x, y, rot, spare), 10)! });
    }
  }
  for (const d of MODULES) for (const s of STARS) for (const spare of [0, 1]) {
    for (const hero of (d.kind === "core" ? ["furnace", "weaver"] : ["furnace"]) as HeroId[]) {
      const run = newRun(hero, 5, "t6");
      run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }, ...Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: d.id }))];
      out.push({ id: `cargo ${d.id} ★${s} ${hero} spare${spare}`, kind: "cargo", t: cargoPanel(run, 900)! });
    }
    if (d.kind === "factory") {
      const run = newRun("furnace", 5, "t6");
      run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: d.id }));
      run.build.items.push({ uid: 901, def: d.id, x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
      run.build.routes.push({ factory: 901, cells: [56, 55, 45, 35, 25, 15, 5] });
      out.push({ id: `placed ${d.id} ★${s} spare${spare}`, kind: "placed", t: itemPanel(run, 901)! });
    }
    if ((d.kind === "core" || d.kind === "mod") && spare === 0) {
      const run = newRun("furnace", 5, "t6");
      run.build.mods.push({ uid: 902, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]);
      out.push({ id: `turret ${d.id} ★${s}`, kind: "turret", t: turretPanel(run, 0)! });
    }
  }
  // offers: none held, one held (MERGES WITH into ★2), a ★2 and a ★1 held (the chain into ★3); each supply once
  for (const d of [...MODULES, ...SUPPLIES]) for (const held of fusible(d.id) ? [[], [1], [2, 1]] : [[]]) {
    const run = newRun("furnace", 5, "t6");
    run.gold = 99;
    run.inventory = held.map((s, i) => ({ uid: 950 + i, def: d.id, ...(s > 1 ? { stars: s } : {}) }));
    run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id} held[${held}]`, kind: "offer", t: offerPanel(run, 0, 0)! });
  }
  // 0.6.2rel (REQ-BFG-031): every turret installed at every star with every hardpoint count (none to all its gear slots;
  // a legendary ★3 has 6), on its signature core and on a bought ★2 SCATTER CHOKE
  for (const d of MODULES.filter((x) => x.kind === "turret")) for (const s of STARS) {
    for (let n = 0; n <= gearSlotsOf(d.id, s); n++) for (const core of [undefined, ["scatter", 2] as [string, number]]) {
      out.push({ id: `installed ${d.id} ★${s} gear${n}${core ? " core" : ""}`, kind: "installed", t: turretPanel(turretRun(d.id, s, gearOf(n), core), 0)! });
    }
  }
  // FB-B on a turret: MANTLET ★2/★3's shield, HOPPER ★3's store, the GATLING clashes (every gear slot), and all at once
  const special: [string, string, number, [string, number][], [string, number]?][] = [
    ["mantlet2", "bombard", 1, [["mantlet", 2]]],
    ["mantlet3-hopper3", "bombard", 2, [["mantlet", 3], ["hopper", 3]]],
    ["hopper3-ram-gatling", "bombard", 2, [["hopper", 3], ["ram", 2]], ["gatling", 2]],
    ["thunderer3-six-gatling", "thunderer", 3, [["hopper", 2], ["ram", 1], ["mantlet", 3], ["calibrate", 3], ["chamber", 2], ["spotter", 1]], ["gatling", 3]],
    // 0.6.2rel2: HOPPER on a COMPOUND BREECH (its hold ignores the load time), a HOPPER ★3 alone, a GATLING clash that fits
    ["compound-hopper3", "bombard", 1, [["hopper", 3]], ["compound", 2]],
    ["compound-hopper1-ram", "siegegun", 2, [["hopper", 1], ["ram", 2]], ["compound", 1]],
    ["hopper3", "scrapcannon", 1, [["hopper", 3]]],
    ["gatling-hopper1", "scrapcannon", 1, [["hopper", 1]], ["gatling", 1]],
    // the release owner's answer d957272806131146: the six-gear THUNDERER of the rehearsal's text-turret-six-desk.png, and
    // a two-piece GATLING turret with HOPPER and FINISHER RAM
    ["thunderer-shot", "thunderer", 3, [["chamber", 2], ["calibrate", 3], ["hopper", 2], ["mantlet", 2], ["spotter", 1], ["ram", 1]], ["gatling", 2]],
    ["gatling-hopper-ram", "bombard", 1, [["hopper", 1], ["ram", 1]], ["gatling", 1]],
  ];
  for (const [id, def, s, gear, core] of special) out.push({ id: `installed ${id}`, kind: "installed", t: turretPanel(turretRun(def, s, gear, core), 0)! });
  // 0.6.2rel2: every turret's card as a hull's free starting copy (its note, then the kept flavour, then the hint)
  for (const d of MODULES.filter((x) => x.kind === "turret")) for (const s of STARS) {
    const run = newRun("furnace", 5, "t6");
    run.inventory = [{ uid: 900, def: d.id, free: true, ...(s > 1 ? { stars: s } : {}) }];
    out.push({ id: `cargo ${d.id} ★${s} free`, kind: "cargo", t: cargoPanel(run, 900)! });
  }
  // the dead end a swap to an inner-intake turret leaves, and the one an empty slot leaves; every hero's empty slot
  out.push({ id: "installed hailgun dead end", kind: "installed", t: turretPanel(deadEndRun("hailgun"), 1)! });
  out.push({ id: "empty slot dead end", kind: "empty", t: emptySlotPanel(deadEndRun().build, 1) });
  for (const hero of Object.keys(HEROES) as HeroId[]) {
    const b = newRun(hero, 5, "empty").build;
    turretSlots(b).forEach((sl, i) => { if (!sl.turret) out.push({ id: `empty slot ${hero} ${i}`, kind: "empty", t: emptySlotPanel(b, i) }); });
  }
  // 0.6.2rel (REQ-BFG-027): belt panels with joins: the joining belt and the main belt; a SLAG joiner and a slag-fed main
  // belt (0b.4); METRONOME's locked belts; a joined belt whose rows give way on the phone
  const joins: [string, Run][] = [
    ...STARS.map((s): [string, Run] => [`joins ★${s}`, joinRun({ items: pastJoin(s) })]),
    ...STARS.map((s): [string, Run] => [`slag joiner ★${s}`, joinRun({ factory: "slagpot", items: pastJoin(s) })]),
    ...STARS.map((s): [string, Run] => [`slag main ★${s}`, joinRun({ main: "slagpot", items: pastJoin(s) })]),
    ...STARS.map((s): [string, Run] => [`metronome ★${s}`, joinRun({ hero: "metronome", items: pastJoin(s) })]),
    ["busy", joinRun({ items: busyJoin() })],
    ["bare", joinRun({ items: [rigAt(31, "temper", 1, 5, 1)] })],
  ];
  for (const [id, run] of joins) for (const i of [0, 1]) out.push({ id: `belt ${id} route${i}`, kind: "belt", t: routePanel(run, i)! });
  return out;
}
const PANELS = panels();

/** 0.6.2p (item 3) kept this list for phone cases that had to stay cut; T6 keeps it empty. */
const KNOWN_PHONE_CUTS = new Map<string, string>();

/** How a panel shows on a band: its plan, whether every kept block is drawn whole, and the flavour's state (0b.5). */
function fit(t: PanelText, area: typeof PHONE) {
  const plan = planPanel(t, area);
  const drawn = new Set<PLine | "rule">(visibleLines(plan).map((v) => v.line));
  const whole = (l: Laid) => l.lines.every((x) => drawn.has(x));
  const kept = plan.body.shown.filter((l) => l.b.keep);
  const flav = plan.body.shown.filter((l) => l.b.role === "flavour");
  const roleWhole = (role: Block["role"]) => plan.body.shown.filter((l) => l.b.role === role).every(whole);
  return {
    plan, keptWhole: kept.every(whole), roleWhole,
    flavour: flav.length === 0 ? "absent" : flav.every(whole) ? "whole" : "cut",
    hitsUp: !!plan.body.sub, // a rig's hits (or IDLE warning) moved up into the header's sub line
  };
}
describe("0.6.2t T6: every inspect panel fits the phone band, the flavour whole or absent (0b.5)", () => {
  it("the bands: the 390x844 phone's 161 x 69, the 360x640 strip's header only, the desk's column", () => {
    // the narrowest full portrait band (PHONE: 167 x 394, the smallest panel a finger opens at that width), with the pack
    // row: both slots under REROLL's row (PACKS Q5)
    expect([PHONE.w, PHONE.h]).toEqual([161, 69]);
    const L = buildLayout(167, 394, true, 5);
    expect(L.packs[0].y, "BELT PACK under REROLL's row").toBeGreaterThan(L.reroll.y + L.reroll.h);
    expect(L.packs[1].y, "ARMOR PACK beside it").toBe(L.packs[0].y);
    // the small viewport: a header-only strip (0.8.5's 174 x 28: 180 x 320 plus the pack row's 33 px; PACKS Q5)
    expect(buildLayout(180, 353, true, 5).info.h).toBeLessThan(30);
    expect([DESK.w, DESK.h > 150]).toEqual([126, true]);
  });

  // PACKS Q5 (oracle 35e8ebc1eda74818): the pack row's cost. 0.8.5's 167 x 361 view gives the 161 x 36 band now (the row
  // takes 33 px under REROLL's row). Every panel of the sweep, planned there, draws only inside the band and never over
  // the hull, at drawDetails' places: the panel, its icon box (x+4, y+4, 16 x 16), the title (y+3..y+12 with its
  // outline), the sub line(s) or header-only lines (from y+13, 6 px apart), the families (y+5 or y+6 by the title, else
  // y+19 / y+20), the buttons and every drawn body line (at x+5, as wide as its text)
  it("PACKS Q5: at 167 x 361 (the 161 x 36 band) every panel draws only inside the band, never over the hull", () => {
    const L = buildLayout(167, 361, true, 5), band = L.info, bottom = band.y + band.h, right = band.x + band.w;
    expect([band.w, band.h]).toEqual([161, 36]);
    expect(L.packs[0].y).toBeGreaterThan(L.reroll.y + L.reroll.h);
    expect(bottom).toBeLessThanOrEqual(L.pad.y);
    expect(L.pad.y).toBeLessThanOrEqual(L.hull.y);
    const spansW = (spans: { t: string }[], font: PLine["font"]) => textWidth(spans.map((s) => s.t).join(""), font);
    const lineW = (l: PLine) => l.cells
      ? Math.max(...l.cells.map((c) => Math.max(c.at + textWidth(c.label, l.font), c.vx + spansW(c.spans, l.font))))
      : Math.max(l.label ? textWidth(l.label, l.font) : 0, (l.indent ?? 0) + spansW(l.spans, l.font));
    // the record (logged, not pinned): how many fit, keep their kept text whole, show the header only, or draw a block in
    // part (some of its lines, not all)
    const tally = { cases: 0, fits: 0, keptWhole: 0, headerOnly: 0, partBlock: 0, buttons: 0, lines: 0 };
    for (const { id, t } of PANELS) {
      const plan = planPanel(t, band), r = plan.r, out: string[] = [];
      const inside = (what: string, x0: number, y0: number, x1: number, y1: number) => {
        if (x0 < band.x || y0 < band.y || x1 > right || y1 > bottom) out.push(`${what} [${x0},${y0}..${x1},${y1}] outside the band`);
        if (y1 > L.pad.y || y1 > L.hull.y) out.push(`${what} over the hull`);
      };
      tally.cases++;
      inside("panel", r.x, r.y, r.x + r.w, r.y + r.h);
      inside("icon", r.x + 4, r.y + 4, r.x + 20, r.y + 20);
      inside("title", r.x + 22, r.y + 3, r.x + 23 + plan.subMax + 1, r.y + 12);
      const heads = plan.headerOnly ? plan.headerOnly.lines.length : plan.body.sub ? 1 : plan.subs.length;
      inside("header", r.x + 23, r.y + 13, r.x + r.w - 4, r.y + 13 + (heads - 1) * 6 + 5);
      if (plan.famHead) inside("families", r.x + 23, r.y + 5, r.x + r.w - 4, r.y + (plan.famHead.at === "title" ? 6 : 19) + 5);
      for (const q of plan.rects ?? []) { inside("button", q.x, q.y, q.x + q.w, q.y + q.h); tally.buttons++; }
      for (const v of visibleLines(plan)) {
        tally.lines++;
        if (v.line === "rule") inside("rule", r.x + 5, v.y + 1, r.x + r.w - 5, v.y + 2);
        else inside(`line "${lineText(v.line.spans)}"`, r.x + 5, v.y, r.x + 5 + lineW(v.line), v.y + (v.line.font === "5" ? 7 : 5));
      }
      expect(out, id).toEqual([]);
      if (plan.body.fits) tally.fits++;
      if (fit(t, band).keptWhole) tally.keptWhole++;
      if (plan.headerOnly) tally.headerOnly++;
      const drawn = new Set(visibleLines(plan).map((v) => v.line));
      if (plan.body.shown.some((l) => { const n = l.lines.filter((x) => drawn.has(x)).length; return n > 0 && n < l.lines.length; })) tally.partBlock++;
    }
    expect(tally.cases).toBe(PANELS.length);
    console.log(`PACKS Q5 161 x 36 band: ${JSON.stringify(tally)}`);
  });

  it("phone: the opening sentence, the hits (or IDLE), the perk, the next star and merge progress show whole", () => {
    const counts = { cases: 0, rig: 0, withNext: 0, hitsUp: 0, tight: 0, flavourWhole: 0, flavourAbsent: 0, cut: 0 };
    for (const { id, kind, t } of PANELS) {
      const r = fit(t, PHONE);
      counts.cases++;
      if (kind === "rig") counts.rig++;
      if (t.body.some((b) => b.role === "next")) counts.withNext++;
      if (r.hitsUp) counts.hitsUp++;
      if (r.plan.body.tight) counts.tight++;
      if (!r.plan.body.fits || !r.keptWhole) counts.cut++;
      if (KNOWN_PHONE_CUTS.has(id)) continue;
      expect(r.plan.body.fits, `${id} (variant ${r.plan.body.variant})`).toBe(true);
      expect(r.keptWhole, `${id} (variant ${r.plan.body.variant})`).toBe(true);
      for (const role of ["ability", "next", "merge", "merges", "hits", "warn"] as const) expect(r.roleWhole(role), `${id}: ${role}`).toBe(true);
      // what must show: the opening sentence and every perk-carrying block, the next-star line and merge progress
      const shownBlocks = r.plan.body.shown.map((l) => l.b);
      // (0.6.2rel: a belt panel opens with its tiles and hits, the joins series' head)
      expect(shownBlocks.some((b) => b.role === "ability" || b.role === "row" || (kind === "belt" && b.role === "hits")), `${id}: opening`).toBe(true);
      if (t.body.some((b) => b.role === "next")) {
        expect(shownBlocks.some((b) => b.role === "next"), `${id}: next star`).toBe(true);
      }
      // U2e step 1 (REQ-BFG-070): merge progress is gone (it showed whole after the next star): no panel draws it
      expect(t.body.some((b) => b.role === "merge") || shownBlocks.some((b) => b.role === "merge"), `${id}: merge progress`).toBe(false);
      if (kind === "rig") expect(r.hitsUp || shownBlocks.some((b) => b.role === "hits" || b.role === "warn"), `${id}: hits`).toBe(true);
      // 0b.5: the flavour shows whole or not at all
      expect(r.flavour, `${id}: flavour`).not.toBe("cut");
      if (r.flavour === "whole") counts.flavourWhole++;
      else counts.flavourAbsent++;
    }
    expect(KNOWN_PHONE_CUTS.size).toBe(0);
    expect(counts.cut).toBe(0);
    // the case counts (the REPORT quotes them): 396 rig cases as 0.6.2p's, then every other buyable module and supply;
    // 0.8.0 I1 M2: 534 with wave 3's 8 rigs (was 396)
    expect([counts.rig, counts.cases]).toEqual([534, PANELS.length]);
    expect(counts.flavourWhole + counts.flavourAbsent).toBe(counts.cases);
    console.log(`T6 phone fit: ${JSON.stringify(counts)}`);
  });

  it("phone: a moved-up hit line fits the header, and the tight pitch is only a fallback", () => {
    for (const { id, t } of PANELS) {
      const r = fit(t, PHONE);
      if (r.plan.body.sub) expect(textWidth(r.plan.body.sub, "3"), id).toBeLessThanOrEqual(r.plan.subMax);
      if (r.plan.body.tight) {
        // the full text at the normal pitch didn't fit: planBody never tightens a panel that fits as it is
        const normal = planPanel({ ...t, variants: [] }, PHONE);
        expect(normal.body.fits, id).toBe(false);
      }
    }
  });

  it("desk: every panel fits the column whole in the 5x7 face; the flavour whole or absent", () => {
    const counts = { cases: 0, big: 0, flavourWhole: 0, flavourAbsent: 0 };
    const small: string[] = [];
    for (const { id, t } of PANELS) {
      const r = fit(t, DESK);
      expect([r.plan.body.fits, r.keptWhole], id).toEqual([true, true]);
      expect(r.flavour, id).not.toBe("cut");
      counts.cases++;
      if (r.plan.body.font === "5") counts.big++;
      else small.push(id);
      if (r.flavour === "whole") counts.flavourWhole++;
      else counts.flavourAbsent++;
    }
    expect(small, small.join("; ")).toEqual([]); // the desk column's ability text never drops to the 3x5 face
    console.log(`desk fit: ${JSON.stringify(counts)}`);
  });

  // bb-0.8.6 (PACKS run 2, the lead's ruling R2, Q5's rule (oracle 35e8ebc1eda74818)): 0.8.5's 174 x 28 strip is now the
  // 180 x 353 view (0.8.5's 180 x 320 plus the pack row's 33 px), so the fixture is 180 x 353 and tests that strip again;
  // 180 x 320 itself gives a 174 x 0 band. The name keeps 0.6.2t's: since the 0.8.4 zoom a real 360x640 phone draws with
  // phone=true; this fixture is a narrow non-phone portrait window
  it("the 360x640 strip: an offer's header shows its one-line effect, on up to two lines", () => {
    const strip = buildLayout(180, 353, true, 5).info;
    for (const { id, t } of PANELS.filter((p) => p.kind === "offer")) {
      const plan = planPanel(t, strip);
      expect(plan.headerOnly, id).not.toBeNull();
      expect(plan.headerOnly!.lines.join(" "), id).toBe(t.headerOnly!.texts[0]);
      expect(plan.headerOnly!.lines.length, id).toBeLessThanOrEqual(2);
    }
  });
});

describe("0.6.2t T4: the panels' layout", () => {
  it("a perk's name comes after the sentence it names, in the perk colour, never first; nothing follows it on its line", () => {
    for (const { id, t } of PANELS) for (const l of lay(t.body, 116, "5")) {
      if (!l.b.perk) continue;
      const last = l.lines.at(-1)!.spans.at(-1)!;
      expect([last.t, last.c], id).toEqual([l.b.perk, PERK_COLOUR]);
      expect(l.lines[0].spans[0].t.startsWith("★"), `${id}: ${l.b.text}`).toBe(false);
    }
    // 0.6.2t2 (F3): a perk's name ends its line. Every drawn line (desk and phone, whichever variant the plan takes) and
    // every line of every variant laid out at the desk column's and the phone band's widths: no text after the name
    let perks = 0;
    /** The text after a perk's name on its line (null: no perk name there). */
    const afterPerk = (line: PLine): string | null => {
      const i = line.block.perk ? line.spans.findIndex((s) => s.t === line.block.perk && s.c === PERK_COLOUR) : -1;
      return i < 0 ? null : line.spans.slice(i + 1).map((s) => s.t).join("").trim();
    };
    const check = (id: string, line: PLine) => {
      const after = afterPerk(line);
      if (after === null) return;
      perks++;
      expect(after, `${id}: text after ${line.block.perk}`).toBe("");
    };
    // the check's own test: a line where text runs on after the name fails it
    const perk = "★3 TWIN SIGNET", block: Block = { role: "ability", text: "FEEDS 2 BELTS.", perk };
    expect(afterPerk({ spans: [{ t: "FEEDS 2 BELTS. ", c: C.bone }, { t: perk, c: PERK_COLOUR }, { t: " FOR FURNACE,", c: C.bone }], font: "5", block, pitch: 9 }))
      .toBe("FOR FURNACE,");
    for (const { id, t } of PANELS) {
      for (const area of [DESK, PHONE]) for (const v of visibleLines(planPanel(t, area))) if (v.line !== "rule") check(id, v.line);
      for (const [w, font] of [[102, "5"], [116, "5"], [151, "3"]] as const) for (const v of [{ body: t.body, tight: false }, ...(t.variants ?? [])]) {
        for (const l of lay(v.body, w, font, !!v.tight)) for (const line of l.lines) check(`${id} at ${w} (${font})`, line);
      }
    }
    expect(perks).toBeGreaterThan(1000);
    // 0.6.2rel2: that covers FB-B's perks (MANTLET ★2 FULL PLATE and ★3 BULWARK SKIRT, HOPPER ★3 BOTTOMLESS) and the perks a
    // turret's own panels draw (its core's and gear's), on desk and phone. A turret itself has no star perk (content.ts)
    const drawn = new Set<string>();
    for (const { kind, t } of PANELS) {
      for (const [area, band] of [[DESK, "desk"], [PHONE, "phone"]] as const) for (const v of visibleLines(planPanel(t, area))) {
        if (v.line !== "rule" && afterPerk(v.line) !== null) drawn.add(`${band} ${v.line.block.perk}`).add(`${band} drawn on ${kind}`);
      }
      // every form laid out at the phone band's width (a turret's plan there takes a compact form: its gear rows carry
      // the short effect, never a perk, so the forms with the sentences are checked this way)
      for (const v of [{ body: t.body, tight: false }, ...(t.variants ?? [])]) for (const l of lay(v.body, 151, "3", !!v.tight)) {
        if (l.lines.some((line) => afterPerk(line) !== null)) drawn.add(`phone laid on ${kind}`);
      }
    }
    for (const band of ["desk", "phone"]) {
      for (const perk of ["★2 FULL PLATE", "★3 BULWARK SKIRT", "★3 BOTTOMLESS"]) expect(drawn.has(`${band} ${perk}`), `${band} ${perk}`).toBe(true);
    }
    // an installed turret's panel (the hero's turret with one module, or a slot's turret with its gear)
    expect(drawn.has("desk drawn on turret") || drawn.has("desk drawn on installed"), "desk: a perk on a turret's panel").toBe(true);
    expect(drawn.has("phone laid on turret") || drawn.has("phone laid on installed"), "phone: a perk on a turret's panel").toBe(true);
    expect(MODULES.filter((d) => d.kind === "turret").flatMap((d) => STARS.map((s) => abilityText(d.id, s).perk)).filter(Boolean)).toEqual([]);
    // MIMIC FORGE ★3 (the brief's case): the hero's example sits before ★3 TWIN SIGNET, so the name ends the text and
    // nothing reads on from it ("TWIN SIGNET FOR FURNACE" at 881b38f)
    for (const hero of ["furnace", "weaver"] as HeroId[]) {
      const at = abilityText("mimic", 3, { hero });
      expect([at.sentences.length, at.perk?.after], hero).toEqual([2, 1]);
      expect(at.sentences[1], hero).toMatch(new RegExp(`^FOR ${hero.toUpperCase()}, THAT IS `));
    }
    const run = newRun("furnace", 5, "f3");
    run.inventory = [{ uid: 900, def: "mimic", stars: 3 }];
    const text = visibleLines(planPanel(cargoPanel(run, 900)!, DESK)).flatMap((v) => (v.line === "rule" ? ["--"] : [lineText(v.line.spans)]));
    // U2a (REQ-BFG-046): the panel draws MIMIC FORGE's face (src/ui/faces.ts): its stat row for FURNACE, then its rule,
    // which ★3 TWIN SIGNET ends; then the rule before the hint: no text reads on from the name
    expect(text[0]).toBe(faceLines("mimic", 3, { hero: "furnace" })!.stats);
    const p = text.findIndex((l) => l.endsWith("★3 TWIN SIGNET"));
    expect([p > 0, text[p + 1]]).toEqual([true, "--"]);
  });

  it("the flavour is dimmer than the ability text and the hint dimmer again, in the small face after a rule", () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    };
    expect(lum(ROLE.ability.colour)).toBeGreaterThan(lum(ROLE.flavour.colour));
    expect(lum(ROLE.flavour.colour)).toBeGreaterThan(lum(ROLE.hint.colour));
    expect([ROLE.flavour.small, ROLE.hint.small, ROLE.ability.small]).toEqual([true, true, false]);
    const cargo = PANELS.find((p) => p.id === "cargo whetstone ★1 furnace spare0")!; // 0.6.2t2: WHETSTONE keeps its tip
    const plan = planPanel(cargo.t, DESK);
    const at = plan.body.lines.indexOf("rule");
    expect(at).toBeGreaterThan(0);
    expect((plan.body.lines[at + 1] as PLine).block.role).toBe("flavour");
    expect((plan.body.lines.at(-1) as PLine).block.role).toBe("hint");
  });

  it("stat rows align: a panel's row values share one column (a turret's CORE and GEAR rows theirs), its grid values theirs", () => {
    const run = newRun("furnace", 5, "rows");
    run.build.mods.push({ uid: 5, def: "scatter", turret: 0, stars: 2 } as Run["build"]["mods"][number]);
    const laid = lay(turretPanel(run, 0)!.body, 116, "5").filter((l) => l.b.role === "row");
    const indents = (labels: string[]) => new Set(laid.filter((l) => labels.includes(l.b.label!)).flatMap((l) => l.lines.map((x) => x.indent)));
    // U2c step 4 (REQ-BFG-046): the turret's numbers are its stat row (no labels: FIRES, CHAMBER and LOAD TIME went), so the
    // labelled rows are the CORE and GEAR rows, their names after CORE (was: the stat rows after LOAD TIME, the names apart)
    expect(laid.map((l) => l.b.label)).toEqual(["CORE", "GEAR"]);
    expect(turretPanel(run, 0)!.body[0].text).toBe(turretFace(run).stats);
    expect([...indents(["CORE", "GEAR"])]).toEqual([textWidth("CORE", "5") + 5]);
    const sr = slagRun(1);
    const grid = lay(routePanel(sr, sr.build.routes.length - 1)!.body, 116, "5").filter((l) => l.b.role === "grid").flatMap((l) => l.lines);
    expect(grid.length).toBeGreaterThan(0);
    expect(new Set(grid.flatMap((l) => l.cells!.filter((c) => c.at === 0).map((c) => c.vx))).size).toBe(1);
  });
});

/** 0b.4: a SLAG POT (uid 9101) on the Furnace's heavy intake, a GREASE WORKS and a BRAKE SHOE (or `speed`) at ★`stars`
 *  working its belt (route 1). */
function slagRun(stars: number, speed = "grease"): Run {
  const run = newRun("furnace", 5, "slag");
  const b = run.build;
  b.items.push({ uid: 9101, def: "slagpot", x: 6, y: 6 });
  b.routes.push({ factory: 9101, cells: [56, 55, 45, 35, 25, 15, 5] });
  b.items.push({ uid: 9121, def: speed, x: 6, y: 4, ...rotField(speed, rotFacing(speed, 3)), ...(stars > 1 ? { stars } : {}) });
  b.items.push({ uid: 9122, def: "brake", x: 6, y: 2, ...rotField("brake", rotFacing("brake", 3)), ...(stars > 1 ? { stars } : {}) });
  return run;
}
/** 0b.4: METRONOME's starting belt (speed-locked), with a GREASE WORKS and a BRAKE SHOE at ★`stars` beside it. */
function metronomeRun(stars: number): Run {
  const run = newRun("metronome", 5, "lock");
  const b = run.build, r = b.routes[0];
  const free = (c: number) => c >= 0 && c % 10 !== 9 && c % 10 !== 0 && !b.items.some((p) => p.y * 10 + p.x === c) && !b.routes.some((q) => q.cells.includes(c));
  const put = (uid: number, def: string, k: number) => {
    const c = [k - 1, k + 1].find(free)!;
    b.items.push({ uid, def, x: c % 10, y: Math.floor(c / 10), ...rotField(def, rotFacing(def, c < k ? 1 : 3)), ...(stars > 1 ? { stars } : {}) });
  };
  put(9121, "grease", r.cells[1]);
  put(9122, "brake", r.cells[3]);
  return run;
}
const readout = (run: Run, i: number) => routePanel(run, i)!.body.map((b) => (b.cells ? b.cells.map(([l, v]) => `${l} ${v}`).join(", ") : b.text));

describe("0b.4: a SLAG belt's readout says what the sim does there; METRONOME's locked belts keep LOCKED and the bonus", () => {
  it("SLAG: a speed-only rig reads NO EFFECT ON SLAG, a heat shoe its real damage; never LOCKED or a locked bonus", () => {
    for (const s of STARS) {
      const run = slagRun(s), i = run.build.routes.length - 1, w = walkRoute(run.build, i);
      expect([beltKind(w), w.locked, w.fixed], `★${s}`).toEqual(["slag", false, 0.75]);
      const text = readout(run, i), all = text.join(" | ");
      expect(all, `★${s}`).not.toMatch(/LOCKED/);
      expect(text, `★${s}`).toContain("GREASE WORKS: NO EFFECT ON SLAG");
      const flat = effectAt("brake", s).gate!.flat ?? 0;
      expect(text, `★${s}`).toContain(flat ? `BRAKE SHOE +${flat} DAMAGE, NO SPEED CHANGE ON SLAG` : "BRAKE SHOE: NO EFFECT ON SLAG");
      // the gun end: slag's 7 plus the shoe's heat, never a locked bonus; the belt at slag's own 75%
      expect(text, `★${s}`).toContain(`DMG ${(7 + flat).toFixed(1)}, BURN 0`);
      expect(all, `★${s}`).toContain("SPD 75% (SLAG)");
    }
  });

  it("SLAG: SURGE VALVE's pulse damage isn't counted there (the sim never pays it to fixed-speed ammo)", () => {
    for (const s of STARS) {
      const run = slagRun(s, "surge"), i = run.build.routes.length - 1;
      const text = readout(run, i), flat = effectAt("brake", s).gate!.flat ?? 0;
      expect(text, `★${s}`).toContain("SURGE VALVE: NO EFFECT ON SLAG");
      expect(text, `★${s}`).toContain(`DMG ${(7 + flat).toFixed(1)}, BURN 0`);
    }
    // the sim's own rule (battle.ts transport): no pulse on fixed-speed ammo or a speed-locked side
    expect(readFileSync(new URL("../src/sim/battle.ts", import.meta.url), "utf8")).toContain("const surge = fixed === undefined && !s.race?.speedLock ? this.pulseAt(r, a.s) : undefined;");
  });

  it("METRONOME: the same rigs keep (LOCKED) and pay the locked bonus (a heat shoe its heat too)", () => {
    for (const s of STARS) {
      const run = metronomeRun(s), w = walkRoute(run.build, 0);
      expect([beltKind(w), w.locked], `★${s}`).toEqual(["locked", true]);
      const text = readout(run, 0);
      const g = effectAt("grease", s).gate!, b = effectAt("brake", s).gate!;
      expect(text, `★${s}`).toContain(`GREASE WORKS +${g.lockedFlat} DAMAGE (LOCKED)`);
      expect(text, `★${s}`).toContain(`BRAKE SHOE +${(b.flat ?? 0) + b.lockedFlat!} DAMAGE (LOCKED)`);
      expect(text.join(" | "), `★${s}`).toContain("SPD 100% (LOCKED)");
    }
  });
});

describe("0b.4 through a join (0.6.2rel, J15: the speed belongs to the payload)", () => {
  it("a SLAG joiner's rows past the join read NO EFFECT ON SLAG, never LOCKED or a locked bonus; its gun end is slag's", () => {
    for (const s of STARS) {
      const run = joinRun({ factory: "slagpot", items: pastJoin(s) }), w = walkRoute(run.build, 1);
      expect([beltKind(w), w.locked, w.fixed, w.joins?.length], `★${s}`).toEqual(["slag", false, 0.75, 1]);
      const text = readout(run, 1), all = text.join(" | ");
      expect(text, `★${s}`).toContain("JOINS BELT 1 AT TILE 2.");
      expect(all, `★${s}`).not.toMatch(/LOCKED/);
      expect(text, `★${s}`).toContain("GREASE WORKS: NO EFFECT ON SLAG");
      const flat = effectAt("brake", s).gate!.flat ?? 0;
      expect(text, `★${s}`).toContain(flat ? `BRAKE SHOE +${flat} DAMAGE, NO SPEED CHANGE ON SLAG` : "BRAKE SHOE: NO EFFECT ON SLAG");
      expect(all, `★${s}`).toContain("SPD 75% (SLAG)");
    }
  });

  it("a normal payload joining a slag-fed belt rides that belt's speed state: its speed rigs change its speed", () => {
    for (const s of STARS) {
      const run = joinRun({ main: "slagpot", items: pastJoin(s) });
      const joiner = walkRoute(run.build, 1), main = walkRoute(run.build, 0);
      expect([beltKind(joiner), beltKind(main)], `★${s}`).toEqual(["free", "slag"]);
      const text = readout(run, 1).join(" | ");
      expect(text, `★${s}`).toContain(`GREASE WORKS ${speedText(effectAt("grease", s).gate!.speed!)}`);
      expect(text, `★${s}`).not.toMatch(/NO EFFECT ON SLAG|LOCKED|\(SLAG\)/);
      // the slag-fed main belt's own readout is unchanged by the join: its slag keeps its speed
      expect(readout(run, 0).join(" | "), `★${s}`).toContain("GREASE WORKS: NO EFFECT ON SLAG");
    }
  });

  it("METRONOME: a joined belt keeps (LOCKED) and the locked bonus past the join", () => {
    for (const s of STARS) {
      const run = joinRun({ hero: "metronome", items: pastJoin(s) }), w = walkRoute(run.build, 1);
      expect([beltKind(w), w.locked], `★${s}`).toEqual(["locked", true]);
      const text = readout(run, 1), g = effectAt("grease", s).gate!;
      expect(text, `★${s}`).toContain(`GREASE WORKS +${g.lockedFlat} DAMAGE (LOCKED)`);
      expect(text.join(" | "), `★${s}`).toContain("SPD 100% (LOCKED)");
    }
  });
});

describe("0.6.2rel: the join rows and the turret panels read by the text rules", () => {
  it("J10 on the phone: a joined belt's rows give way from the end, and the note counts hit tiles only", () => {
    const t = routePanel(joinRun({ items: busyJoin() }), 1)!;
    expect(t.body.filter((b) => b.trim).map((b) => b.join ?? false)).toEqual([false, false, false, true, false, false, false, false, false]);
    const plan = planPanel(t, PHONE);
    const dropped = plan.body.dropped.filter((b) => b.trim), hits = dropped.filter((b) => !b.join).length;
    expect(dropped.length, "rows give way on the phone").toBeGreaterThan(0);
    const note = plan.body.shown.find((l) => l.b.role === "note");
    expect(note?.b.text).toBe(`+${hits} MORE HIT TILE${hits === 1 ? "" : "S"} (NUMBERED ON THE DECK)`);
    expect(fit(t, PHONE).keptWhole).toBe(true);
  });

  it("no \"·\" in any belt, turret or empty-slot panel, its header included; T2 in every sentence", () => {
    for (const { id, t } of PANELS.filter((p) => ["belt", "installed", "empty"].includes(p.kind))) {
      for (const s of [t.title, t.sub, t.subShort ?? "", ...t.body.map((b) => b.text)]) expect(s, `${id}: ${s}`).not.toContain("·");
      for (const b of t.body.filter((x) => x.role === "ability" || x.role === "warn" || x.role === "hint")) expect(banned(b.text), `${id}: ${b.text}`).toEqual([]);
    }
    // a joining belt's sub line: two short sentences (the desk column breaks it after the first); 0.6.2rel3: the first
    // says its factory's pace (TUNE-M, RULE JOIN PACE)
    expect(routePanel(joinRun(), 1)!.sub).toBe("JOINS BELT 1 AT 70% PACE. FEEDS TURRET 1.");
    expect(planPanel(routePanel(joinRun(), 1)!, DESK).subs).toEqual(["JOINS BELT 1 AT 70% PACE.", "FEEDS TURRET 1."]);
  });

  it("0b.2 on the join rows: no lone short word on a last line where pulling one more word down still fits", () => {
    const texts = ["JOINS BELT 1 AT TILE 2.", "JOINS BELT 12 AT TILE 14.", "BELT 2 JOINS IT.", "BELTS 2, 3 AND 4 JOIN IT."];
    for (const t of texts) for (const [w, font] of [[116, "5"], [102, "5"], [151, "3"], [90, "5"], [80, "5"]] as const) {
      const lines = wrapText(t, w, font);
      expect(stubLine(lines.at(-1)!) && lines.length > 1 && lines.at(-2)!.split(" ").length > 1
        && textWidth(`${lines.at(-2)!.split(" ").at(-1)} ${lines.at(-1)}`, font) <= w, `${t} at ${w}: ${lines.join(" / ")}`).toBe(false);
    }
    // the mechanics head's desk readout left a lone "2" (joins-readout-desk.png): now the tile number keeps its word
    expect(wrapText("JOINS BELT 1 AT TILE 2.", 116, "5")).toEqual(["JOINS BELT 1 AT", "TILE 2."]);
  });

  it("a turret with 6 hardpoints shows its core and every gear slot on the phone band and in the desk column", () => {
    const t = turretPanel(turretRun("thunderer", 3, gearOf(6), ["gatling", 3]), 0)!;
    for (const area of [PHONE, DESK]) {
      const r = fit(t, area), shown = r.plan.body.shown.map((l) => l.b);
      expect(r.keptWhole).toBe(true);
      expect(shown.filter((b) => b.role === "row" && (b.label === "CORE" || b.label?.startsWith("GEAR"))).length).toBeGreaterThanOrEqual(2);
      // 0.6.2rel2 (the release owner's answer d957272806131146): where the desk has room for the gear's names or its clash
      // warning but not both, the warning wins, and the gear row counts the pieces ("6 PIECES")
      if (area === DESK && shown.some((b) => b.label === "GEAR" && b.text === "6 PIECES")) {
        expect(shown.map((b) => b.text)).toContain("HOPPER: ITS LONGER LOAD TIME DOES NOTHING HERE.");
        continue;
      }
      expect(shown.map((b) => b.text).join(" ")).toContain(GEAR.slice(0, 6).map((g) => ITEMS[g].name).at(-1)!);
    }
  });
});

describe("0b.1-0b.3: the other carry-overs", () => {
  it("0b.1: LIMPET WORKS at 1 star promises no stall in any panel, card, tooltip or cargo; from ★2 it does", () => {
    const one = [
      ...abilityText("limpet", 1).sentences, gist("limpet", 1), cardText("limpet"), flavourText("limpet", 1), ITEMS.limpet.desc.join(" "),
      ...PANELS.filter((p) => p.id.startsWith("offer limpet held[]") || p.id.startsWith("cargo limpet ★1") || p.id.startsWith("placed limpet ★1"))
        .flatMap((p) => p.t.body.filter((b) => b.role !== "next").map((b) => b.text)),
    ];
    expect(one.length).toBeGreaterThan(8);
    for (const t of one) expect(t).not.toMatch(/STALL/);
    expect(abilityText("limpet", 2).sentences).toContain("THE BLAST ALSO STALLS THE MACHINE THE CHARGE STUCK TO FOR 1 SECOND.");
  });

  it("0b.2: the wrap never ends a paragraph on a stub line when pulling one more word down still fits", () => {
    const FN = new Set(["A", "AN", "THE", "OF", "AT", "TO", "IN", "ON", "FOR", "AND", "OR", "WITH", "INTO", "FROM", "BY"]);
    /** A line's last unbreakable unit: its last word, or a number and the word after it. */
    const lastUnit = (ws: string[]) => (ws.length >= 2 && /^\(?[+-]?\d+(\.\d+)?%?$/.test(ws.at(-2)!) && !FN.has(ws.at(-1)!) ? ws.slice(-2) : ws.slice(-1)).join(" ");
    const texts = new Set<string>();
    for (const d of [...MODULES, ...SUPPLIES]) for (const s of fusible(d.id) ? STARS : [1]) {
      abilityText(d.id, s).sentences.forEach((t) => texts.add(t));
      texts.add(flavourText(d.id, s));
      texts.add(cardText(d.id));
    }
    // U2e step 1 (REQ-BFG-070): merge progress ("1 MORE COPY TO MERGE.") is gone, so it is no longer among the texts
    let checked = 0;
    for (const t of texts) for (const [w, font] of [[102, "5"], [116, "5"], [151, "3"], [66, "3"], [109, "3"]] as const) {
      const lines = wrapText(t, w, font);
      if (lines.length < 2) continue;
      const prev = lines.at(-2)!.split(" "), last = lines.at(-1)!;
      checked++;
      if (!stubLine(last) || prev.length < 2) continue;
      expect(textWidth(`${lastUnit(prev)} ${last}`, font), `${t} at ${w}: "${lines.at(-2)}" / "${last}"`).toBeGreaterThan(w);
    }
    expect(checked).toBeGreaterThan(500);
    // the polish's case was merge progress, its own sentence that never broke on the phone band. U2e step 1 (REQ-BFG-070):
    // merge progress is gone (inspectorLines "U2e step 1" pins that no panel draws it), so the check moves to the line that
    // took its place at a panel's end, the next-star sentence: a short one stays one line on the phone band
    expect(wrapText("NEXT STAR: ADDS 2 BURN.", 151, "3")).toHaveLength(1);
    // and a line that used to end "UP / TO 6." keeps the cap together
    expect(wrapText("NEXT STAR: 4 DAMAGE FOR EACH HIT, UP TO 6.", 151, "3")).toEqual(["NEXT STAR: 4 DAMAGE FOR EACH HIT,", "UP TO 6."]);
    expect(wrapText("SPLITS INTO 2 AT 60%.", 102, "5")).toEqual(["SPLITS INTO", "2 AT 60%."]);
  });

  it("0b.3: every shot and contact-sheet capture waits for the caravan to park (the scripts' guard)", () => {
    const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
    expect(src("scripts/shots-text.mjs")).toContain("!bb.game.screen.caravan.ready");
    expect(src("scripts/contact-sheet.mjs")).toContain("caravan.ready");
  });

  it("T2 holds in every panel's player text (the labelled stat rows aside)", () => {
    // U2b F3 (cap's U2a INPUTS): a cap names its unit, one form everywhere ("MAX 15 {FRAY}.", "MAX 6 RIGS."), so T2's ban
    // on a bare "MAX 6" passes a MAX whose number is followed by its unit (an icon or a word); every other ban stands
    const capNamesUnit = (s: string): boolean => [...s.matchAll(/\b(?:MAX|CAP)\s*\+?\d+(?:\.\d+)?( +\S+)?/g)]
      .every((m) => !!m[1] && /^ +(?:[-]|[A-Z]{2,})/.test(m[1]));
    for (const { id, t } of PANELS) for (const b of t.body) {
      if (b.role === "row" || b.role === "grid" || b.role === "hits" || b.role === "note") continue;
      expect(banned(b.text).filter((why) => why !== "MAX/CAP before a number" || !capNamesUnit(b.text)), `${id}: ${b.text}`).toEqual([]);
    }
    expect(capNamesUnit("MAX 6.") || capNamesUnit("UP TO MAX 6")).toBe(false); // the check's own test
    expect(C.bone).toBe(ROLE.ability.colour);
  });
});

// 0.6.2t2 (REQ-BFG-032 F1): the dim flavour block adds something or isn't there. The guard runs over whatever the catalogue
// sells (buyableModules() and the supplies), so it keeps failing for any future module whose flavour (its KEPT_FLAVOUR
// row, else its catalogue desc) repeats its ability text.
describe("0.6.2t2 F1: no flavour sentence repeats the ability text on its panel", () => {
  /** A panel's ability sentences and flavour sentences. */
  const texts = (t: PanelText) => ({
    ability: t.body.filter((b) => b.role === "ability").flatMap((b) => sentencesOf(b.text)),
    flavour: t.body.filter((b) => b.role === "flavour").flatMap((b) => sentencesOf(b.text)),
  });
  /** Why a flavour sentence fails the guard beside these ability sentences ([] when it passes). */
  const faults = (f: string, ability: string[]): string[] => {
    const nums = new Set(ability.flatMap(numbers));
    return [
      ...numbers(f).filter((n) => nums.has(n)).map((n) => `quotes ${n}`),
      ...ability.filter((a) => repeats(f, a)).map((a) => `repeats "${a}"`),
      ...(repeats(f, ability.join(" ")) ? ["restates the ability text"] : []),
    ];
  };

  it("covers every module the catalogue sells at each of its stars, and each supply: placed, cargo, offer (0, 1 or 2 held) and fitted", () => {
    const ids = new Set(PANELS.map((p) => p.id));
    for (const d of buyableModules()) for (const s of starsOf(d)) {
      const want = [
        `cargo ${d.id} ★${s} furnace spare0`,
        ...(d.kind === "gate" ? [`rig ${d.id} ★${s} 1hit spare0`] : []),
        ...(d.kind === "factory" ? [`placed ${d.id} ★${s} spare0`] : []),
        ...(d.kind === "core" || d.kind === "mod" ? [`turret ${d.id} ★${s}`] : []),
      ];
      for (const id of want) expect(ids.has(id), id).toBe(true);
    }
    for (const d of buyableModules()) for (const held of ["[]", "[1]", "[2,1]"]) expect(ids.has(`offer ${d.id} held${held}`), `${d.id} ${held}`).toBe(true);
    for (const d of SUPPLIES) expect(ids.has(`offer ${d.id} held[]`), d.id).toBe(true);
    // 0.6.2rel2 (on the 0.6.2 candidate): a turret's own variants too: installed in a slot at every star (with every
    // hardpoint count, above), its card (in cargo, and as a hull's free starting copy) and its offer; and the empty slots
    const turrets = buyableModules().filter((d) => d.kind === "turret");
    expect(turrets.length).toBe(13);
    for (const d of turrets) for (const s of starsOf(d)) {
      for (const id of [`installed ${d.id} ★${s} gear0`, `installed ${d.id} ★${s} gear1 core`, `cargo ${d.id} ★${s} free`]) expect(ids.has(id), id).toBe(true);
    }
    expect(PANELS.filter((p) => p.kind === "empty").length).toBeGreaterThan(Object.keys(HEROES).length);
  });

  it("no flavour sentence quotes a number the panel's ability sentences quote, or repeats one of them (the opening first)", () => {
    let flavoured = 0, sentences = 0;
    for (const { id, t } of PANELS) {
      const { ability, flavour } = texts(t);
      if (flavour.length) flavoured++;
      for (const f of flavour) {
        sentences++;
        expect(ability.length, `${id}: flavour without ability text`).toBeGreaterThan(0);
        expect(repeats(f, ability[0]), `${id}: "${f}" repeats the opening "${ability[0]}"`).toBe(false);
        expect(faults(f, ability), `${id}: "${f}"`).toEqual([]);
      }
    }
    // the counts the REPORT quotes (881b38f: 1076 panels with a flavour block, 1491 sentences, 1330 of them flagged; the
    // 0.6.2t2 tip 85 and 85; 0.6.2rel2 on the 0.6.2 candidate: 24 more, RAMPART CANNON's and HAIL GUN's cards and offers)
    expect([flavoured, sentences]).toEqual([109, 109]);
    console.log(`F1 guard: ${PANELS.length} panels, ${flavoured} with a flavour block, ${sentences} flavour sentences, 0 repeats`);
  });

  it("the guard catches what 881b38f showed: the effect restated, a number quoted again, MIMIC FORGE ★3's contradiction", () => {
    const at = (def: string, s = 1) => abilityText(def, s).sentences;
    // 881b38f's flavour, each against its own ability text: every one fails the guard
    const old: [string, number, string][] = [
      ["grease", 1, "THE BELT RUNS 60% FASTER FROM ITS HIT."], // a number quoted again
      ["grease", 1, "METRONOME'S LOCKED BELTS GAIN +1 DAMAGE."],
      ["temper", 1, "ADDS 1 BURN."], // the opening, cut short
      ["temper", 1, "EACH BURN STACK DEALS 1 DAMAGE A SECOND FOR 3 SECONDS AFTER THE HIT."],
      ["frostbite", 1, "FROST ROUNDS FREEZE MACHINES AND PAUSE THEIR TIMERS."], // the effect in other words
      ["mimic", 3, "STAMPS YOUR HERO'S SIGNATURE AMMO INTO TWO MORE ROUTES."], // and TWO against FEEDS 2 BELTS
    ];
    for (const [def, s, f] of old) expect(faults(f, at(def, s)).length, `${def} ★${s}: ${f}`).toBeGreaterThan(0);
    expect(faults("THE BELT RUNS 60% FASTER FROM ITS HIT.", at("grease"))).toEqual(["quotes 60"]);
    // bb-0.8.3 (REQ-BFG-042 D3): ★3 no longer says FEEDS 2 BELTS, so the old line is caught as a restated opening
    expect(faults("STAMPS YOUR HERO'S SIGNATURE AMMO INTO TWO MORE ROUTES.", at("mimic", 3))[0]).toBe(`repeats "${at("mimic", 3)[0]}"`);
    // the kept lines pass against their own ability text at every star
    for (const [def, kept] of Object.entries(KEPT_FLAVOUR)) for (const f of kept) for (const s of starsOf(ITEMS[def])) {
      expect(faults(f, at(def, s)), `${def} ★${s}: ${f}`).toEqual([]);
    }
  });

  it("a panel whose module keeps no flavour shows the rule, then the hint (desk)", () => {
    const run = newRun("furnace", 5, "f1");
    run.inventory = [{ uid: 900, def: "temper" }];
    const t = cargoPanel(run, 900)!;
    expect(t.body.some((b) => b.role === "flavour")).toBe(false);
    const plan = planPanel(t, DESK), at = plan.body.lines.indexOf("rule");
    expect((plan.body.lines[at + 1] as PLine).block.role).toBe("hint");
    expect(flavourText("temper", 1)).toBe("");
  });
});

// 0.6.2t2 (REQ-BFG-032 F4): on the desk column the action hint shows whenever it fits whole beside the kept blocks: it
// comes right after them (inspector.ts deskRank), before the ability's later sentences and the flavour.
describe("0.6.2t2 F4: the desk column shows the action hint whenever it fits whole", () => {
  const hintShown = (t: PanelText, area: typeof DESK) => {
    const plan = planPanel(t, area);
    const drawn = new Set(visibleLines(plan).map((v) => v.line));
    return plan.body.shown.some((l) => l.b.role === "hint" && l.lines.every((x) => drawn.has(x)));
  };

  it("every desk panel with a hint shows it, unless its kept blocks and the hint alone overflow the column", () => {
    const missing: string[] = [], wrong: string[] = [];
    let withHint = 0;
    for (const { id, t } of PANELS) {
      if (!t.body.some((b) => b.role === "hint")) continue;
      withHint++;
      // the text the plan chose (its variant), cut to the kept blocks and the hint: does the hint fit beside them? (0.6.2rel2:
      // on the desk a deskKeep block, a turret's clash or shield, is a kept block)
      const v = planPanel(t, DESK).body.variant, body = v === 0 ? t.body : t.variants![v - 1].body;
      const bare = { ...t, body: body.filter((b) => b.keep || b.deskKeep || b.role === "hint"), variants: [] };
      if (hintShown(t, DESK) !== hintShown(bare, DESK)) wrong.push(id);
      if (!hintShown(t, DESK)) missing.push(id);
    }
    console.log(`F4 desk hints: ${withHint} panels with a hint, ${missing.length} without it: ${missing.join(", ")}`);
    expect(wrong, wrong.join(", ")).toEqual([]);
    // the counts the REPORT quotes: polish-in 0 of 1076, 881b38f 295, the 0.6.2t2 tip 60 (idle and many-hit ★1-★2 rigs,
    // SURGE ★2); 0.6.2rel2 on the 0.6.2 candidate (turret slots, joins, FB-B): 141 of 1622, the 60's kind plus installed
    // turrets whose socket rows, stat rows and kept clashes fill the column under their buttons, and MANTLET ★2 in cargo
    // 0.8.0 I1 M2: with wave 3's panels, 181 of 1934 (was 141 of 1622); 179 once PINCER's sentence drops "UP TO 3 OTHERS"
    // (VERIFIED-P1 H5: "offer pincer held[1]" and "rig pincer ★2 1hit spare1" then fit their hint)
    // 0.8.0 B1 M2: 182: "turret steambreech ★1" (STEAM BREECH's retuned rates make its line longer: 35% / 10%) and
    // "rig overdrive ★2 3hit spare0", "rig overdrive ★2 idle spare1" (REDLINE's +1 adds a clause; oracle 1cd5224fab866da2)
    // U2a (REQ-BFG-046): 179: the new faces are shorter, so "cargo mantlet ★2"'s neighbours aside three more desk panels
    // fit their hint (the faces' turret cores on installed turrets)
    // U2b (REQ-BFG-046): the rig and gear faces are shorter again, so more desk panels (rigs, mostly) fit their hint
    // (179 to 126 on release-084). 0.8.6 move: 0.8.5's TURRET SPEED UPGRADE button and the faces: 202 to 153, measured
    // U2c group 0 fix 1: 154, SURGE VALVE's rule says its pulse (its speed and length), a line longer on the desk column
    // U2c step 4: 138, the installed turrets' stat row (one line, was three rows) leaves 16 more desk panels room for the hint
    // U2e step 1 (REQ-BFG-070): 100, measured: merge progress is gone (a kept line on every fusible piece's panel), so 38
    // more desk panels have room for the hint. U2e steps 2-4: 63, measured: no NEXT★ or reminder on the face either; the 63
    // are installed turrets (their socket and stat rows fill the column under their buttons) and four turrets with a core
    expect([withHint, missing.length]).toEqual([1934, 63]);
    expect(missing.every((id) => /^(rig|cargo (surge|mantlet) ★2|turret|installed)/.test(id)), missing.join(", ")).toBe(true);
  });

  it("the brief's case: a WEAVER's ★2 PRESSURE BREECH in cargo shows TAP A TURRET TO FIT IT. again (desk)", () => {
    const run = newRun("weaver", 5, "f4");
    run.inventory = [{ uid: 900, def: "pressure", stars: 2 }];
    const plan = planPanel(cargoPanel(run, 900)!, DESK);
    const text = visibleLines(plan).flatMap((v) => (v.line === "rule" ? [] : [v.line]));
    expect(text.at(-1)!.block.role).toBe("hint");
    expect(lineText(text.at(-1)!.spans)).toBe("TAP A TURRET TO FIT IT.");
  });

  it("the phone band keeps its order: the ability's later sentences before the hint", () => {
    let hints = 0;
    for (const { t } of PANELS) if (hintShown(t, PHONE)) hints++;
    console.log(`F4 phone hints: ${hints} of ${PANELS.length} panels`);
    // 111 at 881b38f; 0.6.2rel2 on the 0.6.2 candidate's panels (the REPORT gives b94077d's); 0.8.0 I1 M2: 130 with wave
    // 3's panels (was 115)
    // U2a (REQ-BFG-046): 422: the new faces (a stat row and one rule) leave room for the hint on many more phone panels
    // U2b (REQ-BFG-046): 497 with the rig, gear and supply faces (and the reminders giving way one at a time, F4)
    // U2c group 0 fix 1: 494, SURGE VALVE's rule says its pulse (its speed and length), so 3 of its phone panels lose the hint
    // U2c step 5: 491, the notices in the notice form ("LABEL: TEXT.": the starting turret's TURRET SPEED line and free note,
    // the factory's level and UPGRADE lines, STAYS ABOARD, the STOKER's capped line) a few px longer on some phone panels
    // U2e step 1 (REQ-BFG-070): 581, measured: merge progress is gone, so 90 more phone panels have room for the hint.
    // U2e steps 2-4: 810, measured: no NEXT★ or reminder on the face either
    // U2f step 3: 813, measured: LODESTAR LANCE's, STATIC BRUSH's, TESLA ARC's and OVERCLOCKER's lines now fit one line
    expect(hints).toBe(813);
  });
});

// 0.6.2t2 (REQ-BFG-032 F2): a stat row never shows a bare number; each number says what it is, in the glossary's words.
describe("0.6.2t2 F2: every number in a stat row says what it is", () => {
  /** The numbers in a row's value that no unit or noun follows ("CHAMBER 3 LOADS, 1.5 SEC" at 881b38f: the 1.5). */
  // 0.8.0 I1 M2 (REPORT-P1 section 13): wave 3's units join, as tests/wave3.text.test.ts has them: PLATING, a RIG count
  // (PINCER's CROSSFIRE WITH 2 RIGS) and SHORTER (BRACE FRAME's 85% SHORTER)
  const bare = (text: string): string[] => {
    const ws = text.replace(/[,():]/g, " ").split(/\s+/).filter(Boolean);
    return ws.flatMap((w, i) => {
      if (!/^[+-]?\d+(\.\d+)?%?$/.test(w)) return [];
      const next = ws[i + 1] ?? "";
      if (w.endsWith("%")) return /^(DAMAGE|FASTER|SLOWER|SHORTER)$/.test(next) ? [] : [w];
      return /^(SEC|LOADS?|DAMAGE|BURN|POISON|FRAY|HULL|HARASSMENT|COPIES|HITS?|TILES?|TIMES|PLATING|RIGS?)$/.test(next) ? [] : [w];
    });
  };
  /** 0.6.2rel2: turret `def` (★ts) in a FURNACE's slot 1 with `core` (★cs) and `gear` in its hardpoints, in order. */
  const fitted = (def: string, ts: number, core: string | null, cs: number, gear: [string, number][] = []): Run =>
    turretRun(def, ts, gear, core ? [core, cs] : undefined);
  /** The stat rows (FIRES, CHAMBER, LOAD TIME: ungrouped, unlike the CORE and GEAR rows) of a panel's every form. */
  const statRows = (t: PanelText): Block[] =>
    [t.body, ...(t.variants ?? []).map((v) => v.body)].flat().filter((b) => b.role === "row" && !!b.label && b.group === undefined);
  const CORES = [null, ...MODULES.filter((d) => d.kind === "core").map((d) => d.id)];
  /** A heavy and a light gun with 1 hardpoint (★1 commons), the one gun with 6 (THUNDERER ★3, heavy) and the light gun
   *  with the most (HAIL GUN ★3: 5; no light gun reaches 6). */
  const GUNS: [string, number][] = [["scrapcannon", 1], ["dartgun", 1], ["thunderer", 3], ["hailgun", 3]];

  it("the turret's stat row, written out: how often it fires, its loads (a HOPPER's store in the note), its gear slots; no LOAD TIME", () => {
    // U2c step 4 (REQ-BFG-046; N1 6.6): FIRES, CHAMBER and LOAD TIME became the stat row ({SEC} cadence, {SLUG} loads, {GEAR}
    // slots) and one short note (NEVER JAMS, a HOPPER's store, PRESSURE's cap); the load time is a hidden timer. The same
    // numbers as the rows read, through the formatters (was ["EVERY 1 SEC", "3 LOADS", "1.5 SEC"] and so on)
    const face = (core: string | null, cs: number, gear: [string, number][] = []) => {
      const f = turretFace(fitted("scrapcannon", 1, core, cs, gear));
      return [f.stats, f.note];
    };
    const row = (every: number, loads: number) => statRow([speedPair(every), ["SLUG", fmtCount(loads)], ["GEAR", fmtCount(1)]]);
    expect(face(null, 1)).toEqual([row(1, 3), undefined]); // the KILN BREECH
    expect(face("rotary", 1)).toEqual([row(1, 3), undefined]);
    // 0.6.2 FB-B: every HOPPER star adds 1 slot; ★2 and ★3 store 1 and 2 loads while firing; ★3 never jams
    expect(face("rotary", 1, [["hopper", 3]])).toEqual([row(1, 4), icons(`NEVER JAMS. STORES +${fmtCount(2)} {SLUG} WHILE IT FIRES.`)]);
    expect(face(null, 1, [["hopper", 1]])).toEqual([row(1, 4), undefined]);
    expect(face(null, 1, [["hopper", 2]])).toEqual([row(1, 4), icons(`STORES +${fmtCount(1)} {SLUG} WHILE IT FIRES.`)]);
    // PRESSURE BREECH never jams and counts at most 5 loads waiting (U2b's ledger: its cap in the turret's stat rows)
    // U2d F5: the note reads forwards (was `NEVER JAMS. MAX 5 {SLUG} WAITING COUNT.`)
    expect(face("pressure", 2)).toEqual([row(1, 3), icons(`NEVER JAMS. COUNTS UP TO ${fmtCount(ITEMS.pressure.core!.maxCount!)} WAITING {SLUG}.`)]);
    expect(face("salvo", 1)).toEqual([row(1.6, 3), undefined]); // its volley reload, as the FIRES row read it
    expect(face("compound", 1, [["hopper", 3]])).toEqual([row(1, 4), icons(`NEVER JAMS. STORES +${fmtCount(2)} {SLUG} WHILE IT FIRES.`)]);
    expect(face("gatling", 1, [["hopper", 1]])).toEqual([row(1, 4), undefined]);
    expect(face(null, 1, [["chamber", 2]])).toEqual([row(1, 4), undefined]); // 2 LOADS EACH SHOT: EXT. CHAMBER's own rule, under its GEAR row
    expect(stripIcons(faceLines("chamber", 2)!.rules[0].text)).toBe(`EACH SHOT FIRES ${fmtCount(effectAt("chamber", 2).mod!.perShot!)} .`);
  });

  it("0.6.2rel2: the load time is what the battle waits (U2c: a hidden timer, on no turret panel), every core at every star, no HOPPER and HOPPER ★1-★3, heavy and light", () => {
    // makeTurret builds the slot's turret as the battle does; each core's ready (cores.ts ROUTINES) is the wait
    const load = {} as TurretState["stack"][number];
    let n = 0;
    for (const def of ["scrapcannon", "dartgun"]) for (const core of CORES) for (const s of STARS) for (const hs of [0, 1, 2, 3]) {
      const run = fitted(def, 1, core, s, hs ? [["hopper", hs]] : []);
      const tu = makeTurret(run.build, 0, turretSlots(run.build)[0].td!);
      // U2c step 4 (N1 6.6): the turret panel shows no load time in any form (was its LOAD TIME row, checked equal to the
      // wait below); the stat row is the battle's turret (turretFace)
      const t = turretPanel(run, 0)!;
      // (a gear piece's own text may name it: HOPPER's "LONGER LOAD TIME", the clash on a GATLING or COMPOUND)
      expect([t.body, ...(t.variants ?? []).map((v) => v.body)].flat().some((x) => x.label === "LOAD TIME" || /^ITS LOAD TIME IS/.test(x.text)), def).toBe(false);
      expect(t.body.find((b) => b.role !== "warn")!.text).toBe(turretFace(run).stats);
      const shown: string | undefined = undefined;
      const ready = (t: number) => ROUTINES[tu.core.routine].ready({ ...tu, stack: [load], loadTimer: t, fireCd: 0 });
      const id = `${def} ${core ?? "signature"} ★${s}, HOPPER ★${hs}`;
      n++;
      if (tu.core.routine === "gatling") { // a lone load fires as soon as the barrel allows: no timer
        expect([shown, ready(0)], id).toEqual([undefined, true]);
        continue;
      }
      const lt = tu.core.routine === "compound" ? tu.core.spec.hold ?? 3 : tu.windowTime; // COMPOUND: its hold, never windowTime
      expect(Math.abs(Number(n2(lt)) - lt), id).toBeLessThan(1e-9); // the glossary's LOAD TIME and COMPOUND's tap text say it exactly
      const wait = tu.core.routine === "salvo" ? 2 * lt : lt; // SALVO RACK waits twice its load time, as its text says
      expect([ready(wait - 0.01), ready(wait)], id).toEqual([false, true]);
      // HOPPER adds 0.5 SECONDS for every star it has, except on a COMPOUND BREECH
      const base = makeTurret(fitted(def, 1, core, s).build, 0, turretSlots(run.build)[0].td!);
      expect(tu.windowTime - base.windowTime, id).toBeCloseTo(hs ? effectAt("hopper", hs).mod!.windowTime! : 0, 9);
    }
    expect(n).toBe(2 * 16 * 3 * 4); // 0.8.0 I1 M2: 15 cores and the signature (was 2 * 14 * 3 * 4)
  });

  it("every core and gear at every star, on heavy and light guns with 1 hardpoint and with the most: no bare number in a stat row", () => {
    const gears = [null, ...GEAR];
    let n = 0;
    for (const [def, ts] of GUNS) for (const core of CORES) for (const gear of gears) for (const s of STARS) {
      // the gear under test in the first hardpoint, then other pieces in every other one (never a second copy of a def)
      const fill: [string, number][] = gear ? [gear, ...GEAR.filter((g) => g !== gear)].slice(0, gearSlotsOf(def, ts)).map((g): [string, number] => [g, s]) : [];
      const t = turretPanel(fitted(def, ts, core, s, fill), 0)!;
      const id = `${def} ★${ts} ${core} ★${s} + ${fill.map(([g]) => g).join(",")} ★${s}`;
      for (const b of statRows(t)) expect(bare(b.text), `${id}: ${b.label} ${b.text}`).toEqual([]);
      for (const [label, v] of Object.entries(rows(t))) expect(bare(v), `${id}: ${label} ${v}`).toEqual([]);
      // U2c step 4: the CHAMBER and LOAD TIME rows became the stat row (each number an icon's) and its note (each number before
      // its {SLUG}); the stat row is the battle's turret's (makeTurret), the load time a hidden timer (N1 6.6)
      const run = fitted(def, ts, core, s, fill), f = turretFace(run), want = expectedFace(run);
      expect([f.stats, f.note], id).toEqual([want.stats, want.note]);
      // U2d F5: PRESSURE's part is COUNTS UP TO n WAITING {SLUG}. (was MAX n WAITING COUNT.)
      if (f.note) expect(stripIcons(f.note).replace(/ +/g, " "), id).toMatch(/^(NEVER JAMS\.)? ?(STORES \+\d+ WHILE IT FIRES\.)? ?(COUNTS UP TO \d+ WAITING ?\.)?$/);
      expect(rows(t)["LOAD TIME"], id).toBeUndefined();
      n++;
    }
    expect(GUNS.map(([d, s]) => gearSlotsOf(d, s))).toEqual([1, 1, 6, 5]);
    expect(n).toBe(4 * 16 * 13 * 3); // 0.8.0 I1 M2: 15 cores and the signature, 12 gear and none (was 4 * 14 * 10 * 3)
  });

  it("every rig's belt timeline row at every star (free, slag, METRONOME and joined belts) and the header strip: no bare number", () => {
    let joinRows = 0;
    const check = (run: Run, i: number, id: string) => {
      const t = routePanel(run, i)!;
      for (const b of t.body.filter((x) => x.role === "row")) {
        // 0.6.2rel2: a JOINS row's numbers name a belt and a tile ("JOINS BELT 1 AT TILE 2."), each after its noun
        if (b.join) {
          joinRows++;
          expect(b.text, id).toMatch(/^JOINS BELT \d+ AT TILE \d+\.$/);
        } else expect(bare(b.text), `${id}: ${b.label} ${b.text}`).toEqual([]);
      }
      for (const b of t.body.filter((x) => x.role === "grid")) for (const [l, v] of b.cells!) {
        expect(l, `${id}: ${v}`).toMatch(/^(DMG|BURN|SPD|TIME|SHOCK|COPIES)$/); // each value sits beside its label
        if (l === "TIME") expect(v, id).toMatch(/^\d+\.\d SEC$/);
      }
      for (const text of t.headerOnly?.texts ?? []) expect(text, id).toMatch(/, TIME \d+\.\d SEC/);
    };
    for (const d of MODULES.filter((x) => x.kind === "gate")) for (const s of STARS) check(rigRun(d.id, s, 3, 3, rotFacing(d.id, 1), 0), 0, `${d.id} ★${s}`);
    for (const s of STARS) {
      for (const run of [slagRun(s), slagRun(s, "surge")]) check(run, run.build.routes.length - 1, `slag ★${s}`);
      check(metronomeRun(s), 0, `METRONOME ★${s}`);
      // 0.6.2rel2 (REQ-BFG-027): through a join, both belts: a plain join, a joined SLAG belt, a slag-fed main belt and
      // METRONOME's locked belts, with speed rigs past the join at that star; then the busy join (a hit on every tile)
      const joined: [string, Run][] = [
        [`join ★${s}`, joinRun({ items: pastJoin(s) })], [`slag joiner ★${s}`, joinRun({ factory: "slagpot", items: pastJoin(s) })],
        [`slag main ★${s}`, joinRun({ main: "slagpot", items: pastJoin(s) })], [`metronome join ★${s}`, joinRun({ hero: "metronome", items: pastJoin(s) })],
      ];
      for (const [id, run] of joined) for (const i of [0, 1]) check(run, i, `${id} belt ${i + 1}`);
    }
    for (const i of [0, 1]) check(joinRun({ items: busyJoin() }), i, `busy join belt ${i + 1}`);
    expect(joinRows).toBeGreaterThanOrEqual(13); // a JOINS row on every joining belt checked
    // the two rows 881b38f left bare: SPLITTER's share and LODESTONE's cap
    const row = (def: string, s: number) => routePanel(rigRun(def, s, 3, 3, rotFacing(def, 1), 0), 0)!.body.find((b) => b.role === "row")!.text;
    expect(row("splitter", 1)).toBe("SPLITTER 2 COPIES AT 60% DAMAGE");
    expect(row("lodestone", 2)).toBe("LODESTONE +2 DAMAGE, +2.2 DAMAGE FOR EACH STALLED MACHINE, UP TO 13 DAMAGE");
  });
});

// 0.6.2rel2: the rehearsal's nits 1, 2 and 5 (ACCEPTED.md, display only), and HOPPER on a COMPOUND BREECH (the 0.6.2t2
// REPORT's note), checked in the sim first.
describe("0.6.2rel2: the rehearsal's nits 1, 2 and 5, and HOPPER on a COMPOUND BREECH", () => {
  const installed = (id: string) => PANELS.find((p) => p.id === `installed ${id}`)!.t;
  const shown = (t: PanelText, area: typeof DESK) => planPanel(t, area).body.shown.map((l) => l.b.text);
  /** The panel as b94077d planned it: its clashes and shield optional in every column (no deskKeep). */
  const optional = (t: PanelText): PanelText => {
    const strip = (bs: readonly Block[]) => bs.map(({ deskKeep, ...b }) => b);
    return { ...t, body: strip(t.body), variants: (t.variants ?? []).map((v) => ({ ...v, body: strip(v.body) })) };
  };

  it("nit 1: the desk keeps a turret's clashes and MANTLET's shield, the gear list taking its compact form first", () => {
    // the clash of a GATLING SPOOL's and a COMPOUND BREECH's HOPPER, and MANTLET's shield at ★2 and ★3, on the desk
    for (const [id, text] of [["gatling-hopper1", gatlingClashText("hopper", 1, "gatling")!], ["compound-hopper3", gatlingClashText("hopper", 3, "compound")!],
      ["mantlet2", shieldLine(1)], ["mantlet3-hopper3", shieldLine(3)]]) {
      const plan = planPanel(installed(id), DESK);
      expect([shown(installed(id), DESK).includes(text), plan.body.font], id).toEqual([true, "5"]);
    }
    // the desk ladder (the release owner's answer d957272806131146), first rung that fits: 1-3 the full, gist and one-row
    // list forms keeping the whole clash sentences and the shield; 4 the one-row list with each clash's short line; 5 a
    // count of the gear pieces with the short lines; the shield on 4 and 5 only if it fits; 6 a safety net (the list,
    // nothing kept but its rows) that no panel may need
    const shorts = new Set(["hopper", "ram"].flatMap((d) => ["gatling", "compound"].map((r) => clashShortText(d, r))).filter(Boolean));
    const isCount = (b: Block) => b.label === "GEAR" && /^\d+ PIECES?$/.test(b.text);
    const chosen = (t: PanelText): Block[] => {
      const v = planPanel(t, DESK).body.variant;
      return v === 0 ? t.body : t.variants![v - 1].body;
    };
    const rungOf = (t: PanelText): number => {
      const v = planPanel(t, DESK).body.variant, body = chosen(t);
      if (body.some(isCount)) return 5;
      if (body.some((b) => shorts.has(b.text))) return 4;
      if (body.some((b) => b.deskKeep)) return 3;
      return v === t.variants!.length - 1 ? 6 : 4; // a shield-only turret's rung 4 is its one-row list, the shield optional
    };
    const rungs = new Map<number, string[]>(), rescued: string[] = [];
    for (const { id, t } of PANELS.filter((p) => (p.kind === "installed" || p.kind === "turret") && p.t.body.some((b) => b.deskKeep))) {
      const r = rungOf(t), plan = planPanel(t, DESK), texts = shown(t, DESK);
      expect([plan.body.fits, plan.body.font], id).toEqual([true, "5"]);
      rungs.set(r, [...(rungs.get(r) ?? []), `${id} (${plan.maxY - plan.y} px)`]);
      const kept = t.body.filter((b) => b.deskKeep).map((b) => b.text); // the whole sentences
      // rungs 1-3 show every whole sentence; 4 and 5 every short line (kept there)
      const need = r <= 3 ? kept : chosen(t).filter((b) => b.deskKeep).map((b) => b.text);
      expect(need.filter((s) => !texts.includes(s)), id).toEqual([]);
      if (r >= 4) expect(need.every((s) => shorts.has(s)), id).toBe(true);
      if (r === 5) { // the names gave way only because rung 4 didn't fit: without rung 5 the panel falls to the net
        const no5 = { ...t, variants: t.variants!.filter((v) => !v.body.some(isCount)) };
        expect(rungOf(no5), id).toBe(6);
      }
      // b94077d's plan (both optional) dropped one of them here: the stat rows or a gear sentence took the room
      if (r <= 3 && !kept.every((s) => shown(optional(t), DESK).includes(s))) rescued.push(id);
    }
    console.log(`nit 1 desk rungs: ${[...rungs].sort().map(([r, ids]) => `rung ${r}: ${ids.length}${r >= 4 ? ` [${ids.join(", ")}]` : ""}`).join("; ")}; b94077d dropped and now kept: ${rescued.join(", ")}`);
    expect(rungs.get(6) ?? []).toEqual([]);
    // the rehearsal REPORT's 8c item 6: SCRAP CANNON with MANTLET ★2 shows its shield on the desk. U2c step 4: its stat row
    // (one line, was three rows) leaves b94077d's plan room for the shield too, so it no longer needs rescuing (was
    // expect(rescued).toContain("turret mantlet ★2")); the shield shows whole either way
    const mantlet = PANELS.find((p) => p.id === "turret mantlet ★2")!.t;
    expect([shown(mantlet, DESK).includes(shieldLine(1)), shown(optional(mantlet), DESK).includes(shieldLine(1))]).toEqual([true, true]);
    // the six-gear THUNDERER of text-turret-six-desk.png shows both short lines, whole in the 5x7 face
    const shot = installed("thunderer-shot"), shotPlan = planPanel(shot, DESK);
    expect([shotPlan.body.fits, shotPlan.body.font]).toEqual([true, "5"]);
    expect(shown(shot, DESK)).toEqual(expect.arrayContaining(["HOPPER: ITS LONGER LOAD TIME DOES NOTHING HERE.", "FINISHER RAM: DOES NOTHING HERE."]));
    // a two-piece GATLING turret with HOPPER and FINISHER RAM keeps its gear's names (rung 4 or better)
    const two = installed("gatling-hopper-ram");
    expect(rungOf(two)).toBeLessThanOrEqual(4);
    expect(planPanel(two, DESK).body.shown.some((l) => l.b.label === "GEAR" && l.b.text === "HOPPER AND FINISHER RAM")).toBe(true);
  });

  it("nit 2: the phone's one-row gear list counts its empty hardpoints as slots: 3 EMPTY SLOTS, 1 EMPTY SLOT", () => {
    const gearRow = (gear: [string, number][]) => socketLines(turretRun("siegegun", 1, gear).build, 0, "KILN BREECH", undefined, true)[1].text;
    expect(gearRow([])).toBe("3 EMPTY SLOTS");
    expect(gearRow([["hopper", 2], ["ram", 1]])).toBe("HOPPER ★★, FINISHER RAM AND 1 EMPTY SLOT");
    expect(gearRow([["hopper", 1], ["ram", 1], ["mantlet", 1]])).toBe("HOPPER, FINISHER RAM AND MANTLET");
    // U2c step 4: the panel's one-row gear list (its last forms) counts them; with the stat row one line (was three rows) the
    // phone band holds the fuller form, one GEAR row a slot, each EMPTY (was: the phone took the one-row list)
    const tp = turretPanel(turretRun("siegegun", 1, []), 0)!;
    expect(tp.variants!.flatMap((v) => v.body).find((b) => b.label === "GEAR" && /EMPTY SLOT/.test(b.text))?.text).toBe("3 EMPTY SLOTS");
    const phone = planPanel(tp, PHONE).body.shown.map((l) => l.b);
    expect(phone.filter((b) => /^GEAR/.test(b.label ?? "")).map((b) => b.text)).toEqual(["EMPTY", "EMPTY", "EMPTY"]);
  });

  it("nit 5: every belt's sub is whole sentences: a main belt's ends with a full stop, as a joining belt's does", () => {
    const run = joinRun();
    expect([routePanel(run, 0)!.sub, routePanel(run, 1)!.sub]).toEqual(["FEEDS TURRET 1.", "JOINS BELT 1 AT 70% PACE. FEEDS TURRET 1."]);
    for (const { id, t } of PANELS.filter((p) => p.kind === "belt")) expect(t.sub, id).toMatch(/^([A-Z0-9% ]+\. )*[A-Z0-9% ]+\.$/);
  });

  it("HOPPER on a COMPOUND BREECH: the sim ignores its seconds there (its slot and store still count); its clash says so", () => {
    const load = {} as TurretState["stack"][number];
    for (const cs of STARS) for (const hs of STARS) {
      const id = `COMPOUND ★${cs}, HOPPER ★${hs}`;
      const run = turretRun("bombard", 1, [["hopper", hs]], ["compound", cs]), plain = turretRun("bombard", 1, [], ["compound", cs]);
      const [tu, bare] = [run, plain].map((r) => makeTurret(r.build, 0, turretSlots(r.build)[0].td!));
      const hold = tu.core.spec.hold ?? 3;
      // the window time grows by HOPPER's 0.5 SECONDS, but a lone load fires at the hold either way (cores.ts compound)
      expect(tu.windowTime - bare.windowTime, id).toBeCloseTo(0.5, 9);
      for (const t of [tu, bare]) {
        const ready = (timer: number) => ROUTINES.compound.ready({ ...t, stack: [load], loadTimer: timer });
        expect([ready(hold - 0.01), ready(hold)], id).toEqual([false, true]);
      }
      // what still counts: the extra chamber slot (makeTurret's window caps the loads a chamber takes, on every core) and
      // the ★2/★3 store (the loads taken while the gun fires)
      expect([tu.window - bare.window, tu.storeMax], id).toEqual([1, effectAt("hopper", hs).mod!.store ?? 0]);
      // the clash, through the GATLING's mechanism: only the seconds do nothing; FINISHER RAM does fire there
      expect(gatlingClash(run.build, 0, "compound"), id).toEqual([
        `COMPOUND BREECH: THE HOPPER'S LONGER LOAD TIME DOES NOTHING HERE${hs > 1 ? ", BUT ITS STORE STILL WORKS" : ""}.`,
      ]);
      // U2c step 4 (N1 6.6): no LOAD TIME row (was `${n2(hold)} SEC`); COMPOUND's tap text says its hold (U2b's ledger)
      expect(rows(turretPanel(run, 0)!)["LOAD TIME"], id).toBeUndefined();
      expect(glossaryText("SHOT", { def: "compound", stars: cs, o: { k: 1 } }), id).toContain(`AFTER ${fmtSec(hold)}{SEC}`);
    }
    expect(gatlingClash(turretRun("bombard", 1, [["ram", 2]], ["compound", 1]).build, 0, "compound")).toEqual([]);
    expect(gatlingClash(turretRun("bombard", 1, [["hopper", 1]], ["rotary", 1]).build, 0, "rotary")).toEqual([]);
    // HOPPER's own text names both cores where its longer load time does nothing
    for (const s of STARS) expect(abilityText("hopper", s).sentences.at(-1)).toBe("ON A GATLING SPOOL OR A COMPOUND BREECH THE LONGER LOAD TIME DOES NOTHING.");
  });
});

/** U2c step 4: an installed turret's stat row and its note, as its panel draws them (the first blocks after any dead end). */
function turretFace(run: Run, i = 0): { stats: string; note?: string } {
  const own = turretPanel(run, i)!.body.filter((b) => b.role !== "warn");
  return { stats: own[0].text, note: own[1]?.role === "note" ? own[1].text : undefined };
}
/** U2c step 4: what that stat row and note say, from the turret the battle builds (makeTurret, resolveCore) through the
 *  formatters: its interval x SALVO's reload, its window, its slot's gear slots; NEVER JAMS, a HOPPER's store, PRESSURE's cap. */
function expectedFace(run: Run, i = 0): { stats: string; note?: string } {
  const sl = turretSlots(run.build)[i], td = sl.td!, tu = makeTurret(run.build, i, td), tc = resolveCore(run.build, i, td);
  const every = tu.interval * (tc.bought ? tc.spec.reloadMul ?? 1 : 1);
  const note = [
    ...(tu.noJam || (tc.bought && tc.spec.noJam) ? ["NEVER JAMS."] : []),
    ...(tu.storeMax ? [`STORES +${fmtCount(tu.storeMax)} {SLUG} WHILE IT FIRES.`] : []),
    ...(tc.bought && tc.routine === "pressure" ? [`COUNTS UP TO ${fmtCount(tc.spec.maxCount!)} WAITING {SLUG}.`] : []), // U2d F5 (was MAX n {SLUG} WAITING COUNT.)
  ].join(" ");
  return { stats: statRow([speedPair(every), ["SLUG", fmtCount(tu.window)], ["GEAR", fmtCount(sl.gearSlots)]]), note: note ? icons(note) : undefined };
}

/** A panel's labelled rows by label (the full form). */
function rows(t: PanelText): Record<string, string> {
  return Object.fromEntries(t.body.filter((b) => b.role === "row" && b.label).map((b) => [b.label!, b.text]));
}
