import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { ITEMS, WAVE3_IDS, rigShape, withWave3, type HeroId } from "../src/sim/content";
import { key as K, rotField, setTurretList, type Placed } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { fusible } from "../src/sim/stars";
import { buildLayout } from "../src/screens/build/layout";
import {
  STOKER_IDLE, cargoPanel, gatlingClash, itemPanel, offerPanel, planPanel, rigPanel, routePanel, turretPanel, visibleLines,
  type Block, type Laid, type PanelText, type PLine,
} from "../src/screens/build/inspector";
import { KEPT_FLAVOUR, flavourText } from "../src/screens/build/flavour"; // 0.8.0 I1 M2: WAVE3_FLAVOUR's rows are in KEPT_FLAVOUR
import { hitText } from "../src/ui/abilityText";
import { STARS, banned, numbers } from "./textRules";

// 0.8.0 P1 (REQ-BFG-032): wave 3's text in the game's panels, with wave 3 turned on (withWave3): T6's phone fit and the
// desk column for every wave-3 module at every star (placed, in cargo, fitted and on offer), the flavour (none kept), T2
// in every panel sentence, the belt timeline's wave-3 rows (F2: every number says what it is; PLATING, RIGS and SHORTER
// join the stat rows' units), STOKER's panel (its factories, or IDLE beside none) and TWIN TRIGGER's clash on a GATLING
// SPOOL. tests/abilityText.test.ts holds the sentences, the NUMBERS rows and the card lines. When wave 3 goes live I1 folds
// these panels into tests/abilityPanels.test.ts (its PANELS and counts) and moves WAVE3_FLAVOUR's rows into KEPT_FLAVOUR.

/** The 390x844 phone's info band and the 1920x1080 desk's details column (as tests/abilityPanels.test.ts). */
const PHONE = buildLayout(167, 394, true, 5).info; // PACKS Q5: the 161 x 69 band (0.8.5's 167 x 361 plus the pack row)
const DESK = buildLayout(480, 270, false, 5).info;

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
/** A Furnace with the Kiln's belt up column 4 and a STAMP PRESS belt up column 6 (tests/abilityPanels.test.ts rigRun);
 *  rig `def` (uid 10, ★stars) at (x, y) turned `rot`, and `spare` ★1 copies of it in cargo. */
function rigRun(def: string, stars: number, x: number, y: number, rot: number, spare: number): Run {
  const run = newRun("furnace", 5, "w3text");
  run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def }));
  run.build = {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) }],
    routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
  };
  return run;
}
/** The layouts a rig's shape allows there (1, 2 and 3 hits, IDLE); a STOKER's: beside the Kiln, beside the STAMP PRESS,
 *  among belts only (IDLE: it never works belts) and off by itself (IDLE). */
function layouts(def: string): [string, number, number, number][] {
  if (ITEMS[def].gate?.stoke) return [["kiln", 3, 6, 0], ["press", 8, 6, 0], ["belts", 5, 3, 0], ["idle", 0, 9, 0]];
  const shape = rigShape(def)!;
  return [
    ["1hit", 3, 3, rotFacing(def, 1)],
    ...(shape === "L" ? [["2hit", 5, 2, 3]] : shape === "I" ? [] : [["2hit", 5, 3, 0]]),
    ...(shape === "T" || shape === "X" ? [["3hit", 5, 2, 0]] : []),
    ["idle", 0, 9, 0],
  ] as [string, number, number, number][];
}
/** A FURNACE with turret `def` (★stars) in slot 0, `gear` in its hardpoints, and a bought core if given. */
function turretRun(def: string, stars: number, gear: [string, number][], core?: [string, number]): Run {
  const run = newRun("furnace", 5, "w3turret");
  setTurretList(run.build, [{ slot: 0, def, uid: 700, ...(stars > 1 ? { stars } : {}) }]);
  gear.forEach(([g, s], i) => run.build.mods.push({ uid: 710 + i, def: g, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]));
  if (core) run.build.mods.push({ uid: 730, def: core[0], turret: 0, ...(core[1] > 1 ? { stars: core[1] } : {}) } as Run["build"]["mods"][number]);
  return run;
}

