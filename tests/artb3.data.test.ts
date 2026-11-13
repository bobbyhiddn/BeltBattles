// ARTB-CODE-3A (REQ-BFG-126, REQ-BFG-127), items D and T (a): art direction B's data after batches 2R, 3a, 4a and 4b. tools/artb/artb-slice.json is the art lane's file (134 sprites, 49 work entries, 86 legend colours);
// src/render/artBData.ts is generated from it. Every expectation reads the data (the JSON and the constants generated from it): no pixel, digest or pixel count is typed here; the only typed lists are ids and characters.
//   FIRST: each of the 15 legend characters this swap adds names a colour of render/palette.ts C (and C's hex is legendHex's); then every sprite and work entry of the GENERATED module equals the JSON pixel for pixel;
//   (a) the counts (134, 49, 86), the sizes by kind, the work shapes by kind, the 100 new sprites and the six redrawn ones by name.
// ARTB-CODE-3B (the hold, REQ-BFG-126 (3)): 27 pictures missed the acceptance read and are out of the data, so the data is 80 sprites, 29 work entries, 86 legend colours (the legend stays whole); the 46 new sprites
// that ride are named below (100 -> 46), and the work entries of three rigs carry a `state` key (STATE_RIGS: twingauge m, braceframe s, shieldwall p) that the generated module must read back too. tests/artb3.hold pins the held ids.
import { describe, expect, it } from "vitest";
import { C } from "../src/render/palette";
import { ITEMS } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { ART_B_LEGEND, ART_B_SPRITES, ART_B_WORK } from "../src/render/artBData";
import { FACTORY_PIECES, GUNS, ICON_ONLY, MODS, NEW_CARD_IDS, NEW_RIGS, REPLACED, SLICE_RIGS, STATE_RIGS, data, kindOf, type Overlay } from "./artb3.helpers";

const pal = C as Record<string, string>;
/** The 15 characters this swap adds to the legend (the brief's list: punctuation among them: - / ? [ _ and the backtick). */
const NEW_CHARS = ["-", "/", "?", "A", "E", "J", "L", "N", "Q", "T", "[", "_", "x", "z", "`"];
/** ARTB-CODE-3B: three of them (A, N and the backtick) were drawn only by held pictures: no kept sprite or overlay draws them, and the legend keeps them. */
const DEAD_CHARS = ["A", "N", "`"];
/** the sizes by kind */
const SIZES: Record<string, [number, number]> = { portrait: [32, 32], bare: [24, 24], icon: [12, 12], card: [24, 24], board: [12, 12], body: [24, 12] };
const hexOf = (legend: Readonly<Record<string, string>>, ch: string): string | null => (ch === "." ? null : pal[legend[ch]]);
type WorkLike = { work?: readonly Overlay[]; idle?: readonly Overlay[]; flash?: Overlay | readonly (readonly [number, number, string])[]; state?: Readonly<Record<string, readonly Overlay[]>> };
const overlays = (w: WorkLike): Overlay[] =>
  [...(w.work ?? []), ...(w.idle ?? []), ...(w.flash ? [w.flash as Overlay] : []), ...Object.values(w.state ?? {}).flat()] as Overlay[]; // ARTB-CODE-3B: the state patches are overlays too

