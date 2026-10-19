// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T4b): THE AUDIT BEHIND THE NOTES SENTENCES. A PART's NOTES line 1 gains a second sentence, by word
// (enchantFaces.ts NOTE_NUMBERS), answering "is this number the part's, or the word's?":
//   FIERY, RISING, ECHOING, BRACED   `THE NUMBERS ABOVE IT ARE THE PART'S OWN.`  (ENCHANT-1c round 3: FIERY on the EMBER TROUGH read FULL 6 of 6)
//   MASSIVE, SWIFT, GROWING, WIDE    `IN THE STATS ABOVE, THE NUMBERS IT CHANGES ARE SHOWN CHANGED, IN ITS COLOUR.`
// The brief: "check each of the eight sentences against that word's face on every kind it can go on (the text sheet's --enchant section, and a GROWING rig
// after it has grown). If one is false anywhere, STOP AND ASK." This file is that check, kept: for EVERY part in the catalogue that can hold a word, EVERY
// word legal on it (enchantProblem), ★1 and ★3, GROWING before and after it has grown, WIDE on its first free side, as a placed part, a part in cargo, an
// installed turret, and a rig with real hits (not IDLE), it builds the panel of the plain part and of the part holding the word and compares what a player
// can read above the word's line. It DERIVES which words change a number in the stat rows, and fails if a sentence is attached to the wrong group.
//
// WHAT IT FOUND (run 4, 2026-10-19): the four OWN words change nothing above their line, anywhere (no stat, no sub line, no hit line). The four others
// change a number only in the stat rows, in their colour -- except WIDE, which ALSO changes a count in the header's sub line (a factory's `BELTS 0/2` ->
// `BELTS 0/3`; a live rig's `1/4 ARROWS ON BELTS` -> `1/5`), a line drawn in one plain colour. So the brief's example sentence, `THE NUMBERS IT CHANGES
// ARE SHOWN CHANGED, IN ITS COLOUR`, would be false of that one number; the shipped sentence is scoped to THE STATS, where it is true on every face. The
// last test pins that exception, so a change to it (e.g. a coloured sub line) is noticed and the sentence can go back to the brief's.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { cargoPanel, explainPanel, itemPanel, turretPanel, type Block, type PanelText } from "../src/screens/build/inspector";
import { ITEMS } from "../src/sim/content";
import { hitsOfRig, key as K, setTurretList, type Build } from "../src/sim/deck";
import {
  ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, enchantKindOf, enchantProblem, freeSides, setEnchant, withEnchant, type EnchantId, type EnchantKind,
} from "../src/sim/enchant";
import { fusible } from "../src/sim/stars";
import { ENCHANT_NOTES, NOTE_NUMBERS, partNotes, pieceLine } from "../src/ui/enchantFaces";
import { enchantNotes } from "../src/ui/faces";
import { icons } from "../src/render/font";
import { banned } from "./textRules";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const OWN = "THE NUMBERS ABOVE IT ARE THE PART'S OWN.";
const CHANGED = "IN THE STATS ABOVE, THE NUMBERS IT CHANGES ARE SHOWN CHANGED, IN ITS COLOUR.";
const OWN_WORDS: EnchantId[] = ["fiery", "rising", "echoing", "braced"];
const CHANGING_WORDS: EnchantId[] = ["massive", "swift", "growing", "wide"];

type How = "placed" | "cargo" | "installed" | "live";

/** A furnace run whose deck holds `items` after the KILN, with `cargo` and installed `turrets`; `routes` for a live rig. */
function runWith(items: Build["items"] = [], cargo: Run["inventory"] = [], turrets: Parameters<typeof setTurretList>[1] = [], routes: Build["routes"] = []): Run {
  const run = newRun("furnace", 5, "enchant2-notes");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes, mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = cargo;
  if (turrets.length) setTurretList(run.build, turrets);
  return run;
}

/** The fields a part holding `id` carries (WIDE on a rig: its first free side; GROWING: the counter). */
function holding(def: string, id: EnchantId | null, grow: number): Record<string, unknown> {
  if (!id) return {};
  return {
    ench: id,
    ...(id === "wide" && enchantKindOf(ITEMS[def]) === "rig" ? { enchDir: freeSides(ITEMS[def])[0] } : {}),
    ...(id === "growing" ? { grow } : {}),
  };
}

