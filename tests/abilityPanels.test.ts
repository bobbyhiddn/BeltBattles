import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newRun, type Run } from "../src/game/run";
import { ITEMS, rigShape, type HeroId } from "../src/sim/content";
import { key as K, rotField, walkRoute } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { effectAt, fusible } from "../src/sim/stars";
import { textWidth } from "../src/render/font";
import { C } from "../src/render/palette";
import { buildLayout } from "../src/screens/build/layout";
import {
  ROLE, beltKind, cargoPanel, itemPanel, lay, offerPanel, planPanel, rigPanel, routePanel, turretPanel, visibleLines,
  type Block, type Laid, type PanelText, type PLine,
} from "../src/screens/build/inspector";
import { abilityText, cardText, gist, mergeProgressText } from "../src/ui/abilityText";
import { flavourText } from "../src/screens/build/flavour";
import { PERK_COLOUR, lineText, stubLine, wrapText } from "../src/ui/richText";
import { MODULES, STARS, SUPPLIES, banned } from "./textRules";

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
      expect(shownBlocks.some((b) => b.role === "ability" || b.role === "row"), `${id}: opening`).toBe(true);
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
    expect(small).toEqual([]); // the desk column's ability text never drops to the 3x5 face
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
    const cargo = PANELS.find((p) => p.id === "cargo temper ★1 furnace spare0")!;
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