describe("ARTB-CODE-3A D: the legend", () => {
  it("FIRST: each of the 15 characters this swap adds to the legend names a colour of render/palette.ts C, and C's hex is the one the art was drawn with (legendHex)", () => {
    expect(NEW_CHARS.length).toBe(15);
    expect(new Set(NEW_CHARS).size, "15 distinct characters").toBe(15);
    for (const ch of ["/", "?", "[", "_", "-", "`"]) expect(NEW_CHARS, `the punctuation '${ch}' is among them`).toContain(ch);
    for (const ch of NEW_CHARS) {
      const name = data.legend[ch];
      expect(name, `legend '${ch}': a colour name`).toBeDefined();
      expect(pal[name], `legend '${ch}' -> ${name}: a key of C`).toBeDefined();
      expect(data.legendHex[ch], `legendHex '${ch}'`).toBeDefined();
      expect(pal[name].toUpperCase(), `legend '${ch}' -> ${name}: C's hex = legendHex (a mismatch = the art was drawn on another colour: STOP AND ASK)`).toBe(data.legendHex[ch].toUpperCase());
      expect(ART_B_LEGEND[ch], `the generated legend has '${ch}'`).toBe(name);
    }
  });

  it("the legend is 86 colours; every character names a key of C with legendHex's hex; the generated legend is the same, key for key; every character is drawn and every drawn character is in the legend", () => {
    expect(Object.keys(data.legend).length).toBe(86);
    expect(Object.keys(ART_B_LEGEND).length).toBe(86);
    expect(Object.keys(data.legendHex).sort()).toEqual(Object.keys(data.legend).sort());
    for (const [ch, name] of Object.entries(data.legend)) {
      expect(pal[name], `legend '${ch}' -> ${name}: a key of C`).toBeDefined();
      expect(pal[name].toUpperCase(), `legend '${ch}' -> ${name}`).toBe(data.legendHex[ch].toUpperCase());
      expect(ART_B_LEGEND[ch], `the generated legend '${ch}'`).toBe(name);
    }
    const used = new Set<string>();
    for (const s of Object.values(data.sprites)) for (const r of s.rows) for (const ch of r) used.add(ch);
    for (const w of Object.values(data.work)) for (const l of overlays(w)) for (const [, , ch] of l) used.add(ch);
    used.delete(".");
    // ARTB-CODE-3B (the hold), old -> new: used characters = the legend (86) -> the legend less DEAD_CHARS (83): the legend stays whole, three characters have no kept picture
    expect([...used].sort(), "used characters = the legend less the held pictures' own").toEqual(Object.keys(data.legend).filter((ch) => !DEAD_CHARS.includes(ch)).sort());
    for (const ch of DEAD_CHARS) { expect(NEW_CHARS, `'${ch}' is one of the new characters`).toContain(ch); expect(used.has(ch), `'${ch}' is drawn by no kept picture`).toBe(false); }
    for (const ch of NEW_CHARS) if (!DEAD_CHARS.includes(ch)) expect(used.has(ch), `the new character '${ch}' is drawn`).toBe(true);
  });
});

describe("ARTB-CODE-3A D: the generated module reads back the JSON pixel for pixel", () => {
  it("every sprite of the generated module is the JSON's sprite: the same names, the same w and h, and every pixel the same palette colour (the new characters / ? [ _ - and the backtick included)", () => {
    expect(Object.keys(ART_B_SPRITES).sort()).toEqual(Object.keys(data.sprites).sort());
    let drawn = 0;
    for (const [name, s] of Object.entries(data.sprites)) {
      const g = ART_B_SPRITES[name];
      expect([g.w, g.h], `${name}: size`).toEqual([s.w, s.h]);
      expect(g.rows.length, `${name}: rows`).toBe(s.h);
      const a: (string | null)[] = [], b: (string | null)[] = [];
      for (let y = 0; y < s.h; y++) {
        expect(g.rows[y].length, `${name} row ${y}`).toBe(s.w);
        for (let x = 0; x < s.w; x++) { a.push(hexOf(ART_B_LEGEND, g.rows[y][x])); b.push(hexOf(data.legend, s.rows[y][x])); }
      }
      expect(a, `${name}: pixels`).toEqual(b);
      drawn += b.filter((p) => p !== null).length;
    }
    expect(drawn, "the sprites draw something").toBeGreaterThan(0);
  });

  it("every work entry of the generated module is the JSON's: the same names, the same phases, and every overlay pixel at the same place with the same palette colour (or the same '.')", () => {
    expect(Object.keys(ART_B_WORK).sort()).toEqual(Object.keys(data.work).sort());
    for (const [name, w] of Object.entries(data.work)) {
      const g = ART_B_WORK[name];
      expect(Object.keys(g).sort(), `${name}: the keys`).toEqual(Object.keys(w).sort());
      const flat = (x: typeof w | typeof g): string[] => {
        const out: string[] = [];
        for (const key of ["work", "idle"] as const) (x[key] ?? []).forEach((ph, i) => out.push(`${key}${i}:${ph.map(([px, py, ch]) => `${px},${py}=${hexOf(data.legend, ch) ?? "clear"}`).join(" ")}`));
        if (x.flash) out.push(`flash:${x.flash.map(([px, py, ch]) => `${px},${py}=${hexOf(data.legend, ch) ?? "clear"}`).join(" ")}`);
        // ARTB-CODE-3B: the state patches of a rig (key -> phases), read back like the work phases
        for (const [sk, phases] of Object.entries(x.state ?? {})) phases.forEach((ph, i) => out.push(`state.${sk}${i}:${ph.map(([px, py, ch]) => `${px},${py}=${hexOf(data.legend, ch) ?? "clear"}`).join(" ")}`));
        return out;
      };
      expect(flat(g), `${name}: every phase`).toEqual(flat(w));
    }
  });
});

