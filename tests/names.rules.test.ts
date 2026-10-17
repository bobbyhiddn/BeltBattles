// PACKS M2 (REQ-BFG-063): the player name rules (src/net/names.ts), the tag, the name in a snapshot on both checks (the
// client's isSnapshot and the strict decoder the server runs), and the name's storage on the device.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  NAME_HINT, NAME_KEY, NAME_MAX, NAME_MIN, NAME_REFUSAL, NAME_TITLE, WANDERER, blockedName, displayName, nameProblem, nameTag, normalizeName,
} from "../src/net/names";
import * as local from "../src/game/ghostSnapshot";
import { checkSnapshot, encodeSnapshot, ghostId, NameError, SnapshotError, type GhostSnapshot } from "../src/net/snapshot";
import { ghostOf } from "../src/game/day";
import { newRun } from "../src/game/run";
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D (LONG_RUN ships on): a 10-day run's snapshot has no `losses`
import { snap } from "./netHelpers";

const rot13 = (s: string) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 65 + 13) % 26) + 65));
// a few blocklist words, ROT13 here too, so this file spells none of them out
const BAD = { anywhere: rot13("SHPX"), anywhere2: rot13("AVTTRE"), whole: rot13("NFF"), whole2: rot13("PBPX"), whole3: rot13("PHAG") };

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), keys: () => [...m.keys()] };
}

function netOk(s: unknown): boolean {
  try {
    checkSnapshot(s);
    return true;
  } catch {
    return false;
  }
}

