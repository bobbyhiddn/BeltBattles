// SUS-D (REQ-BFG-069; SUSTAIN-1 4.6): the sustain runes in the catalogue. Their ids, names, tiers, themes, kinds, units,
// amounts and texts; the switch they ship behind (offered only while the sustain pieces are in the game: SUSTAIN_LIVE or
// withSustain; refused by runeProblem while it is off); their words on the rune cards, measured on the phone (402x690 @3,
// the op view's card, 223 px of the 5x7 face) and the desk; and the M5 bench's gains against the tier bands (R1b-2 1.5).
import { describe, expect, it } from "vitest";
import { textWidth, ICON } from "../src/render/font";
import { wrapRich } from "../src/ui/richText";
import {
  BOT_RUNES, KIND_UNIT, RULE_KINDS, RUNE_LIST, RUNES, STYLE_THEMES, SUSTAIN_RUNE_LIST, isRune, isSustainRune, runeList, runeOffer,
  runeProblem, type RuneDef,
} from "../src/sim/runes";
import { SUSTAIN_LIVE, sustainLive, withSustain, type HeroId } from "../src/sim/content";
import { KEYWORD_WORD, RUNE_TEXT, RUNE_UNIT_TEXT, runeKeyword, runeLine, runeReminder, runeSpans, runeTag } from "../src/ui/runeText";
import { RUNE_REMINDER } from "../src/ui/glossary";
import { runeCardTextW } from "../src/ui/runeBar";
import { pickLayout } from "../src/screens/runePicker";
import { cloneBuild } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";

const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const S = ICON.SEC;

/** id, name, tier, theme, kind, unit, N (N1 units), RuneDef.text, the line as the card draws it, its 5x7 width (px). */
const TABLE: readonly [string, string, string, string, string, string, number, string, string, number][] = [
  ["bulwark_ward", "BULWARK WARD", "common", "bastion", "startShield", "count", 2, "START: +{N} {*SHIELD}.", "START: +2 SHIELD.", 89],
  ["tick_guard", "TICK GUARD", "rare", "bastion", "shieldEvery", "sec", 6, "EVERY {N}: A {*SHIELD}.", `EVERY 6${S}: A SHIELD.`, 99],
  ["twin_salve", "TWIN SALVE", "common", "foundry", "pairHeal", "hull", 20, "{PAIR}: {*HEAL} {N}.", "PAIR: HEAL 20.", 71],
  ["scrap_medic", "SCRAP MEDIC", "rare", "armor", "halfHeal", "hull", 300, "FIRST TIME BELOW HALF {HULL}: {*HEAL} {N}.", "FIRST TIME BELOW HALF HULL: HEAL 300.", 201],
  ["leech_vow", "LEECH VOW", "epic", "turrets", "hitHeal", "hull", 20, "EACH SHOT THAT LANDS: {*HEAL} {N}.", "EACH SHOT THAT LANDS: HEAL 20.", 161],
  ["green_thread", "GREEN THREAD", "common", "weaver", "regen", "hull", 10, "YOUR HULL: {*REGEN} {N}.", "YOUR HULL: REGEN 10.", 105],
  ["searing", "SEARING", "rare", "furnace", "burnNoHeal", "count", 1, "FOE WITH YOUR {*BURN}: NO {*HEAL}.", "FOE WITH YOUR BURN: NO HEAL.", 149],
  ["shatter_shot", "SHATTER SHOT", "rare", "furnace", "shieldPierce", "count", 1, "YOUR SHOTS: BREAK A {*SHIELD} AND STILL HIT.", "YOUR SHOTS: BREAK A SHIELD AND STILL HIT.", 223],
];