describe("ARTB-CODE-3A T(a): the counts, the sizes and the work shapes", () => {
  it("80 sprites, 29 work entries, 86 colours (the JSON and the generated module)", () => {
    // ARTB-CODE-3B (the hold of 27 pictures), old -> new: [134, 49, 86] -> [80, 29, 86]
    expect([Object.keys(data.sprites).length, Object.keys(data.work).length, Object.keys(data.legend).length]).toEqual([80, 29, 86]);
    expect([Object.keys(ART_B_SPRITES).length, Object.keys(ART_B_WORK).length, Object.keys(ART_B_LEGEND).length]).toEqual([80, 29, 86]);
  });

  it("the size of every sprite follows its kind: portrait 32x32, a bare name 24x24, icon 12x12, card 24x24, board 12x12, body 24x12; and the count of each kind", () => {
    const n: Record<string, number> = {};
    for (const [name, s] of Object.entries(data.sprites)) {
      const k = kindOf(name);
      expect(SIZES[k], `${name}: a kind the brief names`).toBeDefined();
      expect([s.w, s.h], `${name} (${k})`).toEqual(SIZES[k]);
      n[k] = (n[k] ?? 0) + 1;
    }
    expect(n).toEqual({ portrait: 4, bare: 5, icon: 13, card: 32, board: 24, body: 2 }); // ARTB-CODE-3B, old -> new: icon 20, card 59, board 44 (the 27 held ids' sprites are out)
  });

  it("the work shapes by kind: a factory (kiln, loom, crucible, wardworks, mendpress) idle x4 (the first plain) and a flash; each of the 14 new board sprites and BARBED SPOOL's work x2 (the three state rigs also `state`); a body work x2; nothing else has an entry", () => {
    for (const [name, w] of Object.entries(data.work)) {
      const k = kindOf(name);
      if (k === "bare") {
        expect(FACTORY_PIECES, `${name}: a factory`).toContain(name);
        expect(Object.keys(w).sort(), `${name}: idle and flash only`).toEqual(["flash", "idle"]);
        expect(w.idle!.length, `${name}: idle x4`).toBe(4);
        expect(w.idle![0], `${name}: idle phase 0 is the plain sprite`).toEqual([]);
        expect(w.flash!.length, `${name}: a flash`).toBeGreaterThan(0);
      } else if (k === "board") {
        // ARTB-CODE-3B, old -> new: work only -> work, plus `state` for the three rigs that show a state through art B (STATE_RIGS: the keys and the phase counts are the helpers' list)
        const st = STATE_RIGS[name.slice("board/".length)];
        expect(Object.keys(w), `${name}: work${st ? " and state" : " only"}`).toEqual(st ? ["work", "state"] : ["work"]);
        expect(w.work!.length, `${name}: work x2`).toBe(2);
        if (st) expect(Object.fromEntries(Object.entries(w.state!).map(([sk, ph]) => [sk, ph.length])), `${name}: state keys and phases`).toEqual(st);
      } else if (k === "body") {
        expect(w.work!.length, `${name}: work x2`).toBe(2);
      } else throw new Error(`a work entry for ${name} (a ${k}): the brief names none`);
    }
    for (const id of [...NEW_RIGS, "barbed"]) {
      const w = data.work[`board/${id}`];
      expect(w, `board/${id}: a work entry`).toBeDefined();
      expect(w.work!.length, `board/${id}: work x2`).toBe(2);
      // a working rig visibly changes: some phase paints at least one pixel that is not already there
      const plain = data.sprites[`board/${id}`].rows;
      expect(w.work!.some((ph) => ph.some(([x, y, ch]) => plain[y][x] !== ch)), `board/${id}: a work phase changes the sprite`).toBe(true);
    }
    for (const id of FACTORY_PIECES) {
      const plain = data.sprites[id].rows, w = data.work[id];
      for (let i = 1; i < 4; i++) expect(w.idle![i].some(([x, y, ch]) => plain[y][x] !== ch), `${id}: idle phase ${i} changes the sprite`).toBe(true);
      expect(w.flash!.some(([x, y, ch]) => plain[y][x] !== ch), `${id}: the flash changes the sprite`).toBe(true);
    }
    expect(Object.keys(data.work).filter((n) => kindOf(n) === "board").length, "22 boards with work: batch 1's eight and the 14 new").toBe(22); // ARTB-CODE-3B, old -> new: 42 (the 20 held rigs' entries are out)
  });
});

