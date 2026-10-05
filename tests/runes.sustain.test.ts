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
import { DORMANT_RUNES } from "../src/sim/runes"; // FLIP-X2: SEARING and SHATTER SHOT dormant (REVIEW-TUNEX); BAL-2 (the lines): none, DORMANT_RUNES empty
import { SUSTAIN_LIVE, sustainLive, withSustain, type HeroId } from "../src/sim/content";
import { KEYWORD_WORD, RUNE_TEXT, RUNE_UNIT_TEXT, runeKeyword, runeLine, runeReminder, runeSpans, runeTag } from "../src/ui/runeText";
import { RUNE_KEYWORD_COLOUR, runeReminderSpans, runeSentenceSpans } from "../src/ui/runeText"; // Y-FURN: the card's lines, SHATTER SHOT's reminder
import { RUNE_REMINDER } from "../src/ui/glossary";
import { RUNE_NOTE } from "../src/ui/glossary"; // Y-FURN: a rune's own reminder (SHATTER SHOT's)
import { runeCardTextW } from "../src/ui/runeBar";
import { runeTextLines } from "../src/ui/runeBar"; // Y-FURN: each sentence starts a card line
import { lineText } from "../src/ui/richText";
import { C } from "../src/render/palette";
import { pickLayout } from "../src/screens/runePicker";
import { cloneBuild } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { validateBuild } from "../src/net/validate";

const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const S = ICON.SEC;

/** id, name, tier, theme, kind, unit, N (N1 units), RuneDef.text, the text as the card draws it, the 5x7 width (px) of
 *  each card line. Y-FURN: a card starts each sentence on its own line (runeBar.ts runeTextLines), so SEARING's and SHATTER
 *  SHOT's two lines have a width each (was one width a rune: every text one line). */
const TABLE: readonly [string, string, string, string, string, string, number, string, string, readonly number[]][] = [
  ["bulwark_ward", "BULWARK WARD", "common", "bastion", "startShield", "count", 2, "START: +{N} {*SHIELD}.", "START: +2 SHIELD.", [89]],
  ["tick_guard", "TICK GUARD", "rare", "bastion", "shieldEvery", "sec", 6, "EVERY {N}: A {*SHIELD}.", `EVERY 6${S}: A SHIELD.`, [99]],
  ["twin_salve", "TWIN SALVE", "common", "foundry", "pairHeal", "hull", 20, "{PAIR}: {*HEAL} {N}.", "PAIR: HEAL 20.", [71]],
  ["scrap_medic", "SCRAP MEDIC", "rare", "armor", "halfHeal", "hull", 300, "FIRST TIME BELOW HALF {HULL}: {*HEAL} {N}.", "FIRST TIME BELOW HALF HULL: HEAL 300.", [201]],
  // FLIP-X2 (TUNE-X line 4, REVIEW-SUSD answer 3): rare at 15 (was "epic", 20, "... HEAL 20."); the line's width is the same
  ["leech_vow", "LEECH VOW", "rare", "turrets", "hitHeal", "hull", 15, "EACH SHOT THAT LANDS: {*HEAL} {N}.", "EACH SHOT THAT LANDS: HEAL 15.", [161]],
  ["green_thread", "GREEN THREAD", "common", "weaver", "regen", "hull", 10, "YOUR HULL: {*REGEN} {N}.", "YOUR HULL: REGEN 10.", [105]],
  // Y-FURN (FURN-Y row 3, REVIEW-FURNY): searBurn 6, two lines (was "burnNoHeal", "count", 1, "FOE WITH YOUR {*BURN}: NO
  // {*HEAL}.", "FOE WITH YOUR BURN: NO HEAL.", 149); its second line is the old one
  // BAL-2 (the lines: cap's REVIEW-BAL1 row 5, SEARING searBurn 6 -> 5): 5, "... HAS 5 BURN. ..." (was 6, "... HAS 6 BURN.
  // ..."); the widths measured unchanged, 137 / 149
  ["searing", "SEARING", "rare", "furnace", "searBurn", "count", 5, "START: THE FOE HAS {N} {*BURN}. FOE WITH YOUR {*BURN}: NO {*HEAL}.", "START: THE FOE HAS 5 BURN. FOE WITH YOUR BURN: NO HEAL.", [137, 149]],
  // Y-FURN (FURN-Y row 4; REVIEW-STARD's amendment, no PIERCE): shatterPct 15, two lines (was "shieldPierce", "count", 1,
  // "YOUR SHOTS: BREAK A {*SHIELD} AND STILL HIT.", "YOUR SHOTS: BREAK A SHIELD AND STILL HIT.", 223)
  // BAL-2 (the lines: cap's ruling f894080daebfa8c0, SHATTER SHOT shatterPct 15 -> 14): 14, "YOUR SHOTS: +14% DMG." (was
  // 15, "+15% DMG."); the widths measured unchanged, 111 / 139
  ["shatter_shot", "SHATTER SHOT", "rare", "furnace", "shatterPct", "pct", 14, "YOUR SHOTS: +{N} {DMG}. YOUR HITS SHATTER {*SHIELD}.", "YOUR SHOTS: +14% DMG. YOUR HITS SHATTER SHIELD.", [111, 139]],
];