describe("SUS-D: the sustain runes in the catalogue", () => {
  it("8 runes (3 common, 4 rare, 1 epic): ids, names, tiers, themes, kinds, units, amounts and texts", () => {
    expect(SUSTAIN_RUNE_LIST.map((d) => [d.id, d.name, d.tier, d.theme, d.kind, d.amount.unit, d.amount.n, d.text])).toEqual(TABLE.map((r) => r.slice(0, 8)));
    for (const d of SUSTAIN_RUNE_LIST) {
      expect(RUNES[d.id], d.id).toBe(d);
      expect(d.amount.unit, d.id).toBe(KIND_UNIT[d.kind]);
      expect(/^[a-z0-9_]{1,32}$/.test(d.id) && d.name.length <= 14, d.id).toBe(true);
    }
    // ids and names unique across the whole catalogue (65)
    const all = [...RUNE_LIST, ...SUSTAIN_RUNE_LIST];
    expect([new Set(all.map((d) => d.id)).size, new Set(all.map((d) => d.name)).size]).toEqual([65, 65]);
    // WARD STONE's line is in runes.ts (SUS-B's runeText.ts RUNE_TEXT row is gone); rare, armor, startShield 3 as before
    expect([RUNES.ward_stone.text, RUNES.ward_stone.tier, RUNES.ward_stone.theme, RUNES.ward_stone.amount.n]).toEqual(["START: +{N} {*SHIELD}.", "rare", "armor", 3]);
    expect(RUNE_TEXT).toEqual({});
  });

  it("each is a kind of its own, but BULWARK WARD shares WARD STONE's startShield (their SHIELD adds; MAX 3 holds)", () => {
    const kinds = SUSTAIN_RUNE_LIST.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(8);
    const shipped = RUNE_LIST.map((d) => d.kind);
    expect(kinds.filter((k) => shipped.includes(k))).toEqual(["startShield"]);
    expect(RUNE_LIST.filter((d) => d.kind === "startShield").map((d) => d.id)).toEqual(["ward_stone"]);
  });

  it("the rule runes (SEARING, SHATTER SHOT; the design's N 'none'): no {N}, n is 1, no number on the card", () => {
    expect(SUSTAIN_RUNE_LIST.filter((d) => RULE_KINDS.includes(d.kind)).map((d) => d.id)).toEqual(["searing", "shatter_shot"]);
    expect([...RUNE_LIST, ...SUSTAIN_RUNE_LIST].filter((d) => RULE_KINDS.includes(d.kind)).length).toBe(2);
    for (const d of SUSTAIN_RUNE_LIST) {
      const rule = RULE_KINDS.includes(d.kind);
      expect(d.text.split("{N}").length, d.id).toBe(rule ? 1 : 2);
      if (rule) {
        expect(d.amount.n, d.id).toBe(1);
        expect(runeLine(d), d.id).not.toMatch(/\d/);
      } else expect(runeLine(d), d.id).toContain(RUNE_UNIT_TEXT[d.amount.unit](d.amount.n));
    }
  });
});

describe("SUS-D: the switch (offered only while sustain is on)", () => {
  it("off: RUNE_LIST is the 57 runes in play and holds none of them; RUNES resolves them; runeList() is RUNE_LIST", () => {
    expect([SUSTAIN_LIVE, sustainLive(), BOT_RUNES]).toEqual([false, false, false]);
    expect(RUNE_LIST.length).toBe(57);
    for (const d of SUSTAIN_RUNE_LIST) {
      expect(RUNE_LIST, d.id).not.toContain(d);
      expect([isRune(d.id), isSustainRune(d.id)], d.id).toEqual([true, true]);
    }
    for (const d of RUNE_LIST) expect(isSustainRune(d.id), d.id).toBe(false);
    expect(runeList()).toBe(RUNE_LIST);
    withSustain(() => expect(runeList().map((d) => d.id)).toEqual([...RUNE_LIST, ...SUSTAIN_RUNE_LIST].map((d) => d.id)));
    expect(runeList()).toBe(RUNE_LIST); // the switch is back
  });

  it("off, no dawn offers one (600 runs' first 10 dawns); on (withSustain), each is offered somewhere, at its own tier", () => {
    const seen = (on: boolean) => {
      const out = new Map<string, Set<string>>();
      const go = () => {
        for (const hero of HEROES4) for (let seed = 1; seed <= 150; seed++) {
          const held: string[] = [];
          for (let day = 1; day <= 10; day++) {
            const o = runeOffer(seed * 31, day, hero, held);
            for (const id of o.ids) (out.get(id) ?? out.set(id, new Set()).get(id)!).add(o.tier);
            held.push(o.ids[seed % o.ids.length]);
          }
        }
      };
      if (on) withSustain(go); else go();
      return out;
    };
    const off = seen(false), on = seen(true);
    for (const d of SUSTAIN_RUNE_LIST) {
      expect(off.has(d.id), d.id).toBe(false);
      expect([...(on.get(d.id) ?? [])], d.id).toEqual([d.tier]);
    }
  });

  it("runeProblem refuses a sustain rune while the switch is off (with the seed or without); on, an offered one passes", () => {
    // BOTS-X (the day-3 hold, content.ts SUSTAIN_FIRST_DAY): no dawn before day 3 offers one, so the offered sustain rune is
    // the day-3 pick, after the first card of dawns 1 and 2 (was a day-1 pick)
    let found: { seed: number; id: string; held: string[] } | null = null;
    withSustain(() => {
      for (let seed = 1; seed <= 400 && !found; seed++) {
        const held = [runeOffer(seed, 1, "bastion", []).ids[0]];
        held.push(runeOffer(seed, 2, "bastion", held).ids[0]);
        const id = runeOffer(seed, 3, "bastion", held).ids.find(isSustainRune);
        if (id) found = { seed, id, held };
      }
    });
    expect(found).not.toBeNull();
    const { seed, id, held } = found!;
    const runes = [...held, id].map((q) => ({ id: q }));
    expect(withSustain(() => runeProblem(runes, 3, "bastion", seed))).toBeNull();
    expect(withSustain(() => runeProblem(runes, 3, "bastion"))).toBeNull();
    expect(runeProblem(runes, 3, "bastion", seed)).toMatch(/is not in the game while sustain is off/);
    expect(runeProblem(runes, 3, "bastion")).toMatch(/is not in the game while sustain is off/);
    // the other runes as before
    expect(runeProblem([{ id: runeOffer(seed, 1, "bastion", []).ids[0] }], 1, "bastion", seed)).toBeNull();
    // the server's check reads the same rule (validate.ts validateBuild -> runeProblem): no server edit needed
    const b = { ...cloneBuild(heroStartBuild("bastion")), runes: [{ id: "tick_guard" }] };
    expect(validateBuild(b, 3, "lenient").errors.join("\n")).toMatch(/TICK GUARD is not in the game while sustain is off/);
  });
});