describe("the rules (names.ts nameProblem, normalizeName)", () => {
  it("2 to 10 characters: 1 is too short, 11 too long; the bounds pass", () => {
    expect([NAME_MIN, NAME_MAX]).toEqual([2, 10]);
    expect(nameProblem("A")).toBe("too short");
    expect(nameProblem("AB")).toBeNull();
    expect(nameProblem("ABCDEFGHIJ")).toBeNull();
    expect(nameProblem("WWWWWWWWWW")).toBeNull();
    expect(nameProblem("ABCDEFGHIJK")).toBe("too long");
    expect(nameProblem("ANNA MARIA X")).toBe("too long");
  });

  it("characters A-Z, 0-9, space and hyphen in the canonical form only; anything else is bad characters", () => {
    for (const ok of ["ANNA", "AN-NA 7", "R2-D2", "X 9", "--", "0123456789"]) expect(nameProblem(ok), ok).toBeNull();
    for (const bad of ["anna", "Anna", " ANNA", "ANNA ", "ANNA  B", "ANNA!", "ÅSA", "ANNA_B", "ANNA.B", "AN\tNA", "ANNA B", "ANNA#3F", "A·B"]) {
      expect(nameProblem(bad), JSON.stringify(bad)).toBe("bad characters");
    }
    expect(nameProblem(7)).toBe("bad characters");
    expect(nameProblem({})).toBe("bad characters");
  });

  it("missing: absent, null or empty; the screen's blank input normalizes to empty", () => {
    expect([nameProblem(undefined), nameProblem(null), nameProblem(""), nameProblem(normalizeName("    "))]).toEqual(["missing", "missing", "missing", "missing"]);
  });

  it("normalizeName: upper case, trimmed, inner runs of spaces (any white space) as one", () => {
    expect(normalizeName("  anna   b  ")).toBe("ANNA B");
    expect(normalizeName("an  na")).toBe("AN NA");
    expect(normalizeName("r2-d2")).toBe("R2-D2");
    expect(nameProblem(normalizeName("  anna   b  "))).toBeNull();
    expect(nameProblem(normalizeName("anna!"))).toBe("bad characters");
  });

  it("the blocklist: anywhere words wherever they stand, whole words as the name or one of its words; spaces, hyphens and digit swaps don't hide them", () => {
    const w = BAD.anywhere; // 4 letters, refused anywhere
    expect(nameProblem(w)).toBe("not allowed");
    expect(nameProblem(`X${w}Y`)).toBe("not allowed");
    expect(nameProblem(w.split("").join(" "))).toBe("not allowed");
    expect(nameProblem(w.split("").join("-"))).toBe("not allowed");
    expect(nameProblem(`${w[0]} ${w[1]}-${w.slice(2)}`)).toBe("not allowed");
    expect(nameProblem(BAD.anywhere2.replace("I", "1").replace("E", "3"))).toBe("not allowed");
    for (const word of [BAD.whole, BAD.whole2, BAD.whole3]) {
      expect(nameProblem(word), "whole").toBe("not allowed");
      expect(nameProblem(`BIG ${word}`), "a word of it").toBe("not allowed");
      expect(nameProblem(word.split("").join("-")), "hyphens").toBe("not allowed");
    }
    expect(nameProblem(BAD.whole.replace(/S/g, "5"))).toBe("not allowed"); // the digit swap 5 -> S
    expect(nameProblem("SH0T")).toBeNull(); // 0 -> O: SHOT
    expect(blockedName("ANNA")).toBe(false);
  });

  it("false positives pass: ordinary words holding a whole-only word", () => {
    for (const ok of ["CLASSIC", "BASS", "GLASS", "SCUNTHORPE", "GRAPE", "THERAPIST", "HANCOCK", "COCKPIT", "PEACOCK", "DICKENS", "ESSEX",
      "SPICE", "TITAN", "ANALOG", "TORPEDO", "RACCOON", "ARSENAL", "PAKISTAN", "ASSET", "COCOON", "SEXTANT"]) {
      expect(nameProblem(ok), ok).toBeNull();
    }
  });

  it("WANDERER is reserved (not allowed), with spaces, hyphens or digit swaps too; WANDER and WANDERERS are names", () => {
    expect(WANDERER).toBe("WANDERER");
    for (const r of ["WANDERER", "WANDER-ER", "WAN DERER", "W4NDERER", "WAND3R3R"]) expect(nameProblem(r), r).toBe("not allowed");
    expect(nameProblem("WANDER")).toBeNull();
    expect(nameProblem("WANDERERS")).toBeNull();
  });

  it("the blocklist is ROT13 in the source: tens of words, none spelled out", () => {
    const src = readFileSync(new URL("../src/net/names.ts", import.meta.url), "utf8");
    const words = (src.match(/\("([A-Z ]+)"\s*\+/g) ?? []).length;
    expect(words).toBeGreaterThan(0);
    for (const w of Object.values(BAD)) expect(new RegExp(`\\b${w}\\b`).test(src), "spelled out").toBe(false);
    const all = [...src.matchAll(/"([A-Z ]{20,})"/g)].map((m) => m[1]).join(" ").split(" ").filter(Boolean);
    expect(all.length).toBeGreaterThanOrEqual(30);
    expect(all.length).toBeLessThan(150);
  });

  it("texts: the screen's title, hint and refusals are short plain upper-case words, no decimals", () => {
    expect(NAME_TITLE).toBe("YOUR CAPTAIN NAME");
    expect(NAME_HINT).toBe("2 TO 10 OF A-Z 0-9 SPACE -");
    expect(NAME_REFUSAL).toEqual({
      missing: "TYPE A NAME", "too short": "NAME TOO SHORT", "too long": "NAME TOO LONG", "bad characters": "ONLY A-Z 0-9 SPACE -",
      "not allowed": "PICK ANOTHER NAME",
    });
    for (const t of [NAME_TITLE, NAME_HINT, ...Object.values(NAME_REFUSAL)]) {
      expect(t, t).toBe(t.toUpperCase());
      expect(/\d\.\d/.test(t), t).toBe(false);
    }
  });
});

describe("the tag: # and two hex digits, the low byte of FNV-1a 32 over the playerId", () => {
  it("FNV-1a 32's published vectors, low byte", () => {
    expect(nameTag("")).toBe("C5"); // 0x811c9dc5
    expect(nameTag("a")).toBe("2C"); // 0xe40c292c
    expect(nameTag("foobar")).toBe("68"); // 0xbf9cf968
  });

  it("derived: two upper-case hex digits, the same id the same tag; every tag occurs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const id = `p${i.toString(36)}x${(i * 7919).toString(36)}`;
      const t = nameTag(id);
      expect(t).toMatch(/^[0-9A-F]{2}$/);
      expect(nameTag(id)).toBe(t);
      seen.add(t);
    }
    expect(seen.size).toBe(256);
    expect(displayName("ANNA", "a")).toBe("ANNA#2C");
  });

  it("never stored or sent: the encoded body holds the name, no tag; a name holding # is refused", () => {
    const s: GhostSnapshot = { ...snap({ v: 2 }), name: "ANNA" };
    const text = encodeSnapshot(s);
    expect(text.endsWith(`,"name":"ANNA"}`)).toBe(true);
    expect(text.includes("#")).toBe(false);
    expect(() => encodeSnapshot({ ...s, name: `ANNA#${nameTag(s.playerId)}` })).toThrow(NameError);
  });
});

