// S6D Goal 3 (REQ-BFG-119): src/net/playerCode.ts, the readable code of a player ID that OPTIONS > MY PLAYER ID shows and `ghost-admin delete-player`
// and `find-player` take. A player ID is 43 characters of mixed-case base64url (the SHA-256 of the public key) and the game's face draws capitals only, so
// the card shows a code: Crockford's base32 (0-9 and A-Z without I, L, O, U), 16 symbols = 80 bits, the FIRST 80 BITS OF THE ID, in four groups of four.
// Pinned here: known IDs to their codes (the literals were worked out by hand from the bit layout, and again by an independent route: node's own
// base64url decoder and a BigInt, the way this file does it below); the format and the alphabet; 80 bits at least; two different IDs differ; the typing
// the code forgives (any case, spaces and dashes, O for 0, I and L for 1) and what it refuses; and that the function is pure.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PLAYER_CODE_ALPHABET, PLAYER_CODE_BITS, PLAYER_CODE_GROUP, PLAYER_CODE_SYMBOLS, codeMatches, parsePlayerCode, playerCode } from "../src/net/playerCode";
import { ID_PATTERN } from "../src/net/snapshot";

/** The independent route: node decodes the base64url ID into its 32 bytes; the first 10 bytes (80 bits) are written as 16 Crockford symbols. */
function viaBytes(id: string): string {
  const bytes = Buffer.from(id, "base64url");
  let n = 0n;
  for (let i = 0; i < 10; i++) n = (n << 8n) | BigInt(bytes[i]);
  let out = "";
  for (let i = 15; i >= 0; i--) out += "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[Number((n >> BigInt(i * 5)) & 31n)];
  return out.match(/.{4}/g)!.join("-");
}
/** A real-shaped player ID: the base64url SHA-256 of a seed, 43 characters, as identity.ts makes one from a public key. */
const idOf = (seed: string): string => createHash("sha256").update(seed).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // base64url: the tests' type shim for node:crypto knows only base64 and hex

describe("S6D: the player code", () => {
  it("pins known IDs to their codes (worked out by hand from the bit layout, and by node's own base64url decoder)", () => {
    // A is 000000, so an ID of 43 A's is 80 zero bits
    expect(playerCode("A".repeat(43))).toBe("0000-0000-0000-0000");
    // _ is 111111: 80 one bits are sixteen 11111 = 31 = Z
    expect(playerCode("_".repeat(43))).toBe("ZZZZ-ZZZZ-ZZZZ-ZZZZ");
    // - is 111110: the stream 111110 111110 ... read five bits at a time repeats 31 15 23 27 29 30 = Z F Q V X Y
    expect(playerCode("-".repeat(43))).toBe("ZFQV-XYZF-QVXY-ZFQV");
    // A B C D ... N are 0 1 2 3 ... 13 (six bits each): the 84 bits start 000000 000001 000010 000011 ... and the first 80 split into 0 0 8 8 6 4 2 17 16 28 16 9 5 2 25 16
    expect(playerCode("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq")).toBe("0088-642H-GWG9-52SG");
    // three real-shaped IDs (the base64url SHA-256 of a text), with the code each must have
    const known: [string, string, string][] = [
      ["beltbattles s6d player id example", "EAvd6ckpkmjIlw91d36PwN1ds9dm_w36TJDsITPLAuI", "205X-VTE9-5696-HJ4Q"],
      ["ANNA", "XFomhwJwirq-uW7WHeixJ8n0m-3B7_zXDUre03vqzhA", "BHD2-D1R2-E25B-NFNS"],
      ["second example id", "fVyzUKL_0THEXCX8gbX1rF8B3kTGUaxpJ9eadlfrcLM", "FNEB-6M52-ZZ8K-3H2W"],
    ];
    for (const [seed, id, code] of known) {
      expect(idOf(seed), seed).toBe(id);
      expect(id).toHaveLength(43);
      expect(playerCode(id), id).toBe(code);
      expect(viaBytes(id), id).toBe(code);
    }
  });

  it("is the first 80 bits of the ID: it agrees with the byte route for 500 real-shaped IDs, and every code is 16 symbols in four dashed groups of four", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = idOf(`player ${i}`);
      const code = playerCode(id);
      expect(code, id).toBe(viaBytes(id));
      expect(code, id).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
      seen.add(code);
    }
    expect(seen.size, "500 different IDs, 500 different codes").toBe(500);
  });

  it("carries at least 80 bits, in groups of four, from an alphabet of capitals and digits without I, L or O (and without U)", () => {
    expect(PLAYER_CODE_SYMBOLS).toBe(16);
    expect(PLAYER_CODE_BITS).toBe(80);
    expect(PLAYER_CODE_BITS).toBeGreaterThanOrEqual(80);
    expect(PLAYER_CODE_GROUP).toBe(4);
    expect(PLAYER_CODE_ALPHABET).toHaveLength(32); // five bits a symbol: 16 x 5 = 80
    expect(new Set(PLAYER_CODE_ALPHABET).size).toBe(32);
    expect(PLAYER_CODE_ALPHABET).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    for (const ch of "ILOU") expect(PLAYER_CODE_ALPHABET.includes(ch), ch).toBe(false);
    expect(PLAYER_CODE_ALPHABET).toMatch(/^[0-9A-Z]+$/); // capitals and digits only: the face draws no lower case
    expect(playerCode(idOf("x"))).toHaveLength(PLAYER_CODE_SYMBOLS + 3); // 16 symbols and three dashes
    expect(2 ** PLAYER_CODE_BITS).toBeGreaterThan(1e24);
  });

  it("two different IDs have different codes when they differ in the first 80 bits; one that differs only later has the same code (a code is 80 bits)", () => {
    const a = idOf("one");
    expect(playerCode(a)).not.toBe(playerCode(idOf("two")));
    // the first 13 characters are 78 bits, the 14th adds 2 more: a change in the first 13 always shows
    for (let i = 0; i < 13; i++) {
      const other = a.slice(0, i) + (a[i] === "A" ? "B" : "A") + a.slice(i + 1);
      expect(playerCode(other), `character ${i} changed`).not.toBe(playerCode(a));
    }
    // a change in the 14th character's top two bits shows; one in its other four bits, or later, does not
    const v = (c: string) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(c);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const flipLow = a.slice(0, 13) + alphabet[v(a[13]) ^ 1] + a.slice(14);
    const flipTop = a.slice(0, 13) + alphabet[v(a[13]) ^ 32] + a.slice(14);
    expect(playerCode(flipLow)).toBe(playerCode(a));
    expect(playerCode(flipTop)).not.toBe(playerCode(a));
    expect(playerCode(a.slice(0, 14) + "z".repeat(29))).toBe(playerCode(a.slice(0, 14) + "y".repeat(29)));
  });

  it("is pure: the same ID, the same code; it reads nothing but the ID", () => {
    const id = idOf("pure");
    expect(playerCode(id)).toBe(playerCode(id));
    expect(playerCode(id)).toBe(playerCode(String(id)));
  });

  it("an ID shorter than 14 characters reads as if padded with zero bits (a real ID never is); a text that is no ID is refused", () => {
    expect(playerCode("A")).toBe("0000-0000-0000-0000");
    expect(playerCode("_")).toBe("ZG00-0000-0000-0000"); // 111111 then zeros: 11111 10000 00000 ... = Z G 0 ...
    for (const bad of ["", " ", "a b", "a.b", "é", "x".repeat(65), "a\n"]) expect(() => playerCode(bad), JSON.stringify(bad)).toThrow(RangeError);
    expect(() => playerCode(undefined as unknown as string)).toThrow(RangeError);
    expect(ID_PATTERN.test("x".repeat(64))).toBe(true);
    expect(() => playerCode("x".repeat(64))).not.toThrow(); // the longest ID the server takes
  });
});

