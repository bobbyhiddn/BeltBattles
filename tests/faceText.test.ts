import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newRun, type Run } from "../src/game/run";
import { AMMO, HEROES, ITEMS, type HeroId } from "../src/sim/content";
import { effectAt, fusible, FUSE_MAX, outputsAt } from "../src/sim/stars";
import { gearSlotsOf } from "../src/sim/deck";
import { ICON, ICON_COLOUR, KEYWORDS, stripIcons, textWidth } from "../src/render/font";
import { STAT_ROW_MAX } from "../src/ui/icons";
import { cardText, percent } from "../src/ui/abilityText"; // NUM-4 (REQ-BFG-047): n1 and n2 are deleted (were imported here)
import { captureFormats, fmtCount, fmtDmg, fmtGold, fmtPct, fmtSec, fmtSpeed, FORMATTERS } from "../src/ui/statFormat";
import { FRACTIONAL } from "../src/ui/statFormat"; // NUM-4 (REQ-BFG-047): the findings list (a fraction, printed as it is)
import {
  FACE_IDS, faceAt, faceDiff, faceLines, faceMerge, faceNext, factoryStats, hasFace, heroFace, heroPlaystyle, turretStats,
} from "../src/ui/faces";
import { INTERIM_CAVEATS, REMINDER, gearStats, rigStats, supplyStats } from "../src/ui/faces"; // U2b
import { REMINDER_RANK, REMINDER_STEP, faceBlocks } from "../src/screens/build/faceBlocks"; // U2b F4-F6
import { FRAY_BONUS, FRAY_MAX } from "../src/sim/content"; // U2b F3
import { rateMul } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): the whole rate %
import { factorySpeed } from "../src/sim/content"; // NUM-4 (REQ-BFG-047): MIMIC's SPEED as factoryStats reads it (secPer's 30 / speed left the faces)
import { roundHalfUp } from "../src/sim/pct"; // NUM-2: MIMIC's speed rounds half up once (battle.ts factoryDef)
import { PLATE_CAP } from "../src/sim/races/bastion"; // U2b F3
import { ROLE } from "../src/screens/build/inspector"; // U2b F5
import { flavour } from "../src/screens/build/flavour"; // U2b F2
import { CAPTAIN_FORMS, captainSpans } from "../src/ui/captainText"; // U2b: the captains
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals"; // U2b
import { key as K, rotField } from "../src/sim/deck"; // U2b: a placed rig
import { rotFacing } from "../src/sim/beltside"; // U2b
import { computeView } from "../src/core/io"; // U2b: the op view as the game plans it
import { buildScale } from "../src/screens/build/layout"; // U2b
import { tapPx } from "../src/ui/tap"; // U2b
import { buildLayout } from "../src/screens/build/layout";
import { cargoPanel, fittedPanel, itemPanel, keptWhole, offerPanel, planPanel, type PanelText } from "../src/screens/build/inspector";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { icons } from "../src/render/font"; // U2d F1
import { livePerk } from "../src/ui/abilityText"; // U2d F1
import { NEXT_LINE_W, type FaceLines } from "../src/ui/faces"; // U2d F1
import { GLOSSARY_WRAP_W } from "../src/ui/glossary"; // U2d F1
import { banned } from "./textRules"; // U2d step 1
import { STUN_CAUSES } from "../src/sim/content"; // NUM-3 (R1's STUN fold): MANTLET's immunity
import { SIM } from "../src/ui/abilityText"; // NUM-3: SCRAPPER's queue cap
import { FURNACE_LONG_BELT } from "../src/sim/battle"; // Y1: FURNACE's hero face, its long-belt rate %

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

