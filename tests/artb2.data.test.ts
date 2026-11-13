// ARTB-CODE-2A (REQ-BFG-126, REQ-BFG-127), item T (a): batch 2's art data. tools/artb/artb-slice.json is now the art lane's batch-2 file (34 sprites): the faces of WEAVER, FOUNDRY and
// BASTION (32x32), the start factories LOOM, CRUCIBLE and WARDWORKS (24x24, with idle phases and a flash, and a 12x12 icon each), the redrawn BARBED SPOOL (card and board) and STATIC BRUSH
// (board). The legend grew from 46 to 71 characters. Every expectation reads the data (the JSON and the constants generated from it): no pixel, digest or pixel count is typed here;
// the only typed lists are names of characters, heroes and factories.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { C } from "../src/render/palette";
import { HEROES } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { ART_B_LEGEND, ART_B_SPRITES, ART_B_WORK } from "../src/render/artBData";

type Overlay = [number, number, string][];
// (paths are the repo root's, where vitest runs; the repo's node shims declare no node:url)
const data = JSON.parse(readFileSync("tools/artb/artb-slice.json", "utf8")) as {
  legend: Record<string, string>;
  legendHex: Record<string, string>;
  sprites: Record<string, { w: number; h: number; rows: string[] }>;
  work: Record<string, { work?: Overlay[]; idle?: Overlay[]; flash?: Overlay }>;
};
const pal = C as Record<string, string>;

/** The 25 characters batch 2 adds to the legend (the brief's list: punctuation among them). */
const NEW_CHARS = [..."%&()*,0678:;<=>O]^opy{|}~"];
/** A sprite's kind: the part of its name before the "/", or "bare" for a bare name (a factory's picture). */
const kindOf = (name: string): string => (name.includes("/") ? name.split("/")[0] : "bare");
/** The sizes by kind. */
const SIZES: Record<string, [number, number]> = { portrait: [32, 32], bare: [24, 24], icon: [12, 12], card: [24, 24], board: [12, 12], body: [24, 12] };
/** The start factories of the four playable heroes, read from the game's own content (HEROES[id].factory). */
const FACTORIES = PLAYABLE_HEROES.map((id) => HEROES[id].factory);
/** ARTB-CODE-3A (batches 2R, 3a, 4a, 4b), old -> new: the 15 characters those batches add to the legend (punctuation among them: - / ? [ _ and the backtick): 71 -> 86 characters. */
const NEW_CHARS_3A = ["-", "/", "?", "A", "E", "J", "L", "N", "Q", "T", "[", "_", "x", "z", "`"];
/** ARTB-CODE-3A: the data also holds MEND PRESS (a factory, not a start factory of a playable hero): a bare 24x24 sprite, an icon and an idle/flash entry as the four start factories have. */
const FACTORY_SPRITES = [...FACTORIES, "mendpress"];

describe("ARTB-CODE-2A T(a): the legend of batch 2's data", () => {
  it("FIRST: each of the 25 characters batch 2 adds to the legend names a colour of render/palette.ts C, and C's hex is the one the art was drawn with (legendHex)", () => {
    expect(NEW_CHARS.length).toBe(25);
    expect(new Set(NEW_CHARS).size, "25 distinct characters").toBe(25);
    for (const ch of NEW_CHARS) {
      const name = data.legend[ch];
      expect(name, `legend '${ch}': a colour name`).toBeDefined();
      expect(pal[name], `legend '${ch}' -> ${name}: a key of C`).toBeDefined();
      expect(data.legendHex[ch], `legendHex '${ch}'`).toBeDefined();
      expect(pal[name].toUpperCase(), `legend '${ch}' -> ${name}: C's hex = legendHex (a mismatch = the art was drawn on another colour: STOP AND ASK)`).toBe(data.legendHex[ch].toUpperCase());
    }
  });

  it("the legend holds 86 characters (batch 1's 46, batch 2's 25 and the 15 of batches 2R to 4b); every one names a key of C with legendHex's hex, and the generated legend is the same", () => {
    expect(Object.keys(data.legend).length).toBe(86); // ARTB-CODE-3A, old -> new: 71 (the 25 of batch 2 were the old test's; the 15 new ones: NEW_CHARS_3A)
    expect(NEW_CHARS_3A.length).toBe(15);
    expect(Object.keys(data.legend).length - NEW_CHARS.length - NEW_CHARS_3A.length, "the 46 of batch 1").toBe(46);
    expect(Object.keys(data.legendHex).sort()).toEqual(Object.keys(data.legend).sort());
    for (const [ch, name] of Object.entries(data.legend)) {
      expect(pal[name], `legend '${ch}' -> ${name}: a key of C`).toBeDefined();
      expect(pal[name].toUpperCase(), `legend '${ch}' -> ${name}`).toBe(data.legendHex[ch].toUpperCase());
    }
    expect(ART_B_LEGEND).toEqual(data.legend);
  });

  it("every legend character is drawn by some sprite or overlay (no dead entry), and every character a sprite or an overlay uses is in the legend", () => {
    const used = new Set<string>();
    for (const s of Object.values(data.sprites)) for (const r of s.rows) for (const ch of r) used.add(ch);
    for (const w of Object.values(data.work)) for (const l of [...(w.work ?? []), ...(w.idle ?? []), ...(w.flash ? [w.flash] : [])]) for (const [, , ch] of l) used.add(ch);
    used.delete(".");
    expect([...used].sort(), "used characters = the legend").toEqual(Object.keys(data.legend).sort());
    for (const ch of [...NEW_CHARS, ...NEW_CHARS_3A]) expect(used.has(ch), `the new character '${ch}' is drawn`).toBe(true);
  });
});