describe("SUS-D: the sustain runes in the catalogue", () => {
  // FLIP-X2 (TUNE-X line 4): LEECH VOW is rare now, 5 rare and no epic (was "3 common, 4 rare, 1 epic")
  it("8 runes (3 common, 5 rare): ids, names, tiers, themes, kinds, units, amounts and texts", () => {
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

  // Y-FURN (FURN-Y rows 3-4, REVIEW-FURNY): SEARING and SHATTER SHOT carry amounts now (searBurn 6, shatterPct 15), so no
  // rune holds a rule kind (was the two: no {N}, n 1, no number on the card). RULE_KINDS keeps its two kinds: battle.ts reads
  // them still, and the new kinds keep their rules (heal() reads searBurn as burnNoHeal, impact() shatterPct as shieldPierce)
  it("the rule runes: none now (SEARING and SHATTER SHOT carry amounts); every sustain rune's text has one {N}, its number on the card", () => {
    expect(RULE_KINDS).toEqual(["burnNoHeal", "shieldPierce"]);
    expect(SUSTAIN_RUNE_LIST.filter((d) => RULE_KINDS.includes(d.kind)).map((d) => d.id)).toEqual([]); // was ["searing", "shatter_shot"]
    expect([...RUNE_LIST, ...SUSTAIN_RUNE_LIST].filter((d) => RULE_KINDS.includes(d.kind)).length).toBe(0); // was 2
    // BAL-2 (the lines: SEARING 6 -> 5, cap's REVIEW-BAL1 row 5; SHATTER SHOT 15 -> 14, cap's ruling f894080daebfa8c0): 5
    // and 14%, as the cards draw them (was 6, ["6"] and 15, ["15%"])
    expect(["searing", "shatter_shot"].map((id) => [RUNES[id].kind, RUNES[id].amount.n, runeLine(RUNES[id]).match(/\d+%?/g)])).toEqual([
      ["searBurn", 5, ["5"]], ["shatterPct", 14, ["14%"]],
    ]);
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
    // FLIP-X2 (REQ-BFG-069, REQ-BFG-058; release X): both switches are on (was [false, false, false]); the off world is
    // withSustain(fn, false) below
    expect([SUSTAIN_LIVE, sustainLive(), BOT_RUNES]).toEqual([true, true, true]);
    expect(RUNE_LIST.length).toBe(57);
    for (const d of SUSTAIN_RUNE_LIST) {
      expect(RUNE_LIST, d.id).not.toContain(d);
      expect([isRune(d.id), isSustainRune(d.id)], d.id).toEqual([true, true]);
    }
    for (const d of RUNE_LIST) expect(isSustainRune(d.id), d.id).toBe(false);
    // FLIP-X2 (REVIEW-TUNEX): runeList() never holds a dormant rune (DORMANT_RUNES), so the switch off it is RUNE_LIST
    // without COAL CHUTE and HEAT SINK, 55 (was RUNE_LIST itself), and on it is that and the sustain runes without SEARING
    // and SHATTER SHOT, 61 (was the 65)
    // BAL-2 (the lines: cap's REVIEW-BAL1 row 2, DORMANT_RUNES empty): none is dormant, so the switch off runeList() is
    // RUNE_LIST itself again, 57 (was 55), and on it is RUNE_LIST and all 8 sustain runes, 65 (was 61)
    const live = (l: readonly RuneDef[]) => l.filter((d) => !DORMANT_RUNES.has(d.id)).map((d) => d.id);
    withSustain(() => expect(runeList().map((d) => d.id)).toEqual(live(RUNE_LIST)), false);
    expect(withSustain(() => runeList().length, false)).toBe(57); // BAL-2 (the lines: DORMANT_RUNES empty): 57 (was 55)
    expect(runeList().map((d) => d.id)).toEqual(live([...RUNE_LIST, ...SUSTAIN_RUNE_LIST]));
    expect(runeList().length).toBe(65); // BAL-2 (the lines: DORMANT_RUNES empty): 65 (was 61)
    withSustain(() => expect(runeList().map((d) => d.id)).toEqual(live([...RUNE_LIST, ...SUSTAIN_RUNE_LIST])));
    expect(sustainLive()).toBe(true); // the switch is back (on)
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
      // FLIP-X2 (REQ-BFG-069): the switch is on by default, so off is withSustain(go, false) (was go() itself)
      if (on) withSustain(go); else withSustain(go, false);
      return out;
    };
    const off = seen(false), on = seen(true);
    for (const d of SUSTAIN_RUNE_LIST) {
      expect(off.has(d.id), d.id).toBe(false);
      // FLIP-X2 (REVIEW-TUNEX): SEARING and SHATTER SHOT are dormant: no dawn offers them, on or off (was each at its tier)
      // BAL-2 (the lines: DORMANT_RUNES empty): all 8 are offered with the switch on, each at its own tier (was [] for
      // SEARING and SHATTER SHOT, dormant)
      expect([...(on.get(d.id) ?? [])], d.id).toEqual([d.tier]);
    }
    // BAL-2 (the lines: DORMANT_RUNES empty): no sustain rune is dormant (was ["searing", "shatter_shot"])
    expect(SUSTAIN_RUNE_LIST.filter((d) => DORMANT_RUNES.has(d.id)).map((d) => d.id)).toEqual([]);
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
    // FLIP-X2 (REQ-BFG-069): the switch is on by default (the default passes too), so off is withSustain(fn, false) (was the
    // default)
    expect([runeProblem(runes, 3, "bastion", seed), runeProblem(runes, 3, "bastion")]).toEqual([null, null]);
    expect(withSustain(() => runeProblem(runes, 3, "bastion", seed), false)).toMatch(/is not in the game while sustain is off/);
    expect(withSustain(() => runeProblem(runes, 3, "bastion"), false)).toMatch(/is not in the game while sustain is off/);
    // the other runes as before
    expect(runeProblem([{ id: runeOffer(seed, 1, "bastion", []).ids[0] }], 1, "bastion", seed)).toBeNull();
    // the server's check reads the same rule (validate.ts validateBuild -> runeProblem): no server edit needed
    const b = { ...cloneBuild(heroStartBuild("bastion")), runes: [{ id: "tick_guard" }] };
    expect(withSustain(() => validateBuild(b, 3, "lenient"), false).errors.join("\n")).toMatch(/TICK GUARD is not in the game while sustain is off/);
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
    // @5 +3.1, @10 +6.2, @15 +8.6; WEAVER +16.1. FLIP-X2 (TUNE-X line 4, REVIEW-SUSD answer 3): rare at 15, its C1 reading
    // +8.6 (7.4-9.9), in the rare band (SUSD-REPORT's C1 table; TUNE-X on release X's field +8.1 (6.3-9.8)); was epic at 20,
    // +11.6 (10.0-13.3)
    leech_vow: { n: 15, on: "all", run: "C1 par", gain: 8.6, lo: 7.4, hi: 9.9 },
    green_thread: { n: 10, on: "weaver", run: "A par", gain: 4.2, lo: 3.1, hi: 5.3 }, // typ2r (B1): +4.5 (2.6-6.4)
    // Y-FURN (FURN-Y section 4, REVIEW-FURNY rows 3-4): the counters with their baselines, benched on release X's field
    // (runevalue --field x --members runes, K 10, KO 5, days 3-10; FURN-Y's bench/rv1), FURNACE's own gain; the other
    // heroes' mean 7.0 (SEARING) and 9.2 (SHATTER SHOT), under the rare top. Before, rule runes, not benched (next test)
    // BAL-2 (the lines): the four FURNACE runes at their 0.9.1 amounts, BAL-2 step 3a's measurement (W/output-bal2/rv/s4:
    // tools/runevalue.ts --field x --members runes --k 10 --ko 5, days 3-10, the four together, 4 shards merged, judged on
    // FURNACE); the other heroes' mean 5.2 (SEARING) and 8.4 (SHATTER SHOT). SEARING and SHATTER SHOT replace FURN-Y's rv1
    // rows; COAL CHUTE and HEAT SINK, offered again, are new rows
    searing: { n: 5, on: "furnace", run: "BAL-2 3a rv/s4 x-field", gain: 7.1, lo: 5.2, hi: 9.0 }, // BAL-2 (the lines): SEARING 5 +7.1 (5.2 to 9.0) (was n 6, FURN-Y rv1 +7.8, 3.9 to 11.6)
    shatter_shot: { n: 14, on: "furnace", run: "BAL-2 3a rv/s4 x-field", gain: 9.6, lo: 6.5, hi: 12.7 }, // BAL-2 (the lines): SHATTER SHOT 14 +9.6 (6.5 to 12.7) (was n 15, FURN-Y rv1 +8.1, 4.9 to 11.3)
    coal_chute: { n: 15, on: "furnace", run: "BAL-2 3a rv/s4 x-field", gain: 3.9, lo: 2.1, hi: 5.8 }, // BAL-2 (the lines): COAL CHUTE 15 +3.9 (2.1 to 5.8) (was no row: dormant)
    heat_sink: { n: 25, on: "furnace", run: "BAL-2 3a rv/s4 x-field", gain: 6.6, lo: 4.3, hi: 9.0 }, // BAL-2 (the lines): HEAT SINK 25 +6.6 (4.3 to 9.0) (was no row: dormant)
  };

  it("each benched rune at its catalogue amount is in its tier band (a style rune on its own hero, a generic one on all)", () => {
    // BAL-2 (the lines): the benched runes are the sustain runes, WARD STONE, and COAL CHUTE and HEAT SINK (offered again;
    // was the sustain runes and WARD STONE)
    expect(Object.keys(BENCH).sort()).toEqual([...SUSTAIN_RUNE_LIST.filter((d) => !RULE_KINDS.includes(d.kind)).map((d) => d.id), "ward_stone", "coal_chute", "heat_sink"].sort());
    for (const [id, b] of Object.entries(BENCH)) {
      const d = RUNES[id], [lo, hi] = BAND[d.tier];
      expect(d.amount.n, `${id}: benched at ${b.n}`).toBe(b.n);
      expect(b.on, id).toBe((STYLE_THEMES as readonly string[]).includes(d.theme) ? d.theme : "all");
      expect(b.gain >= lo && b.gain <= hi, `${id}: +${b.gain} in +${lo} to +${hi}`).toBe(true);
      expect(b.lo <= b.gain && b.gain <= b.hi && b.hi >= lo && b.lo <= hi, id).toBe(true); // the interval overlaps the band
    }
  });

  // Y-FURN (FURN-Y rows 3-4): the counters' rules alone read under the rare band (SUS-D's M5, kept as the record); their
  // baselines bring both into it (the BENCH rows above). Was: rule runes (RULE_KINDS) below the band, kept as designed
  it("the counters' rules alone stay below the rare band even against the decks they counter; with FURN-Y's baselines both are in it", () => {
    // FURNACE (their own hero): SEARING +0.1 (par), +0.4 (typ2r), +0.8 (-0.1 to 1.6) against the typ2r decks that heal
    // (FOUNDRY's MEND PRESS, WEAVER's MENDING LOOM); SHATTER SHOT +0.0 (par: no SHIELD), +1.3 (typ2r), +5.3 (2.5 to 8.0)
    // against the typ2r decks that hold SHIELD (BASTION's WARD BELL). The report gives the reasons and asks cap
    const COUNTER: Record<string, { best: number; lo: number; hi: number }> = { searing: { best: 0.8, lo: -0.1, hi: 1.6 }, shatter_shot: { best: 5.3, lo: 2.5, hi: 8.0 } };
    for (const [id, c] of Object.entries(COUNTER)) {
      expect([RUNES[id].tier, RUNES[id].theme, RULE_KINDS.includes(RUNES[id].kind)], id).toEqual(["rare", "furnace", false]); // was true
      expect(c.best, id).toBeLessThan(BAND.rare[0]);
      expect(BENCH[id].gain >= BAND.rare[0] && BENCH[id].gain <= BAND.rare[1], `${id}: +${BENCH[id].gain} in the rare band`).toBe(true);
    }
  });
});

describe("SUS-D: the words on the rune cards (measured: phone 402x690 @3 and the desk 1280x800)", () => {
  const opW = runeCardTextW(pickLayout(241, 414, ["iron_skin"], -1, 0).cardW);
  const deskW = runeCardTextW(pickLayout(640, 400, ["iron_skin"], -1, 0).cardW);
  const byId = (id: string): RuneDef => RUNES[id];

  // Y-FURN (REVIEW-STARD's text rule: one trigger and one effect a line): a card starts each sentence on its own line
  // (runeBar.ts runeTextLines), so SEARING's and SHATTER SHOT's two lines are one sentence each, whole on both cards: 137 /
  // 149 and 111 / 139 px. Was one line each, SEARING 149 and SHATTER SHOT 223 px (the whole 223 of the phone's card)
  it("each card line, its 5x7 width, one line each on the phone (223 px) and the desk (290 px); SEARING and SHATTER SHOT two", () => {
    expect([opW, deskW]).toEqual([223, 290]);
    for (const [id, , , , , , , , line, ws] of TABLE) {
      const d = byId(id);
      expect(runeLine(d), id).toBe(line);
      const lines = runeTextLines(d, opW).map(lineText);
      expect(lines.join(" "), id).toBe(line);
      expect(lines.map((l) => textWidth(l, "5")), id).toEqual(ws);
      for (const w of ws) expect(w, id).toBeLessThanOrEqual(opW);
      // each line is one sentence of the text, whole on the phone's card and the desk's
      expect(lines, id).toEqual(runeSentenceSpans(d).map((s) => s.map((x) => x.t).join("")));
      expect(runeTextLines(d, deskW).map(lineText), id).toEqual(lines);
      for (const s of runeSentenceSpans(d)) expect([wrapRich(s, opW, "5").length, wrapRich(s, deskW, "5").length], id).toEqual([1, 1]);
      if (ws.length === 1) {
        expect(wrapRich(runeSpans(d), opW, "5").length, id).toBe(1);
        expect(wrapRich(runeSpans(d), deskW, "5").length, id).toBe(1);
      }
      expect(runeLine(d), id).not.toMatch(/[{}·]/);
    }
    expect(TABLE.filter((r) => r[9].length > 1).map((r) => r[0])).toEqual(["searing", "shatter_shot"]);
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

  // Y-FURN (the brief's step 3): SHATTER SHOT's tap reminder is its own (glossary.ts RUNE_NOTE): the SHIELD breaks and the
  // hit still lands, SHIELD's word first and in SHIELD's colour, 144 px of 3x5. Was SHIELD's RUNE_REMINDER, "SHIELD: BLOCKS
  // ONE HIT'S DAMAGE, THEN BREAKS." (166 px), which says the opposite of its rule. Every other card's is its keyword's
  it("each card's chip keyword and reminder (the glossary's RUNE_REMINDER, unedited; SHATTER SHOT's own RUNE_NOTE), one line of 3x5 on the phone", () => {
    const chips = Object.fromEntries(SUSTAIN_RUNE_LIST.map((d) => [d.id, runeKeyword(d)]));
    expect(chips).toEqual({
      bulwark_ward: "SHIELD", tick_guard: "SHIELD", twin_salve: "HEAL", scrap_medic: "HEAL", leech_vow: "HEAL",
      green_thread: "REGEN", searing: "BURN", shatter_shot: "SHIELD",
    });
    expect(Object.keys(RUNE_NOTE)).toEqual(["shatter_shot"]);
    const widths: Record<string, number> = {};
    for (const d of SUSTAIN_RUNE_LIST) {
      const k = runeKeyword(d)!;
      expect(k in KEYWORD_WORD, d.id).toBe(true);
      expect(runeReminder(d), d.id).toBe(RUNE_NOTE[d.id] ?? RUNE_REMINDER[k]); // was RUNE_REMINDER[k] for all 8
      expect(runeReminder(d), d.id).not.toMatch(/\d/);
      expect(runeReminder(d).startsWith(`${KEYWORD_WORD[k]}: `), d.id).toBe(true);
      const at = RUNE_NOTE[d.id] ? d.id : k;
      widths[at] = textWidth(runeReminder(d), "3");
      expect(widths[at], d.id).toBeLessThanOrEqual(opW);
    }
    expect(runeReminder(byId("shatter_shot"))).toBe("SHIELD: IT BREAKS; THE HIT STILL LANDS.");
    expect(runeReminderSpans(byId("shatter_shot"))).toEqual([
      { t: "SHIELD", c: RUNE_KEYWORD_COLOUR.SHIELD }, { t: ": IT BREAKS; THE HIT STILL LANDS.", c: C.slate4 },
    ]);
    // x2a (cap, REVIEW-SUSD F-e): SHIELD re-measured after NUM-4's RUNE_REMINDER.SHIELD reword (REVIEW-SUSB F1,
    // "BLOCKS ONE HIT'S DAMAGE, THEN BREAKS."): 152 -> 166, still one line under opW 223
    // Y-FURN: SHIELD's 166 is BULWARK WARD's and TICK GUARD's; SHATTER SHOT's own reminder 144 (was SHIELD's 166 too)
    expect(widths).toEqual({ SHIELD: 166, HEAL: 144, REGEN: 118, BURN: 205, shatter_shot: 144 });
    expect(runeTag(byId("leech_vow"))).toBe("RARE · TURRETS"); // FLIP-X2 (TUNE-X line 4): rare (was "EPIC · TURRETS")
  });
});