// NUM-4 (REQ-BFG-047; N1 2.5): retitled. The interim (N1 2.6: each formatter printed today's value with today's display
// rounding, abilityText.ts n1 / n2 / percent) ended with NUM-4's bodies; was "... the interim prints today's value with
// today's display rounding (N1 2.6)"
describe("U2a the formatters: one per unit; NUM-4: each prints the sim's whole value as it is (N1 2.5; was the interim's rounding, N1 2.6)", () => {
  it("NUM-4: each formatter prints the sim's whole value as it is; a fraction is recorded in FRACTIONAL, never rounded (replaces: each formatter equals the helper today's text uses)", () => {
    // NUM-4 (REQ-BFG-047): replaces "each formatter equals the helper today's text uses for that number" (fmtDmg was n1,
    // fmtSpeed and fmtSec n2, fmtPct percent): n1 and n2 (toFixed(1) / toFixed(2)) are deleted. The same probes, each held to
    // NUM-4's bodies: a whole value prints as String(value) and is no finding; a fraction prints as it is, never rounded,
    // and is recorded in FRACTIONAL (unit, value, printed); fmtPct prints a whole % (x 100 rounded only within float noise)
    // and is still the % the text prints (abilityText percent). The findings so far are set aside and put back after, so
    // this probe's own fractions pollute no other check.
    const saved = FRACTIONAL.splice(0);
    try {
      const probe = (f: (x: number) => string, unit: string, x: number): void => {
        const n = FRACTIONAL.length;
        expect(f(x), `${unit} ${x}`).toBe(String(x));
        expect(FRACTIONAL.slice(n), `${unit} ${x}`).toEqual(Number.isInteger(x) ? [] : [{ unit, value: x, printed: String(x), site: "" }]);
      };
      for (const x of [0, 0.2, 1, 1.2, 2.5, 3.5, 4.4, 6.6, 8.75, 10.5, 12, 28, 40, 250]) probe(fmtDmg, "dmg", x);
      for (const x of [0.36, 0.405, 0.44, 0.45, 0.495, 0.55, 0.675, 0.72, 0.765, 0.8, 0.93, 1, 1.25, 1.6, 2.8, 6, 19, 55]) {
        probe(fmtSpeed, "speed", x);
        probe(fmtSec, "sec", x);
      }
      // a whole %: 0.15 is "15%", 0.07 "7%" (x 100 is 7.000000000000001: float noise, not a fraction); no finding
      const whole: [number, string][] = [
        [0, "0%"], [0.07, "7%"], [0.15, "15%"], [0.2, "20%"], [0.25, "25%"], [0.3, "30%"], [0.42, "42%"], [0.48, "48%"], [0.66, "66%"],
        [1.05, "105%"], [1.5, "150%"], [1.15 - 1, "15%"], [2.3 - 1, "130%"], [3.1 - 1, "210%"],
      ];
      for (const [x, p] of whole) {
        const n = FRACTIONAL.length;
        expect([fmtPct(x), percent(x)], `${x}`).toEqual([p, p]);
        expect(FRACTIONAL.length, `${x}`).toBe(n);
      }
      // a fractional % (1 / 0.6 - 1 printed "67%" before NUM-4) prints as it is, x 100 never rounded, and is a finding
      for (const x of [1 / 0.6 - 1, 0.125]) {
        const n = FRACTIONAL.length;
        expect(fmtPct(x), `${x}`).toBe(`${x * 100}%`);
        expect(FRACTIONAL.slice(n), `${x}`).toEqual([{ unit: "pct", value: x, printed: `${x * 100}%`, site: "" }]);
      }
      for (const n of [0, 1, 2, 3, 15, 24]) expect([fmtCount(n), fmtGold(n)]).toEqual([String(n), String(n)]);
    } finally {
      FRACTIONAL.splice(0, FRACTIONAL.length, ...saved);
    }
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
  // SUS-B (REQ-BFG-069): + MEND PRESS (a factory), WARD BELL and MENDING LOOM (gear). Their faces exist while the
  // sustain switch is off (ITEMS resolves them; no listing shows them), so every face rule below runs on them already
  // Y7b2 (the flip): retitled, was "scope: 74 pieces (...; SUS-B 1 factory, 2 gear) and 4 heroes (Y1: FURNACE); the crit and
  // RULES pieces keep today's text". STAR_FACES folded into FACES: 20 pieces' first faces joined (faces.ts, "folded at the
  // flip"), so SIFTER (dormant) is the one buyable-kind piece left with today's text (the signature CLOCKWORKS and SUMP
  // have none either)
  it("scope: 94 pieces (U2a 14 factories, 12 cores, 13 turrets; U2b 18 rigs, 5 gear, 2 supplies; NUM-3 the 7 STUN-fold pieces; SUS-B 1 factory, 2 gear; Y7b2 the 20 folded faces) and 4 heroes (Y1: FURNACE); SIFTER keeps today's text", () => {
    const kinds = FACE_IDS.map((d) => ITEMS[d].kind);
    const n = (k: string) => kinds.filter((x) => x === k).length;
    // NUM-3 (R1's STUN fold): + SCRAPPER, SABOT, FROSTBITE and DRAG CHAIN FOUNDRY (factories), TOLLBOOTH (a rig), FLAK SCREEN
    // and MANTLET (gear); SUS-B: + MEND PRESS (a factory), WARD BELL and MENDING LOOM (gear). Was [14, 12, 13, 18, 5, 2], 64
    // pieces; num3 [18, 12, 13, 19, 7, 2], susb [15, 12, 13, 18, 7, 2]; x1 (cap's merge of the two) holds both
    // Y7b2 (the flip): + ASSEMBLY LINE (a factory), CAPACITOR, DRAKE NOZZLE and STEAM BREECH (cores), the 11 rigs and the 5
    // gear below (was [19, 12, 13, 19, 9, 2], 74 pieces)
    expect([n("factory"), n("core"), n("turret"), n("gate"), n("mod"), n("supply")]).toEqual([20, 15, 13, 30, 14, 2]);
    for (const faced of ["scrapper", "sabot", "frostbite", "dragchain", "tollbooth", "flak", "mantlet", "mendpress", "wardbell", "mendingloom"]) expect(hasFace(faced), faced).toBe(true);
    // Y7b2 (the flip): they have faces now (were toBe(false))
    for (const keep of ["capacitor", "assembly", "drake", "steambreech"]) expect(hasFace(keep), keep).toBe(true);
    // U2b: SHIELD WALL (IRON WALL since SUS-B), LONGCASE and FINISHER RAM (N1 3.3's crit pieces) and the 11 RULES rigs and
    // 3 RULES gear keep today's text (NUM-3: TOLLBOOTH, FLAK SCREEN and MANTLET left this list: they have faces). Y7b2 (the
    // flip): all but SIFTER have faces now (each was toBe(false)); SIFTER keeps today's text
    for (const keep of ["shieldwall", "longcase", "ram", "venom", "keg", "bellows", "quench", "lodestone",
      "counterweight", "twingauge", "pincer", "braceframe", "twinlatch", "hopper", "twintrigger", "seamwelder"]) expect(hasFace(keep), keep).toBe(true);
    expect(hasFace("sifter")).toBe(false);
    // Y1 (STAR-D 4.2, REVIEW-STARD R5): FURNACE's hero face, two one-line abilities (was ["weaver", "foundry", "bastion"]
    // and heroFace("furnace") null: it drew heroTrick's two-clause sentence)
    expect(PLAYABLE_HEROES.filter((h) => heroFace(h))).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    expect(heroFace("furnace")!.rules.map((r) => stripIcons(r.text))).toEqual([
      `KILN SLUGS HAVE HEAT ${fmtDmg(AMMO.cinder.rideScale!)}.`,
      `GUNS ON ${fmtCount(SIM.furnaceLongTiles)}+ TILE BELTS FIRE ${fmtPct(FURNACE_LONG_BELT / 100)} FASTER.`,
    ]);
  });

  it("every number drawn on every face, at every star and context, is a number its own render printed through a formatter", () => {
    let checked = 0;
    for (const def of FACE_IDS) for (const o of contexts(def)) for (const s of starsOf(def)) {
      const { value: fl, records } = captureFormats(() => faceLines(def, s, o));
      for (const r of records) expect(FORMATTERS[r.unit](r.value), `${def} ★${s}`).toBe(r.printed);
      const printed = records.map((r) => r.printed);
      // U2b: the interim perk clause (F6) and caveats (F5) too
      for (const line of [fl!.stats ?? "", ...fl!.rules.map((r) => r.text), ...fl!.reminders, fl!.clause?.text ?? "", ...(fl!.caveats ?? [])]) {
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
      // NUM-4 (REQ-BFG-047): the speed pair is ["RATE", speed], the factory's SPEED through fmtSpeed (faces.ts speedPair); was
      // ["SEC", 30 / speed], SEC until NUMBERS (N1 2.6; NUM-2: 30 / speed, fs.interval before)
      expect(row[0], def).toEqual(["RATE", fmtSpeed(fs.speed)]);
      // NUM-3: a SCRAPPER's slug carries its scrapFlat on top (Battle.stamp: p.flat += scrapFlat), so its DMG is the sum
      // Y7b2 (the flip; Y2, DESIGN-Y row 13): a LIMPET WORKS' DMG is its charge's blast, 100 / 230 / 360 (its base is 0: the
      // 20 on impact joined the blast; was its base alone, DMG 0)
      const blast = fs.round?.kind === "limpet" ? (fs.round as { blast: number }).blast : 0;
      expect(row[1], def).toEqual(["DMG", fmtDmg((fs.base ?? AMMO[fs.ammo].base) + (fs.scrapFlat ?? 0) + blast)]);
      if (row[2]) expect(row[2], def).toEqual(["BELT", fmtCount(outputsAt(def, s))]);
    }
    for (const h of PLAYABLE_HEROES) {
      const sig = ITEMS[HEROES[h].factory].factory!;
      // NUM-2 (REQ-BFG-047): MIMIC ★1 at the hero factory's speed x its whole rate % (-29), rounded half up once as the battle
      // does (battle.ts factoryDef), 30 / that (was sig.interval * 1.4, its interval x)
      const mimic = roundHalfUp(sig.speed * rateMul(effectAt("mimic", 1).factory!.rate));
      // NUM-4 (REQ-BFG-047): that SPEED is the data function's (factorySpeed, which factoryStats reads), and the pair is
      // ["RATE", speed] (was ["SEC", 30 / speed])
      expect(factorySpeed("mimic", effectAt("mimic", 1).factory!, h), h).toBe(mimic);
      expect(factoryStats("mimic", 1, h).slice(0, 2)).toEqual([["RATE", fmtSpeed(mimic)], ["DMG", fmtDmg(AMMO[HEROES[h].ammo].base)]]);
    }
    for (const def of FACE_IDS.filter((d) => ITEMS[d].kind === "turret")) for (const s of STARS) {
      const t = effectAt(def, s).turret!;
      // NUM-4 (REQ-BFG-047): the speed pair is ["RATE", speed], the turret's SPEED through fmtSpeed (was ["SEC", 30 / speed];
      // NUM-2: 30 / speed, t.fireInterval before)
      expect(turretStats(def, s), def).toEqual([["RATE", fmtSpeed(t.speed)], ["SLUG", fmtCount(t.window)], ["GEAR", fmtCount(gearSlotsOf(def, s))]]);
    }
    for (const def of FACE_IDS) for (const s of starsOf(def)) expect(faceAt(def, s, { hero: "furnace" })!.stats.length).toBeLessThanOrEqual(STAT_ROW_MAX);
    // U2b: a rig, a piece of gear and a supply carry no stat pair (R1 C4); their numbers are their rule's
    for (const def of FACE_IDS) for (const s of starsOf(def)) {
      const kind = ITEMS[def].kind;
      if (kind === "gate") expect(faceAt(def, s)!.stats, def).toEqual(rigStats(def, s));
      if (kind === "mod") expect(faceAt(def, s)!.stats, def).toEqual(gearStats(def, s));
      if (kind === "supply") expect(faceAt(def, s)!.stats, def).toEqual(supplyStats(def));
      if (kind === "gate" || kind === "mod" || kind === "supply") expect(faceAt(def, s)!.stats, def).toEqual([]);
    }
  });

  it("no face template holds a digit: every number is a formatter's (src/ui/faces.ts and faceBlocks.ts string literals)", () => {
    for (const file of ["src/ui/faces.ts", "src/screens/build/faceBlocks.ts", "src/ui/captainText.ts"]) { // U2b: + captainText
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

  it("NEXT★ is one line on the op view's band (225 px of 5x7, T1 2.6), its perk name included", () => {
    let lines = 0, widest = 0;
    for (const def of FACE_IDS.filter(fusible)) for (const o of contexts(def)) for (let s = 1; s < FUSE_MAX; s++) {
      const nx = faceNext(def, s, o)!;
      const text = nx.text === nx.label ? `${nx.label} ${nx.perk ?? ""}`.trim() : `${nx.text}${nx.perk ? ` ★${s + 1} ${nx.perk}` : ""}`;
      widest = Math.max(widest, textWidth(text, "5"));
      expect(textWidth(text, "5"), `${def} ★${s}: ${stripIcons(text)}`).toBeLessThanOrEqual(225);
      lines++;
    }
    console.log(`U2a NEXT★: ${lines} lines, the widest ${widest} px of 225`);
  });
});

describe("U2a the faces keep REQ-BFG-032's four rules", () => {
  const all = (): string[] => [
    ...FACE_IDS.flatMap((def) => contexts(def).flatMap((o) => starsOf(def).flatMap((s) => {
      const fl = faceLines(def, s, o)!, nx = faceNext(def, s, o);
      // U2b: the clause after its label (a perk's name, drawn in the perk colour as every perk name: AFTERBURNER is no BURN)
      return [fl.stats ?? "", ...fl.rules.map((r) => r.text), ...fl.reminders, fl.clause ? fl.clause.text.slice(fl.clause.label!.length + 1) : "",
        ...(fl.caveats ?? []), ...(nx ? [nx.text] : []), ...(s > 1 ? [faceMerge(def, s, o)!] : [])];
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
    for (const def of FACE_IDS.filter((d) => fusible(d) || ITEMS[d].kind === "supply")) expect(cardText(def).length, def).toBeGreaterThan(0); // U2b: + supplies
  });

  it("U2b the captains: no middle dot or hand-wrapping in a trick or blurb; a keyword they name draws in its icon's colour, one source", () => {
    let coloured = 0;
    for (const id of RIVAL_IDS) for (const line of [RIVALS[id].trick, RIVALS[id].blurb, `${RIVALS[id].name}, ${RIVALS[id].trick}`]) {
      expect(line.includes("·"), line).toBe(false);
      expect(/\n|  |^ | $/.test(line), JSON.stringify(line)).toBe(false);
      for (const sp of captainSpans(line, "#000000")) {
        const k = KEYWORDS.find((kw) => CAPTAIN_FORMS[kw].includes(sp.t));
        if (k) { expect(sp.c, `${id}: ${sp.t}`).toBe(ICON_COLOUR[ICON[k]]); coloured++; }
      }
    }
    // the keyword forms the lines name (FRAY STORM, THICK PLATE, EVERY PAIR, BURNS, ...) draw coloured; ARMOR PLATES (the
    // supply) stays plain
    expect(coloured).toBeGreaterThan(10);
    expect(captainSpans("THREE ARMOR PLATES, A BRAKED COOKER.", "#000000").every((s) => s.c === "#000000")).toBe(true);
    expect(readFileSync("src/screens/fork/fork.ts", "utf8")).not.toMatch(/name\} · \$\{RIVALS/);
  });

  it("hero select: WEAVER's face is LOOM SLUGS HAVE FRAY 1 (review call 5); PLAYSTYLE in three words (C6)", () => {
    expect(stripIcons(heroFace("weaver")!.rules[0].text)).toBe(`${ITEMS.loom.name} SLUGS HAVE FRAY ${AMMO.thread.fray}.`);
    expect(heroFace("bastion")!.rules[0].label).toBe("LOAD:");
    expect(PLAYABLE_HEROES.map(heroPlaystyle)).toEqual([HEROES.furnace.pattern, "THREADS FRAY HULLS", "PAIRS FUSE STRONGER", HEROES.bastion.pattern]);
  });
});

describe("U2b group 0: cap's fixes F2-F7 on U2a's pieces (F1, the DMG glyph, is pinned in tests/icons.test.ts)", () => {
  it("F2: a panel that draws a face never draws the piece's desc; a kept tip stays (on 0.8.6 all four hero factories)", () => {
    for (const def of FACE_IDS) {
      const desc = ITEMS[def].desc.join(" ");
      if (desc) expect(flavour(def).join(" "), def).not.toBe(desc);
    }
    // 0.8.6 move: since bb-0.8.3 (REQ-BFG-042 D2) KILN and LOOM keep one tip with no number, like CRUCIBLE and WARDWORKS
    for (const def of ["kiln", "loom"]) {
      expect(flavour(def), def).toHaveLength(1);
      expect(flavour(def)[0], def).not.toMatch(/\d/);
    }
    expect([flavour("crucible").length, flavour("wardworks").length]).toEqual([1, 1]);
    for (const hero of ["furnace", "weaver"] as HeroId[]) {
      const run = newRun(hero, 5, "u2b");
      const uid = run.build.items.find((i) => i.def === HEROES[hero].factory)!.uid;
      expect(itemPanel(run, uid, true)!.body.some((b) => b.role === "flavour"), hero).toBe(true); // 0.8.6 move: the tip
    }
  });

  it("F3: a cap in a reminder names its unit, one form for every capped reminder (MAX n, then the unit's icon)", () => {
    expect(REMINDER.FRAY()).toBe(`EACH {*FRAY}: EVERY LATER HIT +${fmtDmg(FRAY_BONUS)} DAMAGE. MAX ${fmtCount(FRAY_MAX)} {FRAY}.`);
    expect(REMINDER.PLATE()).toBe(`{*PLATE}: SOAKS DAMAGE BEFORE YOUR HULL. MAX ${fmtDmg(PLATE_CAP)} {PLATE}.`);
    for (const def of FACE_IDS) for (const s of starsOf(def)) for (const r of faceLines(def, s)!.reminders) expect(r.includes("UP TO"), r).toBe(false);
  });

  it("F4 (U2e step 4): no face draws a reminder; each keyword's reminder stays in the face's data, in rule order (the tap's text)", () => {
    // U2b F4 made each reminder its own optional block (HOT SWAP's BURN at REMINDER_RANK, its STUN a REMINDER_STEP later).
    // U2e step 4 (REQ-BFG-070): the always-on face drops the dim reminders; a word tap, the desk hover and the ⓘ view's
    // KEYWORDS show them (glossary.ts reads them from faceAt), so the reminders keep their order there
    expect([REMINDER_RANK, REMINDER_STEP]).toEqual([3, 0.1]);
    for (const s of STARS) {
      expect(faceBlocks("hotswap", s, {})!.filter((b) => b.role === "reminder"), `★${s}`).toEqual([]);
      const rem = faceLines("hotswap", s)!.reminders;
      expect([rem[0].includes(ICON.BURN), rem[1].includes(ICON.STUN)]).toEqual([true, true]);
    }
    for (const def of FACE_IDS) for (const s of starsOf(def)) {
      expect(faceBlocks(def, s, { k: 1, hero: "furnace" })!.some((b) => b.role === "reminder"), `${def} ★${s}`).toBe(false);
    }
  });

  // Y7b2 (the flip): retitled, was "...: INNER COLUMN ONLY on every inner-intake turret (data), and call 7's three". The
  // interim caveats left with the flip but INNER COLUMN ONLY (faces.ts INTERIM_CAVEATS holds it alone)
  it("F5: one table of interim caveats, kept, 3x5, the reminder's colour: INNER COLUMN ONLY on every inner-intake turret (data), the one left", () => {
    const inner = FACE_IDS.filter((d) => ITEMS[d].turret?.intake === "inner");
    expect([...inner].sort()).toEqual(["dartgun", "hailgun", "spikegun"]);
    for (const def of FACE_IDS) for (const s of starsOf(def)) {
      const cv = faceBlocks(def, s, { k: 1, hero: "furnace" })!.filter((b) => b.role === "caveat");
      expect(cv.length, `${def} ★${s}`).toBe(INTERIM_CAVEATS.filter((c) => c.applies(effectAt(def, s))).length);
      expect(cv.every((b) => b.keep), def).toBe(true);
    }
    for (const def of inner) expect(stripIcons(faceLines(def, 1)!.caveats!.join(" ")), def).toBe("INNER COLUMN ONLY.");
    // Y7b2 (the flip): call 7's three caveats left (STOKER's, SPALL CATCHER's and OVERCLOCKER's: each was
    // caveats!.length 1), so the table is INNER COLUMN ONLY's row alone
    for (const def of ["stoker", "spallcatcher", "overclocker"]) expect(faceLines(def, 1)!.caveats, def).toBeUndefined();
    expect(INTERIM_CAVEATS.map((c) => c.id)).toEqual(["inner"]);
    expect(ROLE.caveat).toEqual(ROLE.reminder);
  });

  // Y7b2 (the flip): retitled, was "F6: a face never says less than the sim: the 4 STAR-batch gaps carry a clause at the star
  // that has it, after its perk name, kept". Each gap's rule left with the flip (HOT SWAP's SPARK JUMP, LIMPET's stall,
  // ROTARY's fire rate and CLEAN FEED's no-jam, GRAPNEL's salvage) and every interim clause with them, so no face says less
  it("F6: a face never says less than the sim: the 4 STAR-batch gaps' rules left with the flip, so none carries a clause at any star", () => {
    // Y7b2 (the flip): no clause at any star (was { hotswap: [2, 3], limpet: [2, 3], rotary: [2, 3], grapnel: [3] })
    const at: Record<string, number[]> = { hotswap: [], limpet: [], rotary: [], grapnel: [] };
    for (const [def, stars] of Object.entries(at)) for (const s of STARS) {
      const fl = faceLines(def, s, { k: 1 })!;
      expect(!!fl.clause, `${def} ★${s}`).toBe(stars.includes(s));
      if (!fl.clause) continue;
      expect(fl.clause.label!.startsWith(`★${s}`) && fl.clause.text.startsWith(`${fl.clause.label} `), def).toBe(true);
      const b = faceBlocks(def, s, { k: 1 })!.find((x) => x.text === fl.clause!.text)!;
      expect([b.keep, b.brass, b.role], def).toEqual([true, fl.clause.label, "ability"]);
    }
    // written from the sim: ROTARY's rate (N1 2.3: X% FASTER is the rate up X%) and CLEAN FEED's never-jam; the spark's jump
    // NUM-2 (REQ-BFG-047): the rate up is rateMul(fireRate) - 1, the whole % stored (+18 / +43; was 1 / intervalMul - 1)
    // Y7b2 (the flip): the three clause texts are deleted with their rules (switch-off only; were `★2 GREASED RACE: FIRES
    // ${rate(2)} FASTER.`, `★3 CLEAN FEED: FIRES ${rate(3)} FASTER, NEVER JAMS.` and `★2 SPARK JUMP: STUN HITS
    // ${fmtCount(1 + jump)} PARTS.`); no data holds ROTARY's fireRate or the spark's jump now
    expect([effectAt("rotary", 3).core!.fireRate, effectAt("hotswap", 2).factory!.cycle!.find((p) => p.tint === "spark")!.jump]).toEqual([undefined, undefined]);
  });

  it("NUM-3 (R1's STUN fold): the 7 STUN-fold faces never say less than the sim: a round's STUN is a stat; perks are clauses", () => {
    // a SABOT, FROST or CHAIN round's STUN is its own payload's: {STUN} and round.seconds in the second stat row (carryStats)
    for (const def of ["sabot", "frostbite", "dragchain"]) for (const s of STARS) {
      const r = effectAt(def, s).factory!.round as { seconds: number };
      expect(faceAt(def, s)!.stats2, `${def} ★${s}`).toContainEqual(["STUN", fmtSec(r.seconds)]);
    }
    // MANTLET: IMMUNE TO STUN only while its list holds every STUN source (content.ts STUN_CAUSES), at every star. Y7b2 (the
    // flip): release Y's face, the gun and its last 1 / 2 / 3 tiles in one line (intakeGuard 1/2/3 from ★1; was "IMMUNE TO
    // STUN." at every star)
    for (const s of STARS) {
      expect(STUN_CAUSES.every((c) => effectAt("mantlet", s).mod!.immune!.includes(c)), `★${s}`).toBe(true);
      expect(stripIcons(faceLines("mantlet", s)!.rules[0].text), `★${s}`).toBe(`STUN CAN'T STOP ITS GUN OR LAST ${s === 1 ? "1 TILE" : `${s} TILES`}.`);
    }
    // the clauses at the stars that have them, written from the sim. Y1 (STAR-D row 2): FROSTBITE's HOARFROST is a number on
    // its line at every star, so it has no clause (was frostbite: [2, 3] here, and the clause "★2 HOARFROST: STUN HITS 2
    // PARTS.")
    // Y7b2 (the flip): every interim clause left (SHRAPNEL, BIG HAUL, FACTORY GUARD, FULL GUARD / BULWARK SKIRT's rig guard,
    // REDLINE / AFTERBURNER's guard), so none at any star (was { frostbite: [], sabot: [3], scrapper: [3], tollbooth: [3],
    // mantlet: [2, 3], overdrive: [2, 3] })
    const at: Record<string, number[]> = { frostbite: [], sabot: [], scrapper: [], tollbooth: [], mantlet: [], overdrive: [] };
    for (const [def, stars] of Object.entries(at)) for (const s of STARS) expect(!!faceLines(def, s)!.clause, `${def} ★${s}`).toBe(stars.includes(s));
    const spread = (s: number) => (effectAt("frostbite", s).factory!.round as { spread: number }).spread;
    expect(STARS.map((s) => 1 + spread(s))).toEqual([1, 2, 3]);
    for (const s of STARS) {
      const n = 1 + spread(s);
      expect(stripIcons(faceLines("frostbite", s)!.rules[0].text)).toBe(`ITS STUN HITS ${fmtCount(n)} PART${n === 1 ? "" : "S"}.`);
    }
    // OVERDRIVE's guard names the rounds it keeps off, by its flags: no SLOW or FREEZE any more. Y7b2 (the flip): REDLINE's
    // and AFTERBURNER's guard left (no data holds `guard`), with their clauses (switch-off only; were "★2 REDLINE: ENEMY
    // CHAIN ROUNDS CAN'T STUN ITS BELTS." and "★3 AFTERBURNER: ENEMY CHAIN AND FROST ROUNDS CAN'T STUN ITS BELTS.")
    expect(STARS.map((s) => effectAt("overdrive", s).gate!.guard)).toEqual([undefined, undefined, undefined]);
    // SCRAPPER: its slug's damage carries its scrapFlat; TOLLBOOTH and FLAK SCREEN: their numbers through the formatters
    for (const s of STARS) {
      const fs = effectAt("scrapper", s).factory!;
      expect(factoryStats("scrapper", s)[1]).toEqual(["DMG", fmtDmg(AMMO[fs.ammo].base + fs.scrapFlat!)]);
      // Y7b2 (the flip): release Y's TOLLBOOTH face, its belt's parts (was `BLOCKS THE FIRST ${toll} STUN HITS ON ITS BELT.`)
      expect(stripIcons(faceLines("tollbooth", s)!.rules[0].text)).toBe(`BLOCKS ${fmtCount(effectAt("tollbooth", s).gate!.toll!)} STUN ON ITS BELT'S PARTS.`);
      expect(stripIcons(faceLines("flak", s)!.rules[0].text)).toBe(`SHOOTS DOWN ${fmtPct(effectAt("flak", s).mod!.intercept!)} OF ENEMY STUN SHOTS.`);
    }
    // the interim caveats the sim needs: harassment is a STUN, a wreck or a rip; SCRAPPER's queue cap; FLAK's other shots.
    // Y7b2 (the flip): harassment is a STUN alone, SCRAPPER's cap and FLAK's single best-screen roll left, so none of the
    // three keeps a caveat (were ["WRECKS AND RIPS COUNT TOO.", `MAX ${fmtCount(SIM.scrapQueue)} SLUGS WAITING.`], ["IT
    // GUARDS ITS BELT'S RIGS AND GUN TOO.", "WRECKS AND RIPS COUNT TOO."] and ["ALSO GRAPNEL, LANCE AND LIMPET SHOTS.",
    // "ONLY YOUR BEST FLAK SCREEN COUNTS."])
    expect(["scrapper", "tollbooth", "flak"].map((def) => faceLines(def, 1)!.caveats)).toEqual([undefined, undefined, undefined]);
  });

  it("F7: hero select's stats box joins the factory and its slug with a comma, never a middle dot", () => {
    const src = readFileSync("src/screens/hero.ts", "utf8");
    expect(src.includes("·")).toBe(false);
    expect(src).toContain("`${fac.name}, ${AMMO[h.ammo].name}`");
  });
});

describe("U2c group 0: cap's fixes 1-5 on the 0.8.7 rune build", () => {
  // Y7b2 (the flip): retitled, was "fix 1: SURGE VALVE's rule says its pulse, the speed and the length through the formatters;
  // NEXT★ shows the next speed". Its speed pulse left (Y3, DESIGN-Y row 28): the damage pulse alone, its period and damage
  it("fix 1: SURGE VALVE's rule says its pulse, the period and the damage through the formatters; NEXT★ shows the next damage", () => {
    for (const s of STARS) {
      const p = effectAt("surge", s).gate!.pulse!;
      const { value: fl, records } = captureFormats(() => faceLines("surge", s)!);
      const rule = stripIcons(fl.rules[0].text);
      // Y7b2 (the flip): "EVERY 3{SEC}: +10 {DMG} TO SLUGS ON ITS BELTS." (was toContain(`${fmtCount(p.speed)} TIMES AS FAST
      // FOR ${fmtSec(p.on)}`); its records were arrayContaining [["count", p.speed], ["sec", p.on], ["sec", p.period],
      // ["dmg", p.flat]], now exactly the period and the damage)
      expect(rule, `★${s}`).toBe(stripIcons(icons(`EVERY ${fmtSec(p.period)}{SEC}: +${fmtDmg(p.flat)} {DMG} TO SLUGS ON ITS BELTS.`)));
      expect(records.map((r) => [r.unit, r.value]), `★${s}`).toEqual([["sec", p.period], ["dmg", p.flat]]);
      // Y7b2 (the flip): the next damage (was toContain(`${fmtCount(next speed)} TIMES`))
      if (s < FUSE_MAX) expect(stripIcons(faceNext("surge", s)!.text), `★${s}`).toContain(`+${fmtDmg(effectAt("surge", s + 1).gate!.pulse!.flat)} `);
    }
  });

  it("fix 2: {BELT} means belts, a count: no face writes the belt icon but a factory's belts; belt capacity is BELT TILES, in words", () => {
    for (const def of FACE_IDS) for (const s of starsOf(def)) {
      const fl = faceLines(def, s, { k: 1, hero: "furnace" })!;
      for (const line of [...fl.rules.map((r) => r.text), ...fl.reminders, fl.clause?.text ?? "", ...(fl.caveats ?? [])]) {
        expect(line.includes(ICON.BELT), `${def} ★${s}: ${stripIcons(line)}`).toBe(false);
      }
      const belt = faceAt(def, s, { k: 1, hero: "furnace" })!.stats.find(([ic]) => ic === "BELT");
      if (belt) expect(belt[1], def).toBe(fmtCount(outputsAt(def, s)));
    }
    expect(stripIcons(faceLines("beltcrate", 1)!.rules[0].text)).toBe(`+${fmtCount(ITEMS.beltcrate.supply!.belt!)} BELT TILES FOR THE RUN.`);
  });

  it("fix 3: the packs' tooltips read their faces (chrome.ts), one line of the tooltip's 3x5 text each", () => {
    // AZ-PREP (REVIEW-HULL1D Q3): with the run's day (chrome.ts packTip; was faceLines(def, 1)?.rules[0]?.text, day 1's)
    expect(readFileSync("src/screens/build/chrome.ts", "utf8")).toContain("faceLines(def, 1, textOpts(run))?.rules[0]?.text");
    expect(stripIcons(faceLines("plating", 1)!.rules[0].text)).toBe(`+${fmtDmg(ITEMS.plating.supply!.hull!)} ${ICON.HULL} FOR THE RUN.`);
    for (const def of ["beltcrate", "plating"]) expect(textWidth(faceLines(def, 1)!.rules[0].text, "3"), def).toBeLessThanOrEqual(150); // shop.ts TOOLTIP_TEXT_W
  });

  it("fix 5: KILN's tip no longer repeats its face's HEAT; LOOM's says what its face doesn't (one belt more than most)", () => {
    expect(flavour("kiln")).toEqual(["A LONG BELT SPEEDS UP THE GUN IT FEEDS."]);
    expect(flavour("loom")).toEqual(["IT FEEDS ONE BELT MORE THAN MOST FACTORIES."]);
    expect(effectAt("loom", 1).factory!.lead, "LOOM's lead belt").toBe(1);
  });
});

describe("U2d step 1: T2's bans (tests/textRules.ts) allow the icons, SEC after a number and a trigger's colon; every ban stands", () => {
  it("the faces' forms pass, in markup and in glyphs; each ban still rejects its shorthand", () => {
    for (const ok of ["+2 {*BURN}", `+2 ${ICON.BURN}BURN`, "{DMG}+2", "1.5 SEC", "1.5{SEC}", `1.5${ICON.SEC}`, "HIT: +2 {DMG}.", "EVERY 3{SEC}: +3 {*PLATE}.",
      "NEXT ★2: EVERY 2.5{SEC}, 4 TIMES, +2 {DMG}", "SHOT: IT COUNTS UP TO 5 WAITING LOADS, AND IT NEVER JAMS."]) expect(banned(ok), ok).toEqual([]);
    expect(banned("+2 DMG")).toEqual(["DMG"]);
    expect(banned("EVERY 3S")).toEqual(["glued seconds"]);
    expect(banned("X2 DAMAGE")).toEqual(["bare multiplier X2"]);
    expect(banned("MAX 6.")).toEqual(["MAX/CAP before a number"]);
    expect(banned("+1 DAMAGE/S")).toContain("slash rate");
    expect(banned("THE 3RD SLUG")).toEqual(["ordinal"]);
  });

  it("every face line, NEXT★ and MERGES INTO line, at every star and context, passes T2 (a cap names its unit: U2b F3's rule)", () => {
    // U2b F3 (abilityPanels, wave3.text): T2's ban on a bare "MAX 6" passes a MAX whose number is followed by its unit
    const capNamesUnit = (s: string): boolean => [...s.matchAll(/\b(?:MAX|CAP)\s*\+?\d+(?:\.\d+)?( +\S+)?/g)]
      .every((m) => !!m[1] && /^ +(?:[-]|[A-Z]{2,})/.test(m[1]));
    let n = 0;
    for (const def of FACE_IDS) for (const o of contexts(def)) for (const s of starsOf(def)) {
      const fl = faceLines(def, s, o)!, nx = faceNext(def, s, o);
      for (const line of [fl.stats ?? "", ...fl.rules.map((r) => r.text), fl.clause?.text ?? "", ...(fl.caveats ?? []), ...fl.reminders,
        ...(nx ? [nx.text] : []), ...(s > 1 ? [faceMerge(def, s, o)!] : [])].filter(Boolean)) {
        expect(banned(line).filter((why) => why !== "MAX/CAP before a number" || !capNamesUnit(line)), `${def} ★${s}: ${stripIcons(line)}`).toEqual([]);
        n++;
      }
    }
    expect(n).toBeGreaterThan(600);
  });
});

describe("U2d F1 (cap's answer to U2c question 1): NEXT★ shows every number the next star changes; a perk's name gives way first", () => {
  it("SURGE VALVE keys its period: NEXT ★2: EVERY 2.5{SEC}, 4 TIMES, +2 {DMG}, each number through its formatter", () => {
    // NUM-3 step 2 (REQ-BFG-047, N1 2.2): its period is 3 / 3 / 2 s (was 3 / 2.5 / 2), so it changes from ★2 to ★3 only.
    // The check 'its period changes at every star' becomes its equivalent for the keyed period: NEXT★ shows EVERY n{SEC}
    // exactly at the stars where the period changes (★2: NEXT ★3: EVERY 2{SEC}, ...) and not where it stays (★1: NEXT ★2:
    // 4 TIMES, +20 {DMG}), and it does change at some star. The title's NEXT ★2 line is U2d's (before NUM-1 and step 2)
    let keyed = 0;
    for (let s = 1; s < FUSE_MAX; s++) {
      const p = effectAt("surge", s + 1).gate!.pulse!, moved = p.period !== effectAt("surge", s).gate!.pulse!.period;
      if (moved) keyed++;
      const nx = faceNext("surge", s)!;
      // Y7b2 (the flip): no TIMES (its speed pulse left; was `...${fmtCount(p.speed)} TIMES, +${fmtDmg(p.flat)} {DMG}`)
      expect(nx.text, `★${s}`).toBe(icons(`NEXT ★${s + 1}: ${moved ? `EVERY ${fmtSec(p.period)}{SEC}, ` : ""}+${fmtDmg(p.flat)} {DMG}`));
      // its perk's name (OVERPRESSURE, HAMMER VALVE) gives way where it would take the line past the band: the numbers say
      // what the star brings. NUM-3 step 2: the line with the period still passes it (HAMMER VALVE gives way at ★2); ★1's
      // line, without the period, now fits its name (OVERPRESSURE shows), as the band rule below says for every piece
      // Y7b2 (the flip): without TIMES the line with the period fits too, 216 px of 225 with HAMMER VALVE, so the name shows
      // at ★2 as well (was toBeGreaterThan(NEXT_LINE_W))
      const whole = textWidth(`${nx.text} ★${s + 1} ${livePerk("surge", s + 1)}`, "5");
      expect(nx.perk, `★${s}`).toBe(whole > NEXT_LINE_W ? undefined : livePerk("surge", s + 1));
      if (moved) expect(whole, `★${s}`).toBe(216);
    }
    expect(keyed, "its period changes with its stars").toBeGreaterThan(0);
    expect(NEXT_LINE_W).toBe(GLOSSARY_WRAP_W); // the op view's band in 5x7 (T1 2.6), the definitions' width
  });

  it("no number that changes with the stars sits only in a label or unkeyed: each one is in NEXT★ (rules, clause, caveats, reminders)", () => {
    const missing: string[] = [];
    for (const def of FACE_IDS.filter(fusible)) for (const o of contexts(def)) for (let s = 1; s < FUSE_MAX; s++) {
      const a = faceLines(def, s, o)!, b = faceLines(def, s + 1, o)!;
      const lines = (f: FaceLines) => [...f.rules.map((r) => r.text), f.clause?.text ?? "", ...(f.caveats ?? []), ...f.reminders];
      const la = lines(a), next = numbersIn(faceDiff(def, s, s + 1, o) ?? "");
      lines(b).forEach((line, i) => numbersIn(line).forEach((n, j) => {
        if (numbersIn(la[i] ?? "")[j] !== n && !next.includes(n)) missing.push(`${def} ${JSON.stringify(o)} ★${s + 1}: ${n} in ${stripIcons(line)}`);
      }));
    }
    expect(missing).toEqual([]);
    // the ones F1 keyed: ARMOR PRESS's period (one at every star today), SPALL CATCHER's MAX, SALVAGE LINE's damage, SPOTTER's weight
    // Y7b2 (the flip): SPALL CATCHER's cap, SALVAGE LINE and SPOTTER's factory weight left, so their NEXT★ lines are the
    // numbers left: the damage, the rips and the aims (were toContain(`MAX ${fmtDmg(spall.max)} `), toContain(" EACH") and
    // toContain(`FACTORIES ${fmtCount(factoryWeight)} TIMES`))
    expect(stripIcons(faceNext("spallcatcher", 1)!.text)).toBe(`NEXT ★2: +${fmtDmg(effectAt("spallcatcher", 2).mod!.spall!.add)} `);
    expect(stripIcons(faceNext("spotter", 1)!.text)).toBe(`NEXT ★2: ${fmtCount(effectAt("spotter", 2).mod!.rerolls!)} MORE AIMS`);
    expect(stripIcons(faceNext("grapnel", 2, { k: 1 })!.text)).toBe(`NEXT ★3: RIPS ${fmtCount(effectAt("grapnel", 3).core!.rip!)}`);
    expect(faceAt("armorpress", 1)!.nums.find(([key]) => key === "every")![1]).toBe(`EVERY ${fmtSec(effectAt("armorpress", 1).factory!.plate!.every)}{SEC}`);
  });

  it("a perk's name gives way only where the line would pass the band; a line with no changed number keeps it (the name is all it says)", () => {
    const gaveWay: string[] = [];
    for (const def of FACE_IDS.filter(fusible)) for (const o of contexts(def)) for (let s = 1; s < FUSE_MAX; s++) {
      const p = livePerk(def, s + 1), nx = faceNext(def, s, o)!;
      if (!p || p === livePerk(def, s)) { expect(nx.perk, `${def} ★${s}`).toBeUndefined(); continue; }
      const whole = `${nx.text} ★${s + 1} ${p}`;
      if (nx.perk) expect(nx.text === nx.label || textWidth(whole, "5") <= NEXT_LINE_W, `${def} ★${s}`).toBe(true);
      else {
        expect(nx.text, `${def} ★${s}: only a line with numbers lets the name go`).not.toBe(nx.label);
        expect(textWidth(whole, "5"), `${def} ★${s}`).toBeGreaterThan(NEXT_LINE_W);
        gaveWay.push(`${def}${Object.keys(o).length ? ` ${JSON.stringify(o)}` : ""} ★${s}: ${stripIcons(nx.text)} (★${s + 1} ${p})`);
      }
    }
    console.log(`U2d F1: the perk's name gave way on ${gaveWay.length} NEXT★ lines:\n${gaveWay.join("\n")}`);
    // Y7b2 (the flip): none gives way now, measured (was 9 lines, toBeGreaterThan(0)): the 9 lines that passed the band lost
    // the numbers of rules the flip removed (SCRAPPER ★2's wreck, SABOT ★2's SHRAPNEL tiles, GRAPNEL ★2's salvage at all 5
    // class factors, SURGE ★2's TIMES, SPOTTER ★1's factory weight), and their perks BIG HAUL, SHRAPNEL, SALVAGE LINE and
    // FACTORY SPOT left with the words; the 26 NEXT★ lines with a new perk all fit the band with it (the widest SURGE ★2's
    // HAMMER VALVE, 216 px of 225)
    // AZ-BUMP (the flip, LADDER_FIX): OVERDRIVE's two NEXT★ lines now carry the ride-keep (KEEPS 50% / 100% RIDE), so its
    // perk names give way, as the rule above lets them (234 and 264 px with the name, of 225): REVIEW-AZPREP Q5's wrap,
    // reported and not re-keyed (S10 shoots OVERDRIVE ★2 and its ⓘ on the desk). Off, none gives way, as before
    expect(gaveWay).toEqual([
      "overdrive ★1: NEXT ★2: 4 TIMES, KEEPS 50% RIDE (★2 REDLINE)",
      "overdrive ★2: NEXT ★3: 5 TIMES, KEEPS 100% RIDE (★3 AFTERBURNER)",
    ]);
  });
});

/** The 390x844 phone's info band (tests/abilityPanels.test.ts's PHONE, 161 x 69) and the op view's phone band (402x690
 *  at x5: 241 x 414 art px, the zoomed band 235 x 122, 10 lines of 5x7; T1 REPORT 2.6). */
// U2c group 0 fix 4: PACKS Q5's rule (oracle 35e8ebc1eda74818), as the other narrow-band tests took it: 0.8.6's pack row
// under REROLL takes 33 px from buildLayout(167, 361)'s band (161 x 36: a 9 px body, no room for two kept lines), so the
// legacy 161 x 69 band is 0.8.5's 167 x 361 plus the pack row (tests/abilityPanels, b1.text, families, stokerCap, wave3.text)
const PHONE = buildLayout(167, 394, true, 5).info;
const OP = buildLayout(241, 414, true, 5, true).info;
/** U2b: the op view's touch target (402x690 CSS px, DPR 3): the game plans its band with { tap, band } (detailsPlan), so the
 *  buttons sit in the band's header row, not stacked under the text as a landscape column's (U2a planned it without them,
 *  which a rig's three touch buttons squeezed to a 35 px body). */
const OP_TAP = tapPx(computeView(402, 690, 3, buildScale));

/** U2b: a Furnace with the Kiln's belt up column 4 and a STAMP PRESS belt up column 6 (tests/abilityPanels.test.ts rigRun);
 *  rig `def` (uid 10, ★stars) at (x, y) turned `rot`. */
const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const SIDE = [K(6, 5), K(6, 4), K(6, 3), K(6, 2), K(6, 1), K(5, 1), K(5, 0)];
function rigRun(def: string, stars: number, x: number, y: number, rot: number): Run {
  const run = newRun("furnace", 5, "u2b");
  run.inventory = [];
  run.build = {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 7, def: "press", x: 6, y: 6 }, { uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) }],
    routes: [{ factory: 1, cells: [...SHORT] }, { factory: 7, cells: [...SIDE] }],
  };
  return run;
}

/** Every panel a face shows on: cargo (each hero for a core), placed (a factory; U2b: a rig on a belt, IDLE, and a STOKER
 *  at a factory), offer (none held, one held; U2b: a supply), fitted (a core; U2b: a piece of gear). */
function facePanels(): { id: string; t: PanelText }[] {
  const out: { id: string; t: PanelText }[] = [];
  for (const def of FACE_IDS) {
    const d = ITEMS[def];
    if (d.kind === "supply") { // U2b: a supply is used as it is bought: its offer is its one panel
      const run = newRun("furnace", 5, "u2b");
      run.gold = 99;
      run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
      out.push({ id: `offer ${def}`, t: offerPanel(run, 0, 0, true)! });
      continue;
    }
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
      if (d.kind === "core" || d.kind === "mod") { // U2b: + a piece of gear
        const run = newRun("furnace", 5, "u2a");
        run.build.mods.push({ uid: 902, def, turret: 0, ...(s > 1 ? { stars: s } : {}) } as Run["build"]["mods"][number]);
        out.push({ id: `fitted ${def} ★${s}`, t: fittedPanel(run, 902)! });
      }
      if (d.kind === "gate") { // U2b: the placed rig panel: on a belt (one hit), IDLE, and a STOKER beside the KILN
        out.push({ id: `placed ${def} ★${s} 1hit`, t: itemPanel(rigRun(def, s, 3, 3, rotFacing(def, 1)), 10, true)! });
        out.push({ id: `placed ${def} ★${s} idle`, t: itemPanel(rigRun(def, s, 0, 9, 0), 10, true)! });
        if (d.gate?.stoke) out.push({ id: `placed ${def} ★${s} at the kiln`, t: itemPanel(rigRun(def, s, 3, 6, rotFacing(def, 1)), 10, true)! });
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
    const tightPhone: string[] = [], gaveWayOp: string[] = [], gaveWayPhone: string[] = [], toCargoGaveWay: string[] = [], opTight: string[] = [];
    for (const { id, t } of PANELS) {
      counts.panels++;
      for (const [band, area] of [["phone", PHONE], ["op", OP]] as const) {
        // U2b: the op view as the game plans it (its band, its touch target); the legacy band as U2a planned it
        const o = band === "op" ? { tap: OP_TAP, band: true } : {};
        let plan = planPanel(t, area, [], o);
        // U2b: where a second button would cut the kept text, TO CARGO gives way, as the game does (detailsPlan;
        // tests/shoptap.panels.test.ts pins where): on the legacy band, a placed ★2 HOT SWAP or LIMPET WORKS with its clause
        if (!(plan.body.fits && keptWhole(plan)) && t.labels.includes("TO CARGO")) {
          plan = planPanel({ ...t, labels: t.labels.filter((l) => l !== "TO CARGO") }, area, [], o);
          toCargoGaveWay.push(`${band} ${id}`);
        }
        expect(plan.body.fits && keptWhole(plan), `${band} ${id} (variant ${plan.body.variant})`).toBe(true);
        const big = plan.body.font === "5" && !plan.body.tight;
        if (band === "phone") { if (big) counts.phone5x7++; else { counts.phoneTight++; tightPhone.push(id); } }
        else if (big) counts.op5x7++; else { counts.opTight++; opTight.push(id); }
        if (plan.body.dropped.some((b) => b.role === "reminder")) {
          counts[band === "phone" ? "reminderGaveWayPhone" : "reminderGaveWayOp"]++;
          // U2b F4: each reminder gives way on its own; the log names the keyword kept and the one that gave way
          const kw = (b: { text: string }) => KEYWORDS.find((k) => b.text.includes(ICON[k])) ?? "?";
          const rem = t.body.filter((b) => b.role === "reminder"), gone = plan.body.dropped.filter((b) => b.role === "reminder");
          (band === "op" ? gaveWayOp : gaveWayPhone).push(`${id} [kept ${rem.filter((b) => !gone.includes(b)).map(kw).join("+") || "none"}; gave way ${gone.map(kw).join("+")}]`);
        }
        // U2b: an interim caveat (F5) and clause (F6) are kept: never dropped
        expect(plan.body.dropped.some((b) => b.role === "caveat" || (b.brass ?? "").startsWith("★")), `${band} ${id}`).toBe(false);
      }
    }
    console.log(`U2a fit: ${JSON.stringify(counts)}`);
    console.log(`U2a phone tight: ${tightPhone.length}; the reminder gave way on the op band: ${gaveWayOp.join(" | ")}`);
    console.log(`U2b legacy band, TO CARGO gave way: ${toCargoGaveWay.join(" | ")}`);
    console.log(`U2b op band, not 5x7: ${opTight.join(" | ")}`);
    console.log(`U2b F4, the legacy band, reminders by keyword: ${gaveWayPhone.join(" | ")}`);
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