describe("SUS-D: the M5 bench (tools/runevalue.ts, RUNES-2a's method, the switch on; NEW/output-susd/bench, REPORT section 4)", () => {
  /** R1b-2 1.5's bands, as RUNES-2a applied them. */
  const BAND: Record<string, [number, number]> = { common: [3, 5], rare: [6, 10], epic: [10, 16], legendary: [16, 25] };
  /** Each benched rune's gain at its catalogue amount (win-rate points, 95% interval), read as RUNES-2a reads it: a style
   *  rune on its own hero, a generic one on all four. `run`: A par decks; B2/C2 SUSTAIN-1 5's typ2 decks (typ2r); C1 the
   *  re-amounts on par decks. BULWARK WARD's verdict is on the design's bench (typ2 BASTION, from day 5). */
  const BENCH: Record<string, { n: number; on: string; run: string; gain: number; lo: number; hi: number }> = {
    bulwark_ward: { n: 2, on: "bastion", run: "C2 typ2r days 5-10", gain: 4.0, lo: 2.9, hi: 5.2 }, // par (C1): +5.2 (3.4-7.0); @1 +2.8 / +1.8
    tick_guard: { n: 6, on: "bastion", run: "A par", gain: 9.2, lo: 6.7, hi: 11.8 }, // typ2r (B1): +8.9 (6.9-11.0)
    ward_stone: { n: 3, on: "all", run: "A par", gain: 7.4, lo: 6.6, hi: 8.2 }, // RUNES-2a: +8.8 (7.9-9.8) on bb-0.8.7 before NUM-1
    twin_salve: { n: 20, on: "foundry", run: "C1 par", gain: 3.6, lo: 2.1, hi: 5.1 }, // @10 +2.0, @30 +5.8
    scrap_medic: { n: 300, on: "all", run: "C1 par", gain: 7.1, lo: 6.2, hi: 8.0 }, // @150 +3.7, @250 +6.1
    leech_vow: { n: 20, on: "all", run: "C1 par", gain: 11.6, lo: 10.0, hi: 13.3 }, // @5 +3.1, @10 +6.2, @15 +8.6; WEAVER +16.1
    green_thread: { n: 10, on: "weaver", run: "A par", gain: 4.2, lo: 3.1, hi: 5.3 }, // typ2r (B1): +4.5 (2.6-6.4)
  };

  it("each benched rune at its catalogue amount is in its tier band (a style rune on its own hero, a generic one on all)", () => {
    expect(Object.keys(BENCH).sort()).toEqual([...SUSTAIN_RUNE_LIST.filter((d) => !RULE_KINDS.includes(d.kind)).map((d) => d.id), "ward_stone"].sort());
    for (const [id, b] of Object.entries(BENCH)) {
      const d = RUNES[id], [lo, hi] = BAND[d.tier];
      expect(d.amount.n, `${id}: benched at ${b.n}`).toBe(b.n);
      expect(b.on, id).toBe((STYLE_THEMES as readonly string[]).includes(d.theme) ? d.theme : "all");
      expect(b.gain >= lo && b.gain <= hi, `${id}: +${b.gain} in +${lo} to +${hi}`).toBe(true);
      expect(b.lo <= b.gain && b.gain <= b.hi && b.hi >= lo && b.lo <= hi, id).toBe(true); // the interval overlaps the band
    }
  });

  it("the counters (rule runes, no amount to move) stay below the rare band even against the decks they counter: kept as designed", () => {
    // FURNACE (their own hero): SEARING +0.1 (par), +0.4 (typ2r), +0.8 (-0.1 to 1.6) against the typ2r decks that heal
    // (FOUNDRY's MEND PRESS, WEAVER's MENDING LOOM); SHATTER SHOT +0.0 (par: no SHIELD), +1.3 (typ2r), +5.3 (2.5 to 8.0)
    // against the typ2r decks that hold SHIELD (BASTION's WARD BELL). The report gives the reasons and asks cap
    const COUNTER: Record<string, { best: number; lo: number; hi: number }> = { searing: { best: 0.8, lo: -0.1, hi: 1.6 }, shatter_shot: { best: 5.3, lo: 2.5, hi: 8.0 } };
    for (const [id, c] of Object.entries(COUNTER)) {
      expect([RUNES[id].tier, RUNES[id].theme, RULE_KINDS.includes(RUNES[id].kind)], id).toEqual(["rare", "furnace", true]);
      expect(c.best, id).toBeLessThan(BAND.rare[0]);
    }
  });
});