describe("ARTB-CODE-3A T(a): the 46 new sprites that ride and the six redrawn ones, by name", () => {
  it("22 card/<id> (24x24): the 6 guns, WARD BELL, MENDING LOOM and the 14 rigs; 14 board/<id> (12x12); 9 icon/<id> (12x12: the 6 guns, the two mods, MEND PRESS); the bare mendpress (24x24): 46 in all", () => {
    // ARTB-CODE-3B (the hold), old -> new: [13, 2, 34, 49] -> [6, 2, 14, 22]; 100 new names -> 46
    expect([GUNS.length, MODS.length, NEW_RIGS.length, NEW_CARD_IDS.length]).toEqual([6, 2, 14, 22]);
    const names = [...NEW_CARD_IDS.map((id) => `card/${id}`), ...NEW_RIGS.map((id) => `board/${id}`), ...[...ICON_ONLY, "mendpress"].map((id) => `icon/${id}`), "mendpress"];
    expect(names.length).toBe(46);
    expect(new Set(names).size, "46 distinct names").toBe(46);
    for (const name of names) {
      expect(data.sprites[name], `${name}: in the data`).toBeDefined();
      expect([data.sprites[name].w, data.sprites[name].h], `${name}: its kind's size`).toEqual(SIZES[kindOf(name)]);
    }
    // the data holds those 46 and the 34 sprites of the first two batches (28 unchanged + the six redrawn): nothing else (34 + 46 = 80)
    const old = [
      ...SLICE_RIGS.flatMap((id) => [`card/${id}`, `board/${id}`]), "body/embertrough", "body/nailstrip", "kiln", "icon/kiln", "loom", "icon/loom", "crucible", "icon/crucible", "wardworks", "icon/wardworks",
      ...PLAYABLE_HEROES.map((id) => `portrait/${id}`),
    ];
    expect(old.length).toBe(34);
    expect([...old, ...names].sort()).toEqual(Object.keys(data.sprites).sort());
  });

  it("the six redrawn sprites (loom, icon/loom, crucible, icon/crucible, card/barbed, board/barbed) are in the data at the sizes of their kind, and the generated module has them", () => {
    expect(REPLACED.length).toBe(6);
    for (const name of REPLACED) {
      expect([data.sprites[name].w, data.sprites[name].h], name).toEqual(SIZES[kindOf(name)]);
      expect(ART_B_SPRITES[name].rows, `${name}: generated`).toEqual(data.sprites[name].rows);
    }
    for (const name of ["loom", "crucible", "board/barbed"]) expect(data.work[name], `${name}: a work entry (replaced)`).toBeDefined();
  });

  it("every piece the data names is a piece of the game: each card/<id>, board/<id>, icon/<id> and body/<id> id is an ITEMS key, each portrait/<id> a playable hero; the kinds are guns = turret, mods = mod, MEND PRESS = factory, rigs = gate", () => {
    for (const name of Object.keys(data.sprites)) {
      const k = kindOf(name);
      if (k === "bare") expect(Object.keys(ITEMS), `${name}`).toContain(name);
      else if (k === "portrait") expect([...PLAYABLE_HEROES], `${name}`).toContain(name.split("/")[1]);
      else expect(Object.keys(ITEMS), `${name}`).toContain(name.split("/")[1]);
    }
    for (const id of GUNS) expect(ITEMS[id].kind, id).toBe("turret");
    for (const id of MODS) expect(ITEMS[id].kind, id).toBe("mod");
    expect(ITEMS.mendpress.kind).toBe("factory");
    for (const id of [...NEW_RIGS, "barbed"]) expect(ITEMS[id].kind, id).toBe("gate");
  });
});
