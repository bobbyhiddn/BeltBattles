// 0.6.1g M2 (REQ-BFG-019): the star-aware stand-in code in src/sim/standInPool.ts (encodeStarred / decodeStarred),
// ported from the harness v2 codec (src/sim/harness/standinCode.ts, harness-v2 f40a6d3). (a) The v1.1 pool
// decodes exactly as through decodeStandIn; (b) its 1-star decks encode exactly as through encodeStandIn; (c) 2- and
// 3-star items and modules (turret cores and mods too) round-trip; (d) malformed suffixes are rejected with the
// harness codec's own messages. Since the 0.6.1 flip the game loads the shipped pool v2 through decodeStarred, and the
// v1.1 pool is the fixture tests/fixtures/standInPoolData.v1.1.ts.
// The loader inlines stars.ts:starsOf (Prime, oracle 44379b651bb75fe6: it stays portable); the pin test below
// holds that copy to stars.ts.
import { describe, expect, it } from "vitest";
import { ITEMS, type HeroId } from "../src/sim/content";
import type { Build, ModPlacement, Placed } from "../src/sim/deck";
import {
  decodeStandIn, decodeStarred, encodeStandIn, encodeStarred, standInPool, STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES,
} from "../src/sim/standInPool";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_DATA as V11 } from "./fixtures/standInPoolData.v1.1";
import { FUSE_MAX, fusible, starsOf } from "../src/sim/stars";

/** Every stored code of the v1.1 pool (the fixture since the 0.6.1 flip), with its hero and day. */
function v11Codes(): { hero: HeroId; day: number; code: string }[] {
  const out: { hero: HeroId; day: number; code: string }[] = [];
  for (const [hero, days] of Object.entries(V11.pools)) {
    days!.forEach((d, i) => {
      for (const t of d[1]) out.push({ hero: hero as HeroId, day: i + 1, code: t[3] });
    });
  }
  return out;
}

/** The message `f` throws, or "no error". */
function thrown(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return "no error";
}

/** A copy of `b` whose fusible items and modules are starred 2, 3, 2, ... in deck order. */
function starred(b: Build): Build {
  const c = JSON.parse(JSON.stringify(b)) as Build;
  let k = 0;
  for (const p of [...c.items, ...c.mods]) if (fusible(p.def)) p.stars = 2 + (k++ % 2);
  return c;
}

const EXAMPLE = "14 0/kiln64 temper44*2 grease34/1:544434241404/calibrate0*3"; // the harness test's own example

