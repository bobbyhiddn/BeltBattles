import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newRun, type Run } from "../src/game/run";
import { HEROES, ITEMS, buyableModules, rigShape, type HeroId } from "../src/sim/content";
import { gearSlotsOf, key as K, rotField, setTurretList, turretSlots, walkRoute, type Placed } from "../src/sim/deck";
import { emptySlotPanel } from "../src/screens/build/turretPanel";
import { rotFacing } from "../src/sim/beltside";
import { effectAt, fusible } from "../src/sim/stars";
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { buildLayout } from "../src/screens/build/layout";
import {
  ROLE, beltKind, cargoPanel, itemPanel, lay, offerPanel, planPanel, rigPanel, routePanel, turretPanel, visibleLines,
  type Block, type Laid, type PanelText, type PLine,
} from "../src/screens/build/inspector";
import { abilityText, cardText, gist, mergeProgressText, speedText } from "../src/ui/abilityText";
import { KEPT_FLAVOUR, flavourText } from "../src/screens/build/flavour";
import { PERK_COLOUR, lineText, stubLine, wrapText } from "../src/ui/richText";
import { MODULES, STARS, SUPPLIES, banned, numbers, repeats, sentencesOf, starsOf } from "./textRules";

// 0.6.2t (REQ-BFG-032): the panels. T6's phone fit for every buyable module at every star (rigs, factories, cores,
// gear and supplies; placed, in cargo, on offer and fitted), with KNOWN_PHONE_CUTS empty and the flavour whole or absent
// (0b.5); T4's layout (perk after its effect, aligned stat rows, flavour and hint dimmer); the carry-overs 0b.1 (LIMPET
// WORKS at 1 star), 0b.2 (no stub last line), 0b.3 (captures wait for the caravan) and 0b.4 (SLAG vs METRONOME).

/** The 390x844 phone's info band (layout.ts; tests/shopRow.test.ts pins the phone's 167 x 361 view). */
const PHONE = buildLayout(167, 361, true, 5).info;
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
  ];
  for (const [id, def, s, gear, core] of special) out.push({ id: `installed ${id}`, kind: "installed", t: turretPanel(turretRun(def, s, gear, core), 0)! });
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
    expect([PHONE.w, PHONE.h]).toEqual([161, 69]);
    expect(buildLayout(180, 320, true, 5).info.h).toBeLessThan(30); // the small viewport: a header-only strip
    expect([DESK.w, DESK.h > 150]).toEqual([126, true]);
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
        expect(shownBlocks.some((b) => b.role === "merge"), `${id}: merge progress`).toBe(true);
      }
      if (kind === "rig") expect(r.hitsUp || shownBlocks.some((b) => b.role === "hits" || b.role === "warn"), `${id}: hits`).toBe(true);
      // 0b.5: the flavour shows whole or not at all
      expect(r.flavour, `${id}: flavour`).not.toBe("cut");
      if (r.flavour === "whole") counts.flavourWhole++;
      else counts.flavourAbsent++;
    }
    expect(KNOWN_PHONE_CUTS.size).toBe(0);
    expect(counts.cut).toBe(0);
    // the case counts (the REPORT quotes them): 396 rig cases as 0.6.2p's, then every other buyable module and supply
    expect([counts.rig, counts.cases]).toEqual([396, PANELS.length]);
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

  it("the 360x640 strip: an offer's header shows its one-line effect, on up to two lines", () => {
    const strip = buildLayout(180, 320, true, 5).info;
    for (const { id, t } of PANELS.filter((p) => p.kind === "offer")) {
      const plan = planPanel(t, strip);
      expect(plan.headerOnly, id).not.toBeNull();
      expect(plan.headerOnly!.lines.join(" "), id).toBe(t.headerOnly!.texts[0]);
      expect(plan.headerOnly!.lines.length, id).toBeLessThanOrEqual(2);
    }
  });
});