describe("S6D: typing a code", () => {
  const id = idOf("typing");
  const code = playerCode(id);

  it("takes the canonical form back, and forgives case, spaces, dashes anywhere, O for 0, I and L for 1", () => {
    expect(parsePlayerCode(code)).toBe(code);
    expect(parsePlayerCode(code.toLowerCase())).toBe(code);
    expect(parsePlayerCode(code.replace(/-/g, ""))).toBe(code);
    expect(parsePlayerCode(code.replace(/-/g, " "))).toBe(code);
    expect(parsePlayerCode(`  ${code.replace(/-/g, " - ")}\n`)).toBe(code);
    expect(parsePlayerCode(code.split("").join("-"))).toBe(code); // a dash between every symbol
    expect(parsePlayerCode("oooo-0000-oOoO-0000")).toBe("0000-0000-0000-0000");
    expect(parsePlayerCode("iiii-1111-LLLL-llll")).toBe("1111-1111-1111-1111");
    expect(parsePlayerCode("0O1I-1L0o-0000-0000")).toBe("0011-1100-0000-0000");
    // a code this module made always survives the round trip
    for (let i = 0; i < 200; i++) {
      const c = playerCode(idOf(`round ${i}`));
      expect(parsePlayerCode(c), c).toBe(c);
      expect(parsePlayerCode(c.toLowerCase().replace(/-/g, "")), c).toBe(c);
    }
  });

  it("refuses what cannot be a code: the wrong length, a symbol outside the alphabet, an ID, a text that is no text", () => {
    expect(parsePlayerCode("")).toBeNull();
    expect(parsePlayerCode("0000-0000-0000-000")).toBeNull(); // 15
    expect(parsePlayerCode("0000-0000-0000-00000")).toBeNull(); // 17
    expect(parsePlayerCode("0000-0000-0000")).toBeNull();
    for (const ch of ["U", "u", "_", "*", "#", ".", "é", "Ⅴ"]) {
      const text = `0000-0000-0000-000${ch}`;
      expect(parsePlayerCode(text), text).toBeNull();
    }
    expect(parsePlayerCode("0000-0000-0000-0000")).toBe("0000-0000-0000-0000"); // and the same text with a good last symbol is one
    expect(parsePlayerCode(id)).toBeNull(); // the 43-character ID itself is not a code
    expect(parsePlayerCode("x".repeat(65))).toBeNull();
    expect(parsePlayerCode(undefined as unknown as string)).toBeNull();
    expect(parsePlayerCode(123 as unknown as string)).toBeNull();
  });

  it("codeMatches: the code of this ID, however it was typed, and no other ID's", () => {
    expect(codeMatches(code, id)).toBe(true);
    expect(codeMatches(code.toLowerCase().replace(/-/g, " "), id)).toBe(true);
    expect(codeMatches(code, idOf("somebody else"))).toBe(false);
    expect(codeMatches("not a code", id)).toBe(false);
    expect(codeMatches(code, "not an id!")).toBe(false);
    expect(codeMatches(code, "")).toBe(false);
  });
});