const W3 = WAVE3_IDS.map((id) => ITEMS[id]);

/** Every inspect panel the game can show for a wave-3 module, built with wave 3 on. */
function panels(): { id: string; kind: string; t: PanelText }[] {
  const out: { id: string; kind: string; t: PanelText }[] = [];
  for (const d of W3.filter((x) => x.kind === "gate")) {
    for (const s of STARS) for (const [lay, x, y, rot] of layouts(d.id)) for (const spare of [0, 1]) {
      out.push({ id: `rig ${d.id} ★${s} ${lay} spare${spare}`, kind: "rig", t: rigPanel(rigRun(d.id, s, x, y, rot, spare), 10)! });
    }
  }
  for (const d of W3) for (const s of STARS) for (const spare of [0, 1]) {
    for (const hero of (d.kind === "core" ? ["furnace", "weaver"] : ["furnace"]) as HeroId[]) {
      const run = newRun(hero, 5, "w3text");
      run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }, ...Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: d.id }))];
      out.push({ id: `cargo ${d.id} ★${s} ${hero} spare${spare}`, kind: "cargo", t: cargoPanel(run, 900)! });
    }
    if (d.kind === "factory") {
      const run = newRun("furnace", 5, "w3text");
      run.inventory = Array.from({ length: spare }, (_, i) => ({ uid: 800 + i, def: d.id }));
      run.build.items.push({ uid: 901, def: d.id, x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
      run.build.routes.push({ factory: 901, cells: [56, 55, 45, 35, 25, 15, 5] });
      out.push({ id: `placed ${d.id} ★${s} spare${spare}`, kind: "placed", t: itemPanel(run, 901)! });
    }
    if ((d.kind === "core" || d.kind === "mod") && spare === 0) {
      for (const hero of (d.kind === "core" ? ["furnace", "weaver"] : ["furnace"]) as HeroId[]) {
        const run = newRun(hero, 5, "w3text");
        run.build.mods.push({ uid: 902, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]);
        out.push({ id: `turret ${d.id} ★${s} ${hero}`, kind: "turret", t: turretPanel(run, 0)! });
      }
    }
  }
  for (const d of W3) for (const held of [[], [1], [2, 1]]) {
    const run = newRun("furnace", 5, "w3text");
    run.gold = 99;
    run.inventory = held.map((s, i) => ({ uid: 950 + i, def: d.id, ...(s > 1 ? { stars: s } : {}) }));
    run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id} held[${held}]`, kind: "offer", t: offerPanel(run, 0, 0)! });
  }
  // TWIN TRIGGER beside the gear and cores it meets: a GATLING SPOOL and a COMPOUND BREECH (its clash), a ROTARY (none)
  for (const [core, s] of [["gatling", 1], ["compound", 2], ["rotary", 3]] as [string, number][]) {
    out.push({ id: `installed twintrigger on ${core}`, kind: "installed", t: turretPanel(turretRun("bombard", 1, [["twintrigger", s], ["hopper", 1]], [core, s]), 0)! });
  }
  return out;
}
const PANELS = withWave3(panels);

/** How a panel shows on a band (tests/abilityPanels.test.ts fit): its plan, kept blocks whole, the flavour's state. */
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
    hitsUp: !!plan.body.sub,
  };
}

describe("0.8.0 P1: wave 3's panels fit the phone band and the desk column (T6), with nothing cut", () => {
  it("covers each module at every star where the game shows it: placed, in cargo, fitted and on offer", () => {
    const ids = new Set(PANELS.map((p) => p.id));
    for (const d of W3) for (const s of STARS) {
      for (const id of [
        `cargo ${d.id} ★${s} furnace spare0`,
        ...(d.kind === "gate" ? [`rig ${d.id} ★${s} ${d.gate?.stoke ? "kiln" : "1hit"} spare0`] : []),
        ...(d.kind === "factory" ? [`placed ${d.id} ★${s} spare0`] : []),
        ...(d.kind === "core" || d.kind === "mod" ? [`turret ${d.id} ★${s} furnace`] : []),
      ]) expect(ids.has(id), id).toBe(true);
    }
    for (const d of W3) for (const held of ["[]", "[1]", "[2,1]"]) expect(ids.has(`offer ${d.id} held${held}`), `${d.id} ${held}`).toBe(true);
    // 144 rig panels (24 layouts x 3 stars x 0 or 1 spare), 102 cargo, 12 placed, 21 fitted, 45 offers, 3 TWIN TRIGGER turrets
    expect(PANELS.length).toBe(144 + 102 + 12 + 21 + 45 + 3);
  });

  it("phone: the opening sentence, the hits (or IDLE), the perk, the next star and merge progress show whole", () => {
    for (const { id, kind, t } of PANELS) {
      const r = fit(t, PHONE);
      expect([r.plan.body.fits, r.keptWhole], `${id} (variant ${r.plan.body.variant})`).toEqual([true, true]);
      for (const role of ["ability", "next", "merge", "merges", "hits", "warn"] as const) expect(r.roleWhole(role), `${id}: ${role}`).toBe(true);
      const shown = r.plan.body.shown.map((l) => l.b);
      expect(shown.some((b) => b.role === "ability" || b.role === "row"), `${id}: opening`).toBe(true);
      if (t.body.some((b) => b.role === "next")) {
        expect(shown.some((b) => b.role === "next"), `${id}: next star`).toBe(true);
        expect(shown.some((b) => b.role === "merge"), `${id}: merge progress`).toBe(true);
      }
      if (kind === "rig") expect(r.hitsUp || shown.some((b) => b.role === "hits" || b.role === "warn"), `${id}: hits`).toBe(true);
      expect(r.flavour, `${id}: flavour`).toBe("absent");
      if (r.plan.body.sub) expect(r.plan.body.sub.length, id).toBeGreaterThan(0);
    }
  });

  it("desk: every panel fits the column whole in the 5x7 face", () => {
    for (const { id, t } of PANELS) {
      const r = fit(t, DESK);
      expect([r.plan.body.fits, r.keptWhole, r.plan.body.font], id).toEqual([true, true, "5"]);
    }
  });

  it("T2 in every panel's player text (the labelled stat rows aside); the 360x640 strip shows an offer's card line", () => {
    for (const { id, t } of PANELS) for (const b of t.body) {
      if (b.role === "row" || b.role === "grid" || b.role === "hits" || b.role === "note") continue;
      expect(banned(b.text), `${id}: ${b.text}`).toEqual([]);
    }
    const strip = buildLayout(180, 320, true, 5).info;
    for (const { id, t } of PANELS.filter((p) => p.kind === "offer")) {
      const plan = planPanel(t, strip);
      expect(plan.headerOnly!.lines.join(" "), id).toBe(t.headerOnly!.texts[0]);
      expect(plan.headerOnly!.lines.length, id).toBeLessThanOrEqual(2);
    }
  });

  // 0.8.0 I1 M2 (REPORT-P1 section 13): the switch is on, so WAVE3_FLAVOUR's rows are KEPT_FLAVOUR's (the same [] each)
  it("no flavour: each of the 15 keeps none (its rules are all in the ability text), in KEPT_FLAVOUR now the switch is on", () => {
    for (const id of WAVE3_IDS) {
      expect([KEPT_FLAVOUR[id], Object.prototype.hasOwnProperty.call(KEPT_FLAVOUR, id)], id).toEqual([[], true]);
      for (const s of STARS) expect(flavourText(id, s), id).toBe("");
    }
  });
});

describe("0.8.0 P1: STOKER's panel and TWIN TRIGGER's clash", () => {
  const panel = (id: string) => PANELS.find((p) => p.id === id)!.t;

  it("a STOKER names the factories it works; beside none it is IDLE with a factory warning, even among belts", () => {
    expect(panel("rig stoker ★1 kiln spare0").body[0].text).toBe("→ STOKES THE KILN");
    expect(panel("rig stoker ★2 press spare0").body[0].text).toBe("→ STOKES THE STAMP PRESS");
    expect(panel("rig stoker ★1 kiln spare0").sub).toBe("RIG · 1/2 ARROWS ON FACTORIES");
    for (const lay of ["belts", "idle"]) {
      const t = panel(`rig stoker ★1 ${lay} spare0`) as PanelText & { idle: boolean };
      expect([t.idle, t.body[0].role, t.body[0].text], lay).toEqual([true, "warn", STOKER_IDLE.warning]);
    }
    // its offer and cargo hints say where it goes
    expect(panel("offer stoker held[]").body.at(-1)!.text).toBe("TAP A CELL BESIDE A FACTORY: ITS ARROWS WORK THE FACTORIES THEY POINT AT, OR DRAG IT THERE.");
    expect(panel("cargo stoker ★1 furnace spare0").body.at(-1)!.text).toBe("TAP A CELL BESIDE A FACTORY: ITS ARROWS WORK THE FACTORIES THEY POINT AT.");
    expect(panel("offer pincer held[]").body.at(-1)!.text).toBe("TAP A CELL BESIDE A BELT: ITS ARROWS WORK THE BELT TILES THEY POINT AT, OR DRAG IT THERE.");
  });

  it("TWIN TRIGGER on a GATLING SPOOL or a COMPOUND BREECH: the turret panel says its load time does nothing there", () => {
    const warns = (core: string) => panel(`installed twintrigger on ${core}`).body.filter((b) => b.role === "warn").map((b) => b.text);
    expect(warns("gatling")).toContain("GATLING SPOOL: THE TWIN TRIGGER'S SHORTER LOAD TIME DOES NOTHING HERE, BUT PAIRS STILL HIT HARDER.");
    expect(warns("compound")).toContain("COMPOUND BREECH: THE TWIN TRIGGER'S SHORTER LOAD TIME DOES NOTHING HERE, BUT PAIRS STILL HIT HARDER.");
    expect(warns("rotary").filter((t) => t.includes("TWIN TRIGGER"))).toEqual([]);
    withWave3(() => expect(gatlingClash(turretRun("bombard", 1, [["twintrigger", 1]], ["gatling", 1]).build, 0, "gatling", true))
      .toEqual(["TWIN TRIGGER: ITS SHORTER LOAD TIME DOES NOTHING HERE."]));
  });
});

describe("0.8.0 P1: the belt timeline's wave-3 rows say what each number is (F2)", () => {
  /** F2's bare numbers (tests/abilityPanels.test.ts bare), with wave 3's units: PLATING, a RIG count, SHORTER. */
  const bare = (text: string): string[] => {
    const ws = text.replace(/[,():]/g, " ").split(/\s+/).filter(Boolean);
    return ws.flatMap((w, i) => {
      if (!/^[+-]?\d+(\.\d+)?%?$/.test(w)) return [];
      const next = ws[i + 1] ?? "";
      if (w.endsWith("%")) return /^(DAMAGE|FASTER|SLOWER|SHORTER)$/.test(next) ? [] : [w];
      return /^(SEC|LOADS?|DAMAGE|BURN|POISON|FRAY|HULL|HARASSMENT|COPIES|HITS?|TILES?|TIMES|PLATING|RIGS?)$/.test(next) ? [] : [w];
    });
  };

  it("each wave-3 rig's row at every star on the Kiln's belt: no bare number, and T2 holds", () => {
    let n = 0;
    withWave3(() => {
      for (const d of W3.filter((x) => x.kind === "gate" && !x.gate?.stoke)) for (const s of STARS) {
        const t = routePanel(rigRun(d.id, s, 3, 3, rotFacing(d.id, 1), 0), 0)!;
        const rows = t.body.filter((b) => b.role === "row" && !b.join).map((b) => b.text);
        expect(rows.some((r) => r.startsWith(d.name)), `${d.id} ★${s}: ${rows.join(" / ")}`).toBe(true);
        for (const r of rows) {
          expect(bare(r), `${d.id} ★${s}: ${r}`).toEqual([]);
          expect(banned(r).filter((x) => x !== "FLAT"), `${d.id} ★${s}: ${r}`).toEqual([]);
          n++;
        }
      }
    });
    expect(n).toBe(7 * 3);
  });

  it("the rows, written out: the walk's damage, and what the rig does that the walk can't count", () => {
    const h = (def: string, stars: number, more: object = {}) => hitText({ uid: 1, def, dir: 1, stars, tier: 1, ...more } as Parameters<typeof hitText>[0], "free");
    expect(h("plateroller", 2, { plate: 1.1 })).toBe("PLATE ROLLER +1.1 PLATING");
    expect(h("shieldwall", 1, { plate: 1, plated: { min: 12, flat: 3 } })).toBe("SHIELD WALL +1 PLATING, +3 DAMAGE AT 12 PLATING");
    expect([h("twingauge", 1, { flat: 3, matched: true }), h("twingauge", 1, { flat: 1, matched: false })])
      .toEqual(["TWIN GAUGE +3 DAMAGE ON A MATCHED BELT", "TWIN GAUGE +1 DAMAGE"]);
    expect([h("pincer", 1, { flat: 1, others: 0 }), h("pincer", 1, { flat: 5, others: 2 }), h("pincer", 1, { flat: 3, others: 1 })])
      .toEqual(["PINCER +1 DAMAGE", "PINCER +5 DAMAGE, CROSSFIRE WITH 2 RIGS", "PINCER +3 DAMAGE, CROSSFIRE WITH 1 RIG"]);
    expect(h("braceframe", 3)).toBe("BRACE FRAME ENEMY STALLS 85% SHORTER (95% SHORTER PLATED)");
    expect(h("twinlatch", 2, { flat: 2.2, hold: 1 })).toBe("TWIN LATCH +2.2 DAMAGE, HOLDS UP TO 1 SEC");
    expect(h("platebreaker", 1, { flat: 4 })).toBe("PLATE BREAKER +4 DAMAGE FOR 1 PLATING, ELSE +1 DAMAGE");
    // each row's numbers are the spec's at that star
    for (const s of STARS) expect(numbers(h("braceframe", s)).length).toBe(2);
  });
});

describe("0.8.0 P1: the switch keeps wave 3's text out of the game while it is off", () => {
  // 0.8.0 I1 M2: flipped (the switch is on): every listing has the 15; with the switch off for one call, none. PINCER's
  // text names no cap (VERIFIED-P1 H5: "UP TO 3 OTHERS" never binds)
  it("every listing has the wave-3 modules with the switch on, none with it off; their text is there either way", () => {
    for (const d of W3) expect([fusible(d.id), Object.keys(ITEMS).includes(d.id)], d.id).toEqual([true, true]);
    withWave3(() => { for (const d of W3) expect(Object.keys(ITEMS).includes(d.id), d.id).toBe(false); }, false);
    // a wave-3 rig placed on a deck reads its text either way (the panels are pure)
    const t = rigPanel(rigRun("pincer", 1, 3, 3, rotFacing("pincer", 1), 0), 10)!;
    expect(t.body.find((b) => b.role === "ability")!.text).toBe("ADDS 1 DAMAGE TO EACH PAYLOAD IT HITS, AND 2 MORE FOR EACH OTHER RIG HITTING THAT TILE.");
    const placed: Placed = { uid: 10, def: "pincer", x: 3, y: 3 };
    expect(placed.def in ITEMS).toBe(true);
  });
});