describe("0.6.2t T4: the panels' layout", () => {
  it("a perk's name comes after the sentence it names, in the perk colour, never first", () => {
    for (const { id, t } of PANELS) for (const l of lay(t.body, 116, "5")) {
      if (!l.b.perk) continue;
      const last = l.lines.at(-1)!.spans.at(-1)!;
      expect([last.t, last.c], id).toEqual([l.b.perk, PERK_COLOUR]);
      expect(l.lines[0].spans[0].t.startsWith("★"), `${id}: ${l.b.text}`).toBe(false);
    }
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

  it("stat rows align: a panel's row values share one column, its grid values theirs", () => {
    const run = newRun("furnace", 5, "rows");
    run.build.mods.push({ uid: 5, def: "scatter", turret: 0, stars: 2 } as Run["build"]["mods"][number]);
    const rows = lay(turretPanel(run, 0)!.body, 116, "5").filter((l) => l.b.role === "row").flatMap((l) => l.lines);
    expect(new Set(rows.map((l) => l.indent)).size).toBe(1);
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
    // a joining belt's sub line: two short sentences (the desk column breaks it after the first)
    expect(routePanel(joinRun(), 1)!.sub).toBe("JOINS BELT 1. FEEDS TURRET 1.");
    expect(planPanel(routePanel(joinRun(), 1)!, DESK).subs).toEqual(["JOINS BELT 1.", "FEEDS TURRET 1."]);
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
    for (const n of [1, 2]) texts.add(mergeProgressText(n));
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
    // the polish's case: merge progress is its own sentence and never breaks on the phone band
    for (const n of [1, 2]) expect(wrapText(mergeProgressText(n), 151, "3")).toHaveLength(1);
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
    for (const { id, t } of PANELS) for (const b of t.body) {
      if (b.role === "row" || b.role === "grid" || b.role === "hits" || b.role === "note") continue;
      expect(banned(b.text), `${id}: ${b.text}`).toEqual([]);
    }
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
    // the counts the REPORT quotes (881b38f: 1076 panels with a flavour block, 1491 sentences, 1330 of them flagged)
    expect([flavoured, sentences]).toEqual([85, 85]);
    console.log(`F1 guard: ${PANELS.length} panels, ${flavoured} with a flavour block, ${sentences} flavour sentences, 0 repeats`);
  });

  it("the guard catches what 881b38f showed: the effect restated, a number quoted again, MIMIC FORGE ★3's contradiction", () => {
    const at = (def: string, s = 1) => abilityText(def, s).sentences;
    // 881b38f's flavour, each against its own ability text: every one fails the guard
    const old: [string, number, string][] = [
      ["grease", 1, "THE BELT RUNS 60% FASTER FROM ITS HIT."], // a number quoted again
      ["grease", 1, "METRONOME'S LOCKED BELTS GAIN +1 DAMAGE."],
      ["temper", 1, "ADDS 2 BURN."], // the opening, cut short
      ["temper", 1, "EACH BURN STACK DEALS 1 DAMAGE A SECOND FOR 3 SECONDS AFTER THE HIT."],
      ["frostbite", 1, "FROST ROUNDS FREEZE MACHINES AND PAUSE THEIR TIMERS."], // the effect in other words
      ["mimic", 3, "STAMPS YOUR HERO'S SIGNATURE AMMO INTO TWO MORE ROUTES."], // and TWO against FEEDS 2 BELTS
    ];
    for (const [def, s, f] of old) expect(faults(f, at(def, s)).length, `${def} ★${s}: ${f}`).toBeGreaterThan(0);
    expect(faults("THE BELT RUNS 60% FASTER FROM ITS HIT.", at("grease"))).toEqual(["quotes 60"]);
    expect(faults("STAMPS YOUR HERO'S SIGNATURE AMMO INTO TWO MORE ROUTES.", at("mimic", 3))[0]).toBe("quotes 2");
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
