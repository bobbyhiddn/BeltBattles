// S6D Goal 3 (REQ-BFG-119): the readable code of a player ID, which OPTIONS > MY PLAYER ID shows so a player who lost every device can
// quote it ("write to us with your player ID"), and which `ghost-admin delete-player` / `find-player` accept (server/pruneAdmin.ts
// resolves a typed code against the IDs the store holds). One pure function, no I/O, shared by the game and the server tool.
//
// Why a code: a player ID is 43 characters of mixed-case base64url (the SHA-256 of the public key, src/net/identity.ts), and the game's
// 5x7 face draws capitals only (src/render/font.ts: lower case is drawn as upper case), so the ID cannot be shown as it is, and
// "aB" and "Ab" would look alike. The code is made of capitals and digits that cannot be mistaken for each other: Crockford's base32
// (0-9 and A-Z without I, L, O and U: https://www.crockford.com/base32.html), 16 symbols of 5 bits = 80 bits, in four groups of four
// joined by dashes: XXXX-XXXX-XXXX-XXXX. The 80 bits are the first 80 bits of the ID itself (its base64url text read 6 bits a
// character), so a code names the ID it came from with a chance of 2^-80 that another ID shares it (a player ID is a hash, so its first
// 80 bits are uniform). Typing is forgiving the way Crockford's own decoder is: any case, spaces and dashes anywhere, O as 0, and I
// and L as 1. A code is not a secret and not a key: it cannot sign or read anything; it only lets a person say which player they are.

import { ID_PATTERN } from "./snapshot";

/** Crockford's base32: the 10 digits and the 22 capitals that are not I, L, O or U. */
export const PLAYER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** How many symbols a code has (5 bits each): 16 x 5 = 80 bits of the player ID. */
export const PLAYER_CODE_SYMBOLS = 16;
export const PLAYER_CODE_BITS = PLAYER_CODE_SYMBOLS * 5;
/** The symbols in a group, and so the dashes: XXXX-XXXX-XXXX-XXXX. */
export const PLAYER_CODE_GROUP = 4;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * The code of a player ID: the first 80 bits of the ID (6 bits a base64url character; an ID shorter than 14 characters reads as if
 * padded with zero bits, which a real 43-character ID never is) as 16 Crockford symbols in four dashed groups. Throws RangeError for
 * text that is not a player ID (ID_PATTERN: 1-64 of A-Z a-z 0-9 _ -).
 */
export function playerCode(playerId: string): string {
  if (typeof playerId !== "string" || !ID_PATTERN.test(playerId)) throw new RangeError("playerCode: not a player id");
  let acc = 0; // the bits not yet written out, 0 to 10 of them
  let have = 0;
  let out = "";
  for (let i = 0; out.length < PLAYER_CODE_SYMBOLS; ) {
    if (have < 5) {
      acc = (acc << 6) | (i < playerId.length ? BASE64URL.indexOf(playerId[i]) : 0);
      i++;
      have += 6;
    }
    have -= 5;
    out += PLAYER_CODE_ALPHABET[(acc >> have) & 31];
    acc &= (1 << have) - 1;
  }
  return out.match(/.{4}/g)!.join("-");
}

/**
 * What a person typed as a player code, as the canonical XXXX-XXXX-XXXX-XXXX, or null when it cannot be one: any case, white space and
 * dashes anywhere, O read as 0, I and L as 1 (Crockford's own rules); anything else outside the alphabet, or not 16 symbols, is null.
 */
export function parsePlayerCode(typed: string): string | null {
  if (typeof typed !== "string" || typed.length > 64) return null;
  const symbols = typed.toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (symbols.length !== PLAYER_CODE_SYMBOLS) return null;
  for (const ch of symbols) if (!PLAYER_CODE_ALPHABET.includes(ch)) return null;
  return symbols.match(/.{4}/g)!.join("-");
}

/** Does this typed text name this player ID by its code? (The comparison parsePlayerCode makes, against playerCode.) */
export function codeMatches(typed: string, playerId: string): boolean {
  const parsed = parsePlayerCode(typed);
  return parsed !== null && ID_PATTERN.test(playerId) && parsed === playerCode(playerId);
}