/** A deck with a press whose belt runs up column 4, for a live rig: the places (x, y, rotation) a one-cell or longer rig can stand to hit it. */
const PRESS = { uid: 2, def: "press", x: 2, y: 6 };
const ROUTE = [{ factory: 2, cells: [K(3, 5), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }];
const SPOTS: [number, number, number][] = [];
for (const [x, y] of [[3, 3], [5, 3], [3, 2], [5, 2], [3, 4], [5, 4], [3, 1], [5, 1]]) for (const rot of [0, 1, 2, 3]) SPOTS.push([x, y, rot]);

/** The place a plain rig of `def` has hits on the press's belt, or null. */
function liveSpot(def: string, stars: number): [number, number, number] | null {
  for (const [x, y, rot] of SPOTS) {
    const run = runWith([{ ...PRESS } as Build["items"][number], { uid: 9, def, x, y, ...(rot ? { rot } : {}), ...(stars > 1 ? { stars } : {}) } as Build["items"][number]], [], [], ROUTE);
    if (hitsOfRig(run.build, 9).length > 0) return [x, y, rot];
  }
  return null;
}

/** The panel of `def` as a player sees it holding `id` (or none), or null when this part can't be shown that way. */
function panel(def: string, kind: EnchantKind, stars: number, id: EnchantId | null, grow: number, how: How): PanelText | null {
  const star = stars > 1 ? { stars } : {};
  const w = holding(def, id, grow);
  if (how === "installed") {
    if (kind !== "turret") return null;
    return turretPanel(runWith([], [], [{ slot: 0, def, uid: 90, ...star, ...w }]), 0)!;
  }
  if (how === "cargo") return cargoPanel(runWith([], [{ uid: 900, def, ...star, ...w }]), 900)!;
  if (how === "live") {
    if (kind !== "rig") return null;
    const at = liveSpot(def, stars);
    if (!at) return null;
    const [x, y, rot] = at;
    return itemPanel(runWith([{ ...PRESS } as Build["items"][number], { uid: 9, def, x, y, ...(rot ? { rot } : {}), ...star, ...w } as Build["items"][number]], [], [], ROUTE), 9)!;
  }
  if (kind === "turret") return null; // a turret is shown installed or in cargo
  return itemPanel(runWith([{ uid: 9, def, x: kind === "rig" ? 3 : 0, y: kind === "rig" ? 3 : 0, ...star, ...w } as Build["items"][number]]), 9)!;
}

interface Audit {
  tag: string;
  id: EnchantId;
  kind: EnchantKind;
  how: How;
  subChanged: boolean; // sub or subShort differs from the plain part's
  subPlain: string;
  subWord: string;
  line: Block | undefined; // the word's own line
  fresh: Block[]; // blocks of the word's panel that the plain panel does not have, the word's line apart
  gone: Block[]; // blocks of the plain panel that the word's panel does not have
}

/** Every audited panel pair. */
function audit(): Audit[] {
  const out: Audit[] = [];
  withEnchant(() => {
    for (const d of Object.values(ITEMS)) {
      const kind = enchantKindOf(d);
      if (!kind || !d.price) continue;
      for (const id of ENCHANT_IDS) {
        if (!ENCHANT_DEFS[id].kinds.includes(kind)) continue;
        const dir = id === "wide" && kind === "rig" ? freeSides(d)[0] : undefined;
        if (enchantProblem(d, id, dir === undefined ? undefined : { enchDir: dir }) !== null) continue; // only a word the game lets this part hold
        for (const stars of fusible(d.id) ? [1, 3] : [1]) for (const grow of id === "growing" ? [0, 2] : [0]) for (const how of ["placed", "cargo", "installed", "live"] as const) {
          const plain = panel(d.id, kind, stars, null, 0, how), p = panel(d.id, kind, stars, id, grow, how);
          if (!plain || !p) continue;
          const tag = `${id}${id === "growing" ? ` grow ${grow}` : ""} on ${d.id} (${kind}) ★${stars} ${how}`;
          const lineText = icons(pieceLine(id, kind, stars)!);
          const plainTexts = plain.body.map((b) => b.text), wordTexts = p.body.map((b) => b.text);
          out.push({
            tag, id, kind, how,
            subChanged: plain.sub !== p.sub || (plain.subShort ?? "") !== (p.subShort ?? ""),
            subPlain: `${plain.sub} | ${plain.subShort ?? ""}`, subWord: `${p.sub} | ${p.subShort ?? ""}`,
            line: p.body.find((b) => b.text === lineText),
            fresh: p.body.filter((b) => b.text !== lineText && !plainTexts.includes(b.text)),
            gone: plain.body.filter((b) => !wordTexts.includes(b.text)),
          });
        }
      }
    }
  });
  return out;
}

describe("ENCHANT-2 T4b: a PART's NOTES line 1 by word, and the audit that proves each sentence against the faces", () => {
  const all = audit();

  it("the audit is wide: every kind, every word, placed, cargo, installed and a live rig, ★1 and ★3, GROWING before and after it has grown", () => {
    const by = (f: (a: Audit) => string): string => Object.entries(all.reduce<Record<string, number>>((m, a) => ({ ...m, [f(a)]: (m[f(a)] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`ENCHANT-2 T4b audit: ${all.length} panel pairs; by word: ${by((a) => a.id)}; by kind: ${by((a) => a.kind)}; by view: ${by((a) => a.how)}; sub line changed: ${all.filter((a) => a.subChanged).length} (${[...new Set(all.filter((a) => a.subChanged).map((a) => `${a.id} on a ${a.kind}`))].join(", ")}); a stat block changed: ${all.filter((a) => a.fresh.length).length}`);
    expect(all.length).toBeGreaterThan(1500);
    for (const id of ENCHANT_IDS) {
      for (const kind of ENCHANT_DEFS[id].kinds) expect(all.some((a) => a.id === id && a.kind === kind), `${id} on a ${kind}`).toBe(true);
    }
    expect(all.some((a) => a.how === "live"), "a rig with real hits").toBe(true);
    expect(all.some((a) => a.how === "live" && a.id === "growing" && a.tag.includes("grow 2")), "a GROWING rig that has grown, with hits").toBe(true);
    expect(all.some((a) => a.how === "installed"), "an installed turret").toBe(true);
    // the word's own line is on every panel it is on
    for (const a of all) expect(a.line, a.tag).toBeDefined();
  });

  it("FIERY, RISING, ECHOING and BRACED change NOTHING above their line, anywhere: the stat rows, the sub line and every other line are the plain part's, so `THE NUMBERS ABOVE IT ARE THE PART'S OWN.` is true of every face", () => {
    for (const a of all.filter((x) => OWN_WORDS.includes(x.id))) {
      expect(a.fresh.map((b) => b.text), `${a.tag}: a block the plain part has not`).toEqual([]);
      expect(a.gone.map((b) => b.text), `${a.tag}: a plain block gone`).toEqual([]);
      expect(a.subChanged, `${a.tag}: the sub line (${a.subPlain} -> ${a.subWord})`).toBe(false);
      expect(a.line!.hue, `${a.tag}: no coloured number in the word's line block`).toBeUndefined();
    }
  });

  it("MASSIVE, SWIFT, GROWING and WIDE change a number in the STAT ROWS only (the stat rows are the blocks that differ), and every block that differs is drawn with the word's colour on the numbers it changed: `IN THE STATS ABOVE, THE NUMBERS IT CHANGES ARE SHOWN CHANGED, IN ITS COLOUR.` is true of every face", () => {
    let changed = 0;
    for (const a of all.filter((x) => CHANGING_WORDS.includes(x.id))) {
      for (const b of a.fresh) {
        expect(b.hue, `${a.tag}: a changed block without the word's colour: ${JSON.stringify(b.text)}`).toBeDefined();
        expect(b.hue!.colour, a.tag).toBe(ENCHANT_DEFS[a.id].color);
        expect(b.hue!.nums.length, a.tag).toBeGreaterThan(0);
        changed++;
      }
      for (const g of a.gone) {
        // a plain block that is gone was replaced by its changed form, which is hued (found above); nothing else leaves the panel
        expect(a.fresh.length, `${a.tag}: ${JSON.stringify(g.text)} left the panel with no changed block in its place`).toBeGreaterThan(0);
      }
      if (a.id === "growing" && a.tag.includes("grow 0")) expect(a.fresh, `${a.tag}: a GROWING part that has not grown yet changes nothing`).toEqual([]);
      if (a.id === "growing" && a.tag.includes("grow 2")) expect(a.fresh.length, `${a.tag}: after two dusk fights its DMG shows changed`).toBeGreaterThan(0);
    }
    expect(changed, "the changing words do change stat rows").toBeGreaterThan(500);
  });

  it("the words that change a stat row are EXACTLY the four the second sentence names, and each word carries the sentence of its group in a part's NOTES line 1", () => {
    const changing = new Set(all.filter((a) => a.fresh.length > 0).map((a) => a.id));
    expect([...changing].sort()).toEqual([...CHANGING_WORDS].sort());
    for (const id of ENCHANT_IDS) {
      expect(NOTE_NUMBERS[id], id).toBe(changing.has(id) ? CHANGED : OWN);
      const [one, ...rest] = partNotes(id);
      expect(one, id).toBe(`ENCHANTED: ONE EXTRA EFFECT ON THIS PART, SHOWN IN ITS COLOUR. ${changing.has(id) ? CHANGED : OWN} IT STAYS WHEN YOU MOVE THE PART AND IS LOST IF YOU SELL IT.`);
      expect(rest, `${id}: lines 2-4`).toEqual(ENCHANT_NOTES.slice(1));
    }
  });

  it("the ONE exception the sentence is scoped for: only WIDE changes a number outside the stat rows, in the header's sub line (a factory's belt count, a live rig's arrows), drawn in one plain colour", () => {
    const subs = all.filter((a) => a.subChanged);
    expect([...new Set(subs.map((a) => a.id))], "the words that change the sub line").toEqual(["wide"]);
    expect([...new Set(subs.map((a) => a.kind))].sort(), "and only on a factory and a rig").toEqual(["factory", "rig"]);
    for (const a of subs.filter((x) => x.kind === "factory")) {
      expect(a.how, a.tag).toBe("placed"); // a factory in cargo has no belts to count
      expect(a.subPlain, a.tag).toMatch(/^FACTORY · BELTS \d+\/\d+ \| /);
      const [, used, cap] = /BELTS (\d+)\/(\d+)/.exec(a.subPlain)!, [, used2, cap2] = /BELTS (\d+)\/(\d+)/.exec(a.subWord)!;
      expect([used2, Number(cap2)], `${a.tag}: one more belt slot`).toEqual([used, Number(cap) + 1]);
    }
    for (const a of subs.filter((x) => x.kind === "rig")) {
      expect(a.how, a.tag).toBe("live");
      const [, , arrows] = /RIG · (\d+)\/(\d+) ARROWS ON BELTS/.exec(a.subPlain)!, [, , arrows2] = /RIG · (\d+)\/(\d+) ARROWS ON BELTS/.exec(a.subWord)!;
      expect(Number(arrows2), `${a.tag}: one more arrow`).toBe(Number(arrows) + 1);
    }
    expect(subs.length, "WIDE on a placed factory and on a live rig").toBeGreaterThan(0);
  });

  it("a PART's panel reads its word's NOTES (explainPanel), a plain part's reads none, and the NOTES are house text (TEXT-STYLE: no banned word)", () => {
    withEnchant(() => {
      for (const id of ENCHANT_IDS) {
        const kind = ENCHANT_DEFS[id].kinds[0], def = kind === "rig" ? "whetstone" : kind === "factory" ? "press" : "scrapcannon";
        const p = panel(def, kind, 1, id, 2, kind === "turret" ? "installed" : "placed")!;
        const face = explainPanel(p, def);
        expect((face.notes ?? []).map((b) => b.text), id).toEqual(expect.arrayContaining(enchantNotes(id)));
        const plain = explainPanel(panel(def, kind, 1, null, 0, kind === "turret" ? "installed" : "placed")!, def);
        expect((plain.notes ?? []).map((b) => b.text).some((t) => enchantNotes(id).includes(t)), `${id}: a plain part's NOTES`).toBe(false);
        for (const n of partNotes(id)) expect(banned(n), `${id}: ${n}`).toEqual([]);
      }
    });
  });
});