describe("the name in a snapshot: optional, last, the client's check and the strict decoder agree", () => {
  const base = snap({ v: 2 });

  it("a snapshot without a name encodes byte for byte as before (no name key); with one, the name is the last key", () => {
    const plain = encodeSnapshot(base);
    expect(plain).toBe(JSON.stringify({
      v: base.v, rules: base.rules, hero: base.hero, day: base.day, wins: base.wins, lives: base.lives, build: checkSnapshot(base).build,
      runId: base.runId, playerId: base.playerId, createdAt: base.createdAt,
    }));
    expect(plain.includes("name")).toBe(false);
    expect(encodeSnapshot({ ...base, name: undefined })).toBe(plain); // an in-memory undefined is absent
    const named = encodeSnapshot({ ...base, name: "AN-NA 7" });
    expect(named).toBe(`${plain.slice(0, -1)},"name":"AN-NA 7"}`);
    expect(ghostId({ ...base, name: "ANNA" })).not.toBe(ghostId(base));
  });

  it("a table of names through isSnapshot and checkSnapshot: the same verdict, and the decoder's error is the server's reason", () => {
    const table: [string, unknown, string | null][] = [
      ["ANNA", "ANNA", null], ["AN-NA 7", "AN-NA 7", null], ["10 W", "WWWWWWWWWW", null], ["2 chars", "AB", null],
      ["1 char", "A", "name: too short"], ["11 chars", "ABCDEFGHIJK", "name: too long"], ["lower case", "anna", "name: bad characters"],
      ["leading space", " ANNA", "name: bad characters"], ["double space", "ANNA  B", "name: bad characters"], ["!", "ANNA!", "name: bad characters"],
      ["Å", "ÅSA", "name: bad characters"], ["tag", "ANNA#3F", "name: bad characters"], ["reserved", "WANDERER", "name: not allowed"],
      ["blocked", BAD.whole, "name: not allowed"], ["empty", "", "name: missing"],
      ["a number", 7, "snapshot.name: expected a string"], ["null", null, "snapshot.name: expected a string"],
    ];
    for (const [what, name, err] of table) {
      const s = { ...base, name };
      let got: string | null = null;
      try {
        checkSnapshot(s);
      } catch (e) {
        expect(e, what).toBeInstanceOf(SnapshotError);
        got = (e as Error).message;
      }
      expect(got, what).toBe(err);
      expect(local.isSnapshot(s), what).toBe(err === null);
      expect(netOk(s), what).toBe(err === null);
    }
    // absent: both take it (pool entries carry no name); POST /v1/ghosts refuses an upload without one (names.upload)
    expect([local.isSnapshot(base), netOk(base)]).toEqual([true, true]);
    expect([local.isSnapshot({ ...base, name: undefined }), netOk({ ...base, name: undefined })]).toEqual([true, true]);
    expect([local.isSnapshot({ ...base, nickname: "ANNA" }), netOk({ ...base, nickname: "ANNA" })]).toEqual([false, false]);
  });

  it("the local pool keeps a named snapshot and drops one with a refused name", () => {
    const st = mem();
    const me = local.playerId(st);
    expect(local.migrateSnapshot({ ...base, name: "ANNA" }, me)).toMatchObject({ name: "ANNA" });
    expect(local.migrateSnapshot({ ...base, name: "anna" }, me)).toBeNull();
  });
});