describe("star-aware stand-in code in the loader (0.6.1g M2)", () => {
  it("(a) every code of the v1.1 pool (the fixture since the 0.6.1 flip), every hero and day, decodes via decodeStarred exactly as via decodeStandIn", () => {
    const codes = v11Codes();
    expect(new Set(codes.map((c) => `${c.hero}/${c.day}`)).size).toBe(STAND_IN_POOL_HEROES.length * STAND_IN_POOL_DAYS);
    for (const { hero, day, code } of codes) {
      expect(code, `${hero} d${day}`).not.toContain("*"); // v1.1 holds no starred word
      const v1 = decodeStandIn(hero, code), s = decodeStarred(hero, code);
      expect(s, `${hero} d${day} ${code}`).toEqual(v1);
      expect(JSON.stringify(s), `${hero} d${day} ${code}`).toBe(JSON.stringify(v1)); // same objects, same key order
    }
    expect(codes).toHaveLength(120);
  });

  it("(b) every 1-star deck of (a) encodes via encodeStarred byte-identical to encodeStandIn (and to its stored code)", () => {
    let n = 0;
    for (const { hero, day, code } of v11Codes()) {
      const b = decodeStandIn(hero, code);
      expect(encodeStarred(b), `${hero} d${day}`).toBe(encodeStandIn(b));
      expect(encodeStarred(b), `${hero} d${day}`).toBe(code);
      n++;
    }
    // since the 0.6.1 flip the shipped pool is v2: every deck the loader returns encodes back to a stored code
    for (const hero of STAND_IN_POOL_HEROES) for (let day = 1; day <= STAND_IN_POOL_DAYS; day++) {
      const stored = STAND_IN_DATA.pools[hero]![day - 1][1].map((t) => t[3]);
      for (const e of standInPool(hero, day)) {
        expect(stored, `${hero} d${day}`).toContain(encodeStarred(e.build));
        n++;
      }
    }
    expect(n).toBe(240);
  });

  it("(c) 2- and 3-star items and modules round-trip: the harness example, every pool deck starred, every fusible gate, factory, turret core and mod", () => {
    const ex = decodeStarred("furnace", EXAMPLE);
    expect(ex.items.map((p) => p.stars)).toEqual([undefined, 2, undefined]);
    expect(ex.mods).toEqual([{ uid: 4, def: "calibrate", turret: 0, stars: 3 }]);
    expect(encodeStarred(ex)).toBe(EXAMPLE);

    let words = 0;
    for (const { hero, day, code } of v11Codes()) {
      const b = starred(decodeStandIn(hero, code));
      const c = encodeStarred(b), back = decodeStarred(hero, c);
      expect(back, `${hero} d${day} ${c}`).toEqual(b);
      expect(JSON.stringify(back), `${hero} d${day} ${c}`).toBe(JSON.stringify(b));
      expect(encodeStarred(back), `${hero} d${day}`).toBe(c); // canonical
      expect(c.replace(/\*[23]/g, ""), `${hero} d${day}`).toBe(code); // the suffixes are the only change
      words += (c.match(/\*[23]/g) ?? []).length;
    }
    expect(words).toBeGreaterThan(240);

    const fus = Object.keys(ITEMS).filter(fusible);
    const asItems = fus.filter((d) => ITEMS[d].kind === "gate" || ITEMS[d].kind === "factory");
    const cores = fus.filter((d) => ITEMS[d].kind === "core"), mods = fus.filter((d) => ITEMS[d].kind === "mod");
    expect(asItems).toEqual(expect.arrayContaining(["temper", "brake", "splitter", "press", "gantry"]));
    expect(cores).toEqual(expect.arrayContaining(["scatter", "rotary", "pressure", "gatling", "hullbreaker", "drake", "salvo"]));
    expect(mods).toEqual(expect.arrayContaining(["chamber", "calibrate", "hopper", "mantlet", "ram"]));
    for (const s of [2, 3]) {
      const items: Placed[] = asItems.map((def, i) => ({ uid: i + 1, def, x: i % 10, y: Math.floor(i / 10), stars: s }));
      const mm: ModPlacement[] = [...cores, ...mods].map((def, j) => ({ uid: items.length + j + 1, def, turret: j % 4, stars: 5 - s }));
      const b: Build = { hero: "weaver", items, routes: [{ factory: 1, cells: [45, 44] }], mods: mm, beltCap: 12, hullBonus: 50 };
      const c = encodeStarred(b);
      const [, itemPart, routePart, modPart] = c.split("/");
      expect(itemPart.split(" ")).toEqual(items.map((p) => `${p.def}${p.y}${p.x}*${s}`));
      expect(routePart).toBe("1:4544");
      expect(modPart.split(" ")).toEqual(mm.map((m) => `${m.def}${m.turret}*${5 - s}`));
      const back = decodeStarred("weaver", c);
      expect(back).toEqual(b);
      expect(JSON.stringify(back)).toBe(JSON.stringify(b));
      expect(encodeStarred(back)).toBe(c);
    }
  });

  it("the suffix follows stars.ts starsOf for any stars value (pins the loader's inlined copy); FUSE_MAX is 3", () => {
    expect(FUSE_MAX).toBe(3); // decodeStarred's *2 / *3 and the inlined starsOf both assume it
    const seen: string[] = [];
    for (const v of [undefined, 0, 1, 2, 3, 4, 2.5, NaN, -1, Infinity]) {
      const b = decodeStandIn("furnace", "14 0/kiln64 temper44/1:544434241404/calibrate0");
      if (v !== undefined) {
        b.items[1].stars = v;
        b.mods[0].stars = v;
      }
      const want = starsOf({ stars: v }) > 1 ? `*${starsOf({ stars: v })}` : "";
      expect(encodeStarred(b), `stars ${v}`).toBe(`14 0/kiln64 temper44${want}/1:544434241404/calibrate0${want}`);
      seen.push(want);
    }
    expect(seen).toEqual(["", "", "", "*2", "*3", "*3", "*2", "", "", ""]);
  });

  it("(d) malformed suffixes are rejected with the harness codec's messages; decodeStandIn (the game's path) still rejects any suffix", () => {
    const at = (items: string, mods = "calibrate0") => `14 0/kiln64 ${items}/1:544434241404/${mods}`;
    const item = (w: string) => `stand-in code: bad item "${w}"`, mod = (w: string) => `stand-in code: bad module "${w}"`;
    const bad: [string, string][] = [
      // an item word takes one *2 or *3 after its cell, nothing else
      ...["temper44*1", "temper44*4", "temper44*x", "temper44*0", "temper44*", "temper44*22", "temper44*2*2", "temper44*2*3", "temper44**2", "temper*244", "nosuchpart44*2"]
        .map((w): [string, string] => [at(w), item(w)]),
      // so does a module word (turret cores and mods alike)
      ...["calibrate0*1", "calibrate0*4", "calibrate0*x", "calibrate0*3*3", "calibrate0**3", "rotary1*4", "salvo2*1"]
        .map((w): [string, string] => [at("temper44", w), mod(w)]),
      // a word that can't carry stars: a route
      ["14 0/kiln64/1:544434241404*2/", 'stand-in code: bad route "1:544434241404*2"'],
    ];
    for (const [code, msg] of bad) expect(thrown(() => decodeStarred("furnace", code)), code).toBe(msg);
    expect(thrown(() => decodeStarred("nobody" as HeroId, EXAMPLE))).toBe('stand-in code: unknown hero "nobody"');
    // the loader's own path is unchanged: decodeStandIn rejects any starred word
    expect(thrown(() => decodeStandIn("furnace", at("temper44*2")))).toBe(item("temper44*2"));
    expect(thrown(() => decodeStandIn("furnace", at("temper44", "calibrate0*3")))).toBe(mod("calibrate0*3"));
  });

  it("(d) the encoder rejects what the harness encoder rejects, a module id that is not lowercase letters included", () => {
    const b = decodeStandIn("furnace", "14 0/kiln64 temper44/1:544434241404/calibrate0");
    expect(thrown(() => encodeStarred({ ...b, items: [{ ...b.items[0], def: "kiln2" }, b.items[1]] }))).toBe('stand-in code: item id "kiln2" is not lowercase letters');
    expect(thrown(() => encodeStarred({ ...b, routes: [{ factory: 9, cells: [54] }] }))).toBe("stand-in code: route fed by unknown uid 9");
    // encodeStandIn never checked module ids; the starred encoder, like the harness copy, does
    const odd = { ...b, mods: [{ ...b.mods[0], def: "Calibrate" }] };
    expect(thrown(() => encodeStarred(odd))).toBe('stand-in code: module id "Calibrate" is not lowercase letters');
    expect(encodeStandIn(odd)).toBe("14 0/kiln64 temper44/1:544434241404/Calibrate0");
  });
});
