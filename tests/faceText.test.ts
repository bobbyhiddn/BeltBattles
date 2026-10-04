import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newRun, type Run } from "../src/game/run";
import { AMMO, HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { effectAt, fusible, FUSE_MAX } from "../src/sim/stars";
import { gearSlotsOf } from "../src/sim/deck";
import { ICON, KEYWORDS, stripIcons } from "../src/render/font";
import { STAT_ROW_MAX } from "../src/ui/icons";
import { cardText, n1, n2, percent } from "../src/ui/abilityText";
import { captureFormats, fmtCount, fmtDmg, fmtGold, fmtPct, fmtSec, fmtSpeed, FORMATTERS } from "../src/ui/statFormat";
import {
  FACE_IDS, faceAt, faceDiff, faceLines, faceMerge, faceNext, factoryStats, hasFace, heroFace, heroPlaystyle, turretStats,
} from "../src/ui/faces";
import { buildLayout } from "../src/screens/build/layout";
import { cargoPanel, fittedPanel, itemPanel, keptWhole, offerPanel, planPanel, type PanelText } from "../src/screens/build/inspector";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";

// U2a (REQ-BFG-046, REQ-BFG-047): the face kit (src/ui/statFormat.ts, src/ui/faces.ts, src/screens/build/faceBlocks.ts).
// The faces are pinned through the formatter registry (value to string, N1 6.4), never through literal strings: at
// NUMBERS, re-pinning is a regeneration.

const STARS = [1, 2, 3];
/** Every context that changes a face's numbers: MIMIC FORGE's hero, a core's class factor (the heroes' and others). */
const contexts = (def: string): { k?: number; hero?: HeroId }[] =>
  def === "mimic" ? PLAYABLE_HEROES.map((hero) => ({ hero })) : ITEMS[def].kind === "core" ? [1, 0.8, 0.75, 0.55, 0.4].map((k) => ({ k })) : [{}];
const starsOf = (def: string): number[] => (fusible(def) ? STARS : [1]);
/** The numbers a line shows, its star labels aside. */
const numbersIn = (s: string): string[] => [...stripIcons(s).replace(/★\d/g, "").matchAll(/\d+(?:\.\d+)?%?/g)].map((m) => m[0]);

describe("U2a the formatters: one per unit; the interim prints today's value with today's display rounding (N1 2.6)", () => {
  it("each formatter equals the helper today's text uses for that number", () => {
    for (const x of [0, 0.2, 1, 1.2, 2.5, 3.5, 4.4, 6.6, 8.75, 10.5, 12, 28]) expect(fmtDmg(x)).toBe(n1(x));
    for (const x of [0.36, 0.405, 0.44, 0.45, 0.495, 0.55, 0.675, 0.72, 0.765, 0.8, 0.93, 1, 1.25, 1.6, 2.8, 6]) {
      expect(fmtSpeed(x)).toBe(n2(x));
      expect(fmtSec(x)).toBe(n2(x));
    }
    for (const x of [0.15, 0.2, 0.25, 0.3, 0.42, 0.48, 0.66, 1.05, 1.5, 1 / 0.6 - 1, 1.15 - 1]) expect(fmtPct(x)).toBe(percent(x));
    for (const n of [0, 1, 2, 3, 15, 24]) expect([fmtCount(n), fmtGold(n)]).toEqual([String(n), String(n)]);
  });

  it("the registry records unit, value and printed text, nested captures included; outside a capture nothing is kept", () => {
    const { value, records } = captureFormats(() => {
      const inner = captureFormats(() => fmtPct(0.15), "inner");
      expect(inner.records).toEqual([{ unit: "pct", value: 0.15, printed: "15%", site: "inner" }]);
      return `${fmtDmg(1.2)} ${fmtSec(3)} ${fmtSpeed(0.55)} ${fmtCount(2)}`;
    }, "outer");
    expect(value).toBe("1.2 3 0.55 2");
    expect(records.map((r) => [r.unit, r.value, r.printed])).toEqual([
      ["pct", 0.15, "15%"], ["dmg", 1.2, "1.2"], ["sec", 3, "3"], ["speed", 0.55, "0.55"], ["count", 2, "2"],
    ]);
    expect(Object.keys(FORMATTERS).sort()).toEqual(["count", "dmg", "gold", "pct", "sec", "speed"]);
  });
});

describe("U2a the faces: every number from sim data through one formatter", () => {
  it("scope: 39 pieces (14 factories, 12 cores, 13 turrets) and 3 heroes; the STUN-fold, crit and RULES pieces keep today's text", () => {
    const kinds = FACE_IDS.map((d) => ITEMS[d].kind);
    expect([kinds.filter((k) => k === "factory").length, kinds.filter((k) => k === "core").length, kinds.filter((k) => k === "turret").length]).toEqual([14, 12, 13]);
    for (const keep of ["scrapper", "capacitor", "assembly", "sabot", "frostbite", "dragchain", "drake", "steambreech"]) expect(hasFace(keep), keep).toBe(false);
    expect(PLAYABLE_HEROES.filter((h) => heroFace(h))).toEqual(["weaver", "foundry", "bastion"]);
    expect(heroFace("furnace")).toBeNull();
  });

  it("every number drawn on every face, at every star and context, is a number its own render printed through a formatter", () => {
    let checked = 0;
    for (const def of FACE_IDS) for (const o of contexts(def)) for (const s of starsOf(def)) {
      const { value: fl, records } = captureFormats(() => faceLines(def, s, o));
      for (const r of records) expect(FORMATTERS[r.unit](r.value), `${def} ★${s}`).toBe(r.printed);
      const printed = records.map((r) => r.printed);
      for (const line of [fl!.stats ?? "", ...fl!.rules.map((r) => r.text), ...fl!.reminders]) {
        for (const n of numbersIn(line)) {
          expect(printed, `${def} ★${s} ${JSON.stringify(o)}: ${n} in ${stripIcons(line)}`).toContain(n);
          printed.splice(printed.indexOf(n), 1);
          checked++;
        }
      }
    }
    for (const h of PLAYABLE_HEROES) {
      const { value: hf, records } = captureFormats(() => heroFace(h));
      if (!hf) continue;
      const printed = records.map((r) => r.printed);
      for (const line of [...hf.rules.map((r) => r.text), ...hf.reminders]) for (const n of numbersIn(line)) expect(printed, `${h}: ${n}`).toContain(n);
    }
    expect(checked).toBeGreaterThan(400);
  });

  it("the stat pairs come from the data functions: a factory's cadence, slug damage and belts; a turret's cadence, loads and gear slots", () => {
    for (const def of FACE_IDS.filter((d) => ITEMS[d].kind === "factory" && d !== "mimic")) for (const s of starsOf(def)) {
      const fs = effectAt(def, s).factory!, row = factoryStats(def, s);
      expect(row[0], def).toEqual(["SEC", fmtSpeed(fs.interval)]); // the speed pair: SEC until NUMBERS (N1 2.6)
      expect(row[1], def).toEqual(["DMG", fmtDmg(fs.base ?? AMMO[fs.ammo].base)]);
      if (row[2]) expect(row[2], def).toEqual(["BELT", fmtCount(fs.outputs)]);
    }
    for (const h of PLAYABLE_HEROES) {
      const sig = ITEMS[HEROES[h].factory].factory!;
      expect(factoryStats("mimic", 1, h).slice(0, 2)).toEqual([["SEC", fmtSpeed(sig.interval * 1.4)], ["DMG", fmtDmg(AMMO[HEROES[h].ammo].base)]]);
    }
    for (const def of FACE_IDS.filter((d) => ITEMS[d].kind === "turret")) for (const s of STARS) {
      const t = effectAt(def, s).turret!;
      expect(turretStats(def, s), def).toEqual([["SEC", fmtSpeed(t.fireInterval)], ["SLUG", fmtCount(t.window)], ["GEAR", fmtCount(gearSlotsOf(def, s))]]);
    }
    for (const def of FACE_IDS) for (const s of starsOf(def)) expect(faceAt(def, s, { hero: "furnace" })!.stats.length).toBeLessThanOrEqual(STAT_ROW_MAX);
  });

  it("no face template holds a digit: every number is a formatter's (src/ui/faces.ts and faceBlocks.ts string literals)", () => {
    for (const file of ["src/ui/faces.ts", "src/screens/build/faceBlocks.ts"]) {
      const bad = stringLiterals(readFileSync(file, "utf8")).filter((t) => /\d/.test(t));
      expect(bad, file).toEqual([]);
    }
    // the scanner itself: it finds a digit in a literal and in a template's text, never in an expression or a comment
    expect(stringLiterals("const a = `X ${f(2)} Y`; // 3\nconst b = \"4 Z\"; /* 5 */ const c = `${`7`}`;")).toEqual(["X ", " Y", "4 Z", "7"]);
  });

  it("NEXT★ is computed: the next star's numbers that differ, each one the next star prints; the merge line the same from ★1", () => {
    for (const def of FACE_IDS.filter(fusible)) for (const o of contexts(def)) for (let s = 1; s < FUSE_MAX; s++) {
      const nx = faceNext(def, s, o)!;
      expect(nx.label).toBe(`NEXT ★${s + 1}:`);
      const diff = faceDiff(def, s, s + 1, o)!;
      expect(nx.text).toBe(diff ? `${nx.label} ${diff}` : nx.label);
      expect(diff || nx.perk, `${def} ★${s}: a next star changes a number or brings a perk`).toBeTruthy();
      const { records } = captureFormats(() => faceAt(def, s + 1, o));
      for (const n of numbersIn(diff)) expect(records.map((r) => r.printed), `${def} ★${s}: ${n}`).toContain(n);
      expect(faceMerge(def, s + 1, o)).toBe(`MERGES INTO ★${s + 1}${faceDiff(def, 1, s + 1, o) ? `: ${faceDiff(def, 1, s + 1, o)}` : ""}.`);
    }
    expect(faceNext("press", FUSE_MAX)).toBeNull();
    expect(faceNext("kiln", 1)).toBeNull(); // a hero's factory never fuses
  });
});

describe("U2a the faces keep REQ-BFG-032's four rules", () => {
  const all = (): string[] => [
    ...FACE_IDS.flatMap((def) => contexts(def).flatMap((o) => starsOf(def).flatMap((s) => {
      const fl = faceLines(def, s, o)!, nx = faceNext(def, s, o);
      return [fl.stats ?? "", ...fl.rules.map((r) => r.text), ...fl.reminders, ...(nx ? [nx.text] : []), ...(s > 1 ? [faceMerge(def, s, o)!] : [])];
    }))),
    ...PLAYABLE_HEROES.flatMap((h) => { const f = heroFace(h); return f ? [...f.rules.map((r) => r.text), ...f.reminders] : []; }),
  ].filter(Boolean);

  it("no middle-dot chains, no hand-wrapping (no line break, no doubled or edge space)", () => {
    for (const t of all()) {
      expect(t.includes("·"), t).toBe(false);
      expect(/\n|  |^ | $/.test(t), JSON.stringify(t)).toBe(false);
    }
  });

  it("a keyword draws from one source: a rule names it in panel style (its icon then its word), never as a bare word", () => {
    for (const t of all()) for (const k of KEYWORDS) {
      for (const m of t.matchAll(new RegExp(`${k}`, "g"))) {
        const before = t[m.index! - 1];
        expect(before, `${k} in ${stripIcons(t)}`).toBe(ICON[k]); // always the icon glued before the word
      }
    }
  });

  it("every shop offer of a piece with a face still shows its one-line effect", () => {
    for (const def of FACE_IDS.filter(fusible)) expect(cardText(def).length, def).toBeGreaterThan(0);
  });

  it("hero select: WEAVER's face is LOOM SLUGS HAVE FRAY 1 (review call 5); PLAYSTYLE in three words (C6)", () => {
    expect(stripIcons(heroFace("weaver")!.rules[0].text)).toBe(`${ITEMS.loom.name} SLUGS HAVE FRAY ${AMMO.thread.fray}.`);
    expect(heroFace("bastion")!.rules[0].label).toBe("LOAD:");
    expect(PLAYABLE_HEROES.map(heroPlaystyle)).toEqual([HEROES.furnace.pattern, "THREADS FRAY HULLS", "PAIRS FUSE STRONGER", HEROES.bastion.pattern]);
  });
});

/** The 390x844 phone's info band (tests/abilityPanels.test.ts's PHONE, 161 x 69) and the op view's phone band (402x690
 *  at x5: 241 x 414 art px, the zoomed band 235 x 122, 10 lines of 5x7; T1 REPORT 2.6). */
const PHONE = buildLayout(167, 361, true, 5).info;
const OP = buildLayout(241, 414, true, 5, true).info;

/** Every panel a face shows on: cargo (each hero for a core), placed (a factory), offer (none held, one held), fitted. */
function facePanels(): { id: string; t: PanelText }[] {
  const out: { id: string; t: PanelText }[] = [];
  for (const def of FACE_IDS) {
    const d = ITEMS[def];
    if (!fusible(def)) {
      const hero = (Object.keys(HEROES) as HeroId[]).find((h) => HEROES[h].factory === def)!;
      const run = newRun(hero, 5, "u2a");
      const uid = run.build.items.find((i) => i.def === def)!.uid;
      out.push({ id: `placed ${def}`, t: itemPanel(run, uid, true)! });
      continue;
    }
    for (const s of STARS) {
      for (const hero of (d.kind === "core" ? PLAYABLE_HEROES : ["furnace"]) as HeroId[]) {
        const run = newRun(hero, 5, "u2a");
        run.inventory = [{ uid: 900, def, ...(s > 1 ? { stars: s } : {}) }];
        out.push({ id: `cargo ${def} ★${s} ${hero}`, t: cargoPanel(run, 900, true)! });
      }
      if (d.kind === "factory") {
        const run = newRun("furnace", 5, "u2a");
        run.build.items.push({ uid: 901, def, x: 6, y: 6, ...(s > 1 ? { stars: s } : {}) });
        run.build.routes.push({ factory: 901, cells: [56, 55, 45, 35, 25, 15, 5] });
        out.push({ id: `placed ${def} ★${s}`, t: itemPanel(run, 901, true)! });
      }
      if (d.kind === "core") {
        const run = newRun("furnace", 5, "u2a");
        run.build.mods.push({ uid: 902, def, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]);
        out.push({ id: `fitted ${def} ★${s}`, t: fittedPanel(run, 902)! });
      }
    }
    for (const held of [[], [1]]) {
      const run = newRun("furnace", 5, "u2a");
      run.gold = 99;
      run.inventory = held.map((s, i) => ({ uid: 950 + i, def, ...(s > 1 ? { stars: s } : {}) }));
      run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
      out.push({ id: `offer ${def} held[${held}]`, t: offerPanel(run, 0, 0, true)! });
    }
  }
  return out;
}

describe("U2a fit: every panel in scope shows its face whole on the phone band and the op view", () => {
  const PANELS = facePanels();
  it("the stat row, the rules, NEXT★ and merge progress are kept whole (T6); the 5x7 face, or the report lists it", () => {
    const counts = { panels: 0, phone5x7: 0, phoneTight: 0, op5x7: 0, opTight: 0, reminderGaveWayPhone: 0, reminderGaveWayOp: 0 };
    const tightPhone: string[] = [];
    for (const { id, t } of PANELS) {
      counts.panels++;
      for (const [band, area] of [["phone", PHONE], ["op", OP]] as const) {
        const plan = planPanel(t, area);
        expect(plan.body.fits && keptWhole(plan), `${band} ${id} (variant ${plan.body.variant})`).toBe(true);
        const big = plan.body.font === "5" && !plan.body.tight;
        if (band === "phone") { if (big) counts.phone5x7++; else { counts.phoneTight++; tightPhone.push(id); } }
        else if (big) counts.op5x7++; else counts.opTight++;
        if (plan.body.dropped.some((b) => b.role === "reminder")) counts[band === "phone" ? "reminderGaveWayPhone" : "reminderGaveWayOp"]++;
      }
    }
    console.log(`U2a fit: ${JSON.stringify(counts)}`);
    console.log(`U2a phone tight: ${tightPhone.length}`);
    expect([OP.w, OP.h]).toEqual([235, 122]);
    expect(counts.op5x7).toBe(counts.panels); // the op view (402x690) draws every face in 5x7, no compact form
  });
});

/**
 * The text of every string literal in TypeScript source: "..." and '...' whole, a template's text parts (its ${...}
 * expressions scanned as code, so a template inside one is found too); comments skipped.
 */
function stringLiterals(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  const code = (stopAtBrace: boolean): void => {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
      if (ch === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
      if (ch === '"' || ch === "'") {
        let j = i + 1, s = "";
        while (src[j] !== ch) { if (src[j] === "\\") { s += src[j + 1]; j += 2; } else s += src[j++]; }
        out.push(s);
        i = j + 1;
        continue;
      }
      if (ch === "`") { i++; template(); continue; }
      if (stopAtBrace && ch === "{") depth++;
      if (stopAtBrace && ch === "}") { if (depth === 0) { i++; return; } depth--; }
      i++;
    }
  };
  const template = (): void => {
    let s = "";
    while (i < src.length) {
      const ch = src[i];
      if (ch === "\\") { s += src[i + 1]; i += 2; continue; }
      if (ch === "`") { i++; if (s) out.push(s); return; }
      if (ch === "$" && src[i + 1] === "{") { if (s) out.push(s); s = ""; i += 2; code(true); continue; }
      s += ch;
      i++;
    }
  };
  code(false);
  return out;
}