describe("ARTB-CODE-2A T(a): the sprites of batch 2's data, by kind", () => {
  it("134 sprites; the size of each follows its kind: portrait 32x32, a bare name 24x24, icon 12x12, card 24x24, board 12x12, body 24x12", () => {
    expect(Object.keys(data.sprites).length).toBe(134); // ARTB-CODE-3A, old -> new: 34 (the 100 new sprites of batches 2R, 3a, 4a, 4b: tests/artb3.data.test.ts names them)
    for (const [name, s] of Object.entries(data.sprites)) {
      const k = kindOf(name);
      expect(SIZES[k], `${name}: a kind the brief names`).toBeDefined();
      expect([s.w, s.h], `${name} (${k})`).toEqual(SIZES[k]);
    }
    expect(ART_B_SPRITES).toEqual(data.sprites);
  });

  it("the count of each kind: 4 portraits, 5 bare names, 20 icons, 59 cards, 44 boards, 2 bodies", () => {
    const n: Record<string, number> = {};
    for (const name of Object.keys(data.sprites)) n[kindOf(name)] = (n[kindOf(name)] ?? 0) + 1;
    // ARTB-CODE-3A, old -> new: { portrait: 4, bare: 4, icon: 4, card: 10, board: 10, body: 2 } -> bare 5 (MEND PRESS), icon 20 (+ the 13 guns, WARD BELL, MENDING LOOM, MEND PRESS), card 59 (+ 49), board 44 (+ 34)
    expect(n).toEqual({ portrait: 4, bare: 5, icon: 20, card: 59, board: 44, body: 2 });
  });

  it("every playable hero has a face (portrait/<hero id>) and its start factory has its bare picture and its icon: the data names the four heroes and the four factories (and MEND PRESS), no other", () => {
    expect([...PLAYABLE_HEROES].sort()).toEqual(["bastion", "foundry", "furnace", "weaver"]);
    expect(Object.keys(data.sprites).filter((n) => n.startsWith("portrait/")).sort(), "the faces: the playable heroes' ids").toEqual(PLAYABLE_HEROES.map((id) => `portrait/${id}`).sort());
    expect([...FACTORIES].sort()).toEqual(["crucible", "kiln", "loom", "wardworks"]);
    // ARTB-CODE-3A, old -> new: the bare names were the four start factories; MEND PRESS (batch 3a) is the fifth; its icon is among the 20 icons (the 16 new ones: the 13 guns, WARD BELL, MENDING LOOM, MEND PRESS)
    expect(Object.keys(data.sprites).filter((n) => kindOf(n) === "bare").sort(), "the bare names: the start factories and MEND PRESS").toEqual([...FACTORY_SPRITES].sort());
    const icons = Object.keys(data.sprites).filter((n) => n.startsWith("icon/")).sort();
    for (const id of FACTORY_SPRITES) expect(icons, `icon/${id}`).toContain(`icon/${id}`);
    expect(icons.length, "the icons: the five factories', the 13 guns', WARD BELL's and MENDING LOOM's").toBe(FACTORY_SPRITES.length + 15);
  });

  it("the nine sprites batch 2 adds and the three it redraws are all in the data at the sizes of their kind (card/barbed, board/barbed and board/staticbrush keep their sizes)", () => {
    const added = ["portrait/weaver", "portrait/foundry", "portrait/bastion", "loom", "crucible", "wardworks", "icon/loom", "icon/crucible", "icon/wardworks"];
    const redrawn = ["card/barbed", "board/barbed", "board/staticbrush"];
    expect(added.length + redrawn.length).toBe(12);
    for (const name of [...added, ...redrawn]) {
      expect(data.sprites[name], name).toBeDefined();
      expect([data.sprites[name].w, data.sprites[name].h], name).toEqual(SIZES[kindOf(name)]);
    }
  });
});

describe("ARTB-CODE-2A T(a): the working-state entries of batch 2's data", () => {
  it("49 entries: 42 rig boards (two work phases: batch 1's eight and the 34 new ones), the two bodies, and five factories (four idle phases, the first the plain sprite, and a flash; no work phases)", () => {
    // ARTB-CODE-3A, old -> new: 14 entries (8 boards, 2 bodies, 4 factories) -> 49 (42 boards: + the 34 new rigs; 2 bodies; 5 factories: + MEND PRESS)
    expect(Object.keys(data.work).length).toBe(49);
    expect(Object.keys(data.work).filter((n) => n.startsWith("board/")).length).toBe(42);
    expect(Object.keys(data.work).filter((n) => n.startsWith("body/")).length).toBe(2);
    expect(Object.keys(data.work).filter((n) => kindOf(n) === "bare").sort()).toEqual([...FACTORY_SPRITES].sort());
    for (const id of FACTORY_SPRITES) {
      const w = data.work[id], plain = data.sprites[id].rows;
      expect(Object.keys(w).sort(), `${id}: idle and flash only`).toEqual(["flash", "idle"]);
      expect(w.idle!.length, `${id}: four idle phases`).toBe(4);
      expect(w.idle![0], `${id}: idle phase 0 is the plain sprite`).toEqual([]);
      // the other phases and the flash change at least one pixel of the plain sprite (the factory visibly idles and flashes)
      const changes = (l: Overlay): number => l.filter(([x, y, ch]) => plain[y][x] !== ch).length;
      for (let i = 1; i < 4; i++) expect(changes(w.idle![i]), `${id}: idle phase ${i} changes the sprite`).toBeGreaterThan(0);
      expect(changes(w.flash!), `${id}: the flash changes the sprite`).toBeGreaterThan(0);
    }
    expect(ART_B_WORK).toEqual(data.work);
  });
});