describe("storage: beside the player id, it survives a reload", () => {
  it("setPlayerName stores the canonical name under beltbattles.name.v1; playerName reads it back, after a reload too", async () => {
    const st = mem();
    expect(NAME_KEY).toBe("beltbattles.name.v1");
    expect(local.playerName(st)).toBeNull();
    expect(local.setPlayerName("anna", st)).toBe(false); // the screen normalizes first; storage takes the canonical form only
    expect(local.setPlayerName("ANNA", st)).toBe(true);
    expect(st.getItem(NAME_KEY)).toBe("ANNA");
    vi.resetModules(); // a reload: the module comes back fresh, the device's storage stays
    const again = await import("../src/game/ghostSnapshot");
    expect(again.playerName(st)).toBe("ANNA");
    expect(again.currentName(st)).toBe("ANNA");
    st.setItem(NAME_KEY, "WANDERER"); // a stored value the rules refuse: no name, the screen asks again
    expect(again.playerName(st)).toBeNull();
  });

  it("ghostOf carries the device's name last, and nothing without one", async () => {
    vi.resetModules();
    const fresh = await import("../src/game/day");
    const run = newRun("furnace", 7);
    const none = fresh.ghostOf(run, 5, "p-me", null);
    expect("name" in none).toBe(false);
    // RUNES-1 (snapshot v3): the name is the last v2 field; the run seed (a v3 field) follows it
    // BUMP-1D (LONG_RUN ships on): a long run (newRun marks it) states its `losses` (day.ts ghostOf), after the seed; the 10-day run
    // (made with the switch off) ends at the seed as before. Was slice(-2) toEqual(["name", "seed"]) on the run made here
    expect(Object.keys(fresh.ghostOf(run, 5, "p-me", "ANNA")).slice(-3)).toEqual(["name", "seed", "losses"]);
    const tenDay = withLongRun(() => newRun("furnace", 7), false);
    expect(Object.keys(fresh.ghostOf(tenDay, 5, "p-me", "ANNA")).slice(-2)).toEqual(["name", "seed"]);
    expect("losses" in fresh.ghostOf(tenDay, 5, "p-me", "ANNA")).toBe(false);
    expect(ghostOf(run, 5, "p-me", "ANNA").name).toBe("ANNA");
  });
});

describe("the pixel font draws every allowed glyph, # and · in both faces", () => {
  it("the 5x7 and 3x5 faces hold A-Z, 0-9, space, hyphen, # and ·", () => {
    const src = readFileSync(new URL("../src/render/font.ts", import.meta.url), "utf8");
    const face = (name: string) => {
      const at = src.indexOf(`const ${name}: GlyphMap = {`);
      const body = src.slice(at, src.indexOf("\n};", at));
      return new Set([...body.matchAll(/^\s+(?:"(.+?)"|'(.+?)'|([A-Za-z0-9]+)):/gm)].map((m) => m[1] ?? m[2] ?? m[3]));
    };
    const need = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", " ", "-", "#", "·"];
    for (const f of ["F5", "F3"]) {
      const keys = face(f);
      expect(need.filter((c) => !keys.has(c)), f).toEqual([]);
    }
  });
});