describe("SUS-D: the words on the rune cards (measured: phone 402x690 @3 and the desk 1280x800)", () => {
  const opW = runeCardTextW(pickLayout(241, 414, ["iron_skin"], -1, 0).cardW);
  const deskW = runeCardTextW(pickLayout(640, 400, ["iron_skin"], -1, 0).cardW);
  const byId = (id: string): RuneDef => RUNES[id];

  it("each card line, its 5x7 width, one line on the phone (223 px) and the desk (290 px)", () => {
    expect([opW, deskW]).toEqual([223, 290]);
    for (const [id, , , , , , , , line, w] of TABLE) {
      const d = byId(id);
      expect(runeLine(d), id).toBe(line);
      expect(textWidth(line, "5"), id).toBe(w);
      expect(w, id).toBeLessThanOrEqual(opW);
      expect(wrapRich(runeSpans(d), opW, "5").length, id).toBe(1);
      expect(wrapRich(runeSpans(d), deskW, "5").length, id).toBe(1);
      expect(runeLine(d), id).not.toMatch(/[{}·]/);
    }
    // WARD STONE's line as before (SUS-B's), now from runes.ts
    expect([runeLine(RUNES.ward_stone), textWidth(runeLine(RUNES.ward_stone), "5")]).toEqual(["START: +3 SHIELD.", 89]);
  });

  it("TICK GUARD writes its seconds with the SEC icon after the number (WARD BELL's cadence form), in the number's colour", () => {
    expect(RUNE_UNIT_TEXT.sec(6)).toBe(`6${S}`);
    const sp = runeSpans(byId("tick_guard"));
    expect(sp.find((x) => x.t === `6${S}`)).toBeDefined();
    // "+1 SHIELD" (the brief's WARD BELL form) can't stand in a rune text: no literal number (runes.system, runes.ui)
    expect(/\d/.test(byId("tick_guard").text)).toBe(false);
  });

  it("each card's chip keyword and reminder (the glossary's RUNE_REMINDER, unedited), one line of 3x5 on the phone", () => {
    const chips = Object.fromEntries(SUSTAIN_RUNE_LIST.map((d) => [d.id, runeKeyword(d)]));
    expect(chips).toEqual({
      bulwark_ward: "SHIELD", tick_guard: "SHIELD", twin_salve: "HEAL", scrap_medic: "HEAL", leech_vow: "HEAL",
      green_thread: "REGEN", searing: "BURN", shatter_shot: "SHIELD",
    });
    const widths: Record<string, number> = {};
    for (const d of SUSTAIN_RUNE_LIST) {
      const k = runeKeyword(d)!;
      expect(k in KEYWORD_WORD, d.id).toBe(true);
      expect(runeReminder(d), d.id).toBe(RUNE_REMINDER[k]);
      expect(runeReminder(d), d.id).not.toMatch(/\d/);
      widths[k] = textWidth(runeReminder(d), "3");
      expect(widths[k], d.id).toBeLessThanOrEqual(opW);
    }
    // x2a (cap, REVIEW-SUSD F-e): SHIELD re-measured after NUM-4's RUNE_REMINDER.SHIELD reword (REVIEW-SUSB F1,
    // "BLOCKS ONE HIT'S DAMAGE, THEN BREAKS."): 152 -> 166, still one line under opW 223
    expect(widths).toEqual({ SHIELD: 166, HEAL: 144, REGEN: 118, BURN: 205 });
    expect(runeTag(byId("leech_vow"))).toBe("EPIC · TURRETS");
  });
});
